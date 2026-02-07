/**
 * Cluster Registry - Multi-cluster management and discovery
 * 
 * Manages registration, health monitoring, and selection of clusters
 * for distributed agent federation. Provides intelligent cluster
 * selection based on workload requirements and cluster health.
 * 
 * @module federation/cluster/cluster-registry
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import {
  Cluster,
  ClusterCapabilities,
  ClusterStatus,
  Region,
  ClusterSelectionCriteria,
  ClusterHealthState,
  ClusterHealthConfig,
} from './types';
import { ClusterClient } from './cluster-client';

// ============================================================================
// Constants
// ============================================================================

/** Default health check configuration */
export const DEFAULT_CLUSTER_HEALTH_CONFIG: ClusterHealthConfig = {
  interval: 30000, // 30 seconds
  timeout: 10000, // 10 seconds
  degradedThreshold: 2,
  offlineThreshold: 5,
  autoRemoveAfterMs: undefined,
};

// ============================================================================
// Cluster Registry
// ============================================================================

/**
 * Cluster registry for managing multiple clusters
 * 
 * Provides:
 * - Cluster registration and discovery
 * - Health monitoring with automatic failover
 * - Intelligent cluster selection based on criteria
 * - Event-driven status change notifications
 * 
 * @example
 * ```typescript
 * const registry = new ClusterRegistry();
 * 
 * // Register clusters
 * registry.register({
 *   id: 'local',
 *   name: 'Local Cluster',
 *   endpoint: 'localhost:50051',
 *   region: 'local',
 *   capabilities: { maxAgents: 10, gpuEnabled: false }
 * });
 * 
 * // Start health monitoring
 * registry.startHealthChecks();
 * 
 * // Select best cluster for workload
 * const cluster = await registry.getBestCluster({
 *   priority: 'latency',
 *   requiresGpu: true
 * });
 * ```
 */
export class ClusterRegistry extends EventEmitter {
  private clusters: Map<string, Cluster> = new Map();
  private clients: Map<string, ClusterClient> = new Map();
  private healthStates: Map<string, ClusterHealthState> = new Map();
  private healthInterval: NodeJS.Timeout | null = null;
  private config: ClusterHealthConfig;
  private isRunning = false;

  /**
   * Create a new cluster registry
   * 
   * @param config - Health check configuration
   */
  constructor(config?: Partial<ClusterHealthConfig>) {
    super();
    this.config = { ...DEFAULT_CLUSTER_HEALTH_CONFIG, ...config };
  }

  // ============================================================================
  // Cluster Registration
  // ============================================================================

  /**
   * Register a new cluster
   * 
   * @param cluster - Cluster configuration
   * @returns The registered cluster
   * 
   * @example
   * ```typescript
   * registry.register({
   *   id: 'gpu-cluster-1',
   *   name: 'GPU Cluster US East',
   *   endpoint: 'https://gpu-1.godel.cloud:443',
   *   region: 'us-east-1',
   *   capabilities: {
   *     maxAgents: 100,
   *     availableAgents: 80,
   *     gpuEnabled: true,
   *     gpuTypes: ['nvidia-a100', 'nvidia-h100'],
   *     costPerHour: 2.5,
   *     latency: 45,
   *     flags: {}
   *   },
   *   metadata: {
   *     version: '2.0.0',
   *     provider: 'aws',
   *     environment: 'production',
   *     tags: ['gpu', 'production']
   *   },
   *   status: 'active',
   *   lastHeartbeat: Date.now(),
   *   registeredAt: Date.now()
   * });
   * ```
   */
  register(cluster: Cluster): Cluster {
    // Validate required fields
    if (!cluster.id || !cluster.endpoint) {
      throw new Error('Cluster must have id and endpoint');
    }

    // Ensure defaults
    const fullCluster: Cluster = {
      ...cluster,
      status: cluster.status || 'active',
      lastHeartbeat: cluster.lastHeartbeat || Date.now(),
      registeredAt: cluster.registeredAt || Date.now(),
      capabilities: {
        maxAgents: 0,
        availableAgents: 0,
        activeAgents: 0,
        gpuEnabled: false,
        gpuTypes: [],
        costPerHour: 0,
        latency: 0,
        flags: {},
        ...cluster.capabilities,
      },
      metadata: {
        version: 'unknown',
        provider: 'unknown',
        environment: 'unknown',
        tags: [],
        ...cluster.metadata,
      },
    };

    this.clusters.set(fullCluster.id, fullCluster);
    
    // Initialize health state
    this.healthStates.set(fullCluster.id, {
      clusterId: fullCluster.id,
      status: fullCluster.status,
      lastHeartbeat: fullCluster.lastHeartbeat,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      latency: 0,
    });

    logger.info(`[ClusterRegistry] Registered cluster ${fullCluster.id} (${fullCluster.name})`);
    this.emit('cluster:registered', { cluster: fullCluster, timestamp: Date.now() });

    return fullCluster;
  }

  /**
   * Unregister a cluster
   * 
   * @param clusterId - Cluster ID to unregister
   * @returns True if cluster was found and removed
   */
  unregister(clusterId: string): boolean {
    const existed = this.clusters.has(clusterId);
    
    if (existed) {
      const cluster = this.clusters.get(clusterId)!;
      
      // Close client if exists
      const client = this.clients.get(clusterId);
      if (client) {
        client.close();
        this.clients.delete(clusterId);
      }

      this.clusters.delete(clusterId);
      this.healthStates.delete(clusterId);

      logger.info(`[ClusterRegistry] Unregistered cluster ${clusterId}`);
      this.emit('cluster:unregistered', { clusterId, timestamp: Date.now() });
    }

    return existed;
  }

  /**
   * Update cluster capabilities
   * 
   * @param clusterId - Cluster ID
   * @param capabilities - New capabilities
   */
  updateCapabilities(clusterId: string, capabilities: Partial<ClusterCapabilities>): void {
    const cluster = this.clusters.get(clusterId);
    if (cluster) {
      cluster.capabilities = { ...cluster.capabilities, ...capabilities };
      cluster.lastHeartbeat = Date.now();
      this.emit('cluster:updated', { cluster, timestamp: Date.now() });
    }
  }

  /**
   * Update cluster status
   * 
   * @param clusterId - Cluster ID
   * @param status - New status
   */
  updateStatus(clusterId: string, status: ClusterStatus): void {
    const cluster = this.clusters.get(clusterId);
    if (cluster) {
      const oldStatus = cluster.status;
      cluster.status = status;
      cluster.lastHeartbeat = Date.now();

      const healthState = this.healthStates.get(clusterId);
      if (healthState) {
        healthState.status = status;
        healthState.lastHeartbeat = Date.now();
      }

      logger.info(`[ClusterRegistry] Cluster ${clusterId} status changed: ${oldStatus} -> ${status}`);
      this.emit('cluster:status_changed', { 
        clusterId, 
        oldStatus, 
        newStatus: status, 
        timestamp: Date.now() 
      });
    }
  }

  // ============================================================================
  // Cluster Queries
  // ============================================================================

  /**
   * Get a cluster by ID
   * 
   * @param clusterId - Cluster ID
   * @returns Cluster or undefined if not found
   */
  getCluster(clusterId: string): Cluster | undefined {
    return this.clusters.get(clusterId);
  }

  /**
   * Get all registered clusters
   * 
   * @returns Array of all clusters
   */
  getClusters(): Cluster[] {
    return Array.from(this.clusters.values());
  }

  /**
   * Get clusters by region
   * 
   * @param region - Region to filter by
   * @returns Clusters in the specified region
   */
  getClustersByRegion(region: Region): Cluster[] {
    return this.getClusters().filter(c => c.region === region);
  }

  /**
   * Get clusters with GPU support
   * 
   * @param gpuType - Optional GPU type filter
   * @returns Clusters with GPU support
   */
  getGpuClusters(gpuType?: string): Cluster[] {
    return this.getClusters().filter(c => {
      if (!c.capabilities.gpuEnabled) return false;
      if (gpuType && !c.capabilities.gpuTypes.includes(gpuType)) return false;
      return c.status === 'active';
    });
  }

  /**
   * Get active clusters
   * 
   * @returns Clusters with active status
   */
  getActiveClusters(): Cluster[] {
    return this.getClusters().filter(c => c.status === 'active');
  }

  // ============================================================================
  // Client Management
  // ============================================================================

  /**
   * Get or create a client for a cluster
   * 
   * @param clusterId - Cluster ID
   * @returns Cluster client
   */
  getClient(clusterId: string): ClusterClient {
    let client = this.clients.get(clusterId);
    
    if (!client) {
      const cluster = this.clusters.get(clusterId);
      if (!cluster) {
        throw new Error(`Cluster ${clusterId} not found`);
      }
      
      client = new ClusterClient(cluster);
      this.clients.set(clusterId, client);
    }

    return client;
  }

  /**
   * Close all cluster connections
   */
  closeAllClients(): void {
    for (const [clusterId, client] of this.clients.entries()) {
      client.close();
      logger.debug(`[ClusterRegistry] Closed client for cluster ${clusterId}`);
    }
    this.clients.clear();
  }

  // ============================================================================
  // Cluster Selection
  // ============================================================================

  /**
   * Select the best cluster based on criteria
   * 
   * @param criteria - Selection criteria
   * @returns Best matching cluster or null if none found
   * 
   * @example
   * ```typescript
   * const cluster = await registry.getBestCluster({
   *   priority: 'cost',
   *   requiresGpu: true,
   *   gpuType: 'nvidia-a100',
   *   maxLatency: 100
   * });
   * ```
   */
  async getBestCluster(criteria: ClusterSelectionCriteria): Promise<Cluster | null> {
    const candidates = this.getClusters()
      .filter(c => c.status === 'active')
      .filter(c => this.meetsCriteria(c, criteria));

    if (candidates.length === 0) {
      return null;
    }

    // Score and sort candidates
    const scored = candidates.map(cluster => ({
      cluster,
      score: this.calculateScore(cluster, criteria),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.cluster || null;
  }

  /**
   * Check if a cluster meets selection criteria
   */
  private meetsCriteria(cluster: Cluster, criteria: ClusterSelectionCriteria): boolean {
    const caps = cluster.capabilities;

    // Check minimum agents
    if (criteria.minAgents !== undefined && caps.availableAgents < criteria.minAgents) {
      return false;
    }

    // Check GPU requirements
    if (criteria.requiresGpu && !caps.gpuEnabled) {
      return false;
    }

    if (criteria.gpuType && !caps.gpuTypes.includes(criteria.gpuType)) {
      return false;
    }

    // Check max latency
    if (criteria.maxLatency !== undefined && caps.latency > criteria.maxLatency) {
      return false;
    }

    // Check max cost
    if (criteria.maxCostPerHour !== undefined && caps.costPerHour > criteria.maxCostPerHour) {
      return false;
    }

    // Check preferred regions
    if (criteria.preferredRegions && criteria.preferredRegions.length > 0) {
      // Not a hard requirement, just affects scoring
    }

    // Check excluded regions
    if (criteria.excludedRegions?.includes(cluster.region)) {
      return false;
    }

    // Check required capabilities
    if (criteria.requiredCapabilities) {
      for (const cap of criteria.requiredCapabilities) {
        if (!caps.flags[cap]) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Calculate a score for cluster selection
   * 
   * Higher score = better match
   */
  private calculateScore(cluster: Cluster, criteria: ClusterSelectionCriteria): number {
    const caps = cluster.capabilities;
    let score = 0;

    // Latency score (0-100, higher is better = lower latency)
    const latencyScore = Math.max(0, 100 - caps.latency);

    // Cost score (0-100, higher is better = lower cost)
    const costScore = Math.max(0, 100 - caps.costPerHour * 10);

    // Availability score (0-100, based on available slots)
    const availabilityScore = caps.maxAgents > 0
      ? (caps.availableAgents / caps.maxAgents) * 100
      : 0;

    // GPU bonus
    const gpuBonus = caps.gpuEnabled ? 10 : 0;

    // Region preference bonus
    let regionBonus = 0;
    if (criteria.preferredRegions?.includes(cluster.region)) {
      regionBonus = 15;
    }

    // Calculate weighted score based on priority
    switch (criteria.priority) {
      case 'latency':
        score = latencyScore * 0.5 + availabilityScore * 0.3 + costScore * 0.2 + gpuBonus + regionBonus;
        break;
      case 'cost':
        score = costScore * 0.5 + availabilityScore * 0.3 + latencyScore * 0.2 + gpuBonus + regionBonus;
        break;
      case 'availability':
        score = availabilityScore * 0.5 + latencyScore * 0.3 + costScore * 0.2 + gpuBonus + regionBonus;
        break;
      case 'gpu':
        score = gpuBonus * 5 + availabilityScore * 0.3 + latencyScore * 0.2 + costScore * 0.1 + regionBonus;
        break;
      default:
        score = latencyScore * 0.3 + costScore * 0.3 + availabilityScore * 0.3 + gpuBonus + regionBonus;
    }

    return score;
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.isRunning) {
      logger.warn('[ClusterRegistry] Health checks already running');
      return;
    }

    this.isRunning = true;

    // Run first check immediately
    this.runHealthChecks().catch(error => {
      logger.error('[ClusterRegistry] Initial health check failed', { error });
    });

    // Schedule periodic checks
    this.healthInterval = setInterval(() => {
      this.runHealthChecks().catch(error => {
        logger.error('[ClusterRegistry] Health check cycle failed', { error });
      });
    }, this.config.interval);

    logger.info(`[ClusterRegistry] Health checks started (interval: ${this.config.interval}ms)`);
    this.emit('health:started', { interval: this.config.interval, timestamp: Date.now() });
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    this.isRunning = false;

    logger.info('[ClusterRegistry] Health checks stopped');
    this.emit('health:stopped', { timestamp: Date.now() });
  }

  /**
   * Run health checks on all clusters
   */
  private async runHealthChecks(): Promise<void> {
    const clusters = this.getClusters();

    if (clusters.length === 0) {
      return;
    }

    logger.debug(`[ClusterRegistry] Running health checks on ${clusters.length} clusters`);

    const results = await Promise.allSettled(
      clusters.map(cluster => this.checkClusterHealth(cluster))
    );

    // Emit summary
    let healthy = 0;
    let degraded = 0;
    let offline = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const state = result.value;
        if (state.status === 'active') healthy++;
        else if (state.status === 'degraded') degraded++;
        else offline++;
      } else {
        offline++;
      }
    });

    this.emit('health:cycle_completed', {
      checked: clusters.length,
      healthy,
      degraded,
      offline,
      timestamp: Date.now(),
    });

    logger.debug(`[ClusterRegistry] Health cycle: ${healthy} healthy, ${degraded} degraded, ${offline} offline`);
  }

  /**
   * Check health of a specific cluster
   */
  private async checkClusterHealth(cluster: Cluster): Promise<ClusterHealthState> {
    const startTime = Date.now();
    const state = this.healthStates.get(cluster.id)!;

    try {
      const client = this.getClient(cluster.id);
      const capabilities = await client.heartbeat();

      const latency = Date.now() - startTime;

      // Update cluster capabilities from heartbeat
      this.updateCapabilities(cluster.id, capabilities);

      // Update health state
      state.latency = latency;
      state.consecutiveSuccesses++;
      state.consecutiveFailures = 0;
      state.lastHeartbeat = Date.now();

      // Determine status based on latency
      if (latency > this.config.timeout / 2) {
        state.status = 'degraded';
        this.updateStatus(cluster.id, 'degraded');
      } else {
        state.status = 'active';
        if (cluster.status !== 'active') {
          this.updateStatus(cluster.id, 'active');
        }
      }

      this.emit('health:checked', { clusterId: cluster.id, state, timestamp: Date.now() });

      return state;
    } catch (error) {
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;
      state.message = (error as Error).message;

      // Determine status based on failure count
      if (state.consecutiveFailures >= this.config.offlineThreshold) {
        state.status = 'offline';
        this.updateStatus(cluster.id, 'offline');
      } else if (state.consecutiveFailures >= this.config.degradedThreshold) {
        state.status = 'degraded';
        this.updateStatus(cluster.id, 'degraded');
      }

      this.emit('health:check_failed', { 
        clusterId: cluster.id, 
        error: (error as Error).message,
        timestamp: Date.now() 
      });

      return state;
    }
  }

  /**
   * Get health state for a cluster
   */
  getHealthState(clusterId: string): ClusterHealthState | undefined {
    return this.healthStates.get(clusterId);
  }

  /**
   * Get all health states
   */
  getAllHealthStates(): ClusterHealthState[] {
    return Array.from(this.healthStates.values());
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get registry statistics
   */
  getStats(): {
    totalClusters: number;
    activeClusters: number;
    degradedClusters: number;
    offlineClusters: number;
    totalCapacity: number;
    availableCapacity: number;
    gpuClusters: number;
  } {
    const clusters = this.getClusters();
    const active = clusters.filter(c => c.status === 'active');
    const degraded = clusters.filter(c => c.status === 'degraded');
    const offline = clusters.filter(c => c.status === 'offline');
    const gpuClusters = clusters.filter(c => c.capabilities.gpuEnabled);

    const totalCapacity = clusters.reduce((sum, c) => sum + c.capabilities.maxAgents, 0);
    const availableCapacity = clusters.reduce((sum, c) => sum + c.capabilities.availableAgents, 0);

    return {
      totalClusters: clusters.length,
      activeClusters: active.length,
      degradedClusters: degraded.length,
      offlineClusters: offline.length,
      totalCapacity,
      availableCapacity,
      gpuClusters: gpuClusters.length,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Dispose of the registry and clean up resources
   */
  dispose(): void {
    this.stopHealthChecks();
    this.closeAllClients();
    this.removeAllListeners();
    this.clusters.clear();
    this.healthStates.clear();
    
    logger.info('[ClusterRegistry] Disposed');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRegistry: ClusterRegistry | null = null;

/**
 * Get the global cluster registry instance
 */
export function getClusterRegistry(config?: Partial<ClusterHealthConfig>): ClusterRegistry {
  if (!globalRegistry) {
    globalRegistry = new ClusterRegistry(config);
  }
  return globalRegistry;
}

/**
 * Reset the global registry instance
 */
export function resetClusterRegistry(): void {
  if (globalRegistry) {
    globalRegistry.dispose();
    globalRegistry = null;
  }
}
