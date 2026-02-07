/**
 * Agent Fixtures
 * 
 * Pre-built agent data for consistent testing.
 * 
 * @example
 * ```typescript
 * import { mockAgent, createTestAgent } from '../fixtures/agents';
 * 
 * // Use predefined fixture
 * const agent = { ...mockAgent };
 * 
 * // Create customized agent
 * const customAgent = createTestAgent({ status: 'running' });
 * ```
 */

import { Agent, AgentStatus, CreateAgentOptions, createAgent } from '../../src/models/agent';

// ============================================================================
// Predefined Agent Fixtures
// ============================================================================

/**
 * Basic mock agent for general testing
 */
export const mockAgent: Agent = {
  id: 'agent-123',
  label: 'test-agent',
  status: AgentStatus.PENDING,
  model: 'claude-sonnet-4-5',
  task: 'Test task execution',
  spawnedAt: new Date('2024-01-01T00:00:00Z'),
  runtime: 0,
  teamId: undefined,
  parentId: undefined,
  childIds: [],
  context: {
    inputContext: ['Initial context'],
    outputContext: [],
    sharedContext: [],
    contextSize: 1,
    contextWindow: 100000,
    contextUsage: 0.01,
  },
  code: {
    language: 'typescript',
    fileTree: {
      name: 'root',
      path: '/',
      type: 'directory',
      children: {
        'src': {
          name: 'src',
          path: '/src',
          type: 'directory',
          children: {},
        },
      },
    },
    dependencies: { dependencies: {} },
    symbolIndex: { symbols: {} },
  },
  reasoning: {
    traces: [],
    decisions: [],
    confidence: 1.0,
  },
  retryCount: 0,
  maxRetries: 3,
  lastError: undefined,
  budgetLimit: 100,
  safetyBoundaries: {
    ethicsBoundaries: {
      doNotHarm: true,
      preservePrivacy: true,
      noDeception: true,
      authorizedAccessOnly: true,
    },
    dangerousActions: {
      dataDestruction: 'confirm',
      agentTermination: 'confirm',
      externalPublishing: 'block',
      resourceExhaustion: 'block',
    },
    escalationTriggers: {
      ethicsViolation: 'immediate',
      costExceeded: 'threshold',
      recursiveModification: 'approval',
      persistentFailure: 'threshold',
      securityBreach: 'immediate',
    },
  },
  metadata: {},
};

/**
 * Running agent fixture
 */
export const mockRunningAgent: Agent = {
  ...mockAgent,
  id: 'agent-running-456',
  label: 'running-test-agent',
  status: AgentStatus.RUNNING,
  spawnedAt: new Date(Date.now() - 60000), // Started 1 minute ago
  runtime: 60000,
};

/**
 * Completed agent fixture
 */
export const mockCompletedAgent: Agent = {
  ...mockAgent,
  id: 'agent-completed-789',
  label: 'completed-test-agent',
  status: AgentStatus.COMPLETED,
  spawnedAt: new Date(Date.now() - 300000), // Started 5 minutes ago
  completedAt: new Date(Date.now() - 120000), // Completed 2 minutes ago
  runtime: 180000,
};

/**
 * Failed agent fixture
 */
export const mockFailedAgent: Agent = {
  ...mockAgent,
  id: 'agent-failed-abc',
  label: 'failed-test-agent',
  status: AgentStatus.FAILED,
  spawnedAt: new Date(Date.now() - 120000),
  runtime: 30000,
  retryCount: 3,
  lastError: 'Connection timeout after 3 retries',
};

/**
 * Agent with parent-child relationship
 */
export const mockParentAgent: Agent = {
  ...mockAgent,
  id: 'agent-parent-001',
  label: 'parent-agent',
  status: AgentStatus.RUNNING,
  childIds: ['agent-child-001', 'agent-child-002'],
};

/**
 * Child agent fixture
 */
export const mockChildAgent: Agent = {
  ...mockAgent,
  id: 'agent-child-001',
  label: 'child-agent-1',
  status: AgentStatus.RUNNING,
  parentId: 'agent-parent-001',
  teamId: 'team-001',
};

/**
 * Agent with high context usage
 */
export const mockHighContextAgent: Agent = {
  ...mockAgent,
  id: 'agent-high-context',
  label: 'high-context-agent',
  status: AgentStatus.RUNNING,
  context: {
    inputContext: new Array(50).fill('Large context item'),
    outputContext: new Array(30).fill('Output context'),
    sharedContext: new Array(20).fill('Shared context'),
    contextSize: 100,
    contextWindow: 100000,
    contextUsage: 0.85,
  },
};

/**
 * Agent with reasoning traces
 */
export const mockAgentWithReasoning: Agent = {
  ...mockAgent,
  id: 'agent-reasoning',
  label: 'reasoning-agent',
  status: AgentStatus.RUNNING,
  reasoning: {
    traces: [
      {
        id: 'trace-1',
        agentId: 'agent-reasoning',
        timestamp: new Date(),
        type: 'hypothesis',
        content: 'The issue appears to be related to database connection pooling',
        evidence: ['logs/error.log', 'config/database.yaml'],
        confidence: 0.8,
        childTraceIds: ['trace-2'],
      },
      {
        id: 'trace-2',
        agentId: 'agent-reasoning',
        timestamp: new Date(),
        type: 'analysis',
        content: 'Connection pool is exhausted due to long-running queries',
        evidence: ['metrics/connections.json'],
        confidence: 0.9,
        parentTraceId: 'trace-1',
        childTraceIds: [],
      },
    ],
    decisions: [
      {
        id: 'decision-1',
        agentId: 'agent-reasoning',
        timestamp: new Date(),
        decision: 'Increase connection pool size and add query timeout',
        alternatives: ['Restart database', 'Scale horizontally'],
        criteria: ['Minimal downtime', 'Root cause fix'],
        evaluation: 'Best balance of immediate relief and long-term stability',
        confidence: 0.85,
      },
    ],
    confidence: 0.85,
  },
};

// ============================================================================
// Agent Collections
// ============================================================================

/**
 * Collection of agents for swarm testing
 */
export const mockAgentSwarm: Agent[] = [
  mockParentAgent,
  mockChildAgent,
  {
    ...mockAgent,
    id: 'agent-child-002',
    label: 'child-agent-2',
    status: AgentStatus.PENDING,
    parentId: 'agent-parent-001',
    teamId: 'team-001',
  },
];

/**
 * Collection of agents with various statuses
 */
export const mockAgentsWithMixedStatuses: Agent[] = [
  mockRunningAgent,
  mockCompletedAgent,
  mockFailedAgent,
  {
    ...mockAgent,
    id: 'agent-paused',
    label: 'paused-agent',
    status: AgentStatus.PAUSED,
    pauseTime: new Date(),
    pausedBy: 'user',
  },
  {
    ...mockAgent,
    id: 'agent-killed',
    label: 'killed-agent',
    status: AgentStatus.KILLED,
  },
];

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a test agent with customizable properties
 * 
 * @example
 * ```typescript
 * const agent = createTestAgent({
 *   status: AgentStatus.RUNNING,
 *   model: 'gpt-4o'
 * });
 * ```
 */
export function createTestAgent(overrides: Partial<Agent> = {}): Agent {
  const id = overrides.id || `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    ...mockAgent,
    id,
    label: `test-agent-${id}`,
    spawnedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates multiple test agents
 * 
 * @example
 * ```typescript
 * const agents = createTestAgents(5, { status: AgentStatus.RUNNING });
 * ```
 */
export function createTestAgents(count: number, overrides: Partial<Agent> = {}): Agent[] {
  return Array.from({ length: count }, (_, i) => 
    createTestAgent({
      label: `test-agent-${i + 1}`,
      ...overrides,
    })
  );
}

/**
 * Creates an agent using the model factory
 * 
 * @example
 * ```typescript
 * const agent = createAgentFromOptions({
 *   model: 'claude-sonnet-4-5',
 *   task: 'Implement feature X'
 * });
 * ```
 */
export function createAgentFromOptions(options: CreateAgentOptions): Agent {
  return createAgent(options);
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Checks if an object is a valid agent structure
 * 
 * @example
 * ```typescript
 * expect(isValidAgent(agent)).toBe(true);
 * ```
 */
export function isValidAgent(obj: unknown): obj is Agent {
  if (!obj || typeof obj !== 'object') return false;
  
  const agent = obj as Partial<Agent>;
  return (
    typeof agent.id === 'string' &&
    typeof agent.status === 'string' &&
    typeof agent.model === 'string' &&
    typeof agent.task === 'string' &&
    agent.spawnedAt instanceof Date &&
    typeof agent.runtime === 'number' &&
    typeof agent.retryCount === 'number' &&
    typeof agent.maxRetries === 'number'
  );
}

/**
 * Checks if an agent has a specific status
 * 
 * @example
 * ```typescript
 * expect(hasStatus(agent, AgentStatus.RUNNING)).toBe(true);
 * ```
 */
export function hasStatus(agent: Agent, status: AgentStatus): boolean {
  return agent.status === status;
}

/**
 * Gets all valid agent statuses
 */
export const AGENT_STATUSES = [
  AgentStatus.PENDING,
  AgentStatus.RUNNING,
  AgentStatus.PAUSED,
  AgentStatus.COMPLETED,
  AgentStatus.FAILED,
  AgentStatus.BLOCKED,
  AgentStatus.KILLED,
] as const;

/**
 * Gets terminal statuses (agents that are done)
 */
export const TERMINAL_STATUSES = [
  AgentStatus.COMPLETED,
  AgentStatus.FAILED,
  AgentStatus.KILLED,
] as const;

/**
 * Gets active statuses (agents that are working)
 */
export const ACTIVE_STATUSES = [
  AgentStatus.PENDING,
  AgentStatus.RUNNING,
  AgentStatus.PAUSED,
] as const;

// ============================================================================
// Default Export
// ============================================================================

export default {
  mockAgent,
  mockRunningAgent,
  mockCompletedAgent,
  mockFailedAgent,
  mockParentAgent,
  mockChildAgent,
  mockHighContextAgent,
  mockAgentWithReasoning,
  mockAgentSwarm,
  mockAgentsWithMixedStatuses,
  createTestAgent,
  createTestAgents,
  createAgentFromOptions,
  isValidAgent,
  hasStatus,
  AGENT_STATUSES,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
};
