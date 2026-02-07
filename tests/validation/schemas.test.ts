/**
 * Schema Validation Tests
 *
 * Tests for all Zod schemas in the validation module
 */

import { z } from 'zod';
import {
  idSchema,
  uuidArraySchema,
  paginationSchema,
  dateRangeSchema,
  spawnAgentSchema,
  updateAgentSchema,
  agentActionSchema,
  agentQuerySchema,
  createSwarmSchema,
  updateSwarmSchema,
  swarmActionSchema,
  setBudgetSchema,
} from '../../src/validation/schemas';

describe('Schema Validation', () => {
  describe('idSchema', () => {
    it('should accept valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => idSchema.parse(validUuid)).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      const invalidUuids = [
        'not-a-uuid',
        '12345',
        '550e8400-e29b-41d4-a716', // truncated
        '',
      ];

      invalidUuids.forEach((uuid) => {
        expect(() => idSchema.parse(uuid)).toThrow();
      });
    });
  });

  describe('uuidArraySchema', () => {
    it('should accept array of valid UUIDs', () => {
      const uuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ];
      expect(() => uuidArraySchema.parse(uuids)).not.toThrow();
    });

    it('should reject empty array', () => {
      expect(() => uuidArraySchema.parse([])).toThrow();
    });

    it('should reject array with invalid UUID', () => {
      const uuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        'invalid-uuid',
      ];
      expect(() => uuidArraySchema.parse(uuids)).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('should use default values', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(20);
    });

    it('should accept valid pagination', () => {
      const result = paginationSchema.parse({ page: 2, perPage: 50 });
      expect(result.page).toBe(2);
      expect(result.perPage).toBe(50);
    });

    it('should coerce string values', () => {
      const result = paginationSchema.parse({ page: '3', perPage: '25' });
      expect(result.page).toBe(3);
      expect(result.perPage).toBe(25);
    });

    it('should reject page < 1', () => {
      expect(() => paginationSchema.parse({ page: 0 })).toThrow();
      expect(() => paginationSchema.parse({ page: -1 })).toThrow();
    });

    it('should reject perPage > 100', () => {
      expect(() => paginationSchema.parse({ perPage: 101 })).toThrow();
    });
  });

  describe('dateRangeSchema', () => {
    it('should accept valid date range', () => {
      const result = dateRangeSchema.parse({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });
      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });

    it('should coerce string dates', () => {
      const result = dateRangeSchema.parse({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(result.startDate).toBeInstanceOf(Date);
    });

    it('should reject endDate before startDate', () => {
      expect(() =>
        dateRangeSchema.parse({
          startDate: '2024-12-31',
          endDate: '2024-01-01',
        })
      ).toThrow('startDate must be before or equal to endDate');
    });

    it('should allow partial date range', () => {
      expect(() =>
        dateRangeSchema.parse({ startDate: '2024-01-01' })
      ).not.toThrow();
      expect(() =>
        dateRangeSchema.parse({ endDate: '2024-12-31' })
      ).not.toThrow();
    });
  });

  describe('spawnAgentSchema', () => {
    it('should accept valid spawn request', () => {
      const data = {
        task: 'Implement feature',
        model: 'kimi-k2.5',
        priority: 'high',
      };
      expect(() => spawnAgentSchema.parse(data)).not.toThrow();
    });

    it('should use default priority', () => {
      const data = { task: 'Test task', model: 'gpt-4' };
      const result = spawnAgentSchema.parse(data);
      expect(result.priority).toBe('medium');
    });

    it('should accept all valid models', () => {
      const models = ['kimi-k2.5', 'claude-sonnet-4-5', 'gpt-4', 'gpt-4o'];
      models.forEach((model) => {
        const data = { task: 'Test', model };
        expect(() => spawnAgentSchema.parse(data)).not.toThrow();
      });
    });

    it('should reject invalid model', () => {
      const data = { task: 'Test', model: 'invalid-model' };
      expect(() => spawnAgentSchema.parse(data)).toThrow();
    });

    it('should reject empty task', () => {
      const data = { task: '', model: 'gpt-4' };
      expect(() => spawnAgentSchema.parse(data)).toThrow();
    });

    it('should reject task > 1000 chars', () => {
      const data = { task: 'a'.repeat(1001), model: 'gpt-4' };
      expect(() => spawnAgentSchema.parse(data)).toThrow();
    });

    it('should accept optional metadata', () => {
      const data = {
        task: 'Test',
        model: 'gpt-4',
        metadata: { key: 'value', number: 123 },
      };
      const result = spawnAgentSchema.parse(data);
      expect(result.metadata).toEqual(data.metadata);
    });

    it('should accept parentId and swarmId', () => {
      const data = {
        task: 'Test',
        model: 'gpt-4',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        swarmId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      };
      expect(() => spawnAgentSchema.parse(data)).not.toThrow();
    });
  });

  describe('updateAgentSchema', () => {
    it('should accept valid status update', () => {
      const data = { status: 'running', progress: 50 };
      expect(() => updateAgentSchema.parse(data)).not.toThrow();
    });

    it('should accept all valid statuses', () => {
      const statuses = ['idle', 'spawning', 'running', 'paused', 'completed', 'failed', 'killing'];
      statuses.forEach((status) => {
        expect(() => updateAgentSchema.parse({ status })).not.toThrow();
      });
    });

    it('should accept progress 0-100', () => {
      expect(() => updateAgentSchema.parse({ progress: 0 })).not.toThrow();
      expect(() => updateAgentSchema.parse({ progress: 50 })).not.toThrow();
      expect(() => updateAgentSchema.parse({ progress: 100 })).not.toThrow();
    });

    it('should reject progress > 100', () => {
      expect(() => updateAgentSchema.parse({ progress: 101 })).toThrow();
    });

    it('should reject progress < 0', () => {
      expect(() => updateAgentSchema.parse({ progress: -1 })).toThrow();
    });

    it('should reject both result and error', () => {
      const data = {
        result: 'success',
        error: 'failed',
      };
      expect(() => updateAgentSchema.parse(data)).toThrow();
    });

    it('should reject completed with progress < 100', () => {
      const data = { status: 'completed', progress: 99 };
      expect(() => updateAgentSchema.parse(data)).toThrow();
    });

    it('should allow empty update', () => {
      expect(() => updateAgentSchema.parse({})).not.toThrow();
    });
  });

  describe('agentActionSchema', () => {
    it('should accept valid actions', () => {
      // These actions don't have extra requirements
      const actions = ['resume', 'retry'];
      actions.forEach((action) => {
        expect(() => agentActionSchema.parse({ action })).not.toThrow();
      });
    });

    it('should require reason for kill without force', () => {
      expect(() => agentActionSchema.parse({ action: 'kill' })).toThrow();
      expect(() =>
        agentActionSchema.parse({ action: 'kill', reason: 'Test' })
      ).not.toThrow();
    });

    it('should allow kill without reason if force=true', () => {
      expect(() =>
        agentActionSchema.parse({ action: 'kill', force: true })
      ).not.toThrow();
    });

    it('should require reason for pause without force', () => {
      expect(() => agentActionSchema.parse({ action: 'pause' })).toThrow();
      expect(() =>
        agentActionSchema.parse({ action: 'pause', reason: 'Maintenance' })
      ).not.toThrow();
    });

    it('should accept delay for retry action', () => {
      expect(() =>
        agentActionSchema.parse({ action: 'retry', delay: 30 })
      ).not.toThrow();
    });

    it('should accept delay for scale action', () => {
      expect(() =>
        agentActionSchema.parse({ action: 'scale', delay: 60 })
      ).not.toThrow();
    });

    it('should reject delay for kill action', () => {
      expect(() =>
        agentActionSchema.parse({ action: 'kill', reason: 'test', delay: 30 })
      ).toThrow();
    });

    it('should use default force=false', () => {
      const result = agentActionSchema.parse({
        action: 'resume',
      });
      expect(result.force).toBe(false);
    });

    it('should accept all valid action types', () => {
      const actions = ['kill', 'pause', 'resume', 'retry', 'scale'];
      actions.forEach((action) => {
        const data: any = { action };
        if (action === 'kill' || action === 'pause') {
          data.reason = 'Test reason';
        }
        expect(() => agentActionSchema.parse(data)).not.toThrow();
      });
    });
  });

  describe('createSwarmSchema', () => {
    it('should accept valid swarm creation', () => {
      const data = {
        name: 'test-swarm',
        agents: 5,
        strategy: 'parallel',
      };
      expect(() => createSwarmSchema.parse(data)).not.toThrow();
    });

    it('should use default strategy', () => {
      const data = { name: 'test', agents: 3 };
      const result = createSwarmSchema.parse(data);
      expect(result.strategy).toBe('parallel');
    });

    it('should reject invalid name characters', () => {
      const invalidNames = ['test swarm', 'test@swarm', 'test.swarm'];
      invalidNames.forEach((name) => {
        expect(() =>
          createSwarmSchema.parse({ name, agents: 3 })
        ).toThrow();
      });
    });

    it('should accept valid name characters', () => {
      const validNames = ['test-swarm', 'test_swarm', 'TestSwarm123'];
      validNames.forEach((name) => {
        expect(() =>
          createSwarmSchema.parse({ name, agents: 3 })
        ).not.toThrow();
      });
    });

    it('should reject agents < 1', () => {
      expect(() =>
        createSwarmSchema.parse({ name: 'test', agents: 0 })
      ).toThrow();
    });

    it('should reject agents > 100', () => {
      expect(() =>
        createSwarmSchema.parse({ name: 'test', agents: 101 })
      ).toThrow();
    });

    it('should require race strategy to have at least 2 agents', () => {
      expect(() =>
        createSwarmSchema.parse({ name: 'test', agents: 1, strategy: 'race' })
      ).toThrow('2+ agents');
    });

    it('should require map-reduce strategy to have at least 3 agents', () => {
      expect(() =>
        createSwarmSchema.parse({ name: 'test', agents: 2, strategy: 'map-reduce' })
      ).toThrow('3+ agents');
    });

    it('should accept all valid strategies', () => {
      const strategies = [
        { strategy: 'parallel', agents: 1 },
        { strategy: 'map-reduce', agents: 3 },
        { strategy: 'pipeline', agents: 2 },
        { strategy: 'race', agents: 2 },
      ];
      strategies.forEach(({ strategy, agents }) => {
        expect(() =>
          createSwarmSchema.parse({ name: 'test', agents, strategy })
        ).not.toThrow();
      });
    });

    it('should accept optional budget and config', () => {
      const data = {
        name: 'test',
        agents: 3,
        budget: 1000,
        config: { timeout: 30000 },
      };
      const result = createSwarmSchema.parse(data);
      expect(result.budget).toBe(1000);
      expect(result.config).toEqual({ timeout: 30000 });
    });

    it('should reject budget > 10000', () => {
      expect(() =>
        createSwarmSchema.parse({ name: 'test', agents: 3, budget: 10001 })
      ).toThrow();
    });
  });

  describe('setBudgetSchema', () => {
    it('should accept valid global budget', () => {
      const data = { scopeType: 'global' as const, maxTokens: 1000000 };
      expect(() => setBudgetSchema.parse(data)).not.toThrow();
    });

    it('should accept valid swarm budget', () => {
      const data = {
        scopeType: 'swarm' as const,
        scopeId: '550e8400-e29b-41d4-a716-446655440000',
        maxCost: 500,
      };
      expect(() => setBudgetSchema.parse(data)).not.toThrow();
    });

    it('should require scopeId for non-global scopes', () => {
      const data = {
        scopeType: 'swarm' as const,
        maxTokens: 1000,
      };
      expect(() => setBudgetSchema.parse(data)).toThrow('scopeId required');
    });

    it('should require at least one limit', () => {
      const data = {
        scopeType: 'global' as const,
      };
      expect(() => setBudgetSchema.parse(data)).toThrow('budget limit required');
    });

    it('should accept all valid scope types', () => {
      const scopeTypes = ['swarm', 'agent', 'project', 'global'] as const;
      scopeTypes.forEach((scopeType) => {
        const data: any = {
          scopeType,
          maxTokens: 1000,
        };
        if (scopeType !== 'global') {
          data.scopeId = '550e8400-e29b-41d4-a716-446655440000';
        }
        expect(() => setBudgetSchema.parse(data)).not.toThrow();
      });
    });

    it('should accept alert threshold', () => {
      const data = {
        scopeType: 'global' as const,
        maxTokens: 1000,
        alertThreshold: 0.8,
      };
      const result = setBudgetSchema.parse(data);
      expect(result.alertThreshold).toBe(0.8);
    });

    it('should reject alert threshold > 1', () => {
      const data = {
        scopeType: 'global' as const,
        maxTokens: 1000,
        alertThreshold: 1.5,
      };
      expect(() => setBudgetSchema.parse(data)).toThrow();
    });
  });
});
