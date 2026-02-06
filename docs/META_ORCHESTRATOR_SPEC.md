# Dash + OpenClaw Meta-Orchestrator Architecture Specification

**Version:** 1.0  
**Date:** 2026-02-05  
**Status:** Draft - Strategic Planning

---

## 1. Executive Summary

This specification defines Dash as a **meta-orchestrator** layer that coordinates **10-50+ OpenClaw instances** simultaneously. This 2-layer architecture enables:
- **Massive horizontal scaling** of agent workloads across isolated OpenClaw instances
- **Multi-tenant federations** with hundreds of workspaces
- **Geographic distribution** across regions and cloud providers
- **Resource optimization** through intelligent task routing at scale

---

## 2. Architecture Overview

### 2.1 Two-Layer Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DASH (Meta-Orchestrator)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Task Router  │  │ Federation   │  │ Lifecycle    │  │ Observ-    │ │
│  │ & Dispatcher  │  │ Controller   │  │ Manager      │  │ ability    │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────────┘ │
│         │                   │                   │                         │
│         └───────────────────┴───────────────────┘                         │
│                              │                                            │
│                    gRPC / WebSocket / REST                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
              ┌───────────────┼───────────────┐
               │               │               │
               ▼               ▼               ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   OpenClaw A    │ │   OpenClaw B    │ │   OpenClaw C    │
    │  ┌───────────┐  │ │  ┌───────────┐  │ │  ┌───────────┐  │
    │  │ Gateway   │  │ │  │ Gateway   │  │ │  │ Gateway   │  │
    │  │ Session   │  │ │  │ Session   │  │ │  │ Session   │  │
    │  │ Tools     │  │ │  │ Tools     │  │ │  │ Tools     │  │
    │  │ Channels  │  │ │  │ Channels  │  │ │  │ Channels  │  │
    │  └───────────┘  │ │  └───────────┘  │ │  └───────────┘  │
    │   Workspace A   │ │   Workspace B   │ │   Workspace C   │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 2.2 Key Design Principles

| Principle | Description | Implementation |
|-----------|-------------|-----------------|
| **Isolation** | Each OpenClaw instance is fully isolated | Git worktrees + separate processes |
| **Federation** | Unified management across instances | Dash as single control plane |
| **Observability** | End-to-end tracing across layers | OpenTelemetry + correlation IDs |
| **Fault Tolerance** | Instance failures don't cascade | Circuit breakers + retries |
| **Scalability** | Linear scaling with instances | Stateless Dash + stateful OpenClaws |

---

## 3. Component Specifications

### 3.1 Dash Core Services

#### 3.1.1 Task Router & Dispatcher

**Responsibilities:**
- Receive tasks from clients (CLI, API, WebSocket)
- Route tasks to appropriate OpenClaw instance based on:
  - Tenant/workspace requirements
  - Resource availability
  - Geographic constraints
  - Capability matching

**API Specification:**

```typescript
interface TaskRouter {
  // Core routing
  route(task: TaskRequest): Promise<RoutingDecision>;
  
  // Health-based routing
  getHealthyInstances(): Promise<OpenClawInstance[]>;
  
  // Load-aware routing  
  getInstanceLoad(instanceId: string): Promise<LoadMetrics>;
}

interface TaskRequest {
  id: string;
  tenantId: string;
  workspaceId?: string;
  payload: TaskPayload;
  priority: 'low' | 'normal' | 'high' | 'critical';
  routingHints?: {
    preferredRegion?: string;
    requiredCapabilities?: string[];
    maxLatency?: number;
  };
  deadline?: number; // Unix timestamp
}

interface RoutingDecision {
  instanceId: string;
  estimatedLatency: number;
  queueDepth: number;
  capabilities: string[];
}
```

**Routing Algorithms:**

| Algorithm | Use Case | Description |
|-----------|----------|-------------|
| **LeastLoaded** | Normal priority | Route to instance with lowest queue depth |
| **CapabilityAware** | Specialized tasks | Match instance capabilities to task requirements |
| **GeoAware** | Latency-sensitive | Prefer instances in preferred region |
| **TenantAffinity** | Multi-tenant | Route to specific workspace instance |
| **Fallback** | High availability | Primary + backup instance assignment |

#### 3.1.2 Federation Controller

**Responsibilities:**
- Manage lifecycle of OpenClaw instances
- Synchronize state across instances
- Handle cross-instance communication
- Support federation across cloud providers

**State Synchronization:**

```typescript
interface FederationController {
  // Instance management
  registerInstance(instance: OpenClawInstanceConfig): Promise<InstanceId>;
  deregisterInstance(instanceId: string): Promise<void>;
  
  // State sync
  syncState(targetInstance: string, state: InstanceState): Promise<void>;
  getGlobalState(): Promise<GlobalState>;
  
  // Cross-instance messaging
  broadcast(message: BroadcastMessage): Promise<BroadcastResult>;
  sendToInstance(target: string, message: DirectMessage): Promise<void>;
}

interface InstanceState {
  instanceId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  resources: {
    cpu: number;     // 0-1 utilization
    memory: number;  // 0-1 utilization
    activeSessions: number;
    queuedTasks: number;
  };
  capabilities: string[];
  lastHeartbeat: number;
}
```

#### 3.1.3 Lifecycle Manager

**Responsibilities:**
- Start/stop OpenClaw instances
- Scale instances based on load
- Handle rolling updates
- Manage graceful shutdowns

**Scaling Policies:**

```yaml
# config/scaling-policies.yaml
policies:
  - name: default-scale-up
    trigger:
      metric: queue_depth
      threshold: 100
      duration: 60s
    action:
      type: scale-out
      target_instances: min(current + 2, max_instances)
      
  - name: default-scale-down
    trigger:
      metric: queue_depth
      threshold: 10
      duration: 300s
    action:
      type: scale-in
      target_instances: max(current - 1, min_instances)
      
  - name: emergency-scale
    trigger:
      metric: instance_health
      threshold: 0.5  # 50% unhealthy
      duration: 30s
    action:
      type: emergency
      fallback: migrate_to_region
```

### 3.2 OpenClaw Instance Interface

**Standard Interface for All OpenClaw Instances:**

```typescript
interface OpenClawInstance {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  
  // Task Execution
  execute(task: TaskRequest): Promise<TaskResult>;
  
  // Session Management
  createSession(config: SessionConfig): Promise<SessionId>;
  getSession(sessionId: string): Promise<SessionState>;
  terminateSession(sessionId: string): Promise<void>;
  
  // Channel Management
  bindChannel(channel: ChannelConfig): Promise<ChannelId>;
  unbindChannel(channelId: string): Promise<void>;
  
  // Telemetry
  getMetrics(): Promise<InstanceMetrics>;
  getLogs(request: LogRequest): Promise<LogResponse>;
}

interface OpenClawInstanceConfig {
  instanceId: string;
  endpoint: string;           // gRPC/REST/WebSocket endpoint
  workspaceDir: string;        // Base directory for workspaces
  maxAgents: number;
  maxConcurrentTasks: number;
  enabledChannels: string[];  // ['telegram', 'discord', 'slack']
  allowedModels: string[];    // ['claude-sonnet-4-5', 'kimi-k2-turbo']
  resourceLimits: {
    maxMemoryMB: number;
    maxCpuCores: number;
    maxDiskGB: number;
  };
  capabilities: string[];      // ['coding', 'analysis', 'writing', 'research']
}
```

---

## 4. Communication Protocols

### 4.1 Inter-Layer Communication

| Channel | Use Case | Protocol | Reliability |
|---------|----------|----------|-------------|
| Task Dispatch | Task routing | gRPC + WebSocket | At-least-once |
| State Sync | Federation | gRPC streaming | Exactly-once |
| Health Check | Monitoring | HTTP | At-most-once |
| Telemetry | Metrics | OTLP over gRPC | Best-effort |

### 4.2 Message Format (Protocol Buffers)

```protobuf
syntax = "proto3";

package dash;

// Task dispatch message
message TaskDispatch {
  string task_id = 1;
  string tenant_id = 2;
  string workspace_id = 3;
  bytes payload = 4;
  TaskPriority priority = 5;
  int64 deadline = 6;
  RoutingHints routing_hints = 7;
  string correlation_id = 8;  // For distributed tracing
}

message TaskResult {
  string task_id = 1;
  bool success = 2;
  bytes result = 3;
  string error = 4;
  int64 duration_ms = 5;
  ResourceUsage usage = 6;
}

message InstanceHeartbeat {
  string instance_id = 1;
  HealthStatus status = 2;
  ResourceMetrics metrics = 3;
  int64 timestamp = 4;
}

// State synchronization
message StateSync {
  string source_instance = 1;
  string target_instance = 2;
  StateType type = 3;
  bytes state_data = 4;
  int64 sequence_number = 5;
}
```

---

## 5. Observability Stack

### 5.1 Distributed Tracing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TRACING ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Client Request                                                         │
│       │                                                                 │
│       ▼                                                                 │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ Dash: Create root span, inject correlation ID                │     │
│  │ span.setAttribute("tenant.id", task.tenantId)                 │     │
│  │ span.setAttribute("workflow.id", task.workflowId)             │     │
│  └────────────────────────┬──────────────────────────────────────┘     │
│                           │                                             │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ OpenClaw Instance A: Continue span, execute task            │     │
│  │ span.addEvent("task_started")                                 │     │
│  │ span.addEvent("agent_invoked", {"agent": "coder"})          │     │
│  │ span.addEvent("tool_called", {"tool": "read_file"})          │     │
│  │ span.addEvent("task_completed")                              │     │
│  └────────────────────────┬──────────────────────────────────────┘     │
│                           │                                             │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ Dash: Aggregate spans, end root span                         │     │
│  │ span.setAttribute("total_duration_ms", total)               │     │
│  │ exportToOTLP(traces)                                        │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Metrics Collection

| Metric | Source | Aggregation | Alert Threshold |
|--------|--------|-------------|----------------|
| task_queue_depth | Dash | gauge | > 1000 |
| task_execution_time | OpenClaw | histogram_p99 | > 30s |
| instance_health | OpenClaw | gauge | < 0.9 |
| cross_instance_latency | Dash | histogram_p95 | > 500ms |
| federation_sync_ lag | Dash | gauge | > 5s |

### 5.3 Logging Standard

**Structured Log Format:**
```json
{
  "timestamp": "2026-02-05T15:30:00Z",
  "level": "INFO",
  "service": "dash-router",
  "instance_id": "oc-001",
  "tenant_id": "tenant-abc",
  "correlation_id": "corr-xyz-123",
  "event": "task_dispatched",
  "task_id": "task-789",
  "target_instance": "oc-002",
  "latency_ms": 45,
  "message": "Task routed to instance oc-002"
}
```

---

## 6. Security Architecture

### 6.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐        │
│  │ Client  │─────▶│  Dash   │─────▶│ OpenClaw│─────▶│  LLM    │        │
│  │         │      │ Auth    │      │ Gateway  │      │ Provider │        │
│  └────┬────┘      └────┬────┘      └────┬────┘      └─────────┘        │
│       │                 │                 │                                │
│       │  JWT Token      │  Validate       │  Validate                       │
│       │  (Opaque/       │  Tenant +       │  Gateway +                     │
│       │   JWT)          │  Permissions    │  Tool Permissions              │
│       │                 │                 │                                │
│       ▼                 ▼                 ▼                                │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    AUTH DECISION                              │      │
│  │  ✓ Token valid          │  ✓ Tenant authorized                │      │
│  │  ✓ Permissions OK       │  ✓ Resource limits respected       │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Security Controls

| Layer | Control | Implementation |
|-------|---------|----------------|
| Network | mTLS | All inter-service communication encrypted |
| API | Rate Limiting | Per-tenant token bucket |
| Tenant | Isolation | Separate OpenClaw instances per tenant |
| Task | Sandboxing | Git worktree isolation per task |
| Data | Encryption | AES-256 at rest, TLS 1.3 in transit |
| Audit | Logging | Immutable audit logs for all actions |

---

## 7. Deployment Architecture

### 7.1 Production Deployment

```yaml
# docker-compose.yml
services:
  dash-controller:
    image: dash:v2.0
    ports:
      - "7373:7373"  # REST API
      - "7374:7374"  # gRPC
    environment:
      - DASH_MODE=controller
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://...
      - TELEMETRY_ENDPOINT=localhost:4317
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7373/health"]
      interval: 10s
      timeout: 5s

  openclaw-instance:
    image: openclaw:latest
    volumes:
      - ./workspaces:/workspaces
    environment:
      - OPENCLAW_MODE=worker
      - DASH_CONTROLLER_URL=dash-controller:7374
    deploy:
      replicas: 5
      resources:
        limits:
          cpus: '4'
          memory: 16G
```

### 7.2 Scaling Strategy

| Component | Scaling Trigger | Action |
|-----------|---------------|--------|
| Dash Controller | API latency > 100ms p99 | Add controller replica |
| OpenClaw Instance | Queue depth > 100 | Start new instance |
| Agent Worker | Active sessions > 50/instance | Scale horizontally |
| Database | Connection pool > 80% | Add read replica |

---

## 8. Failure Modes & Recovery

### 8.1 Failure Matrix

| Failure | Impact | Recovery | RTO |
|---------|--------|----------|-----|
| OpenClaw instance crash | Tasks lost, reconnects needed | Reroute to healthy instance | < 30s |
| Dash controller failure | API unavailable | Hot standby takeover | < 5s |
| Network partition | Partial routing | Quorum-based routing | < 10s |
| Database unavailability | State lost | Replica promotion | < 60s |

### 8.2 Circuit Breaker Configuration

```typescript
const circuitBreakerConfig = {
  openClawInstance: {
    failureThreshold: 5,           // failures before open
    successThreshold: 3,          // successes to half-open
    timeout: 30000,               // ms in open state
    fallback: 'route-to-backup-instance'
  },
  taskExecution: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000,
    fallback: 'queue-with-priority'
  },
  federationSync: {
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 10000,
    fallback: 'async-sync-with-queue'
  }
};
```

---

## 9. API Specifications

### 9.1 REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/tasks | Submit a task |
| GET | /api/v1/tasks/:id | Get task status |
| GET | /api/v1/instances | List OpenClaw instances |
| GET | /api/v1/instances/:id/health | Instance health |
| POST | /api/v1/instances/:id/scale | Scale instance |
| GET | /api/v1/tenants/:id/usage | Tenant resource usage |

### 9.2 WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| task.submitted | Client → Dash | `{ taskId, status: 'queued' }` |
| task.started | Dash → Client | `{ taskId, instanceId }` |
| task.progress | OpenClaw → Dash → Client | `{ taskId, progress: 50, message: '...' }` |
| task.completed | OpenClaw → Dash → Client | `{ taskId, result: {...} }` |
| task.failed | OpenClaw → Dash → Client | `{ taskId, error: '...' }` |
| instance.unhealthy | OpenClaw → Dash | `{ instanceId, reason: '...' }` |

---

## 10. Performance Targets (10-50+ OpenClaw Scale)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Task submission latency | < 50ms p99 | From client to Dash queue |
| Task routing throughput | **10,000+ QPS** | With 50 OpenClaw instances |
| Cross-instance routing | < 20ms p95 | Dash → OpenClaw (same region) |
| Global state sync | < 2s p99 | Between instances |
| API availability | 99.99% | Uptime SLA |
| Recovery time objective | < 10s | After instance failure |
| OpenClaw instances | **10-50+** | Per Dash deployment |
| Tasks/minute per OpenClaw | 500+ | Sustained throughput |

---

## 11. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Dash controller with REST API
- [ ] Single OpenClaw instance registration
- [ ] Basic task routing (least-loaded)
- [ ] Health checking

### Phase 2: Federation (Weeks 3-4)
- [ ] **10+ OpenClaw instances** orchestration
- [ ] State synchronization across instances
- [ ] Cross-instance communication
- [ ] Tenant isolation

### Phase 3: Scaling (Weeks 5-6)
- [ ] **Auto-scaling to 50+ instances**
- [ ] Geographic routing
- [ ] Multi-region distribution

### Phase 4: Production (Weeks 7-8)
- [ ] **50 OpenClaw instances** managed
- [ ] Comprehensive observability
- [ ] Performance benchmarks
- [ ] Load testing (10K QPS target)
- [ ] Resource optimization
- [ ] Load balancing

### Phase 4: Production (Weeks 7-8)
- [ ] Comprehensive observability
- [ ] Security hardening
- [ ] Performance testing
- [ ] Documentation & runbooks

---

## 12. Compliance & Standards

| Standard | Requirement | Implementation |
|----------|-------------|---------------|
| SOC 2 | Audit logging | Immutable logs with retention |
| GDPR | Data residency | Region-specific instances |
| HIPAA | Encryption | AES-256 + TLS 1.3 |
| ISO 27001 | Security controls | Annual penetration testing |

---

## 13. References

### Internal
- OpenClaw Architecture: `docs.openclaw.ai`
- Dash ARCHITECTURE.md
- Dash README.md

### External Best Practices
- Kubernetes Federation patterns (KubeAdmiral, OCM)
- Temporal.io durability model
- LangGraph state management

---

**Document Owner:** Dash Engineering Team  
**Next Review:** 2026-02-12  
**Version History:** 1.0 (Initial Draft)
