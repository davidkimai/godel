# Godel v3.0 Technical Specifications

**Status:** Draft  
**Date:** 2026-02-06  
**Version:** 3.0.0

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Git-Backed Persistence (Beads)](#2-git-backed-persistence-beads)
3. [Server-Side LLM Proxy](#3-server-side-llm-proxy)
4. [K8s Remote Execution (Weaver)](#4-k8s-remote-execution-weaver)
5. [Visual Dashboard](#5-visual-dashboard)
6. [API Specifications](#6-api-specifications)
7. [Data Models](#7-data-models)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Architecture Overview

### 1.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │   CLI   │  │   TUI   │  │   Web   │                         │
│  └────┬────┘  └────┬────┘  └────┬────┘                         │
└───────┼────────────┼────────────┼───────────────────────────────┘
        │            │            │
        └────────────┴────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    godel-server                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │    │
│  │  │ Bead API     │  │ Proxy API    │  │ Weaver API   │  │    │
│  │  │ /api/beads   │  │ /proxy/v1    │  │ /api/weaver  │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
        │                      │                      │
        ▼                      ▼                      ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  BEAD STORE  │    │   LLM PROXY      │    │   WEAVER         │
│  (Git-based) │    │   (Server-side)  │    │   (K8s)          │
│              │    │                  │    │                  │
│  .godel/     │    │  ┌────────────┐  │    │  ┌────────────┐  │
│  ├── beads/  │    │  │ Rate Limit │  │    │  │ Pod Mgr    │  │
│  ├── convoys/│    │  │ Cost Track │  │    │  │ Health Mon │  │
│  └── git/    │    │  │ Audit Log  │  │    │  │ Resources  │  │
│              │    │  └────────────┘  │    │  └────────────┘  │
└──────────────┘    └──────────────────┘    └──────────────────┘
```

### 1.2 Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | TypeScript, Node.js, Fastify |
| Frontend | React, TypeScript, Tailwind CSS |
| Database | PostgreSQL (metadata), Git (bead storage) |
| Cache | Redis |
| K8s | Kubernetes API, Helm |
| Proxy | Custom LLM proxy server |
| Real-time | WebSocket |

---

## 2. Git-Backed Persistence (Beads)

### 2.1 Core Concept

Beads are work units stored as structured data in git. Each bead:
- Has a unique ID (godel-[5-char-alphanumeric])
- Tracks status, assigned agent, git commits
- Survives crashes and restarts
- Can be bundled into convoys

### 2.2 Directory Structure

```
.godel/
├── beads/
│   ├── godel-abc12.json
│   ├── godel-def34.json
│   └── ...
├── convoys/
│   ├── convoy-20260206-abc.json
│   └── ...
├── worktrees/
│   ├── godel-abc12/          # Git worktree for bead
│   └── ...
└── state/
    ├── index.json            # Bead index
    └── convoy-index.json     # Convoy index
```

### 2.3 Bead Lifecycle

```
┌─────────┐     create      ┌─────────┐     assign      ┌─────────────┐
│  Start  │ ───────────────▶│  Open   │ ───────────────▶│ In Progress │
└─────────┘                 └─────────┘                 └──────┬──────┘
                                                               │
         ┌─────────────────────────────────────────────────────┘
         │
         ▼
┌────────┴────────┐    review     ┌─────────┐    done      ┌─────────┐
│ Changes Committed│ ─────────────▶│ Review  │ ────────────▶│  Done   │
│  (git linked)   │               └─────────┘              └─────────┘
└─────────────────┘
```

### 2.4 Implementation Details

**Bead ID Generation:**
```typescript
function generateBeadId(): string {
  const prefix = 'godel';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${id}`;
}
```

**Git Worktree Creation:**
```typescript
async function createBeadWorktree(beadId: string, repoPath: string): Promise<string> {
  const worktreePath = path.join('.godel', 'worktrees', beadId);
  
  // Create git worktree
  await execGit(['worktree', 'add', '-b', `bead/${beadId}`, worktreePath]);
  
  // Link to bead
  await updateBead(beadId, { worktree: worktreePath });
  
  return worktreePath;
}
```

### 2.5 CLI Commands

```bash
# Create a bead
godel bead create "Fix authentication bug" --type bug
# Output: Created bead godel-abc12

# Assign to agent
godel bead assign godel-abc12 --agent worker-1

# View bead status
godel bead status godel-abc12

# Create convoy
godel convoy create "Sprint 1" godel-abc12 godel-def34 --description "Auth improvements"

# List convoy
godel convoy status convoy-20260206-abc
```

---

## 3. Server-Side LLM Proxy

### 3.1 Architecture

```
┌─────────┐      HTTP Request      ┌──────────────┐     Provider API     ┌──────────┐
│  Agent  │ ──────────────────────▶│  Godel Proxy │ ───────────────────▶ │  LLM     │
│         │  POST /proxy/v1/       │              │                      │ Provider │
│         │  chat/completions      │  ┌────────┐  │                      │          │
│         │                        │  │ Auth   │  │                      │          │
│         │ ◀──────────────────────│  │ Rate   │  │ ◀──────────────────  │          │
│         │    SSE Stream          │  │ Limit  │  │    SSE Stream        │          │
│         │                        │  │ Cost   │  │                      │          │
│         │                        │  │ Audit  │  │                      │          │
│         │                        │  └────────┘  │                      │          │
└─────────┘                        └──────────────┘                      └──────────┘
```

### 3.2 Security Model

**Principle:** API keys never leave the server.

```typescript
// Server-side only
const PROVIDER_KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  // ...
};

// Client sends request without API key
interface ProxyRequest {
  model: string;
  messages: Message[];
  routing?: RoutingOptions;
}
```

### 3.3 Rate Limiting

**Token Bucket Algorithm:**
```typescript
interface RateLimiter {
  // Per user limits
  checkLimit(userId: string, cost: number): Promise<boolean>;
  
  // Per project limits
  checkProjectLimit(projectId: string, cost: number): Promise<boolean>;
  
  // Per agent limits
  checkAgentLimit(agentId: string, cost: number): Promise<boolean>;
}

// Configuration
const DEFAULT_LIMITS = {
  perMinute: 100,
  perHour: 1000,
  perDay: 5000,
  maxCostPerRequest: 1.00,
};
```

### 3.4 Cost Tracking

**Cost Calculation:**
```typescript
interface CostTracker {
  // Track request cost
  trackRequest(request: ProxyRequest, response: ProxyResponse): Promise<void>;
  
  // Get reports
  getCostReport(options: ReportOptions): Promise<CostReport>;
}

interface CostReport {
  totalCost: number;
  byProvider: Record<ProviderId, number>;
  byAgent: Record<AgentId, number>;
  byProject: Record<ProjectId, number>;
  period: { start: Date; end: Date };
}
```

### 3.5 Audit Logging

```typescript
interface AuditLog {
  logRequest(request: ProxyRequest, metadata: RequestMetadata): Promise<void>;
  logResponse(response: ProxyResponse, metadata: ResponseMetadata): Promise<void>;
  queryLogs(filter: LogFilter): Promise<LogEntry[]>;
}

interface LogEntry {
  timestamp: Date;
  userId: string;
  agentId?: string;
  beadId?: string;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latency: number;
  success: boolean;
}
```

---

## 4. K8s Remote Execution (Weaver)

### 4.1 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      Godel Server                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Agent Manager│  │ Weaver       │  │ K8s Client   │         │
│  │              │──▶│   Service    │──▶│              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ K8s API
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                             │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Namespace: godel                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│  │  │ Pod: agent-1│  │ Pod: agent-2│  │ Pod: agent-3│   │   │
│  │  │ 🟢 Running  │  │ 🟢 Running  │  │ 🟡 Starting │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘   │   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Pod Specification

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: godel-agent-{agent-id}
  namespace: godel
  labels:
    app: godel-agent
    agent-id: {agent-id}
    bead-id: {bead-id}
spec:
  containers:
  - name: agent
    image: godel/agent:v3.0.0
    env:
    - name: GODEL_AGENT_ID
      value: {agent-id}
    - name: GODEL_BEAD_ID
      value: {bead-id}
    - name: GODEL_SERVER_URL
      value: http://godel-server:7373
    resources:
      limits:
        cpu: "2"
        memory: "4Gi"
      requests:
        cpu: "100m"
        memory: "256Mi"
    volumeMounts:
    - name: worktree
      mountPath: /workspace
  volumes:
  - name: worktree
    emptyDir: {}
  restartPolicy: OnFailure
```

### 4.3 Weaver Service

```typescript
interface Weaver {
  // Spawn agent in K8s pod
  spawnAgent(config: AgentConfig): Promise<Pod>;
  
  // Get pod status
  getPodStatus(podName: string): Promise<PodStatus>;
  
  // Stream logs
  streamLogs(podName: string): Observable<LogEntry>;
  
  // Terminate agent
  terminateAgent(podName: string): Promise<void>;
  
  // Health monitoring
  watchHealth(): Observable<HealthEvent>;
}

interface AgentConfig {
  agentId: string;
  beadId: string;
  image: string;
  resources: ResourceRequirements;
  env: Record<string, string>;
}
```

### 4.4 Local Fallback

When K8s is unavailable, automatically fall back to local execution:

```typescript
class HybridExecutor {
  async spawnAgent(config: AgentConfig): Promise<ExecutionEnvironment> {
    if (await this.weaver.isAvailable()) {
      return this.weaver.spawnAgent(config);
    } else {
      return this.localExecutor.spawnAgent(config);
    }
  }
}
```

---

## 5. Visual Dashboard

### 5.1 Technology Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS
- **State Management:** Zustand
- **Real-time:** WebSocket (Socket.io)
- **Charts:** Recharts
- **Components:** Headless UI + Radix

### 5.2 Page Structure

```
/dashboard
├── /agents           # Agent grid view
├── /convoys          # Kanban board
├── /beads            # Bead list view
├── /review           # Code review
├── /costs            # Cost dashboard
└── /settings         # Configuration
```

### 5.3 Agent Grid Component

```typescript
interface AgentGridProps {
  agents: Agent[];
  onSpawnAgent: () => void;
  onKillAgent: (agentId: string) => void;
}

function AgentGrid({ agents, onSpawnAgent, onKillAgent }: AgentGridProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {agents.map(agent => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onKill={() => onKillAgent(agent.id)}
        />
      ))}
      <SpawnAgentButton onClick={onSpawnAgent} />
    </div>
  );
}
```

### 5.4 Kanban Board Component

```typescript
interface KanbanBoardProps {
  convoy: Convoy;
  beads: Bead[];
  onMoveBead: (beadId: string, newStatus: BeadStatus) => void;
}

function KanbanBoard({ convoy, beads, onMoveBead }: KanbanBoardProps) {
  const columns = ['open', 'in-progress', 'review', 'done'];
  
  return (
    <div className="flex gap-4">
      {columns.map(status => (
        <KanbanColumn
          key={status}
          status={status}
          beads={beads.filter(b => b.status === status)}
          onDrop={(beadId) => onMoveBead(beadId, status)}
        />
      ))}
    </div>
  );
}
```

---

## 6. API Specifications

### 6.1 Bead API

```typescript
// GET /api/beads
interface ListBeadsResponse {
  beads: Bead[];
  total: number;
}

// POST /api/beads
interface CreateBeadRequest {
  title: string;
  type: BeadType;
  description?: string;
}

// GET /api/beads/:id
// PUT /api/beads/:id
// DELETE /api/beads/:id

// POST /api/beads/:id/assign
interface AssignBeadRequest {
  agentId: string;
}
```

### 6.2 Proxy API

```typescript
// POST /proxy/v1/chat/completions
interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  routing?: {
    fallback_allowed?: boolean;
    cost_limit?: number;
  };
}

// GET /proxy/v1/usage
interface UsageResponse {
  totalCost: number;
  byProvider: Record<string, number>;
  byAgent: Record<string, number>;
}

// GET /proxy/v1/audit
interface AuditResponse {
  logs: LogEntry[];
  total: number;
}
```

### 6.3 Weaver API

```typescript
// POST /api/weaver/agents
interface SpawnAgentRequest {
  agentId: string;
  beadId: string;
  resources?: ResourceRequirements;
}

// GET /api/weaver/agents/:id/status
interface AgentStatusResponse {
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  podName: string;
  logs: string;
}

// DELETE /api/weaver/agents/:id
```

---

## 7. Data Models

### 7.1 Core Types

```typescript
// Bead
interface Bead {
  id: string;
  type: 'task' | 'bug' | 'feature' | 'refactor';
  title: string;
  description?: string;
  status: BeadStatus;
  agent?: string;
  worktree?: string;
  commits: string[];
  parentBead?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

type BeadStatus = 'open' | 'in-progress' | 'review' | 'done';

// Convoy
interface Convoy {
  id: string;
  name: string;
  description?: string;
  beads: string[];
  status: 'active' | 'completed' | 'archived';
  createdAt: Date;
  completedAt?: Date;
}

// Agent
interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  beadId?: string;
  runtime: 'local' | 'kubernetes';
  podName?: string;
  resources?: ResourceUsage;
  createdAt: Date;
}

type AgentType = 'worker' | 'reviewer' | 'coordinator' | 'specialist';
type AgentStatus = 'idle' | 'busy' | 'paused' | 'error';
```

---

## 8. Testing Strategy

### 8.1 Test Pyramid

```
       /\
      /  \
     / E2E\          (5%)  - Full workflows
    /________\            
   /          \          
  / Integration\   (25%)  - API, DB, Proxy
 /______________\        
/                \       
/    Unit Tests   \ (70%) - Core logic
/__________________\
```

### 8.2 Critical Test Paths

1. **Bead Lifecycle:** Create → Assign → Complete
2. **Proxy Flow:** Request → Rate Limit → Provider → Response
3. **Weaver Flow:** Spawn → Monitor → Terminate
4. **Dashboard:** Real-time updates, drag-and-drop

### 8.3 Test Requirements

- 90%+ unit test coverage
- Integration tests for all APIs
- E2E tests for critical paths
- Performance benchmarks

---

**Next Steps:** Begin implementation with Phase 1 (Git-Backed Persistence)
