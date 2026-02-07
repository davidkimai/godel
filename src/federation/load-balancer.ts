/**
 * Health-Aware Load Balancer
 *
 * Routes requests only to healthy agents with circuit breaker protection.
 * Supports multiple selection strategies (round-robin, least-connections, weighted)
 * and automatic failover to healthy agents.
 *
 * @module federation/load-balancer
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { AgentRegistry, RegisteredAgent } from './agent-registry';
import {
  HealthChecker,
  HealthCheckerConfig,
  HealthStatus,
  DEFAULT_HEALTH_CHECKER_CONFIG,
} from './health-checker';
import {
  AgentCircuitBreakerRegistry,
  AgentCircuitBreakerConfig,
  DEFAULT_AGENT_CIRCUIT_BREAKER_CONFIG,
} from './circuit-breaker';

// ============================================================================
// Types
// ============================================================================

/**
 * Load balancing strategy
 */
export type LoadBalancingStrategy =
  | 'round-robin'
  | 'least-connections'
  | 'weighted'
  | 'random'
  | 'first-available';

/**
 * Configuration for load balancer
 */
export interface LoadBalancerConfig {
  /** Load balancing strategy (default: 'least-connections') */
  strategy: LoadBalancingStrategy;
  /** Health checker configuration */
  healthCheck: Partial<HealthCheckerConfig>;
  /** Circuit breaker configuration */
  circuitBreaker: Partial<AgentCircuitBreakerConfig>;
  /** Enable automatic failover (default: true) */
  autoFailover: boolean;
  /** Maximum failover attempts (default: 5) */
  maxFailoverAttempts: number;
  /** Timeout for agent selection in milliseconds (default: 10000) */
  selectionTimeout: number;
}

/**
 * Criteria for selecting an agent
 */
export interface SelectionCriteria {
  /** Required skills the agent must have */
  requiredSkills?: string[];
  /** Preferred skills for scoring */
  preferredSkills?: string[];
  /** Required capabilities */
  requiredCapabilities?: string[];
  /** Maximum cost per hour */
  maxCostPerHour?: number;
  /** Minimum reliability score (0-1) */
  minReliability?: number;
  /** Preferred region for latency */
  preferredRegion?: string;
  /** Specific agent IDs to exclude */
  excludeAgents?: string[];
  /** Strategy override */
  strategy?: LoadBalancingStrategy;
  /** Task priority (higher = more likely to get resources) */
  priority?: number;
}

/**
 * Selection result with metadata
 */
export interface AgentSelection {
  /** The selected agent */
  agent: RegisteredAgent;
  /** Human-readable reason for selection */
  reason: string;
  /** Strategy used for selection */
  strategy: LoadBalancingStrategy;
  /** Number of attempts made */
  attempts: number;
  /** Alternative agents available */
  alternatives: string[];
  /** Time taken to select in milliseconds */
  selectionTimeMs: number;
}

/**
 * Load balancer statistics
 */
export interface LoadBalancerStats {
  /** Total requests processed */
  totalRequests: number;
  /** Successful selections */
  successfulSelections: number;
  /** Failed selections (no agents available) */
  failedSelections: number;
  /** Failover events */
  failoverCount: number;
  /** Average selection time in milliseconds */
  avgSelectionTimeMs: number;
  /** Current healthy agent count */
  healthyAgents: number;
  /** Current unhealthy agent count */
  unhealthyAgents: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_LOAD_BALANCER_CONFIG: LoadBalancerConfig = {
  strategy: 'least-connections',
  healthCheck: {},
  circuitBreaker: {},
  autoFailover: true,
  maxFailoverAttempts: 5,
  selectionTimeout: 10000,
};

// ============================================================================
// Load Balancer
// ============================================================================

/**
 * Health-aware load balancer for agent federation
 *
 * Routes requests to healthy agents using configurable strategies
 * with automatic failover and circuit breaker protection.
 *
 * @example
 * ```typescript
 * const lb = new LoadBalancer(agentRegistry, {
 *   strategy: 'least-connections',
 *   healthCheck: { interval: 5000 },
 *   circuitBreaker: { failureThreshold: 3 }
 * });
 *
 * lb.start();
 *
 * const selection = await lb.selectAgent({
 *   requiredSkills: ['typescript', 'testing']
 * });
 *
 * await lb.executeWithFailover(selection.agent.id, async (agent) => {
 *   return await runTask(agent);
 * });
 * ```
 */
export class LoadBalancer extends EventEmitter {
  private config: LoadBalancerConfig;
  private registry: AgentRegistry;
  private healthChecker: HealthChecker;
  private circuitBreakers: AgentCircuitBreakerRegistry;

  // Selection state
  private roundRobinIndex = 0;
  private connectionCounts: Map<string, number> = new Map();

  // Statistics
  private stats = {
    totalRequests: 0,
    successfulSelections: 0,
    failedSelections: 0,
    failoverCount: 0,
    totalSelectionTimeMs: 0,
  };

  constructor(registry: AgentRegistry, config?: Partial<LoadBalancerConfig>) {
    super();

    this.config = {
      ...DEFAULT_LOAD_BALANCER_CONFIG,
      ...config,
      healthCheck: { ...DEFAULT_HEALTH_CHECKER_CONFIG, ...config?.healthCheck },
      circuitBreaker: { ...DEFAULT_AGENT_CIRCUIT_BREAKER_CONFIG, ...config?.circuitBreaker },
    };

    this.registry = registry;

    // Initialize health checker
    this.healthChecker = new HealthChecker(this.config.healthCheck);
    this.setupHealthCheckerEvents();

    // Initialize circuit breaker registry
    this.circuitBreakers = new AgentCircuitBreakerRegistry(this.config.circuitBreaker);
    this.setupCircuitBreakerEvents();

    // Sync circuit breakers with existing agents
    this.syncCircuitBreakers();

    // Listen for registry changes
    this.registry.on('agent.registered', (agent) => {
      this.healthChecker.registerAgent(agent.id);
      this.circuitBreakers.getOrCreate(agent.id);
      this.connectionCounts.set(agent.id, 0);
    });

    this.registry.on('agent.unregistered', (agentId) => {
      this.healthChecker.unregisterAgent(agentId);
      this.circuitBreakers.remove(agentId);
      this.connectionCounts.delete(agentId);
    });

    logger.info('[LoadBalancer] Initialized with strategy:', this.config.strategy);
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the load balancer (health checking)
   */
  start(): void {
    this.healthChecker.start();
    logger.info('[LoadBalancer] Started health monitoring');
    this.emit('started', { timestamp: new Date() });
  }

  /**
   * Stop the load balancer
   */
  stop(): void {
    this.healthChecker.stop();
    logger.info('[LoadBalancer] Stopped health monitoring');
    this.emit('stopped', { timestamp: new Date() });
  }

  /**
   * Check if load balancer is running
   */
  isRunning(): boolean {
    return this.healthChecker.isActive();
  }

  // ============================================================================
  // Agent Selection
  // ============================================================================

  /**
   * Select a healthy agent based on criteria
   *
   * @param criteria - Selection criteria
   * @returns Agent selection result
   * @throws Error if no healthy agents available
   */
  async selectAgent(criteria?: SelectionCriteria): Promise<AgentSelection> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const strategy = criteria?.strategy || this.config.strategy;

    try {
      // Get healthy agents matching criteria
      const candidates = this.getCandidateAgents(criteria);

      if (candidates.length === 0) {
        this.stats.failedSelections++;
        throw new Error('No healthy agents available matching criteria');
      }

      // Filter out agents with open circuits
      const availableAgents = candidates.filter(agent => {
        const breaker = this.circuitBreakers.getOrCreate(agent.id);
        return !breaker.isOpen();
      });

      if (availableAgents.length === 0) {
        this.stats.failedSelections++;
        throw new Error('All agents are circuit-open or unavailable');
      }

      // Apply selection strategy
      const selected = this.applyStrategy(availableAgents, strategy, criteria);

      if (!selected) {
        this.stats.failedSelections++;
        throw new Error('Strategy failed to select an agent');
      }

      // Track connection count
      this.incrementConnections(selected.id);

      // Build result
      const selectionTimeMs = Date.now() - startTime;
      this.stats.successfulSelections++;
      this.stats.totalSelectionTimeMs += selectionTimeMs;

      const result: AgentSelection = {
        agent: selected,
        reason: `Selected using ${strategy} strategy from ${availableAgents.length} available agents`,
        strategy,
        attempts: 1,
        alternatives: availableAgents
          .filter(a => a.id !== selected.id)
          .map(a => a.id),
        selectionTimeMs,
      };

      this.emit('agent.selected', result);

      return result;
    } catch (error) {
      const selectionTimeMs = Date.now() - startTime;
      this.stats.totalSelectionTimeMs += selectionTimeMs;

      this.emit('selection.failed', {
        criteria,
        strategy,
        error: (error as Error).message,
        timestamp: new Date(),
      });

      throw error;
    }
  }

  /**
   * Select an agent with automatic failover
   *
   * Tries multiple agents until one succeeds or max attempts reached.
   *
   * @param criteria - Selection criteria
   * @param operation - Operation to execute
   * @returns Result of the operation
   */
  async executeWithFailover<T>(
    criteria: SelectionCriteria | undefined,
    operation: (agent: RegisteredAgent) => Promise<T>
  ): Promise<T> {
    const maxAttempts = this.config.maxFailoverAttempts;
    const errors: { agentId: string; error: Error }[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const selection = await this.selectAgent(criteria);
      const agent = selection.agent;

      try {
        const result = await operation(agent);

        // Record success
        this.recordSuccess(agent.id);

        return result;
      } catch (error) {
        const err = error as Error;

        // Record failure
        this.recordFailure(agent.id, err);
        errors.push({ agentId: agent.id, error: err });

        this.stats.failoverCount++;
        this.emit('failover', {
          fromAgent: agent.id,
          attempt: attempt + 1,
          maxAttempts,
          error: err.message,
          timestamp: new Date(),
        });

        // Exclude failed agent from next attempt
        criteria = {
          ...criteria,
          excludeAgents: [...(criteria?.excludeAgents || []), agent.id],
        };
      }
    }

    // All attempts failed
    throw new LoadBalancerFailoverError(
      `All ${maxAttempts} failover attempts failed`,
      errors
    );
  }

  /**
   * Record a successful operation on an agent
   */
  recordSuccess(agentId: string): void {
    const breaker = this.circuitBreakers.get(agentId);
    if (breaker) {
      breaker.recordSuccess();
    }

    this.decrementConnections(agentId);

    this.emit('agent.success', { agentId, timestamp: new Date() });
  }

  /**
   * Record a failed operation on an agent
   */
  recordFailure(agentId: string, error: Error): void {
    const breaker = this.circuitBreakers.get(agentId);
    if (breaker) {
      breaker.recordFailure(error);
    }

    this.decrementConnections(agentId);

    this.emit('agent.failure', { agentId, error, timestamp: new Date() });

    // Check if circuit breaker opened
    if (breaker?.isOpen()) {
      this.emit('agent.circuit_open', { agentId, timestamp: new Date() });
    }
  }

  // ============================================================================
  // Private Methods - Selection
  // ============================================================================

  /**
   * Get candidate agents matching criteria
   */
  private getCandidateAgents(criteria?: SelectionCriteria): RegisteredAgent[] {
    // Get healthy agents from registry
    let agents = this.registry.getHealthyAgents();

    // Filter by criteria
    if (criteria?.requiredSkills && criteria.requiredSkills.length > 0) {
      agents = agents.filter(agent =>
        criteria.requiredSkills!.every(skill =>
          agent.capabilities.skills.some(s =>
            s.toLowerCase() === skill.toLowerCase()
          )
        )
      );
    }

    if (criteria?.requiredCapabilities && criteria.requiredCapabilities.length > 0) {
      // Check metadata for capabilities
      agents = agents.filter(agent => {
        const caps = (agent.metadata?.['capabilities'] as string[]) || [];
        return criteria.requiredCapabilities!.every(cap => caps.includes(cap));
      });
    }

    if (criteria?.maxCostPerHour !== undefined) {
      agents = agents.filter(agent =>
        (agent.capabilities as { costPerHour: number }).costPerHour <= criteria.maxCostPerHour!
      );
    }

    if (criteria?.minReliability !== undefined) {
      agents = agents.filter(agent =>
        agent.capabilities.reliability >= criteria.minReliability!
      );
    }

    if (criteria?.excludeAgents && criteria.excludeAgents.length > 0) {
      agents = agents.filter(agent =>
        !criteria.excludeAgents!.includes(agent.id)
      );
    }

    // Filter by health checker health status
    agents = agents.filter(agent => {
      const health = this.healthChecker.getAgentHealth(agent.id);
      return !health || health.status !== 'unhealthy';
    });

    return agents;
  }

  /**
   * Apply selection strategy
   */
  private applyStrategy(
    agents: RegisteredAgent[],
    strategy: LoadBalancingStrategy,
    criteria?: SelectionCriteria
  ): RegisteredAgent | null {
    if (agents.length === 0) return null;

    switch (strategy) {
      case 'round-robin':
        return this.roundRobinSelect(agents);

      case 'least-connections':
        return this.leastConnectionsSelect(agents);

      case 'weighted':
        return this.weightedSelect(agents);

      case 'random':
        return this.randomSelect(agents);

      case 'first-available':
        return agents[0];

      default:
        return this.leastConnectionsSelect(agents);
    }
  }

  /**
   * Round-robin selection
   */
  private roundRobinSelect(agents: RegisteredAgent[]): RegisteredAgent {
    const index = this.roundRobinIndex % agents.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % agents.length;
    return agents[index];
  }

  /**
   * Least connections selection
   */
  private leastConnectionsSelect(agents: RegisteredAgent[]): RegisteredAgent {
    return agents.reduce((best, agent) => {
      const bestConnections = this.connectionCounts.get(best.id) || 0;
      const agentConnections = this.connectionCounts.get(agent.id) || 0;
      return agentConnections < bestConnections ? agent : best;
    });
  }

  /**
   * Weighted selection based on capabilities
   */
  private weightedSelect(agents: RegisteredAgent[]): RegisteredAgent {
    // Calculate weights based on reliability and speed
    const weights = agents.map(agent => {
      const reliability = agent.capabilities.reliability;
      const speed = Math.min(agent.capabilities.avgSpeed / 20, 1); // Normalize
      return (reliability + speed) / 2;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < agents.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return agents[i];
      }
    }

    return agents[agents.length - 1];
  }

  /**
   * Random selection
   */
  private randomSelect(agents: RegisteredAgent[]): RegisteredAgent {
    const index = Math.floor(Math.random() * agents.length);
    return agents[index];
  }

  // ============================================================================
  // Private Methods - Connection Tracking
  // ============================================================================

  private incrementConnections(agentId: string): void {
    const current = this.connectionCounts.get(agentId) || 0;
    this.connectionCounts.set(agentId, current + 1);
  }

  private decrementConnections(agentId: string): void {
    const current = this.connectionCounts.get(agentId) || 0;
    if (current > 0) {
      this.connectionCounts.set(agentId, current - 1);
    }
  }

  // ============================================================================
  // Private Methods - Event Handlers
  // ============================================================================

  private setupHealthCheckerEvents(): void {
    this.healthChecker.on('unhealthy', (event) => {
      logger.warn(`[LoadBalancer] Agent ${event.agentId} marked unhealthy`);

      // Open circuit breaker for unhealthy agent
      const breaker = this.circuitBreakers.get(event.agentId);
      if (breaker) {
        breaker.forceOpen();
      }

      this.emit('agent.unhealthy', event);
    });

    this.healthChecker.on('recovered', (event) => {
      logger.info(`[LoadBalancer] Agent ${event.agentId} recovered`);

      // Close circuit breaker for recovered agent
      const breaker = this.circuitBreakers.get(event.agentId);
      if (breaker) {
        breaker.forceClose();
      }

      this.emit('agent.recovered', event);
    });

    this.healthChecker.on('checked', (result) => {
      this.emit('health.checked', result);
    });

    this.healthChecker.on('cycle.completed', (event) => {
      this.emit('health.cycle_completed', event);
    });
  }

  private setupCircuitBreakerEvents(): void {
    this.circuitBreakers.on('opened', (event) => {
      logger.warn(`[LoadBalancer] Circuit opened for agent ${event.agentId}`);
      this.emit('circuit.opened', event);
    });

    this.circuitBreakers.on('closed', (event) => {
      logger.info(`[LoadBalancer] Circuit closed for agent ${event.agentId}`);
      this.emit('circuit.closed', event);
    });
  }

  private syncCircuitBreakers(): void {
    const agentIds = this.registry.listIds();
    this.circuitBreakers.syncWithAgentIds(agentIds);

    // Register agents with health checker
    for (const agentId of agentIds) {
      this.healthChecker.registerAgent(agentId);
    }
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get load balancer statistics
   */
  getStats(): LoadBalancerStats {
    const healthStats = this.healthChecker.getStats();

    return {
      totalRequests: this.stats.totalRequests,
      successfulSelections: this.stats.successfulSelections,
      failedSelections: this.stats.failedSelections,
      failoverCount: this.stats.failoverCount,
      avgSelectionTimeMs: this.stats.successfulSelections > 0
        ? this.stats.totalSelectionTimeMs / this.stats.successfulSelections
        : 0,
      healthyAgents: healthStats.healthy,
      unhealthyAgents: healthStats.unhealthy,
    };
  }

  /**
   * Get health status for an agent
   */
  getAgentHealth(agentId: string): HealthStatus {
    const health = this.healthChecker.getAgentHealth(agentId);
    return health?.status || 'unknown';
  }

  /**
   * Get all healthy agents
   */
  getHealthyAgents(): RegisteredAgent[] {
    return this.registry.getHealthyAgents().filter(agent => {
      const breaker = this.circuitBreakers.get(agent.id);
      return !breaker || breaker.isClosed();
    });
  }

  /**
   * Get circuit breaker state for an agent
   */
  getCircuitState(agentId: string): string {
    const breaker = this.circuitBreakers.get(agentId);
    return breaker?.getState() || 'unknown';
  }

  /**
   * Get configuration
   */
  getConfig(): LoadBalancerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LoadBalancerConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[LoadBalancer] Configuration updated');
  }

  /**
   * Dispose of the load balancer
   */
  dispose(): void {
    this.stop();
    this.healthChecker.dispose();
    this.circuitBreakers.clear();
    this.removeAllListeners();
  }
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown when all failover attempts fail
 */
export class LoadBalancerFailoverError extends Error {
  public errors: { agentId: string; error: Error }[];

  constructor(message: string, errors: { agentId: string; error: Error }[]) {
    super(message);
    this.name = 'LoadBalancerFailoverError';
    this.errors = errors;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalLoadBalancer: LoadBalancer | null = null;

export function getLoadBalancer(
  registry?: AgentRegistry,
  config?: Partial<LoadBalancerConfig>
): LoadBalancer {
  if (!globalLoadBalancer && registry) {
    globalLoadBalancer = new LoadBalancer(registry, config);
  }
  return globalLoadBalancer!;
}

export function resetLoadBalancer(): void {
  globalLoadBalancer = null;
}

// Re-exports
export { HealthStatus };
