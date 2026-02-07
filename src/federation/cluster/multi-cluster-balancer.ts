/**
 * Multi-Cluster Load Balancer - Intelligent agent placement across clusters
 * 
 * Routes agent spawn requests to the optimal cluster based on workload
 * requirements, cluster health, and cost considerations. Supports
 * seamless migration of agents between clusters.
 * 
 * @module federation/cluster/multi-cluster-balancer
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import {
  Cluster,
  ClusterSelectionCriteria,
  SpawnConfig,
  Agent,
  ClusterSelection,
  Migration,
  MigrationStatus,
} from './types';
import { ClusterRegistry } from './cluster-registry';
import { ClusterClient } from './cluster-client';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the multi-cluster load balancer
 */
export interface LoadBalancerConfig {
  /** Local cluster capacity threshold before offloading (0-1) */
  localCapacityThreshold: number;
  /** Prefer local cluster when possible */
  preferLocal: boolean;
  /** Enable automatic migration */
  enableMigration: boolean;
  /** Migration cooldown period in ms */
  migrationCooldownMs: number;
}

/**
 * Local runtime interface for agent operations
 */
export interface LocalRuntime {
  spawn(config: SpawnConfig): Promise<Agent>;
  kill(agentId: string): Promise<void>;
  exec(agentId: string, command: string): Promise<{ output: string; exitCode: number }>;
  list(): Promise<Agent[]>;
  getCapacity(): Promise<{ max: number; available: number; load: number }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default load balancer configuration */
export const DEFAULT_LOAD_BALANCER_CONFIG: LoadBalancerConfig = {
  localCapacityThreshold: 0.8,
  preferLocal: true,
  enableMigration: true,
  migrationCooldownMs: 60000, // 1 minute
};

// ============================================================================
// Multi-Cluster Load Balancer
// ============================================================================

/**
 * Load balancer for distributing agents across clusters
 * 
 * Automatically routes agent spawn requests to the optimal cluster
 * based on:
 * - Local capacity (offloads when local is busy)
 * - Workload requirements (GPU, specific capabilities)
 * - Cost optimization
 * - Latency requirements
 * 
 * @example
 * ```typescript
 * const balancer = new MultiClusterLoadBalancer(registry, localRuntime);
 * 
 * // Spawn agent (automatically selects best cluster)
 * const agent = await balancer.spawnAgent({
 *   model: 'claude-sonnet-4',
 *   labels: { task: 'analysis' }
 * });
 * 
 * // Migrate agent to different cluster
 * await balancer.migrateAgent(agent.id, 'source-cluster', 'target-cluster');
 * ```
 */
export class MultiClusterLoadBalancer extends EventEmitter {
  private registry: ClusterRegistry;
  private localRuntime: LocalRuntime;
  private config: LoadBalancerConfig;
  private migrations: Map<string, Migration> = new Map();
  private agentLocations: Map<string, { clusterId: string | null; client?: ClusterClient }> = new Map();
  private lastMigrationTime: Map<string, number> = new Map();

  /**
   * Create a new multi-cluster load balancer
   * 
   * @param registry - Cluster registry
   * @param localRuntime - Local runtime for local agent operations
   * @param config - Load balancer configuration
   */
  constructor(
    registry: ClusterRegistry,
    localRuntime: LocalRuntime,
    config?: Partial<LoadBalancerConfig>
  ) {
    super();
    this.registry = registry;
    this.localRuntime = localRuntime;
    this.config = { ...DEFAULT_LOAD_BALANCER_CONFIG, ...config };
  }

  // ============================================================================
  // Agent Spawning
  // ============================================================================

  /**
   * Spawn an agent on the optimal cluster
   * 
   * Automatically selects between local and remote clusters based on:
   * - Local capacity
   * - Workload requirements (GPU, etc.)
   * - Cost and latency priorities
   * 
   * @param config - Agent configuration
   * @returns Spawned agent
   * 
   * @example
   * ```typescript
   * const agent = await balancer.spawnAgent({
   *   model: 'gpt-4o',
   *   labels: { task: 'generation' },
   *   requiresGpu: true,
   *   timeout: 600
   * });
   * ```
   */
  async spawnAgent(config: SpawnConfig): Promise<Agent> {
    const selection = await this.selectCluster(config);

    if (selection.isLocal) {
      // Spawn locally
      logger.debug('[MultiClusterLoadBalancer] Spawning agent locally');
      const agent = await this.localRuntime.spawn(config);
      
      this.agentLocations.set(agent.id, { clusterId: null });
      
      this.emit('agent:spawned', { 
        agentId: agent.id, 
        clusterId: null, 
        isLocal: true,
        timestamp: Date.now() 
      });

      return agent;
    } else {
      // Spawn remotely
      const cluster = selection.cluster!;
      logger.debug(`[MultiClusterLoadBalancer] Spawning agent on cluster ${cluster.id}`);
      
      const client = this.registry.getClient(cluster.id);
      const agent = await client.spawnAgent(config);

      this.agentLocations.set(agent.id, { clusterId: cluster.id, client });

      this.emit('agent:spawned', { 
        agentId: agent.id, 
        clusterId: cluster.id, 
        isLocal: false,
        timestamp: Date.now() 
      });

      return agent;
    }
  }

  /**
   * Select the best cluster for a workload
   * 
   * @param config - Agent configuration
   * @returns Cluster selection result
   */
  async selectCluster(config: SpawnConfig): Promise<ClusterSelection> {
    // Check if GPU is required
    if (config.requiresGpu) {
      return this.selectGpuCluster(config);
    }

    // Check local capacity if we prefer local
    if (this.config.preferLocal) {
      const localCapacity = await this.localRuntime.getCapacity();
      const localLoad = localCapacity.available / localCapacity.max;

      // If local has capacity and load is below threshold, use local
      if (localCapacity.available > 0 && localLoad < this.config.localCapacityThreshold) {
        logger.debug('[MultiClusterLoadBalancer] Selecting local cluster (capacity available)');
        return { cluster: null, isLocal: true, score: 100 };
      }
    }

    // Offload to remote cluster
    const criteria: ClusterSelectionCriteria = {
      priority: config.requiresGpu ? 'gpu' : 'cost',
      minAgents: 1,
      requiresGpu: config.requiresGpu,
      gpuType: config.gpuType,
    };

    const remoteCluster = await this.registry.getBestCluster(criteria);

    if (!remoteCluster) {
      // No remote cluster available, fallback to local even if busy
      logger.warn('[MultiClusterLoadBalancer] No remote cluster available, falling back to local');
      return { cluster: null, isLocal: true, score: 50 };
    }

    logger.debug(`[MultiClusterLoadBalancer] Selecting remote cluster ${remoteCluster.id}`);
    return { cluster: remoteCluster, isLocal: false, score: 80 };
  }

  /**
   * Select a GPU cluster for GPU workloads
   */
  private async selectGpuCluster(config: SpawnConfig): Promise<ClusterSelection> {
    // Find clusters with GPU support
    const gpuClusters = this.registry.getGpuClusters(config.gpuType);

    if (gpuClusters.length === 0) {
      logger.warn('[MultiClusterLoadBalancer] No GPU clusters available');
      return { cluster: null, isLocal: true, score: 0 };
    }

    // Select best GPU cluster based on availability and latency
    const criteria: ClusterSelectionCriteria = {
      priority: 'gpu',
      requiresGpu: true,
      gpuType: config.gpuType,
      minAgents: 1,
    };

    const bestCluster = await this.registry.getBestCluster(criteria);

    if (bestCluster) {
      return { cluster: bestCluster, isLocal: false, score: 100 };
    }

    // Fallback to first available GPU cluster
    return { cluster: gpuClusters[0], isLocal: false, score: 70 };
  }

  // ============================================================================
  // Agent Operations
  // ============================================================================

  /**
   * Execute a command on an agent
   * 
   * Automatically routes to the correct cluster (local or remote)
   * 
   * @param agentId - Agent ID
   * @param command - Command to execute
   * @returns Execution result
   */
  async executeCommand(agentId: string, command: string): Promise<{ output: string; exitCode: number }> {
    const location = this.agentLocations.get(agentId);

    if (!location) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (location.clusterId === null) {
      // Local agent
      return this.localRuntime.exec(agentId, command);
    } else {
      // Remote agent
      const client = location.client || this.registry.getClient(location.clusterId);
      return client.executeCommand(agentId, command);
    }
  }

  /**
   * Kill an agent
   * 
   * @param agentId - Agent ID
   */
  async killAgent(agentId: string): Promise<void> {
    const location = this.agentLocations.get(agentId);

    if (!location) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (location.clusterId === null) {
      // Local agent
      await this.localRuntime.kill(agentId);
    } else {
      // Remote agent
      const client = location.client || this.registry.getClient(location.clusterId);
      await client.killAgent(agentId);
    }

    this.agentLocations.delete(agentId);
    this.emit('agent:killed', { agentId, timestamp: Date.now() });
  }

  /**
   * Get agent location
   * 
   * @param agentId - Agent ID
   * @returns Agent location info
   */
  getAgentLocation(agentId: string): { clusterId: string | null } | undefined {
    return this.agentLocations.get(agentId);
  }

  // ============================================================================
  // Agent Migration
  // ============================================================================

  /**
   * Migrate an agent from one cluster to another
   * 
   * @param agentId - Agent ID
   * @param fromClusterId - Source cluster ID (or 'local')
   * @param toClusterId - Target cluster ID (or 'local')
   * @returns Migration tracking info
   * 
   * @example
   * ```typescript
   * // Migrate from local to cloud GPU cluster
   * await balancer.migrateAgent('agent-123', 'local', 'gpu-cluster-1');
   * 
   * // Migrate between cloud clusters
   * await balancer.migrateAgent('agent-123', 'us-east-1', 'eu-west-1');
   * ```
   */
  async migrateAgent(
    agentId: string,
    fromClusterId: string,
    toClusterId: string
  ): Promise<Migration> {
    // Check cooldown
    const lastMigration = this.lastMigrationTime.get(agentId);
    if (lastMigration && Date.now() - lastMigration < this.config.migrationCooldownMs) {
      throw new Error('Migration cooldown period not elapsed');
    }

    // Create migration record
    const migration: Migration = {
      id: `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      fromCluster: fromClusterId,
      toCluster: toClusterId,
      status: 'pending',
      startedAt: Date.now(),
    };

    this.migrations.set(migration.id, migration);
    this.emit('migration:started', migration);

    try {
      // Step 1: Export agent state from source
      migration.status = 'exporting';
      this.emit('migration:exporting', migration);
      
      const snapshot = await this.exportAgent(agentId, fromClusterId);

      // Step 2: Stop agent on source
      await this.killAgentOnCluster(agentId, fromClusterId);

      // Step 3: Import agent state on target
      migration.status = 'importing';
      this.emit('migration:importing', migration);

      const importedAgent = await this.importAgent(snapshot, toClusterId);

      // Step 4: Update location tracking
      if (toClusterId === 'local') {
        this.agentLocations.set(agentId, { clusterId: null });
      } else {
        const client = this.registry.getClient(toClusterId);
        this.agentLocations.set(agentId, { clusterId: toClusterId, client });
      }

      // Migration complete
      migration.status = 'completed';
      migration.completedAt = Date.now();
      this.lastMigrationTime.set(agentId, Date.now());

      logger.info(`[MultiClusterLoadBalancer] Migration ${migration.id} completed: ${agentId} -> ${toClusterId}`);
      this.emit('migration:completed', migration);

      return migration;
    } catch (error) {
      migration.status = 'failed';
      migration.error = (error as Error).message;

      logger.error(`[MultiClusterLoadBalancer] Migration ${migration.id} failed:`, error);
      this.emit('migration:failed', migration);

      throw error;
    }
  }

  /**
   * Export agent state from a cluster
   */
  private async exportAgent(agentId: string, clusterId: string) {
    if (clusterId === 'local') {
      // For local agents, we need a custom export mechanism
      // This would be implemented by the local runtime
      throw new Error('Local agent export not yet implemented');
    } else {
      const client = this.registry.getClient(clusterId);
      return client.exportAgent(agentId, true);
    }
  }

  /**
   * Kill agent on a specific cluster
   */
  private async killAgentOnCluster(agentId: string, clusterId: string): Promise<void> {
    if (clusterId === 'local') {
      await this.localRuntime.kill(agentId);
    } else {
      const client = this.registry.getClient(clusterId);
      await client.killAgent(agentId);
    }
  }

  /**
   * Import agent state to a cluster
   */
  private async importAgent(snapshot: any, clusterId: string) {
    if (clusterId === 'local') {
      // For local agents, we need a custom import mechanism
      throw new Error('Local agent import not yet implemented');
    } else {
      const client = this.registry.getClient(clusterId);
      return client.importAgent(snapshot);
    }
  }

  /**
   * Get migration status
   * 
   * @param migrationId - Migration ID
   */
  getMigration(migrationId: string): Migration | undefined {
    return this.migrations.get(migrationId);
  }

  /**
   * Get all migrations
   */
  getAllMigrations(): Migration[] {
    return Array.from(this.migrations.values());
  }

  /**
   * Get migrations by status
   */
  getMigrationsByStatus(status: MigrationStatus): Migration[] {
    return this.getAllMigrations().filter(m => m.status === status);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get load balancer statistics
   */
  getStats(): {
    totalAgents: number;
    localAgents: number;
    remoteAgents: number;
    migrationsTotal: number;
    migrationsCompleted: number;
    migrationsFailed: number;
    migrationsPending: number;
  } {
    const agents = Array.from(this.agentLocations.entries());
    const localAgents = agents.filter(([, loc]) => loc.clusterId === null);
    const remoteAgents = agents.filter(([, loc]) => loc.clusterId !== null);

    const migrations = this.getAllMigrations();

    return {
      totalAgents: agents.length,
      localAgents: localAgents.length,
      remoteAgents: remoteAgents.length,
      migrationsTotal: migrations.length,
      migrationsCompleted: migrations.filter(m => m.status === 'completed').length,
      migrationsFailed: migrations.filter(m => m.status === 'failed').length,
      migrationsPending: migrations.filter(m => 
        m.status === 'pending' || 
        m.status === 'exporting' || 
        m.status === 'transferring' || 
        m.status === 'importing'
      ).length,
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up resources
   */
  dispose(): void {
    this.removeAllListeners();
    this.migrations.clear();
    this.agentLocations.clear();
    this.lastMigrationTime.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalBalancer: MultiClusterLoadBalancer | null = null;

/**
 * Get the global load balancer instance
 */
export function getMultiClusterLoadBalancer(
  registry: ClusterRegistry,
  localRuntime: LocalRuntime,
  config?: Partial<LoadBalancerConfig>
): MultiClusterLoadBalancer {
  if (!globalBalancer) {
    globalBalancer = new MultiClusterLoadBalancer(registry, localRuntime, config);
  }
  return globalBalancer;
}

/**
 * Reset the global load balancer instance
 */
export function resetMultiClusterLoadBalancer(): void {
  if (globalBalancer) {
    globalBalancer.dispose();
    globalBalancer = null;
  }
}
