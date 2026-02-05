/**
 * Checkpoint System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CheckpointManager, CheckpointProvider } from './checkpoint';

// Mock the postgres pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
};

jest.mock('../storage/postgres/pool', () => ({
  getPool: jest.fn(() => Promise.resolve(mockPool)),
}));

describe('CheckpointManager', () => {
  let manager: CheckpointManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    
    manager = new CheckpointManager({
      enabled: true,
      intervalMs: 1000,
      maxCheckpointsPerEntity: 5,
      maxAgeHours: 24,
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await manager.initialize();
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS checkpoints'));
    });

    it('should create required indexes', async () => {
      await manager.initialize();
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_checkpoints_entity'));
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_checkpoints_type'));
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp'));
    });
  });

  describe('checkpoint creation', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should create a checkpoint', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const checkpoint = await manager.createCheckpoint(
        'agent',
        'agent-123',
        { status: 'running', task: 'test' },
        { version: 1 }
      );

      expect(checkpoint.entityType).toBe('agent');
      expect(checkpoint.entityId).toBe('agent-123');
      expect(checkpoint.data).toEqual({ status: 'running', task: 'test' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO checkpoints'),
        expect.arrayContaining(['agent', 'agent-123'])
      );
    });

    it('should generate unique checkpoint IDs', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const checkpoint1 = await manager.createCheckpoint('agent', 'agent-123', { v: 1 });
      const checkpoint2 = await manager.createCheckpoint('agent', 'agent-123', { v: 2 });

      expect(checkpoint1.id).not.toBe(checkpoint2.id);
    });

    it('should emit checkpoint.created event', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const listener = jest.fn();
      manager.on('checkpoint.created', listener);

      await manager.createCheckpoint('agent', 'agent-123', { status: 'running' });

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'agent',
        entityId: 'agent-123',
      }));
    });
  });

  describe('checkpoint retrieval', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should get latest checkpoint', async () => {
      const timestamp = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          checkpoint_id: 'chk_123',
          entity_type: 'agent',
          entity_id: 'agent-123',
          timestamp,
          data: JSON.stringify({ status: 'running' }),
          metadata: JSON.stringify({ version: 1 }),
        }],
      });

      const checkpoint = await manager.getLatestCheckpoint('agent-123');

      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.id).toBe('chk_123');
      expect(checkpoint?.data).toEqual({ status: 'running' });
    });

    it('should return null when no checkpoint exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const checkpoint = await manager.getLatestCheckpoint('agent-123');

      expect(checkpoint).toBeNull();
    });

    it('should get all checkpoints for an entity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            checkpoint_id: 'chk_2',
            entity_type: 'agent',
            entity_id: 'agent-123',
            timestamp: new Date().toISOString(),
            data: '{}',
            metadata: '{}',
          },
          {
            checkpoint_id: 'chk_1',
            entity_type: 'agent',
            entity_id: 'agent-123',
            timestamp: new Date(Date.now() - 1000).toISOString(),
            data: '{}',
            metadata: '{}',
          },
        ],
      });

      const checkpoints = await manager.getCheckpointsForEntity('agent-123');

      expect(checkpoints).toHaveLength(2);
      expect(checkpoints[0].id).toBe('chk_2'); // Most recent first
    });
  });

  describe('checkpoint providers', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should register a provider', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const provider: CheckpointProvider = {
        getCheckpointData: jest.fn(() => Promise.resolve({ status: 'running' })),
        restoreFromCheckpoint: jest.fn(() => Promise.resolve(true)),
        getEntityId: () => 'agent-123',
        getEntityType: () => 'agent',
      };

      manager.registerProvider(provider);

      expect(provider.getCheckpointData).toHaveBeenCalled();
    });

    it('should unregister a provider', () => {
      const provider: CheckpointProvider = {
        getCheckpointData: jest.fn(() => Promise.resolve({})),
        restoreFromCheckpoint: jest.fn(() => Promise.resolve(true)),
        getEntityId: () => 'agent-123',
        getEntityType: () => 'agent',
      };

      manager.registerProvider(provider);
      manager.unregisterProvider('agent-123');

      // Should not throw and provider should be removed
      expect(manager.getConfig().enabled).toBe(true);
    });
  });

  describe('restore operations', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should restore from latest checkpoint', async () => {
      const timestamp = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          checkpoint_id: 'chk_123',
          entity_type: 'agent',
          entity_id: 'agent-123',
          timestamp,
          data: JSON.stringify({ status: 'running', task: 'test' }),
          metadata: JSON.stringify({ version: 1 }),
        }],
      });

      const provider: CheckpointProvider = {
        getCheckpointData: jest.fn(() => Promise.resolve({})),
        restoreFromCheckpoint: jest.fn(() => Promise.resolve(true)),
        getEntityId: () => 'agent-123',
        getEntityType: () => 'agent',
      };

      manager.registerProvider(provider);

      const result = await manager.restoreFromLatestCheckpoint('agent-123');

      expect(result.success).toBe(true);
      expect(provider.restoreFromCheckpoint).toHaveBeenCalledWith({ status: 'running', task: 'test' });
    });

    it('should return failure when no checkpoint exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await manager.restoreFromLatestCheckpoint('agent-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No checkpoint found');
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should delete old checkpoints', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      const deleted = await manager.cleanup(24);

      expect(deleted).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM checkpoints WHERE timestamp <'),
        expect.any(Array)
      );
    });

    it('should delete all checkpoints for an entity', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });

      const deleted = await manager.deleteEntityCheckpoints('agent-123');

      expect(deleted).toBe(3);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should return checkpoint stats', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ entity_type: 'agent', count: '8' }, { entity_type: 'swarm', count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ timestamp: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [{ timestamp: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [{ size: '1024000' }] });

      const stats = await manager.getStats();

      expect(stats.totalCheckpoints).toBe(10);
      expect(stats.checkpointsByType['agent']).toBe(8);
      expect(stats.checkpointsByType['swarm']).toBe(2);
      expect(stats.storageSizeBytes).toBe(1024000);
    });
  });
});
