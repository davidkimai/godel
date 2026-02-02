# OpenClaw Integration Deep Dive

## Overview

The Dash platform integrates with OpenClaw to provide seamless agent orchestration capabilities. This document provides a comprehensive technical overview of the integration architecture, APIs, and usage patterns.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dash CLI                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   openclaw   │  │   sessions   │  │   spawn/send/kill    │  │
│  │   connect    │  │  list/history│  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼──────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  OpenClaw Integration Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  GatewayClient│  │SessionManager│  │   AgentExecutor      │  │
│  │  (WebSocket) │  │  (Lifecycle) │  │   (Task Dispatch)    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼──────────────┘
          │                 │                     │
          └─────────────────┴─────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                              │
│              (WebSocket API: ws://host:port)                     │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── cli/commands/openclaw.ts          # CLI command implementations
├── core/
│   └── openclaw.ts                   # Core OpenClaw types & MockClient
├── integrations/openclaw/
│   ├── index.ts                      # Main exports
│   ├── GatewayClient.ts              # WebSocket client
│   ├── SessionManager.ts             # Session lifecycle management
│   ├── AgentExecutor.ts              # Agent task execution
│   ├── types.ts                      # Type definitions
│   └── ...                           # Supporting modules
└── utils/cli-state.ts                # CLI state persistence
```

## CLI Commands

### 1. Connect to OpenClaw Gateway

```bash
dash openclaw connect [--host HOST] [--port PORT] [--token TOKEN] [--mock]
```

**Options:**
- `--host`: Gateway host (default: 127.0.0.1)
- `--port`: Gateway port (default: 18789)
- `--token`: Authentication token
- `--mock`: Use mock client for testing (no real gateway required)

**Example:**
```bash
# Connect to real gateway
dash openclaw connect --host localhost --port 18789

# Use mock mode for testing
dash openclaw connect --mock
```

### 2. Check Status

```bash
dash openclaw status [--mock]
```

**Example Output:**
```
🔌 OpenClaw Gateway Status (MOCK MODE)

✓ Connected: Mock Client
✓ Sessions: 2
✓ Connected At: 2026-02-02T22:28:11.992Z
```

### 3. List Sessions

```bash
dash openclaw sessions list [--active] [--kind KIND] [--mock]
```

**Options:**
- `--active`: Only show active sessions (last 60 min)
- `--kind`: Filter by session kind (main|group|thread)

**Example:**
```bash
dash openclaw sessions list --mock
```

**Example Output:**
```
SESSIONS (2 total)

├── openclaw-session-1770071526483-1 (idle, mock session)
├── openclaw-session-1770071526484-2 (running, mock session)
```

### 4. View Session History

```bash
dash openclaw sessions history <session-key> [--limit N] [--mock]
```

**Example:**
```bash
dash openclaw sessions history openclaw-session-1770071526483-1 --mock
```

### 5. Spawn Agent

```bash
dash openclaw spawn --task "TASK" [--model MODEL] [--budget AMOUNT] [--mock]
```

**Options:**
- `-t, --task`: Task description (required)
- `-m, --model`: Model to use (default: kimi-k2.5)
- `-b, --budget`: Max budget in USD (default: 1.00)
- `--sandbox`: Enable sandbox (default: true)
- `--skills`: Additional skills (comma-separated)
- `--system-prompt`: System prompt override

**Example:**
```bash
dash openclaw spawn --task "Analyze this codebase" --model kimi-k2.5 --mock
```

**Example Output:**
```
🚀 Spawning agent via OpenClaw...

✓ Spawned agent: sessionKey=openclaw-session-1770071526483-1
✓ Model: kimi-k2.5
✓ Budget: $1
✓ Status: idle (awaiting task)

💡 Use "dash openclaw send --session openclaw-session-1770071526483-1 <message>" to send a task
```

### 6. Send Message

```bash
dash openclaw send --session SESSION <message> [--attach FILE] [--mock]
```

**Options:**
- `-s, --session`: Session key (required)
- `-a, --attach`: File attachment
- `message`: Message to send (required positional argument)

**Example:**
```bash
dash openclaw send --session openclaw-session-1770071526483-1 "Please analyze this code" --mock
```

### 7. Kill Session

```bash
dash openclaw kill <session-key> [--force] [--mock]
```

**Options:**
- `-f, --force`: Force kill (immediate termination)

**Example:**
```bash
dash openclaw kill openclaw-session-1770071526483-1 --mock
```

## Mock Mode

The mock mode enables testing OpenClaw integration without a real gateway connection. It persists session data between CLI invocations.

### Mock Client Features

1. **Session Persistence**: Mock sessions are stored in `~/.config/dash/cli-state.json`
2. **State Restoration**: Sessions are restored when using `--mock` flag
3. **Simulated Token Usage**: Tracks mock token consumption
4. **Session Lifecycle**: Simulates pending → running → completed states

### Mock State Storage

```typescript
// ~/.config/dash/cli-state.json
{
  "openclaw": {
    "connected": true,
    "mockMode": true,
    "host": "127.0.0.1",
    "port": 18789,
    "connectedAt": "2026-02-02T22:28:11.992Z"
  },
  "mockSessions": [
    {
      "sessionId": "openclaw-session-1770071526483-1",
      "agentId": "dash-agent-1770071526483",
      "status": "running",
      "createdAt": "2026-02-02T22:32:06.483Z",
      "model": "kimi-k2.5",
      "task": "Analyze this codebase"
    }
  ],
  "version": "1.0.0",
  "updatedAt": "2026-02-02T22:32:19.450Z"
}
```

## Integration Tests

### Test Matrix

| Command | Mock Mode | Real Gateway |
|---------|-----------|--------------|
| `connect` | ✅ | ✅ |
| `status` | ✅ | ✅ |
| `sessions list` | ✅ | ✅ |
| `sessions history` | ✅ | ✅ |
| `spawn` | ✅ | ✅ |
| `send` | ✅ | ✅ |
| `kill` | ✅ | ✅ |

### Test Commands

```bash
# Reset state and test mock mode
rm -rf ~/.config/dash

# 1. Connect with mock mode
dash openclaw connect --mock

# 2. Check status
dash openclaw status --mock

# 3. Spawn an agent
dash openclaw spawn --task "Analyze this" --mock
# Note the session ID from output

# 4. List sessions (should show the spawned agent)
dash openclaw sessions list --mock

# 5. Send a message
dash openclaw send --session <session-id> "Hello" --mock

# 6. View history
dash openclaw sessions history <session-id> --mock

# 7. Kill the session
dash openclaw kill <session-id> --mock
```

## WebSocket Protocol

The SessionManager communicates with the OpenClaw Gateway using a WebSocket protocol:

### Request Format

```typescript
{
  type: 'req',
  id: string,        // Unique request ID
  method: string,    // Method name
  params: object     // Method parameters
}
```

### Response Format

```typescript
{
  type: 'res',
  id: string,        // Matching request ID
  ok: boolean,       // Success flag
  payload?: object,  // Response data (if ok)
  error?: {          // Error details (if !ok)
    code: string,
    message: string
  }
}
```

### Event Format

```typescript
{
  type: 'event',
  event: string,     // Event name
  payload: object,   // Event data
  seq?: number,      // Sequence number
  stateVersion?: number
}
```

## API Methods

### sessions_list

Lists all active sessions.

**Request:**
```typescript
{
  method: 'sessions_list',
  params: {
    activeMinutes?: number,
    kinds?: string[]
  }
}
```

**Response:**
```typescript
{
  sessions: SessionInfo[]
}
```

### sessions_spawn

Creates a new session.

**Request:**
```typescript
{
  method: 'sessions_spawn',
  params: {
    model?: string,
    thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
    verbose?: boolean,
    workspace?: string,
    skills?: string[],
    systemPrompt?: string,
    sandbox?: {
      mode: 'non-main' | 'docker',
      allowedTools?: string[],
      deniedTools?: string[]
    }
  }
}
```

**Response:**
```typescript
{
  sessionKey: string,
  sessionId: string
}
```

### sessions_send

Sends a message to a session.

**Request:**
```typescript
{
  method: 'sessions_send',
  params: {
    sessionKey: string,
    message: string,
    attachments?: Attachment[],
    replyTo?: string
  }
}
```

**Response:**
```typescript
{
  runId: string,
  status: 'accepted'
}
```

### sessions_history

Fetches message history for a session.

**Request:**
```typescript
{
  method: 'sessions_history',
  params: {
    sessionKey: string,
    limit?: number
  }
}
```

**Response:**
```typescript
{
  messages: Message[],
  sessionKey: string
}
```

### sessions_kill

Terminates a session.

**Request:**
```typescript
{
  method: 'sessions_kill',
  params: {
    sessionKey: string
  }
}
```

## Type Definitions

### SessionInfo

```typescript
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

### Message

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  runId?: string;
  toolCalls?: ToolCall[];
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
}
```

## Error Handling

The integration provides comprehensive error handling:

### CLI Errors

- **Connection Errors**: Displayed with troubleshooting tips
- **Session Not Found**: Clear error message with session ID
- **Permission Denied**: Suggests using appropriate flags

### Gateway Errors

Errors from the gateway are propagated with:
- Error code for programmatic handling
- Human-readable message
- Context for debugging

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_GATEWAY_HOST` | Gateway hostname | 127.0.0.1 |
| `OPENCLAW_GATEWAY_PORT` | Gateway port | 18789 |
| `OPENCLAW_GATEWAY_TOKEN` | Authentication token | - |
| `OPENCLAW_SESSION` | Current session ID (when running in OpenClaw) | - |
| `OPENCLAW_GATEWAY_URL` | Gateway URL (when running in OpenClaw) | - |

## Future Enhancements

1. **Real-time Streaming**: Support for streaming responses from agents
2. **Multi-session Management**: Batch operations on multiple sessions
3. **Session Templates**: Predefined session configurations
4. **Advanced Filtering**: More powerful session list filters
5. **Metrics Export**: Export session metrics for analysis

## References

- [OpenClaw Gateway Protocol](https://github.com/openclaw/openclaw)
- [Dash SPEC_v2.md](./SPEC_v2.md)
- [SessionManager.ts](../src/integrations/openclaw/SessionManager.ts)
- [GatewayClient.ts](../src/integrations/openclaw/GatewayClient.ts)
