/**
 * State Persistence Layer
 * 
 * Provides database-backed state persistence for team orchestrator with:
 * - Optimistic locking for concurrent access
 * - Audit logging for all state changes
 * - Recovery support for interrupted sessions
 * - Migration path from in-memory state
 */

import { logger } from '../utils/logger';
import { Mutex } from 'async-mutex';
import { getDb, initDatabase, type StorageConfig } from '../storage/sqlite';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface StateVersion {
  entityId: string;
  entityType: 'team' | 'agent' | 'session';
  version: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  entityType: 'team' | 'agent' | 'session' | 'system';
  entityId: string;
  action: string;
  previousState?: unknown;
  newState?: unknown;
  triggeredBy: string;
  metadata?: Record<string, unknown>;
}

export interface PersistedTeamState {
  id: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  agents: string[];
  createdAt: string;
  completedAt?: string;
  budgetAllocated?: number;
  budgetConsumed?: number;
  budgetRemaining?: number;
  metrics?: Record<string, unknown>;
  sessionTreeId?: string;
  currentBranch?: string;
  version: number;
}

export interface PersistedAgentState {
  id: string;
  status: string;
  lifecycleState: string;
  teamId?: string;
  sessionId?: string;
  model: string;
  task: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  runtime?: number;
  metadata?: Record<string, unknown>;
  version: number;
}

export interface PersistedSessionState {
  id: string;
  sessionTreeId: string;
  teamId?: string;
  branchName: string;
  entryCount: number;
  lastEntryId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RecoveryResult {
  teamsRecovered: number;
  agentsRecovered: number;
  sessionsRecovered: number;
  errors: string[];
}

export interface OptimisticLockConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export class OptimisticLockError extends Error {
  constructor(
    entityType: string,
    entityId: string,
    expectedVersion: number,
    actualVersion: number
  ) {
    super(
      `Optimistic lock failed for ${entityType} ${entityId}: ` +
      `expected version ${expectedVersion}, but found ${actualVersion}`
    );
    this.name = 'OptimisticLockError';
  }
}

// ============================================================================
// State Persistence Manager
// ============================================================================

export class StatePersistence extends EventEmitter {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;
  private dbReady: Promise<void>;
  private lockConfig: OptimisticLockConfig;
  private operationMutexes: Map<string, Mutex> = new Map();
  private storageConfig?: StorageConfig;

  constructor(lockConfig: Partial<OptimisticLockConfig> = {}, storageConfig?: StorageConfig) {
    super();
    this.lockConfig = {
      maxRetries: 5,
      baseDelayMs: 50,
      maxDelayMs: 1000,
      ...lockConfig,
    };
    this.storageConfig = storageConfig;

    this.dbReady = this.initializeDb();
  }

  private async initializeDb(): Promise<void> {
    if (this.storageConfig) {
      this.db = await initDatabase(this.storageConfig);
    } else {
      this.db = await getDb();
    }
    await this.createSchema();
  }

  private async createSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    const db = this.db;

    // State versions table for optimistic locking
    await db.run(`
      CREATE TABLE IF NOT EXISTS state_versions (
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        updated_by TEXT,
        PRIMARY KEY (entity_id, entity_type)
      )
    `);

    // Persisted team states
    await db.run(`
      CREATE TABLE IF NOT EXISTS team_states (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        config TEXT NOT NULL,
        agents TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        budget_allocated REAL,
        budget_consumed REAL,
        budget_remaining REAL,
        metrics TEXT,
        session_tree_id TEXT,
        current_branch TEXT,
        version INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Persisted agent states
    await db.run(`
      CREATE TABLE IF NOT EXISTS agent_states (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        team_id TEXT,
        session_id TEXT,
        model TEXT NOT NULL,
        task TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_error TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        paused_at TEXT,
        resumed_at TEXT,
        runtime INTEGER,
        metadata TEXT,
        version INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Persisted session states
    await db.run(`
      CREATE TABLE IF NOT EXISTS session_states (
        id TEXT PRIMARY KEY,
        session_tree_id TEXT NOT NULL,
        team_id TEXT,
        branch_name TEXT NOT NULL,
        entry_count INTEGER DEFAULT 0,
        last_entry_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Audit log table
    await db.run(`
      CREATE TABLE IF NOT EXISTS state_audit_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        previous_state TEXT,
        new_state TEXT,
        triggered_by TEXT NOT NULL,
        metadata TEXT
      )
    `);

    // Recovery checkpoint table
    await db.run(`
      CREATE TABLE IF NOT EXISTS recovery_checkpoints (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        checkpoint_data TEXT NOT NULL,
        reason TEXT
      )
    `);

    // Indexes for common queries
    await db.run(`CREATE INDEX IF NOT EXISTS idx_team_states_status ON team_states(status)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_agent_states_team ON agent_states(team_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_agent_states_status ON agent_states(status)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_session_states_team ON session_states(team_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON state_audit_log(entity_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON state_audit_log(timestamp)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_recovery_entity ON recovery_checkpoints(entity_id)`);
  }

  private async ensureDb(): Promise<Awaited<ReturnType<typeof getDb>>> {
    await this.dbReady;
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  private getOperationMutex(key: string): Mutex {
    if (!this.operationMutexes.has(key)) {
      this.operationMutexes.set(key, new Mutex());
    }
    return this.operationMutexes.get(key)!;
  }

  private async withOptimisticLock<T>(
    entityType: 'team' | 'agent' | 'session',
    entityId: string,
    expectedVersion: number,
    operation: () => Promise<T>
  ): Promise<T> {
    const db = await this.ensureDb();
    let retries = 0;

    while (retries < this.lockConfig.maxRetries) {
      // Verify version before operation
      const currentVersion = await this.getVersion(entityType, entityId);
      
      if (currentVersion !== null && currentVersion !== expectedVersion) {
        if (retries === this.lockConfig.maxRetries - 1) {
          throw new OptimisticLockError(entityType, entityId, expectedVersion, currentVersion);
        }

        // Exponential backoff
        const delay = Math.min(
          this.lockConfig.baseDelayMs * Math.pow(2, retries),
          this.lockConfig.maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        continue;
      }

      try {
        const result = await operation();
        return result;
      } catch (error) {
        if (error instanceof OptimisticLockError && retries < this.lockConfig.maxRetries - 1) {
          const delay = Math.min(
            this.lockConfig.baseDelayMs * Math.pow(2, retries),
            this.lockConfig.maxDelayMs
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        }
        throw error;
      }
    }

    throw new OptimisticLockError(entityType, entityId, expectedVersion, -1);
  }

  // ============================================================================
  // Version Management
  // ============================================================================

  async getVersion(entityType: string, entityId: string): Promise<number | null> {
    const db = await this.ensureDb();
    const row = await db.get(
      'SELECT version FROM state_versions WHERE entity_id = ? AND entity_type = ?',
      [entityId, entityType]
    );
    return row?.version ?? null;
  }

  async incrementVersion(
    entityType: 'team' | 'agent' | 'session',
    entityId: string,
    updatedBy?: string
  ): Promise<number> {
    const db = await this.ensureDb();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO state_versions (entity_id, entity_type, version, updated_at, updated_by)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(entity_id, entity_type) DO UPDATE SET
       version = version + 1, updated_at = ?, updated_by = ?`,
      [entityId, entityType, now, updatedBy, now, updatedBy]
    );

    const row = await db.get(
      'SELECT version FROM state_versions WHERE entity_id = ? AND entity_type = ?',
      [entityId, entityType]
    );

    return row.version;
  }

  // ============================================================================
  // Audit Logging
  // ============================================================================

  async logStateChange(
    entityType: 'team' | 'agent' | 'session' | 'system',
    entityId: string,
    action: string,
    triggeredBy: string,
    previousState?: unknown,
    newState?: unknown,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const db = await this.ensureDb();
    const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    await db.run(
      `INSERT INTO state_audit_log 
       (id, timestamp, entity_type, entity_id, action, previous_state, new_state, triggered_by, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        timestamp,
        entityType,
        entityId,
        action,
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        triggeredBy,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    this.emit('audit.logged', { id, entityType, entityId, action });
  }

  async getAuditLog(
    entityId?: string,
    options: { limit?: number; since?: Date } = {}
  ): Promise<AuditLogEntry[]> {
    const db = await this.ensureDb();
    let query = 'SELECT * FROM state_audit_log';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (entityId) {
      conditions.push('entity_id = ?');
      params.push(entityId);
    }

    if (options.since) {
      conditions.push('timestamp >= ?');
      params.push(options.since.toISOString());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = await db.all(query, params);
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      previousState: row.previous_state ? JSON.parse(row.previous_state) : undefined,
      newState: row.new_state ? JSON.parse(row.new_state) : undefined,
      triggeredBy: row.triggered_by,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  // ============================================================================
  // Team State Persistence
  // ============================================================================

  async persistTeam(
    team: PersistedTeamState,
    triggeredBy: string = 'system'
  ): Promise<void> {
    const db = await this.ensureDb();
    const mutex = this.getOperationMutex(`team:${team.id}`);

    await mutex.runExclusive(async () => {
      // Get current version
      const currentVersion = await this.getVersion('team', team.id);
      const newVersion = currentVersion !== null ? currentVersion + 1 : 1;

      // Log state change before updating
      if (currentVersion !== null) {
        const previousState = await this.loadTeam(team.id);
        await this.logStateChange(
          'team',
          team.id,
          'update',
          triggeredBy,
          previousState as unknown,
          team as unknown,
          { version: newVersion }
        );
      } else {
        await this.logStateChange('team', team.id, 'create', triggeredBy, undefined, team as unknown);
      }

      // Upsert team state
      await db.run(
        `INSERT INTO team_states 
         (id, name, status, config, agents, created_at, completed_at, 
          budget_allocated, budget_consumed, budget_remaining, metrics, 
          session_tree_id, current_branch, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         status = excluded.status,
         config = excluded.config,
         agents = excluded.agents,
         completed_at = excluded.completed_at,
         budget_consumed = excluded.budget_consumed,
         budget_remaining = excluded.budget_remaining,
         metrics = excluded.metrics,
         session_tree_id = excluded.session_tree_id,
         current_branch = excluded.current_branch,
         version = excluded.version`,
        [
          team.id,
          team.name,
          team.status,
          JSON.stringify(team.config),
          JSON.stringify(team.agents),
          team.createdAt,
          team.completedAt || null,
          team.budgetAllocated || null,
          team.budgetConsumed || null,
          team.budgetRemaining || null,
          team.metrics ? JSON.stringify(team.metrics) : null,
          team.sessionTreeId || null,
          team.currentBranch || null,
          newVersion,
        ]
      );

      // Update version tracking
      await this.incrementVersion('team', team.id, triggeredBy);

      this.emit('team.persisted', { id: team.id, version: newVersion });
    });
  }

  async loadTeam(id: string): Promise<PersistedTeamState | undefined> {
    const db = await this.ensureDb();
    const row = await db.get('SELECT * FROM team_states WHERE id = ?', [id]);

    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      config: JSON.parse(row.config),
      agents: JSON.parse(row.agents),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      budgetAllocated: row.budget_allocated,
      budgetConsumed: row.budget_consumed,
      budgetRemaining: row.budget_remaining,
      metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
      sessionTreeId: row.session_tree_id,
      currentBranch: row.current_branch,
      version: row.version,
    };
  }

  async loadActiveTeams(): Promise<PersistedTeamState[]> {
    const db = await this.ensureDb();
    const rows = await db.all(
      `SELECT * FROM team_states 
       WHERE status IN ('active', 'scaling', 'paused', 'creating')
       ORDER BY created_at DESC`
    );

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      status: row.status,
      config: JSON.parse(row.config),
      agents: JSON.parse(row.agents),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      budgetAllocated: row.budget_allocated,
      budgetConsumed: row.budget_consumed,
      budgetRemaining: row.budget_remaining,
      metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
      sessionTreeId: row.session_tree_id,
      currentBranch: row.current_branch,
      version: row.version,
    }));
  }

  async updateTeamStatus(
    id: string,
    status: string,
    triggeredBy: string = 'system',
    expectedVersion?: number
  ): Promise<void> {
    const operation = async () => {
      const db = await this.ensureDb();
      const previousState = await this.loadTeam(id);

      if (!previousState) {
        throw new Error(`Team ${id} not found`);
      }

      const newVersion = previousState.version + 1;

      await db.run(
        `UPDATE team_states 
         SET status = ?, version = ?
         WHERE id = ?`,
        [status, newVersion, id]
      );

      await this.incrementVersion('team', id, triggeredBy);

      await this.logStateChange(
        'team',
        id,
        'status_change',
        triggeredBy,
        { status: previousState.status },
        { status },
        { version: newVersion }
      );

      this.emit('team.status_changed', { id, status, previousStatus: previousState.status });
    };

    if (expectedVersion !== undefined) {
      await this.withOptimisticLock('team', id, expectedVersion, operation);
    } else {
      await operation();
    }
  }

  // ============================================================================
  // Agent State Persistence
  // ============================================================================

  async persistAgent(
    agent: PersistedAgentState,
    triggeredBy: string = 'system'
  ): Promise<void> {
    const db = await this.ensureDb();
    const mutex = this.getOperationMutex(`agent:${agent.id}`);

    await mutex.runExclusive(async () => {
      const currentVersion = await this.getVersion('agent', agent.id);
      const newVersion = currentVersion !== null ? currentVersion + 1 : 1;

      if (currentVersion !== null) {
        const previousState = await this.loadAgent(agent.id);
        await this.logStateChange(
          'agent',
          agent.id,
          'update',
          triggeredBy,
          previousState as unknown,
          agent as unknown,
          { version: newVersion }
        );
      } else {
        await this.logStateChange('agent', agent.id, 'create', triggeredBy, undefined, agent as unknown);
      }

      await db.run(
        `INSERT INTO agent_states 
         (id, status, lifecycle_state, team_id, session_id, model, task, 
          retry_count, max_retries, last_error, created_at, started_at, 
          completed_at, paused_at, resumed_at, runtime, metadata, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         lifecycle_state = excluded.lifecycle_state,
         team_id = excluded.team_id,
         session_id = excluded.session_id,
         retry_count = excluded.retry_count,
         last_error = excluded.last_error,
         started_at = excluded.started_at,
         completed_at = excluded.completed_at,
         paused_at = excluded.paused_at,
         resumed_at = excluded.resumed_at,
         runtime = excluded.runtime,
         metadata = excluded.metadata,
         version = excluded.version`,
        [
          agent.id,
          agent.status,
          agent.lifecycleState,
          agent.teamId || null,
          agent.sessionId || null,
          agent.model,
          agent.task,
          agent.retryCount,
          agent.maxRetries,
          agent.lastError || null,
          agent.createdAt,
          agent.startedAt || null,
          agent.completedAt || null,
          agent.pausedAt || null,
          agent.resumedAt || null,
          agent.runtime || null,
          agent.metadata ? JSON.stringify(agent.metadata) : null,
          newVersion,
        ]
      );

      await this.incrementVersion('agent', agent.id, triggeredBy);
      this.emit('agent.persisted', { id: agent.id, version: newVersion });
    });
  }

  async loadAgent(id: string): Promise<PersistedAgentState | undefined> {
    const db = await this.ensureDb();
    const row = await db.get('SELECT * FROM agent_states WHERE id = ?', [id]);

    if (!row) return undefined;

    return {
      id: row.id,
      status: row.status,
      lifecycleState: row.lifecycle_state,
      teamId: row.team_id,
      sessionId: row.session_id,
      model: row.model,
      task: row.task,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      lastError: row.last_error,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      pausedAt: row.paused_at,
      resumedAt: row.resumed_at,
      runtime: row.runtime,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      version: row.version,
    };
  }

  async loadAgentsByTeam(teamId: string): Promise<PersistedAgentState[]> {
    const db = await this.ensureDb();
    const rows = await db.all(
      'SELECT * FROM agent_states WHERE team_id = ? ORDER BY created_at DESC',
      [teamId]
    );

    return rows.map(row => ({
      id: row.id,
      status: row.status,
      lifecycleState: row.lifecycle_state,
      teamId: row.team_id,
      sessionId: row.session_id,
      model: row.model,
      task: row.task,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      lastError: row.last_error,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      pausedAt: row.paused_at,
      resumedAt: row.resumed_at,
      runtime: row.runtime,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      version: row.version,
    }));
  }

  async loadActiveAgents(): Promise<PersistedAgentState[]> {
    const db = await this.ensureDb();
    const rows = await db.all(
      `SELECT * FROM agent_states 
       WHERE status IN ('running', 'spawning', 'paused', 'retrying')
       ORDER BY created_at DESC`
    );

    return rows.map(row => ({
      id: row.id,
      status: row.status,
      lifecycleState: row.lifecycle_state,
      teamId: row.team_id,
      sessionId: row.session_id,
      model: row.model,
      task: row.task,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      lastError: row.last_error,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      pausedAt: row.paused_at,
      resumedAt: row.resumed_at,
      runtime: row.runtime,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      version: row.version,
    }));
  }

  async updateAgentStatus(
    id: string,
    status: string,
    lifecycleState: string,
    triggeredBy: string = 'system',
    expectedVersion?: number
  ): Promise<void> {
    const operation = async () => {
      const db = await this.ensureDb();
      const previousState = await this.loadAgent(id);

      if (!previousState) {
        throw new Error(`Agent ${id} not found`);
      }

      const newVersion = previousState.version + 1;

      await db.run(
        `UPDATE agent_states 
         SET status = ?, lifecycle_state = ?, version = ?
         WHERE id = ?`,
        [status, lifecycleState, newVersion, id]
      );

      await this.incrementVersion('agent', id, triggeredBy);

      await this.logStateChange(
        'agent',
        id,
        'status_change',
        triggeredBy,
        { status: previousState.status, lifecycleState: previousState.lifecycleState },
        { status, lifecycleState },
        { version: newVersion }
      );

      this.emit('agent.status_changed', { id, status, lifecycleState });
    };

    if (expectedVersion !== undefined) {
      await this.withOptimisticLock('agent', id, expectedVersion, operation);
    } else {
      await operation();
    }
  }

  // ============================================================================
  // Session State Persistence
  // ============================================================================

  async persistSession(
    session: PersistedSessionState,
    triggeredBy: string = 'system'
  ): Promise<void> {
    const db = await this.ensureDb();
    const mutex = this.getOperationMutex(`session:${session.id}`);

    await mutex.runExclusive(async () => {
      const currentVersion = await this.getVersion('session', session.id);
      const newVersion = currentVersion !== null ? currentVersion + 1 : 1;

      if (currentVersion !== null) {
        const previousState = await this.loadSession(session.id);
        await this.logStateChange(
          'session',
          session.id,
          'update',
          triggeredBy,
          previousState as unknown,
          session as unknown,
          { version: newVersion }
        );
      } else {
        await this.logStateChange('session', session.id, 'create', triggeredBy, undefined, session as unknown);
      }

      await db.run(
        `INSERT INTO session_states 
         (id, session_tree_id, team_id, branch_name, entry_count, 
          last_entry_id, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
         session_tree_id = excluded.session_tree_id,
         team_id = excluded.team_id,
         branch_name = excluded.branch_name,
         entry_count = excluded.entry_count,
         last_entry_id = excluded.last_entry_id,
         updated_at = excluded.updated_at,
         version = excluded.version`,
        [
          session.id,
          session.sessionTreeId,
          session.teamId || null,
          session.branchName,
          session.entryCount,
          session.lastEntryId || null,
          session.createdAt,
          session.updatedAt,
          newVersion,
        ]
      );

      await this.incrementVersion('session', session.id, triggeredBy);
      this.emit('session.persisted', { id: session.id, version: newVersion });
    });
  }

  async loadSession(id: string): Promise<PersistedSessionState | undefined> {
    const db = await this.ensureDb();
    const row = await db.get('SELECT * FROM session_states WHERE id = ?', [id]);

    if (!row) return undefined;

    return {
      id: row.id,
      sessionTreeId: row.session_tree_id,
      teamId: row.team_id,
      branchName: row.branch_name,
      entryCount: row.entry_count,
      lastEntryId: row.last_entry_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
    };
  }

  async loadSessionsByTeam(teamId: string): Promise<PersistedSessionState[]> {
    const db = await this.ensureDb();
    const rows = await db.all(
      'SELECT * FROM session_states WHERE team_id = ? ORDER BY created_at DESC',
      [teamId]
    );

    return rows.map(row => ({
      id: row.id,
      sessionTreeId: row.session_tree_id,
      teamId: row.team_id,
      branchName: row.branch_name,
      entryCount: row.entry_count,
      lastEntryId: row.last_entry_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
    }));
  }

  // ============================================================================
  // Recovery Operations
  // ============================================================================

  async createCheckpoint(
    entityType: 'team' | 'agent' | 'session',
    entityId: string,
    data: Record<string, unknown>,
    reason?: string
  ): Promise<void> {
    const db = await this.ensureDb();
    const id = `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    await db.run(
      `INSERT INTO recovery_checkpoints (id, timestamp, entity_type, entity_id, checkpoint_data, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, timestamp, entityType, entityId, JSON.stringify(data), reason || null]
    );

    this.emit('checkpoint.created', { id, entityType, entityId, reason });
  }

  async getLatestCheckpoint(
    entityId: string
  ): Promise<{ id: string; data: Record<string, unknown>; timestamp: string } | undefined> {
    const db = await this.ensureDb();
    const row = await db.get(
      `SELECT * FROM recovery_checkpoints 
       WHERE entity_id = ? 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [entityId]
    );

    if (!row) return undefined;

    return {
      id: row.id,
      data: JSON.parse(row.checkpoint_data),
      timestamp: row.timestamp,
    };
  }

  async recoverAll(): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      teamsRecovered: 0,
      agentsRecovered: 0,
      sessionsRecovered: 0,
      errors: [],
    };

    try {
      await this.logStateChange('system', 'recovery', 'start', 'system');

      // Recover active teams
      const activeTeams = await this.loadActiveTeams();
      result.teamsRecovered = activeTeams.length;

      for (const team of activeTeams) {
        try {
          this.emit('recovery.team', team);
        } catch (error) {
          result.errors.push(`Failed to recover team ${team.id}: ${error}`);
        }
      }

      // Recover active agents
      const activeAgents = await this.loadActiveAgents();
      result.agentsRecovered = activeAgents.length;

      for (const agent of activeAgents) {
        try {
          this.emit('recovery.agent', agent);
        } catch (error) {
          result.errors.push(`Failed to recover agent ${agent.id}: ${error}`);
        }
      }

      // Recover sessions
      const db = await this.ensureDb();
      const sessions = await db.all(
        'SELECT * FROM session_states ORDER BY created_at DESC'
      );
      result.sessionsRecovered = sessions.length;

      for (const session of sessions) {
        try {
          this.emit('recovery.session', {
            id: session.id,
            sessionTreeId: session.session_tree_id,
            teamId: session.team_id,
            branchName: session.branch_name,
          });
        } catch (error) {
          result.errors.push(`Failed to recover session ${session.id}: ${error}`);
        }
      }

      await this.logStateChange('system', 'recovery', 'complete', 'system', undefined, {
        teamsRecovered: result.teamsRecovered,
        agentsRecovered: result.agentsRecovered,
        sessionsRecovered: result.sessionsRecovered,
      });

      this.emit('recovery.complete', result);
      logger.info(`[StatePersistence] Recovery complete: ${result.teamsRecovered} teams, ${result.agentsRecovered} agents, ${result.sessionsRecovered} sessions`);
    } catch (error) {
      const errorMsg = `Recovery failed: ${error}`;
      result.errors.push(errorMsg);
      logger.error(`[StatePersistence] ${errorMsg}`);
      throw error;
    }

    return result;
  }

  // ============================================================================
  // Rollback Operations
  // ============================================================================

  async rollbackToVersion(
    entityType: 'team' | 'agent' | 'session',
    entityId: string,
    targetVersion: number,
    triggeredBy: string = 'system'
  ): Promise<boolean> {
    const db = await this.ensureDb();

    // Get audit log entries to find the state at that version
    const entries = await this.getAuditLog(entityId);
    const targetEntry = entries.find(
      e => e.metadata?.['version'] === targetVersion || e.action === 'create'
    );

    if (!targetEntry || !targetEntry.previousState) {
      return false;
    }

    // Create checkpoint before rollback
    let currentState: Record<string, unknown> | undefined;
    if (entityType === 'team') {
      const team = await this.loadTeam(entityId);
      currentState = team as unknown as Record<string, unknown>;
    } else if (entityType === 'agent') {
      const agent = await this.loadAgent(entityId);
      currentState = agent as unknown as Record<string, unknown>;
    } else if (entityType === 'session') {
      const session = await this.loadSession(entityId);
      currentState = session as unknown as Record<string, unknown>;
    }

    if (currentState) {
      await this.createCheckpoint(entityType, entityId, currentState, 'pre_rollback');
    }

    // Apply rollback
    await this.logStateChange(
      entityType,
      entityId,
      'rollback',
      triggeredBy,
      currentState as unknown,
      targetEntry.previousState as unknown,
      { targetVersion }
    );

    this.emit('rollback.completed', { entityType, entityId, targetVersion });
    return true;
  }

  // ============================================================================
  // Migration Support
  // ============================================================================

  async migrateFromMemory(options: {
    teams: Array<{
      id: string;
      name: string;
      status: string;
      config: Record<string, unknown>;
      agents: string[];
      createdAt: Date;
      completedAt?: Date;
      budget: { allocated: number; consumed: number; remaining: number };
      metrics: Record<string, unknown>;
      sessionTreeId?: string;
      currentBranch?: string;
    }>;
    agentStates: Array<{
      id: string;
      status: string;
      lifecycleState: string;
      agent: {
        model: string;
        task: string;
        teamId?: string;
        parentId?: string;
        metadata: Record<string, unknown>;
      };
      sessionId?: string;
      retryCount: number;
      maxRetries: number;
      lastError?: string;
      createdAt: Date;
      startedAt?: Date;
      completedAt?: Date;
      pausedAt?: Date;
      resumedAt?: Date;
    }>;
  }): Promise<{ teams: number; agents: number }> {
    let teamsMigrated = 0;
    let agentsMigrated = 0;

    await this.logStateChange('system', 'migration', 'start', 'system');

    for (const team of options.teams) {
      try {
        await this.persistTeam(
          {
            id: team.id,
            name: team.name,
            status: team.status,
            config: team.config,
            agents: team.agents,
            createdAt: team.createdAt.toISOString(),
            completedAt: team.completedAt?.toISOString(),
            budgetAllocated: team.budget.allocated,
            budgetConsumed: team.budget.consumed,
            budgetRemaining: team.budget.remaining,
            metrics: team.metrics,
            sessionTreeId: team.sessionTreeId,
            currentBranch: team.currentBranch,
            version: 1,
          },
          'migration'
        );
        teamsMigrated++;
      } catch (error) {
        logger.error(`[StatePersistence] Failed to migrate team ${team.id}: ${error}`);
      }
    }

    for (const state of options.agentStates) {
      try {
        await this.persistAgent(
          {
            id: state.id,
            status: state.status,
            lifecycleState: state.lifecycleState,
            teamId: state.agent.teamId,
            sessionId: state.sessionId,
            model: state.agent.model,
            task: state.agent.task,
            retryCount: state.retryCount,
            maxRetries: state.maxRetries,
            lastError: state.lastError,
            createdAt: state.createdAt.toISOString(),
            startedAt: state.startedAt?.toISOString(),
            completedAt: state.completedAt?.toISOString(),
            pausedAt: state.pausedAt?.toISOString(),
            resumedAt: state.resumedAt?.toISOString(),
            metadata: state.agent.metadata,
            version: 1,
          },
          'migration'
        );
        agentsMigrated++;
      } catch (error) {
        logger.error(`[StatePersistence] Failed to migrate agent ${state.id}: ${error}`);
      }
    }

    await this.logStateChange(
      'system',
      'migration',
      'complete',
      'system',
      undefined,
      { teamsMigrated, agentsMigrated }
    );

    this.emit('migration.complete', { teams: teamsMigrated, agents: agentsMigrated });
    logger.info(`[StatePersistence] Migration complete: ${teamsMigrated} teams, ${agentsMigrated} agents`);

    return { teams: teamsMigrated, agents: agentsMigrated };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async cleanup(maxAgeHours: number = 24): Promise<{
    teamsDeleted: number;
    agentsDeleted: number;
    sessionsDeleted: number;
    checkpointsDeleted: number;
  }> {
    const db = await this.ensureDb();
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

    const teamsResult = await db.run(
      "DELETE FROM swarm_states WHERE status IN ('completed', 'failed', 'destroyed') AND completed_at < ?",
      [cutoff]
    );

    const agentsResult = await db.run(
      "DELETE FROM agent_states WHERE status IN ('completed', 'failed', 'killed') AND completed_at < ?",
      [cutoff]
    );

    const sessionsResult = await db.run(
      'DELETE FROM session_states WHERE updated_at < ?',
      [cutoff]
    );

    const checkpointsResult = await db.run(
      'DELETE FROM recovery_checkpoints WHERE timestamp < ?',
      [cutoff]
    );

    const result = {
      teamsDeleted: teamsResult.changes || 0,
      agentsDeleted: agentsResult.changes || 0,
      sessionsDeleted: sessionsResult.changes || 0,
      checkpointsDeleted: checkpointsResult.changes || 0,
    };

    logger.info(`[StatePersistence] Cleanup complete: ${JSON.stringify(result)}`);
    return result;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalStatePersistence: StatePersistence | null = null;

export function getGlobalStatePersistence(
  lockConfig?: Partial<OptimisticLockConfig>
): StatePersistence {
  if (!globalStatePersistence) {
    globalStatePersistence = new StatePersistence(lockConfig);
  }
  return globalStatePersistence;
}

export function resetGlobalStatePersistence(): void {
  globalStatePersistence = null;
}

export default StatePersistence;
