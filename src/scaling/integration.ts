/**
 * Scaling Integration
 * 
 * Integration layer connecting the auto-scaler with existing Dash components:
 * - Event bus for scaling events
 * - Swarm orchestrator for scaling operations
 * - PostgreSQL repositories for persistence
 * - Prometheus metrics for monitoring
 */

import { logger } from '../utils/logger';
import { AutoScaler } from './auto-scaler';
import {
  ScalingPolicy,
  ScalingDecision,
  ScalingEvent,
  BudgetConfig,
  AutoScalerConfig,
} from './types';
import { SwarmOrchestrator } from '../core/swarm-orchestrator';
import { RedisEventBus } from '../core/event-bus-redis';
import { PrometheusMetrics } from '../metrics/prometheus';
import { SwarmRepository, BudgetRepository } from '../storage/repositories';

// ============================================================================
// Scaling Service
// ============================================================================

/**
 * High-level service for managing auto-scaling across all swarms
 */
export class ScalingService {
  private autoScaler: AutoScaler;
  private orchestrator?: SwarmOrchestrator;
  private eventBus?: RedisEventBus;
  private prometheus?: PrometheusMetrics;
  private swarmRepository?: SwarmRepository;
  private budgetRepository?: BudgetRepository;
  private isInitialized: boolean = false;

  constructor(config?: Partial<AutoScalerConfig>) {
    this.autoScaler = new AutoScaler(config);
    this.setupEventHandlers();
  }

  /**
   * Initialize with required dependencies
   */
  initialize(options: {
    orchestrator: SwarmOrchestrator;
    eventBus: RedisEventBus;
    prometheus: PrometheusMetrics;
    swarmRepository: SwarmRepository;
    budgetRepository: BudgetRepository;
  }): void {
    this.orchestrator = options.orchestrator;
    this.eventBus = options.eventBus;
    this.prometheus = options.prometheus;
    this.swarmRepository = options.swarmRepository;
    this.budgetRepository = options.budgetRepository;

    // Set up event bus integration
    this.autoScaler.setEventBus({
      emitEvent: (event: ScalingEvent) => {
        this.emitToEventBus(event);
      },
    });

    // Listen for scaling commands from Redis
    this.subscribeToScalingCommands();

    this.isInitialized = true;
    logger.info('[ScalingService] Initialized');
  }

  /**
   * Start the scaling service
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ScalingService not initialized. Call initialize() first.');
    }

    await this.autoScaler.start();
    logger.info('[ScalingService] Started');
  }

  /**
   * Stop the scaling service
   */
  async stop(): Promise<void> {
    await this.autoScaler.stop();
    logger.info('[ScalingService] Stopped');
  }

  /**
   * Enable auto-scaling for a swarm
   */
  async enableAutoScaling(
    swarmId: string,
    policy?: Partial<ScalingPolicy>
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ScalingService not initialized');
    }

    // Get swarm info
    const swarm = await this.swarmRepository?.findById(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    // Create default policy with overrides
    const defaultMinAgents = policy?.minAgents || 5;
    const defaultMaxAgents = policy?.maxAgents || 50;

    const fullPolicy: ScalingPolicy = {
      swarmId,
      minAgents: defaultMinAgents,
      maxAgents: defaultMaxAgents,
      scaleUp: {
        thresholds: [
          { metric: 'queue_depth', value: 10, operator: 'gt', weight: 0.5 },
          { metric: 'agent_cpu_percent', value: 70, operator: 'gt', weight: 0.3 },
          { metric: 'agent_memory_percent', value: 80, operator: 'gt', weight: 0.2 },
        ],
        increment: 'auto',
        maxIncrement: 10,
        cooldownSeconds: 30,
        requireAllThresholds: false,
        ...policy?.scaleUp,
      },
      scaleDown: {
        thresholds: [
          { metric: 'queue_depth', value: 3, operator: 'lt', weight: 0.4 },
          { metric: 'agent_cpu_percent', value: 30, operator: 'lt', weight: 0.3 },
          { metric: 'agent_memory_percent', value: 40, operator: 'lt', weight: 0.3 },
        ],
        decrement: 'auto',
        minAgents: defaultMinAgents,
        cooldownSeconds: 300,
        requireAllThresholds: true,
        gracefulShutdownSeconds: 60,
        ...policy?.scaleDown,
      },
      predictiveScaling: true,
      costAwareScaling: true,
      ...policy,
    };

    this.autoScaler.registerPolicy(fullPolicy);

    // Update swarm config in database
    await this.swarmRepository?.update(swarmId, {
      config: {
        ...swarm.config,
        autoScaling: {
          enabled: true,
          policy: fullPolicy,
        },
      },
    });

    logger.info(`[ScalingService] Enabled auto-scaling for swarm ${swarmId}`);
  }

  /**
   * Disable auto-scaling for a swarm
   */
  async disableAutoScaling(swarmId: string): Promise<void> {
    this.autoScaler.unregisterPolicy(swarmId);

    // Update swarm config in database
    const swarm = await this.swarmRepository?.findById(swarmId);
    if (swarm) {
      await this.swarmRepository?.update(swarmId, {
        config: {
          ...swarm.config,
          autoScaling: {
            enabled: false,
          },
        },
      });
    }

    logger.info(`[ScalingService] Disabled auto-scaling for swarm ${swarmId}`);
  }

  /**
   * Set budget for a swarm
   */
  async setBudget(config: BudgetConfig): Promise<void> {
    this.autoScaler.registerBudget(config);

    // Persist to database
    await this.budgetRepository?.create({
      swarm_id: config.swarmId,
      scope_id: config.swarmId,
      scope_type: 'swarm',
      allocated: config.totalBudget,
      currency: config.currency || 'USD',
    });

    logger.info(`[ScalingService] Set budget for swarm ${config.swarmId}: $${config.totalBudget}`);
  }

  /**
   * Get auto-scaler health
   */
  getHealth() {
    return this.autoScaler.getHealth();
  }

  /**
   * Get decision history for a swarm
   */
  getDecisionHistory(swarmId: string) {
    return this.autoScaler.getDecisionHistory(swarmId);
  }

  /**
   * Force evaluation of a swarm
   */
  async evaluateSwarm(swarmId: string): Promise<ScalingDecision | null> {
    return this.autoScaler.evaluateSwarm(swarmId);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setupEventHandlers(): void {
    // Handle scale events
    this.autoScaler.on('scale', async (command: {
      swarmId: string;
      action: string;
      fromCount: number;
      toCount: number;
      reason: string;
    }) => {
      await this.executeScaleCommand(command);
    });

    // Handle cost alerts
    this.autoScaler.on('cost.alert', (alert) => {
      logger.warn(`[ScalingService] Cost alert for ${alert.swarmId}: ${alert.level}`);
      
      // Update Prometheus metrics
      this.prometheus?.errorsTotalCounter.inc({
        error_type: 'budget_alert',
        component: 'auto_scaler',
        severity: alert.level,
      });
    });

    // Handle scaling events for metrics
    this.autoScaler.on('scaling.executed', (decision: ScalingDecision) => {
      // Record in Prometheus
      if (decision.action === 'scale_up') {
        this.prometheus?.agentTotalGauge.inc({ status: 'scaling_up' });
      } else if (decision.action === 'scale_down') {
        this.prometheus?.agentTotalGauge.dec({ status: 'scaling_down' });
      }
    });
  }

  private async executeScaleCommand(command: {
    swarmId: string;
    action: string;
    fromCount: number;
    toCount: number;
    reason: string;
  }): Promise<void> {
    if (!this.orchestrator) {
      logger.error('[ScalingService] No orchestrator available');
      return;
    }

    try {
      logger.info(
        `[ScalingService] Executing scale: ${command.swarmId} ` +
        `${command.fromCount} → ${command.toCount}`
      );

      await this.orchestrator.scale(command.swarmId, command.toCount);

      // Update swarm status in database
      await this.swarmRepository?.updateStatus(command.swarmId, 'scaling');
      await this.swarmRepository?.updateStatus(command.swarmId, 'active');

    } catch (error) {
      logger.error(`[ScalingService] Scale execution failed: ${error}`);
      
      // Record failure in Prometheus
      this.prometheus?.errorsTotalCounter.inc({
        error_type: 'scaling_failure',
        component: 'scaling_service',
        severity: 'error',
      });

      throw error;
    }
  }

  private emitToEventBus(event: ScalingEvent): void {
    if (!this.eventBus) {
      return;
    }

    // Convert to AgentEvent format for the event bus
    const agentEvent = {
      id: event.id,
      type: 'agent_start', // Map to appropriate type
      timestamp: event.timestamp.getTime(),
      agentId: event.swarmId,
      swarmId: event.swarmId,
      ...event.payload,
    };

    this.eventBus.emitEvent(agentEvent as any);
  }

  private subscribeToScalingCommands(): void {
    // Subscribe to Redis channel for external scaling commands
    // This allows the CLI or API to trigger scaling
    // Implementation would go here
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let globalScalingService: ScalingService | null = null;

export function createScalingService(
  options: {
    orchestrator: SwarmOrchestrator;
    eventBus: RedisEventBus;
    prometheus: PrometheusMetrics;
    swarmRepository: SwarmRepository;
    budgetRepository: BudgetRepository;
    config?: Partial<AutoScalerConfig>;
  }
): ScalingService {
  const service = new ScalingService(options.config);
  service.initialize({
    orchestrator: options.orchestrator,
    eventBus: options.eventBus,
    prometheus: options.prometheus,
    swarmRepository: options.swarmRepository,
    budgetRepository: options.budgetRepository,
  });
  return service;
}

export function getGlobalScalingService(): ScalingService | null {
  return globalScalingService;
}

export function setGlobalScalingService(service: ScalingService): void {
  globalScalingService = service;
}

export default ScalingService;
