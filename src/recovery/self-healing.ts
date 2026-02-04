/**
 * Self-Healing Controller - Automatic Recovery from Failures
 * 
 * Provides:
 * - Automatic detection of failed agents
 * - Restart failed agents from checkpoint
 * - Escalation after N retries
 * - Integration with circuit breaker for external calls
 * - Event bus notifications for failure events
 */

import { EventEmitter } from 'events';
import { CheckpointManager, CheckpointProvider } from './checkpoint';
import { CircuitBreaker, CircuitBreakerRegistry } from './circuit-breaker';
import { getPool, type PostgresPool } from '../storage/postgres/pool';
import type { PostgresConfig } from '../storage/postgres/config';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export type HealingStatus = 'healthy' | 'recovering' | 'failed' | 'escalated';

export interface SelfHealingConfig {
  /** Enable self-healing (default: true) */
  enabled: boolean;
  /** Check interval in milliseconds (default: 10000) */
  checkIntervalMs: number;
  /** Maximum retry attempts before escalation (default: 3) */
  maxRetries: number;
  /** Delay between retry attempts in milliseconds (default: 5000) */
  retryDelayMs: number;
  /** Enable checkpoint-based recovery (default: true) */
  useCheckpoints: boolean;
  /** Enable escalation after max retries (default: true) */
  enableEscalation: boolean;
  /** Circuit breaker configuration for recovery operations */
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeoutMs: number;
    monitoringWindowMs: number;
  };
  /** PostgreSQL configuration */
  postgresConfig?: Partial<PostgresConfig>;
}

export interface FailedAgent {
  id: string;
  swarmId?: string;
  status: string;
  lifecycleState: string;
  lastError?: string;
  failedAt: Date;
  retryCount: number;
  detectionSource: 'health_check' | 'event' | 'heartbeat' | 'manual';
}

export interface RecoveryAttempt {
  agentId: string;
  attempt: number;
  timestamp: Date;
  strategy: 'restart' | 'checkpoint' | 'migrate';
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface EscalationEvent {
  agentId: string;
  swarmId?: string;
  reason: string;
  retryCount: number;
  timestamp: Date;
  suggestedAction: 'manual_review' | 'notify' | 'auto_scale' | 'terminate';
}

export interface HealingStats {
  totalAgentsMonitored: number;
  healthyAgents: number;
  recoveringAgents: number;
  failedAgents: number;
  escalatedAgents: number;
  totalRecoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  avgRecoveryTimeMs: number;
  escalationCount: number;
}

export interface HealingMetrics {
  /** Time to detect failure (ms) */
  detectionTimeMs: number;
  /** Time to recover (ms) */
  recoveryTimeMs: number;
  /** Total downtime (ms) */
  downtimeMs: number;
  /** Whether recovery was from checkpoint */
  fromCheckpoint: boolean;
}

// ============================================================================
// Agent Recovery Handler Interface
// ============================================================================

export interface AgentRecoveryHandler {
  /** Unique ID of the agent */
  getAgentId(): string;
  /** Get current agent state for checkpointing */
  getAgentState(): Promise<Record<string, unknown>>;
  /** Check if agent is healthy */
  isHealthy(): Promise<boolean>;
  /** Restart the agent from initial state */
  restart(): Promise<boolean>;
  /** Restore agent from checkpoint data */
  restoreFromCheckpoint(data: Record<string, unknown>): Promise<boolean>;
  /** Get the agent's swarm ID */
  getSwarmId(): string | undefined;
  /** Get current status */
  getStatus(): string;
}

// ============================================================================
// Self-Healing Controller
// ============================================================================

export class SelfHealingController extends EventEmitter {
  private config: SelfHealingConfig;
  private pool: PostgresPool | null = null;
  private checkpointManager: CheckpointManager | null = null;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private isInitialized = false;
  private isRunning = false;
  
  // Tracking
  private handlers: Map<string, AgentRecoveryHandler> = new Map();
  private failedAgents: Map<string, FailedAgent> = new Map();
  private recoveryAttempts: Map<string, RecoveryAttempt[]> = new Map();
  private escalatedAgents: Set<string> = new Set();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  // Metrics
  private metrics: {
    totalRecoveryAttempts: number;
    successfulRecoveries: number;
    failedRecoveries: number;
    totalRecoveryTimeMs: number;
    detectionTimes: number[];
    escalationCount: number;
  } = {
    totalRecoveryAttempts: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    totalRecoveryTimeMs: 0,
    detectionTimes: [],
    escalationCount: 0,
  };

  constructor(config: Partial<SelfHealingConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      checkIntervalMs: 10000, // 10 seconds
      maxRetries: 3,
      retryDelayMs: 5000, // 5 seconds
      useCheckpoints: true,
      enableEscalation: true,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        monitoringWindowMs: 60000,
      },
      ...config,
    };

    this.circuitBreakerRegistry = new CircuitBreakerRegistry();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(checkpointManager?: CheckpointManager): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.pool = await getPool(this.config.postgresConfig);
      await this.createSchema();

      if (checkpointManager) {
        this.checkpointManager = checkpointManager;
      } else if (this.config.useCheckpoints) {
        this.checkpointManager = new CheckpointManager({
          postgresConfig: this.config.postgresConfig,
        });
        await this.checkpointManager.initialize();
      }

      this.isInitialized = true;
      logger.info('[SelfHealingController] Initialized successfully');
      this.emit('initialized');
    } catch (error) {
      logger.error('[SelfHealingController] Initialization failed:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.stop();
    
    if (this.checkpointManager && !this.config.postgresConfig) {
      await this.checkpointManager.shutdown();
    }

    this.isInitialized = false;
    logger.info('[SelfHealingController] Shutdown complete');
    this.emit('shutdown');
  }

  private async createSchema(): Promise<void> {
    this.ensureInitialized();

    // Recovery attempts log
    await this.pool!.query(`
      CREATE TABLE IF NOT EXISTS recovery_attempts (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(128) NOT NULL,
        swarm_id VARCHAR(128),
        attempt_number INTEGER NOT NULL,
        strategy VARCHAR(32) NOT NULL,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        duration_ms INTEGER,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Escalation log
    await this.pool!.query(`
      CREATE TABLE IF NOT EXISTS escalation_events (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(128) NOT NULL,
        swarm_id VARCHAR(128),
        reason TEXT NOT NULL,
        retry_count INTEGER NOT NULL,
        suggested_action VARCHAR(32) NOT NULL,
        handled BOOLEAN DEFAULT FALSE,
        handled_by VARCHAR(128),
        handled_at TIMESTAMPTZ,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Failed agents tracking
    await this.pool!.query(`
      CREATE TABLE IF NOT EXISTS failed_agents (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(128) UNIQUE NOT NULL,
        swarm_id VARCHAR(128),
        status VARCHAR(32) NOT NULL,
        lifecycle_state VARCHAR(32) NOT NULL,
        last_error TEXT,
        failed_at TIMESTAMPTZ DEFAULT NOW(),
        retry_count INTEGER DEFAULT 0,
        detection_source VARCHAR(32) NOT NULL,
        recovered BOOLEAN DEFAULT FALSE,
        escalated BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Indexes
    await this.pool!.query(`
      CREATE INDEX IF NOT EXISTS idx_recovery_attempts_agent 
      ON recovery_attempts(agent_id, timestamp DESC)
    `);

    await this.pool!.query(`
      CREATE INDEX IF NOT EXISTS idx_escalation_events_agent 
      ON escalation_events(agent_id, timestamp DESC)
    `);

    await this.pool!.query(`
      CREATE INDEX IF NOT EXISTS idx_failed_agents_swarm 
      ON failed_agents(swarm_id)
    `);

    logger.debug('[SelfHealingController] Database schema created');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.pool) {
      throw new Error('SelfHealingController not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (!this.config.enabled) {
      logger.warn('[SelfHealingController] Self-healing is disabled');
      return;
    }

    if (this.isRunning) return;

    this.isRunning = true;
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch(error => {
        logger.error('[SelfHealingController] Health check error:', error);
      });
    }, this.config.checkIntervalMs);

    logger.info(`[SelfHealingController] Started (interval: ${this.config.checkIntervalMs}ms)`);
    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    logger.info('[SelfHealingController] Stopped');
    this.emit('stopped');
  }

  isStarted(): boolean {
    return this.isRunning;
  }

  // ============================================================================
  // Agent Registration
  // ============================================================================

  /**
   * Register an agent for monitoring and recovery
   */
  registerAgent(handler: AgentRecoveryHandler): void {
    const agentId = handler.getAgentId();
    
    if (this.handlers.has(agentId)) {
      logger.warn(`[SelfHealingController] Handler for ${agentId} already registered, replacing`);
    }

    this.handlers.set(agentId, handler);

    // Register with checkpoint manager if available
    if (this.checkpointManager && this.config.useCheckpoints) {
      const provider: CheckpointProvider = {
        getCheckpointData: () => handler.getAgentState(),
        restoreFromCheckpoint: (data) => handler.restoreFromCheckpoint(data),
        getEntityId: () => agentId,
        getEntityType: () => 'agent',
      };
      this.checkpointManager.registerProvider(provider);
    }

    logger.debug(`[SelfHealingController] Registered agent ${agentId}`);
    this.emit('agent.registered', { agentId, swarmId: handler.getSwarmId() });
  }

  /**
   * Unregister an agent from monitoring
   */
  unregisterAgent(agentId: string): void {
    this.handlers.delete(agentId);
    this.failedAgents.delete(agentId);
    this.recoveryAttempts.delete(agentId);
    this.escalatedAgents.delete(agentId);

    // Unregister from checkpoint manager
    if (this.checkpointManager) {
      this.checkpointManager.unregisterProvider(agentId);
    }

    logger.debug(`[SelfHealingController] Unregistered agent ${agentId}`);
    this.emit('agent.unregistered', { agentId });
  }

  /**
   * Get all registered agent IDs
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.handlers.keys());
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  private async performHealthChecks(): Promise<void> {
    const startTime = Date.now();
    const checkPromises: Promise<void>[] = [];

    for (const [agentId, handler] of this.handlers) {
      // Skip if already being recovered or escalated
      if (this.failedAgents.has(agentId) || this.escalatedAgents.has(agentId)) {
        continue;
      }

      checkPromises.push(this.checkAgentHealth(agentId, handler, startTime));
    }

    await Promise.allSettled(checkPromises);
  }

  private async checkAgentHealth(
    agentId: string,
    handler: AgentRecoveryHandler,
    checkStartTime: number
  ): Promise<void> {
    try {
      const isHealthy = await handler.isHealthy();
      
      if (!isHealthy) {
        const detectionTimeMs = Date.now() - checkStartTime;
        this.metrics.detectionTimes.push(detectionTimeMs);
        
        await this.handleAgentFailure(agentId, handler, 'health_check', detectionTimeMs);
      }
    } catch (error) {
      logger.error(`[SelfHealingController] Health check failed for ${agentId}:`, error);
      const detectionTimeMs = Date.now() - checkStartTime;
      this.metrics.detectionTimes.push(detectionTimeMs);
      
      await this.handleAgentFailure(agentId, handler, 'health_check', detectionTimeMs);
    }
  }

  /**
   * Manually report an agent failure
   */
  async reportFailure(
    agentId: string,
    reason: string,
    source: FailedAgent['detectionSource'] = 'manual'
  ): Promise<void> {
    const handler = this.handlers.get(agentId);
    if (!handler) {
      logger.warn(`[SelfHealingController] Cannot report failure for unknown agent ${agentId}`);
      return;
    }

    await this.handleAgentFailure(agentId, handler, source, 0, reason);
  }

  // ============================================================================
  // Failure Handling
  // ============================================================================

  private async handleAgentFailure(
    agentId: string,
    handler: AgentRecoveryHandler,
    detectionSource: FailedAgent['detectionSource'],
    detectionTimeMs: number,
    errorMessage?: string
  ): Promise<void> {
    // Check if already handling this failure
    if (this.failedAgents.has(agentId)) {
      return;
    }

    const failedAgent: FailedAgent = {
      id: agentId,
      swarmId: handler.getSwarmId(),
      status: handler.getStatus(),
      lifecycleState: 'failed',
      lastError: errorMessage,
      failedAt: new Date(),
      retryCount: this.getRetryCount(agentId),
      detectionSource,
    };

    this.failedAgents.set(agentId, failedAgent);

    // Persist failure
    await this.persistFailure(failedAgent);

    logger.warn(`[SelfHealingController] Detected failure for agent ${agentId} (detected in ${detectionTimeMs}ms)`);
    
    this.emit('agent.failed', {
      agentId,
      swarmId: handler.getSwarmId(),
      detectionSource,
      detectionTimeMs,
    });

    // Attempt recovery
    await this.attemptRecovery(agentId, handler);
  }

  private getRetryCount(agentId: string): number {
    const attempts = this.recoveryAttempts.get(agentId);
    return attempts?.length || 0;
  }

  // ============================================================================
  // Recovery
  // ============================================================================

  private async attemptRecovery(agentId: string, handler: AgentRecoveryHandler): Promise<void> {
    const recoveryStartTime = Date.now();
    const failedAgent = this.failedAgents.get(agentId)!;
    
    // Check if max retries exceeded
    if (failedAgent.retryCount >= this.config.maxRetries) {
      await this.escalate(agentId, handler, 'max_retries_exceeded');
      return;
    }

    const attemptNumber = failedAgent.retryCount + 1;
    const strategy = this.config.useCheckpoints ? 'checkpoint' : 'restart';

    logger.info(`[SelfHealingController] Attempting recovery for ${agentId} (attempt ${attemptNumber}/${this.config.maxRetries}, strategy: ${strategy})`);

    this.emit('recovery.started', {
      agentId,
      attempt: attemptNumber,
      strategy,
    });

    // Get or create circuit breaker for recovery operations
    const breaker = this.circuitBreakerRegistry.getOrCreate({
      name: `recovery-${agentId}`,
      ...this.config.circuitBreaker,
    });

    try {
      let success: boolean;

      if (strategy === 'checkpoint' && this.checkpointManager) {
        // Try to restore from checkpoint
        success = await breaker.execute(async () => {
          const result = await this.checkpointManager!.restoreFromLatestCheckpoint(agentId);
          return result.success;
        });

        // If checkpoint restore fails, try restart
        if (!success) {
          logger.warn(`[SelfHealingController] Checkpoint restore failed for ${agentId}, trying restart`);
          success = await breaker.execute(() => handler.restart());
        }
      } else {
        // Simple restart
        success = await breaker.execute(() => handler.restart());
      }

      const durationMs = Date.now() - recoveryStartTime;

      const attempt: RecoveryAttempt = {
        agentId,
        attempt: attemptNumber,
        timestamp: new Date(),
        strategy: success ? strategy : 'restart',
        success,
        durationMs,
      };

      // Track attempt
      const attempts = this.recoveryAttempts.get(agentId) || [];
      attempts.push(attempt);
      this.recoveryAttempts.set(agentId, attempts);

      // Persist attempt
      await this.persistRecoveryAttempt(attempt, handler.getSwarmId());

      // Update metrics
      this.metrics.totalRecoveryAttempts++;
      this.metrics.totalRecoveryTimeMs += durationMs;

      if (success) {
        this.metrics.successfulRecoveries++;
        await this.handleRecoverySuccess(agentId, handler, attempt);
      } else {
        this.metrics.failedRecoveries++;
        await this.handleRecoveryFailure(agentId, handler, attempt);
      }
    } catch (error) {
      const durationMs = Date.now() - recoveryStartTime;
      
      const attempt: RecoveryAttempt = {
        agentId,
        attempt: attemptNumber,
        timestamp: new Date(),
        strategy,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };

      const attempts = this.recoveryAttempts.get(agentId) || [];
      attempts.push(attempt);
      this.recoveryAttempts.set(agentId, attempts);

      await this.persistRecoveryAttempt(attempt, handler.getSwarmId());

      this.metrics.totalRecoveryAttempts++;
      this.metrics.failedRecoveries++;
      this.metrics.totalRecoveryTimeMs += durationMs;

      await this.handleRecoveryFailure(agentId, handler, attempt);
    }
  }

  private async handleRecoverySuccess(
    agentId: string,
    handler: AgentRecoveryHandler,
    attempt: RecoveryAttempt
  ): Promise<void> {
    // Remove from failed agents
    this.failedAgents.delete(agentId);
    
    // Update database
    await this.pool!.query(
      `UPDATE failed_agents SET recovered = TRUE WHERE agent_id = $1`,
      [agentId]
    );

    logger.info(`[SelfHealingController] Successfully recovered agent ${agentId} in ${attempt.durationMs}ms`);

    this.emit('recovery.success', {
      agentId,
      swarmId: handler.getSwarmId(),
      attempt: attempt.attempt,
      strategy: attempt.strategy,
      durationMs: attempt.durationMs,
    });
  }

  private async handleRecoveryFailure(
    agentId: string,
    handler: AgentRecoveryHandler,
    attempt: RecoveryAttempt
  ): Promise<void> {
    const failedAgent = this.failedAgents.get(agentId)!;
    failedAgent.retryCount = attempt.attempt;

    logger.error(`[SelfHealingController] Recovery failed for ${agentId}: ${attempt.error || 'Unknown error'}`);

    this.emit('recovery.failed', {
      agentId,
      swarmId: handler.getSwarmId(),
      attempt: attempt.attempt,
      error: attempt.error,
      durationMs: attempt.durationMs,
    });

    // Schedule retry if not at max
    if (attempt.attempt < this.config.maxRetries) {
      setTimeout(() => {
        this.attemptRecovery(agentId, handler).catch(error => {
          logger.error(`[SelfHealingController] Scheduled retry failed for ${agentId}:`, error);
        });
      }, this.config.retryDelayMs);
    } else {
      await this.escalate(agentId, handler, 'max_retries_exceeded');
    }
  }

  // ============================================================================
  // Escalation
  // ============================================================================

  private async escalate(
    agentId: string,
    handler: AgentRecoveryHandler,
    reason: string
  ): Promise<void> {
    if (!this.config.enableEscalation) {
      logger.warn(`[SelfHealingController] Escalation disabled, agent ${agentId} remains failed`);
      return;
    }

    if (this.escalatedAgents.has(agentId)) {
      return;
    }

    this.escalatedAgents.add(agentId);
    this.metrics.escalationCount++;

    const escalation: EscalationEvent = {
      agentId,
      swarmId: handler.getSwarmId(),
      reason,
      retryCount: this.getRetryCount(agentId),
      timestamp: new Date(),
      suggestedAction: this.determineEscalationAction(agentId, handler),
    };

    // Persist escalation
    await this.persistEscalation(escalation);

    // Update failed_agents table
    await this.pool!.query(
      `UPDATE failed_agents SET escalated = TRUE WHERE agent_id = $1`,
      [agentId]
    );

    logger.error(`[SelfHealingController] ESCALATED agent ${agentId}: ${reason}`);

    this.emit('escalation', escalation);

    // Notify via event bus if available
    this.emit('notify.escalation', escalation);
  }

  private determineEscalationAction(
    agentId: string,
    handler: AgentRecoveryHandler
  ): EscalationEvent['suggestedAction'] {
    // Determine action based on context
    const attempts = this.recoveryAttempts.get(agentId) || [];
    const consecutiveFailures = attempts.slice(-3).every(a => !a.success);

    if (consecutiveFailures) {
      return 'manual_review';
    }

    // Could add more logic here based on swarm criticality, etc.
    return 'notify';
  }

  /**
   * Mark an escalated agent as handled
   */
  async markEscalationHandled(
    agentId: string,
    handledBy: string,
    action?: string
  ): Promise<void> {
    await this.pool!.query(
      `UPDATE escalation_events 
       SET handled = TRUE, handled_by = $1, handled_at = NOW(),
           metadata = jsonb_set(metadata, '{action}', $2::jsonb)
       WHERE agent_id = $3 AND handled = FALSE`,
      [handledBy, JSON.stringify(action || 'resolved'), agentId]
    );

    this.escalatedAgents.delete(agentId);
    this.failedAgents.delete(agentId);

    logger.info(`[SelfHealingController] Escalation for ${agentId} handled by ${handledBy}`);
    this.emit('escalation.handled', { agentId, handledBy, action });
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private async persistFailure(failedAgent: FailedAgent): Promise<void> {
    try {
      await this.pool!.query(
        `INSERT INTO failed_agents 
         (agent_id, swarm_id, status, lifecycle_state, last_error, 
          failed_at, retry_count, detection_source, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (agent_id) DO UPDATE SET
         status = EXCLUDED.status,
         lifecycle_state = EXCLUDED.lifecycle_state,
         last_error = EXCLUDED.last_error,
         failed_at = EXCLUDED.failed_at,
         retry_count = EXCLUDED.retry_count,
         detection_source = EXCLUDED.detection_source,
         recovered = FALSE,
         escalated = FALSE`,
        [
          failedAgent.id,
          failedAgent.swarmId || null,
          failedAgent.status,
          failedAgent.lifecycleState,
          failedAgent.lastError || null,
          failedAgent.failedAt,
          failedAgent.retryCount,
          failedAgent.detectionSource,
          JSON.stringify({ initialDetection: failedAgent.detectionSource }),
        ]
      );
    } catch (error) {
      logger.error('[SelfHealingController] Failed to persist failure:', error);
    }
  }

  private async persistRecoveryAttempt(
    attempt: RecoveryAttempt,
    swarmId?: string
  ): Promise<void> {
    try {
      await this.pool!.query(
        `INSERT INTO recovery_attempts 
         (agent_id, swarm_id, attempt_number, strategy, success, 
          error_message, duration_ms, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          attempt.agentId,
          swarmId || null,
          attempt.attempt,
          attempt.strategy,
          attempt.success,
          attempt.error || null,
          attempt.durationMs,
          attempt.timestamp,
        ]
      );
    } catch (error) {
      logger.error('[SelfHealingController] Failed to persist recovery attempt:', error);
    }
  }

  private async persistEscalation(escalation: EscalationEvent): Promise<void> {
    try {
      await this.pool!.query(
        `INSERT INTO escalation_events 
         (agent_id, swarm_id, reason, retry_count, suggested_action, timestamp, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          escalation.agentId,
          escalation.swarmId || null,
          escalation.reason,
          escalation.retryCount,
          escalation.suggestedAction,
          escalation.timestamp,
          JSON.stringify({ autoEscalated: true }),
        ]
      );
    } catch (error) {
      logger.error('[SelfHealingController] Failed to persist escalation:', error);
    }
  }

  // ============================================================================
  // Statistics & Metrics
  // ============================================================================

  getStats(): HealingStats {
    const healthy = this.getRegisteredAgents().filter(
      id => !this.failedAgents.has(id) && !this.escalatedAgents.has(id)
    ).length;

    const recovering = Array.from(this.failedAgents.values()).filter(
      f => !this.escalatedAgents.has(f.id)
    ).length;

    const avgRecoveryTime = this.metrics.successfulRecoveries > 0
      ? this.metrics.totalRecoveryTimeMs / this.metrics.successfulRecoveries
      : 0;

    return {
      totalAgentsMonitored: this.handlers.size,
      healthyAgents: healthy,
      recoveringAgents: recovering,
      failedAgents: this.failedAgents.size - recovering,
      escalatedAgents: this.escalatedAgents.size,
      totalRecoveryAttempts: this.metrics.totalRecoveryAttempts,
      successfulRecoveries: this.metrics.successfulRecoveries,
      failedRecoveries: this.metrics.failedRecoveries,
      avgRecoveryTimeMs: avgRecoveryTime,
      escalationCount: this.metrics.escalationCount,
    };
  }

  getMetrics(): HealingMetrics {
    const avgDetectionTime = this.metrics.detectionTimes.length > 0
      ? this.metrics.detectionTimes.reduce((a, b) => a + b, 0) / this.metrics.detectionTimes.length
      : 0;

    const avgRecoveryTime = this.metrics.successfulRecoveries > 0
      ? this.metrics.totalRecoveryTimeMs / this.metrics.successfulRecoveries
      : 0;

    return {
      detectionTimeMs: avgDetectionTime,
      recoveryTimeMs: avgRecoveryTime,
      downtimeMs: avgDetectionTime + avgRecoveryTime,
      fromCheckpoint: this.config.useCheckpoints,
    };
  }

  getFailedAgents(): FailedAgent[] {
    return Array.from(this.failedAgents.values());
  }

  getEscalatedAgents(): string[] {
    return Array.from(this.escalatedAgents);
  }

  getRecoveryAttempts(agentId: string): RecoveryAttempt[] {
    return this.recoveryAttempts.get(agentId) || [];
  }

  // ============================================================================
  // Queries
  // ============================================================================

  async getRecentRecoveries(limit: number = 10): Promise<RecoveryAttempt[]> {
    this.ensureInitialized();

    interface RecoveryRow {
      agent_id: string;
      attempt_number: number;
      timestamp: string;
      strategy: 'restart' | 'checkpoint' | 'migrate';
      success: boolean;
      error_message: string | null;
      duration_ms: number;
    }

    const result = await this.pool!.query<RecoveryRow>(
      `SELECT * FROM recovery_attempts 
       ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      agentId: row.agent_id,
      attempt: row.attempt_number,
      timestamp: new Date(row.timestamp),
      strategy: row.strategy,
      success: row.success,
      error: row.error_message || undefined,
      durationMs: row.duration_ms,
    }));
  }

  async getRecentEscalations(limit: number = 10): Promise<EscalationEvent[]> {
    this.ensureInitialized();

    interface EscalationRow {
      agent_id: string;
      swarm_id: string | null;
      reason: string;
      retry_count: number;
      timestamp: string;
      suggested_action: 'manual_review' | 'notify' | 'auto_scale' | 'terminate';
    }

    const result = await this.pool!.query<EscalationRow>(
      `SELECT * FROM escalation_events 
       ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      agentId: row.agent_id,
      swarmId: row.swarm_id || undefined,
      reason: row.reason,
      retryCount: row.retry_count,
      timestamp: new Date(row.timestamp),
      suggestedAction: row.suggested_action,
    }));
  }

  async getUnhandledEscalations(): Promise<EscalationEvent[]> {
    this.ensureInitialized();

    interface EscalationRow {
      agent_id: string;
      swarm_id: string | null;
      reason: string;
      retry_count: number;
      timestamp: string;
      suggested_action: 'manual_review' | 'notify' | 'auto_scale' | 'terminate';
    }

    const result = await this.pool!.query<EscalationRow>(
      `SELECT * FROM escalation_events 
       WHERE handled = FALSE
       ORDER BY timestamp DESC`
    );

    return result.rows.map(row => ({
      agentId: row.agent_id,
      swarmId: row.swarm_id || undefined,
      reason: row.reason,
      retryCount: row.retry_count,
      timestamp: new Date(row.timestamp),
      suggestedAction: row.suggested_action,
    }));
  }

  // ============================================================================
  // Circuit Breaker Access
  // ============================================================================

  getCircuitBreakerRegistry(): CircuitBreakerRegistry {
    return this.circuitBreakerRegistry;
  }

  getCircuitBreaker(agentId: string): CircuitBreaker | undefined {
    return this.circuitBreakerRegistry.get(`recovery-${agentId}`);
  }
}

export default SelfHealingController;
