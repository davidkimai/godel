/**
 * Agent Lifecycle Manager - SPEC_v2.md Section 2.2
 * 
 * Manages agent lifecycle states, auto-recovery, and transitions.
 * States: IDLE → SPAWNING → RUNNING → COMPLETED
 *                    ↓
 *              PAUSED ↔ RETRYING
 *                    ↓
 *                 FAILED
 *                    ↓
 *               ESCALATED
 */

import { EventEmitter } from 'events';
import {
  AgentStatus,
  type Agent,
  type CreateAgentOptions,
  createAgent,
} from '../models/agent.js';
import { AgentStorage } from '../storage/memory.js';
import { MessageBus } from '../bus/index.js';
import { generateEventId } from '../events/types.js';
import { OpenClawIntegration, type SessionSpawnOptions } from './openclaw.js';

// ============================================================================
// Types
// ============================================================================

export type LifecycleState =
  | 'idle'
  | 'spawning'
  | 'running'
  | 'paused'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'escalated'
  | 'killed';

export interface AgentState {
  id: string;
  status: AgentStatus;
  lifecycleState: LifecycleState;
  agent: Agent;
  sessionId?: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  pausedAt?: Date;
  resumedAt?: Date;
}

export interface RetryOptions {
  delay?: number;
  maxRetries?: number;
  useAlternateModel?: boolean;
  alternateModel?: string;
}

export interface SpawnOptions extends CreateAgentOptions {
  autoStart?: boolean;
}

export interface LifecycleMetrics {
  totalSpawned: number;
  totalCompleted: number;
  totalFailed: number;
  totalKilled: number;
  activeAgents: number;
  pausedAgents: number;
}

// ============================================================================
// Agent Lifecycle Manager
// ============================================================================

export class AgentLifecycle extends EventEmitter {
  private states: Map<string, AgentState> = new Map();
  private storage: AgentStorage;
  private messageBus: MessageBus;
  private openclaw?: OpenClawIntegration;
  private active: boolean = false;
  private retryDelays: Map<string, number> = new Map(); // Track retry delays per agent
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second

  constructor(storage: AgentStorage, messageBus: MessageBus, openclaw?: OpenClawIntegration) {
    super();
    this.storage = storage;
    this.messageBus = messageBus;
    this.openclaw = openclaw;
  }

  /**
   * Set the OpenClaw integration (for late binding)
   */
  setOpenClawIntegration(openclaw: OpenClawIntegration): void {
    this.openclaw = openclaw;
  }

  /**
   * Start the lifecycle manager
   */
  start(): void {
    this.active = true;
    this.emit('lifecycle.started');
  }

  /**
   * Stop the lifecycle manager
   */
  stop(): void {
    this.active = false;
    this.emit('lifecycle.stopped');
  }

  /**
   * Spawn a new agent
   */
  async spawn(options: SpawnOptions): Promise<Agent> {
    if (!this.active) {
      throw new Error('AgentLifecycle is not started');
    }

    // Create agent model
    const agent = createAgent(options);
    
    // Create lifecycle state
    const state: AgentState = {
      id: agent.id,
      status: AgentStatus.PENDING,
      lifecycleState: 'spawning',
      agent,
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.DEFAULT_MAX_RETRIES,
      createdAt: new Date(),
    };

    this.states.set(agent.id, state);
    this.storage.create(agent);

    // Spawn OpenClaw session if integration is available
    if (this.openclaw) {
      try {
        const spawnOptions: SessionSpawnOptions = {
          agentId: agent.id,
          model: agent.model,
          task: agent.task,
          context: {
            label: agent.label,
            swarmId: agent.swarmId,
            parentId: agent.parentId,
            ...agent.metadata,
          },
          maxTokens: options.budgetLimit ? Math.floor(options.budgetLimit * 1000) : undefined,
        };

        const sessionId = await this.openclaw.spawnSession(spawnOptions);
        state.sessionId = sessionId;
        
        this.emit('agent.session_created', { agentId: agent.id, sessionId });
      } catch (error) {
        console.error(`[AgentLifecycle] Failed to spawn OpenClaw session for agent ${agent.id}:`, error);
        // Continue without OpenClaw session - the agent can still function
      }
    }

    // Publish spawn event
    this.publishAgentEvent(agent.id, 'agent.spawned', {
      agentId: agent.id,
      label: agent.label,
      model: agent.model,
      task: agent.task,
      swarmId: agent.swarmId,
      parentId: agent.parentId,
      sessionId: state.sessionId,
    });

    this.emit('agent.spawned', state);

    // Auto-start if requested (default true)
    if (options.autoStart !== false) {
      await this.startAgent(agent.id);
    }

    return agent;
  }

  /**
   * Start an agent (transition from pending to running)
   */
  async startAgent(agentId: string): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (state.lifecycleState !== 'spawning' && state.lifecycleState !== 'idle') {
      throw new Error(`Cannot start agent in ${state.lifecycleState} state`);
    }

    state.lifecycleState = 'running';
    state.status = AgentStatus.RUNNING;
    state.startedAt = new Date();

    // Update storage
    this.storage.update(agentId, { status: AgentStatus.RUNNING });

    // Publish status change event
    this.publishAgentEvent(agentId, 'agent.status_changed', {
      agentId,
      previousStatus: 'pending',
      newStatus: 'running',
    });

    this.emit('agent.started', state);
  }

  /**
   * Pause an agent
   */
  async pause(agentId: string): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (state.lifecycleState !== 'running' && state.lifecycleState !== 'retrying') {
      throw new Error(`Cannot pause agent in ${state.lifecycleState} state`);
    }

    const previousStatus = state.status;
    state.lifecycleState = 'paused';
    state.status = AgentStatus.PAUSED;
    state.pausedAt = new Date();

    // Update storage
    this.storage.update(agentId, { 
      status: AgentStatus.PAUSED,
      pauseTime: state.pausedAt,
      pausedBy: 'lifecycle_manager',
    });

    // Pause OpenClaw session if available
    if (this.openclaw && this.openclaw.hasSession(agentId)) {
      try {
        await this.openclaw.pauseSession(agentId);
        this.emit('agent.session_paused', { agentId, sessionId: state.sessionId });
      } catch (error) {
        console.error(`[AgentLifecycle] Failed to pause OpenClaw session for agent ${agentId}:`, error);
      }
    }

    this.publishAgentEvent(agentId, 'agent.paused', {
      agentId,
      previousStatus: previousStatus.toLowerCase(),
      newStatus: 'paused',
      sessionId: state.sessionId,
    });

    this.emit('agent.paused', state);
  }

  /**
   * Resume a paused agent
   */
  async resume(agentId: string): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (state.lifecycleState !== 'paused') {
      throw new Error(`Cannot resume agent in ${state.lifecycleState} state`);
    }

    state.lifecycleState = 'running';
    state.status = AgentStatus.RUNNING;
    state.resumedAt = new Date();

    // Update storage
    this.storage.update(agentId, { status: AgentStatus.RUNNING });

    // Resume OpenClaw session if available
    if (this.openclaw && this.openclaw.hasSession(agentId)) {
      try {
        await this.openclaw.resumeSession(agentId);
        this.emit('agent.session_resumed', { agentId, sessionId: state.sessionId });
      } catch (error) {
        console.error(`[AgentLifecycle] Failed to resume OpenClaw session for agent ${agentId}:`, error);
      }
    }

    this.publishAgentEvent(agentId, 'agent.resumed', {
      agentId,
      previousStatus: 'paused',
      newStatus: 'running',
      sessionId: state.sessionId,
    });

    this.emit('agent.resumed', state);
  }

  /**
   * Kill an agent
   */
  async kill(agentId: string, force: boolean = false): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (state.lifecycleState === 'killed' || state.lifecycleState === 'completed') {
      return; // Already terminated
    }

    state.lifecycleState = 'killed';
    state.status = AgentStatus.KILLED;
    state.completedAt = new Date();

    // Update storage
    this.storage.update(agentId, { 
      status: AgentStatus.KILLED,
      completedAt: state.completedAt,
    });

    this.publishAgentEvent(agentId, 'agent.killed', {
      agentId,
      force,
    });

    this.emit('agent.killed', state);
  }

  /**
   * Mark an agent as completed
   */
  async complete(agentId: string, output?: string): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (state.lifecycleState === 'killed' || state.lifecycleState === 'completed') {
      return; // Already terminated
    }

    state.lifecycleState = 'completed';
    state.status = AgentStatus.COMPLETED;
    state.completedAt = new Date();

    // Update agent runtime
    if (state.startedAt) {
      state.agent.runtime = Date.now() - state.startedAt.getTime();
    }

    // Update storage
    this.storage.update(agentId, { 
      status: AgentStatus.COMPLETED,
      completedAt: state.completedAt,
      runtime: state.agent.runtime,
    });

    this.publishAgentEvent(agentId, 'agent.completed', {
      agentId,
      runtime: state.agent.runtime,
      output,
    });

    this.emit('agent.completed', state);
  }

  /**
   * Mark an agent as failed with auto-retry logic
   */
  async fail(agentId: string, error: string, options?: RetryOptions): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    state.lastError = error;
    state.retryCount++;

    // Check if we should retry
    const maxRetries = options?.maxRetries ?? state.maxRetries;
    
    if (state.retryCount <= maxRetries) {
      // Attempt retry with exponential backoff
      await this.retry(agentId, options);
    } else {
      // Max retries exhausted - try alternate model if specified
      if (options?.useAlternateModel && options?.alternateModel) {
        await this.retryWithAlternateModel(agentId, options.alternateModel);
      } else {
        // Mark as failed
        await this.markFailed(agentId, error);
      }
    }
  }

  /**
   * Retry a failed agent
   */
  async retry(agentId: string, options?: RetryOptions): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const retryDelay = options?.delay ?? this.calculateRetryDelay(agentId);
    
    state.lifecycleState = 'retrying';
    state.status = AgentStatus.PENDING;

    this.publishAgentEvent(agentId, 'agent.status_changed', {
      agentId,
      previousStatus: 'failed',
      newStatus: 'retrying',
      reason: `Retry ${state.retryCount}/${state.maxRetries}`,
    });

    this.emit('agent.retrying', { state, delay: retryDelay });

    // Wait for delay then restart
    await this.delay(retryDelay);
    
    if (!this.active) return; // Check if still active

    await this.startAgent(agentId);
  }

  /**
   * Retry with an alternate model (escalation)
   */
  async retryWithAlternateModel(agentId: string, alternateModel: string): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Update model and reset retry count
    state.agent.model = alternateModel;
    state.retryCount = 0;

    this.publishAgentEvent(agentId, 'agent.status_changed', {
      agentId,
      previousStatus: 'failed',
      newStatus: 'escalated',
      reason: `Escalated to model ${alternateModel}`,
    });

    this.emit('agent.escalated', { state, newModel: alternateModel });

    // Start with new model
    await this.startAgent(agentId);
  }

  /**
   * Get agent state
   */
  getState(agentId: string): AgentState | null {
    return this.states.get(agentId) || null;
  }

  /**
   * Get all agent states
   */
  getAllStates(): AgentState[] {
    return Array.from(this.states.values());
  }

  /**
   * Get agents by status
   */
  getAgentsByStatus(status: AgentStatus): AgentState[] {
    return this.getAllStates().filter(s => s.status === status);
  }

  /**
   * Get agents by swarm
   */
  getAgentsBySwarm(swarmId: string): AgentState[] {
    return this.getAllStates().filter(s => s.agent.swarmId === swarmId);
  }

  /**
   * Get lifecycle metrics
   */
  getMetrics(): LifecycleMetrics {
    const states = this.getAllStates();
    return {
      totalSpawned: states.length,
      totalCompleted: states.filter(s => s.lifecycleState === 'completed').length,
      totalFailed: states.filter(s => s.lifecycleState === 'failed').length,
      totalKilled: states.filter(s => s.lifecycleState === 'killed').length,
      activeAgents: states.filter(s => s.lifecycleState === 'running').length,
      pausedAgents: states.filter(s => s.lifecycleState === 'paused').length,
    };
  }

  /**
   * Clean up completed/failed agents older than a threshold
   */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [agentId, state] of this.states) {
      if (state.completedAt) {
        const age = now - state.completedAt.getTime();
        if (age > maxAgeMs) {
          this.states.delete(agentId);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async markFailed(agentId: string, error: string): Promise<void> {
    const state = this.states.get(agentId);
    if (!state) return;

    state.lifecycleState = 'failed';
    state.status = AgentStatus.FAILED;
    state.completedAt = new Date();
    state.lastError = error;

    // Update storage
    this.storage.update(agentId, { 
      status: AgentStatus.FAILED,
      completedAt: state.completedAt,
      lastError: error,
    });

    this.publishAgentEvent(agentId, 'agent.failed', {
      agentId,
      error,
      retryCount: state.retryCount,
      maxRetries: state.maxRetries,
    });

    this.emit('agent.failed', state);
  }

  private calculateRetryDelay(agentId: string): number {
    const state = this.states.get(agentId);
    if (!state) return this.BASE_RETRY_DELAY;

    // Exponential backoff: 2^attempt * base_delay
    const delay = Math.pow(2, state.retryCount) * this.BASE_RETRY_DELAY;
    
    // Cap at 5 minutes
    return Math.min(delay, 5 * 60 * 1000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private publishAgentEvent(
    agentId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): void {
    this.messageBus.publish(
      MessageBus.agentEvents(agentId),
      {
        id: generateEventId(),
        timestamp: new Date(),
        eventType: eventType as any,
        source: { agentId },
        payload,
      },
      { source: agentId, priority: 'medium' }
    );
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalLifecycle: AgentLifecycle | null = null;

export function getGlobalLifecycle(
  storage?: AgentStorage,
  messageBus?: MessageBus
): AgentLifecycle {
  if (!globalLifecycle) {
    if (!storage || !messageBus) {
      throw new Error('AgentLifecycle requires dependencies on first initialization');
    }
    globalLifecycle = new AgentLifecycle(storage, messageBus);
  }
  return globalLifecycle;
}

export function resetGlobalLifecycle(): void {
  globalLifecycle = null;
}

export default AgentLifecycle;
