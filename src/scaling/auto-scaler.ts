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

import { logger } from '../utils/logger';
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

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AutoScalerConfig = {
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

    this.redis.on('error', (err: Error) => {
      logger.error('[AutoScaler] Redis connection error', { error: err.message });
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

  async collectMetrics(teamId: string, currentAgentCount: number): Promise<ScalingMetrics> {
    const timestamp = new Date();

    // Collect from Redis
    const queueDepth = await this.getQueueDepth(teamId);
    const eventBacklogSize = await this.getEventBacklogSize(teamId);
    
    // Collect from Prometheus (via Redis cache)
    const avgCpuUtilization = await this.getCpuUtilization(teamId);
    const avgMemoryUtilization = await this.getMemoryUtilization(teamId);
    const taskCompletionRate = await this.getTaskCompletionRate(teamId);
    const avgTaskLatency = await this.getTaskLatency(teamId);
    const currentCost = await this.getCurrentCost(teamId);
    const budgetUtilization = await this.getBudgetUtilization(teamId);

    // Calculate queue growth rate from history (would be stored in Redis)
    const queueGrowthRate = await this.getQueueGrowthRate(teamId);

    return {
      timestamp,
      teamId,
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

  private async getQueueDepth(teamId: string): Promise<number> {
    try {
      const depth = await this.redis?.llen(`godel:queue:${teamId}`);
      return depth || 0;
    } catch {
      return 0;
    }
  }

  private async getEventBacklogSize(teamId: string): Promise<number> {
    try {
      const backlog = await this.redis?.xlen(`godel:events:${teamId}`);
      return backlog || 0;
    } catch {
      return 0;
    }
  }

  private async getCpuUtilization(teamId: string): Promise<number> {
    try {
      const cpu = await this.redis?.get(`godel:metrics:${teamId}:cpu`);
      return cpu ? parseFloat(cpu) : 50; // Default to 50%
    } catch {
      return 50;
    }
  }

  private async getMemoryUtilization(teamId: string): Promise<number> {
    try {
      const memory = await this.redis?.get(`godel:metrics:${teamId}:memory`);
      return memory ? parseFloat(memory) : 50; // Default to 50%
    } catch {
      return 50;
    }
  }

  private async getTaskCompletionRate(teamId: string): Promise<number> {
    try {
      const rate = await this.redis?.get(`godel:metrics:${teamId}:completion_rate`);
      return rate ? parseFloat(rate) : 0;
    } catch {
      return 0;
    }
  }

  private async getTaskLatency(teamId: string): Promise<number> {
    try {
      const latency = await this.redis?.get(`godel:metrics:${teamId}:latency`);
      return latency ? parseFloat(latency) : 0;
    } catch {
      return 0;
    }
  }

  private async getCurrentCost(teamId: string): Promise<number> {
    try {
      const cost = await this.redis?.get(`godel:budget:${teamId}:consumed`);
      return cost ? parseFloat(cost) : 0;
    } catch {
      return 0;
    }
  }

  private async getBudgetUtilization(teamId: string): Promise<number> {
    try {
      const utilization = await this.redis?.get(`godel:budget:${teamId}:utilization`);
      return utilization ? parseFloat(utilization) : 0;
    } catch {
      return 0;
    }
  }

  private async getQueueGrowthRate(teamId: string): Promise<number> {
    try {
      const rate = await this.redis?.get(`godel:metrics:${teamId}:queue_growth`);
      return rate ? parseFloat(rate) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Publish metrics to Redis for other components
   */
  async publishMetrics(teamId: string, metrics: ScalingMetrics): Promise<void> {
    const key = `godel:scaling:metrics:${teamId}`;
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
      this.recordError(`Failed to start: ${(error as Error).message}`);
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
   * Register a scaling policy for a team
   */
  registerPolicy(policy: ScalingPolicy): void {
    this.state.activePolicies.set(policy.teamId, policy);
    this.scalingHistory.set(policy.teamId, {});
    
    // Initialize queue tracker for this team
    if (!this.queueTrackers.has(policy.teamId)) {
      this.queueTrackers.set(policy.teamId, new QueueGrowthTracker());
    }

    logger.info(`[AutoScaler] Registered policy for team ${policy.teamId}`);
    this.emit('policy.registered', policy);
  }

  /**
   * Unregister a scaling policy
   */
  unregisterPolicy(teamId: string): void {
    this.state.activePolicies.delete(teamId);
    this.scalingHistory.delete(teamId);
    this.queueTrackers.delete(teamId);
    this.budgetManager.unregisterBudget(teamId);
    
    logger.info(`[AutoScaler] Unregistered policy for team ${teamId}`);
    this.emit('policy.unregistered', { teamId });
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
        teamId: alert.teamId,
        payload: alert,
      });
    });

    logger.info(`[AutoScaler] Registered budget for team ${config.teamId}`);
  }

  /**
   * Get decision history for a team
   */
  getDecisionHistory(teamId: string): ScalingDecision[] {
    return this.state.recentDecisions.filter(d => d.teamId === teamId);
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
   * Force a scaling evaluation for a specific team
   */
  async evaluateTeam(teamId: string): Promise<ScalingDecision | null> {
    const policy = this.state.activePolicies.get(teamId);
    if (!policy) {
      logger.warn(`[AutoScaler] No policy found for team ${teamId}`);
      return null;
    }

    return this.evaluateTeamInternal(teamId, policy);
  }

  /**
   * Evaluate a scaling policy against metrics
   * This is a public method that can be used for testing and manual evaluation
   */
  evaluatePolicy(metrics: ScalingMetrics, policy: ScalingPolicy): ScalingDecision {
    // Get scaling history
    const history = this.scalingHistory.get(metrics.teamId) || {};

    // Use the policy evaluator
    const decision = evaluateScalingPolicy(policy, metrics, history.lastScaleUp, history.lastScaleDown, this.budgetManager?.isBudgetExceeded(metrics.teamId));

    // Store the decision
    this.state.recentDecisions.unshift(decision);
    if (this.state.recentDecisions.length > 100) {
      this.state.recentDecisions = this.state.recentDecisions.slice(0, 100);
    }

    // Update scaling history
    if (decision.action === 'scale_up') {
      history.lastScaleUp = new Date();
    } else if (decision.action === 'scale_down') {
      history.lastScaleDown = new Date();
    }
    this.scalingHistory.set(metrics.teamId, history);

    return decision;
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

      // Evaluate each team
      for (const [teamId, policy] of Array.from(this.state.activePolicies)) {
        try {
          await this.evaluateTeamInternal(teamId, policy);
        } catch (error) {
          this.recordError(`Error evaluating team ${teamId}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      this.recordError(`Error in evaluateAll: ${(error as Error).message}`);
    }
  }

  private async evaluateTeamInternal(
    teamId: string, 
    policy: ScalingPolicy
  ): Promise<ScalingDecision | null> {
    // Collect metrics
    const metrics = await this.metricsCollector.collectMetrics(
      teamId, 
      policy.minAgents // Will be updated with actual count
    );

    // Update with actual agent count from metrics
    metrics.currentAgentCount = await this.getActualAgentCount(teamId);

    // Update queue tracker
    const queueTracker = this.queueTrackers.get(teamId);
    if (queueTracker) {
      queueTracker.record(metrics);
    }

    // Publish metrics to Redis
    await this.metricsCollector.publishMetrics(teamId, metrics);

    // Update budget tracking
    const alert = this.budgetManager.updateCost(teamId, metrics.currentCost);
    if (alert) {
      this.emit('cost.alert', alert);
    }

    // Check if budget blocks scaling
    const budgetExceeded = this.budgetManager.isBudgetExceeded(teamId);
    if (budgetExceeded && this.config.debug) {
      logger.debug(`[AutoScaler] Budget exceeded for team ${teamId}`);
    }

    // Get scaling history
    const history = this.scalingHistory.get(teamId) || {};

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
      teamId,
      payload: decision,
    });

    // Execute if needed
    if (decision.action !== 'maintain') {
      await this.executeDecision(teamId, decision);
    }

    return decision;
  }

  private async executeDecision(
    teamId: string, 
    decision: ScalingDecision
  ): Promise<void> {
    // Check cost constraints
    const blockCheck = this.budgetManager.shouldBlockScaling(
      teamId,
      decision.targetAgentCount
    );

    if (blockCheck.blocked) {
      decision.blockReason = blockCheck.reason;
      decision.executionResult = 'blocked';
      
      this.emitScalingEvent({
        id: `evt_${Date.now()}`,
        type: 'scaling.blocked',
        timestamp: new Date(),
        teamId,
        payload: decision,
      });

      logger.warn(`[AutoScaler] Scaling blocked for ${teamId}: ${blockCheck.reason}`);
      return;
    }

    // Check rate limiting
    if (this.isRateLimited()) {
      decision.blockReason = 'Rate limited';
      decision.executionResult = 'blocked';
      logger.warn(`[AutoScaler] Scaling rate limited for ${teamId}`);
      return;
    }

    // Execute scaling
    const startTime = Date.now();
    decision.executed = true;
    decision.executedAt = new Date();

    try {
      // Update scaling history
      const history = this.scalingHistory.get(teamId) || {};
      if (decision.action === 'scale_up') {
        history.lastScaleUp = new Date();
      } else if (decision.action === 'scale_down') {
        history.lastScaleDown = new Date();
      }
      this.scalingHistory.set(teamId, history);

      // Increment rate limit counter
      this.state.scalingOperationCount++;

      // Emit execute event
      this.emit('scaling.execute', decision);

      // Perform actual scaling (would call orchestrator)
      await this.performScaling(teamId, decision);

      decision.executionResult = 'success';

      logger.info(
        `[AutoScaler] Scaled ${teamId}: ${decision.currentAgentCount} → ${decision.targetAgentCount} ` +
        `(${decision.action}) in ${Date.now() - startTime}ms`
      );
    } catch (error) {
      decision.executionResult = 'failure';
      this.recordError(`Scaling execution failed for ${teamId}: ${(error as Error).message}`);
      
      this.emitScalingEvent({
        id: `evt_${Date.now()}`,
        type: 'scaling.error',
        timestamp: new Date(),
        teamId,
        payload: { error: String(error), details: decision },
      });
    }

    // Emit executed event
    this.emitScalingEvent({
      id: `evt_${Date.now()}`,
      type: 'scaling.executed',
      timestamp: new Date(),
      teamId,
      payload: decision,
    });
  }

  private async performScaling(teamId: string, decision: ScalingDecision): Promise<void> {
    // This would integrate with the TeamOrchestrator to actually scale
    // For now, we emit an event that the orchestrator can listen to
    this.emit('scale', {
      teamId,
      action: decision.action,
      fromCount: decision.currentAgentCount,
      toCount: decision.targetAgentCount,
      reason: decision.reason,
    });

    // Also store in Redis for external consumers
    const redis = new Redis(this.config.redisUrl!);
    await redis.publish(
      'godel:scaling:commands',
      JSON.stringify({
        teamId,
        action: decision.action,
        targetCount: decision.targetAgentCount,
        timestamp: Date.now(),
      })
    );
    await redis.quit();
  }

  private async getActualAgentCount(teamId: string): Promise<number> {
    // Would query the orchestrator or Prometheus
    // For now, return from Redis
    try {
      const redis = new Redis(this.config.redisUrl!);
      const count = await redis.get(`godel:team:${teamId}:agent_count`);
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
  globalAutoScaler?.stop().catch((error) => {
    logger.error('auto-scaler', 'Failed to stop auto-scaler', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  globalAutoScaler = null;
}

export default AutoScaler;
