/**
 * Example Usage Test
 * 
 * Demonstrates how to use the mock infrastructure.
 * This test shows best practices for using mocks, fixtures, and utilities.
 */

import {
  mockPiClient,
  mockPool,
  mockRedis,
  mockRuntime,
  resetAllMocks,
  setupMockPiClient,
  setupMockDatabase,
  setupMockRedis,
  setupMockRuntime,
} from './mocks';

import {
  mockAgent,
  mockTask,
  mockRuntimeConfig,
  createTestAgent,
  createTestTask,
} from './fixtures';

import {
  expectValidAgent,
  expectValidTask,
  waitFor,
  IntegrationHarness,
  createIntegrationHarness,
} from './utils';

// ============================================================================
// Unit Test Examples
// ============================================================================

describe('Mock Infrastructure Examples', () => {
  beforeAll(() => {
    // Set up module mocks once
    setupMockPiClient();
    setupMockDatabase();
    setupMockRedis();
    setupMockRuntime();
  });

  beforeEach(() => {
    // Reset all mocks before each test
    resetAllMocks();
  });

  describe('Pi Client Mock', () => {
    test('should configure mock responses', async () => {
      // Configure the mock
      mockPiClient.sendMessage.mockResolvedValue({
        content: 'Hello from mock!',
        messageId: 'msg-123',
        toolCalls: [],
      });

      // Use in your test
      const response = await mockPiClient.sendMessage('Hello');
      
      expect(response.content).toBe('Hello from mock!');
      expect(mockPiClient.sendMessage).toHaveBeenCalledWith('Hello');
    });

    test('should mock session initialization', async () => {
      mockPiClient.initSession.mockResolvedValue({
        id: 'session-123',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        tools: ['Bash', 'Read'],
        createdAt: new Date(),
      });

      const session = await mockPiClient.initSession({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      });

      expect(session.id).toBe('session-123');
      expect(session.provider).toBe('anthropic');
    });
  });

  describe('Database Mock', () => {
    test('should mock database queries', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 'agent-1', name: 'Test Agent', status: 'running' },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await mockPool.query('SELECT * FROM agents');
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Test Agent');
    });

    test('should track query history', async () => {
      await mockPool.query('SELECT * FROM agents');
      await mockPool.query('INSERT INTO tasks VALUES (1)');

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM agents');
    });
  });

  describe('Redis Mock', () => {
    test('should mock Redis operations', async () => {
      // No setup needed - mocks work out of the box
      await mockRedis.set('key', 'value');
      const value = await mockRedis.get('key');

      expect(value).toBe('value');
    });

    test('should support Redis lists', async () => {
      await mockRedis.lpush('mylist', 'item1', 'item2');
      await mockRedis.rpush('mylist', 'item3');

      const items = await mockRedis.lrange('mylist', 0, -1);
      
      expect(items).toEqual(['item1', 'item2', 'item3']);
    });
  });

  describe('Runtime Mock', () => {
    test('should mock agent spawning', async () => {
      const agent = await mockRuntime.spawn({
        name: 'test-agent',
        model: 'claude-sonnet-4-5',
      });

      expectValidAgent(agent);
      expect(agent.status).toBe('running');
      expect(agent.model).toBe('claude-sonnet-4-5');
    });

    test('should mock agent execution', async () => {
      const agent = await mockRuntime.spawn({ name: 'exec-test' });
      
      const result = await mockRuntime.exec(agent.id, 'echo "Hello"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('echo');
    });
  });
});

// ============================================================================
// Fixture Examples
// ============================================================================

describe('Fixture Examples', () => {
  test('should use predefined agent fixtures', () => {
    // Use predefined fixtures
    const agent = { ...mockAgent };
    
    expectValidAgent(agent);
    expect(agent.status).toBe('pending');
    expect(agent.model).toBe('claude-sonnet-4-5');
  });

  test('should use predefined task fixtures', () => {
    const task = { ...mockTask };
    
    expectValidTask(task);
    expect(task.status).toBe('pending');
    expect(task.priority).toBe('high');
  });

  test('should create customized test agents', () => {
    const agent = createTestAgent({
      status: 'running',
      model: 'gpt-4o',
      label: 'My Custom Agent',
    });

    expectValidAgent(agent);
    expect(agent.status).toBe('running');
    expect(agent.model).toBe('gpt-4o');
    expect(agent.label).toBe('My Custom Agent');
  });

  test('should create customized test tasks', () => {
    const task = createTestTask({
      title: 'Custom Task',
      priority: 'critical',
      dependsOn: ['task-1', 'task-2'],
    });

    expectValidTask(task);
    expect(task.title).toBe('Custom Task');
    expect(task.priority).toBe('critical');
    expect(task.dependsOn).toHaveLength(2);
  });

  test('should use configuration fixtures', () => {
    const config = { ...mockRuntimeConfig };
    
    expect(config.default).toBe('pi');
    expect(config.pi?.defaultModel).toBe('claude-sonnet-4-5');
    expect(config.pi?.providers).toContain('anthropic');
  });
});

// ============================================================================
// Integration Harness Examples
// ============================================================================

describe('Integration Harness Examples', () => {
  let harness: IntegrationHarness;

  beforeAll(async () => {
    setupMockRuntime();
    harness = createIntegrationHarness({
      defaultRuntime: 'mock',
      cleanupAgents: true,
      maxAgents: 5,
    });
    
    await harness.setup();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  test('should spawn and manage agents', async () => {
    // Spawn an agent
    const agent = await harness.spawnAgent({
      name: 'harness-test',
      model: 'claude-sonnet-4-5',
    });

    expectValidAgent(agent);
    expect(agent.status).toBe('running');

    // Check agent status
    const status = await harness.getAgentStatus(agent.id);
    expect(status).toBe('running');

    // Execute command
    const result = await harness.execOnAgent(agent.id, 'test command');
    expect(result.exitCode).toBe(0);

    // List agents
    const agents = await harness.listAgents();
    expect(agents).toHaveLength(1);

    // Kill agent
    await harness.killAgent(agent.id);
    const remainingAgents = await harness.listAgents();
    expect(remainingAgents).toHaveLength(0);
  });

  test('should handle multiple agents', async () => {
    // Spawn multiple agents
    const agent1 = await harness.spawnAgent({ name: 'agent-1' });
    const agent2 = await harness.spawnAgent({ name: 'agent-2' });
    const agent3 = await harness.spawnAgent({ name: 'agent-3' });

    const agents = await harness.listAgents();
    expect(agents).toHaveLength(3);

    // Kill all at once
    await harness.killAllAgents();
    
    const remaining = await harness.listAgents();
    expect(remaining).toHaveLength(0);
  });

  test('should track harness state', async () => {
    const agent = await harness.spawnAgent({ name: 'state-test' });
    
    const state = harness.getState();
    
    expect(state.agentIds).toContain(agent.id);
    expect(state.agentIds).toHaveLength(1);
  });
});

// ============================================================================
// Utility Function Examples
// ============================================================================

describe('Utility Function Examples', () => {
  test('should wait for conditions', async () => {
    let value = false;
    
    // Simulate async operation
    setTimeout(() => { value = true; }, 100);
    
    // Wait for condition
    await waitFor(() => value === true, 1000);
    
    expect(value).toBe(true);
  });

  test('should use async retry', async () => {
    let attempts = 0;
    
    const result = await waitFor(
      async () => {
        attempts++;
        return attempts >= 3;
      },
      1000
    );
    
    expect(attempts).toBe(3);
  });
});

// ============================================================================
// Complete Integration Example
// ============================================================================

describe('Complete Integration Example', () => {
  beforeAll(() => {
    setupMockPiClient();
    setupMockDatabase();
    setupMockRedis();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  test('should demonstrate complete workflow', async () => {
    // 1. Set up mock responses
    mockPiClient.initSession.mockResolvedValue({
      id: 'session-123',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      tools: ['Bash', 'Read', 'Write'],
      createdAt: new Date(),
    });

    mockPiClient.sendMessage.mockResolvedValue({
      content: 'Implementation complete',
      messageId: 'msg-456',
      toolCalls: [],
    });

    mockPool.query.mockResolvedValue({
      rows: [{ id: 'agent-123', status: 'running' }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    // 2. Create test data using fixtures
    const agent = createTestAgent({
      status: 'running',
      label: 'Integration Test Agent',
    });

    const task = createTestTask({
      title: 'Integration Test Task',
      assigneeId: agent.id,
    });

    // 3. Verify structures
    expectValidAgent(agent);
    expectValidTask(task);

    // 4. Use mocks in assertions
    const session = await mockPiClient.initSession({});
    expect(session.id).toBe('session-123');

    const response = await mockPiClient.sendMessage('Implement feature');
    expect(response.content).toBe('Implementation complete');

    const dbResult = await mockPool.query('SELECT * FROM agents');
    expect(dbResult.rows[0].status).toBe('running');

    // 5. Verify Redis operations
    await mockRedis.set(`agent:${agent.id}`, JSON.stringify(agent));
    const cached = await mockRedis.get(`agent:${agent.id}`);
    expect(cached).toBeTruthy();
  });
});
