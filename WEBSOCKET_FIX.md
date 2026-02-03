# WebSocket Protocol Fix for OpenClaw Gateway

**Date:** 2026-02-02  
**Issue:** Real gateway WebSocket had protocol format mismatch  
**Fix:** Aligned `connect` method parameters with OpenClaw Gateway Protocol v3

---

## Problem

The Dash CLI could only connect to OpenClaw Gateway in `--mock` mode. When attempting to connect to a real gateway:

```bash
node dist/index.js openclaw connect
```

The connection would fail with authentication/protocol errors.

---

## Root Cause

The OpenClaw Gateway Protocol v3 expects specific constants for the `connect` method that differed from the implementation:

| Field | Old Value (WRONG) | New Value (CORRECT) |
|-------|-------------------|---------------------|
| `client.id` | `'node'` | `'cli'` |
| `client.mode` | `'client'` | `'cli'` |
| `role` | *missing* | `'operator'` |
| `scopes` | *missing* | `['operator.read', 'operator.write', 'operator.admin']` |
| `minProtocol` | `1` | `3` |
| `maxProtocol` | `1` | `3` |
| `locale` | *missing* | `'en-US'` |
| `userAgent` | *missing* | `'dash-cli/2.0.0'` |

---

## Solution

Updated `GatewayClient.authenticate()` in `src/integrations/openclaw/GatewayClient.ts`:

```typescript
await this.request('connect', {
  auth: {
    token: this.config.token,
  },
  client: {
    id: 'cli',           // Changed from 'node'
    mode: 'cli',         // Changed from 'client' (key fix!)
    platform: 'node',
    version: '2.0.0',
  },
  role: 'operator',                          // Added
  scopes: ['operator.read', 'operator.write', 'operator.admin'], // Added
  caps: [],                                  // Added
  commands: [],                              // Added
  permissions: {},                           // Added
  minProtocol: 3,      // Changed from 1
  maxProtocol: 3,      // Changed from 1
  locale: 'en-US',                           // Added
  userAgent: 'dash-cli/2.0.0',               // Added
});
```

---

## Protocol Reference

**Documentation:** https://docs.openclaw.ai/gateway/protocol

### Connect Request Format (Operator/CLI Client)

```json
{
  "type": "req",
  "id": "...",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "cli",
      "version": "2.0.0",
      "platform": "node",
      "mode": "operator"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "caps": [],
    "commands": [],
    "permissions": {},
    "auth": { "token": "..." },
    "locale": "en-US",
    "userAgent": "dash-cli/2.0.0",
    "device": {
      "id": "device_fingerprint",
      "publicKey": "...",
      "signature": "...",
      "signedAt": 1737264000000,
      "nonce": "..."
    }
  }
}
```

### Roles

- **operator** = control plane client (CLI/UI/automation)
- **node** = capability host (camera/screen/canvas/system.run)

### Scopes (Operator)

- `operator.read` - Read operations
- `operator.write` - Write operations
- `operator.admin` - Administrative access
- `operator.approvals` - Approve exec requests
- `operator.pairing` - Device pairing

### Caps/Commands/Permissions (Node)

For node clients (not used by Dash CLI):
- **caps**: `['camera', 'canvas', 'screen', 'location', 'voice']`
- **commands**: Command allowlist for invoke
- **permissions**: Granular toggles (`screen.record`, `camera.capture`)

---

## Testing

### Start OpenClaw Gateway

```bash
openclaw gateway start
```

### Connect with Dash CLI

```bash
cd /Users/jasontang/clawd/projects/dash

# Build first
npm run build

# Connect to real gateway (get token from ~/.openclaw/openclaw.json)
export OPENCLAW_GATEWAY_TOKEN=<token_from_config>
node dist/index.js openclaw connect

# Check status
node dist/index.js openclaw status

# List sessions
node dist/index.js openclaw sessions list

# Spawn an agent
node dist/index.js openclaw spawn --task "Hello world"
```

### Integration Test Results

**Date:** 2026-02-02

**Status:** ✅ PASSED

**Test:** Direct WebSocket connection test with corrected protocol parameters:
- Connection established successfully
- Authentication passed with `hello-ok` response
- Protocol version 3 confirmed
- Received full gateway snapshot with:
  - 47 available methods (sessions, agents, config, etc.)
  - 19 available events (agent, chat, presence, tick, etc.)
  - Channel status (Telegram, WhatsApp)
  - 19 active sessions

**Key Discovery:** The `client.mode` value must be `'cli'` (not 'operator', 'control', 'extension', or 'client' as suggested by various documentation versions).

---

## Files Changed

- `src/integrations/openclaw/GatewayClient.ts` - Updated `authenticate()` method

---

## Future Considerations

1. **Device Identity**: The protocol supports device fingerprinting with keypairs for non-local connections. This is not yet implemented.

2. **TLS Pinning**: The protocol supports TLS certificate fingerprint pinning for enhanced security.

3. **Auto-Approval**: Local connects (loopback + gateway host's tailnet address) can auto-approve without device identity.

4. **Node Mode**: If Dash ever needs to expose camera/screen capabilities, it would use:
   - `client.id`: unique node identifier
   - `client.mode`: `'node'`
   - `role`: `'node'`
   - `caps`: `['camera', 'screen', ...]`
