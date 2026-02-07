/**
 * Recovery Observability - Metrics and Monitoring for Recovery Operations
 * 
 * Provides:
 * - Recovery count metrics
 * - Time-to-recovery tracking
 * - Checkpoint restoration metrics
 * - Circuit breaker state tracking
 * - Prometheus-compatible metrics export
 */

import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import type { CheckpointManager } from './checkpoint';
import type { CircuitBreakerRegistry, CircuitBreakerStats, CircuitBreakerMetrics } from './circuit-breaker';
import type { SelfHealingController, HealingStats, HealingMetrics } from './self-healing';

// ============================================================================
// Types
// ============================================================================

export interface RecoveryObservabilityConfig {
  /** Enable metrics collection (default: true) */
  enabled: boolean;
  /** Metrics prefix (default: 'dash_recovery') */
  prefix: string;
  /** Enable default Node.js metrics (default: true) */
  includeDefaultMetrics: boolean;
  /** Histogram buckets for recovery time in ms */
  recoveryTimeBuckets: number[];
  /** Histogram buckets for detection time in ms */
  detectionTimeBuckets: number[];
}

export interface RecoveryDashboardData {
  summary: {
    totalRecoveries: number;
    successfulRecoveries: number;
    failedRecoveries: number;
    successRate: number;
    avgRecoveryTimeMs: number;
    activeEscalations: number;
  };
  circuitBreakers: CircuitBreakerMetrics[];
  recentRecoveries: Array<{
    agentId: string;
    success: boolean;
    durationMs: number;
    strategy: string;
    timestamp: Date;
  }>;
  healthStatus: {
    healthyAgents: number;
    recoveringAgents: number;
    failedAgents: number;
    escalatedAgents: number;
  };
  checkpoints: {
    total: number;
    byType: Record<string, number>;
    storageSizeBytes: number;
  };
}

// ============================================================================
// Recovery Observability
// ============================================================================

export class RecoveryObservability extends EventEmitter {
  private config: RecoveryObservabilityConfig;
  private registry: Registry;
  
  // Metrics
  private recoveryCounter!: Counter;
  private recoveryDuration!: Histogram;
  private detectionDuration!: Histogram;
  private checkpointRestoreCounter!: Counter;
  private checkpointCreateCounter!: Counter;
  private escalationCounter!: Counter;
  private agentHealthGauge!: Gauge;
  private circuitBreakerStateGauge!: Gauge;
  private recoveryAttemptsGauge!: Gauge;

  private checkpointManager?: CheckpointManager;
  private circuitBreakerRegistry?: CircuitBreakerRegistry;
  private selfHealingController?: SelfHealingController;

  constructor(config: Partial<RecoveryObservabilityConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      prefix: 'dash_recovery',
      includeDefaultMetrics: true,
      recoveryTimeBuckets: [100, 500, 1000, 2500, 5000, 10000, 30000, 60000],
      detectionTimeBuckets: [10, 50, 100, 250, 500, 1000, 5000],
      ...config,
    };

    this.registry = new Registry();
    
    if (this.config.includeDefaultMetrics) {
      collectDefaultMetrics({ register: this.registry });
    }

    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    const prefix = this.config.prefix;

    // Recovery counter
    this.recoveryCounter = new Counter({
      name: `${prefix}_total`,
      help: 'Total number of recovery attempts',
      labelNames: ['agent_id', 'strategy', 'status'],
      registers: [this.registry],
    });

    // Recovery duration histogram
    this.recoveryDuration = new Histogram({
      name: `${prefix}_duration_ms`,
      help: 'Recovery operation duration in milliseconds',
      labelNames: ['agent_id', 'strategy', 'success'],
      buckets: this.config.recoveryTimeBuckets,
      registers: [this.registry],
    });

    // Detection duration histogram
    this.detectionDuration = new Histogram({
      name: `${prefix}_detection_duration_ms`,
      help: 'Time to detect failure in milliseconds',
      labelNames: ['agent_id', 'detection_source'],
      buckets: this.config.detectionTimeBuckets,
      registers: [this.registry],
    });

    // Checkpoint restore counter
    this.checkpointRestoreCounter = new Counter({
      name: `${prefix}_checkpoint_restore_total`,
      help: 'Total number of checkpoint restore attempts',
      labelNames: ['agent_id', 'status'],
      registers: [this.registry],
    });

    // Checkpoint create counter
    this.checkpointCreateCounter = new Counter({
      name: `${prefix}_checkpoint_create_total`,
      help: 'Total number of checkpoints created',
      labelNames: ['entity_type', 'entity_id'],
      registers: [this.registry],
    });

    // Escalation counter
    this.escalationCounter = new Counter({
      name: `${prefix}_escalation_total`,
      help: 'Total number of escalations',
      labelNames: ['agent_id', 'reason', 'suggested_action'],
      registers: [this.registry],
    });

    // Agent health gauge
    this.agentHealthGauge = new Gauge({
      name: `${prefix}_agent_health`,
      help: 'Current health status of agents (1=healthy, 0=unhealthy)',
      labelNames: ['agent_id', 'team_id'],
      registers: [this.registry],
    });

    // Circuit breaker state gauge
    this.circuitBreakerStateGauge = new Gauge({
      name: `${prefix}_circuit_breaker_state`,
      help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
      labelNames: ['service_name'],
      registers: [this.registry],
    });

    // Recovery attempts gauge
    this.recoveryAttemptsGauge = new Gauge({
      name: `${prefix}_attempts_current`,
      help: 'Current number of recovery attempts per agent',
      labelNames: ['agent_id'],
      registers: [this.registry],
    });
  }

  // ============================================================================
  // Integration Setup
  // ============================================================================

  /**
   * Connect to checkpoint manager for automatic metrics collection
   */
  attachCheckpointManager(manager: CheckpointManager): void {
    this.checkpointManager = manager;

    manager.on('checkpoint.created', (checkpoint) => {
      this.checkpointCreateCounter.inc({
        entity_type: checkpoint.entityType,
        entity_id: checkpoint.entityId,
      });
    });

    manager.on('checkpoint.restored', (result) => {
      this.checkpointRestoreCounter.inc({
        agent_id: result.entityId,
        status: 'success',
      });
    });

    manager.on('checkpoint.restore_failed', (result) => {
      this.checkpointRestoreCounter.inc({
        agent_id: result.entityId,
        status: 'failure',
      });
    });

    logger.debug('[RecoveryObservability] Attached to CheckpointManager');
  }

  /**
   * Connect to circuit breaker registry for automatic metrics collection
   */
  attachCircuitBreakerRegistry(registry: CircuitBreakerRegistry): void {
    this.circuitBreakerRegistry = registry;

    registry.on('state.changed', (event) => {
      const stateValue = event.newState === 'closed' ? 0 : event.newState === 'half-open' ? 1 : 2;
      this.circuitBreakerStateGauge.set(
        { service_name: event.service },
        stateValue
      );
    });

    logger.debug('[RecoveryObservability] Attached to CircuitBreakerRegistry');
  }

  /**
   * Connect to self-healing controller for automatic metrics collection
   */
  attachSelfHealingController(controller: SelfHealingController): void {
    this.selfHealingController = controller;

    controller.on('agent.failed', (event) => {
      this.agentHealthGauge.set(
        { agent_id: event.agentId, team_id: event.teamId || 'none' },
        0
      );
    });

    controller.on('recovery.success', (event) => {
      this.recoveryCounter.inc({
        agent_id: event.agentId,
        strategy: event.strategy,
        status: 'success',
      });
      
      this.recoveryDuration.observe(
        { agent_id: event.agentId, strategy: event.strategy, success: 'true' },
        event.durationMs
      );

      this.agentHealthGauge.set(
        { agent_id: event.agentId, team_id: event.teamId || 'none' },
        1
      );
    });

    controller.on('recovery.failed', (event) => {
      this.recoveryCounter.inc({
        agent_id: event.agentId,
        strategy: 'unknown',
        status: 'failure',
      });
      
      this.recoveryDuration.observe(
        { agent_id: event.agentId, strategy: 'unknown', success: 'false' },
        event.durationMs
      );
    });

    controller.on('escalation', (event) => {
      this.escalationCounter.inc({
        agent_id: event.agentId,
        reason: event.reason,
        suggested_action: event.suggestedAction,
      });
    });

    controller.on('agent.registered', (event) => {
      this.agentHealthGauge.set(
        { agent_id: event.agentId, team_id: event.teamId || 'none' },
        1
      );
    });

    logger.debug('[RecoveryObservability] Attached to SelfHealingController');
  }

  // ============================================================================
  // Manual Metrics Recording
  // ============================================================================

  /**
   * Record a recovery attempt
   */
  recordRecovery(
    agentId: string,
    strategy: string,
    success: boolean,
    durationMs: number
  ): void {
    this.recoveryCounter.inc({
      agent_id: agentId,
      strategy,
      status: success ? 'success' : 'failure',
    });

    this.recoveryDuration.observe(
      { agent_id: agentId, strategy, success: String(success) },
      durationMs
    );
  }

  /**
   * Record failure detection time
   */
  recordDetection(agentId: string, source: string, durationMs: number): void {
    this.detectionDuration.observe(
      { agent_id: agentId, detection_source: source },
      durationMs
    );
  }

  /**
   * Record checkpoint operation
   */
  recordCheckpoint(entityType: string, entityId: string, operation: 'create' | 'restore', success: boolean): void {
    if (operation === 'create') {
      this.checkpointCreateCounter.inc({ entity_type: entityType, entity_id: entityId });
    } else {
      this.checkpointRestoreCounter.inc({
        agent_id: entityId,
        status: success ? 'success' : 'failure',
      });
    }
  }

  /**
   * Record escalation
   */
  recordEscalation(
    agentId: string,
    reason: string,
    suggestedAction: string
  ): void {
    this.escalationCounter.inc({
      agent_id: agentId,
      reason,
      suggested_action: suggestedAction,
    });
  }

  /**
   * Update agent health status
   */
  updateAgentHealth(agentId: string, teamId: string, healthy: boolean): void {
    this.agentHealthGauge.set(
      { agent_id: agentId, team_id: teamId || 'none' },
      healthy ? 1 : 0
    );
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreakerState(serviceName: string, state: 'closed' | 'half-open' | 'open'): void {
    const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
    this.circuitBreakerStateGauge.set({ service_name: serviceName }, stateValue);
  }

  /**
   * Update recovery attempts for an agent
   */
  updateRecoveryAttempts(agentId: string, attempts: number): void {
    this.recoveryAttemptsGauge.set({ agent_id: agentId }, attempts);
  }

  // ============================================================================
  // Metrics Export
  // ============================================================================

  /**
   * Get Prometheus-formatted metrics
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics registry for custom use
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsAsJSON(): Promise<unknown> {
    return this.registry.getMetricsAsJSON();
  }

  // ============================================================================
  // Dashboard Data
  // ============================================================================

  async getDashboardData(): Promise<RecoveryDashboardData> {
    const stats = this.selfHealingController?.getStats();
    const healingMetrics = this.selfHealingController?.getMetrics();
    const recentAttempts = this.selfHealingController 
      ? await this.selfHealingController.getRecentRecoveries(10)
      : [];
    
    const cbMetrics = this.circuitBreakerRegistry?.getAllMetrics() || [];
    const cbStats = this.circuitBreakerRegistry?.getAllStats() || [];

    const checkpointStats = this.checkpointManager 
      ? await this.checkpointManager.getStats()
      : { totalCheckpoints: 0, checkpointsByType: {}, storageSizeBytes: 0 };

    const totalRecoveries = stats?.totalRecoveryAttempts || 0;
    const successfulRecoveries = stats?.successfulRecoveries || 0;
    const successRate = totalRecoveries > 0 
      ? (successfulRecoveries / totalRecoveries) * 100 
      : 0;

    return {
      summary: {
        totalRecoveries,
        successfulRecoveries,
        failedRecoveries: stats?.failedRecoveries || 0,
        successRate: Math.round(successRate * 100) / 100,
        avgRecoveryTimeMs: stats?.avgRecoveryTimeMs || 0,
        activeEscalations: stats?.escalatedAgents || 0,
      },
      circuitBreakers: cbMetrics,
      recentRecoveries: recentAttempts.map(a => ({
        agentId: a.agentId,
        success: a.success,
        durationMs: a.durationMs,
        strategy: a.strategy,
        timestamp: a.timestamp,
      })),
      healthStatus: {
        healthyAgents: stats?.healthyAgents || 0,
        recoveringAgents: stats?.recoveringAgents || 0,
        failedAgents: stats?.failedAgents || 0,
        escalatedAgents: stats?.escalatedAgents || 0,
      },
      checkpoints: {
        total: checkpointStats.totalCheckpoints,
        byType: checkpointStats.checkpointsByType,
        storageSizeBytes: checkpointStats.storageSizeBytes,
      },
    };
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      checkpointManager: boolean;
      circuitBreakerRegistry: boolean;
      selfHealingController: boolean;
      openCircuits: number;
      escalatedAgents: number;
    };
  } {
    const openCircuits = this.circuitBreakerRegistry?.getByState('open').length || 0;
    const escalatedAgents = this.selfHealingController?.getEscalatedAgents().length || 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (escalatedAgents > 0 || openCircuits > 3) {
      status = 'degraded';
    }
    
    if (openCircuits > 5 || escalatedAgents > 3) {
      status = 'unhealthy';
    }

    return {
      status,
      details: {
        checkpointManager: !!this.checkpointManager,
        circuitBreakerRegistry: !!this.circuitBreakerRegistry,
        selfHealingController: !!this.selfHealingController,
        openCircuits,
        escalatedAgents,
      },
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalRecoveryObservability: RecoveryObservability | null = null;

export function getGlobalRecoveryObservability(
  config?: Partial<RecoveryObservabilityConfig>
): RecoveryObservability {
  if (!globalRecoveryObservability) {
    globalRecoveryObservability = new RecoveryObservability(config);
  }
  return globalRecoveryObservability;
}

export function resetGlobalRecoveryObservability(): void {
  globalRecoveryObservability = null;
}

export default RecoveryObservability;
