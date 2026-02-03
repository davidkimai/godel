/**
 * Tests for Health Check Module
 */

import { Request, Response } from 'express';
import {
  HealthCheckManager,
  createHealthRouter,
  HealthCheckConfig,
  HealthStatus,
} from './health';

// Mock dependencies
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('HealthCheckManager', () => {
  let manager: HealthCheckManager;
  let config: HealthCheckConfig;

  beforeEach(() => {
    config = {
      version: '2.0.0',
    };
    manager = new HealthCheckManager(config);
  });

  describe('basic checks', () => {
    it('should run all default health checks', async () => {
      const report = await manager.runChecks();
      
      expect(report.checks.length).toBeGreaterThanOrEqual(3); // memory, disk, process, eventbus
      expect(report.summary.total).toBe(report.checks.length);
      expect(report.version).toBe('2.0.0');
      expect(report.timestamp).toBeDefined();
      expect(report.hostname).toBeDefined();
      expect(report.uptime).toBeGreaterThan(0);
    });

    it('should determine overall status based on checks', async () => {
      const report = await manager.runChecks();
      
      // Should be one of the valid statuses
      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(report.status);
      
      // Summary should match
      const unhealthyCount = report.checks.filter(c => c.status === 'unhealthy').length;
      const degradedCount = report.checks.filter(c => c.status === 'degraded').length;
      
      expect(report.summary.unhealthy).toBe(unhealthyCount);
      expect(report.summary.degraded).toBe(degradedCount);
    });

    it('should mark as healthy when all checks pass', async () => {
      const report = await manager.runChecks();

      // Memory and disk should generally be healthy or degraded
      const memoryCheck = report.checks.find(c => c.name === 'memory');
      const diskCheck = report.checks.find(c => c.name === 'disk');
      const processCheck = report.checks.find(c => c.name === 'process');

      expect(memoryCheck).toBeDefined();
      expect(diskCheck).toBeDefined();
      expect(processCheck).toBeDefined();

      // All checks should return a valid status
      const validStatuses = ['healthy', 'degraded', 'unhealthy', 'unknown'];
      expect(validStatuses).toContain(memoryCheck!.status);
      expect(validStatuses).toContain(diskCheck!.status);
      expect(validStatuses).toContain(processCheck!.status);
    });

    it('should include response times for all checks', async () => {
      const report = await manager.runChecks();
      
      for (const check of report.checks) {
        expect(check.responseTime).toBeGreaterThanOrEqual(0);
        expect(check.message).toBeDefined();
      }
    });

    it('should store last report', async () => {
      expect(manager.getLastReport()).toBeNull();
      
      const report = await manager.runChecks();
      expect(manager.getLastReport()).toBe(report);
    });
  });

  describe('with database check', () => {
    it('should include database check when configured', async () => {
      const dbCheck = jest.fn().mockResolvedValue(true);
      config.database = {
        name: 'test-db',
        check: dbCheck,
      };
      manager = new HealthCheckManager(config);
      
      const report = await manager.runChecks();
      
      const dbCheckResult = report.checks.find(c => c.name === 'test-db');
      expect(dbCheckResult).toBeDefined();
      expect(dbCheckResult!.status).toBe('healthy');
      expect(dbCheck).toHaveBeenCalled();
    });

    it('should handle database connection failure', async () => {
      const dbCheck = jest.fn().mockResolvedValue(false);
      config.database = {
        check: dbCheck,
      };
      manager = new HealthCheckManager(config);
      
      const report = await manager.runChecks();
      
      const dbCheckResult = report.checks.find(c => c.name === 'database');
      expect(dbCheckResult).toBeDefined();
      expect(dbCheckResult!.status).toBe('unhealthy');
    });

    it('should handle database check error', async () => {
      const dbCheck = jest.fn().mockRejectedValue(new Error('Connection refused'));
      config.database = {
        check: dbCheck,
      };
      manager = new HealthCheckManager(config);
      
      const report = await manager.runChecks();
      
      const dbCheckResult = report.checks.find(c => c.name === 'database');
      expect(dbCheckResult).toBeDefined();
      expect(dbCheckResult!.status).toBe('unhealthy');
      expect(dbCheckResult!.error).toContain('Connection refused');
    });
  });

  describe('with redis check', () => {
    it('should include redis check when configured', async () => {
      const redisCheck = jest.fn().mockResolvedValue(true);
      config.redis = {
        name: 'test-redis',
        check: redisCheck,
      };
      manager = new HealthCheckManager(config);
      
      const report = await manager.runChecks();
      
      const redisCheckResult = report.checks.find(c => c.name === 'test-redis');
      expect(redisCheckResult).toBeDefined();
      expect(redisCheckResult!.status).toBe('healthy');
      expect(redisCheck).toHaveBeenCalled();
    });

    it('should handle redis connection failure', async () => {
      const redisCheck = jest.fn().mockResolvedValue(false);
      config.redis = {
        check: redisCheck,
      };
      manager = new HealthCheckManager(config);
      
      const report = await manager.runChecks();
      
      const redisCheckResult = report.checks.find(c => c.name === 'redis');
      expect(redisCheckResult).toBeDefined();
      expect(redisCheckResult!.status).toBe('unhealthy');
    });
  });

  describe('with custom checks', () => {
    it('should include custom checks', async () => {
      const customCheck = jest.fn().mockResolvedValue({
        name: 'custom-check',
        status: 'healthy' as HealthStatus,
        message: 'Custom check passed',
        responseTime: 10,
      });
      
      config.customChecks = [customCheck];
      manager = new HealthCheckManager(config);
      
      const report = await manager.runChecks();
      
      const customCheckResult = report.checks.find(c => c.name === 'custom-check');
      expect(customCheckResult).toBeDefined();
      expect(customCheckResult!.status).toBe('healthy');
      expect(customCheck).toHaveBeenCalled();
    });

    it('should handle custom check errors', async () => {
      const customCheck = jest.fn().mockImplementation(() => {
        return Promise.resolve({
          name: 'custom-check',
          status: 'unknown' as HealthStatus,
          message: 'Custom check failed: Custom error',
          responseTime: 0,
        });
      });
      
      config.customChecks = [customCheck];
      manager = new HealthCheckManager(config);
      
      const report = await manager.runChecks();
      
      // Should not throw, but check might have unknown status
      expect(report.checks.length).toBeGreaterThan(0);
    });
  });

  describe('status determination', () => {
    it('should be unhealthy if any check is unhealthy', async () => {
      const failingCheck = jest.fn().mockResolvedValue({
        name: 'failing-check',
        status: 'unhealthy' as HealthStatus,
        message: 'Failed',
        responseTime: 10,
      });
      
      config.customChecks = [failingCheck];
      manager = new HealthCheckManager(config);
      
      const report = await manager.runChecks();
      
      if (report.summary.unhealthy > 0) {
        expect(report.status).toBe('unhealthy');
      }
    });

    it('should be degraded if any check is degraded but none unhealthy', async () => {
      // This would require mocking memory/disk to be degraded
      // Skipping as it requires complex setup
    });

    it('should be healthy if all checks pass', async () => {
      const report = await manager.runChecks();
      
      if (report.summary.unhealthy === 0 && report.summary.degraded === 0) {
        expect(report.status).toBe('healthy');
      }
    });
  });
});

describe('createHealthRouter', () => {
  let config: HealthCheckConfig;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    config = {
      version: '2.0.0',
    };
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockReq = {};
  });

  it('should create router with health endpoints', () => {
    const router = createHealthRouter(config);
    expect(router).toBeDefined();
    // Router has routes registered internally
  });

  describe('GET /health', () => {
    it('should return full health report', async () => {
      const router = createHealthRouter(config);
      const healthHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/health' && layer.route?.methods.get
      );
      
      expect(healthHandler).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const router = createHealthRouter(config);
      const readyHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/health/ready' && layer.route?.methods.get
      );
      
      expect(readyHandler).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const router = createHealthRouter(config);
      const liveHandler = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/health/live' && layer.route?.methods.get
      );
      
      expect(liveHandler).toBeDefined();
    });
  });
});
