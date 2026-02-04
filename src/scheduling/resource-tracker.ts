/**
 * Resource Tracker
 * 
 * Tracks real-time resource usage of agents using Redis for fast updates.
 * Provides resource allocation, monitoring, and node capacity tracking.
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import {
  ResourceRequirements,
  ResourceUsage,
  NodeCapacity,
  NodeAllocation,
} from './types';
import { logger } from '../utils/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

const RESOURCE_PREFIX = 'dash:scheduler:resources';
const NODE_PREFIX = 'dash:scheduler:nodes';
const AGENT_PREFIX = 'dash:scheduler:agents';
const HEARTBEAT_TTL_SECONDS = 60;

// ============================================================================
// RESOURCE TRACKER CLASS
// ============================================================================

export interface ResourceTrackerConfig {
  /** Redis connection URL */
  redisUrl?: string;
  /** Redis client instance */
  redisClient?: Redis;
  /** Update interval for node resource monitoring (ms) */
  updateIntervalMs?: number;
  /** Enable automatic cleanup of stale nodes */
  enableCleanup?: boolean;
}

export class ResourceTracker extends EventEmitter {
  private redis: Redis;
  private config: Required<Omit<ResourceTrackerConfig, 'redisClient' | 'redisUrl'>> & 
    Pick<ResourceTrackerConfig, 'redisClient' | 'redisUrl'>;
  private updateInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: ResourceTrackerConfig = {}) {
    super();
    
    this.config = {
      updateIntervalMs: 5000,
      enableCleanup: true,
      ...config,
    };

    // Use provided client or create new connection
    if (config.redisClient) {
      this.redis = config.redisClient;
    } else {
      this.redis = new Redis(config.redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379/0');
    }

    this.setupEventHandlers();
    
    if (this.config.enableCleanup) {
      this.startCleanupTask();
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private setupEventHandlers(): void {
    this.redis.on('error', (error) => {
      logger.error('[ResourceTracker] Redis error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Start periodic resource monitoring
   */
  startMonitoring(): void {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(async () => {
      await this.collectResourceMetrics();
    }, this.config.updateIntervalMs);

    logger.info('[ResourceTracker] Started resource monitoring');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Start cleanup task for stale nodes
   */
  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupStaleNodes();
    }, 60000); // Every minute
  }

  // ============================================================================
  // NODE MANAGEMENT
  // ============================================================================

  /**
   * Register a node with its capacity
   */
  async registerNode(capacity: NodeCapacity): Promise<void> {
    const key = `${NODE_PREFIX}:${capacity.nodeId}`;
    const data = {
      ...capacity,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      healthy: true,
    };

    await this.redis.setex(
      key,
      HEARTBEAT_TTL_SECONDS,
      JSON.stringify(data)
    );

    // Initialize empty allocation
    const allocationKey = `${RESOURCE_PREFIX}:node:${capacity.nodeId}`;
    await this.redis.hset(allocationKey, {
      cpu: 0,
      memory: 0,
      gpuMemory: 0,
      gpuCount: 0,
      disk: 0,
      network: 0,
      agents: JSON.stringify([]),
    });

    this.emit('node.registered', { nodeId: capacity.nodeId, capacity });
    logger.info(`[ResourceTracker] Registered node ${capacity.nodeId}`);
  }

  /**
   * Update node heartbeat
   */
  async updateNodeHeartbeat(nodeId: string, healthy: boolean = true): Promise<void> {
    const key = `${NODE_PREFIX}:${nodeId}`;
    const exists = await this.redis.exists(key);
    
    if (!exists) {
      logger.warn(`[ResourceTracker] Heartbeat for unknown node: ${nodeId}`);
      return;
    }

    const data = await this.redis.get(key);
    if (data) {
      const nodeData = JSON.parse(data);
      nodeData.lastHeartbeat = Date.now();
      nodeData.healthy = healthy;
      
      await this.redis.setex(key, HEARTBEAT_TTL_SECONDS, JSON.stringify(nodeData));
    }

    this.emit('node.heartbeat', { nodeId, healthy });
  }

  /**
   * Get all registered nodes
   */
  async getNodes(): Promise<NodeCapacity[]> {
    const keys = await this.redis.keys(`${NODE_PREFIX}:*`);
    const nodes: NodeCapacity[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        nodes.push({
          nodeId: parsed.nodeId,
          labels: parsed.labels || {},
          cpu: parsed.cpu,
          memory: parsed.memory,
          gpuMemory: parsed.gpuMemory,
          gpuCount: parsed.gpuCount,
          disk: parsed.disk,
          network: parsed.network,
          custom: parsed.custom,
        });
      }
    }

    return nodes;
  }

  /**
   * Get node allocation state
   */
  async getNodeAllocation(nodeId: string): Promise<NodeAllocation | null> {
    const nodeKey = `${NODE_PREFIX}:${nodeId}`;
    const allocationKey = `${RESOURCE_PREFIX}:node:${nodeId}`;

    const [nodeData, allocationData] = await Promise.all([
      this.redis.get(nodeKey),
      this.redis.hgetall(allocationKey),
    ]);

    if (!nodeData) return null;

    const node = JSON.parse(nodeData);
    const agents = allocationData.agents ? JSON.parse(allocationData.agents) : [];

    return {
      capacity: {
        nodeId: node.nodeId,
        labels: node.labels || {},
        cpu: node.cpu,
        memory: node.memory,
        gpuMemory: node.gpuMemory,
        gpuCount: node.gpuCount,
        disk: node.disk,
        network: node.network,
        custom: node.custom,
      },
      allocated: {
        cpu: parseFloat(allocationData.cpu || '0'),
        memory: parseFloat(allocationData.memory || '0'),
        gpuMemory: parseFloat(allocationData.gpuMemory || '0'),
        gpuCount: parseInt(allocationData.gpuCount || '0', 10),
        disk: parseFloat(allocationData.disk || '0'),
        network: parseFloat(allocationData.network || '0'),
      },
      agents,
      lastHeartbeat: new Date(node.lastHeartbeat),
      healthy: node.healthy !== false,
    };
  }

  /**
   * Get all node allocations
   */
  async getAllNodeAllocations(): Promise<NodeAllocation[]> {
    const nodes = await this.getNodes();
    const allocations: NodeAllocation[] = [];

    for (const node of nodes) {
      const allocation = await this.getNodeAllocation(node.nodeId);
      if (allocation) {
        allocations.push(allocation);
      }
    }

    return allocations;
  }

  /**
   * Remove a node
   */
  async removeNode(nodeId: string): Promise<void> {
    const nodeKey = `${NODE_PREFIX}:${nodeId}`;
    const allocationKey = `${RESOURCE_PREFIX}:node:${nodeId}`;

    await this.redis.del(nodeKey, allocationKey);
    
    this.emit('node.removed', { nodeId });
    logger.info(`[ResourceTracker] Removed node ${nodeId}`);
  }

  /**
   * Clean up stale nodes (no heartbeat for >60s)
   */
  async cleanupStaleNodes(): Promise<string[]> {
    const nodes = await this.getNodes();
    const staleNodes: string[] = [];
    const now = Date.now();

    for (const node of nodes) {
      const nodeKey = `${NODE_PREFIX}:${node.nodeId}`;
      const data = await this.redis.get(nodeKey);
      
      if (data) {
        const parsed = JSON.parse(data);
        const lastHeartbeat = parsed.lastHeartbeat || 0;
        
        if (now - lastHeartbeat > HEARTBEAT_TTL_SECONDS * 1000) {
          staleNodes.push(node.nodeId);
          await this.removeNode(node.nodeId);
        }
      }
    }

    if (staleNodes.length > 0) {
      logger.info(`[ResourceTracker] Cleaned up ${staleNodes.length} stale nodes`);
    }

    return staleNodes;
  }

  // ============================================================================
  // RESOURCE ALLOCATION
  // ============================================================================

  /**
   * Allocate resources for an agent on a node
   */
  async allocateResources(
    agentId: string,
    nodeId: string,
    resources: ResourceRequirements
  ): Promise<boolean> {
    const allocationKey = `${RESOURCE_PREFIX}:node:${nodeId}`;
    const agentKey = `${AGENT_PREFIX}:${agentId}`;

    // Get current allocation
    const currentData = await this.redis.hgetall(allocationKey);
    if (!currentData || Object.keys(currentData).length === 0) {
      logger.error(`[ResourceTracker] Node ${nodeId} not found for allocation`);
      return false;
    }

    const current: ResourceRequirements = {
      cpu: parseFloat(currentData.cpu || '0'),
      memory: parseFloat(currentData.memory || '0'),
      gpuMemory: parseFloat(currentData.gpuMemory || '0'),
      gpuCount: parseInt(currentData.gpuCount || '0', 10),
      disk: parseFloat(currentData.disk || '0'),
      network: parseFloat(currentData.network || '0'),
    };

    // Check node capacity
    const node = await this.getNodeAllocation(nodeId);
    if (!node) {
      logger.error(`[ResourceTracker] Cannot allocate: node ${nodeId} not found`);
      return false;
    }

    // Verify resources are available
    if (current.cpu + resources.cpu > node.capacity.cpu) {
      logger.warn(`[ResourceTracker] CPU allocation would exceed capacity on ${nodeId}`);
      return false;
    }
    if (current.memory + resources.memory > node.capacity.memory) {
      logger.warn(`[ResourceTracker] Memory allocation would exceed capacity on ${nodeId}`);
      return false;
    }

    // Update allocation using Redis transaction for atomicity
    const agents = currentData.agents ? JSON.parse(currentData.agents) : [];
    agents.push(agentId);

    const pipeline = this.redis.pipeline();
    pipeline.hincrbyfloat(allocationKey, 'cpu', resources.cpu);
    pipeline.hincrbyfloat(allocationKey, 'memory', resources.memory);
    if (resources.gpuMemory) pipeline.hincrbyfloat(allocationKey, 'gpuMemory', resources.gpuMemory);
    if (resources.gpuCount) pipeline.hincrby(allocationKey, 'gpuCount', resources.gpuCount);
    if (resources.disk) pipeline.hincrbyfloat(allocationKey, 'disk', resources.disk);
    if (resources.network) pipeline.hincrbyfloat(allocationKey, 'network', resources.network);
    pipeline.hset(allocationKey, 'agents', JSON.stringify(agents));
    
    // Store agent resource assignment
    pipeline.hset(agentKey, {
      nodeId,
      cpu: resources.cpu,
      memory: resources.memory,
      gpuMemory: resources.gpuMemory || 0,
      gpuCount: resources.gpuCount || 0,
      allocatedAt: Date.now(),
    });

    await pipeline.exec();

    this.emit('resources.allocated', { agentId, nodeId, resources });
    logger.info(`[ResourceTracker] Allocated resources for ${agentId} on ${nodeId}`);
    
    return true;
  }

  /**
   * Release resources for an agent
   */
  async releaseResources(agentId: string): Promise<void> {
    const agentKey = `${AGENT_PREFIX}:${agentId}`;
    const agentData = await this.redis.hgetall(agentKey);

    if (!agentData || !agentData.nodeId) {
      logger.warn(`[ResourceTracker] No resource allocation found for ${agentId}`);
      return;
    }

    const nodeId = agentData.nodeId;
    const allocationKey = `${RESOURCE_PREFIX}:node:${nodeId}`;
    const nodeData = await this.redis.hgetall(allocationKey);

    if (!nodeData) {
      logger.warn(`[ResourceTracker] Node ${nodeId} not found for resource release`);
      await this.redis.del(agentKey);
      return;
    }

    // Update node allocation
    const agents = nodeData.agents ? JSON.parse(nodeData.agents) : [];
    const updatedAgents = agents.filter((id: string) => id !== agentId);

    const pipeline = this.redis.pipeline();
    pipeline.hincrbyfloat(allocationKey, 'cpu', -parseFloat(agentData.cpu || '0'));
    pipeline.hincrbyfloat(allocationKey, 'memory', -parseFloat(agentData.memory || '0'));
    pipeline.hincrbyfloat(allocationKey, 'gpuMemory', -parseFloat(agentData.gpuMemory || '0'));
    pipeline.hincrby(allocationKey, 'gpuCount', -parseInt(agentData.gpuCount || '0', 10));
    pipeline.hset(allocationKey, 'agents', JSON.stringify(updatedAgents));
    pipeline.del(agentKey);

    await pipeline.exec();

    this.emit('resources.released', { agentId, nodeId });
    logger.info(`[ResourceTracker] Released resources for ${agentId} from ${nodeId}`);
  }

  /**
   * Get resources allocated to an agent
   */
  async getAgentResources(agentId: string): Promise<(ResourceRequirements & { nodeId: string }) | null> {
    const agentKey = `${AGENT_PREFIX}:${agentId}`;
    const data = await this.redis.hgetall(agentKey);

    if (!data || !data.nodeId) return null;

    return {
      nodeId: data.nodeId,
      cpu: parseFloat(data.cpu || '0'),
      memory: parseFloat(data.memory || '0'),
      gpuMemory: parseFloat(data.gpuMemory || '0'),
      gpuCount: parseInt(data.gpuCount || '0', 10),
    };
  }

  /**
   * Update resource usage for an agent
   */
  async updateResourceUsage(agentId: string, usage: ResourceUsage): Promise<void> {
    const agentKey = `${AGENT_PREFIX}:${agentId}`;
    const usageKey = `${RESOURCE_PREFIX}:usage:${agentId}`;

    await this.redis.hset(usageKey, {
      cpu: usage.cpu,
      memory: usage.memory,
      gpuMemory: usage.gpuMemory || 0,
      timestamp: usage.timestamp.getTime(),
    });

    // Set expiration on usage data (keep for 1 hour)
    await this.redis.expire(usageKey, 3600);

    this.emit('resource.usage_updated', { agentId, usage });
  }

  /**
   * Get current resource usage for an agent
   */
  async getResourceUsage(agentId: string): Promise<ResourceUsage | null> {
    const usageKey = `${RESOURCE_PREFIX}:usage:${agentId}`;
    const data = await this.redis.hgetall(usageKey);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      cpu: parseFloat(data.cpu || '0'),
      memory: parseFloat(data.memory || '0'),
      gpuMemory: parseFloat(data.gpuMemory || '0'),
      timestamp: new Date(parseInt(data.timestamp || '0', 10)),
    };
  }

  // ============================================================================
  // RESOURCE UTILIZATION
  // ============================================================================

  /**
   * Calculate resource utilization for a node
   */
  async getNodeUtilization(nodeId: string): Promise<{ cpu: number; memory: number; overall: number } | null> {
    const allocation = await this.getNodeAllocation(nodeId);
    if (!allocation) return null;

    const cpuUtil = allocation.allocated.cpu / allocation.capacity.cpu;
    const memoryUtil = allocation.allocated.memory / allocation.capacity.memory;
    
    // Overall is weighted average (can be customized)
    const overall = (cpuUtil * 0.6) + (memoryUtil * 0.4);

    return {
      cpu: cpuUtil,
      memory: memoryUtil,
      overall,
    };
  }

  /**
   * Get resource utilization across all nodes
   */
  async getClusterUtilization(): Promise<{
    nodes: Record<string, { cpu: number; memory: number; overall: number }>;
    average: { cpu: number; memory: number; overall: number };
  }> {
    const nodes = await this.getNodes();
    const utilizations: Record<string, { cpu: number; memory: number; overall: number }> = {};
    
    let totalCpu = 0;
    let totalMemory = 0;
    let totalOverall = 0;

    for (const node of nodes) {
      const util = await this.getNodeUtilization(node.nodeId);
      if (util) {
        utilizations[node.nodeId] = util;
        totalCpu += util.cpu;
        totalMemory += util.memory;
        totalOverall += util.overall;
      }
    }

    const count = nodes.length || 1;

    return {
      nodes: utilizations,
      average: {
        cpu: totalCpu / count,
        memory: totalMemory / count,
        overall: totalOverall / count,
      },
    };
  }

  /**
   * Check if a node has available resources
   */
  async hasAvailableResources(
    nodeId: string,
    requirements: ResourceRequirements
  ): Promise<boolean> {
    const allocation = await this.getNodeAllocation(nodeId);
    if (!allocation) return false;

    const availableCpu = allocation.capacity.cpu - allocation.allocated.cpu;
    const availableMemory = allocation.capacity.memory - allocation.allocated.memory;

    if (availableCpu < requirements.cpu) return false;
    if (availableMemory < requirements.memory) return false;

    if (requirements.gpuMemory && allocation.capacity.gpuMemory) {
      const availableGpuMemory = allocation.capacity.gpuMemory - (allocation.allocated.gpuMemory || 0);
      if (availableGpuMemory < requirements.gpuMemory) return false;
    }

    if (requirements.gpuCount && allocation.capacity.gpuCount) {
      const availableGpuCount = allocation.capacity.gpuCount - (allocation.allocated.gpuCount || 0);
      if (availableGpuCount < requirements.gpuCount) return false;
    }

    return true;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async collectResourceMetrics(): Promise<void> {
    const utilization = await this.getClusterUtilization();
    this.emit('metrics.collected', utilization);
  }

  /**
   * Gracefully shutdown the resource tracker
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();
    
    if (!this.config.redisClient) {
      await this.redis.quit();
    }

    logger.info('[ResourceTracker] Shut down gracefully');
  }
}

export default ResourceTracker;
