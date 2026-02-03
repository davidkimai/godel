# Real OpenClaw Transition (BETA)

**Status:** ✅ Completed  
**Date:** 2026-02-02  
**Version:** Dash 2.0.0

## Overview

This document describes the transition from mock-only OpenClaw mode to real gateway integration with automatic fallback to mock mode when the real gateway is unavailable.

## Architecture

```typescript
// Priority: Real → Mock fallback
async connect() {
  try {
    await this.connectToRealGateway();  // Try real first
  } catch (error) {
    console.warn('Real gateway unavailable, falling back to mock');
    this.useMockMode();  // Fallback if real fails
  }
}
```

## Changes Made

### 1. Environment Variable Support

New environment variables for gateway configuration:

```bash
# Gateway URL (ws:// or wss://)
export OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789

# Authentication token
export OPENCLAW_GATEWAY_TOKEN=your_token_here

# Force mode (optional)
export OPENCLAW_MOCK_MODE=false  # Force real, fail if unavailable
export OPENCLAW_MOCK_MODE=true   # Force mock mode
```

### 2. Auto-Detection Logic

The system now uses three connection modes:

| Mode | Behavior | Trigger |
|------|----------|---------|
| **Auto** (default) | Try real first, fallback to mock | No env vars or flags set |
| **Real** | Force real connection, fail if unavailable | `OPENCLAW_MOCK_MODE=false` |
| **Mock** | Force mock mode | `--mock` flag or `OPENCLAW_MOCK_MODE=true` |

### 3. CLI Updates

#### `dash openclaw connect`

```bash
# Auto-detect mode (tries real, falls back to mock)
dash openclaw connect

# Force mock mode
dash openclaw connect --mock

# Custom gateway with env vars
export OPENCLAW_GATEWAY_URL=ws://192.168.1.100:18789
export OPENCLAW_GATEWAY_TOKEN=secret_token
dash openclaw connect

# Custom gateway with flags
dash openclaw connect --host 192.168.1.100 --port 18789 --token secret_token
```

#### Other Commands

All other commands (`status`, `spawn`, `send`, `kill`, `sessions list`, `sessions history`) continue to work with both real and mock modes automatically.

## Connection Flow

```
User runs: dash openclaw connect
    │
    ▼
Check connection mode
    │
    ├─ mock flag or OPENCLAW_MOCK_MODE=true ────► Use Mock Mode
    │
    ├─ OPENCLAW_MOCK_MODE=false ────────────────► Try Real (fail if unavailable)
    │
    └─ Auto mode (default) ─────────────────────► Try Real
                                                      │
                                                      ▼
                                            Connection succeeds?
                                                      │
                                    ┌─────────────────┴─────────────────┐
                                    │ Yes                               │ No
                                    ▼                                   ▼
                              Use Real Mode                    Fallback to Mock
                              ✅ Connected (real)              ✅ Connected (mock)
                                                                   (logs warning)
```

## State Persistence

The connection state is persisted to `~/.config/dash/cli-state.json`:

```json
{
  "openclaw": {
    "connected": true,
    "mockMode": false,
    "host": "127.0.0.1",
    "port": 18789,
    "connectedAt": "2026-02-02T17:30:00.000Z"
  },
  "version": "1.0.0",
  "updatedAt": "2026-02-02T17:30:00.000Z"
}
```

## Testing

### Test Real Connection

```bash
# Ensure gateway is running
openclaw gateway status

# Connect (should show "REAL")
dash openclaw connect
dash openclaw status  # Should show "Connected (real)"

# Spawn an agent
dash openclaw spawn --task "Test real connection"
```

### Test Fallback to Mock

```bash
# Stop gateway (if running)
openclaw gateway stop

# Connect (should fallback to mock)
dash openclaw connect  # Shows: "⚠️ Real gateway unavailable, falling back to mock mode"
dash openclaw status   # Shows: "Connected: Mock Client"

# Spawn still works
dash openclaw spawn --task "Test mock fallback"
```

### Test Force Mock

```bash
# Force mock even if gateway is available
dash openclaw connect --mock
dash openclaw status  # Shows: "Connected: Mock Client (explicit)"
```

### Test Force Real

```bash
# Fail if gateway unavailable (no fallback)
export OPENCLAW_MOCK_MODE=false
dash openclaw connect  # Fails with error if gateway unavailable
```

## Migration Guide

### For Existing Users

No changes required. The system defaults to auto mode which maintains backward compatibility:

1. If you were using `--mock`, continue using it (explicit mock mode)
2. If you weren't using any flags, you'll now get real connection with mock fallback

### For CI/CD

Use explicit mode for predictable behavior:

```bash
# In CI, force mock for tests
export OPENCLAW_MOCK_MODE=true
dash openclaw connect
dash openclaw spawn --task "Run tests"
```

### For Production

Set up environment variables:

```bash
# In your .env or shell profile
export OPENCLAW_GATEWAY_URL=ws://your-gateway-host:18789
export OPENCLAW_GATEWAY_TOKEN=your_secure_token

# Optional: force real mode (no fallback)
export OPENCLAW_MOCK_MODE=false
```

## Troubleshooting

### "Failed to connect to OpenClaw Gateway"

**In Real Mode:**
- Check gateway is running: `openclaw gateway status`
- Verify URL: `echo $OPENCLAW_GATEWAY_URL`
- Check token: `echo $OPENCLAW_GATEWAY_TOKEN`

**In Auto Mode:**
- This is expected if gateway is unavailable
- System automatically falls back to mock
- Check logs for: "⚠️ Real gateway unavailable, falling back to mock mode"

### "Not connected to OpenClaw Gateway"

Run `dash openclaw connect` first to establish connection.

### Mock Mode When Expecting Real

Check if gateway is actually running:
```bash
openclaw gateway status
# or
curl ws://127.0.0.1:18789  # Should not fail immediately
```

## Future Improvements

1. **Health Check Endpoint**: Add periodic health checks for real gateway
2. **Auto-Reconnect**: Automatically switch back to real when available
3. **Connection Pooling**: Maintain persistent connections for better performance
4. **Metrics**: Track real vs mock usage for monitoring

## References

- [OpenClaw Integration Spec](./OPENCLAW_INTEGRATION_SPEC.md)
- [Gateway Protocol v3](https://docs.openclaw.ai/gateway/protocol)
- [Environment Configuration](./ENVIRONMENT.md)
