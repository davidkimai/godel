/**
 * State Synchronizer
 *
 * Provides reliable state persistence with Redis/PostgreSQL and checkpoint/restore capabilities.
 * Implements a hybrid storage strategy: Redis for fast access, PostgreSQL for durability.
 *
 * @example
 * ```typescript
 * const synchronizer = new HybridStateSynchronizer(redis, postgres, logger);
 *
 * // Save a checkpoint
 * const checkpoint = await synchronizer.saveCheckpoint(sessionId, state, 'manual');
 *
 * // Load session state
 * const state = await synchronizer.loadSessionState(sessionId);
 *
 * // Cleanup old checkpoints
 * const deleted = await synchronizer.cleanupOldCheckpoints(sessionId, 10);
 * ```
 */

import {
  type CheckpointData,
  type CheckpointMetadata,
  type CheckpointTriggerType,
  type ConversationTree,
  type EnhancedStateSynchronizer,
  type Logger,
  type PostgresClient,
  type PostgresQueryResult,
  type RedisClient,
  type RedisPipeline,
  type SynchronizerSessionState,
  type TreeNode,
} from './types';
import type { TokenUsage } from './router';

// ============================================================================
// Constants
// ============================================================================

/** Default TTL for Redis checkpoint keys (24 hours) */
const CHECKPOINT_TTL_SECONDS = 86400;

/** Default TTL for Redis session state keys (1 hour) */
const SESSION_STATE_TTL_SECONDS = 3600;

/** Default TTL for Redis tree state keys (1 hour) */
const TREE_STATE_TTL_SECONDS = 3600;

/** Key prefix for checkpoints in Redis */
const CHECKPOINT_KEY_PREFIX = 'checkpoint:';

/** Key prefix for session states in Redis */
const SESSION_STATE_KEY_PREFIX = 'session:';

/** Key prefix for tree states in Redis */
const TREE_STATE_KEY_PREFIX = 'tree:';

/** Key suffix for checkpoint list in Redis */
const CHECKPOINTS_LIST_SUFFIX = ':checkpoints';

/** Key suffix for session state in Redis */
const SESSION_STATE_SUFFIX = ':state';

/** Key suffix for tree state in Redis */
const TREE_STATE_SUFFIX = ':tree';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random ID string
 */
function randomId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a checkpoint ID
 */
function generateCheckpointId(): string {
  return `cp_${Date.now()}_${randomId()}`;
}

/**
 * Safely serialize an object to JSON with Date handling
 */
function serialize<T>(obj: T): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    if (value instanceof Map) {
      return { __type: 'Map', value: Array.from(value.entries()) };
    }
    return value;
  });
}

/**
 * Safely deserialize JSON with Date and Map reconstruction
 */
function deserialize<T>(json: string): T {
  return JSON.parse(json, (_key, value) => {
    if (value && typeof value === 'object' && value.__type === 'Date') {
      return new Date(value.value);
    }
    if (value && typeof value === 'object' && value.__type === 'Map') {
      return new Map(value.value);
    }
    return value;
  });
}

/**
 * Extract metadata from session state for checkpoint
 */
function extractMetadata(state: SynchronizerSessionState): CheckpointMetadata {
  return {
    messageCount: 0, // Would be calculated from conversation tree
    tokenCount: state.tokenUsage?.total || 0,
    trigger: 'auto',
    piCheckpointRef: undefined,
  };
}

/**
 * Serialize conversation tree for storage
 */
function serializeTree(tree: ConversationTree): Record<string, unknown> {
  return {
    root: serializeNode(tree.root),
    nodes: Array.from(tree.nodes.entries()).map(([id, node]) => [id, serializeNode(node)]),
    currentNodeId: tree.currentNodeId,
    metadata: tree.metadata,
    branches: tree.branches,
  };
}

/**
 * Serialize a tree node
 */
function serializeNode(node: TreeNode): Record<string, unknown> {
  return {
    id: node.id,
    parentId: node.parentId,
    childIds: node.childIds,
    message: node.message,
    tokenCount: node.tokenCount,
    createdAt: node.createdAt.toISOString(),
  };
}

/**
 * Deserialize conversation tree from storage
 */
function deserializeTree(data: Record<string, unknown>): ConversationTree {
  const nodes = new Map<string, TreeNode>();

  if (Array.isArray(data['nodes'])) {
    for (const [id, nodeData] of data['nodes']) {
      nodes.set(id, deserializeNode(nodeData as Record<string, unknown>));
    }
  }

  return {
    root: deserializeNode(data['root'] as Record<string, unknown>),
    nodes,
    currentNodeId: data['currentNodeId'] as string,
    metadata: data['metadata'] as ConversationTree['metadata'],
    branches: (data['branches'] as ConversationTree['branches']) || [],
  };
}

/**
 * Deserialize a tree node
 */
function deserializeNode(data: Record<string, unknown>): TreeNode {
  return {
    id: data['id'] as string,
    parentId: data['parentId'] as string | null,
    childIds: data['childIds'] as string[],
    message: data['message'] as TreeNode['message'],
    tokenCount: data['tokenCount'] as number,
    createdAt: new Date(data['createdAt'] as string),
  };
}

// ============================================================================
// Hybrid State Synchronizer
// ============================================================================

/**
 * Hybrid state synchronizer implementation using Redis for fast access
 * and PostgreSQL for durable persistence.
 *
 * This class provides:
 * - Checkpoint creation, loading, listing, and deletion
 * - Session state persistence with dual storage
 * - Conversation tree state management
 * - Batch operations for efficiency
 * - Automatic cleanup of old checkpoints
 * - Error handling with degraded mode operation
 *
 * @implements {EnhancedStateSynchronizer}
 */
export class HybridStateSynchronizer implements EnhancedStateSynchronizer {
  private redis: RedisClient;
  private postgres: PostgresClient;
  private logger: Logger;

  /**
   * Create a new HybridStateSynchronizer
   *
   * @param redis - Redis client for fast storage
   * @param postgres - PostgreSQL client for durable storage
   * @param logger - Logger for operation logging
   */
  constructor(redis: RedisClient, postgres: PostgresClient, logger: Logger) {
    this.redis = redis;
    this.postgres = postgres;
    this.logger = logger;

    this.logger.info('HybridStateSynchronizer initialized', {
      checkpointTtl: CHECKPOINT_TTL_SECONDS,
      sessionStateTtl: SESSION_STATE_TTL_SECONDS,
    });
  }

  // ==========================================================================
  // Checkpoint Operations
  // ==========================================================================

  /**
   * Save a checkpoint for a session
   *
   * Creates a checkpoint with the given session state and stores it in both
   * Redis (fast access, 24h TTL) and PostgreSQL (durable storage).
   *
   * @param sessionId - The session identifier
   * @param state - The session state to checkpoint
   * @param trigger - The trigger that caused this checkpoint
   * @returns The created checkpoint data
   *
   * @example
   * ```typescript
   * const checkpoint = await synchronizer.saveCheckpoint(
   *   'session-123',
   *   sessionState,
   *   'manual'
   * );
   * console.log(`Checkpoint created: ${checkpoint.id}`);
   * ```
   */
  async saveCheckpoint(
    sessionId: string,
    state: SynchronizerSessionState,
    trigger: CheckpointTriggerType = 'auto'
  ): Promise<CheckpointData> {
    const checkpointId = generateCheckpointId();
    const metadata: CheckpointMetadata = {
      ...extractMetadata(state),
      trigger,
    };

    const checkpoint: CheckpointData = {
      id: checkpointId,
      sessionId,
      createdAt: new Date(),
      state,
      metadata,
    };

    this.logger.debug('Saving checkpoint', {
      checkpointId,
      sessionId,
      trigger,
    });

    // Track storage operation results
    const redisSuccess = await this.saveCheckpointToRedis(checkpoint);
    const postgresSuccess = await this.saveCheckpointToPostgres(checkpoint);

    if (!redisSuccess && !postgresSuccess) {
      this.logger.error('Failed to save checkpoint to both storages', {
        checkpointId,
        sessionId,
      });
      throw new Error(`Failed to save checkpoint ${checkpointId}: both storages failed`);
    }

    if (!redisSuccess) {
      this.logger.warn('Checkpoint saved to PostgreSQL only (Redis failed)', {
        checkpointId,
        sessionId,
      });
    }

    if (!postgresSuccess) {
      this.logger.warn('Checkpoint saved to Redis only (PostgreSQL failed)', {
        checkpointId,
        sessionId,
      });
    }

    // Update session's checkpoint list in Redis
    await this.addCheckpointToSessionList(sessionId, checkpointId);

    this.logger.info('Checkpoint saved successfully', {
      checkpointId,
      sessionId,
      redisSuccess,
      postgresSuccess,
    });

    return checkpoint;
  }

  /**
   * Save checkpoint to Redis
   *
   * @private
   * @param checkpoint - The checkpoint to save
   * @returns True if successful, false otherwise
   */
  private async saveCheckpointToRedis(checkpoint: CheckpointData): Promise<boolean> {
    try {
      const key = `${CHECKPOINT_KEY_PREFIX}${checkpoint.id}`;
      const serialized = serialize(checkpoint);

      await this.redis.setex(key, CHECKPOINT_TTL_SECONDS, serialized);

      return true;
    } catch (error) {
      this.logger.error('Failed to save checkpoint to Redis', {
        checkpointId: checkpoint.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Save checkpoint to PostgreSQL
   *
   * @private
   * @param checkpoint - The checkpoint to save
   * @returns True if successful, false otherwise
   */
  private async saveCheckpointToPostgres(checkpoint: CheckpointData): Promise<boolean> {
    try {
      await this.postgres.query(
        `INSERT INTO checkpoints (id, session_id, state, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          checkpoint.id,
          checkpoint.sessionId,
          JSON.stringify(checkpoint.state),
          JSON.stringify(checkpoint.metadata),
          checkpoint.createdAt,
        ]
      );

      return true;
    } catch (error) {
      this.logger.error('Failed to save checkpoint to PostgreSQL', {
        checkpointId: checkpoint.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Add checkpoint ID to session's checkpoint list
   *
   * @private
   * @param sessionId - The session identifier
   * @param checkpointId - The checkpoint identifier
   */
  private async addCheckpointToSessionList(sessionId: string, checkpointId: string): Promise<void> {
    try {
      const listKey = `${SESSION_STATE_KEY_PREFIX}${sessionId}${CHECKPOINTS_LIST_SUFFIX}`;
      await this.redis.lpush(listKey, checkpointId);
    } catch (error) {
      this.logger.warn('Failed to add checkpoint to session list', {
        sessionId,
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Load a checkpoint by ID
   *
   * Attempts to load from Redis first (fast), then falls back to PostgreSQL (durable).
   * If loaded from PostgreSQL, restores to Redis for faster future access.
   *
   * @param checkpointId - The checkpoint identifier
   * @returns The session state if found, null otherwise
   *
   * @example
   * ```typescript
   * const state = await synchronizer.loadCheckpoint('cp_1234567890_abc');
   * if (state) {
   *   console.log(`Loaded state for session: ${state.sessionId}`);
   * }
   * ```
   */
  async loadCheckpoint(checkpointId: string): Promise<SynchronizerSessionState | null> {
    this.logger.debug('Loading checkpoint', { checkpointId });

    // Try Redis first (fast)
    const redisResult = await this.loadCheckpointFromRedis(checkpointId);
    if (redisResult) {
      this.logger.debug('Checkpoint loaded from Redis', { checkpointId });
      return redisResult.state;
    }

    // Fall back to PostgreSQL (durable)
    const postgresResult = await this.loadCheckpointFromPostgres(checkpointId);
    if (postgresResult) {
      this.logger.debug('Checkpoint loaded from PostgreSQL', { checkpointId });

      // Restore to Redis for faster future access
      await this.saveCheckpointToRedis(postgresResult);

      return postgresResult.state;
    }

    this.logger.warn('Checkpoint not found', { checkpointId });
    return null;
  }

  /**
   * Load checkpoint from Redis
   *
   * @private
   * @param checkpointId - The checkpoint identifier
   * @returns The checkpoint data if found, null otherwise
   */
  private async loadCheckpointFromRedis(checkpointId: string): Promise<CheckpointData | null> {
    try {
      const key = `${CHECKPOINT_KEY_PREFIX}${checkpointId}`;
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return deserialize<CheckpointData>(cached);
    } catch (error) {
      this.logger.error('Failed to load checkpoint from Redis', {
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Load checkpoint from PostgreSQL
   *
   * @private
   * @param checkpointId - The checkpoint identifier
   * @returns The checkpoint data if found, null otherwise
   */
  private async loadCheckpointFromPostgres(checkpointId: string): Promise<CheckpointData | null> {
    try {
      const result: PostgresQueryResult<{
        id: string;
        session_id: string;
        state: string;
        metadata: string;
        created_at: string;
      }> = await this.postgres.query(
        'SELECT id, session_id, state, metadata, created_at FROM checkpoints WHERE id = $1',
        [checkpointId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        id: row.id,
        sessionId: row.session_id,
        createdAt: new Date(row.created_at),
        state: JSON.parse(row.state) as SynchronizerSessionState,
        metadata: JSON.parse(row.metadata) as CheckpointMetadata,
      };
    } catch (error) {
      this.logger.error('Failed to load checkpoint from PostgreSQL', {
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * List all checkpoints for a session
   *
   * Retrieves checkpoint metadata from Redis list and loads full details
   * from the appropriate storage.
   *
   * @param sessionId - The session identifier
   * @returns Array of checkpoint data, sorted by creation time (newest first)
   *
   * @example
   * ```typescript
   * const checkpoints = await synchronizer.listCheckpoints('session-123');
   * console.log(`Found ${checkpoints.length} checkpoints`);
   * ```
   */
  async listCheckpoints(sessionId: string): Promise<CheckpointData[]> {
    this.logger.debug('Listing checkpoints', { sessionId });

    try {
      // Get checkpoint IDs from Redis list
      const listKey = `${SESSION_STATE_KEY_PREFIX}${sessionId}${CHECKPOINTS_LIST_SUFFIX}`;
      const checkpointIds = await this.redis.lrange(listKey, 0, -1);

      if (checkpointIds.length === 0) {
        // Try loading from PostgreSQL as fallback
        return await this.listCheckpointsFromPostgres(sessionId);
      }

      // Load each checkpoint
      const checkpoints: CheckpointData[] = [];

      for (const checkpointId of checkpointIds) {
        const checkpoint = await this.loadCheckpointFromRedis(checkpointId);
        if (checkpoint) {
          checkpoints.push(checkpoint);
        } else {
          // Try PostgreSQL if not in Redis
          const pgCheckpoint = await this.loadCheckpointFromPostgres(checkpointId);
          if (pgCheckpoint) {
            checkpoints.push(pgCheckpoint);
          }
        }
      }

      // Sort by creation time (newest first)
      checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      this.logger.debug('Checkpoints listed', {
        sessionId,
        count: checkpoints.length,
      });

      return checkpoints;
    } catch (error) {
      this.logger.error('Failed to list checkpoints from Redis', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fall back to PostgreSQL
      return await this.listCheckpointsFromPostgres(sessionId);
    }
  }

  /**
   * List checkpoints from PostgreSQL
   *
   * @private
   * @param sessionId - The session identifier
   * @returns Array of checkpoint data
   */
  private async listCheckpointsFromPostgres(sessionId: string): Promise<CheckpointData[]> {
    try {
      const result: PostgresQueryResult<{
        id: string;
        session_id: string;
        state: string;
        metadata: string;
        created_at: string;
      }> = await this.postgres.query(
        'SELECT id, session_id, state, metadata, created_at FROM checkpoints WHERE session_id = $1 ORDER BY created_at DESC',
        [sessionId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        createdAt: new Date(row.created_at),
        state: JSON.parse(row.state) as SynchronizerSessionState,
        metadata: JSON.parse(row.metadata) as CheckpointMetadata,
      }));
    } catch (error) {
      this.logger.error('Failed to list checkpoints from PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Delete a checkpoint by ID
   *
   * Removes the checkpoint from both Redis and PostgreSQL.
   *
   * @param checkpointId - The checkpoint identifier
   *
   * @example
   * ```typescript
   * await synchronizer.deleteCheckpoint('cp_1234567890_abc');
   * ```
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    this.logger.debug('Deleting checkpoint', { checkpointId });

    // Delete from Redis
    try {
      const key = `${CHECKPOINT_KEY_PREFIX}${checkpointId}`;
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn('Failed to delete checkpoint from Redis', {
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Delete from PostgreSQL
    try {
      await this.postgres.query('DELETE FROM checkpoints WHERE id = $1', [checkpointId]);
    } catch (error) {
      this.logger.warn('Failed to delete checkpoint from PostgreSQL', {
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.logger.info('Checkpoint deleted', { checkpointId });
  }

  // ==========================================================================
  // Session State Operations
  // ==========================================================================

  /**
   * Save session state to storage
   *
   * Stores state in both Redis (fast access, 1h TTL) and PostgreSQL (durable).
   *
   * @param sessionId - The session identifier
   * @param state - The session state to save
   *
   * @example
   * ```typescript
   * await synchronizer.saveSessionState('session-123', {
   *   sessionId: 'session-123',
   *   instanceId: 'pi-1',
   *   status: 'active',
   *   provider: 'anthropic',
   *   model: 'claude-sonnet-4-5',
   *   tools: ['bash', 'read', 'write'],
   *   currentNodeId: 'node-1',
   *   tokenUsage: { prompt: 100, completion: 50, total: 150 },
   *   costIncurred: 0.002
   * });
   * ```
   */
  async saveSessionState(sessionId: string, state: SynchronizerSessionState): Promise<void> {
    this.logger.debug('Saving session state', { sessionId });

    // Save to Redis
    const redisSuccess = await this.saveSessionStateToRedis(sessionId, state);

    // Save to PostgreSQL
    const postgresSuccess = await this.saveSessionStateToPostgres(sessionId, state);

    if (!redisSuccess && !postgresSuccess) {
      this.logger.error('Failed to save session state to both storages', { sessionId });
      throw new Error(`Failed to save session state for ${sessionId}: both storages failed`);
    }

    if (!redisSuccess) {
      this.logger.warn('Session state saved to PostgreSQL only (Redis failed)', { sessionId });
    }

    if (!postgresSuccess) {
      this.logger.warn('Session state saved to Redis only (PostgreSQL failed)', { sessionId });
    }

    this.logger.debug('Session state saved', { sessionId });
  }

  /**
   * Save session state to Redis
   *
   * @private
   * @param sessionId - The session identifier
   * @param state - The session state
   * @returns True if successful, false otherwise
   */
  private async saveSessionStateToRedis(
    sessionId: string,
    state: SynchronizerSessionState
  ): Promise<boolean> {
    try {
      const key = `${SESSION_STATE_KEY_PREFIX}${sessionId}${SESSION_STATE_SUFFIX}`;
      await this.redis.setex(key, SESSION_STATE_TTL_SECONDS, serialize(state));
      return true;
    } catch (error) {
      this.logger.error('Failed to save session state to Redis', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Save session state to PostgreSQL
   *
   * @private
   * @param sessionId - The session identifier
   * @param state - The session state
   * @returns True if successful, false otherwise
   */
  private async saveSessionStateToPostgres(
    sessionId: string,
    state: SynchronizerSessionState
  ): Promise<boolean> {
    try {
      await this.postgres.query(
        `INSERT INTO session_states (session_id, state, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (session_id) DO UPDATE
         SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
        [sessionId, JSON.stringify(state)]
      );
      return true;
    } catch (error) {
      this.logger.error('Failed to save session state to PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Load session state from storage
   *
   * Attempts to load from Redis first (fast), then falls back to PostgreSQL (durable).
   *
   * @param sessionId - The session identifier
   * @returns The session state if found, null otherwise
   *
   * @example
   * ```typescript
   * const state = await synchronizer.loadSessionState('session-123');
   * if (state) {
   *   console.log(`Session status: ${state.status}`);
   * }
   * ```
   */
  async loadSessionState(sessionId: string): Promise<SynchronizerSessionState | null> {
    this.logger.debug('Loading session state', { sessionId });

    // Try Redis first
    try {
      const key = `${SESSION_STATE_KEY_PREFIX}${sessionId}${SESSION_STATE_SUFFIX}`;
      const cached = await this.redis.get(key);

      if (cached) {
        this.logger.debug('Session state loaded from Redis', { sessionId });
        return deserialize<SynchronizerSessionState>(cached);
      }
    } catch (error) {
      this.logger.warn('Failed to load session state from Redis', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fall back to PostgreSQL
    try {
      const result: PostgresQueryResult<{ state: string }> = await this.postgres.query(
        'SELECT state FROM session_states WHERE session_id = $1',
        [sessionId]
      );

      if (result.rows.length > 0 && result.rows[0].state) {
        const state = JSON.parse(result.rows[0].state) as SynchronizerSessionState;

        // Restore to Redis for faster future access
        await this.saveSessionStateToRedis(sessionId, state);

        this.logger.debug('Session state loaded from PostgreSQL', { sessionId });
        return state;
      }
    } catch (error) {
      this.logger.error('Failed to load session state from PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.logger.warn('Session state not found', { sessionId });
    return null;
  }

  // ==========================================================================
  // Tree State Operations
  // ==========================================================================

  /**
   * Save conversation tree state to storage
   *
   * Stores tree in both Redis (fast access, 1h TTL) and PostgreSQL (durable).
   * Also saves all individual nodes to PostgreSQL for complex querying.
   *
   * @param sessionId - The session identifier
   * @param tree - The conversation tree to save
   *
   * @example
   * ```typescript
   * await synchronizer.saveTreeState('session-123', conversationTree);
   * ```
   */
  async saveTreeState(sessionId: string, tree: ConversationTree): Promise<void> {
    this.logger.debug('Saving tree state', {
      sessionId,
      nodeCount: tree.nodes.size,
    });

    const serialized = serializeTree(tree);

    // Save to Redis
    const redisSuccess = await this.saveTreeStateToRedis(sessionId, serialized);

    // Save to PostgreSQL
    const postgresSuccess = await this.saveTreeStateToPostgres(sessionId, tree, serialized);

    if (!redisSuccess && !postgresSuccess) {
      this.logger.error('Failed to save tree state to both storages', { sessionId });
      throw new Error(`Failed to save tree state for ${sessionId}: both storages failed`);
    }

    if (!redisSuccess) {
      this.logger.warn('Tree state saved to PostgreSQL only (Redis failed)', { sessionId });
    }

    if (!postgresSuccess) {
      this.logger.warn('Tree state saved to Redis only (PostgreSQL failed)', { sessionId });
    }

    this.logger.debug('Tree state saved', { sessionId });
  }

  /**
   * Save tree state to Redis
   *
   * @private
   * @param sessionId - The session identifier
   * @param serialized - The serialized tree data
   * @returns True if successful, false otherwise
   */
  private async saveTreeStateToRedis(
    sessionId: string,
    serialized: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const key = `${SESSION_STATE_KEY_PREFIX}${sessionId}${TREE_STATE_SUFFIX}`;
      await this.redis.setex(key, TREE_STATE_TTL_SECONDS, JSON.stringify(serialized));
      return true;
    } catch (error) {
      this.logger.error('Failed to save tree state to Redis', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Save tree state to PostgreSQL
   *
   * @private
   * @param sessionId - The session identifier
   * @param tree - The conversation tree
   * @param serialized - The serialized tree data
   * @returns True if successful, false otherwise
   */
  private async saveTreeStateToPostgres(
    sessionId: string,
    tree: ConversationTree,
    serialized: Record<string, unknown>
  ): Promise<boolean> {
    try {
      // Save tree structure
      await this.postgres.query(
        `INSERT INTO conversation_trees (
           session_id, root_node_id, current_node_id, branches, metadata, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (session_id) DO UPDATE SET
           root_node_id = EXCLUDED.root_node_id,
           current_node_id = EXCLUDED.current_node_id,
           branches = EXCLUDED.branches,
           metadata = EXCLUDED.metadata,
           updated_at = EXCLUDED.updated_at`,
        [
          sessionId,
          tree.root.id,
          tree.currentNodeId,
          JSON.stringify(tree.branches),
          JSON.stringify(tree.metadata),
        ]
      );

      // Save all nodes
      for (const [, node] of Array.from(tree.nodes.entries())) {
        await this.saveNode(sessionId, node);
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to save tree state to PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Save a single node to PostgreSQL
   *
   * @private
   * @param sessionId - The session identifier
   * @param node - The tree node to save
   */
  private async saveNode(sessionId: string, node: TreeNode): Promise<void> {
    try {
      await this.postgres.query(
        `INSERT INTO conversation_nodes (
           session_id, node_id, parent_id, child_ids, message, token_count, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (session_id, node_id) DO UPDATE SET
           parent_id = EXCLUDED.parent_id,
           child_ids = EXCLUDED.child_ids,
           message = EXCLUDED.message,
           token_count = EXCLUDED.token_count`,
        [
          sessionId,
          node.id,
          node.parentId,
          JSON.stringify(node.childIds),
          JSON.stringify(node.message),
          node.tokenCount,
          node.createdAt,
        ]
      );
    } catch (error) {
      this.logger.error('Failed to save node', {
        sessionId,
        nodeId: node.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Load conversation tree state from storage
   *
   * Attempts to load from Redis first (fast), then falls back to PostgreSQL (durable).
   *
   * @param sessionId - The session identifier
   * @returns The conversation tree if found, null otherwise
   *
   * @example
   * ```typescript
   * const tree = await synchronizer.loadTreeState('session-123');
   * if (tree) {
   *   console.log(`Tree has ${tree.nodes.size} nodes`);
   * }
   * ```
   */
  async loadTreeState(sessionId: string): Promise<ConversationTree | null> {
    this.logger.debug('Loading tree state', { sessionId });

    // Try Redis first
    try {
      const key = `${SESSION_STATE_KEY_PREFIX}${sessionId}${TREE_STATE_SUFFIX}`;
      const cached = await this.redis.get(key);

      if (cached) {
        const data = JSON.parse(cached) as Record<string, unknown>;
        this.logger.debug('Tree state loaded from Redis', { sessionId });
        return deserializeTree(data);
      }
    } catch (error) {
      this.logger.warn('Failed to load tree state from Redis', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fall back to PostgreSQL
    try {
      const result: PostgresQueryResult<{
        root_node_id: string;
        current_node_id: string;
        branches: string;
        metadata: string;
      }> = await this.postgres.query(
        'SELECT root_node_id, current_node_id, branches, metadata FROM conversation_trees WHERE session_id = $1',
        [sessionId]
      );

      if (result.rows.length === 0) {
        this.logger.warn('Tree state not found in PostgreSQL', { sessionId });
        return null;
      }

      const row = result.rows[0];

      // Load all nodes for this session
      const nodesResult: PostgresQueryResult<{
        node_id: string;
        parent_id: string | null;
        child_ids: string;
        message: string;
        token_count: number;
        created_at: string;
      }> = await this.postgres.query(
        'SELECT node_id, parent_id, child_ids, message, token_count, created_at FROM conversation_nodes WHERE session_id = $1',
        [sessionId]
      );

      const nodes = new Map<string, TreeNode>();

      for (const nodeRow of nodesResult.rows) {
        nodes.set(nodeRow.node_id, {
          id: nodeRow.node_id,
          parentId: nodeRow.parent_id,
          childIds: JSON.parse(nodeRow.child_ids) as string[],
          message: JSON.parse(nodeRow.message) as TreeNode['message'],
          tokenCount: nodeRow.token_count,
          createdAt: new Date(nodeRow.created_at),
        });
      }

      const rootNode = nodes.get(row.root_node_id);
      if (!rootNode) {
        this.logger.error('Root node not found', {
          sessionId,
          rootNodeId: row.root_node_id,
        });
        return null;
      }

      const tree: ConversationTree = {
        root: rootNode,
        nodes,
        currentNodeId: row.current_node_id,
        metadata: JSON.parse(row.metadata) as ConversationTree['metadata'],
        branches: JSON.parse(row.branches) as ConversationTree['branches'],
      };

      // Restore to Redis for faster future access
      await this.saveTreeStateToRedis(sessionId, serializeTree(tree));

      this.logger.debug('Tree state loaded from PostgreSQL', {
        sessionId,
        nodeCount: nodes.size,
      });

      return tree;
    } catch (error) {
      this.logger.error('Failed to load tree state from PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Save multiple session states in a batch
   *
   * Uses Redis pipelining for efficiency and PostgreSQL transactions.
   *
   * @param sessionStates - Map of session IDs to their states
   *
   * @example
   * ```typescript
   * const states = new Map([
   *   ['session-1', state1],
   *   ['session-2', state2],
   *   ['session-3', state3]
   * ]);
   * await synchronizer.saveAll(states);
   * ```
   */
  async saveAll(sessionStates: Map<string, SynchronizerSessionState>): Promise<void> {
    this.logger.debug('Batch saving session states', { count: sessionStates.size });

    if (sessionStates.size === 0) {
      return;
    }

    // Prepare Redis pipeline
    const pipeline = this.redis.pipeline();

    // Add all Redis operations to pipeline
    for (const [sessionId, state] of Array.from(sessionStates.entries())) {
      const key = `${SESSION_STATE_KEY_PREFIX}${sessionId}${SESSION_STATE_SUFFIX}`;
      pipeline.setex(key, SESSION_STATE_TTL_SECONDS, serialize(state));
    }

    // Execute Redis pipeline
    let redisSuccess = false;
    try {
      await pipeline.exec();
      redisSuccess = true;
      this.logger.debug('Batch saved to Redis');
    } catch (error) {
      this.logger.error('Failed to batch save to Redis', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Save to PostgreSQL
    let postgresSuccess = false;
    try {
      for (const [sessionId, state] of Array.from(sessionStates.entries())) {
        await this.postgres.query(
          `INSERT INTO session_states (session_id, state, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (session_id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
          [sessionId, JSON.stringify(state)]
        );
      }
      postgresSuccess = true;
      this.logger.debug('Batch saved to PostgreSQL');
    } catch (error) {
      this.logger.error('Failed to batch save to PostgreSQL', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!redisSuccess && !postgresSuccess) {
      throw new Error('Failed to save all session states: both storages failed');
    }

    this.logger.info('Batch save completed', {
      count: sessionStates.size,
      redisSuccess,
      postgresSuccess,
    });
  }

  /**
   * Cleanup old checkpoints for a session
   *
   * Keeps only the most recent `keepCount` checkpoints and removes the rest
   * from both Redis and PostgreSQL.
   *
   * @param sessionId - The session identifier
   * @param keepCount - Number of checkpoints to keep
   * @returns The number of checkpoints deleted
   *
   * @example
   * ```typescript
   * const deleted = await synchronizer.cleanupOldCheckpoints('session-123', 10);
   * console.log(`Deleted ${deleted} old checkpoints`);
   * ```
   */
  async cleanupOldCheckpoints(sessionId: string, keepCount: number): Promise<number> {
    this.logger.debug('Cleaning up old checkpoints', { sessionId, keepCount });

    if (keepCount < 0) {
      throw new Error('keepCount must be non-negative');
    }

    // Get all checkpoint IDs from Redis list
    const listKey = `${SESSION_STATE_KEY_PREFIX}${sessionId}${CHECKPOINTS_LIST_SUFFIX}`;
    let checkpointIds: string[] = [];

    try {
      checkpointIds = await this.redis.lrange(listKey, 0, -1);
    } catch (error) {
      this.logger.warn('Failed to get checkpoint list from Redis', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fall back to PostgreSQL
      return await this.cleanupOldCheckpointsFromPostgres(sessionId, keepCount);
    }

    if (checkpointIds.length <= keepCount) {
      this.logger.debug('No checkpoints to cleanup', {
        sessionId,
        count: checkpointIds.length,
        keepCount,
      });
      return 0;
    }

    // Keep the most recent ones (list is ordered with newest first)
    const toRemove = checkpointIds.slice(keepCount);

    this.logger.debug('Removing checkpoints', {
      sessionId,
      toRemoveCount: toRemove.length,
    });

    // Delete each checkpoint
    let deletedCount = 0;

    for (const checkpointId of toRemove) {
      try {
        await this.deleteCheckpoint(checkpointId);
        deletedCount++;
      } catch (error) {
        this.logger.warn('Failed to delete checkpoint during cleanup', {
          checkpointId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Trim Redis list
    try {
      await this.redis.ltrim(listKey, 0, keepCount - 1);
    } catch (error) {
      this.logger.warn('Failed to trim checkpoint list', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.logger.info('Checkpoint cleanup completed', {
      sessionId,
      deletedCount,
      remainingCount: keepCount,
    });

    return deletedCount;
  }

  /**
   * Cleanup old checkpoints from PostgreSQL
   *
   * @private
   * @param sessionId - The session identifier
   * @param keepCount - Number of checkpoints to keep
   * @returns The number of checkpoints deleted
   */
  private async cleanupOldCheckpointsFromPostgres(
    sessionId: string,
    keepCount: number
  ): Promise<number> {
    try {
      // Get IDs of checkpoints to delete
      const result: PostgresQueryResult<{ id: string }> = await this.postgres.query(
        `SELECT id FROM checkpoints
         WHERE session_id = $1
         ORDER BY created_at DESC
         OFFSET $2`,
        [sessionId, keepCount]
      );

      const toDelete = result.rows.map((row) => row.id);

      if (toDelete.length === 0) {
        return 0;
      }

      // Delete the checkpoints
      await this.postgres.query(
        'DELETE FROM checkpoints WHERE id = ANY($1)',
        [toDelete]
      );

      return toDelete.length;
    } catch (error) {
      this.logger.error('Failed to cleanup checkpoints from PostgreSQL', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a HybridStateSynchronizer instance
 *
 * @param redis - Redis client
 * @param postgres - PostgreSQL client
 * @param logger - Logger instance
 * @returns Configured HybridStateSynchronizer
 *
 * @example
 * ```typescript
 * const synchronizer = createStateSynchronizer(redis, postgres, logger);
 * ```
 */
export function createStateSynchronizer(
  redis: RedisClient,
  postgres: PostgresClient,
  logger: Logger
): HybridStateSynchronizer {
  return new HybridStateSynchronizer(redis, postgres, logger);
}

// ============================================================================
// Default Export
// ============================================================================

export { HybridStateSynchronizer as default };
