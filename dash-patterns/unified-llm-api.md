# Pattern: Unified LLM API with Provider Registry

**Source:** `packages/ai/src/types.ts`, `packages/ai/src/stream.ts`, `packages/ai/src/api-registry.ts`  
**Category:** LLM Integration  
**Complexity:** Medium-High

## Pattern Description

A unified API layer that abstracts multiple LLM providers (OpenAI, Anthropic, Google, etc.) behind a single interface. The registry pattern maps provider names to implementations, allowing seamless switching between providers.

## Code Example

```typescript
// Unified Model type
type Model<ApiType extends KnownApi = KnownApi> = {
  id: string;
  name: string;
  api: ApiType;
  provider: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
  input: ('text' | 'image')[];
};

// Provider registry
const providers: Record<string, ProviderImplementation> = {
  'anthropic': anthropicProvider,
  'openai': openaiProvider,
  'google': googleProvider,
  'kimi': kimiProvider,
};

// Single unified API
function stream<Api extends KnownApi>(
  model: Model<Api>,
  context: Context,
  options?: StreamOptions<Api>
): AssistantMessageEventStream {
  const provider = providers[model.provider];
  return provider.stream(model, context, options);
}

// Usage - same API for any provider
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');
const gpt5 = getModel('openai', 'gpt-5-mini');
const kimi = getModel('kimi', 'kimi-k2-0905-preview');

const stream1 = stream(claude, context);  // Works
const stream2 = stream(gpt5, context);    // Works
const stream3 = stream(kimi, context);    // Works
```

## Key Components

| Component | Purpose |
|-----------|---------|
| **Model Type** | Unified model metadata (cost, context, capabilities) |
| **Provider Registry** | Maps provider name to implementation |
| **Stream Function** | Single entry point for all providers |
| **Context Type** | Serializable conversation context |

## Supported Providers

| Provider | API | Models |
|----------|-----|--------|
| Anthropic | anthropic-messages | Claude 3.5, 4 |
| OpenAI | openai-responses | GPT-4, GPT-5, Codex |
| Google | google-generative-ai | Gemini 1.5, 2.0, 2.5 |
| Kimi | openai-completions | K2, K2.5 |
| Groq | openai-completions | Llama, Mixtral |
| Cerebras | openai-completions | GPT-OSS |

## Benefits for Dash

1. **Provider Agnostic** - Switch providers without code changes
2. **Cost Tracking** - Built-in cost per model
3. **Token Tracking** - Automatic usage reporting
4. **Cross-Provider Handoffs** - Switch models mid-conversation
5. **Unified Tool Calling** - Same tools work across providers

## How to Apply to Dash

```typescript
// Current: OpenClaw Gateway for all LLM calls
// Target: pi-ai for direct LLM access, OpenClaw for orchestration

import { getModel, stream, Context } from '@mariozechner/pi-ai';

// Unified LLM access
async function queryLLM(prompt: string, provider: string = 'kimi'): Promise<string> {
  const model = getModel(provider, 'kimi-k2-0905-preview');
  
  const context: Context = {
    messages: [{ role: 'user', content: prompt }],
    tools: [],
  };
  
  const response = await stream(model, context);
  
  for await (const event of response) {
    if (event.type === 'text_delta') {
      process.stdout.write(event.delta);
    }
  }
  
  return response.result().content;
}

// Cost tracking example
const response = await complete(model, context);
console.log(`Cost: $${response.usage.cost.total.toFixed(4)}`);
console.log(`Tokens: ${response.usage.input} in, ${response.usage.output} out`);
```

## Migration Path

| Phase | Provider | Effort |
|-------|----------|--------|
| 1 | Kimi (existing) | Low - just configuration |
| 2 | Anthropic | Medium - verify tool calling |
| 3 | OpenAI | Medium - verify Codex models |
| 4 | Cross-provider handoffs | High - architecture change |

## Related Patterns

- [Provider Registry](#provider-registry)
- [Context Serialization](#context-serialization)
