/**
 * Workflow Integration Tests
 * 
 * Tests complete workflow scenarios end-to-end.
 * Requires PostgreSQL and Redis to be running.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import Redis from 'ioredis';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3001';
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://dash_user:dash_password@localhost:5432/dash_test';

describe('Dash Workflow Integration', () => {
  let db: Pool;
  let redis: Redis;

  beforeAll(async () => {
    db = new Pool({ connectionString: TEST_DB_URL });
    redis = new Redis(process.env.TEST_REDIS_URL || 'redis://localhost:6379/1');
  });

  afterAll(async () => {
    await db.end();
    await redis.quit();
  });

  beforeEach(async () => {
    await db.query("DELETE FROM agents WHERE label LIKE 'test_%'");
    await db.query("DELETE FROM swarms WHERE name LIKE 'test_%'");
    await db.query("DELETE FROM events WHERE type LIKE 'test_%'");
    await redis.flushdb();
  });

  describe('Complete Agent Lifecycle', () => {
    it('should create swarm, spawn agents, and complete workflow', async () => {
      // 1. Create a swarm
      const swarmRes = await fetch(`${API_URL}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test_lifecycle_swarm',
          config: {
            model: 'test-model',
            maxAgents: 5,
            safety: { enabled: true },
          },
        }),
      });
      expect(swarmRes.status).toBe(201);
      const swarm = await swarmRes.json();
      expect(swarm.status).toBe('creating');

      // 2. Wait for swarm to be active
      let activeSwarm;
      for (let i = 0; i < 10; i++) {
        const getRes = await fetch(`${API_URL}/api/swarms/${swarm.id}`);
        activeSwarm = await getRes.json();
        if (activeSwarm.status === 'active') break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(activeSwarm!.status).toBe('active');

      // 3. Spawn multiple agents
      const agents = [];
      for (let i = 0; i < 3; i++) {
        const agentRes = await fetch(`${API_URL}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            swarmId: swarm.id,
            model: 'test-model',
            task: `Test task ${i}`,
            label: `test_agent_${i}`,
          }),
        });
        expect(agentRes.status).toBe(201);
        agents.push(await agentRes.json());
      }

      // 4. Verify agents are in pending or running state
      agents.forEach((agent) => {
        expect(['pending', 'running']).toContain(agent.status);
      });

      // 5. Simulate agent completion
      for (const agent of agents) {
        const updateRes = await fetch(`${API_URL}/api/agents/${agent.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            result: { output: 'Task completed successfully' },
          }),
        });
        expect(updateRes.status).toBe(200);
      }

      // 6. Verify all agents completed
      const listRes = await fetch(`${API_URL}/api/swarms/${swarm.id}/agents`);
      const { agents: finalAgents } = await listRes.json();
      
      finalAgents.forEach((agent: any) => {
        expect(agent.status).toBe('completed');
      });

      // 7. Complete the swarm
      const completeRes = await fetch(`${API_URL}/api/swarms/${swarm.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(completeRes.status).toBe(200);

      // 8. Verify swarm is completed
      const finalSwarmRes = await fetch(`${API_URL}/api/swarms/${swarm.id}`);
      const finalSwarm = await finalSwarmRes.json();
      expect(finalSwarm.status).toBe('completed');
    }, 30000);
  });

  describe('Error Recovery Workflow', () => {
    it('should handle agent failure and retry', async () => {
      // 1. Create swarm
      const swarmRes = await fetch(`${API_URL}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test_recovery_swarm',
          config: { maxRetries: 2 },
        }),
      });
      const swarm = await swarmRes.json();

      // 2. Spawn agent
      const agentRes = await fetch(`${API_URL}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swarmId: swarm.id,
          model: 'test-model',
          task: 'Task that will fail',
          label: 'test_recovery_agent',
          maxRetries: 2,
        }),
      });
      const agent = await agentRes.json();

      // 3. Simulate failure
      await fetch(`${API_URL}/api/agents/${agent.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'failed',
          error: 'Simulated error',
        }),
      });

      // 4. Wait for retry mechanism
      await new Promise((r) => setTimeout(r, 1000));

      // 5. Verify retry count increased
      const getRes = await fetch(`${API_URL}/api/agents/${agent.id}`);
      const updatedAgent = await getRes.json();
      expect(updatedAgent.retryCount).toBeGreaterThan(0);

      // 6. Complete the agent
      await fetch(`${API_URL}/api/agents/${agent.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          result: { recovered: true },
        }),
      });

      // 7. Verify completion
      const finalRes = await fetch(`${API_URL}/api/agents/${agent.id}`);
      const finalAgent = await finalRes.json();
      expect(finalAgent.status).toBe('completed');
    }, 15000);
  });

  describe('Budget Management Workflow', () => {
    it('should track and enforce budget limits', async () => {
      // 1. Create swarm with budget
      const swarmRes = await fetch(`${API_URL}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test_budget_swarm',
          budget: {
            allocated: 5.00,
            currency: 'USD',
          },
        }),
      });
      const swarm = await swarmRes.json();

      // 2. Verify budget was created
      const budgetRes = await fetch(`${API_URL}/api/swarms/${swarm.id}/budget`);
      expect(budgetRes.status).toBe(200);
      const budget = await budgetRes.json();
      expect(budget.allocated).toBe(5.00);
      expect(budget.consumed).toBe(0);

      // 3. Simulate budget consumption
      await fetch(`${API_URL}/api/swarms/${swarm.id}/budget/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 2.50,
          tokens: 1000,
        }),
      });

      // 4. Verify consumption
      const updatedBudgetRes = await fetch(`${API_URL}/api/swarms/${swarm.id}/budget`);
      const updatedBudget = await updatedBudgetRes.json();
      expect(updatedBudget.consumed).toBe(2.50);
      expect(updatedBudget.percentage).toBe(50);

      // 5. Try to exceed budget (should be rejected or warning)
      const exceedRes = await fetch(`${API_URL}/api/swarms/${swarm.id}/budget/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 10.00, // More than remaining
        }),
      });
      
      // Should either fail or return warning
      expect([200, 400, 422]).toContain(exceedRes.status);
    });
  });

  describe('Event Stream Workflow', () => {
    it('should emit and query events correctly', async () => {
      // 1. Create swarm to generate events
      const swarmRes = await fetch(`${API_URL}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test_events_swarm' }),
      });
      const swarm = await swarmRes.json();

      // 2. Emit custom events
      const eventTypes = ['test_start', 'test_progress', 'test_complete'];
      for (const type of eventTypes) {
        const eventRes = await fetch(`${API_URL}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            swarmId: swarm.id,
            payload: { step: eventTypes.indexOf(type) },
            severity: 'info',
          }),
        });
        expect(eventRes.status).toBe(201);
      }

      // 3. Query events
      const queryRes = await fetch(`${API_URL}/api/events?swarmId=${swarm.id}&limit=10`);
      expect(queryRes.status).toBe(200);
      const { events, total } = await queryRes.json();
      expect(events.length).toBeGreaterThanOrEqual(3);

      // 4. Query by type
      const typeRes = await fetch(`${API_URL}/api/events?type=test_start`);
      const typedEvents = await typeRes.json();
      expect(typedEvents.events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent agent spawns', async () => {
      // 1. Create swarm
      const swarmRes = await fetch(`${API_URL}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test_concurrent_swarm',
          config: { maxAgents: 20 },
        }),
      });
      const swarm = await swarmRes.json();

      // 2. Spawn 10 agents concurrently
      const spawnPromises = [];
      for (let i = 0; i < 10; i++) {
        const promise = fetch(`${API_URL}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            swarmId: swarm.id,
            model: 'test-model',
            task: `Concurrent task ${i}`,
            label: `test_concurrent_${i}`,
          }),
        });
        spawnPromises.push(promise);
      }

      const results = await Promise.all(spawnPromises);
      
      // All should succeed
      results.forEach((res) => {
        expect(res.status).toBe(201);
      });

      // 3. Verify all agents exist
      const listRes = await fetch(`${API_URL}/api/swarms/${swarm.id}/agents`);
      const { agents } = await listRes.json();
      expect(agents.length).toBe(10);
    }, 10000);
  });

  describe('Cleanup Workflow', () => {
    it('should properly cleanup resources on swarm destruction', async () => {
      // 1. Create swarm with agents
      const swarmRes = await fetch(`${API_URL}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test_cleanup_swarm' }),
      });
      const swarm = await swarmRes.json();

      // Spawn agents
      for (let i = 0; i < 3; i++) {
        await fetch(`${API_URL}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            swarmId: swarm.id,
            model: 'test-model',
            task: `Task ${i}`,
          }),
        });
      }

      // 2. Destroy swarm
      const destroyRes = await fetch(`${API_URL}/api/swarms/${swarm.id}`, {
        method: 'DELETE',
      });
      expect(destroyRes.status).toBe(200);

      // 3. Verify swarm is destroyed
      const getRes = await fetch(`${API_URL}/api/swarms/${swarm.id}`);
      expect(getRes.status).toBe(404);

      // 4. Verify agents are cleaned up
      const agentsRes = await fetch(`${API_URL}/api/swarms/${swarm.id}/agents`);
      expect(agentsRes.status).toBe(404);
    });
  });
});
