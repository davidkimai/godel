/**
 * Agent Registry
 *
 * Manages registered agents with their capabilities, load, and health status.
 * Provides skill-based discovery and health filtering for the federation system.
 *
 * @module federation/agent-registry
 */

import { EventEmitter } from 'events';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Agent capabilities including skills, languages, and performance metrics
 */
export interface AgentCapabilities {
  /** Skills this agent possesses (e.g., 'typescript', 'testing', 'auth') */
  skills: string[];

  /** Programming languages supported */
  languages: string[];

  /** Specialties or domains of expertise */
  specialties: string[];

  /** Cost per hour in USD */
  costPerHour: number;

  /** Average tasks completed per hour */
  avgSpeed: number;

  /** Reliability score from 0-1 */
  reliability: number;
}

/**
 * Agent status values
 */
export type AgentStatus = 'idle' | 'busy' | 'unhealthy' | 'offline';

/**
 * Registered agent with full metadata
 */
export interface RegisteredAgent {
  /** Unique agent identifier */
  id: string;

  /** Runtime type (e.g., 'pi', 'native') */
  runtime: string;

  /** Current agent status */
  status: AgentStatus;

  /** Agent capabilities */
  capabilities: AgentCapabilities;

  /** Current load factor 0-1 (utilization) */
  currentLoad: number;

  /** Last heartbeat timestamp */
  lastHeartbeat: Date;

  /** Agent metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for registering a new agent
 */
export interface AgentRegistrationConfig {
  id?: string;
  runtime: string;
  status?: AgentStatus;
  capabilities: AgentCapabilities;
  currentLoad?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Events emitted by the AgentRegistry
 */
export interface AgentRegistryEvents {
  /** Emitted when an agent is registered */
  'agent.registered': (agent: RegisteredAgent) => void;

  /** Emitted when an agent is unregistered */
  'agent.unregistered': (agentId: string) => void;

  /** Emitted when agent status changes */
  'agent.status_changed': (agentId: string, previous: AgentStatus, current: AgentStatus) => void;

  /** Emitted when agent load changes */
  'agent.load_changed': (agentId: string, previous: number, current: number) => void;

  /** Emitted when agent heartbeat is received */
  'agent.heartbeat': (agentId: string, timestamp: Date) => void;
}

// ============================================================================
// Default Capabilities
// ============================================================================

/**
 * Default capabilities for new agents
 */
export const DEFAULT_CAPABILITIES: AgentCapabilities = {
  skills: [],
  languages: [],
  specialties: [],
  costPerHour: 2.50,
  avgSpeed: 10,
  reliability: 0.95,
};

// ============================================================================
// Agent Registry Class
// ============================================================================

/**
 * Registry for managing registered agents with capabilities
 *
 * Provides skill-based discovery, health filtering, and load tracking.
 * Emits events for agent lifecycle changes.
 *
 * @example
 * ```typescript
 * const registry = new AgentRegistry();
 *
 * // Register an agent
 * registry.register({
 *   runtime: 'pi',
 *   capabilities: {
 *     skills: ['typescript', 'testing'],
 *     languages: ['typescript', 'javascript'],
 *     specialties: ['frontend'],
 *     costPerHour: 3.00,
 *     avgSpeed: 12,
 *     reliability: 0.98
 *   }
 * });
 *
 * // Find agents by skills
 * const agents = registry.findBySkills(['typescript', 'testing']);
 *
 * // Get healthy agents
 * const healthy = registry.getHealthyAgents();
 * ```
 */
export class AgentRegistry extends EventEmitter {
  /** Map of agent ID to registered agent */
  private agents: Map<string, RegisteredAgent> = new Map();

  /** Health check timeout in milliseconds (default: 60 seconds) */
  private healthCheckTimeout: number = 60000;

  /**
   * Create a new AgentRegistry instance
   *
   * @param healthCheckTimeout - Timeout for considering agents unhealthy (ms)
   */
  constructor(healthCheckTimeout?: number) {
    super();
    if (healthCheckTimeout !== undefined) {
      this.healthCheckTimeout = healthCheckTimeout;
    }
  }

  // ============================================================================
  // Registration Methods
  // ============================================================================

  /**
   * Register a new agent
   *
   * @param config - Agent registration configuration
   * @returns The registered agent
   * @throws Error if agent with same ID already registered
   *
   * @example
   * ```typescript
   * const agent = registry.register({
   *   id: 'agent-001',
   *   runtime: 'pi',
   *   capabilities: {
   *     skills: ['typescript'],
   *     languages: ['typescript'],
   *     specialties: ['backend'],
   *     costPerHour: 2.50,
   *     avgSpeed: 10,
   *     reliability: 0.95
   *   }
   * });
   * ```
   */
  register(config: AgentRegistrationConfig): RegisteredAgent {
    const id = config.id || this.generateAgentId();

    if (this.agents.has(id)) {
      throw new Error(
        `Agent '${id}' is already registered. ` +
        `Use unregister('${id}') first to replace it.`
      );
    }

    const agent: RegisteredAgent = {
      id,
      runtime: config.runtime,
      status: config.status || 'idle',
      capabilities: {
        ...DEFAULT_CAPABILITIES,
        ...config.capabilities,
      },
      currentLoad: config.currentLoad ?? 0,
      lastHeartbeat: new Date(),
      metadata: config.metadata,
    };

    this.agents.set(id, agent);
    this.emit('agent.registered', agent);

    return agent;
  }

  /**
   * Unregister an agent
   *
   * @param agentId - ID of the agent to unregister
   * @returns true if agent was found and removed, false otherwise
   *
   * @example
   * ```typescript
   * registry.unregister('agent-001');
   * ```
   */
  unregister(agentId: string): boolean {
    const existed = this.agents.has(agentId);

    if (existed) {
      this.agents.delete(agentId);
      this.emit('agent.unregistered', agentId);
    }

    return existed;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get an agent by ID
   *
   * @param agentId - Agent identifier
   * @returns The registered agent or undefined if not found
   */
  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Check if an agent is registered
   *
   * @param agentId - Agent identifier to check
   * @returns true if agent exists, false otherwise
   */
  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * List all registered agents
   *
   * @returns Array of all registered agents
   */
  list(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * List all registered agent IDs
   *
   * @returns Array of agent identifiers
   */
  listIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get the number of registered agents
   *
   * @returns Count of registered agents
   */
  count(): number {
    return this.agents.size;
  }

  // ============================================================================
  // Skill-based Discovery
  // ============================================================================

  /**
   * Find agents that have all the specified required skills
   *
   * @param skills - Required skills to match
   * @param options - Search options
   * @returns Array of agents matching all required skills
   *
   * @example
   * ```typescript
   * // Find agents with both typescript AND testing skills
   * const agents = registry.findBySkills(['typescript', 'testing']);
   *
   * // Find agents with any of the skills
   * const agents = registry.findBySkills(['python', 'rust'], { match: 'any' });
   * ```
   */
  findBySkills(
    skills: string[],
    options: { match?: 'all' | 'any'; caseSensitive?: boolean } = {}
  ): RegisteredAgent[] {
    const { match = 'all', caseSensitive = false } = options;

    return this.list().filter(agent => {
      const agentSkills = caseSensitive
        ? agent.capabilities.skills
        : agent.capabilities.skills.map(s => s.toLowerCase());

      const searchSkills = caseSensitive
        ? skills
        : skills.map(s => s.toLowerCase());

      if (match === 'all') {
        return searchSkills.every(skill => agentSkills.includes(skill));
      } else {
        return searchSkills.some(skill => agentSkills.includes(skill));
      }
    });
  }

  /**
   * Find agents by specialty
   *
   * @param specialties - Specialties to match
   * @param options - Search options
   * @returns Array of agents matching the specialties
   */
  findBySpecialty(
    specialties: string[],
    options: { match?: 'all' | 'any'; caseSensitive?: boolean } = {}
  ): RegisteredAgent[] {
    const { match = 'any', caseSensitive = false } = options;

    return this.list().filter(agent => {
      const agentSpecialties = caseSensitive
        ? agent.capabilities.specialties
        : agent.capabilities.specialties.map(s => s.toLowerCase());

      const searchSpecialties = caseSensitive
        ? specialties
        : specialties.map(s => s.toLowerCase());

      if (match === 'all') {
        return searchSpecialties.every(s => agentSpecialties.includes(s));
      } else {
        return searchSpecialties.some(s => agentSpecialties.includes(s));
      }
    });
  }

  /**
   * Find agents by language support
   *
   * @param languages - Languages to match
   * @param options - Search options
   * @returns Array of agents supporting the languages
   */
  findByLanguages(
    languages: string[],
    options: { match?: 'all' | 'any'; caseSensitive?: boolean } = {}
  ): RegisteredAgent[] {
    const { match = 'any', caseSensitive = false } = options;

    return this.list().filter(agent => {
      const agentLanguages = caseSensitive
        ? agent.capabilities.languages
        : agent.capabilities.languages.map(l => l.toLowerCase());

      const searchLanguages = caseSensitive
        ? languages
        : languages.map(l => l.toLowerCase());

      if (match === 'all') {
        return searchLanguages.every(lang => agentLanguages.includes(lang));
      } else {
        return searchLanguages.some(lang => agentLanguages.includes(lang));
      }
    });
  }

  // ============================================================================
  // Health & Status Methods
  // ============================================================================

  /**
   * Get all healthy agents (idle or busy with recent heartbeat)
   *
   * @returns Array of healthy agents
   */
  getHealthyAgents(): RegisteredAgent[] {
    const now = Date.now();
    const cutoff = now - this.healthCheckTimeout;

    return this.list().filter(agent => {
      // Must have recent heartbeat
      const hasRecentHeartbeat = agent.lastHeartbeat.getTime() > cutoff;

      // Must not be unhealthy or offline
      const isHealthyStatus = agent.status !== 'unhealthy' && agent.status !== 'offline';

      return hasRecentHeartbeat && isHealthyStatus;
    });
  }

  /**
   * Get all agents by status
   *
   * @param status - Status to filter by
   * @returns Array of agents with the specified status
   */
  getAgentsByStatus(status: AgentStatus): RegisteredAgent[] {
    return this.list().filter(agent => agent.status === status);
  }

  /**
   * Get available agents (idle and healthy)
   *
   * @returns Array of available agents
   */
  getAvailableAgents(): RegisteredAgent[] {
    return this.getHealthyAgents().filter(agent => agent.status === 'idle');
  }

  /**
   * Update agent status
   *
   * @param agentId - Agent identifier
   * @param status - New status
   * @returns true if status was updated, false if agent not found
   */
  updateStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId);

    if (!agent) {
      return false;
    }

    const previous = agent.status;
    agent.status = status;

    this.emit('agent.status_changed', agentId, previous, status);

    return true;
  }

  /**
   * Update agent load
   *
   * @param agentId - Agent identifier
   * @param load - New load value (0-1)
   * @returns true if load was updated, false if agent not found
   * @throws Error if load is not between 0 and 1
   */
  updateLoad(agentId: string, load: number): boolean {
    if (load < 0 || load > 1) {
      throw new Error('Load must be between 0 and 1');
    }

    const agent = this.agents.get(agentId);

    if (!agent) {
      return false;
    }

    const previous = agent.currentLoad;
    agent.currentLoad = load;

    this.emit('agent.load_changed', agentId, previous, load);

    return true;
  }

  /**
   * Record a heartbeat for an agent
   *
   * @param agentId - Agent identifier
   * @returns true if heartbeat was recorded, false if agent not found
   */
  heartbeat(agentId: string): boolean {
    const agent = this.agents.get(agentId);

    if (!agent) {
      return false;
    }

    agent.lastHeartbeat = new Date();
    this.emit('agent.heartbeat', agentId, agent.lastHeartbeat);

    // If agent was marked unhealthy or offline, bring it back
    if (agent.status === 'unhealthy' || agent.status === 'offline') {
      const previous = agent.status;
      agent.status = 'idle';
      this.emit('agent.status_changed', agentId, previous, 'idle');
    }

    return true;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Clear all registered agents
   *
   * Use with caution - this removes all agent registrations.
   */
  clear(): void {
    const ids = this.listIds();
    this.agents.clear();

    for (const id of ids) {
      this.emit('agent.unregistered', id);
    }
  }

  /**
   * Get registry statistics
   *
   * @returns Statistics about registered agents
   */
  getStats(): {
    total: number;
    byStatus: Record<AgentStatus, number>;
    avgLoad: number;
    avgCostPerHour: number;
    avgReliability: number;
  } {
    const agents = this.list();

    const byStatus: Record<AgentStatus, number> = {
      idle: 0,
      busy: 0,
      unhealthy: 0,
      offline: 0,
    };

    let totalLoad = 0;
    let totalCost = 0;
    let totalReliability = 0;

    for (const agent of agents) {
      byStatus[agent.status]++;
      totalLoad += agent.currentLoad;
      totalCost += agent.capabilities.costPerHour;
      totalReliability += agent.capabilities.reliability;
    }

    return {
      total: agents.length,
      byStatus,
      avgLoad: agents.length > 0 ? totalLoad / agents.length : 0,
      avgCostPerHour: agents.length > 0 ? totalCost / agents.length : 0,
      avgReliability: agents.length > 0 ? totalReliability / agents.length : 0,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Generate a unique agent ID
   */
  private generateAgentId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `agent-${timestamp}-${random}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Global singleton registry instance */
let globalRegistry: AgentRegistry | null = null;

/**
 * Get the global AgentRegistry singleton instance
 *
 * Creates and initializes the registry on first call.
 * Subsequent calls return the same instance.
 *
 * @returns The global AgentRegistry instance
 */
export function getAgentRegistry(): AgentRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global AgentRegistry singleton
 *
 * Clears the global instance. Next call to getAgentRegistry()
 * will create a fresh instance.
 *
 * Useful for testing and when configuration needs to be reloaded.
 */
export function resetAgentRegistry(): void {
  globalRegistry = null;
}
