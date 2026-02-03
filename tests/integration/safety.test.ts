/**
 * Safety Integration Tests
 *
 * Tests for budget tracking, approval workflows, and safety mechanisms.
 */

import {
  setBudgetConfig,
  getBudgetConfig,
  startBudgetTracking,
  trackTokenUsage,
  getBudgetUsage,
  completeBudgetTracking,
  killBudgetTracking,
  getAgentBudgetStatus,
  getProjectBudgetStatus,
  generateBudgetReport,
  addBudgetAlert,
  getBudgetAlerts,
  removeBudgetAlert,
  getBudgetHistory,
  checkBudgetExceeded,
  clearAllBudgetConfigs,
  clearAllBudgetAlerts,
  BudgetConfig,
} from '../../src/safety/budget';

import {
  createApprovalRequest,
  respondToRequest,
  assessRisk,
  getAuditLogs,
  logApprovalAudit,
  canAutoApprove,
  isExpired,
  getConfig,
  setConfig,
  ApprovalRequest,
  ApprovalStatus,
  RiskLevel,
  OperationType,
} from '../../src/safety/approval';

// Mock fs module to avoid file system operations
jest.mock('fs');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Safety Integration', () => {
  beforeEach(() => {
    clearAllBudgetConfigs();
    clearAllBudgetAlerts();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearAllBudgetConfigs();
    clearAllBudgetAlerts();
  });

  describe('Budget Tracking Integration', () => {
    it('should configure and retrieve budget settings', () => {
      const config: Partial<BudgetConfig> = {
        maxTokens: 50000,
        maxCost: 25.0,
        period: 'daily',
      };

      setBudgetConfig('agent', 'agent-1', config);
      const retrieved = getBudgetConfig('agent', 'agent-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe('agent');
      expect(retrieved?.scope).toBe('agent-1');
      expect(retrieved?.maxTokens).toBe(50000);
      expect(retrieved?.maxCost).toBe(25.0);
      expect(retrieved?.period).toBe('daily');
    });

    it('should track budget for agent lifecycle', () => {
      // Set up budget config
      setBudgetConfig('agent', 'agent-1', {
        maxTokens: 10000,
        maxCost: 5.0,
      });

      // Start tracking
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      expect(tracking).toBeDefined();
      expect(tracking.agentId).toBe('agent-1');
      expect(tracking.tokensUsed.total).toBe(0);
      expect(tracking.costUsed.total).toBe(0);

      // Track some usage
      trackTokenUsage(tracking.id, 1000, 500);
      const usage = getBudgetUsage(tracking.id);

      expect(usage.tokensUsed.total).toBe(1500);
      expect(usage.tokensUsed.prompt).toBe(1000);
      expect(usage.tokensUsed.completion).toBe(500);
      expect(usage.costUsed.total).toBeGreaterThan(0);
    });

    it('should calculate percentage used correctly', () => {
      setBudgetConfig('agent', 'agent-1', {
        maxTokens: 1000,
        maxCost: 10.0,
      });

      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      // Use tokens that cost around $5 (50% of budget)
      trackTokenUsage(tracking.id, 5000, 2500);
      const usage = getBudgetUsage(tracking.id);

      expect(usage.percentageUsed).toBeGreaterThan(0);
      expect(typeof usage.percentageUsed).toBe('number');
    });

    it('should detect budget exceeded', () => {
      setBudgetConfig('agent', 'agent-1', {
        maxTokens: 100,
        maxCost: 0.01,
      });

      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      // Use way more tokens than budget allows
      trackTokenUsage(tracking.id, 10000, 5000);
      const check = checkBudgetExceeded(tracking.id);

      expect(check.exceeded).toBe(true);
      expect(check.budgetConfig).toBeDefined();
    });

    it('should complete budget tracking', () => {
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      trackTokenUsage(tracking.id, 1000, 500);
      const completed = completeBudgetTracking(tracking.id);

      expect(completed).toBeDefined();
      expect(completed?.completedAt).toBeInstanceOf(Date);
    });

    it('should kill budget tracking', () => {
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      const killed = killBudgetTracking(tracking.id, 'Budget exceeded emergency stop');

      expect(killed).toBeDefined();
      expect(killed?.completedAt).toBeInstanceOf(Date);
    });

    it('should track multiple agents separately', () => {
      setBudgetConfig('agent', 'agent-1', { maxTokens: 10000, maxCost: 10.0 });
      setBudgetConfig('agent', 'agent-2', { maxTokens: 20000, maxCost: 20.0 });

      const tracking1 = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      const tracking2 = startBudgetTracking({
        agentId: 'agent-2',
        taskId: 'task-2',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      trackTokenUsage(tracking1.id, 1000, 500);
      trackTokenUsage(tracking2.id, 2000, 1000);

      const usage1 = getBudgetUsage(tracking1.id);
      const usage2 = getBudgetUsage(tracking2.id);

      expect(usage1.tokensUsed.total).toBe(1500);
      expect(usage2.tokensUsed.total).toBe(3000);
    });

    it('should get agent budget status', () => {
      const tracking1 = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      const tracking2 = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-2',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      const status = getAgentBudgetStatus('agent-1');
      expect(status).toHaveLength(2);
      expect(status.map(t => t.id).sort()).toEqual([tracking1.id, tracking2.id].sort());
    });

    it('should get project budget status', () => {
      setBudgetConfig('project', 'project-1', { maxTokens: 100000, maxCost: 100.0 });

      startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      startBudgetTracking({
        agentId: 'agent-2',
        taskId: 'task-2',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      const status = getProjectBudgetStatus('project-1');

      expect(status.budgets).toHaveLength(2);
      expect(status.config).toBeDefined();
      expect(status.totalUsed).toBeDefined();
    });

    it('should generate budget report', () => {
      setBudgetConfig('project', 'project-1', { maxTokens: 100000, maxCost: 100.0 });

      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      trackTokenUsage(tracking.id, 1000, 500);
      completeBudgetTracking(tracking.id);

      const report = generateBudgetReport('project-1', 'month');

      expect(report).toBeDefined();
      expect(report.projectId).toBe('project-1');
      expect(report.period).toBe('month');
      expect(report.startDate).toBeInstanceOf(Date);
      expect(report.endDate).toBeInstanceOf(Date);
      expect(typeof report.totalBudget).toBe('number');
      expect(typeof report.totalUsed).toBe('number');
      expect(Array.isArray(report.agentBreakdown)).toBe(true);
      expect(Array.isArray(report.dailyUsage)).toBe(true);
    });

    it('should handle hierarchical budget lookup', () => {
      // Set up project-level config
      setBudgetConfig('project', 'project-1', {
        maxTokens: 100000,
        maxCost: 100.0,
      });

      // Start tracking without explicit config - should inherit from project
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      expect(tracking.budgetConfig).toBeDefined();
      expect(tracking.budgetConfig.maxTokens).toBe(100000);
      expect(tracking.budgetConfig.maxCost).toBe(100.0);
    });
  });

  describe('Budget Alert Integration', () => {
    it('should add and retrieve budget alerts', () => {
      const alert1 = addBudgetAlert('project-1', 80, {
        webhookUrl: 'https://example.com/webhook',
        email: 'admin@example.com',
      });

      const alert2 = addBudgetAlert('project-1', 95, {
        webhookUrl: 'https://example.com/webhook',
      });

      const alerts = getBudgetAlerts('project-1');

      expect(alerts).toHaveLength(2);
      expect(alerts.map(a => a.threshold).sort()).toEqual([80, 95]);
    });

    it('should remove specific alerts', () => {
      const alert1 = addBudgetAlert('project-1', 80, {});
      addBudgetAlert('project-1', 90, {});

      removeBudgetAlert('project-1', alert1.id);

      const alerts = getBudgetAlerts('project-1');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].threshold).toBe(90);
    });

    it('should clear all alerts', () => {
      addBudgetAlert('project-1', 80, {});
      addBudgetAlert('project-1', 90, {});

      clearAllBudgetAlerts();

      const alerts = getBudgetAlerts('project-1');
      expect(alerts).toEqual([]);
    });
  });

  describe('Approval Workflow Integration', () => {
    it('should create approval request with risk assessment', () => {
      const request = createApprovalRequest({
        requestingAgent: {
          agentId: 'agent-1',
          agentLabel: 'Test Agent',
        },
        operation: {
          type: 'file_write' as OperationType,
          target: 'src/app.ts',
          details: { content: 'console.log("test")' },
        },
      });

      expect(request).toBeDefined();
      expect(request.id).toBeDefined();
      expect(request.requestId).toBeDefined();
      expect(request.status).toBeDefined();
      expect(request.risk).toBeDefined();
      expect(request.risk.level).toBeDefined();
      expect(request.approvalType).toBeDefined();
      expect(request.createdAt).toBeInstanceOf(Date);
    });

    it('should assess file write risk correctly', () => {
      const lowRisk = assessRisk('file_write', 'tests/test.ts');
      expect(lowRisk.level).toBe('low');

      const mediumRisk = assessRisk('file_write', 'src/app.ts');
      expect(mediumRisk.level).toBe('medium');

      const highRisk = assessRisk('file_write', 'config/prod.env');
      expect(highRisk.level).toBe('high');
    });

    it('should assess delete risk correctly', () => {
      const criticalRisk = assessRisk('file_delete', '.git/config');
      expect(criticalRisk.level).toBe('critical');

      const highRisk = assessRisk('file_delete', 'node_modules/package');
      expect(highRisk.level).toBe('high');
    });

    it('should assess API call risk correctly', () => {
      const lowRisk = assessRisk('api_call', '/api/users', { method: 'GET' });
      expect(lowRisk.level).toBe('low');

      const criticalRisk = assessRisk('api_call', '/api/admin', {
        scopes: ['write:admin', 'delete'],
      });
      expect(criticalRisk.level).toBe('critical');
    });

    it('should respond to approval request', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'file_write' as OperationType,
          target: 'tests/test.ts',
          details: {},
        },
      });

      const response = respondToRequest(
        request,
        'approve',
        { type: 'human', identity: 'user@example.com' },
        'Approved for testing'
      );

      expect(response).toBeDefined();
      expect(response.decision).toBe('approve');
      expect(response.requestId).toBe(request.requestId);
      expect(response.respondedAt).toBeInstanceOf(Date);
      expect(request.status).toBe('approved');
    });

    it('should handle denial with justification', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'file_write' as OperationType,
          target: 'src/app.ts',
          details: {},
        },
      });

      const response = respondToRequest(
        request,
        'deny',
        { type: 'human', identity: 'user@example.com' },
        'This file should not be modified'
      );

      expect(response.decision).toBe('deny');
      expect(request.status).toBe('denied');
    });

    it('should handle escalation', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'budget_overrun' as OperationType,
          target: 'project-1',
          details: { exceededAmount: 50, budgetType: 'daily' },
        },
      });

      const response = respondToRequest(
        request,
        'escalate',
        { type: 'agent', identity: 'agent-1' },
        'Need manager approval'
      );

      expect(response.decision).toBe('escalate');
      expect(request.status).toBe('escalated');
      expect(request.escalationCount).toBe(1);
    });

    it('should auto-approve low risk operations', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'file_write' as OperationType,
          target: 'docs/readme.md',
          details: {},
        },
      });

      expect(request.approvalType).toBe('auto');
      expect(request.status).toBe('approved');
      expect(request.decision).toBeDefined();
    });

    it('should detect expired requests', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'file_write' as OperationType,
          target: 'src/app.ts',
          details: {},
        },
      });

      // Override expiresAt to past date
      request.expiresAt = new Date(Date.now() - 1000);

      expect(isExpired(request)).toBe(true);
    });

    it('should check if auto-approval is allowed', () => {
      const lowRiskRequest = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'file_write' as OperationType,
          target: 'tests/test.ts',
          details: {},
        },
      });

      expect(canAutoApprove(lowRiskRequest)).toBe(true);

      const highRiskRequest = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'agent_termination' as OperationType,
          target: 'agent-2',
          details: {},
        },
      });

      expect(canAutoApprove(highRiskRequest)).toBe(false);
    });

    it('should log and retrieve audit logs', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'file_write' as OperationType,
          target: 'src/app.ts',
          details: {},
        },
      });

      respondToRequest(
        request,
        'approve',
        { type: 'human', identity: 'user@example.com' },
        'Approved'
      );

      logApprovalAudit({
        requestId: request.requestId,
        requestingAgent: request.requestingAgent,
        operation: request.operation,
        risk: request.risk,
        decision: request.decision,
        metadata: { sessionId: 'test-session' },
      });

      const logs = getAuditLogs({ requestId: request.requestId });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].requestId).toBe(request.requestId);
    });

    it('should filter audit logs by agent', () => {
      const request1 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: { type: 'file_write' as OperationType, target: 'file1.ts', details: {} },
      });

      const request2 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-2' },
        operation: { type: 'file_write' as OperationType, target: 'file2.ts', details: {} },
      });

      logApprovalAudit({
        requestId: request1.requestId,
        requestingAgent: request1.requestingAgent,
        operation: request1.operation,
        risk: request1.risk,
        metadata: { sessionId: 'test' },
      });

      logApprovalAudit({
        requestId: request2.requestId,
        requestingAgent: request2.requestingAgent,
        operation: request2.operation,
        risk: request2.risk,
        metadata: { sessionId: 'test' },
      });

      const agent1Logs = getAuditLogs({ agentId: 'agent-1' });
      expect(agent1Logs.length).toBe(1);
      expect(agent1Logs[0].requestingAgent.agentId).toBe('agent-1');
    });

    it('should filter audit logs by risk level', () => {
      const lowRiskRequest = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: { type: 'file_write' as OperationType, target: 'tests/test.ts', details: {} },
      });

      const criticalRequest = createApprovalRequest({
        requestingAgent: { agentId: 'agent-2' },
        operation: { type: 'agent_termination' as OperationType, target: 'agent-3', details: {} },
      });

      logApprovalAudit({
        requestId: lowRiskRequest.requestId,
        requestingAgent: lowRiskRequest.requestingAgent,
        operation: lowRiskRequest.operation,
        risk: lowRiskRequest.risk,
        metadata: { sessionId: 'test' },
      });

      logApprovalAudit({
        requestId: criticalRequest.requestId,
        requestingAgent: criticalRequest.requestingAgent,
        operation: criticalRequest.operation,
        risk: criticalRequest.risk,
        metadata: { sessionId: 'test' },
      });

      const criticalLogs = getAuditLogs({ riskLevel: 'critical' as RiskLevel });
      expect(criticalLogs.length).toBe(1);
      expect(criticalLogs[0].risk.level).toBe('critical');
    });

    it('should get and set approval config', () => {
      const defaultConfig = getConfig();
      expect(defaultConfig).toBeDefined();
      expect(defaultConfig.timeout).toBeDefined();
      expect(defaultConfig.maxEscalations).toBeDefined();

      setConfig({
        timeout: { critical: 10, standard: 60, urgent: 5 },
      });

      const updatedConfig = getConfig();
      expect(updatedConfig.timeout.critical).toBe(10);
      expect(updatedConfig.timeout.standard).toBe(60);
      expect(updatedConfig.timeout.urgent).toBe(5);
    });
  });

  describe('End-to-End Safety Flow', () => {
    it('should handle complete budget and approval workflow', () => {
      // 1. Set up budget
      setBudgetConfig('project', 'project-1', {
        maxTokens: 100000,
        maxCost: 100.0,
        period: 'daily',
      });

      // 2. Set up budget alerts
      addBudgetAlert('project-1', 80, { webhookUrl: 'https://example.com/webhook' });

      // 3. Start budget tracking
      const tracking = startBudgetTracking({
        agentId: 'agent-1',
        taskId: 'task-1',
        projectId: 'project-1',
        model: 'kimi-k2.5',
      });

      // 4. Before doing a high-risk operation, create approval request
      const approvalRequest = createApprovalRequest({
        requestingAgent: { agentId: 'agent-1' },
        operation: {
          type: 'file_write' as OperationType,
          target: 'config/production.yml',
          details: { content: 'new config' },
        },
      });

      // 5. Verify risk assessment worked
      expect(approvalRequest.risk.level).toBe('high');

      // 6. Approve the request
      respondToRequest(
        approvalRequest,
        'approve',
        { type: 'human', identity: 'admin@example.com' },
        'Approved for production deployment'
      );

      // 7. Track token usage
      trackTokenUsage(tracking.id, 5000, 2500);

      // 8. Complete budget tracking
      completeBudgetTracking(tracking.id);

      // 9. Verify budget was tracked
      const usage = getBudgetUsage(tracking.id);
      expect(usage.tokensUsed.total).toBe(7500);

      // 10. Verify approval was logged
      const logs = getAuditLogs({ requestId: approvalRequest.requestId });
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
