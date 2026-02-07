/**
 * State-Aware Team Orchestrator
 * 
 * Extended TeamOrchestrator with full state persistence integration.
 * Replaces in-memory state with database-backed persistence.
 */

import { logger } from '../utils/logger';
import { TeamOrchestrator, Team, TeamConfig, TeamState, TeamStatusInfo } from './team-orchestrator';
import { StatePersistence, PersistedTeamState, PersistedAgentState, RecoveryResult, getGlobalStatePersistence } from './state-persistence';
import { AgentLifecycle, AgentState, LifecycleState } from './lifecycle';
import { MessageBus } from '../bus/index';
import { AgentStorage } from '../storage/memory';
import { AgentEventBus } from './event-bus';
import { SessionTree } from './session-tree';
import { TeamRepository } from '../storage';
import { AgentStatus, CreateAgentOptions, Agent } from '../models/agent';
import { safeExecute, TeamNotFoundError } from '../errors';

// ============================================================================
// Configuration
// ============================================================================

export interface StateAwareOrchestratorConfig {
  /** Enable state persistence (default: true) */
  enablePersistence: boolean;
  /** Enable automatic recovery on startup (default: true) */
  enableRecovery: boolean;
  /** Enable optimistic locking (default: true) */
  enableOptimisticLocking: boolean;
  /** Enable audit logging (default: true) */
  enableAuditLog: boolean;
  /** Maximum retries for optimistic locking conflicts */
  maxLockRetries: number;
  /** Feature flags for gradual rollout */
  featureFlags: {
    /** Use database for team state */
    useDatabaseTeams: boolean;
    /** Use database for agent state */
    useDatabaseAgents: boolean;
    /** Use database for session state */
    useDatabaseSessions: boolean;
  };
}

export const DEFAULT_STATE_CONFIG: StateAwareOrchestratorConfig = {
  enablePersistence: true,
  enableRecovery: true,
  enableOptimisticLocking: true,
  enableAuditLog: true,
  maxLockRetries: 5,
  featureFlags: {
    useDatabaseTeams: true,
    useDatabaseAgents: true,
    useDatabaseSessions: true,
  },
};

// ============================================================================
// Recovery Context
// ============================================================================

export interface RecoveryContext {
  recoveredTeams: Map<string, Team>;
  recoveredAgents: Map<string, AgentState>;
  recoveredSessions: Map<string, SessionTree>;
  orphanedAgents: string[];
  errors: string[];
}

// ============================================================================
// State-Aware Orchestrator
// ============================================================================

export class StateAwareOrchestrator extends TeamOrchestrator {
  private statePersistence: StatePersistence;
  private stateConfig: StateAwareOrchestratorConfig;
  private recoveryContext: RecoveryContext = {
    recoveredTeams: new Map(),
    recoveredAgents: new Map(),
    recoveredSessions: new Map(),
    orphanedAgents: [],
    errors: [],
  };
  private persistenceInitialized: boolean = false;

  constructor(
    agentLifecycle: AgentLifecycle,
    messageBus: MessageBus,
    storage: AgentStorage,
    statePersistence: StatePersistence,
    config: Partial<StateAwareOrchestratorConfig> = {},
    eventBus?: AgentEventBus,
    sessionTree?: SessionTree,
    swarmRepository?: TeamRepository
  ) {
    super({
      agentLifecycle,
      messageBus,
      storage,
      eventBus,
      sessionTree,
      swarmRepository,
    });

    this.statePersistence = statePersistence;
    this.stateConfig = { ...DEFAULT_STATE_CONFIG, ...config };

    // Subscribe to persistence events
    this.setupPersistenceListeners();
  }

  private setupPersistenceListeners(): void {
    // Log persistence events
    this.statePersistence.on('team.persisted', ({ id, version }) => {
      logger.debug(`[StateAwareOrchestrator] Team ${id} persisted (v${version})`);
    });

    this.statePersistence.on('agent.persisted', ({ id, version }) => {
      logger.debug(`[StateAwareOrchestrator] Agent ${id} persisted (v${version})`);
    });

    this.statePersistence.on('audit.logged', ({ entityType, entityId, action }) => {
      logger.debug(`[StateAwareOrchestrator] Audit: ${action} on ${entityType} ${entityId}`);
    });

    // Recovery handlers must be registered before recoverAll() emits events.
    this.statePersistence.on('recovery.team', (persistedTeam: PersistedTeamState) => {
      this.recoverTeam(persistedTeam);
    });

    this.statePersistence.on('recovery.agent', (persistedAgent: PersistedAgentState) => {
      this.recoverAgent(persistedAgent);
    });

    this.statePersistence.on('recovery.session', (sessionData: { id: string; sessionTreeId: string }) => {
      this.recoverSession(sessionData);
    });
  }

  // ============================================================================
  // Lifecycle Overrides
  // ============================================================================

  /**
   * Start the orchestrator with state recovery
   */
  async start(): Promise<RecoveryResult> {
    super.start();
    
    let recoveryResult: RecoveryResult = {
      teamsRecovered: 0,
      agentsRecovered: 0,
      sessionsRecovered: 0,
      errors: [],
    };

    if (this.stateConfig.enablePersistence && this.stateConfig.enableRecovery) {
      try {
        recoveryResult = await this.performRecovery();
        this.persistenceInitialized = true;
      } catch (error) {
        logger.error(`[StateAwareOrchestrator] Recovery failed: ${error}`);
        recoveryResult.errors.push(`Recovery failed: ${error}`);
      }
    }

    return recoveryResult;
  }

  /**
   * Stop the orchestrator with state checkpointing
   */
  stop(): void {
    if (this.stateConfig.enablePersistence) {
      this.createCheckpoints().catch(err => {
        logger.error(`[StateAwareOrchestrator] Failed to create checkpoints: ${err}`);
      });
    }
    super.stop();
  }

  // ============================================================================
  // Recovery
  // ============================================================================

  /**
   * Perform state recovery from database
   */
  private async performRecovery(): Promise<RecoveryResult> {
    logger.info('[StateAwareOrchestrator] Starting state recovery...');
    return this.statePersistence.recoverAll();
  }

  private recoverTeam(persistedTeam: PersistedTeamState): void {
    try {
      // Convert persisted state back to runtime state
      const team: any = {
        id: persistedTeam.id,
        name: persistedTeam.name,
        status: persistedTeam.status as TeamState,
        config: persistedTeam.config as unknown as TeamConfig,
        agents: persistedTeam.agents,
        createdAt: new Date(persistedTeam.createdAt),
        completedAt: persistedTeam.completedAt ? new Date(persistedTeam.completedAt) : undefined,
        budget: {
          allocated: persistedTeam.budgetAllocated || 0,
          consumed: persistedTeam.budgetConsumed || 0,
          remaining: persistedTeam.budgetRemaining || 0,
        },
        metrics: persistedTeam.metrics as Team['metrics'] || {
          totalAgents: persistedTeam.agents.length,
          completedAgents: 0,
          failedAgents: 0,
        },
        sessionTreeId: persistedTeam.sessionTreeId,
        currentBranch: persistedTeam.currentBranch,
      };

      // Restore in-memory state
      // @ts-ignore - accessing private parent field
      this.teams.set(team.id, team);
      // @ts-ignore - accessing private parent field
      this.getMutex(team.id);

      this.recoveryContext.recoveredTeams.set(team.id, team);
      logger.info(`[StateAwareOrchestrator] Recovered team ${team.id} with ${team.agents.length} agents`);

      // Resume team if it was active
      if (team.status === 'creating' || team.status === 'scaling') {
        team.status = 'active';
        this.persistTeamState(team, 'recovery').catch(err => {
          logger.error(`[StateAwareOrchestrator] Failed to persist recovered team: ${err}`);
        });
      }
    } catch (error) {
      this.recoveryContext.errors.push(`Failed to recover team ${persistedTeam.id}: ${error}`);
      logger.error(`[StateAwareOrchestrator] Failed to recover team: ${error}`);
    }
  }

  private recoverAgent(persistedAgent: PersistedAgentState): void {
    try {
      // Restore agent state in lifecycle manager
      const state: AgentState = {
        id: persistedAgent.id,
        status: persistedAgent.status as AgentStatus,
        lifecycleState: persistedAgent.lifecycleState as LifecycleState,
        agent: {
          id: persistedAgent.id,
          model: persistedAgent.model,
          task: persistedAgent.task,
          status: persistedAgent.status as AgentStatus,
          teamId: persistedAgent.teamId,
          spawnedAt: new Date(persistedAgent.createdAt),
          completedAt: persistedAgent.completedAt ? new Date(persistedAgent.completedAt) : undefined,
          metadata: persistedAgent.metadata || {},
          // Required Agent fields
          label: persistedAgent.metadata?.['label'] as string,
          parentId: persistedAgent.metadata?.['parentId'] as string,
          childIds: (persistedAgent.metadata?.['childIds'] as string[]) || [],
          context: persistedAgent.metadata?.['context'] as Agent['context'] || {
            inputContext: [],
            outputContext: [],
            sharedContext: [],
            contextSize: 0,
            contextWindow: 100000,
            contextUsage: 0,
          },
          code: persistedAgent.metadata?.['code'] as Agent['code'],
          reasoning: persistedAgent.metadata?.['reasoning'] as Agent['reasoning'] || {
            traces: [],
            decisions: [],
            confidence: 1.0,
          },
          retryCount: persistedAgent.retryCount,
          maxRetries: persistedAgent.maxRetries,
          budgetLimit: persistedAgent.metadata?.['budgetLimit'] as number,
          safetyBoundaries: persistedAgent.metadata?.['safetyBoundaries'] as Agent['safetyBoundaries'],
          runtime: persistedAgent.runtime || 0,
          pauseTime: persistedAgent.pausedAt ? new Date(persistedAgent.pausedAt) : undefined,
          pausedBy: persistedAgent.metadata?.['pausedBy'] as string,
          lastError: persistedAgent.lastError,
        },
        sessionId: persistedAgent.sessionId,
        retryCount: persistedAgent.retryCount,
        maxRetries: persistedAgent.maxRetries,
        lastError: persistedAgent.lastError,
        createdAt: new Date(persistedAgent.createdAt),
        startedAt: persistedAgent.startedAt ? new Date(persistedAgent.startedAt) : undefined,
        completedAt: persistedAgent.completedAt ? new Date(persistedAgent.completedAt) : undefined,
        pausedAt: persistedAgent.pausedAt ? new Date(persistedAgent.pausedAt) : undefined,
        resumedAt: persistedAgent.resumedAt ? new Date(persistedAgent.resumedAt) : undefined,
      };

      this.recoveryContext.recoveredAgents.set(state.id, state);
      logger.info(`[StateAwareOrchestrator] Recovered agent ${state.id} in ${state.lifecycleState} state`);

      // Handle interrupted agents
      if (state.lifecycleState === 'running' || state.lifecycleState === 'spawning') {
        // Mark as failed - will need to be restarted
        state.lifecycleState = 'failed';
        state.status = AgentStatus.FAILED;
        state.lastError = 'Agent interrupted by orchestrator restart';
        state.completedAt = new Date();

        this.persistAgentState(state, 'recovery_interrupted').catch(err => {
          logger.error(`[StateAwareOrchestrator] Failed to persist interrupted agent: ${err}`);
        });
      }
    } catch (error) {
      this.recoveryContext.errors.push(`Failed to recover agent ${persistedAgent.id}: ${error}`);
      logger.error(`[StateAwareOrchestrator] Failed to recover agent: ${error}`);
    }
  }

  private recoverSession(sessionData: { id: string; sessionTreeId: string }): void {
    // Sessions are file-based, just log that we found it
    logger.info(`[StateAwareOrchestrator] Found session ${sessionData.id} with tree ${sessionData.sessionTreeId}`);
    this.recoveryContext.recoveredSessions.set(sessionData.id, sessionData as unknown as SessionTree);
  }

  // ============================================================================
  // Persistence Hooks
  // ============================================================================

  /**
   * Persist team state to database
   */
  private async persistTeamState(team: Team, triggeredBy: string = 'system'): Promise<void> {
    if (!this.stateConfig.enablePersistence || !this.stateConfig.featureFlags.useDatabaseTeams) {
      return;
    }

    await this.statePersistence.persistTeam(
      {
        id: team.id,
        name: team.name,
        status: team.status,
        config: (team as any).config as unknown as Record<string, unknown>,
        agents: team.agents,
        createdAt: (team as any).createdAt.toISOString(),
        completedAt: (team as any).completedAt?.toISOString(),
        budgetAllocated: (team as any).budget.allocated,
        budgetConsumed: (team as any).budget.consumed,
        budgetRemaining: (team as any).budget.remaining,
        metrics: (team as any).metrics as Record<string, unknown>,
        sessionTreeId: (team as any).sessionTreeId,
        currentBranch: (team as any).currentBranch,
        version: 1, // Will be incremented by persistence layer
      },
      triggeredBy
    );
  }

  /**
   * Persist agent state to database
   */
  private async persistAgentState(agentState: AgentState, triggeredBy: string = 'system'): Promise<void> {
    if (!this.stateConfig.enablePersistence || !this.stateConfig.featureFlags.useDatabaseAgents) {
      return;
    }

    const runtime = agentState.agent.runtime || 0;

    await this.statePersistence.persistAgent(
      {
        id: agentState.id,
        status: agentState.status,
        lifecycleState: agentState.lifecycleState,
        teamId: agentState.agent.teamId,
        sessionId: agentState.sessionId,
        model: agentState.agent.model,
        task: agentState.agent.task,
        retryCount: agentState.retryCount,
        maxRetries: agentState.maxRetries,
        lastError: agentState.lastError,
        createdAt: agentState.createdAt.toISOString(),
        startedAt: agentState.startedAt?.toISOString(),
        completedAt: agentState.completedAt?.toISOString(),
        pausedAt: agentState.pausedAt?.toISOString(),
        resumedAt: agentState.resumedAt?.toISOString(),
        runtime: runtime,
        metadata: {
          label: agentState.agent.label,
          parentId: agentState.agent.parentId,
          childIds: agentState.agent.childIds,
          context: agentState.agent.context,
          code: agentState.agent.code,
          reasoning: agentState.agent.reasoning,
          budgetLimit: agentState.agent.budgetLimit,
          safetyBoundaries: agentState.agent.safetyBoundaries,
          pausedBy: agentState.agent.pausedBy,
        },
        version: 1,
      },
      triggeredBy
    );
  }

  // ============================================================================
  // Override Team Operations
  // ============================================================================

  /**
   * Override create to persist team state
   */
  async create(config: TeamConfig): Promise<Team> {
    const team = await super.create(config);

    if (this.stateConfig.enablePersistence) {
      await safeExecute(
        async () => this.persistTeamState(team, 'team.create'),
        undefined,
        { logError: true, context: 'StateAwareOrchestrator.create' }
      );
    }

    return team;
  }

  /**
   * Override destroy to persist final state
   */
  async destroy(teamId: string, force: boolean = false): Promise<void> {
    const team = this.getTeam(teamId);
    const previousStatus = team?.status;

    await super.destroy(teamId, force);

    if (this.stateConfig.enablePersistence && team) {
      await safeExecute(
        async () => {
          await this.statePersistence.updateTeamStatus(teamId, 'destroyed', 'team.destroy');
        },
        undefined,
        { logError: true, context: 'StateAwareOrchestrator.destroy' }
      );
    }
  }

  /**
   * Override scale to persist state changes
   */
  async scale(teamId: string, targetSize: number): Promise<void> {
    const team = this.getTeam(teamId);

    await super.scale(teamId, targetSize);

    if (this.stateConfig.enablePersistence && team) {
      await safeExecute(
        async () => this.persistTeamState(team, 'team.scale'),
        undefined,
        { logError: true, context: 'StateAwareOrchestrator.scale' }
      );
    }
  }

  // ============================================================================
  // Migration
  // ============================================================================

  /**
   * Migrate from in-memory state (for gradual rollout)
   */
  async migrateFromMemory(): Promise<{ teams: number; agents: number }> {
    if (!this.stateConfig.enablePersistence) {
      logger.warn('[StateAwareOrchestrator] Persistence disabled, skipping migration');
      return { teams: 0, agents: 0 };
    }

    // @ts-ignore - accessing private parent fields
    const teams = Array.from(this.teams.values());

    // Get all agent states from lifecycle manager
    const agentStates = this.getAllAgentStatesFromLifecycle();

    const result = await this.statePersistence.migrateFromMemory({
      teams: teams.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        config: (s as any).config as unknown as Record<string, unknown>,
        agents: s.agents,
        createdAt: (s as any).createdAt,
        completedAt: (s as any).completedAt,
        budget: (s as any).budget,
        metrics: (s as any).metrics as unknown as Record<string, unknown>,
        sessionTreeId: (s as any).sessionTreeId,
        currentBranch: (s as any).currentBranch,
      })),
      agentStates: agentStates.map(s => ({
        id: s.id,
        status: s.status,
        lifecycleState: s.lifecycleState,
        agent: {
          model: s.agent.model,
          task: s.agent.task,
          teamId: s.agent.teamId,
          parentId: s.agent.parentId,
          metadata: s.agent.metadata,
        },
        sessionId: s.sessionId,
        retryCount: s.retryCount,
        maxRetries: s.maxRetries,
        lastError: s.lastError,
        createdAt: s.createdAt,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        pausedAt: s.pausedAt,
        resumedAt: s.resumedAt,
      })),
    });

    logger.info(`[StateAwareOrchestrator] Migration complete: ${result.teams} teams, ${result.agents} agents`);
    return result;
  }

  private getAllAgentStatesFromLifecycle(): AgentState[] {
    // Access the lifecycle manager's states
    // This is a workaround - ideally we'd have a proper getter
    return [];
  }

  // ============================================================================
  // Checkpoint Operations
  // ============================================================================

  private async createCheckpoints(): Promise<void> {
    // @ts-ignore - accessing private parent field
    for (const [teamId, team] of this.teams) {
      await safeExecute(
        async () => {
          await this.statePersistence.createCheckpoint(
            'team',
            teamId,
            team as unknown as Record<string, unknown>,
            'orchestrator_stop'
          );
        },
        undefined,
        { logError: true }
      );
    }
  }

  // ============================================================================
  // Status and Diagnostics
  // ============================================================================

  getRecoveryContext(): RecoveryContext {
    return { ...this.recoveryContext };
  }

  getStateConfig(): StateAwareOrchestratorConfig {
    return { ...this.stateConfig };
  }

  isPersistenceInitialized(): boolean {
    return this.persistenceInitialized;
  }

  /**
   * Get persistence statistics
   */
  async getPersistenceStats(): Promise<{
    activeTeams: number;
    activeAgents: number;
    totalSessions: number;
    recentAuditEntries: number;
  }> {
    const activeTeams = (await this.statePersistence.loadActiveTeams()).length;
    const activeAgents = (await this.statePersistence.loadActiveAgents()).length;

    const db = await (this.statePersistence as unknown as { ensureDb(): Promise<{ all: (sql: string) => Promise<unknown[]> }> }).ensureDb();
    const sessionsResult = await db.all('SELECT COUNT(*) as count FROM session_states');
    const totalSessions = (sessionsResult[0] as { count: number }).count;

    const auditResult = await db.all(
      "SELECT COUNT(*) as count FROM state_audit_log WHERE timestamp > datetime('now', '-1 hour')"
    );
    const recentAuditEntries = (auditResult[0] as { count: number }).count;

    return {
      activeTeams,
      activeAgents,
      totalSessions,
      recentAuditEntries,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export async function createStateAwareOrchestrator(
  agentLifecycle: AgentLifecycle,
  messageBus: MessageBus,
  storage: AgentStorage,
  config: Partial<StateAwareOrchestratorConfig> = {},
  eventBus?: AgentEventBus,
  sessionTree?: SessionTree,
  swarmRepository?: TeamRepository
): Promise<StateAwareOrchestrator> {
  const statePersistence = getGlobalStatePersistence({
    maxRetries: config.maxLockRetries || DEFAULT_STATE_CONFIG.maxLockRetries,
  });

  // Wait for database initialization
  await statePersistence.loadActiveTeams().catch(() => {
    // Just checking if DB is ready
  });

  return new StateAwareOrchestrator(
    agentLifecycle,
    messageBus,
    storage,
    statePersistence,
    config,
    eventBus,
    sessionTree,
    swarmRepository
  );
}

// ============================================================================
// Singleton
// ============================================================================

let globalStateAwareOrchestrator: StateAwareOrchestrator | null = null;

export async function getGlobalStateAwareOrchestrator(
  agentLifecycle?: AgentLifecycle,
  messageBus?: MessageBus,
  storage?: AgentStorage,
  config?: Partial<StateAwareOrchestratorConfig>,
  eventBus?: AgentEventBus,
  sessionTree?: SessionTree,
  swarmRepository?: TeamRepository
): Promise<StateAwareOrchestrator> {
  if (!globalStateAwareOrchestrator) {
    if (!agentLifecycle || !messageBus || !storage) {
      throw new Error('StateAwareOrchestrator requires dependencies on first initialization');
    }
    globalStateAwareOrchestrator = await createStateAwareOrchestrator(
      agentLifecycle,
      messageBus,
      storage,
      config,
      eventBus,
      sessionTree,
      swarmRepository
    );
  }
  return globalStateAwareOrchestrator;
}

export function resetGlobalStateAwareOrchestrator(): void {
  globalStateAwareOrchestrator = null;
}

export default StateAwareOrchestrator;
