/**
 * Multi-Cluster Load Balancer - Intelligent Traffic Distribution
 * 
 * Distributes agents and tasks across clusters using:
 * - Least-loaded routing
 * - Round-robin distribution
 * - Session affinity
 * - Regional affinity
 * - Capability-based routing
 * - Weighted distribution
 * 
 * @module federation/load-balancer
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import type { ClusterInfo, ClusterRegistry } from './cluster-registry';

// ============================================================================
// TYPES
// ============================================================================

export type RoutingStrategy = 
  | 'least-loaded'
  | 'round-robin'
  | 'session-affinity'
  | 'capability-match'
  | 'weighted'
  | 'regional';

export interface RoutingRequest {
  taskType?: string;
  sessionId?: string;
  preferredRegion?: string;
  requiredCapabilities?: string[];
  minCapacity?: number;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface RoutingResult {
  success: boolean;
  cluster?: ClusterInfo;
  strategy: RoutingStrategy;
  reason: string;
  alternatives: ClusterInfo[];
  latencyMs: number;
  error?: string;
}

export interface LoadBalancerConfig {
  defaultStrategy: RoutingStrategy;
  healthCheckWeight: number;
  utilizationWeight: number;
  latencyWeight: number;
  regionAffinityWeight: number;
  sessionAffinityTTLMs: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
  maxAlternatives: number;
  stickySessionsEnabled: boolean;
}

export interface CircuitBreakerState {
  clusterId: string;
  failures: number;
  lastFailureAt?: Date;
  isOpen: boolean;
  openedAt?: Date;
}

export interface LoadDistribution {
  clusterId: string;
  currentAgents: number;
  targetAgents: number;
  delta: number;
  reason: string;
}

export interface RebalancePlan {
  timestamp: Date;
  moves: LoadDistribution[];
  totalMoves: number;
  estimatedImpact: {
    maxUtilizationBefore: number;
    maxUtilizationAfter: number;
    avgUtilizationBefore: number;
    avgUtilizationAfter: number;
  };
}

export interface LoadBalancerStats {
  totalRequests: number;
  successfulRoutes: number;
  failedRoutes: number;
  circuitBreakerTrips: number;
  avgRoutingLatencyMs: number;
  strategyDistribution: Record<RoutingStrategy, number>;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_LB_CONFIG: LoadBalancerConfig = {
  defaultStrategy: 'least-loaded',
  healthCheckWeight: 0.4,
  utilizationWeight: 0.3,
  latencyWeight: 0.2,
  regionAffinityWeight: 0.1,
  sessionAffinityTTLMs: 3600000, // 1 hour
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 30000,  // 30 seconds
  maxAlternatives: 3,
  stickySessionsEnabled: true,
};

// ============================================================================
// MULTI-CLUSTER LOAD BALANCER
// ============================================================================

export class MultiClusterLoadBalancer extends EventEmitter {
  private registry: ClusterRegistry;
  private config: LoadBalancerConfig;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private sessionAffinity: Map<string, { clusterId: string; timestamp: Date }> = new Map();
  private roundRobinIndex = 0;
  private stats: LoadBalancerStats;
  private initialized = false;

  constructor(registry: ClusterRegistry, config: Partial<LoadBalancerConfig> = {}) {
    super();
    this.registry = registry;
    this.config = { ...DEFAULT_LB_CONFIG, ...config };
    this.stats = {
      totalRequests: 0,
      successfulRoutes: 0,
      failedRoutes: 0,
      circuitBreakerTrips: 0,
      avgRoutingLatencyMs: 0,
      strategyDistribution: {
        'least-loaded': 0,
        'round-robin': 0,
        'session-affinity': 0,
        'capability-match': 0,
        'weighted': 0,
        'regional': 0,
      },
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    this.initialized = true;
    
    // Listen to registry events
    this.registry.on('cluster:health_changed', ({ clusterId, newStatus }) => {
      if (newStatus === 'healthy') {
        this.resetCircuitBreaker(clusterId);
      }
    });

    logger.info('[LoadBalancer] Initialized', { config: this.config });
    this.emit('initialized');
  }

  async dispose(): Promise<void> {
    this.sessionAffinity.clear();
    this.circuitBreakers.clear();
    this.initialized = false;
    this.removeAllListeners();
    logger.info('[LoadBalancer] Disposed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('LoadBalancer not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // ROUTING
  // ============================================================================

  async route(request: RoutingRequest, strategy?: RoutingStrategy): Promise<RoutingResult> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    this.stats.totalRequests++;

    const useStrategy = strategy || this.config.defaultStrategy;
    
    try {
      // Clean up old session affinity entries
      this.cleanupSessionAffinity();

      // Check for existing session affinity
      let selectedCluster: ClusterInfo | null = null;
      let actualStrategy = useStrategy;

      if (this.config.stickySessionsEnabled && request.sessionId) {
        const affinity = this.sessionAffinity.get(request.sessionId);
        if (affinity) {
          const cluster = this.registry.getCluster(affinity.clusterId);
          if (cluster && cluster.health.status === 'healthy' && cluster.isAcceptingTraffic) {
            selectedCluster = cluster;
            actualStrategy = 'session-affinity';
          }
        }
      }

      // Route if no session affinity found
      if (!selectedCluster) {
        selectedCluster = this.selectCluster(request, useStrategy);
      }

      if (!selectedCluster) {
        this.stats.failedRoutes++;
        return {
          success: false,
          strategy: actualStrategy,
          reason: 'No healthy clusters available',
          alternatives: [],
          latencyMs: Date.now() - startTime,
          error: 'All clusters are unhealthy or at capacity',
        };
      }

      // Check circuit breaker
      if (this.config.enableCircuitBreaker && this.isCircuitBreakerOpen(selectedCluster.id)) {
        // Try alternatives
        const alternatives = this.getAlternativeClusters(request, selectedCluster.id);
        if (alternatives.length > 0) {
          selectedCluster = alternatives[0];
          actualStrategy = 'weighted'; // Fallback strategy
        } else {
          this.stats.failedRoutes++;
          return {
            success: false,
            strategy: actualStrategy,
            reason: 'Circuit breaker open for all clusters',
            alternatives: [],
            latencyMs: Date.now() - startTime,
            error: `Circuit breaker open for cluster ${selectedCluster.id}`,
          };
        }
      }

      // Update session affinity
      if (this.config.stickySessionsEnabled && request.sessionId) {
        this.sessionAffinity.set(request.sessionId, {
          clusterId: selectedCluster.id,
          timestamp: new Date(),
        });
      }

      this.stats.successfulRoutes++;
      this.stats.strategyDistribution[actualStrategy]++;

      const latencyMs = Date.now() - startTime;
      this.updateAvgLatency(latencyMs);

      const alternatives = this.getAlternativeClusters(request, selectedCluster.id);

      return {
        success: true,
        cluster: selectedCluster,
        strategy: actualStrategy,
        reason: `Selected by ${actualStrategy} strategy`,
        alternatives,
        latencyMs,
      };

    } catch (error) {
      this.stats.failedRoutes++;
      return {
        success: false,
        strategy: useStrategy,
        reason: 'Routing error',
        alternatives: [],
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private selectCluster(request: RoutingRequest, strategy: RoutingStrategy): ClusterInfo | null {
    const healthyClusters = this.registry.getHealthyClusters();
    
    if (healthyClusters.length === 0) {
      return null;
    }

    // Filter by capabilities if specified
    let candidates = healthyClusters;
    if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
      candidates = healthyClusters.filter(cluster => 
        request.requiredCapabilities!.every(cap => 
          cluster.capabilities[cap as keyof typeof cluster.capabilities]
        )
      );
      
      if (candidates.length === 0) {
        return null;
      }
    }

    // Filter by minimum capacity if specified
    if (request.minCapacity && request.minCapacity > 0) {
      candidates = candidates.filter(c => c.availableSlots >= request.minCapacity!);
      
      if (candidates.length === 0) {
        return null;
      }
    }

    switch (strategy) {
      case 'least-loaded':
        return this.selectLeastLoaded(candidates);
      
      case 'round-robin':
        return this.selectRoundRobin(candidates);
      
      case 'weighted':
        return this.selectWeighted(candidates);
      
      case 'regional':
        return this.selectRegional(candidates, request.preferredRegion);
      
      case 'capability-match':
        return this.selectByCapabilityScore(candidates, request.requiredCapabilities);
      
      default:
        return this.selectLeastLoaded(candidates);
    }
  }

  private selectLeastLoaded(clusters: ClusterInfo[]): ClusterInfo | null {
    if (clusters.length === 0) return null;
    
    // Calculate score for each cluster
    let bestCluster = clusters[0];
    let bestScore = this.calculateClusterScore(bestCluster);
    
    for (let i = 1; i < clusters.length; i++) {
      const score = this.calculateClusterScore(clusters[i]);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = clusters[i];
      }
    }
    
    return bestCluster;
  }

  private calculateClusterScore(cluster: ClusterInfo): number {
    // Higher score = better choice
    const utilizationScore = (100 - cluster.load.utilizationPercent) / 100 * this.config.utilizationWeight;
    const healthScore = cluster.health.status === 'healthy' ? 1 : 0.5;
    const healthWeight = this.config.healthCheckWeight;
    const latencyScore = Math.max(0, 1 - cluster.health.latencyMs / 1000) * this.config.latencyWeight;
    const weightScore = (cluster.routingWeight / 10) * 0.1; // Normalize weight
    
    return (utilizationScore * healthWeight) + 
           (healthScore * healthWeight) + 
           latencyScore + 
           weightScore;
  }

  private selectRoundRobin(clusters: ClusterInfo[]): ClusterInfo | null {
    if (clusters.length === 0) return null;
    
    this.roundRobinIndex = (this.roundRobinIndex + 1) % clusters.length;
    return clusters[this.roundRobinIndex];
  }

  private selectWeighted(clusters: ClusterInfo[]): ClusterInfo | null {
    if (clusters.length === 0) return null;
    
    const totalWeight = clusters.reduce((sum, c) => sum + c.routingWeight, 0);
    let random = Math.random() * totalWeight;
    
    for (const cluster of clusters) {
      random -= cluster.routingWeight;
      if (random <= 0) {
        return cluster;
      }
    }
    
    return clusters[clusters.length - 1];
  }

  private selectRegional(clusters: ClusterInfo[], preferredRegion?: string): ClusterInfo | null {
    if (!preferredRegion) {
      return this.selectLeastLoaded(clusters);
    }
    
    // Prefer clusters in the same region
    const regionalClusters = clusters.filter(c => c.region === preferredRegion);
    
    if (regionalClusters.length > 0) {
      return this.selectLeastLoaded(regionalClusters);
    }
    
    // Fall back to all clusters
    return this.selectLeastLoaded(clusters);
  }

  private selectByCapabilityScore(
    clusters: ClusterInfo[], 
    requiredCapabilities?: string[]
  ): ClusterInfo | null {
    if (clusters.length === 0) return null;
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return this.selectLeastLoaded(clusters);
    }
    
    // Score clusters by capability match
    const scored = clusters.map(cluster => {
      let score = 0;
      for (const cap of requiredCapabilities) {
        if (cluster.capabilities[cap as keyof typeof cluster.capabilities]) {
          score++;
        }
      }
      return { cluster, score };
    });
    
    // Sort by score (descending) and utilization (ascending)
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.cluster.load.utilizationPercent - b.cluster.load.utilizationPercent;
    });
    
    return scored[0]?.cluster || null;
  }

  private getAlternativeClusters(request: RoutingRequest, excludeClusterId: string): ClusterInfo[] {
    const allHealthy = this.registry.getHealthyClusters();
    const alternatives = allHealthy.filter(c => c.id !== excludeClusterId);
    
    // Score and sort alternatives
    const scored = alternatives.map(cluster => ({
      cluster,
      score: this.calculateClusterScore(cluster),
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, this.config.maxAlternatives).map(s => s.cluster);
  }

  // ============================================================================
  // CIRCUIT BREAKER
  // ============================================================================

  private isCircuitBreakerOpen(clusterId: string): boolean {
    const cb = this.circuitBreakers.get(clusterId);
    if (!cb) return false;
    
    if (!cb.isOpen) return false;
    
    // Check if we should try to close the circuit
    if (cb.openedAt) {
      const elapsed = Date.now() - cb.openedAt.getTime();
      if (elapsed > this.config.circuitBreakerResetMs) {
        // Half-open: allow one request through
        cb.isOpen = false;
        cb.failures = 0;
        logger.info('[LoadBalancer] Circuit breaker half-open', { clusterId });
        return false;
      }
    }
    
    return true;
  }

  recordFailure(clusterId: string): void {
    if (!this.config.enableCircuitBreaker) return;
    
    let cb = this.circuitBreakers.get(clusterId);
    if (!cb) {
      cb = { clusterId, failures: 0, isOpen: false };
      this.circuitBreakers.set(clusterId, cb);
    }
    
    cb.failures++;
    cb.lastFailureAt = new Date();
    
    if (cb.failures >= this.config.circuitBreakerThreshold) {
      cb.isOpen = true;
      cb.openedAt = new Date();
      this.stats.circuitBreakerTrips++;
      
      logger.warn('[LoadBalancer] Circuit breaker opened', {
        clusterId,
        failures: cb.failures,
      });
      
      this.emit('circuit_breaker:opened', { clusterId, failures: cb.failures });
    }
  }

  recordSuccess(clusterId: string): void {
    const cb = this.circuitBreakers.get(clusterId);
    if (cb) {
      cb.failures = 0;
      if (cb.isOpen) {
        cb.isOpen = false;
        logger.info('[LoadBalancer] Circuit breaker closed', { clusterId });
        this.emit('circuit_breaker:closed', { clusterId });
      }
    }
  }

  private resetCircuitBreaker(clusterId: string): void {
    this.circuitBreakers.delete(clusterId);
  }

  // ============================================================================
  // LOAD REBALANCING
  // ============================================================================

  async generateRebalancePlan(): Promise<RebalancePlan> {
    this.ensureInitialized();
    
    const clusters = this.registry.getAllClusters();
    const healthyClusters = clusters.filter(c => c.health.status === 'healthy');
    
    if (healthyClusters.length < 2) {
      return {
        timestamp: new Date(),
        moves: [],
        totalMoves: 0,
        estimatedImpact: {
          maxUtilizationBefore: 0,
          maxUtilizationAfter: 0,
          avgUtilizationBefore: 0,
          avgUtilizationAfter: 0,
        },
      };
    }

    // Calculate current utilization
    const utilizations = healthyClusters.map(c => c.load.utilizationPercent);
    const avgUtilization = utilizations.reduce((a, b) => a + b, 0) / utilizations.length;
    const maxUtilization = Math.max(...utilizations);

    // Find overloaded and underloaded clusters
    const overloaded = healthyClusters.filter(c => c.load.utilizationPercent > avgUtilization + 20);
    const underloaded = healthyClusters.filter(c => c.load.utilizationPercent < avgUtilization - 10);

    const moves: LoadDistribution[] = [];

    for (const source of overloaded) {
      const agentsToMove = Math.floor(
        (source.load.utilizationPercent - avgUtilization) / 100 * source.maxAgents
      );
      
      if (agentsToMove <= 0) continue;
      
      // Find best target
      const target = underloaded
        .filter(t => t.id !== source.id && t.availableSlots > 0)
        .sort((a, b) => a.load.utilizationPercent - b.load.utilizationPercent)[0];
      
      if (target) {
        moves.push({
          clusterId: target.id,
          currentAgents: target.currentAgents,
          targetAgents: target.currentAgents + agentsToMove,
          delta: agentsToMove,
          reason: `Rebalance from ${source.id} (${source.load.utilizationPercent.toFixed(1)}%)`,
        });
      }
    }

    // Calculate estimated impact
    const estimatedUtilizations = healthyClusters.map(cluster => {
      const move = moves.find(m => m.clusterId === cluster.id);
      if (move) {
        return (move.targetAgents / cluster.maxAgents) * 100;
      }
      return cluster.load.utilizationPercent;
    });

    return {
      timestamp: new Date(),
      moves,
      totalMoves: moves.reduce((sum, m) => sum + m.delta, 0),
      estimatedImpact: {
        maxUtilizationBefore: maxUtilization,
        maxUtilizationAfter: Math.max(...estimatedUtilizations),
        avgUtilizationBefore: avgUtilization,
        avgUtilizationAfter: estimatedUtilizations.reduce((a, b) => a + b, 0) / estimatedUtilizations.length,
      },
    };
  }

  // ============================================================================
  // SESSION AFFINITY
  // ============================================================================

  private cleanupSessionAffinity(): void {
    const now = Date.now();
    const expired: string[] = [];
    
    for (const [sessionId, affinity] of this.sessionAffinity) {
      if (now - affinity.timestamp.getTime() > this.config.sessionAffinityTTLMs) {
        expired.push(sessionId);
      }
    }
    
    for (const sessionId of expired) {
      this.sessionAffinity.delete(sessionId);
    }
  }

  clearSessionAffinity(sessionId?: string): void {
    if (sessionId) {
      this.sessionAffinity.delete(sessionId);
    } else {
      this.sessionAffinity.clear();
    }
  }

  getSessionAffinity(sessionId: string): string | undefined {
    const affinity = this.sessionAffinity.get(sessionId);
    return affinity?.clusterId;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  private updateAvgLatency(latencyMs: number): void {
    const total = this.stats.totalRequests;
    this.stats.avgRoutingLatencyMs = 
      (this.stats.avgRoutingLatencyMs * (total - 1) + latencyMs) / total;
  }

  getStats(): LoadBalancerStats {
    return { ...this.stats };
  }

  getCircuitBreakerState(clusterId?: string): CircuitBreakerState | Map<string, CircuitBreakerState> {
    if (clusterId) {
      return this.circuitBreakers.get(clusterId)!;
    }
    return new Map(this.circuitBreakers);
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRoutes: 0,
      failedRoutes: 0,
      circuitBreakerTrips: 0,
      avgRoutingLatencyMs: 0,
      strategyDistribution: {
        'least-loaded': 0,
        'round-robin': 0,
        'session-affinity': 0,
        'capability-match': 0,
        'weighted': 0,
        'regional': 0,
      },
    };
  }
}

// ============================================================================
// AGENT-LEVEL LOAD BALANCER (for backwards compatibility with tests)
// ============================================================================

import type { AgentRegistry, RegisteredAgent } from './agent-registry';
import { AgentCircuitBreakerRegistry } from './circuit-breaker';
import { HealthChecker } from './health-checker';

export interface AgentLoadBalancerConfig {
  strategy: 'least-connections' | 'round-robin' | 'weighted';
  healthCheck?: {
    interval?: number;
    timeout?: number;
    unhealthyThreshold?: number;
  };
  circuitBreaker?: {
    failureThreshold?: number;
    timeout?: number;
  };
}

export interface AgentSelection {
  agent: RegisteredAgent;
  score?: number;
}

/**
 * Agent-level load balancer for routing tasks to agents
 * 
 * This provides a simpler interface for agent selection compared to
 * the cluster-level MultiClusterLoadBalancer.
 */
export class LoadBalancer {
  private registry: AgentRegistry;
  private config: AgentLoadBalancerConfig;
  private circuitBreakers: AgentCircuitBreakerRegistry;
  private healthChecker: HealthChecker | null = null;
  private roundRobinIndex = 0;
  private strategyWeights = new Map<string, number>();

  constructor(registry: AgentRegistry, config: AgentLoadBalancerConfig) {
    this.registry = registry;
    this.config = {
      healthCheck: { interval: 5000, timeout: 5000, unhealthyThreshold: 3 },
      circuitBreaker: { failureThreshold: 5, timeout: 30000 },
      ...config,
    };
    
    this.circuitBreakers = new AgentCircuitBreakerRegistry({
      failureThreshold: this.config.circuitBreaker?.failureThreshold ?? 5,
      timeout: this.config.circuitBreaker?.timeout ?? 30000,
      successThreshold: 2,
    });

    // Initialize health checker if configured
    if (this.config.healthCheck?.interval) {
      this.healthChecker = new HealthChecker({
        interval: this.config.healthCheck.interval,
        timeout: this.config.healthCheck.timeout ?? 5000,
        unhealthyThreshold: this.config.healthCheck.unhealthyThreshold ?? 3,
        degradedThreshold: 2000,
        healthyLatencyThreshold: 5000,
      });

      // Sync health checker with registry
      const agents = (registry as unknown as { list(): RegisteredAgent[] }).list();
      for (const agent of agents) {
        this.healthChecker.registerAgent(agent.id);
      }

      this.healthChecker.start();
    }
  }

  /**
   * Select an agent based on the configured strategy
   */
  async selectAgent(criteria: { 
    requiredSkills?: string[]; 
    priority?: number;
  } = {}): Promise<AgentSelection> {
    const healthyAgents = this.getHealthyAgents();
    
    if (healthyAgents.length === 0) {
      throw new Error('No healthy agents available');
    }

    // Filter by skills if specified
    let candidates = healthyAgents;
    if (criteria.requiredSkills && criteria.requiredSkills.length > 0) {
      candidates = healthyAgents.filter(agent => {
        const agentSkills = agent.capabilities.skills.map(s => s.toLowerCase());
        return criteria.requiredSkills!.every(skill => 
          agentSkills.includes(skill.toLowerCase())
        );
      });
    }

    if (candidates.length === 0) {
      throw new Error('No agents available matching the specified criteria');
    }

    // Apply selection strategy
    let selected: RegisteredAgent;
    
    switch (this.config.strategy) {
      case 'round-robin':
        selected = this.selectRoundRobin(candidates);
        break;
      case 'weighted':
        selected = this.selectWeighted(candidates);
        break;
      case 'least-connections':
      default:
        selected = this.selectLeastConnections(candidates);
        break;
    }

    return { agent: selected };
  }

  private selectRoundRobin(candidates: RegisteredAgent[]): RegisteredAgent {
    this.roundRobinIndex = (this.roundRobinIndex + 1) % candidates.length;
    return candidates[this.roundRobinIndex];
  }

  private selectWeighted(candidates: RegisteredAgent[]): RegisteredAgent {
    // Use reliability as weight
    const totalWeight = candidates.reduce((sum, a) => sum + a.capabilities.reliability, 0);
    let random = Math.random() * totalWeight;
    
    for (const agent of candidates) {
      random -= agent.capabilities.reliability;
      if (random <= 0) {
        return agent;
      }
    }
    
    return candidates[candidates.length - 1];
  }

  private selectLeastConnections(candidates: RegisteredAgent[]): RegisteredAgent {
    // Select agent with lowest current load
    return candidates.reduce((best, agent) => {
      if (agent.currentLoad < best.currentLoad) {
        return agent;
      }
      return best;
    });
  }

  /**
   * Get all healthy agents (not circuit broken)
   */
  getHealthyAgents(): RegisteredAgent[] {
    const allAgents = this.registry.getHealthyAgents();
    return allAgents.filter(agent => {
      const cb = this.circuitBreakers.get(agent.id);
      if (cb && cb.isOpen()) {
        return false;
      }
      return true;
    });
  }

  /**
   * Record a failure for an agent (triggers circuit breaker)
   */
  recordFailure(agentId: string, error?: Error): void {
    const cb = this.circuitBreakers.getOrCreate(agentId);
    cb.recordFailure(error);
  }

  /**
   * Record a success for an agent (resets circuit breaker)
   */
  recordSuccess(agentId: string): void {
    const cb = this.circuitBreakers.get(agentId);
    if (cb) {
      cb.recordSuccess();
    }
  }

  /**
   * Stop the load balancer and cleanup resources
   */
  stop(): void {
    if (this.healthChecker) {
      this.healthChecker.stop();
      this.healthChecker.dispose();
      this.healthChecker = null;
    }
    this.circuitBreakers.clear();
  }
}

export default MultiClusterLoadBalancer;
