# PI-MONO PRIMITIVES FOR GODEL

> Core primitives from pi-mono (https://github.com/badlogic/pi-mono) that should be incorporated into Godel as core capabilities.

## Overview

Pi-mono provides powerful primitives for building AI coding agents. These should be core to Godel:

1. **Unified Multi-Provider LLM API** - `@mariozechner/pi-ai`
2. **Stateful Agent Core** - `@mariozechner/pi-agent-core`
3. **Terminal Coding Harness** - `@mariozechner/pi-coding-agent`

---

## 1. UNIFIED LLM API (`@mariozechner/pi-ai`)

### Multi-Provider Support

| Provider | Description |
|----------|-------------|
| **OpenAI** | GPT-4, o-series with Responses API |
| **Anthropic** | Claude with Messages API |
| **Google** | Gemini via Generative AI |
| **Azure OpenAI** | Enterprise deployments |
| **Mistral** | OpenAI-compatible |
| **Groq** | Fast inference |
| **Cerebras** | High-speed inference |
| **xAI** | Grok models |
| **OpenRouter** | Unified gateway |
| **Vercel AI Gateway** | Multi-provider proxy |
| **MiniMax** | Cost-effective |
| **Kimi for Coding** | Moonshot AI (Anthropic-compatible) |
| **Amazon Bedrock** | AWS hosted models |
| **GitHub Copilot** | OAuth-based |
| **Google Gemini CLI** | Free/paid tiers |
| **Antigravity** | Free tier gateway |

### Key Features

#### Model Discovery & Type Safety
```typescript
import { getModel, getProviders, getModels } from '@mariozechner/pi-ai';

// Auto-complete for providers and models
const model = getModel('anthropic', 'claude-sonnet-4-20250514');

// Query available providers/models
const providers = getProviders();
const models = getModels('openai');
```

#### Context Serialization
```typescript
// Easily serializable context for persistence/transfer
const context: Context = {
  systemPrompt: 'You are helpful.',
  messages: [{ role: 'user', content: 'Hello' }],
  tools: [...]
};

// JSON.stringify/parse works seamlessly
const serialized = JSON.stringify(context);
```

#### Cross-Provider Handoffs
```typescript
// Seamless switching between providers mid-conversation
const claude = getModel('anthropic', 'claude-sonnet-4');
const gpt5 = getModel('openai', 'gpt-5-mini');

// Thinking blocks automatically converted to text for cross-provider
```

#### Streaming with Events
```typescript
const stream = stream(model, context);

for await (const event of stream) {
  switch (event.type) {
    case 'text_delta': process.stdout.write(event.delta); break;
    case 'toolcall_start': console.log('Tool called'); break;
    case 'thinking_delta': process.stdout.write(event.delta); break;
    case 'done': console.log('Complete'); break;
  }
}
```

#### TypeBox Tool Definitions
```typescript
import { Type, Tool } from '@mariozechner/pi-ai';

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get current weather',
  parameters: Type.Object({
    location: Type.String(),
    units: StringEnum(['celsius', 'fahrenheit'])
  })
};
```

#### Token & Cost Tracking
```typescript
// Usage included in every response
const response = await complete(model, context);
console.log(response.usage.input, response.usage.output);
console.log(response.usage.cost.total); // Tracked per-provider
```

#### Abort & Continue
```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

const stream = stream(model, context, { signal: controller.signal });

// Continue after abort
context.messages.push(partialResponse);
context.messages.push({ role: 'user', content: 'Continue' });
```

---

## 2. AGENT CORE (`@mariozechner/pi-agent-core`)

### Agent Architecture

```typescript
import { Agent } from '@mariozechner/pi-agent-core';

const agent = new Agent({
  initialState: {
    systemPrompt: 'You are a helpful coding assistant.',
    model: getModel('anthropic', 'claude-sonnet-4'),
    tools: [readTool, writeTool, bashTool],
    messages: []
  },
  // Optional hooks
  transformContext: async (messages) => pruneOld(messages),
  convertToLlm: (messages) => messages.filter(isLlmMessage),
  steeringMode: 'one-at-a-time',
  followUpMode: 'one-at-a-time'
});

// Subscribe to all events
agent.subscribe((event) => {
  if (event.type === 'message_update') {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt('Fix this bug');
```

### Event Types

| Event | Description |
|-------|-------------|
| `agent_start` | Agent begins |
| `turn_start` | New LLM call + tools |
| `message_start` | Message begins |
| `message_update` | Streaming chunks (assistant only) |
| `message_end` | Message complete |
| `tool_execution_start` | Tool begins |
| `tool_execution_update` | Tool streams progress |
| `tool_execution_end` | Tool completes |
| `turn_end` | Turn complete with tool results |
| `agent_end` | All processing done |

### Steering & Follow-up

```typescript
// Steering: interrupt current work
agent.steer({
  role: 'user',
  content: 'Stop and do this instead!'
});

// Follow-up: queue after current work
agent.followUp({
  role: 'user',
  content: 'Also summarize the results.'
});
```

### Tool Definition Pattern

```typescript
const readTool: AgentTool = {
  name: 'read_file',
  label: 'Read File',
  description: 'Read file contents',
  parameters: Type.Object({
    path: Type.String({ description: 'File path' })
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const content = await fs.readFile(params.path, 'utf-8');
    return {
      content: [{ type: 'text', text: content }],
      details: { path: params.path, size: content.length }
    };
  }
};
```

---

## 3. CODING AGENT PRIMITIVES

### Terminal UI Features

- **Session Tree** - Navigate and branch conversation history
- **Message Queue** - Steering/follow-up while agent works
- **File References** - Type `@` to fuzzy-search files
- **Compaction** - Automatic context summarization

### Extension System

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: 'deploy', ... });
  pi.registerCommand('stats', { ... });
  pi.on('tool_call', async (event, ctx) => { ... });
}
```

### Skills System

```markdown
<!-- ~/.pi/agent/skills/my-skill/SKILL.md -->
# My Skill
Use this skill when the user asks about X.

## Steps
1. Do this
2. Then that
```

### Context Files

```
~/.pi/agent/AGENTS.md      # Global instructions
/path/to/project/AGENTS.md  # Project-specific
```

---

## RECOMMENDED INTEGRATION FOR GODEL

### Priority 1: Core LLM Abstraction

Replace current LLM integration with pi-ai pattern:

```
src/llm/
├── providers/           # Multi-provider support
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── google.ts
│   └── ...
├── model-registry.ts    # Model discovery
├── context.ts           # Serializable context
└── tools/              # TypeBox tool definitions
```

### Priority 2: Agent Core

Implement pi-agent-core patterns:

```
src/agent/
├── Agent.ts            # Core agent class
├── events.ts           # Event streaming
├── tools/             # Built-in tools
│   ├── read.ts
│   ├── write.ts
│   ├── edit.ts
│   └── bash.ts
└── steering.ts        # Interrupt/continue
```

### Priority 3: Orchestration Extensions

```
src/orchestration/
├── sessions/          # Tree-based sessions
├── queue.ts          # Message queue
├── compaction.ts      # Context summarization
└── extensions/       # Plugin system
```

---

## KEY DIFFERENTIATORS

| Feature | Pi-Mono Approach | Godel Should Adopt |
|---------|-----------------|------------------|
| **Multi-Provider** | Unified API with auto-discovery | ✅ Core |
| **Context Serialization** | JSON-native | ✅ Core |
| **Cross-Provider Handoffs** | Auto-convert thinking blocks | ✅ Important |
| **Streaming Events** | Granular event types | ✅ Core |
| **TypeBox Tools** | Type-safe tool definitions | ✅ Core |
| **Abort/Continue** | First-class support | ✅ Core |
| **Steering** | Interrupt while working | ✅ Important |
| **Session Tree** | Single-file branching | ✅ Core |
| **Extensions** | Full plugin system | ✅ Later |
| **Skills** | Reusable capability packages | ✅ Later |

---

## REFERENCES

- Pi-Mono: https://github.com/badlogic/pi-mono
- Pi-AI (LLM API): https://github.com/badlogic/pi-mono/tree/main/packages/ai
- Pi-Agent-Core: https://github.com/badlogic/pi-mono/tree/main/packages/agent
- Pi-Coding-Agent: https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
