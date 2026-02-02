# Dash Orchestrator Platform - Technical Specification

**Version:** 2.0  
**Date:** 2026-02-02  
**Status:** Draft  
**Target:** CLI/OpenTUI-first, API-native agent orchestration

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────┐
│           Dash Orchestrator Platform              │
└────────────────────────────────────────────────┘
                           │
        ┌────────────────────────────────────────────┐
        │              CLI Layer                     │
        │  dash swarm create                       │
        │  dash dashboard                          │
        │  dash agents spawn                       │
        └────────────────────────────────────────────┘
                           │
        ┌────────────────────────────────────────────┐
        │           OpenTUI Dashboard                │
        │  ┌───────────────┐ ┌───────────────┐     │
        │  │ Agent Grid    │ │ Event Stream  │     │
        │  │ (htop-style)  │ │ (tail -f)     │     │
        │  └───────────────┘ └───────────────┘     │
        │  ┌───────────────┐ ┌───────────────┐     │
        │  │ Budget Panel  │ │ Command Bar   │     │
        │  │ (sparklines)  │ │ (vim-style)   │     │
        │  └───────────────┘ └───────────────┘     │
        └────────────────────────────────────────────┘
                           │
        ┌────────────────────────────────────────────┐
        │              API Layer                      │
        │  REST endpoints + WebSocket events          │
        │  Agent↔Agent message bus                    │
        └────────────────────────────────────────────┘
                           │
        ┌────────────────────────────────────────────┐
        │            Core Engine                       │
        │  Swarm Manager │ Budget Controller │ Safety   │
        │  Agent Lifecycle │ Event Bus │ Storage      │
        └────────────────────────────────────────────┘
                           │
        ┌────────────────────────────────────────────┐
        │          OpenClaw Integration              │
        │  sessions_spawn, sessions_list, etc.      │
        └────────────────────────────────────────────┘
```

---

## 2. Component Specifications

### 2.1 Swarm Manager

**Responsibilities:**
- Create/destroy swarms
- Manage agent lifecycle within swarms
- Implement scaling strategies
- Handle swarm-wide events

**Interface:**
```typescript
interface SwarmManager {
  create(config: SwarmConfig): Swarm;
  destroy(swarmId: string): void;
  scale(swarmId: string, targetSize: number): Promise<void>;
  getStatus(swarmId: string): SwarmStatus;
  on(event: SwarmEvent, handler: Function): void;
}

interface SwarmConfig {
  name: string;
  task: string;
  initialAgents: number;
  maxAgents: number;
  strategy: SwarmStrategy;
  budget?: BudgetConfig;
  safety?: SafetyConfig;
}

type SwarmStrategy = 'parallel' | 'map-reduce' | 'pipeline' | 'tree';
```

**Events:**
```typescript
type SwarmEvent = 
  | 'swarm.created'
  | 'swarm.scaled'
  | 'swarm.completed'
  | 'swarm.failed'
  | 'swarm.budget.warning'
  | 'swarm.budget.critical';
```

### 2.2 Agent Lifecycle Manager

**States:**
```
IDLE → SPAWNING → RUNNING → COMPLETED
                    ↓
              PAUSED ↔ RETRYING
                    ↓
                 FAILED
                    ↓
               ESCALATED
```

**Auto-recovery flow:**
1. Agent fails
2. Retry with same config (delay: 2^attempt * 1000ms)
3. If retries exhausted, try alternate model
4. If alternate fails, escalate to orchestrator
5. Orchestrator decides: retry/kill/escalate

**Interface:**
```typescript
interface AgentLifecycle {
  spawn(config: AgentConfig): Agent;
  pause(agentId: string): void;
  resume(agentId: string): void;
  kill(agentId: string): void;
  retry(agentId: string, options?: RetryOptions): void;
  getState(agentId: string): AgentState;
}
```

### 2.3 OpenTUI Dashboard

**Panels:**

#### Agent Grid
- VirtualList for performance with 1000+ agents
- Columns: ID, Status, Task, Progress, Tokens, Cost
- Grouping by status
- Keyboard navigation (j/k)

#### Event Stream
- VirtualList with auto-scroll
- Filter by agent/type/severity
- Search with `/`
- Export to file

#### Budget Panel
- Real-time token/cost counters
- Sparkline: burn rate over last hour
- Progress bar: budget consumed
- Alert indicators

#### Command Bar
- Fuzzy search all commands
- Recent commands history
- Tab completion

**Keyboard Shortcuts:**
```
j/k         Navigate agents
Enter       Focus agent
Space       Pause/resume
x           Kill
r           Retry
:           Command palette
/           Search
?           Help
q           Quit
```

### 2.4 Message Bus

**Topics:**
```
agent.{id}.commands    # Control messages to agent
agent.{id}.events      # Status updates from agent
agent.{id}.logs        # Log output
swarm.{id}.broadcast   # All agents in swarm
task.{type}.updates    # Type-specific updates
system.alerts          # System-wide alerts
```

**Interface:**
```typescript
interface MessageBus {
  publish(topic: string, message: Message): void;
  subscribe(topic: string, handler: MessageHandler): Subscription;
  unsubscribe(subscription: Subscription): void;
}
```

### 2.5 Budget Controller

**Hierarchical Budgets:**
```
Swarm Budget: $50
├── Agent 1: $10 (20%)
│   └── Sub-agent 1.1: $3 (30% of parent's $10)
├── Agent 2: $10
└── Reserve: $30 (60%)
```

**Enforcement:**
- Track tokens in + tokens out + estimated cost
- Warning at 75%: log + dashboard indicator
- Critical at 90%: notification + suggest pause
- Hard stop at 100%: auto-pause all agents
- Overrun: require explicit approval per $1

**Interface:**
```typescript
interface BudgetController {
  allocate(swarmId: string, amount: number): Budget;
  consume(agentId: string, tokens: number, cost: number): void;
  getRemaining(agentId: string): number;
  onThreshold(threshold: number, handler: Function): void;
}
```

### 2.6 Safety Guardrails

**Sandbox Rules:**
- File scope: Agents can't write outside their context directory
- Network: Only allowlisted domains
- Commands: Block list of dangerous patterns
- Time: Max execution time per agent

**Approval Gates:**
- File writes to protected paths
- Network requests to new domains
- Commands matching dangerous patterns
- Budget overruns

**Pattern Detection:**
```typescript
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  /curl.*\|.*bash/,           // curl | bash
  />\s*\/etc\/\w+/,           // Write to /etc
  /eval\s*\(.*\)/,            // eval()
];
```

---

## 3. API Specification

### 3.1 REST Endpoints

```
POST   /api/swarm              Create swarm
GET    /api/swarm/:id          Get swarm status
DELETE /api/swarm/:id          Destroy swarm
POST   /api/swarm/:id/scale    Scale swarm

GET    /api/agents             List agents
POST   /api/agents             Spawn agent
GET    /api/agents/:id         Get agent status
POST   /api/agents/:id/pause   Pause agent
POST   /api/agents/:id/resume  Resume agent
POST   /api/agents/:id/kill    Kill agent

GET    /api/events             Get events (SSE)
GET    /api/budget/:id         Get budget status
```

### 3.2 WebSocket Events

```javascript
// Client connects
const ws = new WebSocket('ws://localhost:7373/events');

// Receive events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // { type: 'agent.progress', agentId: '...', payload: {...} }
};

// Subscribe to specific topics
ws.send(JSON.stringify({
  action: 'subscribe',
  topics: ['agent.*.events', 'swarm.my-swarm.*']
}));
```

---

## 4. Storage

### 4.1 Data Model

```typescript
interface Swarm {
  id: string;
  name: string;
  status: SwarmStatus;
  config: SwarmConfig;
  agents: string[];
  createdAt: Date;
  completedAt?: Date;
  budget: Budget;
}

interface Agent {
  id: string;
  swarmId: string;
  status: AgentState;
  task: string;
  model: string;
  parentId?: string;        // For recursive delegation
  children: string[];
  tokens: TokenUsage;
  cost: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface Event {
  id: string;
  timestamp: Date;
  type: EventType;
  agentId?: string;
  swarmId?: string;
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metadata?: Record<string, any>;
}
```

### 4.2 Storage Backends

**Default:** File-based (SQLite)
- Location: `~/.dash/db.sqlite`
- Good for single orchestrator

**Future:** PostgreSQL, Redis for scale

---

## 5. Integration with OpenClaw

### 5.1 Agent Spawning

```typescript
async function spawnAgent(config: AgentConfig): Promise<Agent> {
  // Create OpenClaw session
  const session = await sessions_spawn({
    label: `dash-agent-${config.id}`,
    model: config.model,
    task: config.task
  });
  
  // Monitor via event bus
  messageBus.subscribe(`agent.${config.id}.events`, (event) => {
    updateAgentStatus(config.id, event);
  });
  
  return createAgentRecord(config, session);
}
```

### 5.2 Session Monitoring

- Poll session status every 5 seconds
- Stream session messages to event bus
- Track token usage from session metrics
- Detect completion/failure

---

## 6. Configuration

### 6.1 Config File

```yaml
# ~/.dash/config.yaml

# Default settings
defaults:
  model: kimi-k2.5
  maxAgents: 50
  budget:
    default: 50
    currency: USD
  
# Safety settings
safety:
  fileSandbox: true
  networkAllowlist:
    - github.com
    - npmjs.org
  commandBlacklist:
    - rm -rf /
    - curl | bash
  
# Dashboard settings
dashboard:
  refreshRate: 1000  # ms
  defaultView: grid
  
# API server
api:
  port: 7373
  host: localhost
```

### 6.2 Environment Variables

```bash
DASH_CONFIG=/path/to/config.yaml
DASH_DB_PATH=/path/to/db.sqlite
DASH_API_PORT=7373
DASH_LOG_LEVEL=info
NO_COLOR=1  # Disable colored output
```

---

## 7. Error Handling

### 7.1 Error Categories

| Code | Category | Action |
|------|----------|--------|
| E001 | Agent spawn failed | Retry with backoff |
| E002 | Agent crashed | Auto-retry, then escalate |
| E003 | Budget exceeded | Pause swarm, notify |
| E004 | Safety violation | Block, create approval |
| E005 | Network error | Retry with exponential backoff |
| E006 | Timeout | Mark failed, escalate |

### 7.2 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Agent spawn failed |
| 4 | Budget exceeded |
| 5 | Safety violation blocked |
| 6 | Timeout |

---

## 8. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Swarm creation | < 5s | 20 agents |
| Dashboard refresh | < 100ms | 50 agents |
| Event latency | < 50ms | End-to-end |
| Memory usage | < 200MB | Dashboard + API |
| Max agents | 100 | Per swarm |
| Max swarms | 10 | Concurrent |

---

## 9. Security Considerations

### 9.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| Agent escapes sandbox | File scope enforcement |
| Malicious command injection | Pattern detection + whitelist |
| Budget drain attack | Hard limits + rate limiting |
| Token leakage | Secure storage, no logging |

### 9.2 Audit Logging

All actions logged with:
- Timestamp
- Actor (orchestrator/agent ID)
- Action type
- Result
- Metadata

---

## 10. Development Roadmap

### Phase 1: Core (Weeks 1-4)
- [ ] Swarm Manager
- [ ] Agent Lifecycle
- [ ] Basic OpenTUI dashboard
- [ ] File-based storage

### Phase 2: Intelligence (Weeks 5-8)
- [ ] Auto-scaling
- [ ] Self-healing
- [ ] Message bus
- [ ] Advanced dashboard

### Phase 3: Scale (Weeks 9-12)
- [ ] Swarm strategies
- [ ] Plugin system
- [ ] PostgreSQL backend
- [ ] Web dashboard (optional)

---

*SPEC Version: 2.0*  
*Last Updated: 2026-02-02*
