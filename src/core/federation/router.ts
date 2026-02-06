/**
 * Federation Router - Intelligent Traffic Routing for OpenClaw Federation
 * 
 * Implements multiple routing strategies for distributing agent sessions
 * across a federation of OpenClaw instances. Supports session affinity,
 * capability matching, and backpressure management.
 * 
 * Routing Strategies:
 * - least-loaded: Route to instance with lowest utilization
 * - round-robin: Cycle through instances sequentially  
 * - session-affinity: Prefer same instance for same session
 * - capability-match: Match required capabilities
 * - weighted: Use routing weights for distribution
 * 
 * @module federation/router
 */

import { logger } from '../../utils/logger';
import { NoAvailableInstanceError, FederationCapacityError } from './types';
import type { FederationRegistry } from './registry';
import type {
  OpenClawInstance,
  RoutingContext,
  InstanceSelection,
  RoutingStrategyType,
  BackpressureStatus,
  FederationCapacityReport,
} from './types';

// ============================================================================
// FEDERATION ROUTER
// ============================================================================

/**
 * FederationRouter handles intelligent routing of agent sessions to OpenClaw instances.
 * 
 * Features:
 * - Multiple routing strategies (least-loaded, round-robin, session-affinity, etc.)
 * - Session affinity tracking for sticky sessions
 * - Capability-based routing for specialized instances
 * - Backpressure detection and management
 * - Region-aware routing for latency optimization
 * 
 * @example
 * ```typescript
 * const router = new FederationRouter(registry, 'least-loaded');
 * const selection = router.selectInstance({
 *   requiredCapabilities: ['gpu'],
 *   preferredRegion: 'us-east-1'
 * });
 * ```
 */
export class FederationRouter {
  /** Reference to the federation registry */
  private registry: FederationRegistry;
  
  /** Current routing strategy */
  private strategy: RoutingStrategyType;
  
  /** Index for round-robin selection */
  private roundRobinIndex = 0;
  
  /** Session affinity map: sessionId -> instanceId */
  private affinityMap: Map<string, string> = new Map();
  
  /** Reverse affinity map for cleanup: instanceId -> Set<sessionId> */
  private reverseAffinityMap: Map<string, Set<string>> = new Map();
  
  /** Timestamp of last affinity cleanup */
  private lastAffinityCleanup = Date.now();
  
  /** Affinity TTL in milliseconds (default: 1 hour) */
  private affinityTtlMs = 60 * 60 * 1000;

  /**
   * Create a new FederationRouter
   * 
   * @param registry - Federation registry with instance data
   * @param strategy - Routing strategy to use (default: 'least-loaded')
   */
  constructor(registry: FederationRegistry, strategy: RoutingStrategyType = 'least-loaded') {
    this.registry = registry;
    this.strategy = strategy;
  }

  /**
   * Change the routing strategy
   * 
   * @param strategy - New routing strategy
   */
  setStrategy(strategy: RoutingStrategyType): void {
    logger.info('federation-router', `Routing strategy changed from ${this.strategy} to ${strategy}`);
    this.strategy = strategy;
  }

  /**
   * Get the current routing strategy
   * 
   * @returns Current strategy
   */
  getStrategy(): RoutingStrategyType {
    return this.strategy;
  }

  /**
   * Select an instance for routing based on the current strategy and context
   * 
   * @param context - Routing context with constraints and preferences
   * @returns InstanceSelection with selected instance and alternatives
   * @throws NoAvailableInstanceError if no suitable instance found
   * @throws FederationCapacityError if federation is at capacity
   * 
   * @example
   * ```typescript
   * const selection = router.selectInstance({
   *   tenantId: 'tenant-123',
   *   requiredCapabilities: ['gpu', 'vision'],
   *   preferredRegion: 'us-east-1',
   *   excludeInstances: ['unhealthy-instance-id']
   * });
   * 
   * console.log(`Routed to ${selection.instance.endpoint} because: ${selection.reason}`);
   * ```
   */
  selectInstance(context: RoutingContext): InstanceSelection {
    const startTime = Date.now();
    
    // Check backpressure first
    const backpressure = this.getBackpressureStatus();
    if (backpressure.shouldReject) {
      throw new FederationCapacityError(
        backpressure.currentUtilization / 100,
        backpressure.threshold / 100
      );
    }

    // Determine which strategy to use
    const strategy = context.strategy || this.strategy;
    
    // Get candidate instances
    let candidates = this.getCandidateInstances(context);
    
    if (candidates.length === 0) {
      throw new NoAvailableInstanceError(context);
    }

    // Apply strategy
    let selected: OpenClawInstance | null = null;
    let reason = '';

    switch (strategy) {
      case 'least-loaded':
        selected = this.selectLeastLoaded(context, candidates);
        reason = 'lowest load utilization';
        break;
        
      case 'round-robin':
        selected = this.selectRoundRobin(context, candidates);
        reason = 'round-robin distribution';
        break;
        
      case 'session-affinity':
        selected = this.selectSessionAffinity(context, candidates);
        reason = context.sessionAffinity 
          ? `session affinity for ${context.sessionAffinity}` 
          : 'no existing affinity, using least-loaded';
        break;
        
      case 'capability-match':
        selected = this.selectCapabilityMatch(context, candidates);
        reason = `best capability match for [${context.requiredCapabilities?.join(', ') || 'none'}]`;
        break;
        
      case 'weighted':
        selected = this.selectWeighted(context, candidates);
        reason = 'weighted distribution';
        break;
        
      default:
        selected = this.selectLeastLoaded(context, candidates);
        reason = 'lowest load utilization (fallback)';
    }

    if (!selected) {
      throw new NoAvailableInstanceError(context);
    }

    // Record affinity if session ID provided
    if (context.sessionAffinity) {
      this.recordAffinity(context.sessionAffinity, selected.id);
    }

    // Build alternatives list (excluding selected instance)
    const alternatives = candidates
      .filter(i => i.id !== selected!.id)
      .slice(0, 3); // Limit to top 3 alternatives

    const decisionLatencyMs = Date.now() - startTime;

    logger.debug('federation-router', `Selected instance ${selected.id} using ${strategy} strategy (${decisionLatencyMs}ms)`);

    return {
      instance: selected,
      reason,
      alternatives,
      strategy,
      decisionLatencyMs,
    };
  }

  /**
   * Get candidate instances that match the routing context constraints
   * 
   * @param context - Routing context
   * @returns Filtered and sorted candidate instances
   */
  private getCandidateInstances(context: RoutingContext): OpenClawInstance[] {
    let candidates = this.registry.getHealthyInstances();

    // Filter by required capabilities
    if (context.requiredCapabilities && context.requiredCapabilities.length > 0) {
      candidates = candidates.filter(instance =>
        context.requiredCapabilities!.every(cap => instance.capabilities.includes(cap))
      );
    }

    // Filter by preferred region (if no results, we'll fall back to all regions)
    if (context.preferredRegion) {
      const regionMatches = candidates.filter(i => i.region === context.preferredRegion);
      if (regionMatches.length > 0) {
        candidates = regionMatches;
      }
    }

    // Exclude specific instances
    if (context.excludeInstances && context.excludeInstances.length > 0) {
      const excludeSet = new Set(context.excludeInstances);
      candidates = candidates.filter(i => !excludeSet.has(i.id));
    }

    // Filter by minimum capacity
    if (context.minCapacity) {
      candidates = candidates.filter(
        i => (i.maxSessions - i.currentSessions) >= context.minCapacity!
      );
    }

    return candidates;
  }

  // ============================================================================
  // ROUTING STRATEGIES
  // ============================================================================

  /**
   * Select instance with lowest utilization ratio
   * 
   * @param _context - Routing context (unused but kept for interface consistency)
   * @param candidates - Candidate instances
   * @returns Instance with lowest load
   */
  private selectLeastLoaded(
    _context: RoutingContext, 
    candidates: OpenClawInstance[]
  ): OpenClawInstance | null {
    if (candidates.length === 0) return null;

    // Sort by utilization ratio (current/max), preferring lower utilization
    const sorted = [...candidates].sort((a, b) => {
      const ratioA = a.maxSessions > 0 ? a.currentSessions / a.maxSessions : 1;
      const ratioB = b.maxSessions > 0 ? b.currentSessions / b.maxSessions : 1;
      return ratioA - ratioB;
    });

    return sorted[0];
  }

  /**
   * Select instance using round-robin rotation
   * 
   * @param _context - Routing context
   * @param candidates - Candidate instances
   * @returns Next instance in rotation
   */
  private selectRoundRobin(
    _context: RoutingContext,
    candidates: OpenClawInstance[]
  ): OpenClawInstance | null {
    if (candidates.length === 0) return null;

    // Get the next index
    const index = this.roundRobinIndex % candidates.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % candidates.length;

    return candidates[index];
  }

  /**
   * Select instance based on session affinity
   * If session has existing affinity, prefer that instance if healthy
   * Otherwise falls back to least-loaded
   * 
   * @param context - Routing context with sessionAffinity
   * @param candidates - Candidate instances
   * @returns Instance with affinity or least-loaded
   */
  private selectSessionAffinity(
    context: RoutingContext,
    candidates: OpenClawInstance[]
  ): OpenClawInstance | null {
    if (!context.sessionAffinity) {
      // No session ID, fall back to least-loaded
      return this.selectLeastLoaded(context, candidates);
    }

    // Check for existing affinity
    const preferredInstanceId = this.affinityMap.get(context.sessionAffinity);
    
    if (preferredInstanceId) {
      const preferredInstance = candidates.find(i => i.id === preferredInstanceId);
      if (preferredInstance) {
        return preferredInstance;
      }
      // Instance no longer available, clear affinity
      this.clearAffinity(context.sessionAffinity);
    }

    // No valid affinity, use least-loaded and record new affinity
    return this.selectLeastLoaded(context, candidates);
  }

  /**
   * Select instance based on capability matching score
   * Prefers instances with exact capability match
   * 
   * @param context - Routing context with requiredCapabilities
   * @param candidates - Candidate instances
   * @returns Best matching instance
   */
  private selectCapabilityMatch(
    context: RoutingContext,
    candidates: OpenClawInstance[]
  ): OpenClawInstance | null {
    if (candidates.length === 0) return null;
    if (!context.requiredCapabilities || context.requiredCapabilities.length === 0) {
      return this.selectLeastLoaded(context, candidates);
    }

    const required = new Set(context.requiredCapabilities);

    // Score candidates by capability match and load
    const scored = candidates.map(instance => {
      const matchedCapabilities = instance.capabilities.filter(c => required.has(c));
      const matchRatio = matchedCapabilities.length / required.size;
      const loadRatio = instance.maxSessions > 0 
        ? instance.currentSessions / instance.maxSessions 
        : 1;
      
      // Score: prioritize full matches, then lower load
      const score = (matchRatio * 1000) - loadRatio;
      
      return { instance, score, matchRatio };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored[0].instance;
  }

  /**
   * Select instance using weighted distribution
   * Higher routingWeight = more likely to be selected
   * 
   * @param _context - Routing context
   * @param candidates - Candidate instances
   * @returns Instance selected by weight
   */
  private selectWeighted(
    _context: RoutingContext,
    candidates: OpenClawInstance[]
  ): OpenClawInstance | null {
    if (candidates.length === 0) return null;

    // Calculate total weight
    const totalWeight = candidates.reduce((sum, i) => sum + (i.routingWeight || 1), 0);
    
    // Generate random value
    let random = Math.random() * totalWeight;
    
    // Select instance based on weight
    for (const instance of candidates) {
      random -= (instance.routingWeight || 1);
      if (random <= 0) {
        return instance;
      }
    }

    // Fallback to last candidate
    return candidates[candidates.length - 1];
  }

  // ============================================================================
  // AFFINITY MANAGEMENT
  // ============================================================================

  /**
   * Record a session-to-instance affinity
   * 
   * @param sessionId - Session identifier
   * @param instanceId - Instance identifier
   */
  recordAffinity(sessionId: string, instanceId: string): void {
    // Clean up old affinity if exists
    const oldInstanceId = this.affinityMap.get(sessionId);
    if (oldInstanceId && oldInstanceId !== instanceId) {
      const sessions = this.reverseAffinityMap.get(oldInstanceId);
      if (sessions) {
        sessions.delete(sessionId);
      }
    }

    // Record new affinity
    this.affinityMap.set(sessionId, instanceId);
    
    // Update reverse map
    if (!this.reverseAffinityMap.has(instanceId)) {
      this.reverseAffinityMap.set(instanceId, new Set());
    }
    this.reverseAffinityMap.get(instanceId)!.add(sessionId);

    logger.debug('federation-router', `Recorded affinity: ${sessionId} -> ${instanceId}`);
  }

  /**
   * Clear a session's affinity
   * 
   * @param sessionId - Session identifier
   */
  clearAffinity(sessionId: string): void {
    const instanceId = this.affinityMap.get(sessionId);
    if (instanceId) {
      this.affinityMap.delete(sessionId);
      
      const sessions = this.reverseAffinityMap.get(instanceId);
      if (sessions) {
        sessions.delete(sessionId);
      }
      
      logger.debug('federation-router', `Cleared affinity for session ${sessionId}`);
    }
  }

  /**
   * Get the instance ID for a session affinity
   * 
   * @param sessionId - Session identifier
   * @returns Instance ID or undefined
   */
  getAffinity(sessionId: string): string | undefined {
    return this.affinityMap.get(sessionId);
  }

  /**
   * Clear all affinities for an instance (e.g., when instance goes unhealthy)
   * 
   * @param instanceId - Instance identifier
   */
  clearInstanceAffinities(instanceId: string): void {
    const sessions = this.reverseAffinityMap.get(instanceId);
    if (sessions) {
      Array.from(sessions).forEach(sessionId => {
        this.affinityMap.delete(sessionId);
      });
      this.reverseAffinityMap.delete(instanceId);
      
      logger.info('federation-router', `Cleared ${sessions.size} affinities for instance ${instanceId}`);
    }
  }

  /**
   * Clean up expired affinities
   * Should be called periodically
   */
  cleanupExpiredAffinities(): void {
    const now = Date.now();
    if (now - this.lastAffinityCleanup < this.affinityTtlMs) {
      return; // Don't clean up too frequently
    }

    // For a complete implementation, we'd track affinity creation time
    // For now, we just update the cleanup timestamp
    this.lastAffinityCleanup = now;
    
    logger.debug('federation-router', `Affinity map size: ${this.affinityMap.size}`);
  }

  /**
   * Get affinity statistics
   * 
   * @returns Affinity statistics
   */
  getAffinityStats(): { totalAffinities: number; instancesWithAffinities: number } {
    return {
      totalAffinities: this.affinityMap.size,
      instancesWithAffinities: this.reverseAffinityMap.size,
    };
  }

  // ============================================================================
  // BACKPRESSURE
  // ============================================================================

  /**
   * Check if the federation is at capacity
   * 
   * @returns True if at or over capacity threshold
   */
  isAtCapacity(): boolean {
    const status = this.getBackpressureStatus();
    return status.shouldReject;
  }

  /**
   * Get detailed backpressure status
   * 
   * @returns BackpressureStatus with recommendations
   */
  getBackpressureStatus(): BackpressureStatus {
    const report = this.registry.getCapacityReport();
    const utilization = report.utilizationPercent / 100;
    const threshold = this.getBackpressureThreshold();
    const warningThreshold = this.getWarningThreshold();

    // Determine status
    if (utilization >= threshold) {
      return {
        shouldReject: true,
        currentUtilization: report.utilizationPercent,
        threshold: threshold * 100,
        message: `Federation at critical capacity: ${report.utilizationPercent.toFixed(1)}% utilized`,
        recommendedAction: 'scale',
      };
    }

    if (utilization >= warningThreshold) {
      return {
        shouldReject: false,
        currentUtilization: report.utilizationPercent,
        threshold: warningThreshold * 100,
        message: `Federation approaching capacity: ${report.utilizationPercent.toFixed(1)}% utilized`,
        recommendedAction: 'queue',
        estimatedWaitSeconds: this.estimateWaitTime(report),
      };
    }

    return {
      shouldReject: false,
      currentUtilization: report.utilizationPercent,
      threshold: threshold * 100,
      message: `Federation healthy: ${report.utilizationPercent.toFixed(1)}% utilized`,
      recommendedAction: 'ok',
    };
  }

  /**
   * Get the backpressure threshold from config or default
   * 
   * @returns Threshold as 0-1 decimal
   */
  private getBackpressureThreshold(): number {
    // This would ideally come from registry config
    // Default: 95%
    return 0.95;
  }

  /**
   * Get the warning threshold from config or default
   * 
   * @returns Threshold as 0-1 decimal
   */
  private getWarningThreshold(): number {
    // Default: 90%
    return 0.90;
  }

  /**
   * Estimate wait time for queued sessions
   * 
   * @param report - Capacity report
   * @returns Estimated wait time in seconds
   */
  private estimateWaitTime(report: FederationCapacityReport): number {
    // Simple estimation based on utilization
    // In a real implementation, this would use historical data
    const utilization = report.utilizationPercent / 100;
    
    if (utilization < 0.9) return 0;
    if (utilization < 0.95) return 30;
    return 60;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get router statistics
   * 
   * @returns Router statistics
   */
  getStats(): {
    strategy: RoutingStrategyType;
    roundRobinIndex: number;
    affinityCount: number;
    backpressure: BackpressureStatus;
  } {
    return {
      strategy: this.strategy,
      roundRobinIndex: this.roundRobinIndex,
      affinityCount: this.affinityMap.size,
      backpressure: this.getBackpressureStatus(),
    };
  }

  /**
   * Get routing distribution statistics
   * Shows how sessions would be distributed across instances
   * 
   * @returns Distribution map of instance ID to estimated load percentage
   */
  getRoutingDistribution(): Record<string, number> {
    const candidates = this.registry.getHealthyInstances();
    const totalWeight = candidates.reduce((sum, i) => sum + (i.routingWeight || 1), 0);
    
    const distribution: Record<string, number> = {};
    
    for (const instance of candidates) {
      const weight = instance.routingWeight || 1;
      distribution[instance.id] = (weight / totalWeight) * 100;
    }
    
    return distribution;
  }
}

// Re-export types
export type {
  RoutingContext,
  InstanceSelection,
  RoutingStrategyType,
  BackpressureStatus,
  NoAvailableInstanceError,
  FederationCapacityError,
};

// Export default
export default FederationRouter;
