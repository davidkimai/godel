# RLM Hypervisor API Documentation

## Overview

The RLM (Recursive Language Model) Hypervisor API provides a comprehensive interface for managing agent-based task execution with advanced features including recursive decomposition, parallel processing, quota management, and enterprise-grade security.

**Base URL:** `https://api.rlm-hypervisor.io/v1`  
**Protocol:** HTTPS (TLS 1.3 required)  
**Authentication:** Bearer Token (JWT)  
**Content-Type:** `application/json`

---

## Quick Start

```typescript
import { RLMClient } from '@rlm-hypervisor/sdk';

const client = new RLMClient({
  apiKey: process.env.RLM_API_KEY,
  region: 'us-west-2'
});

// Execute a task
const result = await client.execute({
  type: 'recursive',
  description: 'Process dataset',
  input: { items: [1, 2, 3, 4, 5], operation: 'sum' }
});
```

---

## Authentication

All API requests must include an Authorization header with a valid JWT token.

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Scopes

| Scope | Description |
|-------|-------------|
| `rlm:execute` | Execute tasks and agents |
| `rlm:read` | Read task status and results |
| `rlm:admin` | Administrative operations |
| `rlm:quota:read` | View quota usage |
| `rlm:quota:manage` | Manage quotas (enterprise) |

---

## Core Endpoints

### Execute Task

Execute a task with the RLM hypervisor.

```http
POST /execute
```

#### Request Body

```typescript
interface ExecuteRequest {
  type: 'recursive' | 'parallel' | 'sequential';
  description: string;
  complexity?: 'linear' | 'quadratic' | 'exponential';
  input: unknown;
  expectedOutput?: unknown;
  options?: {
    maxDepth?: number;
    timeoutMs?: number;
    priority?: 'low' | 'normal' | 'high' | 'critical';
  };
}
```

#### Response

```typescript
interface ExecuteResponse {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: unknown;
  executionTimeMs: number;
  agentCalls: number;
  decompositionDepth: number;
  success: boolean;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

#### Example

```bash
curl -X POST https://api.rlm-hypervisor.io/v1/execute \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "recursive",
    "description": "Sum large dataset",
    "input": {
      "items": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "operation": "sum"
    },
    "options": {
      "timeoutMs": 30000,
      "priority": "normal"
    }
  }'
```

---

### Get Task Status

Retrieve the current status of a task.

```http
GET /tasks/{taskId}
```

#### Response

```typescript
interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: ExecuteResponse;
}
```

---

### Cancel Task

Cancel a running task.

```http
POST /tasks/{taskId}/cancel
```

#### Response

```typescript
interface CancelResponse {
  taskId: string;
  status: 'cancelled' | 'already_completed' | 'not_found';
  message: string;
}
```

---

## Quota Management Endpoints

### User Quotas

#### Get User Quota Status

```http
GET /quotas/user/{userId}
```

#### Response

```typescript
interface UserQuotaStatus {
  userId: string;
  daily: QuotaPeriod;
  weekly: QuotaPeriod;
  monthly: QuotaPeriod;
  currentConcurrentAgents: number;
  maxConcurrentAgents: number;
}

interface QuotaPeriod {
  agentsUsed: number;
  agentsLimit: number;
  agentsRemaining: number;
  computeHoursUsed: number;
  computeHoursLimit: number;
  resetTime: string;
  exceeded: boolean;
}
```

#### Check Allocation

```http
POST /quotas/user/{userId}/check
```

**Request Body:**
```typescript
{
  "agentsRequested": 5,
  "sessionId": "session-123"
}
```

**Response:**
```typescript
{
  "allowed": true,
  "reason": "Quota available"
}
```

---

### Team Quotas

#### Get Team Quota Status

```http
GET /quotas/team/{teamId}
```

#### Response

```typescript
interface TeamQuotaStatus {
  teamId: string;
  config: {
    teamName: string;
    totalAgentPool: number;
    totalComputeHours: number;
    totalStorageGB: number;
  };
  usage: {
    agentsUsed: number;
    agentsTotal: number;
    computeUsed: number;
    computeTotal: number;
    storageUsed: number;
    storageTotal: number;
  };
  members: TeamMember[];
  projects: ProjectAllocation[];
}
```

#### Request Quota Transfer

```http
POST /quotas/team/{teamId}/transfers
```

**Request Body:**
```typescript
{
  "fromUserId": "user-a",
  "toUserId": "user-b",
  "agents": 10,
  "computeHours": 100
}
```

---

### Enterprise Quotas

#### Get Organization Hierarchy

```http
GET /quotas/enterprise/org/{orgId}/hierarchy
```

#### Response

```typescript
interface OrganizationHierarchy {
  org: Organization;
  ancestors: Organization[];
  descendants: Organization[];
  siblings: Organization[];
}
```

#### Update Organization Quotas

```http
PATCH /quotas/enterprise/org/{orgId}
```

**Request Body:**
```typescript
{
  "agents": 1000,
  "computeHours": 10000,
  "storageGB": 5000
}
```

---

## Storage Endpoints

### Read Byte Range

Read a specific byte range from storage.

```http
POST /storage/read
```

**Request Body:**
```typescript
{
  "connector": "gcs" | "s3" | "local",
  "key": "path/to/file",
  "start": 0,
  "end": 1024
}
```

**Response:**
```typescript
{
  "data": "base64-encoded-data",
  "latencyMs": 15,
  "method": "mmap" | "direct" | "async" | "standard"
}
```

---

## Security Endpoints

### Validate Security Policy

```http
POST /security/validate
```

**Request Body:**
```typescript
{
  "input": "user input to validate",
  "context": {
    "userId": "user-123",
    "action": "create_agent",
    "resource": "agent-456"
  }
}
```

**Response:**
```typescript
{
  "allowed": true,
  "sanitized": "cleaned input",
  "violations": []
}
```

### Get Security Events

```http
GET /security/events?severity=critical&limit=100
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `QUOTA_EXCEEDED` | 429 | Daily/weekly/monthly quota exceeded |
| `RATE_LIMITED` | 429 | Too many requests |
| `INVALID_INPUT` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `TASK_NOT_FOUND` | 404 | Task ID does not exist |
| `TIMEOUT` | 408 | Task execution timed out |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Rate Limits

| Tier | Requests/Min | Requests/Hour | Concurrent Agents |
|------|--------------|---------------|-------------------|
| Anonymous | 10 | 100 | 0 |
| User | 60 | 1,000 | 5 |
| Power User | 120 | 5,000 | 20 |
| Admin | 300 | 20,000 | 100 |
| Enterprise | 600 | 50,000 | 500 |

---

## TypeScript Type Definitions

```typescript
// Complete type definitions for SDK users

export type TaskType = 'recursive' | 'parallel' | 'sequential';
export type Complexity = 'linear' | 'quadratic' | 'exponential';
export type Priority = 'low' | 'normal' | 'high' | 'critical';

export interface OOLONGTask {
  id: string;
  type: TaskType;
  description: string;
  complexity: Complexity;
  input: unknown;
  expectedOutput?: unknown;
}

export interface OOLONGResult {
  taskId: string;
  output: unknown;
  executionTimeMs: number;
  agentCalls: number;
  decompositionDepth: number;
  success: boolean;
}

export interface QuotaConfig {
  userId: string;
  dailyAgentLimit: number;
  weeklyAgentLimit: number;
  monthlyAgentLimit: number;
  dailyComputeHours: number;
  maxConcurrentAgents: number;
  maxStorageGB: number;
}

export interface SecurityPolicy {
  policyId: string;
  name: string;
  category: 'authentication' | 'authorization' | 'input_validation' | 'audit';
  enabled: boolean;
  priority: number;
}
```

---

## Webhooks

Configure webhooks for real-time event notifications.

### Task Completion Webhook

```http
POST https://your-domain.com/webhooks/rlm
```

**Payload:**
```typescript
{
  "event": "task.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "taskId": "task-123",
    "status": "completed",
    "result": { /* OOLONGResult */ }
  }
}
```

### Quota Alert Webhook

```typescript
{
  "event": "quota.threshold_exceeded",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "userId": "user-123",
    "threshold": 80,
    "period": "daily",
    "usage": { /* QuotaStatus */ }
  }
}
```

---

## SDK Examples

### JavaScript/TypeScript

```bash
npm install @rlm-hypervisor/sdk
```

```typescript
import { RLMClient } from '@rlm-hypervisor/sdk';

const client = new RLMClient({ apiKey: 'your-api-key' });

// Execute recursive task
const result = await client.execute({
  type: 'recursive',
  description: 'Process items recursively',
  input: { items: [1, 2, 3, 4, 5], operation: 'sum' }
});

// Check quotas
const quotas = await client.quotas.getStatus();
console.log(`Remaining: ${quotas.daily.agentsRemaining}`);
```

### Python

```bash
pip install rlm-hypervisor
```

```python
from rlm_hypervisor import RLMClient

client = RLMClient(api_key="your-api-key")

result = client.execute({
    "type": "recursive",
    "description": "Process items",
    "input": {"items": [1, 2, 3, 4, 5], "operation": "sum"}
})

print(f"Result: {result.output}")
```

---

## Support

- **Documentation:** https://docs.rlm-hypervisor.io
- **API Status:** https://status.rlm-hypervisor.io
- **Support Email:** support@rlm-hypervisor.io
- **Community:** https://community.rlm-hypervisor.io
