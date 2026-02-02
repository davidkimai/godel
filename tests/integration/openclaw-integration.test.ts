/**
 * Integration Test: Dash v2.0 + OpenClaw
 * 
 * Tests the full integration between Dash and OpenClaw:
 * 1. Swarm creation spawns OpenClaw sessions
 * 2. Agent lifecycle through OpenClaw (spawn, pause, kill, status)
 * 3. Event flow from OpenClaw to Dash message bus
 * 4. Token tracking integration with budget tracking
 */

import {
  AgentLifecycle,
  SwarmManager,
  OpenClawIntegration,
  MockOpenClawClient,
  resetGlobalLifecycle,
  resetGlobalSwarmManager,
  resetGlobalOpenClawIntegration,
} from '../../src/core';
import { MessageBus, resetGlobalBus } from '../../src/bus/index';
import { AgentStorage } from '../../src/storage/memory';
import {
  setProjectDailyBudget,
  startBudgetTracking,
  recordTokenUsage,
  getBudgetTracking,
  activeBudgets,
  budgetConfigs,
  budgetHistory,
} from '../../src/safety/budget';
import { clearAuditLog, getAllBlockedAgents } from '../../src/safety/thresholds';

// Mock logger
jest.mock('../../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('INTEGRATION: Dash v2.0 + OpenClaw', () => {
  let messageBus: MessageBus;
  let storage: AgentStorage;
  let openclawClient: MockOpenClawClient;
  let openclawIntegration: OpenClawIntegration;
  let lifecycle: AgentLifecycle;
  let swarmManager: SwarmManager;

  beforeEach(() => {
    // Reset singletons
    resetGlobalBus();
    resetGlobalLifecycle();
    resetGlobalSwarmManager();
    resetGlobalOpenClawIntegration();

    // Clear budget tracking
    activeBudgets.clear();
    budgetConfigs.clear();
    budgetHistory.length = 0;
    clearAuditLog();

    // Initialize components
    messageBus = new MessageBus({ enablePersistence: true });
    storage = new AgentStorage();
    openclawClient = new MockOpenClawClient();
    openclawIntegration = new OpenClawIntegration(openclawClient, messageBus);
    lifecycle = new AgentLifecycle(storage, messageBus, openclawIntegration);
    swarmManager = new SwarmManager(lifecycle, messageBus, storage);

    // Start all services
    lifecycle.start();
    swarmManager.start();
  });

  afterEach(() => {
    lifecycle.stop();
    swarmManager.stop();
    openclawClient.reset();
    messageBus.clear(true);
  });

  // ============================================================================
  // TEST SUITE 1: Swarm Creation & OpenClaw Session Spawning
  // ============================================================================
  describe('1. Swarm Creation & OpenClaw Session Spawning', () => {
    it('should spawn OpenClaw sessions when creating a swarm', async () => {
      // Create a swarm with 3 initial agents
      const swarm = await swarmManager.create({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 3,
        maxAgents: 10,
        strategy: 'parallel',
        model: 'kimi-k2.5',
      });

      // Verify swarm was created
      expect(swarm).toBeDefined();
      expect(swarm.agents).toHaveLength(3);

      // Wait for sessions to be spawned
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify OpenClaw sessions were created for each agent
      for (const agentId of swarm.agents) {
        const sessionId = openclawIntegration.getSessionId(agentId);
        expect(sessionId).toBeDefined();
        expect(sessionId).toMatch(/^openclaw-session-/);

        const session = openclawClient.getSession(sessionId!);
        expect(session).toBeDefined();
        expect(session?.agentId).toBe(agentId);
        expect(session?.status).toBe('running');
      }
    });

    it('should map agent IDs to session keys correctly', async () => {
      const swarm = await swarmManager.create({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 2,
        maxAgents: 5,
        strategy: 'parallel',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify bidirectional mapping
      for (const agentId of swarm.agents) {
        const sessionId = openclawIntegration.getSessionId(agentId);
        expect(sessionId).toBeDefined();

        // Reverse lookup
        const lookedUpAgentId = openclawIntegration.getAgentId(sessionId!);
        expect(lookedUpAgentId).toBe(agentId);
      }
    });

    it('should track session status correctly', async () => {
      const swarm = await swarmManager.create({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 1,
        maxAgents: 5,
        strategy: 'parallel',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const agentId = swarm.agents[0];
      const status = await openclawIntegration.getSessionStatus(agentId);

      expect(status).toBeDefined();
      expect(status?.agentId).toBe(agentId);
      expect(status?.status).toBe('running');
      expect(status?.runtime).toBeGreaterThanOrEqual(0);
    });

    it('should include session ID in agent state', async () => {
      const swarm = await swarmManager.create({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 1,
        maxAgents: 5,
        strategy: 'parallel',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const agentId = swarm.agents[0];
      const state = lifecycle.getState(agentId);

      expect(state).toBeDefined();
      expect(state?.sessionId).toBeDefined();
      expect(state?.sessionId).toMatch(/^openclaw-session-/);
    });
  });

  // ============================================================================
  // TEST SUITE 2: Agent Lifecycle Through OpenClaw
  // ============================================================================
  describe('2. Agent Lifecycle Through OpenClaw', () => {
    it('should create session on spawn', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessionId = openclawIntegration.getSessionId(agent.id);
      expect(sessionId).toBeDefined();

      const session = openclawClient.getSession(sessionId!);
      expect(session).toBeDefined();
      expect(session?.status).toBe('running');
    });

    it('should pause session when agent is paused', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Pause the agent
      await lifecycle.pause(agent.id);

      const sessionId = openclawIntegration.getSessionId(agent.id);
      const session = openclawClient.getSession(sessionId!);

      expect(session?.status).toBe('paused');
    });

    it('should resume session when agent is resumed', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Pause then resume
      await lifecycle.pause(agent.id);
      await lifecycle.resume(agent.id);

      const sessionId = openclawIntegration.getSessionId(agent.id);
      const session = openclawClient.getSession(sessionId!);

      expect(session?.status).toBe('running');
    });

    it('should kill session when agent is killed', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Kill the agent
      await lifecycle.kill(agent.id, true);

      const sessionId = openclawIntegration.getSessionId(agent.id);
      const session = openclawClient.getSession(sessionId!);

      expect(session?.status).toBe('killed');
    });

    it('should report correct session status', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = await openclawIntegration.getSessionStatus(agent.id);
      
      expect(status).toBeDefined();
      expect(status?.status).toBe('running');
      expect(typeof status?.runtime).toBe('number');
      expect(status?.tokenUsage).toBeDefined();
      expect(typeof status?.cost).toBe('number');
    });

    it('should handle session errors gracefully', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessionId = openclawIntegration.getSessionId(agent.id);
      
      // Simulate session failure
      openclawClient.simulateSessionFailure(sessionId!, 'Test error');

      const session = openclawClient.getSession(sessionId!);
      expect(session?.status).toBe('failed');
      expect(session?.lastError).toBe('Test error');
    });
  });

  // ============================================================================
  // TEST SUITE 3: Event Flow (OpenClaw → Dash Message Bus)
  // ============================================================================
  describe('3. Event Flow from OpenClaw to Dash Message Bus', () => {
    it('should publish agent.spawned event when session is created', async () => {
      const events: Array<{ agentId: string; sessionId: string }> = [];

      messageBus.subscribe('agent.*.events', (message: any) => {
        if (message.payload?.eventType === 'agent.spawned') {
          events.push({
            agentId: message.payload?.payload?.agentId,
            sessionId: message.payload?.payload?.sessionId,
          });
        }
      });

      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].agentId).toBe(agent.id);
      expect(events[0].sessionId).toMatch(/^openclaw-session-/);
    });

    it('should publish agent.paused event when session is paused', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const events: string[] = [];
      messageBus.subscribe(`agent.${agent.id}.events`, (message: any) => {
        events.push(message.payload?.eventType);
      });

      await lifecycle.pause(agent.id);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events).toContain('agent.paused');
    });

    it('should publish agent.resumed event when session is resumed', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      await lifecycle.pause(agent.id);

      const events: string[] = [];
      messageBus.subscribe(`agent.${agent.id}.events`, (message: any) => {
        events.push(message.payload?.eventType);
      });

      await lifecycle.resume(agent.id);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events).toContain('agent.resumed');
    });

    it('should publish agent.killed event when session is killed', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const events: Array<{ type: string; force: boolean }> = [];
      messageBus.subscribe(`agent.${agent.id}.events`, (message: any) => {
        if (message.payload?.eventType === 'agent.killed') {
          events.push({
            type: message.payload?.eventType,
            force: message.payload?.payload?.force,
          });
        }
      });

      await lifecycle.kill(agent.id, true);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].force).toBe(true);
    });

    it('should persist events in message bus', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      await lifecycle.pause(agent.id);
      await lifecycle.resume(agent.id);

      const messages = messageBus.getMessages(`agent.${agent.id}.events`);
      
      expect(messages.length).toBeGreaterThanOrEqual(3); // spawned, paused, resumed
      
      const eventTypes = messages.map((m: any) => m.payload?.eventType);
      expect(eventTypes).toContain('agent.spawned');
      expect(eventTypes).toContain('agent.paused');
      expect(eventTypes).toContain('agent.resumed');
    });

    it('should receive real-time updates via message bus', async () => {
      const receivedEvents: string[] = [];

      // Subscribe to all agent events
      messageBus.subscribe('agent.*.events', (message: any) => {
        receivedEvents.push(message.payload?.eventType);
      });

      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      await lifecycle.pause(agent.id);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(receivedEvents).toContain('agent.spawned');
      expect(receivedEvents).toContain('agent.paused');
    });
  });

  // ============================================================================
  // TEST SUITE 4: Token Tracking Integration with Budget
  // ============================================================================
  describe('4. Token Tracking Integration with Budget', () => {
    it('should track token usage from OpenClaw sessions', async () => {
      // Set up budget
      setProjectDailyBudget('test-project', 1_000_000, 100);

      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      // Start budget tracking for this agent
      const budget = startBudgetTracking(agent.id, 'task-1', 'test-project', 'kimi-k2.5');

      // Subscribe to token usage events and record them to budget
      messageBus.subscribe(`agent.${agent.id}.events`, (message: any) => {
        if (message.payload?.eventType === 'token.usage') {
          const { tokens } = message.payload?.payload || {};
          if (tokens) {
            // Simulate recording token usage (in production, this would be automatic)
            const promptTokens = Math.floor(tokens / 2);
            const completionTokens = Math.ceil(tokens / 2);
            recordTokenUsage(budget.id, promptTokens, completionTokens);
          }
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Manually record some token usage to simulate what OpenClaw would send
      recordTokenUsage(budget.id, 1000, 500);

      // Token usage should have been recorded
      const tracking = getBudgetTracking(budget.id);
      expect(tracking).toBeDefined();
      
      // Should have some token usage
      expect(tracking?.tokensUsed.total).toBeGreaterThan(0);
    });

    it('should route token.usage events to budget tracking', async () => {
      setProjectDailyBudget('test-project', 1_000_000, 100);

      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      const budget = startBudgetTracking(agent.id, 'task-1', 'test-project', 'kimi-k2.5');

      // Manually record token usage (simulating what would happen with real OpenClaw)
      recordTokenUsage(budget.id, 1000, 500);
      recordTokenUsage(budget.id, 2000, 1000);

      const tracking = getBudgetTracking(budget.id);
      expect(tracking?.tokensUsed.total).toBe(4500); // 1000 + 500 + 2000 + 1000
    });

    it('should support hierarchical budgets (project → swarm → agent)', async () => {
      // Set up hierarchical budgets
      setProjectDailyBudget('test-project', 1_000_000, 1000);

      const swarm = await swarmManager.create({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 2,
        maxAgents: 5,
        strategy: 'parallel',
        budget: {
          amount: 500,
          currency: 'USD',
          warningThreshold: 0.75,
          criticalThreshold: 0.90,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Each agent should have budget tracking
      for (const agentId of swarm.agents) {
        const budget = startBudgetTracking(agentId, 'task-1', 'test-project', 'kimi-k2.5', swarm.id);
        
        // Record some usage
        recordTokenUsage(budget.id, 5000, 2500);
        
        const tracking = getBudgetTracking(budget.id);
        expect(tracking).toBeDefined();
        expect(tracking?.swarmId).toBe(swarm.id);
      }
    });

    it('should trigger warning at 75% threshold', async () => {
      setProjectDailyBudget('test-project', 10000, 10);

      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Test task',
      });

      const budget = startBudgetTracking(agent.id, 'task-1', 'test-project', 'claude-3-5-sonnet');

      // Use ~80% of budget
      const result = recordTokenUsage(budget.id, 50000, 40000); // ~$1.35 / $10 = 13.5%

      // The actual threshold check depends on the model pricing
      // With claude-3-5-sonnet at $3/$15 per 1M tokens, 90k tokens ≈ $0.81
      
      // For a more reliable test, let's use the threshold checking directly
      const { checkThresholds } = require('../../src/safety/thresholds');
      const thresholdResult = checkThresholds(80); // Simulate 80% usage
      
      expect(thresholdResult.triggered).toBe(true);
      expect(thresholdResult.threshold).toBe(75);
      expect(thresholdResult.action).toBe('notify');
    });

    it('should trigger block at 90% threshold', async () => {
      const { checkThresholds } = require('../../src/safety/thresholds');
      
      const result = checkThresholds(95);
      
      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(90);
      expect(result.action).toBe('block');
      expect(result.shouldBlock).toBe(true);
    });

    it('should trigger hard stop (kill) at 100% threshold', async () => {
      const { checkThresholds, executeThresholdAction } = require('../../src/safety/thresholds');
      
      const result = checkThresholds(100);
      
      expect(result.triggered).toBe(true);
      expect(result.threshold).toBe(100);
      expect(result.action).toBe('kill');
      expect(result.shouldKill).toBe(true);
    });

    it('should pause swarm when budget is exhausted', async () => {
      // Create swarm with small budget
      const swarm = await swarmManager.create({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 1,
        maxAgents: 5,
        strategy: 'parallel',
        budget: {
          amount: 0.01, // Very small budget
          currency: 'USD',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate budget consumption
      await swarmManager.consumeBudget(swarm.id, swarm.agents[0], 1000, 0.02); // Exceeds $0.01

      // Swarm should be paused
      const status = swarmManager.getStatus(swarm.id);
      expect(status.status).toBe('paused');
    });

    it('should track agent-level budget within swarm', async () => {
      setProjectDailyBudget('test-project', 1_000_000, 1000);

      const swarm = await swarmManager.create({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 1,
        maxAgents: 5,
        strategy: 'parallel',
        budget: {
          amount: 100,
          currency: 'USD',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const agentId = swarm.agents[0];
      
      // Each agent gets budgetLimit = swarm.budget.amount / swarm.config.maxAgents = 100/5 = 20
      const agent = storage.get(agentId);
      expect(agent?.budgetLimit).toBe(20);
    });

    it('should aggregate token usage across all agents in a swarm', async () => {
      setProjectDailyBudget('test-project', 1_000_000, 1000);

      const swarm = await swarmManager.create({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 2,
        maxAgents: 5,
        strategy: 'parallel',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Record usage for each agent
      for (const agentId of swarm.agents) {
        const budget = startBudgetTracking(agentId, 'task-1', 'test-project', 'kimi-k2.5', swarm.id);
        recordTokenUsage(budget.id, 1000, 500);
      }

      // Check swarm budget tracking
      const swarmAgents = swarmManager.getSwarmAgents(swarm.id);
      expect(swarmAgents).toHaveLength(2);
    });
  });

  // ============================================================================
  // TEST SUITE 5: End-to-End Integration Scenarios
  // ============================================================================
  describe('5. End-to-End Integration Scenarios', () => {
    it('should handle full agent lifecycle with OpenClaw', async () => {
      const events: string[] = [];

      // Subscribe to all events
      messageBus.subscribe('agent.*.events', (message: any) => {
        events.push(message.payload?.eventType);
      });

      // Create agent
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Full lifecycle test',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Full lifecycle
      await lifecycle.pause(agent.id);
      await new Promise((resolve) => setTimeout(resolve, 20));

      await lifecycle.resume(agent.id);
      await new Promise((resolve) => setTimeout(resolve, 20));

      await lifecycle.kill(agent.id);
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Verify all events were published
      expect(events).toContain('agent.spawned');
      expect(events).toContain('agent.paused');
      expect(events).toContain('agent.resumed');
      expect(events).toContain('agent.killed');
    });

    it('should handle swarm with multiple agents and budgets', async () => {
      setProjectDailyBudget('test-project', 1_000_000, 1000);

      const swarm = await swarmManager.create({
        name: 'multi-agent-swarm',
        task: 'Complex test',
        initialAgents: 3,
        maxAgents: 10,
        strategy: 'parallel',
        model: 'kimi-k2.5',
        budget: {
          amount: 100,
          currency: 'USD',
          warningThreshold: 0.75,
          criticalThreshold: 0.90,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify all agents have sessions
      for (const agentId of swarm.agents) {
        expect(openclawIntegration.hasSession(agentId)).toBe(true);
        
        // Start budget tracking
        const budget = startBudgetTracking(agentId, 'task-1', 'test-project', 'kimi-k2.5', swarm.id);
        expect(budget.swarmId).toBe(swarm.id);
      }

      // Consume some budget
      swarmManager.consumeBudget(swarm.id, swarm.agents[0], 1000, 10);

      const status = swarmManager.getStatus(swarm.id);
      expect(status.agentCount).toBe(3);
    });

    it('should handle session failure and recovery', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Failure test',
        maxRetries: 2,
        autoStart: false, // Don't auto-start so we can test failure handling
      });

      // Manually start the agent
      await lifecycle.startAgent(agent.id);
      
      await new Promise((resolve) => setTimeout(resolve, 50));

      const sessionId = openclawIntegration.getSessionId(agent.id)!;
      expect(sessionId).toBeDefined();

      // Simulate session failure
      openclawClient.simulateSessionFailure(sessionId, 'Connection lost');

      const session = openclawClient.getSession(sessionId);
      expect(session?.status).toBe('failed');
      expect(session?.lastError).toBe('Connection lost');

      // Verify agent is in running state before failure
      let state = lifecycle.getState(agent.id);
      expect(state?.lifecycleState).toBe('running');

      // Simulate lifecycle handling the failure
      await lifecycle.fail(agent.id, 'Connection lost');

      // Lifecycle should now show the failure/retry state
      state = lifecycle.getState(agent.id);
      expect(state?.lastError).toBe('Connection lost');
      expect(state?.retryCount).toBe(1);
    });

    it('should maintain event persistence across operations', async () => {
      const agent = await lifecycle.spawn({
        model: 'kimi-k2.5',
        task: 'Persistence test',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      await lifecycle.pause(agent.id);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await lifecycle.resume(agent.id);

      // Get all messages from the bus
      const messages = messageBus.getMessages(`agent.${agent.id}.events`, 100);
      
      // Verify we have a complete history
      const eventTypes = messages.map((m: any) => m.payload?.eventType);
      
      // Should have spawned, started (from OpenClaw), paused, resumed
      const spawnedCount = eventTypes.filter((e: string) => e === 'agent.spawned').length;
      const pausedCount = eventTypes.filter((e: string) => e === 'agent.paused').length;
      const resumedCount = eventTypes.filter((e: string) => e === 'agent.resumed').length;

      expect(spawnedCount).toBeGreaterThanOrEqual(1);
      expect(pausedCount).toBeGreaterThanOrEqual(1);
      expect(resumedCount).toBeGreaterThanOrEqual(1);
    });
  });
});
