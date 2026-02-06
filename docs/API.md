# Godel API Endpoint Reference

**Version:** v3.0  
**Base URL:** `http://localhost:7373`  
**WebSocket:** `ws://localhost:7373/events`  
**Last Updated:** 2026-02-02

---

## Authentication

All API endpoints require authentication via the `X-API-Key` header.

```bash
curl -H "X-API-Key: your-api-key" http://localhost:7373/api/agents
```

**Environment Variable:** `GODEL_API_KEY` (defaults to `godel-api-key`)

---

## Response Format

All responses are JSON with the following structure:

**Success:**
```json
{
  "data": { ... }
}
```

**Error:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## Health Check

### GET /health

Check API server health. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "version": "3.0.0"
}
```

---

## Agents API

### GET /api/agents

List all agents.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `swarmId` | string (UUID) | Filter by swarm ID |
| `status` | string[] | Filter by status |
| `page` | integer | Page number (default: 1) |
| `perPage` | integer | Items per page (default: 20, max: 100) |

**Response:**
```json
{
  "agents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "running",
      "model": "kimi-k2.5",
      "task": "Analyze user feedback",
      "swarm_id": "550e8400-e29b-41d4-a716-446655440001",
      "parent_id": null,
      "label": "analyzer-1",
      "spawned_at": "2026-02-02T10:00:00Z",
      "completed_at": null,
      "runtime": 3600000,
      "retry_count": 0,
      "max_retries": 3,
      "metadata": {}
    }
  ]
}
```

**cURL Example:**
```bash
curl -H "X-API-Key: godel-api-key" \
  "http://localhost:7373/api/agents?status=running&page=1"
```

---

### POST /api/agents

Spawn a new agent.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | Yes | Task description (1-1000 chars) |
| `model` | enum | Yes | `kimi-k2.5`, `claude-sonnet-4-5`, `gpt-4`, `gpt-4o` |
| `priority` | enum | No | `low`, `medium`, `high`, `critical` (default: `medium`) |
| `parentId` | UUID | No | Parent agent ID for hierarchical spawning |
| `swarmId` | UUID | No | Swarm ID to add agent to |
| `metadata` | object | No | Additional metadata |

**Example Request:**
```json
{
  "task": "Analyze user feedback from Q4",
  "model": "kimi-k2.5",
  "priority": "high",
  "swarmId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "spawning",
  "model": "kimi-k2.5",
  "task": "Analyze user feedback from Q4",
  "swarm_id": "550e8400-e29b-41d4-a716-446655440001",
  "parent_id": null,
  "spawned_at": "2026-02-02T10:00:00Z",
  "retry_count": 0,
  "max_retries": 3
}
```

**Error Responses:**
- `400 Bad Request` - Invalid input
- `404 Not Found` - Swarm not found

**cURL Example:**
```bash
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Analyze user feedback",
    "model": "kimi-k2.5",
    "priority": "high"
  }' \
  http://localhost:7373/api/agents
```

---

### GET /api/agents/:id

Get agent by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Agent ID |

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "model": "kimi-k2.5",
  "task": "Analyze user feedback",
  "swarm_id": "550e8400-e29b-41d4-a716-446655440001",
  "parent_id": null,
  "label": "analyzer-1",
  "spawned_at": "2026-02-02T10:00:00Z",
  "completed_at": null,
  "runtime": 3600000,
  "retry_count": 0,
  "max_retries": 3,
  "metadata": {}
}
```

**Error Responses:**
- `404 Not Found` - Agent not found

**cURL Example:**
```bash
curl -H "X-API-Key: godel-api-key" \
  http://localhost:7373/api/agents/550e8400-e29b-41d4-a716-446655440000
```

---

### PATCH /api/agents/:id

Update agent.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Agent ID |

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | enum | `idle`, `spawning`, `running`, `paused`, `completed`, `failed`, `killing` |
| `progress` | number | Progress percentage (0-100) |
| `result` | string | Task result |
| `error` | string | Error message |
| `metadata` | object | Additional metadata |

**Constraints:**
- Cannot have both `result` and `error`
- `completed` status requires 100% progress

**Example Request:**
```json
{
  "status": "running",
  "progress": 50
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "progress": 50,
  ...
}
```

**cURL Example:**
```bash
curl -X PATCH \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}' \
  http://localhost:7373/api/agents/550e8400-e29b-41d4-a716-446655440000
```

---

### DELETE /api/agents/:id

Kill an agent.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Agent ID |

**Response:** `204 No Content`

**cURL Example:**
```bash
curl -X DELETE \
  -H "X-API-Key: godel-api-key" \
  http://localhost:7373/api/agents/550e8400-e29b-41d4-a716-446655440000
```

---

### POST /api/agents/:id/action

Perform action on an agent.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Agent ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | enum | Yes | `kill`, `pause`, `resume`, `retry`, `scale` |
| `reason` | string | No | Reason for action (required for kill/pause unless force=true) |
| `force` | boolean | No | Force action without reason (default: false) |
| `delay` | integer | No | Delay in seconds (only for retry/scale) |

**Example Requests:**

Pause agent:
```json
{
  "action": "pause",
  "reason": "High load on system"
}
```

Kill agent (force):
```json
{
  "action": "kill",
  "force": true
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "action": "pause",
  "status": "paused"
}
```

**cURL Examples:**
```bash
# Pause agent
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{"action": "pause", "reason": "Maintenance"}' \
  http://localhost:7373/api/agents/550e8400-e29b-41d4-a716-446655440000/action

# Resume agent
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{"action": "resume"}' \
  http://localhost:7373/api/agents/550e8400-e29b-41d4-a716-446655440000/action
```

---

### POST /api/agents/:id/pause

Pause agent (shortcut endpoint).

**cURL Example:**
```bash
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  http://localhost:7373/api/agents/550e8400-e29b-41d4-a716-446655440000/pause
```

---

### POST /api/agents/:id/resume

Resume agent (shortcut endpoint).

**cURL Example:**
```bash
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  http://localhost:7373/api/agents/550e8400-e29b-41d4-a716-446655440000/resume
```

---

## Swarm API

### GET /api/swarm

List all swarms.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string[] | Filter by status |
| `page` | integer | Page number |
| `perPage` | integer | Items per page |

**Response:**
```json
{
  "swarms": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "analysis-swarm",
      "status": "running",
      "config": {
        "strategy": "parallel",
        "agentCount": 5
      },
      "created_at": "2026-02-02T10:00:00Z",
      "updated_at": "2026-02-02T10:00:00Z"
    }
  ]
}
```

**cURL Example:**
```bash
curl -H "X-API-Key: godel-api-key" \
  http://localhost:7373/api/swarm
```

---

### POST /api/swarm

Create a new swarm.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Swarm name (1-100 chars, alphanumeric + -_) |
| `description` | string | No | Description (max 500 chars) |
| `agents` | integer | Yes | Number of agents (1-100) |
| `strategy` | enum | No | `parallel`, `map-reduce`, `pipeline`, `race` (default: `parallel`) |
| `budget` | number | No | Budget limit (max 10000) |
| `config` | object | No | Additional configuration |

**Constraints:**
- `race` strategy requires at least 2 agents
- `map-reduce` requires at least 3 agents

**Example Request:**
```json
{
  "name": "analysis-swarm",
  "description": "Analyze Q4 feedback data",
  "agents": 5,
  "strategy": "parallel",
  "budget": 100.00
}
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "analysis-swarm",
  "status": "running",
  "config": {
    "strategy": "parallel",
    "agentCount": 5
  },
  "created_at": "2026-02-02T10:00:00Z",
  "updated_at": "2026-02-02T10:00:00Z"
}
```

**cURL Example:**
```bash
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "analysis-swarm",
    "agents": 5,
    "strategy": "parallel"
  }' \
  http://localhost:7373/api/swarm
```

---

### GET /api/swarm/:id

Get swarm by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Swarm ID |

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "analysis-swarm",
  "status": "running",
  "config": {
    "strategy": "parallel",
    "agentCount": 5
  },
  "agentCount": 5,
  "agents": [
    { "id": "550e8400-e29b-41d4-a716-446655440000", "status": "running" }
  ],
  "created_at": "2026-02-02T10:00:00Z",
  "updated_at": "2026-02-02T10:00:00Z"
}
```

**cURL Example:**
```bash
curl -H "X-API-Key: godel-api-key" \
  http://localhost:7373/api/swarm/550e8400-e29b-41d4-a716-446655440001
```

---

### PATCH /api/swarm/:id

Update swarm.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Swarm ID |

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Swarm name |
| `description` | string | Description |
| `status` | enum | `running`, `paused`, `completed`, `failed` |
| `config` | object | Configuration updates |

**Constraints:**
- At least one field must be provided

**Example Request:**
```json
{
  "status": "paused"
}
```

**cURL Example:**
```bash
curl -X PATCH \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}' \
  http://localhost:7373/api/swarm/550e8400-e29b-41d4-a716-446655440001
```

---

### DELETE /api/swarm/:id

Destroy swarm and all its agents.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Swarm ID |

**Response:** `204 No Content`

**cURL Example:**
```bash
curl -X DELETE \
  -H "X-API-Key: godel-api-key" \
  http://localhost:7373/api/swarm/550e8400-e29b-41d4-a716-446655440001
```

---

### POST /api/swarm/:id/scale

Scale swarm to target number of agents.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Swarm ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetAgents` | integer | Yes | Target number of agents (1-100) |

**Example Request:**
```json
{
  "targetAgents": 10
}
```

**Response:**
```json
{
  "swarmId": "550e8400-e29b-41d4-a716-446655440001",
  "previousCount": 5,
  "newCount": 10,
  "agents": [...]
}
```

**cURL Example:**
```bash
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{"targetAgents": 10}' \
  http://localhost:7373/api/swarm/550e8400-e29b-41d4-a716-446655440001/scale
```

---

## Events API

### GET /api/events

Stream events via Server-Sent Events (SSE).

**Response:** `text/event-stream`

**Event Format:**
```
data: {"type": "agent.spawned", "timestamp": "2026-02-02T10:00:00Z", ...}

data: {"type": "agent.completed", "timestamp": "2026-02-02T10:05:00Z", ...}

:heartbeat
```

**cURL Example:**
```bash
curl -H "X-API-Key: godel-api-key" \
  http://localhost:7373/api/events
```

---

### POST /api/events

Create a new event.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventType` | string | Yes | Event type |
| `payload` | object | Yes | Event payload |
| `agentId` | UUID | No | Associated agent ID |
| `swarmId` | UUID | No | Associated swarm ID |

**Example Request:**
```json
{
  "eventType": "custom.event",
  "payload": {
    "message": "Custom event occurred",
    "severity": "info"
  },
  "agentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (201 Created):**
```json
{
  "id": 123,
  "type": "custom.event",
  "source": "self-improvement",
  "payload": "{\"message\":\"...\",\"severity\":\"info\"}",
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "swarm_id": null,
  "created_at": "2026-02-02T10:00:00Z"
}
```

**cURL Example:**
```bash
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "custom.event",
    "payload": {"message": "Hello"}
  }' \
  http://localhost:7373/api/events
```

---

## WebSocket API

Connect to WebSocket for real-time events.

**URL:** `ws://localhost:7373/events`

**Authentication:** Pass API key as query parameter or header.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:7373/events?apiKey=godel-api-key');

ws.onopen = () => {
  console.log('Connected to Godel WebSocket');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### Event Types

| Event Type | Description | Payload |
|------------|-------------|---------|
| `agent.spawned` | Agent was spawned | `{ agentId, swarmId, task }` |
| `agent.started` | Agent started execution | `{ agentId, timestamp }` |
| `agent.paused` | Agent was paused | `{ agentId, reason }` |
| `agent.resumed` | Agent was resumed | `{ agentId }` |
| `agent.completed` | Agent completed task | `{ agentId, result }` |
| `agent.failed` | Agent failed | `{ agentId, error }` |
| `agent.killed` | Agent was killed | `{ agentId, reason }` |
| `swarm.created` | Swarm was created | `{ swarmId, name, config }` |
| `swarm.destroyed` | Swarm was destroyed | `{ swarmId }` |
| `swarm.scaled` | Swarm was scaled | `{ swarmId, previousCount, newCount }` |
| `budget.warning` | Budget warning threshold reached | `{ budgetId, threshold, current }` |
| `budget.critical` | Budget critical threshold reached | `{ budgetId, threshold, current }` |

---

## Data Models

### Agent

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `status` | enum | Current status |
| `model` | string | AI model used |
| `task` | string | Task description |
| `swarm_id` | UUID | Parent swarm (optional) |
| `parent_id` | UUID | Parent agent (optional) |
| `label` | string | Display label |
| `spawned_at` | datetime | Creation timestamp |
| `completed_at` | datetime | Completion timestamp (optional) |
| `runtime` | integer | Runtime in milliseconds |
| `retry_count` | integer | Number of retries |
| `max_retries` | integer | Maximum retry attempts |
| `metadata` | object | Additional data |

### Agent Status Values

| Status | Description |
|--------|-------------|
| `idle` | Agent is idle |
| `spawning` | Agent is being spawned |
| `running` | Agent is executing |
| `paused` | Agent is paused |
| `completed` | Agent completed successfully |
| `failed` | Agent failed |
| `killing` | Agent is being killed |

### Swarm

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `name` | string | Swarm name |
| `status` | enum | Current status |
| `config` | object | Configuration |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

### Swarm Status Values

| Status | Description |
|--------|-------------|
| `running` | Swarm is active |
| `paused` | Swarm is paused |
| `completed` | Swarm completed |
| `failed` | Swarm failed |

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_INPUT` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Authentication failed |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

- Default: 100 requests per minute
- Configurable via `rateLimit` server config
- Rate limit headers included in responses:
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

---

## CORS

CORS is enabled with configurable origins. Default allows `http://localhost:3000`.

Configure via server config:
```javascript
{
  corsOrigins: ['https://yourdomain.com']
}
```
