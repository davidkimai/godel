/**
 * Agent State Machine
 *
 * Comprehensive state management for agent lifecycle with transitions, guards,
 * persistence, and integration with the federation registry.
 *
 * @module loop/state-machine
 */

import { EventEmitter } from 'events';
import { AgentRegistry, RegisteredAgent, AgentStatus } from '../federation/agent-registry';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Agent lifecycle states
 */
export type AgentState =
  | 'created'      // Initial state
  | 'initializing' // Setting up
  | 'idle'         // Ready for work
  | 'busy'         // Executing task
  | 'paused'       // Temporarily stopped
  | 'error'        // Error state
  | 'stopping'     // Graceful shutdown
  | 'stopped';     // Terminated

/**
 * All valid agent states as an array
 */
export const AGENT_STATES: AgentState[] = [
  'created',
  'initializing',
  'idle',
  'busy',
  'paused',
  'error',
  'stopping',
  'stopped',
];

/**
 * Terminal states that cannot transition to other states
 */
export const TERMINAL_STATES: AgentState[] = ['stopped'];

/**
 * Task type (minimal definition for state machine)
 */
export interface Task {
  id: string;
  prompt: string;
  weight?: number;
}

/**
 * Task with checkpoint information for pause/resume
 */
export interface TaskWithCheckpointInfo extends Task {
  /** Whether task can be checkpointed for pausing */
  checkpointable?: boolean;
  /** Whether task can save progress for graceful stop */
  canSaveProgress?: boolean;
  /** Current progress (0-1) */
  progress?: number;
}

/**
 * Context provided during state transitions
 */
export interface AgentContext {
  /** Agent identifier */
  agentId: string;
  /** Current task being executed (if any) */
  task?: TaskWithCheckpointInfo;
  /** Pending tasks queue */
  pendingTasks?: Task[];
  /** Current load factor (0-1) */
  load: number;
  /** Whether agent has errors */
  hasErrors: boolean;
  /** Number of consecutive errors */
  errorCount: number;
  /** Last error encountered */
  lastError?: Error;
  /** Load balancer for notifications */
  loadBalancer?: LoadBalancerContext;
  /** State storage for persistence */
  storage?: StateStorage;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Load balancer context for notifications
 */
export interface LoadBalancerContext {
  recordSuccess(agentId: string): void;
  recordFailure(agentId: string): void;
  getLoad(agentId: string): number;
}

/**
 * Single state transition definition
 */
export interface StateTransition {
  /** Source state */
  from: AgentState;
  /** Target state */
  to: AgentState;
  /** Optional guard function - returns true if transition is allowed */
  guard?: (context: AgentContext) => boolean | Promise<boolean>;
  /** Optional action to execute during transition */
  action?: (context: AgentContext) => void | Promise<void>;
  /** Optional error handler if action fails */
  onError?: (context: AgentContext, error: Error) => void;
}

/**
 * State history entry for tracking transitions
 */
export interface StateEntry {
  /** Previous state */
  from: AgentState;
  /** New state */
  to: AgentState;
  /** Timestamp of transition */
  timestamp: number;
  /** Duration in previous state (ms) */
  duration: number;
  /** Optional transition reason */
  reason?: string;
  /** Metadata about the transition */
  metadata?: Record<string, unknown>;
}

/**
 * Saved state for persistence
 */
export interface SavedState {
  /** Current state */
  state: AgentState;
  /** State transition history */
  history: StateEntry[];
  /** Last update timestamp */
  lastUpdated: number;
  /** Agent context snapshot */
  contextSnapshot?: Partial<AgentContext>;
}

/**
 * Storage interface for state persistence
 */
export interface StateStorage {
  /** Retrieve saved state for an agent */
  get(agentId: string): Promise<SavedState | null>;
  /** Save state for an agent */
  save(agentId: string, state: SavedState): Promise<void>;
  /** Delete saved state for an agent */
  delete(agentId: string): Promise<void>;
  /** List all persisted agent states */
  list(): Promise<string[]>;
}

/**
 * State machine events
 */
export interface StateMachineEvents {
  /** Emitted before a transition */
  'transition:before': (event: { from: AgentState; to: AgentState; agentId: string }) => void;
  /** Emitted after a successful transition */
  'transition:after': (event: { from: AgentState; to: AgentState; agentId: string }) => void;
  /** Emitted when a transition is denied by guard */
  'transition:denied': (event: { from: AgentState; to: AgentState; agentId: string }) => void;
  /** Emitted when a transition fails with error */
  'transition:error': (event: { from: AgentState; to: AgentState; error: Error; agentId: string }) => void;
  /** Emitted when entering a specific state */
  'state:created': (event: { previous: AgentState | null; agentId: string }) => void;
  'state:initializing': (event: { previous: AgentState; agentId: string }) => void;
  'state:idle': (event: { previous: AgentState; agentId: string }) => void;
  'state:busy': (event: { previous: AgentState; agentId: string }) => void;
  'state:paused': (event: { previous: AgentState; agentId: string }) => void;
  'state:error': (event: { previous: AgentState; agentId: string }) => void;
  'state:stopping': (event: { previous: AgentState; agentId: string }) => void;
  'state:stopped': (event: { previous: AgentState; agentId: string }) => void;
  /** Emitted when state is persisted */
  'state:persisted': (event: { agentId: string; state: SavedState }) => void;
  /** Emitted when state is loaded from storage */
  'state:loaded': (event: { agentId: string; state: SavedState }) => void;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when attempting an invalid state transition
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: AgentState,
    public readonly to: AgentState
  ) {
    super(`Invalid state transition from '${from}' to '${to}'`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Error thrown when a guard condition fails
 */
export class GuardConditionError extends Error {
  constructor(
    public readonly from: AgentState,
    public readonly to: AgentState,
    public readonly reason: string
  ) {
    super(`Guard condition failed for transition from '${from}' to '${to}': ${reason}`);
    this.name = 'GuardConditionError';
  }
}

/**
 * Error thrown when state persistence fails
 */
export class StatePersistenceError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StatePersistenceError';
  }
}

// ============================================================================
// Guard Functions
// ============================================================================

/**
 * Check if agent can accept new work
 */
export function canAcceptWork(context: AgentContext): boolean {
  return context.load < 1 && !context.hasErrors;
}

/**
 * Check if busy agent can be paused
 */
export function canPause(context: AgentContext): boolean {
  // Can pause if work is checkpointable
  return context.task?.checkpointable ?? false;
}

/**
 * Check if agent has pending work to resume
 */
export function hasPendingWork(context: AgentContext): boolean {
  return (context.pendingTasks?.length || 0) > 0;
}

/**
 * Check if agent can gracefully stop from busy state
 */
export function canGracefullyStop(context: AgentContext): boolean {
  return context.task?.canSaveProgress ?? false;
}

/**
 * Check if agent can recover from error state
 */
export function canRecover(context: AgentContext): boolean {
  return context.errorCount < 3;
}

/**
 * Notify load balancer of work completion
 */
export function notifyWorkComplete(context: AgentContext): void {
  if (context.loadBalancer) {
    context.loadBalancer.recordSuccess(context.agentId);
  }
}

/**
 * Handle work errors - increment error count and store error
 */
export function handleWorkError(context: AgentContext, error: Error): void {
  context.errorCount = (context.errorCount || 0) + 1;
  context.lastError = error;
  context.hasErrors = true;
}

// ============================================================================
// Default Transitions
// ============================================================================

/**
 * Default allowed transitions with guards and actions
 */
export const ALLOWED_TRANSITIONS: StateTransition[] = [
  // Lifecycle
  { from: 'created', to: 'initializing' },
  { from: 'initializing', to: 'idle' },
  { from: 'initializing', to: 'error' },

  // Work
  { from: 'idle', to: 'busy', guard: canAcceptWork },
  { from: 'busy', to: 'idle', action: notifyWorkComplete },
  { from: 'busy', to: 'error', onError: handleWorkError },

  // Pause/Resume
  { from: 'idle', to: 'paused' },
  { from: 'busy', to: 'paused', guard: canPause },
  { from: 'paused', to: 'idle' },
  { from: 'paused', to: 'busy', guard: hasPendingWork },

  // Shutdown
  { from: 'idle', to: 'stopping' },
  { from: 'paused', to: 'stopping' },
  { from: 'busy', to: 'stopping', guard: canGracefullyStop },
  { from: 'stopping', to: 'stopped' },
  { from: 'error', to: 'stopping' },

  // Recovery
  { from: 'error', to: 'initializing', guard: canRecover },
];

// ============================================================================
// Agent State Machine
// ============================================================================

/**
 * Core state machine for agent lifecycle management
 *
 * Manages state transitions with guards, actions, and event emission.
 * Tracks state history and provides query methods for current state.
 *
 * @example
 * ```typescript
 * const sm = new AgentStateMachine('agent-1');
 *
 * // Lifecycle transitions
 * await sm.transition('initializing');
 * await sm.transition('idle');
 *
 * // Check allowed transitions
 * const allowed = sm.getAllowedTransitions(); // ['busy', 'paused', 'stopping']
 *
 * // Listen to state changes
 * sm.on('state:idle', ({ previous }) => {
 *   console.log(`Agent became idle from ${previous}`);
 * });
 * ```
 */
export class AgentStateMachine extends EventEmitter {
  private currentState: AgentState = 'created';
  private stateHistory: StateEntry[] = [];
  private pendingTransitions: Map<string, StateTransition> = new Map();
  private context: AgentContext;

  /**
   * Create a new AgentStateMachine
   *
   * @param agentId - Unique agent identifier
   * @param transitions - Custom state transitions (defaults to ALLOWED_TRANSITIONS)
   * @param initialContext - Initial agent context
   */
  constructor(
    protected readonly agentId: string,
    private readonly transitions: StateTransition[] = ALLOWED_TRANSITIONS,
    initialContext?: Partial<AgentContext>
  ) {
    super();
    this.context = {
      agentId,
      load: 0,
      hasErrors: false,
      errorCount: 0,
      ...initialContext,
    } as AgentContext;
  }

  /**
   * Get current state
   */
  get state(): AgentState {
    return this.currentState;
  }

  /**
   * Get state transition history
   */
  get history(): StateEntry[] {
    return [...this.stateHistory];
  }

  /**
   * Get agent context
   */
  getContext(): AgentContext {
    return { ...this.context };
  }

  /**
   * Update agent context
   */
  updateContext(updates: Partial<AgentContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Set the current task
   */
  setTask(task: TaskWithCheckpointInfo | undefined): void {
    this.context.task = task;
  }

  /**
   * Set pending tasks
   */
  setPendingTasks(tasks: Task[]): void {
    this.context.pendingTasks = tasks;
  }

  /**
   * Set load balancer context
   */
  setLoadBalancer(loadBalancer: LoadBalancerContext): void {
    this.context.loadBalancer = loadBalancer;
  }

  /**
   * Perform a state transition
   *
   * @param to - Target state
   * @param reason - Optional reason for the transition
   * @returns true if transition succeeded, false if denied by guard
   * @throws InvalidTransitionError if transition is not defined
   * @throws Error if action fails
   */
  async transition(to: AgentState, reason?: string): Promise<boolean> {
    const from = this.currentState;

    // Check for terminal state
    if (TERMINAL_STATES.includes(from)) {
      throw new InvalidTransitionError(from, to);
    }

    // Find transition
    const transition = this.findTransition(from, to);
    if (!transition) {
      throw new InvalidTransitionError(from, to);
    }

    // Check guard
    if (transition.guard) {
      try {
        const canTransition = await transition.guard(this.context);
        if (!canTransition) {
          this.emit('transition:denied', { from, to, agentId: this.agentId });
          return false;
        }
      } catch (error) {
        const guardError = error instanceof Error ? error : new Error(String(error));
        this.emit('transition:error', { from, to, error: guardError, agentId: this.agentId });
        throw new GuardConditionError(from, to, guardError.message);
      }
    }

    // Execute transition
    this.emit('transition:before', { from, to, agentId: this.agentId });

    try {
      // Run action
      if (transition.action) {
        await transition.action(this.context);
      }

      // Update state
      const previousState = this.currentState;
      this.currentState = to;

      // Record history
      const previousEntry = this.stateHistory[this.stateHistory.length - 1];
      const duration = previousEntry
        ? Date.now() - previousEntry.timestamp
        : 0;

      this.stateHistory.push({
        from: previousState,
        to,
        timestamp: Date.now(),
        duration,
        reason,
      });

      this.emit('transition:after', { from, to, agentId: this.agentId });
      this.emit(`state:${to}`, { previous: previousState, agentId: this.agentId });

      return true;
    } catch (error) {
      const transitionError = error instanceof Error ? error : new Error(String(error));

      if (transition.onError) {
        transition.onError(this.context, transitionError);
      }

      this.emit('transition:error', { from, to, error: transitionError, agentId: this.agentId });
      throw transitionError;
    }
  }

  /**
   * Find a transition definition
   */
  private findTransition(from: AgentState, to: AgentState): StateTransition | undefined {
    return this.transitions.find(t => t.from === from && t.to === to);
  }

  /**
   * Check if a transition to the target state is possible
   */
  canTransition(to: AgentState): boolean {
    // Can't transition from terminal states
    if (TERMINAL_STATES.includes(this.currentState)) {
      return false;
    }
    return !!this.findTransition(this.currentState, to);
  }

  /**
   * Get all allowed transitions from current state
   */
  getAllowedTransitions(): AgentState[] {
    // Can't transition from terminal states
    if (TERMINAL_STATES.includes(this.currentState)) {
      return [];
    }

    return this.transitions
      .filter(t => t.from === this.currentState)
      .map(t => t.to);
  }

  /**
   * Check if the state machine is in a terminal state
   */
  isTerminal(): boolean {
    return TERMINAL_STATES.includes(this.currentState);
  }

  /**
   * Get time spent in current state (ms)
   */
  getTimeInCurrentState(): number {
    const lastEntry = this.stateHistory[this.stateHistory.length - 1];
    if (!lastEntry) {
      return Date.now(); // Since creation
    }
    return Date.now() - lastEntry.timestamp;
  }

  /**
   * Get total runtime from state history (ms)
   */
  getTotalRuntime(): number {
    return this.stateHistory.reduce((total, entry) => total + entry.duration, 0);
  }

  /**
   * Get state statistics
   */
  getStats(): {
    totalTransitions: number;
    timeInCurrentState: number;
    totalRuntime: number;
    mostVisitedState: AgentState | null;
    stateCounts: Record<AgentState, number>;
  } {
    const stateCounts: Record<string, number> = {};
    for (const entry of this.stateHistory) {
      stateCounts[entry.to] = (stateCounts[entry.to] || 0) + 1;
    }

    let mostVisitedState: AgentState | null = null;
    let maxCount = 0;
    for (const [state, count] of Object.entries(stateCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostVisitedState = state as AgentState;
      }
    }

    return {
      totalTransitions: this.stateHistory.length,
      timeInCurrentState: this.getTimeInCurrentState(),
      totalRuntime: this.getTotalRuntime(),
      mostVisitedState,
      stateCounts: stateCounts as Record<AgentState, number>,
    };
  }

  /**
   * Reset state machine (for testing)
   */
  reset(): void {
    this.currentState = 'created';
    this.stateHistory = [];
    this.context = {
      agentId: this.agentId,
      load: 0,
      hasErrors: false,
      errorCount: 0,
    } as AgentContext;
  }
}

// ============================================================================
// Persistent State Machine
// ============================================================================

/**
 * State machine with persistent storage capabilities
 *
 * Automatically saves state to storage after each transition and
 * loads state on initialization.
 *
 * @example
 * ```typescript
 * const storage = new FileStateStorage('./states');
 * const sm = new PersistentStateMachine('agent-1', storage);
 *
 * // State is automatically persisted
 * await sm.transition('initializing');
 * await sm.transition('idle');
 *
 * // Create new instance - loads saved state
 * const sm2 = new PersistentStateMachine('agent-1', storage);
 * console.log(sm2.state); // 'idle'
 * ```
 */
export class PersistentStateMachine extends AgentStateMachine {
  private saveTimeout: NodeJS.Timeout | null = null;
  private readonly saveDebounceMs: number;

  /**
   * Create a new PersistentStateMachine
   *
   * @param agentId - Unique agent identifier
   * @param storage - State storage implementation
   * @param transitions - Custom state transitions
   * @param options - Configuration options
   */
  constructor(
    agentId: string,
    private readonly storage: StateStorage,
    transitions?: StateTransition[],
    options?: {
      saveDebounceMs?: number;
      autoLoad?: boolean;
    }
  ) {
    super(agentId, transitions);
    this.saveDebounceMs = options?.saveDebounceMs ?? 100;

    if (options?.autoLoad !== false) {
      this.loadState();
    }
  }

  /**
   * Load state from storage
   */
  private async loadState(): Promise<void> {
    try {
      const saved = await this.storage.get(this.agentId);
      if (saved) {
        // Only load if not in terminal state
        if (!TERMINAL_STATES.includes(saved.state)) {
          this.updateStateFromSaved(saved);
          this.emit('state:loaded', { agentId: this.agentId, state: saved });
        }
      }
    } catch (error) {
      this.emit('error', new StatePersistenceError('Failed to load state', error as Error));
    }
  }

  /**
   * Update internal state from saved state
   */
  private updateStateFromSaved(saved: SavedState): void {
    // Use protected access pattern through method
    (this as unknown as { stateHistory: StateEntry[] }).stateHistory = saved.history;

    // For current state, we need to transition properly
    const targetState = saved.state;
    if (targetState !== 'created') {
      // Directly set state without transition for loading
      (this as unknown as { currentState: AgentState }).currentState = targetState;
    }

    // Restore context snapshot if available
    if (saved.contextSnapshot) {
      this.updateContext(saved.contextSnapshot);
    }
  }

  /**
   * Perform state transition with persistence
   */
  async transition(to: AgentState, reason?: string): Promise<boolean> {
    const result = await super.transition(to, reason);

    if (result) {
      // Don't await - let persistence happen in background
      this.persistState().catch(() => {});
    }

    return result;
  }

  /**
   * Persist current state to storage
   */
  private async persistState(): Promise<void> {
    // Debounce saves
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    return new Promise((resolve, reject) => {
      this.saveTimeout = setTimeout(async () => {
        try {
          const savedState: SavedState = {
            state: this.state,
            history: this.history,
            lastUpdated: Date.now(),
            contextSnapshot: {
              load: this.getContext().load,
              hasErrors: this.getContext().hasErrors,
              errorCount: this.getContext().errorCount,
            },
          };

          await this.storage.save(this.agentId, savedState);
          this.emit('state:persisted', { agentId: this.agentId, state: savedState });
          resolve();
        } catch (error) {
          const persistenceError = new StatePersistenceError(
            'Failed to persist state',
            error as Error
          );
          this.emit('error', persistenceError);
          reject(persistenceError);
        }
      }, this.saveDebounceMs);
    });
  }

  /**
   * Force immediate state save
   */
  async saveNow(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    const savedState: SavedState = {
      state: this.state,
      history: this.history,
      lastUpdated: Date.now(),
      contextSnapshot: {
        load: this.getContext().load,
        hasErrors: this.getContext().hasErrors,
        errorCount: this.getContext().errorCount,
      },
    };

    await this.storage.save(this.agentId, savedState);
    this.emit('state:persisted', { agentId: this.agentId, state: savedState });
  }

  /**
   * Delete persisted state
   */
  async deletePersistedState(): Promise<void> {
    await this.storage.delete(this.agentId);
  }
}

// ============================================================================
// In-Memory State Storage (for testing)
// ============================================================================

/**
 * Simple in-memory state storage implementation
 */
export class InMemoryStateStorage implements StateStorage {
  private states: Map<string, SavedState> = new Map();

  async get(agentId: string): Promise<SavedState | null> {
    return this.states.get(agentId) || null;
  }

  async save(agentId: string, state: SavedState): Promise<void> {
    this.states.set(agentId, state);
  }

  async delete(agentId: string): Promise<void> {
    this.states.delete(agentId);
  }

  async list(): Promise<string[]> {
    return Array.from(this.states.keys());
  }

  /**
   * Clear all stored states (for testing)
   */
  clear(): void {
    this.states.clear();
  }

  /**
   * Get count of stored states
   */
  size(): number {
    return this.states.size;
  }
}

// ============================================================================
// Stateful Agent Registry
// ============================================================================

/**
 * Extended AgentRegistry with state machine management
 *
 * Integrates the federation's AgentRegistry with state machines
 * for full lifecycle management of agents.
 *
 * @example
 * ```typescript
 * const registry = new StatefulAgentRegistry(storage);
 *
 * // Register agent - automatically creates state machine
 * await registry.register({
 *   id: 'agent-1',
 *   runtime: 'pi',
 *   capabilities: { ... }
 * });
 *
 * // Assign work - handles state transitions
 * const assigned = await registry.assignWork('agent-1', task);
 *
 * // Pause/resume agents
 * await registry.pauseAgent('agent-1');
 * await registry.resumeAgent('agent-1');
 *
 * // Stop agents gracefully
 * await registry.stopAgent('agent-1');
 * ```
 */
export class StatefulAgentRegistry extends AgentRegistry {
  private stateMachines: Map<string, PersistentStateMachine> = new Map();
  private agentStates: Map<string, RegisteredAgent> = new Map();

  /**
   * Create a new StatefulAgentRegistry
   *
   * @param stateStorage - Storage for persisting agent states
   * @param healthCheckTimeout - Timeout for health checks (ms)
   */
  constructor(
    private readonly stateStorage: StateStorage,
    healthCheckTimeout?: number
  ) {
    super(healthCheckTimeout);
  }

  /**
   * Register a new agent with state machine
   */
  // @ts-expect-error - Override with async behavior
  async register(config: Parameters<AgentRegistry['register']>[0]): Promise<RegisteredAgent> {
    // Register with parent registry
    const agent = super.register(config);
    this.agentStates.set(agent.id, agent);

    // Create state machine for agent
    const sm = new PersistentStateMachine(
      agent.id,
      this.stateStorage,
      ALLOWED_TRANSITIONS,
      { autoLoad: true }
    );

    // Listen to state changes
    this.setupStateListeners(sm, agent.id);

    this.stateMachines.set(agent.id, sm);

    // Start initialization if in created state
    if (sm.state === 'created') {
      await sm.transition('initializing', 'agent_registration');
      await sm.transition('idle', 'initialization_complete');
    }

    return agent;
  }

  /**
   * Set up state change listeners
   */
  private setupStateListeners(sm: PersistentStateMachine, agentId: string): void {
    sm.on('state:idle', () => {
      this.updateAgentStatus(agentId, 'idle');
      this.onAgentIdle(agentId);
    });

    sm.on('state:busy', () => {
      this.updateAgentStatus(agentId, 'busy');
      this.onAgentBusy(agentId);
    });

    sm.on('state:error', ({ previous }) => {
      this.updateAgentStatus(agentId, 'unhealthy');
      this.onAgentError(agentId, previous);
    });

    sm.on('state:paused', () => {
      this.updateAgentStatus(agentId, 'offline');
    });

    sm.on('state:stopped', () => {
      this.updateAgentStatus(agentId, 'offline');
    });

    sm.on('state:stopping', () => {
      this.updateAgentStatus(agentId, 'offline');
    });

    sm.on('state:initializing', () => {
      this.updateAgentStatus(agentId, 'idle');
    });
  }

  /**
   * Update agent status in registry
   */
  private updateAgentStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agentStates.get(agentId);
    if (agent) {
      agent.status = status;
      super.updateStatus(agentId, status);
    }
  }

  /**
   * Assign work to an agent
   *
   * @param agentId - Agent identifier
   * @param task - Task to assign
   * @returns true if work was assigned successfully
   */
  async assignWork(agentId: string, task: Task & Partial<TaskWithCheckpointInfo>): Promise<boolean> {
    const sm = this.stateMachines.get(agentId);
    if (!sm) return false;

    // Check if already busy
    if (sm.state === 'busy') {
      return false;
    }

    // Set task context
    sm.setTask(task as TaskWithCheckpointInfo);

    // Transition to busy
    const success = await sm.transition('busy', 'work_assigned');
    if (success) {
      super.updateLoad(agentId, task.weight || 1);
    }
    return success;
  }

  /**
   * Complete work for an agent
   *
   * @param agentId - Agent identifier
   * @param result - Work result
   */
  async completeWork(agentId: string, result: unknown): Promise<void> {
    const sm = this.stateMachines.get(agentId);
    if (!sm) return;

    // Clear task context
    sm.setTask(undefined);

    await sm.transition('idle', 'work_completed');
    super.updateLoad(agentId, 0);
  }

  /**
   * Mark work as failed for an agent
   *
   * @param agentId - Agent identifier
   * @param error - Error that occurred
   */
  async failWork(agentId: string, error: Error): Promise<void> {
    const sm = this.stateMachines.get(agentId);
    if (!sm) return;

    // Update context with error
    const context = sm.getContext();
    handleWorkError(context, error);
    sm.updateContext(context);

    await sm.transition('error', `work_failed: ${error.message}`);
    super.updateLoad(agentId, 0);
  }

  /**
   * Pause an agent
   *
   * @param agentId - Agent identifier
   * @returns true if agent was paused
   */
  async pauseAgent(agentId: string): Promise<boolean> {
    const sm = this.stateMachines.get(agentId);
    if (!sm) return false;

    return sm.transition('paused', 'manual_pause');
  }

  /**
   * Resume a paused agent
   *
   * @param agentId - Agent identifier
   * @returns true if agent was resumed
   */
  async resumeAgent(agentId: string): Promise<boolean> {
    const sm = this.stateMachines.get(agentId);
    if (!sm) return false;

    // Only resume if currently paused
    if (sm.state !== 'paused') {
      return false;
    }

    return sm.transition('idle', 'manual_resume');
  }

  /**
   * Stop an agent
   *
   * @param agentId - Agent identifier
   * @param force - Force immediate stop without graceful shutdown
   */
  async stopAgent(agentId: string, force = false): Promise<void> {
    const sm = this.stateMachines.get(agentId);
    if (!sm) return;

    const currentState = sm.state;

    if (force) {
      // For force stop, we need to go through stopping first
      if (currentState !== 'stopped') {
        if (sm.canTransition('stopping')) {
          await sm.transition('stopping', 'force_stop');
        }
        if (sm.canTransition('stopped')) {
          await sm.transition('stopped', 'force_stop_complete');
        }
      }
    } else {
      // Attempt graceful shutdown
      if (currentState === 'busy') {
        // Try to transition to stopping
        const canStop = await sm.transition('stopping', 'graceful_stop_initiated');
        if (canStop && sm.canTransition('stopped')) {
          // Wait a bit for graceful shutdown then complete
          await new Promise(resolve => setTimeout(resolve, 100));
          await sm.transition('stopped', 'graceful_stop_complete');
        }
      } else if (currentState === 'stopping') {
        // Already stopping, just complete
        if (sm.canTransition('stopped')) {
          await sm.transition('stopped', 'graceful_stop_complete');
        }
      } else if (sm.canTransition('stopping')) {
        // Go through stopping state first
        await sm.transition('stopping', 'stop');
        if (sm.canTransition('stopped')) {
          await sm.transition('stopped', 'stop_complete');
        }
      } else if (sm.canTransition('stopped')) {
        // Direct to stopped if possible
        await sm.transition('stopped', 'stop');
      }
    }

    // Clean up
    await sm.deletePersistedState();
    this.stateMachines.delete(agentId);
    this.agentStates.delete(agentId);
    super.unregister(agentId);
  }

  /**
   * Attempt to recover an agent from error state
   *
   * @param agentId - Agent identifier
   * @returns true if recovery was initiated
   */
  async recoverAgent(agentId: string): Promise<boolean> {
    const sm = this.stateMachines.get(agentId);
    if (!sm) return false;

    if (sm.state === 'error') {
      return sm.transition('initializing', 'recovery_attempt');
    }

    return false;
  }

  /**
   * Get state machine for an agent
   */
  getStateMachine(agentId: string): PersistentStateMachine | undefined {
    return this.stateMachines.get(agentId);
  }

  /**
   * Get current agent state
   */
  getAgentState(agentId: string): AgentState | undefined {
    return this.stateMachines.get(agentId)?.state;
  }

  /**
   * Get state history for an agent
   */
  getAgentStateHistory(agentId: string): StateEntry[] | undefined {
    return this.stateMachines.get(agentId)?.history;
  }

  /**
   * Get all agents in a specific state
   */
  getAgentsInState(state: AgentState): string[] {
    return Array.from(this.stateMachines.entries())
      .filter(([_, sm]) => sm.state === state)
      .map(([agentId]) => agentId);
  }

  /**
   * Get state statistics for an agent
   */
  getAgentStats(agentId: string): ReturnType<AgentStateMachine['getStats']> | undefined {
    return this.stateMachines.get(agentId)?.getStats();
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): boolean {
    // Stop state machine first
    const sm = this.stateMachines.get(agentId);
    if (sm) {
      sm.deletePersistedState().catch(() => {});
      this.stateMachines.delete(agentId);
    }

    this.agentStates.delete(agentId);
    return super.unregister(agentId);
  }

  /**
   * Handler called when agent becomes idle
   */
  protected onAgentIdle(agentId: string): void {
    this.emit('agent.idle', agentId);
  }

  /**
   * Handler called when agent becomes busy
   */
  protected onAgentBusy(agentId: string): void {
    this.emit('agent.busy', agentId);
  }

  /**
   * Handler called when agent enters error state
   */
  protected onAgentError(agentId: string, previousState: string): void {
    this.emit('agent.error', agentId, previousState);
  }

  /**
   * Get all state machines (for advanced operations)
   */
  protected getAllStateMachines(): Map<string, PersistentStateMachine> {
    return new Map(this.stateMachines);
  }
}
