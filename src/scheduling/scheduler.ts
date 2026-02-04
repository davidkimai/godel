/**
 * Advanced Scheduler
 * 
 * Main scheduling engine that combines resource tracking, affinity rules,
 * preemption, and bin-packing for efficient agent placement.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import {
  SchedulingRequest,
  SchedulingResult,
  SchedulingPolicy,
  ResourceRequirements,
  NodeAllocation,
  PriorityClass,
  AgentPriority,
  SchedulingEvent,
  SchedulingEventType,
  NodeCapacity,
} from './types';
import { ResourceTracker } from './resource-tracker';
import { AffinityEngine, AffinityScore } from './affinity-engine';
import { PreemptionSystem, PreemptionRequest } from './preemption-system';
import { logger } from '../utils/logger';

// ============================================================================
// SCHEDULER CONFIG
// ============================================================================

export interface SchedulerConfig {
  /** PostgreSQL pool for persistence */
  pgPool?: Pool;
  /** Resource tracker instance */
  resourceTracker?: ResourceTracker;
  /** Affinity engine instance */
  affinityEngine?: AffinityEngine;
  /** Preemption system instance */
  preemptionSystem?: PreemptionSystem;
  /** Scheduling policy */
  policy?: SchedulingPolicy;
  /** Enable scheduling history logging */
  enableHistory?: boolean;
  /** Max scheduling attempts per request */
  maxAttempts?: number;
  /** Scheduling timeout (ms) */
  timeoutMs?: number;
}

// ============================================================================
// SCHEDULER CLASS
// ============================================================================

export class Scheduler extends EventEmitter {
  private config: Required<Omit<SchedulerConfig, 'pgPool' | 'resourceTracker' | 'affinityEngine' | 'preemptionSystem'>> &
    Pick<SchedulerConfig, 'pgPool' | 'resourceTracker' | 'affinityEngine' | 'preemptionSystem'>;
  
  private resourceTracker: ResourceTracker;
  private affinityEngine: AffinityEngine;
  private preemptionSystem: PreemptionSystem;
  private agentPriorities: Map<string, AgentPriority> = new Map();
  private schedulingHistory: Array<{
    timestamp: Date;
    agentId: string;
    result: SchedulingResult;
  }> = [];
  private metrics = {
    schedulingAttempts: 0,
    schedulingSuccesses: 0,
    schedulingFailures: 0,
    totalLatencyMs: 0,
    preemptionCount: 0,
    affinityViolations: 0,
  };

  constructor(config: SchedulerConfig = {}) {
    super();

    this.config = {
      policy: {
        binPackingStrategy: 'bestFit',
        enablePreemption: true,
        defaultPriorityClass: PriorityClass.NORMAL,
      },
      enableHistory: true,
      maxAttempts: 3,
      timeoutMs: 30000,
      ...config,
    };

    // Initialize or use provided components
    this.resourceTracker = config.resourceTracker || new ResourceTracker();
    this.affinityEngine = config.affinityEngine || new AffinityEngine();
    this.preemptionSystem = config.preemptionSystem || new PreemptionSystem(this.resourceTracker);

    this.setupEventHandlers();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private setupEventHandlers(): void {
    // Forward events from subsystems
    this.resourceTracker.on('resources.allocated', (data) => {
      this.emit('scheduling.resources_allocated', data);
    });

    this.preemptionSystem.on('agent.preempted', (data) => {
      this.emit('scheduling.preempted', data);
    });
  }

  /**
   * Initialize the scheduler
   */
  async initialize(): Promise<void> {
    // Ensure resource tracker is ready
    this.resourceTracker.startMonitoring();
    
    logger.info('[Scheduler] Initialized');
  }

  /**
   * Shutdown the scheduler
   */
  async shutdown(): Promise<void> {
    this.resourceTracker.stopMonitoring();
    await this.resourceTracker.shutdown();
    
    logger.info('[Scheduler] Shut down');
  }

  // ============================================================================
  // NODE MANAGEMENT
  // ============================================================================

  /**
   * Register a node for scheduling
   */
  async registerNode(capacity: NodeCapacity): Promise<void> {
    await this.resourceTracker.registerNode(capacity);
    this.emit('node.registered', capacity);
  }

  /**
   * Unregister a node
   */
  async unregisterNode(nodeId: string): Promise<void> {
    await this.resourceTracker.removeNode(nodeId);
    this.emit('node.unregistered', { nodeId });
  }

  /**
   * Get all available nodes
   */
  async getNodes(): Promise<NodeAllocation[]> {
    return this.resourceTracker.getAllNodeAllocations();
  }

  /**
   * Update node heartbeat
   */
  async updateNodeHeartbeat(nodeId: string, healthy: boolean = true): Promise<void> {
    await this.resourceTracker.updateNodeHeartbeat(nodeId, healthy);
  }

  // ============================================================================
  // SCHEDULING
  // ============================================================================

  /**
   * Schedule an agent onto a node
   */
  async schedule(request: SchedulingRequest): Promise<SchedulingResult> {
    const startTime = Date.now();
    this.metrics.schedulingAttempts++;

    // Store agent priority
    const priority = request.priority || {
      priorityClass: this.config.policy.defaultPriorityClass,
      preemptionPolicy: 'PreemptLowerPriority',
    };
    this.agentPriorities.set(request.agent.id, priority);

    // Emit scheduling requested event
    this.emitSchedulingEvent('scheduling.requested', request.agent.id, {
      resources: request.resources,
      priority,
    });

    try {
      const result = await this.performScheduling(request);
      
      // Update metrics
      const latency = Date.now() - startTime;
      this.metrics.totalLatencyMs += latency;
      
      if (result.success) {
        this.metrics.schedulingSuccesses++;
        this.emitSchedulingEvent('scheduling.succeeded', request.agent.id, {
          nodeId: result.nodeId,
          latency,
        });
      } else {
        this.metrics.schedulingFailures++;
        this.emitSchedulingEvent('scheduling.failed', request.agent.id, {
          error: result.error,
          latency,
        });
      }

      // Store in history
      if (this.config.enableHistory) {
        this.schedulingHistory.push({
          timestamp: new Date(),
          agentId: request.agent.id,
          result,
        });
      }

      // Persist to database if configured
      if (this.config.pgPool) {
        await this.persistSchedulingResult(request, result);
      }

      return result;
    } catch (error) {
      this.metrics.schedulingFailures++;
      
      const result: SchedulingResult = {
        success: false,
        agentId: request.agent.id,
        scheduledAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.emitSchedulingEvent('scheduling.failed', request.agent.id, {
        error: result.error,
      });

      return result;
    }
  }

  private async performScheduling(request: SchedulingRequest): Promise<SchedulingResult> {
    const { agent, resources, affinity, preferredNodes } = request;

    // Get all nodes
    let nodes = await this.getNodes();
    
    // Filter healthy nodes
    nodes = nodes.filter((n) => n.healthy);
    
    if (nodes.length === 0) {
      return {
        success: false,
        agentId: agent.id,
        scheduledAt: new Date(),
        error: 'No healthy nodes available',
      };
    }

    // Filter by preferred nodes if specified
    if (preferredNodes && preferredNodes.length > 0) {
      nodes = nodes.filter((n) => preferredNodes.includes(n.capacity.nodeId));
      
      if (nodes.length === 0) {
        return {
          success: false,
          agentId: agent.id,
          scheduledAt: new Date(),
          error: 'No preferred nodes available',
        };
      }
    }

    // Rank nodes by affinity
    const agentLabels = agent.metadata?.["labels"] as Record<string, string> || {};
    const rankedNodes = this.affinityEngine.rankNodes(agentLabels, nodes, affinity);

    // Try to schedule on ranked nodes
    for (const { node, score } of rankedNodes) {
      // Check resource availability
      const hasResources = await this.resourceTracker.hasAvailableResources(
        node.capacity.nodeId,
        resources
      );

      if (hasResources) {
        // Schedule on this node
        return await this.assignToNode(agent.id, node, resources, score);
      }
    }

    // No node has available resources - try preemption if enabled
    if (this.config.policy['enablePreemption'] && this.preemptionSystem.isEnabled()) {
      const priority = this.agentPriorities.get(agent.id) || {
        priorityClass: this.config.policy.defaultPriorityClass,
        preemptionPolicy: 'PreemptLowerPriority',
      };

      const preemptRequest: PreemptionRequest = {
        agentId: agent.id,
        priority,
        resources,
        preferredNodeId: preferredNodes?.[0],
      };

      const preemptResult = await this.preemptionSystem.preemptForResources(
        preemptRequest,
        nodes,
        this.agentPriorities
      );

      if (preemptResult.success) {
        this.metrics.preemptionCount += preemptResult.preemptedAgents.length;
        
        // Try scheduling again after preemption
        nodes = await this.getNodes();
        nodes = nodes.filter((n) => n.healthy);

        for (const { node, score } of rankedNodes) {
          const hasResources = await this.resourceTracker.hasAvailableResources(
            node.capacity.nodeId,
            resources
          );

          if (hasResources) {
            const result = await this.assignToNode(agent.id, node, resources, score);
            result.preemptedAgents = preemptResult.preemptedAgents.map((p) => p.agentId);
            return result;
          }
        }
      }
    }

    // Scheduling failed
    return {
      success: false,
      agentId: agent.id,
      scheduledAt: new Date(),
      error: 'Insufficient resources available on any node',
    };
  }

  private async assignToNode(
    agentId: string,
    node: NodeAllocation,
    resources: ResourceRequirements,
    affinityScore: AffinityScore
  ): Promise<SchedulingResult> {
    // Allocate resources
    const allocated = await this.resourceTracker.allocateResources(
      agentId,
      node.capacity.nodeId,
      resources
    );

    if (!allocated) {
      return {
        success: false,
        agentId,
        scheduledAt: new Date(),
        error: 'Failed to allocate resources',
      };
    }

    // Check for affinity violations
    if (!affinityScore.hardConstraintsSatisfied) {
      this.metrics.affinityViolations++;
      logger.warn(`[Scheduler] Affinity violation for ${agentId}`);
    }

    return {
      success: true,
      agentId,
      nodeId: node.capacity.nodeId,
      scheduledAt: new Date(),
      allocatedResources: resources,
      affinityScore: affinityScore.totalScore,
    };
  }

  /**
   * Unschedule an agent and release resources
   */
  async unschedule(agentId: string): Promise<void> {
    await this.resourceTracker.releaseResources(agentId);
    this.agentPriorities.delete(agentId);
    
    this.emitSchedulingEvent('scheduling.unscheduled', agentId, {});
    logger.info(`[Scheduler] Unscheduled ${agentId}`);
  }

  /**
   * Reschedule a preempted agent
   */
  async reschedule(agentId: string, request: Partial<SchedulingRequest>): Promise<SchedulingResult> {
    // Check if agent was preempted
    if (!this.preemptionSystem.isPreempted(agentId)) {
      return {
        success: false,
        agentId,
        scheduledAt: new Date(),
        error: 'Agent was not preempted',
      };
    }

    // Resume from checkpoint
    const resumeResult = await this.preemptionSystem.resumeFromCheckpoint(agentId);
    
    if (!resumeResult.success) {
      return {
        success: false,
        agentId,
        scheduledAt: new Date(),
        error: resumeResult.error || 'Failed to resume from checkpoint',
      };
    }

    // Re-schedule the agent
    if (request.agent && request.resources) {
      const result = await this.schedule(request as SchedulingRequest);
      
      if (result.success) {
        this.emitSchedulingEvent('scheduling.resumed', agentId, {
          nodeId: result.nodeId,
        });
      }
      
      return result;
    }

    return {
      success: true,
      agentId,
      scheduledAt: new Date(),
      error: 'Agent resumed but not rescheduled (insufficient request data)',
    };
  }

  // ============================================================================
  // BIN PACKING STRATEGIES
  // ============================================================================

  /**
   * Select best node based on bin packing strategy
   */
  async selectNodeForBinPacking(
    resources: ResourceRequirements,
    nodes: NodeAllocation[]
  ): Promise<NodeAllocation | null> {
    const strategy = this.config.policy['binPackingStrategy'];
    
    // Filter nodes that can fit the resources
    const candidates: Array<{ node: NodeAllocation; score: number }> = [];

    for (const node of nodes) {
      const hasResources = await this.resourceTracker.hasAvailableResources(
        node.capacity.nodeId,
        resources
      );

      if (hasResources) {
        const utilization = await this.resourceTracker.getNodeUtilization(node.capacity.nodeId);
        
        if (utilization) {
          candidates.push({ node, score: utilization.overall });
        }
      }
    }

    if (candidates.length === 0) return null;

    switch (strategy) {
      case 'bestFit':
        // Select node with highest utilization that can still fit
        // This minimizes fragmentation
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].node;

      case 'firstFit':
        // Select first node that can fit
        return candidates[0].node;

      case 'worstFit':
        // Select node with lowest utilization
        candidates.sort((a, b) => a.score - b.score);
        return candidates[0].node;

      case 'spread':
        // Select node with lowest number of agents
        candidates.sort((a, b) => a.node["agents"].length - b.node["agents"].length);
        return candidates[0].node;

      default:
        return candidates[0].node;
    }
  }

  // ============================================================================
  // METRICS & HISTORY
  // ============================================================================

  /**
   * Get scheduling metrics
   */
  getMetrics(): typeof this.metrics & {
    averageLatencyMs: number;
    successRate: number;
    clusterUtilization: ReturnType<ResourceTracker['getClusterUtilization']>;
  } {
    const avgLatency = this.metrics.schedulingAttempts > 0
      ? this.metrics.totalLatencyMs / this.metrics.schedulingAttempts
      : 0;

    const successRate = this.metrics.schedulingAttempts > 0
      ? this.metrics.schedulingSuccesses / this.metrics.schedulingAttempts
      : 0;

    return {
      ...this.metrics,
      averageLatencyMs: avgLatency,
      successRate,
      clusterUtilization: this.resourceTracker.getClusterUtilization(),
    };
  }

  /**
   * Get scheduling history
   */
  getHistory(limit: number = 100): typeof this.schedulingHistory {
    return this.schedulingHistory.slice(-limit);
  }

  /**
   * Clear scheduling history
   */
  clearHistory(): void {
    this.schedulingHistory = [];
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      schedulingAttempts: 0,
      schedulingSuccesses: 0,
      schedulingFailures: 0,
      totalLatencyMs: 0,
      preemptionCount: 0,
      affinityViolations: 0,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private emitSchedulingEvent(
    type: SchedulingEventType,
    agentId: string,
    payload: Record<string, unknown>
  ): void {
    const event: SchedulingEvent = {
      type,
      timestamp: new Date(),
      agentId,
      payload,
    };

    this.emit('scheduling.event', event);
    this.emit(type, event);
  }

  private async persistSchedulingResult(
    request: SchedulingRequest,
    result: SchedulingResult
  ): Promise<void> {
    if (!this.config.pgPool) return;

    try {
      await this.config.pgPool.query(
        `INSERT INTO scheduling_history (
          agent_id, swarm_id, node_id, success, error_message,
          cpu_requested, memory_requested, scheduled_at, affinity_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          request.agent.id,
          request.agent.swarmId || null,
          result.nodeId || null,
          result.success,
          result.error || null,
          request.resources.cpu,
          request.resources.memory,
          result.scheduledAt,
          result.affinityScore || null,
        ]
      );
    } catch (error) {
      logger.error('[Scheduler] Failed to persist scheduling result:', error);
    }
  }

  // ============================================================================
  // ACCESSORS
  // ============================================================================

  /**
   * Get the resource tracker
   */
  getResourceTracker(): ResourceTracker {
    return this.resourceTracker;
  }

  /**
   * Get the affinity engine
   */
  getAffinityEngine(): AffinityEngine {
    return this.affinityEngine;
  }

  /**
   * Get the preemption system
   */
  getPreemptionSystem(): PreemptionSystem {
    return this.preemptionSystem;
  }
}

export default Scheduler;
