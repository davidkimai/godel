# Godel API Documentation

Complete API reference for the Godel Agent Orchestration Platform v2.0.

## Table of Contents

1. [RuntimeProvider API](#runtimeprovider-api)
2. [Agent Management API](#agent-management-api)
3. [Session Management API](#session-management-api)
4. [Task Queue API](#task-queue-api)
5. [Event System API](#event-system-api)
6. [Configuration API](#configuration-api)

---

## Overview

Godel provides a comprehensive REST API for agent orchestration.

**Base URL**: `http://localhost:7373/api/v1`

## Authentication

All API requests require authentication using an API key:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:7373/api/v1/agents
```

---

## RuntimeProvider API

The RuntimeProvider is the core abstraction for managing agent execution environments.

### Interface Definition

```typescript
interface RuntimeProvider {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Agent Management
  spawnAgent(config: AgentConfig): Promise<Agent>;
  killAgent(agentId: string): Promise<void>;
  getAgentStatus(agentId: string): Promise<AgentStatus>;
  
  // Resource Management
  getResourceMetrics(): Promise<ResourceMetrics>;
  setResourceLimits(limits: ResourceLimits): Promise<void>;
  
  // Health Checks
  isHealthy(): Promise<boolean>;
  getHealthDetails(): Promise<HealthDetails>;
}
```

### Methods

#### `initialize()`

Initializes the runtime provider and prepares it for agent execution.

**Returns:** `Promise<void>`

**Example:**
```typescript
const provider = new KataRuntimeProvider(config);
await provider.initialize();
```

#### `shutdown()`

Gracefully shuts down the runtime provider and cleans up resources.

**Returns:** `Promise<void>`

**Example:**
```typescript
await provider.shutdown();
```

#### `spawnAgent(config: AgentConfig)`

Creates and starts a new agent in the runtime environment.

**Parameters:**
- `config` (`AgentConfig`): Agent configuration object
  - `name` (string): Agent name
  - `role` (string): Agent role (coordinator, worker, reviewer)
  - `teamId` (string): Parent team/session ID
  - `capabilities` (string[]): List of agent capabilities
  - `resourceLimits` (ResourceLimits): Optional resource constraints

**Returns:** `Promise<Agent>`

**Example:**
```typescript
const agent = await provider.spawnAgent({
  name: 'code-reviewer-1',
  role: 'reviewer',
  teamId: 'team-abc123',
  capabilities: ['typescript', 'review', 'testing'],
  resourceLimits: {
    maxMemoryMB: 512,
    maxCpuPercent: 50,
    timeoutMinutes: 30,
  },
});
```

#### `killAgent(agentId: string)`

Terminates a running agent.

**Parameters:**
- `agentId` (string): Unique agent identifier

**Returns:** `Promise<void>`

**Example:**
```typescript
await provider.killAgent('agent-xyz789');
```

#### `getAgentStatus(agentId: string)`

Retrieves the current status of an agent.

**Parameters:**
- `agentId` (string): Unique agent identifier

**Returns:** `Promise<AgentStatus>`

**Example:**
```typescript
const status = await provider.getAgentStatus('agent-xyz789');
console.log(status.state); // 'running', 'idle', 'completed', 'error'
```

#### `getResourceMetrics()`

Gets current resource utilization metrics.

**Returns:** `Promise<ResourceMetrics>`

**Example:**
```typescript
const metrics = await provider.getResourceMetrics();
console.log(`CPU: ${metrics.cpuPercent}%, Memory: ${metrics.memoryMB}MB`);
```

#### `setResourceLimits(limits: ResourceLimits)`

Sets global resource limits for the runtime.

**Parameters:**
- `limits` (`ResourceLimits`): Resource constraints
  - `maxAgents` (number): Maximum concurrent agents
  - `maxMemoryMB` (number): Maximum memory allocation
  - `maxCpuPercent` (number): Maximum CPU usage

**Returns:** `Promise<void>`

**Example:**
```typescript
await provider.setResourceLimits({
  maxAgents: 100,
  maxMemoryMB: 8192,
  maxCpuPercent: 80,
});
```

#### `isHealthy()`

Performs a health check on the runtime.

**Returns:** `Promise<boolean>`

**Example:**
```typescript
const healthy = await provider.isHealthy();
if (!healthy) {
  console.error('Runtime is unhealthy');
}
```

---

## Agent Management API

### List Agents

```http
GET /agents
```

Query Parameters:
- `status` - Filter by status (running, idle, failed)
- `role` - Filter by role
- `team` - Filter by team ID

Response:
```json
{
  "agents": [
    {
      "id": "agent-001",
      "role": "worker",
      "status": "running",
      "model": "claude-sonnet-4-5",
      "createdAt": "2026-02-07T10:00:00Z"
    }
  ]
}
```

### Spawn Agent

```http
POST /agents
```

Request Body:
```json
{
  "role": "worker",
  "runtime": "pi",
  "pi_config": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5"
  },
  "label": "my-agent"
}
```

### Get Agent

```http
GET /agents/:id
```

Response:
```json
{
  "id": "agent-xyz789",
  "name": "code-reviewer",
  "status": "running",
  "teamId": "team-abc123",
  "capabilities": ["typescript", "review"],
  "metrics": {
    "tasksCompleted": 42,
    "avgLatency": 1234,
    "errorRate": 0.01
  },
  "createdAt": "2026-02-08T10:30:00Z",
  "updatedAt": "2026-02-08T11:45:00Z"
}
```

### Kill Agent

```http
DELETE /agents/:id
```

Response:
```json
{
  "success": true,
  "message": "Agent terminated"
}
```

---

## Session Management API

### Create Session

```http
POST /api/v1/sessions
Content-Type: application/json

{
  "name": "feature-implementation",
  "type": "development",
  "config": {
    "maxAgents": 10,
    "autoScale": true,
    "timeoutMinutes": 60
  }
}
```

**Response:**
```json
{
  "id": "session-abc123",
  "name": "feature-implementation",
  "status": "active",
  "teamId": "team-xyz789",
  "createdAt": "2026-02-08T10:30:00Z"
}
```

### Get Session

```http
GET /api/v1/sessions/{sessionId}
```

**Response:**
```json
{
  "id": "session-abc123",
  "name": "feature-implementation",
  "status": "active",
  "teamId": "team-xyz789",
  "agents": ["agent-1", "agent-2", "agent-3"],
  "tasks": {
    "pending": 5,
    "running": 3,
    "completed": 42
  },
  "metrics": {
    "duration": 3600,
    "throughput": 12.5
  },
  "createdAt": "2026-02-08T10:30:00Z"
}
```

### List Sessions

```http
GET /api/v1/sessions?status=active&limit=10
```

### End Session

```http
POST /api/v1/sessions/{sessionId}/end
```

---

## Task Queue API

### Submit Task

```http
POST /api/v1/tasks
Content-Type: application/json

{
  "type": "code-review",
  "sessionId": "session-abc123",
  "priority": "high",
  "input": {
    "filePath": "/src/index.ts",
    "content": "..."
  }
}
```

**Response:**
```json
{
  "id": "task-xyz789",
  "type": "code-review",
  "status": "queued",
  "position": 3,
  "estimatedStart": "2026-02-08T10:35:00Z"
}
```

### Get Task Status

```http
GET /api/v1/tasks/{taskId}
```

**Response:**
```json
{
  "id": "task-xyz789",
  "type": "code-review",
  "status": "running",
  "agentId": "agent-123",
  "progress": 65,
  "startedAt": "2026-02-08T10:32:00Z",
  "estimatedCompletion": "2026-02-08T10:38:00Z"
}
```

### Cancel Task

```http
POST /api/v1/tasks/{taskId}/cancel
```

### List Tasks

```http
GET /api/v1/tasks?sessionId=session-abc123&status=running
```

---

## Event System API

### Subscribe to Events

```http
GET /api/v1/events/stream?sessionId=session-abc123

// Server-Sent Events (SSE)
event: agent_spawned
data: {"agentId": "agent-123", "timestamp": "2026-02-08T10:30:00Z"}

event: task_completed
data: {"taskId": "task-456", "result": {...}}
```

### WebSocket Events

```javascript
const ws = new WebSocket('wss://api.godel.ai/v1/events');

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    sessionId: 'session-abc123',
    events: ['agent_spawned', 'task_completed', 'error']
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data.payload);
};
```

### Event Types

| Event | Description | Payload |
|-------|-------------|---------|
| `agent_spawned` | New agent created | `{ agentId, role, timestamp }` |
| `agent_killed` | Agent terminated | `{ agentId, reason, timestamp }` |
| `task_created` | New task submitted | `{ taskId, type, priority }` |
| `task_started` | Task execution began | `{ taskId, agentId, timestamp }` |
| `task_completed` | Task finished | `{ taskId, result, duration }` |
| `task_failed` | Task failed | `{ taskId, error, retryable }` |
| `session_started` | Session created | `{ sessionId, name, timestamp }` |
| `session_ended` | Session ended | `{ sessionId, duration, status }` |
| `error` | Error occurred | `{ code, message, context }` |

---

## Configuration API

### Get Configuration

```http
GET /api/v1/config
```

**Response:**
```json
{
  "runtime": {
    "provider": "kata",
    "maxAgents": 100,
    "maxMemoryMB": 8192
  },
  "agents": {
    "defaultModel": "claude-sonnet-4-5",
    "defaultTimeout": 1800,
    "maxRetries": 3
  },
  "queue": {
    "maxSize": 10000,
    "priorityLevels": 5,
    "defaultPriority": 3
  },
  "scaling": {
    "enabled": true,
    "minAgents": 2,
    "maxAgents": 50,
    "scaleUpThreshold": 0.8,
    "scaleDownThreshold": 0.3
  }
}
```

### Update Configuration

```http
PATCH /api/v1/config
Content-Type: application/json

{
  "runtime": {
    "maxAgents": 150
  },
  "scaling": {
    "enabled": false
  }
}
```

### Reset Configuration

```http
POST /api/v1/config/reset
```

---

## Teams API

### List Teams

```http
GET /teams
```

### Create Team

```http
POST /teams
```

Request Body:
```json
{
  "name": "my-team",
  "strategy": "parallel",
  "composition": {
    "coordinator": { "role": "coordinator", "model": "claude-opus-4" },
    "workers": [{ "role": "worker", "count": 3, "model": "claude-sonnet-4-5" }]
  }
}
```

### Get Team

```http
GET /teams/:id
```

### Scale Team

```http
POST /teams/:id/scale
```

Request Body:
```json
{
  "workers": 5
}
```

### Destroy Team

```http
DELETE /teams/:id
```

---

## Intent API

### Execute Intent

```http
POST /intent
```

Request Body:
```json
{
  "description": "Refactor authentication to use JWT",
  "constraints": {
    "strategy": "careful",
    "maxAgents": 5,
    "timeout": 30
  }
}
```

---

## Worktrees API

### Create Worktree

```http
POST /worktrees
```

Request Body:
```json
{
  "repository": "/path/to/repo",
  "base_branch": "main",
  "dependencies": {
    "shared": ["node_modules"],
    "isolated": [".env"]
  }
}
```

---

## Health API

### Check Health

```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "components": {
    "api": "healthy",
    "database": "healthy",
    "redis": "healthy"
  }
}
```

### Detailed Health

```http
GET /health/details
```

### Readiness Probe

```http
GET /ready
```

### Liveness Probe

```http
GET /live
```

---

## Metrics API

### Get Metrics

```http
GET /metrics
```

Returns Prometheus-formatted metrics.

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent agent-999 does not exist",
    "suggestion": "Use GET /agents to list available agents"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AGENT_NOT_FOUND` | 404 | Agent does not exist |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `TASK_NOT_FOUND` | 404 | Task does not exist |
| `AGENT_LIMIT_REACHED` | 429 | Maximum agents exceeded |
| `QUEUE_FULL` | 429 | Task queue is full |
| `INVALID_CONFIG` | 400 | Invalid configuration |
| `RUNTIME_ERROR` | 500 | Runtime execution error |
| `TIMEOUT` | 504 | Operation timed out |

---

## Rate Limiting

API requests are rate-limited:
- 100 requests per minute for default users
- 1000 requests per minute for admin users

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1644153600
```

---

## SDK Examples

### TypeScript/JavaScript

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({
  baseUrl: 'http://localhost:7373',
  apiKey: 'your-api-key'
});

// List agents
const agents = await client.agents.list();

// Create team
const team = await client.teams.create({
  name: 'my-team',
  strategy: 'parallel',
  workers: 3
});

// Create session
const session = await client.sessions.create({
  name: 'my-session',
  maxAgents: 10
});

// Spawn agent
const agent = await client.agents.spawn({
  sessionId: session.id,
  role: 'worker',
  capabilities: ['typescript']
});

// Submit task
const task = await client.tasks.submit({
  sessionId: session.id,
  type: 'code-review',
  input: { filePath: '/src/index.ts' }
});

// Subscribe to events
client.events.subscribe(session.id, (event) => {
  console.log('Event:', event);
});
```

### Python

```python
from godel import GodelClient

client = GodelClient(api_key='your-api-key')

# Create session
session = client.sessions.create(name='my-session', max_agents=10)

# Spawn agent
agent = client.agents.spawn(
    session_id=session.id,
    role='worker',
    capabilities=['python']
)

# Submit task
task = client.tasks.submit(
    session_id=session.id,
    task_type='code-review',
    input={'file_path': '/src/main.py'}
)
```

### cURL

```bash
# Create session
curl -X POST https://api.godel.ai/v1/sessions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-session"}'

# Spawn agent
curl -X POST https://api.godel.ai/v1/agents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "worker-1",
    "role": "worker",
    "teamId": "team-abc123"
  }'

# Submit task
curl -X POST https://api.godel.ai/v1/tasks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "code-review",
    "sessionId": "session-abc123",
    "input": {"filePath": "/src/index.ts"}
  }'
```

---

## Changelog

### v2.0.0 (2026-02-08)
- Added Kata RuntimeProvider
- Added WebSocket event streaming
- Added auto-scaling configuration
- Updated rate limits

### v1.5.0 (2026-01-15)
- Added session management
- Added task queue prioritization
- Added health check endpoints

### v1.0.0 (2025-12-01)
- Initial API release

---

For more information, visit [https://docs.godel.ai](https://docs.godel.ai)
