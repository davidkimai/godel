# OpenClaw Integration Roadmap - SPEC.md

**Date:** 2026-02-02  
**Version:** 1.0  
**Status:** Draft - Ready for Review  
**Author:** Dash Orchestrator + Interview Analysis  

---

## Executive Summary

This document defines the comprehensive integration roadmap for **Dash v2.0** to integrate with **OpenClaw** - transforming Dash into a multi-agent orchestrator that leverages OpenClaw's 12+ messaging channels, session management, tool ecosystem, and skill platform.

**Vision:** Dash becomes the orchestrator layer on top of OpenClaw, enabling:
- Parallel agent spawning across OpenClaw sessions
- Cross-channel task distribution via OpenClaw's routing
- Access to OpenClaw's tool ecosystem (browser, canvas, nodes, cron, etc.)
- Skill distribution through ClawHub integration
- Recursive self-improvement using OpenClaw infrastructure

**Key Metrics:**
- Target: Orchestrate 10-50+ concurrent agents across multiple channels
- Timeline: 4 phases over 8-12 weeks
- Budget: TBD based on Phase 1 findings

---

## 1. Problem Statement

### 1.1 Current State

**Dash v2.0:**
- ✅ Agent spawning infrastructure (swarms, agents, budget tracking)
- ✅ Self-improvement orchestrator (swarm-based improvement cycles)
- ✅ CLI commands for swarm/agent management
- ❌ No execution engine (agents spawn but don't work)
- ❌ No messaging channel integration
- ❌ No access to OpenClaw's tool ecosystem
- ❌ No skill platform integration

**OpenClaw:**
- ✅ Gateway WS control plane (ws://127.0.0.1:18789)
- ✅ 12+ messaging channels (WhatsApp, Telegram, Discord, iMessage, etc.)
- ✅ Session management (sessions_list, sessions_history, sessions_send, sessions_spawn)
- ✅ Rich tool ecosystem (browser, canvas, nodes, cron, webhook)
- ✅ Skills platform (ClawHub, SKILL.md format)
- ✅ Multi-agent routing and isolation
- ✅ Security and sandboxing

### 1.2 The Gap

Dash has the orchestration logic but lacks:
1. **Execution layer** - How spawned agents actually do work
2. **Channel access** - No way to receive platforms
3. **Tool access**/respond on messaging - Can't use browser, nodes, canvas, cron
4. **Persistence** - No session state management

OpenClaw has all of the above but lacks:
1. **High-level orchestration** - No swarm management, budget tracking
2. **Self-improvement** - No recursive improvement cycles
3. **Strategic planning** - No multi-phase improvement workflows

### 1.3 The Solution

Integrate Dash with OpenClaw so Dash becomes the orchestration brain while OpenClaw provides:
- Execution runtime (sessions)
- Channel connectivity
- Tool access
- Persistence
- Skills platform

---

## 2. Architecture Overview

### 2.1 High-Level Integration Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        DASH ORCHESTRATOR                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Swarm Mgr   │  │ Budget Trk  │  │ Self-Improve Engine     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Agent Pool  │  │ Task Queue  │  │ Verification Pipeline   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ OpenClaw Gateway WS API
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OPENCLAW GATEWAY                           │
│  ws://127.0.0.1:18789                                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Session Manager: sessions_list, sessions_send,           │   │
│  │               sessions_spawn, sessions_history           │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Channel Manager: WhatsApp, Telegram, Discord, iMessage,  │   │
│  │                 Slack, Signal, WebChat, etc.             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Tool Registry: browser, canvas, nodes, cron, webhook,    │   │
│  │                exec, read, write, edit, etc.             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Integration Points

| Dash Component | OpenClaw Integration | Protocol |
|---------------|---------------------|----------|
| Swarm Manager | sessions_spawn | WS Request |
| Agent Pool | sessions_list | WS Request |
| Task Queue | sessions_send | WS Request |
| Budget Tracker | Usage tracking via sessions_history | WS Request |
| Self-Improve | Webhook + sessions_spawn | WS + HTTP |
| Verification | Agent execution + sessions_history | WS Request |

### 2.3 Data Flow

**Normal Orchestration:**
1. User → Dash CLI/API: "Create swarm for code review"
2. Dash → OpenClaw: sessions_spawn (create sub-agents)
3. OpenClaw → Dash: runId, agent status
4. Dash → OpenClaw: sessions_send (dispatch tasks)
5. OpenClaw → Agents: Execute with tools
6. Agents → OpenClaw: results, logs
7. OpenClaw → Dash: sessions_history (track progress)
8. Dash → User: Swarm status, results

**Self-Improvement Cycle:**
1. Dash → OpenClaw: Spawn analysis agents
2. Analysis → Dash: findings report
3. Dash → OpenClaw: Spawn improvement agents
4. Improvements → Dash: verification results
5. Dash → OpenClaw: Apply changes via exec/write tools
6. OpenClaw → Git: commit improvements

---

## 3. Functional Requirements

### 3.1 Phase 1: Gateway Connection (Week 1-2)

**F1.1: OpenClaw Gateway Client**
```
As Dash, I need to connect to the OpenClaw Gateway WS API
So that I can issue commands and receive events

Requirements:
- Connect to ws://127.0.0.1:18789 (configurable)
- Authenticate via token (OPENCLAW_GATEWAY_TOKEN)
- Handle reconnection on disconnect
- Subscribe to events (agent, chat, presence, tick)
- Send requests with idempotency keys

Acceptance Criteria:
- [ ] Gateway connection established within 2s
- [ ] Authentication succeeds with valid token
- [ ] Reconnection within 5s of disconnect
- [ ] Event subscription works for all event types
- [ ] Request/response cycle < 100ms latency
```

**F1.2: Session Management**
```
As Dash, I need to list, create, and manage OpenClaw sessions
So that I can spawn and coordinate sub-agents

Requirements:
- sessions_list: List all active sessions
- sessions_history: Fetch transcript for a session
- sessions_send: Send message to a session
- sessions_spawn: Create new isolated session

Acceptance Criteria:
- [ ] List sessions with full metadata (model, tokens, lastActive)
- [ ] Fetch 100+ message history in < 1s
- [ ] Send message receives ack within 500ms
- [ ] Spawn session creates isolated context in < 2s
```

**F1.3: Basic Orchestration**
```
As Dash, I need to spawn sub-agents and coordinate their work
So that I can execute parallel tasks

Requirements:
- Spawn agents with specific models and tasks
- Track agent status (idle, running, completed, failed)
- Send work to agents and receive results
- Handle agent failures and retries

Acceptance Criteria:
- [ ] Spawn 10 agents in < 5s total
- [ ] Track status with < 1s refresh
- [ ] Send task receives response in < 30s (model-dependent)
- [ ] Retry on failure with exponential backoff
```

### 3.2 Phase 2: Tool Integration (Week 3-4)

**F2.1: Tool Access via Sessions**
```
As spawned Dash agents, I need access to OpenClaw tools
So that I can execute real work (file operations, browser, etc.)

Requirements:
- Use browser tool for web automation
- Use canvas tool for UI rendering
- Use nodes tool for device actions (camera, screen)
- Use exec tool for shell commands
- Use read/write/edit for file operations

Acceptance Criteria:
- [ ] Browser navigation works for any URL
- [ ] Canvas renders HTML and accepts A2UI commands
- [ ] Camera snap/clip accessible via nodes
- [ ] Exec runs commands and returns output
- [ ] File operations work for workspace files
```

**F2.2: Tool Result Capture**
```
As Dash orchestrator, I need to capture tool results from agents
So that I can verify execution and use outputs

Requirements:
- Capture stdout/stderr from exec
- Capture screenshots from browser
- Capture file changes from write/edit
- Capture structured data from API calls

Acceptance Criteria:
- [ ] Tool results captured in < 500ms of completion
- [ ] Results stored with runId and timestamp
- [ ] Large outputs (>1MB) handled via streaming
- [ ] Error outputs captured with stack traces
```

**F2.3: Tool Permission Management**
```
As Dash, I need to manage tool permissions per agent
So that I can enforce security boundaries

Requirements:
- Allowlist/denylist tools per agent
- Sandbox dangerous tools (exec, browser)
- Audit tool usage for compliance
- Revoke permissions mid-execution if needed

Acceptance Criteria:
- [ ] Tool whitelist applied at session spawn
- [ ] Sandbox execution for exec/browser
- [ ] Complete audit log of tool usage
- [ ] Permission revocation takes effect < 1s
```

### 3.3 Phase 3: Channel Integration (Week 5-6)

**F3.1: Multi-Channel Task Distribution**
```
As Dash, I need to route tasks across OpenClaw channels
So that I can use different channels for different purposes

Requirements:
- Route tasks to specific channels (Telegram, WhatsApp, etc.)
- Aggregate responses from multiple channels
- Handle channel-specific constraints (length, media)
- Fallback on channel failure

Acceptance Criteria:
- [ ] Task routed to 3+ channels in parallel
- [ ] Response aggregated within 5s
- [ ] Channel failure detected in < 3s
- [ ] Fallback to secondary channel on failure
```

**F3.2: Channel-Specific Optimization**
```
As Dash, I need channel-specific optimization
So that I maximize effectiveness per channel

Requirements:
- Markdown rendering for rich text channels
- Media handling for image/audio channels
- Chunking for length-limited channels
- Emoji/mention handling per platform

Acceptance Criteria:
- [ ] Markdown → channel-specific HTML
- [ ] Images uploaded with proper type
- [ ] Long messages chunked appropriately
- [ ] Mentions formatted per platform
```

**F3.3: Group Chat Coordination**
```
As Dash, I need to coordinate agents in group chats
So that multiple agents can collaborate on tasks

Requirements:
- Assign agents to group topics/threads
- Manage agent participation (join/leave)
- Thread-based conversation isolation
- @mention coordination

Acceptance Criteria:
- [ ] 5+ agents in single group chat
- [ ] Thread isolation per sub-task
- [ ] @mention routing works correctly
- [ ] Conversation history preserved per thread
```

### 3.4 Phase 4: Skills & Self-Improvement (Week 7-8)

**F4.1: ClawHub Integration**
```
As Dash, I need to publish and use skills from ClawHub
So that I can extend agent capabilities

Requirements:
- Search ClawHub for skills
- Install skills to workspace
- Configure skill parameters
- Publish Dash-specific skills

Acceptance Criteria:
- [ ] Search returns 100+ skills in < 2s
- [ ] Install completes in < 10s
- [ ] Skill configuration via env/config
- [ ] Publish new skill in < 30s
```

**F4.2: Recursive Self-Improvement**
```
As Dash, I need to use OpenClaw to improve itself
So that I can achieve recursive self-improvement

Requirements:
- Spawn analysis agents to evaluate Dash
- Generate improvement recommendations
- Apply improvements via file operations
- Verify improvements via tests
- Commit changes via git

Acceptance Criteria:
- [ ] Analysis completes in < 5min
- [ ] 3+ improvement recommendations generated
- [ ] Improvements applied without errors
- [ ] Verification tests pass
- [ ] Changes committed with descriptive messages
```

**F4.3: Learning Loop**
```
As Dash, I need to track what works across improvements
So that future improvements are more effective

Requirements:
- Track improvement success/failure rates
- Identify patterns in successful improvements
- Prioritize high-success strategies
- A/B test improvement approaches

Acceptance Criteria:
- [ ] 90%+ accuracy in predicting improvement success
- [ ] Strategy selection improves over time
- [ ] A/B test completion in < 1 hour
- [ ] Learning incorporated in next cycle
```

---

## 4. Technical Specifications

### 4.1 Gateway Protocol

**Connection:**
```typescript
interface GatewayConfig {
  host: string;          // default: '127.0.0.1'
  port: number;          // default: 18789
  token?: string;        // from OPENCLAW_GATEWAY_TOKEN
  reconnectDelay: number; // default: 1000
  maxRetries: number;    // default: 10
}

interface ConnectParams {
  auth?: {
    token: string;
  };
  clientId?: string;
  sessionId?: string;
}
```

**Requests:**
```typescript
interface Request {
  type: 'req';
  id: string;            // idempotency key
  method: string;
  params: Record<string, unknown>;
}

interface Response {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

**Events:**
```typescript
interface Event {
  type: 'event';
  event: string;         // 'agent', 'chat', 'presence', 'tick', etc.
  payload: unknown;
  seq?: number;
  stateVersion?: number;
}
```

### 4.2 Session Management API

**sessions_list:**
```typescript
interface SessionsListParams {
  activeMinutes?: number;  // filter by activity
  kinds?: string[];        // 'main', 'group', 'thread'
}

interface SessionsListResponse {
  sessions: SessionInfo[];
}

interface SessionInfo {
  key: string;
  id: string;
  model: string;
  provider: string;
  updatedAt: string;
  inputTokens: number;
  outputTokens: number;
  status: 'active' | 'idle' | 'stale';
}
```

**sessions_spawn:**
```typescript
interface SessionsSpawnParams {
  model?: string;              // default: configured default
  thinking?: string;           // 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  verbose?: boolean;
  workspace?: string;
  skills?: string[];
  systemPrompt?: string;
  sandbox?: {
    mode: 'non-main' | 'docker';
    allowedTools?: string[];
    deniedTools?: string[];
  };
}

interface SessionsSpawnResponse {
  sessionKey: string;
  sessionId: string;
}
```

**sessions_send:**
```typescript
interface SessionsSendParams {
  sessionKey: string;
  message: string;
  attachments?: Attachment[];
  replyTo?: string;
}

interface SessionsSendResponse {
  runId: string;
  status: 'accepted';
}
```

### 4.3 Dash → OpenClaw Integration

**Gateway Client:**
```typescript
class OpenClawGatewayClient {
  private ws: WebSocket;
  private pending: Map<string, PendingRequest>;
  private eventHandlers: Map<string, EventHandler[]>;

  async connect(config: GatewayConfig): Promise<void>;
  async disconnect(): Promise<void>;
  async request<T>(method: string, params: Record<string, unknown>): Promise<T>;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
}
```

**Session Manager:**
```typescript
class OpenClawSessionManager {
  private client: OpenClawGatewayClient;

  async list(params?: SessionsListParams): Promise<SessionInfo[]>;
  async spawn(params?: SessionsSpawnParams): Promise<SessionsSpawnResponse>;
  async send(sessionKey: string, message: string): Promise<SessionsSendResponse>;
  async history(sessionKey: string, limit?: number): Promise<Message[]>;
  async kill(sessionKey: string): Promise<void>;
}
```

**Agent Lifecycle:**
```typescript
interface AgentExecution {
  sessionKey: string;
  status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed' | 'killed';
  runId?: string;
  model: string;
  task: string;
  startedAt: Date;
  completedAt?: Date;
  results?: AgentResult[];
  error?: string;
}

interface AgentResult {
  tool: string;
  input: unknown;
  output: unknown;
  duration: number;
  success: boolean;
  error?: string;
}
```

### 4.4 Tool Integration

**Tool Executor:**
```typescript
class OpenClawToolExecutor {
  private sessionKey: string;
  private client: OpenClawGatewayClient;

  async exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  async read(filePath: string): Promise<string>;
  async write(filePath: string, content: string): Promise<void>;
  async edit(filePath: string, oldText: string, newText: string): Promise<void>;
  async browser(action: BrowserAction): Promise<BrowserResult>;
  async canvas(action: CanvasAction): Promise<CanvasResult>;
  async nodes(action: NodeAction): Promise<NodeResult>;
}
```

### 4.5 Budget Tracking Integration

**Budget Manager:**
```typescript
interface BudgetConfig {
  totalBudget: number;        // e.g., $10.00
  perAgentLimit?: number;     // max per agent
  perSwarmLimit?: number;     // max per swarm
  warningThreshold: number;   // e.g., 80%
}

interface UsageMetrics {
  totalSpent: number;
  agentBreakdown: Record<string, number>;
  toolBreakdown: Record<string, number>;
  tokenBreakdown: {
    input: number;
    output: number;
    total: number;
  };
}

class BudgetTracker {
  async track(agentId: string, usage: UsageMetrics): Promise<void>;
  async check(budget: BudgetConfig): Promise<BudgetStatus>;
  async warn(agentId: string, status: BudgetStatus): Promise<void>;
}
```

### 4.6 Security Model

**Permission Schema:**
```typescript
interface AgentPermissions {
  allowedTools: string[];     // whitelist
  deniedTools: string[];      // blacklist (takes precedence)
  sandboxMode: 'none' | 'non-main' | 'docker';
  maxDuration: number;        // seconds
  maxTokens: number;
  maxCost: number;
  requireApproval: boolean;
  approvalChannels: string[];
}

const DEFAULT_PERMISSIONS: AgentPermissions = {
  allowedTools: ['read', 'write', 'edit', 'exec', 'browser', 'canvas', 'nodes', 'cron', 'sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn'],
  deniedTools: ['gateway', 'discord', 'slack'],  // sensitive channels
  sandboxMode: 'non-main',
  maxDuration: 3600,  // 1 hour
  maxTokens: 100000,
  maxCost: 1.00,
  requireApproval: false,
  approvalChannels: [],
};
```

---

## 5. UX Specifications

### 5.1 CLI Commands

**dash openclaw connect**
```
$ dash openclaw connect [--host HOST] [--port PORT] [--token TOKEN]

Connect to OpenClaw Gateway

Examples:
  $ dash openclaw connect                    # defaults
  $ dash openclaw connect --token mytoken   # custom token
  $ dash openclaw connect --port 19000      # custom port

Output:
  ✓ Connected to OpenClaw Gateway at ws://127.0.0.1:18789
  ✓ Authenticated (token: ***1234)
  ✓ Subscribed to events: agent, chat, presence, tick
```

**dash openclaw sessions list**
```
$ dash openclaw sessions list [--active] [--kind main|group|thread]

List OpenClaw sessions

Options:
  --active     Only show active sessions (last 60 min)
  --kind       Filter by session kind

Output:
  SESSIONS (3 total)
  ├── main:: (idle, 2.3K tokens, 2h ago)
  ├── main::dm:alice (active, 5.1K tokens, 5m ago)
  └── agent:code-review:group:task-123 (running, 1.2K tokens, now)
```

**dash openclaw spawn**
```
$ dash openclaw spawn --task "Review PR #456" --model claude-sonnet-4 --budget 0.50

Spawn an agent via OpenClaw

Options:
  --task          Task description (required)
  --model         Model to use (default: configured default)
  --budget        Max budget (default: $1.00)
  --sandbox       Enable sandbox (default: true)
  --skills        Additional skills (comma-separated)

Output:
  ✓ Spawned agent: sessionKey=agent:review-abc123
  ✓ Model: claude-sonnet-4-5
  ✓ Budget: $0.50
  ✓ Status: idle (awaiting task)
```

**dash openclaw send**
```
$ dash openclaw send --session agent:review-abc123 "Please review PR #456"

Send task to agent

Options:
  --session     Session key (required)
  --attach      File attachment

Output:
  ✓ Message sent to agent:review-abc123
  ✓ RunId: run_1770057407021
  ✓ Status: running
```

**dash swarm create --openclaw**
```
$ dash swarm create --name "code-review" --agents 3 --openclaws --budget 2.00

Create swarm using OpenClaw for execution

Options:
  --openclaws    Use OpenClaw for agent execution
  --channels     Comma-separated channel list (optional)
  --skills       Additional skills for agents (optional)

Output:
  ✓ Created swarm: code-review (id: swarm_abc123)
  ✓ 3 agents using OpenClaw
  ✓ Budget: $2.00
  ✓ Channels: main (default)
  ✓ Status: spawning
```

### 5.2 Dashboard Integration

**Swarm Dashboard:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Dash Swarm Manager                              [OpenClaw ✅]  │
├─────────────────────────────────────────────────────────────────┤
│  Swarm: self-improvement-code-quality    Status: running        │
│  Budget: $2.00 / $5.00                    Agents: 3/3           │
├─────────────────────────────────────────────────────────────────┤
│  AGENTS                              OpenClaw Gateway ✅        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ agent_1 │ idle    │ claude-sonnet-4 │ $0.12  │ [Send]    │   │
│  │ agent_2 │ running │ claude-sonnet-4 │ $0.45  │ [View]    │   │
│  │ agent_3 │ idle    │ kimi-coding     │ $0.08  │ [Send]    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  CHANNELS                          [Configure]                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ✅ main      ✅ telegram     ✅ whatsapp    ✅ discord    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  TOOLS                             [Permissions]                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ✅ read    ✅ write    ✅ exec    ✅ browser    ✅ canvas │   │
│  │ ⚠️ nodes  ✅ cron     ✅ webhook                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Self-Improvement Dashboard**
```
┌─────────────────────────────────────────────────────────────────┐
│  Dash Self-Improvement                   [OpenClaw Integrated]  │
├─────────────────────────────────────────────────────────────────┤
│  Last Cycle: 2026-02-02 18:08           Next Cycle: +1 hour     │
│  Budget Used: $4.25 / $10.00            Improvements: 7         │
├─────────────────────────────────────────────────────────────────┤
│  IMPROVEMENT PIPELINE                                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Phase │ Status    │ Agents │ Duration  │ Result          │   │
│  ├───────┼───────────┼────────┼───────────┼─────────────────┤   │
│  │ 1     │ ✅ Done   │ 3      │ 8 min     │ Test coverage   │   │
│  │ 2     │ ⏳ Running │ 2      │ 5 min     │ Documentation   │   │
│  │ 3     │ ⏸ Pending │ 2      │ 10 min    │ Refactoring     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  LEARNINGS                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Strategy        │ Success Rate │ Times Used │ Confidence  │   │
│  ├─────────────────┼──────────────┼────────────┼─────────────┤   │
│  │ Test Coverage   │ 95%          │ 12         │ High        │   │
│  │ Documentation   │ 88%          │ 8          │ High        │   │
│  │ Refactoring     │ 72%          │ 5          │ Medium      │   │
│  │ Type Safety     │ 100%         │ 3          │ High        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Plan

### 6.1 Phase 1: Gateway Connection (Week 1-2)

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| P1.1: Gateway WS Client | Dash | 3 days | None |
| P1.2: Session Manager API | Dash | 2 days | P1.1 |
| P1.3: Basic Spawn/Send | Dash | 2 days | P1.2 |
| P1.4: Status Tracking | Dash | 1 day | P1.3 |
| P1.5: Integration Tests | Test | 2 days | P1.1-P1.4 |

**Deliverables:**
- `src/integrations/openclaw/GatewayClient.ts`
- `src/integrations/openclaw/SessionManager.ts`
- `src/cli/commands/openclaw.ts`
- `tests/integration/openclaw.test.ts`

**Success Criteria:**
- [ ] Dash connects to OpenClaw Gateway
- [ ] Can list, spawn, send to sessions
- [ ] Agent status tracked in real-time
- [ ] 10 concurrent agents supported
- [ ] Integration tests: 100% pass

### 6.2 Phase 2: Tool Integration (Week 3-4)

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| P2.1: Tool Executor | Dash | 3 days | P1.3 |
| P2.2: Result Capture | Dash | 2 days | P2.1 |
| P2.3: Permission System | Dash | 2 days | P2.1 |
| P2.4: Sandbox Integration | Dash | 2 days | P2.3 |
| P2.5: Tool Tests | Test | 2 days | P2.1-P2.4 |

**Deliverables:**
- `src/integrations/openclaw/ToolExecutor.ts`
- `src/integrations/openclaw/PermissionManager.ts`
- `src/integrations/openclaw/SandboxManager.ts`
- `tests/integration/tools.test.ts`

**Success Criteria:**
- [ ] All OpenClaw tools accessible from Dash
- [ ] Tool results captured and stored
- [ ] Permissions enforced per agent
- [ ] Sandboxing works for dangerous tools
- [ ] Tool tests: 95% pass

### 6.3 Phase 3: Channel Integration (Week 5-6)

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| P3.1: Channel Router | Dash | 3 days | P2.1 |
| P3.2: Multi-Channel Send | Dash | 2 days | P3.1 |
| P3.3: Group Coordination | Dash | 2 days | P3.1 |
| P3.4: Channel Optimization | Dash | 2 days | P3.2 |
| P3.5: Channel Tests | Test | 2 days | P3.1-P3.4 |

**Deliverables:**
- `src/integrations/openclaw/ChannelRouter.ts`
- `src/integrations/openclaw/GroupCoordinator.ts`
- `src/integrations/openclaw/ChannelOptimizer.ts`
- `tests/integration/channels.test.ts`

**Success Criteria:**
- [ ] Tasks routed to 3+ channels
- [ ] Channel aggregation works
- [ ] Group coordination functional
- [ ] Channel-specific optimization applied
- [ ] Channel tests: 90% pass

### 6.4 Phase 4: Skills & Self-Improvement (Week 7-8)

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| P4.1: ClawHub Client | Dash | 2 days | P1.1 |
| P4.2: Skill Installer | Dash | 2 days | P4.1 |
| P4.3: Self-Improve Integration | Dash | 3 days | P2.2, P3.1 |
| P4.4: Learning Loop | Dash | 3 days | P4.3 |
| P4.5: Full E2E Tests | Test | 2 days | P4.1-P4.4 |

**Deliverables:**
- `src/integrations/openclaw/ClawHubClient.ts`
- `src/integrations/openclaw/SkillInstaller.ts`
- `src/integrations/openclaw/LearningEngine.ts`
- `tests/e2e/openclaw-self-improve.test.ts`

**Success Criteria:**
- [ ] ClawHub search/install works
- [ ] Skills installed and usable
- [ ] Self-improvement uses OpenClaw
- [ ] Learning loop functional
- [ ] E2E tests: 95% pass

### 6.5 Milestones

| Milestone | Date | Criteria |
|-----------|------|----------|
| M1: Gateway Connected | Week 1 | Dash connects to OpenClaw |
| M2: Agents Execute | Week 2 | Spawned agents do real work |
| M3: Tools Available | Week 4 | All OpenClaw tools accessible |
| M4: Channels Integrated | Week 6 | Multi-channel routing works |
| M5: Self-Improving | Week 8 | Full recursive improvement |

---

## 7. Edge Cases & Error Handling

### 7.1 Gateway Disconnection

**Scenario:** OpenClaw Gateway crashes or network drops

**Handling:**
```typescript
async withReconnect<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error.isConnectionError) {
      await this.reconnect();
      return await fn();  // retry once
    }
    throw error;
  }
}
```

**Recovery:**
1. Detect disconnect within 2s
2. Attempt reconnection with exponential backoff
3. Pending requests queued during disconnect
4. Notify user after 30s of continuous failure
5. Auto-fail agents after 5min of no response

### 7.2 Agent Timeout

**Scenario:** Agent takes too long to respond

**Handling:**
```typescript
const AGENT_TIMEOUT = 300000;  // 5 minutes

async sendWithTimeout(sessionKey: string, message: string): Promise<Result> {
  const result = await Promise.race([
    this.send(sessionKey, message),
    this.timeout(AGENT_TIMEOUT, 'Agent timeout')
  ]);
  
  if (result === 'timeout') {
    await this.kill(sessionKey);
    throw new AgentTimeoutError(sessionKey);
  }
  
  return result;
}
```

**Recovery:**
1. Kill timed-out agent
2. Spawn replacement agent
3. Re-queue task
4. Alert if 3+ consecutive timeouts

### 7.3 Budget Exhaustion

**Scenario:** Agent exceeds allocated budget

**Handling:**
```typescript
async trackUsage(agentId: string, usage: UsageMetrics): Promise<void> {
  const remaining = this.budgets.get(agentId) - usage.cost;
  
  if (remaining < 0) {
    await this.kill(agentId);
    throw new BudgetExceededError(agentId);
  }
  
  if (remaining < this.warningThreshold) {
    await this.warn(agentId, remaining);
  }
  
  this.budgets.set(agentId, remaining);
}
```

**Recovery:**
1. Kill agent immediately
2. Do not retry (budget exhausted)
3. Alert user
4. Log for audit

### 7.4 Tool Failure

**Scenario:** Tool execution fails (browser crash, exec error, etc.)

**Handling:**
```typescript
async execWithRetry(tool: string, fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (error) {
    const retryCount = this.retryCounts.get(tool) || 0;
    
    if (retryCount < 3) {
      this.retryCounts.set(tool, retryCount + 1);
      await this.sleep(1000 * Math.pow(2, retryCount));  // exponential backoff
      return await this.execWithRetry(tool, fn);
    }
    
    this.retryCounts.delete(tool);
    throw new ToolError(tool, error);
  }
}
```

**Recovery:**
1. Retry up to 3 times with backoff
2. Fallback to alternative tool if available
3. Mark agent as degraded
4. Continue with reduced capabilities

### 7.5 Permission Violation

**Scenario:** Agent attempts unauthorized action

**Handling:**
```typescript
async checkPermission(agentId: string, tool: string): Promise<void> {
  const permissions = await this.permissionManager.get(agentId);
  
  if (permissions.deniedTools.includes(tool)) {
    throw new PermissionDeniedError(agentId, tool);
  }
  
  if (!permissions.allowedTools.includes('*') && 
      !permissions.allowedTools.includes(tool)) {
    throw new ToolNotAllowedError(agentId, tool);
  }
}
```

**Recovery:**
1. Block action
2. Log violation
3. Alert if suspicious pattern
4. Optionally terminate agent

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Coverage Target:** 90%

**Test Categories:**
- Gateway client connection/reconnection
- Session management operations
- Tool execution and result capture
- Permission enforcement
- Budget tracking
- Error handling

**Example:**
```typescript
describe('GatewayClient', () => {
  it('should reconnect on disconnect', async () => {
    const client = new GatewayClient();
    await client.connect();
    
    // Simulate disconnect
    server.disconnect();
    
    // Should reconnect automatically
    await waitFor(() => client.connected);
    expect(client.connected).toBe(true);
  });
});
```

### 8.2 Integration Tests

**Target:** 50 integration tests

**Test Categories:**
- Gateway connection flow
- Session lifecycle (spawn → send → history)
- Tool execution chain
- Permission enforcement
- Budget tracking across agents
- Error propagation

**Example:**
```typescript
describe('OpenClaw Integration', () => {
  it('should spawn agent and send task', async () => {
    // Spawn agent
    const spawnResult = await sessionManager.spawn({
      model: 'claude-sonnet-4-5',
      task: 'Test task'
    });
    
    // Send task
    const sendResult = await sessionManager.send(
      spawnResult.sessionKey,
      'Say hello'
    );
    
    // Wait for completion
    const history = await waitForHistory(
      spawnResult.sessionKey,
      'hello'
    );
    
    expect(history.messages).toContain('hello');
  });
});
```

### 8.3 End-to-End Tests

**Target:** 20 E2E tests

**Test Categories:**
- Full swarm creation → execution → results
- Multi-channel distribution
- Self-improvement cycles
- Learning loop effectiveness
- Failure recovery scenarios

**Example:**
```typescript
describe('Self-Improvement E2E', () => {
  it('should complete full improvement cycle', async () =>