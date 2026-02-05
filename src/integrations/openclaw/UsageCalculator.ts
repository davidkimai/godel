import { logger } from '../../utils/logger';
/**
 * Usage Calculator for OpenClaw Agent Costs
 * 
 * Calculates token costs, tool usage costs, and aggregates across agents.
 * 
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section 4.5
 */

// ============================================================================
// Types
// ============================================================================

export interface TokenBreakdown {
  input: number;
  output: number;
  total: number;
}

export interface ToolUsage {
  toolName: string;
  callCount: number;
  totalCost: number;
  avgDurationMs: number;
}

export interface UsageMetrics {
  totalSpent: number;
  agentBreakdown: Record<string, number>;  // agentId -> cost
  toolBreakdown: Record<string, number>;   // toolName -> cost
  tokenBreakdown: TokenBreakdown;
}

export interface ModelPricing {
  inputCostPer1M: number;   // Cost per 1M input tokens
  outputCostPer1M: number;  // Cost per 1M output tokens
  contextWindow: number;    // Context window size
}

export interface ToolCost {
  baseCost: number;         // Base cost per call
  perSecondCost?: number;   // Additional cost per second of execution
  dataTransferCost?: number; // Cost per MB of data transferred
}

export interface CostEstimate {
  minCost: number;
  maxCost: number;
  expectedCost: number;
  confidence: 'low' | 'medium' | 'high';
  breakdown: {
    tokens: number;
    tools: number;
    overhead: number;
  };
}

// ============================================================================
// Model Pricing Database
// ============================================================================

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4': {
    inputCostPer1M: 30.00,
    outputCostPer1M: 60.00,
    contextWindow: 8192,
  },
  'gpt-4-turbo': {
    inputCostPer1M: 10.00,
    outputCostPer1M: 30.00,
    contextWindow: 128000,
  },
  'gpt-4o': {
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    contextWindow: 128000,
  },
  'gpt-4o-mini': {
    inputCostPer1M: 0.150,
    outputCostPer1M: 0.600,
    contextWindow: 128000,
  },
  'gpt-3.5-turbo': {
    inputCostPer1M: 0.50,
    outputCostPer1M: 1.50,
    contextWindow: 16385,
  },

  // Anthropic Models
  'claude-3-opus': {
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
    contextWindow: 200000,
  },
  'claude-3-sonnet': {
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    contextWindow: 200000,
  },
  'claude-3-haiku': {
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
    contextWindow: 200000,
  },
  'claude-sonnet-4-5': {
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    contextWindow: 200000,
  },

  // Google Models
  'gemini-1.5-pro': {
    inputCostPer1M: 3.50,
    outputCostPer1M: 10.50,
    contextWindow: 2000000,
  },
  'gemini-1.5-flash': {
    inputCostPer1M: 0.35,
    outputCostPer1M: 0.70,
    contextWindow: 1000000,
  },

  // Meta/Other Models
  'llama-3.1-70b': {
    inputCostPer1M: 0.90,
    outputCostPer1M: 0.90,
    contextWindow: 128000,
  },
  'llama-3.1-405b': {
    inputCostPer1M: 3.50,
    outputCostPer1M: 3.50,
    contextWindow: 128000,
  },
  'mistral-large': {
    inputCostPer1M: 2.00,
    outputCostPer1M: 6.00,
    contextWindow: 128000,
  },
  'kimi-coding': {
    inputCostPer1M: 3.00,
    outputCostPer1M: 12.00,
    contextWindow: 200000,
  },
  'kimi-coding/k2p5': {
    inputCostPer1M: 3.00,
    outputCostPer1M: 12.00,
    contextWindow: 200000,
  },
};

// ============================================================================
// Tool Cost Database
// ============================================================================

export const TOOL_COSTS: Record<string, ToolCost> = {
  // File Operations
  'read': { baseCost: 0.0001 },
  'write': { baseCost: 0.0001 },
  'edit': { baseCost: 0.0001 },

  // Shell/Execution
  'exec': { 
    baseCost: 0.001, 
    perSecondCost: 0.0001,  // Additional per second
  },

  // Browser Operations
  'browser': {
    baseCost: 0.005,
    perSecondCost: 0.001,   // Per second of browser session
  },

  // Canvas Operations
  'canvas': { baseCost: 0.002 },

  // Node Operations
  'nodes': { 
    baseCost: 0.001,
    dataTransferCost: 0.0001,  // Per MB
  },

  // Communication
  'message': { baseCost: 0.001 },
  'webhook': { baseCost: 0.0005 },

  // Session Management
  'sessions_list': { baseCost: 0.0001 },
  'sessions_history': { baseCost: 0.0001 },
  'sessions_send': { baseCost: 0.0005 },
  'sessions_spawn': { baseCost: 0.001 },

  // Scheduling
  'cron': { baseCost: 0.0005 },

  // Web Search
  'web_search': { baseCost: 0.005 },
  'web_fetch': { baseCost: 0.002 },

  // Image Analysis
  'image': { baseCost: 0.005 },

  // AI Operations
  'tts': { baseCost: 0.015 },  // Per 1K characters

  // Default
  'default': { baseCost: 0.001 },
};

// ============================================================================
// Usage Calculator
// ============================================================================

export class UsageCalculator {
  private modelPricing: Record<string, ModelPricing>;
  private toolCosts: Record<string, ToolCost>;
  private customPricing: boolean = false;

  constructor(
    customModelPricing?: Record<string, ModelPricing>,
    customToolCosts?: Record<string, ToolCost>
  ) {
    this.modelPricing = customModelPricing || { ...MODEL_PRICING };
    this.toolCosts = customToolCosts || { ...TOOL_COSTS };
    
    if (customModelPricing || customToolCosts) {
      this.customPricing = true;
    }
  }

  // ========================================================================
  // Token Cost Calculation
  // ========================================================================

  /**
   * Calculate cost for token usage
   */
  calculateTokenCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = this.getModelPricing(modelId);
    
    const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;
    
    return inputCost + outputCost;
  }

  /**
   * Calculate cost from session history data
   */
  calculateSessionCost(
    modelId: string,
    sessionHistory: Array<{
      tokens?: { input?: number; output?: number };
    }>
  ): number {
    let totalInput = 0;
    let totalOutput = 0;

    for (const entry of sessionHistory) {
      if (entry.tokens) {
        totalInput += entry.tokens.input || 0;
        totalOutput += entry.tokens.output || 0;
      }
    }

    return this.calculateTokenCost(modelId, totalInput, totalOutput);
  }

  /**
   * Estimate token count from text (rough approximation)
   */
  estimateTokenCount(text: string): number {
    // Average: 1 token ≈ 4 characters for English text
    // This is a rough estimate - actual tokenization varies by model
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost for a prompt before sending
   */
  estimatePromptCost(
    modelId: string,
    prompt: string,
    expectedResponseLength: number = 500
  ): { input: number; output: number; total: number } {
    const inputTokens = this.estimateTokenCount(prompt);
    const outputTokens = expectedResponseLength / 4; // Rough estimate

    const inputCost = this.calculateTokenCost(modelId, inputTokens, 0);
    const outputCost = this.calculateTokenCost(modelId, 0, outputTokens);

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  }

  // ========================================================================
  // Tool Cost Calculation
  // ========================================================================

  /**
   * Calculate cost for a tool call
   */
  calculateToolCost(
    toolName: string,
    options?: {
      durationMs?: number;
      dataTransferMB?: number;
      ttsCharacters?: number;
    }
  ): number {
    const cost = this.getToolCost(toolName);
    let total = cost.baseCost;

    if (cost.perSecondCost && options?.durationMs) {
      const seconds = options.durationMs / 1000;
      total += seconds * cost.perSecondCost;
    }

    if (cost.dataTransferCost && options?.dataTransferMB) {
      total += options.dataTransferMB * cost.dataTransferCost;
    }

    // TTS special case: cost per 1K characters
    if (toolName === 'tts' && options?.ttsCharacters) {
      total = (options.ttsCharacters / 1000) * cost.baseCost;
    }

    return total;
  }

  /**
   * Calculate cost for multiple tool calls
   */
  calculateToolBatchCost(
    calls: Array<{
      toolName: string;
      durationMs?: number;
      dataTransferMB?: number;
    }>
  ): { total: number; breakdown: Record<string, number> } {
    let total = 0;
    const breakdown: Record<string, number> = {};

    for (const call of calls) {
      const cost = this.calculateToolCost(call.toolName, call);
      total += cost;
      breakdown[call.toolName] = (breakdown[call.toolName] || 0) + cost;
    }

    return { total, breakdown };
  }

  // ========================================================================
  // Aggregation
  // ========================================================================

  /**
   * Aggregate usage metrics across multiple agents
   */
  aggregateAgentUsage(
    agentUsages: Array<{
      agentId: string;
      modelId: string;
      inputTokens: number;
      outputTokens: number;
      toolCalls: Array<{
        toolName: string;
        durationMs?: number;
        dataTransferMB?: number;
      }>;
    }>
  ): UsageMetrics {
    const agentBreakdown: Record<string, number> = {};
    const toolBreakdown: Record<string, number> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalSpent = 0;

    for (const agent of agentUsages) {
      // Token costs
      const tokenCost = this.calculateTokenCost(
        agent.modelId,
        agent.inputTokens,
        agent.outputTokens
      );

      // Tool costs
      const { total: toolCost, breakdown: toolCosts } = this.calculateToolBatchCost(
        agent.toolCalls
      );

      // Agent total
      const agentTotal = tokenCost + toolCost;
      agentBreakdown[agent.agentId] = agentTotal;
      totalSpent += agentTotal;

      // Aggregate tool costs
      for (const [toolName, cost] of Object.entries(toolCosts)) {
        toolBreakdown[toolName] = (toolBreakdown[toolName] || 0) + cost;
      }

      // Token totals
      totalInputTokens += agent.inputTokens;
      totalOutputTokens += agent.outputTokens;
    }

    return {
      totalSpent,
      agentBreakdown,
      toolBreakdown,
      tokenBreakdown: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
      },
    };
  }

  /**
   * Aggregate usage from session history data
   */
  aggregateSessionHistory(
    sessions: Array<{
      agentId: string;
      modelId: string;
      history: Array<{
        tokens?: { input?: number; output?: number };
        tools?: Array<{ name: string; durationMs?: number }>;
      }>;
    }>
  ): UsageMetrics {
    const agentBreakdown: Record<string, number> = {};
    const toolBreakdown: Record<string, number> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalSpent = 0;

    for (const session of sessions) {
      let sessionTokenCost = 0;
      let sessionToolCost = 0;

      for (const entry of session.history) {
        // Token costs
        if (entry.tokens) {
          const input = entry.tokens.input || 0;
          const output = entry.tokens.output || 0;
          sessionTokenCost += this.calculateTokenCost(session.modelId, input, output);
          totalInputTokens += input;
          totalOutputTokens += output;
        }

        // Tool costs
        if (entry.tools) {
          for (const tool of entry.tools) {
            const cost = this.calculateToolCost(tool.name, {
              durationMs: tool.durationMs,
            });
            sessionToolCost += cost;
            toolBreakdown[tool.name] = (toolBreakdown[tool.name] || 0) + cost;
          }
        }
      }

      const sessionTotal = sessionTokenCost + sessionToolCost;
      agentBreakdown[session.agentId] = sessionTotal;
      totalSpent += sessionTotal;
    }

    return {
      totalSpent,
      agentBreakdown,
      toolBreakdown,
      tokenBreakdown: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
      },
    };
  }

  // ========================================================================
  // Cost Estimation
  // ========================================================================

  /**
   * Estimate total cost for a task before execution
   */
  estimateTaskCost(options: {
    modelId: string;
    expectedPrompts: number;
    avgPromptLength: number;
    avgResponseLength: number;
    expectedTools: Array<{
      toolName: string;
      expectedCalls: number;
      avgDurationMs?: number;
    }>;
  }): CostEstimate {
    // Token estimates
    const tokenEstimates: number[] = [];
    for (let i = 0; i < options.expectedPrompts; i++) {
      const promptCost = this.estimatePromptCost(
        options.modelId,
        'x'.repeat(options.avgPromptLength),
        options.avgResponseLength
      );
      tokenEstimates.push(promptCost.total);
    }

    const minTokens = tokenEstimates.length > 0 ? Math.min(...tokenEstimates) * 0.5 : 0;
    const maxTokens = tokenEstimates.length > 0 ? Math.max(...tokenEstimates) * 2 : 0;
    const expectedTokens = tokenEstimates.reduce((a, b) => a + b, 0);

    // Tool estimates
    let minTools = 0;
    let maxTools = 0;
    let expectedTools = 0;

    for (const tool of options.expectedTools) {
      const baseCost = this.calculateToolCost(tool.toolName);
      const durationCost = tool.avgDurationMs 
        ? (tool.avgDurationMs / 1000) * (this.getToolCost(tool.toolName).perSecondCost || 0)
        : 0;
      const avgCost = baseCost + durationCost;

      minTools += avgCost * tool.expectedCalls * 0.5;
      maxTools += avgCost * tool.expectedCalls * 2;
      expectedTools += avgCost * tool.expectedCalls;
    }

    // Overhead (network, processing, etc.)
    const overheadRate = 0.1; // 10% overhead
    const minOverhead = (minTokens + minTools) * overheadRate;
    const maxOverhead = (maxTokens + maxTools) * overheadRate;
    const expectedOverhead = (expectedTokens + expectedTools) * overheadRate;

    return {
      minCost: minTokens + minTools + minOverhead,
      maxCost: maxTokens + maxTools + maxOverhead,
      expectedCost: expectedTokens + expectedTools + expectedOverhead,
      confidence: options.expectedPrompts < 3 ? 'low' : options.expectedPrompts < 10 ? 'medium' : 'high',
      breakdown: {
        tokens: expectedTokens,
        tools: expectedTools,
        overhead: expectedOverhead,
      },
    };
  }

  // ========================================================================
  // Pricing Management
  // ========================================================================

  /**
   * Get pricing for a model
   */
  getModelPricing(modelId: string): ModelPricing {
    // Try exact match first
    if (this.modelPricing[modelId]) {
      return this.modelPricing[modelId];
    }

    // Try prefix matching
    for (const [key, pricing] of Object.entries(this.modelPricing)) {
      if (modelId.startsWith(key) || key.startsWith(modelId)) {
        return pricing;
      }
    }

    // Default to GPT-4 Turbo pricing as fallback
    logger.warn(`[UsageCalculator] Unknown model ${modelId}, using default pricing`);
    return this.modelPricing['gpt-4-turbo'] || {
      inputCostPer1M: 10.00,
      outputCostPer1M: 30.00,
      contextWindow: 128000,
    };
  }

  /**
   * Get cost for a tool
   */
  getToolCost(toolName: string): ToolCost {
    return this.toolCosts[toolName] || this.toolCosts['default'];
  }

  /**
   * Update pricing for a model
   */
  setModelPricing(modelId: string, pricing: ModelPricing): void {
    this.modelPricing[modelId] = pricing;
    this.customPricing = true;
  }

  /**
   * Update cost for a tool
   */
  setToolCost(toolName: string, cost: ToolCost): void {
    this.toolCosts[toolName] = cost;
    this.customPricing = true;
  }

  /**
   * Check if using custom pricing
   */
  isUsingCustomPricing(): boolean {
    return this.customPricing;
  }

  // ========================================================================
  // Reporting
  // ========================================================================

  /**
   * Format usage metrics as a readable report
   */
  formatReport(metrics: UsageMetrics): string {
    let report = '\n╔══════════════════════════════════════════════════════════════╗\n';
    report += '║           USAGE REPORT                                       ║\n';
    report += '╠══════════════════════════════════════════════════════════════╣\n';
    report += `║ Total Spent: $${metrics.totalSpent.toFixed(4)}\n`;
    report += '╠══════════════════════════════════════════════════════════════╣\n';

    // Token breakdown
    report += '║ TOKENS:\n';
    report += `║   Input:  ${metrics.tokenBreakdown.input.toLocaleString()}\n`;
    report += `║   Output: ${metrics.tokenBreakdown.output.toLocaleString()}\n`;
    report += `║   Total:  ${metrics.tokenBreakdown.total.toLocaleString()}\n`;

    // Agent breakdown
    if (Object.keys(metrics.agentBreakdown).length > 0) {
      report += '╠══════════════════════════════════════════════════════════════╣\n';
      report += '║ BY AGENT:\n';
      for (const [agentId, cost] of Object.entries(metrics.agentBreakdown)) {
        report += `║   ${agentId}: $${cost.toFixed(4)}\n`;
      }
    }

    // Tool breakdown
    if (Object.keys(metrics.toolBreakdown).length > 0) {
      report += '╠══════════════════════════════════════════════════════════════╣\n';
      report += '║ BY TOOL:\n';
      const sortedTools = Object.entries(metrics.toolBreakdown)
        .sort((a, b) => b[1] - a[1]);
      for (const [toolName, cost] of sortedTools) {
        report += `║   ${toolName}: $${cost.toFixed(4)}\n`;
      }
    }

    report += '╚══════════════════════════════════════════════════════════════╝\n';

    return report;
  }

  /**
   * Compare actual vs estimated costs
   */
  compareEstimateVsActual(
    estimate: CostEstimate,
    actual: number
  ): {
    withinRange: boolean;
    variance: number;
    variancePercent: number;
    assessment: string;
  } {
    const withinRange = actual >= estimate.minCost && actual <= estimate.maxCost;
    const variance = actual - estimate.expectedCost;
    const variancePercent = estimate.expectedCost > 0 
      ? (variance / estimate.expectedCost) * 100 
      : 0;

    let assessment: string;
    if (Math.abs(variancePercent) < 10) {
      assessment = 'Excellent estimate';
    } else if (Math.abs(variancePercent) < 25) {
      assessment = 'Good estimate';
    } else if (Math.abs(variancePercent) < 50) {
      assessment = 'Fair estimate';
    } else {
      assessment = 'Poor estimate';
    }

    return {
      withinRange,
      variance,
      variancePercent,
      assessment,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalCalculator: UsageCalculator | null = null;

export function getUsageCalculator(): UsageCalculator {
  if (!globalCalculator) {
    globalCalculator = new UsageCalculator();
  }
  return globalCalculator;
}

export function resetUsageCalculator(): void {
  globalCalculator = null;
}
