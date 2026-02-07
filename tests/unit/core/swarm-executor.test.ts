import { TeamExecutor, teamExecutor } from '../../../src/core/team-executor';

describe('TeamExecutor', () => {
  describe('executeTeam', () => {
    it('should create execution context for valid swarm', async () => {
      const teamId = 'test-team-1';
      const agentIds = ['agent_1', 'agent_2', 'agent_3'];

      const context = await teamExecutor.executeTeam(teamId, agentIds);

      expect(context.teamId).toBe(teamId);
      expect(context.agentResults.size).toBe(3);
      expect(context.status).toBe('completed');
    });

    it('should track agent results', async () => {
      const teamId = 'test-team-2';
      const agentIds = ['agent_4', 'agent_5'];

      const context = await teamExecutor.executeTeam(teamId, agentIds);

      expect(context.agentResults.has('agent_4')).toBe(true);
      expect(context.agentResults.has('agent_5')).toBe(true);
    });

    it('should record cost on completion', async () => {
      const teamId = 'test-team-3';
      const agentIds = ['agent_6'];

      const context = await teamExecutor.executeTeam(teamId, agentIds);

      expect(context.totalCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cancelTeam', () => {
    it('should cancel running team', async () => {
      const teamId = 'test-team-cancel';
      const agentIds = ['agent_cancel'];

      // Execute first
      await teamExecutor.executeTeam(teamId, agentIds);

      // Cancel
      const result = await teamExecutor.cancelTeam(teamId);
      expect(result).toBe(true);
    });

    it('should return false for non-existent team', async () => {
      const result = await teamExecutor.cancelTeam('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getActiveTeams', () => {
    it('should return empty array when no teams running', () => {
      const activeTeams = teamExecutor.getActiveTeams();
      expect(Array.isArray(activeTeams)).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('should return execution metrics', () => {
      const metrics = teamExecutor.getMetrics();

      expect(metrics).toHaveProperty('teamsCompleted');
      expect(metrics).toHaveProperty('teamsFailed');
      expect(metrics).toHaveProperty('totalAgentsExecuted');
      expect(metrics).toHaveProperty('totalCost');
      expect(metrics).toHaveProperty('successRate');
    });

    it('should have valid success rate (0-1)', () => {
      const metrics = teamExecutor.getMetrics();
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status', () => {
      const status = teamExecutor.getQueueStatus();

      expect(status).toHaveProperty('queued');
      expect(status).toHaveProperty('processing');
      expect(typeof status.queued).toBe('number');
      expect(typeof status.processing).toBe('boolean');
    });
  });

  describe('scaleTeam', () => {
    it('should return false for non-existent swarm', async () => {
      const result = await teamExecutor.scaleTeam('non-existent', 5);
      expect(result).toBe(false);
    });
  });

  describe('getContext', () => {
    it('should return undefined for non-existent team', () => {
      const context = teamExecutor.getContext('non-existent');
      expect(context).toBeUndefined();
    });
  });
});
