/**
 * Model Router for Multi-Provider Orchestration
 *
 * Routes tasks to different LLM providers based on task characteristics,
 * cost optimization, and capability requirements. Provides intelligent
 * routing strategies, cost tracking, circuit breakers, and fallback chains.
 *
 * @example
 * ```typescript
 * const router = new ModelRouter(registry, {
 *   defaultStrategy: 'cost_optimized',
 *   maxCostPerRequest: 0.50
 * });
 *
 * const decision = router.route({
 *   taskType: 'code-generation',
 *   requiredCapabilities: ['typescript', 'code-generation'],
 *   estimatedTokens: 2000,
 *   priority: 'normal'
 * });
 *
 * const result = await router.executeWithFallback(decision);
 * ```
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  PiInstance,
  HealthStatus,
  ProviderId,
  PiCapability,
  PiRegistryError,
} from './types';
import { PiRegistry } from './registry';

// ============================================================================
// Router Types
// ============================================================================

/**
 * Routing request for model selection
 */
export interface RoutingRequest {
  /** Unique request identifier */
  requestId: string;

  /** Type of task being performed */
  taskType: string;

  /** Required capabilities for the task */
  requiredCapabilities: string[];

  /** Estimated token count for the request */
  estimatedTokens: number;

  /** Task priority level */
  priority: 'low' | 'normal' | 'high' | 'critical';

  /** Preferred provider (optional) */
  preferredProvider?: string;

  /** Maximum acceptable cost (optional) */
  maxCost?: number;

  /** Maximum acceptable latency in ms (optional) */
  maxLatency?: number;

  /** Minimum quality/capability score required (0-100) */
  minQualityScore?: number;

  /** Context for routing decisions */
  context?: {
    previousAttempts?: string[];
    userTier?: 'free' | 'pro' | 'enterprise';
    complexity?: 'simple' | 'moderate' | 'complex';
  };
}

/**
 * Routing decision with selected provider
 */
export interface RoutingDecision {
  /** Request that generated this decision */
  request: RoutingRequest;

  /** Selected provider instance */
  selectedProvider: PiInstance;

  /** Strategy used for routing */
  strategy: string;

  /** Score of the selected provider */
  score: number;

  /** Alternative providers considered */
  alternatives: PiInstance[];

  /** Cost estimate for this routing */
  costEstimate: CostEstimate;

  /** Timestamp of the decision */
  decidedAt: Date;

  /** Expected latency estimate in ms */
  expectedLatency: number;

  /** Fallback chain for this request */
  fallbackChain: string[];
}

/**
 * Cost estimate for a routing decision
 */
export interface CostEstimate {
  /** Provider identifier */
  provider: string;

  /** Model identifier */
  model: string;

  /** Input cost per 1k tokens */
  inputCost: number;

  /** Output cost per 1k tokens */
  outputCost: number;

  /** Estimated total cost */
  estimatedTotal: number;

  /** Currency code */
  currency: string;
}

/**
 * Cost record for historical tracking
 */
export interface CostRecord {
  /** Provider identifier */
  provider: string;

  /** Request identifier */
  requestId: string;

  /** Actual cost incurred */
  actualCost: number;

  /** Estimated cost */
  estimatedCost: number;

  /** Tokens used */
  tokensUsed: number;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Request identifier */
  requestId: string;

  /** Provider used */
  provider: string;

  /** Input tokens consumed */
  inputTokens: number;

  /** Output tokens consumed */
  outputTokens: number;

  /** Total tokens used */
  totalTokens: number;

  /** Actual cost if available */
  actualCost?: number;
}

/**
 * Health status with extended metrics
 */
export interface ExtendedHealthStatus {
  /** Current health status */
  status: HealthStatus;

  /** Response time in ms */
  responseTimeMs: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Error rate (0-1) */
  errorRate: number;

  /** Last error timestamp */
  lastError?: Date;

  /** Consecutive failures */
  consecutiveFailures: number;

  /** Total requests processed */
  totalRequests: number;

  /** Circuit breaker state */
  circuitState: 'closed' | 'open' | 'half-open';

  /** Last checked timestamp */
  lastChecked: Date;
}

/**
 * Routing strategy interface
 */
export interface RoutingStrategy {
  /** Strategy name */
  name: string;

  /** Strategy description */
  description?: string;

  /** Select provider from candidates */
  select(
    request: RoutingRequest,
    providers: PiInstance[],
    context?: RoutingContext
  ): StrategyResult;
}

/**
 * Strategy selection result
 */
export interface StrategyResult {
  /** Selected provider or null if none suitable */
  provider: PiInstance | null;

  /** Score of the selection (higher is better) */
  score: number;

  /** Reason for selection */
  reason: string;

  /** Alternative providers ranked */
  alternatives: PiInstance[];
}

/**
 * Routing context for strategy decisions
 */
export interface RoutingContext {
  /** Cost history for providers */
  costHistory: Map<string, CostRecord[]>;

  /** Health status for providers */
  healthStatus: Map<string, ExtendedHealthStatus>;

  /** Default latency per provider */
  defaultLatency: Map<string, number>;
}

/**
 * Router configuration
 */
export interface RouterConfig {
  /** Default routing strategy */
  defaultStrategy?: string;

  /** Maximum cost per request */
  maxCostPerRequest?: number;

  /** Cost budget period in ms */
  costBudgetPeriodMs?: number;

  /** Maximum budget for the period */
  maxBudgetPerPeriod?: number;

  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number;

  /** Circuit breaker reset timeout ms */
  circuitBreakerResetMs?: number;

  /** Enable cost tracking */
  enableCostTracking?: boolean;

  /** Fallback chain order */
  fallbackChain?: string[];
}

/**
 * Routing result from execution
 */
export interface RoutingResult {
  /** Success status */
  success: boolean;

  /** Provider that handled the request */
  provider: string;

  /** Result data */
  data?: unknown;

  /** Error if failed */
  error?: Error;

  /** Number of attempts made */
  attempts: number;

  /** Providers tried */
  providersTried: string[];

  /** Total time taken in ms */
  durationMs: number;

  /** Actual token usage */
  tokenUsage?: TokenUsage;
}

/**
 * Error categories for retry decisions
 */
export type ErrorCategory =
  | 'transient'       // Retry with backoff
  | 'rate_limit'      // Retry after delay
  | 'auth'            // Fail immediately
  | 'invalid_request' // Fail immediately
  | 'context_length'  // Try compacting or shorter model
  | 'fatal'           // Fail and alert
  | 'unknown';        // Default, retry once

/**
 * Circuit breaker state for providers
 */
interface CircuitBreakerState {
  /** Current state */
  state: 'closed' | 'open' | 'half-open';

  /** Number of consecutive failures */
  failures: number;

  /** Last failure timestamp */
  lastFailureTime: number | null;

  /** Total requests */
  totalRequests: number;

  /** Successful requests */
  successfulRequests: number;
}

// ============================================================================
// Cost Configuration
// ============================================================================

/**
 * Model pricing per 1k tokens (input/output)
 * Prices in USD, approximate as of 2024
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
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
};

/**
 * Default latency estimates per provider (ms)
 */
const DEFAULT_LATENCY: Record<string, number> = {
  anthropic: 1500,
  openai: 1200,
  google: 1000,
  groq: 300,
  cerebras: 200,
  ollama: 500,
  kimi: 1800,
  minimax: 1500,
  custom: 2000,
};

/**
 * Provider capability scores (0-100)
 */
const PROVIDER_CAPABILITY_SCORES: Record<string, number> = {
  anthropic: 95,
  openai: 95,
  google: 88,
  groq: 75,
  cerebras: 70,
  kimi: 85,
  minimax: 72,
  ollama: 60,
  custom: 50,
};

/**
 * Context window sizes per model
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4-5': 200000,
  'claude-opus-4': 200000,
  'claude-haiku-4': 200000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
  'kimi-k2.5': 256000,
};

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Classifies an error into a category for retry decisions
 *
 * @param error - Error to classify
 * @returns Error category
 */
export function classifyError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const code = (error as { code?: string }).code?.toLowerCase() || '';

  // Rate limit errors
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    code === 'rate_limit_exceeded' ||
    code === '429'
  ) {
    return 'rate_limit';
  }

  // Authentication errors
  if (
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('api key') ||
    message.includes('401') ||
    message.includes('403') ||
    code === 'unauthorized' ||
    code === '401' ||
    code === '403'
  ) {
    return 'auth';
  }

  // Context length errors
  if (
    message.includes('context length') ||
    message.includes('too long') ||
    message.includes('token limit') ||
    message.includes('maximum context') ||
    code === 'context_length_exceeded'
  ) {
    return 'context_length';
  }

  // Invalid request errors
  if (
    message.includes('invalid request') ||
    message.includes('bad request') ||
    message.includes('validation') ||
    code === 'invalid_request' ||
    code === '400'
  ) {
    return 'invalid_request';
  }

  // Transient errors (network, timeout, etc.)
  if (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('socket') ||
    message.includes('temporarily unavailable') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    code === 'timeout' ||
    code === '503'
  ) {
    return 'transient';
  }

  // Fatal errors
  if (
    message.includes('not found') ||
    message.includes('deprecated') ||
    message.includes('unsupported') ||
    code === 'not_found' ||
    code === '404'
  ) {
    return 'fatal';
  }

  return 'unknown';
}

/**
 * Gets the retry delay for an error category
 *
 * @param error - Error that occurred
 * @param attemptCount - Number of attempts made so far
 * @returns Delay in milliseconds before retry
 */
export function getRetryDelay(error: Error, attemptCount: number): number {
  const category = classifyError(error);

  switch (category) {
    case 'transient':
      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      return Math.min(1000 * Math.pow(2, attemptCount - 1), 30000);

    case 'rate_limit':
      // Rate limits: respect Retry-After or use 60s default
      const retryAfter = (error as { retryAfter?: number }).retryAfter;
      if (retryAfter) {
        return retryAfter * 1000;
      }
      // Exponential backoff starting at 5s
      return Math.min(5000 * Math.pow(2, attemptCount - 1), 60000);

    case 'context_length':
      // Don't retry context length errors automatically
      return -1;

    case 'auth':
    case 'invalid_request':
    case 'fatal':
      // Don't retry these
      return -1;

    case 'unknown':
    default:
      // Single retry for unknown errors
      return attemptCount === 1 ? 1000 : -1;
  }
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Estimates the cost for using a provider
 *
 * @param provider - Provider instance
 * @param estimatedTokens - Estimated token count
 * @returns Cost estimate
 */
export function estimateCost(
  provider: PiInstance,
  estimatedTokens: number
): CostEstimate {
  const model = provider.model;
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[`${provider.provider}-default`] || { input: 1.0, output: 2.0 };

  // Estimate 70% input, 30% output for most tasks
  const inputTokens = Math.floor(estimatedTokens * 0.7);
  const outputTokens = Math.floor(estimatedTokens * 0.3);

  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  const estimatedTotal = inputCost + outputCost;

  return {
    provider: provider.provider,
    model: provider.model,
    inputCost: pricing.input,
    outputCost: pricing.output,
    estimatedTotal,
    currency: 'USD',
  };
}

// ============================================================================
// Capability Scoring
// ============================================================================

/**
 * Scores a provider's capability match for a request
 *
 * Scoring weights:
 * - Required capabilities match: 40%
 * - Model quality/reasoning: 30%
 * - Context window adequacy: 20%
 * - Historical success rate: 10%
 *
 * @param provider - Provider to score
 * @param request - Routing request
 * @param context - Routing context
 * @returns Score from 0-100
 */
export function scoreCapabilityMatch(
  provider: PiInstance,
  request: RoutingRequest,
  context?: RoutingContext
): number {
  let score = 0;

  // 1. Required capabilities match (40%)
  const requiredCaps = request.requiredCapabilities || [];
  if (requiredCaps.length > 0) {
    const matchingCaps = requiredCaps.filter((cap) =>
      provider.capabilities.includes(cap as PiCapability)
    ).length;
    const capabilityScore = (matchingCaps / requiredCaps.length) * 40;
    score += capabilityScore;
  } else {
    score += 40; // Full score if no requirements
  }

  // 2. Model quality/reasoning capability (30%)
  const providerScore = PROVIDER_CAPABILITY_SCORES[provider.provider] || 50;
  score += (providerScore / 100) * 30;

  // 3. Context window adequacy (20%)
  const contextWindow = MODEL_CONTEXT_WINDOWS[provider.model] || 128000;
  const requiredContext = request.estimatedTokens || 4000;
  if (contextWindow >= requiredContext * 2) {
    score += 20; // Plenty of room
  } else if (contextWindow >= requiredContext * 1.5) {
    score += 15; // Good room
  } else if (contextWindow >= requiredContext) {
    score += 10; // Adequate
  } else if (contextWindow >= requiredContext * 0.75) {
    score += 5; // Tight but possible
  } // else 0 - insufficient context

  // 4. Historical success rate (10%)
  if (context?.healthStatus) {
    const health = context.healthStatus.get(provider.id);
    if (health) {
      score += health.successRate * 10;
    } else {
      score += 5; // Neutral for unknown providers
    }
  } else {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

// ============================================================================
// Routing Strategies
// ============================================================================

/**
 * Cost-optimized routing strategy
 * Selects the cheapest provider that meets requirements
 */
const costOptimizedStrategy: RoutingStrategy = {
  name: 'cost_optimized',
  description: 'Selects the most cost-effective provider that meets all requirements',

  select(request: RoutingRequest, providers: PiInstance[]): StrategyResult {
    if (providers.length === 0) {
      return {
        provider: null,
        score: 0,
        reason: 'No providers available',
        alternatives: [],
      };
    }

    // Filter by required capabilities
    const requiredCaps = request.requiredCapabilities || [];
    const capable = requiredCaps.length > 0
      ? providers.filter((p) =>
          requiredCaps.every((cap) => p.capabilities.includes(cap as PiCapability))
        )
      : providers;

    if (capable.length === 0) {
      return {
        provider: null,
        score: 0,
        reason: 'No providers meet capability requirements',
        alternatives: [],
      };
    }

    // Score by cost (lower is better, so invert)
    const scored = capable.map((provider) => {
      const cost = estimateCost(provider, request.estimatedTokens);
      // Inverse scoring: cheaper gets higher score
      const maxCost = 10.0; // Assume $0.01 per request as max reasonable
      const costScore = Math.max(0, (maxCost - cost.estimatedTotal) / maxCost) * 100;

      return { provider, score: costScore, cost };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0];
    const alternatives = scored.slice(1).map((s) => s.provider);

    return {
      provider: selected.provider,
      score: selected.score,
      reason: `Cost-optimized: $${selected.cost.estimatedTotal.toFixed(4)} estimated`,
      alternatives,
    };
  },
};

/**
 * Capability-matched routing strategy
 * Selects the provider best suited for the task
 */
const capabilityStrategy: RoutingStrategy = {
  name: 'capability_matched',
  description: 'Selects the provider best suited for the task based on capabilities',

  select(request: RoutingRequest, providers: PiInstance[], context?: RoutingContext): StrategyResult {
    if (providers.length === 0) {
      return {
        provider: null,
        score: 0,
        reason: 'No providers available',
        alternatives: [],
      };
    }

    // Score all providers by capability
    const scored = providers.map((provider) => ({
      provider,
      score: scoreCapabilityMatch(provider, request, context),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Filter by minimum quality if specified
    const minQuality = request.minQualityScore || 0;
    const qualified = scored.filter((s) => s.score >= minQuality);

    if (qualified.length === 0) {
      return {
        provider: null,
        score: 0,
        reason: `No providers meet minimum quality score of ${minQuality}`,
        alternatives: scored.slice(0, 3).map((s) => s.provider),
      };
    }

    const selected = qualified[0];
    const alternatives = qualified.slice(1).map((s) => s.provider);

    return {
      provider: selected.provider,
      score: selected.score,
      reason: `Capability-matched: score ${selected.score.toFixed(1)}/100`,
      alternatives,
    };
  },
};

/**
 * Latency-optimized routing strategy
 * Selects the provider with lowest latency
 */
const latencyStrategy: RoutingStrategy = {
  name: 'latency_optimized',
  description: 'Selects the provider with the lowest expected latency',

  select(request: RoutingRequest, providers: PiInstance[], context?: RoutingContext): StrategyResult {
    if (providers.length === 0) {
      return {
        provider: null,
        score: 0,
        reason: 'No providers available',
        alternatives: [],
      };
    }

    // Filter healthy providers
    const healthy = providers.filter((p) => p.health === 'healthy' || p.health === 'degraded');

    if (healthy.length === 0) {
      return {
        provider: null,
        score: 0,
        reason: 'No healthy providers available',
        alternatives: providers.slice(0, 3),
      };
    }

    // Score by latency (lower is better)
    const scored = healthy.map((provider) => {
      const latency = context?.defaultLatency?.get(provider.provider) ||
        DEFAULT_LATENCY[provider.provider] || 2000;

      // Inverse scoring: faster gets higher score
      const maxLatency = 5000;
      const latencyScore = Math.max(0, (maxLatency - latency) / maxLatency) * 100;

      return { provider, score: latencyScore, latency };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0];
    const alternatives = scored.slice(1).map((s) => s.provider);

    return {
      provider: selected.provider,
      score: selected.score,
      reason: `Latency-optimized: ~${selected.latency}ms expected`,
      alternatives,
    };
  },
};

/**
 * Fallback chain routing strategy
 * Builds a chain of providers to try in order
 */
const fallbackStrategy: RoutingStrategy = {
  name: 'fallback_chain',
  description: 'Builds a chain of providers to try in order of preference',

  select(request: RoutingRequest, providers: PiInstance[], context?: RoutingContext): StrategyResult {
    if (providers.length === 0) {
      return {
        provider: null,
        score: 0,
        reason: 'No providers available',
        alternatives: [],
      };
    }

    // Define fallback order
    const fallbackOrder = ['anthropic', 'openai', 'google', 'kimi', 'groq', 'cerebras', 'minimax'];

    // Filter by capability requirements first
    const requiredCaps = request.requiredCapabilities || [];
    const capable = requiredCaps.length > 0
      ? providers.filter((p) =>
          requiredCaps.every((cap) => p.capabilities.includes(cap as PiCapability))
        )
      : providers;

    // Sort by fallback order, then by health
    const sorted = capable.sort((a, b) => {
      const aIndex = fallbackOrder.indexOf(a.provider);
      const bIndex = fallbackOrder.indexOf(b.provider);

      // Providers not in list go to end
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;

      // Prefer healthy providers
      if (a.health === 'healthy' && b.health !== 'healthy') return -1;
      if (b.health === 'healthy' && a.health !== 'healthy') return 1;

      return aIndex - bIndex;
    });

    if (sorted.length === 0) {
      return {
        provider: null,
        score: 0,
        reason: 'No providers meet capability requirements',
        alternatives: [],
      };
    }

    const selected = sorted[0];
    const alternatives = sorted.slice(1);

    return {
      provider: selected,
      score: 100,
      reason: `Fallback chain: ${selected.provider} (first in chain)`,
      alternatives,
    };
  },
};

// ============================================================================
// ModelRouter Class
// ============================================================================

/**
 * Model Router for intelligent provider selection
 *
 * Provides multiple routing strategies, cost tracking, circuit breakers,
 * and fallback chains for resilient multi-provider orchestration.
 *
 * Events emitted:
 * - 'routing.decision' - When a routing decision is made
 * - 'routing.failed' - When routing fails
 * - 'provider.unhealthy' - When a provider is marked unhealthy
 * - 'cost.recorded' - When a cost is recorded
 * - 'circuit.opened' - When a circuit breaker opens
 * - 'circuit.closed' - When a circuit breaker closes
 */
export class ModelRouter extends EventEmitter {
  /** Provider registry reference */
  private registry: PiRegistry;

  /** Routing strategies */
  private strategies: Map<string, RoutingStrategy>;

  /** Cost tracking history */
  private costHistory: Map<string, CostRecord[]>;

  /** Default strategy name */
  private defaultStrategy: string;

  /** Router configuration */
  private config: RouterConfig;

  /** Circuit breaker states */
  private circuitBreakers: Map<string, CircuitBreakerState>;

  /** Extended health status for providers */
  private healthStatus: Map<string, ExtendedHealthStatus>;

  /** Current period cost total */
  private currentPeriodCost: number = 0;

  /** Cost period start timestamp */
  private periodStartTime: number = Date.now();

  /**
   * Creates a new ModelRouter instance.
   *
   * @param registry - PiRegistry for provider discovery
   * @param config - Router configuration
   */
  constructor(registry: PiRegistry, config: RouterConfig = {}) {
    super();
    this.registry = registry;
    this.config = {
      defaultStrategy: 'capability_matched',
      maxCostPerRequest: 10.0,
      costBudgetPeriodMs: 3600000, // 1 hour
      maxBudgetPerPeriod: 100.0,
      circuitBreakerThreshold: 5,
      circuitBreakerResetMs: 60000,
      enableCostTracking: true,
      fallbackChain: ['anthropic', 'openai', 'google', 'kimi', 'groq'],
      ...config,
    };

    this.strategies = new Map();
    this.costHistory = new Map();
    this.circuitBreakers = new Map();
    this.healthStatus = new Map();
    this.defaultStrategy = this.config.defaultStrategy!;

    // Register default strategies
    this.registerStrategy(costOptimizedStrategy);
    this.registerStrategy(capabilityStrategy);
    this.registerStrategy(latencyStrategy);
    this.registerStrategy(fallbackStrategy);

    logger.info('[ModelRouter] Initialized with strategy: %s', this.defaultStrategy);
  }

  /**
   * Gets the routing context for strategy decisions.
   *
   * @returns Current routing context
   */
  private getRoutingContext(): RoutingContext {
    const defaultLatency = new Map<string, number>();
    for (const provider of this.registry.getAllInstances()) {
      defaultLatency.set(provider.provider, DEFAULT_LATENCY[provider.provider] || 2000);
    }

    return {
      costHistory: this.costHistory,
      healthStatus: this.healthStatus,
      defaultLatency,
    };
  }

  /**
   * Main routing method - selects the best provider for a request.
   *
   * @param request - Routing request
   * @param strategyName - Optional routing strategy override
   * @returns Routing decision
   * @throws {PiRegistryError} If no suitable provider found
   */
  route(request: RoutingRequest, strategyName?: string): RoutingDecision {
    strategyName = strategyName || this.defaultStrategy;
    const strategy = this.strategies.get(strategyName);

    if (!strategy) {
      throw new PiRegistryError(
        `Unknown routing strategy: ${strategyName}`,
        'INVALID_STRATEGY',
        { strategy: strategyName }
      );
    }

    // Check cost budget
    if (this.config.maxCostPerRequest) {
      const estimatedCost = this.estimateRequestCost(request);
      if (estimatedCost > this.config.maxCostPerRequest) {
        throw new PiRegistryError(
          `Request estimated cost $${estimatedCost.toFixed(4)} exceeds maximum $${this.config.maxCostPerRequest}`,
          'COST_LIMIT_EXCEEDED',
          { estimatedCost, maxCost: this.config.maxCostPerRequest }
        );
      }
    }

    // Get healthy providers with circuit breaker check
    const providers = this.registry.getHealthyInstances().filter((p) =>
      this.checkCircuitBreaker(p.id)
    );

    if (providers.length === 0) {
      // Try to get any provider if no healthy ones
      const allProviders = this.registry.getAllInstances().filter((p) =>
        this.checkCircuitBreaker(p.id)
      );

      if (allProviders.length === 0) {
        throw new PiRegistryError(
          'No available providers (all circuit breakers open or unhealthy)',
          'NO_PROVIDERS_AVAILABLE'
        );
      }
    }

    // Apply strategy
    const context = this.getRoutingContext();
    const result = strategy.select(request, providers, context);

    if (!result.provider) {
      this.emit('routing.failed', request, result.reason);
      throw new PiRegistryError(
        `Routing failed: ${result.reason}`,
        'ROUTING_FAILED',
        { request, reason: result.reason }
      );
    }

    // Calculate cost estimate
    const costEstimate = estimateCost(result.provider, request.estimatedTokens);

    // Get expected latency
    const expectedLatency = context.defaultLatency.get(result.provider.provider) || 2000;

    // Build fallback chain
    const fallbackChain = this.getFallbackChain(result.provider.provider);

    const decision: RoutingDecision = {
      request,
      selectedProvider: result.provider,
      strategy: strategyName,
      score: result.score,
      alternatives: result.alternatives,
      costEstimate,
      decidedAt: new Date(),
      expectedLatency,
      fallbackChain,
    };

    this.emit('routing.decision', decision);
    logger.debug(
      '[ModelRouter] Routed request %s to %s using %s strategy',
      request.requestId,
      result.provider.id,
      strategyName
    );

    return decision;
  }

  /**
   * Estimates the cost for a request.
   *
   * @param request - Routing request
   * @returns Estimated cost
   */
  private estimateRequestCost(request: RoutingRequest): number {
    // Use average pricing as estimate
    const avgInputCost = 0.005; // $0.005 per 1k tokens
    const avgOutputCost = 0.015; // $0.015 per 1k tokens
    const tokens = request.estimatedTokens || 4000;

    return (tokens / 1000) * (avgInputCost + avgOutputCost);
  }

  /**
   * Gets the health status for a specific provider.
   *
   * @param providerId - Provider instance ID
   * @returns Extended health status
   */
  getProviderHealth(providerId: string): ExtendedHealthStatus {
    const existing = this.healthStatus.get(providerId);
    if (existing) {
      return existing;
    }

    // Return default health status
    const instance = this.registry.getInstance(providerId);
    return {
      status: instance?.health || 'unknown',
      responseTimeMs: 0,
      successRate: 1.0,
      errorRate: 0.0,
      consecutiveFailures: 0,
      totalRequests: 0,
      circuitState: this.circuitBreakers.get(providerId)?.state || 'closed',
      lastChecked: new Date(),
    };
  }

  /**
   * Gets health status for all providers.
   *
   * @returns Map of provider IDs to health status
   */
  getAllProviderHealth(): Map<string, ExtendedHealthStatus> {
    const allHealth = new Map<string, ExtendedHealthStatus>();

    for (const instance of this.registry.getAllInstances()) {
      allHealth.set(instance.id, this.getProviderHealth(instance.id));
    }

    return allHealth;
  }

  /**
   * Gets a cost estimate for a provider.
   *
   * @param providerId - Provider instance ID
   * @param tokenEstimate - Estimated token count
   * @returns Cost estimate
   */
  getCostEstimate(providerId: string, tokenEstimate: number): CostEstimate {
    const provider = this.registry.getInstance(providerId);
    if (!provider) {
      throw new PiRegistryError(
        `Provider not found: ${providerId}`,
        'PROVIDER_NOT_FOUND',
        { providerId }
      );
    }

    return estimateCost(provider, tokenEstimate);
  }

  /**
   * Records actual cost from token usage.
   *
   * @param usage - Token usage statistics
   * @param provider - Provider identifier
   */
  recordActualCost(usage: TokenUsage, provider: string): void {
    if (!this.config.enableCostTracking) {
      return;
    }

    const pricing = MODEL_PRICING[usage.provider] || { input: 1.0, output: 2.0 };
    const inputCost = (usage.inputTokens / 1000) * pricing.input;
    const outputCost = (usage.outputTokens / 1000) * pricing.output;
    const actualCost = inputCost + outputCost;

    const record: CostRecord = {
      provider,
      requestId: usage.requestId,
      actualCost,
      estimatedCost: actualCost, // Will be updated if we have estimate
      tokensUsed: usage.totalTokens,
      timestamp: new Date(),
    };

    // Add to history
    const history = this.costHistory.get(provider) || [];
    history.push(record);

    // Keep last 1000 records
    if (history.length > 1000) {
      history.shift();
    }

    this.costHistory.set(provider, history);

    // Update current period cost
    this.currentPeriodCost += actualCost;

    this.emit('cost.recorded', record);
    logger.debug(
      '[ModelRouter] Recorded cost for %s: $%.6f (%d tokens)',
      provider,
      actualCost,
      usage.totalTokens
    );
  }

  /**
   * Gets the average cost for a provider over a timeframe.
   *
   * @param providerId - Provider identifier
   * @param timeframe - Timeframe in milliseconds (default: 1 hour)
   * @returns Average cost per request
   */
  getAverageCost(providerId: string, timeframe: number = 3600000): number {
    const history = this.costHistory.get(providerId) || [];
    const cutoff = Date.now() - timeframe;

    const recent = history.filter((r) => r.timestamp.getTime() > cutoff);

    if (recent.length === 0) {
      return 0;
    }

    const total = recent.reduce((sum, r) => sum + r.actualCost, 0);
    return total / recent.length;
  }

  /**
   * Registers a new routing strategy.
   *
   * @param strategy - Routing strategy to register
   */
  registerStrategy(strategy: RoutingStrategy): void {
    this.strategies.set(strategy.name, strategy);
    logger.debug('[ModelRouter] Registered strategy: %s', strategy.name);
  }

  /**
   * Sets the default routing strategy.
   *
   * @param strategyName - Strategy name
   * @throws {PiRegistryError} If strategy doesn't exist
   */
  setDefaultStrategy(strategyName: string): void {
    if (!this.strategies.has(strategyName)) {
      throw new PiRegistryError(
        `Unknown routing strategy: ${strategyName}`,
        'INVALID_STRATEGY',
        { available: Array.from(this.strategies.keys()) }
      );
    }

    this.defaultStrategy = strategyName;
    logger.info('[ModelRouter] Default strategy set to: %s', strategyName);
  }

  /**
   * Gets the fallback chain for a primary provider.
   *
   * @param primaryProvider - Primary provider ID
   * @returns Ordered list of fallback provider IDs
   */
  getFallbackChain(primaryProvider: string): string[] {
    const chain = this.config.fallbackChain || ['anthropic', 'openai', 'google', 'kimi', 'groq'];
    const primaryIndex = chain.indexOf(primaryProvider);

    if (primaryIndex === -1) {
      // Primary not in chain, prepend it
      return [primaryProvider, ...chain];
    }

    // Return chain starting from primary
    return chain.slice(primaryIndex);
  }

  /**
   * Executes a request with automatic fallback.
   *
   * @param request - Routing request
   * @returns Routing result
   */
  async executeWithFallback(request: RoutingRequest): Promise<RoutingResult> {
    const startTime = Date.now();
    const providersTried: string[] = [];
    let attempts = 0;

    // Get initial decision
    let decision: RoutingDecision;
    try {
      decision = this.route(request);
    } catch (error) {
      return {
        success: false,
        provider: '',
        error: error instanceof Error ? error : new Error(String(error)),
        attempts: 0,
        providersTried: [],
        durationMs: Date.now() - startTime,
      };
    }

    // Try primary and fallbacks
    const chain = [decision.selectedProvider.provider, ...decision.fallbackChain];

    for (const providerName of chain) {
      attempts++;
      providersTried.push(providerName);

      // Find a healthy instance of this provider
      const instance = this.registry.selectInstance({
        preferredProvider: providerName,
        requiredCapabilities: request.requiredCapabilities,
      });

      if (!instance) {
        logger.warn('[ModelRouter] No healthy instance for provider: %s', providerName);
        continue;
      }

      try {
        // Update decision for this attempt
        const attemptDecision: RoutingDecision = {
          ...decision,
          selectedProvider: instance,
        };

        // Execute the request
        const result = await this.executeRequest(attemptDecision);

        if (result.success) {
          return {
            success: true,
            provider: instance.id,
            data: result.data,
            attempts,
            providersTried,
            durationMs: Date.now() - startTime,
            tokenUsage: result.tokenUsage,
          };
        }

        // Handle failure
        const error = result.error || new Error('Request failed');
        const category = classifyError(error);

        // Don't retry on certain errors
        if (category === 'auth' || category === 'invalid_request' || category === 'fatal') {
          return {
            success: false,
            provider: instance.id,
            error,
            attempts,
            providersTried,
            durationMs: Date.now() - startTime,
          };
        }

        // Record failure for circuit breaker
        this.recordFailure(instance.id);

        // Calculate retry delay
        const delay = getRetryDelay(error, attempts);
        if (delay > 0) {
          logger.debug('[ModelRouter] Retrying after %dms delay', delay);
          await this.sleep(delay);
        }

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.recordFailure(instance.id);

        logger.error(
          '[ModelRouter] Request failed for %s: %s',
          instance.id,
          err.message
        );
      }
    }

    // All providers exhausted
    return {
      success: false,
      provider: '',
      error: new Error('All providers exhausted'),
      attempts,
      providersTried,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Executes a routing decision (placeholder for actual execution).
   *
   * @param decision - Routing decision
   * @returns Execution result
   */
  private async executeRequest(decision: RoutingDecision): Promise<{
    success: boolean;
    data?: unknown;
    error?: Error;
    tokenUsage?: TokenUsage;
  }> {
    // This is a placeholder - actual implementation would:
    // 1. Connect to the provider
    // 2. Send the request
    // 3. Process the response
    // 4. Record token usage

    // For now, simulate success
    const simulatedTokenUsage: TokenUsage = {
      requestId: decision.request.requestId,
      provider: decision.selectedProvider.provider,
      inputTokens: Math.floor(decision.request.estimatedTokens * 0.7),
      outputTokens: Math.floor(decision.request.estimatedTokens * 0.3),
      totalTokens: decision.request.estimatedTokens,
    };

    // Record the cost
    this.recordActualCost(simulatedTokenUsage, decision.selectedProvider.provider);

    return {
      success: true,
      data: { simulated: true, provider: decision.selectedProvider.id },
      tokenUsage: simulatedTokenUsage,
    };
  }

  /**
   * Checks if circuit breaker allows operation.
   *
   * @param providerId - Provider instance ID
   * @returns True if operation allowed
   */
  private checkCircuitBreaker(providerId: string): boolean {
    const cb = this.circuitBreakers.get(providerId);

    if (!cb) {
      // Initialize new circuit breaker
      this.circuitBreakers.set(providerId, {
        failures: 0,
        lastFailureTime: null,
        state: 'closed',
        totalRequests: 0,
        successfulRequests: 0,
      });
      return true;
    }

    if (cb.state === 'open') {
      const resetTimeout = this.config.circuitBreakerResetMs || 60000;

      if (cb.lastFailureTime && Date.now() - cb.lastFailureTime > resetTimeout) {
        // Transition to half-open
        cb.state = 'half-open';
        logger.info('[ModelRouter] Circuit breaker for %s entering half-open', providerId);
        this.emit('circuit.half-open', providerId);
        return true;
      }

      return false;
    }

    return true;
  }

  /**
   * Records a failure for circuit breaker.
   *
   * @param providerId - Provider instance ID
   */
  private recordFailure(providerId: string): void {
    const cb = this.circuitBreakers.get(providerId);

    if (cb) {
      cb.failures++;
      cb.lastFailureTime = Date.now();

      const threshold = this.config.circuitBreakerThreshold || 5;

      if (cb.failures >= threshold && cb.state === 'closed') {
        cb.state = 'open';
        logger.warn(
          '[ModelRouter] Circuit breaker opened for %s after %d failures',
          providerId,
          cb.failures
        );
        this.emit('circuit.opened', providerId);

        // Update health status
        this.updateHealthStatus(providerId, 'unhealthy');
      }
    }
  }

  /**
   * Records a success for circuit breaker.
   *
   * @param providerId - Provider instance ID
   */
  private recordSuccess(providerId: string): void {
    const cb = this.circuitBreakers.get(providerId);

    if (cb) {
      cb.totalRequests++;
      cb.successfulRequests++;

      if (cb.state === 'half-open') {
        // Reset circuit breaker
        cb.state = 'closed';
        cb.failures = 0;
        logger.info('[ModelRouter] Circuit breaker for %s reset to closed', providerId);
        this.emit('circuit.closed', providerId);
      } else {
        cb.failures = Math.max(0, cb.failures - 1);
      }
    }
  }

  /**
   * Updates health status for a provider.
   *
   * @param providerId - Provider instance ID
   * @param status - Health status
   */
  private updateHealthStatus(providerId: string, status: HealthStatus): void {
    const existing = this.healthStatus.get(providerId);
    const updated: ExtendedHealthStatus = {
      ...existing,
      status,
      lastChecked: new Date(),
      circuitState: this.circuitBreakers.get(providerId)?.state || 'closed',
    } as ExtendedHealthStatus;

    this.healthStatus.set(providerId, updated);
    this.emit('provider.unhealthy', providerId, status);
  }

  /**
   * Checks if within cost budget.
   *
   * @returns True if within budget
   */
  checkBudget(): boolean {
    if (!this.config.maxBudgetPerPeriod) {
      return true;
    }

    // Reset period if needed
    const periodMs = this.config.costBudgetPeriodMs || 3600000;
    if (Date.now() - this.periodStartTime > periodMs) {
      this.currentPeriodCost = 0;
      this.periodStartTime = Date.now();
    }

    return this.currentPeriodCost < this.config.maxBudgetPerPeriod;
  }

  /**
   * Gets current budget status.
   *
   * @returns Budget status
   */
  getBudgetStatus(): {
    current: number;
    max: number;
    remaining: number;
    percentUsed: number;
  } {
    const max = this.config.maxBudgetPerPeriod || Infinity;
    const current = this.currentPeriodCost;
    const remaining = max === Infinity ? Infinity : Math.max(0, max - current);
    const percentUsed = max === Infinity ? 0 : (current / max) * 100;

    return { current, max, remaining, percentUsed };
  }

  /**
   * Gets cost summary for all providers.
   *
   * @returns Cost summary by provider
   */
  getCostSummary(): Map<string, { total: number; requests: number; average: number }> {
    const summary = new Map<string, { total: number; requests: number; average: number }>();

    for (const [provider, history] of this.costHistory) {
      const total = history.reduce((sum, r) => sum + r.actualCost, 0);
      summary.set(provider, {
        total,
        requests: history.length,
        average: history.length > 0 ? total / history.length : 0,
      });
    }

    return summary;
  }

  /**
   * Helper to sleep for a given duration.
   *
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after ms milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Disposes the router and cleans up resources.
   */
  dispose(): void {
    this.removeAllListeners();
    this.costHistory.clear();
    this.circuitBreakers.clear();
    this.healthStatus.clear();
    logger.info('[ModelRouter] Disposed');
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Routing strategies
  costOptimizedStrategy,
  capabilityStrategy,
  latencyStrategy,
  fallbackStrategy,
};

// Default export
export default ModelRouter;
