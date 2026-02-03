# pi-ai Integration Plan for Dash v2.0

**Date:** 2026-02-02  
**Status:** Planning  
**Sprint:** Sprint 1

## Executive Summary

Integrate `@mariozechner/pi-ai` into Dash v2.0 to replace custom LLM handling with a unified, multi-provider API. This enables:
- Direct LLM access (bypassing OpenClaw Gateway when needed)
- Built-in cost/token tracking
- Cross-provider handoffs (Kimi → Claude → GPT-5)
- Better tool calling with TypeBox schemas

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DASH V2.0                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  src/core/                                                  │
│  ├── llm.ts              ← Custom LLM wrapper              │
│  ├── decision-engine.ts  ← Decision making                 │
│  └── autonomous-state.ts ← State management                │
│                                                             │
│  src/integrations/openclaw/                                │
│  ├── GatewayClient.ts     ← WebSocket to OpenClaw          │
│  ├── SessionManager.ts    ← Session lifecycle              │
│  └── AgentExecutor.ts     ← Agent control                  │
│                                                             │
│  SWARMS                                                     │
│  ├── Coverage Swarm      ← npm test, coverage analysis     │
│  ├── Quality Swarm       ← Code quality checks             │
│  └── ...                                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DASH V2.0                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  src/core/                                                  │
│  ├── llm.ts              ← Wrapper around pi-ai            │
│  ├── decision-engine.ts  ← Enhanced with pi-ai             │
│  └── autonomous-state.ts ← Event-driven state              │
│                                                             │
│  src/integrations/                                          │
│  ├── openclaw/           ← Still used for orchestration    │
│  └── pi-ai/              ← NEW: Direct LLM access          │
│                                                             │
│  SWARMS                                                     │
│  ├── Coverage Swarm      ← Uses pi-ai for LLM              │
│  ├── Quality Swarm       ← Uses pi-ai for LLM              │
│  └── ...                                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Integration Benefits

| Feature | Current | With pi-ai |
|---------|---------|------------|
| **LLM Providers** | OpenClaw only | 15+ providers |
| **Cost Tracking** | Manual | Built-in |
| **Token Tracking** | Manual | Built-in |
| **Tool Calling** | Custom | TypeBox + AJV |
| **Cross-Provider** | None | Native support |
| **Streaming** | WebSocket | Native async |
| **Context Serialization** | Custom JSON | Built-in |

## Migration Plan

### Phase 1: Setup (Sprint 1, Week 1)

**Tasks:**
- [ ] Add `@mariozechner/pi-ai` to dependencies
- [ ] Configure Kimi provider (existing)
- [ ] Test basic streaming with Kimi K2P5
- [ ] Create `src/integrations/pi-ai/index.ts`

**Deliverables:**
```
src/integrations/pi-ai/
├── index.ts           # Main export
├── client.ts          # pi-ai client wrapper
├── providers.ts       # Provider configuration
└── tools.ts           # TypeBox tool definitions
```

**Estimated Effort:** 2-3 hours

### Phase 2: Core Integration (Sprint 1, Week 2)

**Tasks:**
- [ ] Create TypeBox tool definitions for Dash tools
  - `read_file`, `write_file`, `edit_file`, `bash`
- [ ] Implement `DashLLM` class wrapping pi-ai
- [ ] Add cost tracking to swarm execution
- [ ] Create context serialization utilities
- [ ] Write integration tests

**Deliverables:**
- `src/core/dash-llm.ts` - Main LLM interface
- `src/core/tools.ts` - TypeBox tool definitions
- `tests/unit/llm.test.ts` - LLM tests
- `tests/integration/pi-ai.test.ts` - Integration tests

**Estimated Effort:** 1 day

### Phase 3: Cross-Provider Handoffs (Sprint 2, Week 1)

**Tasks:**
- [ ] Configure additional providers (Anthropic, OpenAI)
- [ ] Implement provider selection logic
- [ ] Create handoff utilities
- [ ] Add fallback provider support
- [ ] Test handoff scenarios

**Deliverables:**
- `src/core/provider-registry.ts` - Provider management
- `src/core/handoff.ts` - Cross-provider handoffs

**Estimated Effort:** 1 day

### Phase 4: OpenClaw Integration (Sprint 2, Week 2)

**Tasks:**
- [ ] Keep OpenClaw for orchestration features
- [ ] Add option to bypass OpenClaw for LLM calls
- [ ] Create hybrid mode (OpenClaw + pi-ai)
- [ ] Document migration path for full pi-ai

**Deliverables:**
- `src/integrations/hybrid.ts` - Hybrid OpenClaw/pi-ai mode
- `MIGRATION.md` - Guide for switching modes

**Estimated Effort:** 2 days

## Tool Definition Example

```typescript
import { Type } from '@sinclair/typebox';

const readFileTool = {
  name: 'read_file',
  description: 'Read a file\'s contents',
  parameters: Type.Object({
    path: Type.String({ description: 'File path to read' }),
    encoding: Type.Optional(Type.String({ 
      description: 'File encoding (default: utf-8)',
      default: 'utf-8'
    })),
  }),
};

// Tool execution
async function executeReadFile(params: { path: string; encoding?: string }) {
  const content = await fs.promises.readFile(params.path, params.encoding);
  return {
    content: [{ type: 'text' as const, text: content }],
    details: { path: params.path, size: content.length },
  };
}
```

## Cost Tracking Example

```typescript
import { getModel, complete } from '@mariozechner/pi-ai';

const model = getModel('kimi', 'kimi-k2-0905-preview');

const response = await complete(model, {
  messages: [{ role: 'user', content: 'Hello' }],
});

console.log({
  inputTokens: response.usage.input,
  outputTokens: response.usage.output,
  cost: response.usage.cost.total,
  cached: response.usage.cacheRead > 0,
});
```

## Cross-Provider Handoff Example

```typescript
// Start with fast model
const kimi = getModel('kimi', 'kimi-k2-0905-preview');
const context1 = { messages: [{ role: 'user', content: 'Quick question' }] };
const response1 = await complete(kimi, context1);

// Switch to smart model for complex reasoning
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');
context1.messages.push(response1);
context1.messages.push({ role: 'user', content: 'Elaborate on this...' });
const response2 = await complete(claude, context1);

// Claude sees Claude's thinking as <thinking> tags automatically
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **API Keys** | High | Use env vars, rotate keys regularly |
| **Provider Outages** | Medium | Fallback providers configured |
| **Cost Overruns** | Medium | Budget limits and alerts |
| **Tool Schema Mismatch** | Low | TypeBox validation prevents errors |
| **Performance Regression** | Low | Benchmark before/after |

## Testing Strategy

### Unit Tests
- Tool definition validation
- Context serialization
- Cost calculation

### Integration Tests
- Provider connectivity
- Streaming responses
- Cross-provider handoffs
- Tool execution

### E2E Tests
- Swarm execution with pi-ai
- Cost tracking accuracy
- Error handling

## Success Metrics

| Metric | Target |
|--------|--------|
| **Build Time** | < 5 sec increase |
| **Token Cost** | < $0.01 per typical query |
| **Response Latency** | < 2 sec for streaming start |
| **Test Coverage** | > 80% for LLM module |
| **Provider Uptime** | > 99% |

## Resources

- **pi-ai Documentation:** `/Users/jasontang/clawd/projects/pi-mono/packages/ai/README.md`
- **pi-mono Source:** `/Users/jasontang/clawd/projects/pi-mono/packages/`
- **TypeBox Docs:** https://github.com/sinclairzx81/typebox

## Next Steps

1. Review this plan with the team
2. Create Sprint 1 backlog
3. Set up development environment
4. Begin Phase 1 implementation
