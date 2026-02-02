# Dash Orchestrator Platform v2.0
# Technical Specification (SPEC)

**Version:** 2.0.0  
**Date:** 2026-02-02  
**Status:** Draft - Ready for Implementation  
**Target:** CLI/OpenTUI-first, API-native agent orchestration

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Component Specifications](#2-component-specifications)
3. [API Specification](#3-api-specification)
4. [Data Models](#4-data-models)
5. [Storage Layer](#5-storage-layer)
6. [Integration with OpenClaw](#6-integration-with-openclaw)
7. [Configuration System](#7-configuration-system)
8. [Error Handling](#8-error-handling)
9. [Performance Requirements](#9-performance-requirements)
10. [Security Considerations](#10-security-considerations)
11. [Testing Strategy](#11-testing-strategy)
12. [Development Roadmap](#12-development-roadmap)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface Layer                  │
├─────────────────────────────────────────────────────────┤
│  CLI (commander.js)    │   OpenTUI Dashboard            │
│  - dash swarm create   │   - Agent Grid                 │
│  - dash agents spawn   │   - Event Stream               │
│  - dash dashboard      │   - Budget Panel               │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│                    API Layer                             │
├─────────────────────────────────────────────────────────┤
│  REST API (Express)        │   WebSocket Server          │
│  - CRUD swarms/agents      │   - Real-time events        │
│  - Status endpoints        │   - Agent messaging         │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│                   Core Engine                            │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Swarm Manager │  │Agent Lifecycle│  │Budget Ctrl   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Message Bus   │  │Safety/Rules   │  │Event System  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│                Integration Layer                         │
├─────────────────────────────────────────────────────────┤
│  OpenClaw API        │   Storage Backends               │
│  - sessions_spawn    │   - SQLite (default)             │
│  - sessions_list     │   - PostgreSQL (future)          │
│  - sessions_send     │   - Redis (future)               │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Design Principles

1. **Modularity:** Each component is self-contained with clear interfaces
2. **Testability:** Dependency injection, mockable interfaces
3. **Observability:** Every action emits events, full audit trails
4. **Performance:** Lazy loading, virtual lists, efficient polling
5. **Reliability:** Graceful degradation, circuit breakers, retries

### 1.3 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js 20+ | TypeScript support, ecosystem |
| CLI Framework | Commander.js | Mature, extensible |
| TUI | OpenTUI | React-like API for terminals |
| API Server | Express + ws | Simple, well-known |
| Database | SQLite (default) | Zero-config, portable |
| ORM | Better-sqlite3 | Performance, simplicity |
| Validation | Zod | Type-safe schema validation |
| Testing | Vitest | Fast, modern |

---

## 2. Component Specifications

### 2.1 Swarm Manager

**File:** `src/swarm/manager.ts`

**Responsibilities:**
- Create/destroy swarms with configurable topology
- Manage agent lifecycle within swarms
- Implement scaling strategies
- Handle swarm-wide events and notifications

**Interface:**

```typescript
interface SwarmManager {
  // Lifecycle
  create(config: SwarmConfig): Promise<Swarm>;
  destroy(swarmId: string, options?: DestroyOptions): Promise<void>;
  get(swarmId: string): Swarm | undefined;
  list(): Swarm[];
  
  // Scaling
  scale(swarmId: string, targetSize: number): Promise<void>;
  
  // Status
  getStatus(swarmId: string): SwarmStatus;
  getMetrics(swarmId: string): SwarmMetrics;
  
  // Events
  on(event: SwarmEvent, handler: SwarmEventHandler): Unsubscribe;
  emit(event: SwarmEvent, data: SwarmEventData): void;
}

interface SwarmConfig {
  name: string;
  task: string;
  initialAgents: number;
  maxAgents: number;
  strategy: SwarmStrategy;
  budget?: BudgetConfig;
  safety?: SafetyConfig;
  metadata?: Record<string, any>;
}

type SwarmStrategy = 
  | 'parallel'      // All agents independent
  | 'map-reduce'    // Map → Reduce phases
  | 'pipeline'      // Sequential handoffs
  | 'tree';         // Hierarchical decomposition

interface Swarm {
  id: string;
  name: string;
  status: SwarmStatus;
  config: SwarmConfig;
  agents: string[];        // Agent IDs
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metrics: SwarmMetrics;
}

type SwarmStatus = 
  | 'created'     // Initial state
  | 'starting'    // Agents spawning
  | 'running'     // Active execution
  | 'scaling'     // Adding/removing agents
  | 'pausing'     // Graceful pause
  | 'paused'      // Temporarily stopped
  | 'completing'  // Winding down
  | 'completed'   // All done successfully
  | 'failing'     // Some agents failing
  | 'failed'      // Critical failure
  | 'destroying'  // Cleanup in progress
  | 'destroyed';  // Fully cleaned up

interface SwarmMetrics {
  totalAgents: number;
  runningAgents: number;
  completedAgents: number;
  failedAgents: number;
  tokensUsed: number;
  costIncurred: number;
  progress: number;  // 0-100
  estimatedTimeRemaining?: number;  // seconds
}

type SwarmEvent =
  | 'swarm.created'
  | 'swarm.started'
  | 'swarm.scaled'
  | 'swarm.paused'
  | 'swarm.resumed'
  | 'swarm.completed'
  | 'swarm.failed'
  | 'swarm.destroyed'
  | 'swarm.budget.warning'    // 75%
  | 'swarm.budget.critical'   // 90%
  | 'swarm.budget.exhausted'; // 100%
```

**Implementation Notes:**

1. **State Machine:** Swarms transition through defined states with validation
2. **Event-Driven:** All state changes emit events for dashboard/integrations
3. **Persistence:** Swarm state saved to database on every transition
4. **Concurrency:** Use async queue for state transitions to prevent race conditions

**Example Usage:**

```typescript
const manager = new SwarmManager();

// Create swarm
const swarm = await manager.create({
  name: 'auth-refactor',
  task: 'Refactor authentication module',
  initialAgents: 10,
  maxAgents: 20,
  strategy: 'parallel',
  budget: { maxCost: 50, currency: 'USD' }
});

// Listen for events
manager.on('swarm.budget.warning', (data) => {
  console.log(`Swarm ${data.swarmId} at 75% budget`);
});

// Scale up
await manager.scale(swarm.id, 15);
```

---

### 2.2 Agent Lifecycle Manager

**File:** `src/agent/lifecycle.ts`

**Responsibilities:**
- Manage agent states and transitions
- Handle auto-retry with exponential backoff
- Implement model failover
- Track agent metrics and history

**State Machine:**

```
                    ┌─────────────┐
         ┌─────────│   IDLE      │
         │         └──────┬──────┘
         │                │ spawn()
         │                ▼
         │         ┌─────────────┐     ┌─────────────┐
         │         │  SPAWNING   │────>│    ERROR    │<────┐
         │         └──────┬──────┘     └─────────────┘     │
         │                │ start()                         │
         │                ▼                                 │
         │         ┌─────────────┐     timeout/error       │
         │    ┌───▶│   RUNNING   │─────────────────────────┤
         │    │    └──────┬──────┘                         │
         │    │           │ complete()                      │
  resume()   pause()       ▼                          retry()
         │    │    ┌─────────────┐                         │
         │    └───│   PAUSED    │─────────────────────────┘
         │         └─────────────┘
         │
         │                ▼
         │         ┌─────────────┐
         └────────│  COMPLETED  │
                  └─────────────┘
                         │
                    fail/retry_exhausted
                         ▼
                  ┌─────────────┐
                  │   FAILED    │<────┐
                  └──────┬──────┘     │
                         │ escalate() │
                         ▼            │
                  ┌─────────────┐     │
                  │  ESCALATED  │─────┘
                  └─────────────┘
```

**Interface:**

```typescript
interface AgentLifecycle {
  // Lifecycle
  spawn(config: AgentConfig): Promise<Agent>;
  kill(agentId: string, reason?: string): Promise<void>;
  pause(agentId: string): Promise<void>;
  resume(agentId: string): Promise<void>;
  retry(agentId: string, options?: RetryOptions): Promise<void>;
  
  // Status
  getState(agentId: string): AgentState;
  getHistory(agentId: string): AgentHistoryEntry[];
  getMetrics(agentId: string): AgentMetrics;
  
  // Batch operations
  pauseAll(swarmId: string): Promise<void>;
  resumeAll(swarmId: string): Promise<void>;
  killAll(swarmId: string, reason?: string): Promise<void>;
}

interface AgentConfig {
  swarmId: string;
  task: string;
  model?: string;
  parentId?: string;        // For hierarchical delegation
  budget?: BudgetConfig;    // Inherits from parent if not specified
  context?: ContextConfig;  // File sandbox scope
  retryPolicy?: RetryPolicy;
}

interface RetryPolicy {
  maxAttempts: number;      // Default: 3
  backoffMultiplier: number; // Default: 2
  initialDelayMs: number;   // Default: 1000
  maxDelayMs: number;       // Default: 30000
  failoverModels?: string[]; // Models to try after retries
}

interface Agent {
  id: string;
  swarmId: string;
  parentId?: string;
  children: string[];
  state: AgentState;
  config: AgentConfig;
  sessionId?: string;       // OpenClaw session ID
  
  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Retry tracking
  attempt: number;
  lastError?: ErrorInfo;
  
  // Metrics
  metrics: AgentMetrics;
}

type AgentState =
  | 'idle'
  | 'spawning'
  | 'running'
  | 'paused'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'escalated'
  | 'killed';

interface AgentMetrics {
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  durationMs: number;
  progress: number;  // 0-100, if applicable
}

interface AgentHistoryEntry {
  timestamp: Date;
  state: AgentState;
  reason?: string;
  metadata?: Record<string, any>;
}
```

**Auto-Recovery Algorithm:**

```typescript
async function handleAgentFailure(agent: Agent): Promise<void> {
  const policy = agent.config.retryPolicy;
  
  // Check if we should retry
  if (agent.attempt < policy.maxAttempts) {
    // Calculate delay: 2^attempt * initialDelay
    const delay = Math.min(
      Math.pow(policy.backoffMultiplier, agent.attempt) * policy.initialDelayMs,
      policy.maxDelayMs
    );
    
    // Transition to retrying state
    await transitionState(agent, 'retrying');
    
    // Wait with exponential backoff
    await sleep(delay);
    
    // Retry with same configuration
    await retry(agent);
    return;
  }
  
  // Check if we should failover to different model
  if (policy.failoverModels && policy.failoverModels.length > 0) {
    const nextModel = policy.failoverModels[0];
    await failover(agent, nextModel);
    return;
  }
  
  // Exhausted all options, escalate
  await escalate(agent);
}
```

---

### 2.3 OpenTUI Dashboard

**File:** `src/dashboard/opentui.tsx`

**Responsibilities:**
- Render real-time TUI dashboard
- Handle keyboard input
- Subscribe to events and update display
- Manage panel layout and focus

**Component Hierarchy:**

```
Dashboard (root)
├── WindowManager
│   ├── Panel: AgentGrid
│   │   ├── VirtualList (agents)
│   │   ├── StatusBar
│   │   └── Search/Filter
│   ├── Panel: EventStream
│   │   ├── VirtualList (events)
│   │   ├── FilterControls
│   │   └── Search
│   ├── Panel: BudgetPanel
│   │   ├── Sparkline (burn rate)
│   │   ├── ProgressBar (budget)
│   │   └── Alerts
│   └── Panel: CommandBar
│       ├── Input
│       ├── Suggestions
│       └── History
├── Modal: AgentDetail
│   ├── Tabs: Info/Logs/Traces
│   └── ActionButtons
└── NotificationCenter
    └── Toast messages
```

**Keyboard Shortcuts:**

| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `h` / `←` | Previous panel |
| `l` / `→` | Next panel |
| `Enter` | Select/Focus |
| `Space` | Pause/Resume |
| `x` | Kill (with confirmation) |
| `r` | Retry |
| `f` | Filter/Search |
| `:` | Command palette |
| `?` | Help |
| `q` / `Ctrl+c` | Quit |

**Example Component:**

```tsx
// AgentGrid.tsx
import { Box, Text, VirtualList } from '@opentui/core';

function AgentGrid({ agents, selectedId, onSelect }) {
  return (
    <Box border title=" Agents ">
      <VirtualList
        items={agents}
        renderItem={(agent) => (
          <AgentRow
            agent={agent}
            isSelected={agent.id === selectedId}
          />
        )}
      />
    </Box>
  );
}

function AgentRow({ agent, isSelected }) {
  const statusColor = {
    running: 'yellow',
    completed: 'green',
    failed: 'red',
    paused: 'blue',
  }[agent.state] || 'white';
  
  return (
    <Box backgroundColor={isSelected ? 'gray' : undefined}>
      <Text>{agent.id}</Text>
      <Text color={statusColor}>{agent.state}</Text>
      <Text>{agent.task.substring(0, 30)}...</Text>
      <ProgressBar value={agent.metrics.progress} />
      <Text>${agent.metrics.estimatedCost.toFixed(2)}</Text>
    </Box>
  );
}
```

---

### 2.4 Message Bus

**File:** `src/bus/index.ts`

**Responsibilities:**
- Pub/sub messaging between agents
- Topic-based routing
- Event filtering
- Delivery guarantees (at-least-once)

**Interface:**

```typescript
interface MessageBus {
  // Publishing
  publish(topic: string, message: Message): void;
  publishBatch(messages: { topic: string; message: Message }[]): void;
  
  // Subscribing
  subscribe(topic: string, handler: MessageHandler): Subscription;
  subscribePattern(pattern: string, handler: MessageHandler): Subscription;
  
  // Management
  unsubscribe(subscription: Subscription): void;
  getSubscribers(topic: string): number;
  
  // Utility
  once(topic: string, handler: MessageHandler): void;
  waitFor(topic: string, timeout?: number): Promise<Message>;
}

interface Message {
  id: string;
  timestamp: Date;
  topic: string;
  payload: any;
  metadata?: {
    senderId?: string;
    correlationId?: string;
    priority?: 'low' | 'normal' | 'high';
  };
}

type MessageHandler = (message: Message) => void | Promise<void>;

interface Subscription {
  id: string;
  topic: string;
  unsubscribe: () => void;
}
```

**Topic Patterns:**

```
# Agent-specific
agent.{id}.commands      # Control messages to agent
agent.{id}.events        # Status updates from agent
agent.{id}.logs          # Log output
agent.{id}.progress      # Progress updates

# Swarm-wide
swarm.{id}.broadcast     # All agents in swarm
swarm.{id}.commands      # Swarm-level commands
swarm.{id}.status        # Aggregate status

# Task-type specific
task.{type}.updates      # Type-specific updates
task.{type}.results      # Completed task results

# System
system.alerts            # System-wide alerts
system.metrics           # Performance metrics
system.errors            # Error notifications
```

**Example Usage:**

```typescript
const bus = new MessageBus();

// Agent subscribes to its commands
bus.subscribe(`agent.${agentId}.commands`, (msg) => {
  if (msg.payload.action === 'pause') {
    pauseAgent(agentId);
  }
});

// Dashboard subscribes to all events
bus.subscribePattern('agent.*.events', (msg) => {
  updateDashboard(msg.topic, msg.payload);
});

// Send command to specific agent
bus.publish(`agent.${agentId}.commands`, {
  action: 'pause',
  reason: 'Budget constraint'
});

// Broadcast to all agents in swarm
bus.publish(`swarm.${swarmId}.broadcast`, {
  type: 'shutdown_warning',
  message: 'Shutting down in 60 seconds'
});
```

---

### 2.5 Budget Controller

**File:** `src/budget/controller.ts`

**Responsibilities:**
- Track token usage and costs
- Enforce budget limits
- Provide predictive warnings
- Handle budget overruns

**Interface:**

```typescript
interface BudgetController {
  // Allocation
  allocate(swarmId: string, config: BudgetConfig): Budget;
  allocateForAgent(swarmId: string, agentId: string, amount: number): boolean;
  
  // Tracking
  recordUsage(agentId: string, tokens: TokenUsage): void;
  getRemaining(swarmId: string): number;
  getRemainingForAgent(agentId: string): number;
  
  // Enforcement
  checkBudget(agentId: string): BudgetStatus;
  pauseIfOverBudget(agentId: string): boolean;
  
  // Notifications
  onThreshold(threshold: number, handler: BudgetHandler): Unsubscribe;
  
  // Reporting
  getReport(swarmId: string): BudgetReport;
  getAttribution(swarmId: string): AgentCost[];
}

interface BudgetConfig {
  maxCost: number;
  currency: 'USD' | 'EUR' | 'GBP';
  warningThreshold?: number;  // Default: 0.75
  criticalThreshold?: number; // Default: 0.90
  hardStop?: boolean;         // Default: true
}

interface Budget {
  swarmId: string;
  total: number;
  used: number;
  remaining: number;
  currency: string;
  status: BudgetStatus;
  agents: Map<string, AgentBudget>;
}

interface AgentBudget {
  allocated: number;
  used: number;
  remaining: number;
}

type BudgetStatus = 
  | 'healthy'      // < 75%
  | 'warning'      // 75-90%
  | 'critical'     // 90-100%
  | 'exhausted'    // >= 100%
  | 'overrun';     // > 100% with approval

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  model: string;
  timestamp: Date;
}

interface BudgetReport {
  swarmId: string;
  budget: BudgetConfig;
  totalUsed: number;
  totalRemaining: number;
  percentageUsed: number;
  agents: AgentCost[];
  projections: {
    timeToExhaustion?: number;  // seconds
    projectedFinalCost?: number;
  };
}
```

**Cost Calculation:**

```typescript
const MODEL_PRICING = {
  'claude-sonnet-4-5': {
    input: 0.000003,   // $ per token
    output: 0.000015
  },
  'kimi-k2.5': {
    input: 0.000002,
    output: 0.000008
  },
  'gpt-4': {
    input: 0.000030,
    output: 0.000060
  }
};

function calculateCost(usage: TokenUsage): number {
  const pricing = MODEL_PRICING[usage.model];
  if (!pricing) return 0;
  
  return (
    usage.promptTokens * pricing.input +
    usage.completionTokens * pricing.output
  );
}
```

---

### 2.6 Safety Guardrails

**File:** `src/safety/guardrails.ts`

**Responsibilities:**
- Validate commands against dangerous patterns
- Enforce file sandbox boundaries
- Manage approval workflows
- Audit all safety decisions

**Interface:**

```typescript
interface SafetyGuardrails {
  // Validation
  assessRisk(action: string): RiskAssessment;
  validateCommand(command: string): ValidationResult;
  validateFileAccess(agentId: string, path: string): boolean;
  
  // Enforcement
  block(action: string, reason: string): BlockResult;
  requireApproval(action: string): ApprovalRequest;
  
  // Configuration
  addPattern(pattern: DangerPattern): void;
  setSandbox(agentId: string, scope: string[]): void;
}

interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;  // 0-100
  reasons: string[];
  suggestedAction: 'allow' | 'confirm' | 'block';
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  approvalId?: string;
}

interface DangerPattern {
  name: string;
  pattern: RegExp;
  level: 'high' | 'critical';
  description: string;
}
```

**Default Danger Patterns:**

```typescript
const DEFAULT_DANGER_PATTERNS: DangerPattern[] = [
  {
    name: 'recursive_delete_root',
    pattern: /rm\s+-rf\s+\/(?:\s|$)/,
    level: 'critical',
    description: 'Recursive deletion of root filesystem'
  },
  {
    name: 'recursive_delete_all',
    pattern: /rm\s+-rf\s+\/(?:\.|\*)?\*/,
    level: 'critical',
    description: 'Recursive deletion with wildcards'
  },
  {
    name: 'pipe_to_shell',
    pattern: /curl.*\|.*(?:bash|sh|zsh)/i,
    level: 'critical',
    description: 'Piping curl output directly to shell'
  },
  {
    name: 'eval_user_input',
    pattern: /eval\s*\(\s*(?:\$|`|\w+)/,
    level: 'high',
    description: 'Evaluating potentially unsafe user input'
  },
  {
    name: 'modify_system_files',
    pattern: /(?:>|>>)\s*\/etc\/\w+/,
    level: 'critical',
    description: 'Writing to system configuration files'
  },
  {
    name: 'chmod_system_files',
    pattern: /chmod\s+.*\/etc\/|chmod\s+777/,
    level: 'high',
    description: 'Changing permissions on sensitive files'
  },
  {
    name: 'delete_git_repo',
    pattern: /rm\s+-rf\s+.*\.git/,
    level: 'high',
    description: 'Deleting git repository'
  },
  {
    name: 'exposed_secrets',
    pattern: /(?:password|secret|key|token)\s*=\s*['"]\w+/i,
    level: 'high',
    description: 'Potentially hardcoded secrets'
  }
];
```

---

## 3. API Specification

### 3.1 REST API

#### Swarm Endpoints

```
POST /api/swarm
Create a new swarm

Request:
{
  "name": "auth-refactor",
  "task": "Refactor authentication module",
  "initialAgents": 10,
  "maxAgents": 20,
  "strategy": "parallel",
  "budget": {
    "maxCost": 50,
    "currency": "USD"
  }
}

Response: 201 Created
{
  "id": "swarm-abc123",
  "name": "auth-refactor",
  "status": "created",
  "agents": ["agent-001", "agent-002", ...],
  "createdAt": "2026-02-02T10:00:00Z"
}
```

```
GET /api/swarm/:id
Get swarm status

Response: 200 OK
{
  "id": "swarm-abc123",
  "name": "auth-refactor",
  "status": "running",
  "agents": {
    "total": 20,
    "running": 15,
    "completed": 3,
    "failed": 2
  },
  "metrics": {
    "progress": 75,
    "tokensUsed": 45000,
    "costIncurred": 2.34,
    "estimatedTimeRemaining": 120
  }
}
```

```
POST /api/swarm/:id/scale
Scale swarm to target size

Request:
{
  "targetSize": 25
}

Response: 200 OK
{
  "swarmId": "swarm-abc123",
  "previousSize": 20,
  "newSize": 25,
  "added": ["agent-021", "agent-022", "agent-023", "agent-024", "agent-025"]
}
```

#### Agent Endpoints

```
POST /api/agents
Spawn a new agent

Request:
{
  "swarmId": "swarm-abc123",
  "task": "Fix login validation",
  "model": "kimi-k2.5"
}

Response: 201 Created
{
  "id": "agent-026",
  "swarmId": "swarm-abc123",
  "status": "spawning",
  "task": "Fix login validation"
}
```

```
POST /api/agents/:id/pause
Pause an agent

Response: 200 OK
{
  "id": "agent-026",
  "previousStatus": "running",
  "currentStatus": "paused"
}
```

### 3.2 WebSocket Events

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:7373/events');
```

**Authentication:**
```javascript
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-api-token'
}));
```

**Subscribe to Topics:**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  topics: ['agent.*.events', 'swarm.swarm-abc123.*']
}));
```

**Event Format:**
```javascript
{
  "type": "agent.state_changed",
  "timestamp": "2026-02-02T10:05:30Z",
  "data": {
    "agentId": "agent-001",
    "swarmId": "swarm-abc123",
    "previousState": "running",
    "currentState": "completed",
    "durationMs": 125000
  }
}
```

---

## 4. Data Models

### 4.1 Entity Relationship Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Swarm     │────▶│   Agent     │────▶│   Event     │
├─────────────┤ 1:M ├─────────────┤ 1:M ├─────────────┤
│ id          │     │ id          │     │ id          │
│ name        │     │ swarmId     │     │ agentId     │
│ status      │     │ parentId    │     │ type        │
│ config      │     │ state       │     │ payload     │
│ budget      │     │ task        │     │ timestamp   │
└─────────────┘     │ config      │     └─────────────┘
                    │ metrics     │
                    └─────────────┘
                           │
                           │ 1:1
                           ▼
                    ┌─────────────┐
                    │   Budget    │
                    ├─────────────┤
                    │ agentId     │
                    │ allocated   │
                    │ used        │
                    │ status      │
                    └─────────────┘
```

### 4.2 TypeScript Interfaces

```typescript
// Core entities
interface Swarm {
  id: string;
  name: string;
  status: SwarmStatus;
  config: SwarmConfig;
  budgetId: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

interface Agent {
  id: string;
  swarmId: string;
  parentId?: string;
  state: AgentState;
  task: string;
  model: string;
  sessionId?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  attempt: number;
}

interface Event {
  id: string;
  type: string;
  agentId?: string;
  swarmId?: string;
  payload: any;
  timestamp: Date;
}

interface Budget {
  id: string;
  swarmId?: string;
  agentId?: string;
  total: number;
  used: number;
  currency: string;
  status: BudgetStatus;
  createdAt: Date;
}
```

---

## 5. Storage Layer

### 5.1 Database Schema (SQLite)

```sql
-- Swarms table
CREATE TABLE swarms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  config JSON NOT NULL,
  budget_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Agents table
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  swarm_id TEXT NOT NULL,
  parent_id TEXT,
  state TEXT NOT NULL,
  task TEXT NOT NULL,
  model TEXT,
  session_id TEXT,
  attempt INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (swarm_id) REFERENCES swarms(id),
  FOREIGN KEY (parent_id) REFERENCES agents(id)
);

-- Events table
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  agent_id TEXT,
  swarm_id TEXT,
  payload JSON NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (swarm_id) REFERENCES swarms(id)
);

-- Budgets table
CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  swarm_id TEXT,
  agent_id TEXT,
  total REAL NOT NULL,
  used REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'healthy',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (swarm_id) REFERENCES swarms(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Indexes for performance
CREATE INDEX idx_agents_swarm ON agents(swarm_id);
CREATE INDEX idx_agents_state ON agents(state);
CREATE INDEX idx_events_agent ON events(agent_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
```

### 5.2 Storage Interface

```typescript
interface Storage {
  // Swarms
  createSwarm(swarm: Swarm): Promise<void>;
  getSwarm(id: string): Promise<Swarm | null>;
  updateSwarm(id: string, updates: Partial<Swarm>): Promise<void>;
  deleteSwarm(id: string): Promise<void>;
  listSwarms(): Promise<Swarm[]>;
  
  // Agents
  createAgent(agent: Agent): Promise<void>;
  getAgent(id: string): Promise<Agent | null>;
  updateAgent(id: string, updates: Partial<Agent>): Promise<void>;
  listAgents(swarmId?: string): Promise<Agent[]>;
  
  // Events
  createEvent(event: Event): Promise<void>;
  listEvents(options: EventQueryOptions): Promise<Event[]>;
  
  // Budgets
  createBudget(budget: Budget): Promise<void>;
  updateBudget(id: string, updates: Partial<Budget>): Promise<void>;
  getBudget(id: string): Promise<Budget | null>;
}
```

---

## 6. Integration with OpenClaw

### 6.1 Session Spawning

```typescript
// src/integration/openclaw.ts

import { sessions_spawn, sessions_list, sessions_send } from '@openclaw/sdk';

export class OpenClawIntegration {
  async spawnAgent(config: AgentConfig): Promise<AgentSession> {
    // Create OpenClaw session
    const session = await sessions_spawn({
      label: `dash-agent-${config.id}`,
      model: config.model || 'kimi-k2.5',
      task: config.task,
      context: config.context
    });
    
    // Set up event forwarding
    this.forwardEvents(session.id, config.id);
    
    return {
      sessionId: session.id,
      agentId: config.id,
      status: 'active'
    };
  }
  
  private forwardEvents(sessionId: string, agentId: string): void {
    // Subscribe to OpenClaw session events
    // Forward to our message bus
    const subscription = subscribeToSession(sessionId, (event) => {
      messageBus.publish(`agent.${agentId}.events`, {
        type: event.type,
        payload: event.data,
        timestamp: new Date()
      });
    });
    
    // Store subscription for cleanup
    this.subscriptions.set(agentId, subscription);
  }
  
  async killAgent(sessionId: string): Promise<void> {
    // Gracefully terminate OpenClaw session
    await sessions_send({
      sessionKey: sessionId,
      message: 'TERMINATE'
    });
    
    // Clean up subscriptions
    this.subscriptions.delete(sessionId);
  }
}
```

### 6.2 Token Tracking

```typescript
// Subscribe to token usage events from OpenClaw
openclaw.on('token_usage', (data) => {
  budgetController.recordUsage(data.agentId, {
    promptTokens: data.prompt_tokens,
    completionTokens: data.completion_tokens,
    model: data.model,
    timestamp: new Date()
  });
});
```

---

## 7. Configuration System

### 7.1 Configuration File

**Location:** `~/.dash/config.yaml`

```yaml
# Dash Configuration File v2.0

# Default settings for all swarms
defaults:
  model: kimi-k2.5
  maxAgents: 50
  strategy: parallel
  
  budget:
    default: 50
    currency: USD
    warningThreshold: 0.75
    criticalThreshold: 0.90
    hardStop: true

# Safety settings
safety:
  enabled: true
  fileSandbox: true
  networkAllowlist:
    - github.com
    - npmjs.org
    - api.openai.com
    - api.anthropic.com
  commandBlacklist:
    - rm -rf /
    - curl | bash
  requireApprovalFor:
    - budgetOverrun: true
    - fileDelete: true
    - networkRequest: false

# Dashboard settings
dashboard:
  refreshRate: 1000  # milliseconds
  defaultView: grid
  panels:
    - agentGrid
    - eventStream
    - budgetPanel
  
  # Keyboard shortcuts (vim-style)
  keybindings:
    navigateDown: j
    navigateUp: k
    focus: enter
    pause: space
    kill: x
    retry: r
    commandPalette: colon
    help: question
    quit: q

# API server settings
api:
  enabled: true
  host: localhost
  port: 7373
  cors:
    origins:
      - http://localhost:3000
    credentials: true
  
  # WebSocket settings
  websocket:
    heartbeatInterval: 30000
    maxConnections: 100

# Logging
logging:
  level: info  # debug, info, warn, error
  file: ~/.dash/logs/dash.log
  maxFiles: 5
  maxSize: 10MB

# Storage
storage:
  type: sqlite  # sqlite, postgresql
  sqlite:
    path: ~/.dash/db.sqlite
  postgresql:
    host: localhost
    port: 5432
    database: dash
    username: dash
    password: ${DASH_DB_PASSWORD}

# Integration
integrations:
  openclaw:
    apiUrl: http://localhost:3000
    apiKey: ${OPENCLAW_API_KEY}
  
  slack:
    webhookUrl: ${SLACK_WEBHOOK_URL}
    notifyOn:
      - swarm.failed
      - budget.critical
```

### 7.2 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DASH_CONFIG` | Path to config file | `~/.dash/config.yaml` |
| `DASH_DB_PATH` | SQLite database path | `~/.dash/db.sqlite` |
| `DASH_API_PORT` | API server port | `7373` |
| `DASH_LOG_LEVEL` | Logging level | `info` |
| `DASH_HOME` | Dash home directory | `~/.dash` |
| `NO_COLOR` | Disable colored output | - |
| `OPENCLAW_API_KEY` | OpenClaw API key | - |

---

## 8. Error Handling

### 8.1 Error Categories

| Code | Category | HTTP Status | Action |
|------|----------|-------------|--------|
| `E001` | Agent spawn failed | 500 | Retry with backoff |
| `E002` | Agent crashed | 500 | Auto-retry, escalate |
| `E003` | Budget exceeded | 429 | Pause swarm, notify |
| `E004` | Safety violation | 403 | Block, create approval |
| `E005` | Network error | 503 | Retry with backoff |
| `E006` | Timeout | 504 | Mark failed, escalate |
| `E007` | Invalid configuration | 400 | Reject request |
| `E008` | Not found | 404 | Return 404 |
| `E009` | Conflict | 409 | Return current state |
| `E010` | Validation failed | 422 | Return details |

### 8.2 Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |
| `3` | Agent spawn failed |
| `4` | Budget exceeded |
| `5` | Safety violation blocked |
| `6` | Timeout |
| `7` | Configuration error |
| `130` | Interrupted (Ctrl+C) |

---

## 9. Performance Requirements

### 9.1 Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Swarm creation (20 agents) | < 5s | Command to confirmation |
| Dashboard refresh | < 100ms | 50 agents displayed |
| Event latency | < 50ms | Agent → Dashboard |
| Memory usage | < 200MB | Dashboard + API |
| Database query | < 10ms | Single record |
| WebSocket message | < 10ms | Round-trip |

### 9.2 Optimization Strategies

1. **Virtual Lists:** Only render visible items in dashboard
2. **Event Batching:** Buffer events, flush every 100ms
3. **Connection Pooling:** Reuse database connections
4. **Lazy Loading:** Load agent details on demand
5. **Caching:** Cache swarm status for 1 second

---

## 10. Security Considerations

### 10.1 Threat Model

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Agent escapes sandbox | Critical | File scope validation |
| Command injection | Critical | Pattern detection |
| Budget drain attack | High | Hard limits, rate limiting |
| Token leakage | High | Secure storage, no logging |
| Unauthorized API access | Medium | API key auth |
| DoS via agent spam | Medium | Rate limiting |

### 10.2 Security Checklist

- [ ] Input validation on all API endpoints
- [ ] Command sanitization before execution
- [ ] File path validation (prevent traversal)
- [ ] Budget limits enforced server-side
- [ ] API authentication required
- [ ] Audit logging for all actions
- [ ] No sensitive data in logs
- [ ] Secure defaults (sandbox enabled)

---

## 11. Testing Strategy

### 11.1 Test Levels

| Level | Type | Coverage Target |
|-------|------|-----------------|
| Unit | Individual functions | 80% |
| Integration | Component interaction | 70% |
| E2E | Full workflows | Critical paths |
| Performance | Load testing | Benchmarks |
| Security | Vulnerability scans | All vectors |

### 11.2 Critical Test Scenarios

1. Spawn 100 agents, verify all complete
2. Kill random agents during execution
3. Exceed budget, verify hard stop
4. Network failure, verify retry
5. Safety violation, verify block
6. Dashboard with 1000 events

---

## 12. Development Roadmap

### Phase 1: Core (Weeks 1-4)
- [ ] Swarm Manager
- [ ] Agent Lifecycle
- [ ] OpenTUI dashboard
- [ ] File storage
- [ ] Basic API

### Phase 2: Intelligence (Weeks 5-8)
- [ ] Auto-retry
- [ ] Message bus
- [ ] Budget warnings
- [ ] Performance learning

### Phase 3: Scale (Weeks 9-12)
- [ ] Advanced strategies
- [ ] Plugin system
- [ ] PostgreSQL backend
- [ ] Hierarchical delegation

### Phase 4: Polish (Weeks 13-16)
- [ ] Shell completions
- [ ] Documentation
- [ ] Performance optimization
- [ ] Community plugins

---

*SPEC Version: 2.0.0*  
*Last Updated: 2026-02-02*  
*Status: Ready for Implementation*
