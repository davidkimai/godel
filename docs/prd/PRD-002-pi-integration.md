# PRD-002: Pi Core Primitives Integration

**Version:** 1.0.0
**Status:** DRAFT
**Created:** 2026-02-04
**Owner:** Dash v2.0 - Core Integration

## Objective

Integrate `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent` as core primitives of Dash, enabling:
- Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.)
- Production-grade coding agent capabilities
- Session management with tree-structured history
- Extensibility via skills, extensions, and themes

## Background

**Why Pi?**

1. **Mature Ecosystem**: Pi is battle-tested by thousands of developers
2. **Provider Agnostic**: Single API for 20+ LLM providers
3. **Tool Calling**: First-class support for function calling
4. **Cost Tracking**: Built-in token and cost tracking
5. **Context Management**: Serialization and handoffs
6. **Extensible**: Skills, extensions, themes system

**Pi Components to Integrate:**

| Package | Purpose | Version |
|---------|---------|---------|
| `@mariozechner/pi-ai` | Unified LLM API | Latest |
| `@mariozechner/pi-coding-agent` | Coding agent CLI | Latest |
| `@mariozechner/pi-agent-core` | Agent runtime | Latest |

## Scope

### In Scope

1. **pi-ai Integration**
   - Unified model interface
   - Tool calling system
   - Context serialization
   - Cost tracking
   - Provider configuration

2. **pi-coding-agent Integration**
   - SDK embedding
   - Session management
   - Tree-structured history
   - MCP-like extensibility

3. **Dash Integration**
   - Replace custom LLM calls with pi-ai
   - Wrap pi-coding-agent for Dash CLI
   - Share session context between systems
   - Unified authentication

### Out of Scope

- Pi UI components (TUI/Web)
- Pi package system
- Pi RPC mode
- Pi themes/customization

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DASH CORE                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────────┐  │
│  │  Agent Manager  │  │      pi-ai Integration              │  │
│  │                 │  │  ┌───────────────────────────────┐  │  │
│  │ - Spawn agents  │  │  │ UnifiedModel Interface        │  │  │
│  │ - Track state  │  │  │ - getModel(provider, model)   │  │  │
│  │ - Manage tasks │  │  │ - stream(model, context)      │  │  │
│  └─────────────────┘  │  │ - complete(model, context)    │  │  │
│                       │  └───────────────────────────────┘  │  │
│  ┌─────────────────┐  │  ┌───────────────────────────────┐  │  │
│  │  Swarm Manager  │  │  │ Provider Registry             │  │  │
│  │                 │  │  │ - OpenAI, Anthropic, Google  │  │  │
│  │ - Orchestrate  │  │  │ - Groq, Mistral, Cerebras    │  │  │
│  │ - Coordinate   │  │  │ - Custom providers            │  │  │
│  └─────────────────┘  │  └───────────────────────────────┘  │  │
│                       │  ┌───────────────────────────────┐  │  │
│  ┌─────────────────┐  │  │ Tool System                  │  │  │
│  │  Context Mgmt   │  │  │ - TypeBox schemas            │  │  │
│  │                 │  │  │ - Validation, streaming      │  │  │
│  │ - Store, load   │  │  │ - Cross-provider handoff     │  │  │
│  │ - Serialization │  │  └───────────────────────────────┘  │  │
│  └─────────────────┘  └─────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │        pi-coding-agent SDK Integration                 │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ createAgentSession()                            │  │   │
│  │  │ - SessionManager.inMemory()                    │  │   │
│  │  │ - AuthStorage (env vars)                        │  │   │
│  │  │ - ModelRegistry                                 │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ Session Tree                                    │  │   │
│  │  │ - Parent/child relationships                   │  │   │
│  │  │ - Branching and forking                        │  │   │
│  │  │ - Compaction for long sessions                 │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: pi-ai Core Integration

**Tasks:**

1. **Install Dependencies**
   ```bash
   npm install @mariozechner/pi-ai
   npm install @mariozechner/pi-agent-core
   ```

2. **Create Unified Model Interface**
   ```typescript
   // src/llm/unified-model.ts
   import { getModel, stream, complete, Context, Tool } from '@mariozechner/pi-ai';
   
   export interface DashModel {
     provider: string;
     modelId: string;
     capabilities: ModelCapabilities;
   }
   
   export interface ModelCapabilities {
     vision: boolean;
     reasoning: boolean;
     tools: boolean;
     maxTokens: number;
     contextWindow: number;
   }
   
   export class UnifiedModel {
     private model: ReturnType<typeof getModel>;
     
     constructor(provider: string, modelId: string) {
       this.model = getModel(provider, modelId);
     }
     
     async complete(context: Context): Promise<AssistantMessage> {
       return complete(this.model, context);
     }
     
     async *stream(context: Context): AsyncGenerator<StreamEvent> {
       const events = stream(this.model, context);
       for await (const event of events) {
         yield event;
       }
     }
   }
   ```

3. **Implement Provider Configuration**
   ```typescript
   // src/llm/providers.ts
   export interface ProviderConfig {
     name: string;
     apiKey?: string;
     baseUrl?: string;
     authType: 'env' | 'oauth' | 'apiKey';
   }
   
   export const SUPPORTED_PROVIDERS = {
     openai: {
       models: ['gpt-4o', 'gpt-4o-mini', 'gpt-5-mini'],
       envVar: 'OPENAI_API_KEY'
     },
     anthropic: {
       models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
       envVar: 'ANTHROPIC_API_KEY'
     },
     google: {
       models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
       envVar: 'GEMINI_API_KEY'
     },
     groq: {
       models: ['llama-3.1-70b', 'mixtral-8x7b'],
       envVar: 'GROQ_API_KEY'
     },
     // ... more providers
   } as const;
   ```

4. **Tool System Integration**
   ```typescript
   // src/llm/tools.ts
   import { Type, Tool } from '@mariozechner/pi-ai';
   
   export const DASH_TOOLS = {
     read: {
       name: 'read',
       description: 'Read file contents',
       parameters: Type.Object({
         path: Type.String({ description: 'File path to read' }),
         offset: Type.Optional(Type.Number()),
         limit: Type.Optional(Type.Number())
       })
     },
     write: {
       name: 'write',
       description: 'Write content to file',
       parameters: Type.Object({
         path: Type.String({ description: 'Destination file path' }),
         content: Type.String({ description: 'Content to write' })
       })
     },
     edit: {
       name: 'edit',
       description: 'Make precise edits to files',
       parameters: Type.Object({
         path: Type.String({ description: 'File to edit' }),
         oldText: Type.String({ description: 'Text to replace' }),
         newText: Type.String({ description: 'Replacement text' })
       })
     },
     bash: {
       name: 'bash',
       description: 'Execute shell commands',
       parameters: Type.Object({
         command: Type.String({ description: 'Command to execute' }),
         timeout: Type.Optional(Type.Number())
       })
     }
   } satisfies Tool[];
   ```

### Phase 2: Context Management

**Tasks:**

1. **Context Serialization**
   ```typescript
   // src/context/serialization.ts
   import { Context } from '@mariozechner/pi-ai';
   
   export interface DashContext extends Context {
     sessionId: string;
     branchId?: string;
     parentSessionId?: string;
     metadata: SessionMetadata;
   }
   
   export interface SessionMetadata {
     createdAt: number;
     lastActiveAt: number;
     totalTokens: number;
     totalCost: number;
     modelId: string;
     provider: string;
   }
   
   export function serializeContext(context: DashContext): string {
     return JSON.stringify(context);
   }
   
   export function deserializeContext(data: string): DashContext {
     return JSON.parse(data);
   }
   ```

2. **Cross-Provider Handoff**
   ```typescript
   // src/context/handoff.ts
   import { Context, AssistantMessage } from '@mariozechner/pi-ai';
   
   export function transformForNewProvider(
     message: AssistantMessage,
     sourceProvider: string,
     targetProvider: string
   ): AssistantMessage {
     // Convert thinking blocks to tagged text for cross-provider compatibility
     return {
       ...message,
       content: message.content.map(block => {
         if (block.type === 'thinking') {
           return {
             type: 'text',
             text: `<thinking>\n${block.thinking}\n</thinking>`
           };
         }
         return block;
       })
     };
   }
   ```

### Phase 3: pi-coding-agent SDK Integration

**Tasks:**

1. **Session Manager**
   ```typescript
   // src/agent/session-manager.ts
   import {
     AuthStorage,
     createAgentSession,
     ModelRegistry,
     SessionManager
   } from '@mariozechner/pi-coding-agent';
   
   export class DashAgentSession {
     private session: Awaited<ReturnType<typeof createAgentSession>>['session'];
     private authStorage: AuthStorage;
     private modelRegistry: ModelRegistry;
   
     constructor() {
       this.authStorage = new AuthStorage();
       this.modelRegistry = new ModelRegistry(this.authStorage);
     }
   
     async create(): Promise<void> {
       const result = await createAgentSession({
         sessionManager: SessionManager.inMemory(),
         authStorage: this.authStorage,
         modelRegistry: this.modelRegistry,
       });
       this.session = result.session;
     }
   
     async prompt(message: string): Promise<string> {
       return this.session.prompt(message);
     }
   
     async continue(): Promise<string> {
       return this.session.continue();
     }
   }
   ```

2. **Tree-Structured Sessions**
   ```typescript
   // src/agent/tree-session.ts
   import { SessionManager } from '@mariozechner/pi-coding-agent';
   
   export interface SessionNode {
     id: string;
     parentId: string | null;
     messages: Message[];
     children: string[];
   }
   
   export class TreeSessionManager {
     private sessions: Map<string, SessionNode> = new Map();
     private sessionManager: SessionManager;
   
     constructor() {
       this.sessionManager = SessionManager.inMemory();
     }
   
     createBranch(parentId: string): string {
       const parent = this.sessions.get(parentId);
       if (!parent) throw new Error('Parent session not found');
   
       const branchId = crypto.randomUUID();
       this.sessions.set(branchId, {
         id: branchId,
         parentId,
         messages: [],
         children: []
       });
       parent.children.push(branchId);
   
       return branchId;
     }
   
     getHistory(sessionId: string): SessionNode[] {
       const node = this.sessions.get(sessionId);
       if (!node) return [];
   
       const history: SessionNode[] = [];
       let current: SessionNode | undefined = node;
   
       while (current) {
         history.unshift(current);
         current = this.sessions.get(current.parentId!);
       }
   
       return history;
     }
   }
   ```

### Phase 4: Authentication Integration

**Tasks:**

1. **Environment Variable Auth**
   ```typescript
   // src/auth/env-auth.ts
   import { getEnvApiKey } from '@mariozechner/pi-ai';
   
   const PROVIDER_ENV_MAP: Record<string, string> = {
     openai: 'OPENAI_API_KEY',
     anthropic: 'ANTHROPIC_API_KEY',
     google: 'GEMINI_API_KEY',
     groq: 'GROQ_API_KEY',
     mistral: 'MISTRAL_API_KEY',
     cerebras: 'CEREBRAS_API_KEY',
     xai: 'XAI_API_KEY',
     openrouter: 'OPENROUTER_API_KEY',
   };
   
   export function getApiKey(provider: string): string | null {
     const envVar = PROVIDER_ENV_MAP[provider];
     if (!envVar) return null;
     return getEnvApiKey(envVar);
   }
   ```

2. **OAuth Support**
   ```typescript
   // src/auth/oauth.ts
   import {
     loginAnthropic,
     loginGitHubCopilot,
     loginGeminiCli,
     OAuthCredentials
   } from '@mariozechner/pi-ai';
   
   export interface OAuthConfig {
     provider: 'anthropic' | 'github-copilot' | 'gemini-cli';
     onAuth: (url: string, instructions?: string) => void;
     onPrompt: (prompt: { message: string }) => Promise<string>;
     onProgress: (message: string) => void;
   }
   
   export async function loginWithOAuth(config: OAuthConfig): Promise<OAuthCredentials> {
     switch (config.provider) {
       case 'anthropic':
         return loginAnthropic(config);
       case 'github-copilot':
         return loginGitHubCopilot(config);
       case 'gemini-cli':
         return loginGeminiCli(config);
     }
   }
   ```

### Phase 5: Cost Tracking Integration

**Tasks:**

1. **Token and Cost Tracking**
   ```typescript
   // src/cost/tracker.ts
   export interface CostMetrics {
     inputTokens: number;
     outputTokens: number;
     cacheReadTokens: number;
     cacheWriteTokens: number;
     inputCost: number;
     outputCost: number;
     cacheReadCost: number;
     cacheWriteCost: number;
     totalCost: number;
   }
   
   export class CostTracker {
     private sessionCosts: Map<string, CostMetrics> = new Map();
   
     recordUsage(sessionId: string, usage: Usage): void {
       const current = this.sessionCosts.get(sessionId) || {
         inputTokens: 0,
         outputTokens: 0,
         // ... initialize all fields
       };
   
       this.sessionCosts.set(sessionId, {
         inputTokens: current.inputTokens + usage.input,
         outputTokens: current.outputTokens + usage.output,
         totalCost: current.totalCost + usage.cost.total,
         // ... aggregate all fields
       });
     }
   
     getSessionCost(sessionId: string): CostMetrics {
       return this.sessionCosts.get(sessionId) || {
         inputTokens: 0,
         outputTokens: 0,
         totalCost: 0
       };
     }
   
     getTotalCost(): number {
       return Array.from(this.sessionCosts.values())
         .reduce((sum, c) => sum + c.totalCost, 0);
     }
   }
   ```

## File Structure

```
src/
├── llm/
│   ├── index.ts                 # Main exports
│   ├── unified-model.ts         # UnifiedModel class
│   ├── providers.ts             # Provider configuration
│   └── tools.ts                 # Tool definitions
├── context/
│   ├── index.ts
│   ├── serialization.ts         # Context serialization
│   └── handoff.ts              # Cross-provider handoff
├── agent/
│   ├── index.ts
│   ├── session-manager.ts       # DashAgentSession
│   └── tree-session.ts          # Tree-structured sessions
├── auth/
│   ├── index.ts
│   ├── env-auth.ts              # Environment variable auth
│   └── oauth.ts                 # OAuth authentication
└── cost/
    ├── index.ts
    └── tracker.ts              # Cost tracking

tests/
├── llm/
│   ├── unified-model.test.ts
│   └── providers.test.ts
├── context/
│   ├── serialization.test.ts
│   └── handoff.test.ts
├── agent/
│   ├── session-manager.test.ts
│   └── tree-session.test.ts
└── auth/
    └── oauth.test.ts
```

## API Reference

### UnifiedModel

```typescript
class UnifiedModel {
  constructor(provider: string, modelId: string);
  
  // Streaming completion
  async *stream(context: Context): AsyncGenerator<StreamEvent>;
  
  // Full completion
  async complete(context: Context): Promise<AssistantMessage>;
  
  // Context management
  async continue(): Promise<AssistantMessage>;
  
  // Properties
  get capabilities(): ModelCapabilities;
  get provider(): string;
  get modelId(): string;
}
```

### DashAgentSession

```typescript
class DashAgentSession {
  constructor(options?: SessionOptions);
  
  // Create new session
  async create(): Promise<void>;
  
  // Send prompt
  async prompt(message: string): Promise<string>;
  
  // Continue from last point
  async continue(): Promise<string>;
  
  // Branch from current point
  async branch(name?: string): Promise<DashAgentSession>;
  
  // Get session tree
  getTree(): SessionTree;
  
  // Export session
  export(format: 'json' | 'jsonl' | 'html'): string;
}
```

### CostTracker

```typescript
class CostTracker {
  // Record usage for a session
  recordUsage(sessionId: string, usage: Usage): void;
  
  // Get cost for a session
  getSessionCost(sessionId: string): CostMetrics;
  
  // Get total cost across all sessions
  getTotalCost(): number;
  
  // Reset tracker
  reset(): void;
}
```

## Dependencies

```json
{
  "dependencies": {
    "@mariozechner/pi-ai": "^1.0.0",
    "@mariozechner/pi-coding-agent": "^1.0.0",
    "@mariozechner/pi-agent-core": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

## Testing Strategy

### Unit Tests (80% coverage target)

| Module | Tests | Coverage |
|--------|-------|----------|
| UnifiedModel | 15 | 100% |
| Provider Config | 10 | 100% |
| Tools | 12 | 100% |
| Context Serialization | 8 | 100% |
| Cost Tracker | 10 | 100% |
| **Total** | **55** | **80%** |

### Integration Tests

1. **Provider Integration Tests**
   - OpenAI model selection and completion
   - Anthropic model with tools
   - Google Gemini with reasoning
   - Cross-provider handoff

2. **Session Tests**
   - Create session
   - Branch and fork
   - Compact long session
   - Serialize/deserialize

3. **Cost Tracking Tests**
   - Token counting
   - Cost calculation
   - Session aggregation

## Success Criteria

- [ ] pi-ai installed and configured
- [ ] UnifiedModel implements full API
- [ ] All 4 core tools (read, write, edit, bash) functional
- [ ] Context serialization works
- [ ] Cross-provider handoff functional
- [ ] DashAgentSession wraps pi-coding-agent SDK
- [ ] Tree-structured sessions implemented
- [ ] Cost tracking integrated
- [ ] 80% test coverage
- [ ] All PRD-002 tests pass

## Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1 | 2 hours | Install, UnifiedModel, Providers |
| Phase 2 | 1 hour | Context serialization |
| Phase 3 | 2 hours | SDK integration, Sessions |
| Phase 4 | 1 hour | Authentication |
| Phase 5 | 1 hour | Cost tracking |
| Testing | 2 hours | Unit + integration tests |
| **Total** | **9 hours** | |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-------------|
| pi-ai API changes | High | Pin to specific version, use abstraction layer |
| OAuth complexity | Medium | Start with API key auth, add OAuth later |
| Test coverage | Medium | Prioritize critical paths, incremental coverage |
| Performance | Low | Benchmark streaming vs complete |

## Open Questions

1. Should we support all pi-ai providers or a subset?
2. How to handle provider-specific options (thinking, etc.)?
3. Should we integrate pi's compaction strategy?
4. How to sync Dash session context with pi sessions?

## References

- [pi-ai README](https://github.com/badlogic/pi-mono/tree/main/packages/ai)
- [pi-coding-agent README](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
- [pi-agent-core package](https://www.npmjs.com/package/@mariozechner/pi-agent)
