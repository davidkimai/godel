# Pi-Mono Repository Strategic Assessment

**Date:** February 3, 2026  
**Objective:** Extract beneficial patterns from pi-mono for OpenClaw/Godel integration  
**Strategic Importance:** HIGH - OpenClaw is built on pi-mono (this is essentially OpenClaw's SDK)

---

## Executive Summary

**Critical Finding:** OpenClaw is built on top of pi-mono. This repository IS OpenClaw's foundation.

**Key Packages for OpenClaw:**
1. **@mariozechner/pi-ai** - Unified LLM API (already assessed in PRD-005)
2. **@mariozechner/pi-agent-core** - Agent runtime with tool calling
3. **@mariozechner/pi-tui** - Terminal UI components
4. **@mariozechner/pi-coding-agent** - Interactive coding agent patterns
5. **@mariozechner/pi-mom** - Slack bot delegation patterns

**Strategic Opportunities:**
- Agent runtime patterns for Godel
- TUI components for swarmctl
- Tool calling architecture
- Extension system for skills
- Session management patterns

---

## Package Analysis

### 1. @mariozechner/pi-ai (Unified LLM API)

**Status:** Already assessed in PRD-005/SPEC-005

**Key Patterns:**
- Multi-provider abstraction (OpenAI, Anthropic, Google, etc.)
- Automatic failover between providers
- Rate limiting and cost tracking
- Streaming with unified event types
- Cross-provider handoffs
- OAuth authentication flows

**Integration Priority:** HIGH - Already planned

---

### 2. @mariozechner/pi-agent-core (Agent Runtime)

**Key Files:**
- `src/agent.ts` - Main Agent class
- `src/agent-loop.ts` - Core agent loop logic
- `src/types.ts` - Type definitions
- `src/proxy.ts` - Proxy streaming for browser apps

**Patterns to Extract:**

#### Agent Loop Architecture
```typescript
// Agent lifecycle: prompt() → turn_loop → agent_end
// Event-driven with subscribe pattern
// Supports steering (interrupt) and follow-up (queue)

// Key concepts:
// - AgentMessage vs LLM Message (flexible typing)
// - transformContext() - for pruning/compaction
// - convertToLlm() - for custom message types
// - Steering messages (interrupt mid-run)
// - Follow-up messages (queue after completion)
```

#### State Management
```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];
  messages: AgentMessage[];
  isStreaming: boolean;
  streamMessage: AgentMessage | null;
  pendingToolCalls: Set<string>;
  error?: string;
}
```

#### Tool System
```typescript
// TypeBox schemas for validation
// Execute function with streaming updates
// Error handling (throw = error result)
// Tool results can include images

interface AgentTool<TParameters extends TSchema, TDetails = any> {
  name: string;
  label: string;  // Human-readable for UI
  description: string;
  parameters: TParameters;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>
  ) => Promise<AgentToolResult<TDetails>>;
}
```

**Godel Integration Opportunity:**
- Use agent-loop.ts as foundation for Godel agents
- Tool system for agent capabilities
- Event streaming for real-time monitoring
- State management for persistence

---

### 3. @mariozechner/pi-tui (Terminal UI)

**Key Files:**
- `src/tui.ts` - Main TUI class
- `src/components/` - UI components
- `src/terminal.ts` - Terminal abstraction

**Components:**
- Box - Container component
- Input - Text input with autocomplete
- SelectList - Selection interface
- Markdown - Markdown rendering
- Image - Terminal image display
- Loader - Loading indicators

**Patterns to Extract:**
```typescript
// Component-based TUI with differential rendering
// Keybinding system
// Theme support (dark/light)
// Overlay system for modals
// stdin buffer handling
```

**Godel Integration Opportunity:**
- Replace Ink with pi-tui for swarmctl
- Better component architecture
- Theme system for consistent UI
- Overlay system for agent details

---

### 4. @mariozechner/pi-coding-agent (Interactive Agent)

**Key Architecture:**
- Modes: interactive, print, rpc
- Extensions system for custom functionality
- Skills system (SKILL.md files)
- Session management with tree structure
- Compaction for context window management
- Tool system (bash, edit, find, grep, etc.)

**Patterns to Extract:**

#### Extension System
```typescript
// Extensions are TypeScript files that hook into events
// Can modify behavior, add UI, intercept messages
// Loaded dynamically from ~/.pi/extensions/

interface Extension {
  onLoad?: () => void;
  onMessage?: (msg: Message) => Message | void;
  onToolCall?: (call: ToolCall) => void;
  // ... many more hooks
}
```

#### Skills System
```typescript
// SKILL.md files with YAML frontmatter
// Define capabilities, commands, templates
// Auto-discovered and loaded

// Example SKILL.md:
---
name: git
emoji: 🔀
description: Git operations
---

Commands:
- /git status
- /git commit
```

#### Session Tree
```typescript
// Sessions form a tree (branches)
// Can navigate, compact, merge
// Serialization for persistence
```

**Godel Integration Opportunity:**
- Extension system for custom agent behaviors
- Skills system for agent capabilities
- Session tree for agent lineage
- Compaction for long-running agents

---

### 5. @mariozechner/pi-mom (Slack Bot)

**Key Patterns:**
- Delegation to pi-coding-agent
- Event handling from Slack
- Message routing

**Less relevant for Godel but shows:**
- Multi-platform integration patterns
- Message delegation architecture

---

## Critical Patterns for Godel

### 1. Agent Runtime (from pi-agent-core)

**What:** Core agent execution loop with event streaming
**Benefit:** Production-grade agent lifecycle management
**Integration:** Replace Godel's basic agent spawning with full runtime

**Key Features:**
- Event-driven architecture
- Tool execution with streaming
- Steering (interrupt) and follow-up (queue)
- State persistence
- Error handling and recovery

### 2. Extension System (from pi-coding-agent)

**What:** Plugin architecture for custom behaviors
**Benefit:** Extensible agent capabilities without core changes
**Integration:** Allow custom agent behaviors in Godel

### 3. Tool System (from pi-agent-core)

**What:** TypeBox-based tool definitions with validation
**Benefit:** Type-safe, validated tool calling
**Integration:** Standardize Godel agent tools

### 4. TUI Components (from pi-tui)

**What:** Terminal UI component library
**Benefit:** Better CLI experience for swarmctl
**Integration:** Replace basic CLI with rich TUI

### 5. Session Management (from pi-coding-agent)

**What:** Tree-structured sessions with persistence
**Benefit:** Agent lineage and history
**Integration:** Track agent relationships in Godel

### 6. Cross-Provider Handoffs (from pi-ai)

**What:** Seamless switching between LLM providers
**Benefit:** Resilience and cost optimization
**Integration:** Already planned in PRD-005

---

## Integration Roadmap

### Phase 1: Agent Runtime (Week 1)
- Integrate pi-agent-core Agent class
- Implement event streaming
- Add tool system

### Phase 2: Extension System (Week 2)
- Port extension loader from pi-coding-agent
- Create extension API for Godel
- Document extension development

### Phase 3: TUI Components (Week 3)
- Replace Ink with pi-tui
- Build dashboard components
- Add real-time monitoring

### Phase 4: Session Management (Week 4)
- Implement session tree
- Add persistence
- Create navigation UI

---

## Files to Study in Detail

### High Priority
1. `packages/agent/src/agent-loop.ts` - Core loop logic
2. `packages/agent/src/agent.ts` - Agent class
3. `packages/agent/src/types.ts` - Type definitions
4. `packages/coding-agent/src/core/extensions/` - Extension system
5. `packages/coding-agent/src/core/skills.ts` - Skills system
6. `packages/tui/src/tui.ts` - TUI architecture

### Medium Priority
7. `packages/coding-agent/src/core/session-manager.ts` - Sessions
8. `packages/coding-agent/src/core/tools/` - Tool implementations
9. `packages/ai/src/stream.ts` - Streaming logic
10. `packages/coding-agent/src/modes/` - Mode implementations

---

## Questions to Answer

1. **How does pi-agent-core handle agent persistence?**
   - Answer: Through SessionManager with tree structure

2. **What's the extension loading mechanism?**
   - Answer: Dynamic import with sandboxed execution

3. **How are tools validated?**
   - Answer: TypeBox schemas with AJV validation

4. **What's the event streaming protocol?**
   - Answer: EventEmitter with typed events

5. **How does compaction work?**
   - Answer: Summarization of old messages

---

## Recommended Actions

1. **Create PRD-006: Agent Runtime Integration**
   - Integrate pi-agent-core into Godel
   - Replace current agent spawning

2. **Create PRD-007: Extension System**
   - Port extension system from pi-coding-agent
   - Create Godel-specific extension API

3. **Create PRD-008: TUI Components**
   - Integrate pi-tui for swarmctl
   - Build monitoring dashboard

4. **Create PRD-009: Session Management**
   - Implement session tree
   - Add persistence layer

5. **Study Key Files**
   - Spawn agents to analyze each package
   - Extract patterns for Godel

---

## Strategic Value Summary

| Pattern | Source | Value | Effort |
|---------|--------|-------|--------|
| Agent Runtime | pi-agent-core | HIGH | 1 week |
| Tool System | pi-agent-core | HIGH | 3 days |
| Extension System | pi-coding-agent | HIGH | 1 week |
| TUI Components | pi-tui | MEDIUM | 1 week |
| Session Tree | pi-coding-agent | MEDIUM | 4 days |
| Skills System | pi-coding-agent | MEDIUM | 3 days |

**Total Strategic Value:** VERY HIGH
**Total Integration Effort:** ~4 weeks
**Impact on Godel:** Transforms from basic orchestrator to production-grade agent platform

---

**Next Steps:**
1. Spawn research agents for each package
2. Create detailed PRDs for integration
3. Prioritize based on Godel roadmap
4. Begin implementation
