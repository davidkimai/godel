# Godel Architecture

System overview, component diagrams, data flow, and scaling considerations.

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Data Flow](#data-flow)
4. [Event System](#event-system)
5. [Scaling Considerations](#scaling-considerations)

---

## System Overview

Godel is a distributed agent orchestration platform built on a modular, event-driven architecture. It coordinates AI agents across multiple execution contexts while maintaining state, enforcing safety, and providing observability.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐│
│  │  CLI Client  │  │  TUI Client  │  │  API Client  │  │  External Tools  ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘│
└─────────┼─────────────────┼─────────────────┼───────────────────┼──────────┘
          │                 │                 │                   │
          └─────────────────┴────────┬────────┴───────────────────┘
                                     │
┌────────────────────────────────────┴─────────────────────────────────────────┐
│                           API Gateway Layer                                  │
│                         (Express.js Server)                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ REST API     │  │ WebSocket    │  │ Rate Limiter │  │ Auth Middleware  │ │
│  │ Endpoints    │  │ Endpoints    │  │              │  │                  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
└─────────┼─────────────────┼─────────────────┼───────────────────┼───────────┘
          │                 │                 │                   │
          └─────────────────┴────────┬────────┴───────────────────┘
                                     │
┌────────────────────────────────────┴─────────────────────────────────────────┐
│                         Core Services Layer                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Service Orchestrator                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐│
│  │ Agent        │  │ Swarm        │  │ Workflow     │  │ Task             ││
│  │ Manager      │  │ Manager      │  │ Engine       │  │ Manager          ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐│
│  │ Skill        │  │ Extension    │  │ Event        │  │ Budget           ││
│  │ Registry     │  │ Loader       │  │ Bus          │  │ Manager          ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐│
│  │ Reasoning    │  │ Safety       │  │ Context      │  │ Quality          ││
│  │ Engine       │  │ Manager      │  │ Manager      │  │ Controller       ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
┌────────────────────────────────────┴─────────────────────────────────────────┐
│                        Infrastructure Layer                                  │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ PostgreSQL       │  │ Redis            │  │ OpenClaw Gateway         │   │
│  │ (State Store)    │  │ (Cache/Queue)    │  │ (Notifications)          │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ SQLite           │  │ Git Worktrees    │  │ External APIs            │   │
│  │ (Local/Embedded) │  │ (Agent Isolation)│  │ (LLM Providers)          │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. CLI Layer

The CLI provides the primary interface for interacting with Godel.

**Components:**
- **Command Parser** (Commander.js) - Parses and validates CLI arguments
- **Command Router** - Routes commands to appropriate handlers
- **Output Formatter** - Formats output for terminal display
- **Interactive Prompts** - Guided command workflows

**Key Files:**
- `src/commands/` - Command implementations
- `src/index.ts` - CLI entry point

### 2. API Gateway

REST API and WebSocket server for programmatic access.

**Components:**
- **Express Server** - HTTP server framework
- **Route Handlers** - API endpoint implementations
- **Middleware Stack** - Auth, validation, logging
- **WebSocket Manager** - Real-time event streaming

**Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/agents` | GET/POST | Agent management |
| `/api/v1/swarms` | GET/POST | Swarm management |
| `/api/v1/workflows` | GET/POST | Workflow execution |
| `/api/v1/events` | WS | Event streaming |

### 3. Core Services

#### Agent Manager

Manages the lifecycle of individual AI agents.

**Responsibilities:**
- Spawn agents in isolated Git worktrees
- Monitor agent health and progress
- Handle agent lifecycle (pause, resume, kill)
- Collect agent outputs and artifacts

**Key Methods:**
```typescript
interface AgentManager {
  spawn(task: string, options: AgentOptions): Promise<Agent>;
  pause(agentId: string): Promise<void>;
  resume(agentId: string): Promise<void>;
  kill(agentId: string): Promise<void>;
  getStatus(agentId: string): AgentStatus;
}
```

#### Swarm Manager

Orchestrates multiple agents working together.

**Responsibilities:**
- Create and manage agent swarms
- Implement execution strategies (parallel, map-reduce, pipeline)
- Handle auto-scaling based on workload
- Coordinate inter-agent communication

**Execution Strategies:**
| Strategy | Description | Use Case |
|----------|-------------|----------|
| `parallel` | All agents work independently | Code review, analysis |
| `map-reduce` | Split work, aggregate results | Data processing |
| `pipeline` | Sequential agent stages | CI/CD, build pipelines |
| `tree` | Hierarchical task decomposition | Complex problem solving |

#### Workflow Engine

DAG-based workflow execution system.

**Responsibilities:**
- Parse workflow definitions (YAML)
- Perform topological sorting
- Execute steps with dependency resolution
- Handle parallel execution
- Manage step retries and timeouts

**State Machine:**
```
Pending → Running → Completed
   ↓         ↓
Cancelled   Failed
               ↓
            Retrying
```

#### Task Manager

Manages task queue and assignment.

**Responsibilities:**
- Queue incoming tasks
- Assign tasks to agents
- Track task status
- Handle task priorities

#### Skill Registry

Auto-loading agent capabilities based on context.

**Responsibilities:**
- Load skills from multiple sources
- Match skills to context
- Activate/deactivate skills
- Format skills for LLM prompts

**Skill Sources:**
1. User skills (`~/.godel/skills/`)
2. Project skills (`./.godel/skills/`)
3. Built-in skills (`./skills/`)

#### Extension Loader

TypeScript-based plugin system.

**Responsibilities:**
- Load and validate extensions
- Register custom tools
- Register custom commands
- Handle extension events
- Hot reload in development

#### Event Bus

Pub/sub system for real-time coordination.

**Responsibilities:**
- Publish events
- Subscribe to event patterns
- Route events to handlers
- Persist events for replay

**Event Types:**
```typescript
type EventType =
  | 'agent:start'
  | 'agent:complete'
  | 'agent:error'
  | 'swarm:start'
  | 'swarm:complete'
  | 'workflow:step:start'
  | 'workflow:step:complete'
  | 'budget:warning'
  | 'budget:exceeded';
```

#### Budget Manager

Tracks and enforces budget limits.

**Responsibilities:**
- Track token usage per session
- Enforce budget limits
- Send threshold alerts
- Calculate cost estimates

#### Safety Manager

Enforces safety boundaries and permissions.

**Responsibilities:**
- Validate tool permissions
- Enforce sandbox boundaries
- Block dangerous operations
- Log security events

---

## Data Flow

### Agent Spawn Flow

```
User Command
     │
     ▼
┌─────────────┐
│ CLI Parser  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Agent       │
│ Manager     │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ Worktree    │────▶│ Git Worktree│
│ Manager     │     │ Creation    │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ Agent       │────▶│ Event Bus   │
│ Spawn       │     │ (agent:start)│
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│ LLM         │
│ Provider    │
└─────────────┘
```

### Workflow Execution Flow

```
Workflow YAML
     │
     ▼
┌─────────────┐
│ Parser      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ DAG Builder │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Topological │
│ Sort        │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│ Execution   │◀───▶│ Step        │
│ Engine      │     │ Executor    │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│ State Store │
│ (PostgreSQL)│
└─────────────┘
```

### Event Propagation Flow

```
Event Source
     │
     ▼
┌─────────────┐
│ Event Bus   │
│ (Publish)   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Subscription│
│ Router      │
└──────┬──────┘
       │
       ├──▶ WebSocket Clients
       ├──▶ Extension Handlers
       ├──▶ Notification System
       └──▶ Log Writers
```

---

## Event System

### Event Structure

```typescript
interface Event {
  id: string;                    // Unique event ID
  type: EventType;               // Event type
  timestamp: number;             // Unix timestamp (ms)
  source: string;                // Event source component
  data: Record<string, unknown>; // Event payload
  metadata: {
    correlationId?: string;      // Request correlation
    userId?: string;             // Originating user
    agentId?: string;            // Related agent
    swarmId?: string;            // Related swarm
  };
}
```

### Event Categories

#### Lifecycle Events
| Event | Description | Data |
|-------|-------------|------|
| `agent:start` | Agent started | `{ agentId, task, model }` |
| `agent:complete` | Agent completed | `{ agentId, duration, cost }` |
| `agent:error` | Agent error | `{ agentId, error, stack }` |
| `swarm:start` | Swarm started | `{ swarmId, name, agents }` |
| `swarm:complete` | Swarm completed | `{ swarmId, results }` |

#### Workflow Events
| Event | Description | Data |
|-------|-------------|------|
| `workflow:start` | Workflow started | `{ workflowId, name }` |
| `workflow:step:start` | Step started | `{ workflowId, stepId }` |
| `workflow:step:complete` | Step completed | `{ workflowId, stepId, output }` |
| `workflow:complete` | Workflow completed | `{ workflowId, status }` |

#### System Events
| Event | Description | Data |
|-------|-------------|------|
| `budget:warning` | Budget warning | `{ current, limit, percentage }` |
| `budget:exceeded` | Budget exceeded | `{ current, limit }` |
| `safety:block` | Action blocked | `{ action, reason }` |
| `extension:reload` | Extension reloaded | `{ extensionName }` |

### Event Subscriptions

```typescript
// Subscribe to specific event type
eventBus.on('agent:complete', (event) => {
  console.log(`Agent ${event.data.agentId} completed`);
});

// Subscribe to multiple events
eventBus.on(['agent:start', 'agent:complete'], (event) => {
  updateDashboard(event);
});

// Subscribe with pattern matching
eventBus.onPattern('workflow:*', (event) => {
  logWorkflowEvent(event);
});

// One-time subscription
eventBus.once('swarm:complete', (event) => {
  sendNotification(event);
});
```

---

## Scaling Considerations

### Horizontal Scaling

Godel supports horizontal scaling through:

#### 1. Stateless Services

Core services are stateless and can be replicated:
- API Gateway - Run multiple instances behind load balancer
- Agent Manager - Distribute agents across nodes
- Event Bus - Use Redis pub/sub for cross-node events

#### 2. Shared State Store

PostgreSQL provides shared state for all nodes:
```yaml
# docker-compose.scale.yml
services:
  godel-api-1:
    build: .
    environment:
      - DATABASE_URL=postgresql://shared-db/godel
      - REDIS_URL=redis://shared-redis
  
  godel-api-2:
    build: .
    environment:
      - DATABASE_URL=postgresql://shared-db/godel
      - REDIS_URL=redis://shared-redis
```

#### 3. Load Balancing

```nginx
# nginx.conf
upstream godel_api {
    least_conn;
    server godel-api-1:3000;
    server godel-api-2:3000;
    server godel-api-3:3000;
}

server {
    location /api/ {
        proxy_pass http://godel_api;
    }
}
```

### Vertical Scaling

#### Agent Worktree Isolation

Each agent runs in an isolated Git worktree:
- Prevents conflicts between agents
- Enables parallel execution
- Simplifies cleanup

**Scaling Limits:**
- Limited by available disk space
- Limited by Git worktree count (default: unlimited)
- Limited by system file descriptors

#### Memory Optimization

```typescript
// Agent pool with memory limits
const agentManager = new AgentManager({
  maxConcurrentAgents: 10,
  memoryLimitMB: 2048,
  cleanupIntervalMs: 60000,
});
```

### Database Scaling

#### Read Replicas

```env
# Primary database for writes
DATABASE_URL=postgresql://primary:5432/godel

# Read replicas for queries
DATABASE_READ_URL_1=postgresql://replica1:5432/godel
DATABASE_READ_URL_2=postgresql://replica2:5432/godel
```

#### Connection Pooling

```typescript
// PgBouncer configuration
const pool = new Pool({
  host: 'pgbouncer',
  port: 6432,
  max: 20,           // Max connections per node
  idleTimeoutMillis: 30000,
});
```

### Caching Strategy

#### Redis Cluster

```yaml
# redis-cluster.yml
services:
  redis-master-1:
    image: redis:7-alpine
  redis-master-2:
    image: redis:7-alpine
  redis-master-3:
    image: redis:7-alpine
```

#### Cache Layers

| Layer | Purpose | TTL |
|-------|---------|-----|
| L1 (Memory) | Hot data, agent state | 60s |
| L2 (Redis) | Warm data, workflow state | 300s |
| L3 (PostgreSQL) | Cold data, event history | Permanent |

### Monitoring at Scale

#### Prometheus Metrics

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'godel-api'
    static_configs:
      - targets: ['godel-api-1:9090', 'godel-api-2:9090']
```

#### Distributed Tracing

```typescript
// OpenTelemetry configuration
const tracer = trace.getTracer('godel');

const span = tracer.startSpan('workflow.execute');
span.setAttribute('workflow.id', workflowId);
span.setAttribute('swarm.id', swarmId);
// ... execution
span.end();
```

### Performance Benchmarks

| Metric | Single Node | 3-Node Cluster | 10-Node Cluster |
|--------|-------------|----------------|-----------------|
| Max Concurrent Agents | 50 | 150 | 500 |
| Events/Second | 1,000 | 3,000 | 10,000 |
| Workflow Executions/Hour | 100 | 300 | 1,000 |
| API Requests/Second | 500 | 1,500 | 5,000 |

### Scaling Checklist

Before scaling to production:

- [ ] PostgreSQL read replicas configured
- [ ] Redis Cluster or Sentinel setup
- [ ] Load balancer configured with health checks
- [ ] Monitoring and alerting in place
- [ ] Backup and recovery procedures documented
- [ ] Resource limits defined (CPU, memory, disk)
- [ ] Auto-scaling policies configured
- [ ] Circuit breakers for external services
- [ ] Rate limiting enabled
- [ ] Log aggregation configured

---

**Next Steps:**
- [Deployment Guide](DEPLOYMENT.md) - Production deployment
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
- [Contributing](CONTRIBUTING.md) - Development setup
