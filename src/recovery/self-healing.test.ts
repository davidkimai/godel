/**
 * Self-Healing Controller Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SelfHealingController, AgentRecoveryHandler } from './self-healing';

// Mock postgres pool
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
};

vi.mock('../storage/postgres/pool', () => ({
  getPool: vi.fn(() => Promise.resolve(mockPool)),
}));

describe('SelfHealingController', () => {
  let controller: SelfHealingController;
  let mockHandler: AgentRecoveryHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });

    controller = new SelfHealingController({
      enabled: true,
      checkIntervalMs: 1000,
      maxRetries: 3,
      retryDelayMs: 100,
      useCheckpoints: false,
      enableEscalation: true,
    });

    mockHandler = {
      getAgentId: vi.fn().mockReturnValue('agent-123'),
      getSwarmId: vi.fn().mockReturnValue('swarm-456'),
      isHealthy: vi.fn().mockResolvedValue(true),
      restart: vi.fn().mockResolvedValue(true),
      restoreFromCheckpoint: vi.fn().mockResolvedValue(true),
      getAgentState: vi.fn().mockResolvedValue({ status: 'running' }),
      getStatus: vi.fn().mockReturnValue('running'),
    };

    await controller.initialize();
  });

  afterEach(async () => {
    await controller.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS recovery_attempts'));
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS escalation_events'));
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS failed_agents'));
    });

    it('should emit initialized event', async () => {
      const newController = new SelfHealingController();
      const listener = vi.fn();
      newController.on('initialized', listener);

      await newController.initialize();

      expect(listener).toHaveBeenCalled();
      await newController.shutdown();
    });
  });

  describe('agent registration', () => {
    it('should register an agent', () => {
      controller.registerAgent(mockHandler);

      expect(controller.getRegisteredAgents()).toContain('agent-123');
    });

    it('should unregister an agent', () => {
      controller.registerAgent(mockHandler);
      controller.unregisterAgent('agent-123');

      expect(controller.getRegisteredAgents()).not.toContain('agent-123');
    });

    it('should emit agent.registered event', () => {
      const listener = vi.fn();
      controller.on('agent.registered', listener);

      controller.registerAgent(mockHandler);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-123',
        swarmId: 'swarm-456',
      }));
    });
  });

  describe('health checks', () => {
    beforeEach(() => {
      controller.registerAgent(mockHandler);
    });

    it('should start health checks', () => {
      controller.start();
      
      expect(controller.isStarted()).toBe(true);
    });

    it('should stop health checks', () => {
      controller.start();
      controller.stop();
      
      expect(controller.isStarted()).toBe(false);
    });
  });

  describe('failure detection', () => {
    beforeEach(() => {
      controller.registerAgent(mockHandler);
    });

    it('should detect unhealthy agents', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);

      const listener = vi.fn();
      controller.on('agent.failed', listener);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-123',
        swarmId: 'swarm-456',
      }));
    });

    it('should emit failure event with detection source', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(true);

      const listener = vi.fn();
      controller.on('agent.failed', listener);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for async recovery
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        detectionSource: 'manual',
      }));
    });

    it('should persist failure to database', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO failed_agents'),
        expect.arrayContaining(['agent-123'])
      );
    });
  });

  describe('recovery', () => {
    beforeEach(() => {
      controller.registerAgent(mockHandler);
    });

    it('should attempt restart on failure', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(true);

      const listener = vi.fn();
      controller.on('recovery.started', listener);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for async recovery
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockHandler.restart).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-123',
        attempt: 1,
      }));
    });

    it('should emit recovery.success on successful restart', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(true);

      const listener = vi.fn();
      controller.on('recovery.success', listener);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for async recovery
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-123',
        strategy: 'restart',
      }));
    });

    it('should retry on failed recovery', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(mockHandler.restart).toHaveBeenCalledTimes(2);
    });

    it('should emit recovery.failed on failed recovery', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(false);

      const listener = vi.fn();
      controller.on('recovery.failed', listener);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for async recovery
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-123',
      }));
    });

    it('should persist recovery attempt', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(true);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for async recovery
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO recovery_attempts'),
        expect.arrayContaining(['agent-123', 1, 'restart', true])
      );
    });
  });

  describe('escalation', () => {
    beforeEach(() => {
      controller.registerAgent(mockHandler);
    });

    it('should escalate after max retries', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(false);

      const listener = vi.fn();
      controller.on('escalation', listener);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for all retries to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-123',
        swarmId: 'swarm-456',
        reason: 'max_retries_exceeded',
      }));
    });

    it('should persist escalation', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(false);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for all retries to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO escalation_events'),
        expect.arrayContaining(['agent-123', 'max_retries_exceeded'])
      );
    });

    it('should allow marking escalation as handled', async () => {
      await controller.markEscalationHandled('agent-123', 'admin', 'replaced');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE escalation_events'),
        expect.arrayContaining(['admin', expect.any(String), 'agent-123'])
      );
    });

    it('should get escalated agents', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(false);

      await controller.reportFailure('agent-123', 'test failure', 'manual');

      // Wait for escalation
      await new Promise(resolve => setTimeout(resolve, 1000));

      const escalated = controller.getEscalatedAgents();
      expect(escalated).toContain('agent-123');
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      controller.registerAgent(mockHandler);
      controller.registerAgent({
        ...mockHandler,
        getAgentId: vi.fn().mockReturnValue('agent-456'),
      });
    });

    it('should return healing stats', () => {
      const stats = controller.getStats();

      expect(stats.totalAgentsMonitored).toBe(2);
      expect(stats.healthyAgents).toBe(2);
    });

    it('should return healing metrics', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(true);

      await controller.reportFailure('agent-123', 'test failure', 'manual');
      await new Promise(resolve => setTimeout(resolve, 200));

      const metrics = controller.getMetrics();

      expect(metrics.recoveryTimeMs).toBeGreaterThanOrEqual(0);
      expect(metrics.fromCheckpoint).toBe(false);
    });

    it('should track recovery attempts per agent', async () => {
      mockHandler.isHealthy = vi.fn().mockResolvedValue(false);
      mockHandler.restart = vi.fn().mockResolvedValue(true);

      await controller.reportFailure('agent-123', 'test failure', 'manual');
      await new Promise(resolve => setTimeout(resolve, 200));

      const attempts = controller.getRecoveryAttempts('agent-123');
      expect(attempts).toHaveLength(1);
      expect(attempts[0].agentId).toBe('agent-123');
    });
  });

  describe('circuit breaker integration', () => {
    it('should provide circuit breaker registry', () => {
      const registry = controller.getCircuitBreakerRegistry();
      
      expect(registry).toBeDefined();
    });

    it('should create circuit breaker per agent', () => {
      const breaker = controller.getCircuitBreaker('agent-123');
      
      expect(breaker).toBeDefined();
      expect(breaker?.getName()).toBe('recovery-agent-123');
    });
  });

  describe('queries', () => {
    it('should get recent recoveries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_id: 'agent-123',
            attempt_number: 1,
            strategy: 'restart',
            success: true,
            duration_ms: 100,
            timestamp: new Date(),
          },
        ],
      });

      const recoveries = await controller.getRecentRecoveries(10);

      expect(recoveries).toHaveLength(1);
      expect(recoveries[0].agentId).toBe('agent-123');
    });

    it('should get recent escalations', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_id: 'agent-123',
            swarm_id: 'swarm-456',
            reason: 'max_retries_exceeded',
            retry_count: 3,
            suggested_action: 'manual_review',
            timestamp: new Date(),
          },
        ],
      });

      const escalations = await controller.getRecentEscalations(10);

      expect(escalations).toHaveLength(1);
      expect(escalations[0].agentId).toBe('agent-123');
    });

    it('should get unhandled escalations', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_id: 'agent-123',
            reason: 'max_retries_exceeded',
            retry_count: 3,
            suggested_action: 'manual_review',
            timestamp: new Date(),
          },
        ],
      });

      const escalations = await controller.getUnhandledEscalations();

      expect(escalations).toHaveLength(1);
    });
  });
});
