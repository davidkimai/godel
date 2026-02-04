# API Documentation Gaps

**Status:** Specification Document  
**Purpose:** Define missing API endpoints for complete agent integration  
**Estimated Implementation:** 1 week

---

## Missing Endpoints (11 Total)

### 🔴 Critical Priority

#### 1. POST /api/agents - Spawn Agent
Create and spawn a new agent.

**Request:**
```http
POST /api/agents
Content-Type: application/json
X-API-Key: {api_key}

{
  "swarmId": "swarm-abc123",
  "config": {
    "strategy": "round-robin",
    "tools": ["github", "slack"]
  },
  "metadata": {
    "source": "api",
    "requestedBy": "agent-orchestrator"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "agent-xyz789",
    "swarmId": "swarm-abc123",
    "status": "spawning",
    "createdAt": "2024-01-15T10:00:00Z",
    "links": {
      "self": "/api/agents/agent-xyz789",
      "swarm": "/api/swarms/swarm-abc123",
      "logs": "/api/agents/agent-xyz789/logs"
    }
  }
}
```

**Errors:**
- `400` - Invalid configuration
- `404` - Swarm not found
- `409` - Swarm at capacity
- `402` - Budget exceeded

---

#### 2. POST /api/agents/:id/kill - Kill Agent
Terminate an agent.

**Request:**
```http
POST /api/agents/agent-xyz789/kill
Content-Type: application/json
X-API-Key: {api_key}

{
  "force": false,
  "reason": "Task completed"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "agent-xyz789",
    "status": "terminating",
    "previousStatus": "running",
    "terminatedAt": "2024-01-15T10:05:00Z"
  }
}
```

**Errors:**
- `404` - Agent not found
- `409` - Agent already terminated
- `403` - Permission denied

---

#### 3. GET /api/capabilities - Discovery
Discover Dash capabilities and API schema.

**Request:**
```http
GET /api/capabilities
Accept: application/json
```

**Response (200 OK):**
```json
{
  "version": "3.0.0",
  "name": "dash",
  "description": "Agent orchestration platform",
  "api": {
    "baseUrl": "/api",
    "version": "v1",
    "openapi": "/api/openapi.json",
    "websocket": "/events"
  },
  "capabilities": [
    "swarm-management",
    "agent-lifecycle",
    "task-queue",
    "event-streaming",
    "budget-tracking",
    "multi-region"
  ],
  "authentication": {
    "methods": ["api-key", "bearer"],
    "header": "X-API-Key"
  },
  "rateLimits": {
    "default": 1000,
    "window": "1m"
  },
  "links": {
    "docs": "https://docs.dash.dev",
    "skills": "/skill.json"
  }
}
```

---

### 🟡 High Priority

#### 4. GET /api/agents/:id/logs - Agent Logs
Retrieve agent logs.

**Request:**
```http
GET /api/agents/agent-xyz789/logs?lines=100&level=error&since=1h
X-API-Key: {api_key}
```

**Query Parameters:**
- `lines` - Number of lines (default: 100, max: 10000)
- `level` - Filter by level (debug, info, warn, error)
- `since` - Relative time (e.g., "1h", "30m") or ISO timestamp
- `until` - End time
- `search` - Search term
- `follow` - Stream logs (SSE)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "agentId": "agent-xyz789",
    "logs": [
      {
        "timestamp": "2024-01-15T10:00:01Z",
        "level": "info",
        "message": "Agent started",
        "metadata": { "pid": 1234 }
      },
      {
        "timestamp": "2024-01-15T10:00:05Z",
        "level": "error",
        "message": "Connection failed",
        "metadata": { "retry": 1 }
      }
    ],
    "total": 150,
    "returned": 100,
    "links": {
      "next": "/api/agents/agent-xyz789/logs?offset=100",
      "stream": "/api/agents/agent-xyz789/logs?follow=true"
    }
  }
}
```

---

#### 5. POST /api/tasks - Create Task
Create a new task.

**Request:**
```http
POST /api/tasks
Content-Type: application/json
X-API-Key: {api_key}

{
  "type": "code-review",
  "payload": {
    "repository": "owner/repo",
    "pr": 123
  },
  "swarmId": "swarm-abc123",
  "priority": 1,
  "deadline": "2024-01-15T12:00:00Z",
  "dependencies": ["task-abc"]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "task-xyz789",
    "type": "code-review",
    "status": "pending",
    "swarmId": "swarm-abc123",
    "priority": 1,
    "createdAt": "2024-01-15T10:00:00Z",
    "links": {
      "self": "/api/tasks/task-xyz789",
      "assign": "/api/tasks/task-xyz789/assign"
    }
  }
}
```

---

#### 6. POST /api/tasks/:id/assign - Assign Task
Assign task to an agent.

**Request:**
```http
POST /api/tasks/task-xyz789/assign
Content-Type: application/json
X-API-Key: {api_key}

{
  "agentId": "agent-abc123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "task-xyz789",
    "status": "assigned",
    "assignedTo": "agent-abc123",
    "assignedAt": "2024-01-15T10:05:00Z"
  }
}
```

---

#### 7. POST /api/bus/publish - Publish Event
Publish to message bus.

**Request:**
```http
POST /api/bus/publish
Content-Type: application/json
X-API-Key: {api_key}

{
  "topic": "swarm:updates",
  "type": "status-change",
  "payload": {
    "swarmId": "swarm-abc123",
    "status": "active"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "messageId": "msg-xyz789",
    "topic": "swarm:updates",
    "publishedAt": "2024-01-15T10:00:00Z"
  }
}
```

---

#### 8. GET /api/bus/subscribe - Subscribe to Topic
WebSocket endpoint for subscribing to topics.

**WebSocket Connection:**
```
ws://localhost:7373/api/bus/subscribe?topics=swarm:updates,agent:events
Headers: X-API-Key: {api_key}
```

**Incoming Messages:**
```json
{
  "type": "message",
  "topic": "swarm:updates",
  "data": {
    "swarmId": "swarm-abc123",
    "status": "active"
  },
  "timestamp": "2024-01-15T10:00:01Z"
}
```

---

#### 9. GET /api/metrics/json - JSON Metrics
Get metrics in JSON format (not just Prometheus).

**Request:**
```http
GET /api/metrics/json
X-API-Key: {api_key}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-15T10:00:00Z",
    "agents": {
      "active": 45,
      "pending": 5,
      "failed": 2,
      "total": 52
    },
    "swarms": {
      "active": 3,
      "total": 5
    },
    "events": {
      "perSecond": 1524,
      "total": 150000
    },
    "budget": {
      "consumed": 45.50,
      "allocated": 100.00,
      "currency": "USD"
    },
    "system": {
      "cpuPercent": 35.2,
      "memoryMB": 512,
      "websocketConnections": 50
    }
  }
}
```

---

#### 10. GET /api/logs - Query Logs
Query aggregated logs.

**Request:**
```http
GET /api/logs?service=agent&level=error&since=1h&limit=100
X-API-Key: {api_key}
```

**Query Parameters:**
- `service` - Service name (agent, swarm, api, etc.)
- `level` - Log level
- `agentId` - Filter by agent
- `swarmId` - Filter by swarm
- `since` - Start time
- `until` - End time
- `search` - Full-text search
- `limit` - Max results
- `offset` - Pagination offset

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "timestamp": "2024-01-15T10:00:00Z",
        "level": "error",
        "service": "agent",
        "agentId": "agent-abc123",
        "message": "Connection timeout",
        "traceId": "trace-xyz789"
      }
    ],
    "total": 1500,
    "returned": 100,
    "links": {
      "next": "/api/logs?offset=100"
    }
  }
}
```

---

### 🟢 Medium Priority

#### 11. GET /api/health/detailed - Detailed Health
Comprehensive health check.

**Request:**
```http
GET /api/health/detailed
X-API-Key: {api_key}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "database": {
        "status": "healthy",
        "latency": "5ms",
        "connections": 10
      },
      "redis": {
        "status": "healthy",
        "latency": "2ms"
      },
      "websocket": {
        "status": "healthy",
        "connections": 50
      },
      "disk": {
        "status": "healthy",
        "freePercent": 85
      },
      "memory": {
        "status": "healthy",
        "usedPercent": 45
      }
    },
    "timestamp": "2024-01-15T10:00:00Z"
  }
}
```

---

## Response Wrapper Standard

All API responses should follow this wrapper format:

```json
{
  "success": true|false,
  "data": { ... },
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  },
  "meta": {
    "timestamp": "2024-01-15T10:00:00Z",
    "requestId": "req-xyz789",
    "pagination": {
      "total": 100,
      "limit": 10,
      "offset": 0,
      "hasMore": true
    }
  },
  "links": {
    "self": "/api/resource/id",
    "next": "/api/resource?offset=10",
    "prev": null
  }
}
```

---

## Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Permission denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service down |

---

## WebSocket Protocol

### Connection
```
ws://localhost:7373/events
Headers: X-API-Key: {api_key}
```

### Authentication
Send auth message immediately after connection:
```json
{
  "type": "auth",
  "apiKey": "dash-api-key"
}
```

### Subscription
Subscribe to specific events:
```json
{
  "type": "subscribe",
  "topics": ["agent:*", "swarm:abc123"]
}
```

### Incoming Events
```json
{
  "type": "event",
  "topic": "agent:spawned",
  "data": {
    "agentId": "agent-xyz789",
    "swarmId": "swarm-abc123",
    "timestamp": "2024-01-15T10:00:00Z"
  }
}
```

---

## OpenAPI 3.0 Specification

Create file: `openapi.yaml`

```yaml
openapi: 3.0.3
info:
  title: Dash API
  version: 3.0.0
  description: Agent orchestration platform API

servers:
  - url: http://localhost:7373/api
    description: Local development

security:
  - ApiKeyAuth: []

paths:
  /agents:
    post:
      summary: Spawn agent
      operationId: spawnAgent
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SpawnAgentRequest'
      responses:
        '201':
          description: Agent created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Agent'
  # ... (full spec)

components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
  
  schemas:
    Agent:
      type: object
      properties:
        id:
          type: string
        status:
          type: string
          enum: [spawning, running, paused, failed, terminated]
    # ... (all schemas)
```

Host at: `/api/openapi.json`

---

## @dash/client SDK Structure

```
packages/client/
├── src/
│   ├── index.ts           # Main export
│   ├── client.ts          # DashClient class
│   ├── resources/
│   │   ├── swarms.ts      # Swarms API
│   │   ├── agents.ts      # Agents API
│   │   ├── tasks.ts       # Tasks API
│   │   ├── events.ts      # Events API
│   │   └── bus.ts         # MessageBus API
│   ├── types.ts           # TypeScript types
│   └── errors.ts          # Error classes
├── tests/
│   └── client.test.ts
├── package.json
└── tsconfig.json
```

### Usage Example
```typescript
import { DashClient } from '@dash/client';

const client = new DashClient({
  baseUrl: 'http://localhost:7373',
  apiKey: process.env.DASH_API_KEY
});

// Spawn agent
const agent = await client.agents.spawn({
  swarmId: 'swarm-abc123'
});

// Stream events
const events = client.events.subscribe({
  topics: ['agent:spawned']
});

events.on('agent:spawned', (e) => {
  console.log(`Agent ${e.agentId} spawned`);
});
```

---

## Implementation Checklist

- [ ] POST /api/agents
- [ ] POST /api/agents/:id/kill
- [ ] GET /api/capabilities
- [ ] GET /api/agents/:id/logs
- [ ] POST /api/tasks
- [ ] POST /api/tasks/:id/assign
- [ ] POST /api/bus/publish
- [ ] GET /api/bus/subscribe (WebSocket)
- [ ] GET /api/metrics/json
- [ ] GET /api/logs
- [ ] GET /api/health/detailed
- [ ] Response wrapper standard
- [ ] OpenAPI specification
- [ ] @dash/client SDK
