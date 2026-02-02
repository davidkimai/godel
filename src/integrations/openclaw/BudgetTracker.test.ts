/**
 * Budget Tracker Tests
 * 
 * Verifies budget tracking, warning alerts, and automatic agent killing.
 * 
 * ANTI-STUB PROTOCOL: These tests verify actual budget enforcement.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  BudgetTracker, 
  BudgetConfig, 
  BudgetStatus,
  BudgetAlert,
  BudgetExceededError,
  getBudgetTracker,
  resetBudgetTracker 
} from './BudgetTracker';
import { UsageCalculator, UsageMetrics } from './UsageCalculator';

// Mock SQLiteStorage for testing
class MockSQLiteStorage {
  private data: Map<string, any> = new Map();
  private tables: Set<string> = new Set();

  async run(sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number }> {
    // Parse simple INSERT/UPDATE/DELETE operations
    if (sql.includes('CREATE TABLE')) {
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
      if (tableName) this.tables.add(tableName);
      return { changes: 0, lastInsertRowid: 0 };
    }
    
    if (sql.includes('CREATE INDEX')) {
      return { changes: 0, lastInsertRowid: 0 };
    }
    
    if (sql.includes('INSERT OR REPLACE')) {
      const key = params[0] as string;
      this.data.set(key, params);
      return { changes: 1, lastInsertRowid: 1 };
    }
    
    if (sql.includes('UPDATE')) {
      const key = params[params.length - 1] as string;
      if (this.data.has(key)) {
        this.data.set(key, params);
        return { changes: 1, lastInsertRowid: 1 };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }
    
    if (sql.includes('DELETE')) {
      const key = params[0] as string;
      const existed = this.data.delete(key);
      return { changes: existed ? 1 : 0, lastInsertRowid: 0 };
    }
    
    return { changes: 0, lastInsertRowid: 0 };
  }

  async get(sql: string, ...params: unknown[]): Promise<any> {
    const key = params[0] as string;
    return this.data.get(key) || null;
  }

  async all(sql: string, ...params: unknown[]): Promise<any[]> {
    return Array.from(this.data.values());
  }
}

describe('BudgetTracker', () => {
  let storage: MockSQLiteStorage;
  let tracker: BudgetTracker;
  let alerts: BudgetAlert[] = [];
  let killedAgents: Array<{ agentId: string; reason: string }> = [];

  beforeEach(async () => {
    storage = new MockSQLiteStorage();
    resetBudgetTracker();
    tracker = getBudgetTracker(storage as any);
    alerts = [];
    killedAgents = [];

    // Set up alert handler
    tracker.onAlert((alert) => {
      alerts.push(alert);
    });

    // Set up kill handler
    tracker.onKill(async (agentId, reason) => {
      killedAgents.push({ agentId, reason });
    });
  });

  afterEach(() => {
    resetBudgetTracker();
  });

  describe('Agent Registration', () => {
    it('should register an agent with budget', async () => {
      const config: BudgetConfig = {
        totalBudget: 10.0,
        perAgentLimit: 2.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-1', config);
      const status = await tracker.check('agent-1');

      expect(status.agentId).toBe('agent-1');
      expect(status.budgetLimit).toBe(2.0);
      expect(status.totalSpent).toBe(0);
      expect(status.remaining).toBe(2.0);
      expect(status.percentUsed).toBe(0);
      expect(status.isExceeded).toBe(false);
      expect(status.isWarning).toBe(false);
    });

    it('should use totalBudget when perAgentLimit not specified', async () => {
      const config: BudgetConfig = {
        totalBudget: 5.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-2', config);
      const status = await tracker.check('agent-2');

      expect(status.budgetLimit).toBe(5.0);
    });
  });

  describe('Budget Tracking', () => {
    it('should track usage and update totals', async () => {
      const config: BudgetConfig = {
        totalBudget: 10.0,
        perAgentLimit: 2.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-1', config);

      const usage: UsageMetrics = {
        totalSpent: 0.5,
        agentBreakdown: { 'agent-1': 0.5 },
        toolBreakdown: {},
        tokenBreakdown: { input: 1000, output: 500, total: 1500 },
      };

      const status = await tracker.track('agent-1', usage);

      expect(status.totalSpent).toBe(0.5);
      expect(status.remaining).toBe(1.5);
      expect(status.percentUsed).toBe(0.25);
    });

    it('should accumulate usage across multiple track calls', async () => {
      const config: BudgetConfig = {
        totalBudget: 10.0,
        perAgentLimit: 2.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-1', config);

      await tracker.track('agent-1', {
        totalSpent: 0.5,
        agentBreakdown: { 'agent-1': 0.5 },
        toolBreakdown: {},
        tokenBreakdown: { input: 1000, output: 500, total: 1500 },
      });

      await tracker.track('agent-1', {
        totalSpent: 0.3,
        agentBreakdown: { 'agent-1': 0.3 },
        toolBreakdown: {},
        tokenBreakdown: { input: 600, output: 300, total: 900 },
      });

      const status = await tracker.check('agent-1');
      expect(status.totalSpent).toBe(0.8);
      expect(status.remaining).toBe(1.2);
    });
  });

  describe('Warning Threshold', () => {
    it('should trigger warning at 80% usage', async () => {
      const config: BudgetConfig = {
        totalBudget: 10.0,
        perAgentLimit: 1.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-1', config);

      // Use 85% of budget
      await tracker.track('agent-1', {
        totalSpent: 0.85,
        agentBreakdown: { 'agent-1': 0.85 },
        toolBreakdown: {},
        tokenBreakdown: { input: 1000, output: 500, total: 1500 },
      });

      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toBe('warning');
      expect(alerts[0].agentId).toBe('agent-1');
      expect(alerts[0].currentSpent).toBe(0.85);
      expect(alerts[0].budgetLimit).toBe(1.0);
    });

    it('should only trigger warning once', async () => {
      const config: BudgetConfig = {
        totalBudget: 10.0,
        perAgentLimit: 1.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-1', config);

      // Use 85% of budget twice
      await tracker.track('agent-1', {
        totalSpent: 0.5,
        agentBreakdown: { 'agent-1': 0.5 },
        toolBreakdown: {},
        tokenBreakdown: { input: 1000, output: 500, total: 1500 },
      });

      // This should trigger warning (at 85%)
      await tracker.track('agent-1', {
        totalSpent: 0.35,
        agentBreakdown: { 'agent-1': 0.35 },
        toolBreakdown: {},
        tokenBreakdown: { input: 700, output: 350, total: 1050 },
      });

      // This should NOT trigger another warning
      await tracker.track('agent-1', {
        totalSpent: 0.05,
        agentBreakdown: { 'agent-1': 0.05 },
        toolBreakdown: {},
        tokenBreakdown: { input: 100, output: 50, total: 150 },
      });

      expect(alerts.filter(a => a.type === 'warning').length).toBe(1);
    });
  });

  describe('Budget Enforcement', () => {
    it('should kill agent when budget exceeded', async () => {
      const config: BudgetConfig = {
        totalBudget: 10.0,
        perAgentLimit: 1.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-1', config);

      // Exceed budget
      await tracker.track('agent-1', {
        totalSpent: 1.5,  // Over the $1.00 limit
        agentBreakdown: { 'agent-1': 1.5 },
        toolBreakdown: {},
        tokenBreakdown: { input: 1000, output: 500, total: 1500 },
      });

      // Should have exceeded and killed alerts
      expect(alerts.filter(a => a.type === 'exceeded').length).toBe(1);
      expect(alerts.filter(a => a.type === 'killed').length).toBe(1);
      
      // Agent should be killed
      expect(killedAgents.length).toBe(1);
      expect(killedAgents[0].agentId).toBe('agent-1');
      expect(killedAgents[0].reason).toContain('Budget exceeded');
    });

    it('should throw BudgetExceededError for killed agents', async () => {
      const config: BudgetConfig = {
        totalBudget: 10.0,
        perAgentLimit: 1.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-1', config);

      // Exceed budget
      await tracker.track('agent-1', {
        totalSpent: 1.5,
        agentBreakdown: { 'agent-1': 1.5 },
        toolBreakdown: {},
        tokenBreakdown: { input: 1000, output: 500, total: 1500 },
      });

      // Try to track more usage
      await expect(tracker.track('agent-1', {
        totalSpent: 0.1,
        agentBreakdown: { 'agent-1': 0.1 },
        toolBreakdown: {},
        tokenBreakdown: { input: 100, output: 50, total: 150 },
      })).rejects.toThrow(BudgetExceededError);
    });
  });

  describe('Swarm Budgets', () => {
    it('should track per-swarm budget limits', async () => {
      const swarmConfig: BudgetConfig = {
        totalBudget: 5.0,
        warningThreshold: 0.8,
      };

      await tracker.registerSwarm('swarm-1', swarmConfig);
      
      await tracker.registerAgent('agent-1', { ...swarmConfig, perAgentLimit: 2.0 }, 'swarm-1');
      await tracker.registerAgent('agent-2', { ...swarmConfig, perAgentLimit: 2.0 }, 'swarm-1');

      await tracker.track('agent-1', {
        totalSpent: 1.0,
        agentBreakdown: { 'agent-1': 1.0 },
        toolBreakdown: {},
        tokenBreakdown: { input: 1000, output: 500, total: 1500 },
      });

      await tracker.track('agent-2', {
        totalSpent: 0.5,
        agentBreakdown: { 'agent-2': 0.5 },
        toolBreakdown: {},
        tokenBreakdown: { input: 500, output: 250, total: 750 },
      });

      const swarmStatus = await tracker.checkSwarm('swarm-1');
      
      expect(swarmStatus.totalBudget).toBe(5.0);
      expect(swarmStatus.totalSpent).toBe(1.5);
      expect(swarmStatus.remaining).toBe(3.5);
      expect(swarmStatus.agentCount).toBe(2);
    });
  });

  describe('Session History Tracking', () => {
    it('should calculate cost from session history', async () => {
      const config: BudgetConfig = {
        totalBudget: 10.0,
        perAgentLimit: 2.0,
        warningThreshold: 0.8,
      };

      await tracker.registerAgent('agent-1', config);

      const sessionHistory = [
        {
          id: '1',
          role: 'user' as const,
          content: 'Hello',
          tokens: { input: 100, output: 50 },
          tools: [{ name: 'read', input: {} }],
          timestamp: new Date().toISOString(),
        },
        {
          id: '2',
          role: 'assistant' as const,
          content: 'Hi there',
          tokens: { input: 50, output: 100 },
          timestamp: new Date().toISOString(),
        },
      ];

      const status = await tracker.trackFromSessionHistory('agent-1', sessionHistory);
      
      // Cost should be calculated from tokens and tools
      expect(status.totalSpent).toBeGreaterThan(0);
    });
  });
});

describe('UsageCalculator', () => {
  let calculator: UsageCalculator;

  beforeEach(() => {
    calculator = new UsageCalculator();
  });

  describe('Token Cost Calculation', () => {
    it('should calculate GPT-4 costs correctly', () => {
      // GPT-4: $30 per 1M input, $60 per 1M output
      const cost = calculator.calculateTokenCost('gpt-4', 1000000, 1000000);
      
      expect(cost).toBeCloseTo(90.0, 2); // $30 + $60 = $90
    });

    it('should calculate GPT-4o costs correctly', () => {
      // GPT-4o: $2.50 per 1M input, $10 per 1M output
      const cost = calculator.calculateTokenCost('gpt-4o', 1000000, 1000000);
      
      expect(cost).toBeCloseTo(12.50, 2); // $2.50 + $10 = $12.50
    });

    it('should use default pricing for unknown models', () => {
      const cost = calculator.calculateTokenCost('unknown-model', 1000000, 1000000);
      
      // Should use default pricing (GPT-4 Turbo)
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('Tool Cost Calculation', () => {
    it('should calculate tool costs correctly', () => {
      const cost = calculator.calculateToolCost('exec', { durationMs: 5000 });
      
      // Base cost $0.001 + (5 seconds * $0.0001/second)
      expect(cost).toBeCloseTo(0.0015, 4);
    });

    it('should use default cost for unknown tools', () => {
      const cost = calculator.calculateToolCost('unknown-tool');
      
      expect(cost).toBe(0.001); // Default base cost
    });
  });

  describe('Batch Cost Calculation', () => {
    it('should calculate batch tool costs', () => {
      const calls = [
        { toolName: 'read' },
        { toolName: 'write' },
        { toolName: 'exec', durationMs: 1000 },
      ];

      const result = calculator.calculateToolBatchCost(calls);
      
      expect(result.total).toBeGreaterThan(0);
      expect(Object.keys(result.breakdown).length).toBe(3);
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate task costs', () => {
      const estimate = calculator.estimateTaskCost({
        modelId: 'gpt-4o',
        expectedPrompts: 10,
        avgPromptLength: 1000,
        avgResponseLength: 500,
        expectedTools: [
          { toolName: 'read', expectedCalls: 5 },
          { toolName: 'write', expectedCalls: 3 },
        ],
      });

      expect(estimate.minCost).toBeGreaterThan(0);
      expect(estimate.maxCost).toBeGreaterThan(estimate.minCost);
      expect(estimate.expectedCost).toBeGreaterThan(0);
      expect(['medium', 'high']).toContain(estimate.confidence);
      expect(estimate.breakdown.tokens).toBeGreaterThan(0);
      expect(estimate.breakdown.tools).toBeGreaterThan(0);
    });
  });

  describe('Aggregate Usage', () => {
    it('should aggregate agent usage', () => {
      const agentUsages = [
        {
          agentId: 'agent-1',
          modelId: 'gpt-4o',
          inputTokens: 1000000,
          outputTokens: 500000,
          toolCalls: [
            { toolName: 'read' },
            { toolName: 'write' },
          ],
        },
        {
          agentId: 'agent-2',
          modelId: 'gpt-4o-mini',
          inputTokens: 2000000,
          outputTokens: 1000000,
          toolCalls: [{ toolName: 'exec', durationMs: 5000 }],
        },
      ];

      const metrics = calculator.aggregateAgentUsage(agentUsages);

      expect(metrics.totalSpent).toBeGreaterThan(0);
      expect(Object.keys(metrics.agentBreakdown).length).toBe(2);
      expect(metrics.tokenBreakdown.total).toBe(4500000);
    });
  });
});
