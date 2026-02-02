/**
 * Approval Workflow Tests
 * 
 * Tests for human-in-loop approval workflows including:
 * - Risk assessment
 * - Request creation and response
 * - Timeout and escalation logic
 * - Audit trail
 */

import {
  // Types
  ApprovalType,
  RiskLevel,
  ApprovalStatus,
  OperationType,
  DecisionType,
  
  // Core functions
  createApprovalRequest,
  respondToRequest,
  assessRisk,
  getTimeoutForRisk,
  getMaxEscalationsForRisk,
  isExpired,
  canAutoApprove,
  
  // Config
  getConfig,
  setConfig,
  DEFAULT_CONFIG,
  
  // Audit
  logApprovalAudit,
  getAuditLogs,
  
  // Display
  formatApprovalForDisplay,
  getStatusColor
} from '../../src/safety/approval';
import {
  addToQueue,
  removeFromQueue,
  getFromQueue,
  listPending,
  getApprovalDetails,
  getStats,
  filterByAgent,
  findExpiredRequests,
  formatListForDisplay,
  formatDetailsForDisplay,
  clearAllRequests
} from '../../src/safety/pending';
import {
  startMonitoring,
  stopMonitoring,
  escalateRequest,
  autoDenyRequest,
  emergencyOverride,
  getEscalationStats,
  isMonitoring
} from '../../src/safety/escalation';

describe('Approval Workflow', () => {
  beforeEach(() => {
    clearAllRequests();
    stopMonitoring();
    setConfig(DEFAULT_CONFIG);
  });

  afterEach(() => {
    clearAllRequests();
    stopMonitoring();
  });

  // ==========================================================================
  // Risk Assessment Tests
  // ==========================================================================
  
  describe('Risk Assessment', () => {
    describe('assessRisk', () => {
      it('should classify config file writes as medium risk', () => {
        const risk = assessRisk('file_write', 'config/app.yaml');
        expect(risk.level).toBe('medium');
        expect(risk.classificationReason).toContain('Configuration');
      });

      it('should classify production file writes as high risk', () => {
        const risk = assessRisk('file_write', 'src/prod/index.js');
        expect(risk.level).toBe('high');
        expect(risk.classificationReason).toContain('Production');
      });

      it('should classify test file writes as low risk', () => {
        const risk = assessRisk('file_write', 'tests/example.test.ts');
        expect(risk.level).toBe('low');
      });

      it('should classify git directory deletion as critical risk', () => {
        const risk = assessRisk('file_delete', '.git/config');
        expect(risk.level).toBe('critical');
        expect(risk.classificationReason).toContain('Git');
      });

      it('should classify rm -rf operations as critical risk', () => {
        const risk = assessRisk('file_delete', 'rm -rf /tmp/files');
        expect(risk.level).toBe('critical');
      });

      it('should classify sensitive API scopes as critical risk', () => {
        const risk = assessRisk('api_call', 'https://api.example.com', {
          scopes: ['write:admin', 'delete:users']
        });
        expect(risk.level).toBe('critical');
      });

      it('should classify non-allowlisted domains as critical risk', () => {
        const risk = assessRisk('api_call', 'https://unknown.api.com', {
          allowlisted: false
        });
        expect(risk.level).toBe('critical');
      });

      it('should classify budget overruns based on amount', () => {
        const smallOverrun = assessRisk('budget_overrun', '', {
          exceededAmount: 5,
          budgetType: 'operation'
        });
        expect(smallOverrun.level).toBe('medium');

        const largeOverrun = assessRisk('budget_overrun', '', {
          exceededAmount: 150,
          budgetType: 'daily'
        });
        expect(largeOverrun.level).toBe('critical');
      });

      it('should classify agent termination as critical risk', () => {
        const risk = assessRisk('agent_termination', 'agent-123');
        expect(risk.level).toBe('critical');
      });
    });

    describe('getTimeoutForRisk', () => {
      it('should return 5 minutes for critical risk', () => {
        expect(getTimeoutForRisk('critical')).toBe(5);
      });

      it('should return 30 minutes for high risk', () => {
        expect(getTimeoutForRisk('high')).toBe(30);
      });

      it('should return 30 minutes for medium risk', () => {
        expect(getTimeoutForRisk('medium')).toBe(30);
      });

      it('should return 0 for low risk (auto-approve)', () => {
        expect(getTimeoutForRisk('low')).toBe(0);
      });
    });

    describe('getMaxEscalationsForRisk', () => {
      it('should return 3 for critical risk', () => {
        expect(getMaxEscalationsForRisk('critical')).toBe(3);
      });

      it('should return 2 for medium risk', () => {
        expect(getMaxEscalationsForRisk('medium')).toBe(2);
      });

      it('should return 0 for low risk', () => {
        expect(getMaxEscalationsForRisk('low')).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Request Creation Tests
  // ==========================================================================
  
  describe('Request Creation', () => {
    it('should create a pending request for standard operations', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001', agentLabel: 'Test Agent' },
        operation: {
          type: 'file_write',
          target: 'src/main.ts',
          details: { changes: ['line 10: modification'] }
        }
      });

      expect(request.status).toBe('pending');
      expect(request.approvalType).toBe('standard');
      expect(request.risk.level).toBe('medium');
      expect(request.requestingAgent.agentId).toBe('agent-001');
      expect(request.operation.target).toBe('src/main.ts');
      expect(request.id).toMatch(/^apr_/);
      expect(request.expiresAt).toBeDefined();
    });

    it('should auto-approve low-risk operations', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_write',
          target: 'tests/example.test.ts',
          details: {}
        }
      });

      expect(request.status).toBe('approved');
      expect(request.approvalType).toBe('auto');
      expect(request.decision?.decision).toBe('approve');
    });

    it('should set critical priority for critical operations', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_delete',
          target: '.git/config',
          details: {}
        }
      });

      expect(request.priority).toBe('urgent');
      expect(request.approvalType).toBe('critical');
    });

    it('should allow risk level override', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_write',
          target: 'src/main.ts',
          details: {}
        },
        overrideRisk: 'critical'
      });

      expect(request.risk.level).toBe('critical');
      expect(request.approvalType).toBe('critical');
    });

    it('should include task context when provided', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_write',
          target: 'config/app.yaml',
          details: {}
        },
        task: {
          taskId: 'task-123',
          taskTitle: 'Update configuration'
        }
      });

      expect(request.task?.taskId).toBe('task-123');
      expect(request.task?.taskTitle).toBe('Update configuration');
    });
  });

  // ==========================================================================
  // Response Handling Tests
  // ==========================================================================
  
  describe('Response Handling', () => {
    it('should approve a pending request', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_write',
          target: 'src/main.ts',
          details: {}
        }
      });

      const response = respondToRequest(
        request,
        'approve',
        { type: 'human', identity: 'user-123', displayName: 'Admin' },
        'Changes look good',
        'Verified the changes'
      );

      expect(request.status).toBe('approved');
      expect(response.decision).toBe('approve');
      expect(response.approver.identity).toBe('user-123');
      expect(response.justification).toBe('Changes look good');
    });

    it('should deny a pending request with justification', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_write',
          target: 'config/prod.yaml',
          details: {}
        }
      });

      const response = respondToRequest(
        request,
        'deny',
        { type: 'human', identity: 'user-123' },
        'Security risk identified',
        'Please use the test environment first'
      );

      expect(request.status).toBe('denied');
      expect(response.decision).toBe('deny');
      expect(request.decision?.notes).toBe('Please use the test environment first');
    });

    it('should escalate a pending request', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_write',
          target: 'src/main.ts',
          details: {}
        }
      });

      const response = respondToRequest(
        request,
        'escalate',
        { type: 'human', identity: 'user-123' },
        'Requires supervisor approval'
      );

      expect(request.status).toBe('escalated');
      expect(request.escalationCount).toBe(1);
    });

    it('should throw error when responding to non-pending request', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_write',
          target: 'tests/test.ts',
          details: {}
        }
      });

      expect(() => {
        respondToRequest(
          request,
          'approve',
          { type: 'human', identity: 'user-123' },
          ''
        );
      }).toThrow('Cannot respond to request with status: approved');
    });

    it('should require justification for denial', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: {
          type: 'file_write',
          target: 'src/main.ts',
          details: {}
        }
      });

      setConfig({ requireJustification: true });

      expect(() => {
        respondToRequest(
          request,
          'deny',
          { type: 'human', identity: 'user-123' },
          ''  // No justification
        );
      }).toThrow('Justification is required for denial');
    });
  });

  // ==========================================================================
  // Pending Queue Tests
  // ==========================================================================
  
  describe('Pending Queue', () => {
    beforeEach(() => clearAllRequests());

    it('should add and retrieve requests from queue', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      addToQueue(request);

      const retrieved = getFromQueue(request.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(request.id);
    });

    it('should remove requests from queue', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      addToQueue(request);
      removeFromQueue(request.id);

      const retrieved = getFromQueue(request.id);
      expect(retrieved).toBeUndefined();
    });

    it('should list pending requests', () => {
      const req1 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/a.ts', details: {} }
      });
      const req2 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-002' },
        operation: { type: 'file_write', target: 'src/b.ts', details: {} }
      });

      addToQueue(req1);
      addToQueue(req2);

      const pending = listPending({ status: 'pending' });
      expect(pending.length).toBe(2);
    });

    it('should filter by agent ID', () => {
      const req1 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/a.ts', details: {} }
      });
      const req2 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-002' },
        operation: { type: 'file_write', target: 'src/b.ts', details: {} }
      });

      addToQueue(req1);
      addToQueue(req2);

      const agent1Requests = filterByAgent('agent-001');
      expect(agent1Requests.length).toBe(1);
      expect(agent1Requests[0].requestingAgent.agentId).toBe('agent-001');
    });

    it('should filter by risk level', () => {
      const req1 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'tests/test.ts', details: {} }
      });
      const req2 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-002' },
        operation: { type: 'file_delete', target: '.git/config', details: {} }
      });

      addToQueue(req1);
      addToQueue(req2);

      const critical = listPending({ riskLevel: 'critical' });
      expect(critical.length).toBe(1);
      expect(critical[0].risk.level).toBe('critical');
    });

    it('should find expired requests', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      // Manually set expired time
      request.expiresAt = new Date(Date.now() - 1000);
      request.status = 'pending';

      addToQueue(request);

      const expired = findExpiredRequests();
      expect(expired.length).toBe(1);
      expect(expired[0].id).toBe(request.id);
    });
  });

  // ==========================================================================
  // Escalation Tests
  // ==========================================================================
  
  describe('Escalation', () => {
    beforeEach(() => clearAllRequests());

    it('should escalate a request', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      addToQueue(request);

      const escalated = escalateRequest(request, 'Timeout - requires review');

      expect(request.status).toBe('escalated');
      expect(request.escalationCount).toBe(1);
      expect(request.expiresAt).toBeDefined();
    });

    it('should auto-deny after max escalations', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      request.maxEscalations = 1;
      addToQueue(request);

      escalateRequest(request, 'First escalation');
      const denied = autoDenyRequest(request, 'Max escalations reached');

      expect(request.status).toBe('denied');
      expect(request.decision?.decision).toBe('deny');
    });

    it('should handle emergency override', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      addToQueue(request);

      const overridden = emergencyOverride({
        requestId: request.id,
        approver: { type: 'human', identity: 'admin', displayName: 'Admin' },
        reason: 'Production security patch required',
        justification: 'Critical CVE fix, no time for normal approval'
      });

      expect(overridden.status).toBe('approved');
      expect(overridden.decision?.decision).toBe('approve');
    });

    it('should report monitoring status', () => {
      const stats = getEscalationStats();
      
      expect(stats.isMonitoring).toBe(false);
      expect(stats.pendingCount).toBe(0);
    });
  });

  // ==========================================================================
  // Audit Trail Tests
  // ==========================================================================
  
  describe('Audit Trail', () => {
    beforeEach(() => clearAllRequests());

    it('should log approval decisions', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      const log = logApprovalAudit({
        requestId: request.requestId,
        createdAt: request.createdAt,
        respondedAt: new Date(),
        requestingAgent: request.requestingAgent,
        operation: request.operation,
        risk: request.risk,
        approver: { type: 'human', identity: 'user-123' },
        decision: {
          decision: 'approve',
          decidedAt: new Date(),
          approver: { type: 'human', identity: 'user-123' },
          justification: 'Approved'
        },
        metadata: { sessionId: 'test-session' }
      });

      expect(log.id).toMatch(/^audit_/);
      expect(log.requestId).toBe(request.requestId);
    });

    it('should filter audit logs by agent', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      logApprovalAudit({
        requestId: request.requestId,
        createdAt: request.createdAt,
        requestingAgent: request.requestingAgent,
        operation: request.operation,
        risk: request.risk,
        metadata: { sessionId: 'test' }
      });

      const logs = getAuditLogs({ agentId: 'agent-001' });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should filter audit logs by date', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      logApprovalAudit({
        requestId: request.requestId,
        createdAt: new Date(Date.now() - 3600000), // 1 hour ago
        requestingAgent: request.requestingAgent,
        operation: request.operation,
        risk: request.risk,
        metadata: { sessionId: 'test' }
      });

      const logs = getAuditLogs({ since: new Date(Date.now() - 7200000) });
      expect(logs.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Display Format Tests
  // ==========================================================================
  
  describe('Display Formatting', () => {
    beforeEach(() => clearAllRequests());

    it('should format approval for display', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001', agentLabel: 'Test' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} }
      });

      const display = formatApprovalForDisplay(request);

      expect(display['ID']).toBe(request.id);
      expect(display['Status']).toBe('PENDING');
      expect(display['Agent']).toBe('Test');
    });

    it('should format list for table display', () => {
      const req1 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/a.ts', details: {} }
      });
      const req2 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-002' },
        operation: { type: 'file_delete', target: 'src/b.ts', details: {} }
      });

      addToQueue(req1);
      addToQueue(req2);

      const output = formatListForDisplay([req1, req2], 'table');
      expect(output).toContain('PENDING APPROVAL REQUESTS');
      expect(output).toContain('ID');
      expect(output).toContain('TYPE');
    });

    it('should format details for display', () => {
      const request = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001', agentLabel: 'Test Agent' },
        operation: { type: 'file_write', target: 'src/main.ts', details: {} },
        task: { taskId: 'task-123', taskTitle: 'Test Task' }
      });

      addToQueue(request);

      const output = formatDetailsForDisplay(request);
      expect(output).toContain(`APPROVAL REQUEST: ${request.id}`);
      expect(output).toContain('REQUESTING AGENT');
      expect(output).toContain('Test Agent');
      expect(output).toContain('TASK CONTEXT');
      expect(output).toContain('task-123');
    });

    it('should get status color', () => {
      expect(getStatusColor('pending')).toBe('yellow');
      expect(getStatusColor('approved')).toBe('green');
      expect(getStatusColor('denied')).toBe('red');
      expect(getStatusColor('expired')).toBe('gray');
      expect(getStatusColor('escalated')).toBe('orange');
    });
  });

  // ==========================================================================
  // Statistics Tests
  // ==========================================================================
  
  describe('Statistics', () => {
    beforeEach(() => clearAllRequests());

    it('should calculate correct stats', () => {
      const req1 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-001' },
        operation: { type: 'file_write', target: 'src/a.ts', details: {} }
      });
      const req2 = createApprovalRequest({
        requestingAgent: { agentId: 'agent-002' },
        operation: { type: 'file_delete', target: '.git/config', details: {} }
      });

      addToQueue(req1);
      addToQueue(req2);

      // Approve one
      respondToRequest(req1, 'approve', { type: 'human', identity: 'user-1' }, 'Approved');

      const stats = getStats();

      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.byRisk.medium).toBe(1);
      expect(stats.byRisk.critical).toBe(1);
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================
  
  describe('Configuration', () => {
    it('should return default config', () => {
      const config = getConfig();
      
      expect(config.timeout.critical).toBe(5);
      expect(config.timeout.standard).toBe(30);
      expect(config.maxEscalations.critical).toBe(3);
    });

    it('should update config', () => {
      setConfig({ timeout: { critical: 10, standard: 60, urgent: 5 } });
      
      const config = getConfig();
      expect(config.timeout.critical).toBe(10);
      expect(config.timeout.standard).toBe(60);
    });
  });
});
