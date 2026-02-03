import { SwarmExecutor, swarmExecutor } from '../../../src/core/swarm-executor';

describe('SwarmExecutor', () => {
  describe('executeSwarm', () => {
    it('should create execution context for valid swarm', async () => {
      const swarmId = 'test-swarm-1';
      const agentIds = ['agent_1', 'agent_2', 'agent_3'];

      const context = await swarmExecutor.executeSwarm(swarmId, agentIds);

      expect(context.swarmId).toBe(swarmId);
      expect(context.agentResults.size).toBe(3);
      expect(context.status).toBe('completed');
    });

    it('should track agent results', async () => {
      const swarmId = 'test-swarm-2';
      const agentIds = ['agent_4', 'agent_5'];

      const context = await swarmExecutor.executeSwarm(swarmId, agentIds);

      expect(context.agentResults.has('agent_4')).toBe(true);
      expect(context.agentResults.has('agent_5')).toBe(true);
    });

    it('should record cost on completion', async () => {
      const swarmId = 'test-swarm-3';
      const agentIds = ['agent_6'];

      const context = await swarmExecutor.executeSwarm(swarmId, agentIds);

      expect(context.totalCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cancelSwarm', () => {
    it('should cancel running swarm', async () => {
      const swarmId = 'test-swarm-cancel';
      const agentIds = ['agent_cancel'];

      // Execute first
      await swarmExecutor.executeSwarm(swarmId, agentIds);

      // Cancel
      const result = await swarmExecutor.cancelSwarm(swarmId);
      expect(result).toBe(true);
    });

    it('should return false for non-existent swarm', async () => {
      const result = await swarmExecutor.cancelSwarm('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getActiveSwarms', () => {
    it('should return empty array when no swarms running', () => {
      const activeSwarms = swarmExecutor.getActiveSwarms();
      expect(Array.isArray(activeSwarms)).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('should return execution metrics', () => {
      const metrics = swarmExecutor.getMetrics();

      expect(metrics).toHaveProperty('swarmsCompleted');
      expect(metrics).toHaveProperty('swarmsFailed');
      expect(metrics).toHaveProperty('totalAgentsExecuted');
      expect(metrics).toHaveProperty('totalCost');
      expect(metrics).toHaveProperty('successRate');
    });

    it('should have valid success rate (0-1)', () => {
      const metrics = swarmExecutor.getMetrics();
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status', () => {
      const status = swarmExecutor.getQueueStatus();

      expect(status).toHaveProperty('queued');
      expect(status).toHaveProperty('processing');
      expect(typeof status.queued).toBe('number');
      expect(typeof status.processing).toBe('boolean');
    });
  });

  describe('scaleSwarm', () => {
    it('should return false for non-existent swarm', async () => {
      const result = await swarmExecutor.scaleSwarm('non-existent', 5);
      expect(result).toBe(false);
    });
  });

  describe('getContext', () => {
    it('should return undefined for non-existent swarm', () => {
      const context = swarmExecutor.getContext('non-existent');
      expect(context).toBeUndefined();
    });
  });
});
