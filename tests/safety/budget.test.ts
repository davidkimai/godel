/**
 * Budget Tracking Tests
 */

import {
  // Budget configuration
  setBudgetConfig,
  getBudgetConfig,
  setProjectDailyBudget,
  setTaskBudget,
  setAgentBudget,
  budgetConfigs,
  
  // Budget tracking
  startBudgetTracking,
  recordTokenUsage,
  getBudgetUsage,
  getBudgetTracking,
  completeBudgetTracking,
  killBudgetTracking,
  activeBudgets,
  
  // Status and reporting
  getAgentBudgetStatus,
  getProjectBudgetStatus,
  generateBudgetReport,
  
  // Alerts and history
  addBudgetAlert,
  getBudgetAlerts,
  removeBudgetAlert,
  getBudgetHistory,
  budgetHistory,
  budgetAlerts,
  
  // Types
  BudgetConfig,
  BudgetType,
} from '../../src/safety/budget';

import { clearAuditLog } from '../../src/safety/thresholds';

// Mock logger
jest.mock('../../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Budget Configuration', () => {
  beforeEach(() => {
    budgetConfigs.clear();
    budgetHistory.length = 0;
  });

  describe('setBudgetConfig', () => {
    it('should set a budget configuration', () => {
      const config: BudgetConfig = {
        type: 'project',
        scope: 'test-project',
        maxTokens: 1_000_000,
        maxCost: 100,
        period: 'daily',
      };

      const result = setBudgetConfig(config);

      expect(result).toEqual(config);
      expect(getBudgetConfig('project', 'test-project')).toEqual(config);
    });

    it('should log budget_set event to history', () => {
      const config: BudgetConfig = {
        type: 'agent',
        scope: 'agent-1',
        maxTokens: 100_000,
        maxCost: 10,
      };

      setBudgetConfig(config);

      expect(budgetHistory.length).toBe(1);
      expect(budgetHistory[0].eventType).toBe('budget_set');
      expect(budgetHistory[0].budgetId).toBe('agent:agent-1');
    });

    it('should support all budget types', () => {
      const types: BudgetType[] = ['task', 'agent', 'swarm', 'project'];
      
      for (const type of types) {
        const config: BudgetConfig = {
          type,
          scope: `test-${type}`,
          maxTokens: 100_000,
          maxCost: 10,
        };

        setBudgetConfig(config);
        expect(getBudgetConfig(type, `test-${type}`)).toEqual(config);
      }
    });
  });

  describe('setProjectDailyBudget', () => {
    it('should create a project daily budget', () => {
      const config = setProjectDailyBudget('my-project', 500_000, 100, 5);

      expect(config.type).toBe('project');
      expect(config.scope).toBe('my-project');
      expect(config.maxTokens).toBe(500_000);
      expect(config.maxCost).toBe(100);
      expect(config.period).toBe('daily');
      expect(config.resetHour).toBe(5);
    });

    it('should use default reset hour of 0', () => {
      const config = setProjectDailyBudget('my-project', 500_000, 100);

      expect(config.resetHour).toBe(0);
    });
  });

  describe('setTaskBudget', () => {
    it('should create a task budget', () => {
      const config = setTaskBudget('task-123', 100_000, 5);

      expect(config.type).toBe('task');
      expect(config.scope).toBe('task-123');
      expect(config.maxTokens).toBe(100_000);
      expect(config.maxCost).toBe(5);
    });
  });

  describe('setAgentBudget', () => {
    it('should create an agent budget', () => {
      const config = setAgentBudget('agent-abc', 1_000_000, 50);

      expect(config.type).toBe('agent');
      expect(config.scope).toBe('agent-abc');
      expect(config.maxTokens).toBe(1_000_000);
      expect(config.maxCost).toBe(50);
    });
  });

  describe('getBudgetConfig', () => {
    it('should return undefined for non-existent config', () => {
      const result = getBudgetConfig('project', 'non-existent');
      expect(result).toBeUndefined();
    });

    it('should retrieve the correct config by type and scope', () => {
      setBudgetConfig({
        type: 'project',
        scope: 'project-a',
        maxTokens: 100,
        maxCost: 10,
      });

      setBudgetConfig({
        type: 'project',
        scope: 'project-b',
        maxTokens: 200,
        maxCost: 20,
      });

      expect(getBudgetConfig('project', 'project-a')?.maxTokens).toBe(100);
      expect(getBudgetConfig('project', 'project-b')?.maxTokens).toBe(200);
    });
  });
});

describe('Budget Tracking', () => {
  beforeEach(() => {
    budgetConfigs.clear();
    activeBudgets.clear();
    budgetHistory.length = 0;
    clearAuditLog();
  });

  describe('startBudgetTracking', () => {
    it('should create a new budget tracking instance', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);

      const tracking = startBudgetTracking(
        'agent-1',
        'task-1',
        'test-project',
        'claude-3-5-sonnet'
      );

      expect(tracking.agentId).toBe('agent-1');
      expect(tracking.taskId).toBe('task-1');
      expect(tracking.projectId).toBe('test-project');
      expect(tracking.model).toBe('claude-3-5-sonnet');
      expect(tracking.tokensUsed.total).toBe(0);
      expect(tracking.costUsed.total).toBe(0);
      expect(tracking.thresholdHistory).toEqual([]);
    });

    it('should use existing budget config', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);

      const tracking = startBudgetTracking(
        'agent-1',
        'task-1',
        'test-project',
        'claude-3-5-sonnet'
      );

      expect(tracking.budgetConfig.maxTokens).toBe(1_000_000);
      expect(tracking.budgetConfig.maxCost).toBe(100);
    });

    it('should use default config when no config exists', () => {
      const tracking = startBudgetTracking(
        'agent-1',
        'task-1',
        'unknown-project',
        'claude-3-5-sonnet'
      );

      expect(tracking.budgetConfig.scope).toBe('default');
      expect(tracking.budgetConfig.maxCost).toBe(1000);
    });

    it('should include optional swarmId', () => {
      const tracking = startBudgetTracking(
        'agent-1',
        'task-1',
        'test-project',
        'claude-3-5-sonnet',
        'swarm-1'
      );

      expect(tracking.swarmId).toBe('swarm-1');
    });
  });

  describe('recordTokenUsage', () => {
    it('should update token and cost tracking', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);
      const tracking = startBudgetTracking(
        'agent-1',
        'task-1',
        'test-project',
        'claude-3-5-sonnet'
      );

      const result = recordTokenUsage(tracking.id, 1000, 500);

      const updated = getBudgetTracking(tracking.id)!;
      expect(updated.tokensUsed.prompt).toBe(1000);
      expect(updated.tokensUsed.completion).toBe(500);
      expect(updated.tokensUsed.total).toBe(1500);
      expect(updated.costUsed.total).toBeGreaterThan(0);
    });

    it('should return null for non-existent budget', () => {
      const result = recordTokenUsage('non-existent', 1000, 500);
      expect(result).toBeNull();
    });

    it('should accumulate multiple usages', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);
      const tracking = startBudgetTracking(
        'agent-1',
        'task-1',
        'test-project',
        'claude-3-5-sonnet'
      );

      recordTokenUsage(tracking.id, 1000, 500);
      recordTokenUsage(tracking.id, 2000, 1000);

      const updated = getBudgetTracking(tracking.id)!;
      expect(updated.tokensUsed.total).toBe(4500);
    });
  });

  describe('getBudgetUsage', () => {
    it('should calculate percentage used correctly', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);
      const tracking = startBudgetTracking(
        'agent-1',
        'task-1',
        'test-project',
        'claude-3-5-sonnet'
      );

      // Use ~10% of budget ($10 / $100 = 10%)
      recordTokenUsage(tracking.id, 100_000, 50_000);

      const updated = getBudgetTracking(tracking.id)!;
      const usage = getBudgetUsage(updated);

      expect(usage.percentageUsed).toBeGreaterThan(0);
      expect(usage.tokensUsed.total).toBe(150_000);
    });
  });

  describe('completeBudgetTracking', () => {
    it('should mark tracking as completed', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);
      const tracking = startBudgetTracking('agent-1', 'task-1', 'test-project', 'claude-3-5-sonnet');

      const completed = completeBudgetTracking(tracking.id);

      expect(completed).not.toBeNull();
      expect(completed?.completedAt).toBeDefined();
    });

    it('should return null for non-existent tracking', () => {
      const result = completeBudgetTracking('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('killBudgetTracking', () => {
    it('should mark tracking as killed', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);
      const tracking = startBudgetTracking('agent-1', 'task-1', 'test-project', 'claude-3-5-sonnet');

      const killed = killBudgetTracking(tracking.id, 'budget exceeded');

      expect(killed).not.toBeNull();
      expect(killed?.completedAt).toBeDefined();
      
      // Should log to history
      expect(budgetHistory.some(h => h.eventType === 'budget_killed')).toBe(true);
    });

    it('should return null for non-existent tracking', () => {
      const result = killBudgetTracking('non-existent', 'test');
      expect(result).toBeNull();
    });
  });
});

describe('Budget Status and Reporting', () => {
  beforeEach(() => {
    budgetConfigs.clear();
    activeBudgets.clear();
    budgetHistory.length = 0;
  });

  describe('getAgentBudgetStatus', () => {
    it('should return all budgets for an agent', () => {
      setProjectDailyBudget('project-a', 1_000_000, 100);
      setProjectDailyBudget('project-b', 1_000_000, 100);

      startBudgetTracking('agent-1', 'task-1', 'project-a', 'claude-3-5-sonnet');
      startBudgetTracking('agent-1', 'task-2', 'project-b', 'claude-3-5-sonnet');
      startBudgetTracking('agent-2', 'task-3', 'project-a', 'claude-3-5-sonnet');

      const budgets = getAgentBudgetStatus('agent-1');
      expect(budgets.length).toBe(2);
    });

    it('should return empty array for agent with no budgets', () => {
      const budgets = getAgentBudgetStatus('unknown-agent');
      expect(budgets).toEqual([]);
    });
  });

  describe('getProjectBudgetStatus', () => {
    it('should return all budgets for a project with totals', () => {
      setProjectDailyBudget('project-a', 1_000_000, 100);

      startBudgetTracking('agent-1', 'task-1', 'project-a', 'claude-3-5-sonnet');
      startBudgetTracking('agent-2', 'task-2', 'project-a', 'claude-3-5-sonnet');

      const status = getProjectBudgetStatus('project-a');

      expect(status.budgets.length).toBe(2);
      expect(status.totalUsed.total).toBe(0);
      expect(status.config).toBeDefined();
    });
  });

  describe('generateBudgetReport', () => {
    it('should generate a budget report', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);
      
      const tracking1 = startBudgetTracking('agent-1', 'task-1', 'test-project', 'claude-3-5-sonnet');
      recordTokenUsage(tracking1.id, 10_000, 5_000);
      completeBudgetTracking(tracking1.id);

      const tracking2 = startBudgetTracking('agent-2', 'task-2', 'test-project', 'claude-3-5-sonnet');
      recordTokenUsage(tracking2.id, 20_000, 10_000);

      const report = generateBudgetReport('test-project', 'month');

      expect(report.projectId).toBe('test-project');
      expect(report.period).toBe('month');
      expect(report.totalBudget).toBe(100);
      expect(report.agentBreakdown.length).toBe(2);
      expect(report.totalUsed).toBeGreaterThan(0);
    });

    it('should calculate agent breakdown correctly', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);
      
      const tracking1 = startBudgetTracking('agent-1', 'task-1', 'test-project', 'claude-3-5-sonnet');
      recordTokenUsage(tracking1.id, 10_000, 5_000);

      const tracking2 = startBudgetTracking('agent-2', 'task-2', 'test-project', 'claude-3-5-sonnet');
      recordTokenUsage(tracking2.id, 20_000, 10_000);

      const report = generateBudgetReport('test-project', 'month');

      const agent1 = report.agentBreakdown.find(a => a.agentId === 'agent-1');
      const agent2 = report.agentBreakdown.find(a => a.agentId === 'agent-2');

      expect(agent1).toBeDefined();
      expect(agent2).toBeDefined();
      expect(agent1!.tokensUsed).toBe(15_000);
      expect(agent2!.tokensUsed).toBe(30_000);
    });

    it('should calculate daily usage', () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);
      
      const tracking = startBudgetTracking('agent-1', 'task-1', 'test-project', 'claude-3-5-sonnet');
      recordTokenUsage(tracking.id, 10_000, 5_000);

      const report = generateBudgetReport('test-project', 'month');

      expect(report.dailyUsage.length).toBeGreaterThan(0);
      expect(report.dailyUsage[0].date).toBeDefined();
      expect(report.dailyUsage[0].tokens).toBeGreaterThan(0);
    });
  });
});

describe('Budget Alerts and History', () => {
  beforeEach(() => {
    budgetConfigs.clear();
    budgetHistory.length = 0;
    budgetAlerts.clear();
  });

  describe('addBudgetAlert', () => {
    it('should add a webhook alert', () => {
      const alert = addBudgetAlert('test-project', 75, {
        webhookUrl: 'https://hooks.slack.com/test',
      });

      expect(alert.budgetId).toBe('test-project');
      expect(alert.threshold).toBe(75);
      expect(alert.webhookUrl).toBe('https://hooks.slack.com/test');
    });

    it('should add an email alert', () => {
      const alert = addBudgetAlert('test-project', 90, {
        email: 'admin@example.com',
      });

      expect(alert.threshold).toBe(90);
      expect(alert.email).toBe('admin@example.com');
    });

    it('should add an SMS alert', () => {
      const alert = addBudgetAlert('test-project', 100, {
        sms: '+1234567890',
      });

      expect(alert.threshold).toBe(100);
      expect(alert.sms).toBe('+1234567890');
    });
  });

  describe('getBudgetAlerts', () => {
    it('should return all alerts for a project', () => {
      addBudgetAlert('test-project', 75, { webhookUrl: 'https://test1.com' });
      addBudgetAlert('test-project', 90, { email: 'test@example.com' });
      addBudgetAlert('other-project', 80, { webhookUrl: 'https://test2.com' });

      const alerts = getBudgetAlerts('test-project');

      expect(alerts.length).toBe(2);
    });

    it('should return empty array for project with no alerts', () => {
      const alerts = getBudgetAlerts('no-alerts-project');
      expect(alerts).toEqual([]);
    });
  });

  describe('removeBudgetAlert', () => {
    it('should remove an alert', () => {
      const alert = addBudgetAlert('test-project', 75, { webhookUrl: 'https://test.com' });
      
      const removed = removeBudgetAlert('test-project', alert.id);

      expect(removed).toBe(true);
      expect(getBudgetAlerts('test-project').length).toBe(0);
    });

    it('should return false for non-existent alert', () => {
      const removed = removeBudgetAlert('test-project', 'non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getBudgetHistory', () => {
    it('should return all history entries', () => {
      setProjectDailyBudget('project-a', 1_000_000, 100);
      setTaskBudget('task-1', 100_000, 10);

      const history = getBudgetHistory();

      expect(history.length).toBe(2);
    });

    it('should filter by project', () => {
      setProjectDailyBudget('project-a', 1_000_000, 100);
      setProjectDailyBudget('project-b', 1_000_000, 100);

      const history = getBudgetHistory('project-a');

      expect(history.length).toBe(1);
      expect(history[0].budgetId).toContain('project-a');
    });

    it('should filter by date', () => {
      setProjectDailyBudget('project-a', 1_000_000, 100);

      const oneHourAgo = new Date(Date.now() - 3600 * 1000);
      const history = getBudgetHistory('project-a', oneHourAgo);

      expect(history.length).toBe(1);
    });

    it('should filter out entries before since date', () => {
      setProjectDailyBudget('project-a', 1_000_000, 100);

      const oneHourFromNow = new Date(Date.now() + 3600 * 1000);
      const history = getBudgetHistory('project-a', oneHourFromNow);

      expect(history.length).toBe(0);
    });
  });
});
