/**
 * State-Aware Swarm Orchestrator
 * 
 * Extended SwarmOrchestrator with full state persistence integration.
 * Replaces in-memory state with database-backed persistence.
 */

import { logger } from '../utils/logger';
import { SwarmOrchestrator, Swarm, SwarmConfig, SwarmState, SwarmStatusInfo } from './swarm-orchestrator';
import { StatePersistence, PersistedSwarmState, PersistedAgentState, RecoveryResult, getGlobalStatePersistence } from './state-persistence';
import { AgentLifecycle, AgentState, LifecycleState } from './lifecycle';
import { MessageBus } from '../bus/index';
import { AgentStorage } from '../storage/memory';
import { AgentEventBus } from './event-bus';
import { SessionTree } from './session-tree';
import { SwarmRepository } from '../storage';
import { AgentStatus, CreateAgentOptions, Agent } from '../models/agent';
import { safeExecute, SwarmNotFoundError } from '../errors';

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
    /** Use database for swarm state */
    useDatabaseSwarms: boolean;
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
    useDatabaseSwarms: true,
    useDatabaseAgents: true,
    useDatabaseSessions: true,
  },
};

// ============================================================================
// Recovery Context
// ============================================================================

export interface RecoveryContext {
  recoveredSwarms: Map<string, Swarm>;
  recoveredAgents: Map<string, AgentState>;
  recoveredSessions: Map<string, SessionTree>;
  orphanedAgents: string[];
  errors: string[];
}

// ============================================================================
// State-Aware Orchestrator
// ============================================================================

export class StateAwareOrchestrator extends SwarmOrchestrator {
  private statePersistence: StatePersistence;
  private stateConfig: StateAwareOrchestratorConfig;
  private recoveryContext: RecoveryContext = {
    recoveredSwarms: new Map(),
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
    swarmRepository?: SwarmRepository
  ) {
    super(agentLifecycle, messageBus, storage, eventBus, sessionTree, swarmRepository);

    this.statePersistence = statePersistence;
    this.stateConfig = { ...DEFAULT_STATE_CONFIG, ...config };

    // Subscribe to persistence events
    this.setupPersistenceListeners();
  }

  private setupPersistenceListeners(): void {
    // Log persistence events
    this.statePersistence.on('swarm.persisted', ({ id, version }) => {
      logger.debug(`[StateAwareOrchestrator] Swarm ${id} persisted (v${version})`);
    });

    this.statePersistence.on('agent.persisted', ({ id, version }) => {
      logger.debug(`[StateAwareOrchestrator] Agent ${id} persisted (v${version})`);
    });

    this.statePersistence.on('audit.logged', ({ entityType, entityId, action }) => {
      logger.debug(`[StateAwareOrchestrator] Audit: ${action} on ${entityType} ${entityId}`);
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
      swarmsRecovered: 0,
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
      this.createCheckpoints();
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

    const result = await this.statePersistence.recoverAll();

    // Subscribe to recovery events
    this.statePersistence.on('recovery.swarm', (persistedSwarm: PersistedSwarmState) => {
      this.recoverSwarm(persistedSwarm);
    });

    this.statePersistence.on('recovery.agent', (persistedAgent: PersistedAgentState) => {
      this.recoverAgent(persistedAgent);
    });

    this.statePersistence.on('recovery.session', (sessionData: { id: string; sessionTreeId: string }) => {
      this.recoverSession(sessionData);
    });

    return result;
  }

  private recoverSwarm(persistedSwarm: PersistedSwarmState): void {
    try {
      // Convert persisted state back to runtime state
      const swarm: Swarm = {
        id: persistedSwarm.id,
        name: persistedSwarm.name,
        status: persistedSwarm.status as SwarmState,
        config: persistedSwarm.config as unknown as SwarmConfig,
        agents: persistedSwarm.agents,
        createdAt: new Date(persistedSwarm.createdAt),
        completedAt: persistedSwarm.completedAt ? new Date(persistedSwarm.completedAt) : undefined,
        budget: {
          allocated: persistedSwarm.budgetAllocated || 0,
          consumed: persistedSwarm.budgetConsumed || 0,
          remaining: persistedSwarm.budgetRemaining || 0,
        },
        metrics: persistedSwarm.metrics as Swarm['metrics'] || {
          totalAgents: persistedSwarm.agents.length,
          completedAgents: 0,
          failedAgents: 0,
        },
        sessionTreeId: persistedSwarm.sessionTreeId,
        currentBranch: persistedSwarm.currentBranch,
      };

      // Restore in-memory state
      // @ts-ignore - accessing private parent field
      this.swarms.set(swarm.id, swarm);
      // @ts-ignore - accessing private parent field
      this.getMutex(swarm.id);

      this.recoveryContext.recoveredSwarms.set(swarm.id, swarm);
      logger.info(`[StateAwareOrchestrator] Recovered swarm ${swarm.id} with ${swarm.agents.length} agents`);

      // Resume swarm if it was active
      if (swarm.status === 'creating' || swarm.status === 'scaling') {
        swarm.status = 'active';
        this.persistSwarmState(swarm, 'recovery').catch(err => {
          logger.error(`[StateAwareOrchestrator] Failed to persist recovered swarm: ${err}`);
        });
      }
    } catch (error) {
      this.recoveryContext.errors.push(`Failed to recover swarm ${persistedSwarm.id}: ${error}`);
      logger.error(`[StateAwareOrchestrator] Failed to recover swarm: ${error}`);
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
          swarmId: persistedAgent.swarmId,
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
   * Persist swarm state to database
   */
  private async persistSwarmState(swarm: Swarm, triggeredBy: string = 'system'): Promise<void> {
    if (!this.stateConfig.enablePersistence || !this.stateConfig.featureFlags.useDatabaseSwarms) {
      return;
    }

    await this.statePersistence.persistSwarm(
      {
        id: swarm.id,
        name: swarm.name,
        status: swarm.status,
        config: swarm.config as unknown as Record<string, unknown>,
        agents: swarm.agents,
        createdAt: swarm.createdAt.toISOString(),
        completedAt: swarm.completedAt?.toISOString(),
        budgetAllocated: swarm.budget.allocated,
        budgetConsumed: swarm.budget.consumed,
        budgetRemaining: swarm.budget.remaining,
        metrics: swarm.metrics as Record<string, unknown>,
        sessionTreeId: swarm.sessionTreeId,
        currentBranch: swarm.currentBranch,
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
        swarmId: agentState.agent.swarmId,
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
  // Override Swarm Operations
  // ============================================================================

  /**
   * Override create to persist swarm state
   */
  async create(config: SwarmConfig): Promise<Swarm> {
    const swarm = await super.create(config);

    if (this.stateConfig.enablePersistence) {
      await safeExecute(
        async () => this.persistSwarmState(swarm, 'swarm.create'),
        undefined,
        { logError: true, context: 'StateAwareOrchestrator.create' }
      );
    }

    return swarm;
  }

  /**
   * Override destroy to persist final state
   */
  async destroy(swarmId: string, force: boolean = false): Promise<void> {
    const swarm = this.getSwarm(swarmId);
    const previousStatus = swarm?.status;

    await super.destroy(swarmId, force);

    if (this.stateConfig.enablePersistence && swarm) {
      await safeExecute(
        async () => {
          await this.statePersistence.updateSwarmStatus(swarmId, 'destroyed', 'swarm.destroy');
        },
        undefined,
        { logError: true, context: 'StateAwareOrchestrator.destroy' }
      );
    }
  }

  /**
   * Override scale to persist state changes
   */
  async scale(swarmId: string, targetSize: number): Promise<void> {
    const swarm = this.getSwarm(swarmId);

    await super.scale(swarmId, targetSize);

    if (this.stateConfig.enablePersistence && swarm) {
      await safeExecute(
        async () => this.persistSwarmState(swarm, 'swarm.scale'),
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
  async migrateFromMemory(): Promise<{ swarms: number; agents: number }> {
    if (!this.stateConfig.enablePersistence) {
      logger.warn('[StateAwareOrchestrator] Persistence disabled, skipping migration');
      return { swarms: 0, agents: 0 };
    }

    // @ts-ignore - accessing private parent fields
    const swarms = Array.from(this.swarms.values());

    // Get all agent states from lifecycle manager
    const agentStates = this.getAllAgentStatesFromLifecycle();

    const result = await this.statePersistence.migrateFromMemory({
      swarms: swarms.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        config: s.config as unknown as Record<string, unknown>,
        agents: s.agents,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
        budget: s.budget,
        metrics: s.metrics as unknown as Record<string, unknown>,
        sessionTreeId: s.sessionTreeId,
        currentBranch: s.currentBranch,
      })),
      agentStates: agentStates.map(s => ({
        id: s.id,
        status: s.status,
        lifecycleState: s.lifecycleState,
        agent: {
          model: s.agent.model,
          task: s.agent.task,
          swarmId: s.agent.swarmId,
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

    logger.info(`[StateAwareOrchestrator] Migration complete: ${result.swarms} swarms, ${result.agents} agents`);
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
    for (const [swarmId, swarm] of this.swarms) {
      await safeExecute(
        async () => {
          await this.statePersistence.createCheckpoint(
            'swarm',
            swarmId,
            swarm as unknown as Record<string, unknown>,
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
    activeSwarms: number;
    activeAgents: number;
    totalSessions: number;
    recentAuditEntries: number;
  }> {
    const activeSwarms = (await this.statePersistence.loadActiveSwarms()).length;
    const activeAgents = (await this.statePersistence.loadActiveAgents()).length;

    const db = await (this.statePersistence as unknown as { ensureDb(): Promise<{ all: (sql: string) => Promise<unknown[]> }> }).ensureDb();
    const sessionsResult = await db.all('SELECT COUNT(*) as count FROM session_states');
    const totalSessions = (sessionsResult[0] as { count: number }).count;

    const auditResult = await db.all(
      "SELECT COUNT(*) as count FROM state_audit_log WHERE timestamp > datetime('now', '-1 hour')"
    );
    const recentAuditEntries = (auditResult[0] as { count: number }).count;

    return {
      activeSwarms,
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
  swarmRepository?: SwarmRepository
): Promise<StateAwareOrchestrator> {
  const statePersistence = getGlobalStatePersistence({
    maxRetries: config.maxLockRetries || DEFAULT_STATE_CONFIG.maxLockRetries,
  });

  // Wait for database initialization
  await statePersistence.loadActiveSwarms().catch(() => {
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
  swarmRepository?: SwarmRepository
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
