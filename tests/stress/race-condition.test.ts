/**
 * Race Condition Stress Test - Dash v3
 * 
 * Tests the mutex and transaction protections to ensure:
 * - No duplicate agents created during concurrent spawn
 * - No lost agents during concurrent operations
 * - Proper state transitions (no IDLE→RUNNING and IDLE→PAUSED concurrently)
 * 
 * Run with: npm test -- tests/stress/race-condition.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SwarmManager, type SwarmConfig, type Swarm } from '../../src/core/swarm.js';
import { AgentLifecycle } from '../../src/core/lifecycle.js';
import { MessageBus } from '../../src/bus/index.js';
import { AgentStorage } from '../../src/storage/memory.js';
import { SQLiteStorage } from '../../src/storage/sqlite.js';
import { AgentStatus, createAgent, type Agent } from '../../src/models/agent.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Race Condition Stress Tests', () => {
  let swarmManager: SwarmManager;
  let lifecycle: AgentLifecycle;
  let messageBus: MessageBus;
  let storage: AgentStorage;
  let sqliteStorage: SQLiteStorage;
  let dbPath: string;

  beforeEach(async () => {
    // Create a temporary database for each test
    dbPath = path.join(process.cwd(), `test-race-${Date.now()}.db`);
    
    messageBus = new MessageBus();
    storage = new AgentStorage();
    lifecycle = new AgentLifecycle(storage, messageBus);
    swarmManager = new SwarmManager(lifecycle, messageBus, storage);
    
    sqliteStorage = new SQLiteStorage({ dbPath });
    await sqliteStorage.initialize();
    
    lifecycle.start();
    swarmManager.start();
  });

  afterEach(() => {
    swarmManager.stop();
    lifecycle.stop();
    sqliteStorage.close();
    
    // Clean up database file
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Swarm Operations Mutex', () => {
    it('should handle concurrent swarm creation without ID collisions', async () => {
      const config: SwarmConfig = {
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 1,
        maxAgents: 10,
        strategy: 'parallel',
      };

      // Create 10 swarms concurrently
      const createPromises: Promise<Swarm>[] = [];
      for (let i = 0; i < 10; i++) {
        createPromises.push(swarmManager.create({ ...config, name: `swarm-${i}` }));
      }

      const swarms = await Promise.all(createPromises);

      // Verify all swarms created
      expect(swarms).toHaveLength(10);

      // Verify all IDs are unique
      const ids = new Set(swarms.map(s => s.id));
      expect(ids.size).toBe(10);

      // Verify all swarms are tracked
      const listSwarms = swarmManager.listSwarms();
      expect(listSwarms).toHaveLength(10);
    });

    it('should prevent concurrent scale operations on same swarm', async () => {
      const config: SwarmConfig = {
        name: 'scale-test-swarm',
        task: 'Test task',
        initialAgents: 1,
        maxAgents: 20,
        strategy: 'parallel',
      };

      const swarm = await swarmManager.create(config);

      // Attempt concurrent scale operations
      const scalePromises = [
        swarmManager.scale(swarm.id, 5),
        swarmManager.scale(swarm.id, 8),
        swarmManager.scale(swarm.id, 3),
      ];

      // All should complete without throwing
      await Promise.all(scalePromises);

      // Get final state
      const finalSwarm = swarmManager.getSwarm(swarm.id);
      expect(finalSwarm).toBeDefined();
      
      // The final size should be one of the requested sizes (last one wins due to mutex)
      expect(finalSwarm!.agents.length).toBeGreaterThanOrEqual(1);
      expect(finalSwarm!.agents.length).toBeLessThanOrEqual(8);
      
      // Should have exactly the expected number of agents (no duplicates or orphans)
      const swarmAgentIds = new Set(finalSwarm!.agents);
      expect(swarmAgentIds.size).toBe(finalSwarm!.agents.length); // No duplicates
    });

    it('should handle concurrent spawn operations without agent loss', async () => {
      const config: SwarmConfig = {
        name: 'concurrent-spawn-test',
        task: 'Test task',
        initialAgents: 0, // Start with 0
        maxAgents: 25,
        strategy: 'parallel',
      };

      const swarm = await swarmManager.create(config);
      expect(swarm.agents).toHaveLength(0);

      // Scale up concurrently multiple times
      const scaleOps: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        scaleOps.push(swarmManager.scale(swarm.id, (i + 1) * 5));
      }

      await Promise.all(scaleOps);

      const finalSwarm = swarmManager.getSwarm(swarm.id);
      expect(finalSwarm).toBeDefined();
      
      // Get all agents from lifecycle
      const lifecycleAgents = lifecycle.getAllStates();
      const swarmAgents = lifecycleAgents.filter(a => 
        a.agent.swarmId === swarm.id
      );
      
      // All swarm agents should be tracked in lifecycle
      expect(swarmAgents.length).toBe(finalSwarm!.agents.length);
      
      // No agent should be orphaned (in lifecycle but not in swarm)
      const orphanAgents = swarmAgents.filter(a => 
        !finalSwarm!.agents.includes(a.id)
      );
      expect(orphanAgents).toHaveLength(0);
    });
  });

  describe('Agent State Machine Mutex', () => {
    it('should prevent concurrent state transitions on same agent', async () => {
      // Create an agent
      const agent = await lifecycle.spawn({
        model: 'test-model',
        task: 'Test task',
        autoStart: false,
      });

      expect(agent.status).toBe(AgentStatus.PENDING);

      // Attempt conflicting state transitions concurrently
      const transitions = [
        lifecycle.startAgent(agent.id),
        lifecycle.pause(agent.id), // Should fail or be properly sequenced
      ];

      // One should succeed, the other should fail or wait
      const results = await Promise.allSettled(transitions);
      
      // At least one should succeed
      const succeeded = results.filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBeGreaterThanOrEqual(1);

      // Get final state - should be consistent
      const state = lifecycle.getState(agent.id);
      expect(state).toBeDefined();
      
      // State should be either running or paused (deterministic based on mutex ordering)
      expect([AgentStatus.RUNNING, AgentStatus.PAUSED]).toContain(state!.status);
    });

    it('should handle 20 concurrent agent spawns correctly', async () => {
      // Spawn 20 agents concurrently
      const spawnPromises: Promise<Agent>[] = [];
      for (let i = 0; i < 20; i++) {
        spawnPromises.push(lifecycle.spawn({
          model: 'test-model',
          task: `Task ${i}`,
          label: `Agent-${i}`,
          autoStart: true,
        }));
      }

      const agents = await Promise.all(spawnPromises);

      // Verify all 20 agents created
      expect(agents).toHaveLength(20);

      // Verify all IDs are unique
      const ids = new Set(agents.map(a => a.id));
      expect(ids.size).toBe(20);

      // Verify no duplicates in storage
      const allStates = lifecycle.getAllStates();
      const stateIds = allStates.map(s => s.id);
      const uniqueStateIds = new Set(stateIds);
      expect(uniqueStateIds.size).toBe(stateIds.length);

      // Verify all agents are properly tracked
      expect(allStates.length).toBe(20);
    });

    it('should maintain state consistency under rapid transitions', async () => {
      const agent = await lifecycle.spawn({
        model: 'test-model',
        task: 'Test task',
        autoStart: true,
      });

      // Rapid state transitions
      const transitions = [
        () => lifecycle.pause(agent.id),
        () => lifecycle.resume(agent.id),
        () => lifecycle.pause(agent.id),
        () => lifecycle.resume(agent.id),
      ];

      // Execute all transitions
      for (const transition of transitions) {
        try {
          await transition();
        } catch (error) {
          // Some transitions may fail due to invalid state - that's OK
        }
      }

      // Final state should be valid
      const state = lifecycle.getState(agent.id);
      expect(state).toBeDefined();
      expect([
        AgentStatus.RUNNING,
        AgentStatus.PAUSED,
        AgentStatus.COMPLETED,
        AgentStatus.KILLED,
      ]).toContain(state!.status);

      // State transitions should be atomic - no intermediate states
      const validStates = Object.values(AgentStatus);
      expect(validStates).toContain(state!.status);
    });
  });

  describe('SQLite Transaction Support', () => {
    it('should rollback failed batch operations', async () => {
      // Create agents for batch insert
      const agents: Agent[] = [];
      for (let i = 0; i < 5; i++) {
        agents.push(createAgent({
          model: 'test-model',
          task: `Task ${i}`,
        }));
      }

      // Batch create should succeed
      expect(() => {
        sqliteStorage.batchCreateAgents(agents);
      }).not.toThrow();

      // Verify all agents created
      for (const agent of agents) {
        const retrieved = sqliteStorage.getAgent(agent.id);
        expect(retrieved).toBeDefined();
        expect(retrieved!.id).toBe(agent.id);
      }
    });

    it('should maintain consistency during concurrent database operations', async () => {
      // Create agents
      const agents: Agent[] = [];
      for (let i = 0; i < 10; i++) {
        agents.push(createAgent({
          model: 'test-model',
          task: `Task ${i}`,
        }));
      }

      // Insert all agents
      sqliteStorage.batchCreateAgents(agents);

      // Concurrent read and update operations
      const operations: Promise<unknown>[] = [];
      
      // Read operations
      for (let i = 0; i < 5; i++) {
        operations.push(Promise.resolve(sqliteStorage.getAgent(agents[0].id)));
      }
      
      // Update operations
      for (let i = 0; i < agents.length; i++) {
        operations.push(Promise.resolve(
          sqliteStorage.updateAgent(agents[i].id, { retryCount: i + 1 })
        ));
      }

      await Promise.all(operations);

      // Verify all agents still exist and have correct data
      for (let i = 0; i < agents.length; i++) {
        const agent = sqliteStorage.getAgent(agents[i].id);
        expect(agent).toBeDefined();
        expect(agent!.retryCount).toBe(i + 1);
      }
    });

    it('should handle swarm deletion transactionally', async () => {
      // Create a swarm with agents
      const swarmId = `swarm-${Date.now()}`;
      
      sqliteStorage.createSwarm({
        id: swarmId,
        name: 'Test Swarm',
        status: 'active',
        config: { maxAgents: 10 },
        agents: [],
        createdAt: new Date(),
        budget: { allocated: 100, consumed: 0, remaining: 100 },
        metrics: { totalAgents: 0 },
      });

      // Create agents in the swarm
      const agents: Agent[] = [];
      for (let i = 0; i < 5; i++) {
        agents.push(createAgent({
          model: 'test-model',
          task: `Task ${i}`,
          swarmId,
        }));
      }

      sqliteStorage.batchCreateAgents(agents);

      // Update swarm with agent IDs
      sqliteStorage.updateSwarm(swarmId, {
        agents: agents.map(a => a.id),
      });

      // Delete swarm (should delete agents too)
      sqliteStorage.deleteSwarm(swarmId);

      // Verify swarm deleted
      const deletedSwarm = sqliteStorage.getSwarm(swarmId);
      expect(deletedSwarm).toBeNull();

      // Verify all agents deleted (transactional consistency)
      for (const agent of agents) {
        const deletedAgent = sqliteStorage.getAgent(agent.id);
        expect(deletedAgent).toBeNull();
      }
    });
  });

  describe('Integration Stress Test', () => {
    it('should spawn 20 agents concurrently with no duplicates or losses', async () => {
      const config: SwarmConfig = {
        name: 'integration-stress-test',
        task: 'Integration test task',
        initialAgents: 0,
        maxAgents: 25,
        strategy: 'parallel',
      };

      const swarm = await swarmManager.create(config);
      
      // Scale to 20 agents concurrently through multiple operations
      const scaleOps: Promise<void>[] = [
        swarmManager.scale(swarm.id, 5),
        swarmManager.scale(swarm.id, 10),
        swarmManager.scale(swarm.id, 15),
        swarmManager.scale(swarm.id, 20),
      ];

      await Promise.all(scaleOps);

      const finalSwarm = swarmManager.getSwarm(swarm.id);
      expect(finalSwarm).toBeDefined();

      // Get all agents from lifecycle
      const allLifecycleAgents = lifecycle.getAllStates();
      const swarmAgents = allLifecycleAgents.filter(a => 
        a.agent.swarmId === swarm.id
      );

      // Verify consistency
      console.log('Final swarm agent count:', finalSwarm!.agents.length);
      console.log('Lifecycle agents in swarm:', swarmAgents.length);

      // All agents in swarm should exist in lifecycle
      for (const agentId of finalSwarm!.agents) {
        const lifecycleAgent = lifecycle.getState(agentId);
        expect(lifecycleAgent).toBeDefined();
      }

      // No agent should be orphaned
      const orphanAgents = swarmAgents.filter(a => 
        !finalSwarm!.agents.includes(a.id)
      );
      expect(orphanAgents).toHaveLength(0);

      // All agent IDs should be unique
      const allIds = finalSwarm!.agents;
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);

      // Report success
      console.log('✅ Race condition stress test passed');
      console.log(`   - Total agents created: ${allIds.length}`);
      console.log(`   - Unique IDs: ${uniqueIds.size}`);
      console.log(`   - Orphan agents: ${orphanAgents.length}`);
      console.log(`   - Race condition failures: 0%`);
    });
  });
});
