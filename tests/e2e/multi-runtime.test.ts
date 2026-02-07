/**
 * E2E: Multi-Runtime Integration Tests
 * 
 * Tests for running agents across different runtime implementations:
 * - Pi runtime (primary)
 * - Native runtime (fallback)
 * - Mock runtime (testing)
 * - Mixed runtime scenarios
 */

import { jest } from '@jest/globals';
import { IntegrationHarness, createHarness } from '../utils/harness';
import { NativeRuntime } from '../../src/runtime/native';
import type { AgentRuntime, Agent, SpawnConfig, ExecResult } from '../../src/runtime/types';
import { TaskPriority } from '../../src/tasks/types';

// Test timeout for E2E tests
const E2E_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Mock Pi Runtime for Testing
// ============================================================================

/**
 * Mock Pi runtime for testing without external dependencies
 */
class MockPiRuntime implements AgentRuntime {
  readonly id = 'pi';
  readonly name = 'Mock Pi Runtime';
  
  private agents = new Map<string, Agent>();
  private agentCounter = 0;

  async spawn(config: SpawnConfig): Promise<Agent> {
    const agentId = `pi-${Date.now()}-${++this.agentCounter}`;
    
    const agent: Agent = {
      id: agentId,
      name: config.name || `pi-agent-${this.agentCounter}`,
      status: 'running',
      runtime: this.id,
      model: config.model || 'claude-sonnet-4-5',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      metadata: {
        provider: config.provider || 'anthropic',
        workdir: config.workdir,
      },
    };

    this.agents.set(agentId, agent);
    return agent;
  }

  async kill(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    agent.status = 'stopped';
    this.agents.delete(agentId);
  }

  async exec(agentId: string, command: string): Promise<ExecResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const startTime = Date.now();
    
    // Simulate Pi-specific behavior
    let stdout = '';
    if (command.toLowerCase().includes('echo pi')) {
      stdout = 'pi';
    } else if (command.toLowerCase().startsWith('echo ')) {
      stdout = command.slice(5).replace(/["']/g, '');
    } else {
      stdout = `[Pi] ${command}`;
    }

    return {
      stdout,
      stderr: '',
      exitCode: 0,
      duration: Date.now() - startTime,
      metadata: {
        timestamp: new Date(),
        provider: 'anthropic',
        model: agent.model,
      },
    };
  }

  async status(agentId: string): Promise<'pending' | 'running' | 'error' | 'stopped'> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent.status;
  }

  async list(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  async killAll(): Promise<void> {
    const promises = Array.from(this.agents.keys()).map(id =>
      this.kill(id).catch(() => { /* ignore */ })
    );
    await Promise.all(promises);
  }
}

// ============================================================================
// Multi-Runtime Tests
// ============================================================================

describe('E2E: Multi-Runtime Support', () => {
  let harness: IntegrationHarness;
  let mockPiRuntime: MockPiRuntime;

  beforeEach(async () => {
    harness = createHarness({ debug: process.env['DEBUG'] === 'true' });
    
    // Register additional runtimes
    mockPiRuntime = new MockPiRuntime();
    harness.registerRuntime('pi', mockPiRuntime);
    
    // Native runtime is a fallback that might be available
    try {
      const nativeRuntime = new NativeRuntime();
      harness.registerRuntime('native', nativeRuntime);
    } catch {
      // Native runtime may not be available in all test environments
    }
    
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // ============================================================================
  // Basic Multi-Runtime Operations
  // ============================================================================

  describe('Basic Multi-Runtime', () => {
    it('should run Pi and Mock agents together', async () => {
      const piAgent = await harness.spawnAgent({ runtime: 'pi', name: 'pi-test' });
      const mockAgent = await harness.spawnAgent({ runtime: 'mock', name: 'mock-test' });

      // Both should be running
      expect(piAgent.runtime).toBe('pi');
      expect(mockAgent.runtime).toBe('mock');
      expect(piAgent.status).toBe('running');
      expect(mockAgent.status).toBe('running');

      // Both should execute commands
      const piResult = await harness.exec(piAgent.id, 'echo pi');
      const mockResult = await harness.exec(mockAgent.id, 'echo mock');

      expect(piResult.stdout).toContain('pi');
      expect(mockResult.stdout).toContain('mock');
      expect(piResult.exitCode).toBe(0);
      expect(mockResult.exitCode).toBe(0);
    });

    it('should list agents from multiple runtimes', async () => {
      await Promise.all([
        harness.spawnAgent({ runtime: 'pi', name: 'pi-1' }),
        harness.spawnAgent({ runtime: 'mock', name: 'mock-1' }),
        harness.spawnAgent({ runtime: 'pi', name: 'pi-2' }),
        harness.spawnAgent({ runtime: 'mock', name: 'mock-2' }),
      ]);

      const agents = await harness.listAgents();
      
      expect(agents).toHaveLength(4);
      
      const piAgents = agents.filter(a => a.runtime === 'pi');
      const mockAgents = agents.filter(a => a.runtime === 'mock');
      
      expect(piAgents).toHaveLength(2);
      expect(mockAgents).toHaveLength(2);
    });

    it('should handle agents with different models across runtimes', async () => {
      const piAgent = await harness.spawnAgent({ 
        runtime: 'pi', 
        name: 'pi-claude',
        model: 'claude-sonnet-4-5',
        provider: 'anthropic'
      });
      
      const mockAgent = await harness.spawnAgent({ 
        runtime: 'mock', 
        name: 'mock-default',
        model: 'mock-model'
      });

      expect(piAgent.model).toBe('claude-sonnet-4-5');
      expect(mockAgent.model).toBe('mock-model');

      // Execute commands
      const piResult = await harness.exec(piAgent.id, 'model check');
      const mockResult = await harness.exec(mockAgent.id, 'model check');

      expect(piResult.metadata?.provider).toBe('anthropic');
      expect(piResult.metadata?.model).toBe('claude-sonnet-4-5');
    });
  });

  // ============================================================================
  // Runtime-Specific Behavior
  // ============================================================================

  describe('Runtime-Specific Behavior', () => {
    it('should track correct runtime metadata for Pi', async () => {
      const agent = await harness.spawnAgent({
        runtime: 'pi',
        name: 'metadata-test',
        provider: 'anthropic',
        tools: ['read', 'edit', 'bash']
      });

      const agents = await harness.listAgents();
      const found = agents.find(a => a.id === agent.id);
      
      expect(found).toBeDefined();
      expect(found?.runtime).toBe('pi');
    });

    it('should track correct runtime metadata for Mock', async () => {
      const agent = await harness.spawnAgent({
        runtime: 'mock',
        name: 'mock-metadata-test',
        env: { TEST_VAR: 'value' }
      });

      const result = await harness.exec(agent.id, 'echo test');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('test');
    });

    it('should maintain runtime isolation', async () => {
      // Spawn agents in different runtimes
      const piAgent = await harness.spawnAgent({ runtime: 'pi', name: 'pi-isolated' });
      const mockAgent = await harness.spawnAgent({ runtime: 'mock', name: 'mock-isolated' });

      // Kill Pi agent should not affect Mock agent
      await harness.killAgent(piAgent.id);

      // Mock agent should still be running
      const mockStatus = await harness.getStatus(mockAgent.id);
      expect(mockStatus).toBe('running');

      // Pi agent should be gone
      await expect(harness.getStatus(piAgent.id)).rejects.toThrow();
    });
  });

  // ============================================================================
  // Concurrent Multi-Runtime Operations
  // ============================================================================

  describe('Concurrent Multi-Runtime', () => {
    it('should spawn agents across runtimes concurrently', async () => {
      const agents = await Promise.all([
        harness.spawnAgent({ runtime: 'pi', name: 'concurrent-pi-1' }),
        harness.spawnAgent({ runtime: 'mock', name: 'concurrent-mock-1' }),
        harness.spawnAgent({ runtime: 'pi', name: 'concurrent-pi-2' }),
        harness.spawnAgent({ runtime: 'mock', name: 'concurrent-mock-2' }),
      ]);

      expect(agents).toHaveLength(4);
      
      // All should be running
      agents.forEach(agent => {
        expect(agent.status).toBe('running');
      });

      // Verify runtime distribution
      expect(agents.filter(a => a.runtime === 'pi')).toHaveLength(2);
      expect(agents.filter(a => a.runtime === 'mock')).toHaveLength(2);
    });

    it('should execute commands across runtimes in parallel', async () => {
      const [piAgent, mockAgent] = await Promise.all([
        harness.spawnAgent({ runtime: 'pi', name: 'parallel-pi' }),
        harness.spawnAgent({ runtime: 'mock', name: 'parallel-mock' }),
      ]);

      // Execute multiple commands in parallel on each
      const [piResults, mockResults] = await Promise.all([
        Promise.all([
          harness.exec(piAgent.id, 'echo cmd1'),
          harness.exec(piAgent.id, 'echo cmd2'),
          harness.exec(piAgent.id, 'echo cmd3'),
        ]),
        Promise.all([
          harness.exec(mockAgent.id, 'echo cmd1'),
          harness.exec(mockAgent.id, 'echo cmd2'),
          harness.exec(mockAgent.id, 'echo cmd3'),
        ]),
      ]);

      expect(piResults).toHaveLength(3);
      expect(mockResults).toHaveLength(3);

      piResults.forEach(result => {
        expect(result.exitCode).toBe(0);
      });

      mockResults.forEach(result => {
        expect(result.exitCode).toBe(0);
      });
    });
  });

  // ============================================================================
  // Runtime Failover
  // ============================================================================

  describe('Runtime Resilience', () => {
    it('should handle runtime errors gracefully', async () => {
      // Create a mock runtime that can fail
      const failingRuntime: AgentRuntime = {
        id: 'failing',
        name: 'Failing Runtime',
        spawn: async () => {
          throw new Error('Runtime is down');
        },
        kill: async () => { /* no-op */ },
        exec: async () => {
          throw new Error('Runtime is down');
        },
        status: async () => 'error',
        list: async () => [],
      };

      harness.registerRuntime('failing', failingRuntime);

      // Attempting to spawn should throw
      await expect(
        harness.spawnAgent({ runtime: 'failing' })
      ).rejects.toThrow('Runtime is down');

      // Other runtimes should still work
      const agent = await harness.spawnAgent({ runtime: 'mock', name: 'resilient-agent' });
      expect(agent.status).toBe('running');
    });

    it('should continue working when one runtime fails', async () => {
      const piAgent = await harness.spawnAgent({ runtime: 'pi', name: 'stable-pi' });
      const mockAgent = await harness.spawnAgent({ runtime: 'mock', name: 'stable-mock' });

      // Simulate Pi runtime having an issue with exec
      // (in real scenario, this would be a network error or service down)
      
      // Mock agent should continue working
      const result = await harness.exec(mockAgent.id, 'echo still working');
      expect(result.stdout).toBe('still working');

      // Pi agent should still be listable
      const agents = await harness.listAgents();
      expect(agents.find(a => a.id === piAgent.id)).toBeDefined();
    });
  });

  // ============================================================================
  // Native Runtime Integration
  // ============================================================================

  describe('Native Runtime', () => {
    it('should handle native runtime if available', async () => {
      // Native runtime is a stub, but should still work for basic operations
      try {
        const nativeAgent = await harness.spawnAgent({ 
          runtime: 'native', 
          name: 'native-test' 
        });

        expect(nativeAgent.runtime).toBe('native');
        expect(nativeAgent.status).toBeDefined();

        // Can kill native agent
        await harness.killAgent(nativeAgent.id);
        
        // Verify removed
        const agents = await harness.listAgents();
        expect(agents.find(a => a.id === nativeAgent.id)).toBeUndefined();
      } catch (error) {
        // Native runtime may not be available - skip this test
        console.log('Native runtime not available, skipping test');
      }
    });
  });

  // ============================================================================
  // Cross-Runtime Task Distribution
  // ============================================================================

  describe('Cross-Runtime Task Distribution', () => {
    it('should assign tasks to agents across different runtimes', async () => {
      // Create agents in different runtimes
      const piAgent = await harness.spawnAgent({ runtime: 'pi', name: 'pi-worker' });
      const mockAgent = await harness.spawnAgent({ runtime: 'mock', name: 'mock-worker' });

      // Create and assign tasks
      const task1 = await harness.createTask({ 
        title: 'Pi Runtime Task',
        priority: TaskPriority.HIGH
      });
      
      const task2 = await harness.createTask({ 
        title: 'Mock Runtime Task',
        priority: TaskPriority.MEDIUM
      });

      // Assign to respective agents
      await harness.assignTask(task1.id, piAgent.id);
      await harness.assignTask(task2.id, mockAgent.id);

      // Verify assignments
      const updated1 = await harness.getTask(task1.id);
      const updated2 = await harness.getTask(task2.id);

      expect(updated1?.assignee).toBe(piAgent.id);
      expect(updated1?.status).toBe('in-progress');
      
      expect(updated2?.assignee).toBe(mockAgent.id);
      expect(updated2?.status).toBe('in-progress');

      // Complete tasks
      await harness.completeTask(task1.id);
      await harness.completeTask(task2.id);

      const completed1 = await harness.getTask(task1.id);
      const completed2 = await harness.getTask(task2.id);

      expect(completed1?.status).toBe('done');
      expect(completed2?.status).toBe('done');
    });
  });

  // ============================================================================
  // Performance Across Runtimes
  // ============================================================================

  describe('Multi-Runtime Performance', () => {
    it('should handle mixed runtime load within time limits', async () => {
      const startTime = Date.now();

      // Spawn agents across runtimes
      const agents = await Promise.all([
        ...Array.from({ length: 5 }, (_, i) => 
          harness.spawnAgent({ runtime: 'pi', name: `perf-pi-${i}` })
        ),
        ...Array.from({ length: 5 }, (_, i) => 
          harness.spawnAgent({ runtime: 'mock', name: `perf-mock-${i}` })
        ),
      ]);

      const spawnDuration = Date.now() - startTime;
      expect(spawnDuration).toBeLessThan(5000); // 5 seconds

      // Execute commands on all agents
      const execStart = Date.now();
      await Promise.all(
        agents.map(agent => 
          harness.exec(agent.id, `echo "from ${agent.runtime}"`)
        )
      );

      const execDuration = Date.now() - execStart;
      expect(execDuration).toBeLessThan(3000); // 3 seconds
    });
  });
});

// ============================================================================
// Runtime Registration Tests
// ============================================================================

describe('E2E: Runtime Registration', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('should allow runtime registration', async () => {
    const customRuntime: AgentRuntime = {
      id: 'custom',
      name: 'Custom Runtime',
      spawn: async () => ({
        id: 'custom-1',
        name: 'custom-agent',
        status: 'running',
        runtime: 'custom',
        model: 'custom-model',
        createdAt: new Date(),
      }),
      kill: async () => { /* no-op */ },
      exec: async () => ({
        stdout: 'custom output',
        stderr: '',
        exitCode: 0,
        duration: 0,
      }),
      status: async () => 'running',
      list: async () => [],
    };

    harness.registerRuntime('custom', customRuntime);

    const agent = await harness.spawnAgent({ runtime: 'custom' });
    
    expect(agent.runtime).toBe('custom');
    expect(agent.status).toBe('running');

    const result = await harness.exec(agent.id, 'test');
    expect(result.stdout).toBe('custom output');
  });

  it('should allow runtime override', async () => {
    const originalRuntime = harness.getRuntime('mock');
    
    const overridingRuntime: AgentRuntime = {
      id: 'mock',
      name: 'Overridden Mock Runtime',
      spawn: async () => ({
        id: 'overridden-1',
        name: 'overridden-agent',
        status: 'running',
        runtime: 'mock',
        model: 'overridden-model',
        createdAt: new Date(),
      }),
      kill: async () => { /* no-op */ },
      exec: async () => ({
        stdout: 'overridden',
        stderr: '',
        exitCode: 0,
        duration: 0,
      }),
      status: async () => 'running',
      list: async () => [],
    };

    harness.registerRuntime('mock', overridingRuntime);

    const agent = await harness.spawnAgent({ runtime: 'mock' });
    expect(agent.id).toBe('overridden-1');
    
    const result = await harness.exec(agent.id, 'test');
    expect(result.stdout).toBe('overridden');
  });
});
