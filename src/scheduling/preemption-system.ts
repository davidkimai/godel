/**
 * Preemption System
 * 
 * Handles priority-based preemption of agents.
 * Low priority agents can be preempted to make room for higher priority agents.
 * Supports checkpointing and graceful shutdown.
 */

import { EventEmitter } from 'events';
import {
  PriorityClass,
  AgentPriority,
  PreemptionCandidate,
  ResourceRequirements,
  NodeAllocation,
  AgentCheckpoint,
} from './types';
import { ResourceTracker } from './resource-tracker';
import { logger } from '../utils/logger';

// ============================================================================
// PREEMPTION CONFIG
// ============================================================================

export interface PreemptionConfig {
  /** Enable preemption */
  enabled: boolean;
  /** Grace period for graceful shutdown (ms) */
  gracePeriodMs: number;
  /** Maximum number of agents to preempt at once */
  maxPreemptionsPerRequest: number;
  /** Minimum priority difference required for preemption */
  minPriorityDifference: number;
  /** Enable checkpointing before preemption */
  enableCheckpointing: boolean;
  /** Checkpoint timeout (ms) */
  checkpointTimeoutMs: number;
}

// ============================================================================
// PREEMPTION SYSTEM CLASS
// ============================================================================

export interface PreemptionRequest {
  /** Requesting agent ID */
  agentId: string;
  /** Priority of the requesting agent */
  priority: AgentPriority;
  /** Resources needed */
  resources: ResourceRequirements;
  /** Preferred node (optional) */
  preferredNodeId?: string;
}

export interface PreemptionResult {
  /** Whether preemption was successful */
  success: boolean;
  /** Agents that were preempted */
  preemptedAgents: PreemptedAgent[];
  /** Total resources freed */
  freedResources: ResourceRequirements;
  /** Error message if failed */
  error?: string;
}

export interface PreemptedAgent {
  /** Agent ID */
  agentId: string;
  /** Node where agent was running */
  nodeId: string;
  /** Resources that were freed */
  resources: ResourceRequirements;
  /** Whether checkpoint was created */
  checkpointCreated: boolean;
  /** Checkpoint ID if created */
  checkpointId?: string;
  /** Preemption timestamp */
  preemptedAt: Date;
}

export class PreemptionSystem extends EventEmitter {
  private config: PreemptionConfig;
  private resourceTracker: ResourceTracker;
  private checkpoints: Map<string, AgentCheckpoint> = new Map();
  private preemptedAgents: Map<string, PreemptedAgent> = new Map();

  constructor(
    resourceTracker: ResourceTracker,
    config: Partial<PreemptionConfig> = {}
  ) {
    super();
    
    this.resourceTracker = resourceTracker;
    this.config = {
      enabled: true,
      gracePeriodMs: 30000,
      maxPreemptionsPerRequest: 3,
      minPriorityDifference: 100,
      enableCheckpointing: true,
      checkpointTimeoutMs: 10000,
      ...config,
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Check if preemption is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Find preemption candidates on a node
   */
  async findPreemptionCandidates(
    nodeId: string,
    requestPriority: AgentPriority,
    agentPriorities: Map<string, AgentPriority>
  ): Promise<PreemptionCandidate[]> {
    if (!this.config.enabled) {
      return [];
    }

    const allocation = await this.resourceTracker.getNodeAllocation(nodeId);
    if (!allocation) {
      return [];
    }

    const candidates: PreemptionCandidate[] = [];

    for (const agentId of allocation.agents) {
      const agentPriority = agentPriorities.get(agentId);
      
      if (!agentPriority) {
        continue; // Skip agents without priority info
      }

      // Check if this agent can be preempted
      if (!this.canPreempt(requestPriority, agentPriority)) {
        continue;
      }

      const resources = await this.resourceTracker.getAgentResources(agentId);
      if (!resources) {
        continue;
      }

      candidates.push({
        agentId,
        priority: agentPriority.priorityClass,
        resources: {
          cpu: resources.cpu,
          memory: resources.memory,
          gpuMemory: resources.gpuMemory,
          gpuCount: resources.gpuCount,
        },
        nodeId,
        hasCheckpoint: this.checkpoints.has(agentId),
      });
    }

    // Sort by priority (lowest first) to preempt lowest priority agents
    return candidates.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Attempt to preempt agents to free resources
   */
  async preemptForResources(
    request: PreemptionRequest,
    nodes: NodeAllocation[],
    agentPriorities: Map<string, AgentPriority>
  ): Promise<PreemptionResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        preemptedAgents: [],
        freedResources: { cpu: 0, memory: 0 },
        error: 'Preemption is disabled',
      };
    }

    // Check if preemption policy allows it
    if (request.priority.preemptionPolicy === 'Never') {
      return {
        success: false,
        preemptedAgents: [],
        freedResources: { cpu: 0, memory: 0 },
        error: 'Agent has Never preemption policy',
      };
    }

    const targetNodes = request.preferredNodeId
      ? nodes.filter((n) => n.capacity.nodeId === request.preferredNodeId)
      : nodes;

    let allCandidates: PreemptionCandidate[] = [];

    // Collect candidates from all target nodes
    for (const node of targetNodes) {
      const candidates = await this.findPreemptionCandidates(
        node.capacity.nodeId,
        request.priority,
        agentPriorities
      );
      allCandidates.push(...candidates);
    }

    // Sort by priority (lowest first)
    allCandidates.sort((a, b) => a.priority - b.priority);

    // Select candidates until we have enough resources
    const selected: PreemptionCandidate[] = [];
    const freedResources: ResourceRequirements = { cpu: 0, memory: 0 };

    for (const candidate of allCandidates) {
      if (selected.length >= this.config.maxPreemptionsPerRequest) {
        break;
      }

      selected.push(candidate);
      freedResources.cpu += candidate.resources.cpu;
      freedResources.memory += candidate.resources.memory;
      
      if (candidate.resources.gpuMemory) {
        freedResources.gpuMemory = (freedResources.gpuMemory || 0) + candidate.resources.gpuMemory;
      }
      if (candidate.resources.gpuCount) {
        freedResources.gpuCount = (freedResources.gpuCount || 0) + candidate.resources.gpuCount;
      }

      // Check if we have enough resources
      if (
        freedResources.cpu >= request.resources.cpu &&
        freedResources.memory >= request.resources.memory
      ) {
        break;
      }
    }

    // Check if we freed enough resources
    if (
      freedResources.cpu < request.resources.cpu ||
      freedResources.memory < request.resources.memory
    ) {
      return {
        success: false,
        preemptedAgents: [],
        freedResources: { cpu: 0, memory: 0 },
        error: 'Insufficient resources available even with preemption',
      };
    }

    // Execute preemption
    const preemptedAgents: PreemptedAgent[] = [];

    for (const candidate of selected) {
      try {
        const result = await this.preemptAgent(candidate, request.agentId);
        if (result) {
          preemptedAgents.push(result);
        }
      } catch (error) {
        logger.error(`[PreemptionSystem] Failed to preempt ${candidate.agentId}:`, error);
      }
    }

    logger.info(
      `[PreemptionSystem] Preempted ${preemptedAgents.length} agents for ${request.agentId}`
    );

    return {
      success: preemptedAgents.length > 0,
      preemptedAgents,
      freedResources,
    };
  }

  /**
   * Create a checkpoint for an agent before preemption
   */
  async createCheckpoint(
    agentId: string,
    state: Record<string, unknown>,
    progress: number
  ): Promise<AgentCheckpoint> {
    const checkpoint: AgentCheckpoint = {
      agentId,
      timestamp: new Date(),
      state,
      resourceUsage: {
        cpu: 0,
        memory: 0,
        timestamp: new Date(),
      },
      progress,
    };

    // Get current resource usage
    const usage = await this.resourceTracker.getResourceUsage(agentId);
    if (usage) {
      checkpoint.resourceUsage = usage;
    }

    this.checkpoints.set(agentId, checkpoint);
    
    this.emit('checkpoint.created', { agentId, checkpoint });
    logger.info(`[PreemptionSystem] Created checkpoint for ${agentId}`);

    return checkpoint;
  }

  /**
   * Get checkpoint for an agent
   */
  getCheckpoint(agentId: string): AgentCheckpoint | undefined {
    return this.checkpoints.get(agentId);
  }

  /**
   * Resume a preempted agent from checkpoint
   */
  async resumeFromCheckpoint(agentId: string): Promise<{
    success: boolean;
    checkpoint?: AgentCheckpoint;
    error?: string;
  }> {
    const checkpoint = this.checkpoints.get(agentId);
    
    if (!checkpoint) {
      return {
        success: false,
        error: `No checkpoint found for ${agentId}`,
      };
    }

    // Mark as no longer preempted
    this.preemptedAgents.delete(agentId);

    this.emit('checkpoint.resumed', { agentId, checkpoint });
    logger.info(`[PreemptionSystem] Resumed ${agentId} from checkpoint`);

    return {
      success: true,
      checkpoint,
    };
  }

  /**
   * Delete a checkpoint
   */
  deleteCheckpoint(agentId: string): boolean {
    const existed = this.checkpoints.has(agentId);
    this.checkpoints.delete(agentId);
    
    if (existed) {
      this.emit('checkpoint.deleted', { agentId });
    }
    
    return existed;
  }

  /**
   * Check if an agent has been preempted
   */
  isPreempted(agentId: string): boolean {
    return this.preemptedAgents.has(agentId);
  }

  /**
   * Get preempted agent info
   */
  getPreemptedAgent(agentId: string): PreemptedAgent | undefined {
    return this.preemptedAgents.get(agentId);
  }

  /**
   * Get all preempted agents
   */
  getAllPreemptedAgents(): PreemptedAgent[] {
    return Array.from(this.preemptedAgents.values());
  }

  /**
   * Get default priority for an agent
   */
  static getDefaultPriority(): AgentPriority {
    return {
      priorityClass: PriorityClass.NORMAL,
      preemptionPolicy: 'PreemptLowerPriority',
    };
  }

  /**
   * Compare two priorities
   */
  static comparePriority(a: AgentPriority, b: AgentPriority): number {
    return b.priorityClass - a.priorityClass;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private canPreempt(
    requestPriority: AgentPriority,
    targetPriority: AgentPriority
  ): boolean {
    // Cannot preempt agents with Never policy
    if (targetPriority.preemptionPolicy === 'Never') {
      return false;
    }

    // Check priority difference
    const diff = requestPriority.priorityClass - targetPriority.priorityClass;
    
    if (diff < this.config.minPriorityDifference) {
      return false;
    }

    return true;
  }

  private async preemptAgent(
    candidate: PreemptionCandidate,
    preemptedBy: string
  ): Promise<PreemptedAgent | null> {
    try {
      // Create checkpoint if enabled
      let checkpointId: string | undefined;
      
      if (this.config.enableCheckpointing) {
        // In practice, this would serialize the actual agent state
        const checkpoint = await this.createCheckpoint(
          candidate.agentId,
          { status: 'preempted', preemptedBy },
          0.5 // Mock progress
        );
        checkpointId = checkpoint.timestamp.toISOString();
      }

      // Release resources
      await this.resourceTracker.releaseResources(candidate.agentId);

      // Record preemption
      const preempted: PreemptedAgent = {
        agentId: candidate.agentId,
        nodeId: candidate.nodeId,
        resources: candidate.resources,
        checkpointCreated: !!checkpointId,
        checkpointId,
        preemptedAt: new Date(),
      };

      this.preemptedAgents.set(candidate.agentId, preempted);

      this.emit('agent.preempted', {
        agentId: candidate.agentId,
        preemptedBy,
        nodeId: candidate.nodeId,
      });

      logger.info(`[PreemptionSystem] Preempted ${candidate.agentId}`);

      return preempted;
    } catch (error) {
      logger.error(`[PreemptionSystem] Error preempting ${candidate.agentId}:`, error);
      return null;
    }
  }
}

export default PreemptionSystem;
