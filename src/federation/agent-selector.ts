/**
 * Agent Selector
 *
 * Intelligent agent selection based on skills, load, cost, and reliability.
 * Implements multiple selection strategies for different optimization goals.
 *
 * @module federation/agent-selector
 */

import {
  AgentRegistry,
  RegisteredAgent,
  AgentCapabilities,
  AgentStatus,
} from './agent-registry';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Selection strategy types
 */
export type SelectionStrategy =
  | 'skill-match'
  | 'cost-optimized'
  | 'speed-optimized'
  | 'reliability-optimized'
  | 'load-balanced'
  | 'balanced';

/**
 * Selection criteria for agent matching
 */
export interface SelectionCriteria {
  /** Required skills - agent must have all of these */
  requiredSkills?: string[];

  /** Preferred skills - adds to score if agent has these */
  preferredSkills?: string[];

  /** Required specialties */
  requiredSpecialties?: string[];

  /** Required languages */
  requiredLanguages?: string[];

  /** Maximum cost per hour in USD */
  maxCostPerHour?: number;

  /** Minimum reliability score (0-1) */
  minReliability?: number;

  /** Minimum average speed (tasks/hour) */
  minSpeed?: number;

  /** Preferred runtime type */
  preferredRuntime?: string;

  /** Selection strategy to use */
  strategy: SelectionStrategy;

  /** Custom weights for balanced strategy (overrides defaults) */
  weights?: ScoreWeights;
}

/**
 * Score weights for balanced selection strategy
 */
export interface ScoreWeights {
  /** Weight for skill match score (default: 0.4) */
  skillMatch: number;

  /** Weight for cost efficiency score (default: 0.2) */
  costEfficiency: number;

  /** Weight for reliability score (default: 0.2) */
  reliability: number;

  /** Weight for load availability score (default: 0.2) */
  loadAvailability: number;
}

/**
 * Scored agent result
 */
interface ScoredAgent {
  agent: RegisteredAgent;
  score: number;
  details: {
    skillScore: number;
    costScore: number;
    reliabilityScore: number;
    loadScore: number;
    speedScore: number;
  };
}

/**
 * Selection result with metadata
 */
export interface SelectionResult {
  /** Selected agent */
  agent: RegisteredAgent;

  /** Selection score (0-1) */
  score: number;

  /** Score breakdown */
  details: {
    skillScore: number;
    costScore: number;
    reliabilityScore: number;
    loadScore: number;
    speedScore: number;
  };

  /** Number of candidates considered */
  candidatesConsidered: number;

  /** Strategy used for selection */
  strategy: SelectionStrategy;
}

/**
 * Selection error
 */
export class SelectionError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SelectionError';
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default score weights for balanced strategy */
const DEFAULT_WEIGHTS: ScoreWeights = {
  skillMatch: 0.4,
  costEfficiency: 0.2,
  reliability: 0.2,
  loadAvailability: 0.2,
};

/** Maximum reasonable cost for normalization ($50/hour) */
const MAX_COST_NORMALIZATION = 50;

// ============================================================================
// Agent Selector Class
// ============================================================================

/**
 * Intelligent agent selector with multiple selection strategies
 *
 * Selects the best agent for a task based on skills, cost, reliability,
 * load, and speed. Supports multiple optimization strategies.
 *
 * @example
 * ```typescript
 * const selector = new AgentSelector(registry);
 *
 * // Select by skill match
 * const result = await selector.selectAgent({
 *   requiredSkills: ['typescript', 'testing'],
 *   strategy: 'skill-match'
 * });
 *
 * // Cost-optimized selection
 * const result = await selector.selectAgent({
 *   requiredSkills: ['python'],
 *   strategy: 'cost-optimized',
 *   maxCostPerHour: 5.00
 * });
 *
 * // Balanced selection with custom weights
 * const result = await selector.selectAgent({
 *   requiredSkills: ['rust'],
 *   strategy: 'balanced',
 *   weights: {
 *     skillMatch: 0.5,
 *     costEfficiency: 0.1,
 *     reliability: 0.3,
 *     loadAvailability: 0.1
 *   }
 * });
 * ```
 */
export class AgentSelector {
  /**
   * Create a new AgentSelector instance
   *
   * @param registry - Agent registry to select from
   */
  constructor(private registry: AgentRegistry) {}

  // ============================================================================
  // Main Selection Method
  // ============================================================================

  /**
   * Select the best agent for a task based on criteria
   *
   * @param criteria - Selection criteria
   * @returns Promise resolving to selection result
   * @throws SelectionError if no suitable agent is found
   *
   * @example
   * ```typescript
   * const result = await selector.selectAgent({
   *   requiredSkills: ['typescript', 'react'],
   *   preferredSkills: ['nextjs', 'tailwind'],
   *   strategy: 'balanced',
   *   maxCostPerHour: 4.00,
   *   minReliability: 0.9
   * });
   *
   * console.log(`Selected: ${result.agent.id} (score: ${result.score})`);
   * ```
   */
  async selectAgent(criteria: SelectionCriteria): Promise<SelectionResult> {
    // Get all healthy agents as candidates
    let candidates = this.registry.getHealthyAgents();

    // Filter by hard constraints
    candidates = this.applyHardConstraints(candidates, criteria);

    if (candidates.length === 0) {
      throw new SelectionError(
        'No agents available matching the specified criteria',
        'NO_CANDIDATES',
        { criteria }
      );
    }

    // Apply selection strategy
    let scoredAgents: ScoredAgent[];

    switch (criteria.strategy) {
      case 'skill-match':
        scoredAgents = this.selectBySkillMatch(candidates, criteria);
        break;
      case 'cost-optimized':
        scoredAgents = this.selectByCost(candidates, criteria);
        break;
      case 'speed-optimized':
        scoredAgents = this.selectBySpeed(candidates, criteria);
        break;
      case 'reliability-optimized':
        scoredAgents = this.selectByReliability(candidates, criteria);
        break;
      case 'load-balanced':
        scoredAgents = this.selectByLoadBalance(candidates, criteria);
        break;
      case 'balanced':
        scoredAgents = this.selectBalanced(candidates, criteria);
        break;
      default:
        throw new SelectionError(
          `Unknown selection strategy: ${criteria.strategy}`,
          'INVALID_STRATEGY',
          { strategy: criteria.strategy }
        );
    }

    if (scoredAgents.length === 0 || scoredAgents[0].score === 0) {
      throw new SelectionError(
        'No agents meet the minimum criteria for the selected strategy',
        'NO_MATCHING_AGENTS',
        { strategy: criteria.strategy, candidates: candidates.length }
      );
    }

    // Return the top-scored agent
    const topResult = scoredAgents[0];

    return {
      agent: topResult.agent,
      score: topResult.score,
      details: topResult.details,
      candidatesConsidered: candidates.length,
      strategy: criteria.strategy,
    };
  }

  /**
   * Select multiple agents for a task (for parallel execution)
   *
   * @param criteria - Selection criteria
   * @param count - Number of agents to select
   * @returns Promise resolving to array of selection results
   * @throws SelectionError if not enough suitable agents are found
   *
   * @example
   * ```typescript
   * const results = await selector.selectMultipleAgents({
   *   requiredSkills: ['typescript'],
   *   strategy: 'balanced'
   * }, 3);
   *
   * // Use all three agents in parallel
   * ```
   */
  async selectMultipleAgents(
    criteria: SelectionCriteria,
    count: number
  ): Promise<SelectionResult[]> {
    if (count <= 0) {
      throw new SelectionError(
        'Count must be greater than 0',
        'INVALID_COUNT',
        { count }
      );
    }

    // Get all healthy agents as candidates
    let candidates = this.registry.getHealthyAgents();

    // Filter by hard constraints
    candidates = this.applyHardConstraints(candidates, criteria);

    if (candidates.length === 0) {
      throw new SelectionError(
        'No agents available matching the specified criteria',
        'NO_CANDIDATES',
        { criteria }
      );
    }

    if (candidates.length < count) {
      throw new SelectionError(
        `Not enough agents available. Requested ${count}, found ${candidates.length}`,
        'INSUFFICIENT_AGENTS',
        { requested: count, available: candidates.length }
      );
    }

    // Score all candidates
    let scoredAgents: ScoredAgent[];

    switch (criteria.strategy) {
      case 'skill-match':
        scoredAgents = this.selectBySkillMatch(candidates, criteria);
        break;
      case 'cost-optimized':
        scoredAgents = this.selectByCost(candidates, criteria);
        break;
      case 'speed-optimized':
        scoredAgents = this.selectBySpeed(candidates, criteria);
        break;
      case 'reliability-optimized':
        scoredAgents = this.selectByReliability(candidates, criteria);
        break;
      case 'load-balanced':
        scoredAgents = this.selectByLoadBalance(candidates, criteria);
        break;
      case 'balanced':
        scoredAgents = this.selectBalanced(candidates, criteria);
        break;
      default:
        throw new SelectionError(
          `Unknown selection strategy: ${criteria.strategy}`,
          'INVALID_STRATEGY',
          { strategy: criteria.strategy }
        );
    }

    // Take the top N results
    const topResults = scoredAgents.slice(0, count);

    if (topResults.length === 0 || topResults[0].score === 0) {
      throw new SelectionError(
        'No agents meet the minimum criteria',
        'NO_MATCHING_AGENTS',
        { strategy: criteria.strategy }
      );
    }

    return topResults.map(result => ({
      agent: result.agent,
      score: result.score,
      details: result.details,
      candidatesConsidered: candidates.length,
      strategy: criteria.strategy,
    }));
  }

  /**
   * Rank all available agents by suitability
   *
   * @param criteria - Selection criteria
   * @returns Promise resolving to ranked list of agents with scores
   */
  async rankAgents(criteria: SelectionCriteria): Promise<SelectionResult[]> {
    // Get all healthy agents as candidates
    let candidates = this.registry.getHealthyAgents();

    // Filter by hard constraints
    candidates = this.applyHardConstraints(candidates, criteria);

    if (candidates.length === 0) {
      return [];
    }

    // Score all candidates
    let scoredAgents: ScoredAgent[];

    switch (criteria.strategy) {
      case 'skill-match':
        scoredAgents = this.selectBySkillMatch(candidates, criteria);
        break;
      case 'cost-optimized':
        scoredAgents = this.selectByCost(candidates, criteria);
        break;
      case 'speed-optimized':
        scoredAgents = this.selectBySpeed(candidates, criteria);
        break;
      case 'reliability-optimized':
        scoredAgents = this.selectByReliability(candidates, criteria);
        break;
      case 'load-balanced':
        scoredAgents = this.selectByLoadBalance(candidates, criteria);
        break;
      case 'balanced':
        scoredAgents = this.selectBalanced(candidates, criteria);
        break;
      default:
        scoredAgents = this.selectBalanced(candidates, criteria);
    }

    return scoredAgents.map(result => ({
      agent: result.agent,
      score: result.score,
      details: result.details,
      candidatesConsidered: candidates.length,
      strategy: criteria.strategy,
    }));
  }

  // ============================================================================
  // Selection Strategy Implementations
  // ============================================================================

  /**
   * Select agents by skill match score
   */
  private selectBySkillMatch(
    candidates: RegisteredAgent[],
    criteria: SelectionCriteria
  ): ScoredAgent[] {
    const scored = candidates.map(agent => {
      const skillScore = this.calculateSkillScore(agent, criteria);
      const preferredSkillScore = this.calculatePreferredSkillScore(agent, criteria);

      // Combine required and preferred skills (required is weighted more)
      const totalSkillScore = skillScore * 0.7 + preferredSkillScore * 0.3;

      return {
        agent,
        score: totalSkillScore,
        details: {
          skillScore: totalSkillScore,
          costScore: 0,
          reliabilityScore: 0,
          loadScore: 0,
          speedScore: 0,
        },
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Select agents by cost optimization
   */
  private selectByCost(
    candidates: RegisteredAgent[],
    criteria: SelectionCriteria
  ): ScoredAgent[] {
    const scored = candidates.map(agent => {
      const skillScore = this.calculateSkillScore(agent, criteria);
      const costScore = this.calculateCostScore(agent);
      const preferredSkillScore = this.calculatePreferredSkillScore(agent, criteria);

      // For cost-optimized, we want lowest cost but still need some skills
      // Weight: cost 60%, required skills 25%, preferred skills 15%
      const score = costScore * 0.6 + skillScore * 0.25 + preferredSkillScore * 0.15;

      return {
        agent,
        score,
        details: {
          skillScore,
          costScore,
          reliabilityScore: 0,
          loadScore: 0,
          speedScore: 0,
        },
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Select agents by speed optimization
   */
  private selectBySpeed(
    candidates: RegisteredAgent[],
    criteria: SelectionCriteria
  ): ScoredAgent[] {
    const maxSpeed = Math.max(...candidates.map(a => a.capabilities.avgSpeed), 1);

    const scored = candidates.map(agent => {
      const skillScore = this.calculateSkillScore(agent, criteria);
      const speedScore = agent.capabilities.avgSpeed / maxSpeed;
      const loadScore = 1 - agent.currentLoad; // Prefer less loaded agents

      // Weight: speed 50%, load 25%, skills 25%
      const score = speedScore * 0.5 + loadScore * 0.25 + skillScore * 0.25;

      return {
        agent,
        score,
        details: {
          skillScore,
          costScore: 0,
          reliabilityScore: 0,
          loadScore,
          speedScore,
        },
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Select agents by reliability optimization
   */
  private selectByReliability(
    candidates: RegisteredAgent[],
    criteria: SelectionCriteria
  ): ScoredAgent[] {
    const scored = candidates.map(agent => {
      const skillScore = this.calculateSkillScore(agent, criteria);
      const reliabilityScore = agent.capabilities.reliability;

      // Weight: reliability 70%, skills 30%
      const score = reliabilityScore * 0.7 + skillScore * 0.3;

      return {
        agent,
        score,
        details: {
          skillScore,
          costScore: 0,
          reliabilityScore,
          loadScore: 0,
          speedScore: 0,
        },
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Select agents by load balancing
   */
  private selectByLoadBalance(
    candidates: RegisteredAgent[],
    criteria: SelectionCriteria
  ): ScoredAgent[] {
    const scored = candidates.map(agent => {
      const skillScore = this.calculateSkillScore(agent, criteria);
      const loadScore = 1 - agent.currentLoad;

      // Weight: load 60%, skills 40%
      const score = loadScore * 0.6 + skillScore * 0.4;

      return {
        agent,
        score,
        details: {
          skillScore,
          costScore: 0,
          reliabilityScore: 0,
          loadScore,
          speedScore: 0,
        },
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Select agents using balanced weighted scoring
   */
  private selectBalanced(
    candidates: RegisteredAgent[],
    criteria: SelectionCriteria
  ): ScoredAgent[] {
    const weights = criteria.weights ?? DEFAULT_WEIGHTS;
    const maxSpeed = Math.max(...candidates.map(a => a.capabilities.avgSpeed), 1);

    const scored = candidates.map(agent => {
      const skillScore = this.calculateSkillScore(agent, criteria);
      const preferredSkillScore = this.calculatePreferredSkillScore(agent, criteria);
      const totalSkillScore = skillScore * 0.7 + preferredSkillScore * 0.3;

      const costScore = this.calculateCostScore(agent);
      const reliabilityScore = agent.capabilities.reliability;
      const loadScore = 1 - agent.currentLoad;

      // Weighted average
      const score =
        totalSkillScore * weights.skillMatch +
        costScore * weights.costEfficiency +
        reliabilityScore * weights.reliability +
        loadScore * weights.loadAvailability;

      return {
        agent,
        score,
        details: {
          skillScore: totalSkillScore,
          costScore,
          reliabilityScore,
          loadScore,
          speedScore: agent.capabilities.avgSpeed / maxSpeed,
        },
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  // ============================================================================
  // Scoring Helpers
  // ============================================================================

  /**
   * Calculate skill match score (0-1)
   */
  private calculateSkillScore(
    agent: RegisteredAgent,
    criteria: SelectionCriteria
  ): number {
    if (!criteria.requiredSkills || criteria.requiredSkills.length === 0) {
      return 1; // No required skills means perfect match
    }

    const required = criteria.requiredSkills.map(s => s.toLowerCase());
    const agentSkills = agent.capabilities.skills.map(s => s.toLowerCase());

    const matches = required.filter(skill => agentSkills.includes(skill)).length;
    return matches / required.length;
  }

  /**
   * Calculate preferred skill match score (0-1)
   */
  private calculatePreferredSkillScore(
    agent: RegisteredAgent,
    criteria: SelectionCriteria
  ): number {
    if (!criteria.preferredSkills || criteria.preferredSkills.length === 0) {
      return 0; // No preferred skills
    }

    const preferred = criteria.preferredSkills.map(s => s.toLowerCase());
    const agentSkills = agent.capabilities.skills.map(s => s.toLowerCase());

    const matches = preferred.filter(skill => agentSkills.includes(skill)).length;
    return matches / preferred.length;
  }

  /**
   * Calculate cost efficiency score (0-1, higher is better/lower cost)
   */
  private calculateCostScore(agent: RegisteredAgent): number {
    // Normalize cost: lower cost = higher score
    // Use exponential decay for more aggressive scoring at higher costs
    const cost = agent.capabilities.costPerHour;
    return Math.exp(-cost / 10); // Score decreases as cost increases
  }

  // ============================================================================
  // Constraint Filtering
  // ============================================================================

  /**
   * Apply hard constraints to filter candidates
   */
  private applyHardConstraints(
    candidates: RegisteredAgent[],
    criteria: SelectionCriteria
  ): RegisteredAgent[] {
    return candidates.filter(agent => {
      // Check required skills (must have ALL)
      if (criteria.requiredSkills && criteria.requiredSkills.length > 0) {
        const required = criteria.requiredSkills.map(s => s.toLowerCase());
        const agentSkills = agent.capabilities.skills.map(s => s.toLowerCase());
        const hasAllSkills = required.every(skill => agentSkills.includes(skill));
        if (!hasAllSkills) return false;
      }

      // Check required specialties (must have ALL)
      if (criteria.requiredSpecialties && criteria.requiredSpecialties.length > 0) {
        const required = criteria.requiredSpecialties.map(s => s.toLowerCase());
        const agentSpecialties = agent.capabilities.specialties.map(s => s.toLowerCase());
        const hasAllSpecialties = required.every(s => agentSpecialties.includes(s));
        if (!hasAllSpecialties) return false;
      }

      // Check required languages (must have ALL)
      if (criteria.requiredLanguages && criteria.requiredLanguages.length > 0) {
        const required = criteria.requiredLanguages.map(l => l.toLowerCase());
        const agentLanguages = agent.capabilities.languages.map(l => l.toLowerCase());
        const hasAllLanguages = required.every(l => agentLanguages.includes(l));
        if (!hasAllLanguages) return false;
      }

      // Check max cost
      if (criteria.maxCostPerHour !== undefined) {
        if (agent.capabilities.costPerHour > criteria.maxCostPerHour) {
          return false;
        }
      }

      // Check min reliability
      if (criteria.minReliability !== undefined) {
        if (agent.capabilities.reliability < criteria.minReliability) {
          return false;
        }
      }

      // Check min speed
      if (criteria.minSpeed !== undefined) {
        if (agent.capabilities.avgSpeed < criteria.minSpeed) {
          return false;
        }
      }

      // Check preferred runtime
      if (criteria.preferredRuntime !== undefined) {
        if (agent.runtime !== criteria.preferredRuntime) {
          return false;
        }
      }

      return true;
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a default agent selector using the global registry
 *
 * @returns AgentSelector instance with global registry
 */
export function createDefaultSelector(): AgentSelector {
  const { getAgentRegistry } = require('./agent-registry');
  return new AgentSelector(getAgentRegistry());
}

/**
 * Quick select function for common use cases
 *
 * @param criteria - Selection criteria
 * @returns Promise resolving to selected agent
 */
export async function selectAgent(
  criteria: SelectionCriteria
): Promise<SelectionResult> {
  const selector = createDefaultSelector();
  return selector.selectAgent(criteria);
}
