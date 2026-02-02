/**
 * Cost Calculation Tests
 */

import {
  // Cost calculation
  calculateCost,
  calculateCostFromTokens,
  estimateCost,
  
  // Model pricing
  MODEL_PRICING,
  getPricing,
  setPricing,
  removePricing,
  getCostPerThousandTokens,
  listPricing,
  customPricing,
  
  // Cost tracking
  recordCost,
  getCostHistory,
  getAgentCostSummary,
  getTaskCostSummary,
  getProjectCostSummary,
  
  // Aggregation
  aggregateCostsByPeriod,
  aggregateCostsByModel,
  
  // Optimization
  generateOptimizationSuggestions,
  
  // Cost history
  costHistory,
  
  // Types
  TokenCount,
  ModelPricing,
} from '../../src/safety/cost';

// Mock logger
jest.mock('../../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Cost Calculation', () => {
  describe('calculateCost', () => {
    it('should calculate cost for Claude Sonnet correctly', () => {
      const tokens: TokenCount = {
        prompt: 1000,
        completion: 500,
        total: 1500,
      };

      const cost = calculateCost(tokens, 'claude-3-5-sonnet');

      // $0.003 per 1K prompt, $0.015 per 1K completion
      // (1000/1000) * 0.003 + (500/1000) * 0.015 = 0.003 + 0.0075 = 0.0105
      expect(cost.prompt).toBeCloseTo(0.003, 4);
      expect(cost.completion).toBeCloseTo(0.0075, 4);
      expect(cost.total).toBeCloseTo(0.0105, 4);
    });

    it('should calculate cost for Kimi K2.5 correctly', () => {
      const tokens: TokenCount = {
        prompt: 10000,
        completion: 5000,
        total: 15000,
      };

      const cost = calculateCost(tokens, 'moonshot/kimi-k2-5');

      // $0.001 per 1K prompt, $0.002 per 1K completion
      // (10000/1000) * 0.001 + (5000/1000) * 0.002 = 0.01 + 0.01 = 0.02
      expect(cost.prompt).toBeCloseTo(0.01, 4);
      expect(cost.completion).toBeCloseTo(0.01, 4);
      expect(cost.total).toBeCloseTo(0.02, 4);
    });

    it('should handle large token counts', () => {
      const tokens: TokenCount = {
        prompt: 1_000_000,
        completion: 500_000,
        total: 1_500_000,
      };

      const cost = calculateCost(tokens, 'claude-3-5-sonnet');

      expect(cost.total).toBeGreaterThan(0);
      expect(cost.total).toBeCloseTo(10.5, 1); // ~$10.50
    });

    it('should use default pricing for unknown models', () => {
      const tokens: TokenCount = {
        prompt: 1000,
        completion: 1000,
        total: 2000,
      };

      const cost = calculateCost(tokens, 'unknown-model');

      // Should use default pricing ($0.01 / $0.03)
      expect(cost.total).toBeGreaterThan(0);
    });

    it('should handle zero tokens', () => {
      const tokens: TokenCount = {
        prompt: 0,
        completion: 0,
        total: 0,
      };

      const cost = calculateCost(tokens, 'claude-3-5-sonnet');

      expect(cost.prompt).toBe(0);
      expect(cost.completion).toBe(0);
      expect(cost.total).toBe(0);
    });
  });

  describe('calculateCostFromTokens', () => {
    it('should calculate cost from separate token counts', () => {
      const cost = calculateCostFromTokens(5000, 2000, 'gpt-3.5-turbo');

      expect(cost.prompt).toBeGreaterThan(0);
      expect(cost.completion).toBeGreaterThan(0);
      expect(cost.total).toBeGreaterThan(0);
    });
  });

  describe('estimateCost', () => {
    it('should estimate future costs', () => {
      const cost = estimateCost(100_000, 50_000, 'claude-3-5-sonnet');

      expect(cost.total).toBeGreaterThan(0);
      // Should be same as calculateCostFromTokens
      const expected = calculateCostFromTokens(100_000, 50_000, 'claude-3-5-sonnet');
      expect(cost).toEqual(expected);
    });
  });
});

describe('Model Pricing', () => {
  beforeEach(() => {
    // Clear custom pricing
    customPricing.clear();
  });

  describe('getPricing', () => {
    it('should return pricing for known models', () => {
      const pricing = getPricing('claude-3-5-sonnet');

      expect(pricing).toBeDefined();
      expect(pricing?.promptPerThousand).toBe(0.003);
      expect(pricing?.completionPerThousand).toBe(0.015);
    });

    it('should return undefined for unknown models', () => {
      // getPricing returns undefined for unknown models (without default fallback)
      const pricing = getPricing('totally-unknown-model');
      expect(pricing).toBeUndefined();
    });

    it('should return custom pricing when set', () => {
      const custom: ModelPricing = {
        promptPerThousand: 0.001,
        completionPerThousand: 0.002,
      };

      setPricing('custom-model', custom);

      const pricing = getPricing('custom-model');
      expect(pricing).toEqual(custom);
    });
  });

  describe('setPricing', () => {
    it('should set custom pricing for a model', () => {
      const pricing: ModelPricing = {
        promptPerThousand: 0.005,
        completionPerThousand: 0.01,
      };

      setPricing('my-model', pricing);

      expect(getPricing('my-model')).toEqual(pricing);
    });

    it('should override standard pricing', () => {
      const custom: ModelPricing = {
        promptPerThousand: 0.001,
        completionPerThousand: 0.001,
      };

      setPricing('claude-3-5-sonnet', custom);

      expect(getPricing('claude-3-5-sonnet')).toEqual(custom);
    });
  });

  describe('removePricing', () => {
    it('should remove custom pricing', () => {
      setPricing('temp-model', { promptPerThousand: 0.001, completionPerThousand: 0.001 });
      expect(getPricing('temp-model')).toBeDefined();

      const removed = removePricing('temp-model');

      expect(removed).toBe(true);
      expect(getPricing('temp-model')).toBeUndefined();
    });

    it('should return false if pricing did not exist', () => {
      const removed = removePricing('non-existent-model');
      expect(removed).toBe(false);
    });
  });

  describe('getCostPerThousandTokens', () => {
    it('should return pricing for a model', () => {
      const pricing = getCostPerThousandTokens('gpt-4');

      expect(pricing.promptPerThousand).toBe(0.03);
      expect(pricing.completionPerThousand).toBe(0.06);
    });

    it('should return default pricing for unknown models', () => {
      const pricing = getCostPerThousandTokens('unknown-model');

      expect(pricing).toEqual(MODEL_PRICING['default']);
    });
  });

  describe('listPricing', () => {
    it('should list all pricing configurations', () => {
      const pricing = listPricing();

      expect(pricing['claude-3-5-sonnet']).toBeDefined();
      expect(pricing['gpt-4']).toBeDefined();
      expect(pricing['default']).toBeDefined();
    });

    it('should include custom pricing', () => {
      setPricing('custom', { promptPerThousand: 0.001, completionPerThousand: 0.001 });

      const pricing = listPricing();

      expect(pricing['custom']).toBeDefined();
    });
  });
});

describe('Cost Tracking', () => {
  beforeEach(() => {
    costHistory.length = 0;
  });

  describe('recordCost', () => {
    it('should record a cost entry', () => {
      const entry = recordCost(
        'agent-1',
        'task-1',
        'project-1',
        'claude-3-5-sonnet',
        { prompt: 1000, completion: 500, total: 1500 },
        'api-call',
        { requestId: 'req-123' }
      );

      expect(entry.agentId).toBe('agent-1');
      expect(entry.taskId).toBe('task-1');
      expect(entry.projectId).toBe('project-1');
      expect(entry.model).toBe('claude-3-5-sonnet');
      expect(entry.operation).toBe('api-call');
      expect(entry.metadata).toEqual({ requestId: 'req-123' });
      expect(entry.cost.total).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const entry1 = recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 100, completion: 50, total: 150 });
      const entry2 = recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 100, completion: 50, total: 150 });

      expect(entry1.id).not.toBe(entry2.id);
    });
  });

  describe('getCostHistory', () => {
    beforeEach(() => {
      recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 100, completion: 50, total: 150 });
      recordCost('agent-2', 'task-2', 'project-1', 'gpt-4', { prompt: 200, completion: 100, total: 300 });
      recordCost('agent-1', 'task-3', 'project-2', 'claude', { prompt: 300, completion: 150, total: 450 });
    });

    it('should return all history by default', () => {
      const history = getCostHistory();
      expect(history.length).toBe(3);
    });

    it('should filter by agentId', () => {
      const history = getCostHistory({ agentId: 'agent-1' });
      expect(history.length).toBe(2);
      expect(history.every(h => h.agentId === 'agent-1')).toBe(true);
    });

    it('should filter by taskId', () => {
      const history = getCostHistory({ taskId: 'task-1' });
      expect(history.length).toBe(1);
      expect(history[0].taskId).toBe('task-1');
    });

    it('should filter by projectId', () => {
      const history = getCostHistory({ projectId: 'project-1' });
      expect(history.length).toBe(2);
      expect(history.every(h => h.projectId === 'project-1')).toBe(true);
    });

    it('should filter by model', () => {
      const history = getCostHistory({ model: 'claude' });
      expect(history.length).toBe(2);
      expect(history.every(h => h.model === 'claude')).toBe(true);
    });

    it('should filter by date range', () => {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000);
      const oneHourFromNow = new Date(Date.now() + 3600 * 1000);

      const history = getCostHistory({ since: oneHourAgo, until: oneHourFromNow });
      expect(history.length).toBe(3);
    });

    it('should filter out entries outside date range', () => {
      const oneHourFromNow = new Date(Date.now() + 3600 * 1000);

      const history = getCostHistory({ since: oneHourFromNow });
      expect(history.length).toBe(0);
    });

    it('should limit results', () => {
      const history = getCostHistory({ limit: 2 });
      expect(history.length).toBe(2);
    });

    it('should sort by timestamp descending', () => {
      const history = getCostHistory();
      
      for (let i = 1; i < history.length; i++) {
        expect(history[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          history[i].timestamp.getTime()
        );
      }
    });
  });

  describe('getAgentCostSummary', () => {
    it('should return cost summary for an agent', () => {
      recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 1000, completion: 500, total: 1500 });
      recordCost('agent-1', 'task-2', 'project-1', 'claude', { prompt: 2000, completion: 1000, total: 3000 });
      recordCost('agent-2', 'task-3', 'project-1', 'claude', { prompt: 500, completion: 250, total: 750 });

      const summary = getAgentCostSummary('agent-1');

      expect(summary.agentId).toBe('agent-1');
      expect(summary.totalTokens).toBe(4500);
      expect(summary.totalCost).toBeGreaterThan(0);
      expect(summary.entries.length).toBe(2);
    });

    it('should return empty summary for unknown agent', () => {
      const summary = getAgentCostSummary('unknown-agent');

      expect(summary.agentId).toBe('unknown-agent');
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(summary.entries).toEqual([]);
    });
  });

  describe('getTaskCostSummary', () => {
    it('should return cost summary for a task', () => {
      recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 1000, completion: 500, total: 1500 });
      recordCost('agent-2', 'task-1', 'project-1', 'claude', { prompt: 2000, completion: 1000, total: 3000 });

      const summary = getTaskCostSummary('task-1');

      expect(summary.taskId).toBe('task-1');
      expect(summary.totalTokens).toBe(4500);
      expect(summary.entries.length).toBe(2);
    });
  });

  describe('getProjectCostSummary', () => {
    it('should return cost summary for a project', () => {
      recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 1000, completion: 500, total: 1500 });
      recordCost('agent-2', 'task-2', 'project-1', 'claude', { prompt: 2000, completion: 1000, total: 3000 });
      recordCost('agent-1', 'task-3', 'project-2', 'claude', { prompt: 500, completion: 250, total: 750 });

      const summary = getProjectCostSummary('project-1');

      expect(summary.projectId).toBe('project-1');
      expect(summary.totalTokens).toBe(4500);
      expect(summary.entries.length).toBe(2);
    });
  });
});

describe('Cost Aggregation', () => {
  beforeEach(() => {
    costHistory.length = 0;
  });

  describe('aggregateCostsByPeriod', () => {
    it('should aggregate by day', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 1000, completion: 500, total: 1500 });
      recordCost('agent-1', 'task-2', 'project-1', 'claude', { prompt: 2000, completion: 1000, total: 3000 });

      // Create entries with different dates
      const entries = getCostHistory();
      // Modify timestamps for test
      entries[0].timestamp = now;
      entries[1].timestamp = yesterday;

      const aggregated = aggregateCostsByPeriod(entries, 'day');

      expect(aggregated.size).toBe(2);
    });

    it('should aggregate by month', () => {
      recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 1000, completion: 500, total: 1500 });
      recordCost('agent-1', 'task-2', 'project-1', 'claude', { prompt: 2000, completion: 1000, total: 3000 });

      const entries = getCostHistory();
      const aggregated = aggregateCostsByPeriod(entries, 'month');

      expect(aggregated.size).toBe(1); // Same month
    });
  });

  describe('aggregateCostsByModel', () => {
    it('should aggregate costs by model', () => {
      recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 1000, completion: 500, total: 1500 });
      recordCost('agent-1', 'task-2', 'project-1', 'gpt-4', { prompt: 2000, completion: 1000, total: 3000 });
      recordCost('agent-2', 'task-3', 'project-1', 'claude', { prompt: 500, completion: 250, total: 750 });

      const entries = getCostHistory();
      const aggregated = aggregateCostsByModel(entries);

      expect(aggregated.size).toBe(2);
      expect(aggregated.get('claude')?.count).toBe(2);
      expect(aggregated.get('gpt-4')?.count).toBe(1);
    });

    it('should sum tokens and costs correctly', () => {
      recordCost('agent-1', 'task-1', 'project-1', 'claude', { prompt: 1000, completion: 500, total: 1500 });
      recordCost('agent-2', 'task-2', 'project-1', 'claude', { prompt: 2000, completion: 1000, total: 3000 });

      const entries = getCostHistory();
      const aggregated = aggregateCostsByModel(entries);

      const claudeStats = aggregated.get('claude')!;
      expect(claudeStats.tokens).toBe(4500);
      expect(claudeStats.cost).toBeGreaterThan(0);
    });
  });
});

describe('Cost Optimization Suggestions', () => {
  beforeEach(() => {
    costHistory.length = 0;
  });

  it('should suggest model optimization for expensive model usage', () => {
    // Simulate high usage of expensive model
    for (let i = 0; i < 10; i++) {
      recordCost('agent-1', `task-${i}`, 'project-1', 'claude-3-opus', { 
        prompt: 10000, 
        completion: 5000, 
        total: 15000 
      });
    }
    // Add some cheap model usage
    for (let i = 0; i < 2; i++) {
      recordCost('agent-1', `task-cheap-${i}`, 'project-1', 'gpt-3.5-turbo', { 
        prompt: 1000, 
        completion: 500, 
        total: 1500 
      });
    }

    const entries = getCostHistory();
    const suggestions = generateOptimizationSuggestions(entries);

    const modelSuggestion = suggestions.find(s => s.type === 'model');
    expect(modelSuggestion).toBeDefined();
    expect(modelSuggestion?.potentialSavings).toBeGreaterThan(0);
  });

  it('should suggest token optimization for high token usage', () => {
    // Simulate high token usage per request
    for (let i = 0; i < 5; i++) {
      recordCost('agent-1', `task-${i}`, 'project-1', 'claude-3-5-sonnet', { 
        prompt: 100000, 
        completion: 50000, 
        total: 150000 
      });
    }

    const entries = getCostHistory();
    const suggestions = generateOptimizationSuggestions(entries);

    const tokenSuggestion = suggestions.find(s => s.type === 'tokens');
    expect(tokenSuggestion).toBeDefined();
  });

  it('should return empty array for no entries', () => {
    const suggestions = generateOptimizationSuggestions([]);
    expect(suggestions).toEqual([]);
  });
});
