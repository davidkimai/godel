# Dash Orchestrator Platform - Product Requirements Document v3.0

**Version:** 3.0.0  
**Date:** February 2, 2026  
**Status:** Draft - Ready for Implementation  
**Based on:** AGENTS_ORCHESTRATION_LEARNINGS.md, OPENTUI_RESEARCH.md, STRATEGIC_GAP_ANALYSIS.md

---

## 1. Executive Summary

### 1.1 What v3 Delivers That v2 Didn't

| Feature | v2 Status | v3 Status | Impact |
|---------|-----------|-----------|--------|
| **OpenTUI Dashboard** | Simulated text output | Real-time TUI with live updates | Core value proposition |
| **REST API Server** | Not implemented | Express server on port 7373 | CI/CD integration |
| **Persistent Storage** | In-memory only | SQLite with migrations | Data survives restarts |
| **WebSocket Events** | Endpoint exists | Real-time event streaming | Live dashboard updates |
| **File Sandbox** | Config only | Enforced filesystem restrictions | Security |
| **Race Condition Handling** | None | Optimistic locking + retries | 50+ agent stability |
| **Predictive Budget** | Static thresholds | Burn rate projections | Cost control |

### 1.2 Real vs Simulated Features

**v2 Simulated (Now Real in v3):**
- ❌ Dashboard was `console.log` output → ✅ OpenTUI with 60fps rendering
- ❌ Port 7373 was a no-op → ✅ Full Express REST API
- ❌ Storage was Map objects → ✅ SQLite with proper schema
- ❌ Events were buffered only → ✅ WebSocket streaming
- ❌ File sandbox was JSON config → ✅ Actual chroot-like restrictions

### 1.3 Production Readiness Criteria

Before v3 can be marked production-ready:

| Criteria | Target | Measurement |
|----------|--------|-------------|
| Dashboard stability | 99.9% uptime | No crashes in 72-hour stress test |
| API availability | 99.9% uptime | Health check every 10 seconds |
| Data durability | Zero loss | Kill -9 test with 100 agents |
| Concurrent agents | 50 stable | No race conditions, <100ms refresh |
| Security audit | Pass | No injection vulnerabilities |
| Test coverage | >80% | Istanbul report |

---

## 2. Real Implementation Requirements

### 2.1 OpenTUI Dashboard with Live Updates

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│  React + OpenTUI Dashboard                                  │
│  ┌──────────────┬─────────────────────────────────────────┐ │
│  │ Agent Grid   │ Event Stream                            │ │
│  │ (j/k nav)    │ (auto-scroll)                           │ │
│  │              │                                         │ │
│  │ ● jarvis     │ [10:42:01] jarvis: Task complete        │ │
│  │ ● friday     │ [10:42:02] friday: Spawned              │ │
│  │ ● vision     │ [10:42:03] swarm-1: Budget 75%          │ │
│  │              │                                         │ │
│  ├──────────────┴─────────────────────────────────────────┤ │
│  │ Budget Panel                                            │ │
│  │ $45.23 / $100.00 [████████████░░░░░░░░] 45%            │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ WebSocket
┌─────────────────────────────────────────────────────────────┐
│  Event Bus → WebSocket Server → Dashboard Re-render        │
│  (<100ms latency from event to pixel)                      │
└─────────────────────────────────────────────────────────────┘
```

**Requirements:**
- React 18+ with @opentui/react reconciler
- Zig 0.13.0+ for native modules
- Bun runtime (Node.js fallback supported)
- Real-time updates via WebSocket
- Optimized re-rendering with React.memo
- Virtual scrolling for 100+ agents

### 2.2 Express REST API Server (Port 7373)

**Server Configuration:**
```typescript
const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'https://dash.local'] }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 60000, max: 100 }));
app.use(authMiddleware); // API key validation

// Port: 7373 (D-A-S-H on T9 keypad)
const PORT = process.env.DASH_PORT || 7373;
```

**Required Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| POST | /api/swarm | Create new swarm |
| GET | /api/swarm/:id | Get swarm details |
| DELETE | /api/swarm/:id | Destroy swarm |
| POST | /api/swarm/:id/scale | Scale swarm |
| GET | /api/agents | List all agents |
| POST | /api/agents | Spawn agent |
| GET | /api/agents/:id | Get agent details |
| DELETE | /api/agents/:id | Kill agent |
| POST | /api/agents/:id/pause | Pause agent |
| POST | /api/agents/:id/resume | Resume agent |
| GET | /api/budget | Get budget status |
| POST | /api/budget/allocate | Allocate budget |
| WS | /events | WebSocket event stream |

### 2.3 SQLite Persistence Layer

**Connection Management:**
```typescript
import Database from 'better-sqlite3';

const db = new Database('/var/lib/dash/dash.db');
db.pragma('journal_mode = WAL'); // Write-ahead logging for concurrency
db.pragma('foreign_keys = ON');
```

**Why SQLite:**
- Zero external dependencies (no PostgreSQL server)
- ACID compliance for race condition prevention
- WAL mode allows concurrent reads during writes
- Single file backup/restore
- 10ms query time target achievable

**Migration Strategy:**
- Migrations stored in `/migrations/` directory
- Version tracking in `_migrations` table
- Automatic migration on startup
- Rollback capability

### 2.4 WebSocket Event Streaming

**Protocol:**
```typescript
interface EventMessage {
  id: string;           // ULID
  timestamp: string;    // ISO 8601
  type: 'agent.spawned' | 'agent.completed' | 'budget.threshold' | ...;
  source: string;       // agent ID or system
  data: unknown;        // Event-specific payload
}
```

**Connection Handling:**
- Heartbeat every 30 seconds (ping/pong)
- Automatic reconnection with exponential backoff
- Subscription filtering by event type
- Backpressure handling for slow consumers

### 2.5 Race Condition Fixes

**Problem Areas:**
1. Concurrent agent spawning (same swarm)
2. Budget updates during task execution
3. Status changes during pause/resume
4. WebSocket event ordering

**Solutions:**
```typescript
// Optimistic locking with row versioning
class AgentStorage {
  async update(id: string, update: Partial<Agent>, expectedVersion: number) {
    const result = db.prepare(`
      UPDATE agents 
      SET status = ?, updated_at = ?, version = version + 1
      WHERE id = ? AND version = ?
    `).run(update.status, Date.now(), id, expectedVersion);
    
    if (result.changes === 0) {
      throw new ConcurrencyConflictError();
    }
  }
}

// Distributed locking for critical sections
class SwarmManager {
  async scaleSwarm(swarmId: string, count: number) {
    const lock = await this.lock.acquire(`swarm:${swarmId}:scale`, 5000);
    try {
      // Critical section: check budget, spawn agents, update counts
    } finally {
      lock.release();
    }
  }
}
```

---

## 3. Granular User Stories

### Story 1: Launch Dashboard → See Real-Time Agent Grid

**As a** swarm operator  
**I want** to launch the dashboard and see live agent status  
**So that** I can monitor my swarms in real-time

**Acceptance Criteria:**
```gherkin
Given I have 3 active swarms with 15 agents total
When I run "dash dashboard"
Then the OpenTUI interface opens within 2 seconds
And I see an agent grid with 15 rows
And each row shows: ID, Name, Status, Task, Progress, Cost
And the grid updates within 100ms of any agent state change
And I can navigate with j/k keys
And I can quit with 'q' key
```

**Technical Verification:**
- [ ] React component renders < 16ms (60fps capable)
- [ ] WebSocket connects and receives events
- [ ] Agent grid re-renders on state change
- [ ] Keyboard events handled via useKeyboard hook
- [ ] No memory leaks after 1 hour of operation

### Story 2: API Request → Get JSON Response

**As a** CI/CD pipeline  
**I want** to create swarms via REST API  
**So that** I can automate agent orchestration

**Acceptance Criteria:**
```gherkin
Given the Dash server is running on port 7373
When I POST to /api/swarm with valid API key
Then I receive 201 Created with swarm ID
And the response includes: id, name, status, agentCount
And the swarm appears in "dash swarm list" within 1 second
And I can GET /api/swarm/:id to retrieve details
```

**Technical Verification:**
- [ ] Express server listens on port 7373
- [ ] API key validation middleware rejects invalid keys
- [ ] POST /api/swarm creates SQLite records
- [ ] Response latency < 50ms p95
- [ ] Rate limiting enforced (100 req/min)

### Story 3: Kill App → Restart → Data Persists

**As a** system administrator  
**I want** Dash to survive restarts without data loss  **So that** I don't lose agent state on crashes

**Acceptance Criteria:**
```gherkin
Given I have 5 swarms with 20 agents and $50.23 spent budget
When I kill -9 the dash process
And I restart Dash
Then all 5 swarms are restored
And all 20 agents are restored with correct status
And the budget shows $50.23 spent
And active agents resume their tasks
```

**Technical Verification:**
- [ ] SQLite persists to disk immediately on write
- [ ] WAL mode ensures durability
- [ ] Recovery process runs on startup
- [ ] Agent sessions reconnected to OpenClaw
- [ ] No data loss in crash test (100 iterations)

### Story 4: 50 Concurrent Agents → No Race Conditions

**As a** platform engineer  
**I want** to run 50 agents simultaneously  
**So that** I can handle large-scale workloads

**Acceptance Criteria:**
```gherkin
Given I create a swarm with 50 agents
When all agents start processing tasks simultaneously
Then no agent data is corrupted
And budget calculations are accurate
And no duplicate agent IDs are created
And the dashboard updates smoothly (<100ms refresh)
And after 5 minutes, all agents report correct status
```

**Technical Verification:**
- [ ] Optimistic locking prevents lost updates
- [ ] Budget updates use atomic increment
- [ ] Connection pooling handles 50+ concurrent connections
- [ ] SQLite WAL mode prevents write conflicts
- [ ] Stress test passes with 0 race conditions detected

---

## 4. OpenTUI Integration Specification

### 4.1 Component Architecture

```
Dashboard (App.tsx)
├── Header
│   ├── Logo
│   ├── Stats (agents, swarms, budget)
│   └── Connection status
├── Main Content (SplitPane)
│   ├── Left Panel (30%)
│   │   ├── SwarmSelector
│   │   └── AgentGrid
│   └── Right Panel (70%)
│       ├── AgentDetails (top 60%)
│       └── EventStream (bottom 40%)
├── BudgetPanel
│   ├── Total budget progress
│   ├── Per-swarm breakdown
│   └── Burn rate sparkline
└── StatusBar
    ├── Current view
    ├── Keyboard shortcuts hint
    └── Last update timestamp
```

### 4.2 Specific Components

#### AgentGrid Component

```typescript
interface AgentGridProps {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  sortBy: 'name' | 'status' | 'cost';
}

// Renders:
// ┌────────────────────────────────────────────────────┐
// │ ID        NAME     STATUS   TASK      PROGRESS     │
// │ agent-001 jarvis   RUNNING  auth      ████████     │
// │ agent-002 friday   IDLE     -         -            │
// └────────────────────────────────────────────────────┘
// Columns: 20 chars, 12 chars, 10 chars, 20 chars, flexible
```

**Features:**
- Virtual scrolling for 100+ agents
- Sortable columns (click header)
- Color-coded status indicators
- Selection highlighting
- Progress bars using block characters

#### EventStream Component

```typescript
interface EventStreamProps {
  events: Event[];
  maxEvents: number;
  autoScroll: boolean;
  filter: EventFilter;
}

// Renders:
// ┌────────────────────────────────────────────────────┐
// │ [10:42:01] jarvis   INFO   Task complete           │
// │ [10:42:02] swarm-1  WARN   Budget 75%              │
// │ [10:42:03] friday   ERROR  API timeout             │
// └────────────────────────────────────────────────────┘
```

**Features:**
- ScrollBox with 1000 event buffer
- Syntax highlighting by level (error=red, warn=yellow)
- Auto-scroll toggle ('a' key)
- Search/filter ('/' key)
- Timestamp formatting

#### BudgetPanel Component

```typescript
interface BudgetPanelProps {
  total: Budget;
  swarms: SwarmBudget[];
  history: DataPoint[]; // For sparkline
}

// Renders:
// Total: $45.23 / $100.00 [████████████░░░░░░░░] 45%
// Swarm-1: $12.34 [████░░░░░░] 
// Swarm-2: $32.89 [█████████████░░░]
// [Sparkline showing 5-min burn rate]
```

### 4.3 Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `j` / `↓` | Global | Move selection down |
| `k` / `↑` | Global | Move selection up |
| `g` | Global | Go to first item |
| `G` | Global | Go to last item |
| `Enter` | AgentGrid | View agent details |
| `x` | AgentGrid | Kill selected agent |
| `r` | AgentGrid | Refresh agent list |
| `q` / `Ctrl+C` | Global | Quit dashboard |
| `1-4` | Global | Switch view (grid/logs/details/settings) |
| `a` | EventStream | Toggle auto-scroll |
| `/` | EventStream | Search/filter events |
| `n` | EventStream | Next search result |
| `N` | EventStream | Previous search result |
| `?` | Global | Show help overlay |

**Implementation:**
```typescript
import { useKeyboard } from '@opentui/react';

function useDashKeybindings(currentView: View, handlers: Handlers) {
  useKeyboard((key) => {
    // Global shortcuts
    if (key.ctrl && key.name === 'c') {
      process.exit(0);
    }
    
    if (key.name === '?') {
      handlers.showHelp();
      return;
    }
    
    // Navigation
    if (key.name === 'j' || key.name === 'down') {
      handlers.moveDown();
    }
    if (key.name === 'k' || key.name === 'up') {
      handlers.moveUp();
    }
    
    // View-specific
    switch (currentView) {
      case 'grid':
        if (key.name === 'x') handlers.killSelected();
        if (key.name === 'r') handlers.refresh();
        break;
      case 'logs':
        if (key.name === 'a') handlers.toggleAutoScroll();
        break;
    }
  });
}
```

### 4.4 Real-Time Update Mechanism

**Data Flow:**
```
Agent State Change
       │
       ▼
SQLite UPDATE
       │
       ▼
Event Bus Publish
       │
       ▼
WebSocket Broadcast
       │
       ▼
Dashboard React Component
       │
       ▼
Re-render with new props
       │
       ▼
OpenTUI reconciler updates renderables
       │
       ▼
Zig native module renders to terminal
```

**Performance Targets:**
- Event published within 10ms of state change
- WebSocket delivery within 20ms
- React re-render within 50ms
- Total latency: <100ms from state change to screen

**Optimization:**
```typescript
// Memoized row component
const AgentRow = React.memo(({ agent, selected }: AgentRowProps) => {
  return (
    <Box backgroundColor={selected ? '#1e40af' : undefined}>
      <Text>{agent.name}</Text>
      <StatusBadge status={agent.status} />
    </Box>
  );
}, (prev, next) => {
  // Custom comparison for fine-grained updates
  return prev.agent.id === next.agent.id &&
         prev.agent.status === next.agent.status &&
         prev.agent.progress === next.agent.progress &&
         prev.selected === next.selected;
});

// Batched updates
const [pendingUpdates, setPendingUpdates] = useState<Agent[]>([]);

useEffect(() => {
  const interval = setInterval(() => {
    if (pendingUpdates.length > 0) {
      flushUpdates(pendingUpdates);
      setPendingUpdates([]);
    }
  }, 50); // Batch updates every 50ms
  
  return () => clearInterval(interval);
}, [pendingUpdates]);
```

### 4.5 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial render | <1s | Time from launch to first frame |
| Agent grid refresh | <100ms | 50 agents, full update |
| Event stream append | <16ms | Single event addition |
| Memory usage | <200MB | For 100 agents |
| CPU usage | <10% | Idle state |
| Keyboard latency | <16ms | Key press to visual feedback |

---

## 5. API Specification (Granular)

### 5.1 Authentication

**API Key Authentication:**
```http
GET /api/agents
Authorization: Bearer dash_api_key_abc123xyz
```

**Configuration:**
```typescript
// ~/.dash/config.yaml
api:
  keys:
    - name: "ci-cd"
      key: "dash_api_key_abc123xyz"
      permissions: ["read", "write"]
    - name: "dashboard"
      key: "dash_api_key_readonly456"
      permissions: ["read"]
```

**Middleware:**
```typescript
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  
  const key = authHeader.slice(7);
  const apiKey = db.prepare('SELECT * FROM api_keys WHERE key = ?').get(key);
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  if (!apiKey.permissions.includes(req.method === 'GET' ? 'read' : 'write')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  req.apiKey = apiKey;
  next();
};
```

### 5.2 POST /api/swarm

**Request Schema (Zod):**
```typescript
const CreateSwarmSchema = z.object({
  name: z.string().min(1).max(100),
  task: z.string().min(1).max(10000),
  initialAgents: z.number().int().min(1).max(100).default(1),
  strategy: z.enum(['parallel', 'map-reduce', 'pipeline', 'tree']).default('parallel'),
  budget: z.object({
    amount: z.number().positive(),
    currency: z.enum(['USD', 'tokens']).default('USD'),
    threshold: z.number().min(0).max(100).default(75)
  }).optional(),
  config: z.object({
    model: z.string().default('claude-sonnet-4-20250514'),
    timeout: z.number().int().min(1000).max(3600000).default(300000),
    maxRetries: z.number().int().min(0).max(10).default(3),
    fileSandbox: z.boolean().default(true),
    allowedPaths: z.array(z.string()).optional(),
    blockedCommands: z.array(z.string()).optional()
  }).default({})
});
```

**Response Schema:**
```typescript
const SwarmResponseSchema = z.object({
  id: z.string().ulid(),
  name: z.string(),
  status: z.enum(['creating', 'active', 'paused', 'completed', 'failed']),
  task: z.string(),
  strategy: z.string(),
  agentCount: z.number().int(),
  budget: z.object({
    allocated: z.number(),
    spent: z.number(),
    currency: z.string(),
    remaining: z.number()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
```

**Example Request:**
```bash
curl -X POST http://localhost:7373/api/swarm \
  -H "Authorization: Bearer dash_api_key_abc123xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "refactor-auth",
    "task": "Refactor authentication module to use JWT tokens",
    "initialAgents": 3,
    "strategy": "parallel",
    "budget": {
      "amount": 50.00,
      "currency": "USD",
      "threshold": 80
    },
    "config": {
      "model": "claude-sonnet-4-20250514",
      "timeout": 600000,
      "fileSandbox": true,
      "allowedPaths": ["/workspace/auth"]
    }
  }'
```

**Example Response (201 Created):**
```json
{
  "id": "01HKX8J3K2M4N5P6Q7R8S9T0UV",
  "name": "refactor-auth",
  "status": "active",
  "task": "Refactor authentication module to use JWT tokens",
  "strategy": "parallel",
  "agentCount": 3,
  "budget": {
    "allocated": 50.00,
    "spent": 0.00,
    "currency": "USD",
    "remaining": 50.00
  },
  "createdAt": "2026-02-02T10:42:01.123Z",
  "updatedAt": "2026-02-02T10:42:01.123Z"
}
```

### 5.3 GET /api/agents/:id

**Response Schema:**
```typescript
const AgentResponseSchema = z.object({
  id: z.string().ulid(),
  name: z.string(),
  status: z.enum(['idle', 'spawning', 'running', 'paused', 'completed', 'failed', 'killed']),
  swarmId: z.string().ulid(),
  parentId: z.string().ulid().nullable(),
  task: z.string(),
  model: z.string(),
  progress: z.object({
    current: z.number().int(),
    total: z.number().int(),
    percentage: z.number().min(0).max(100)
  }),
  cost: z.object({
    promptTokens: z.number().int(),
    completionTokens: z.number().int(),
    totalTokens: z.number().int(),
    amount: z.number()
  }),
  sessionId: z.string().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  retryCount: z.number().int()
});
```

**Example Response (200 OK):**
```json
{
  "id": "01HKX8J3K2M4N5P6Q7R8S9T0UV",
  "name": "jarvis",
  "status": "running",
  "swarmId": "01HKX8J3K2M4N5P6Q7R8S9T0UW",
  "parentId": null,
  "task": "Refactor authentication module to use JWT tokens",
  "model": "claude-sonnet-4-20250514",
  "progress": {
    "current": 3,
    "total": 5,
    "percentage": 60
  },
  "cost": {
    "promptTokens": 1543,
    "completionTokens": 892,
    "totalTokens": 2435,
    "amount": 0.45
  },
  "sessionId": "session_abc123",
  "metadata": {
    "files_modified": ["auth.js", "jwt.ts"],
    "tests_passed": 5
  },
  "createdAt": "2026-02-02T10:42:01.123Z",
  "updatedAt": "2026-02-02T10:45:23.456Z",
  "completedAt": null,
  "retryCount": 0
}
```

### 5.4 WebSocket /events

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:7373/events?token=dash_api_key_abc123xyz');
```

**Query Parameters:**
- `token` (required): API key for authentication
- `filter` (optional): Comma-separated event types to subscribe to
- `since` (optional): ISO timestamp to replay events from

**Event Format:**
```typescript
interface WebSocketEvent {
  id: string;           // ULID
  timestamp: string;    // ISO 8601
  type: 
    | 'agent.spawned'
    | 'agent.started'
    | 'agent.progress'
    | 'agent.completed'
    | 'agent.failed'
    | 'agent.killed'
    | 'agent.paused'
    | 'agent.resumed'
    | 'swarm.created'
    | 'swarm.scaled'
    | 'swarm.completed'
    | 'swarm.destroyed'
    | 'budget.threshold'
    | 'budget.exceeded'
    | 'system.error';
  source: string;       // Agent ID, swarm ID, or 'system'
  data: unknown;        // Type-specific payload
}
```

**Event Payloads:**
```typescript
// agent.spawned
{
  agentId: string;
  name: string;
  swarmId: string;
  parentId?: string;
  task: string;
}

// agent.progress
{
  agentId: string;
  progress: { current: number; total: number; percentage: number };
  cost: { tokens: number; amount: number };
}

// budget.threshold
{
  swarmId: string;
  threshold: number;  // 75, 90, 100
  spent: number;
  allocated: number;
  projected: number;  // Predicted final cost
}
```

**Example Client:**
```typescript
class EventStreamClient {
  private ws: WebSocket;
  private reconnectDelay = 1000;
  
  connect(token: string, filter?: string[]) {
    const params = new URLSearchParams({ token });
    if (filter) params.set('filter', filter.join(','));
    
    this.ws = new WebSocket(`ws://localhost:7373/events?${params}`);
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.emit(data.type, data);
    };
    
    this.ws.onclose = () => {
      setTimeout(() => this.connect(token, filter), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    };
  }
}
```

### 5.5 Error Responses

**Standard Error Format:**
```typescript
const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional()
  })
});
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `RATE_LIMITED` | 429 | Too many requests |
| `CONFLICT` | 409 | Concurrent modification detected |
| `BUDGET_EXCEEDED` | 403 | Budget limit reached |
| `INTERNAL_ERROR` | 500 | Server error |

**Example Error (400 Bad Request):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {
      "field": "initialAgents",
      "issue": "Must be between 1 and 100"
    }
  }
}
```

---

## 6. Database Schema (SQLite)

### 6.1 Table: swarms

```sql
CREATE TABLE swarms (
  id TEXT PRIMARY KEY,              -- ULID
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'active', 'paused', 'completed', 'failed', 'destroyed')),
  task TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('parallel', 'map-reduce', 'pipeline', 'tree')),
  config TEXT NOT NULL,             -- JSON
  budget_allocated REAL NOT NULL,
  budget_spent REAL NOT NULL DEFAULT 0,
  budget_currency TEXT NOT NULL DEFAULT 'USD',
  budget_threshold INTEGER NOT NULL DEFAULT 75,
  agent_count INTEGER NOT NULL DEFAULT 0,
  target_agent_count INTEGER,       -- For auto-scaling
  created_at INTEGER NOT NULL,      -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,  -- For optimistic locking
  
  INDEX idx_swarm_status (status),
  INDEX idx_swarm_updated (updated_at)
) STRICT;
```

### 6.2 Table: agents

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,              -- ULID
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('idle', 'spawning', 'running', 'paused', 'completed', 'failed', 'killed')),
  swarm_id TEXT NOT NULL,
  parent_id TEXT,                   -- For hierarchical relationships
  task TEXT NOT NULL,
  model TEXT NOT NULL,
  
  -- Progress tracking
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  
  -- Cost tracking
  cost_prompt_tokens INTEGER DEFAULT 0,
  cost_completion_tokens INTEGER DEFAULT 0,
  cost_total_tokens INTEGER DEFAULT 0,
  cost_amount REAL DEFAULT 0,
  
  -- OpenClaw integration
  session_id TEXT,
  
  -- Metadata and results
  metadata TEXT,                    -- JSON
  result TEXT,                      -- JSON
  error TEXT,                       -- JSON (error details)
  
  -- Lifecycle
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  
  -- Retry handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Optimistic locking
  version INTEGER NOT NULL DEFAULT 1,
  
  FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES agents(id) ON DELETE SET NULL,
  
  INDEX idx_agent_swarm (swarm_id),
  INDEX idx_agent_status (status),
  INDEX idx_agent_parent (parent_id),
  INDEX idx_agent_session (session_id),
  INDEX idx_agent_updated (updated_at)
) STRICT;
```

### 6.3 Table: events

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,              -- ULID
  timestamp INTEGER NOT NULL,       -- Unix timestamp (ms)
  type TEXT NOT NULL,
  source TEXT NOT NULL,             -- Agent ID, swarm ID, or 'system'
  data TEXT NOT NULL,               -- JSON payload
  
  INDEX idx_event_timestamp (timestamp),
  INDEX idx_event_type (type),
  INDEX idx_event_source (source),
  INDEX idx_event_type_timestamp (type, timestamp)
) STRICT;

-- Time-series optimization: partition by day
CREATE TABLE events_2026_02_02 AS SELECT * FROM events WHERE 0;
```

### 6.4 Table: budgets

```sql
CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'swarm', 'agent', 'task')),
  entity_id TEXT NOT NULL,
  parent_budget_id TEXT,            -- For hierarchical budgets
  
  -- Budget limits
  amount_allocated REAL NOT NULL,
  amount_spent REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Thresholds
  warning_threshold INTEGER DEFAULT 75,   -- Percentage
  critical_threshold INTEGER DEFAULT 90,  -- Percentage
  hard_stop_threshold INTEGER DEFAULT 100, -- Percentage
  
  -- Actions at thresholds
  warning_action TEXT DEFAULT 'notify',   -- notify, pause, none
  critical_action TEXT DEFAULT 'pause',   -- pause, kill, notify, none
  hard_stop_action TEXT DEFAULT 'kill',   -- kill, pause, notify, none
  
  -- Tracking
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_alert_at INTEGER,              -- Prevent alert spam
  
  -- Predictive analysis
  burn_rate REAL,                     -- Cost per minute
  projected_final REAL,               -- Predicted total cost
  
  FOREIGN KEY (parent_budget_id) REFERENCES budgets(id),
  
  INDEX idx_budget_entity (entity_type, entity_id),
  INDEX idx_budget_parent (parent_budget_id)
) STRICT;
```

### 6.5 Table: api_keys

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,      -- SHA-256 hash of key
  permissions TEXT NOT NULL,          -- JSON array: ["read", "write"]
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  is_active INTEGER DEFAULT 1,
  
  INDEX idx_api_key_hash (key_hash)
) STRICT;
```

### 6.6 Table: _migrations

```sql
CREATE TABLE _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  checksum TEXT NOT NULL
);
```

### 6.7 Migration Strategy

**Migration Files:**
```
/migrations/
  001_initial_schema.sql
  002_add_agent_session_id.sql
  003_add_budget_burn_rate.sql
  004_add_api_keys.sql
```

**Migration Runner:**
```typescript
class MigrationRunner {
  async run() {
    const currentVersion = this.getCurrentVersion();
    const migrations = this.loadMigrations();
    
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        await this.applyMigration(migration);
      }
    }
  }
  
  async applyMigration(migration: Migration) {
    const tx = this.db.transaction(() => {
      this.db.exec(migration.sql);
      this.db.prepare(`
        INSERT INTO _migrations (version, name, applied_at, checksum)
        VALUES (?, ?, ?, ?)
      `).run(migration.version, migration.name, Date.now(), migration.checksum);
    });
    
    tx();
  }
}
```

---

## 7. Security Requirements

### 7.1 API Authentication

**API Key Format:**
```
dash_api_key_<random-32-char-base64url>
```

**Storage:**
- Keys stored as SHA-256 hashes in database
- Raw keys shown only once at creation
- Rotation support (create new, deprecate old)

**Implementation:**
```typescript
// Generate new key
function generateApiKey(): { key: string; hash: string } {
  const key = `dash_api_key_${randomBytes(24).toString('base64url')}`;
  const hash = createHash('sha256').update(key).digest('hex');
  return { key, hash };
}

// Verify key
function verifyApiKey(key: string): boolean {
  const hash = createHash('sha256').update(key).digest('hex');
  const record = db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1').get(hash);
  return !!record;
}
```

### 7.2 CORS Configuration

**Allowed Origins (NOT wildcard):**
```typescript
const corsOptions = {
  origin: [
    'http://localhost:3000',           // Local dev
    'http://localhost:5173',           // Vite dev server
    'https://dash.local',              // Local deployment
    'https://dash.company.internal'    // Production internal
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
};

app.use(cors(corsOptions));
```

### 7.3 Rate Limiting

**Configuration:**
```typescript
import rateLimit from 'express-rate-limit';

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // 100 requests per minute
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKey?.id || req.ip
});

// Stricter limit for expensive operations
const spawnLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,              // 10 swarm creations per minute
  skip: (req) => req.apiKey?.name === 'admin'  // Admin bypass
});

app.use('/api/', apiLimiter);
app.use('/api/swarm', spawnLimiter);
```

### 7.4 Input Validation (Zod Schemas)

**Validation Middleware:**
```typescript
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message
          }))
        }
      });
    }
    
    req.validatedBody = result.data;
    next();
  };
}

// Usage
app.post('/api/swarm', 
  validateBody(CreateSwarmSchema),
  (req, res) => {
    // req.validatedBody is typed and validated
  }
);
```

**Security-Focused Schemas:**
```typescript
// Prevent command injection in task descriptions
const SafeTaskSchema = z.string()
  .min(1)
  .max(10000)
  .refine(
    (val) => !/[;&|`$]/.test(val),
    'Task contains potentially dangerous characters'
  );

// Path traversal prevention
const SafePathSchema = z.string()
  .regex(/^[a-zA-Z0-9_\-\/\.]+$/, 'Invalid path format')
  .refine(
    (val) => !val.includes('..'),
    'Path traversal detected'
  );

// Budget limits to prevent overflow
const BudgetSchema = z.object({
  amount: z.number().positive().max(10000),
  currency: z.enum(['USD', 'tokens'])
});
```

### 7.5 File Sandbox Enforcement

**Implementation:**
```typescript
class FileSandbox {
  private allowedPaths: string[];
  private blockedPaths: string[];
  
  constructor(config: SandboxConfig) {
    this.allowedPaths = config.allowedPaths.map(p => resolve(p));
    this.blockedPaths = [
      '/etc', '/usr', '/bin', '/sbin',
      '/root', '/var/log', '/proc', '/sys'
    ];
  }
  
  validatePath(requestedPath: string): boolean {
    const resolved = resolve(requestedPath);
    
    // Check blocked paths
    for (const blocked of this.blockedPaths) {
      if (resolved.startsWith(blocked)) {
        throw new SecurityError(`Access to ${blocked} is blocked`);
      }
    }
    
    // Check allowed paths
    if (this.allowedPaths.length > 0) {
      const isAllowed = this.allowedPaths.some(allowed => 
        resolved.startsWith(allowed)
      );
      if (!isAllowed) {
        throw new SecurityError(`Path ${resolved} is outside allowed directories`);
      }
    }
    
    return true;
  }
  
  // Intercept file operations
  wrapFs(agentId: string): typeof fs {
    const sandbox = this;
    
    return new Proxy(fs, {
      get(target, prop) {
        if (['readFile', 'writeFile', 'access'].includes(prop as string)) {
          return (path: string, ...args: any[]) => {
            sandbox.validatePath(path);
            return (target as any)[prop](path, ...args);
          };
        }
        return (target as any)[prop];
      }
    });
  }
}
```

---

## 8. Performance Requirements

### 8.1 Dashboard Performance

| Scenario | Target | Measurement Method |
|----------|--------|-------------------|
| 50 agents refresh | <100ms | Chrome DevTools performance |
| 100 agents memory | <200MB | `process.memoryUsage()` |
| Initial render | <1s | Time to first frame |
| Keyboard latency | <16ms | Key press to visual update |
| Event processing | <10ms | Event received to state update |
| Re-render batch | 50ms | Batch window for updates |

**Optimization Strategies:**
```typescript
// 1. Virtual scrolling for large lists
function useVirtualList(items: any[], rowHeight: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleCount = Math.ceil(containerHeight / rowHeight);
  const startIndex = Math.floor(scrollTop / rowHeight);
  const endIndex = Math.min(startIndex + visibleCount, items.length);
  
  return {
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    totalHeight: items.length * rowHeight,
    onScroll: setScrollTop
  };
}

// 2. Memoized components
const AgentRow = React.memo(AgentRowComponent, (prev, next) => {
  return prev.agent.version === next.agent.version &&
         prev.selected === next.selected;
});

// 3. Batched updates
class UpdateBatcher {
  private pending: Map<string, any> = new Map();
  private timeout: NodeJS.Timeout | null = null;
  
  queue(id: string, update: any) {
    this.pending.set(id, update);
    
    if (!this.timeout) {
      this.timeout = setTimeout(() => this.flush(), 50);
    }
  }
  
  private flush() {
    const updates = Array.from(this.pending.entries());
    this.pending.clear();
    this.timeout = null;
    
    // Apply all updates in single transaction
    db.transaction(() => {
      for (const [id, update] of updates) {
        this.applyUpdate(id, update);
      }
    })();
  }
}
```

### 8.2 API Latency

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| GET /health | <5ms | <10ms | <20ms |
| GET /api/agents | <20ms | <50ms | <100ms |
| POST /api/swarm | <50ms | <100ms | <200ms |
| WebSocket event | <10ms | <20ms | <50ms |

**Measurement:**
```typescript
// Prometheus-style metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || 'unknown',
        status: res.statusCode
      },
      (Date.now() - start) / 1000
    );
  });
  next();
});
```

### 8.3 SQLite Performance

| Query Type | Target | Index Strategy |
|------------|--------|----------------|
| Agent by ID | <1ms | PRIMARY KEY |
| Agents by swarm | <5ms | INDEX idx_agent_swarm |
| Agents by status | <10ms | INDEX idx_agent_status |
| Recent events | <10ms | INDEX idx_event_timestamp |
| Budget update | <5ms | PRIMARY KEY |

**Optimizations:**
```sql
-- WAL mode for concurrent reads
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Covering index for common queries
CREATE INDEX idx_agent_swarm_status ON agents(swarm_id, status) 
INCLUDE (name, progress_current, progress_total, cost_amount);

-- Partial index for active agents
CREATE INDEX idx_agent_active ON agents(swarm_id) 
WHERE status IN ('spawning', 'running', 'paused');
```

### 8.4 Memory Requirements

| Component | Base | Per Agent | Per Swarm |
|-----------|------|-----------|-----------|
| Dashboard | 50MB | 0.5MB | 0.1MB |
| API Server | 30MB | 0.2MB | 0.05MB |
| SQLite Cache | 20MB | - | - |
| **Total (100 agents)** | **180MB** | | |

---

## 9. Testing Requirements

### 9.1 Unit Tests (>80% Coverage)

**Required Coverage:**
```
File                         | % Stmts | % Branch | % Funcs | % Lines |
-----------------------------|---------|----------|---------|---------|
All files                    |   85.23 |    78.45 |   82.10 |   85.67 |
 src/api                     |   88.50 |    82.00 |   85.00 |   88.50 |
  server.ts                  |   90.00 |    85.00 |   88.00 |   90.00 |
  routes.ts                  |   87.00 |    79.00 |   82.00 |   87.00 |
 src/core                    |   86.00 |    80.00 |   84.00 |   86.00 |
  swarm.ts                   |   85.00 |    78.00 |   82.00 |   85.00 |
  lifecycle.ts               |   88.00 |    83.00 |   86.00 |   88.00 |
 src/storage                 |   90.00 |    85.00 |   88.00 |   90.00 |
  sqlite.ts                  |   92.00 |    88.00 |   90.00 |   92.00 |
 src/safety                  |   92.00 |    88.00 |   90.00 |   92.00 |
  budget.ts                  |   93.00 |    90.00 |   92.00 |   93.00 |
  sandbox.ts                 |   91.00 |    86.00 |   88.00 |   91.00 |
```

**Test Patterns:**
```typescript
// Example: Swarm creation test
describe('POST /api/swarm', () => {
  it('should create swarm with valid data', async () => {
    const response = await request(app)
      .post('/api/swarm')
      .set('Authorization', `Bearer ${testApiKey}`)
      .send({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 3
      });
    
    expect(response.status).toBe(201);
    expect(response.body).toMatchSchema(SwarmResponseSchema);
    expect(response.body.name).toBe('test-swarm');
    expect(response.body.agentCount).toBe(3);
  });
  
  it('should reject invalid agent count', async () => {
    const response = await request(app)
      .post('/api/swarm')
      .set('Authorization', `Bearer ${testApiKey}`)
      .send({
        name: 'test-swarm',
        task: 'Test task',
        initialAgents: 101  // Exceeds max
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

### 9.2 Integration Tests

**OpenClaw Connection:**
```typescript
describe('OpenClaw Integration', () => {
  it('should spawn real OpenClaw session', async () => {
    const agent = await agentManager.spawn({
      name: 'test-agent',
      task: 'echo "Hello World"',
      model: 'claude-sonnet-4-20250514'
    });
    
    expect(agent.sessionId).toBeDefined();
    
    // Verify session exists in OpenClaw
    const session = await openclaw.sessionsDescribe(agent.sessionId);
    expect(session.status).toBe('running');
    
    // Cleanup
    await agentManager.kill(agent.id);
  });
  
  it('should receive token usage events', async () => {
    const events: TokenEvent[] = [];
    
    bus.subscribe('agent.*.tokens', (event) => {
      events.push(event);
    });
    
    await agentManager.spawn({
      name: 'test-agent',
      task: 'Simple task'
    });
    
    await waitFor(() => events.length > 0, { timeout: 30000 });
    
    expect(events[0]).toMatchObject({
      type: 'agent.tokens.used',
      data: {
        promptTokens: expect.any(Number),
        completionTokens: expect.any(Number)
      }
    });
  });
});
```

### 9.3 E2E Tests

**Full Workflow:**
```typescript
describe('E2E: Complete Workflow', () => {
  it('should create swarm, spawn agents, complete task, cleanup', async () => {
    // 1. Create swarm
    const swarm = await api.swarm.create({
      name: 'e2e-test',
      task: 'Calculate fibonacci(10)',
      initialAgents: 2,
      budget: { amount: 1.00 }
    });
    
    // 2. Wait for agents to spawn
    await waitFor(async () => {
      const agents = await api.agents.list({ swarmId: swarm.id });
      return agents.length === 2;
    }, { timeout: 10000 });
    
    // 3. Wait for completion
    await waitFor(async () => {
      const status = await api.swarm.status(swarm.id);
      return status.status === 'completed';
    }, { timeout: 60000 });
    
    // 4. Verify results
    const agents = await api.agents.list({ swarmId: swarm.id });
    expect(agents.every(a => a.status === 'completed')).toBe(true);
    
    // 5. Verify budget tracking
    const budget = await api.budget.get(swarm.id);
    expect(budget.spent).toBeGreaterThan(0);
    expect(budget.spent).toBeLessThanOrEqual(budget.allocated);
    
    // 6. Cleanup
    await api.swarm.destroy(swarm.id);
  });
});
```

### 9.4 Stress Tests

**50 Concurrent Agents:**
```typescript
describe('Stress: 50 Concurrent Agents', () => {
  it('should handle 50 agents without race conditions', async () => {
    const swarm = await api.swarm.create({
      name: 'stress-test',
      task: 'Simple computation',
      initialAgents: 50,
      budget: { amount: 50.00 }
    });
    
    const startTime = Date.now();
    
    // Monitor for race conditions
    const violations: string[] = [];
    const seenStatuses = new Map<string, string[]>();
    
    bus.subscribe('agent.*.status', (event) => {
      const history = seenStatuses.get(event.source) || [];
      history.push(event.data.status);
      seenStatuses.set(event.source, history);
      
      // Check for invalid transitions
      const lastStatus = history[history.length - 2];
      const newStatus = event.data.status;
      
      if (!isValidTransition(lastStatus, newStatus)) {
        violations.push(`${event.source}: ${lastStatus} -> ${newStatus}`);
      }
    });
    
    // Wait for all agents to complete
    await waitFor(async () => {
      const agents = await api.agents.list({ swarmId: swarm.id });
      return agents.every(a => ['completed', 'failed'].includes(a.status));
    }, { timeout: 300000 });
    
    const duration = Date.now() - startTime;
    
    // Assertions
    expect(violations).toHaveLength(0);
    expect(duration).toBeLessThan(300000); // 5 minutes
    
    // Verify no data corruption
    const agents = await api.agents.list({ swarmId: swarm.id });
    const uniqueIds = new Set(agents.map(a => a.id));
    expect(uniqueIds.size).toBe(50); // No duplicates
    
    // Verify budget accuracy
    const budget = await api.budget.get(swarm.id);
    const calculatedSpent = agents.reduce((sum, a) => sum + a.cost.amount, 0);
    expect(Math.abs(budget.spent - calculatedSpent)).toBeLessThan(0.01);
  });
});
```

---

## 10. Implementation Phases

### Phase 1: Core Foundation (Weeks 1-2)

**Goal:** Working TUI, API, and persistence

| Task | Owner | Duration | Deliverable |
|------|-------|----------|-------------|
| SQLite schema + migrations | Friday | 2 days | Migrations 001-004 |
| Express API server | Friday | 2 days | All endpoints working |
| OpenTUI dashboard scaffold | Wanda | 3 days | Basic layout, navigation |
| Agent grid component | Wanda | 2 days | Virtual scrolling, selection |
| Event stream component | Friday | 2 days | ScrollBox, auto-scroll |
| WebSocket event server | Friday | 2 days | Real-time updates |
| Integration tests | Shuri | 2 days | OpenClaw connection tests |

**Phase 1 Exit Criteria:**
- [ ] Dashboard launches and shows live data
- [ ] API responds with <50ms latency
- [ ] Data persists across restarts
- [ ] 50 agents can be created via API
- [ ] All integration tests pass

### Phase 2: Polish & Hardening (Weeks 3-4)

**Goal:** Production-ready security, performance, reliability

| Task | Owner | Duration | Deliverable |
|------|-------|----------|-------------|
| API key authentication | Friday | 2 days | Auth middleware, key management |
| Rate limiting | Friday | 1 day | Express rate limit middleware |
| Input validation (Zod) | Shuri | 2 days | All endpoints validated |
| File sandbox enforcement | Friday | 2 days | Path validation, fs proxy |
| Race condition fixes | Friday | 2 days | Optimistic locking, transactions |
| Predictive budget warnings | Friday | 2 days | Burn rate calculation |
| Performance optimization | Wanda | 2 days | <100ms refresh target |
| E2E test suite | Shuri | 2 days | Full workflow tests |
| Stress tests | Shuri | 2 days | 50 agent concurrency test |

**Phase 2 Exit Criteria:**
- [ ] Security audit passes (no injection vulnerabilities)
- [ ] Rate limiting enforced
- [ ] Race condition test passes
- [ ] Performance targets met
- [ ] 80% test coverage

### Phase 3: Advanced Features (Week 5+)

**Goal:** Intelligence and enterprise features

| Task | Owner | Duration | Deliverable |
|------|-------|----------|-------------|
| Complete swarm strategies | Friday | 3 days | Map-reduce, pipeline, tree |
| Escalation with context | Friday | 2 days | Learning from escalations |
| Agent tree command | Friday | 1 day | Hierarchical view |
| PostgreSQL backend | Friday | 3 days | Alternative to SQLite |
| Web dashboard (optional) | Wanda | 5 days | Browser-based view |
| Plugin architecture | Friday | 5 days | Extension system |

---

## Appendix A: Directory Structure

```
/Users/jasontang/clawd/projects/dash/
├── src/
│   ├── api/                    # Express REST API
│   │   ├── server.ts           # Server setup
│   │   ├── routes.ts           # Route definitions
│   │   ├── middleware/         # Auth, rate limiting, validation
│   │   └── websocket.ts        # WebSocket event server
│   ├── cli/                    # CLI commands
│   │   ├── commands/           # Individual commands
│   │   └── dashboard.ts        # OpenTUI dashboard entry
│   ├── core/                   # Core orchestration logic
│   │   ├── swarm.ts            # Swarm management
│   │   ├── lifecycle.ts        # Agent lifecycle
│   │   └── strategies/         # Swarm strategies
│   ├── dashboard/              # OpenTUI dashboard components
│   │   ├── App.tsx             # Main app component
│   │   ├── components/         # AgentGrid, EventStream, etc.
│   │   ├── hooks/              # useAgents, useEvents, etc.
│   │   └── keybindings.ts      # Keyboard shortcut handlers
│   ├── storage/                # Persistence layer
│   │   ├── interface.ts        # Storage interface
│   │   ├── sqlite.ts           # SQLite implementation
│   │   └── migrations/         # Database migrations
│   ├── safety/                 # Security and safety
│   │   ├── budget.ts           # Budget tracking
│   │   ├── sandbox.ts          # File sandbox
│   │   └── approval.ts         # Approval gates
│   ├── bus/                    # Event bus
│   └── types/                  # TypeScript types
├── migrations/                 # SQL migrations
│   ├── 001_initial_schema.sql
│   ├── 002_add_agent_session_id.sql
│   └── ...
├── tests/
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   ├── e2e/                    # End-to-end tests
│   └── stress/                 # Load tests
├── package.json
├── tsconfig.json
└── PRD_v3.md                   # This document
```

---

## Appendix B: Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASH_PORT` | 7373 | API server port |
| `DASH_DB_PATH` | `/var/lib/dash/dash.db` | SQLite database path |
| `DASH_LOG_LEVEL` | `info` | Logging level |
| `DASH_MAX_AGENTS` | 100 | Maximum agents per swarm |
| `DASH_RATE_LIMIT` | 100 | Requests per minute |
| `DASH_WS_HEARTBEAT` | 30000 | WebSocket heartbeat interval (ms) |
| `OPENCLAW_GATEWAY_URL` | - | OpenClaw gateway URL |
| `OPENCLAW_API_KEY` | - | OpenClaw API key |

---

*Document Version: 3.0.0*  
*Last Updated: 2026-02-02*  
*Status: Ready for Implementation*
