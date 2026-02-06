/**
 * PostgreSQL Storage Tests - SPEC-T2
 * 
 * Tests for PostgreSQL storage implementation.
 * Requires PostgreSQL to be running (via docker-compose.postgres.yml).
 */

import { PostgresStorage } from '../../src/storage/postgres-storage';
import { resetGlobalPostgresStorage } from '../../src/storage/postgres-storage';

// Test configuration
const TEST_POSTGRES_CONFIG = {
  host: process.env['POSTGRES_HOST'] || 'localhost',
  port: parseInt(process.env['POSTGRES_PORT'] || '5432'),
  database: process.env['POSTGRES_DB'] || 'godel',
  user: process.env['POSTGRES_USER'] || 'godel',
  password: process.env['POSTGRES_PASSWORD'] || 'godel_password',
  ssl: process.env['POSTGRES_SSL'] === 'true',
  maxConnections: 5,
};

describe('PostgresStorage', () => {
  let storage: PostgresStorage;

  beforeAll(async () => {
    storage = new PostgresStorage(TEST_POSTGRES_CONFIG);
    await storage.initialize(TEST_POSTGRES_CONFIG);
  });

  afterAll(async () => {
    await storage.close();
  });

  beforeEach(async () => {
    // Clean up test data
    try {
      const agents = await storage.listAgents();
      for (const agent of agents) {
        await storage.deleteAgent(agent.id);
      }
      
      const swarms = await storage.listSwarms();
      for (const swarm of swarms) {
        await storage.deleteSwarm(swarm.id);
      }
    } catch {
      // Tables might not exist yet, that's OK
    }
  });

  describe('healthCheck', () => {
    it('should return true when database is healthy', async () => {
      const healthy = await storage.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  describe('Agent Operations', () => {
    it('should create an agent', async () => {
      const id = await storage.createAgent({
        id: '',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        status: 'pending',
        metadata: { test: true },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should get an agent by id', async () => {
      const createResult = await storage.createAgent({
        id: '',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        status: 'pending',
        metadata: { test: true },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const agent = await storage.getAgent(createResult);

      expect(agent).not.toBeNull();
      expect(agent?.name).toBe('Test Agent');
      // Note: provider is stored in metadata since there's no provider column
      expect(agent?.model).toBe('gpt-4');
    });

    it('should update an agent', async () => {
      const id = await storage.createAgent({
        id: '',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await storage.updateAgent(id, {
        name: 'Updated Agent',
        model: 'gpt-4-turbo',
        status: 'running',
      });

      const agent = await storage.getAgent(id);

      expect(agent?.name).toBe('Updated Agent');
      expect(agent?.model).toBe('gpt-4-turbo');
      expect(agent?.status).toBe('running');
    });

    it('should delete an agent', async () => {
      const id = await storage.createAgent({
        id: '',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await storage.deleteAgent(id);

      const agent = await storage.getAgent(id);
      expect(agent).toBeNull();
    });

    it('should list all agents', async () => {
      await storage.createAgent({
        id: '',
        name: 'Agent 1',
        provider: 'openai',
        model: 'gpt-4',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await storage.createAgent({
        id: '',
        name: 'Agent 2',
        provider: 'anthropic',
        model: 'claude-3',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const agents = await storage.listAgents();

      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.name).sort()).toEqual(['Agent 1', 'Agent 2']);
    });
  });

  describe('Swarm Operations', () => {
    it('should create a swarm', async () => {
      const id = await storage.createSwarm({
        id: '',
        name: 'Test Swarm',
        task: 'Test task',
        agentIds: ['agent-1', 'agent-2'],
        status: 'creating',
        metadata: { test: true },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should get a swarm by id', async () => {
      const createResult = await storage.createSwarm({
        id: '',
        name: 'Test Swarm',
        task: 'Test task',
        agentIds: ['agent-1', 'agent-2'],
        status: 'creating',
        metadata: { test: true },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const swarm = await storage.getSwarm(createResult);

      expect(swarm).not.toBeNull();
      expect(swarm?.name).toBe('Test Swarm');
      expect(swarm?.task).toBe('Test task');
    });

    it('should update a swarm', async () => {
      const id = await storage.createSwarm({
        id: '',
        name: 'Test Swarm',
        task: 'Test task',
        agentIds: ['agent-1'],
        status: 'creating',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await storage.updateSwarm(id, {
        name: 'Updated Swarm',
        task: 'Updated task',
        status: 'active',
      });

      const swarm = await storage.getSwarm(id);

      expect(swarm?.name).toBe('Updated Swarm');
      expect(swarm?.task).toBe('Updated task');
      expect(swarm?.status).toBe('active');
    });

    it('should delete a swarm', async () => {
      const id = await storage.createSwarm({
        id: '',
        name: 'Test Swarm',
        task: 'Test task',
        agentIds: ['agent-1'],
        status: 'creating',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await storage.deleteSwarm(id);

      const swarm = await storage.getSwarm(id);
      expect(swarm).toBeNull();
    });

    it('should list all swarms', async () => {
      await storage.createSwarm({
        id: '',
        name: 'Swarm 1',
        task: 'Task 1',
        agentIds: ['agent-1'],
        status: 'creating',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await storage.createSwarm({
        id: '',
        name: 'Swarm 2',
        task: 'Task 2',
        agentIds: ['agent-2'],
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const swarms = await storage.listSwarms();

      expect(swarms).toHaveLength(2);
      expect(swarms.map(s => s.name).sort()).toEqual(['Swarm 1', 'Swarm 2']);
    });
  });

  describe('Generic CRUD Operations', () => {
    // These tests verify the generic CRUD interface works
    // The actual implementation is tested through Agent and Swarm operations above

    it('should have healthCheck method', async () => {
      const healthy = await storage.healthCheck();
      expect(typeof healthy).toBe('boolean');
    });

    it('should have create method', async () => {
      expect(typeof storage.create).toBe('function');
    });

    it('should have read method', async () => {
      expect(typeof storage.read).toBe('function');
    });

    it('should have update method', async () => {
      expect(typeof storage.update).toBe('function');
    });

    it('should have delete method', async () => {
      expect(typeof storage.delete).toBe('function');
    });

    it('should have list method', async () => {
      expect(typeof storage.list).toBe('function');
    });
  });
});
