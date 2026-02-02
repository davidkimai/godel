/**
 * Cost Calculation Module
 *
 * Provides cost attribution to agents/tasks and cost calculation from token counts.
 * Tracks cost history and supports multiple model pricing configurations.
 */

import { logger } from '../utils';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TokenCount {
  prompt: number;
  completion: number;
  total: number;
}

export interface CostBreakdown {
  prompt: number;
  completion: number;
  total: number;
}

export interface ModelPricing {
  promptPerThousand: number; // Cost per 1K prompt tokens in USD
  completionPerThousand: number; // Cost per 1K completion tokens in USD
}

export interface CostEntry {
  id: string;
  timestamp: Date;
  agentId: string;
  taskId: string;
  projectId: string;
  model: string;
  tokens: TokenCount;
  cost: CostBreakdown;
  operation?: string;
  metadata?: Record<string, unknown>;
}

export interface CostSummary {
  agentId?: string;
  taskId?: string;
  projectId?: string;
  totalTokens: number;
  totalCost: number;
  entries: CostEntry[];
}

export interface CostHistoryQuery {
  agentId?: string;
  taskId?: string;
  projectId?: string;
  model?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

// ============================================================================
// Model Pricing Configuration
// ============================================================================

/**
 * Default pricing for supported models (per 1K tokens in USD)
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic models
  'claude-sonnet-4-5': {
    promptPerThousand: 0.003, // $3 per 1M
    completionPerThousand: 0.015, // $15 per 1M
  },
  'claude-3-5-sonnet': {
    promptPerThousand: 0.003,
    completionPerThousand: 0.015,
  },
  'claude-3-opus': {
    promptPerThousand: 0.015,
    completionPerThousand: 0.075,
  },
  'claude-3-haiku': {
    promptPerThousand: 0.00025,
    completionPerThousand: 0.00125,
  },
  // Moonshot models
  'moonshot/kimi-k2-5': {
    promptPerThousand: 0.001, // $1 per 1M
    completionPerThousand: 0.002, // $2 per 1M
  },
  'kimi-k2-5': {
    promptPerThousand: 0.001,
    completionPerThousand: 0.002,
  },
  // OpenAI models (for reference)
  'gpt-4': {
    promptPerThousand: 0.03,
    completionPerThousand: 0.06,
  },
  'gpt-4-turbo': {
    promptPerThousand: 0.01,
    completionPerThousand: 0.03,
  },
  'gpt-3.5-turbo': {
    promptPerThousand: 0.0005,
    completionPerThousand: 0.0015,
  },
  // Default fallback
  default: {
    promptPerThousand: 0.01,
    completionPerThousand: 0.03,
  },
};

// Custom pricing overrides
const customPricing = new Map<string, ModelPricing>();

// Cost history storage
const costHistory: CostEntry[] = [];

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Calculate cost from token counts for a specific model
 */
export function calculateCost(tokens: TokenCount, model: string): CostBreakdown {
  const pricing = getPricing(model);

  if (!pricing) {
    logger.warn(`Unknown model pricing: ${model}, using default pricing`);
  }

  const effectivePricing = pricing || MODEL_PRICING.default;

  const promptCost = (tokens.prompt / 1000) * effectivePricing.promptPerThousand;
  const completionCost = (tokens.completion / 1000) * effectivePricing.completionPerThousand;
  const totalCost = promptCost + completionCost;

  return {
    prompt: Math.round(promptCost * 10000) / 10000,
    completion: Math.round(completionCost * 10000) / 10000,
    total: Math.round(totalCost * 10000) / 10000,
  };
}

/**
 * Calculate cost from raw token counts (prompt + completion)
 */
export function calculateCostFromTokens(
  promptTokens: number,
  completionTokens: number,
  model: string
): CostBreakdown {
  return calculateCost(
    {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    },
    model
  );
}

/**
 * Estimate cost for a planned operation
 */
export function estimateCost(
  estimatedPromptTokens: number,
  estimatedCompletionTokens: number,
  model: string
): CostBreakdown {
  return calculateCostFromTokens(estimatedPromptTokens, estimatedCompletionTokens, model);
}

// ============================================================================
// Model Pricing Management
// ============================================================================

/**
 * Get pricing for a model
 */
export function getPricing(model: string): ModelPricing | undefined {
  // Check custom pricing first
  if (customPricing.has(model)) {
    return customPricing.get(model);
  }

  // Check standard pricing
  return MODEL_PRICING[model] || MODEL_PRICING.default;
}

/**
 * Set custom pricing for a model
 */
export function setPricing(model: string, pricing: ModelPricing): void {
  customPricing.set(model, pricing);
  logger.info(`Custom pricing set for model: ${model}`, { pricing });
}

/**
 * Remove custom pricing for a model (revert to default)
 */
export function removePricing(model: string): boolean {
  const existed = customPricing.has(model);
  customPricing.delete(model);
  return existed;
}

/**
 * Get cost per thousand tokens for a model
 */
export function getCostPerThousandTokens(model: string): ModelPricing {
  return getPricing(model) || MODEL_PRICING.default;
}

/**
 * List all available pricing configurations
 */
export function listPricing(): Record<string, ModelPricing> {
  return {
    ...MODEL_PRICING,
    ...Object.fromEntries(customPricing),
  };
}

// ============================================================================
// Cost Attribution
// ============================================================================

/**
 * Record a cost entry for attribution tracking
 */
export function recordCost(
  agentId: string,
  taskId: string,
  projectId: string,
  model: string,
  tokens: TokenCount,
  operation?: string,
  metadata?: Record<string, unknown>
): CostEntry {
  const cost = calculateCost(tokens, model);

  const entry: CostEntry = {
    id: generateId(),
    timestamp: new Date(),
    agentId,
    taskId,
    projectId,
    model,
    tokens,
    cost,
    operation,
    metadata,
  };

  costHistory.push(entry);
  logger.debug(`Cost recorded: ${entry.id}`, { agentId, taskId, cost: cost.total });

  return entry;
}

/**
 * Get cost history with optional filtering
 */
export function getCostHistory(query: CostHistoryQuery = {}): CostEntry[] {
  let results = [...costHistory];

  if (query.agentId) {
    results = results.filter((e) => e.agentId === query.agentId);
  }

  if (query.taskId) {
    results = results.filter((e) => e.taskId === query.taskId);
  }

  if (query.projectId) {
    results = results.filter((e) => e.projectId === query.projectId);
  }

  if (query.model) {
    results = results.filter((e) => e.model === query.model);
  }

  if (query.since) {
    results = results.filter((e) => e.timestamp >= query.since!);
  }

  if (query.until) {
    results = results.filter((e) => e.timestamp <= query.until!);
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (query.limit) {
    results = results.slice(0, query.limit);
  }

  return results;
}

/**
 * Get cost summary for an agent
 */
export function getAgentCostSummary(agentId: string): CostSummary {
  const entries = getCostHistory({ agentId });
  return summarizeCosts(entries, { agentId });
}

/**
 * Get cost summary for a task
 */
export function getTaskCostSummary(taskId: string): CostSummary {
  const entries = getCostHistory({ taskId });
  return summarizeCosts(entries, { taskId });
}

/**
 * Get cost summary for a project
 */
export function getProjectCostSummary(projectId: string): CostSummary {
  const entries = getCostHistory({ projectId });
  return summarizeCosts(entries, { projectId });
}

/**
 * Summarize costs from entries
 */
function summarizeCosts(
  entries: CostEntry[],
  filters: { agentId?: string; taskId?: string; projectId?: string }
): CostSummary {
  const totalTokens = entries.reduce((sum, e) => sum + e.tokens.total, 0);
  const totalCost = entries.reduce((sum, e) => sum + e.cost.total, 0);

  return {
    ...filters,
    totalTokens,
    totalCost: Math.round(totalCost * 10000) / 10000,
    entries,
  };
}

// ============================================================================
// Cost Aggregation
// ============================================================================

/**
 * Aggregate costs by time period
 */
export function aggregateCostsByPeriod(
  entries: CostEntry[],
  period: 'hour' | 'day' | 'week' | 'month'
): Map<string, { tokens: number; cost: number; count: number }> {
  const aggregated = new Map<string, { tokens: number; cost: number; count: number }>();

  for (const entry of entries) {
    const key = getPeriodKey(entry.timestamp, period);
    const existing = aggregated.get(key);

    if (existing) {
      existing.tokens += entry.tokens.total;
      existing.cost += entry.cost.total;
      existing.count += 1;
    } else {
      aggregated.set(key, {
        tokens: entry.tokens.total,
        cost: entry.cost.total,
        count: 1,
      });
    }
  }

  return aggregated;
}

/**
 * Aggregate costs by model
 */
export function aggregateCostsByModel(
  entries: CostEntry[]
): Map<string, { tokens: number; cost: number; count: number }> {
  const aggregated = new Map<string, { tokens: number; cost: number; count: number }>();

  for (const entry of entries) {
    const existing = aggregated.get(entry.model);

    if (existing) {
      existing.tokens += entry.tokens.total;
      existing.cost += entry.cost.total;
      existing.count += 1;
    } else {
      aggregated.set(entry.model, {
        tokens: entry.tokens.total,
        cost: entry.cost.total,
        count: 1,
      });
    }
  }

  return aggregated;
}

/**
 * Get the period key for an entry
 */
function getPeriodKey(date: Date, period: 'hour' | 'day' | 'week' | 'month'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');

  switch (period) {
    case 'hour':
      return `${year}-${month}-${day}T${hour}:00`;
    case 'day':
      return `${year}-${month}-${day}`;
    case 'week': {
      // Get ISO week number
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNum = String(Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)).padStart(2, '0');
      return `${year}-W${weekNum}`;
    }
    case 'month':
      return `${year}-${month}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

// ============================================================================
// Cost Optimization Suggestions
// ============================================================================

export interface CostOptimizationSuggestion {
  type: 'model' | 'tokens' | 'caching' | 'batching';
  description: string;
  potentialSavings: number; // Estimated percentage savings
  action: string;
}

/**
 * Generate cost optimization suggestions based on usage patterns
 */
export function generateOptimizationSuggestions(
  entries: CostEntry[]
): CostOptimizationSuggestion[] {
  const suggestions: CostOptimizationSuggestion[] = [];

  // Analyze model usage
  const modelUsage = aggregateCostsByModel(entries);
  const totalCost = entries.reduce((sum, e) => sum + e.cost.total, 0);

  // Check for expensive model usage
  const expensiveModels = ['claude-3-opus', 'gpt-4'];
  for (const [model, stats] of modelUsage) {
    if (expensiveModels.includes(model) && stats.cost > totalCost * 0.5) {
      suggestions.push({
        type: 'model',
        description: `High usage of expensive model ${model} ($${stats.cost.toFixed(2)})`,
        potentialSavings: 60,
        action: 'Consider using cheaper model for non-critical operations',
      });
    }
  }

  // Check for high token usage
  const avgTokens = entries.reduce((sum, e) => sum + e.tokens.total, 0) / entries.length;
  if (avgTokens > 50000) {
    suggestions.push({
      type: 'tokens',
      description: `High average token usage per request (${Math.round(avgTokens)} tokens)`,
      potentialSavings: 30,
      action: 'Reduce max tokens per response or optimize prompts',
    });
  }

  return suggestions;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `cost_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================================================
// Exports
// ============================================================================

export { costHistory, customPricing };
