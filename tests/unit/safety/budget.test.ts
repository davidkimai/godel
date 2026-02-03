/**
 * Budget Module Unit Tests
 * 
 * Tests for budget tracking, threshold monitoring, and cost calculation.
 */

import {
  setBudgetConfig,
  getBudgetConfig,
  startBudgetTracking,
  trackTokenUsage,
  getBudgetUsage,
  checkBudgetExceeded,
  addBudgetAlert,
  getBudgetAlerts,
  removeBudgetAlert,
  getBudgetHistory,
  calculateCostForUsage,
  BudgetConfig,
  TokenCount,
} from '../../../src/safety/budget';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
jest.mock('fs');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Budget Module', () => {
  const mockBudgetDir = path.join(os.homedir(), '.config', 'dash');
  const mockBudgetsFile = path.join(mockBudgetDir, 'budgets.json');

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fs.existsSync
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    
    // Mock fs.readFileSync for empty budgets
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
      configs: {},
      alerts: {},
      version: '1.0',
      updatedAt: new Date().toISOString(),
    }));
    
    // Mock fs.writeFileSync
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    
    // Mock fs.mkdirSync
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
  });

  describe('setBudgetConfig', () => {
    it('should set budget config for a scope', () => {
      const config: Partial<BudgetConfig> = {
        maxTokens: 10000,
        maxCost: 5.0,
        period: 'daily',
      };
      
      setBudgetConfig('agent', 'agent-1', config);
      
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should persist budget to disk', () => {
      const config: Partial<BudgetConfig> = {
        maxTokens: 100000,
        maxCost: 50.0,
        period: 'monthly',
      };
      
      setBudgetConfig('project', 'project-1', config);
      
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toBe(mockBudgetsFile);
      
      const writtenData = JSON.parse(writeCall[1]);
      expect(writtenData.configs).toBeDefined();
    });

    it('should update existing config', () => {
      const config1: Partial<BudgetConfig> = {
        maxTokens: 10000,
        maxCost: 5.0,
      };
      
      const config2: Partial<BudgetConfig> = {
        maxTokens: 20000,
        maxCost: 10.0,
      };
      
      setBudgetConfig('agent', 'agent-1', config1);
      setBudgetConfig('agent', 'agent-1', config2);
      
      const config = getBudgetConfig('agent', 'agent-1');
      expect(config?.maxTokens).toBe(20000);
      expect(config?.maxCost).toBe(10.0);
    });
  });

  describe('getBudgetConfig', () => {
    it('should return undefined for non-existent config', () => {
      const config = getBudgetConfig('agent', 'non-existent');
      expect(config).toBeUndefined();
    });

    it('should return config after setting', () => {
      const config: Partial<BudgetConfig> = {
        maxTokens: 50000,
        maxCost: 25.0,
      };
      
      setBudgetConfig('swarm', 'swarm-1', config);
      const retrieved = getBudgetConfig('swarm', 'swarm-1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe('swarm');
      expect(retrieved?.maxTokens).toBe(50000);
    });
  });

  describe('startBudgetTracking', () => {
    it('should start tracking for an agent', () => {
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 10000,
          maxCost: 5.0,
        },
      });
      
      expect(tracking).toBeDefined();
      expect(tracking.agentId).toBe('agent-1');
      expect(tracking.tokensUsed.total).toBe(0);
      expect(tracking.costUsed.total).toBe(0);
    });

    it('should generate unique tracking ID', () => {
      const tracking1 = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 10000,
          maxCost: 5.0,
        },
      });
      
      const tracking2 = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 10000,
          maxCost: 5.0,
        },
      });
      
      expect(tracking1.id).not.toBe(tracking2.id);
    });

    it('should set startedAt timestamp', () => {
      const before = new Date();
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 10000,
          maxCost: 5.0,
        },
      });
      const after = new Date();
      
      expect(tracking.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(tracking.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('trackTokenUsage', () => {
    it('should track token usage', () => {
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 10000,
          maxCost: 5.0,
        },
      });
      
      const tokens: TokenCount = {
        prompt: 100,
        completion: 50,
        total: 150,
      };
      
      trackTokenUsage(tracking.id, tokens);
      const usage = getBudgetUsage(tracking.id);
      
      expect(usage.tokensUsed.total).toBe(150);
      expect(usage.tokensUsed.prompt).toBe(100);
      expect(usage.tokensUsed.completion).toBe(50);
    });

    it('should accumulate usage across multiple calls', () => {
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 10000,
          maxCost: 5.0,
        },
      });
      
      trackTokenUsage(tracking.id, { prompt: 100, completion: 50, total: 150 });
      trackTokenUsage(tracking.id, { prompt: 200, completion: 100, total: 300 });
      
      const usage = getBudgetUsage(tracking.id);
      expect(usage.tokensUsed.total).toBe(450);
    });

    it('should calculate cost based on model pricing', () => {
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 10000,
          maxCost: 5.0,
        },
      });
      
      trackTokenUsage(tracking.id, { prompt: 1000, completion: 500, total: 1500 });
      
      const usage = getBudgetUsage(tracking.id);
      expect(usage.costUsed.total).toBeGreaterThan(0);
    });
  });

  describe('checkBudgetExceeded', () => {
    it('should return false when under budget', () => {
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 10000,
          maxCost: 5.0,
        },
      });
      
      trackTokenUsage(tracking.id, { prompt: 100, completion: 50, total: 150 });
      
      const result = checkBudgetExceeded(tracking.id);
      expect(result.exceeded).toBe(false);
    });

    it('should return true when over token budget', () => {
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
        budgetConfig: {
          type: 'agent',
          scope: 'agent-1',
          maxTokens: 100,
          maxCost: 5.0,
        },
      });
      
      trackTokenUsage(tracking.id, { prompt: 200, completion: 100, total: 300 });
      
      const result = checkBudgetExceeded(tracking.id);
      expect(result.exceeded).toBe(true);
    });
  });

  describe('addBudgetAlert', () => {
    it('should set budget alert', () => {
      const alert = addBudgetAlert('project-1', 80, {
        webhookUrl: 'https://example.com/webhook',
      });
      
      expect(alert).toBeDefined();
      expect(alert.budgetId).toBe('project-1');
      expect(alert.threshold).toBe(80);
    });

    it('should persist alert to disk', () => {
      addBudgetAlert('project-1', 80, {
        webhookUrl: 'https://example.com/webhook',
      });
      
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getBudgetAlerts', () => {
    it('should return empty array when no alerts', () => {
      const alerts = getBudgetAlerts('non-existent');
      expect(alerts).toEqual([]);
    });

    it('should return alerts for budget', () => {
      addBudgetAlert('project-1', 80, {});
      addBudgetAlert('project-1', 90, {});
      
      const alerts = getBudgetAlerts('project-1');
      
      expect(alerts).toHaveLength(2);
    });
  });

  describe('removeBudgetAlert', () => {
    it('should remove specific alert', () => {
      const alert1 = addBudgetAlert('project-1', 80, {});
      addBudgetAlert('project-1', 90, {});
      
      removeBudgetAlert('project-1', alert1.id);
      
      const alerts = getBudgetAlerts('project-1');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].threshold).toBe(90);
    });
  });

  describe('getBudgetHistory', () => {
    it('should return empty array initially', () => {
      const history = getBudgetHistory();
      expect(history).toEqual([]);
    });
  });

  describe('calculateCostForUsage', () => {
    it('should calculate cost for token usage', () => {
      const cost = calculateCostForUsage(1000, 500, 'kimi-k2.5');
      
      expect(cost.total).toBeGreaterThan(0);
      expect(cost.prompt).toBeGreaterThan(0);
      expect(cost.completion).toBeGreaterThan(0);
      expect(cost.total).toBe(cost.prompt + cost.completion);
    });

    it('should handle unknown model', () => {
      const cost = calculateCostForUsage(1000, 500, 'unknown-model');
      
      expect(cost.total).toBe(0);
    });
  });
});
