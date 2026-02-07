/**
 * Pi Session Manager
 *
 * Manages the full lifecycle of Pi sessions with persistence and recovery.
 * Provides session creation, pausing, resuming, termination, checkpointing,
 * and migration capabilities with a state machine-driven architecture.
 *
 * @example
 * ```typescript
 * const sessionManager = new PiSessionManager({
 *   registry: piRegistry,
 *   storage: new PostgreSQLStorageAdapter(),
 * });
 *
 * // Create a new session
 * const session = await sessionManager.create({
 *   agentId: 'agent-123',
 *   piConfig: { provider: 'anthropic', model: 'claude-sonnet-4-5' }
 * });
 *
 * // Create checkpoint
 * await sessionManager.checkpoint(session.id, 'manual');
 *
 * // Restore from checkpoint
 * const restored = await sessionManager.restore(checkpointId);
 * ```
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import {
  // Core types
  PiSession,
  SessionState,
  SessionConfig,
  ConversationNode,
  ToolCall,
  ToolResult,
  ToolCallState,
  Checkpoint,
  CheckpointTrigger,
  SerializedConversationNode,
  SerializedToolState,
  SessionFilter,
  TerminateOptions,
  SessionManagerDeps,

  // Registry types
  PiInstance,
  SelectionCriteria,
  StorageAdapter,
  StateSynchronizer,
  PiRegistryInterface,
  ModelRouterInterface,

  // Errors
  SessionManagerError,
  SessionNotFoundError,
  InvalidStateTransitionError,
  CheckpointError,
  MigrationError,

  // Defaults
  DEFAULT_SESSION_PERSISTENCE,
} from './types';

// ============================================================================
// State Machine Definition
// ============================================================================

/**
 * Valid state transitions for the session state machine.
 * Maps current state to allowed next states.
 */
const VALID_STATE_TRANSITIONS: Record<SessionState, SessionState[]> = {
  creating: ['active', 'failed'],
  active: ['paused', 'terminating', 'failed'],
  paused: ['resuming', 'terminating', 'failed'],
  resuming: ['active', 'failed'],
  terminating: ['terminated', 'failed'],
  terminated: [], // Terminal state
  failed: [],     // Terminal state
};

/**
 * Check if a state transition is valid.
 *
 * @param currentState - Current session state
 * @param nextState - Desired next state
 * @returns True if the transition is valid
 */
function isValidStateTransition(currentState: SessionState, nextState: SessionState): boolean {
  if (currentState === nextState) return true;
  return VALID_STATE_TRANSITIONS[currentState]?.includes(nextState) || false;
}

// ============================================================================
// PiSessionManager Class
// ============================================================================

/**
 * Manages Pi session lifecycles with state machine validation, persistence,
 * checkpointing, and migration capabilities.
 *
 * The session manager provides:
 * - State machine-driven session lifecycle
 * - Automatic and manual checkpointing
 * - Session persistence to Redis (hot) and PostgreSQL (cold)
 * - Session migration between Pi instances
 * - Recovery from checkpoints
 * - Auto-checkpointing based on message count
 *
 * Events emitted:
 * - 'session.created' - When a new session is created (payload: PiSession)
 * - 'session.initialized' - When session is initialized (payload: PiSession)
 * - 'session.paused' - When session is paused (payload: sessionId)
 * - 'session.resumed' - When session is resumed (payload: PiSession)
 * - 'session.checkpointed' - When checkpoint is created (payload: sessionId, Checkpoint)
 * - 'session.migrated' - When session migrates (payload: sessionId, fromInstance, toInstance)
 * - 'session.terminated' - When session terminates (payload: sessionId, reason)
 * - 'session.failed' - When session fails (payload: sessionId, error)
 * - 'session.state_changed' - On any state transition (payload: sessionId, previousState, newState)
 */
export class PiSessionManager extends EventEmitter {
  /** Pi registry for instance management */
  private registry: PiRegistryInterface;

  /** Model router for instance selection */
  private router?: ModelRouterInterface;

  /** State synchronizer for distributed state */
  private stateSync?: StateSynchronizer;

  /** Storage adapter for persistence */
  private storage: StorageAdapter;

  /** In-memory session storage */
  private sessions: Map<string, PiSession> = new Map();

  /** Checkpoint storage by session ID */
  private checkpoints: Map<string, Checkpoint[]> = new Map();

  /** Auto-checkpoint intervals by session ID */
  private autoCheckpointIntervals: Map<string, NodeJS.Timeout> = new Map();

  /** Last checkpoint time by session ID */
  private lastCheckpointTime: Map<string, number> = new Map();

  /** Minimum time between checkpoints (ms) */
  private readonly MIN_CHECKPOINT_INTERVAL_MS = 5000;

  /**
   * Creates a new PiSessionManager instance.
   *
   * @param deps - Session manager dependencies including registry, storage, and optional router/stateSync
   */
  constructor(deps: SessionManagerDeps) {
    super();
    this.registry = deps.registry;
    this.router = deps.router;
    this.stateSync = deps.stateSync;
    this.storage = deps.storage;

    logger.info('[PiSessionManager] Initialized with registry and storage');
  }

  // ============================================================================
  // Session Lifecycle Methods
  // ============================================================================

  /**
   * Creates a new Pi session.
   *
   * Selects an appropriate Pi instance, initializes the session,
   * and sets up auto-checkpointing if configured.
   *
   * @param config - Session configuration
   * @returns The created PiSession
   * @throws {SessionManagerError} If no instance is available or initialization fails
   *
   * @example
   * ```typescript
   * const session = await sessionManager.create({
   *   agentId: 'agent-123',
   *   piConfig: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
   *   persistence: { autoCheckpoint: true, checkpointInterval: 10 }
   * });
   * ```
   */
  async create(config: SessionConfig): Promise<PiSession> {
    const sessionId = this.generateSessionId();
    const now = new Date();

    logger.info('[PiSessionManager] Creating session', { sessionId, agentId: config.agentId });

    // Select appropriate Pi instance
    const instance = this.selectInstanceForSession(config);
    if (!instance) {
      throw new SessionManagerError(
        'No available Pi instance for session',
        'NO_INSTANCE_AVAILABLE',
        { config }
      );
    }

    // Create session object
    const session: PiSession = {
      id: sessionId,
      agentId: config.agentId,
      state: 'creating',
      instanceId: instance.id,
      config: this.normalizeConfig(config),
      toolState: {
        pending: new Map(),
        completed: new Map(),
      },
      messageCount: 0,
      checkpointCount: 0,
      createdAt: now,
      lastActivityAt: now,
      metadata: {},
    };

    // Store session
    this.sessions.set(sessionId, session);
    this.checkpoints.set(sessionId, []);

    // Emit creation event
    this.emit('session.created', session);

    try {
      // Initialize session on Pi instance
      await this.initializeSession(session);

      // Transition to active state
      await this.transitionState(sessionId, 'active');

      // Setup auto-checkpointing if enabled
      if (session.config.persistence?.autoCheckpoint) {
        this.startAutoCheckpoint(sessionId);
      }

      logger.info('[PiSessionManager] Session created and active', { sessionId, instanceId: instance.id });

      return session;
    } catch (error) {
      // Mark as failed and cleanup
      session.state = 'failed';
      this.emit('session.failed', sessionId, error instanceof Error ? error : new Error(String(error)));

      throw new SessionManagerError(
        `Failed to initialize session: ${error instanceof Error ? error.message : String(error)}`,
        'SESSION_INIT_FAILED',
        { sessionId, error }
      );
    }
  }

  /**
   * Pauses an active session.
   *
   * Creates a checkpoint before pausing and stops auto-checkpointing.
   * The session can be resumed later with resume().
   *
   * @param sessionId - ID of the session to pause
   * @throws {SessionNotFoundError} If the session doesn't exist
   * @throws {InvalidStateTransitionError} If the session is not in 'active' state
   *
   * @example
   * ```typescript
   * await sessionManager.pause('session-123');
   * ```
   */
  async pause(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);

    logger.info('[PiSessionManager] Pausing session', { sessionId });

    // Validate state transition
    if (!isValidStateTransition(session.state, 'paused')) {
      throw new InvalidStateTransitionError(sessionId, session.state, 'paused');
    }

    // Create checkpoint before pausing
    try {
      await this.checkpoint(sessionId, 'state_change');
    } catch (error) {
      logger.warn('[PiSessionManager] Failed to create pre-pause checkpoint', { sessionId, error: error instanceof Error ? error.message : String(error) });
    }

    // Stop auto-checkpointing
    this.stopAutoCheckpoint(sessionId);

    // Transition state
    await this.transitionState(sessionId, 'paused');

    // Save session state to storage
    await this.saveSessionState(session);

    this.emit('session.paused', sessionId);
    logger.info('[PiSessionManager] Session paused', { sessionId });
  }

  /**
   * Resumes a paused session.
   *
   * Finds or selects a Pi instance, restores the session state,
   * and restarts auto-checkpointing if configured.
   *
   * @param sessionId - ID of the session to resume
   * @returns The resumed PiSession
   * @throws {SessionNotFoundError} If the session doesn't exist
   * @throws {InvalidStateTransitionError} If the session is not in 'paused' state
   *
   * @example
   * ```typescript
   * const session = await sessionManager.resume('session-123');
   * ```
   */
  async resume(sessionId: string): Promise<PiSession> {
    const session = this.getSessionOrThrow(sessionId);

    logger.info('[PiSessionManager] Resuming session', { sessionId });

    // Validate state transition
    if (!isValidStateTransition(session.state, 'resuming')) {
      throw new InvalidStateTransitionError(sessionId, session.state, 'resuming');
    }

    // Transition to resuming
    await this.transitionState(sessionId, 'resuming');

    try {
      // Check if original instance is still available
      const instance = this.registry.getInstance(session.instanceId);

      if (!instance || instance.health === 'unhealthy') {
        // Need to migrate to a new instance
        logger.warn('[PiSessionManager] Original instance unavailable, migrating session', { instanceId: session.instanceId, sessionId });

        const newInstance = this.selectInstanceForSession(session.config);
        if (!newInstance) {
          throw new SessionManagerError(
            'No available instance for session resumption',
            'NO_INSTANCE_AVAILABLE',
            { sessionId }
          );
        }

        await this.migrate(sessionId, newInstance.id);
      } else {
        // Restore session on existing instance
        await this.restoreSessionOnInstance(session, instance);
      }

      // Transition to active
      await this.transitionState(sessionId, 'active');

      // Restart auto-checkpointing
      if (session.config.persistence?.autoCheckpoint) {
        this.startAutoCheckpoint(sessionId);
      }

      this.emit('session.resumed', session);
      logger.info('[PiSessionManager] Session resumed', { sessionId });

      return session;
    } catch (error) {
      session.state = 'failed';
      this.emit('session.failed', sessionId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Terminates a session.
   *
   * Optionally creates a final checkpoint before termination.
   * Cleans up all resources and stops auto-checkpointing.
   *
   * @param sessionId - ID of the session to terminate
   * @param options - Termination options
   * @throws {SessionNotFoundError} If the session doesn't exist
   *
   * @example
   * ```typescript
   * // Normal termination with checkpoint
   * await sessionManager.terminate('session-123', { createCheckpoint: true });
   *
   * // Force termination without checkpoint
   * await sessionManager.terminate('session-123', { force: true });
   * ```
   */
  async terminate(sessionId: string, options: TerminateOptions = {}): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn('[PiSessionManager] Attempted to terminate unknown session', { sessionId });
      return;
    }

    logger.info('[PiSessionManager] Terminating session', { sessionId, force: options.force });

    // Check if we can terminate
    if (!options.force && session.state === 'active') {
      // Transition through terminating state
      await this.transitionState(sessionId, 'terminating');
    }

    // Create final checkpoint if requested
    if (options.createCheckpoint && session.state !== 'terminated') {
      try {
        await this.checkpoint(sessionId, 'state_change');
      } catch (error) {
        logger.warn('[PiSessionManager] Failed to create final checkpoint', { sessionId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Stop auto-checkpointing
    this.stopAutoCheckpoint(sessionId);

    // Clean up resources
    this.cleanupSession(sessionId);

    // Mark as terminated
    session.state = 'terminated';

    this.emit('session.terminated', sessionId, options.reason);
    logger.info('[PiSessionManager] Session terminated', { sessionId });
  }

  // ============================================================================
  // Checkpoint Management
  // ============================================================================

  /**
   * Creates a checkpoint for a session.
   *
   * Saves the current session state to both Redis (hot) and PostgreSQL (cold)
   * for fast recovery and durability.
   *
   * @param sessionId - ID of the session to checkpoint
   * @param trigger - What triggered this checkpoint
   * @returns The created Checkpoint
   * @throws {SessionNotFoundError} If the session doesn't exist
   * @throws {CheckpointError} If checkpoint creation fails
   *
   * @example
   * ```typescript
   * // Manual checkpoint
   * const checkpoint = await sessionManager.checkpoint('session-123', 'manual');
   *
   * // Pre-tool execution checkpoint
   * await sessionManager.checkpoint('session-123', 'pre_tool');
   * ```
   */
  async checkpoint(sessionId: string, trigger: CheckpointTrigger = 'manual'): Promise<Checkpoint> {
    const session = this.getSessionOrThrow(sessionId);

    // Check minimum interval between checkpoints
    const lastCheckpoint = this.lastCheckpointTime.get(sessionId) || 0;
    const now = Date.now();
    if (now - lastCheckpoint < this.MIN_CHECKPOINT_INTERVAL_MS && trigger === 'auto') {
      logger.debug('[PiSessionManager] Skipping auto-checkpoint - too soon', { sessionId });
      throw new CheckpointError(sessionId, 'Checkpoint created too recently');
    }

    logger.debug('[PiSessionManager] Creating checkpoint', { sessionId, trigger });

    const checkpointId = this.generateCheckpointId(sessionId);
    const createdAt = new Date();

    try {
      // Serialize session state
      const serializedState = this.serializeSessionState(session);

      // Calculate total token count
      const tokenCount = this.calculateTokenCount(session);

      // Create checkpoint object
      const checkpoint: Checkpoint = {
        id: checkpointId,
        sessionId,
        trigger,
        state: serializedState,
        tokenCount,
        storage: {},
        createdAt,
      };

      // Save to Redis (hot storage)
      const redisKey = `checkpoint:${checkpointId}`;
      await this.storage.saveHot(redisKey, checkpoint, 3600); // 1 hour TTL
      checkpoint.storage.redis = redisKey;

      // Save to PostgreSQL (cold storage)
      const pgId = await this.storage.saveCold('checkpoints', {
        id: checkpointId,
        session_id: sessionId,
        trigger,
        state: JSON.stringify(serializedState),
        token_count: tokenCount,
        created_at: createdAt.toISOString(),
      });
      checkpoint.storage.postgresql = pgId;

      // Store in memory
      const sessionCheckpoints = this.checkpoints.get(sessionId) || [];
      sessionCheckpoints.push(checkpoint);
      this.checkpoints.set(sessionId, sessionCheckpoints);

      // Update session
      session.checkpointCount++;
      session.lastCheckpointAt = createdAt;
      this.lastCheckpointTime.set(sessionId, now);

      this.emit('session.checkpointed', sessionId, checkpoint);
      logger.info('[PiSessionManager] Created checkpoint', { checkpointId, sessionId });

      return checkpoint;
    } catch (error) {
      logger.error('[PiSessionManager] Failed to create checkpoint', { sessionId, error: error instanceof Error ? error.message : String(error) });
      throw new CheckpointError(
        sessionId,
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Restores a session from a checkpoint.
   *
   * Loads the checkpoint from storage, finds or creates a Pi instance,
   * and restores the session state.
   *
   * @param checkpointId - ID of the checkpoint to restore from
   * @returns The restored PiSession
   * @throws {SessionManagerError} If the checkpoint doesn't exist or restoration fails
   *
   * @example
   * ```typescript
   * const session = await sessionManager.restore('checkpoint-abc-123');
   * ```
   */
  async restore(checkpointId: string): Promise<PiSession> {
    logger.info('[PiSessionManager] Restoring session from checkpoint', { checkpointId });

    try {
      // Load checkpoint from storage
      const checkpoint = await this.loadCheckpoint(checkpointId);
      if (!checkpoint) {
        throw new SessionManagerError(
          `Checkpoint not found: ${checkpointId}`,
          'CHECKPOINT_NOT_FOUND',
          { checkpointId }
        );
      }

      // Deserialize session state
      const session = this.deserializeSessionState(checkpoint.state, checkpoint.sessionId);

      // Find or select Pi instance
      let instance = this.registry.getInstance(session.instanceId);
      if (!instance || instance.health === 'unhealthy') {
        instance = this.selectInstanceForSession(session.config) ?? undefined;
        if (!instance) {
          throw new SessionManagerError(
            'No available instance for session restoration',
            'NO_INSTANCE_AVAILABLE',
            { checkpointId }
          );
        }
        session.instanceId = instance.id;
      }

      // Restore session on Pi instance
      await this.restoreSessionOnInstance(session, instance);

      // Store session
      session.state = 'active';
      session.lastActivityAt = new Date();
      this.sessions.set(session.id, session);
      this.checkpoints.set(session.id, []);

      // Setup auto-checkpointing
      if (session.config.persistence?.autoCheckpoint) {
        this.startAutoCheckpoint(session.id);
      }

      this.emit('session.restored', session);
      logger.info('[PiSessionManager] Session restored from checkpoint', { sessionId: session.id, checkpointId });

      return session;
    } catch (error) {
      logger.error('[PiSessionManager] Failed to restore from checkpoint', { checkpointId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Migrates a session to a different Pi instance.
   *
   * Creates a checkpoint on the source instance, restores on the target,
   * and verifies successful migration.
   *
   * @param sessionId - ID of the session to migrate
   * @param targetInstanceId - ID of the target Pi instance
   * @throws {SessionNotFoundError} If the session doesn't exist
   * @throws {MigrationError} If migration fails
   *
   * @example
   * ```typescript
   * await sessionManager.migrate('session-123', 'pi-instance-456');
   * ```
   */
  async migrate(sessionId: string, targetInstanceId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const sourceInstanceId = session.instanceId;

    logger.info('[PiSessionManager] Migrating session', { sessionId, sourceInstanceId, targetInstanceId });

    // Verify target instance exists and is healthy
    const targetInstance = this.registry.getInstance(targetInstanceId);
    if (!targetInstance) {
      throw new MigrationError(sessionId, sourceInstanceId, targetInstanceId,
        new Error('Target instance not found'));
    }
    if (targetInstance.health === 'unhealthy') {
      throw new MigrationError(sessionId, sourceInstanceId, targetInstanceId,
        new Error('Target instance is unhealthy'));
    }

    try {
      // Create pre-migration checkpoint
      await this.checkpoint(sessionId, 'pre_migration');

      // Stop auto-checkpointing during migration
      this.stopAutoCheckpoint(sessionId);

      // Update instance ID
      session.instanceId = targetInstanceId;

      // Restore on target instance
      await this.restoreSessionOnInstance(session, targetInstance);

      // Verify restoration
      const verified = await this.verifySessionOnInstance(session, targetInstance);
      if (!verified) {
        // Rollback to source instance
        session.instanceId = sourceInstanceId;
        const sourceInstance = this.registry.getInstance(sourceInstanceId);
        if (sourceInstance) {
          await this.restoreSessionOnInstance(session, sourceInstance);
        }
        throw new MigrationError(sessionId, sourceInstanceId, targetInstanceId,
          new Error('Verification failed on target instance'));
      }

      // Restart auto-checkpointing
      if (session.config.persistence?.autoCheckpoint) {
        this.startAutoCheckpoint(sessionId);
      }

      this.emit('session.migrated', sessionId, sourceInstanceId, targetInstanceId);
      logger.info('[PiSessionManager] Successfully migrated session', { sessionId, targetInstanceId });
    } catch (error) {
      logger.error('[PiSessionManager] Migration failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      throw new MigrationError(
        sessionId,
        sourceInstanceId,
        targetInstanceId,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Gets a session by ID.
   *
   * @param sessionId - ID of the session to retrieve
   * @returns The PiSession if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const session = sessionManager.getSession('session-123');
   * if (session) {
   *   console.log(session.state);
   * }
   * ```
   */
  getSession(sessionId: string): PiSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Lists all sessions matching the filter criteria.
   *
   * @param filter - Optional filter criteria
   * @returns Array of matching PiSession objects
   *
   * @example
   * ```typescript
   * // All active sessions
   * const active = sessionManager.listSessions({ state: 'active' });
   *
   * // All sessions for an agent
   * const agentSessions = sessionManager.listSessions({ agentId: 'agent-123' });
   * ```
   */
  listSessions(filter?: SessionFilter): PiSession[] {
    let sessions = Array.from(this.sessions.values());

    if (filter) {
      if (filter.agentId) {
        sessions = sessions.filter(s => s.agentId === filter.agentId);
      }
      if (filter.state) {
        sessions = sessions.filter(s => s.state === filter.state);
      }
      if (filter.instanceId) {
        sessions = sessions.filter(s => s.instanceId === filter.instanceId);
      }
      if (filter.createdAfter) {
        sessions = sessions.filter(s => s.createdAt >= filter.createdAfter!);
      }
      if (filter.createdBefore) {
        sessions = sessions.filter(s => s.createdAt <= filter.createdBefore!);
      }
      if (filter.hasCheckpoints) {
        sessions = sessions.filter(s => s.checkpointCount > 0);
      }
    }

    return sessions;
  }

  /**
   * Gets all sessions for a specific agent.
   *
   * @param agentId - ID of the agent
   * @returns Array of PiSession objects belonging to the agent
   *
   * @example
   * ```typescript
   * const sessions = sessionManager.getSessionsForAgent('agent-123');
   * ```
   */
  getSessionsForAgent(agentId: string): PiSession[] {
    return this.listSessions({ agentId });
  }

  /**
   * Lists all checkpoints for a session.
   *
   * @param sessionId - ID of the session
   * @returns Array of Checkpoint objects
   * @throws {SessionNotFoundError} If the session doesn't exist
   *
   * @example
   * ```typescript
   * const checkpoints = await sessionManager.listCheckpoints('session-123');
   * ```
   */
  async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    const session = this.getSessionOrThrow(sessionId);
    return this.checkpoints.get(sessionId) || [];
  }

  /**
   * Deletes a checkpoint.
   *
   * Removes the checkpoint from both hot and cold storage.
   *
   * @param checkpointId - ID of the checkpoint to delete
   * @throws {SessionManagerError} If the checkpoint doesn't exist
   *
   * @example
   * ```typescript
   * await sessionManager.deleteCheckpoint('checkpoint-abc-123');
   * ```
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    logger.info('[PiSessionManager] Deleting checkpoint', { checkpointId });

    // Find checkpoint in memory
    let foundSessionId: string | null = null;
    for (const [sessionId, checkpoints] of this.checkpoints.entries()) {
      const index = checkpoints.findIndex(c => c.id === checkpointId);
      if (index >= 0) {
        checkpoints.splice(index, 1);
        foundSessionId = sessionId;
        break;
      }
    }

    // Delete from storage
    try {
      await this.storage.delete(`checkpoint:${checkpointId}`);
    } catch (error) {
      logger.warn('[PiSessionManager] Failed to delete checkpoint from storage', { checkpointId, error: error instanceof Error ? error.message : String(error) });
    }

    if (foundSessionId) {
      logger.info('[PiSessionManager] Deleted checkpoint', { checkpointId, sessionId: foundSessionId });
    } else {
      logger.warn('[PiSessionManager] Checkpoint not found in memory', { checkpointId });
    }
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Initializes a session on its assigned Pi instance.
   *
   * @param session - Session to initialize
   * @throws {SessionManagerError} If initialization fails
   */
  private async initializeSession(session: PiSession): Promise<void> {
    const instance = this.registry.getInstance(session.instanceId);
    if (!instance) {
      throw new SessionManagerError(
        `Instance ${session.instanceId} not found`,
        'INSTANCE_NOT_FOUND',
        { sessionId: session.id }
      );
    }

    logger.debug('[PiSessionManager] Initializing session', { sessionId: session.id, instanceId: session.instanceId });

    // In production, this would make an API call to the Pi instance
    // to create the actual session with the specified configuration
    try {
      // Placeholder: Simulate initialization
      await this.simulateAsyncOperation('initializeSession', 50);

      // Set up initial conversation root if system prompt provided
      if (session.config.piConfig.systemPrompt) {
        const rootNode: ConversationNode = {
          id: this.generateNodeId(),
          parentId: null,
          childIds: [],
          message: {
            role: 'system',
            content: session.config.piConfig.systemPrompt,
          },
          tokenCount: this.estimateTokenCount(session.config.piConfig.systemPrompt),
          createdAt: new Date(),
        };
        session.conversationRoot = rootNode;
        session.currentNodeId = rootNode.id;
      }

      this.emit('session.initialized', session);
    } catch (error) {
      throw new SessionManagerError(
        `Failed to initialize session on instance: ${error instanceof Error ? error.message : String(error)}`,
        'INITIALIZATION_FAILED',
        { sessionId: session.id, instanceId: session.instanceId }
      );
    }
  }

  /**
   * Saves session state to persistent storage.
   *
   * @param session - Session to save
   */
  private async saveSessionState(session: PiSession): Promise<void> {
    try {
      const serialized = this.serializeSessionState(session);
      await this.storage.saveHot(`session:${session.id}`, {
        ...serialized,
        state: session.state,
        lastActivityAt: session.lastActivityAt.toISOString(),
      }, 3600);

      if (this.stateSync) {
        await this.stateSync.sync(session.id, serialized);
      }
    } catch (error) {
      logger.warn('[PiSessionManager] Failed to save session state', { sessionId: session.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Starts auto-checkpointing for a session.
   *
   * Creates checkpoints at configured intervals based on message count.
   *
   * @param sessionId - ID of the session
   */
  private startAutoCheckpoint(sessionId: string): void {
    // Clear existing interval if any
    this.stopAutoCheckpoint(sessionId);

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const interval = session.config.persistence?.checkpointInterval || 10;
    logger.debug('[PiSessionManager] Starting auto-checkpoint', { sessionId, interval });

    // Set up periodic check
    const checkInterval = setInterval(() => {
      const s = this.sessions.get(sessionId);
      if (!s || s.state !== 'active') {
        this.stopAutoCheckpoint(sessionId);
        return;
      }

      // Check if we should checkpoint based on message count
      if (s.messageCount > 0 && s.messageCount % interval === 0) {
        this.checkpoint(sessionId, 'auto').catch(err => {
          logger.warn('[PiSessionManager] Auto-checkpoint failed', { sessionId, error: err instanceof Error ? err.message : String(err) });
        });
      }
    }, 5000); // Check every 5 seconds

    this.autoCheckpointIntervals.set(sessionId, checkInterval);
  }

  /**
   * Stops auto-checkpointing for a session.
   *
   * @param sessionId - ID of the session
   */
  private stopAutoCheckpoint(sessionId: string): void {
    const interval = this.autoCheckpointIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.autoCheckpointIntervals.delete(sessionId);
      logger.debug('[PiSessionManager] Stopped auto-checkpoint', { sessionId });
    }
  }

  /**
   * Transitions a session to a new state.
   *
   * Validates the transition and emits state change events.
   *
   * @param sessionId - ID of the session
   * @param newState - Target state
   * @throws {InvalidStateTransitionError} If the transition is invalid
   */
  private async transitionState(sessionId: string, newState: SessionState): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const previousState = session.state;

    if (!isValidStateTransition(previousState, newState)) {
      throw new InvalidStateTransitionError(sessionId, previousState, newState);
    }

    session.state = newState;
    session.lastActivityAt = new Date();

    this.emit('session.state_changed', sessionId, previousState, newState);
    logger.debug('[PiSessionManager] Session state transition', { sessionId, previousState, newState });
  }

  /**
   * Selects an appropriate Pi instance for a session.
   *
   * Uses the configured router or falls back to registry selection.
   *
   * @param config - Session configuration
   * @returns Selected PiInstance or null if none available
   */
  private selectInstanceForSession(config: SessionConfig): PiInstance | null {
    const criteria: SelectionCriteria = {
      preferredProvider: config.piConfig.provider,
      requiredCapabilities: config.piConfig.tools?.map(t => `tool:${t}`),
      strategy: config.routing?.strategy as SelectionCriteria['strategy'] || 'least-loaded',
    };

    if (this.router) {
      return this.router.selectInstance(criteria);
    }

    return this.registry.selectInstance(criteria);
  }

  /**
   * Restores a session on a Pi instance.
   *
   * @param session - Session to restore
   * @param instance - Pi instance to restore on
   */
  private async restoreSessionOnInstance(session: PiSession, instance: PiInstance): Promise<void> {
    logger.debug('[PiSessionManager] Restoring session', { sessionId: session.id, instanceId: instance.id });

    // In production, this would make an API call to restore the session
    await this.simulateAsyncOperation('restoreSession', 100);

    // Update session metadata
    session.instanceId = instance.id;
    session.lastActivityAt = new Date();
  }

  /**
   * Verifies a session is properly restored on an instance.
   *
   * @param session - Session to verify
   * @param instance - Instance to verify on
   * @returns True if verification succeeds
   */
  private async verifySessionOnInstance(session: PiSession, instance: PiInstance): Promise<boolean> {
    logger.debug('[PiSessionManager] Verifying session', { sessionId: session.id, instanceId: instance.id });

    // In production, this would verify the session state matches
    await this.simulateAsyncOperation('verifySession', 50);

    return true;
  }

  /**
   * Loads a checkpoint from storage.
   *
   * Tries Redis first, then falls back to PostgreSQL.
   *
   * @param checkpointId - ID of the checkpoint
   * @returns Checkpoint if found, null otherwise
   */
  private async loadCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    // Try Redis first
    const fromRedis = await this.storage.loadHot<Checkpoint>(`checkpoint:${checkpointId}`);
    if (fromRedis) {
      logger.debug('[PiSessionManager] Loaded checkpoint from Redis', { checkpointId });
      return fromRedis;
    }

    // Fall back to PostgreSQL
    const fromPg = await this.storage.loadCold<{ id: string; state: string }>('checkpoints', checkpointId);
    if (fromPg) {
      logger.debug('[PiSessionManager] Loaded checkpoint from PostgreSQL', { checkpointId });
      return {
        ...fromPg,
        state: JSON.parse(fromPg.state),
      } as Checkpoint;
    }

    return null;
  }

  /**
   * Cleans up session resources.
   *
   * @param sessionId - ID of the session to clean up
   */
  private cleanupSession(sessionId: string): void {
    this.stopAutoCheckpoint(sessionId);
    this.lastCheckpointTime.delete(sessionId);
    this.sessions.delete(sessionId);
    this.checkpoints.delete(sessionId);
  }

  /**
   * Serializes session state for storage.
   *
   * @param session - Session to serialize
   * @returns Serialized state
   */
  private serializeSessionState(session: PiSession): Checkpoint['state'] {
    const conversationTree: SerializedConversationNode[] = [];

    // Serialize conversation tree
    if (session.conversationRoot) {
      const serializeNode = (node: ConversationNode): void => {
        conversationTree.push({
          id: node.id,
          parentId: node.parentId,
          childIds: node.childIds,
          message: node.message,
          tokenCount: node.tokenCount,
          createdAt: node.createdAt.toISOString(),
        });

        // Recursively serialize children (would need actual tree traversal in production)
      };

      serializeNode(session.conversationRoot);
    }

    // Serialize tool state
    const serializedToolState: SerializedToolState = {
      pending: Array.from(session.toolState.pending.entries()),
      completed: Array.from(session.toolState.completed.entries()),
      current: session.toolState.current,
    };

    return {
      conversationTree,
      currentNodeId: session.currentNodeId || '',
      toolState: serializedToolState,
      messageCount: session.messageCount,
      metadata: session.metadata,
    };
  }

  /**
   * Deserializes session state from storage.
   *
   * @param state - Serialized state
   * @param sessionId - Session ID
   * @returns Deserialized PiSession
   */
  private deserializeSessionState(state: Checkpoint['state'], sessionId: string): PiSession {
    const now = new Date();

    // Reconstruct conversation tree
    let conversationRoot: ConversationNode | undefined;
    if (state.conversationTree.length > 0) {
      const root = state.conversationTree[0];
      conversationRoot = {
        id: root.id,
        parentId: root.parentId,
        childIds: root.childIds,
        message: {
          ...root.message,
          role: root.message.role as 'system' | 'user' | 'assistant' | 'tool',
        },
        tokenCount: root.tokenCount,
        createdAt: new Date(root.createdAt),
      };
    }

    // Reconstruct tool state
    const toolState: ToolCallState = {
      pending: new Map(state.toolState.pending),
      completed: new Map(state.toolState.completed),
      current: state.toolState.current,
    };

    return {
      id: sessionId,
      agentId: '', // Will be set from config lookup
      state: 'resuming',
      instanceId: '', // Will be set during migration
      config: {
        agentId: '',
        piConfig: {},
      },
      conversationRoot,
      currentNodeId: state.currentNodeId,
      toolState,
      messageCount: state.messageCount,
      checkpointCount: 0,
      createdAt: now,
      lastActivityAt: now,
      metadata: state.metadata,
    };
  }

  /**
   * Calculates total token count for a session.
   *
   * @param session - Session to calculate for
   * @returns Total token count
   */
  private calculateTokenCount(session: PiSession): number {
    let count = 0;

    if (session.conversationRoot) {
      count += session.conversationRoot.tokenCount;
    }

    return count;
  }

  /**
   * Gets a session or throws if not found.
   *
   * @param sessionId - Session ID
   * @returns PiSession
   * @throws {SessionNotFoundError} If session doesn't exist
   */
  private getSessionOrThrow(sessionId: string): PiSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  /**
   * Normalizes session configuration with defaults.
   *
   * @param config - Raw configuration
   * @returns Normalized configuration
   */
  private normalizeConfig(config: SessionConfig): SessionConfig {
    return {
      ...config,
      persistence: {
        ...DEFAULT_SESSION_PERSISTENCE,
        ...config.persistence,
      },
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Generates a unique session ID.
   *
   * @returns Unique session identifier
   */
  private generateSessionId(): string {
    return `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generates a unique checkpoint ID.
   *
   * @param sessionId - Session ID
   * @returns Unique checkpoint identifier
   */
  private generateCheckpointId(sessionId: string): string {
    return `chk-${sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Generates a unique node ID.
   *
   * @returns Unique node identifier
   */
  private generateNodeId(): string {
    return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Estimates token count for a text string.
   *
   * @param text - Text to estimate
   * @returns Estimated token count
   */
  private estimateTokenCount(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Simulates an async operation for placeholder implementations.
   *
   * @param operation - Operation name
   * @param durationMs - Duration in milliseconds
   */
  private async simulateAsyncOperation(operation: string, durationMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, durationMs));
  }

  // ============================================================================
  // Management Methods
  // ============================================================================

  /**
   * Gets statistics about sessions.
   *
   * @returns Session statistics
   */
  getStats(): {
    totalSessions: number;
    byState: Record<SessionState, number>;
    totalCheckpoints: number;
    byAgent: Record<string, number>;
  } {
    const sessions = Array.from(this.sessions.values());
    const byState: Record<SessionState, number> = {
      creating: 0,
      active: 0,
      paused: 0,
      resuming: 0,
      terminating: 0,
      terminated: 0,
      failed: 0,
    };

    const byAgent: Record<string, number> = {};

    for (const session of sessions) {
      byState[session.state]++;
      byAgent[session.agentId] = (byAgent[session.agentId] || 0) + 1;
    }

    let totalCheckpoints = 0;
    for (const checkpoints of this.checkpoints.values()) {
      totalCheckpoints += checkpoints.length;
    }

    return {
      totalSessions: sessions.length,
      byState,
      totalCheckpoints,
      byAgent,
    };
  }

  /**
   * Terminates all sessions.
   *
   * Useful for graceful shutdown.
   *
   * @param options - Termination options
   */
  async terminateAll(options: TerminateOptions = {}): Promise<void> {
    logger.info('[PiSessionManager] Terminating all sessions');

    const sessionIds = Array.from(this.sessions.keys());

    for (const sessionId of sessionIds) {
      try {
        await this.terminate(sessionId, options);
      } catch (error) {
        logger.error('[PiSessionManager] Failed to terminate session', { sessionId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    logger.info('[PiSessionManager] Terminated all sessions', { count: sessionIds.length });
  }

  /**
   * Disposes the session manager and cleans up resources.
   *
   * Terminates all sessions and removes event listeners.
   */
  dispose(): void {
    logger.info('[PiSessionManager] Disposing');

    // Stop all auto-checkpoint intervals
    for (const [sessionId, interval] of this.autoCheckpointIntervals.entries()) {
      clearInterval(interval);
    }
    this.autoCheckpointIntervals.clear();

    this.removeAllListeners();

    logger.info('[PiSessionManager] Disposed');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalPiSessionManager: PiSessionManager | null = null;

/**
 * Gets or creates the global PiSessionManager instance.
 *
 * @param deps - Dependencies for creating the manager (used only on first call)
 * @returns The global PiSessionManager instance
 * @throws {SessionManagerError} If no deps provided and no global instance exists
 */
export function getGlobalPiSessionManager(deps?: SessionManagerDeps): PiSessionManager {
  if (!globalPiSessionManager) {
    if (!deps) {
      throw new SessionManagerError(
        'Global PiSessionManager requires dependencies on first initialization',
        'INITIALIZATION_REQUIRED'
      );
    }
    globalPiSessionManager = new PiSessionManager(deps);
  }
  return globalPiSessionManager;
}

/**
 * Resets the global PiSessionManager instance.
 * Useful for testing.
 */
export function resetGlobalPiSessionManager(): void {
  if (globalPiSessionManager) {
    globalPiSessionManager.dispose();
    globalPiSessionManager = null;
  }
}

/**
 * Checks if a global PiSessionManager instance exists.
 *
 * @returns True if global instance exists
 */
export function hasGlobalPiSessionManager(): boolean {
  return globalPiSessionManager !== null;
}

// ============================================================================
// Exports
// ============================================================================

export default PiSessionManager;
