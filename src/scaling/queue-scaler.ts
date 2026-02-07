/**
 * Queue-Based Auto-Scaler - Dynamic Scaling Based on Queue Depth
 * 
 * Automatically scales agent capacity based on:
 * - Queue depth thresholds
 * - Queue growth rate
 * - Task processing rate
 * - Multi-cluster awareness
 * 
 * @module scaling/queue-scaler
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import type { TaskQueue } from '../queue/task-queue';
import type { ClusterRegistry } from '../federation/cluster-registry';

// ============================================================================
// TYPES
// ============================================================================

export type ScalingDirection = 'up' | 'down' | 'maintain';
export type ScalingTrigger = 'queue_depth' | 'growth_rate' | 'processing_rate' | 'schedule' | 'manual';

export interface QueueScalingThresholds {
  scaleUpQueueDepth: number;
  scaleUpAggressiveDepth: number;
  scaleDownQueueDepth: number;
  scaleDownMinDepth: number;
  growthRateThreshold: number;
  processingRateThreshold: number;
}

export interface QueueScalingConfig {
  enabled: boolean;
  checkIntervalMs: number;
  cooldownMs: number;
  minAgents: number;
  maxAgents: number;
  scaleUpIncrement: number;
  scaleUpAggressiveIncrement: number;
  scaleDownIncrement: number;
  scaleDownGracePeriodMs: number;
  thresholds: QueueScalingThresholds;
  enablePredictiveScaling: boolean;
  predictionWindowMs: number;
  multiClusterScaling: boolean;
}

export interface QueueMetrics {
  depth: number;
  processingRate: number; // tasks per minute
  enqueueRate: number;    // tasks per minute
  growthRate: number;     // tasks per minute
  avgWaitTimeMs: number;
  timestamp: Date;
}

export interface ScalingDecision {
  direction: ScalingDirection;
  targetAgentCount: number;
  currentAgentCount: number;
  delta: number;
  trigger: ScalingTrigger;
  confidence: number;
  reason: string;
  timestamp: Date;
}

export interface ScalingAction {
  actionId: string;
  decision: ScalingDecision;
  clusterId?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface QueuePrediction {
  predictedDepth: number;
  predictedTime: Date;
  confidence: number;
  recommendation: 'scale_up' | 'scale_down' | 'maintain';
  recommendedAgents: number;
}

export interface QueueScalerStats {
  totalDecisions: number;
  scaleUpActions: number;
  scaleDownActions: number;
  avgDecisionTimeMs: number;
  lastDecisionAt?: Date;
  currentQueueDepth: number;
  currentAgentCount: number;
}

export interface MultiClusterScalingPlan {
  globalTargetAgents: number;
  clusterAllocations: Array<{
    clusterId: string;
    currentAgents: number;
    targetAgents: number;
    delta: number;
    reason: string;
  }>;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_QUEUE_SCALING_CONFIG: QueueScalingConfig = {
  enabled: true,
  checkIntervalMs: 30000,       // Check every 30 seconds
  cooldownMs: 120000,           // 2 minute cooldown between scalings
  minAgents: 5,
  maxAgents: 100,
  scaleUpIncrement: 5,
  scaleUpAggressiveIncrement: 15,
  scaleDownIncrement: 3,
  scaleDownGracePeriodMs: 300000, // 5 minutes before scaling down
  thresholds: {
    scaleUpQueueDepth: 50,
    scaleUpAggressiveDepth: 200,
    scaleDownQueueDepth: 10,
    scaleDownMinDepth: 5,
    growthRateThreshold: 20,     // 20 tasks/min growth
    processingRateThreshold: 10, // 10 tasks/min processing
  },
  enablePredictiveScaling: true,
  predictionWindowMs: 300000,    // 5 minute prediction window
  multiClusterScaling: true,
};

// ============================================================================
// QUEUE-BASED SCALER
// ============================================================================

export class QueueScaler extends EventEmitter {
  private taskQueue: TaskQueue;
  private clusterRegistry?: ClusterRegistry;
  private config: QueueScalingConfig;
  private metrics: QueueMetrics[] = [];
  private checkTimer?: NodeJS.Timeout;
  private lastScalingAction?: ScalingAction;
  private stats: QueueScalerStats;
  private initialized = false;
  private currentAgentCount: number;

  constructor(
    taskQueue: TaskQueue,
    initialAgentCount: number,
    config: Partial<QueueScalingConfig> = {},
    clusterRegistry?: ClusterRegistry
  ) {
    super();
    this.taskQueue = taskQueue;
    this.currentAgentCount = initialAgentCount;
    this.clusterRegistry = clusterRegistry;
    this.config = { ...DEFAULT_QUEUE_SCALING_CONFIG, ...config };
    this.stats = {
      totalDecisions: 0,
      scaleUpActions: 0,
      scaleDownActions: 0,
      avgDecisionTimeMs: 0,
      currentQueueDepth: 0,
      currentAgentCount: initialAgentCount,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    
    if (this.config.enabled) {
      this.startMonitoring();
    }

    logger.info('[QueueScaler] Initialized', {
      config: this.config,
      multiCluster: !!this.clusterRegistry,
    });
    
    this.emit('initialized');
  }

  async dispose(): Promise<void> {
    this.stopMonitoring();
    this.metrics = [];
    this.initialized = false;
    this.removeAllListeners();
    logger.info('[QueueScaler] Disposed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('QueueScaler not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // MONITORING
  // ============================================================================

  startMonitoring(): void {
    this.ensureInitialized();

    if (this.checkTimer) {
      logger.warn('[QueueScaler] Monitoring already running');
      return;
    }

    logger.info('[QueueScaler] Starting monitoring', {
      intervalMs: this.config.checkIntervalMs,
    });

    // Run first check
    this.evaluateAndScale().catch(error => {
      logger.error('[QueueScaler] Initial evaluation failed', { error });
    });

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.evaluateAndScale().catch(error => {
        logger.error('[QueueScaler] Evaluation failed', { error });
      });
    }, this.config.checkIntervalMs);
  }

  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
      logger.info('[QueueScaler] Monitoring stopped');
    }
  }

  // ============================================================================
  // METRICS COLLECTION
  // ============================================================================

  private async collectMetrics(): Promise<QueueMetrics> {
    const queueDepth = await this.taskQueue.getQueueDepth();
    const queueMetrics = await this.taskQueue.getMetrics();
    
    const now = new Date();
    
    // Calculate elapsed time since startup or last reset (assume 1 minute if no data)
    const elapsedMinutes = Math.max(1, (queueMetrics.tasksEnqueued + queueMetrics.tasksCompleted) / 100);
    
    const metrics: QueueMetrics = {
      depth: queueDepth,
      processingRate: queueMetrics.tasksCompleted / elapsedMinutes,
      enqueueRate: queueMetrics.tasksEnqueued / elapsedMinutes,
      growthRate: 0,
      avgWaitTimeMs: queueMetrics.avgProcessingTimeMs,
      timestamp: now,
    };

    // Calculate growth rate from history
    if (this.metrics.length > 0) {
      const lastMetric = this.metrics[this.metrics.length - 1];
      const timeDiffMinutes = (now.getTime() - lastMetric.timestamp.getTime()) / 60000;
      
      if (timeDiffMinutes > 0) {
        metrics.growthRate = (metrics.depth - lastMetric.depth) / timeDiffMinutes;
      }
    }

    // Store metrics (keep last 60)
    this.metrics.push(metrics);
    if (this.metrics.length > 60) {
      this.metrics = this.metrics.slice(-60);
    }

    this.stats.currentQueueDepth = metrics.depth;
    
    return metrics;
  }

  // ============================================================================
  // SCALING EVALUATION
  // ============================================================================

  private async evaluateAndScale(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const metrics = await this.collectMetrics();
      const decision = this.evaluateScaling(metrics);
      
      this.stats.totalDecisions++;
      const decisionTime = Date.now() - startTime;
      this.stats.avgDecisionTimeMs = 
        (this.stats.avgDecisionTimeMs * (this.stats.totalDecisions - 1) + decisionTime) / 
        this.stats.totalDecisions;
      this.stats.lastDecisionAt = new Date();

      if (decision.direction !== 'maintain') {
        // Check cooldown
        if (this.isInCooldown()) {
          logger.debug('[QueueScaler] In cooldown, skipping scaling action');
          return;
        }

        // Execute scaling
        await this.executeScaling(decision);
      }

      this.emit('evaluation:completed', { metrics, decision });

    } catch (error) {
      logger.error('[QueueScaler] Evaluation error', { error });
      this.emit('evaluation:error', { error });
    }
  }

  evaluateScaling(metrics: QueueMetrics): ScalingDecision {
    const { depth, growthRate, processingRate } = metrics;
    const currentAgents = this.currentAgentCount;
    
    // Check for scale up conditions
    if (depth >= this.config.thresholds.scaleUpAggressiveDepth) {
      const targetAgents = Math.min(
        this.config.maxAgents,
        currentAgents + this.config.scaleUpAggressiveIncrement
      );
      
      return {
        direction: 'up',
        targetAgentCount: targetAgents,
        currentAgentCount: currentAgents,
        delta: targetAgents - currentAgents,
        trigger: 'queue_depth',
        confidence: 0.95,
        reason: `Queue depth ${depth} exceeds aggressive threshold ${this.config.thresholds.scaleUpAggressiveDepth}`,
        timestamp: new Date(),
      };
    }

    if (depth >= this.config.thresholds.scaleUpQueueDepth) {
      // Check if queue is growing faster than processing
      if (growthRate > processingRate * 0.5) {
        const targetAgents = Math.min(
          this.config.maxAgents,
          currentAgents + this.config.scaleUpIncrement
        );
        
        return {
          direction: 'up',
          targetAgentCount: targetAgents,
          currentAgentCount: currentAgents,
          delta: targetAgents - currentAgents,
          trigger: 'growth_rate',
          confidence: 0.85,
          reason: `Queue growing at ${growthRate.toFixed(1)} tasks/min, processing at ${processingRate.toFixed(1)} tasks/min`,
          timestamp: new Date(),
        };
      }
    }

    // Check for predictive scaling
    if (this.config.enablePredictiveScaling) {
      const prediction = this.predictQueueGrowth();
      
      if (prediction.confidence > 0.7 && prediction.recommendation === 'scale_up') {
        const targetAgents = Math.min(
          this.config.maxAgents,
          currentAgents + this.config.scaleUpIncrement
        );
        
        return {
          direction: 'up',
          targetAgentCount: targetAgents,
          currentAgentCount: currentAgents,
          delta: targetAgents - currentAgents,
          trigger: 'processing_rate',
          confidence: prediction.confidence,
          reason: `Predicted queue depth ${prediction.predictedDepth} in ${this.config.predictionWindowMs / 60000} minutes`,
          timestamp: new Date(),
        };
      }
    }

    // Check for scale down conditions
    if (depth <= this.config.thresholds.scaleDownQueueDepth && 
        currentAgents > this.config.minAgents) {
      
      // Ensure we've been at low depth for grace period
      const recentMetrics = this.metrics.slice(-5); // Last 5 checks
      const allLowDepth = recentMetrics.every(m => 
        m.depth <= this.config.thresholds.scaleDownQueueDepth
      );
      
      if (allLowDepth) {
        const targetAgents = Math.max(
          this.config.minAgents,
          currentAgents - this.config.scaleDownIncrement
        );
        
        if (targetAgents < currentAgents) {
          return {
            direction: 'down',
            targetAgentCount: targetAgents,
            currentAgentCount: currentAgents,
            delta: targetAgents - currentAgents,
            trigger: 'queue_depth',
            confidence: 0.75,
            reason: `Queue depth ${depth} below threshold for sustained period`,
            timestamp: new Date(),
          };
        }
      }
    }

    // Maintain current scale
    return {
      direction: 'maintain',
      targetAgentCount: currentAgents,
      currentAgentCount: currentAgents,
      delta: 0,
      trigger: 'queue_depth',
      confidence: 1.0,
      reason: 'No scaling needed',
      timestamp: new Date(),
    };
  }

  private isInCooldown(): boolean {
    if (!this.lastScalingAction?.completedAt) return false;
    
    const elapsed = Date.now() - this.lastScalingAction.completedAt.getTime();
    return elapsed < this.config.cooldownMs;
  }

  // ============================================================================
  // PREDICTIVE SCALING
  // ============================================================================

  predictQueueGrowth(): QueuePrediction {
    if (this.metrics.length < 3) {
      return {
        predictedDepth: this.stats.currentQueueDepth,
        predictedTime: new Date(Date.now() + this.config.predictionWindowMs),
        confidence: 0,
        recommendation: 'maintain',
        recommendedAgents: this.currentAgentCount,
      };
    }

    // Simple linear regression on recent metrics
    const recent = this.metrics.slice(-10);
    const n = recent.length;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    recent.forEach((m, i) => {
      sumX += i;
      sumY += m.depth;
      sumXY += i * m.depth;
      sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Predict depth in prediction window
    const checksInWindow = this.config.predictionWindowMs / this.config.checkIntervalMs;
    const predictedDepth = Math.max(0, intercept + slope * (n + checksInWindow));
    
    // Calculate confidence based on variance
    const variance = recent.reduce((sum, m, i) => {
      const predicted = intercept + slope * i;
      return sum + Math.pow(m.depth - predicted, 2);
    }, 0) / n;
    
    const confidence = Math.max(0, 1 - Math.sqrt(variance) / Math.max(1, intercept));
    
    // Determine recommendation
    let recommendation: 'scale_up' | 'scale_down' | 'maintain' = 'maintain';
    let recommendedAgents = this.currentAgentCount;
    
    if (predictedDepth > this.config.thresholds.scaleUpQueueDepth) {
      recommendation = 'scale_up';
      recommendedAgents = Math.min(
        this.config.maxAgents,
        this.currentAgentCount + this.config.scaleUpIncrement
      );
    } else if (predictedDepth < this.config.thresholds.scaleDownQueueDepth && 
               this.currentAgentCount > this.config.minAgents) {
      recommendation = 'scale_down';
      recommendedAgents = Math.max(
        this.config.minAgents,
        this.currentAgentCount - this.config.scaleDownIncrement
      );
    }

    return {
      predictedDepth: Math.round(predictedDepth),
      predictedTime: new Date(Date.now() + this.config.predictionWindowMs),
      confidence: Math.min(1, confidence),
      recommendation,
      recommendedAgents,
    };
  }

  // ============================================================================
  // SCALING EXECUTION
  // ============================================================================

  private async executeScaling(decision: ScalingDecision): Promise<void> {
    const action: ScalingAction = {
      actionId: `scale-${Date.now()}`,
      decision,
      status: 'pending',
    };

    this.lastScalingAction = action;

    logger.info('[QueueScaler] Executing scaling action', {
      actionId: action.actionId,
      direction: decision.direction,
      delta: decision.delta,
      target: decision.targetAgentCount,
      trigger: decision.trigger,
    });

    this.emit('scaling:started', { action });

    try {
      action.status = 'executing';
      action.startedAt = new Date();

      if (this.config.multiClusterScaling && this.clusterRegistry) {
        await this.executeMultiClusterScaling(decision);
      } else {
        await this.executeSingleClusterScaling(decision);
      }

      // Update current count
      this.currentAgentCount = decision.targetAgentCount;
      this.stats.currentAgentCount = decision.targetAgentCount;
      
      if (decision.direction === 'up') {
        this.stats.scaleUpActions++;
      } else {
        this.stats.scaleDownActions++;
      }

      action.status = 'completed';
      action.completedAt = new Date();

      logger.info('[QueueScaler] Scaling completed', {
        actionId: action.actionId,
        durationMs: action.completedAt.getTime() - action.startedAt.getTime(),
      });

      this.emit('scaling:completed', { action });

    } catch (error) {
      action.status = 'failed';
      action.error = error instanceof Error ? error.message : 'Unknown error';
      action.completedAt = new Date();

      logger.error('[QueueScaler] Scaling failed', {
        actionId: action.actionId,
        error: action.error,
      });

      this.emit('scaling:failed', { action, error });
    }
  }

  private async executeSingleClusterScaling(decision: ScalingDecision): Promise<void> {
    // Emit event for external scaling implementation
    this.emit('scaling:scale_agents', {
      targetCount: decision.targetAgentCount,
      currentCount: decision.currentAgentCount,
      delta: decision.delta,
    });
  }

  private async executeMultiClusterScaling(decision: ScalingDecision): Promise<void> {
    if (!this.clusterRegistry) {
      throw new Error('Cluster registry not available');
    }

    const plan = this.generateMultiClusterPlan(decision);

    logger.info('[QueueScaler] Multi-cluster scaling plan', {
      globalTarget: plan.globalTargetAgents,
      allocations: plan.clusterAllocations,
    });

    // Execute allocations in parallel
    await Promise.all(
      plan.clusterAllocations.map(async allocation => {
        this.emit('scaling:scale_cluster', {
          clusterId: allocation.clusterId,
          targetAgents: allocation.targetAgents,
          delta: allocation.delta,
          reason: allocation.reason,
        });
      })
    );
  }

  private generateMultiClusterPlan(decision: ScalingDecision): MultiClusterScalingPlan {
    if (!this.clusterRegistry) {
      return {
        globalTargetAgents: decision.targetAgentCount,
        clusterAllocations: [],
      };
    }

    const clusters = this.clusterRegistry.getHealthyClusters();
    
    if (clusters.length === 0) {
      return {
        globalTargetAgents: decision.targetAgentCount,
        clusterAllocations: [],
      };
    }

    const totalCurrentAgents = clusters.reduce((sum, c) => sum + c.currentAgents, 0);
    const delta = decision.targetAgentCount - totalCurrentAgents;

    if (delta === 0) {
      return {
        globalTargetAgents: decision.targetAgentCount,
        clusterAllocations: [],
      };
    }

    const allocations: MultiClusterScalingPlan['clusterAllocations'] = [];

    if (delta > 0) {
      // Scale up - distribute to clusters with most available capacity
      const sortedClusters = [...clusters].sort(
        (a, b) => b.availableSlots - a.availableSlots
      );

      let remainingDelta = delta;
      
      for (const cluster of sortedClusters) {
        if (remainingDelta <= 0) break;
        
        const addCount = Math.min(remainingDelta, cluster.availableSlots);
        if (addCount > 0) {
          allocations.push({
            clusterId: cluster.id,
            currentAgents: cluster.currentAgents,
            targetAgents: cluster.currentAgents + addCount,
            delta: addCount,
            reason: `Scale up - ${addCount} agents added`,
          });
          remainingDelta -= addCount;
        }
      }
    } else {
      // Scale down - remove from most utilized clusters first
      const sortedClusters = [...clusters].sort(
        (a, b) => b.load.utilizationPercent - a.load.utilizationPercent
      );

      let remainingDelta = Math.abs(delta);
      
      for (const cluster of sortedClusters) {
        if (remainingDelta <= 0) break;
        
        // Don't scale below min agents per cluster (assume 1)
        const removableAgents = Math.max(0, cluster.currentAgents - 1);
        const removeCount = Math.min(remainingDelta, removableAgents);
        
        if (removeCount > 0) {
          allocations.push({
            clusterId: cluster.id,
            currentAgents: cluster.currentAgents,
            targetAgents: cluster.currentAgents - removeCount,
            delta: -removeCount,
            reason: `Scale down - ${removeCount} agents removed`,
          });
          remainingDelta -= removeCount;
        }
      }
    }

    return {
      globalTargetAgents: decision.targetAgentCount,
      clusterAllocations: allocations,
    };
  }

  // ============================================================================
  // MANUAL SCALING
  // ============================================================================

  async scaleTo(targetCount: number): Promise<ScalingAction> {
    this.ensureInitialized();
    
    const clampedTarget = Math.max(
      this.config.minAgents,
      Math.min(this.config.maxAgents, targetCount)
    );

    const decision: ScalingDecision = {
      direction: clampedTarget > this.currentAgentCount ? 'up' : 
                 clampedTarget < this.currentAgentCount ? 'down' : 'maintain',
      targetAgentCount: clampedTarget,
      currentAgentCount: this.currentAgentCount,
      delta: clampedTarget - this.currentAgentCount,
      trigger: 'manual',
      confidence: 1.0,
      reason: `Manual scaling request to ${clampedTarget} agents`,
      timestamp: new Date(),
    };

    await this.executeScaling(decision);

    return this.lastScalingAction!;
  }

  async scaleUp(increment?: number): Promise<ScalingAction> {
    const target = this.currentAgentCount + (increment || this.config.scaleUpIncrement);
    return this.scaleTo(target);
  }

  async scaleDown(decrement?: number): Promise<ScalingAction> {
    const target = this.currentAgentCount - (decrement || this.config.scaleDownIncrement);
    return this.scaleTo(target);
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  getStats(): QueueScalerStats {
    return { ...this.stats };
  }

  getMetrics(): QueueMetrics[] {
    return [...this.metrics];
  }

  getCurrentConfig(): QueueScalingConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<QueueScalingConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[QueueScaler] Configuration updated', { config: this.config });
  }

  getLastScalingAction(): ScalingAction | undefined {
    return this.lastScalingAction;
  }
}

export default QueueScaler;
