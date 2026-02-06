# PI-MONO CORE INTEGRATION SPEC
## Making pi-mono the Foundation of Dash

**Reference:** https://github.com/badlogic/pi-mono
**Created:** 2026-02-04 03:35 CST
**Status:** Ready for Implementation

---

## 🎯 EXECUTIVE SUMMARY

Pi-mono by badlogic (Mario Zechner) is the most powerful agent harness available. As Tobi Lutke said:
> "Pi is the most interesting agent harness. Tiny core, able to write plugins for itself as you use it. It RLs itself into the agent you want."

**Dash will adopt pi-mono primitives as its core architecture.**

---

## 📦 PI-MONO PACKAGES TO INTEGRATE

### 1. @mariozechner/pi-ai (Unified LLM API)
**Priority:** P0 - Core
**Purpose:** Unified multi-provider LLM abstraction

| Feature | Description |
|---------|-------------|
| **20+ Providers** | OpenAI, Anthropic, Google, Azure, Vertex, Mistral, Groq, Cerebras, xAI, OpenRouter, Vercel AI Gateway, MiniMax, Kimi, Bedrock, GitHub Copilot, Gemini CLI, Antigravity |
| **TypeBox Tools** | Type-safe tool definitions with automatic validation |
| **Streaming Events** | Granular event types (text_delta, toolcall_delta, thinking_delta) |
| **Context Serialization** | JSON-native context for persistence/transfer |
| **Cross-Provider Handoffs** | Seamless model switching mid-conversation |
| **Token/Cost Tracking** | Built-in usage and cost calculation |
| **OAuth Support** | Claude Pro, Codex, Copilot, Gemini CLI, Antigravity |

### 2. @mariozechner/pi-coding-agent (Terminal Harness)
**Priority:** P0 - Core
**Purpose:** The CLI harness for Dash agents

| Feature | Description |
|---------|-------------|
| **Interactive TUI** | Terminal UI with editor, commands, shortcuts |
| **Session Management** | Tree-structured sessions with branching |
| **Message Queue** | Steering/follow-up for interruptions |
| **File References** | `@` for fuzzy file search |
| **Compaction** | Automatic context summarization |
| **4 Built-in Tools** | read, write, edit, bash |
| **Skills System** | Agent Skills standard for reusable capabilities |
| **Themes** | Hot-reloadable terminal themes |
| **Package System** | npm/git packages for sharing extensions |

### 3. @mariozechner/pi-agent (Agent Framework)
**Priority:** P1 - Important
**Purpose:** Event-driven agent architecture

| Feature | Description |
|---------|-------------|
| **Stateful Agent** | Agent with tool execution and event streaming |
| **Event System** | Agent lifecycle events (start, end, turn, message) |
| **Tool Integration** | Bridging tools to agent context |
| **Steering Mode** | Interrupt current work with steering messages |
| **Follow-up Mode** | Queue work after current work completes |
| **Streaming Support** | Real-time event emission |

### 4. @mariozechner/pi-tui (Terminal UI)
**Priority:** P2 - Later
**Purpose:** Reusable TUI components

| Feature | Description |
|---------|-------------|
| **Editor Component** | File editing in terminal |
| **Status Line** | Working directory, tokens, cost |
| **Message Display** | Assistant responses, tool calls |
| **Overlays** | Custom UI for extensions |

---

## 🏗️ DASH ARCHITECTURE WITH PI-MONO

```
┌─────────────────────────────────────────────────────────────┐
│                     DASH PLATFORM                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              pi-coding-agent (CLI Harness)           │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │  Session Manager (Tree/Branching)         │    │    │
│  │  │  Message Queue (Steering/Follow-up)      │    │    │
│  │  │  Skills System (Agent Skills Standard)    │    │    │
│  │  │  Extensions API (Plugins)                 │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              pi-agent (Agent Core)                   │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │  Event System (lifecycle, streaming)       │    │    │
│  │  │  Tool Bridge (tool→agent integration)       │    │    │
│  │  │  Steering/Follow-up Control                 │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              pi-ai (Unified LLM API)                 │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │  Provider Registry (20+ providers)         │    │    │
│  │  │  Model Discovery (typed auto-complete)     │    │    │
│  │  │  Context Serialization (JSON-native)       │    │    │
│  │  │  Cross-Provider Handoffs                   │    │    │
│  │  │  TypeBox Tools (validation)                │    │    │
│  │  │  Token/Cost Tracking                       │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└────────────────────────────────────────────────────────────────┘
```

---

## 📁 IMPLEMENTATION STRUCTURE

```
src/
├── llm/                          # pi-ai integration
│   ├── index.ts                 # Unified exports
│   ├── providers/               # Provider implementations
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   ├── google.ts
│   │   └── ...
│   ├── model-registry.ts        # Model discovery
│   ├── context.ts               # Serializable context
│   └── tools/                   # TypeBox tool definitions
│       ├── types.ts
│       └── validators.ts
│
├── agent/                       # pi-agent integration
│   ├── index.ts
│   ├── Agent.ts                 # Core agent class
│   ├── events.ts                # Event types
│   ├── steering.ts              # Steering/follow-up
│   └── tools/                   # Built-in agent tools
│       ├── read.ts
│       ├── write.ts
│       ├── edit.ts
│       └── bash.ts
│
├── cli/                         # pi-coding-agent integration
│   ├── index.ts
│   ├── session-manager.ts       # Tree-structured sessions
│   ├── message-queue.ts          # Steering/follow-up queue
│   ├── skills/                  # Skills system
│   │   ├── loader.ts
│   │   └── registry.ts
│   ├── extensions/              # Extension API
│   │   ├── index.ts
│   │   └── api.ts
│   └── tui/                     # Terminal UI
│       ├── editor.ts
│       ├── status-line.ts
│       └── message-display.ts
│
└── orchestration/               # Dash-specific orchestration
    ├── swarm-manager.ts         # Agent swarms
    ├── worktree-manager.ts      # Parallel worktrees
    └── cron-orchestrator.ts     # Cron-driven operation
```

---

## 🚀 IMPLEMENTATION PHASES

### Phase A: pi-ai Core (Week 1)
**Goal:** Unified LLM API with multi-provider support

```typescript
// src/llm/index.ts
export { getModel, stream, complete, Context, Tool, Type } from '@mariozechner/pi-ai';
```

**Deliverables:**
1. Install `@mariozechner/pi-ai`
2. Create provider wrappers (OpenAI, Anthropic, Google)
3. Implement model registry
4. Add TypeBox tool definitions
5. Configure context serialization
6. Set up cross-provider handoffs

### Phase B: pi-agent Integration (Week 2)
**Goal:** Event-driven agent architecture

```typescript
// src/agent/index.ts
export { Agent } from '@mariozechner/pi-agent';
export { agentLoop, agentLoopContinue } from '@mariozechner/pi-agent';
```

**Deliverables:**
1. Install `@mariozechner/pi-agent`
2. Create Dash Agent class extending pi-agent
3. Implement event streaming system
4. Add steering/follow-up support
5. Bridge tools to agent context

### Phase C: pi-coding-agent Integration (Week 3)
**Goal:** CLI harness with extensibility

```typescript
// src/cli/index.ts
export { createAgentSession } from '@mariozechner/pi-coding-agent';
```

**Deliverables:**
1. Install `@mariozechner/pi-coding-agent`
2. Implement session manager
3. Add skills system
4. Create extension API
5. Build terminal UI components

### Phase D: Dash Orchestration (Week 4)
**Goal:** Swarm orchestration on top of pi-mono

**Deliverables:**
1. Swarm manager (parallel agents)
2. Worktree orchestration
3. Cron-driven automation
4. Mission Control UI integration

---

## 🔧 SPECIFIC IMPLEMENTATIONS

### 1. Unified LLM API

```typescript
// src/llm/providers/openai.ts
import { getModel, stream, complete } from '@mariozechner/pi-ai';

export function createOpenAIClient(apiKey?: string) {
  const model = getModel('openai', 'gpt-4o-mini');
  
  return {
    stream: (context: Context) => stream(model, context, { apiKey }),
    complete: (context: Context) => complete(model, context, { apiKey }),
    getModel: () => model,
  };
}

export function createAnthropicClient(apiKey?: string) {
  const model = getModel('anthropic', 'claude-sonnet-4-20250514');
  
  return {
    stream: (context: Context) => stream(model, context, { apiKey }),
    complete: (context: Context) => complete(model, context, { apiKey }),
    getModel: () => model,
  };
}

// Multi-provider factory
export function createLLMClient(provider: 'openai' | 'anthropic' | 'google', apiKey?: string) {
  switch (provider) {
    case 'openai': return createOpenAIClient(apiKey);
    case 'anthropic': return createAnthropicClient(apiKey);
    case 'google': return createGoogleClient(apiKey);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### 2. TypeBox Tool Definitions

```typescript
// src/llm/tools/filesystem.ts
import { Type, Tool } from '@mariozechner/pi-ai';

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: Type.Object({
    path: Type.String({ description: 'Path to the file to read' }),
    encoding: Type.Optional(Type.String({ 
      description: 'File encoding (default: utf-8)',
      default: 'utf-8'
    }))
  })
};

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Write content to a file',
  parameters: Type.Object({
    path: Type.String({ description: 'Path to write to' }),
    content: Type.String({ description: 'Content to write' }),
    overwrite: Type.Optional(Type.Boolean({
      description: 'Overwrite existing file (default: false)',
      default: false
    }))
  })
};

export const listFilesTool: Tool = {
  name: 'list_files',
  description: 'List files in a directory',
  parameters: Type.Object({
    path: Type.String({ description: 'Directory path' }),
    pattern: Type.Optional(Type.String({ description: 'Glob pattern' })),
    recursive: Type.Optional(Type.Boolean({ default: false }))
  })
};
```

### 3. Agent with Tools

```typescript
// src/agent/DashAgent.ts
import { Agent } from '@mariozechner/pi-agent';
import { readFileTool, writeFileTool, listFilesTool } from '../llm/tools/filesystem';

export class DashAgent extends Agent {
  constructor(options: {
    systemPrompt?: string;
    model?: Model;
    tools?: AgentTool[];
  }) {
    super({
      initialState: {
        systemPrompt: options.systemPrompt || 'You are a helpful coding assistant.',
        model: options.model || getModel('anthropic', 'claude-sonnet-4-20250514'),
        tools: options.tools || [readFileTool, writeFileTool, listFilesTool],
        messages: []
      },
      transformContext: async (messages) => {
        // Dash-specific context pruning
        return pruneForDash(messages);
      },
      convertToLlm: (messages) => {
        // Dash-specific message conversion
        return messages.filter(m => ['user', 'assistant', 'toolResult'].includes(m.role));
      }
    });
  }
  
  // Dash-specific methods
  async spawnSubagent(prompt: string): Promise<string> {
    // Spawn another agent for parallel work
    const subagent = new DashAgent({ ... });
    const result = await subagent.prompt(prompt);
    return result;
  }
}
```

### 4. Session Management

```typescript
// src/cli/session-manager.ts
import { SessionManager } from '@mariozechner/pi-coding-agent';

export class DashSessionManager {
  private sessionManager: SessionManager;
  
  constructor(sessionDir?: string) {
    this.sessionManager = new SessionManager({
      dir: sessionDir || '~/.godel/sessions'
    });
  }
  
  async createSession(name: string, context: Context) {
    const session = await this.sessionManager.createSession({
      name,
      initialContext: context
    });
    return session;
  }
  
  async branchSession(sessionId: string, branchPoint: string) {
    // Create branch from any point in history
    const branch = await this.sessionManager.fork(sessionId, branchPoint);
    return branch;
  }
  
  async compactSession(sessionId: string, instructions?: string) {
    // Summarize older messages
    await this.sessionManager.compact(sessionId, instructions);
  }
}
```

### 5. Skills System

```typescript
// src/cli/skills/loader.ts
import { Skill } from '@mariozechner/pi-coding-agent';

export interface DashSkill {
  name: string;
  description: string;
  steps: string[];
  whenToUse: string;
}

export class SkillsLoader {
  private skills: Map<string, DashSkill> = new Map();
  
  async loadSkill(skillPath: string): Promise<void> {
    const skill = await this.loadSkillFile(skillPath);
    this.skills.set(skill.name, skill);
  }
  
  async loadAllSkills(skillsDir: string): Promise<void> {
    const files = await glob(`${skillsDir}/**/*.md`);
    for (const file of files) {
      await this.loadSkill(file);
    }
  }
  
  getSkill(name: string): DashSkill | undefined {
    return this.skills.get(name);
  }
  
  listSkills(): DashSkill[] {
    return Array.from(this.skills.values());
  }
}
```

---

## 📋 IMPLEMENTATION CHECKLIST

### pi-ai Integration
- [ ] Install `@mariozechner/pi-ai`
- [ ] Create provider wrappers (OpenAI, Anthropic, Google)
- [ ] Implement model registry with auto-complete
- [ ] Add TypeBox tool definitions
- [ ] Configure context serialization
- [ ] Set up cross-provider handoffs
- [ ] Add token/cost tracking
- [ ] Configure OAuth for Codex/Copilot/Gemini CLI

### pi-agent Integration
- [ ] Install `@mariozechner/pi-agent`
- [ ] Create DashAgent class
- [ ] Implement event streaming
- [ ] Add steering/follow-up support
- [ ] Bridge built-in tools (read, write, edit, bash)
- [ ] Add custom Dash tools

### pi-coding-agent Integration
- [ ] Install `@mariozechner/pi-coding-agent`
- [ ] Implement session manager
- [ ] Add skills system
- [ ] Create extension API
- [ ] Build terminal UI components
- [ ] Add themes support

### Dash Orchestration
- [ ] Swarm manager for parallel agents
- [ ] Worktree orchestration
- [ ] Cron-driven automation
- [ ] Mission Control integration

---

## 🔗 REFERENCES

- Pi-Mono: https://github.com/badlogic/pi-mono
- Pi-AI (LLM API): https://github.com/badlogic/pi-mono/tree/main/packages/ai
- Pi-Agent (Core): https://github.com/badlogic/pi-mono/tree/main/packages/agent
- Pi-Coding-Agent (Harness): https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
- Pi-TUI (UI): https://github.com/badlogic/pi-mono/tree/main/packages/tui
- Agent Skills Standard: https://agentskills.io

---

## 🎓 KEY PI-MONO CONCEPTS TO ADOPT

1. **Tiny Core, Extensions Everywhere** - Minimal core with powerful extension API
2. **Self-Modifying** - Can write plugins for itself as you use it
3. **Session Trees** - Branch conversation history without new files
4. **Steering/Follow-up** - Interrupt or queue work naturally
5. **Compaction** - Automatic context summarization for long sessions
6. **Skills System** - Reusable capability packages
7. **Multi-Provider** - 20+ LLM providers with unified API
8. **Cross-Provider Handoffs** - Switch models mid-conversation seamlessly

---

*This spec makes pi-mono primitives the foundation of Dash, enabling the "malleable software" experience Tobi described.*
