# Godel Test Infrastructure

Comprehensive testing infrastructure for the Godel project with centralized mocks, fixtures, and utilities.

## Directory Structure

```
tests/
├── mocks/              # Mock implementations for external dependencies
│   ├── index.ts       # Centralized mock exports
│   ├── pi.ts          # Pi client mocks
│   ├── database.ts    # PostgreSQL/Database mocks
│   ├── redis.ts       # Redis mocks
│   └── runtime.ts     # Agent runtime mocks
├── fixtures/           # Pre-built test data
│   ├── index.ts       # Fixture exports
│   ├── agents.ts      # Agent fixtures
│   ├── tasks.ts       # Task fixtures
│   └── config.ts      # Configuration fixtures
├── utils/             # Test utilities and helpers
│   ├── index.ts       # Utility exports
│   ├── test-helpers.ts # General test helpers
│   └── integration-harness.ts # E2E test harness
└── README.md          # This file
```

## Quick Start

### Basic Usage

```typescript
import { mockPiClient, mockPool, createTestAgent } from '../mocks';
import { mockAgent, mockTask } from '../fixtures';
import { expectValidAgent, waitFor } from '../utils';

describe('MyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should work with mocks', async () => {
    // Configure mock behavior
    mockPiClient.sendMessage.mockResolvedValue({
      content: 'Mock response',
      messageId: 'msg-123'
    });

    // Use fixtures for consistent data
    const agent = { ...mockAgent };
    
    // Test your code
    const result = await myService.process(agent);
    
    // Use assertion helpers
    expectValidAgent(result);
  });
});
```

### Integration Test with Harness

```typescript
import { createIntegrationTestSetup } from '../utils';

describe('Agent Lifecycle', () => {
  const { harness, beforeAllSetup, afterAllCleanup } = createIntegrationTestSetup();
  
  beforeAll(beforeAllSetup);
  afterAll(afterAllCleanup);

  test('should spawn and kill agent', async () => {
    const agent = await harness.spawnAgent({
      name: 'test-agent',
      model: 'claude-sonnet-4-5'
    });
    
    expect(agent.status).toBe('running');
    
    await harness.killAgent(agent.id);
    
    const agents = await harness.listAgents();
    expect(agents).toHaveLength(0);
  });
});
```

## Mocks

### Pi Client Mock

```typescript
import { 
  mockPiClient, 
  setupMockPiClient, 
  resetMockPiState,
  simulateConnectionError,
  simulateToolCall 
} from '../mocks/pi';

// Setup
beforeAll(() => setupMockPiClient());
afterEach(() => resetMockPiState());

// Configure responses
mockPiClient.sendMessage.mockResolvedValue({
  content: 'Hello!',
  messageId: 'msg-123'
});

// Simulate errors
simulateConnectionError();
simulateToolCall({ id: 'tool-1', tool: 'Bash', arguments: {} });
```

### Database Mock

```typescript
import { 
  mockPool, 
  mockQueryResponse, 
  resetMockDbState,
  createMockAgentRow 
} from '../mocks/database';

// Configure query response
mockQueryResponse(
  'SELECT * FROM agents WHERE id = $1',
  [createMockAgentRow({ id: 'agent-1' })]
);

// Access query history
const history = getQueryHistory();
expect(history).toContain('SELECT * FROM agents');
```

### Redis Mock

```typescript
import { 
  mockRedis, 
  setMockRedisValue,
  resetMockRedisState,
  simulateRedisFailure 
} from '../mocks/redis';

// Set values
setMockRedisValue('key', 'value', 3600); // with TTL

// Simulate failures
simulateRedisFailure(['get', 'set']);
```

### Runtime Mock

```typescript
import { 
  mockRuntime, 
  createMockRuntime,
  simulateSpawnFailure,
  addMockAgent 
} from '../mocks/runtime';

// Add pre-existing agents
const agent = addMockAgent({ status: 'running' });

// Simulate failures
simulateSpawnFailure();
```

## Fixtures

### Agent Fixtures

```typescript
import { 
  mockAgent,           // Basic pending agent
  mockRunningAgent,    // Running agent
  mockCompletedAgent,  // Completed agent
  mockFailedAgent,     // Failed agent
  createTestAgent      // Factory function
} from '../fixtures/agents';

// Use predefined fixtures
const agent = { ...mockRunningAgent };

// Create custom agents
const custom = createTestAgent({ 
  status: AgentStatus.RUNNING,
  model: 'gpt-4o' 
});
```

### Task Fixtures

```typescript
import { 
  mockTask,              // Basic pending task
  mockInProgressTask,    // In-progress task
  mockCompletedTask,     // Completed task
  mockBlockedTask,       // Blocked task
  mockTaskDAG,           // Task dependency graph
  createTestTask         // Factory function
} from '../fixtures/tasks';

// Use fixtures
const task = { ...mockInProgressTask };

// Create with dependencies
const withDeps = createTestTask({
  dependsOn: ['task-1', 'task-2'],
  priority: 'high'
});
```

### Configuration Fixtures

```typescript
import { 
  mockRuntimeConfig,
  mockPiClientConfig,
  mockPostgresConfig,
  mockAppConfig,
  createRuntimeConfig
} from '../fixtures/config';

// Use predefined configs
const config = { ...mockRuntimeConfig };

// Create custom configs
const custom = createRuntimeConfig({
  default: 'native',
  pi: { maxConcurrent: 50 }
});
```

## Utilities

### Test Helpers

```typescript
import {
  setupMockEnvironment,
  expectValidAgent,
  expectValidTask,
  waitFor,
  retry,
  generateTestId
} from '../utils/test-helpers';

// Setup/teardown
setupMockEnvironment();
cleanupMockEnvironment();

// Assertions
expectValidAgent(agent);
expectValidTask(task);

// Async helpers
await waitFor(() => agent.status === 'running', 5000);
await retry(() => fetchData(), { maxRetries: 3 });

// Data helpers
const id = generateTestId('agent'); // 'agent-1234567890-abc123'
```

### Integration Harness

```typescript
import { IntegrationHarness } from '../utils/integration-harness';

const harness = new IntegrationHarness({
  defaultRuntime: 'mock',
  useRealDatabase: false,
  cleanupAgents: true,
  maxAgents: 10
});

// Lifecycle
await harness.setup();
await harness.cleanup();
await harness.reset(); // Between tests

// Agent operations
const agent = await harness.spawnAgent({ name: 'test' });
await harness.killAgent(agent.id);
await harness.killAllAgents();
const status = await harness.getAgentStatus(agent.id);

// Database operations (if using real DB)
const result = await harness.query('SELECT * FROM agents');
await harness.transaction(async (client) => {
  await client.query('INSERT INTO agents ...');
});

// Redis operations (if using real Redis)
await harness.redisSet('key', 'value', 3600);
const value = await harness.redisGet('key');
```

## Best Practices

### 1. Use Centralized Imports

```typescript
// Good - import from centralized location
import { mockPiClient, createTestAgent } from '../mocks';
import { mockAgent } from '../fixtures';

// Avoid - importing from specific files
import { mockPiClient } from '../mocks/pi';
```

### 2. Reset State Between Tests

```typescript
describe('MyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllMocks(); // From mocks/index.ts
  });
});
```

### 3. Use Fixtures for Consistency

```typescript
// Good - use fixtures
const agent = createTestAgent({ status: 'running' });

// Avoid - manual object creation
const agent = {
  id: 'agent-123',
  status: 'running',
  // ... might miss required fields
};
```

### 4. Use Harness for Integration Tests

```typescript
// Good - use harness for lifecycle management
const harness = createIntegrationHarness();

// Avoid - manual setup without cleanup
let agent;
beforeAll(async () => {
  agent = await spawnAgent({}); // Who cleans up?
});
```

### 5. Configure Mocks Explicitly

```typescript
// Good - explicit configuration
mockPiClient.sendMessage.mockResolvedValue({
  content: 'Expected response'
});

// Avoid - relying on default mock behavior
const result = await mockPiClient.sendMessage('test');
```

## Examples

### Unit Test Example

```typescript
import { mockPool, createTestAgent, expectValidAgent } from '../utils';

describe('AgentRepository', () => {
  const { beforeEachSetup, afterEachCleanup } = createUnitTestSetup();
  
  beforeEach(beforeEachSetup);
  afterEach(afterEachCleanup);

  test('should create agent', async () => {
    const agentData = createTestAgent();
    mockPool.query.mockResolvedValue({
      rows: [agentData],
      rowCount: 1
    });

    const repository = new AgentRepository(mockPool as unknown as Pool);
    const result = await repository.create(agentData);

    expectValidAgent(result);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agents'),
      expect.any(Array)
    );
  });
});
```

### Integration Test Example

```typescript
import { createIntegrationTestSetup, createTestAgent } from '../utils';

describe('Agent Lifecycle Integration', () => {
  const { harness, beforeAllSetup, afterAllCleanup } = createIntegrationTestSetup({
    useRealDatabase: process.env['CI'] === 'true',
    databaseUrl: process.env['TEST_DATABASE_URL']
  });

  beforeAll(beforeAllSetup);
  afterAll(afterAllCleanup);

  test('complete agent lifecycle', async () => {
    // Spawn
    const agent = await harness.spawnAgent({
      name: 'lifecycle-test',
      model: 'claude-sonnet-4-5'
    });
    expect(agent.status).toBe('running');

    // Execute command
    const result = await harness.execOnAgent(agent.id, 'Hello');
    expect(result.exitCode).toBe(0);

    // Kill
    await harness.killAgent(agent.id);
    const agents = await harness.listAgents();
    expect(agents).toHaveLength(0);
  });
});
```

## Troubleshooting

### Mock Not Working

1. Ensure you've called `jest.mock()` or used the setup functions
2. Check that you're importing from the mocked module path
3. Verify `resetAllMocks()` isn't clearing your configuration

### State Leaking Between Tests

1. Use `beforeEach` to reset mocks
2. Use harness.reset() between integration tests
3. Check for global state modifications

### Type Errors

1. Ensure proper type imports: `import type { Agent } from '...'`
2. Use `jest.Mocked<T>` for mock types
3. Check that fixtures match current model interfaces

## Contributing

When adding new mocks or fixtures:

1. Follow the existing naming conventions
2. Add factory functions for customization
3. Include assertion helpers where appropriate
4. Update this README with examples
5. Export from the index.ts file
