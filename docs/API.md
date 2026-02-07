# Godel API Documentation

## Overview

Godel provides a comprehensive REST API for agent orchestration.

**Base URL**: `http://localhost:7373/api/v1`

## Authentication

All API requests require authentication using an API key:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:7373/api/v1/agents
```

## Endpoints

### Agents

#### List Agents
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

#### Spawn Agent
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

#### Get Agent
```http
GET /agents/:id
```

#### Kill Agent
```http
DELETE /agents/:id
```

### Teams

#### List Teams
```http
GET /teams
```

#### Create Team
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

#### Get Team
```http
GET /teams/:id
```

#### Scale Team
```http
POST /teams/:id/scale
```

Request Body:
```json
{
  "workers": 5
}
```

#### Destroy Team
```http
DELETE /teams/:id
```

### Tasks

#### List Tasks
```http
GET /tasks
```

Query Parameters:
- `status` - pending, in_progress, completed, failed
- `assignee` - Agent ID
- `priority` - low, medium, high, critical

#### Create Task
```http
POST /tasks
```

Request Body:
```json
{
  "title": "Implement feature",
  "description": "Detailed description",
  "priority": "high",
  "assigneeId": "agent-001"
}
```

### Intent

#### Execute Intent
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

### Worktrees

#### Create Worktree
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

### Health

#### Check Health
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

### Metrics

#### Get Metrics
```http
GET /metrics
```

Returns Prometheus-formatted metrics.

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

## SDK

Use the official SDK for easier integration:

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
```
