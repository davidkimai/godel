/**
 * Swarm Orchestrator with Event Bus + Session Tree Integration
 * 
 * Enhanced swarm manager that emits granular events during agent execution
 * and supports session tree branching for A/B testing.
 */

import { EventEmitter } from 'events';
import { Mutex } from 'async-mutex';
import { AgentStatus, type Agent, type CreateAgentOptions } from '../models/agent';
import { AgentLifecycle, type AgentState } from './lifecycle';
import { MessageBus } from '../bus/index';
import { AgentStorage } from '../storage/memory';
import { SwarmRepository } from '../storage';
import {
  AgentEventBus,
  ScopedEventBus,
  getGlobalEventBus,
  AgentEvent,
} from './event-bus';
import {
  SessionTree,
  BranchComparison,
  ForkResult,
  getGlobalSessionTree,
} from './session-tree';
import {
  SwarmNotFoundError,
  ApplicationError,
  DashErrorCode,
  assertExists,
  safeExecute,
} from '../errors';
import { logger } from '../utils/logger';

// ============================================================================
// Core Swarm Types (previously in swarm.ts, now unified here)
// ============================================================================

export type SwarmStrategy = 'parallel' | 'map-reduce' | 'pipeline' | 'tree';

export interface BudgetConfig {
  amount: number;
  currency: string;
  warningThreshold?: number;
  criticalThreshold?: number;
}

export interface SafetyConfig {
  fileSandbox: boolean;
  networkAllowlist?: string[];
  commandBlacklist?: string[];
  maxExecutionTime?: number;
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
  /** Enable session tree branching for A/B testing */
  enableBranching?: boolean;
  /** Enable granular event streaming */
  enableEventStreaming?: boolean;
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
  /** Session tree for this swarm */
  sessionTreeId?: string;
  /** Current branch for A/B testing */
  currentBranch?: string;
}

export interface SwarmStatusInfo {
  id: string;
  name: string;
  status: SwarmState;
  agentCount: number;
  budgetRemaining: number;
  progress: number;
  estimatedCompletion?: Date;
  /** Current branch for A/B testing */
  currentBranch?: string;
  /** Number of branches */
  branchCount?: number;
}

// ============================================================================
// Enhanced Swarm Orchestrator
// ============================================================================

export class SwarmOrchestrator extends EventEmitter {
  private swarms: Map<string, Swarm> = new Map();
  private agentLifecycle: AgentLifecycle;
  private messageBus: MessageBus;
  private eventBus: AgentEventBus;
  private storage: AgentStorage;
  private swarmRepository?: SwarmRepository;
  private sessionTree: SessionTree;
  private active: boolean = false;

  // Track agent-scoped event buses
  private agentEventBuses: Map<string, ScopedEventBus> = new Map();

  // Mutexes for thread safety
  private mutexes: Map<string, Mutex> = new Map();
  private creationMutex: Mutex = new Mutex();

  constructor(
    agentLifecycle: AgentLifecycle,
    messageBus: MessageBus,
    storage: AgentStorage,
    eventBus?: AgentEventBus,
    sessionTree?: SessionTree,
    swarmRepository?: SwarmRepository
  ) {
    super();
    this.agentLifecycle = agentLifecycle;
    this.messageBus = messageBus;
    this.storage = storage;
    this.eventBus = eventBus || getGlobalEventBus();
    this.sessionTree = sessionTree || getGlobalSessionTree();
    this.swarmRepository = swarmRepository;
  }

  /**
   * Set the swarm repository for persistence
   */
  setSwarmRepository(repo: SwarmRepository): void {
    this.swarmRepository = repo;
  }

  private getMutex(swarmId: string): Mutex {
    if (!this.mutexes.has(swarmId)) {
      this.mutexes.set(swarmId, new Mutex());
    }
    return this.mutexes.get(swarmId)!;
  }

  private cleanupMutex(swarmId: string): void {
    this.mutexes.delete(swarmId);
  }

  /**
   * Start the orchestrator
   */
  start(): void {
    this.active = true;
    this.emit('orchestrator.started');
    logger.info('[SwarmOrchestrator] Started with event bus and session tree integration');
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    this.active = false;
    this.emit('orchestrator.stopped');
  }

  /**
   * Create a new swarm with event streaming and optional session tree
   */
  async create(config: SwarmConfig): Promise<Swarm> {
    return this.creationMutex.runExclusive(async () => {
      const id = `swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();

      // Initialize session tree if branching enabled
      let sessionTreeId: string | undefined;
      if (config.enableBranching) {
        const treeName = `${config.name}-${id.slice(-6)}`;
        const newTree = SessionTree.create(this.sessionTree.getCwd(), this.sessionTree.getSessionDir(), treeName);
        sessionTreeId = newTree.getSessionId();
        
        // Record swarm creation in session tree
        newTree.appendAgentAction('spawn', id, { task: config.task, strategy: config.strategy });
      }

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
        sessionTreeId,
        currentBranch: config.enableBranching ? 'main' : undefined,
      };

      this.swarms.set(id, swarm);
      this.getMutex(id);

      // Subscribe to swarm broadcast
      this.messageBus.subscribe(
        MessageBus.swarmBroadcast(id),
        (message) => this.handleSwarmMessage(id, message)
      );

      // Create initial agents
      await this.initializeAgents(swarm);

      swarm.status = 'active';

      // Persist to repository
      if (this.swarmRepository) {
        await this.swarmRepository.create({
          id: swarm.id,
          name: swarm.name,
          status: swarm.status,
          config: swarm.config as unknown as Record<string, unknown>,
          agents: swarm.agents,
          created_at: swarm.createdAt.toISOString(),
          budget_allocated: swarm.budget.allocated,
          budget_consumed: swarm.budget.consumed,
          budget_remaining: swarm.budget.remaining,
          metrics: swarm.metrics as unknown as Record<string, unknown>,
        });
      }

      // Emit orchestrator event
      this.emit('swarm.created', swarm);
      
      // Emit event bus event if enabled
      if (config.enableEventStreaming) {
        this.eventBus.emitEvent({
          id: `evt_${Date.now()}`,
          type: 'agent_start',
          timestamp: Date.now(),
          agentId: id,
          swarmId: id,
          task: config.task,
          model: config.model || 'default',
          provider: 'openclaw',
        } as AgentEvent);
      }

      this.messageBus.publish(
        MessageBus.swarmBroadcast(id),
        {
          eventType: 'swarm.created',
          source: { orchestrator: 'swarm-orchestrator' },
          payload: { swarmId: id, name: config.name, sessionTreeId },
        },
        { priority: 'high' }
      );

      logger.info(`[SwarmOrchestrator] Created swarm ${id} with ${swarm.agents.length} agents`);

      return swarm;
    });
  }

  /**
   * Destroy a swarm
   */
  async destroy(swarmId: string, force: boolean = false): Promise<void> {
    const mutex = this.getMutex(swarmId);
    await mutex.runExclusive(async () => {
      const swarm = assertExists(
        this.swarms.get(swarmId),
        'Swarm',
        swarmId,
        { code: DashErrorCode.SWARM_NOT_FOUND }
      );

      swarm.status = 'destroyed';

      // Kill all agents
      for (const agentId of swarm.agents) {
        await safeExecute(
          async () => {
            await this.agentLifecycle.kill(agentId, force);
          },
          undefined,
          { logError: true, context: `SwarmOrchestrator.destroy.${swarmId}` }
        );
      }

      swarm.agents = [];
      swarm.completedAt = new Date();

      this.emit('swarm.destroyed', swarm);
      this.messageBus.publish(
        MessageBus.swarmBroadcast(swarmId),
        {
          eventType: 'system.emergency_stop',
          source: { orchestrator: 'swarm-orchestrator' },
          payload: { swarmId, reason: 'swarm_destroyed' },
        },
        { priority: 'critical' }
      );

      this.swarms.set(swarmId, swarm);
      this.cleanupMutex(swarmId);
    });
  }

  /**
   * Scale a swarm
   */
  async scale(swarmId: string, targetSize: number): Promise<void> {
    const mutex = this.getMutex(swarmId);
    await mutex.runExclusive(async () => {
      const swarm = assertExists(
        this.swarms.get(swarmId),
        'Swarm',
        swarmId,
        { code: DashErrorCode.SWARM_NOT_FOUND }
      );

      if (swarm.status === 'destroyed') {
        throw new ApplicationError(
          `Cannot scale destroyed swarm ${swarmId}`,
          DashErrorCode.INVALID_SWARM_STATE,
          400,
          { swarmId, currentStatus: swarm.status },
          true
        );
      }

      const currentSize = swarm.agents.length;
      const maxAgents = swarm.config.maxAgents;

      if (targetSize > maxAgents) {
        throw new ApplicationError(
          `Target size ${targetSize} exceeds max agents ${maxAgents}`,
          DashErrorCode.MAX_AGENTS_EXCEEDED,
          400,
          { swarmId, targetSize, maxAgents },
          true
        );
      }

      swarm.status = 'scaling';

      if (targetSize > currentSize) {
        const toAdd = targetSize - currentSize;
        for (let i = 0; i < toAdd; i++) {
          await this.spawnAgentForSwarm(swarm);
        }
      } else if (targetSize < currentSize) {
        const toRemove = currentSize - targetSize;
        const agentsToRemove = swarm.agents.slice(-toRemove);
        for (const agentId of agentsToRemove) {
          await safeExecute(
            async () => {
              await this.agentLifecycle.kill(agentId);
              swarm.agents = swarm.agents.filter((id) => id !== agentId);
            },
            undefined,
            { logError: true, context: `SwarmOrchestrator.scale.${swarmId}` }
          );
        }
      }

      swarm.status = 'active';
      swarm.metrics.totalAgents = swarm.agents.length;

      this.emit('swarm.scaled', { swarmId, previousSize: currentSize, newSize: targetSize });
    });
  }

  // =========================================================================
  // Session Tree + Branching Operations (for A/B Testing)
  // =========================================================================

  /**
   * Create a branch in the swarm's session tree for A/B testing
   */
  async createBranch(swarmId: string, branchName: string, description?: string): Promise<string> {
    const swarm = assertExists(
      this.swarms.get(swarmId),
      'Swarm',
      swarmId,
      { code: DashErrorCode.SWARM_NOT_FOUND }
    );

    if (!swarm.config.enableBranching || !swarm.sessionTreeId) {
      throw new ApplicationError(
        'Swarm does not have branching enabled',
        DashErrorCode.INVALID_SWARM_STATE,
        400,
        { swarmId },
        true
      );
    }

    // Get or create the session tree for this swarm
    const tree = this.getSessionTreeForSwarm(swarm);
    const entryId = tree.createBranch(branchName, description);

    // Record in session tree
    tree.appendAgentAction('branch', swarmId, { branchName, description });

    this.emit('swarm.branch_created', { swarmId, branchName, entryId });
    logger.info(`[SwarmOrchestrator] Created branch ${branchName} for swarm ${swarmId}`);

    return entryId;
  }

  /**
   * Create a branch from a specific entry point
   */
  async createBranchAt(swarmId: string, entryId: string, branchName: string, description?: string): Promise<string> {
    const swarm = assertExists(
      this.swarms.get(swarmId),
      'Swarm',
      swarmId,
      { code: DashErrorCode.SWARM_NOT_FOUND }
    );

    if (!swarm.config.enableBranching) {
      throw new ApplicationError(
        'Swarm does not have branching enabled',
        DashErrorCode.INVALID_SWARM_STATE,
        400,
        { swarmId },
        true
      );
    }

    const tree = this.getSessionTreeForSwarm(swarm);
    const newEntryId = tree.createBranchAt(entryId, branchName, description);

    this.emit('swarm.branch_created', { swarmId, branchName, entryId: newEntryId, fromEntry: entryId });
    logger.info(`[SwarmOrchestrator] Created branch ${branchName} from entry ${entryId} for swarm ${swarmId}`);

    return newEntryId;
  }

  /**
   * Switch to a different branch
   */
  async switchBranch(swarmId: string, branchName: string): Promise<void> {
    const swarm = assertExists(
      this.swarms.get(swarmId),
      'Swarm',
      swarmId,
      { code: DashErrorCode.SWARM_NOT_FOUND }
    );

    if (!swarm.config.enableBranching) {
      throw new ApplicationError(
        'Swarm does not have branching enabled',
        DashErrorCode.INVALID_SWARM_STATE,
        400,
        { swarmId },
        true
      );
    }

    const tree = this.getSessionTreeForSwarm(swarm);
    tree.switchBranch(branchName);
    swarm.currentBranch = branchName;

    this.emit('swarm.branch_switched', { swarmId, branchName });
  }

  /**
   * Fork the swarm's session from a specific entry
   */
  async forkSession(swarmId: string, entryId: string, newName: string): Promise<ForkResult> {
    const swarm = assertExists(
      this.swarms.get(swarmId),
      'Swarm',
      swarmId,
      { code: DashErrorCode.SWARM_NOT_FOUND }
    );

    if (!swarm.config.enableBranching) {
      throw new ApplicationError(
        'Swarm does not have branching enabled',
        DashErrorCode.INVALID_SWARM_STATE,
        400,
        { swarmId },
        true
      );
    }

    const tree = this.getSessionTreeForSwarm(swarm);
    const result = tree.forkSession(entryId, newName);

    // Record fork action
    tree.appendAgentAction('fork', swarmId, { forkedFrom: entryId, newName, newSessionId: result.newSessionId });

    this.emit('swarm.session_forked', { swarmId, entryId, newName, result });
    logger.info(`[SwarmOrchestrator] Forked session from entry ${entryId} to ${result.newSessionFile}`);

    return result;
  }

  /**
   * Compare branches for A/B testing
   */
  compareBranches(swarmId: string, branchIds: string[]): BranchComparison {
    const swarm = assertExists(
      this.swarms.get(swarmId),
      'Swarm',
      swarmId,
      { code: DashErrorCode.SWARM_NOT_FOUND }
    );

    if (!swarm.config.enableBranching) {
      throw new ApplicationError(
        'Swarm does not have branching enabled',
        DashErrorCode.INVALID_SWARM_STATE,
        400,
        { swarmId },
        true
      );
    }

    const tree = this.getSessionTreeForSwarm(swarm);
    return tree.compareBranches(branchIds);
  }

  /**
   * Get session tree for a swarm
   */
  private getSessionTreeForSwarm(swarm: Swarm): SessionTree {
    if (!swarm.sessionTreeId) {
      // Create a new session tree for this swarm
      const tree = SessionTree.create(
        this.sessionTree.getCwd(),
        this.sessionTree.getSessionDir(),
        `${swarm.name}-${swarm.id.slice(-6)}`
      );
      swarm.sessionTreeId = tree.getSessionId();
      return tree;
    }

    // Try to find existing tree (simplified - in production would need proper lookup)
    return this.sessionTree;
  }

  // =========================================================================
  // Event Streaming Operations
  // =========================================================================

  /**
   * Subscribe to agent events for a specific swarm
   */
  subscribeToSwarmEvents(
    swarmId: string,
    handler: (event: AgentEvent) => void
  ): { unsubscribe: () => void } {
    const subscription = this.eventBus.subscribeAll((event) => {
      if (event.swarmId === swarmId) {
        handler(event);
      }
    });

    return {
      unsubscribe: () => this.eventBus.unsubscribe(subscription),
    };
  }

  /**
   * Get recent events for a swarm
   */
  getSwarmEvents(swarmId: string, limit?: number): AgentEvent[] {
    const events = this.eventBus.getEvents({ swarmId });
    return limit ? events.slice(-limit) : events;
  }

  // =========================================================================
  // Standard Operations
  // =========================================================================

  getStatus(swarmId: string): SwarmStatusInfo {
    const swarm = assertExists(
      this.swarms.get(swarmId),
      'Swarm',
      swarmId,
      { code: DashErrorCode.SWARM_NOT_FOUND }
    );

    const activeAgents = swarm.agents.filter((id) => {
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
      currentBranch: swarm.currentBranch,
      branchCount: swarm.config.enableBranching ? this.getBranchCount(swarm) : undefined,
    };
  }

  private getBranchCount(swarm: Swarm): number {
    if (!swarm.sessionTreeId) return 0;
    try {
      const tree = this.getSessionTreeForSwarm(swarm);
      return tree.listBranches().length;
    } catch {
      return 0;
    }
  }

  getSwarm(swarmId: string): Swarm | undefined {
    return this.swarms.get(swarmId);
  }

  listSwarms(): Array<Swarm> {
    return Array.from(this.swarms.values());
  }

  listActiveSwarms(): Array<Swarm> {
    return this.listSwarms().filter((s) => s.status !== 'destroyed');
  }

  getSwarmAgents(swarmId: string): AgentState[] {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return [];

    return swarm.agents
      .map((id) => this.agentLifecycle.getState(id))
      .filter((state): state is AgentState => state !== null);
  }

  async consumeBudget(swarmId: string, agentId: string, tokens: number, cost: number): Promise<void> {
    const mutex = this.getMutex(swarmId);
    await mutex.runExclusive(async () => {
      const swarm = this.swarms.get(swarmId);
      if (!swarm) return;

      swarm.budget.consumed += cost;
      swarm.budget.remaining = Math.max(0, swarm.budget.allocated - swarm.budget.consumed);

      const warningThreshold = swarm.config.budget?.warningThreshold || 0.75;
      const criticalThreshold = swarm.config.budget?.criticalThreshold || 0.90;
      const consumedRatio = swarm.budget.consumed / swarm.budget.allocated;

      if (consumedRatio >= criticalThreshold && consumedRatio < 1) {
        this.emit('swarm.budget_critical', { swarmId, remaining: swarm.budget.remaining });
      } else if (consumedRatio >= warningThreshold) {
        this.emit('swarm.budget_warning', { swarmId, remaining: swarm.budget.remaining });
      }

      if (swarm.budget.remaining <= 0) {
        await this.pauseSwarmInternal(swarm, 'budget_exhausted');
      }
    });
  }

  private async pauseSwarmInternal(swarm: Swarm, reason?: string): Promise<void> {
    swarm.status = 'paused';

    for (const agentId of swarm.agents) {
      await safeExecute(
        async () => {
          await this.agentLifecycle.pause(agentId);
        },
        undefined,
        { logError: true, context: `SwarmOrchestrator.pause.${swarm.id}` }
      );
    }

    this.emit('swarm.paused', { swarmId: swarm.id, reason });
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private async initializeAgents(swarm: Swarm): Promise<void> {
    const { initialAgents, strategy, task } = swarm.config;

    if (strategy === 'pipeline') {
      const stages = this.splitTaskIntoStages(task, initialAgents);
      for (let i = 0; i < initialAgents; i++) {
        await this.spawnAgentForSwarm(swarm, {
          task: stages[i] || `${task} (stage ${i + 1})`,
          stage: i,
        });
      }
    } else if (strategy === 'map-reduce') {
      for (let i = 0; i < initialAgents - 1; i++) {
        await this.spawnAgentForSwarm(swarm, { role: 'mapper', index: i });
      }
      await this.spawnAgentForSwarm(swarm, { role: 'reducer' });
    } else {
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

    // Create scoped event bus for this agent
    if (swarm.config.enableEventStreaming) {
      const scopedBus = this.eventBus.createScopedBus(agent.id, swarm.id, swarm.sessionTreeId);
      this.agentEventBuses.set(agent.id, scopedBus);

      // Record in session tree
      if (swarm.config.enableBranching) {
        const tree = this.getSessionTreeForSwarm(swarm);
        tree.appendAgentAction('spawn', agent.id, { task: agent.task });
      }

      // Emit agent start event
      scopedBus.emitAgentStart(agent.task, agent.model, 'openclaw');
    }

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
        
        // Emit completion event
        if (swarm.config.enableEventStreaming) {
          const scopedBus = this.agentEventBuses.get(agentId);
          if (scopedBus) {
            scopedBus.emitAgentComplete('completed', 0, 0, 0);
          }
        }
        break;
      case 'agent.failed':
        swarm.metrics.failedAgents++;
        break;
    }
  }

  private handleSwarmMessage(swarmId: string, message: unknown): void {
    // Handle broadcast messages
    const msg = message as { payload?: { eventType?: string; cost?: number; tokens?: number } };
    const payload = msg.payload;

    if (payload?.cost && payload?.tokens) {
      // Budget consumption tracking
    }
  }

  private checkSwarmCompletion(swarm: Swarm): void {
    const totalFinished = swarm.metrics.completedAgents + swarm.metrics.failedAgents;

    if (totalFinished >= swarm.metrics.totalAgents) {
      swarm.status = 'completed';
      swarm.completedAt = new Date();
      this.emit('swarm.completed', swarm);

      // Emit completion event
      if (swarm.config.enableEventStreaming) {
        this.eventBus.emitEvent({
          id: `evt_${Date.now()}`,
          type: 'agent_complete',
          timestamp: Date.now(),
          agentId: swarm.id,
          swarmId: swarm.id,
          result: 'completed',
          totalCost: swarm.budget.consumed,
          totalTokens: 0,
          duration: Date.now() - swarm.createdAt.getTime(),
        } as AgentEvent);
      }
    }
  }

  private splitTaskIntoStages(task: string, numStages: number): string[] {
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

let globalOrchestrator: SwarmOrchestrator | null = null;

export function getGlobalSwarmOrchestrator(
  agentLifecycle?: AgentLifecycle,
  messageBus?: MessageBus,
  storage?: AgentStorage,
  eventBus?: AgentEventBus,
  sessionTree?: SessionTree,
  swarmRepository?: SwarmRepository
): SwarmOrchestrator {
  if (!globalOrchestrator) {
    if (!agentLifecycle || !messageBus || !storage) {
      throw new ApplicationError(
        'SwarmOrchestrator requires dependencies on first initialization',
        DashErrorCode.INITIALIZATION_FAILED,
        500,
        {
          missingDeps: {
            agentLifecycle: !agentLifecycle,
            messageBus: !messageBus,
            storage: !storage,
          },
        },
        false
      );
    }
    globalOrchestrator = new SwarmOrchestrator(
      agentLifecycle,
      messageBus,
      storage,
      eventBus,
      sessionTree,
      swarmRepository
    );
  } else if (swarmRepository) {
    globalOrchestrator.setSwarmRepository(swarmRepository);
  }
  return globalOrchestrator;
}

export function resetGlobalSwarmOrchestrator(): void {
  globalOrchestrator = null;
}

export default SwarmOrchestrator;