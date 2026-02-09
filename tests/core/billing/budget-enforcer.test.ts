/**
 * BudgetEnforcer Tests
 *
 * Tests budget enforcement with 80% warnings and 100% hard stops.
 * Validates per-team budget enforcement and auto-stop functionality.
 *
 * @module tests/core/billing/budget-enforcer
 * @version 1.0.0
 * @since 2026-02-08
 */

import { BudgetEnforcer, BudgetConfig } from '../../../src/core/billing/budget-enforcer';
import { CostTracker } from '../../../src/core/billing/cost-tracker';

// ============================================================================
// Test Suite
// ============================================================================

describe('BudgetEnforcer', () => {
  let costTracker: CostTracker;
  let enforcer: BudgetEnforcer;

  beforeEach(() => {
    costTracker = new CostTracker({
      realTimeCalculation: false,
      rates: { e2b: 1.00, kata: 1.00, worktree: 0 },
    });

    enforcer = new BudgetEnforcer(costTracker, {
      autoStop: true,
      defaultTeamBudget: 100,
      defaultAgentBudget: 10,
      warningThreshold: 0.8,
      stopThreshold: 1.0,
    });
  });

  afterEach(() => {
    enforcer.dispose();
    costTracker.stop();
    costTracker.reset();
  });

  describe('Initialization', () => {
    it('should initialize with cost tracker', () => {
      expect(enforcer).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const config: BudgetConfig = {
        defaultTeamBudget: 50,
        defaultAgentBudget: 5,
        warningThreshold: 0.75,
        stopThreshold: 0.95,
        autoStop: false,
      };

      const customEnforcer = new BudgetEnforcer(costTracker, config);
      expect(customEnforcer).toBeDefined();
      customEnforcer.dispose();
    });

    it('should use default thresholds', () => {
      const defaultEnforcer = new BudgetEnforcer(costTracker);
      expect(defaultEnforcer).toBeDefined();
      defaultEnforcer.dispose();
    });
  });

  describe('Team Budgets', () => {
    it('should set team budget', () => {
      enforcer.setTeamBudget('team-a', 50);
      expect(enforcer.getTeamBudget('team-a')).toBe(50);
    });

    it('should use default team budget', () => {
      expect(enforcer.getTeamBudget('unknown-team')).toBe(100);
    });

    it('should emit budgetSet event for team', () => {
      const handler = jest.fn();
      enforcer.on('budgetSet', handler);

      enforcer.setTeamBudget('team-a', 50);

      expect(handler).toHaveBeenCalledWith({
        type: 'team',
        id: 'team-a',
        budget: 50,
      });
    });

    it('should get team budget status', () => {
      enforcer.setTeamBudget('team-a', 100);
      
      // Create a session
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1', {
        teamId: 'team-a',
      });
      session.startTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      const status = enforcer.getTeamBudgetStatus('team-a');

      expect(status).toBeDefined();
      expect(status.id).toBe('team-a');
      expect(status.type).toBe('team');
      expect(status.budget).toBe(100);
      expect(status.currentCost).toBeGreaterThan(0);
      expect(status.remaining).toBeLessThan(100);
      expect(status.percentUsed).toBeGreaterThan(0);
    });

    it('should return ok status when under budget', () => {
      enforcer.setTeamBudget('team-a', 1000); // High budget
      
      costTracker.startTracking('agent-1', 'e2b', 'runtime-1', {
        teamId: 'team-a',
      });

      const status = enforcer.getTeamBudgetStatus('team-a');
      expect(status.status).toBe('ok');
    });

    it('should return warning status at 80%', () => {
      enforcer.setTeamBudget('team-a', 0.85); // Very low budget
      
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1', {
        teamId: 'team-a',
      });
      session.startTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      const status = enforcer.getTeamBudgetStatus('team-a');
      expect(status.status).toBe('warning');
    });

    it('should return exceeded status at 100%', () => {
      enforcer.setTeamBudget('team-a', 0.5); // Very low budget
      
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1', {
        teamId: 'team-a',
      });
      session.startTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      const status = enforcer.getTeamBudgetStatus('team-a');
      expect(status.status).toBe('exceeded');
    });
  });

  describe('Agent Budgets', () => {
    it('should set agent budget', () => {
      enforcer.setAgentBudget('agent-1', 5);
      expect(enforcer.getAgentBudget('agent-1')).toBe(5);
    });

    it('should use default agent budget', () => {
      expect(enforcer.getAgentBudget('unknown-agent')).toBe(10);
    });

    it('should sync agent budget with cost tracker threshold', () => {
      enforcer.setAgentBudget('agent-1', 5);
      expect(costTracker.getThreshold('agent-1')).toBe(5);
    });

    it('should get agent budget status', () => {
      enforcer.setAgentBudget('agent-1', 10);
      
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      session.startTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes

      const status = enforcer.getAgentBudgetStatus('agent-1');

      expect(status).toBeDefined();
      expect(status.id).toBe('agent-1');
      expect(status.type).toBe('agent');
      expect(status.budget).toBe(10);
      expect(status.currentCost).toBe(0.50); // 30 min at $1/hour
    });
  });

  describe('Enforcement', () => {
    it('should return none action when under budget', () => {
      costTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      
      const enforcement = enforcer.checkEnforcement('agent-1');
      expect(enforcement.action).toBe('none');
    });

    it('should return warn action at 80%', () => {
      enforcer.setAgentBudget('agent-1', 0.85); // Very low budget
      
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      session.startTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour

      const enforcement = enforcer.checkEnforcement('agent-1');
      expect(enforcement.action).toBe('warn');
      expect(enforcement.context).toBeDefined();
      expect(enforcement.context?.type).toBe('warning');
    });

    it('should return stop action at 100%', () => {
      enforcer.setAgentBudget('agent-1', 0.5); // Very low budget
      
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      session.startTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour

      const enforcement = enforcer.checkEnforcement('agent-1');
      expect(enforcement.action).toBe('stop');
      expect(enforcement.context).toBeDefined();
      expect(enforcement.context?.type).toBe('critical');
    });

    it('should enforce team budgets', () => {
      enforcer.setTeamBudget('team-a', 0.5); // Very low team budget
      
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1', {
        teamId: 'team-a',
      });
      session.startTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour

      const enforcement = enforcer.checkEnforcement('agent-1');
      expect(enforcement.action).toBe('stop');
      expect(enforcement.context?.teamId).toBe('team-a');
    });
  });

  describe('Runtime Registration', () => {
    it('should register runtime for enforcement', () => {
      enforcer.registerRuntime('agent-1', 'e2b-runtime-123', 'team-a');

      const agentCost = costTracker.getAgentCost('agent-1');
      expect(agentCost).toBeDefined();
      expect(agentCost?.runtimeType).toBe('e2b');
    });

    it('should detect runtime type from runtimeId', () => {
      enforcer.registerRuntime('agent-1', 'kata-runtime-123');

      const agentCost = costTracker.getAgentCost('agent-1');
      expect(agentCost?.runtimeType).toBe('kata');
    });

    it('should default to worktree for unknown prefix', () => {
      enforcer.registerRuntime('agent-1', 'unknown-runtime-123');

      const agentCost = costTracker.getAgentCost('agent-1');
      expect(agentCost?.runtimeType).toBe('worktree');
    });

    it('should set team budget on registration', () => {
      enforcer.registerRuntime('agent-1', 'runtime-123', 'team-a');

      expect(enforcer.getTeamBudget('team-a')).toBe(100); // Default team budget
    });
  });

  describe('Runtime Stopping', () => {
    it('should stop runtime due to budget exceeded', () => {
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      session.startTime = new Date(Date.now() - 60 * 60 * 1000);

      enforcer.stopRuntime('agent-1', 'Budget exceeded');

      // Should be stopped (no longer active)
      expect(costTracker.getActiveSessions()).toHaveLength(0);
    });

    it('should not stop same runtime twice', () => {
      costTracker.startTracking('agent-1', 'e2b', 'runtime-1');

      enforcer.stopRuntime('agent-1', 'Test');
      enforcer.stopRuntime('agent-1', 'Test'); // Should not throw

      expect(costTracker.getActiveSessions()).toHaveLength(0);
    });

    it('should emit runtimeStopped event', () => {
      const handler = jest.fn();
      enforcer.on('runtimeStopped', handler);

      costTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      enforcer.stopRuntime('agent-1', 'Budget exceeded');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].agentId).toBe('agent-1');
      expect(handler.mock.calls[0][0].reason).toBe('Budget exceeded');
    });
  });

  describe('Budget Status Overview', () => {
    it('should get all budget statuses', () => {
      enforcer.setTeamBudget('team-a', 100);
      enforcer.setTeamBudget('team-b', 200);
      enforcer.setAgentBudget('agent-1', 10);

      costTracker.startTracking('agent-1', 'e2b', 'runtime-1', { teamId: 'team-a' });
      costTracker.startTracking('agent-2', 'kata', 'runtime-2', { teamId: 'team-b' });

      const statuses = enforcer.getAllBudgetStatuses();

      expect(statuses.teams).toHaveLength(2);
      expect(statuses.agents).toHaveLength(2);
    });
  });

  describe('Budget Report', () => {
    it('should generate comprehensive report', () => {
      enforcer.setTeamBudget('team-a', 100);
      costTracker.startTracking('agent-1', 'e2b', 'runtime-1', { teamId: 'team-a' });

      const report = enforcer.generateReport();

      expect(report).toBeDefined();
      expect(report.budgets).toBeDefined();
      expect(report.costReport).toBeDefined();
      expect(report.violations).toBeDefined();
    });

    it('should include violations in report', () => {
      enforcer.setAgentBudget('agent-1', 0.5);
      
      const session = costTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      session.startTime = new Date(Date.now() - 60 * 60 * 1000);

      const report = enforcer.generateReport();

      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.violations[0].id).toBe('agent-1');
      expect(report.violations[0].type).toBe('agent');
    });
  });

  describe('Auto-stop', () => {
    it('should auto-stop when enabled and budget exceeded', (done) => {
      const autoEnforcer = new BudgetEnforcer(costTracker, {
        autoStop: true,
        defaultAgentBudget: 0.01, // Very low
      });

      autoEnforcer.on('exceeded', (context) => {
        expect(context.agentId).toBe('agent-1');
        autoEnforcer.dispose();
        done();
      });

      // Simulate immediate threshold exceeded
      costTracker.setThreshold('agent-1', 0.01);
      costTracker.startTracking('agent-1', 'e2b', 'runtime-1');

      // Manually trigger threshold exceeded
      costTracker.emit('thresholdExceeded', {
        agentId: 'agent-1',
        cost: 0.02,
        threshold: 0.01,
      });
    }, 1000);

    it('should not auto-stop when disabled', () => {
      const manualEnforcer = new BudgetEnforcer(costTracker, {
        autoStop: false,
      });

      const stopSpy = jest.spyOn(manualEnforcer, 'stopRuntime');

      costTracker.emit('thresholdExceeded', {
        agentId: 'agent-1',
        cost: 10,
        threshold: 5,
      });

      expect(stopSpy).not.toHaveBeenCalled();
      manualEnforcer.dispose();
    });
  });

  describe('Warning Callbacks', () => {
    it('should call onWarning callback', () => {
      const onWarning = jest.fn();
      
      const warningEnforcer = new BudgetEnforcer(costTracker, {
        onWarning,
      });

      costTracker.emit('thresholdWarning', {
        agentId: 'agent-1',
        cost: 8,
        threshold: 10,
      });

      expect(onWarning).toHaveBeenCalled();
      warningEnforcer.dispose();
    });

    it('should call onExceeded callback', () => {
      const onExceeded = jest.fn();
      
      const exceededEnforcer = new BudgetEnforcer(costTracker, {
        autoStop: false,
        onExceeded,
      });

      costTracker.emit('thresholdExceeded', {
        agentId: 'agent-1',
        cost: 15,
        threshold: 10,
      });

      expect(onExceeded).toHaveBeenCalled();
      exceededEnforcer.dispose();
    });

    it('should call onStopped callback', () => {
      const onStopped = jest.fn();
      
      const stoppedEnforcer = new BudgetEnforcer(costTracker, {
        onStopped,
      });

      costTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      stoppedEnforcer.stopRuntime('agent-1', 'Test stop');

      expect(onStopped).toHaveBeenCalled();
      stoppedEnforcer.dispose();
    });
  });

  describe('Events', () => {
    it('should emit warning event', () => {
      const handler = jest.fn();
      enforcer.on('warning', handler);

      costTracker.emit('thresholdWarning', {
        agentId: 'agent-1',
        cost: 8,
        threshold: 10,
        percent: 80,
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should emit exceeded event', () => {
      const handler = jest.fn();
      enforcer.on('exceeded', handler);

      costTracker.emit('thresholdExceeded', {
        agentId: 'agent-1',
        cost: 15,
        threshold: 10,
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should emit reset event', () => {
      const handler = jest.fn();
      enforcer.on('reset', handler);

      enforcer.reset();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Reset', () => {
    it('should reset all budgets', () => {
      enforcer.setTeamBudget('team-a', 100);
      enforcer.setAgentBudget('agent-1', 10);

      enforcer.reset();

      // Budgets should still be set, but state reset
      // This is implementation specific
    });
  });

  describe('Dispose', () => {
    it('should cleanup on dispose', () => {
      enforcer.dispose();
      // Should not throw
    });
  });

  describe('Global Instance Management', () => {
    const {
      getGlobalBudgetEnforcer,
      initializeGlobalBudgetEnforcer,
      resetGlobalBudgetEnforcer,
    } = jest.requireActual('../../../src/core/billing/budget-enforcer');

    beforeEach(() => {
      resetGlobalBudgetEnforcer();
    });

    afterEach(() => {
      resetGlobalBudgetEnforcer();
    });

    it('should create global instance', () => {
      const global = getGlobalBudgetEnforcer(costTracker);
      expect(global).toBeDefined();
    });

    it('should return same instance', () => {
      const global1 = getGlobalBudgetEnforcer(costTracker);
      const global2 = getGlobalBudgetEnforcer(costTracker);
      expect(global1).toBe(global2);
    });

    it('should reinitialize with initializeGlobalBudgetEnforcer', () => {
      const global1 = initializeGlobalBudgetEnforcer(costTracker, { autoStop: true });
      const global2 = initializeGlobalBudgetEnforcer(costTracker, { autoStop: false });
      expect(global1).not.toBe(global2);
    });
  });
});
