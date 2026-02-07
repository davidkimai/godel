# OpenClaw Core Primitive Architecture

## Overview

OpenClaw has been transformed from a "bolted-on" integration to a **core primitive** of the Godel system. This document describes the architecture and usage patterns.

## Architecture Philosophy

```
Before (bolted on):
  Agents → Optional Integration → OpenClaw Gateway
  
After (core primitive):
  Agents → Core Primitive → Always Available
```

### Key Principles

1. **Initialized at Startup**: OpenClaw is initialized during system startup, not lazily
2. **Always Connected**: Maintains persistent WebSocket connection to Gateway
3. **Available to All Agents**: Every agent has automatic access to OpenClaw tools
4. **Transparent Session Management**: Sessions are automatically created and mapped
5. **Direct Tool Access**: Agents can invoke any OpenClaw tool directly

## File Structure

```
src/
├── core/
│   ├── index.ts           # Exports all core primitives
│   ├── lifecycle.ts       # Initializes OpenClaw at startup
│   ├── team.ts           # Uses OpenClaw through lifecycle
│   └── openclaw.ts        # Core primitive (moved from integrations/)
├── integrations/
│   └── openclaw/          # Legacy directory (types only)
│       └── types.ts       # Gateway protocol types
```

## Core Components

### 1. OpenClawCore (src/core/openclaw.ts)

The main core primitive class that provides:

```typescript
class OpenClawCore {
  // Initialization (called at startup)
  async initialize(): Promise<void>
  async connect(): Promise<void>
  
  // Session Management
  async spawnSession(options: SessionSpawnOptions): Promise<string>
  async killSession(agentId: string, force?: boolean): Promise<void>
  getSessionId(agentId: string): string | undefined
  hasSession(agentId: string): boolean
  
  // Tool Access (Core Primitive)
  async useTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown>
  
  // Convenience Methods
  async read(path: string, options?): Promise<string>
  async write(path: string, content: string): Promise<void>
  async edit(path: string, oldText: string, newText: string): Promise<void>
  async exec(command: string, options?): Promise<unknown>
  async webSearch(query: string, options?): Promise<unknown>
  async webFetch(url: string, options?): Promise<unknown>
  async browser(action: string, params?): Promise<unknown>
  async canvas(action: string, params?): Promise<unknown>
  async nodes(action: string, params?): Promise<unknown>
  
  // Agent Tool Context
  createAgentToolContext(agentId: string): AgentToolContext
}
```

### 2. OpenClawGatewayClient

WebSocket client for Gateway communication:

```typescript
class OpenClawGatewayClient {
  async connect(): Promise<void>
  async disconnect(): Promise<void>
  async request<T>(method: string, params: Record<string, unknown>): Promise<T>
  async executeTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown>
  
  // Session API
  async sessionsList(): Promise<SessionInfo[]>
  async sessionsSpawn(params?: SessionsSpawnParams): Promise<SessionsSpawnResponse>
  async sessionsSend(sessionKey: string, message: string): Promise<SessionsSendResponse>
  async sessionsKill(sessionKey: string): Promise<void>
  async sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]>
}
```

### 3. AgentToolContext

Provides per-agent tool access:

```typescript
class AgentToolContext {
  async useTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown>
  async read(path: string, options?): Promise<string>
  async write(path: string, content: string): Promise<void>
  async edit(path: string, oldText: string, newText: string): Promise<void>
  async exec(command: string, options?): Promise<unknown>
  async webSearch(query: string, options?): Promise<unknown>
  async webFetch(url: string, options?): Promise<unknown>
  async browser(action: string, params?): Promise<unknown>
  async canvas(action: string, params?): Promise<unknown>
  async nodes(action: string, params?): Promise<unknown>
  
  // Session Management
  async sessionsSpawn(task: string, options?): Promise<string>
  async sessionsSend(sessionKey: string, message: string): Promise<SessionsSendResponse>
  async sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]>
  async sessionsKill(sessionKey: string): Promise<void>
  async sessionsList(): Promise<SessionInfo[]>
}
```

## Initialization Flow

```typescript
// In lifecycle.start():
async start(): Promise<void> {
  this.active = true;
  
  // Initialize OpenClaw core primitive
  await this.openclaw.initialize();
  await this.openclaw.connect();
  
  this.emit('lifecycle.started');
}
```

The initialization sequence:

1. **System starts** → `AgentLifecycle.start()` called
2. **OpenClaw initializes** → Creates Gateway client, connects WebSocket
3. **OpenClaw authenticates** → Sends auth token to Gateway
4. **System ready** → All agents can now use OpenClaw tools

## Usage Patterns

### Pattern 1: Direct Tool Access (Lifecycle/Manager)

```typescript
import { getOpenClawCore } from './core/openclaw';

const openclaw = getOpenClawCore(messageBus);

// Use any tool directly
const content = await openclaw.read('/path/to/file.txt');
await openclaw.write('/path/to/output.txt', 'content');
const results = await openclaw.webSearch('query');
```

### Pattern 2: Agent Tool Context

```typescript
// Create tool context for a specific agent
const toolContext = openclaw.createAgentToolContext(agentId);

// Agent uses tools through its context
await toolContext.write('/file.txt', 'content');
await toolContext.exec('npm test');
await toolContext.webSearch('typescript best practices');
```

### Pattern 3: Session Spawning

```typescript
// Spawn a subagent session
const sessionKey = await toolContext.sessionsSpawn('Implement auth', {
  model: 'kimi-k2.5',
  context: { skills: ['nodejs', 'auth'] }
});

// Send messages to the session
await toolContext.sessionsSend(sessionKey, 'Start with JWT tokens');

// Get session history
const history = await toolContext.sessionsHistory(sessionKey, 10);
```

### Pattern 4: Generic Tool Access

```typescript
// Use any OpenClaw tool by name
const result = await openclaw.useTool('read', { path: '/file.txt' });
const result = await openclaw.useTool('web_search', { query: 'AI news', count: 5 });
const result = await openclaw.useTool('browser', { action: 'navigate', url: 'https://example.com' });
```

## Available Tools

All OpenClaw tools are available to agents:

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `write` | Write file contents |
| `edit` | Edit file with exact text replacement |
| `exec` | Execute shell commands |
| `process` | Manage background processes |
| `web_search` | Search the web |
| `web_fetch` | Fetch and extract web page content |
| `browser` | Browser automation |
| `canvas` | Canvas/control node screens |
| `nodes` | Control paired devices |
| `image` | Analyze images |
| `supermemory_*` | Long-term memory operations |
| `sessions_*` | Session management |
| `tts` | Text-to-speech |
| `message` | Send messages via channels |

## Session Management

Sessions are managed transparently:

```typescript
// When agent is spawned
const agent = await lifecycle.spawn({ model, task });
// → OpenClaw session automatically created and mapped

// Session ID accessible via
const sessionId = openclaw.getSessionId(agent.id);

// When agent is killed
await lifecycle.kill(agent.id);
// → OpenClaw session automatically cleaned up
```

## Error Handling

OpenClaw errors are wrapped in ApplicationError:

```typescript
try {
  await openclaw.read('/nonexistent.txt');
} catch (error) {
  if (error instanceof ApplicationError) {
    // Handle specific error codes
    console.log(error.code); // DashErrorCode
  }
}
```

## Testing

For testing, use the mock client pattern:

```typescript
import { resetOpenClawCore } from './core/openclaw';

// Reset singleton before each test
beforeEach(() => {
  resetOpenClawCore();
});

// Tests use the real implementation with mock Gateway
```

## Migration from Old Architecture

### Before
```typescript
// integrations/openclaw/GatewayClient.ts
import { GatewayClient } from '../integrations/openclaw';
const client = new GatewayClient();
await client.connect();
```

### After
```typescript
// core/openclaw.ts
import { getOpenClawCore } from './core/openclaw';
const openclaw = getOpenClawCore(messageBus);
await openclaw.initialize(); // Already done in lifecycle.start()
```

## Configuration

OpenClaw uses environment variables:

```bash
# Required
OPENCLAW_GATEWAY_TOKEN=your_token_here

# Optional (with defaults)
OPENCLAW_GATEWAY_HOST=127.0.0.1
OPENCLAW_GATEWAY_PORT=18789
```

## Benefits of Core Primitive Architecture

1. **Simplicity**: Agents don't need to manage OpenClaw connections
2. **Reliability**: Always connected, automatic reconnection
3. **Consistency**: All agents have same tool access
4. **Transparency**: Sessions managed automatically
5. **Testability**: Single point of integration
6. **Performance**: Connection reuse across all agents

## Future Enhancements

- Tool permission enforcement per agent
- Budget tracking integration
- Tool execution sandboxing
- Audit logging for all tool calls
- Tool result caching
