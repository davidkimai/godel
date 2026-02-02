/**
 * Threshold Management Tests
 */

import {
  // Threshold checking
  checkThresholds,
  checkThresholdsWithCooldown,
  
  // Action execution
  executeThresholdAction,
  
  // Block management
  isAgentBlocked,
  approveBlockedAgent,
  unblockAgent,
  getBlockedAgent,
  getAllBlockedAgents,
  
  // Audit
  getAuditLog,
  clearAuditLog,
  
  // Default configuration
  DEFAULT_THRESHOLDS,
  ThresholdConfig,
  ThresholdCheckResult,
  
  // State (for testing)
  thresholdStates,
  blockedAgents,
  auditLog,
} from '../../src/safety/thresholds';

import type { BudgetTracking } from '../../src/safety/budget';

// Mock logger and console
jest.mock('../../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Threshold Checking', () => {
  afterEach(() => {
    thresholdStates.clear();
  });

  describe('checkThresholds', () => {
    it('should trigger at 50% threshold', () => {
      const result = checkThresholds(50);

      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(50);
      expect(result.action).toBe('warn');
    });

    it('should trigger at 75% threshold', () => {
      const result = checkThresholds(75);

      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(75);
      expect(result.action).toBe('notify');
    });

    it('should trigger at 90% threshold', () => {
      const result = checkThresholds(90);

      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(90);
      expect(result.action).toBe('block');
      expect(result.shouldBlock).toBe(true);
    });

    it('should trigger at 100% threshold', () => {
      const result = checkThresholds(100);

      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(100);
      expect(result.action).toBe('kill');
      expect(result.shouldKill).toBe(true);
    });

    it('should trigger at 110% threshold', () => {
      const result = checkThresholds(110);

      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(110);
      expect(result.action).toBe('audit');
    });

    it('should trigger highest crossed threshold', () => {
      const result = checkThresholds(95);

      // Should trigger 90% (block) since 100% not yet crossed
      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(90);
    });

    it('should not trigger for 0%', () => {
      const result = checkThresholds(0);
      expect(result.triggered).toBe(false);
    });

    it('should not trigger for 25%', () => {
      const result = checkThresholds(25);
      expect(result.triggered).toBe(false);
    });

    it('should trigger with custom thresholds', () => {
      const customThresholds: ThresholdConfig[] = [
        { threshold: 80, action: 'warn' },
        { threshold: 95, action: 'block' },
      ];

      const result = checkThresholds(85, customThresholds);

      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(80);
    });
  });

  describe('checkThresholdsWithCooldown', () => {
    it('should trigger threshold on first check', () => {
      const result = checkThresholdsWithCooldown('budget-1', 75);

      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(75);
    });

    it('should not re-trigger during cooldown', () => {
      const config: ThresholdConfig[] = [
        { threshold: 75, action: 'warn', coolDown: 60 },
      ];

      // First trigger
      const result1 = checkThresholdsWithCooldown('budget-1', 75, config);
      expect(result1.triggered).toBe(true);

      // Second trigger (should be suppressed)
      const result2 = checkThresholdsWithCooldown('budget-1', 75, config);
      expect(result2.triggered).toBe(false);
    });

    it('should re-trigger after cooldown expires', async () => {
      const config: ThresholdConfig[] = [
        { threshold: 75, action: 'warn', coolDown: 0 }, // 0 second cooldown for test
      ];

      // First trigger
      const result1 = checkThresholdsWithCooldown('budget-1', 75, config);
      expect(result1.triggered).toBe(true);

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second trigger (should trigger again since cooldown is 0)
      const result2 = checkThresholdsWithCooldown('budget-1', 76, config);
      expect(result2.triggered).toBe(true);
    });
  });
});

describe('Threshold Actions', () => {
  let mockTracking: BudgetTracking;

  beforeEach(() => {
    blockedAgents.clear();
    auditLog.length = 0;
    mockConsoleWarn.mockClear();
    mockConsoleError.mockClear();

    mockTracking = {
      id: 'budget-test-1',
      agentId: 'agent-1',
      taskId: 'task-1',
      projectId: 'project-1',
      model: 'claude-3-5-sonnet',
      tokensUsed: { prompt: 50000, completion: 25000, total: 75000 },
      costUsed: { prompt: 0.15, completion: 0.375, total: 0.525 },
      startedAt: new Date(),
      lastUpdated: new Date(),
      budgetConfig: {
        type: 'task',
        scope: 'task-1',
        maxTokens: 100000,
        maxCost: 1.00,
      },
      thresholdHistory: [],
    };
  });

  afterEach(() => {
    blockedAgents.clear();
    clearAuditLog();
  });

  describe('executeThresholdAction - warn', () => {
    it('should execute warn action', () => {
      const result: ThresholdCheckResult = {
        triggered: true,
        threshold: 50,
        action: 'warn',
        message: 'Budget at 50%',
      };

      executeThresholdAction(result, mockTracking);

      expect(mockConsoleWarn).toHaveBeenCalled();
    });
  });

  describe('executeThresholdAction - notify', () => {
    it('should execute notify action', () => {
      const result: ThresholdCheckResult = {
        triggered: true,
        threshold: 75,
        action: 'notify',
        message: 'Budget at 75%',
      };

      executeThresholdAction(result, mockTracking);

      expect(mockConsoleWarn).toHaveBeenCalled();
    });
  });

  describe('executeThresholdAction - block', () => {
    it('should execute block action', () => {
      const result: ThresholdCheckResult = {
        triggered: true,
        threshold: 90,
        action: 'block',
        shouldBlock: true,
        message: 'Budget at 90%',
      };

      executeThresholdAction(result, mockTracking);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(blockedAgents.has('agent-1')).toBe(true);
    });

    it('should block the agent', () => {
      const result: ThresholdCheckResult = {
        triggered: true,
        threshold: 90,
        action: 'block',
        shouldBlock: true,
      };

      executeThresholdAction(result, mockTracking);

      const blocked = blockedAgents.get('agent-1');
      expect(blocked).toBeDefined();
      expect(blocked?.agentId).toBe('agent-1');
      expect(blocked?.budgetId).toBe('budget-test-1');
      expect(blocked?.threshold).toBe(90);
    });
  });

  describe('executeThresholdAction - kill', () => {
    it('should execute kill action', () => {
      const result: ThresholdCheckResult = {
        triggered: true,
        threshold: 100,
        action: 'kill',
        shouldKill: true,
        message: 'Budget at 100%',
      };

      executeThresholdAction(result, mockTracking);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(blockedAgents.has('agent-1')).toBe(true);
    });
  });

  describe('executeThresholdAction - audit', () => {
    it('should execute audit action', () => {
      const result: ThresholdCheckResult = {
        triggered: true,
        threshold: 110,
        action: 'audit',
        message: 'Budget exceeded 110%',
      };

      executeThresholdAction(result, mockTracking);

      expect(auditLog.length).toBe(1);
      expect(auditLog[0].action).toBe('audit');
      expect(auditLog[0].agentId).toBe('agent-1');
    });

    it('should add entry to audit log', () => {
      const result: ThresholdCheckResult = {
        triggered: true,
        threshold: 110,
        action: 'audit',
      };

      executeThresholdAction(result, mockTracking);

      expect(auditLog[0]).toMatchObject({
        budgetId: 'budget-test-1',
        agentId: 'agent-1',
        threshold: 110,
        action: 'audit',
      });
      expect(auditLog[0].details).toBeDefined();
    });
  });
});

describe('Block Management', () => {
  beforeEach(() => {
    blockedAgents.clear();
    thresholdStates.clear();
  });

  describe('isAgentBlocked', () => {
    it('should return false for non-blocked agent', () => {
      expect(isAgentBlocked('non-existent')).toBe(false);
    });

    it('should return true for blocked agent', () => {
      blockedAgents.set('agent-1', {
        agentId: 'agent-1',
        budgetId: 'budget-1',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
      });

      expect(isAgentBlocked('agent-1')).toBe(true);
    });

    it('should return false for approved agent', () => {
      blockedAgents.set('agent-1', {
        agentId: 'agent-1',
        budgetId: 'budget-1',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
        approved: true,
        approvedBy: 'admin',
        approvedAt: new Date(),
      });

      expect(isAgentBlocked('agent-1')).toBe(false);
    });

    it('should return true if approval has expired', () => {
      const approvedAt = new Date(Date.now() - 3600 * 1000); // 1 hour ago

      blockedAgents.set('agent-1', {
        agentId: 'agent-1',
        budgetId: 'budget-1',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
        approved: true,
        approvedBy: 'admin',
        approvedAt,
      });

      // Set expired approval
      thresholdStates.set('budget-1', {
        lastTriggeredAt: new Map(),
        approvedToContinue: true,
        approvalExpiresAt: new Date(Date.now() - 1000), // Expired
      });

      expect(isAgentBlocked('agent-1')).toBe(true);
    });
  });

  describe('approveBlockedAgent', () => {
    it('should approve a blocked agent', () => {
      blockedAgents.set('agent-1', {
        agentId: 'agent-1',
        budgetId: 'budget-1',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
      });

      const result = approveBlockedAgent('agent-1', 'admin', 30);

      expect(result).not.toBeNull();
      expect(result?.approved).toBe(true);
      expect(result?.approvedBy).toBe('admin');
    });

    it('should return null for non-blocked agent', () => {
      const result = approveBlockedAgent('non-existent', 'admin');
      expect(result).toBeNull();
    });

    it('should set approval expiration', () => {
      blockedAgents.set('agent-1', {
        agentId: 'agent-1',
        budgetId: 'budget-1',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
      });

      approveBlockedAgent('agent-1', 'admin', 30);

      const state = thresholdStates.get('budget-1');
      expect(state?.approvalExpiresAt).toBeDefined();
      expect(state?.approvedToContinue).toBe(true);
    });
  });

  describe('unblockAgent', () => {
    it('should unblock an agent', () => {
      blockedAgents.set('agent-1', {
        agentId: 'agent-1',
        budgetId: 'budget-1',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
      });

      const result = unblockAgent('agent-1');

      expect(result).toBe(true);
      expect(blockedAgents.has('agent-1')).toBe(false);
    });

    it('should return false for non-existent agent', () => {
      const result = unblockAgent('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getBlockedAgent', () => {
    it('should return blocked agent info', () => {
      const blockedInfo = {
        agentId: 'agent-1',
        budgetId: 'budget-1',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
      };
      blockedAgents.set('agent-1', blockedInfo);

      const result = getBlockedAgent('agent-1');

      expect(result).toEqual(blockedInfo);
    });

    it('should return undefined for non-existent agent', () => {
      const result = getBlockedAgent('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getAllBlockedAgents', () => {
    it('should return all blocked agents', () => {
      blockedAgents.set('agent-1', {
        agentId: 'agent-1',
        budgetId: 'budget-1',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
      });

      blockedAgents.set('agent-2', {
        agentId: 'agent-2',
        budgetId: 'budget-2',
        blockedAt: new Date(),
        threshold: 95,
        requestedBy: 'budget_system',
      });

      // Approved agent (should not appear)
      blockedAgents.set('agent-3', {
        agentId: 'agent-3',
        budgetId: 'budget-3',
        blockedAt: new Date(),
        threshold: 90,
        requestedBy: 'budget_system',
        approved: true,
        approvedBy: 'admin',
        approvedAt: new Date(),
      });

      const result = getAllBlockedAgents();

      expect(result.length).toBe(2);
      expect(result.some(a => a.agentId === 'agent-1')).toBe(true);
      expect(result.some(a => a.agentId === 'agent-2')).toBe(true);
      expect(result.some(a => a.agentId === 'agent-3')).toBe(false);
    });

    it('should return empty array when no blocked agents', () => {
      const result = getAllBlockedAgents();
      expect(result).toEqual([]);
    });
  });
});

describe('Audit Log', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  describe('getAuditLog', () => {
    it('should return all audit log entries', () => {
      auditLog.push({
        timestamp: new Date(),
        budgetId: 'budget-1',
        agentId: 'agent-1',
        threshold: 110,
        action: 'audit',
        details: {},
      });

      const logs = getAuditLog();

      expect(logs.length).toBe(1);
      expect(logs[0].agentId).toBe('agent-1');
    });

    it('should filter by budgetId', () => {
      auditLog.push({
        timestamp: new Date(),
        budgetId: 'budget-1',
        agentId: 'agent-1',
        threshold: 110,
        action: 'audit',
        details: {},
      });

      auditLog.push({
        timestamp: new Date(),
        budgetId: 'budget-2',
        agentId: 'agent-2',
        threshold: 110,
        action: 'audit',
        details: {},
      });

      const logs = getAuditLog('budget-1');

      expect(logs.length).toBe(1);
      expect(logs[0].budgetId).toBe('budget-1');
    });

    it('should filter by date', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      auditLog.push({
        timestamp: now,
        budgetId: 'budget-1',
        agentId: 'agent-1',
        threshold: 110,
        action: 'audit',
        details: {},
      });

      auditLog.push({
        timestamp: yesterday,
        budgetId: 'budget-2',
        agentId: 'agent-2',
        threshold: 110,
        action: 'audit',
        details: {},
      });

      const oneHourAgo = new Date(now.getTime() - 3600 * 1000);
      const logs = getAuditLog(undefined, oneHourAgo);

      expect(logs.length).toBe(1);
      expect(logs[0].budgetId).toBe('budget-1');
    });
  });

  describe('clearAuditLog', () => {
    it('should clear all audit log entries', () => {
      auditLog.push({
        timestamp: new Date(),
        budgetId: 'budget-1',
        agentId: 'agent-1',
        threshold: 110,
        action: 'audit',
        details: {},
      });

      expect(auditLog.length).toBe(1);

      clearAuditLog();

      expect(auditLog.length).toBe(0);
    });
  });
});

describe('Default Thresholds', () => {
  it('should have correct default thresholds', () => {
    expect(DEFAULT_THRESHOLDS).toHaveLength(5);

    // 50% - warn
    expect(DEFAULT_THRESHOLDS.find(t => t.threshold === 50)?.action).toBe('warn');

    // 75% - notify
    expect(DEFAULT_THRESHOLDS.find(t => t.threshold === 75)?.action).toBe('notify');

    // 90% - block
    expect(DEFAULT_THRESHOLDS.find(t => t.threshold === 90)?.action).toBe('block');

    // 100% - kill
    expect(DEFAULT_THRESHOLDS.find(t => t.threshold === 100)?.action).toBe('kill');

    // 110% - audit
    expect(DEFAULT_THRESHOLDS.find(t => t.threshold === 110)?.action).toBe('audit');
  });

  it('should have notify channels for 75% and 90% thresholds', () => {
    const t75 = DEFAULT_THRESHOLDS.find(t => t.threshold === 75);
    const t90 = DEFAULT_THRESHOLDS.find(t => t.threshold === 90);

    expect(t75?.notify).toContain('webhook:alerts');
    expect(t90?.notify).toContain('webhook:alerts');
    expect(t90?.notify).toContain('email:admin');
  });

  it('should have notify channels for 100% threshold', () => {
    const t100 = DEFAULT_THRESHOLDS.find(t => t.threshold === 100);

    expect(t100?.notify).toContain('webhook:critical');
    expect(t100?.notify).toContain('email:admin');
  });
});
