/**
 * Transparent Cluster Proxy - Unified agent interface across clusters
 * 
 * Provides a seamless interface for managing agents regardless of whether
 * they run locally or on remote clusters. Automatically routes operations
 * to the correct cluster and maintains unified agent listings.
 * 
 * @module federation/cluster/transparent-proxy
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import {
  Agent,
  SpawnConfig,
  ExecResult,
  AgentStatus,
  RemoteAgentRef,
} from './types';
import { ClusterRegistry } from './cluster-registry';
import { MultiClusterLoadBalancer, LocalRuntime } from './multi-cluster-balancer';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent filter options for listing
 */
export interface AgentFilter {
  /** Filter by status */
  status?: AgentStatus | AgentStatus[];
  /** Filter by cluster ID */
  clusterId?: string | null;
  /** Filter by labels */
  labels?: Record<string, string>;
  /** Filter by model */
  model?: string;
}

/**
 * Agent with cluster information
 */
export interface AgentWithCluster extends Agent {
  /** Cluster name (for display) */
  clusterName?: string;
  /** Region (for display) */
  region?: string;
  /** Whether this is a local agent */
  isLocal: boolean;
}

// ============================================================================
// Transparent Cluster Proxy
// ============================================================================

/**
 * Transparent proxy for unified agent management across clusters
 * 
 * Provides a single interface for managing agents whether they run
 * locally or on remote clusters. Operations are automatically routed
 * to the correct cluster.
 * 
 * @example
 * ```typescript
 * const proxy = new TransparentClusterProxy(registry, balancer, localRuntime);
 * 
 * // Spawn agent (automatically selects best cluster)
 * const agent = await proxy.spawn({
 *   model: 'claude-sonnet-4',
 *   labels: { task: 'analysis' }
 * });
 * 
 * // Execute command (automatically routed to correct cluster)
 * const result = await proxy.exec(agent.id, 'analyze this');
 * 
 * // List all agents across all clusters
 * const agents = await proxy.list({ showCluster: true });
 * ```
 */
export class TransparentClusterProxy extends EventEmitter {
  private localAgents: Map<string, Agent> = new Map();
  private remoteAgents: Map<string, RemoteAgentRef> = new Map();
  private registry: ClusterRegistry;
  private balancer: MultiClusterLoadBalancer;
  private localRuntime: LocalRuntime;

  /**
   * Create a new transparent cluster proxy
   * 
   * @param registry - Cluster registry
   * @param balancer - Multi-cluster load balancer
   * @param localRuntime - Local runtime for local agents
   */
  constructor(
    registry: ClusterRegistry,
    balancer: MultiClusterLoadBalancer,
    localRuntime: LocalRuntime
  ) {
    super();
    this.registry = registry;
    this.balancer = balancer;
    this.localRuntime = localRuntime;

    // Listen for balancer events
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for balancer events
   */
  private setupEventHandlers(): void {
    this.balancer.on('agent:spawned', ({ agentId, clusterId, isLocal }) => {
      this.emit('agent:spawned', { agentId, clusterId, isLocal, timestamp: Date.now() });
    });

    this.balancer.on('agent:killed', ({ agentId }) => {
      this.localAgents.delete(agentId);
      this.remoteAgents.delete(agentId);
      this.emit('agent:killed', { agentId, timestamp: Date.now() });
    });

    this.balancer.on('migration:completed', (migration) => {
      // Update local tracking after migration
      const { agentId, toCluster } = migration;
      
      if (toCluster === 'local') {
        this.remoteAgents.delete(agentId);
      } else {
        this.localAgents.delete(agentId);
      }

      this.emit('agent:migrated', migration);
    });
  }

  // ============================================================================
  // Agent Spawning
  // ============================================================================

  /**
   * Spawn a new agent
   * 
   * Automatically selects the best cluster (local or remote) based on
   * workload requirements and cluster health.
   * 
   * @param config - Agent configuration
   * @returns Spawned agent
   */
  async spawn(config: SpawnConfig): Promise<Agent> {
    const agent = await this.balancer.spawnAgent(config);

    // Track the agent
    if (agent.clusterId) {
      this.remoteAgents.set(agent.id, {
        id: agent.id,
        clusterId: agent.clusterId,
        client: this.registry.getClient(agent.clusterId),
      });
    } else {
      this.localAgents.set(agent.id, agent);
    }

    logger.debug(`[TransparentClusterProxy] Spawned agent ${agent.id} on ${agent.clusterId || 'local'}`);
    
    this.emit('agent:spawned', { 
      agentId: agent.id, 
      clusterId: agent.clusterId,
      timestamp: Date.now() 
    });

    return agent;
  }

  // ============================================================================
  // Agent Operations
  // ============================================================================

  /**
   * Execute a command on an agent
   * 
   * Automatically routes to local or remote cluster based on agent location.
   * 
   * @param agentId - Agent ID
   * @param command - Command to execute
   * @returns Execution result
   */
  async exec(agentId: string, command: string): Promise<ExecResult> {
    // Check local first
    if (this.localAgents.has(agentId)) {
      logger.debug(`[TransparentClusterProxy] Executing on local agent ${agentId}`);
      const result = await this.localRuntime.exec(agentId, command);
      return {
        output: result.output,
        exitCode: result.exitCode,
      };
    }

    // Check remote
    const remote = this.remoteAgents.get(agentId);
    if (remote) {
      logger.debug(`[TransparentClusterProxy] Executing on remote agent ${agentId} (cluster: ${remote.clusterId})`);
      return remote.client.executeCommand(agentId, command);
    }

    // Agent not found locally, try to find via balancer
    const location = this.balancer.getAgentLocation(agentId);
    if (location) {
      if (location.clusterId === null) {
        const result = await this.localRuntime.exec(agentId, command);
        return { output: result.output, exitCode: result.exitCode };
      } else {
        const client = this.registry.getClient(location.clusterId);
        return client.executeCommand(agentId, command);
      }
    }

    throw new Error(`Agent ${agentId} not found`);
  }

  /**
   * Execute a command with streaming output
   * 
   * @param agentId - Agent ID
   * @param command - Command to execute
   * @param onOutput - Callback for output chunks
   * @returns Promise that resolves when execution completes
   */
  async execStream(
    agentId: string,
    command: string,
    onOutput: (chunk: string, isError: boolean) => void
  ): Promise<ExecResult> {
    // For now, we simulate streaming by executing and calling the callback
    // In a full implementation, this would use the gRPC streaming API
    
    try {
      const result = await this.exec(agentId, command);
      
      if (result.output) {
        // Split output into chunks to simulate streaming
        const chunks = result.output.split('\n');
        for (const chunk of chunks) {
          if (chunk) {
            onOutput(chunk + '\n', result.exitCode !== 0);
          }
        }
      }

      return result;
    } catch (error) {
      onOutput((error as Error).message, true);
      throw error;
    }
  }

  /**
   * Kill/terminate an agent
   * 
   * @param agentId - Agent ID
   */
  async kill(agentId: string): Promise<void> {
    // Check local
    if (this.localAgents.has(agentId)) {
      logger.debug(`[TransparentClusterProxy] Killing local agent ${agentId}`);
      await this.localRuntime.kill(agentId);
      this.localAgents.delete(agentId);
      this.emit('agent:killed', { agentId, timestamp: Date.now() });
      return;
    }

    // Check remote
    const remote = this.remoteAgents.get(agentId);
    if (remote) {
      logger.debug(`[TransparentClusterProxy] Killing remote agent ${agentId}`);
      await remote.client.killAgent(agentId);
      this.remoteAgents.delete(agentId);
      this.emit('agent:killed', { agentId, timestamp: Date.now() });
      return;
    }

    // Try via balancer
    try {
      await this.balancer.killAgent(agentId);
    } catch (error) {
      throw new Error(`Agent ${agentId} not found`);
    }
  }

  /**
   * Get agent status
   * 
   * @param agentId - Agent ID
   * @returns Agent status
   */
  async status(agentId: string): Promise<{
    status: AgentStatus;
    clusterId: string | null;
    startedAt: number;
    lastActivity?: number;
  }> {
    // Check local
    if (this.localAgents.has(agentId)) {
      const agent = this.localAgents.get(agentId)!;
      return {
        status: agent.status,
        clusterId: null,
        startedAt: agent.startedAt,
      };
    }

    // Check remote
    const remote = this.remoteAgents.get(agentId);
    if (remote) {
      const status = await remote.client.getAgentStatus(agentId);
      return {
        status: this.mapStatus(status.status),
        clusterId: remote.clusterId,
        startedAt: status.startedAt,
        lastActivity: status.lastActivity,
      };
    }

    throw new Error(`Agent ${agentId} not found`);
  }

  // ============================================================================
  // Agent Listing
  // ============================================================================

  /**
   * List all agents across all clusters
   * 
   * @param filter - Optional filter options
   * @returns Array of agents with cluster info
   */
  async list(filter?: AgentFilter & { showCluster?: boolean }): Promise<AgentWithCluster[]> {
    const agents: AgentWithCluster[] = [];

    // Get local agents
    const localList = await this.localRuntime.list();
    for (const agent of localList) {
      if (this.matchesFilter(agent, filter)) {
        agents.push({
          ...agent,
          clusterId: null,
          clusterName: 'local',
          region: 'local',
          isLocal: true,
        });
      }
    }

    // Get remote agents from all clusters
    const clusters = this.registry.getActiveClusters();
    const remoteLists = await Promise.allSettled(
      clusters.map(async (cluster) => {
        try {
          const client = this.registry.getClient(cluster.id);
          const clusterAgents = await client.listAgents(
            typeof filter?.status === 'string' ? filter.status : undefined,
            filter?.labels
          );
          return { cluster, agents: clusterAgents };
        } catch (error) {
          logger.warn(`[TransparentClusterProxy] Failed to list agents from cluster ${cluster.id}:`, error);
          return { cluster, agents: [] };
        }
      })
    );

    for (const result of remoteLists) {
      if (result.status === 'fulfilled') {
        const { cluster, agents: clusterAgents } = result.value;
        for (const agent of clusterAgents) {
          if (this.matchesFilter(agent, filter)) {
            agents.push({
              ...agent,
              clusterId: cluster.id,
              clusterName: cluster.name,
              region: cluster.region,
              isLocal: false,
            });
          }
        }
      }
    }

    return agents;
  }

  /**
   * Check if an agent matches the filter
   */
  private matchesFilter(agent: Agent, filter?: AgentFilter): boolean {
    if (!filter) return true;

    // Status filter
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (!statuses.includes(agent.status)) {
        return false;
      }
    }

    // Cluster filter
    if (filter.clusterId !== undefined) {
      if (filter.clusterId === null) {
        // Looking for local agents only
        if (agent.clusterId) return false;
      } else {
        // Looking for specific cluster
        if (agent.clusterId !== filter.clusterId) return false;
      }
    }

    // Label filter
    if (filter.labels) {
      for (const [key, value] of Object.entries(filter.labels)) {
        if (agent.labels[key] !== value) {
          return false;
        }
      }
    }

    // Model filter
    if (filter.model && agent.model !== filter.model) {
      return false;
    }

    return true;
  }

  // ============================================================================
  // Migration
  // ============================================================================

  /**
   * Migrate an agent to a different cluster
   * 
   * @param agentId - Agent ID
   * @param toCluster - Target cluster ID (or 'local')
   * @returns Migration result
   */
  async migrate(agentId: string, toCluster: string): Promise<void> {
    const location = this.balancer.getAgentLocation(agentId);
    
    if (!location) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const fromClusterId = location.clusterId || 'local';

    logger.info(`[TransparentClusterProxy] Migrating agent ${agentId} from ${fromClusterId} to ${toCluster}`);

    await this.balancer.migrateAgent(agentId, fromClusterId, toCluster);

    // Update local tracking
    if (toCluster === 'local') {
      this.remoteAgents.delete(agentId);
      // Agent will be tracked by local runtime
    } else {
      this.localAgents.delete(agentId);
      this.remoteAgents.set(agentId, {
        id: agentId,
        clusterId: toCluster,
        client: this.registry.getClient(toCluster),
      });
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get proxy statistics
   */
  getStats(): {
    trackedLocalAgents: number;
    trackedRemoteAgents: number;
    totalTracked: number;
    registeredClusters: number;
  } {
    return {
      trackedLocalAgents: this.localAgents.size,
      trackedRemoteAgents: this.remoteAgents.size,
      totalTracked: this.localAgents.size + this.remoteAgents.size,
      registeredClusters: this.registry.getClusters().length,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Map status string to AgentStatus
   */
  private mapStatus(status: string): AgentStatus {
    const statusMap: Record<string, AgentStatus> = {
      'pending': 'pending',
      'running': 'running',
      'paused': 'paused',
      'completed': 'completed',
      'failed': 'failed',
      'migrating': 'migrating',
      'terminated': 'terminated',
    };
    return statusMap[status] || 'pending';
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up resources
   */
  dispose(): void {
    this.removeAllListeners();
    this.localAgents.clear();
    this.remoteAgents.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalProxy: TransparentClusterProxy | null = null;

/**
 * Get the global transparent proxy instance
 */
export function getTransparentClusterProxy(
  registry: ClusterRegistry,
  balancer: MultiClusterLoadBalancer,
  localRuntime: LocalRuntime
): TransparentClusterProxy {
  if (!globalProxy) {
    globalProxy = new TransparentClusterProxy(registry, balancer, localRuntime);
  }
  return globalProxy;
}

/**
 * Reset the global transparent proxy instance
 */
export function resetTransparentClusterProxy(): void {
  if (globalProxy) {
    globalProxy.dispose();
    globalProxy = null;
  }
}
