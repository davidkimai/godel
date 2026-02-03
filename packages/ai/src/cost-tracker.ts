/**
 * Cost Tracker
 * 
 * Integrates LLM usage with Dash's budget system.
 * Tracks per-request costs and provides hooks for budget enforcement.
 * 
 * @module cost-tracker
 */

import { 
  Model, 
  Api, 
  Usage,
  calculateCost as calculatePiCost,
} from '@mariozechner/pi-ai';

// ============================================================================
// Types
// ============================================================================

export interface CostTrackingOptions {
  /** Budget limit in dollars */
  budgetLimit?: number;
  
  /** Warning threshold (0-1) */
  warningThreshold?: number;
  
  /** Hard stop threshold (0-1) */
  stopThreshold?: number;
  
  /** Callback when cost is incurred */
  onCostIncurred?: (cost: CostEntry) => void | Promise<void>;
  
  /** Callback when warning threshold is reached */
  onWarning?: (status: CostStatus) => void | Promise<void>;
  
  /** Callback when stop threshold is reached */
  onStop?: (status: CostStatus) => void | Promise<void>;
  
  /** Whether to track per-provider costs */
  trackByProvider?: boolean;
  
  /** Whether to track per-model costs */
  trackByModel?: boolean;
  
  /** Whether to track per-task costs */
  trackByTask?: boolean;
  
  /** Custom metadata to attach to cost entries */
  metadata?: Record<string, unknown>;
}

export interface CostEntry {
  id: string;
  timestamp: Date;
  provider: string;
  modelId: string;
  modelName: string;
  usage: Usage;
  cost: Usage['cost'];
  taskId?: string;
  agentId?: string;
  swarmId?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export interface CostStatus {
  totalCost: number;
  budgetLimit: number;
  percentUsed: number;
  remainingBudget: number;
  entryCount: number;
  warningTriggered: boolean;
  stopTriggered: boolean;
}

export interface ProviderCostSummary {
  provider: string;
  totalCost: number;
  requestCount: number;
  avgCostPerRequest: number;
  totalTokens: number;
}

export interface ModelCostSummary {
  modelId: string;
  modelName: string;
  provider: string;
  totalCost: number;
  requestCount: number;
  avgCostPerRequest: number;
  totalTokens: number;
}

// ============================================================================
// Cost Tracker Class
// ============================================================================

export class CostTracker {
  private entries: CostEntry[] = [];
  private options: Required<CostTrackingOptions>;
  private warningTriggered = false;
  private stopTriggered = false;

  constructor(options: CostTrackingOptions = {}) {
    this.options = {
      budgetLimit: options.budgetLimit ?? Infinity,
      warningThreshold: options.warningThreshold ?? 0.75,
      stopThreshold: options.stopThreshold ?? 0.95,
      onCostIncurred: options.onCostIncurred ?? (() => {}),
      onWarning: options.onWarning ?? (() => {}),
      onStop: options.onStop ?? (() => {}),
      trackByProvider: options.trackByProvider ?? true,
      trackByModel: options.trackByModel ?? true,
      trackByTask: options.trackByTask ?? true,
      metadata: options.metadata ?? {},
    };
  }

  /**
   * Record a cost entry from model usage
   */
  async recordCost(
    model: Model<Api>,
    usage: Usage,
    options?: {
      taskId?: string;
      agentId?: string;
      swarmId?: string;
      latencyMs?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<CostEntry> {
    // Calculate cost using pi-mono's calculator
    const cost = calculatePiCost(model, usage);
    
    const entry: CostEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      provider: model.provider,
      modelId: model.id,
      modelName: model.name,
      usage: { ...usage },
      cost: { ...cost },
      taskId: options?.taskId,
      agentId: options?.agentId,
      swarmId: options?.swarmId,
      latencyMs: options?.latencyMs,
      metadata: { ...this.options.metadata, ...options?.metadata },
    };

    this.entries.push(entry);
    
    // Notify callback
    await this.options.onCostIncurred(entry);
    
    // Check thresholds
    await this.checkThresholds();
    
    return entry;
  }

  /**
   * Estimate cost before making a request
   */
  estimateCost(
    model: Model<Api>,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): Usage['cost'] {
    const estimatedUsage: Usage = {
      input: estimatedInputTokens,
      output: estimatedOutputTokens,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: estimatedInputTokens + estimatedOutputTokens,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    };
    
    return calculatePiCost(model, estimatedUsage);
  }

  /**
   * Check if a request would exceed budget
   */
  wouldExceedBudget(
    model: Model<Api>,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): { wouldExceed: boolean; projectedTotal: number; remaining: number } {
    const estimate = this.estimateCost(model, estimatedInputTokens, estimatedOutputTokens);
    const currentTotal = this.getTotalCost();
    const projectedTotal = currentTotal + estimate.total;
    
    return {
      wouldExceed: projectedTotal > this.options.budgetLimit,
      projectedTotal,
      remaining: this.options.budgetLimit - currentTotal,
    };
  }

  /**
   * Get current cost status
   */
  getStatus(): CostStatus {
    const totalCost = this.getTotalCost();
    const percentUsed = this.options.budgetLimit === Infinity 
      ? 0 
      : totalCost / this.options.budgetLimit;
    
    return {
      totalCost,
      budgetLimit: this.options.budgetLimit,
      percentUsed,
      remainingBudget: this.options.budgetLimit - totalCost,
      entryCount: this.entries.length,
      warningTriggered: this.warningTriggered,
      stopTriggered: this.stopTriggered,
    };
  }

  /**
   * Get total cost incurred
   */
  getTotalCost(): number {
    return this.entries.reduce((sum, e) => sum + e.cost.total, 0);
  }

  /**
   * Get costs by provider
   */
  getCostsByProvider(): ProviderCostSummary[] {
    if (!this.options.trackByProvider) return [];
    
    const byProvider = new Map<string, CostEntry[]>();
    
    for (const entry of this.entries) {
      const list = byProvider.get(entry.provider) ?? [];
      list.push(entry);
      byProvider.set(entry.provider, list);
    }
    
    return Array.from(byProvider.entries()).map(([provider, entries]) => {
      const totalCost = entries.reduce((sum, e) => sum + e.cost.total, 0);
      const totalTokens = entries.reduce((sum, e) => sum + e.usage.totalTokens, 0);
      
      return {
        provider,
        totalCost,
        requestCount: entries.length,
        avgCostPerRequest: totalCost / entries.length,
        totalTokens,
      };
    }).sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Get costs by model
   */
  getCostsByModel(): ModelCostSummary[] {
    if (!this.options.trackByModel) return [];
    
    const byModel = new Map<string, CostEntry[]>();
    
    for (const entry of this.entries) {
      const key = `${entry.provider}:${entry.modelId}`;
      const list = byModel.get(key) ?? [];
      list.push(entry);
      byModel.set(key, list);
    }
    
    return Array.from(byModel.entries()).map(([key, entries]) => {
      const first = entries[0];
      const totalCost = entries.reduce((sum, e) => sum + e.cost.total, 0);
      const totalTokens = entries.reduce((sum, e) => sum + e.usage.totalTokens, 0);
      
      return {
        modelId: first.modelId,
        modelName: first.modelName,
        provider: first.provider,
        totalCost,
        requestCount: entries.length,
        avgCostPerRequest: totalCost / entries.length,
        totalTokens,
      };
    }).sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Get costs for a specific task
   */
  getCostsForTask(taskId: string): CostEntry[] {
    if (!this.options.trackByTask) return [];
    return this.entries.filter(e => e.taskId === taskId);
  }

  /**
   * Get costs for a specific agent
   */
  getCostsForAgent(agentId: string): CostEntry[] {
    return this.entries.filter(e => e.agentId === agentId);
  }

  /**
   * Get costs for a specific swarm
   */
  getCostsForSwarm(swarmId: string): CostEntry[] {
    return this.entries.filter(e => e.swarmId === swarmId);
  }

  /**
   * Get all entries
   */
  getEntries(): CostEntry[] {
    return [...this.entries];
  }

  /**
   * Get recent entries
   */
  getRecentEntries(limit: number = 100): CostEntry[] {
    return this.entries.slice(-limit);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.warningTriggered = false;
    this.stopTriggered = false;
  }

  /**
   * Update budget limit
   */
  setBudgetLimit(limit: number): void {
    this.options.budgetLimit = limit;
    this.warningTriggered = false;
    this.stopTriggered = false;
  }

  /**
   * Reset threshold triggers
   */
  resetThresholds(): void {
    this.warningTriggered = false;
    this.stopTriggered = false;
  }

  /**
   * Export cost report
   */
  exportReport(): CostReport {
    const status = this.getStatus();
    const byProvider = this.getCostsByProvider();
    const byModel = this.getCostsByModel();
    
    return {
      generatedAt: new Date(),
      status,
      summary: {
        totalRequests: this.entries.length,
        totalCost: status.totalCost,
        avgCostPerRequest: status.totalCost / Math.max(1, this.entries.length),
        topProvider: byProvider[0]?.provider ?? 'N/A',
        topModel: byModel[0]?.modelName ?? 'N/A',
      },
      byProvider,
      byModel,
      recentEntries: this.getRecentEntries(50),
    };
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private async checkThresholds(): Promise<void> {
    if (this.options.budgetLimit === Infinity) return;
    
    const status = this.getStatus();
    
    // Check warning threshold
    if (!this.warningTriggered && status.percentUsed >= this.options.warningThreshold) {
      this.warningTriggered = true;
      await this.options.onWarning(status);
    }
    
    // Check stop threshold
    if (!this.stopTriggered && status.percentUsed >= this.options.stopThreshold) {
      this.stopTriggered = true;
      await this.options.onStop(status);
    }
  }

  private generateId(): string {
    return `cost_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Cost Report Type
// ============================================================================

export interface CostReport {
  generatedAt: Date;
  status: CostStatus;
  summary: {
    totalRequests: number;
    totalCost: number;
    avgCostPerRequest: number;
    topProvider: string;
    topModel: string;
  };
  byProvider: ProviderCostSummary[];
  byModel: ModelCostSummary[];
  recentEntries: CostEntry[];
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const costTracker = new CostTracker();
