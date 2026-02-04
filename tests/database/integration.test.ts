/**
 * Database Integration Tests
 * 
 * Tests for PostgreSQL repositories with real database.
 * Requires PostgreSQL to be running (use `npm run db:up`)
 * 
 * @group integration
 * @group database
 */

import { SwarmRepository } from '../../src/storage/repositories/SwarmRepository';
import { AgentRepository } from '../../src/storage/repositories/AgentRepository';
import { EventRepository } from '../../src/storage/repositories/EventRepository';
import { SessionRepository } from '../../src/storage/repositories/SessionRepository';
import { BudgetRepository } from '../../src/storage/repositories/BudgetRepository';
import { resetPool } from '../../src/storage/postgres/pool';

describe('Database Integration Tests', () => {
  const testDbConfig = {
    host: process.env['POSTGRES_HOST'] || 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] || '5432', 10),
    database: process.env['POSTGRES_DB'] || 'dash_test',
    user: process.env['POSTGRES_USER'] || 'dash',
    password: process.env['POSTGRES_PASSWORD'] || 'dash',
  };

  let swarmRepo: SwarmRepository;
  let agentRepo: AgentRepository;
  let eventRepo: EventRepository;
  let sessionRepo: SessionRepository;
  let budgetRepo: BudgetRepository;

  beforeAll(async () => {
    // Initialize repositories
    swarmRepo = new SwarmRepository(testDbConfig);
    agentRepo = new AgentRepository(testDbConfig);
    eventRepo = new EventRepository(testDbConfig);
    sessionRepo = new SessionRepository(testDbConfig);
    budgetRepo = new BudgetRepository(testDbConfig);

    await Promise.all([
      swarmRepo.initialize(),
      agentRepo.initialize(),
      eventRepo.initialize(),
      sessionRepo.initialize(),
      budgetRepo.initialize(),
    ]);
  });

  afterAll(async () => {
    await resetPool();
  });

  describe('SwarmRepository', () => {
    let createdSwarmId: string;

    it('should create a swarm', async () => {
      const swarm = await swarmRepo.create({
        name: 'Test Swarm',
        config: { maxAgents: 10 },
        status: 'active',
      });

      expect(swarm).toBeDefined();
      expect(swarm.id).toBeDefined();
      expect(swarm.name).toBe('Test Swarm');
      expect(swarm.status).toBe('active');
      expect(swarm.config).toEqual({ maxAgents: 10 });

      createdSwarmId = swarm.id;
    });

    it('should find a swarm by ID', async () => {
      const swarm = await swarmRepo.findById(createdSwarmId);
      
      expect(swarm).toBeDefined();
      expect(swarm?.id).toBe(createdSwarmId);
      expect(swarm?.name).toBe('Test Swarm');
    });

    it('should update a swarm', async () => {
      const updated = await swarmRepo.update(createdSwarmId, {
        name: 'Updated Swarm',
        status: 'paused',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Swarm');
      expect(updated?.status).toBe('paused');
    });

    it('should list swarms', async () => {
      const swarms = await swarmRepo.list({ limit: 10 });
      
      expect(Array.isArray(swarms)).toBe(true);
      expect(swarms.length).toBeGreaterThan(0);
    });

    it('should count swarms', async () => {
      const count = await swarmRepo.count();
      
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should delete a swarm', async () => {
      const deleted = await swarmRepo.delete(createdSwarmId);
      
      expect(deleted).toBe(true);
      
      const swarm = await swarmRepo.findById(createdSwarmId);
      expect(swarm).toBeNull();
    });
  });

  describe('AgentRepository', () => {
    let createdAgentId: string;
    let swarmId: string;

    beforeAll(async () => {
      // Create a swarm for agent tests
      const swarm = await swarmRepo.create({
        name: 'Agent Test Swarm',
        config: {},
      });
      swarmId = swarm.id;
    });

    it('should create an agent', async () => {
      const agent = await agentRepo.create({
        swarm_id: swarmId,
        label: 'Test Agent',
        model: 'kimi-k2.5',
        task: 'Run integration tests',
        config: { test: true },
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.model).toBe('kimi-k2.5');
      expect(agent.task).toBe('Run integration tests');
      expect(agent.status).toBe('pending');

      createdAgentId = agent.id;
    });

    it('should find an agent by ID', async () => {
      const agent = await agentRepo.findById(createdAgentId);
      
      expect(agent).toBeDefined();
      expect(agent?.id).toBe(createdAgentId);
      expect(agent?.model).toBe('kimi-k2.5');
    });

    it('should find agents by swarm ID', async () => {
      const agents = await agentRepo.findBySwarmId(swarmId);
      
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].swarm_id).toBe(swarmId);
    });

    it('should update agent status', async () => {
      const updated = await agentRepo.updateStatus(createdAgentId, 'running');
      
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('running');
    });

    it('should pause and resume an agent', async () => {
      const paused = await agentRepo.pause(createdAgentId, 'test-user');
      
      expect(paused).toBeDefined();
      expect(paused?.status).toBe('paused');
      expect(paused?.paused_by).toBe('test-user');

      const resumed = await agentRepo.resume(createdAgentId);
      
      expect(resumed).toBeDefined();
      expect(resumed?.status).toBe('running');
    });

    it('should increment retry count', async () => {
      const agent = await agentRepo.incrementRetry(createdAgentId);
      
      expect(agent).toBeDefined();
      expect(agent?.retry_count).toBe(1);
    });

    it('should get agent counts by status', async () => {
      const counts = await agentRepo.getCountsByStatus();
      
      expect(counts).toHaveProperty('total');
      expect(counts).toHaveProperty('running');
      expect(counts).toHaveProperty('pending');
      expect(typeof counts.total).toBe('number');
    });

    it('should delete an agent', async () => {
      const deleted = await agentRepo.delete(createdAgentId);
      
      expect(deleted).toBe(true);
      
      const agent = await agentRepo.findById(createdAgentId);
      expect(agent).toBeNull();
    });

    afterAll(async () => {
      await swarmRepo.delete(swarmId);
    });
  });

  describe('EventRepository', () => {
    let createdEventId: string;
    let swarmId: string;
    let agentId: string;

    beforeAll(async () => {
      // Create swarm and agent for event tests
      const swarm = await swarmRepo.create({ name: 'Event Test Swarm', config: {} });
      swarmId = swarm.id;
      
      const agent = await agentRepo.create({
        swarm_id: swarmId,
        model: 'kimi-k2.5',
        task: 'Test',
      });
      agentId = agent.id;
    });

    it('should create an event', async () => {
      const event = await eventRepo.create({
        swarm_id: swarmId,
        agent_id: agentId,
        type: 'agent.spawned',
        payload: { model: 'kimi-k2.5' },
        entity_type: 'agent',
        severity: 'info',
      });

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.type).toBe('agent.spawned');
      expect(event.payload).toEqual({ model: 'kimi-k2.5' });

      createdEventId = event.id;
    });

    it('should find an event by ID', async () => {
      const event = await eventRepo.findById(createdEventId);
      
      expect(event).toBeDefined();
      expect(event?.id).toBe(createdEventId);
    });

    it('should find events by agent ID', async () => {
      const events = await eventRepo.findByAgentId(agentId);
      
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should find events by swarm ID', async () => {
      const events = await eventRepo.findBySwarmId(swarmId);
      
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should find events with filter', async () => {
      const events = await eventRepo.findByFilter({
        types: ['agent.spawned'],
        limit: 10,
      });
      
      expect(Array.isArray(events)).toBe(true);
      expect(events.every(e => e.type === 'agent.spawned')).toBe(true);
    });

    it('should get event stats', async () => {
      const stats = await eventRepo.getStats(24);
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byType');
      expect(stats).toHaveProperty('bySeverity');
      expect(typeof stats.total).toBe('number');
    });

    afterAll(async () => {
      await agentRepo.delete(agentId);
      await swarmRepo.delete(swarmId);
    });
  });

  describe('SessionRepository', () => {
    let createdSessionId: string;

    it('should create a session', async () => {
      const session = await sessionRepo.create({
        tree_data: { root: 'test' },
        current_branch: 'main',
        metadata: { test: true },
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.tree_data).toEqual({ root: 'test' });
      expect(session.current_branch).toBe('main');

      createdSessionId = session.id;
    });

    it('should find a session by ID', async () => {
      const session = await sessionRepo.findById(createdSessionId);
      
      expect(session).toBeDefined();
      expect(session?.id).toBe(createdSessionId);
      expect(session?.current_branch).toBe('main');
    });

    it('should update tree data', async () => {
      const updated = await sessionRepo.updateTreeData(
        createdSessionId,
        { root: 'test', children: [] },
        'feature-branch'
      );

      expect(updated).toBeDefined();
      expect(updated?.tree_data).toEqual({ root: 'test', children: [] });
      expect(updated?.current_branch).toBe('feature-branch');
    });

    it('should merge metadata', async () => {
      const updated = await sessionRepo.mergeMetadata(createdSessionId, {
        merged: true,
      });

      expect(updated).toBeDefined();
      expect(updated?.metadata).toMatchObject({ test: true, merged: true });
    });

    it('should list sessions', async () => {
      const sessions = await sessionRepo.list({ limit: 10 });
      
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
    });

    it('should delete a session', async () => {
      const deleted = await sessionRepo.delete(createdSessionId);
      
      expect(deleted).toBe(true);
      
      const session = await sessionRepo.findById(createdSessionId);
      expect(session).toBeNull();
    });
  });

  describe('BudgetRepository', () => {
    let createdBudgetId: string;
    let swarmId: string;

    beforeAll(async () => {
      const swarm = await swarmRepo.create({ name: 'Budget Test Swarm', config: {} });
      swarmId = swarm.id;
    });

    it('should create a budget', async () => {
      const budget = await budgetRepo.create({
        swarm_id: swarmId,
        scope_type: 'swarm',
        scope_id: swarmId,
        allocated: 100.00,
        currency: 'USD',
        max_tokens: 100000,
      });

      expect(budget).toBeDefined();
      expect(budget.id).toBeDefined();
      expect(budget.allocated).toBe(100.00);
      expect(budget.consumed).toBe(0);
      expect(budget.currency).toBe('USD');

      createdBudgetId = budget.id;
    });

    it('should find a budget by ID', async () => {
      const budget = await budgetRepo.findById(createdBudgetId);
      
      expect(budget).toBeDefined();
      expect(budget?.id).toBe(createdBudgetId);
    });

    it('should find budget by scope', async () => {
      const budget = await budgetRepo.findByScope('swarm', swarmId);
      
      expect(budget).toBeDefined();
      expect(budget?.scope_type).toBe('swarm');
      expect(budget?.scope_id).toBe(swarmId);
    });

    it('should add usage to budget', async () => {
      const budget = await budgetRepo.addUsage(createdBudgetId, 1000, 10.50);
      
      expect(budget).toBeDefined();
      expect(budget?.used_tokens).toBe(1000);
      expect(budget?.consumed).toBe(10.50);
    });

    it('should get budget usage', async () => {
      const usage = await budgetRepo.getUsage(createdBudgetId);
      
      expect(usage).toBeDefined();
      expect(usage?.tokens).toBe(1000);
      expect(usage?.cost).toBe(10.50);
      expect(usage?.isExceeded).toBe(false);
    });

    it('should consume budget atomically', async () => {
      // This should succeed
      const success = await budgetRepo.consumeBudget(createdBudgetId, 1000, 20.00);
      expect(success).toBe(true);

      // Check updated budget
      const budget = await budgetRepo.findById(createdBudgetId);
      expect(budget?.used_tokens).toBe(2000);
      expect(budget?.consumed).toBe(30.50);

      // This should fail (exceeds budget)
      const fail = await budgetRepo.consumeBudget(createdBudgetId, 100000, 1000);
      expect(fail).toBe(false);
    });

    it('should get swarm budget summary', async () => {
      const summary = await budgetRepo.getSwarmBudgetSummary(swarmId);
      
      expect(summary).toHaveProperty('totalAllocated');
      expect(summary).toHaveProperty('totalConsumed');
      expect(summary.totalAllocated).toBe(100.00);
      expect(summary.totalConsumed).toBe(30.50);
    });

    it('should delete a budget', async () => {
      const deleted = await budgetRepo.delete(createdBudgetId);
      
      expect(deleted).toBe(true);
      
      const budget = await budgetRepo.findById(createdBudgetId);
      expect(budget).toBeNull();
    });

    afterAll(async () => {
      await swarmRepo.delete(swarmId);
    });
  });

  describe('Connection Pool', () => {
    it('should report pool stats', async () => {
      const { getPool } = await import('../../src/storage/postgres/pool');
      const pool = await getPool(testDbConfig);
      const stats = pool.getStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('isConnected');
      expect(stats.isConnected).toBe(true);
    });

    it('should pass health check', async () => {
      const { getPool } = await import('../../src/storage/postgres/pool');
      const pool = await getPool(testDbConfig);
      const health = await pool.healthCheck();

      expect(health.healthy).toBe(true);
    });
  });
});
