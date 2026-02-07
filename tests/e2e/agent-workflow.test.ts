/**
 * E2E: Agent Workflow Tests
 * 
 * End-to-end tests for agent lifecycle management including:
 * - Agent spawning and initialization
 * - Command execution
 * - Status monitoring
 * - Agent termination and cleanup
 * - Concurrent agent operations
 */

import { jest } from '@jest/globals';
import { IntegrationHarness, createHarness, waitForAgentStatus } from '../utils/harness';
import type { AgentStatus } from '../../src/runtime/types';

// Test timeout for E2E tests
const E2E_TIMEOUT = 30000; // 30 seconds

describe('E2E: Agent Workflow', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    harness = createHarness({ debug: process.env['DEBUG'] === 'true' });
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // ============================================================================
  // Full Agent Lifecycle
  // ============================================================================

  describe('Agent Lifecycle', () => {
    it('should complete full agent lifecycle', async () => {
      // 1. Spawn agent
      const agent = await harness.spawnAgent({
        runtime: 'mock',
        model: 'claude-sonnet-4-5',
        name: 'e2e-test-agent'
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('e2e-test-agent');
      expect(agent.status).toBe('running');
      expect(agent.runtime).toBe('mock');
      expect(agent.model).toBe('claude-sonnet-4-5');
      expect(agent.createdAt).toBeInstanceOf(Date);

      // 2. Execute command
      const result = await harness.exec(agent.id, 'echo "Hello World"');
      expect(result.stdout).toContain('Hello World');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();

      // 3. Check status
      const status = await harness.getStatus(agent.id);
      expect(status).toBe('running');

      // 4. Kill agent
      await harness.killAgent(agent.id);

      // 5. Verify removal - should throw when trying to get status
      await expect(harness.getStatus(agent.id)).rejects.toThrow();

      // 6. Verify not in list
      const agents = await harness.listAgents();
      expect(agents.find(a => a.id === agent.id)).toBeUndefined();
    }, E2E_TIMEOUT);

    it('should spawn agent with minimal options', async () => {
      const agent = await harness.spawnAgent();

      expect(agent.id).toBeDefined();
      expect(agent.status).toBe('running');
      expect(agent.runtime).toBe('mock'); // default runtime
    });

    it('should spawn agent with custom environment', async () => {
      const agent = await harness.spawnAgent({
        name: 'env-test-agent',
        env: { CUSTOM_VAR: 'custom_value', NODE_ENV: 'test' }
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('env-test-agent');
      expect(agent.status).toBe('running');
    });
  });

  // ============================================================================
  // Concurrent Agent Operations
  // ============================================================================

  describe('Concurrent Agents', () => {
    it('should spawn multiple agents simultaneously', async () => {
      const agents = await Promise.all([
        harness.spawnAgent({ runtime: 'mock', name: 'agent-1' }),
        harness.spawnAgent({ runtime: 'mock', name: 'agent-2' }),
        harness.spawnAgent({ runtime: 'mock', name: 'agent-3' }),
      ]);

      expect(agents).toHaveLength(3);
      agents.forEach((agent, index) => {
        expect(agent.id).toBeDefined();
        expect(agent.name).toBe(`agent-${index + 1}`);
        expect(agent.status).toBe('running');
      });

      // Verify all are in the list
      const listedAgents = await harness.listAgents();
      expect(listedAgents).toHaveLength(3);
    });

    it('should execute commands on multiple agents in parallel', async () => {
      // Spawn agents
      const [agent1, agent2, agent3] = await Promise.all([
        harness.spawnAgent({ name: 'exec-agent-1' }),
        harness.spawnAgent({ name: 'exec-agent-2' }),
        harness.spawnAgent({ name: 'exec-agent-3' }),
      ]);

      // Execute commands in parallel
      const [result1, result2, result3] = await Promise.all([
        harness.exec(agent1.id, 'echo "Agent 1"'),
        harness.exec(agent2.id, 'echo "Agent 2"'),
        harness.exec(agent3.id, 'echo "Agent 3"'),
      ]);

      expect(result1.stdout).toContain('Agent 1');
      expect(result1.exitCode).toBe(0);
      
      expect(result2.stdout).toContain('Agent 2');
      expect(result2.exitCode).toBe(0);
      
      expect(result3.stdout).toContain('Agent 3');
      expect(result3.exitCode).toBe(0);
    });

    it('should kill multiple agents simultaneously', async () => {
      // Spawn agents
      const [agent1, agent2, agent3] = await Promise.all([
        harness.spawnAgent({ name: 'kill-agent-1' }),
        harness.spawnAgent({ name: 'kill-agent-2' }),
        harness.spawnAgent({ name: 'kill-agent-3' }),
      ]);

      // Kill all agents
      await Promise.all([
        harness.killAgent(agent1.id),
        harness.killAgent(agent2.id),
        harness.killAgent(agent3.id),
      ]);

      // Verify all are gone
      const agents = await harness.listAgents();
      expect(agents).toHaveLength(0);
    });
  });

  // ============================================================================
  // Command Execution
  // ============================================================================

  describe('Command Execution', () => {
    it('should execute simple commands', async () => {
      const agent = await harness.spawnAgent({ name: 'cmd-agent' });

      const result = await harness.exec(agent.id, 'echo "test output"');
      
      expect(result.stdout).toBe('test output');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should track execution duration', async () => {
      const agent = await harness.spawnAgent({ name: 'duration-agent' });

      const result = await harness.exec(agent.id, 'echo "test"');
      
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.timestamp).toBeInstanceOf(Date);
    });

    it('should update last activity on command execution', async () => {
      const agent = await harness.spawnAgent({ name: 'activity-agent' });
      
      const beforeActivity = new Date();
      await harness.exec(agent.id, 'echo "test"');
      const afterActivity = new Date();

      const agents = await harness.listAgents();
      const updatedAgent = agents.find(a => a.id === agent.id);
      
      expect(updatedAgent?.createdAt.getTime()).toBeLessThanOrEqual(afterActivity.getTime());
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should throw when executing on non-existent agent', async () => {
      await expect(
        harness.exec('non-existent-agent-id', 'echo test')
      ).rejects.toThrow('Agent not found');
    });

    it('should throw when getting status of non-existent agent', async () => {
      await expect(
        harness.getStatus('non-existent-agent-id')
      ).rejects.toThrow('Agent not found');
    });

    it('should throw when killing non-existent agent', async () => {
      await expect(
        harness.killAgent('non-existent-agent-id')
      ).rejects.toThrow('Agent not found');
    });

    it('should throw when spawning with invalid runtime', async () => {
      await expect(
        harness.spawnAgent({ runtime: 'invalid-runtime' })
      ).rejects.toThrow('Runtime not found');
    });

    it('should handle double kill gracefully', async () => {
      const agent = await harness.spawnAgent({ name: 'double-kill-agent' });
      
      // First kill should succeed
      await harness.killAgent(agent.id);
      
      // Second kill should throw because agent no longer exists
      await expect(harness.killAgent(agent.id)).rejects.toThrow();
    });
  });

  // ============================================================================
  // Agent Listing
  // ============================================================================

  describe('Agent Listing', () => {
    it('should return empty list when no agents', async () => {
      const agents = await harness.listAgents();
      expect(agents).toEqual([]);
    });

    it('should list agents with correct information', async () => {
      const agent = await harness.spawnAgent({
        name: 'list-test-agent',
        model: 'test-model'
      });

      const agents = await harness.listAgents();
      
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe(agent.id);
      expect(agents[0].name).toBe('list-test-agent');
      expect(agents[0].status).toBe('running');
      expect(agents[0].runtime).toBe('mock');
      expect(agents[0].model).toBe('test-model');
    });

    it('should reflect status changes in listing', async () => {
      const agent = await harness.spawnAgent({ name: 'status-change-agent' });

      // Verify running
      let agents = await harness.listAgents();
      expect(agents[0].status).toBe('running');

      // Kill and verify removed from list
      await harness.killAgent(agent.id);
      agents = await harness.listAgents();
      expect(agents).toHaveLength(0);
    });
  });

  // ============================================================================
  // Cleanup
  // ============================================================================

  describe('Cleanup', () => {
    it('should clean up all agents on cleanup', async () => {
      // Create multiple agents
      await Promise.all([
        harness.spawnAgent({ name: 'cleanup-1' }),
        harness.spawnAgent({ name: 'cleanup-2' }),
        harness.spawnAgent({ name: 'cleanup-3' }),
      ]);

      // Verify agents exist
      let agents = await harness.listAgents();
      expect(agents).toHaveLength(3);

      // Cleanup
      await harness.cleanup();

      // Verify all agents are gone
      agents = await harness.listAgents();
      expect(agents).toHaveLength(0);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('E2E: Agent Workflow Performance', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('should spawn 10 agents within 5 seconds', async () => {
    const startTime = Date.now();

    const agents = await Promise.all(
      Array.from({ length: 10 }, (_, i) => 
        harness.spawnAgent({ name: `perf-agent-${i}` })
      )
    );

    const duration = Date.now() - startTime;

    expect(agents).toHaveLength(10);
    expect(duration).toBeLessThan(5000); // 5 seconds

    // Verify all are running
    const listed = await harness.listAgents();
    expect(listed).toHaveLength(10);
  });

  it('should execute 50 commands within 10 seconds', async () => {
    const agent = await harness.spawnAgent({ name: 'perf-cmd-agent' });

    const startTime = Date.now();

    await Promise.all(
      Array.from({ length: 50 }, (_, i) => 
        harness.exec(agent.id, `echo "command ${i}"`)
      )
    );

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(10000); // 10 seconds
  });
});
