/**
 * Agent_24: Cost Tracking Accuracy Tests
 * Tests for cost tracking accuracy (±5% tolerance)
 */

import { describe, expect, test, beforeEach } from '@jest/globals';
import CostTracker from '../../src/core/billing/cost-tracker';
import BudgetEnforcer from '../../src/core/billing/budget-enforcer';
import UsageReports from '../../src/core/billing/reports/usage-reports';

describe('Cost Tracking Accuracy Tests', () => {
  let costTracker: CostTracker;
  let budgetEnforcer: BudgetEnforcer;
  let usageReports: UsageReports;

  beforeEach(() => {
    costTracker = new CostTracker();
    budgetEnforcer = new BudgetEnforcer(costTracker);
    usageReports = new UsageReports(costTracker, budgetEnforcer);
  });

  describe('Basic Cost Recording', () => {
    test('should record compute costs accurately', () => {
      const entry = costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.05); // 1 hour at $0.05/hr

      expect(entry.amount).toBeCloseTo(0.05, 4);
      expect(entry.resourceType).toBe('compute');
      expect(entry.agentId).toBe('agent-1');
    });

    test('should calculate storage costs correctly', () => {
      const entry = costTracker.trackStorage('agent-1', 'e2b', 1073741824, 0.10); // 1GB at $0.10/GB-month

      expect(entry.amount).toBeCloseTo(0.10, 4);
      expect(entry.resourceType).toBe('storage');
    });

    test('should calculate network costs correctly', () => {
      const entry = costTracker.trackNetwork('agent-1', 'e2b', 2147483648, 0.09); // 2GB at $0.09/GB

      expect(entry.amount).toBeCloseTo(0.18, 4);
      expect(entry.resourceType).toBe('network');
    });

    test('should sum total costs accurately', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.05); // $0.05
      costTracker.trackStorage('agent-1', 'e2b', 1073741824, 0.10); // $0.10
      costTracker.trackNetwork('agent-1', 'e2b', 2147483648, 0.09); // $0.18

      const total = costTracker.getTotalCost();
      expect(total).toBeCloseTo(0.33, 4);
    });
  });

  describe('Cost Accuracy Within 5%', () => {
    test('compute cost accuracy within 5%', () => {
      const duration = 7200000; // 2 hours
      const rate = 0.05; // $0.05/hr
      const expectedCost = (duration / 3600000) * rate; // $0.10

      const entry = costTracker.trackCompute('agent-1', 'e2b', duration, rate);

      const variance = Math.abs(entry.amount - expectedCost) / expectedCost;
      expect(variance).toBeLessThan(0.05); // Within 5%
    });

    test('storage cost accuracy within 5%', () => {
      const bytes = 5368709120; // 5GB
      const rate = 0.10; // $0.10/GB-month
      const expectedCost = (bytes / 1073741824) * rate; // $0.50

      const entry = costTracker.trackStorage('agent-1', 'e2b', bytes, rate);

      const variance = Math.abs(entry.amount - expectedCost) / expectedCost;
      expect(variance).toBeLessThan(0.05);
    });

    test('network cost accuracy within 5%', () => {
      const bytes = 10737418240; // 10GB
      const rate = 0.09; // $0.09/GB
      const expectedCost = (bytes / 1073741824) * rate; // $0.90

      const entry = costTracker.trackNetwork('agent-1', 'e2b', bytes, rate);

      const variance = Math.abs(entry.amount - expectedCost) / expectedCost;
      expect(variance).toBeLessThan(0.05);
    });

    test('total cost accuracy within 5%', () => {
      const expectedTotal = 1.00; // $1.00

      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.30); // $0.30
      costTracker.trackStorage('agent-1', 'e2b', 2147483648, 0.10); // $0.20
      costTracker.trackNetwork('agent-1', 'e2b', 5368709120, 0.09); // $0.45
      costTracker.record({
        agentId: 'agent-1',
        provider: 'e2b',
        resourceType: 'other',
        amount: 0.05,
        unit: 'USD'
      }); // $0.05

      const actualTotal = costTracker.getTotalCost();
      const variance = Math.abs(actualTotal - expectedTotal) / expectedTotal;
      
      expect(variance).toBeLessThan(0.05);
    });
  });

  describe('Agent Cost Summaries', () => {
    test('should calculate agent totals accurately', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10); // $0.10
      costTracker.trackCompute('agent-1', 'e2b', 1800000, 0.10); // $0.05
      costTracker.trackStorage('agent-1', 'e2b', 1073741824, 0.10); // $0.10

      const summary = costTracker.getAgentSummary('agent-1');
      expect(summary).toBeDefined();
      expect(summary!.totalCost).toBeCloseTo(0.25, 4);
      expect(summary!.byResource['compute']).toBeCloseTo(0.15, 4);
      expect(summary!.byResource['storage']).toBeCloseTo(0.10, 4);
    });

    test('should separate costs by agent', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10); // $0.10
      costTracker.trackCompute('agent-2', 'e2b', 7200000, 0.10); // $0.20

      const byAgent = costTracker.getCostByAgent();
      expect(byAgent['agent-1']).toBeCloseTo(0.10, 4);
      expect(byAgent['agent-2']).toBeCloseTo(0.20, 4);
    });

    test('should separate costs by resource type', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10); // $0.10
      costTracker.trackStorage('agent-1', 'e2b', 2147483648, 0.10); // $0.20
      costTracker.trackNetwork('agent-1', 'e2b', 1073741824, 0.10); // $0.10

      const byResource = costTracker.getCostByResource();
      expect(byResource['compute']).toBeCloseTo(0.10, 4);
      expect(byResource['storage']).toBeCloseTo(0.20, 4);
      expect(byResource['network']).toBeCloseTo(0.10, 4);
    });
  });

  describe('Budget Enforcement Accuracy', () => {
    test('should calculate budget percentage accurately', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.50); // $0.50
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.50); // $0.50
      // Total: $1.00

      budgetEnforcer.setBudget({
        agentId: 'agent-1',
        monthlyBudget: 10.00,
        alertThresholds: [50, 80],
        hardStopAt: 100
      });

      const status = budgetEnforcer.checkBudget('agent-1');
      expect(status.percentage).toBeCloseTo(10.0, 1); // 10%
      expect(status.spent).toBeCloseTo(1.00, 4);
      expect(status.remaining).toBeCloseTo(9.00, 4);
    });

    test('should trigger alert at 80% threshold', () => {
      costTracker.trackCompute('agent-1', 'e2b', 14400000, 0.50); // $2.00
      costTracker.trackCompute('agent-1', 'e2b', 14400000, 0.50); // $2.00
      costTracker.trackCompute('agent-1', 'e2b', 14400000, 0.50); // $2.00
      costTracker.trackCompute('agent-1', 'e2b', 14400000, 0.50); // $2.00
      // Total: $8.00

      const alerts: any[] = [];
      budgetEnforcer.on('budget:alert', (alert) => alerts.push(alert));

      budgetEnforcer.setBudget({
        agentId: 'agent-1',
        monthlyBudget: 10.00,
        alertThresholds: [80],
        hardStopAt: 100
      });

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].currentCost).toBeCloseTo(8.00, 4);
    });

    test('should block at 100% threshold', () => {
      costTracker.trackCompute('agent-1', 'e2b', 7200000, 0.50); // $1.00
      costTracker.trackCompute('agent-1', 'e2b', 7200000, 0.50); // $1.00
      // Total: $2.00 (100% of $2 budget)

      budgetEnforcer.setBudget({
        agentId: 'agent-1',
        monthlyBudget: 2.00,
        alertThresholds: [80],
        hardStopAt: 100
      });

      const enforcement = budgetEnforcer.canExecute('agent-1');
      expect(enforcement.allowed).toBe(false);
      expect(enforcement.type).toBe('block');
    });
  });

  describe('Usage Report Accuracy', () => {
    test('should generate accurate cost breakdowns', () => {
      // Simulate usage
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10);
      costTracker.trackCompute('agent-2', 'e2b', 7200000, 0.10);
      costTracker.trackStorage('agent-1', 'e2b', 1073741824, 0.10);

      const report = usageReports.generateReport();

      expect(report.summary.totalCost).toBeCloseTo(0.40, 4);
      expect(report.byAgent).toHaveLength(2);
      
      const agent1 = report.byAgent.find(a => a.agentId === 'agent-1');
      expect(agent1?.totalCost).toBeCloseTo(0.20, 4);
    });

    test('should calculate resource breakdown percentages accurately', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10); // $0.10 (25%)
      costTracker.trackStorage('agent-1', 'e2b', 2147483648, 0.10); // $0.20 (50%)
      costTracker.trackNetwork('agent-1', 'e2b', 1073741824, 0.10); // $0.10 (25%)

      const report = usageReports.generateReport();
      const computeBreakdown = report.byResource.find(r => r.type === 'compute');
      const storageBreakdown = report.byResource.find(r => r.type === 'storage');
      
      expect(computeBreakdown?.percentage).toBeCloseTo(25, 1);
      expect(storageBreakdown?.percentage).toBeCloseTo(50, 1);
    });

    test('should track daily costs accurately', () => {
      const today = new Date().toISOString().split('T')[0];
      
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10);
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10);

      const dailyCosts = costTracker.getDailyCosts();
      expect(dailyCosts[today]).toBeCloseTo(0.20, 4);
    });
  });

  describe('Session Cost Tracking', () => {
    test('should track costs per session', () => {
      const sessionId = 'session-123';
      
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10, sessionId);
      costTracker.trackStorage('agent-1', 'e2b', 1073741824, 0.10, sessionId);
      costTracker.trackNetwork('agent-1', 'e2b', 2147483648, 0.09, sessionId);

      const sessionCost = costTracker.getSessionCost(sessionId);
      expect(sessionCost).toBeCloseTo(0.38, 4); // 0.10 + 0.10 + 0.18
    });

    test('should separate costs by session', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10, 'session-1');
      costTracker.trackCompute('agent-1', 'e2b', 7200000, 0.10, 'session-2');

      expect(costTracker.getSessionCost('session-1')).toBeCloseTo(0.10, 4);
      expect(costTracker.getSessionCost('session-2')).toBeCloseTo(0.20, 4);
    });
  });

  describe('Cost Filtering', () => {
    test('should filter entries by agent', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10);
      costTracker.trackCompute('agent-2', 'e2b', 3600000, 0.20);

      const agent1Entries = costTracker.getEntries({ agentId: 'agent-1' });
      expect(agent1Entries).toHaveLength(1);
      expect(agent1Entries[0].amount).toBeCloseTo(0.10, 4);
    });

    test('should filter entries by resource type', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10);
      costTracker.trackStorage('agent-1', 'e2b', 1073741824, 0.10);

      const computeEntries = costTracker.getEntries({ resourceType: 'compute' });
      expect(computeEntries).toHaveLength(1);
      expect(computeEntries[0].resourceType).toBe('compute');
    });

    test('should filter entries by time range', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10);

      const recentEntries = costTracker.getEntries({
        startTime: yesterday,
        endTime: now
      });
      
      expect(recentEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Export/Import Accuracy', () => {
    test('should export and import costs without loss', () => {
      costTracker.trackCompute('agent-1', 'e2b', 3600000, 0.10);
      costTracker.trackStorage('agent-1', 'e2b', 1073741824, 0.10);

      const exported = costTracker.export();
      const totalBefore = costTracker.getTotalCost();

      costTracker.reset();
      costTracker.import(exported);
      const totalAfter = costTracker.getTotalCost();

      expect(totalAfter).toBeCloseTo(totalBefore, 4);
    });
  });
});
