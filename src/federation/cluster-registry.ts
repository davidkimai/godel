/**
 * Cluster Registry - Multi-Cluster Federation Management
 * 
 * Manages a registry of clusters with:
 * - Health monitoring and heartbeat tracking
 * - Load reporting and capacity tracking
 * - Automatic failover on cluster failure
 * - Multi-region deployment support
 * 
 * @module federation/cluster-registry
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export type ClusterHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type ClusterRole = 'primary' | 'secondary' | 'standby';

export interface ClusterCapabilities {
  gpu?: boolean;
  largeModel?: boolean;
  vision?: boolean;
  audio?: boolean;
  multiAgent?: boolean;
}

export interface ClusterMetrics {
  cpuPercent: number;
  memoryPercent: number;
  activeAgents: number;
  maxAgents: number;
  queueDepth: number;
  tasksPerSecond: number;
  avgTaskLatencyMs: number;
  failedTasks: number;
  completedTasks: number;
  timestamp: Date;
}

export interface ClusterLoad {
  currentAgents: number;
  maxAgents: number;
  utilizationPercent: number;
  queueDepth: number;
  avgTaskLatencyMs: number;
  timestamp: Date;
}

export interface ClusterHealth {
  status: ClusterHealthStatus;
  lastCheckAt: Date;
  lastSuccessAt?: Date;
  failureCount: number;
  latencyMs: number;
  message?: string;
}

export interface ClusterInfo {
  id: string;
  endpoint: string;
  region: string;
  zone: string;
  version?: string;
  role: ClusterRole;
  capabilities: ClusterCapabilities;
  
  // Health & Load
  health: ClusterHealth;
  metrics: ClusterMetrics;
  load: ClusterLoad;
  
  // Capacity
  maxAgents: number;
  currentAgents: number;
  availableSlots: number;
  
  // Routing
  routingWeight: number;
  isActive: boolean;
  isAcceptingTraffic: boolean;
  
  // Timestamps
  registeredAt: Date;
  lastHeartbeatAt?: Date;
  lastUpdatedAt: Date;
}

export interface ClusterRegistrationInput {
  endpoint: string;
  region: string;
  zone: string;
  version?: string;
  maxAgents: number;
  capabilities?: ClusterCapabilities;
  role?: ClusterRole;
  routingWeight?: number;
  metadata?: Record<string, string>;
}

export interface ClusterRegistryConfig {
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  unhealthyThreshold: number;
  autoRemoveAfterMs?: number;
  heartbeatTimeoutMs: number;
  failoverEnabled: boolean;
  loadReportIntervalMs: number;
}

export interface RegionInfo {
  name: string;
  clusters: ClusterInfo[];
  healthyCount: number;
  totalCapacity: number;
  availableCapacity: number;
  utilizationPercent: number;
}

export interface FederationStatus {
  totalClusters: number;
  healthyClusters: number;
  degradedClusters: number;
  unhealthyClusters: number;
  totalCapacity: number;
  availableCapacity: number;
  overallUtilization: number;
  regions: RegionInfo[];
  timestamp: Date;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_REGISTRY_CONFIG: ClusterRegistryConfig = {
  healthCheckIntervalMs: 30000,      // 30 seconds
  healthCheckTimeoutMs: 5000,        // 5 seconds
  unhealthyThreshold: 3,
  heartbeatTimeoutMs: 60000,         // 60 seconds
  failoverEnabled: true,
  loadReportIntervalMs: 10000,       // 10 seconds
};

// ============================================================================
// CLUSTER REGISTRY
// ============================================================================

export class ClusterRegistry extends EventEmitter {
  private clusters: Map<string, ClusterInfo> = new Map();
  private config: ClusterRegistryConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private loadReportTimer?: NodeJS.Timeout;
  private initialized = false;
  private roundRobinIndex = 0;

  constructor(config: Partial<ClusterRegistryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('[ClusterRegistry] Already initialized');
      return;
    }

    this.initialized = true;
    logger.info('[ClusterRegistry] Initialized', { config: this.config });
    this.emit('initialized');
  }

  async dispose(): Promise<void> {
    this.stopHealthMonitoring();
    this.stopLoadReporting();
    this.clusters.clear();
    this.initialized = false;
    this.removeAllListeners();
    logger.info('[ClusterRegistry] Disposed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ClusterRegistry not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // CLUSTER REGISTRATION
  // ============================================================================

  async registerCluster(input: ClusterRegistrationInput): Promise<ClusterInfo> {
    this.ensureInitialized();

    // Check for duplicate endpoint
    for (const cluster of this.clusters.values()) {
      if (cluster.endpoint === input.endpoint && cluster.isActive) {
        throw new Error(`Cluster with endpoint ${input.endpoint} already registered`);
      }
    }

    const now = new Date();
    const cluster: ClusterInfo = {
      id: randomUUID(),
      endpoint: input.endpoint,
      region: input.region,
      zone: input.zone,
      version: input.version,
      role: input.role || 'secondary',
      capabilities: input.capabilities || {},
      
      health: {
        status: 'unknown',
        lastCheckAt: now,
        failureCount: 0,
        latencyMs: 0,
      },
      
      metrics: {
        cpuPercent: 0,
        memoryPercent: 0,
        activeAgents: 0,
        maxAgents: input.maxAgents,
        queueDepth: 0,
        tasksPerSecond: 0,
        avgTaskLatencyMs: 0,
        failedTasks: 0,
        completedTasks: 0,
        timestamp: now,
      },
      
      load: {
        currentAgents: 0,
        maxAgents: input.maxAgents,
        utilizationPercent: 0,
        queueDepth: 0,
        avgTaskLatencyMs: 0,
        timestamp: now,
      },
      
      maxAgents: input.maxAgents,
      currentAgents: 0,
      availableSlots: input.maxAgents,
      
      routingWeight: input.routingWeight ?? 1,
      isActive: true,
      isAcceptingTraffic: true,
      
      registeredAt: now,
      lastUpdatedAt: now,
    };

    this.clusters.set(cluster.id, cluster);
    
    logger.info('[ClusterRegistry] Cluster registered', {
      clusterId: cluster.id,
      endpoint: cluster.endpoint,
      region: cluster.region,
    });
    
    this.emit('cluster:registered', { cluster });
    
    return cluster;
  }

  async unregisterCluster(clusterId: string, reason?: string): Promise<void> {
    this.ensureInitialized();

    const cluster = this.clusters.get(clusterId);
    if (!cluster) {
      throw new Error(`Cluster not found: ${clusterId}`);
    }

    cluster.isActive = false;
    cluster.isAcceptingTraffic = false;
    
    this.clusters.delete(clusterId);
    
    logger.info('[ClusterRegistry] Cluster unregistered', {
      clusterId,
      reason,
    });
    
    this.emit('cluster:unregistered', { clusterId, reason });
  }

  // ============================================================================
  // CLUSTER QUERIES
  // ============================================================================

  getCluster(clusterId: string): ClusterInfo | undefined {
    this.ensureInitialized();
    return this.clusters.get(clusterId);
  }

  getAllClusters(): ClusterInfo[] {
    this.ensureInitialized();
    return Array.from(this.clusters.values());
  }

  getHealthyClusters(): ClusterInfo[] {
    return this.getAllClusters().filter(c => 
      c.health.status === 'healthy' && c.isActive && c.isAcceptingTraffic
    );
  }

  getClustersByRegion(region: string): ClusterInfo[] {
    return this.getAllClusters().filter(c => c.region === region);
  }

  getClustersByCapability(capability: keyof ClusterCapabilities): ClusterInfo[] {
    return this.getAllClusters().filter(c => c.capabilities[capability]);
  }

  hasCluster(clusterId: string): boolean {
    return this.clusters.has(clusterId);
  }

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  async updateHealth(
    clusterId: string, 
    status: ClusterHealthStatus, 
    latencyMs: number,
    message?: string
  ): Promise<void> {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return;

    const previousStatus = cluster.health.status;
    const now = new Date();

    cluster.health.status = status;
    cluster.health.lastCheckAt = now;
    cluster.health.latencyMs = latencyMs;
    cluster.health.message = message;

    if (status === 'healthy') {
      cluster.health.lastSuccessAt = now;
      cluster.health.failureCount = 0;
      cluster.isAcceptingTraffic = true;
    } else {
      cluster.health.failureCount++;
      
      if (status === 'unhealthy') {
        cluster.isAcceptingTraffic = false;
        
        // Trigger failover if enabled
        if (this.config.failoverEnabled && previousStatus !== 'unhealthy') {
          this.emit('cluster:failed', { clusterId, cluster });
        }
      }
    }

    cluster.lastUpdatedAt = now;

    if (previousStatus !== status) {
      logger.info('[ClusterRegistry] Cluster health changed', {
        clusterId,
        previous: previousStatus,
        current: status,
      });
      
      this.emit('cluster:health_changed', {
        clusterId,
        cluster,
        previousStatus,
        newStatus: status,
      });
    }
  }

  async checkClusterHealth(clusterId: string): Promise<ClusterHealthStatus> {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) {
      throw new Error(`Cluster not found: ${clusterId}`);
    }

    const startTime = Date.now();
    let status: ClusterHealthStatus = 'unknown';
    let message: string | undefined;

    try {
      // Perform health check via HTTP
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeoutMs);
      
      const response = await fetch(`${cluster.endpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json() as { status?: string };
        
        if (data.status === 'degraded') {
          status = 'degraded';
          message = 'Cluster reported degraded status';
        } else {
          status = 'healthy';
        }
        
        await this.updateHealth(clusterId, status, latencyMs, message);
      } else {
        status = 'unhealthy';
        message = `Health check returned ${response.status}`;
        await this.updateHealth(clusterId, status, latencyMs, message);
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      status = 'unhealthy';
      message = error instanceof Error ? error.message : 'Unknown error';
      await this.updateHealth(clusterId, status, latencyMs, message);
    }

    return status;
  }

  startHealthMonitoring(): void {
    this.ensureInitialized();

    if (this.healthCheckTimer) {
      logger.warn('[ClusterRegistry] Health monitoring already running');
      return;
    }

    logger.info('[ClusterRegistry] Starting health monitoring', {
      intervalMs: this.config.healthCheckIntervalMs,
    });

    // Run first check immediately
    this.runHealthChecks().catch(error => {
      logger.error('[ClusterRegistry] Initial health check failed', { error });
    });

    // Schedule periodic checks
    this.healthCheckTimer = setInterval(() => {
      this.runHealthChecks().catch(error => {
        logger.error('[ClusterRegistry] Health check cycle failed', { error });
      });
    }, this.config.healthCheckIntervalMs);
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      logger.info('[ClusterRegistry] Health monitoring stopped');
    }
  }

  private async runHealthChecks(): Promise<void> {
    const clusters = this.getAllClusters().filter(c => c.isActive);
    
    if (clusters.length === 0) return;

    logger.debug('[ClusterRegistry] Running health checks', { count: clusters.length });

    const results = await Promise.allSettled(
      clusters.map(c => this.checkClusterHealth(c.id))
    );

    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    results.forEach((result, index) => {
      const clusterId = clusters[index].id;
      if (result.status === 'fulfilled') {
        const status = result.value;
        if (status === 'healthy') healthy++;
        else if (status === 'degraded') degraded++;
        else if (status === 'unhealthy') unhealthy++;
        
        logger.debug('[ClusterRegistry] Health check completed', {
          clusterId,
          status,
          latencyMs: clusters[index].health.latencyMs,
        });
      } else {
        unhealthy++;
        logger.error('[ClusterRegistry] Health check failed', {
          clusterId,
          error: result.reason,
        });
      }
    });

    this.emit('health:check_completed', {
      checked: clusters.length,
      healthy,
      degraded,
      unhealthy,
      timestamp: new Date(),
    });
  }

  // ============================================================================
  // LOAD REPORTING & CAPACITY TRACKING
  // ============================================================================

  updateLoad(clusterId: string, load: Partial<ClusterLoad>): void {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return;

    cluster.load = {
      ...cluster.load,
      ...load,
      timestamp: new Date(),
    };

    // Update derived metrics
    cluster.currentAgents = load.currentAgents ?? cluster.currentAgents;
    cluster.availableSlots = cluster.maxAgents - cluster.currentAgents;
    cluster.load.utilizationPercent = cluster.maxAgents > 0
      ? (cluster.currentAgents / cluster.maxAgents) * 100
      : 0;
    cluster.metrics.activeAgents = cluster.currentAgents;
    cluster.metrics.maxAgents = cluster.maxAgents;
    cluster.metrics.queueDepth = cluster.load.queueDepth;

    cluster.lastUpdatedAt = new Date();
  }

  updateMetrics(clusterId: string, metrics: Partial<ClusterMetrics>): void {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return;

    cluster.metrics = {
      ...cluster.metrics,
      ...metrics,
      timestamp: new Date(),
    };

    cluster.lastHeartbeatAt = new Date();
    cluster.lastUpdatedAt = new Date();
  }

  startLoadReporting(): void {
    this.ensureInitialized();

    if (this.loadReportTimer) {
      logger.warn('[ClusterRegistry] Load reporting already running');
      return;
    }

    logger.info('[ClusterRegistry] Starting load reporting', {
      intervalMs: this.config.loadReportIntervalMs,
    });

    this.loadReportTimer = setInterval(() => {
      this.emit('load:report', { clusters: this.getAllClusters() });
    }, this.config.loadReportIntervalMs);
  }

  stopLoadReporting(): void {
    if (this.loadReportTimer) {
      clearInterval(this.loadReportTimer);
      this.loadReportTimer = undefined;
      logger.info('[ClusterRegistry] Load reporting stopped');
    }
  }

  // ============================================================================
  // FEDERATION STATUS
  // ============================================================================

  getFederationStatus(): FederationStatus {
    this.ensureInitialized();

    const clusters = this.getAllClusters();
    const healthyClusters = clusters.filter(c => c.health.status === 'healthy');
    const degradedClusters = clusters.filter(c => c.health.status === 'degraded');
    const unhealthyClusters = clusters.filter(c => c.health.status === 'unhealthy');
    
    const totalCapacity = clusters.reduce((sum, c) => sum + c.maxAgents, 0);
    const availableCapacity = clusters.reduce((sum, c) => sum + c.availableSlots, 0);
    const overallUtilization = totalCapacity > 0
      ? ((totalCapacity - availableCapacity) / totalCapacity) * 100
      : 0;

    // Group by region
    const regionMap = new Map<string, ClusterInfo[]>();
    for (const cluster of clusters) {
      const list = regionMap.get(cluster.region) || [];
      list.push(cluster);
      regionMap.set(cluster.region, list);
    }

    const regions: RegionInfo[] = Array.from(regionMap.entries()).map(([name, regionClusters]) => ({
      name,
      clusters: regionClusters,
      healthyCount: regionClusters.filter(c => c.health.status === 'healthy').length,
      totalCapacity: regionClusters.reduce((sum, c) => sum + c.maxAgents, 0),
      availableCapacity: regionClusters.reduce((sum, c) => sum + c.availableSlots, 0),
      utilizationPercent: regionClusters.reduce((sum, c) => sum + (c.load?.utilizationPercent || 0), 0) / regionClusters.length || 0,
    }));

    return {
      totalClusters: clusters.length,
      healthyClusters: healthyClusters.length,
      degradedClusters: degradedClusters.length,
      unhealthyClusters: unhealthyClusters.length,
      totalCapacity,
      availableCapacity,
      overallUtilization,
      regions,
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // LOAD BALANCING
  // ============================================================================

  selectClusterForMigration(sourceClusterId: string): ClusterInfo | null {
    const sourceCluster = this.clusters.get(sourceClusterId);
    if (!sourceCluster) return null;

    // Find healthy clusters in the same region with available capacity
    const candidates = this.getHealthyClusters().filter(c => 
      c.id !== sourceClusterId && 
      c.region === sourceCluster.region &&
      c.availableSlots > 0
    );

    if (candidates.length === 0) {
      // Expand search to other regions
      const globalCandidates = this.getHealthyClusters().filter(c => 
        c.id !== sourceClusterId && 
        c.availableSlots > 0
      );
      
      if (globalCandidates.length === 0) return null;
      
      // Select least loaded
      return globalCandidates.reduce((best, current) => 
        current.load.utilizationPercent < best.load.utilizationPercent ? current : best
      );
    }

    // Select least loaded in same region
    return candidates.reduce((best, current) => 
      current.load.utilizationPercent < best.load.utilizationPercent ? current : best
    );
  }

  selectClusterRoundRobin(): ClusterInfo | null {
    const healthy = this.getHealthyClusters();
    if (healthy.length === 0) return null;
    
    this.roundRobinIndex = (this.roundRobinIndex + 1) % healthy.length;
    return healthy[this.roundRobinIndex];
  }

  selectClusterLeastLoaded(): ClusterInfo | null {
    const healthy = this.getHealthyClusters();
    if (healthy.length === 0) return null;
    
    return healthy.reduce((best, current) => 
      current.load.utilizationPercent < best.load.utilizationPercent ? current : best
    );
  }

  selectClusterByRegion(region: string): ClusterInfo | null {
    const regionClusters = this.getHealthyClusters().filter(c => c.region === region);
    if (regionClusters.length === 0) return null;
    
    return regionClusters.reduce((best, current) => 
      current.load.utilizationPercent < best.load.utilizationPercent ? current : best
    );
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalClusterRegistry: ClusterRegistry | null = null;

export function getGlobalClusterRegistry(config?: Partial<ClusterRegistryConfig>): ClusterRegistry {
  if (!globalClusterRegistry) {
    globalClusterRegistry = new ClusterRegistry(config);
  }
  return globalClusterRegistry;
}

export function resetGlobalClusterRegistry(): void {
  globalClusterRegistry = null;
}

export default ClusterRegistry;
