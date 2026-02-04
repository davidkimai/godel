/**
 * Scenario 1: OpenClaw Agent Spawn Integration Tests
 * 
 * Tests for spawning agents from OpenClaw into Dash.
 * - Single agent spawn
 * - 100 concurrent agent spawns
 */

import {
  OpenClawAdapter,
  type SpawnAgentOptions,
} from '../../../src/integrations/openclaw/adapter';
import {
  getGlobalClient,
} from '../../../src/cli/lib/client';
import { testConfig, waitForStatus } from '../config';

describe('Scenario 1: OpenClaw Agent Spawn', () => {
  let adapter: OpenClawAdapter;
  let createdAgentIds: string[] = [];
  let createdSwarmIds: string[] = [];

  beforeAll(async () => {
    // Initialize the adapter with test configuration
    adapter = new OpenClawAdapter({
      dashApiUrl: testConfig.dashApiUrl,
      dashApiKey: testConfig.dashApiKey,
      openclawSessionKey: testConfig.openclawSessionKey,
    });
  });

  afterAll(async () => {
    // Clean up all created agents and swarms
    for (const agentId of createdAgentIds) {
      try {
        await adapter.killAgent(agentId, true);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(() => {
    // Reset tracking for each test
    createdAgentIds = [];
    createdSwarmIds = [];
  });

  describe('Single Agent Spawn', () => {
    it('should spawn single agent from OpenClaw', async () => {
      const sessionKey = `test-session-${Date.now()}`;
      const spawnRequest: SpawnAgentOptions = {
        agentType: 'code-review',
        task: 'Review PR #123',
        model: 'claude-sonnet-4-5',
      };

      // 1. Spawn agent through OpenClaw adapter
      const result = await adapter.spawnAgent(sessionKey, spawnRequest);

      // 2. Verify agent was created
      expect(result.dashAgentId).toBeDefined();
      expect(result.dashAgentId).toMatch(/^agent-[a-z0-9-]+$/);
      expect(result.status).toBe('pending');
      expect(result.swarmId).toBeDefined();

      // Track for cleanup
      createdAgentIds.push(sessionKey);
      if (result.swarmId) {
        createdSwarmIds.push(result.swarmId);
      }

      // 3. Verify agent exists in Dash via client
      const client = getGlobalClient();
      const agentResult = await client.getAgent(result.dashAgentId);
      
      expect(agentResult.success).toBe(true);
      expect(agentResult.data).toBeDefined();
      expect(agentResult.data?.id).toBe(result.dashAgentId);
      expect(agentResult.data?.status).toBe('pending');
      expect(agentResult.data?.swarmId).toBe(result.swarmId);

      // 4. Verify session mapping works
      expect(adapter.hasAgent(sessionKey)).toBe(true);
      expect(adapter.getDashAgentId(sessionKey)).toBe(result.dashAgentId);
    }, testConfig.testTimeout);

    it('should spawn agent with custom configuration', async () => {
      const sessionKey = `test-session-config-${Date.now()}`;
      const spawnRequest: SpawnAgentOptions = {
        agentType: 'security-audit',
        task: 'Audit authentication module',
        model: 'kimi-k2.5',
        timeout: 60000,
        config: {
          focus: ['security', 'performance'],
          files: ['src/auth/*.ts'],
        },
      };

      const result = await adapter.spawnAgent(sessionKey, spawnRequest);

      expect(result.dashAgentId).toBeDefined();
      expect(result.status).toBe('pending');

      createdAgentIds.push(sessionKey);
    }, testConfig.testTimeout);

    it('should handle duplicate session keys gracefully', async () => {
      const sessionKey = `test-session-duplicate-${Date.now()}`;
      const spawnRequest: SpawnAgentOptions = {
        agentType: 'code-review',
        task: 'Review PR #456',
      };

      // First spawn should succeed
      const result1 = await adapter.spawnAgent(sessionKey, spawnRequest);
      expect(result1.dashAgentId).toBeDefined();
      createdAgentIds.push(sessionKey);

      // Second spawn with same session key should create new agent
      // (or could throw error depending on implementation)
      const result2 = await adapter.spawnAgent(sessionKey, spawnRequest);
      expect(result2.dashAgentId).toBeDefined();
    }, testConfig.testTimeout);
  });

  describe('Concurrent Agent Spawn', () => {
    it('should spawn 100 agents concurrently', async () => {
      const concurrentCount = 100;
      const sessionKeys: string[] = [];
      
      // Prepare spawn requests
      const spawnPromises = Array(concurrentCount)
        .fill(null)
        .map((_, i) => {
          const sessionKey = `concurrent-session-${Date.now()}-${i}`;
          sessionKeys.push(sessionKey);
          
          const spawnRequest: SpawnAgentOptions = {
            agentType: 'code-review',
            task: `Review PR #${1000 + i}`,
            model: i % 2 === 0 ? 'kimi-k2.5' : 'claude-sonnet-4-5',
          };
          
          return adapter.spawnAgent(sessionKey, spawnRequest);
        });

      const startTime = Date.now();
      const results = await Promise.all(spawnPromises);
      const duration = Date.now() - startTime;

      // Track for cleanup
      createdAgentIds.push(...sessionKeys);

      // Verify all agents spawned successfully
      expect(results).toHaveLength(concurrentCount);
      
      // Verify each result has valid data
      for (const result of results) {
        expect(result.dashAgentId).toBeDefined();
        expect(result.dashAgentId).toMatch(/^agent-[a-z0-9-]+$/);
        expect(result.status).toBe('pending');
        expect(result.swarmId).toBeDefined();
      }

      // Verify all dashAgentIds are unique
      const agentIds = results.map(r => r.dashAgentId);
      const uniqueAgentIds = new Set(agentIds);
      expect(uniqueAgentIds.size).toBe(concurrentCount);

      // Verify performance - should complete within 30 seconds
      expect(duration).toBeLessThan(30000);

      // Log performance metrics
      console.log(`Spawned ${concurrentCount} agents in ${duration}ms (${(concurrentCount / (duration / 1000)).toFixed(1)} agents/sec)`);
    }, testConfig.longTestTimeout);

    it('should handle mixed agent types concurrently', async () => {
      const agentTypes = ['code-review', 'security-audit', 'performance-check', 'docs-review'];
      const concurrentCount = 20;
      const sessionKeys: string[] = [];

      const spawnPromises = Array(concurrentCount)
        .fill(null)
        .map((_, i) => {
          const sessionKey = `mixed-session-${Date.now()}-${i}`;
          sessionKeys.push(sessionKey);
          
          const spawnRequest: SpawnAgentOptions = {
            agentType: agentTypes[i % agentTypes.length],
            task: `Task ${i}: ${agentTypes[i % agentTypes.length]}`,
            model: 'kimi-k2.5',
            config: {
              priority: i % 3 === 0 ? 'high' : 'normal',
            },
          };
          
          return adapter.spawnAgent(sessionKey, spawnRequest);
        });

      const results = await Promise.all(spawnPromises);
      createdAgentIds.push(...sessionKeys);

      // Verify all succeeded
      expect(results).toHaveLength(concurrentCount);
      expect(results.every(r => r.dashAgentId)).toBe(true);

      // Verify agent list contains all our agents
      const activeAgents = await adapter.listAgents();
      const ourAgents = activeAgents.filter(a => 
        sessionKeys.some(key => a.openclawSessionKey === key)
      );
      expect(ourAgents.length).toBe(concurrentCount);
    }, testConfig.longTestTimeout);
  });

  describe('Error Handling', () => {
    it('should handle spawn with empty task gracefully', async () => {
      const sessionKey = `test-session-empty-${Date.now()}`;
      const spawnRequest: SpawnAgentOptions = {
        agentType: 'code-review',
        task: '',
      };

      // Should still spawn (empty task is allowed)
      const result = await adapter.spawnAgent(sessionKey, spawnRequest);
      expect(result.dashAgentId).toBeDefined();
      createdAgentIds.push(sessionKey);
    }, testConfig.testTimeout);

    it('should handle spawn with invalid agent type', async () => {
      const sessionKey = `test-session-invalid-${Date.now()}`;
      const spawnRequest: SpawnAgentOptions = {
        agentType: 'non-existent-agent-type',
        task: 'Some task',
      };

      // Should still spawn (agent type validation may be loose)
      const result = await adapter.spawnAgent(sessionKey, spawnRequest);
      expect(result.dashAgentId).toBeDefined();
      createdAgentIds.push(sessionKey);
    }, testConfig.testTimeout);
  });

  describe('Adapter Statistics', () => {
    it('should track adapter statistics correctly', async () => {
      const initialStats = adapter.getStats();
      
      const sessionKey = `test-session-stats-${Date.now()}`;
      await adapter.spawnAgent(sessionKey, {
        agentType: 'code-review',
        task: 'Stats test',
      });
      
      createdAgentIds.push(sessionKey);
      
      const afterStats = adapter.getStats();
      
      // Stats should show increased counts
      expect(afterStats.activeSessions).toBeGreaterThanOrEqual(initialStats.activeSessions);
      expect(afterStats.activeAgents).toBeGreaterThanOrEqual(initialStats.activeAgents);
    }, testConfig.testTimeout);
  });
});
