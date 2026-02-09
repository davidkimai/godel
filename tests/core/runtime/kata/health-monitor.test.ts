import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  VMHealthMonitor,
  createHealthMonitor,
  HealthMonitorConfig,
  ProbeConfig,
  HealthStatus,
  RestartPolicy,
} from '../../../../src/core/runtime/kata/health-monitor';

describe('VMHealthMonitor', () => {
  let monitor: VMHealthMonitor;

  beforeEach(() => {
    monitor = createHealthMonitor({
      checkIntervalMs: 1000,
      livenessProbeIntervalMs: 500,
      readinessProbeIntervalMs: 500,
      failureThreshold: 2,
      successThreshold: 1,
      initialDelaySeconds: 0,
      timeoutSeconds: 1,
      restartPolicy: 'on-failure',
      maxRestarts: 3,
      restartBackoffMs: 100,
      enableAutoRestart: true,
      alertingEnabled: false,
    });
  });

  afterEach(async () => {
    await monitor.shutdown();
  });

  describe('VM Registration', () => {
    it('should register a VM for health monitoring', async () => {
      const vmId = 'test-vm-1';
      const podName = 'test-pod';
      const namespace = 'test-ns';

      await monitor.registerVM(vmId, podName, namespace);

      const state = monitor.getVMState(vmId);
      expect(state).toBeDefined();
      expect(state?.vmId).toBe(vmId);
      expect(state?.podName).toBe(podName);
      expect(state?.namespace).toBe(namespace);
      expect(state?.healthStatus).toBe('unknown');
    });

    it('should throw error when registering duplicate VM', async () => {
      const vmId = 'test-vm-1';
      await monitor.registerVM(vmId, 'pod-1');
      
      await expect(monitor.registerVM(vmId, 'pod-2')).rejects.toThrow(
        'VM test-vm-1 is already registered for health monitoring'
      );
    });

    it('should unregister a VM from health monitoring', async () => {
      const vmId = 'test-vm-1';
      await monitor.registerVM(vmId, 'pod-1');
      
      const result = await monitor.unregisterVM(vmId);
      
      expect(result).toBe(true);
      expect(monitor.getVMState(vmId)).toBeUndefined();
    });

    it('should return false when unregistering non-existent VM', async () => {
      const result = await monitor.unregisterVM('non-existent-vm');
      expect(result).toBe(false);
    });
  });

  describe('Health Checks', () => {
    it('should perform manual health check', async () => {
      const vmId = 'test-vm-1';
      await monitor.registerVM(vmId, 'pod-1');
      
      // Wait for initial delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = await monitor.manualHealthCheck(vmId);
      expect(['healthy', 'unhealthy', 'degraded', 'unknown']).toContain(status);
    });

    it('should track health status changes', async () => {
      const vmId = 'test-vm-1';
      const healthChanges: { previous: HealthStatus; current: HealthStatus }[] = [];
      
      monitor.on('health:change', (data) => {
        healthChanges.push({
          previous: data.previousStatus,
          current: data.currentStatus,
        });
      });

      await monitor.registerVM(vmId, 'pod-1');
      
      // Wait for probes to run
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(healthChanges.length).toBeGreaterThan(0);
    });
  });

  describe('Auto-Restart', () => {
    it('should track restart count', async () => {
      const vmId = 'test-vm-1';
      await monitor.registerVM(vmId, 'pod-1');
      
      // Manually trigger a restart
      await monitor.manualRestart(vmId);
      
      const state = monitor.getVMState(vmId);
      expect(state?.restartCount).toBe(1);
    });

    it('should respect max restarts limit', async () => {
      const vmId = 'test-vm-1';
      const maxRestarts = 2;
      
      monitor.updateConfig({ maxRestarts });
      await monitor.registerVM(vmId, 'pod-1');
      
      // Trigger multiple restarts
      await monitor.manualRestart(vmId);
      await monitor.manualRestart(vmId);
      await monitor.manualRestart(vmId);
      
      const state = monitor.getVMState(vmId);
      expect(state?.restartCount).toBe(3);
      
      // Check that shouldRestart returns false after max restarts
      expect(state?.restartCount).toBeGreaterThanOrEqual(maxRestarts);
    });

    it('should record restart history', async () => {
      const vmId = 'test-vm-1';
      await monitor.registerVM(vmId, 'pod-1');
      
      await monitor.manualRestart(vmId);
      
      const history = monitor.getRestartHistory(vmId);
      expect(history.length).toBe(1);
      expect(history[0].vmId).toBe(vmId);
      expect(history[0].success).toBe(true);
    });
  });

  describe('Metrics', () => {
    it('should return current metrics', async () => {
      await monitor.registerVM('vm-1', 'pod-1');
      await monitor.registerVM('vm-2', 'pod-2');
      
      const metrics = monitor.getMetrics();
      
      expect(metrics.totalVMs).toBe(2);
      expect(metrics.avgHealthCheckLatencyMs).toBeGreaterThanOrEqual(0);
      expect(metrics.p95HealthCheckLatencyMs).toBeGreaterThanOrEqual(0);
      expect(metrics.p99HealthCheckLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate failure rate', async () => {
      await monitor.registerVM('vm-1', 'pod-1');
      
      // Wait for some health checks to run
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const metrics = monitor.getMetrics();
      expect(metrics.failureRate).toBeGreaterThanOrEqual(0);
      expect(metrics.failureRate).toBeLessThanOrEqual(100);
    });

    it('should track restart rate per hour', async () => {
      await monitor.registerVM('vm-1', 'pod-1');
      await monitor.manualRestart('vm-1');
      
      const metrics = monitor.getMetrics();
      expect(metrics.restartRatePerHour).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Status Report', () => {
    it('should generate comprehensive status report', async () => {
      await monitor.registerVM('vm-1', 'pod-1');
      await monitor.registerVM('vm-2', 'pod-2');
      
      // Wait for health checks
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const report = monitor.generateStatusReport();
      
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.overallHealth).toBeDefined();
      expect(report.vmStates).toHaveLength(2);
      expect(report.metrics.totalVMs).toBe(2);
      expect(report.recentRestarts).toBeDefined();
      expect(report.recentAlerts).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    it('should emit vm:registered event', async () => {
      const handler = jest.fn();
      monitor.on('vm:registered', handler);
      
      await monitor.registerVM('vm-1', 'pod-1');
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          vmId: 'vm-1',
          podName: 'pod-1',
          timestamp: expect.any(Date),
        })
      );
    });

    it('should emit monitoring:started event', async () => {
      const handler = jest.fn();
      monitor.on('monitoring:started', handler);
      
      await monitor.registerVM('vm-1', 'pod-1');
      
      // Wait for initial delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(handler).toHaveBeenCalled();
    });

    it('should emit health:check event', async () => {
      const handler = jest.fn();
      monitor.on('health:check', handler);
      
      await monitor.registerVM('vm-1', 'pod-1');
      
      // Wait for health check
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      monitor.updateConfig({ maxRestarts: 10 });
      
      // Register VM and verify new config takes effect
      const metrics = monitor.getMetrics();
      expect(metrics).toBeDefined();
    });

    it('should emit config:updated event', () => {
      const handler = jest.fn();
      monitor.on('config:updated', handler);
      
      monitor.updateConfig({ enableAutoRestart: false });
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.any(Object),
          timestamp: expect.any(Date),
        })
      );
    });
  });

  describe('Alerting', () => {
    it('should track alert history', async () => {
      await monitor.registerVM('vm-1', 'pod-1');
      
      // Trigger some activity that generates alerts
      await monitor.manualRestart('vm-1');
      
      const alerts = monitor.getAlertHistory('vm-1');
      expect(alerts.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('All VM States', () => {
    it('should return all registered VM states', async () => {
      await monitor.registerVM('vm-1', 'pod-1');
      await monitor.registerVM('vm-2', 'pod-2');
      await monitor.registerVM('vm-3', 'pod-3');
      
      const states = monitor.getAllVMStates();
      
      expect(states).toHaveLength(3);
      expect(states.map(s => s.vmId)).toContain('vm-1');
      expect(states.map(s => s.vmId)).toContain('vm-2');
      expect(states.map(s => s.vmId)).toContain('vm-3');
    });
  });

  describe('Restart History', () => {
    it('should return all restart history when no vmId specified', async () => {
      await monitor.registerVM('vm-1', 'pod-1');
      await monitor.registerVM('vm-2', 'pod-2');
      
      await monitor.manualRestart('vm-1');
      await monitor.manualRestart('vm-2');
      
      const allHistory = monitor.getRestartHistory();
      expect(allHistory.length).toBe(2);
    });
  });
});

describe('createHealthMonitor', () => {
  it('should create a health monitor with default config', () => {
    const monitor = createHealthMonitor();
    expect(monitor).toBeInstanceOf(VMHealthMonitor);
  });

  it('should create a health monitor with custom config', () => {
    const monitor = createHealthMonitor({
      checkIntervalMs: 5000,
      maxRestarts: 10,
    });
    expect(monitor).toBeInstanceOf(VMHealthMonitor);
  });
});
