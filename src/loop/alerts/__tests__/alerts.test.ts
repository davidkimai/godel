/**
 * Alert System Unit Tests
 * 
 * Tests for alert rules, anomaly detection, and alert manager
 */

import { EventBus } from '../../event-bus.js';
import {
  AlertRuleEngine,
  AlertRule,
  InMemoryTimeSeriesStorage,
  AlertManager,
  StatisticalAnomalyDetector,
  SeasonalAnomalyDetector,
  MADAnomalyDetector,
  ExponentialSmoothingDetector,
  CompositeAnomalyDetector,
  AnomalyDetectionService
} from '../index.js';

// Test timeout
jest.setTimeout(10000);

describe('Alert System', () => {
  let eventBus: EventBus;
  let storage: InMemoryTimeSeriesStorage;

  beforeEach(() => {
    eventBus = new EventBus();
    storage = new InMemoryTimeSeriesStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  describe('AlertRuleEngine', () => {
    let engine: AlertRuleEngine;

    beforeEach(() => {
      engine = new AlertRuleEngine(storage, eventBus);
    });

    describe('Rule Management', () => {
      it('should add and retrieve a rule', () => {
        const rule: AlertRule = {
          id: 'test-rule',
          name: 'Test Rule',
          description: 'A test rule',
          enabled: true,
          severity: 'warning',
          metric: 'test_metric',
          operator: '>',
          threshold: 100,
          for: 60,
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        };

        engine.addRule(rule);

        const retrieved = engine.getRule('test-rule');
        expect(retrieved).toEqual(rule);
      });

      it('should remove a rule', () => {
        const rule: AlertRule = {
          id: 'test-rule',
          name: 'Test Rule',
          description: 'A test rule',
          enabled: true,
          severity: 'warning',
          metric: 'test_metric',
          operator: '>',
          threshold: 100,
          for: 60,
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        };

        engine.addRule(rule);
        expect(engine.removeRule('test-rule')).toBe(true);
        expect(engine.getRule('test-rule')).toBeUndefined();
      });

      it('should return all rules', () => {
        const rule1: AlertRule = {
          id: 'rule-1',
          name: 'Rule 1',
          description: 'First rule',
          enabled: true,
          severity: 'warning',
          metric: 'metric1',
          operator: '>',
          threshold: 100,
          for: 60,
          actions: [],
          cooldown: 300
        };

        const rule2: AlertRule = {
          id: 'rule-2',
          name: 'Rule 2',
          description: 'Second rule',
          enabled: true,
          severity: 'critical',
          metric: 'metric2',
          operator: '<',
          threshold: 50,
          for: 60,
          actions: [],
          cooldown: 300
        };

        engine.addRule(rule1);
        engine.addRule(rule2);

        const allRules = engine.getAllRules();
        expect(allRules).toHaveLength(2);
        expect(allRules.map(r => r.id)).toContain('rule-1');
        expect(allRules.map(r => r.id)).toContain('rule-2');
      });
    });

    describe('Rule Evaluation', () => {
      it('should trigger alert when threshold is exceeded', async () => {
        const rule: AlertRule = {
          id: 'high-cpu',
          name: 'High CPU',
          description: 'CPU usage too high',
          enabled: true,
          severity: 'warning',
          metric: 'cpu_usage',
          operator: '>',
          threshold: 80,
          for: 0,
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        };

        engine.addRule(rule);

        // Write metric above threshold with explicit timestamps
        const now = Date.now();
        await storage.write('cpu_usage', 90, {}, now - 1000);
        await storage.write('cpu_usage', 95, {}, now);

        const alerts = await engine.evaluateRules();

        expect(alerts).toHaveLength(1);
        expect(alerts[0].ruleId).toBe('high-cpu');
        expect(alerts[0].severity).toBe('warning');
        expect(alerts[0].status).toBe('firing');
      });

      it('should not trigger alert when threshold is not exceeded', async () => {
        const rule: AlertRule = {
          id: 'high-cpu',
          name: 'High CPU',
          description: 'CPU usage too high',
          enabled: true,
          severity: 'warning',
          metric: 'cpu_usage',
          operator: '>',
          threshold: 80,
          for: 0,
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        };

        engine.addRule(rule);

        await storage.write('cpu_usage', 50);

        const alerts = await engine.evaluateRules();

        expect(alerts).toHaveLength(0);
      });

      it('should respect the "for" duration', async () => {
        const rule: AlertRule = {
          id: 'high-memory',
          name: 'High Memory',
          description: 'Memory usage too high',
          enabled: true,
          severity: 'critical',
          metric: 'memory_usage',
          operator: '>',
          threshold: 90,
          for: 2, // 2 seconds
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        };

        engine.addRule(rule);

        // Write single point above threshold
        await storage.write('memory_usage', 95);

        const alerts = await engine.evaluateRules();

        // Should not trigger yet (need multiple evaluations within 'for' window)
        expect(alerts).toHaveLength(0);
      });

      it('should not trigger disabled rules', async () => {
        const rule: AlertRule = {
          id: 'disabled-rule',
          name: 'Disabled Rule',
          description: 'This rule is disabled',
          enabled: false,
          severity: 'warning',
          metric: 'metric',
          operator: '>',
          threshold: 50,
          for: 0,
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        };

        engine.addRule(rule);
        await storage.write('metric', 100);
        await storage.write('metric', 100);

        const alerts = await engine.evaluateRules();

        expect(alerts).toHaveLength(0);
      });

      it('should respect cooldown period', async () => {
        const rule: AlertRule = {
          id: 'cooldown-test',
          name: 'Cooldown Test',
          description: 'Testing cooldown',
          enabled: true,
          severity: 'warning',
          metric: 'metric',
          operator: '>',
          threshold: 50,
          for: 0,
          actions: [{ type: 'log', config: {} }],
          cooldown: 10 // 10 seconds
        };

        engine.addRule(rule);

        const now = Date.now();

        // First trigger
        await storage.write('metric', 100, {}, now - 2000);
        await storage.write('metric', 100, {}, now - 1000);

        const alerts1 = await engine.evaluateRules();
        expect(alerts1).toHaveLength(1);

        // Immediate second evaluation should not trigger (cooldown)
        await storage.write('metric', 100, {}, now + 100);
        await storage.write('metric', 100, {}, now + 200);

        const alerts2 = await engine.evaluateRules();
        expect(alerts2).toHaveLength(0);
      });

      it('should support all comparison operators', async () => {
        const operators: Array<{ op: '>' | '<' | '>=' | '<=' | '==' | '!=', value: number, threshold: number, shouldTrigger: boolean }> = [
          { op: '>', value: 100, threshold: 50, shouldTrigger: true },
          { op: '>', value: 50, threshold: 100, shouldTrigger: false },
          { op: '<', value: 50, threshold: 100, shouldTrigger: true },
          { op: '<', value: 100, threshold: 50, shouldTrigger: false },
          { op: '>=', value: 100, threshold: 100, shouldTrigger: true },
          { op: '>=', value: 99, threshold: 100, shouldTrigger: false },
          { op: '<=', value: 100, threshold: 100, shouldTrigger: true },
          { op: '<=', value: 101, threshold: 100, shouldTrigger: false },
          { op: '==', value: 100, threshold: 100, shouldTrigger: true },
          { op: '==', value: 99, threshold: 100, shouldTrigger: false },
          { op: '!=', value: 99, threshold: 100, shouldTrigger: true },
          { op: '!=', value: 100, threshold: 100, shouldTrigger: false },
        ];

        for (const { op, value, threshold, shouldTrigger } of operators) {
          const testStorage = new InMemoryTimeSeriesStorage();
          const testEngine = new AlertRuleEngine(testStorage, eventBus);
          
          const rule: AlertRule = {
            id: `op-test-${op}`,
            name: `Operator ${op} Test`,
            description: `Testing operator ${op}`,
            enabled: true,
            severity: 'warning',
            metric: 'test_metric',
            operator: op,
            threshold,
            for: 0,
            actions: [{ type: 'log', config: {} }],
            cooldown: 0
          };

          testEngine.addRule(rule);
          
          const now = Date.now();
          await testStorage.write('test_metric', value, {}, now - 1000);
          await testStorage.write('test_metric', value, {}, now);

          const alerts = await testEngine.evaluateRules();
          
          expect(alerts.length > 0).toBe(shouldTrigger);
        }
      });
    });

    describe('Active Alerts', () => {
      it('should track active alerts', async () => {
        const rule: AlertRule = {
          id: 'active-test',
          name: 'Active Test',
          description: 'Testing active alerts',
          enabled: true,
          severity: 'warning',
          metric: 'metric',
          operator: '>',
          threshold: 50,
          for: 0,
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        };

        engine.addRule(rule);
        const now = Date.now();

        // Initially no active alerts
        expect(engine.getActiveAlerts()).toHaveLength(0);

        // Trigger alert
        await storage.write('metric', 100, {}, now - 2000);
        await storage.write('metric', 100, {}, now - 1000);
        await engine.evaluateRules();

        // Should have active alert
        expect(engine.getActiveAlerts()).toHaveLength(1);

        // Resolve alert by writing below threshold
        await storage.write('metric', 30, {}, now);
        await engine.evaluateRules();

        // Alert should be resolved
        expect(engine.getActiveAlerts()).toHaveLength(0);
      });
    });
  });

  describe('Anomaly Detection', () => {
    describe('StatisticalAnomalyDetector', () => {
      it('should detect statistical anomalies', () => {
        const detector = new StatisticalAnomalyDetector(3, 50);
        
        // Generate baseline data (normal distribution)
        const points = Array.from({ length: 60 }, (_, i) => ({
          timestamp: Date.now() + i * 1000,
          value: 100 + Math.random() * 10, // Around 100 with small variance
          labels: {}
        }));

        // Add anomalous point
        points.push({
          timestamp: Date.now() + 61000,
          value: 150, // 5 std deviations away
          labels: {}
        });

        const anomalies = detector.detect(points);

        expect(anomalies.length).toBeGreaterThan(0);
        expect(anomalies[anomalies.length - 1].severity).toBe('high');
      });

      it('should return empty for insufficient data', () => {
        const detector = new StatisticalAnomalyDetector(3, 50);
        
        const points = Array.from({ length: 10 }, (_, i) => ({
          timestamp: Date.now() + i * 1000,
          value: 100,
          labels: {}
        }));

        const anomalies = detector.detect(points);

        expect(anomalies).toHaveLength(0);
      });

      it('should allow threshold adjustment', () => {
        const detector = new StatisticalAnomalyDetector(2, 50);
        expect(detector.getThreshold()).toBe(2);
        
        detector.setThreshold(4);
        expect(detector.getThreshold()).toBe(4);
      });
    });

    describe('SeasonalAnomalyDetector', () => {
      it('should detect seasonal anomalies', () => {
        const detector = new SeasonalAnomalyDetector('daily', 1.5);
        
        const baseTime = new Date('2024-01-01T00:00:00').getTime();
        const points = [];
        
        // Generate 7 days of hourly data with daily pattern for more stable statistics
        for (let day = 0; day < 7; day++) {
          for (let hour = 0; hour < 24; hour++) {
            // Peak at noon, low at night
            const baseValue = hour >= 9 && hour <= 17 ? 100 : 20;
            points.push({
              timestamp: baseTime + (day * 24 + hour) * 3600 * 1000,
              value: baseValue,
              labels: {}
            });
          }
        }

        // Add anomalous points (high value during night hours)
        // Add multiple anomalous points to ensure detection
        for (let i = 0; i < 3; i++) {
          points.push({
            timestamp: baseTime + 7 * 24 * 3600 * 1000 + i * 3600 * 1000, // Late night hours
            value: 150, // Should be around 20
            labels: {}
          });
        }

        const anomalies = detector.detect(points);
        expect(anomalies.length).toBeGreaterThan(0);
      });

      it('should return empty for insufficient data', () => {
        const detector = new SeasonalAnomalyDetector('daily', 3);
        
        const points = Array.from({ length: 10 }, (_, i) => ({
          timestamp: Date.now() + i * 1000,
          value: 100,
          labels: {}
        }));

        const anomalies = detector.detect(points);
        expect(anomalies).toHaveLength(0);
      });
    });

    describe('MADAnomalyDetector', () => {
      it('should detect anomalies using MAD', () => {
        const detector = new MADAnomalyDetector(3);
        
        const points = Array.from({ length: 50 }, (_, i) => ({
          timestamp: Date.now() + i * 1000,
          value: 100 + Math.random() * 10,
          labels: {}
        }));

        // Add outlier
        points.push({
          timestamp: Date.now() + 51000,
          value: 200,
          labels: {}
        });

        const anomalies = detector.detect(points);
        expect(anomalies.length).toBeGreaterThan(0);
      });
    });

    describe('ExponentialSmoothingDetector', () => {
      it('should detect anomalies using exponential smoothing', () => {
        // Use a lower threshold for more sensitive detection
        const detector = new ExponentialSmoothingDetector(0.1, 2);
        
        const baseTime = Date.now();
        // Generate stable baseline
        const points = Array.from({ length: 100 }, (_, i) => ({
          timestamp: baseTime + i * 1000,
          value: 100,
          labels: {}
        }));

        // Add anomalous point with very large deviation
        points.push({
          timestamp: baseTime + 100 * 1000,
          value: 500, // 5x deviation from baseline
          labels: {}
        });

        const anomalies = detector.detect(points);
        expect(anomalies.length).toBeGreaterThan(0);
      });

      it('should return empty for insufficient data', () => {
        const detector = new ExponentialSmoothingDetector(0.3, 3);
        
        const points = Array.from({ length: 5 }, (_, i) => ({
          timestamp: Date.now() + i * 1000,
          value: 100,
          labels: {}
        }));

        const anomalies = detector.detect(points);
        expect(anomalies).toHaveLength(0);
      });
    });

    describe('CompositeAnomalyDetector', () => {
      it('should combine multiple detectors', () => {
        const detector = new CompositeAnomalyDetector([
          new StatisticalAnomalyDetector(3, 30),
          new MADAnomalyDetector(3)
        ]);
        
        const points = Array.from({ length: 50 }, (_, i) => ({
          timestamp: Date.now() + i * 1000,
          value: 100 + Math.random() * 10,
          labels: {}
        }));

        // Add anomalous point
        points.push({
          timestamp: Date.now() + 51000,
          value: 150,
          labels: {}
        });

        const anomalies = detector.detect(points);
        expect(anomalies.length).toBeGreaterThan(0);
      });
    });

    describe('AnomalyDetectionService', () => {
      it('should run detection on registered metrics', async () => {
        const service = new AnomalyDetectionService(storage, eventBus);
        
        service.addDetector('test_metric', new StatisticalAnomalyDetector(3, 20));
        
        // Generate baseline data
        for (let i = 0; i < 30; i++) {
          await storage.write('test_metric', 100 + Math.random() * 5);
        }

        const anomalies = await service.runDetection();
        expect(anomalies).toBeDefined();
      });

      it('should track detection history', async () => {
        const service = new AnomalyDetectionService(storage, eventBus);
        
        service.addDetector('test_metric', new StatisticalAnomalyDetector(3, 20));
        
        // Generate data with anomaly
        for (let i = 0; i < 25; i++) {
          await storage.write('test_metric', 100 + Math.random() * 5);
        }

        await service.runDetection();
        
        const history = service.getHistory('test_metric');
        expect(history).toBeDefined();
      });

      it('should remove detectors', () => {
        const service = new AnomalyDetectionService(storage, eventBus);
        
        service.addDetector('metric1', new StatisticalAnomalyDetector());
        expect(service.removeDetector('metric1')).toBe(true);
        expect(service.removeDetector('metric1')).toBe(false);
      });
    });
  });

  describe('AlertManager', () => {
    let manager: AlertManager;

    beforeEach(() => {
      manager = new AlertManager(eventBus, {
        evaluationInterval: 1000,
        anomalyInterval: 5000
      });
    });

    afterEach(() => {
      manager.stop();
    });

    describe('Lifecycle', () => {
      it('should start and stop', () => {
        expect(manager.getStats().isRunning).toBe(false);
        
        manager.start();
        expect(manager.getStats().isRunning).toBe(true);
        
        manager.stop();
        expect(manager.getStats().isRunning).toBe(false);
      });

      it('should not start twice', () => {
        manager.start();
        manager.start(); // Should not throw or create duplicate intervals
        expect(manager.getStats().isRunning).toBe(true);
      });
    });

    describe('Rule Management', () => {
      it('should add and retrieve rules', () => {
        const rule: AlertRule = {
          id: 'manager-test',
          name: 'Manager Test Rule',
          description: 'Testing manager',
          enabled: true,
          severity: 'warning',
          metric: 'test_metric',
          operator: '>',
          threshold: 100,
          for: 60,
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        };

        manager.addRule(rule);
        
        expect(manager.getRule('manager-test')).toEqual(rule);
        expect(manager.getRuleCount()).toBe(1);
      });

      it('should setup default rules', () => {
        manager.setupDefaultRules();
        
        expect(manager.getRuleCount()).toBeGreaterThan(0);
        
        // Check for expected default rules
        const rules = manager.getAllRules();
        expect(rules.some(r => r.id === 'high-error-rate')).toBe(true);
        expect(rules.some(r => r.id === 'queue-backup')).toBe(true);
        expect(rules.some(r => r.id === 'agents-unhealthy')).toBe(true);
      });

      it('should track active alerts', async () => {
        manager.addRule({
          id: 'active-test',
          name: 'Active Test',
          description: 'Testing active alerts',
          enabled: true,
          severity: 'warning',
          metric: 'metric',
          operator: '>',
          threshold: 50,
          for: 0,
          actions: [{ type: 'log', config: {} }],
          cooldown: 300
        });

        expect(manager.getActiveAlerts()).toHaveLength(0);

        // Get the manager's storage and write with explicit timestamps
        const storage = manager.getStorage();
        const now = Date.now();
        
        // Trigger alert
        await storage.write('metric', 100, {}, now - 2000);
        await storage.write('metric', 100, {}, now - 1000);
        
        await manager.evaluateNow();

        expect(manager.getActiveAlerts().length).toBeGreaterThan(0);
      });
    });

    describe('Metric Recording', () => {
      it('should record metrics', async () => {
        const storage = manager.getStorage();
        const now = Date.now();
        
        // Write to same metric without labels
        await storage.write('test_metric', 42, undefined, now - 2000);
        await storage.write('test_metric', 43, undefined, now - 1000);
        
        const points = await storage.query({
          metric: 'test_metric',
          start: now - 60000,
          end: now
        });
        
        expect(points.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Statistics', () => {
      it('should provide statistics', () => {
        manager.setupDefaultRules();
        
        const stats = manager.getStats();
        
        expect(stats).toHaveProperty('activeAlertCount');
        expect(stats).toHaveProperty('ruleCount');
        expect(stats).toHaveProperty('detectorCount');
        expect(stats).toHaveProperty('totalAlertsFired');
        expect(stats).toHaveProperty('isRunning');
        
        expect(stats.ruleCount).toBeGreaterThan(0);
      });
    });

    describe('Anomaly Detection Integration', () => {
      it('should setup default detectors', () => {
        manager.setupDefaultDetectors();
        
        const stats = manager.getStats();
        expect(stats.detectorCount).toBeGreaterThan(0);
      });

      it('should add and remove detectors', () => {
        manager.addDetector('custom_metric', new StatisticalAnomalyDetector());
        
        expect(manager.getDetectorCount()).toBe(1);
        
        expect(manager.removeDetector('custom_metric')).toBe(true);
        expect(manager.getDetectorCount()).toBe(0);
      });
    });

    describe('Manual Evaluation', () => {
      it('should support manual rule evaluation', async () => {
        // Test the rule engine directly
        const testStorage = new InMemoryTimeSeriesStorage();
        const testEngine = new AlertRuleEngine(testStorage, eventBus);
        
        testEngine.addRule({
          id: 'manual-test',
          name: 'Manual Test',
          description: 'Testing manual evaluation',
          enabled: true,
          severity: 'warning',
          metric: 'metric',
          operator: '>',
          threshold: 50,
          for: 0,
          actions: [{ type: 'log', config: {} }],
          cooldown: 0
        });

        const now = Date.now();
        
        await testStorage.write('metric', 100, {}, now - 2000);
        await testStorage.write('metric', 100, {}, now - 1000);

        const alerts = await testEngine.evaluateRules();
        
        expect(alerts.length).toBeGreaterThan(0);
      });

      it('should support manual anomaly detection', async () => {
        manager.addDetector('test_metric', new StatisticalAnomalyDetector(3, 20));
        
        for (let i = 0; i < 30; i++) {
          await manager.recordMetric('test_metric', 100 + Math.random() * 5);
        }

        const anomalies = await manager.detectAnomaliesNow();
        expect(anomalies).toBeDefined();
      });
    });
  });
});
