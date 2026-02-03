# pi-mono Assessment for Dash v2.0 Integration

**Date:** 2026-02-02  
**Repo:** https://github.com/badlogic/pi-mono  
**Cloned to:** `/Users/jasontang/clawd/projects/pi-mono`

---

## Executive Summary

**pi-mono is a production-grade AI agent toolkit** by badlogic (Mario Zechner). It provides:

| Component | Description | Relevance to Dash |
|-----------|-------------|-------------------|
| **@mariozechner/pi-ai** | Unified multi-provider LLM API | ⭐⭐⭐⭐⭐ Direct replacement for our LLM layer |
| **@mariozechner/pi-agent-core** | Agent runtime with tool execution | ⭐⭐⭐⭐⭐ Event streaming, tool calling patterns |
| **@mariozechner/pi-coding-agent** | Interactive coding agent CLI | ⭐⭐⭐⭐⭐ Sessions, TUI, skills system |
| **@mariozechner/pi-tui** | Terminal UI library | ⭐⭐⭐ Useful for Dash CLI |
| **@mariozechner/pi-mom** | Slack bot integration | ⭐⭐ Could integrate with OpenClaw |
| **@mariozechner/pi-pods** | vLLM deployment CLI | ⭐ Future GPU pod consideration |

**Recommendation:** ✅ **Highly valuable - extract strategic patterns and integrate with Dash**

---

## Key Architecture Patterns

### 1. Event Streaming Architecture

**pi-agent-core** uses granular event streaming for real-time UI updates:

```
agent_start → turn_start → message_start → message_update* → message_end → 
tool_execution_start → tool_execution_update* → tool_execution_end → 
turn_end → agent_end
```

**Dash Comparison:** Our `src/core/autonomous-state.ts` could adopt this pattern for better observability.

### 2. Unified LLM API Layer

**pi-ai** supports 15+ providers with a unified interface:

```typescript
// Single API, any provider
const model = getModel('anthropic', 'claude-sonnet-4-20250514');
const model = getModel('openai', 'gpt-5-mini');
const model = getModel('kimi', 'kimi-k2-0905-preview');  // ✅ Already supported!

const stream = stream(model, context);
for await (const event of stream) {
  // Unified events: text_delta, tool_call, thinking_delta, usage, etc.
}
```

**Dash Integration Opportunity:** Replace our current LLM handling with pi-ai for:
- ✅ Kimi/K2P5 support (already built-in)
- ✅ Cross-provider handoffs (switch models mid-session)
- ✅ Token/cost tracking (built-in)
- ✅ Context serialization (built-in)

### 3. Tool System with TypeBox

Tools are defined with TypeBox schemas for type-safe validation:

```typescript
import { Type } from '@sinclair/typebox';

const readFileTool: AgentTool = {
  name: "read_file",
  description: "Read a file's contents",
  parameters: Type.Object({
    path: Type.String({ description: "File path" }),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // Tool execution with optional streaming progress
    return { content: [{ type: "text", text: content }] };
  },
};
```

**Dash Integration Opportunity:** Adopt TypeBox for our tool definitions. Benefits:
- Type-safe tool arguments
- Automatic validation before execution
- JSON serializable for distributed systems

### 4. Context Transformation Pipeline

```
AgentMessage[] → transformContext() → prune/compact → convertToLlm() → Message[]
```

**This matches our Context Optimization V2:**
- `transformContext()` = Our `context-summarizer.js`
- `convertToLlm()` = Our `context-injector.js`

**Dash could adopt:** `transformContext` for dynamic context pruning based on token limits.

### 5. Steering & Follow-up Modes

Unique feature for real-time agent control:

```typescript
// While agent is running tools, interrupt it
agent.steer({
  role: "user",
  content: "Stop! Do this instead.",
});

// Queue work for after current work completes
agent.followUp({
  role: "user",
  content: "Also do X.",
});
```

**Dash Integration Opportunity:** Implement steering for cron job interventions.

### 6. Cross-Provider Handoffs

Seamlessly switch LLM providers mid-conversation:

```typescript
// Start with Claude for reasoning
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');
context.messages.push(await complete(claude, context));

// Switch to GPT-5 for speed - thinking blocks auto-convert
const gpt5 = getModel('openai', 'gpt-5-mini');
context.messages.push(await complete(gpt5, context));

// Switch to Gemini for image handling
const gemini = getModel('google', 'gemini-2.5-flash');
context.messages.push(await complete(gemini, context));
```

**Dash Integration Opportunity:** Use fast model (Kimi K2) for simple tasks, Claude for complex reasoning.

---

## Strategic Patterns to Extract

### Pattern 1: Event-Driven Agent Loop

**From:** `packages/agent/src/agent-loop.ts`

**Dash could implement:**
```typescript
// Unified event emitter for all agent operations
for await (const event of agentLoop(userMessage, context, config)) {
  switch (event.type) {
    case 'turn_start': logTurnStart();
    case 'tool_execution_start': emit('tool:start', event);
    case 'tool_execution_end': emit('tool:end', event);
    case 'turn_end': emit('turn:complete', event);
  }
}
```

**Benefit:** Better observability for swarm orchestration.

### Pattern 2: Provider Registry

**From:** `packages/ai/src/api-registry.ts`

**Dash could implement:**
```typescript
// Registry of LLM providers with consistent interface
const providers = {
  'anthropic': { stream: streamAnthropic, models: [...] },
  'openai': { stream: streamOpenAI, models: [...] },
  'kimi': { stream: streamKimi, models: [...] },  // Our addition
};

function getProvider(provider: string) {
  return providers[provider];
}
```

**Benefit:** Swap LLM providers without code changes.

### Pattern 3: Session Management with Branching

**From:** `packages/coding-agent/` - Sessions with branching

**Dash could implement:**
```
Session: "coverage"
  ├── Branch: "main"
  ├── Branch: "feature/add-tests"  (fork from main)
  └── Branch: "fix/failing-test"   (fork from feature branch)
```

**Benefit:** Track swarm work in branches, merge successful results.

### Pattern 4: Skills System

**From:** `packages/coding-agent/` - Skills directory

**Structure:**
```
skills/
├── skill-name/
│   ├── SKILL.md          # Skill documentation
│   └── implementation.ts # Skill code
```

**Dash could implement:** Similar skills system for swarm capabilities.

---

## Direct Integration Opportunities

### 1. Replace LLM Layer with pi-ai

**Current Dash:**
```typescript
// Our current approach - custom handling per provider
async function queryLLM(prompt: string) {
  // Custom implementation per provider
}
```

**With pi-ai:**
```typescript
import { getModel, complete, Context } from '@mariozechner/pi-ai';

const model = getModel('kimi', 'kimi-k2-0905-preview');
const response = await complete(model, context);
```

**Migration Effort:** Medium (2-3 days)
- Replace all LLM calls with pi-ai
- Update tool definitions to TypeBox
- Add pi-ai to dependencies

### 2. Adopt Event Streaming

**Migration Effort:** Low (1 day)
- Add event emitter to `autonomous-state.ts`
- Emit events for: swarm_start, swarm_progress, swarm_complete, error
- Integrate with cron monitoring

### 3. Implement Tool System

**Migration Effort:** Medium (2 days)
- Define core tools (read, write, edit, exec, test) with TypeBox
- Add tool validation before execution
- Implement streaming tool execution

### 4. Use Cross-Provider Handoffs

**Migration Effort:** Low (1 day)
- Configure multiple providers (Kimi, Claude, GPT)
- Implement decision logic for provider selection
- Test handoff between providers

---

## Code Comparison: Dash vs pi-mono

| Aspect | Dash v2.0 | pi-mono | Winner |
|--------|-----------|---------|--------|
| **LLM Providers** | Kimi only | 15+ | pi-mono |
| **Tool System** | Custom (Node.js) | TypeBox + AJV | pi-mono |
| **Event Streaming** | Basic callbacks | Granular events | pi-mono |
| **Sessions** | Process-based | Branch + compact | pi-mono |
| **Context Management** | Custom JSON | Serialized Context | pi-mono |
| **Cost Tracking** | None | Built-in | pi-mono |
| **Skills System** | SKILL.md files | Full system | pi-mono |
| **Cron Integration** | ✅ Custom | ❌ Not applicable | Dash |

**Conclusion:** pi-mono excels at agent runtime. Dash excels at autonomous orchestration. Combining them is powerful.

---

## Recommended Integration Strategy

### Phase 1: Extract Patterns (This Week)

- [ ] Study `packages/agent/src/agent-loop.ts` for event patterns
- [ ] Study `packages/ai/src/types.ts` for unified API design
- [ ] Create `dash-patterns/` directory with extracted patterns
- [ ] Document pattern usage in `PATTERNS.md`

### Phase 2: Adopt pi-ai (Next Sprint)

- [ ] Add `@mariozechner/pi-ai` to Dash dependencies
- [ ] Replace `src/core/llm.ts` with pi-ai integration
- [ ] Add TypeBox tool definitions
- [ ] Implement cost tracking

### Phase 3: Integrate Agent Core (This Month)

- [ ] Create `src/core/swarm-agent.ts` using pi-agent-core patterns
- [ ] Add event streaming to swarm lifecycle
- [ ] Implement cross-provider handoffs for swarm tasks
- [ ] Add steering mode for cron interventions

### Phase 4: Long-term Alignment

- [ ] Align Dash session system with pi-coding-agent patterns
- [ ] Consider skills system for swarm capabilities
- [ ] Evaluate pi-tui for Dash CLI future

---

## Files to Study First

| Priority | File | Purpose |
|----------|------|---------|
| 🔴 High | `packages/agent/src/agent.ts` | Agent core patterns |
| 🔴 High | `packages/agent/src/agent-loop.ts` | Event streaming |
| 🔴 High | `packages/ai/src/types.ts` | Unified API types |
| 🟡 Medium | `packages/ai/src/stream.ts` | Streaming interface |
| 🟡 Medium | `packages/coding-agent/src/main.ts` | CLI orchestration |
| 🟢 Low | `packages/tui/src/` | TUI library (future) |

---

## Comparison with OpenClaw

Interestingly, the pi-coding-agent README mentions:
> "See [openclaw/openclaw](https://github.com/openclaw/openclaw) for a real-world SDK integration."

This means **OpenClaw uses pi-mono** as its foundation! We have direct access to how OpenClaw integrates pi-mono.

**Investigation needed:** Check OpenClaw's integration patterns for Dash.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| **Dependency on pi-mono** | pi-mono is well-maintained (active commits, 300+ stars) |
| **Learning curve** | TypeBox, AJV, event patterns - invest 1 week in understanding |
| **Migration effort** | Phased approach - don't rewrite, extract patterns incrementally |
| **Kimi API compatibility** | pi-ai already supports Kimi for Coding via Anthropic-compatible API |

---

## Conclusion

**pi-mono is a goldmine for Dash architecture patterns.**

| Dimension | Assessment |
|-----------|------------|
| **Architecture Quality** | ⭐⭐⭐⭐⭐ Production-grade |
| **Relevance to Dash** | ⭐⭐⭐⭐⭐ Highly relevant |
| **Integration Effort** | ⭐⭐⭐ Medium (phased approach recommended) |
| **Strategic Value** | ⭐⭐⭐⭐⭐ Eliminates 3-6 months of custom development |

**Next Steps:**
1. ✅ Repository cloned to `projects/pi-mono`
2. ⬜ Study key files (agent.ts, agent-loop.ts, types.ts)
3. ⬜ Create `dash-patterns/` with extracted code
4. ⬜ Plan pi-ai integration for Sprint 1
5. ⬜ Document integration plan

**Final Recommendation:** Proceed with integration - the architectural patterns in pi-mono will significantly accelerate Dash development and improve quality.

---

## Quick Start for Dash Team

```bash
# Explore pi-mono
cd /Users/jasontang/clawd/projects/pi-mono

# Read the key documentation
cat packages/agent/README.md
cat packages/ai/README.md
cat packages/coding-agent/README.md | head -100

# Build the project (optional - see patterns)
npm install && npm run build
```
