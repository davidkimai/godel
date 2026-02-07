/**
 * Consistent Hashing Load Balancing Strategy
 * 
 * Maps requests to agents using consistent hashing for sticky sessions.
 * When agents are added/removed, only 1/n of mappings change.
 * 
 * Use case: When session affinity is required (e.g., caching,
 * stateful connections), or for distributed caching scenarios.
 * 
 * @module federation/strategies/consistent-hash
 */

import type { 
  LoadBalancingStrategy, 
  Agent, 
  SelectionContext, 
  ExecutionStats 
} from './types';
import { createLogger } from '../../utils/logger';

/**
 * Module logger
 */
const log = createLogger('consistent-hash-strategy');

/**
 * Consistent hashing strategy implementation
 * Uses virtual nodes for better distribution
 */
export class ConsistentHashStrategy implements LoadBalancingStrategy {
  readonly name = 'consistent-hash';
  
  /** Hash ring: hash value -> agentId */
  private ring: Map<number, string> = new Map();
  
  /** Sorted hash values for binary search */
  private sortedKeys: number[] = [];
  
  /** Agent IDs currently in the ring */
  private agentIds: Set<string> = new Set();
  
  /** Virtual nodes per agent (higher = better distribution) */
  private virtualNodes: number;
  
  /** Selection count per agent */
  private selectionCounts: Map<string, number> = new Map();
  
  /** Total selections made */
  private totalSelections = 0;
  
  /** Hash function used (configurable) */
  private hashFunction: (str: string) => number;

  constructor(virtualNodes = 150, hashFunction?: (str: string) => number) {
    this.virtualNodes = virtualNodes;
    this.hashFunction = hashFunction || this.defaultHash;
  }

  /**
   * Default hash function (FNV-1a inspired)
   * Creates 32-bit integer hash
   */
  private defaultHash(str: string): number {
    let hash = 0x811c9dc5; // FNV offset basis
    
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    
    return Math.abs(hash);
  }

  /**
   * Add an agent to the hash ring
   * Creates multiple virtual nodes for better distribution
   * 
   * @param agent - Agent to add
   */
  addAgent(agent: Agent): void {
    if (this.agentIds.has(agent.id)) {
      // Agent already exists, remove first to re-add
      this.removeAgent(agent.id);
    }
    
    // Add virtual nodes for this agent
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = this.hashFunction(`${agent.id}:${i}`);
      this.ring.set(hash, agent.id);
    }
    
    this.agentIds.add(agent.id);
    this.rebuildSortedKeys();
  }

  /**
   * Add multiple agents at once
   * More efficient than adding individually
   */
  addAgents(agents: Agent[]): void {
    for (const agent of agents) {
      if (this.agentIds.has(agent.id)) {
        continue; // Skip existing agents
      }
      
      for (let i = 0; i < this.virtualNodes; i++) {
        const hash = this.hashFunction(`${agent.id}:${i}`);
        this.ring.set(hash, agent.id);
      }
      
      this.agentIds.add(agent.id);
    }
    
    this.rebuildSortedKeys();
  }

  /**
   * Remove an agent from the hash ring
   * 
   * @param agentId - Agent ID to remove
   */
  removeAgent(agentId: string): void {
    if (!this.agentIds.has(agentId)) {
      return;
    }
    
    // Remove all virtual nodes for this agent
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = this.hashFunction(`${agentId}:${i}`);
      this.ring.delete(hash);
    }
    
    this.agentIds.delete(agentId);
    this.selectionCounts.delete(agentId);
    this.rebuildSortedKeys();
  }

  /**
   * Rebuild sorted keys array for binary search
   */
  private rebuildSortedKeys(): void {
    this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  /**
   * Select agent for a given task using consistent hashing
   * 
   * @param agents - Available agents (used for lookup)
   * @param context - Selection context with taskId for hashing
   * @returns Selected agent
   * @throws Error if no agents available or no taskId in context
   */
  selectAgent(agents: Agent[], context?: SelectionContext): Agent {
    if (agents.length === 0) {
      throw new Error('No agents available');
    }
    
    if (!context?.taskId) {
      throw new Error('Consistent hash requires taskId in context');
    }
    
    // Ensure all agents are in the ring
    const agentIdsInRing = new Set(this.agentIds);
    const agentsToAdd = agents.filter(a => !agentIdsInRing.has(a.id));
    
    if (agentsToAdd.length > 0) {
      this.addAgents(agentsToAdd);
    }
    
    // Remove agents from ring that are no longer available
    const availableAgentIds = new Set(agents.map(a => a.id));
    for (const agentId of this.agentIds) {
      if (!availableAgentIds.has(agentId)) {
        this.removeAgent(agentId);
      }
    }
    
    // Hash the task ID to find position on ring
    const hash = this.hashFunction(context.taskId);
    const agentId = this.findAgentOnRing(hash);
    
    // Find the actual agent object
    const agent = agents.find(a => a.id === agentId);
    
    if (!agent) {
      // Fallback to first available agent if hash points to removed agent
      // This shouldn't happen if ring is properly maintained
      log.warn('Consistent hash returned unknown agent, using fallback', { agentId });
      return agents[0];
    }
    
    // Track selection
    const count = this.selectionCounts.get(agent.id) || 0;
    this.selectionCounts.set(agent.id, count + 1);
    this.totalSelections++;
    
    return agent;
  }

  /**
   * Find agent on the hash ring for a given hash value
   * Uses binary search for O(log n) lookup
   * 
   * @param hash - Hash value to look up
   * @returns Agent ID
   */
  private findAgentOnRing(hash: number): string {
    if (this.sortedKeys.length === 0) {
      throw new Error('Hash ring is empty');
    }
    
    // Binary search for first key >= hash
    let left = 0;
    let right = this.sortedKeys.length - 1;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedKeys[mid] < hash) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    // If found key >= hash, use it
    if (this.sortedKeys[left] >= hash) {
      return this.ring.get(this.sortedKeys[left])!;
    }
    
    // Wrap around to first node (circular ring)
    return this.ring.get(this.sortedKeys[0])!;
  }

  /**
   * Get the agent that would be selected for a task without actually selecting
   * Useful for testing and debugging
   * 
   * @param taskId - Task ID to hash
   * @returns Agent ID that would be selected
   */
  peekAgent(taskId: string): string | undefined {
    if (this.sortedKeys.length === 0) {
      return undefined;
    }
    
    const hash = this.hashFunction(taskId);
    return this.findAgentOnRing(hash);
  }

  /**
   * No-op for consistent hash (doesn't use execution stats)
   */
  updateStats(): void {
    // Consistent hashing doesn't adapt based on execution stats
    // It relies on the hash function for distribution
  }

  /**
   * Get the number of virtual nodes
   */
  getVirtualNodes(): number {
    return this.virtualNodes;
  }

  /**
   * Get ring statistics
   */
  getRingStats(): {
    totalNodes: number;
    uniqueAgents: number;
    virtualNodesPerAgent: number;
  } {
    return {
      totalNodes: this.ring.size,
      uniqueAgents: this.agentIds.size,
      virtualNodesPerAgent: this.virtualNodes,
    };
  }

  /**
   * Reset strategy state
   */
  reset(): void {
    this.ring.clear();
    this.sortedKeys = [];
    this.agentIds.clear();
    this.selectionCounts.clear();
    this.totalSelections = 0;
  }

  /**
   * Get strategy statistics
   */
  getStats(): Record<string, unknown> {
    return {
      name: this.name,
      virtualNodes: this.virtualNodes,
      ringSize: this.ring.size,
      agentCount: this.agentIds.size,
      totalSelections: this.totalSelections,
      selectionCounts: Object.fromEntries(this.selectionCounts),
    };
  }
}

/**
 * Rendezvous hashing (HRW) strategy
 * Alternative to consistent hashing with different tradeoffs
 * Better when agent count is small and changes frequently
 */
export class RendezvousHashStrategy implements LoadBalancingStrategy {
  readonly name = 'rendezvous-hash';
  
  /** Available agents */
  private agents: Map<string, Agent> = new Map();
  
  /** Selection counts */
  private selectionCounts: Map<string, number> = new Map();

  /**
   * Hash function combining key and agent ID
   */
  private hash(key: string, agentId: string): number {
    const combined = `${key}:${agentId}`;
    let hash = 0x811c9dc5;
    
    for (let i = 0; i < combined.length; i++) {
      hash ^= combined.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    
    return Math.abs(hash);
  }

  /**
   * Add an agent to the pool
   */
  addAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Remove an agent from the pool
   */
  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.selectionCounts.delete(agentId);
  }

  /**
   * Select agent using rendezvous hashing
   * Computes score for each agent and selects highest
   */
  selectAgent(agents: Agent[], context?: SelectionContext): Agent {
    if (agents.length === 0) {
      throw new Error('No agents available');
    }
    
    if (!context?.taskId) {
      throw new Error('Rendezvous hash requires taskId in context');
    }
    
    // Update internal agent map
    this.agents.clear();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
    
    // Find agent with highest hash score
    let maxScore = -1;
    let selectedAgent: Agent | null = null;
    
    for (const agent of agents) {
      const score = this.hash(context.taskId, agent.id);
      if (score > maxScore) {
        maxScore = score;
        selectedAgent = agent;
      }
    }
    
    if (!selectedAgent) {
      throw new Error('Failed to select agent via rendezvous hashing');
    }
    
    // Track selection
    const count = this.selectionCounts.get(selectedAgent.id) || 0;
    this.selectionCounts.set(selectedAgent.id, count + 1);
    
    return selectedAgent;
  }

  updateStats(): void {
    // Rendezvous hashing doesn't use execution stats
  }

  reset(): void {
    this.agents.clear();
    this.selectionCounts.clear();
  }

  getStats(): Record<string, unknown> {
    return {
      name: this.name,
      agentCount: this.agents.size,
      selectionCounts: Object.fromEntries(this.selectionCounts),
    };
  }
}
