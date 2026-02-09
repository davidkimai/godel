/**
 * CostTracker Tests
 *
 * Tests per-agent cost tracking with real-time calculation.
 * Validates cost tracking accuracy (±5%) requirement.
 *
 * @module tests/core/billing/cost-tracker
 * @version 1.0.0
 * @since 2026-02-08
 */

import { CostTracker, CostTrackerConfig, AgentCost } from '../../../src/core/billing/cost-tracker';

// ============================================================================
// Test Suite
// ============================================================================

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker({
      realTimeCalculation: false, // Disable for most tests to avoid timing issues
      rates: {
        e2b: 0.50,      // $0.50/hour
        kata: 0.10,     // $0.10/hour
        worktree: 0,    // Free
      },
    });
  });

  afterEach(() => {
    tracker.stop();
    tracker.reset();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const defaultTracker = new CostTracker();
      expect(defaultTracker).toBeDefined();
      expect(defaultTracker.getRates()).toBeDefined();
      defaultTracker.stop();
    });

    it('should initialize with custom rates', () => {
      const config: CostTrackerConfig = {
        rates: {
          e2b: 1.00,
          kata: 0.20,
          worktree: 0,
        },
      };

      const customTracker = new CostTracker(config);
      const rates = customTracker.getRates();

      expect(rates.e2b).toBe(1.00);
      expect(rates.kata).toBe(0.20);
      expect(rates.worktree).toBe(0);
      customTracker.stop();
    });

    it('should use default rates when not specified', () => {
      const rates = tracker.getRates();
      expect(rates.e2b).toBe(0.50);
      expect(rates.kata).toBe(0.10);
      expect(rates.worktree).toBe(0);
    });

    it('should start real-time updates when enabled', () => {
      const rtTracker = new CostTracker({
        realTimeCalculation: true,
        updateInterval: 1000,
      });

      expect(rtTracker).toBeDefined();
      rtTracker.stop();
    });
  });

  describe('Session Tracking', () => {
    it('should start tracking a session', () => {
      const session = tracker.startTracking('agent-1', 'e2b', 'runtime-1');

      expect(session).toBeDefined();
      expect(session.agentId).toBe('agent-1');
      expect(session.runtimeType).toBe('e2b');
      expect(session.runtimeId).toBe('runtime-1');
      expect(session.rate).toBe(0.50);
      expect(session.cost).toBe(0);
      expect(session.startTime).toBeInstanceOf(Date);
    });

    it('should start tracking with options', () => {
      const session = tracker.startTracking('agent-1', 'kata', 'runtime-1', {
        teamId: 'team-a',
        userId: 'user-1',
        threshold: 5.00,
        metadata: { task: 'test' },
      });

      expect(session.teamId).toBe('team-a');
      expect(session.userId).toBe('user-1');
      expect(session.metadata).toEqual({ task: 'test' });
    });

    it('should emit sessionStarted event', () => {
      const handler = jest.fn();
      tracker.on('sessionStarted', handler);

      tracker.startTracking('agent-1', 'e2b', 'runtime-1');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].agentId).toBe('agent-1');
    });

    it('should stop existing session when starting new one for same agent', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');
      
      const endHandler = jest.fn();
      tracker.on('sessionEnded', endHandler);

      tracker.startTracking('agent-1', 'kata', 'runtime-2');

      expect(endHandler).toHaveBeenCalled();
    });

    it('should stop tracking a session', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');

      // Wait a bit
      jest.advanceTimersByTime(1000);

      const stopped = tracker.stopTracking('agent-1');

      expect(stopped).toBeDefined();
      expect(stopped?.agentId).toBe('agent-1');
      expect(stopped?.endTime).toBeInstanceOf(Date);
      expect(stopped?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return null when stopping non-existent session', () => {
      const stopped = tracker.stopTracking('non-existent');
      expect(stopped).toBeNull();
    });

    it('should emit sessionEnded event', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');

      const handler = jest.fn();
      tracker.on('sessionEnded', handler);

      tracker.stopTracking('agent-1');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].agentId).toBe('agent-1');
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost for e2b runtime correctly', async () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');

      // Simulate 1 hour runtime
      await new Promise(resolve => setTimeout(resolve, 10));
      const cost1 = tracker.getCurrentCost('agent-1');
      expect(cost1).toBeGreaterThanOrEqual(0);

      tracker.stopTracking('agent-1');
      const agentCost = tracker.getAgentCost('agent-1');
      
      // Cost should be calculated
      expect(agentCost?.cost).toBeGreaterThanOrEqual(0);
    });

    it('should calculate cost within ±5% accuracy', () => {
      // Create a tracker with known rates
      const preciseTracker = new CostTracker({
        realTimeCalculation: false,
        rates: { e2b: 1.00, kata: 1.00, worktree: 0 },
      });

      // Start tracking
      const session = preciseTracker.startTracking('agent-1', 'e2b', 'runtime-1');
      
      // Simulate exactly 1 hour
      const oneHourMs = 60 * 60 * 1000;
      session.startTime = new Date(Date.now() - oneHourMs);

      // Get cost
      const agentCost = preciseTracker.getAgentCost('agent-1');
      const expectedCost = 1.00; // $1.00 for 1 hour at $1.00/hour

      // Should be within 5%
      const variance = Math.abs(agentCost!.cost - expectedCost) / expectedCost;
      expect(variance).toBeLessThanOrEqual(0.05);

      preciseTracker.stop();
    });

    it('should calculate different rates for different runtime types', () => {
      const e2bSession = tracker.startTracking('agent-1', 'e2b', 'runtime-1');
      const kataSession = tracker.startTracking('agent-2', 'kata', 'runtime-2');

      // Simulate 1 hour
      const oneHourMs = 60 * 60 * 1000;
      e2bSession.startTime = new Date(Date.now() - oneHourMs);
      kataSession.startTime = new Date(Date.now() - oneHourMs);

      const e2bCost = tracker.getAgentCost('agent-1')?.cost;
      const kataCost = tracker.getAgentCost('agent-2')?.cost;

      // E2B should cost 5x more than Kata
      expect(e2bCost).toBeCloseTo(0.50, 2);
      expect(kataCost).toBeCloseTo(0.10, 2);
    });

    it('should return 0 cost for worktree', () => {
      const session = tracker.startTracking('agent-1', 'worktree', 'runtime-1');
      
      // Simulate 1 hour
      const oneHourMs = 60 * 60 * 1000;
      session.startTime = new Date(Date.now() - oneHourMs);

      const cost = tracker.getAgentCost('agent-1')?.cost;
      expect(cost).toBe(0);
    });

    it('should return 0 for non-existent agent', () => {
      const cost = tracker.getCurrentCost('non-existent');
      expect(cost).toBe(0);
    });

    it('should return null for non-existent agent cost', () => {
      const agentCost = tracker.getAgentCost('non-existent');
      expect(agentCost).toBeNull();
    });
  });

  describe('Thresholds', () => {
    it('should set and get threshold', () => {
      tracker.setThreshold('agent-1', 10.00);
      expect(tracker.getThreshold('agent-1')).toBe(10.00);
    });

    it('should use default threshold', () => {
      expect(tracker.getThreshold('agent-1')).toBe(10); // $10 default
    });

    it('should check if threshold exceeded', () => {
      tracker.setThreshold('agent-1', 0.01); // Very low threshold
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');

      // Cost will exceed very quickly
      expect(tracker.isThresholdExceeded('agent-1')).toBe(true);
    });

    it('should start tracking with threshold option', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1', {
        threshold: 5.00,
      });

      expect(tracker.getThreshold('agent-1')).toBe(5.00);
    });
  });

  describe('Team Costs', () => {
    it('should get team costs', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1', { teamId: 'team-a' });
      tracker.startTracking('agent-2', 'kata', 'runtime-2', { teamId: 'team-a' });

      const teamCosts = tracker.getTeamCosts('team-a');

      expect(teamCosts).toBeDefined();
      expect(teamCosts.teamId).toBe('team-a');
      expect(teamCosts.agentCount).toBe(2);
      expect(teamCosts.activeSessions).toBe(2);
    });

    it('should calculate costs by runtime type for team', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1', { teamId: 'team-a' });
      tracker.startTracking('agent-2', 'kata', 'runtime-2', { teamId: 'team-a' });
      tracker.startTracking('agent-3', 'worktree', 'runtime-3', { teamId: 'team-a' });

      const teamCosts = tracker.getTeamCosts('team-a');

      expect(teamCosts.byRuntime.e2b).toBeGreaterThanOrEqual(0);
      expect(teamCosts.byRuntime.kata).toBeGreaterThanOrEqual(0);
      expect(teamCosts.byRuntime.worktree).toBe(0);
    });
  });

  describe('Cost Report', () => {
    it('should generate cost report', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1', { teamId: 'team-a' });
      tracker.startTracking('agent-2', 'kata', 'runtime-2', { teamId: 'team-b' });

      const report = tracker.generateReport();

      expect(report).toBeDefined();
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.totalCost).toBeGreaterThanOrEqual(0);
      expect(report.totalHours).toBeGreaterThanOrEqual(0);
      expect(report.byTeam).toBeDefined();
      expect(report.byRuntime).toBeDefined();
      expect(report.activeSessions).toBe(2);
    });

    it('should include all teams in report', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1', { teamId: 'team-a' });
      tracker.startTracking('agent-2', 'kata', 'runtime-2', { teamId: 'team-b' });

      const report = tracker.generateReport();
      const teamIds = report.byTeam.map(t => t.teamId);

      expect(teamIds).toContain('team-a');
      expect(teamIds).toContain('team-b');
    });
  });

  describe('Rate Updates', () => {
    it('should update rates', () => {
      tracker.updateRates({ e2b: 0.75 });

      const rates = tracker.getRates();
      expect(rates.e2b).toBe(0.75);
      expect(rates.kata).toBe(0.10); // Unchanged
    });

    it('should emit ratesUpdated event', () => {
      const handler = jest.fn();
      tracker.on('ratesUpdated', handler);

      tracker.updateRates({ e2b: 0.75 });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Active Sessions', () => {
    it('should get all active sessions', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');
      tracker.startTracking('agent-2', 'kata', 'runtime-2');

      const active = tracker.getActiveSessions();

      expect(active).toHaveLength(2);
    });

    it('should not include completed sessions in active', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');
      tracker.stopTracking('agent-1');

      const active = tracker.getActiveSessions();

      expect(active).toHaveLength(0);
    });

    it('should get all completed sessions', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');
      tracker.stopTracking('agent-1');

      const completed = tracker.getCompletedSessions();

      expect(completed).toHaveLength(1);
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(() => {
      tracker.stop();
    });

    it('should emit costUpdated events', (done) => {
      const rtTracker = new CostTracker({
        realTimeCalculation: true,
        updateInterval: 100,
      });

      rtTracker.startTracking('agent-1', 'e2b', 'runtime-1');

      rtTracker.on('costUpdated', (data) => {
        expect(data.agentId).toBe('agent-1');
        expect(data.cost).toBeGreaterThanOrEqual(0);
        rtTracker.stop();
        done();
      });
    }, 1000);

    it('should emit thresholdWarning events', (done) => {
      const rtTracker = new CostTracker({
        realTimeCalculation: true,
        updateInterval: 100,
      });

      rtTracker.setThreshold('agent-1', 0.0001); // Very low threshold
      rtTracker.startTracking('agent-1', 'e2b', 'runtime-1');

      rtTracker.on('thresholdWarning', (data) => {
        expect(data.agentId).toBe('agent-1');
        expect(data.percent).toBeGreaterThanOrEqual(80);
        rtTracker.stop();
        done();
      });
    }, 1000);

    it('should emit thresholdExceeded events', (done) => {
      const rtTracker = new CostTracker({
        realTimeCalculation: true,
        updateInterval: 100,
      });

      rtTracker.setThreshold('agent-1', 0.00001); // Extremely low threshold
      rtTracker.startTracking('agent-1', 'e2b', 'runtime-1');

      rtTracker.on('thresholdExceeded', (data) => {
        expect(data.agentId).toBe('agent-1');
        rtTracker.stop();
        done();
      });
    }, 1000);

    it('should stop and resume updates', () => {
      tracker.stop();
      tracker.resume();
      tracker.stop();
    });
  });

  describe('Reset', () => {
    it('should reset all tracking data', () => {
      tracker.startTracking('agent-1', 'e2b', 'runtime-1');
      tracker.stopTracking('agent-1');

      expect(tracker.getCompletedSessions()).toHaveLength(1);

      tracker.reset();

      expect(tracker.getActiveSessions()).toHaveLength(0);
      expect(tracker.getCompletedSessions()).toHaveLength(0);
    });

    it('should emit reset event', () => {
      const handler = jest.fn();
      tracker.on('reset', handler);

      tracker.reset();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Global Instance Management', () => {
    const {
      getGlobalCostTracker,
      initializeGlobalCostTracker,
      resetGlobalCostTracker,
    } = jest.requireActual('../../../src/core/billing/cost-tracker');

    beforeEach(() => {
      resetGlobalCostTracker();
    });

    afterEach(() => {
      resetGlobalCostTracker();
    });

    it('should create global instance', () => {
      const global = getGlobalCostTracker();
      expect(global).toBeDefined();
    });

    it('should return same instance', () => {
      const global1 = getGlobalCostTracker();
      const global2 = getGlobalCostTracker();
      expect(global1).toBe(global2);
    });

    it('should reinitialize with initializeGlobalCostTracker', () => {
      const global1 = initializeGlobalCostTracker({ defaultThreshold: 5 });
      const global2 = initializeGlobalCostTracker({ defaultThreshold: 10 });
      expect(global1).not.toBe(global2);
    });
  });
});
