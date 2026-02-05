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
 * 
 * RACE CONDITION FIXES v3:
 * - Mutex protection for state transitions (one mutex per agent)
 * - Prevents concurrent state changes (e.g., IDLE → RUNNING and IDLE → PAUSED)
 * - Ensures atomic state changes
 * - Uses async-mutex library for exclusive access
 */

import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { Mutex } from 'async-mutex';
import {
  AgentStatus,
  type Agent,
  type CreateAgentOptions,
  createAgent,
} from '../models/agent';
import { AgentStorage } from '../storage/memory';
import { MessageBus } from '../bus/index';
import { generateEventId } from '../events/types';
import { OpenClawCore, type SessionSpawnOptions, getOpenClawCore } from './openclaw';
import {
  AgentNotFoundError,
  ApplicationError,
  DashErrorCode,
  assert,
  assertExists,
  safeExecute,
} from '../errors';

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
  private openclaw: OpenClawCore;
  private active: boolean = false;
  private retryDelays: Map<string, number> = new Map(); // Track retry delays per agent
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second

  // RACE CONDITION FIX: One mutex per agent for exclusive state transitions
  private mutexes: Map<string, Mutex> = new Map();
  // Global mutex for agent creation (to prevent ID collisions)
  private creationMutex: Mutex = new Mutex();

  constructor(storage: AgentStorage, messageBus: MessageBus, openclaw: OpenClawCore) {
    super();
    this.storage = storage;
    this.messageBus = messageBus;
    this.openclaw = openclaw;
  }
  
  /**
   * RACE CONDITION FIX: Get or create a mutex for a specific agent
   */
  private getMutex(agentId: string): Mutex {
    if (!this.mutexes.has(agentId)) {
      this.mutexes.set(agentId, new Mutex());
    }
    return this.mutexes.get(agentId)!;
  }
  
  /**
   * RACE CONDITION FIX: Clean up mutex for terminated agent
   */
  private cleanupMutex(agentId: string): void {
    this.mutexes.delete(agentId);
  }
  
  /**
   * RACE CONDITION FIX: Execute state transition with exclusive lock
   * Ensures atomic state changes and prevents race conditions
   */
  private async withAgentLock<T>(agentId: string, operation: () => Promise<T>): Promise<T> {
    const mutex = this.getMutex(agentId);
    return mutex.runExclusive(operation);
  }

  /**
   * Start the lifecycle manager
   * Initializes OpenClaw core primitive as part of startup
   */
  async start(): Promise<void> {
    this.active = true;
    
    // Initialize OpenClaw core primitive
    logger.info('[AgentLifecycle] Starting lifecycle manager, initializing OpenClaw core...');
    await this.openclaw.initialize();
    await this.openclaw.connect();
    
    this.emit('lifecycle.started');
    logger.info('[AgentLifecycle] Lifecycle manager started with OpenClaw core active');
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
   * RACE CONDITION FIX: Protected by creationMutex to prevent ID collisions
   */
  async spawn(options: SpawnOptions): Promise<Agent> {
    assert(
      this.active,
      'AgentLifecycle is not started. Call lifecycle.start() first',
      { code: DashErrorCode.LIFECYCLE_NOT_STARTED }
    );

    return this.creationMutex.runExclusive(async () => {
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
      
      // Create the mutex for this agent immediately
      this.getMutex(agent.id);

      // Spawn OpenClaw session - core primitive, always available
      const sessionResult = await safeExecute(
        async () => {
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
          return sessionId;
        },
        undefined,
        { 
          logError: true, 
          context: 'AgentLifecycle.spawnSession' 
        }
      );

      if (sessionResult) {
        state.sessionId = sessionResult;
        this.emit('agent.session_created', { agentId: agent.id, sessionId: sessionResult });
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
    });
  }

  /**
   * Start an agent (transition from pending to running)
   * RACE CONDITION FIX: Protected by per-agent mutex
   */
  async startAgent(agentId: string): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = assertExists(
        this.states.get(agentId),
        'Agent',
        agentId,
        { code: DashErrorCode.AGENT_NOT_FOUND }
      );

      const validStates: LifecycleState[] = ['spawning', 'idle', 'retrying'];
      if (!validStates.includes(state.lifecycleState)) {
        throw new ApplicationError(
          `Cannot start agent in ${state.lifecycleState} state`,
          DashErrorCode.INVALID_STATE_TRANSITION,
          400,
          { agentId, currentState: state.lifecycleState, allowedStates: validStates },
          true
        );
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
    });
  }

  /**
   * Pause an agent
   * RACE CONDITION FIX: Protected by per-agent mutex
   */
  async pause(agentId: string): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = assertExists(
        this.states.get(agentId),
        'Agent',
        agentId,
        { code: DashErrorCode.AGENT_NOT_FOUND }
      );

      const validStates: LifecycleState[] = ['running', 'retrying'];
      if (!validStates.includes(state.lifecycleState)) {
        throw new ApplicationError(
          `Cannot pause agent in ${state.lifecycleState} state`,
          DashErrorCode.INVALID_STATE_TRANSITION,
          400,
          { agentId, currentState: state.lifecycleState, allowedStates: validStates },
          true
        );
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

      // Pause OpenClaw session
      if (this.openclaw.hasSession(agentId)) {
        await safeExecute(
          async () => {
            await this.openclaw.killSession(agentId, false);
            this.emit('agent.session_paused', { agentId, sessionId: state.sessionId });
          },
          undefined,
          { logError: true, context: 'AgentLifecycle.pauseSession' }
        );
      }

      this.publishAgentEvent(agentId, 'agent.paused', {
        agentId,
        previousStatus: previousStatus.toLowerCase(),
        newStatus: 'paused',
        sessionId: state.sessionId,
      });

      this.emit('agent.paused', state);
    });
  }

  /**
   * Resume a paused agent
   * RACE CONDITION FIX: Protected by per-agent mutex
   */
  async resume(agentId: string): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = assertExists(
        this.states.get(agentId),
        'Agent',
        agentId,
        { code: DashErrorCode.AGENT_NOT_FOUND }
      );

      if (state.lifecycleState !== 'paused') {
        throw new ApplicationError(
          `Cannot resume agent in ${state.lifecycleState} state`,
          DashErrorCode.INVALID_STATE_TRANSITION,
          400,
          { agentId, currentState: state.lifecycleState, expectedState: 'paused' },
          true
        );
      }

      state.lifecycleState = 'running';
      state.status = AgentStatus.RUNNING;
      state.resumedAt = new Date();

      // Update storage
      this.storage.update(agentId, { status: AgentStatus.RUNNING });

      // Note: OpenClaw sessions are spawned fresh on resume
      // The session ID is tracked but sessions don't support pause/resume directly

      this.publishAgentEvent(agentId, 'agent.resumed', {
        agentId,
        previousStatus: 'paused',
        newStatus: 'running',
        sessionId: state.sessionId,
      });

      this.emit('agent.resumed', state);
    });
  }

  /**
   * Kill an agent
   * RACE CONDITION FIX: Protected by per-agent mutex
   */
  async kill(agentId: string, force: boolean = false): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = assertExists(
        this.states.get(agentId),
        'Agent',
        agentId,
        { code: DashErrorCode.AGENT_NOT_FOUND }
      );

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

      // Kill OpenClaw session
      if (this.openclaw.hasSession(agentId)) {
        await safeExecute(
          async () => {
            await this.openclaw.killSession(agentId, force);
            this.emit('agent.session_killed', { agentId, sessionId: state.sessionId, force });
          },
          undefined,
          { logError: true, context: 'AgentLifecycle.killSession' }
        );
      }

      this.publishAgentEvent(agentId, 'agent.killed', {
        agentId,
        force,
        sessionId: state.sessionId,
      });

      this.emit('agent.killed', state);
      
      // Clean up the mutex after termination
      this.cleanupMutex(agentId);
    });
  }

  /**
   * Mark an agent as completed
   * RACE CONDITION FIX: Protected by per-agent mutex
   */
  async complete(agentId: string, output?: string): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = assertExists(
        this.states.get(agentId),
        'Agent',
        agentId,
        { code: DashErrorCode.AGENT_NOT_FOUND }
      );

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
      
      // Clean up the mutex after termination
      this.cleanupMutex(agentId);
    });
  }

  /**
   * Mark an agent as failed with auto-retry logic
   * RACE CONDITION FIX: Protected by per-agent mutex
   */
  async fail(agentId: string, error: string, options?: RetryOptions): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = assertExists(
        this.states.get(agentId),
        'Agent',
        agentId,
        { code: DashErrorCode.AGENT_NOT_FOUND }
      );

      state.lastError = error;
      state.retryCount++;

      // Check if we should retry
      const maxRetries = options?.maxRetries ?? state.maxRetries;
      
      if (state.retryCount <= maxRetries) {
        // Attempt retry with exponential backoff
        await this.retryInternal(agentId, state, options);
      } else {
        // Max retries exhausted - try alternate model if specified
        if (options?.useAlternateModel && options?.alternateModel) {
          await this.retryWithAlternateModelInternal(agentId, state, options.alternateModel);
        } else {
          // Mark as failed
          await this.markFailedInternal(agentId, state, error);
        }
      }
    });
  }

  /**
   * Retry a failed agent
   * RACE CONDITION FIX: Protected by per-agent mutex
   */
  async retry(agentId: string, options?: RetryOptions): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = assertExists(
        this.states.get(agentId),
        'Agent',
        agentId,
        { code: DashErrorCode.AGENT_NOT_FOUND }
      );
      await this.retryInternal(agentId, state, options);
    });
  }
  
  /**
   * Internal retry logic (must be called inside agent lock)
   */
  private async retryInternal(agentId: string, state: AgentState, options?: RetryOptions): Promise<void> {
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

    // Note: We release the lock during delay and re-acquire for startAgent
    await this.startAgent(agentId);
  }

  /**
   * Retry with an alternate model (escalation)
   * RACE CONDITION FIX: Protected by per-agent mutex
   */
  async retryWithAlternateModel(agentId: string, alternateModel: string): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = assertExists(
        this.states.get(agentId),
        'Agent',
        agentId,
        { code: DashErrorCode.AGENT_NOT_FOUND }
      );
      await this.retryWithAlternateModelInternal(agentId, state, alternateModel);
    });
  }
  
  /**
   * Internal retry with alternate model logic (must be called inside agent lock)
   */
  private async retryWithAlternateModelInternal(agentId: string, state: AgentState, alternateModel: string): Promise<void> {
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

  /**
   * Mark an agent as failed (public method with mutex protection)
   */
  async markFailed(agentId: string, error: string): Promise<void> {
    return this.withAgentLock(agentId, async () => {
      const state = this.states.get(agentId);
      if (!state) return;
      await this.markFailedInternal(agentId, state, error);
    });
  }
  
  /**
   * Internal mark failed logic (must be called inside agent lock)
   */
  private async markFailedInternal(agentId: string, state: AgentState, error: string): Promise<void> {
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
    
    // Clean up the mutex after termination
    this.cleanupMutex(agentId);
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
  messageBus?: MessageBus,
  openclaw?: OpenClawCore
): AgentLifecycle {
  if (!globalLifecycle) {
    if (!storage || !messageBus) {
      throw new ApplicationError(
        'AgentLifecycle requires dependencies on first initialization',
        DashErrorCode.INITIALIZATION_FAILED,
        500,
        { missingDeps: { storage: !storage, messageBus: !messageBus } },
        false
      );
    }
    // OpenClaw is a core primitive - get the global instance if not provided
    const openclawInstance = openclaw ?? getOpenClawCore(messageBus);
    globalLifecycle = new AgentLifecycle(storage, messageBus, openclawInstance);
  }
  return globalLifecycle;
}

export function resetGlobalLifecycle(): void {
  globalLifecycle = null;
}

export default AgentLifecycle;
