/**
 * Pi Cost-Optimized Router
 *
 * Implements cost-based routing for Pi providers, selecting the most
 * cost-effective provider that meets requirements. Tracks historical
 * costs, estimates future costs, and enforces budget constraints.
 *
 * @module integrations/pi/cost-router
 */

import { EventEmitter } from 'events';
import {
  ProviderId,
  PiInstance,
  PiCapability,
  PiRegistryError,
} from './types';
import { getProviderConfig } from './provider';
import { logger } from '../../utils/logger';

// ============================================================================
// Cost Model Pricing
// ============================================================================

/**
 * Pricing per 1k tokens (input/output) in USD
 * Prices are approximate as of 2024
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'claude-haiku-4': { input: 0.25, output: 1.25 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-opus': { input: 15.0, output: 75.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },

  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },

  // Google
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.0-pro': { input: 0.5, output: 1.5 },

  // Groq
  'llama-3.1-405b': { input: 0.5, output: 0.5 },
  'llama-3.1-70b': { input: 0.25, output: 0.25 },
  'mixtral-8x7b': { input: 0.15, output: 0.15 },

  // Cerebras
  'cerebras-llama3.1-8b': { input: 0.1, output: 0.1 },
  'cerebras-llama3.1-70b': { input: 0.6, output: 0.6 },

  // Kimi
  'kimi-k2.5': { input: 2.0, output: 8.0 },
  'kimi-k2': { input: 1.5, output: 6.0 },

  // MiniMax
  'minimax-01': { input: 0.2, output: 1.1 },
  'minimax-abab6.5': { input: 0.3, output: 1.5 },

  // Ollama (local, effectively free)
  'ollama-default': { input: 0.0, output: 0.0 },
  'codellama': { input: 0.0, output: 0.0 },
  'llama2': { input: 0.0, output: 0.0 },
  'mistral': { input: 0.0, output: 0.0 },
};

// ============================================================================
// Cost Types
// ============================================================================

/**
 * Cost estimate for a request
 */
export interface CostEstimate {
  /** Provider identifier */
  provider: ProviderId;

  /** Model identifier */
  model: string;

  /** Input tokens estimated */
  inputTokens: number;

  /** Output tokens estimated */
  outputTokens: number;

  /** Input cost */
  inputCost: number;

  /** Output cost */
  outputCost: number;

  /** Total estimated cost */
  totalCost: number;

  /** Currency code */
  currency: string;
}

/**
 * Historical cost record
 */
export interface CostRecord {
  /** Request identifier */
  requestId: string;

  /** Provider used */
  provider: ProviderId;

  /** Model used */
  model: string;

  /** Actual cost incurred */
  actualCost: number;

  /** Estimated cost before request */
  estimatedCost: number;

  /** Input tokens used */
  inputTokens: number;

  /** Output tokens used */
  outputTokens: number;

  /** Timestamp */
  timestamp: Date;

  /** Task type */
  taskType?: string;
}

/**
 * Budget configuration
 */
export interface BudgetConfig {
  /** Maximum cost per request ($) */
  maxCostPerRequest: number;

  /** Maximum cost per period ($) */
  maxCostPerPeriod: number;

  /** Budget period in milliseconds */
  periodMs: number;

  /** Alert threshold (% of period budget) */
  alertThreshold: number;
}

/**
 * Cost-optimized routing request
 */
export interface CostRoutingRequest {
  /** Request identifier */
  requestId: string;

  /** Required capabilities */
  requiredCapabilities?: PiCapability[];

  /** Estimated token count */
  estimatedTokens: number;

  /** Input/output ratio (default: 0.7) */
  inputRatio?: number;

  /** Maximum acceptable cost ($) */
  maxCost?: number;

  /** Preferred providers (in order) */
  preferredProviders?: ProviderId[];

  /** Task type for cost tracking */
  taskType?: string;

  /** Whether to optimize for quality over cost */
  prioritizeQuality?: boolean;
}

/**
 * Cost routing result
 */
export interface CostRoutingResult {
  /** Selected provider */
  provider: PiInstance;

  /** Cost estimate */
  costEstimate: CostEstimate;

  /** Alternative providers with costs */
  alternatives: Array<{
    provider: PiInstance;
    costEstimate: CostEstimate;
    score: number;
  }>;

  /** Whether within budget */
  withinBudget: boolean;

  /** Score breakdown */
  scoreBreakdown: {
    costScore: number;
    qualityScore: number;
    capabilityScore: number;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxCostPerRequest: 1.0,
  maxCostPerPeriod: 50.0,
  periodMs: 3600000, // 1 hour
  alertThreshold: 80,
};

// ============================================================================
// Cost Calculation Functions
// ============================================================================

/**
 * Estimates cost for a provider and token count
 *
 * @param provider - Provider instance
 * @param estimatedTokens - Estimated total tokens
 * @param inputRatio - Ratio of input tokens (default 0.7)
 * @returns Cost estimate
 */
export function estimateCost(
  provider: PiInstance,
  estimatedTokens: number,
  inputRatio: number = 0.7
): CostEstimate {
  const model = provider.model;
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[`${provider.provider}-default`] || { input: 1.0, output: 2.0 };

  const inputTokens = Math.floor(estimatedTokens * inputRatio);
  const outputTokens = Math.floor(estimatedTokens * (1 - inputRatio));

  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;

  return {
    provider: provider.provider,
    model,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: 'USD',
  };
}

/**
 * Gets the cheapest model for a provider
 *
 * @param provider - Provider identifier
 * @returns Cheapest model name
 */
export function getCheapestModel(provider: ProviderId): string {
  const config = getProviderConfig(provider);
  if (!config) {
    return 'default';
  }

  let cheapestModel = config.defaultModel;
  let cheapestPrice = Infinity;

  for (const model of config.models) {
    const pricing = MODEL_PRICING[model];
    if (pricing) {
      const avgPrice = (pricing.input + pricing.output) / 2;
      if (avgPrice < cheapestPrice) {
        cheapestPrice = avgPrice;
        cheapestModel = model;
      }
    }
  }

  return cheapestModel;
}

/**
 * Calculates cost score (higher = better/cheaper)
 *
 * @param cost - Cost estimate
 * @param maxCost - Maximum acceptable cost
 * @returns Score from 0-100
 */
export function calculateCostScore(cost: CostEstimate, maxCost: number = 1.0): number {
  const normalizedCost = Math.min(cost.totalCost / maxCost, 1);
  return Math.max(0, (1 - normalizedCost) * 100);
}

/**
 * Calculates quality score for a provider
 *
 * @param provider - Provider identifier
 * @returns Score from 0-100
 */
export function calculateQualityScore(provider: ProviderId): number {
  const config = getProviderConfig(provider);
  return config?.qualityScore ?? 50;
}

// ============================================================================
// Cost Router Class
// ============================================================================

/**
 * Cost-optimized router for Pi providers
 *
 * Routes requests to the most cost-effective provider while maintaining
 * quality and capability requirements. Tracks costs and enforces budgets.
 */
export class CostRouter extends EventEmitter {
  private budgetConfig: BudgetConfig;
  private costHistory: Map<string, CostRecord[]> = new Map();
  private periodStart: number = Date.now();
  private currentPeriodCost: number = 0;

  /**
   * Creates a new CostRouter
   *
   * @param config - Budget configuration
   */
  constructor(config: Partial<BudgetConfig> = {}) {
    super();
    this.budgetConfig = { ...DEFAULT_BUDGET_CONFIG, ...config };
  }

  /**
   * Routes a request to the most cost-effective provider
   *
   * @param request - Cost routing request
   * @param providers - Available providers
   * @returns Cost routing result
   */
  route(request: CostRoutingRequest, providers: PiInstance[]): CostRoutingResult {
    if (providers.length === 0) {
      throw new PiRegistryError('No providers available for routing', 'NO_PROVIDERS');
    }

    // Filter by capabilities if specified
    let candidates = providers;
    if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
      candidates = providers.filter((p) =>
        request.requiredCapabilities!.every((cap) => p.capabilities.includes(cap))
      );
    }

    if (candidates.length === 0) {
      throw new PiRegistryError(
        'No providers meet capability requirements',
        'NO_CAPABLE_PROVIDERS'
      );
    }

    // Score each candidate
    const scored = candidates.map((provider) => {
      const costEstimate = estimateCost(provider, request.estimatedTokens, request.inputRatio);

      // Check max cost constraint
      if (request.maxCost && costEstimate.totalCost > request.maxCost) {
        return null;
      }

      // Calculate scores
      const costScore = calculateCostScore(costEstimate, this.budgetConfig.maxCostPerRequest);
      const qualityScore = calculateQualityScore(provider.provider);

      // Capability score
      let capabilityScore = 100;
      if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
        const matching = request.requiredCapabilities.filter((cap) =>
          provider.capabilities.includes(cap)
        ).length;
        capabilityScore = (matching / request.requiredCapabilities.length) * 100;
      }

      // Combine scores
      // If prioritizing quality, weight quality higher
      const qualityWeight = request.prioritizeQuality ? 0.5 : 0.3;
      const costWeight = request.prioritizeQuality ? 0.3 : 0.5;
      const capabilityWeight = 0.2;

      const score =
        costScore * costWeight +
        qualityScore * qualityWeight +
        capabilityScore * capabilityWeight;

      return {
        provider,
        costEstimate,
        score,
        scoreBreakdown: {
          costScore,
          qualityScore,
          capabilityScore,
        },
      };
    });

    // Filter out nulls and sort by score descending
    const valid = scored.filter((s): s is NonNullable<typeof s> => s !== null);
    valid.sort((a, b) => b.score - a.score);

    if (valid.length === 0) {
      throw new PiRegistryError(
        'No providers meet cost constraints',
        'COST_CONSTRAINT_VIOLATED'
      );
    }

    const selected = valid[0];

    // Check budget
    this.checkPeriodReset();
    const withinBudget =
      this.currentPeriodCost + selected.costEstimate.totalCost <=
      this.budgetConfig.maxCostPerPeriod;

    const result: CostRoutingResult = {
      provider: selected.provider,
      costEstimate: selected.costEstimate,
      alternatives: valid.slice(1).map((v) => ({
        provider: v.provider,
        costEstimate: v.costEstimate,
        score: v.score,
      })),
      withinBudget,
      scoreBreakdown: selected.scoreBreakdown,
    };

    this.emit('routed', request.requestId, result);

    return result;
  }

  /**
   * Records actual cost after request completion
   *
   * @param record - Cost record
   */
  recordCost(record: CostRecord): void {
    // Add to history
    const history = this.costHistory.get(record.provider) || [];
    history.push(record);

    // Keep last 1000 records per provider
    if (history.length > 1000) {
      history.shift();
    }

    this.costHistory.set(record.provider, history);

    // Update period cost
    this.checkPeriodReset();
    this.currentPeriodCost += record.actualCost;

    this.emit('cost.recorded', record);

    // Check budget alert
    const budgetPercent = (this.currentPeriodCost / this.budgetConfig.maxCostPerPeriod) * 100;
    if (budgetPercent >= this.budgetConfig.alertThreshold) {
      this.emit('budget.alert', {
        current: this.currentPeriodCost,
        max: this.budgetConfig.maxCostPerPeriod,
        percent: budgetPercent,
      });
    }
  }

  /**
   * Gets cost statistics for a provider
   *
   * @param provider - Provider identifier
   * @param timeframeMs - Timeframe in milliseconds
   * @returns Cost statistics
   */
  getProviderStats(
    provider: ProviderId,
    timeframeMs: number = 3600000
  ): {
    totalRequests: number;
    totalCost: number;
    averageCost: number;
    minCost: number;
    maxCost: number;
  } {
    const history = this.costHistory.get(provider) || [];
    const cutoff = Date.now() - timeframeMs;
    const recent = history.filter((r) => r.timestamp.getTime() > cutoff);

    if (recent.length === 0) {
      return {
        totalRequests: 0,
        totalCost: 0,
        averageCost: 0,
        minCost: 0,
        maxCost: 0,
      };
    }

    const costs = recent.map((r) => r.actualCost);

    return {
      totalRequests: recent.length,
      totalCost: costs.reduce((sum, c) => sum + c, 0),
      averageCost: costs.reduce((sum, c) => sum + c, 0) / costs.length,
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
    };
  }

  /**
   * Gets overall cost statistics
   *
   * @returns Overall cost statistics
   */
  getOverallStats(): {
    totalCost: number;
    totalRequests: number;
    periodCost: number;
    budgetRemaining: number;
    budgetPercentUsed: number;
  } {
    let totalRequests = 0;
    let totalCost = 0;

    for (const history of this.costHistory.values()) {
      totalRequests += history.length;
      totalCost += history.reduce((sum, r) => sum + r.actualCost, 0);
    }

    this.checkPeriodReset();

    return {
      totalCost,
      totalRequests,
      periodCost: this.currentPeriodCost,
      budgetRemaining: Math.max(0, this.budgetConfig.maxCostPerPeriod - this.currentPeriodCost),
      budgetPercentUsed: (this.currentPeriodCost / this.budgetConfig.maxCostPerPeriod) * 100,
    };
  }

  /**
   * Checks and resets period if needed
   */
  private checkPeriodReset(): void {
    if (Date.now() - this.periodStart > this.budgetConfig.periodMs) {
      this.periodStart = Date.now();
      this.currentPeriodCost = 0;
      this.emit('period.reset');
    }
  }

  /**
   * Checks if a request is within budget
   *
   * @param estimatedCost - Estimated cost of request
   * @returns True if within budget
   */
  isWithinBudget(estimatedCost: number): boolean {
    this.checkPeriodReset();
    return this.currentPeriodCost + estimatedCost <= this.budgetConfig.maxCostPerPeriod;
  }

  /**
   * Gets the remaining budget
   *
   * @returns Remaining budget in USD
   */
  getRemainingBudget(): number {
    this.checkPeriodReset();
    return Math.max(0, this.budgetConfig.maxCostPerPeriod - this.currentPeriodCost);
  }

  /**
   * Updates budget configuration
   *
   * @param config - New budget configuration (partial)
   */
  updateBudgetConfig(config: Partial<BudgetConfig>): void {
    this.budgetConfig = { ...this.budgetConfig, ...config };
    this.emit('config.updated', this.budgetConfig);
  }

  /**
   * Gets current budget configuration
   *
   * @returns Current budget configuration
   */
  getBudgetConfig(): BudgetConfig {
    return { ...this.budgetConfig };
  }

  /**
   * Clears cost history
   */
  clearHistory(): void {
    this.costHistory.clear();
    this.currentPeriodCost = 0;
    this.periodStart = Date.now();
    this.emit('history.cleared');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalCostRouter: CostRouter | null = null;

/**
 * Gets the global CostRouter instance
 *
 * @returns Global CostRouter
 */
export function getGlobalCostRouter(): CostRouter {
  if (!globalCostRouter) {
    globalCostRouter = new CostRouter();
  }
  return globalCostRouter;
}

/**
 * Resets the global CostRouter (for testing)
 */
export function resetGlobalCostRouter(): void {
  globalCostRouter = null;
}

// Default export
export default CostRouter;
