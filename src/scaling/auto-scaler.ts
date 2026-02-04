/**
 * Auto-Scaler
 * 
 * Main auto-scaling controller that evaluates scaling policies,
 * makes scaling decisions, and executes scaling operations.
 * 
 * Integrates with:
 * - Redis for queue depth metrics
 * - Prometheus for agent utilization metrics
 * - PostgreSQL for budget tracking
 * - Event bus for scaling events
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import {
  AutoScalerConfig,
  AutoScalerState,
  ScalingPolicy,
  ScalingMetrics,
  ScalingDecision,
  ScalingEvent,
  AutoScalerHealth,
  PredictiveScalingConfig,
  CostTrackingConfig,
  BudgetConfig,
  IAutoScaler,
} from './types';
import {
  createDefaultScalingPolicy,
  evaluateScalingPolicy,
} from './policies';
import {
  QueueGrowthTracker,
  makePredictiveDecision,
  DEFAULT_PREDICTIVE_CONFIG,
} from './predictive';
import {
  BudgetManager,
  calculateCost,
  DEFAULT_COST_CONFIG,
} from './cost-tracker';
import { logger } from '../utils/logger';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AutoScalerConfig = {
  evaluationIntervalSeconds: 30,
  evaluationIntervalSeconds: 30,
  defaultPolicy: {
    minAgents: 5,
    maxAgents: 50,
  },
  predictive: DEFAULT_PREDICTIVE_CONFIG,
  costTracking: DEFAULT_COST_CONFIG,
  redisUrl: process.env['REDIS_URL'] || 'redis://localhost:6379/0',
  debug: false,
  maxScalingOperationsPerHour: 20,
};

// ============================================================================
// Metrics Collector
// ============================================================================

/**
 * Collects metrics from various sources (Redis, Prometheus, etc.)
 */
class MetricsCollector {
  private redis: Redis | null = null;
  private redisUrl: string;
  private debug: boolean;

  constructor(redisUrl: string, debug: boolean = false) {
    this.redisUrl = redisUrl;
    this.debug = debug;
  }

  async connect(): Promise<void> {
    this.redis = new Redis(this.redisUrl, {
      retryStrategy: (times) => Math.min(times * 1000, 10000),
    });

    this.redis.on('error', (err) => {
      logger.error('[AutoScaler] Redis connection error:', err);
    });

    await this.redis.ping();
    
    if (this.debug) {
      logger.info('[AutoScaler] Metrics collector connected to Redis');
    }
  }

  async disconnect(): Promise<void> {
    await this.redis?.quit();
    this.redis = null;
  }

  async collectMetrics(swarmId: string, currentAgentCount: number): Promise<ScalingMetrics> {
    const timestamp = new Date();

    // Collect from Redis
    const queueDepth = await this.getQueueDepth(swarmId);
    const eventBacklogSize = await this.getEventBacklogSize(swarmId);
    
    // Collect from Prometheus (via Redis cache)
    const avgCpuUtilization = await this.getCpuUtilization(swarmId);
    const avgMemoryUtilization = await this.getMemoryUtilization(swarmId);
    const taskCompletionRate = await this.getTaskCompletionRate(swarmId);
    const avgTaskLatency = await this.getTaskLatency(swarmId);
    const currentCost = await this.getCurrentCost(swarmId);
    const budgetUtilization = await this.getBudgetUtilization(swarmId);

    // Calculate queue growth rate from history (would be stored in Redis)
    const queueGrowthRate = await this.getQueueGrowthRate(swarmId);

    return {
      timestamp,
      swarmId,
      currentAgentCount,
      queueDepth,
      queueGrowthRate,
      avgCpuUtilization,
      avgMemoryUtilization,
      eventBacklogSize,
      taskCompletionRate,
      avgTaskLatency,
      currentCost,
      budgetUtilization,
    };
  }

  private async getQueueDepth(swarmId: string): Promise<number> {
    try {
      const depth = await this.redis?.llen(`dash:queue:${swarmId}`);
      return depth || 0;
    } catch {
      return 0;
    }
  }

  private async getEventBacklogSize(swarmId: string): Promise<number> {
    try {
      const backlog = await this.redis?.xlen(`dash:events:${swarmId}`);
      return backlog || 0;
    } catch {
      return 0;
    }
  }

  private async getCpuUtilization(swarmId: string): Promise<number> {
    try {
      const cpu = await this.redis?.get(`dash:metrics:${swarmId}:cpu`);
      return cpu ? parseFloat(cpu) : 50; // Default to 50%
    } catch {
      return 50;
    }
  }

  private async getMemoryUtilization(swarmId: string): Promise<number> {
    try {
      const memory = await this.redis?.get(`dash:metrics:${swarmId}:memory`);
      return memory ? parseFloat(memory) : 50; // Default to 50%
    } catch {
      return 50;
    }
  }

  private async getTaskCompletionRate(swarmId: string): Promise<number> {
    try {
      const rate = await this.redis?.get(`dash:metrics:${swarmId}:completion_rate`);
      return rate ? parseFloat(rate) : 0;
    } catch {
      return 0;
    }
  }

  private async getTaskLatency(swarmId: string): Promise<number> {
    try {
      const latency = await this.redis?.get(`dash:metrics:${swarmId}:latency`);
      return latency ? parseFloat(latency) : 0;
    } catch {
      return 0;
    }
  }

  private async getCurrentCost(swarmId: string): Promise<number> {
    try {
      const cost = await this.redis?.get(`dash:budget:${swarmId}:consumed`);
      return cost ? parseFloat(cost) : 0;
    } catch {
      return 0;
    }
  }

  private async getBudgetUtilization(swarmId: string): Promise<number> {
    try {
      const utilization = await this.redis?.get(`dash:budget:${swarmId}:utilization`);
      return utilization ? parseFloat(utilization) : 0;
    } catch {
      return 0;
    }
  }

  private async getQueueGrowthRate(swarmId: string): Promise<number> {
    try {
      const rate = await this.redis?.get(`dash:metrics:${swarmId}:queue_growth`);
      return rate ? parseFloat(rate) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Publish metrics to Redis for other components
   */
  async publishMetrics(swarmId: string, metrics: ScalingMetrics): Promise<void> {
    const key = `dash:scaling:metrics:${swarmId}`;
    await this.redis?.setex(key, 300, JSON.stringify(metrics)); // 5 minute TTL
  }

  isConnected(): boolean {
    return this.redis?.status === 'ready';
  }
}

// ============================================================================
// Auto-Scaler Implementation
// ============================================================================

export class AutoScaler extends EventEmitter implements IAutoScaler {
  private config: AutoScalerConfig;
  private state: AutoScalerState;
  private metricsCollector: MetricsCollector;
  private budgetManager: BudgetManager;
  private queueTrackers: Map<string, QueueGrowthTracker> = new Map();
  private scalingHistory: Map<string, { lastScaleUp?: Date; lastScaleDown?: Date }> = new Map();
  private evaluationTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private recentErrors: string[] = [];
  private eventBus?: { emitEvent: (event: ScalingEvent) => void };

  constructor(config: Partial<AutoScalerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isRunning: false,
      scalingOperationCount: 0,
      scalingCountResetAt: new Date(),
      activePolicies: new Map(),
      recentDecisions: [],
      metricHistory: new Map(),
    };
    this.metricsCollector = new MetricsCollector(
      this.config.redisUrl || DEFAULT_CONFIG.redisUrl!,
      this.config.debug
    );
    this.budgetManager = new BudgetManager(this.config.costTracking || DEFAULT_COST_CONFIG);
  }

  /**
   * Set event bus for emitting scaling events
   */
  setEventBus(eventBus: { emitEvent: (event: ScalingEvent) => void }): void {
    this.eventBus = eventBus;
  }

  /**
   * Start the auto-scaler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[AutoScaler] Already running');
      return;
    }

    logger.info('[AutoScaler] Starting...');

    try {
      await this.metricsCollector.connect();
      
      this.isRunning = true;
      this.state.isRunning = true;

      // Start evaluation loop
      this.evaluationTimer = setInterval(
        () => this.evaluateAll(),
        this.config.evaluationIntervalSeconds! * 1000
      );

      // Do initial evaluation
      await this.evaluateAll();

      this.emit('started');
      logger.info('[AutoScaler] Started successfully');
    } catch (error) {
      this.recordError(`Failed to start: ${error}`);
      throw error;
    }
  }

  /**
   * Stop the auto-scaler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('[AutoScaler] Stopping...');

    this.isRunning = false;
    this.state.isRunning = false;

    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = undefined;
    }

    await this.metricsCollector.disconnect();

    this.emit('stopped');
    logger.info('[AutoScaler] Stopped');
  }

  /**
   * Register a scaling policy for a swarm
   */
  registerPolicy(policy: ScalingPolicy): void {
    this.state.activePolicies.set(policy.swarmId, policy);
    this.scalingHistory.set(policy.swarmId, {});
    
    // Initialize queue tracker for this swarm
    if (!this.queueTrackers.has(policy.swarmId)) {
      this.queueTrackers.set(policy.swarmId, new QueueGrowthTracker());
    }

    logger.info(`[AutoScaler] Registered policy for swarm ${policy.swarmId}`);
    this.emit('policy.registered', policy);
  }

  /**
   * Unregister a scaling policy
   */
  unregisterPolicy(swarmId: string): void {
    this.state.activePolicies.delete(swarmId);
    this.scalingHistory.delete(swarmId);
    this.queueTrackers.delete(swarmId);
    this.budgetManager.unregisterBudget(swarmId);
    
    logger.info(`[AutoScaler] Unregistered policy for swarm ${swarmId}`);
    this.emit('policy.unregistered', { swarmId });
  }

  /**
   * Register a budget for cost-aware scaling
   */
  registerBudget(config: BudgetConfig): void {
    this.budgetManager.registerBudget(config);
    
    // Listen for budget alerts
    this.budgetManager.onAlert((alert) => {
      this.emitScalingEvent({
        id: `evt_${Date.now()}`,
        type: 'cost.alert',
        timestamp: new Date(),
        swarmId: alert.swarmId,
        payload: alert,
      });
    });

    logger.info(`[AutoScaler] Registered budget for swarm ${config.swarmId}`);
  }

  /**
   * Get decision history for a swarm
   */
  getDecisionHistory(swarmId: string): ScalingDecision[] {
    return this.state.recentDecisions.filter(d => d.swarmId === swarmId);
  }

  /**
   * Get auto-scaler health status
   */
  getHealth(): AutoScalerHealth {
    const now = new Date();
    const lastEval = this.state.lastEvaluationAt;
    const evaluationLag = lastEval 
      ? (now.getTime() - lastEval.getTime()) / 1000 
      : undefined;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!this.isRunning) {
      status = 'unhealthy';
    } else if (!this.metricsCollector.isConnected()) {
      status = 'degraded';
    } else if (evaluationLag && evaluationLag > this.config.evaluationIntervalSeconds! * 2) {
      status = 'degraded';
    }

    return {
      status,
      redisConnected: this.metricsCollector.isConnected(),
      metricsHealthy: this.metricsCollector.isConnected(),
      lastEvaluationAt: lastEval,
      evaluationLagSeconds: evaluationLag,
      activePoliciesCount: this.state.activePolicies.size,
      recentErrors: [...this.recentErrors],
    };
  }

  /**
   * Force a scaling evaluation for a specific swarm
   */
  async evaluateSwarm(swarmId: string): Promise<ScalingDecision | null> {
    const policy = this.state.activePolicies.get(swarmId);
    if (!policy) {
      logger.warn(`[AutoScaler] No policy found for swarm ${swarmId}`);
      return null;
    }

    return this.evaluateSwarmInternal(swarmId, policy);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async evaluateAll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.state.lastEvaluationAt = new Date();

    try {
      // Check rate limiting
      this.checkRateLimitReset();
      
      if (this.isRateLimited()) {
        if (this.config.debug) {
          logger.debug('[AutoScaler] Rate limited, skipping evaluation');
        }
        return;
      }

      // Evaluate each swarm
      for (const [swarmId, policy] of this.state.activePolicies) {
        try {
          await this.evaluateSwarmInternal(swarmId, policy);
        } catch (error) {
          this.recordError(`Error evaluating swarm ${swarmId}: ${error}`);
        }
      }
    } catch (error) {
      this.recordError(`Error in evaluateAll: ${error}`);
    }
  }

  private async evaluateSwarmInternal(
    swarmId: string, 
    policy: ScalingPolicy
  ): Promise<ScalingDecision | null> {
    // Collect metrics
    const metrics = await this.metricsCollector.collectMetrics(
      swarmId, 
      policy.minAgents // Will be updated with actual count
    );

    // Update with actual agent count from metrics
    metrics.currentAgentCount = await this.getActualAgentCount(swarmId);

    // Update queue tracker
    const queueTracker = this.queueTrackers.get(swarmId);
    if (queueTracker) {
      queueTracker.record(metrics);
    }

    // Publish metrics to Redis
    await this.metricsCollector.publishMetrics(swarmId, metrics);

    // Update budget tracking
    const alert = this.budgetManager.updateCost(swarmId, metrics.currentCost);
    if (alert) {
      this.emit('cost.alert', alert);
    }

    // Check if budget blocks scaling
    const budgetExceeded = this.budgetManager.isBudgetExceeded(swarmId);
    if (budgetExceeded && this.config.debug) {
      logger.debug(`[AutoScaler] Budget exceeded for swarm ${swarmId}`);
    }

    // Get scaling history
    const history = this.scalingHistory.get(swarmId) || {};

    // Make decision using policy
    let decision = evaluateScalingPolicy(
      policy,
      metrics,
      history.lastScaleUp,
      history.lastScaleDown,
      budgetExceeded
    );

    // Consider predictive scaling if enabled and no immediate action
    if (decision.action === 'maintain' && policy.predictiveScaling) {
      const predictiveConfig: PredictiveScalingConfig = {
        ...DEFAULT_PREDICTIVE_CONFIG,
        ...this.config.predictive,
      };

      const predictiveDecision = makePredictiveDecision(
        predictiveConfig,
        metrics,
        queueTracker!,
        policy.minAgents,
        policy.maxAgents
      );

      if (predictiveDecision) {
        decision = predictiveDecision;
      }
    }

    // Store decision
    this.storeDecision(decision);

    // Emit scaling decision event
    this.emitScalingEvent({
      id: `evt_${Date.now()}`,
      type: 'scaling.decision',
      timestamp: new Date(),
      swarmId,
      payload: decision,
    });

    // Execute if needed
    if (decision.action !== 'maintain') {
      await this.executeDecision(swarmId, decision);
    }

    return decision;
  }

  private async executeDecision(
    swarmId: string, 
    decision: ScalingDecision
  ): Promise<void> {
    // Check cost constraints
    const blockCheck = this.budgetManager.shouldBlockScaling(
      swarmId,
      decision.targetAgentCount
    );

    if (blockCheck.blocked) {
      decision.blockReason = blockCheck.reason;
      decision.executionResult = 'blocked';
      
      this.emitScalingEvent({
        id: `evt_${Date.now()}`,
        type: 'scaling.blocked',
        timestamp: new Date(),
        swarmId,
        payload: decision,
      });

      logger.warn(`[AutoScaler] Scaling blocked for ${swarmId}: ${blockCheck.reason}`);
      return;
    }

    // Check rate limiting
    if (this.isRateLimited()) {
      decision.blockReason = 'Rate limited';
      decision.executionResult = 'blocked';
      logger.warn(`[AutoScaler] Scaling rate limited for ${swarmId}`);
      return;
    }

    // Execute scaling
    const startTime = Date.now();
    decision.executed = true;
    decision.executedAt = new Date();

    try {
      // Update scaling history
      const history = this.scalingHistory.get(swarmId) || {};
      if (decision.action === 'scale_up') {
        history.lastScaleUp = new Date();
      } else if (decision.action === 'scale_down') {
        history.lastScaleDown = new Date();
      }
      this.scalingHistory.set(swarmId, history);

      // Increment rate limit counter
      this.state.scalingOperationCount++;

      // Emit execute event
      this.emit('scaling.execute', decision);

      // Perform actual scaling (would call orchestrator)
      await this.performScaling(swarmId, decision);

      decision.executionResult = 'success';

      logger.info(
        `[AutoScaler] Scaled ${swarmId}: ${decision.currentAgentCount} → ${decision.targetAgentCount} ` +
        `(${decision.action}) in ${Date.now() - startTime}ms`
      );
    } catch (error) {
      decision.executionResult = 'failure';
      this.recordError(`Scaling execution failed for ${swarmId}: ${error}`);
      
      this.emitScalingEvent({
        id: `evt_${Date.now()}`,
        type: 'scaling.error',
        timestamp: new Date(),
        swarmId,
        payload: { error: String(error), details: decision },
      });
    }

    // Emit executed event
    this.emitScalingEvent({
      id: `evt_${Date.now()}`,
      type: 'scaling.executed',
      timestamp: new Date(),
      swarmId,
      payload: decision,
    });
  }

  private async performScaling(swarmId: string, decision: ScalingDecision): Promise<void> {
    // This would integrate with the SwarmOrchestrator to actually scale
    // For now, we emit an event that the orchestrator can listen to
    this.emit('scale', {
      swarmId,
      action: decision.action,
      fromCount: decision.currentAgentCount,
      toCount: decision.targetAgentCount,
      reason: decision.reason,
    });

    // Also store in Redis for external consumers
    const redis = new Redis(this.config.redisUrl!);
    await redis.publish(
      'dash:scaling:commands',
      JSON.stringify({
        swarmId,
        action: decision.action,
        targetCount: decision.targetAgentCount,
        timestamp: Date.now(),
      })
    );
    await redis.quit();
  }

  private async getActualAgentCount(swarmId: string): Promise<number> {
    // Would query the orchestrator or Prometheus
    // For now, return from Redis
    try {
      const redis = new Redis(this.config.redisUrl!);
      const count = await redis.get(`dash:swarm:${swarmId}:agent_count`);
      await redis.quit();
      return count ? parseInt(count, 10) : 5;
    } catch {
      return 5;
    }
  }

  private storeDecision(decision: ScalingDecision): void {
    this.state.recentDecisions.push(decision);
    
    // Keep only last 1000 decisions
    if (this.state.recentDecisions.length > 1000) {
      this.state.recentDecisions = this.state.recentDecisions.slice(-1000);
    }
  }

  private checkRateLimitReset(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    
    if (this.state.scalingCountResetAt < oneHourAgo) {
      this.state.scalingOperationCount = 0;
      this.state.scalingCountResetAt = now;
    }
  }

  private isRateLimited(): boolean {
    return this.state.scalingOperationCount >= (this.config.maxScalingOperationsPerHour || 20);
  }

  private recordError(message: string): void {
    logger.error(`[AutoScaler] ${message}`);
    this.recentErrors.push(`${new Date().toISOString()}: ${message}`);
    
    // Keep only last 10 errors
    if (this.recentErrors.length > 10) {
      this.recentErrors = this.recentErrors.slice(-10);
    }
  }

  private emitScalingEvent(event: ScalingEvent): void {
    // Emit via EventEmitter
    this.emit('scaling.event', event);
    
    // Emit via event bus if configured
    if (this.eventBus) {
      try {
        this.eventBus.emitEvent(event);
      } catch (error) {
        logger.error('[AutoScaler] Failed to emit event to event bus:', error);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalAutoScaler: AutoScaler | null = null;

export function getGlobalAutoScaler(config?: Partial<AutoScalerConfig>): AutoScaler {
  if (!globalAutoScaler) {
    globalAutoScaler = new AutoScaler(config);
  }
  return globalAutoScaler;
}

export function resetGlobalAutoScaler(): void {
  globalAutoScaler?.stop().catch(console.error);
  globalAutoScaler = null;
}

export default AutoScaler;
