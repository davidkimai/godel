/**
 * Swarm Manager - SPEC_v2.md Section 2.1
 * 
 * Manages swarms of agents including creation, destruction, scaling,
 * and lifecycle management of swarms.
 * 
 * RACE CONDITION FIXES v3:
 * - Mutex protection for all swarm operations (create, scale, destroy)
 * - One mutex per swarm to prevent concurrent modifications
 * - Uses async-mutex library for exclusive access
 */

import { EventEmitter } from 'events';
import { Mutex } from 'async-mutex';
import { AgentStatus, type Agent, type CreateAgentOptions } from '../models/agent';
import { AgentLifecycle, type AgentState } from './lifecycle';
import { MessageBus } from '../bus/index';
import { AgentStorage } from '../storage/memory';

// ============================================================================
// Swarm Types
// ============================================================================

export type SwarmStrategy = 'parallel' | 'map-reduce' | 'pipeline' | 'tree';

export interface BudgetConfig {
  amount: number;
  currency: string;
  warningThreshold?: number; // Percentage (0-1)
  criticalThreshold?: number; // Percentage (0-1)
}

export interface SafetyConfig {
  fileSandbox: boolean;
  networkAllowlist?: string[];
  commandBlacklist?: string[];
  maxExecutionTime?: number; // milliseconds
}

export interface SwarmConfig {
  name: string;
  task: string;
  initialAgents: number;
  maxAgents: number;
  strategy: SwarmStrategy;
  model?: string;
  budget?: BudgetConfig;
  safety?: SafetyConfig;
  metadata?: Record<string, unknown>;
}

export type SwarmState = 'creating' | 'active' | 'scaling' | 'paused' | 'completed' | 'failed' | 'destroyed';

export interface Swarm {
  id: string;
  name: string;
  status: SwarmState;
  config: SwarmConfig;
  agents: string[];
  createdAt: Date;
  completedAt?: Date;
  budget: {
    allocated: number;
    consumed: number;
    remaining: number;
  };
  metrics: {
    totalAgents: number;
    completedAgents: number;
    failedAgents: number;
  };
}

export interface SwarmStatusInfo {
  id: string;
  name: string;
  status: SwarmState;
  agentCount: number;
  budgetRemaining: number;
  progress: number; // 0-1
  estimatedCompletion?: Date;
}

export type SwarmEvent =
  | 'swarm.created'
  | 'swarm.scaled'
  | 'swarm.completed'
  | 'swarm.failed'
  | 'swarm.destroyed'
  | 'swarm.budget.warning'
  | 'swarm.budget.critical';

// ============================================================================
// Swarm Manager
// ============================================================================

export class SwarmManager extends EventEmitter {
  private swarms: Map<string, Swarm> = new Map();
  private agentLifecycle: AgentLifecycle;
  private messageBus: MessageBus;
  private storage: AgentStorage;
  private active: boolean = false;
  
  // RACE CONDITION FIX: One mutex per swarm for exclusive access
  private mutexes: Map<string, Mutex> = new Map();
  // Global mutex for swarm creation (to prevent ID collisions)
  private creationMutex: Mutex = new Mutex();

  constructor(
    agentLifecycle: AgentLifecycle,
    messageBus: MessageBus,
    storage: AgentStorage
  ) {
    super();
    this.agentLifecycle = agentLifecycle;
    this.messageBus = messageBus;
    this.storage = storage;
  }
  
  /**
   * RACE CONDITION FIX: Get or create a mutex for a specific swarm
   */
  private getMutex(swarmId: string): Mutex {
    if (!this.mutexes.has(swarmId)) {
      this.mutexes.set(swarmId, new Mutex());
    }
    return this.mutexes.get(swarmId)!;
  }
  
  /**
   * RACE CONDITION FIX: Clean up mutex for destroyed swarm
   */
  private cleanupMutex(swarmId: string): void {
    this.mutexes.delete(swarmId);
  }

  /**
   * Start the swarm manager
   */
  start(): void {
    this.active = true;
    this.emit('manager.started');
  }

  /**
   * Stop the swarm manager
   */
  stop(): void {
    this.active = false;
    this.emit('manager.stopped');
  }

  /**
   * Create a new swarm
   * RACE CONDITION FIX: Protected by creationMutex to prevent ID collisions
   */
  async create(config: SwarmConfig): Promise<Swarm> {
    return this.creationMutex.runExclusive(async () => {
      const id = `swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();

      const swarm: Swarm = {
        id,
        name: config.name,
        status: 'creating',
        config,
        agents: [],
        createdAt: now,
        budget: {
          allocated: config.budget?.amount || 0,
          consumed: 0,
          remaining: config.budget?.amount || 0,
        },
        metrics: {
          totalAgents: 0,
          completedAgents: 0,
          failedAgents: 0,
        },
      };

      this.swarms.set(id, swarm);
      
      // Create the mutex for this swarm immediately
      this.getMutex(id);

      // Subscribe to swarm broadcast topic
      this.messageBus.subscribe(
        MessageBus.swarmBroadcast(id),
        (message) => this.handleSwarmMessage(id, message)
      );

      // Create initial agents
      await this.initializeAgents(swarm);

      swarm.status = 'active';
      this.emit('swarm.created', swarm);
      this.messageBus.publish(
        MessageBus.swarmBroadcast(id),
        {
          eventType: 'swarm.created',
          source: { orchestrator: 'swarm-manager' },
          payload: { swarmId: id, name: config.name },
        },
        { priority: 'high' }
      );

      return swarm;
    });
  }

  /**
   * Destroy a swarm and all its agents
   * RACE CONDITION FIX: Protected by per-swarm mutex
   */
  async destroy(swarmId: string, force: boolean = false): Promise<void> {
    const mutex = this.getMutex(swarmId);
    await mutex.runExclusive(async () => {
      const swarm = this.swarms.get(swarmId);
      if (!swarm) {
        throw new Error(`Swarm ${swarmId} not found`);
      }

      swarm.status = 'destroyed';

      // Kill all agents in the swarm
      for (const agentId of swarm.agents) {
        try {
          await this.agentLifecycle.kill(agentId, force);
        } catch (error) {
          console.warn(`Failed to kill agent ${agentId}:`, error);
        }
      }

      swarm.agents = [];
      swarm.completedAt = new Date();

      this.emit('swarm.destroyed', swarm);
      this.messageBus.publish(
        MessageBus.swarmBroadcast(swarmId),
        {
          eventType: 'system.emergency_stop',
          source: { orchestrator: 'swarm-manager' },
          payload: { swarmId, reason: 'swarm_destroyed' },
        },
        { priority: 'critical' }
      );

      // Keep the swarm record but mark as destroyed
      this.swarms.set(swarmId, swarm);
      
      // Clean up the mutex
      this.cleanupMutex(swarmId);
    });
  }

  /**
   * Scale a swarm to a target number of agents
   * RACE CONDITION FIX: Protected by per-swarm mutex
   */
  async scale(swarmId: string, targetSize: number): Promise<void> {
    const mutex = this.getMutex(swarmId);
    await mutex.runExclusive(async () => {
      const swarm = this.swarms.get(swarmId);
      if (!swarm) {
        throw new Error(`Swarm ${swarmId} not found`);
      }

      if (swarm.status === 'destroyed') {
        throw new Error(`Cannot scale destroyed swarm ${swarmId}`);
      }

      const currentSize = swarm.agents.length;
      const maxAgents = swarm.config.maxAgents;

      if (targetSize > maxAgents) {
        throw new Error(`Target size ${targetSize} exceeds max agents ${maxAgents}`);
      }

      swarm.status = 'scaling';

      if (targetSize > currentSize) {
        // Scale up - spawn new agents
        const toAdd = targetSize - currentSize;
        for (let i = 0; i < toAdd; i++) {
          await this.spawnAgentForSwarm(swarm);
        }
      } else if (targetSize < currentSize) {
        // Scale down - kill excess agents
        const toRemove = currentSize - targetSize;
        const agentsToRemove = swarm.agents.slice(-toRemove);
        for (const agentId of agentsToRemove) {
          await this.agentLifecycle.kill(agentId);
          swarm.agents = swarm.agents.filter(id => id !== agentId);
        }
      }

      swarm.status = 'active';
      swarm.metrics.totalAgents = swarm.agents.length;

      this.emit('swarm.scaled', { swarmId, previousSize: currentSize, newSize: targetSize });
      this.messageBus.publish(
        MessageBus.swarmBroadcast(swarmId),
        {
          eventType: 'swarm.scaled',
          source: { orchestrator: 'swarm-manager' },
          payload: { swarmId, previousSize: currentSize, newSize: targetSize },
        },
        { priority: 'medium' }
      );
    });
  }

  /**
   * Get swarm status
   */
  getStatus(swarmId: string): SwarmStatusInfo {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const activeAgents = swarm.agents.filter(id => {
      const state = this.agentLifecycle.getState(id);
      return state && state.status === AgentStatus.RUNNING;
    }).length;

    const progress = swarm.metrics.totalAgents > 0
      ? swarm.metrics.completedAgents / swarm.metrics.totalAgents
      : 0;

    return {
      id: swarm.id,
      name: swarm.name,
      status: swarm.status,
      agentCount: activeAgents,
      budgetRemaining: swarm.budget.remaining,
      progress,
    };
  }

  /**
   * Get full swarm details
   */
  getSwarm(swarmId: string): Swarm | undefined {
    return this.swarms.get(swarmId);
  }

  /**
   * List all swarms
   */
  listSwarms(): Array<Swarm> {
    return Array.from(this.swarms.values());
  }

  /**
   * List active (non-destroyed) swarms
   */
  listActiveSwarms(): Array<Swarm> {
    return this.listSwarms().filter(s => s.status !== 'destroyed');
  }

  /**
   * Get agents in a swarm
   */
  getSwarmAgents(swarmId: string): AgentState[] {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return [];

    return swarm.agents
      .map(id => this.agentLifecycle.getState(id))
      .filter((state): state is AgentState => state !== null);
  }

  /**
   * Consume budget for an agent
   * RACE CONDITION FIX: Protected by per-swarm mutex
   */
  async consumeBudget(swarmId: string, agentId: string, tokens: number, cost: number): Promise<void> {
    const mutex = this.getMutex(swarmId);
    await mutex.runExclusive(async () => {
      const swarm = this.swarms.get(swarmId);
      if (!swarm) return;

      swarm.budget.consumed += cost;
      swarm.budget.remaining = Math.max(0, swarm.budget.allocated - swarm.budget.consumed);

      // Check budget thresholds
      const warningThreshold = swarm.config.budget?.warningThreshold || 0.75;
      const criticalThreshold = swarm.config.budget?.criticalThreshold || 0.90;
      const consumedRatio = swarm.budget.consumed / swarm.budget.allocated;

      if (consumedRatio >= criticalThreshold && consumedRatio < 1) {
        this.emit('swarm.budget.critical', { swarmId, remaining: swarm.budget.remaining });
        this.messageBus.publish(
          MessageBus.swarmBroadcast(swarmId),
          {
            eventType: 'system.emergency_stop',
            source: { orchestrator: 'swarm-manager', agentId },
            payload: { swarmId, reason: 'budget_critical', remaining: swarm.budget.remaining },
          },
          { priority: 'critical' }
        );
      } else if (consumedRatio >= warningThreshold) {
        this.emit('swarm.budget.warning', { swarmId, remaining: swarm.budget.remaining });
      }

      // Hard stop at 100%
      if (swarm.budget.remaining <= 0) {
        await this.pauseSwarmInternal(swarm, 'budget_exhausted');
      }
    });
  }
  
  /**
   * Internal method to pause swarm (must be called inside mutex)
   */
  private async pauseSwarmInternal(swarm: Swarm, reason?: string): Promise<void> {
    swarm.status = 'paused';

    for (const agentId of swarm.agents) {
      await this.agentLifecycle.pause(agentId);
    }

    this.emit('swarm.paused', { swarmId: swarm.id, reason });
  }

  /**
   * Pause a swarm
   * RACE CONDITION FIX: Protected by per-swarm mutex
   */
  async pauseSwarm(swarmId: string, reason?: string): Promise<void> {
    const mutex = this.getMutex(swarmId);
    await mutex.runExclusive(async () => {
      const swarm = this.swarms.get(swarmId);
      if (!swarm) return;

      swarm.status = 'paused';

      for (const agentId of swarm.agents) {
        await this.agentLifecycle.pause(agentId);
      }

      this.emit('swarm.paused', { swarmId, reason });
    });
  }

  /**
   * Resume a paused swarm
   * RACE CONDITION FIX: Protected by per-swarm mutex
   */
  async resumeSwarm(swarmId: string): Promise<void> {
    const mutex = this.getMutex(swarmId);
    await mutex.runExclusive(async () => {
      const swarm = this.swarms.get(swarmId);
      if (!swarm) return;

      swarm.status = 'active';

      for (const agentId of swarm.agents) {
        await this.agentLifecycle.resume(agentId);
      }

      this.emit('swarm.resumed', { swarmId });
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async initializeAgents(swarm: Swarm): Promise<void> {
    const { initialAgents, strategy, task } = swarm.config;

    // Create initial agents based on strategy
    if (strategy === 'pipeline') {
      // Pipeline: Each agent gets a stage of the task
      const stages = this.splitTaskIntoStages(task, initialAgents);
      for (let i = 0; i < initialAgents; i++) {
        await this.spawnAgentForSwarm(swarm, {
          task: stages[i] || `${task} (stage ${i + 1})`,
          stage: i,
        });
      }
    } else if (strategy === 'map-reduce') {
      // Map-reduce: One mapper per chunk, one reducer
      for (let i = 0; i < initialAgents - 1; i++) {
        await this.spawnAgentForSwarm(swarm, { role: 'mapper', index: i });
      }
      await this.spawnAgentForSwarm(swarm, { role: 'reducer' });
    } else {
      // Parallel or tree: All agents work on the same task
      for (let i = 0; i < initialAgents; i++) {
        await this.spawnAgentForSwarm(swarm, { index: i });
      }
    }
  }

  private async spawnAgentForSwarm(
    swarm: Swarm,
    metadata?: Record<string, unknown>
  ): Promise<Agent> {
    const agentConfig: CreateAgentOptions = {
      model: swarm.config.model || 'kimi-k2.5',
      task: swarm.config.task,
      swarmId: swarm.id,
      maxRetries: 3,
      budgetLimit: swarm.config.budget
        ? swarm.config.budget.amount / swarm.config.maxAgents
        : undefined,
    };

    const agent = await this.agentLifecycle.spawn(agentConfig);
    
    if (metadata) {
      Object.assign(agent.metadata, metadata);
    }

    swarm.agents.push(agent.id);
    swarm.metrics.totalAgents = swarm.agents.length;

    // Subscribe to agent events
    this.messageBus.subscribe(
      MessageBus.agentEvents(agent.id),
      (message) => this.handleAgentMessage(swarm.id, agent.id, message)
    );

    return agent;
  }

  private handleAgentMessage(swarmId: string, agentId: string, message: unknown): void {
    const msg = message as { payload?: { eventType?: string } };
    const eventType = msg.payload?.eventType;

    if (!eventType) return;

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    switch (eventType) {
      case 'agent.completed':
        swarm.metrics.completedAgents++;
        this.checkSwarmCompletion(swarm);
        break;
      case 'agent.failed':
        swarm.metrics.failedAgents++;
        break;
    }
  }

  private handleSwarmMessage(swarmId: string, message: unknown): void {
    // Handle broadcast messages to the swarm
    const msg = message as { payload?: { eventType?: string; cost?: number; tokens?: number } };
    const payload = msg.payload;

    if (payload?.cost && payload?.tokens) {
      // Budget consumption message from an agent
      // Find the agent that sent this (would need to track sender in message)
    }
  }

  private checkSwarmCompletion(swarm: Swarm): void {
    const totalFinished = swarm.metrics.completedAgents + swarm.metrics.failedAgents;
    
    if (totalFinished >= swarm.metrics.totalAgents) {
      swarm.status = 'completed';
      swarm.completedAt = new Date();
      this.emit('swarm.completed', swarm);
    }
  }

  private splitTaskIntoStages(task: string, numStages: number): string[] {
    // Simple stage splitting - in production this would use NLP or structured task breakdown
    const stages: string[] = [];
    for (let i = 0; i < numStages; i++) {
      stages.push(`${task} (stage ${i + 1}/${numStages})`);
    }
    return stages;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalSwarmManager: SwarmManager | null = null;

export function getGlobalSwarmManager(
  agentLifecycle?: AgentLifecycle,
  messageBus?: MessageBus,
  storage?: AgentStorage
): SwarmManager {
  if (!globalSwarmManager) {
    if (!agentLifecycle || !messageBus || !storage) {
      throw new Error('SwarmManager requires dependencies on first initialization');
    }
    globalSwarmManager = new SwarmManager(agentLifecycle, messageBus, storage);
  }
  return globalSwarmManager;
}

export function resetGlobalSwarmManager(): void {
  globalSwarmManager = null;
}

export default SwarmManager;
