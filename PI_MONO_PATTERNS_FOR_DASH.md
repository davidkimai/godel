# PI-MONO Strategic Patterns for Dash Adoption

**Date:** 2026-02-03  
**Source:** pi-mono (https://github.com/badlogic/pi-mono)  
**Analysis Team:** Codex Senior Engineering  
**Target:** Dash Orchestration Platform

---

## Executive Summary

This document analyzes pi-mono's architecture and identifies strategic patterns Dash should adopt to become a more powerful, extensible, and maintainable agent orchestration platform.

### Priority Matrix

| Pattern | Priority | Effort | Impact | Timeline |
|---------|----------|--------|--------|----------|
| Unified LLM API | **HIGH** | Medium | Very High | Weeks 1-3 |
| Extension System | **HIGH** | High | Very High | Weeks 4-7 |
| Session Tree + Branching | **HIGH** | Medium | High | Weeks 8-10 |
| Agent Event Architecture | **HIGH** | Low | High | Weeks 1-2 |
| Skills System | MEDIUM | Medium | Medium | Weeks 11-12 |
| Context Compaction | MEDIUM | Medium | Medium | Phase 2 |
| Package Manager | MEDIUM | High | Medium | Phase 2 |
| Cross-Provider Handoffs | LOW | Low | Low | Phase 3 |

---

## 1. Unified LLM API (HIGH PRIORITY)

### What It Is
A provider-agnostic abstraction layer that unifies 15+ LLM providers (OpenAI, Anthropic, Google, Mistral, Groq, etc.) behind a single interface with automatic model discovery, cost tracking, and streaming support.

### Key Features
- **Type-safe model selection**: `getModel('anthropic', 'claude-sonnet-4-20250514')`
- **Unified streaming interface**: Same event types regardless of provider
- **Automatic cost tracking**: Per-request token and cost calculation
- **Tool calling standardization**: TypeBox schemas work across all providers
- **Provider-specific options**: Fine-grained control when needed

### Why Dash Needs It
Currently, Dash has hardcoded model strings and OpenClaw-specific integration. A unified API would:
- Enable multi-provider swarms (some agents on Claude, others on GPT, etc.)
- Automatic failover between providers
- Simplified provider addition (just add to registry)
- Consistent cost tracking across all agents

### Implementation Strategy

```typescript
// Current Dash approach
const agent = await swarm.spawn({
  model: 'claude-sonnet-4-5',  // Hardcoded string
  provider: 'anthropic'         // Manual provider selection
});

// Post-adoption approach
import { getModel, stream } from '@dash/ai';  // Adopt pi-ai pattern

const model = getModel('anthropic', 'claude-sonnet-4-20250514');
const agent = await swarm.spawn({
  modelResolver: new DashModelResolver(),  // Swarm-aware model selection
  provider: 'auto',  // Automatic provider selection with failover
});

// During execution, agents can handoff between providers
await agent.handoffTo(getModel('openai', 'gpt-5-mini'));
```

### Files to Modify/Create
- Create `packages/ai/` - New unified LLM package
- Refactor `src/core/llm.ts` - Use unified API
- Update `src/integrations/openclaw/` - Integrate with unified API
- Create `src/models/model-registry.ts` - Swarm-aware model resolution

---

## 2. Extension System (HIGH PRIORITY)

### What It Is
A TypeScript-based plugin architecture that allows users to extend functionality without forking the core. Extensions can add:
- Custom tools (read, write, bash, grep, deploy, etc.)
- Custom commands (`/deploy`, `/stats`, `/custom-ui`)
- Custom keyboard shortcuts
- Custom UI components (status lines, footers, overlays)
- Custom providers (new LLM APIs)
- Event handlers and hooks

### Key Features
- **JIT TypeScript compilation**: Uses `jiti` for on-the-fly TS loading
- **Sandboxed execution**: Extensions run in controlled context
- **Hot reloading**: Changes apply without restart
- **Full API access**: Extensions get `ExtensionAPI` object with registration methods

### Example Extension
```typescript
// ~/.dash/extensions/my-deployment.ts
export default function (dash: ExtensionAPI) {
  // Add custom tool
  dash.registerTool({
    name: 'deploy',
    description: 'Deploy to production',
    parameters: Type.Object({
      service: Type.String(),
      version: Type.String()
    }),
    async execute(args) {
      // Deployment logic
      return { success: true };
    }
  });

  // Add custom command
  dash.registerCommand('deploy', {
    description: 'Deploy services',
    async handler(args) {
      await dash.spawnAgent('deploy', args.service);
    }
  });

  // Listen to events
  dash.on('agent_complete', async (event) => {
    if (event.result.includes('error')) {
      await dash.notify('Deployment failed!');
    }
  });
}
```

### Why Dash Needs It
Currently, all functionality is built-in. Extensions would enable:
- Community contributions without core changes
- Custom swarm behaviors per organization
- Specialized tools for specific domains (DevOps, data science, etc.)
- Third-party integrations (Slack, Jira, custom APIs)

### Implementation Strategy

```typescript
// New file: src/core/extension-api.ts
export interface ExtensionAPI {
  registerTool(tool: Tool): void;
  registerCommand(name: string, command: Command): void;
  registerProvider(provider: Provider): void;
  on(event: string, handler: EventHandler): void;
  // ... more methods
}

// Extension loader
export class ExtensionLoader {
  async loadFromPath(path: string): Promise<void> {
    const module = await import(path);
    const extension = module.default;
    const api = this.createAPI();
    await extension(api);
  }
}
```

---

## 3. Session Tree + Branching (HIGH PRIORITY)

### What It Is
A tree-structured session storage where each message has an `id` and `parentId`, enabling:
- Non-linear conversation history
- Branching (try different approaches from same point)
- In-place navigation (`/tree` command)
- Forking (create new session from any point)
- All history preserved in single JSONL file

### Key Features
- **Tree structure**: Messages form a DAG, not a linear array
- **Branching**: Create multiple continuations from one point
- **Navigation**: Jump to any point in history and continue
- **Labeling**: Bookmark important points with labels
- **Compaction**: Summarize old branches without losing structure

### JSONL Format Example
```json
{"id":"msg-1","parentId":null,"role":"user","content":"Hello"}
{"id":"msg-2","parentId":"msg-1","role":"assistant","content":"Hi there"}
{"id":"msg-3","parentId":"msg-1","role":"assistant","content":"Hello!"}  // Branch!
{"id":"msg-4","parentId":"msg-2","role":"user","content":"Tell me more"}
```

### Why Dash Needs It
For orchestration, this enables:
- **A/B testing**: Branch swarm at decision point, compare outcomes
- **Exploration**: Try multiple strategies in parallel
- **Recovery**: Jump back to any point if swarm goes wrong
- **Audit trail**: Complete tree of all decisions and outcomes
- **Reproducibility**: Replay exact path through tree

### Implementation Strategy

```typescript
// Current: Flat session storage
interface Session {
  messages: Message[];  // Linear array
}

// Post-adoption: Tree structure
interface TreeSession {
  entries: Map<string, SessionEntry>;
  rootId: string;
  currentId: string;
}

interface SessionEntry {
  id: string;
  parentId: string | null;
  message: Message;
  metadata: {
    agentId?: string;
    swarmId?: string;
    cost?: number;
    timestamp: number;
  };
}

// Swarm orchestration using trees
class SwarmOrchestrator {
  async branchAt(entryId: string): Promise<string> {
    // Create new branch from any point
    const newBranchId = generateId();
    this.session.createBranch(entryId, newBranchId);
    return newBranchId;
  }
  
  async compareBranches(branchIds: string[]): Promise<BranchComparison> {
    // Compare outcomes of different branches
    return {
      branches: branchIds.map(id => this.session.getBranchStats(id)),
      winner: this.selectBestBranch(branchIds)
    };
  }
}
```

---

## 4. Agent Event Architecture (HIGH PRIORITY)

### What It Is
A granular event streaming system that emits events for every agent action, enabling:
- Real-time monitoring
- Progress tracking
- Tool execution visibility
- Cost tracking per event
- UI updates
- Logging and auditing

### Event Types
```typescript
type AgentEvent =
  | { type: 'agent_start'; agentId: string; task: string }
  | { type: 'turn_start'; turnId: string; message: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_end' }
  | { type: 'tool_call_start'; tool: string; args: unknown }
  | { type: 'tool_call_end'; result: unknown; duration: number }
  | { type: 'text_delta'; delta: string }
  | { type: 'turn_end'; usage: TokenUsage }
  | { type: 'agent_complete'; result: string; totalCost: number }
  | { type: 'error'; error: Error };
```

### Why Dash Needs It
Currently, Dash has limited visibility into agent execution. Events would enable:
- **Real-time dashboard**: Live view of all swarm activity
- **Progress tracking**: See which agents are working, waiting, stalled
- **Cost monitoring**: Track spending per agent/task/swarm in real-time
- **Debugging**: Replay exact execution flow
- **Audit trails**: Complete record for compliance

### Implementation Strategy

```typescript
// New: src/core/event-bus.ts
export class AgentEventBus {
  private listeners: Map<string, EventHandler[]> = new Map();

  emit(event: AgentEvent): void {
    const handlers = this.listeners.get(event.type) || [];
    handlers.forEach(h => h(event));
    
    // Also emit to 'all' listeners
    const allHandlers = this.listeners.get('*') || [];
    allHandlers.forEach(h => h(event));
  }

  on(eventType: string, handler: EventHandler): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(handler);
  }
}

// Integration with orchestrator
class SwarmOrchestrator {
  private eventBus = new AgentEventBus();

  async spawnAgent(config: AgentConfig): Promise<Agent> {
    const agent = new Agent(config, this.eventBus);
    
    this.eventBus.emit({
      type: 'agent_start',
      agentId: agent.id,
      task: config.task
    });
    
    return agent;
  }
}
```

---

## 5. Skills System (MEDIUM PRIORITY)

### What It Is
A standardized format for agent capabilities following the [Agent Skills standard](https://agentskills.io). Skills are Markdown files with structured sections that agents can load on-demand.

### Skill Format
```markdown
# Deployment Skill
Use this skill when the user asks about deploying services.

## When to Use
- User mentions "deploy", "production", "release"
- Working with Docker, Kubernetes, or cloud services

## Steps
1. Check current deployment status
2. Review changes since last deployment
3. Run tests
4. Deploy to staging
5. Verify staging deployment
6. Deploy to production
7. Monitor metrics

## Tools Available
- `check_status`: Get deployment status
- `deploy_service`: Deploy to environment
- `rollback`: Revert deployment

## Examples
### Example 1: Deploy API Service
User: "Deploy the API"
Assistant: I'll deploy the API service to production...
```

### Why Dash Needs It
- **Standardized capabilities**: Common language for agent abilities
- **Discoverability**: Agents can auto-load relevant skills
- **Community sharing**: Share skills via npm/git
- **Versioning**: Skills can be versioned and updated

### Implementation Strategy

```typescript
// New: src/core/skills.ts
export class SkillLoader {
  async loadSkill(path: string): Promise<Skill> {
    const content = await fs.readFile(path, 'utf-8');
    return this.parseSkill(content);
  }

  private parseSkill(content: string): Skill {
    // Parse markdown sections
    return {
      name: extractName(content),
      whenToUse: extractWhenToUse(content),
      steps: extractSteps(content),
      examples: extractExamples(content)
    };
  }
}

// Usage in agents
class Agent {
  private skills: Map<string, Skill> = new Map();

  async loadRelevantSkills(query: string): Promise<void> {
    const relevant = await this.skillRegistry.findRelevant(query);
    for (const skill of relevant) {
      this.skills.set(skill.name, skill);
    }
  }
}
```

---

## 6. Context Compaction (MEDIUM PRIORITY)

### What It Is
Automatic summarization of old conversation messages when approaching context limits, preserving recent messages while compressing history.

### How It Works
1. Monitor context usage during conversation
2. When approaching limit, trigger compaction
3. Summarize older messages into a single "summary" message
4. Preserve structure in storage (full history in JSONL)
5. Continue with compacted context

### Why Dash Needs It
Long-running swarms (24/7 operation) will hit context limits. Compaction enables:
- **Infinite sessions**: Keep swarms running indefinitely
- **Cost optimization**: Reduce token usage on old context
- **Memory management**: Prevent unbounded memory growth

### Implementation Strategy

```typescript
// New: src/core/compaction.ts
export class ContextCompactor {
  async compact(context: Context): Promise<Context> {
    if (this.getTokenCount(context) < this.threshold) {
      return context;  // No compaction needed
    }

    const summary = await this.summarizeMessages(
      context.messages.slice(0, -10)  // Keep last 10 messages
    );

    return {
      ...context,
      messages: [
        { role: 'system', content: `Previous context: ${summary}` },
        ...context.messages.slice(-10)
      ]
    };
  }

  private async summarizeMessages(messages: Message[]): Promise<string> {
    // Use LLM to create summary
    const summary = await this.llm.complete({
      messages: [
        { role: 'system', content: 'Summarize the following conversation:' },
        ...messages
      ]
    });
    return summary.content;
  }
}
```

---

## 7. Package Manager (MEDIUM PRIORITY)

### What It Is
An npm/git-based package installation system for extensions, skills, prompts, and themes. Packages are discovered by `pi-package` keyword on npm.

### Commands
```bash
dash install npm:@company/dash-devops      # Install from npm
dash install git:github.com/user/repo      # Install from git
dash install https://github.com/user/repo  # Install from URL
dash remove npm:@company/dash-devops       # Remove package
dash list                                  # List installed packages
dash update                                # Update all packages
```

### Package Format
```json
{
  "name": "my-dash-package",
  "keywords": ["dash-package"],
  "dash": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

### Why Dash Needs It
- **Ecosystem growth**: Community can contribute without PRs
- **Specialized domains**: DevOps, data science, security packages
- **Version management**: Pin versions, update independently
- **Private packages**: Internal company extensions

---

## 8. Cross-Provider Handoffs (LOW PRIORITY)

### What It Is
The ability to seamlessly switch between LLM providers mid-conversation while preserving context, including thinking blocks and tool results.

### How It Works
- User/tool messages passed through unchanged
- Assistant messages transformed if provider differs
- Thinking blocks converted to `<thinking>` tags for compatibility
- Tool calls preserved across all providers

### Why It's Lower Priority
Dash's swarm architecture already allows different agents to use different providers. This pattern is more relevant for single-agent conversation continuity.

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
**Goal**: Core infrastructure for extensibility

- **Week 1-2**: Agent Event Architecture
  - Implement event bus
  - Emit events from orchestrator
  - Dashboard integration

- **Week 3-4**: Unified LLM API
  - Create `@dash/ai` package structure
  - Implement provider abstraction
  - Migrate existing OpenClaw integration

### Phase 2: Extensibility (Weeks 5-8)
**Goal**: Plugin system and community support

- **Week 5-6**: Extension System
  - Extension API design
  - JIT TypeScript compilation
  - Sandboxed execution

- **Week 7-8**: Skills System
  - Skill format specification
  - Skill loader and registry
  - Auto-loading based on context

### Phase 3: Advanced Features (Weeks 9-12)
**Goal**: Production-ready orchestration

- **Week 9-10**: Session Tree + Branching
  - Tree-structured session storage
  - Branching and forking APIs
  - Tree navigation UI

- **Week 11-12**: Context Compaction + Polish
  - Automatic compaction
  - Testing and refinement
  - Documentation

### Phase 4: Ecosystem (Ongoing)
**Goal**: Community and ecosystem

- Package Manager implementation
- Public registry (optional)
- Community skill library

---

## Key Architectural Decisions

### 1. Monorepo vs Single Repo
**Recommendation**: Keep Dash as single repo initially, consider monorepo if:
- Multiple distinct packages emerge (ai, agent, orchestrator, web-ui)
- Different release cycles needed
- Team grows significantly

### 2. Extension Security Model
**Options**:
- **Trusted**: Extensions have full system access (current pi-mono model)
- **Sandboxed**: Extensions run in restricted context (recommended for Dash)

**Recommendation**: Sandboxed with explicit permissions:
```typescript
dash.registerExtension({
  path: './my-extension.ts',
  permissions: ['fs:read', 'fs:write:./output', 'net:api.github.com']
});
```

### 3. Event Persistence
**Options**:
- **In-memory**: Fast, lost on restart
- **SQLite**: Persistent, queryable
- **JSONL**: Persistent, human-readable

**Recommendation**: JSONL for sessions, SQLite for analytics:
- Sessions stored as JSONL (tree structure)
- Events streamed to SQLite for querying
- Dashboard reads from SQLite

---

## Migration Path

### Current → Target

| Current Component | Migration Path |
|------------------|----------------|
| `src/core/llm.ts` | Extract to `@dash/ai`, refactor to unified API |
| `src/integrations/openclaw/` | Adapter pattern to unified API |
| `src/storage/` | Add tree-structured session storage |
| `src/dashboard/` | Subscribe to event bus for real-time updates |
| Built-in tools | Extract to default extension |
| Hardcoded behaviors | Move to skills/extensions |

### Backwards Compatibility
- Keep existing APIs during migration
- Deprecation warnings for 2 major versions
- Migration guide for users

---

## Conclusion

Adopting pi-mono's patterns would transform Dash from a custom orchestration tool into a powerful, extensible platform:

1. **Unified LLM API**: Multi-provider swarms with automatic failover
2. **Extension System**: Community contributions without core changes
3. **Session Tree**: A/B testing, exploration, and recovery
4. **Event Architecture**: Real-time monitoring and debugging
5. **Skills System**: Standardized, shareable capabilities
6. **Context Compaction**: 24/7 operation without context limits
7. **Package Manager**: Growing ecosystem of extensions

**Next Steps**:
1. Review and prioritize patterns with team
2. Create RFC for Phase 1 (Events + Unified LLM API)
3. Begin implementation with test-driven approach
4. Document migration path for existing users

**Estimated Timeline**: 12 weeks for full implementation, 4 weeks for MVP (Events + Unified LLM API)

---

*Generated by: Codex Senior Engineering Team*  
*Session: 26f360ee-45a4-4f88-a6d2-cce71dc5d7f5*
