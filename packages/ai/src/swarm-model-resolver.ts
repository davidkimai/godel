/**
 * Swarm Model Resolver
 * 
 * Provides cost-optimized model selection for Dash swarms.
 * Selects the best model based on task type, budget constraints, and provider availability.
 * 
 * @module swarm-model-resolver
 */

import { 
  getModel, 
  getModels, 
  getProviders,
  Model, 
  Api, 
  Provider,
  KnownProvider,
  ThinkingLevel 
} from '@mariozechner/pi-ai';

// ============================================================================
// Types
// ============================================================================

export interface SwarmModelConfig {
  /** Task type for model selection */
  taskType: TaskType;
  
  /** Budget constraint in dollars (optional) */
  budgetLimit?: number;
  
  /** Preferred provider(s) - empty for auto-selection */
  preferredProviders?: KnownProvider[];
  
  /** Required capabilities */
  requiredCapabilities?: ModelCapability[];
  
  /** Thinking level preference */
  thinkingLevel?: ThinkingLevel;
  
  /** Whether to use cached models if available */
  useCache?: boolean;
  
  /** Custom cost weight (0-1, higher = more cost-conscious) */
  costWeight?: number;
  
  /** Custom quality weight (0-1, higher = prefer quality) */
  qualityWeight?: number;
  
  /** Maximum context window required */
  minContextWindow?: number;
}

export type TaskType = 
  | 'coding'           // Code generation, refactoring
  | 'reasoning'        // Complex reasoning tasks
  | 'summarization'    // Text summarization
  | 'chat'             // General conversation
  | 'analysis'         // Data analysis
  | 'creative'         // Creative writing
  | 'classification'   // Classification tasks
  | 'extraction'       // Information extraction
  | 'planning'         // Task planning and orchestration
  | 'review';          // Code review, critique

export type ModelCapability =
  | 'text'             // Text generation
  | 'image'            // Image understanding
  | 'thinking'         // Chain of thought / reasoning
  | 'tools'            // Tool calling
  | 'json'             // JSON mode
  | 'streaming';       // Streaming support

export interface ModelScore {
  model: Model<Api>;
  score: number;
  costScore: number;
  qualityScore: number;
  speedScore: number;
  reason: string;
}

// ============================================================================
// Task-Specific Model Preferences
// ============================================================================

/**
 * Task-specific model preferences
 * Maps task types to preferred models (in order of preference)
 */
const TASK_MODEL_PREFERENCES: Record<TaskType, string[]> = {
  coding: [
    'gpt-5.1-codex',        // Best for coding
    'claude-sonnet-4-20250514',
    'gpt-4.1',
    'claude-haiku-4-20250514',
  ],
  reasoning: [
    'claude-opus-4-20250514',  // Best reasoning
    'gpt-5.2',
    'claude-sonnet-4-20250514',
    'gpt-4.1',
  ],
  summarization: [
    'claude-haiku-4-20250514', // Fast, cheap
    'gpt-4.1-mini',
    'claude-sonnet-4-20250514',
  ],
  chat: [
    'claude-sonnet-4-20250514', // Good balance
    'gpt-4.1',
    'claude-haiku-4-20250514',
  ],
  analysis: [
    'claude-sonnet-4-20250514',
    'gpt-4.1',
    'claude-opus-4-20250514',
  ],
  creative: [
    'claude-sonnet-4-20250514',
    'gpt-4.1',
    'gpt-5.1-codex',
  ],
  classification: [
    'claude-haiku-4-20250514', // Fast, cheap
    'gpt-4.1-mini',
    'claude-sonnet-4-20250514',
  ],
  extraction: [
    'claude-sonnet-4-20250514',
    'gpt-4.1',
    'claude-haiku-4-20250514',
  ],
  planning: [
    'claude-opus-4-20250514',  // Best for complex planning
    'gpt-5.2',
    'claude-sonnet-4-20250514',
  ],
  review: [
    'claude-sonnet-4-20250514',
    'gpt-5.1-codex',
    'gpt-4.1',
  ],
};

/**
 * Cost tier multipliers (relative to base cost)
 */
const COST_TIERS: Record<string, number> = {
  premium: 3.0,   // Opus, GPT-5 series
  standard: 1.0,  // Sonnet, GPT-4 series
  economy: 0.3,   // Haiku, GPT-3.5 series
  mini: 0.1,      // Mini models
};

/**
 * Quality scores (subjective, based on typical performance)
 */
const QUALITY_SCORES: Record<string, number> = {
  'claude-opus-4-20250514': 0.95,
  'gpt-5.2': 0.95,
  'gpt-5.1-codex': 0.93,
  'claude-sonnet-4-20250514': 0.88,
  'gpt-4.1': 0.88,
  'claude-haiku-4-20250514': 0.75,
  'gpt-4.1-mini': 0.78,
  'gpt-4.1-nano': 0.70,
};

// Default quality for unknown models
const DEFAULT_QUALITY = 0.80;

// ============================================================================
// Swarm Model Resolver Class
// ============================================================================

export class SwarmModelResolver {
  private cache: Map<string, ModelScore> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get the best model for a given swarm task
   */
  resolveModel(config: SwarmModelConfig): Model<Api> {
    const cacheKey = this.getCacheKey(config);
    
    // Check cache
    if (config.useCache !== false) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached.model;
      }
    }

    // Score all available models
    const scored = this.scoreModels(config);
    
    if (scored.length === 0) {
      throw new Error(
        `No models found for task type "${config.taskType}" with given constraints`
      );
    }

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);
    
    // Cache and return best model
    const best = scored[0];
    this.setCache(cacheKey, best);
    
    return best.model;
  }

  /**
   * Get multiple model options ranked by suitability
   */
  resolveModels(config: SwarmModelConfig, count: number = 3): Model<Api>[] {
    const scored = this.scoreModels(config);
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, count).map(s => s.model);
  }

  /**
   * Get model for a specific provider
   */
  getModelForProvider<TProvider extends KnownProvider>(
    provider: TProvider, 
    modelId: string
  ): Model<Api> {
    // Cast to any to work around pi-mono's strict typing
    return (getModel as any)(provider, modelId);
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): KnownProvider[] {
    return getProviders();
  }

  /**
   * Get models for a specific task type
   */
  getModelsForTask(taskType: TaskType): Model<Api>[] {
    const preferences = TASK_MODEL_PREFERENCES[taskType] || [];
    const models: Model<Api>[] = [];

    for (const provider of getProviders()) {
      for (const model of getModels(provider)) {
        if (preferences.includes(model.id)) {
          models.push(model);
        }
      }
    }

    // Sort by preference order
    return models.sort((a, b) => {
      const idxA = preferences.indexOf(a.id);
      const idxB = preferences.indexOf(b.id);
      return idxA - idxB;
    });
  }

  /**
   * Clear the model cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private scoreModels(config: SwarmModelConfig): ModelScore[] {
    const scores: ModelScore[] = [];
    const preferences = TASK_MODEL_PREFERENCES[config.taskType] || [];
    
    // Get providers to consider
    const providers = config.preferredProviders?.length 
      ? config.preferredProviders 
      : getProviders();

    for (const provider of providers) {
      for (const model of getModels(provider)) {
        const score = this.calculateScore(model, config, preferences);
        if (score.score > 0) {
          scores.push(score);
        }
      }
    }

    return scores;
  }

  private calculateScore(
    model: Model<Api>, 
    config: SwarmModelConfig,
    preferences: string[]
  ): ModelScore {
    const costWeight = config.costWeight ?? 0.5;
    const qualityWeight = config.qualityWeight ?? 0.5;
    
    // Check required capabilities
    if (config.requiredCapabilities) {
      for (const cap of config.requiredCapabilities) {
        if (!this.hasCapability(model, cap)) {
          return { 
            model, 
            score: 0, 
            costScore: 0, 
            qualityScore: 0, 
            speedScore: 0,
            reason: `Missing capability: ${cap}` 
          };
        }
      }
    }

    // Check minimum context window
    if (config.minContextWindow && model.contextWindow < config.minContextWindow) {
      return { 
        model, 
        score: 0, 
        costScore: 0, 
        qualityScore: 0, 
        speedScore: 0,
        reason: `Context window too small: ${model.contextWindow} < ${config.minContextWindow}` 
      };
    }

    // Calculate cost score (inverse - lower is better)
    const maxCost = this.getMaxCost();
    const normalizedCost = (model.cost.input + model.cost.output) / maxCost;
    const costScore = Math.max(0, 1 - normalizedCost);

    // Calculate quality score
    const qualityScore = QUALITY_SCORES[model.id] ?? DEFAULT_QUALITY;

    // Calculate preference bonus
    const prefIndex = preferences.indexOf(model.id);
    const preferenceBonus = prefIndex >= 0 
      ? 1 - (prefIndex / preferences.length) * 0.3  // Up to 0.3 bonus
      : 0;

    // Calculate speed score (based on model tier)
    const speedScore = this.estimateSpeedScore(model);

    // Combine scores
    const combinedScore = 
      (costScore * costWeight) +
      (qualityScore * qualityWeight) +
      (preferenceBonus * 0.2) +
      (speedScore * 0.1);

    // Check budget constraint
    if (config.budgetLimit !== undefined) {
      const estimatedCost = this.estimateCost(model);
      if (estimatedCost > config.budgetLimit) {
        return { 
          model, 
          score: combinedScore * 0.5,  // Penalize but don't exclude
          costScore, 
          qualityScore, 
          speedScore,
          reason: `Over budget: ~$${estimatedCost.toFixed(4)} > $${config.budgetLimit}` 
        };
      }
    }

    return {
      model,
      score: combinedScore,
      costScore,
      qualityScore,
      speedScore,
      reason: prefIndex >= 0 
        ? `Ranked #${prefIndex + 1} for ${config.taskType}` 
        : 'General purpose model'
    };
  }

  private hasCapability(model: Model<Api>, capability: ModelCapability): boolean {
    switch (capability) {
      case 'text':
        return model.input.includes('text');
      case 'image':
        return model.input.includes('image');
      case 'thinking':
        return model.reasoning;
      case 'tools':
        // Most modern models support tools
        return true;
      case 'json':
        // Most modern models support JSON
        return true;
      case 'streaming':
        // All supported models support streaming
        return true;
      default:
        return false;
    }
  }

  private getMaxCost(): number {
    // Approximate max cost per million tokens
    return 50; // $50 per million tokens (Opus range)
  }

  private estimateCost(model: Model<Api>): number {
    // Estimate cost for a typical request (4K input, 1K output)
    const inputCost = (model.cost.input / 1_000_000) * 4000;
    const outputCost = (model.cost.output / 1_000_000) * 1000;
    return inputCost + outputCost;
  }

  private estimateSpeedScore(model: Model<Api>): number {
    // Estimate speed based on model characteristics
    // Faster models = higher score
    if (model.id.includes('haiku') || model.id.includes('mini') || model.id.includes('nano')) {
      return 1.0;
    }
    if (model.id.includes('sonnet') || model.id.includes('gpt-4')) {
      return 0.7;
    }
    if (model.id.includes('opus') || model.id.includes('5.2')) {
      return 0.4;
    }
    return 0.6; // Default
  }

  private getCacheKey(config: SwarmModelConfig): string {
    return JSON.stringify({
      taskType: config.taskType,
      budgetLimit: config.budgetLimit,
      preferredProviders: config.preferredProviders?.sort(),
      requiredCapabilities: config.requiredCapabilities?.sort(),
      thinkingLevel: config.thinkingLevel,
      minContextWindow: config.minContextWindow,
    });
  }

  private getFromCache(key: string): ModelScore | null {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    return this.cache.get(key) ?? null;
  }

  private setCache(key: string, score: ModelScore): void {
    this.cache.set(key, score);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Default singleton instance
 */
export const swarmModelResolver = new SwarmModelResolver();

/**
 * Get the best model for a task type (convenience function)
 */
export function getSwarmModel(
  taskType: TaskType,
  options?: Omit<SwarmModelConfig, 'taskType'>
): Model<Api> {
  return swarmModelResolver.resolveModel({
    taskType,
    ...options,
  });
}
