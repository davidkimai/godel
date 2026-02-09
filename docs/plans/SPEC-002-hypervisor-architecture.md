# SPEC-002: Godel Hypervisor Architecture - Technical Specification

**Version:** 1.0  
**Date:** 2026-02-08  
**Status:** ✅ APPROVED - Ground Truth Specification  
**Priority:** P0 (Strategic)  
**PRD Reference:** PRD-003-hypervisor-architecture.md  

---

## 1. Executive Summary

This specification defines the technical implementation for transforming Godel to a hypervisor architecture using Kata Containers with Firecracker MicroVMs. It provides detailed architecture, API contracts, implementation tasks, and verification criteria.

**Key Technical Decisions:**
- **RuntimeProvider abstraction** for pluggable backends (Worktree/Kata/E2B)
- **Kata Containers** as primary runtime (Docker compatible + VM isolation)
- **Kubernetes integration** via runtimeClassName
- **11-week implementation** across 4 phases

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Godel Control Plane                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RuntimeProvider Interface                  │   │
│  │  ┌─────────────┬──────────────┬─────────────────────┐   │   │
│  │  │  Worktree   │    Kata      │        E2B          │   │   │
│  │  │  Provider   │   Provider   │     Provider        │   │   │
│  │  └─────────────┴──────────────┴─────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼─────┐        ┌──────▼──────┐       ┌─────▼──────┐
   │ Git      │        │  Kata       │       │   E2B      │
   │ Worktree │        │ Containers  │       │  Remote    │
   │ (Legacy) │        │ +Firecracker│       │  Sandbox   │
   └──────────┘        └─────────────┘       └────────────┘
```

### 2.2 Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Container Runtime** | Kata Containers | 3.x | VM-based containers |
| **VMM** | Firecracker | 1.x | MicroVMs |
| **Orchestration** | Kubernetes | 1.25+ | Container orchestration |
| **CNI** | Calico/Cilium | Latest | Network policies |
| **Storage** | containerd/devmapper | Latest | VM storage |
| **Monitoring** | Prometheus/Grafana | Latest | Observability |
| **Language** | TypeScript | 5.x | Implementation |

### 2.3 Why Kata (Not Raw Firecracker)?

| Aspect | Raw Firecracker | Kata Containers | Winner |
|--------|-----------------|-----------------|--------|
| Complexity | High (custom tooling) | Low (standard K8s) | Kata ✅ |
| Docker Support | No | Yes (standard images) | Kata ✅ |
| K8s Integration | Manual | Native runtimeClass | Kata ✅ |
| Operational Overhead | High | Low (standard K8s ops) | Kata ✅ |
| Debuggability | Hard | Standard K8s tools | Kata ✅ |

**Decision:** Use Kata to leverage existing Docker/K8s toolchain while gaining VM isolation.

---

## 3. Core Interfaces

### 3.1 RuntimeProvider Interface

```typescript
/**
 * RuntimeProvider - Abstraction for agent execution environments
 * Supports Worktree, Kata, and E2B runtimes
 */
interface RuntimeProvider {
  // Lifecycle Management
  spawn(config: SpawnConfig): Promise<AgentRuntime>;
  terminate(runtimeId: string): Promise<void>;
  getStatus(runtimeId: string): Promise<RuntimeStatus>;
  listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]>;
  
  // Execution
  execute(runtimeId: string, command: string, options?: ExecutionOptions): Promise<ExecutionResult>;
  executeStream(runtimeId: string, command: string): AsyncIterable<ExecutionOutput>;
  executeInteractive(runtimeId: string, command: string, stdin: ReadableStream): Promise<ExecutionResult>;
  
  // File Operations
  readFile(runtimeId: string, path: string): Promise<Buffer>;
  writeFile(runtimeId: string, path: string, data: Buffer): Promise<void>;
  uploadDirectory(runtimeId: string, localPath: string, remotePath: string): Promise<void>;
  downloadDirectory(runtimeId: string, remotePath: string, localPath: string): Promise<void>;
  
  // State Management
  snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot>;
  restore(snapshotId: string): Promise<AgentRuntime>;
  listSnapshots(runtimeId?: string): Promise<Snapshot[]>;
  deleteSnapshot(snapshotId: string): Promise<void>;
  
  // Events
  on(event: RuntimeEvent, handler: EventHandler): void;
  waitForState(runtimeId: string, state: RuntimeState, timeout?: number): Promise<boolean>;
}
```

### 3.2 Supporting Types

```typescript
// Configuration
interface SpawnConfig {
  runtime: 'worktree' | 'kata' | 'e2b';
  image?: string;           // Docker image for Kata/E2B
  resources: ResourceLimits;
  network?: NetworkConfig;
  volumes?: VolumeMount[];
  env?: Record<string, string>;
  labels?: Record<string, string>;
  timeout?: number;         // Spawn timeout in seconds
}

interface ResourceLimits {
  cpu: number;              // CPU cores (fractional allowed: 0.5, 1.5, etc.)
  memory: string;           // Memory limit (e.g., "512Mi", "2Gi")
  disk?: string;            // Disk limit (e.g., "10Gi")
  agents?: number;          // Max concurrent agents (for quota)
}

interface NetworkConfig {
  mode: 'bridge' | 'host' | 'none';
  policies?: NetworkPolicy[];
  dns?: string[];
}

interface VolumeMount {
  name: string;
  source: string;
  destination: string;
  readOnly?: boolean;
}

// Runtime State
interface AgentRuntime {
  id: string;
  runtime: RuntimeType;
  state: RuntimeState;
  resources: ResourceUsage;
  createdAt: Date;
  lastActiveAt: Date;
  metadata: RuntimeMetadata;
}

type RuntimeType = 'worktree' | 'kata' | 'e2b';
type RuntimeState = 'pending' | 'creating' | 'running' | 'paused' | 'terminating' | 'terminated' | 'error';

interface ResourceUsage {
  cpu: number;              // Current CPU usage (cores)
  memory: number;           // Current memory usage (bytes)
  disk: number;             // Current disk usage (bytes)
  network: NetworkStats;
}

interface NetworkStats {
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
}

// Execution
interface ExecutionOptions {
  timeout?: number;
  env?: Record<string, string>;
  cwd?: string;
  user?: string;
}

interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  metadata: ExecutionMetadata;
}

interface ExecutionOutput {
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: Date;
}

// Snapshots
interface Snapshot {
  id: string;
  runtimeId: string;
  createdAt: Date;
  size: number;
  metadata: SnapshotMetadata;
}

interface SnapshotMetadata {
  name?: string;
  description?: string;
  labels?: Record<string, string>;
}

// Events
type RuntimeEvent = 'stateChange' | 'error' | 'resourceWarning' | 'healthCheck';
type EventHandler = (event: RuntimeEvent, data: EventData) => void;
```

### 3.3 Error Handling

```typescript
// Error Hierarchy
abstract class RuntimeError extends Error {
  abstract code: string;
  abstract retryable: boolean;
  runtimeId?: string;
  context?: Record<string, unknown>;
}

class SpawnError extends RuntimeError {
  code = 'SPAWN_ERROR';
  retryable = true;
}

class ExecutionError extends RuntimeError {
  code = 'EXECUTION_ERROR';
  retryable = false;
}

class ResourceExhaustedError extends RuntimeError {
  code = 'RESOURCE_EXHAUSTED';
  retryable = true;  // Can retry after resources freed
}

class TimeoutError extends RuntimeError {
  code = 'TIMEOUT';
  retryable = true;
}

class NotFoundError extends RuntimeError {
  code = 'NOT_FOUND';
  retryable = false;
}
```

---

## 4. Implementation Tasks

### 4.1 Phase 1: RuntimeProvider Abstraction (Weeks 1-2)

**Entry Criteria:** PRD-003 approved, SPEC-002 approved  
**Exit Criteria:** Interface stable, tests >95% passing

| Task ID | Task | Assigned | Dependencies | Parallel | Verification |
|---------|------|----------|--------------|----------|--------------|
| P1-T1 | Define RuntimeProvider interface | Agent_1 | None | ✅ | Interface compiles |
| P1-T2 | Implement ExecutionContext types | Agent_2 | None | ✅ | TypeScript 0 errors |
| P1-T3 | Create RuntimeProviderFactory | Agent_3 | P1-T1,2 | ❌ | Factory tests pass |
| P1-T4 | Refactor WorktreeRuntimeProvider | Agent_4 | P1-T1 | ✅ | Backward compat tests |
| P1-T5 | Update agent lifecycle manager | Agent_5 | P1-T4 | ❌ | All lifecycle tests pass |
| P1-T6 | Add runtime configuration | Agent_7 | P1-T1 | ✅ | Config validation tests |
| P1-T7 | Write abstraction tests | Agent_22 | P1-T1 | ✅ | Coverage >90% |
| P1-T8 | Test WorktreeRuntimeProvider | Agent_23 | P1-T4 | ✅ | All existing tests pass |
| P1-T9 | Integration tests | Agent_24 | P1-T3,6 | ❌ | E2E tests pass |

**Verification:**
```bash
# Phase 1 Gate
npm run typecheck    # Should pass with 0 errors
npm test -- --coverage --testPathPattern="runtime"  # Should show >95% coverage
```

### 4.2 Phase 2: Kata Containers Integration (Weeks 3-6)

**Entry Criteria:** Phase 1 gate passed, K8s cluster with Kata available  
**Exit Criteria:** Kata spawning <100ms, 100 VM load test passed

| Task ID | Task | Assigned | Dependencies | Parallel | Verification |
|---------|------|----------|--------------|----------|--------------|
| P2-T1 | Implement KataRuntimeProvider | Agent_1 | P1-T9 | ✅ | VM spawn works |
| P2-T2 | K8s client wrapper | Agent_2 | P2-T1 | ✅ | K8s API calls work |
| P2-T3 | Resource translator | Agent_3 | P2-T1 | ✅ | Limits enforced |
| P2-T4 | Kata Pod YAML templates | Agent_4 | P2-T1 | ✅ | Templates render |
| P2-T5 | Namespace manager | Agent_5 | P2-T4 | ❌ | Namespaces created |
| P2-T6 | RBAC configurations | Agent_6 | P2-T5 | ❌ | Auth works |
| P2-T7 | Resource limits enforcement | Agent_7 | P2-T1 | ✅ | Limits enforced |
| P2-T8 | Quota system | Agent_8 | P2-T7 | ❌ | Quotas work |
| P2-T9 | Scheduler integration | Agent_9 | P2-T8 | ❌ | Scheduling works |
| P2-T10 | VM spawn implementation | Agent_10 | P2-T1 | ✅ | Spawn <100ms |
| P2-T11 | VM health checks | Agent_11 | P2-T10 | ❌ | Health checks pass |
| P2-T12 | Graceful termination | Agent_12 | P2-T10 | ❌ | Clean shutdown |
| P2-T13 | File sync implementation | Agent_13 | P2-T10 | ✅ | Bidirectional sync |
| P2-T14 | Volume mount manager | Agent_14 | P2-T13 | ❌ | Mounts work |
| P2-T15 | I/O optimization | Agent_15 | P2-T14 | ❌ | Optimized I/O |
| P2-T16 | Health monitoring | Agent_16 | P2-T11 | ✅ | Monitoring works |
| P2-T17 | Metrics collection | Agent_17 | P2-T16 | ❌ | Metrics collected |
| P2-T18 | Alerting system | Agent_18 | P2-T17 | ❌ | Alerts fire |
| P2-T19 | Snapshot creation | Agent_19 | P2-T10 | ✅ | Snapshots work |
| P2-T20 | Snapshot restore | Agent_20 | P2-T19 | ❌ | Restore works |
| P2-T21 | Fork from snapshot | Agent_21 | P2-T20 | ❌ | Forking works |
| P2-T22 | Kata integration tests | Agent_22 | P2-T10 | ✅ | Tests pass |
| P2-T23 | File sync tests | Agent_23 | P2-T13 | ✅ | Tests pass |
| P2-T24 | Snapshot tests | Agent_24 | P2-T21 | ❌ | Tests pass |
| P2-T25 | Boot time benchmarks | Agent_25 | P2-T10 | ✅ | <100ms validated |
| P2-T26 | 100 VM load test | Agent_26 | P2-T25 | ❌ | Load test passes |
| P2-T27 | Security audit | Agent_27 | P2-T26 | ❌ | Audit passes |

**Verification:**
```bash
# Phase 2 Gate
npm run benchmark:boot-time    # Should show <100ms P95
npm run test:load -- --vms=100 # Should complete successfully
npm run security:audit         # Should pass
```

### 4.3 Phase 3: E2B Integration (Weeks 7-8)

**Entry Criteria:** Phase 2 gate passed, E2B API credentials configured  
**Exit Criteria:** E2B spawning working, fallback tested, cost tracking accurate

| Task ID | Task | Assigned | Dependencies | Parallel | Verification |
|---------|------|----------|--------------|----------|--------------|
| P3-T1 | E2BRuntimeProvider | Agent_1 | P2-T9 | ✅ | E2B spawn works |
| P3-T2 | E2B client wrapper | Agent_2 | P3-T1 | ❌ | API calls work |
| P3-T3 | Template manager | Agent_3 | P3-T1 | ✅ | Templates work |
| P3-T4 | Fallback logic | Agent_4 | P3-T1 | ❌ | Fallback works |
| P3-T5 | Cost tracking | Agent_7 | P3-T1 | ✅ | Costs tracked |
| P3-T6 | Budget enforcement | Agent_8 | P3-T5 | ❌ | Budgets enforced |
| P3-T7 | Usage reports | Agent_9 | P3-T6 | ❌ | Reports generated |
| P3-T8 | E2B integration tests | Agent_22 | P3-T1 | ✅ | Tests pass |
| P3-T9 | Fallback tests | Agent_23 | P3-T4 | ❌ | Fallback tested |
| P3-T10 | Cost tracking tests | Agent_24 | P3-T7 | ❌ | Accuracy >95% |

**Verification:**
```bash
# Phase 3 Gate
npm run test:e2b              # E2B tests pass
npm run test:fallback         # Fallback chain works
npm run test:cost-tracking    # Cost accuracy >95%
```

### 4.4 Phase 4: Migration & Production (Weeks 9-11)

**Entry Criteria:** Phase 3 gate passed, production cluster ready  
**Exit Criteria:** 100% migrated, 99.9% uptime, 1000 VM load test, GA announced

| Task ID | Task | Assigned | Dependencies | Parallel | Verification |
|---------|------|----------|--------------|----------|--------------|
| P4-T1 | Migration scripts | Agent_1 | P3-T10 | ✅ | Scripts work |
| P4-T2 | Canary deployment (5%) | Agent_2 | P4-T1 | ❌ | Canary live |
| P4-T3 | Gradual rollout (100%) | Agent_3 | P4-T2 | ❌ | 100% migrated |
| P4-T4 | Rollback system | Agent_4 | P4-T1 | ✅ | Rollback works |
| P4-T5 | Production monitoring | Agent_16 | P4-T2 | ✅ | Monitoring live |
| P4-T6 | Metrics dashboards | Agent_17 | P4-T5 | ❌ | Dashboards ready |
| P4-T7 | 1000 VM load test | Agent_25 | P4-T3 | ✅ | 1000 VMs pass |
| P4-T8 | Chaos engineering | Agent_26 | P4-T7 | ❌ | Resilience validated |
| P4-T9 | Final security audit | Agent_27 | P4-T8 | ❌ | Audit passes |
| P4-T10 | API documentation | Agent_28 | P4-T1 | ✅ | Docs published |
| P4-T11 | Migration guide | Agent_29 | P4-T3 | ❌ | Guide published |
| P4-T12 | Runbooks | Agent_30 | P4-T5 | ❌ | Runbooks ready |
| P4-T13 | GA announcement | Orchestrator | P4-T12 | ❌ | GA announced |

**Verification:**
```bash
# Phase 4 Gate (Final)
npm run test:load -- --vms=1000  # Should complete successfully
kubectl get pods -n godel | wc -l  # Should show 1000+ pods
kubectl top pods -n godel        # Should show healthy metrics
# Verify 99.9% uptime from monitoring
```

---

## 5. File Structure

```
src/
├── core/
│   └── runtime/
│       ├── index.ts                    # Public API exports
│       ├── runtime-provider.ts         # Interface definition
│       ├── types.ts                    # Type definitions
│       ├── runtime-provider-factory.ts # Factory implementation
│       ├── errors.ts                   # Error classes
│       └── providers/
│           ├── worktree-runtime-provider.ts
│           ├── kata-runtime-provider.ts
│           └── e2b-runtime-provider.ts
├── kubernetes/
│   ├── client.ts                       # K8s API client
│   ├── namespace-manager.ts
│   ├── resource-translator.ts
│   └── templates/
│       └── kata-pod.yaml
├── storage/
│   ├── snapshot-manager.ts
│   └── volume-manager.ts
├── sync/
│   └── file-sync.ts
├── monitoring/
│   ├── health-monitor.ts
│   └── metrics-collector.ts
└── billing/
    ├── cost-tracker.ts
    └── budget-enforcer.ts

tests/
├── runtime/
│   ├── runtime-provider.test.ts
│   ├── worktree-runtime-provider.test.ts
│   ├── kata-runtime-provider.test.ts
│   └── e2e.test.ts
├── integration/
│   └── migration.test.ts
└── benchmarks/
    └── boot-time.bench.ts
```

---

## 6. Key Implementation Details

### 6.1 Kata Integration

**Kata Pod Template:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: godel-agent-{{AGENT_ID}}
  namespace: {{NAMESPACE}}
  labels:
    app: godel-agent
    runtime: kata
spec:
  runtimeClassName: kata
  containers:
  - name: agent
    image: {{IMAGE}}
    resources:
      requests:
        memory: "256Mi"
        cpu: "250m"
      limits:
        memory: "{{MEMORY_LIMIT}}"
        cpu: "{{CPU_LIMIT}}"
    volumeMounts:
    - name: context
      mountPath: /mnt/context
  volumes:
  - name: context
    persistentVolumeClaim:
      claimName: agent-context-{{AGENT_ID}}
```

**Kata Metrics Endpoint:**
```
http://localhost:8090/metrics  # Kata shimv2 metrics
```

### 6.2 E2B Integration

**E2B Sandbox Creation:**
```typescript
const sandbox = await e2b.createSandbox({
  template: 'godel-agent-v1',
  resources: {
    memory: '1Gi',
    cpu: 1
  },
  env: {
    AGENT_ID: config.agentId
  }
});
```

**Fallback Chain:**
```
E2B spawn attempt
    ↓ (if fails)
Kata spawn attempt  
    ↓ (if fails)
Worktree spawn (legacy)
    ↓ (if fails)
Error: All runtimes exhausted
```

### 6.3 Error Handling Strategy

**Retry Logic:**
```typescript
const retryPolicy = {
  maxRetries: 3,
  backoff: 'exponential',  // 1s, 2s, 4s
  retryableErrors: [
    'SPAWN_ERROR',
    'RESOURCE_EXHAUSTED', 
    'TIMEOUT'
  ]
};
```

**Circuit Breaker:**
```typescript
const circuitBreaker = {
  failureThreshold: 5,
  timeout: 60s,
  halfOpenMaxCalls: 3
};
```

---

## 7. Testing Strategy

### 7.1 Test Pyramid

| Level | Coverage Target | Test Types |
|-------|-----------------|------------|
| **Unit** | 80% | Interface methods, type validation |
| **Integration** | 95% | Provider implementations, K8s integration |
| **E2E** | 100% | Full workflows, migration paths |
| **Performance** | N/A | Boot time, load tests |
| **Security** | N/A | Penetration, compliance |

### 7.2 Phase Gate Criteria

**Phase 1 Gate:**
- [ ] Unit tests >80% passing
- [ ] Integration tests >95% passing  
- [ ] TypeScript compilation 0 errors
- [ ] Backward compatibility maintained

**Phase 2 Gate:**
- [ ] Kata boot <100ms P95 validated
- [ ] 100 VM load test passed
- [ ] Security audit passed
- [ ] File sync operational

**Phase 3 Gate:**
- [ ] E2B fallback tested
- [ ] Cost tracking validated
- [ ] All integration tests passing

**Phase 4 Gate:**
- [ ] 1000 VM load test passed
- [ ] 99.9% uptime maintained
- [ ] All documentation published
- [ ] GA announcement complete

### 7.3 Verification Commands

```bash
# Type checking
npm run typecheck

# Unit tests
npm test -- --testPathPattern="runtime"

# Integration tests  
npm run test:integration

# Boot time benchmark
npm run benchmark:boot-time

# Load test
npm run test:load -- --vms=1000 --duration=300

# Security audit
npm run security:audit

# E2E tests
npm run test:e2e
```

---

## 8. Deployment Architecture

### 8.1 Kubernetes Resources

```yaml
# RuntimeClass for Kata
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: kata
handler: kata
overhead:
  podFixed:
    memory: "128Mi"
    cpu: "100m"

# Namespace per team
apiVersion: v1
kind: Namespace
metadata:
  name: godel-team-{{TEAM_ID}}
  labels:
    godel.io/team: {{TEAM_ID}}
    godel.io/quota: enabled

# ResourceQuota per team
apiVersion: v1
kind: ResourceQuota
metadata:
  name: godel-quota-{{TEAM_ID}}
  namespace: godel-team-{{TEAM_ID}}
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "100"
```

### 8.2 Monitoring Stack

**Prometheus Metrics:**
```yaml
# VM metrics
- godel_runtime_boot_duration_seconds
- godel_runtime_execution_duration_seconds
- godel_runtime_memory_usage_bytes
- godel_runtime_cpu_usage_cores
- godel_runtime_disk_usage_bytes
- godel_runtime_network_rx_bytes
- godel_runtime_network_tx_bytes

# Cost metrics
- godel_cost_per_agent_dollars
- godel_cost_per_team_dollars
- godel_budget_remaining_percent
```

**Grafana Dashboards:**
- VM Performance Dashboard
- Cost Attribution Dashboard  
- Migration Progress Dashboard
- Error Rate Dashboard

---

## 9. Approval

**This SPEC is approved for implementation:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Tech Lead | Senior Infrastructure Engineer | _______________ | 2026-02-08 |
| Architect | API Designer | _______________ | 2026-02-08 |
| QA Lead | Quality Assurance | _______________ | 2026-02-08 |

---

## 10. Related Documents

- **PRD-003:** Product requirements and business justification
- **30-AGENT-ORCHESTRATION-PLAN.md:** Detailed agent assignments and timeline
- **runtime-provider-api-design.md:** API interface specification
- **testing-strategy-hypervisor-migration.md:** QA approach

---

**Status:** ✅ **APPROVED FOR IMPLEMENTATION**  
**Next Step:** Proceed to 30-agent orchestration (Phase 1)
