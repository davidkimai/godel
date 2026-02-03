# Real OpenClaw Gateway Integration

This document describes the real OpenClaw Gateway integration for Dash, enabling direct WebSocket communication with the OpenClaw Gateway instead of using mock mode.

## Overview

The integration provides:
- **Real WebSocket Connection**: Direct communication with OpenClaw Gateway via WebSocket
- **Authentication**: Token-based authentication using OpenClaw Gateway Protocol v3
- **Session Management**: Full support for sessions_list, sessions_spawn, sessions_send, sessions_history
- **Agent Tools**: Access to all OpenClaw tools (read, write, exec, browser, etc.)
- **Auto-reconnect**: Automatic reconnection on connection loss
- **Event Subscriptions**: Subscribe to agent, chat, presence, and tick events

## Configuration

### Environment Variables

```bash
# Required for real gateway mode
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your_token_here

# Optional: Control connection mode
OPENCLAW_MODE=real  # or 'mock' for testing
```

### Getting Your Gateway Token

1. Start the OpenClaw Gateway:
   ```bash
   openclaw gateway start
   ```

2. Get the token:
   ```bash
   openclaw gateway token
   ```

3. Set the token in your environment:
   ```bash
   export OPENCLAW_GATEWAY_TOKEN=$(openclaw gateway token)
   ```

## Usage

### Connect to Gateway

```bash
# Auto-detect mode (tries real first, falls back to mock)
dash openclaw connect

# Force real mode (fails if gateway unavailable)
dash openclaw connect --real

# Force mock mode
dash openclaw connect --mock

# Specify custom gateway URL
dash openclaw connect --host 192.168.1.100 --port 18789
```

### Check Status

```bash
dash openclaw status
```

### List Sessions

```bash
dash openclaw sessions list
dash openclaw sessions list --active
dash openclaw sessions list --kind main
```

### Spawn a Session

```bash
dash openclaw spawn --task "Analyze the codebase" --model kimi-k2.5
dash openclaw spawn --task "Fix the bug" --model sonnet --budget 2.00
```

### Send Messages

```bash
dash openclaw send --session <session-key> "Continue the analysis"
```

### View History

```bash
dash openclaw sessions history <session-key> --limit 100
```

## Architecture

### GatewayClient

The `GatewayClient` class (`src/integrations/openclaw/GatewayClient.ts`) manages the WebSocket connection:

```typescript
import { GatewayClient } from './src/integrations/openclaw/GatewayClient';

const client = new GatewayClient({
  host: '127.0.0.1',
  port: 18789,
  token: process.env.OPENCLAW_GATEWAY_TOKEN,
}, {
  autoReconnect: true,
  subscriptions: ['agent', 'chat', 'presence', 'tick'],
});

await client.connect();

// Use the client
const sessions = await client.sessionsList();
const { sessionKey } = await client.sessionsSpawn({ model: 'kimi-k2.5' });

await client.disconnect();
```

### Protocol Implementation

The integration implements OpenClaw Gateway Protocol v3:

1. **Connection**: WebSocket connection to `ws://host:port`
2. **Challenge**: Gateway sends `connect.challenge` event with nonce
3. **Authentication**: Client sends `connect` request with:
   - `client.id`: "cli"
   - `client.mode`: "cli"
   - `role`: "operator"
   - `scopes`: ["operator.read", "operator.write"]
   - `auth.token`: Gateway token
4. **Hello**: Gateway responds with `hello-ok` and connection details
5. **Operations**: Client can now call methods like `sessions_list`, `sessions_spawn`, etc.

### SessionManager Integration

The `SessionManager` can use the `GatewayClient` for all operations:

```typescript
const gatewayClient = new GatewayClient(config);
await gatewayClient.connect();

const sessionManager = new SessionManager(config, gatewayClient);
// sessionManager uses gatewayClient's connection
```

## Troubleshooting

### Connection Timeout

**Error**: `Connection timeout after 10000ms`

**Solutions**:
1. Ensure OpenClaw Gateway is running:
   ```bash
   openclaw gateway status
   openclaw gateway start
   ```

2. Check the gateway URL:
   ```bash
   echo $OPENCLAW_GATEWAY_URL
   # Should be: ws://127.0.0.1:18789
   ```

3. Verify the token:
   ```bash
   openclaw gateway token
   ```

### Authentication Failed

**Error**: `AUTHENTICATION_ERROR`

**Solutions**:
1. Get a fresh token:
   ```bash
   export OPENCLAW_GATEWAY_TOKEN=$(openclaw gateway token)
   ```

2. Check if the gateway requires authentication:
   ```bash
   openclaw config get gateway.auth.mode
   ```

### Stale Connection State

**Error**: `Persisted state shows connected, but client is not connected`

**Solution**: This is normal for CLI usage. Each command runs in a separate process. Run `dash openclaw connect` to verify the connection works.

### WebSocket Errors

**Error**: `WebSocket error: ...`

**Solutions**:
1. Check if the port is available:
   ```bash
   lsof -i :18789
   ```

2. Restart the gateway:
   ```bash
   openclaw gateway stop
   openclaw gateway start
   ```

## Development

### Testing the Connection

```bash
# Test with debug output
DEBUG=openclaw node dist/index.js openclaw connect

# Test specific operations
node dist/index.js openclaw sessions list
node dist/index.js openclaw spawn --task "Test" --model kimi-k2.5
```

### Mock Mode vs Real Mode

| Feature | Mock Mode | Real Mode |
|---------|-----------|-----------|
| Connection | Local simulation | WebSocket to Gateway |
| Sessions | In-memory | Persistent in Gateway |
| Tools | Simulated responses | Real execution |
| Events | Simulated | Real-time from Gateway |
| Use Case | Testing, CI/CD | Production, real agents |

## API Reference

### GatewayClient Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to Gateway and authenticate |
| `disconnect()` | Close connection |
| `connected` | Property: Check if authenticated |
| `sessionsList()` | List all sessions |
| `sessionsSpawn(params)` | Create new session |
| `sessionsSend(sessionKey, message)` | Send message to session |
| `sessionsHistory(sessionKey, limit)` | Get session history |
| `sessionsKill(sessionKey)` | Terminate session |
| `request(method, params)` | Send custom request |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `authenticated` | HelloOk response | Successfully authenticated |
| `connected` | - | WebSocket connected |
| `disconnected` | { code, reason } | WebSocket disconnected |
| `error` | Error | Error occurred |
| `agent` | AgentEvent | Agent state change |
| `chat` | ChatEvent | New chat message |
| `presence` | PresenceEvent | Presence update |
| `tick` | TickEvent | Heartbeat tick |

## Security

- **Token Storage**: Store tokens in environment variables, never commit to git
- **Local Only**: By default, gateway only accepts connections from localhost
- **HTTPS/WSS**: For remote connections, use WSS with TLS fingerprint pinning

## See Also

- [OpenClaw Gateway Protocol Documentation](https://docs.openclaw.ai/gateway/protocol)
- [OpenClaw Security Best Practices](https://docs.openclaw.ai/gateway/security)
