# Bug Fix: OpenClaw State Persistence (BUG-002)

**Status:** ✅ FIXED  
**Date:** 2026-02-02  
**Affected Component:** `src/cli/commands/openclaw.ts`  
**Fix Location:** `src/utils/cli-state.ts` (new file)

---

## Problem Description

OpenClaw state did not persist across CLI commands. Running:
```bash
dash openclaw connect --mock
dash openclaw status
```

Would fail with:
```
❌ Failed to get gateway status
   Error: Not connected to OpenClaw Gateway. Run "dash openclaw connect" first.
```

### Root Cause
The CLI used in-memory global variables (`globalMockClient`, `globalGatewayClient`, etc.) to store connection state. Since each CLI command runs in a separate Node.js process, the state was lost when the process exited.

### Impact
- Could not maintain Gateway connection across commands
- Mock mode was unusable for testing workflows
- Session management commands failed after connect

---

## Solution

Implemented file-based state persistence using a new utility module.

### New File: `src/utils/cli-state.ts`
- Stores CLI state in `~/.config/dash/cli-state.json`
- Persists connection info (host, port, mock mode, connected status)
- Provides atomic read/write operations

### Modified: `src/cli/commands/openclaw.ts`
- Connect command now saves state to disk after successful connection
- All commands check persisted state before falling back to in-memory
- Mock mode state persists across commands

### State File Format
```json
{
  "version": "1.0.0",
  "updatedAt": "2026-02-02T22:11:38.386Z",
  "openclaw": {
    "connected": true,
    "mockMode": true,
    "host": "127.0.0.1",
    "port": 18789,
    "connectedAt": "2026-02-02T22:11:38.385Z"
  }
}
```

---

## Test Results

### Test 1: Connect → Status (Mock Mode)
```bash
$ dash openclaw connect --mock
🔌 Connecting to OpenClaw Gateway...

✓ Using mock OpenClaw client (testing mode)
✓ Mock client initialized

$ dash openclaw status
🔌 OpenClaw Gateway Status (MOCK MODE)

✓ Connected: Mock Client
✓ Sessions: 0
✓ Connected At: 2026-02-02T22:11:38.385Z
```
✅ **PASSED**

### Test 2: Sessions List After Connect
```bash
$ dash openclaw sessions list
SESSIONS (0 total)
```
✅ **PASSED**

### Test 3: State File Verification
```bash
$ cat ~/.config/dash/cli-state.json
{
  "version": "1.0.0",
  "updatedAt": "2026-02-02T22:11:38.386Z",
  "openclaw": {
    "connected": true,
    "mockMode": true,
    "host": "127.0.0.1",
    "port": 18789,
    "connectedAt": "2026-02-02T22:11:38.385Z"
  }
}
```
✅ **PASSED**

### Test 4: Spawn Command
```bash
$ dash openclaw spawn --task "Test task" --mock
🚀 Spawning agent via OpenClaw...

✓ Spawned agent: sessionKey=openclaw-session-1770070311899-1
✓ Model: kimi-k2.5
✓ Budget: $1.00
✓ Status: idle (awaiting task)
```
✅ **PASSED**

---

## Known Limitations

1. **Mock Sessions Don't Persist**: MockOpenClawClient sessions are stored in-memory only. A future enhancement could persist mock session data to the state file as well.

2. **Real Gateway Reconnection**: For real (non-mock) gateway connections, the client is recreated from persisted state but doesn't auto-reconnect. Users should run `dash openclaw connect` to re-establish connection after CLI restart.

---

## API Reference

### CLI State Functions

```typescript
// Load current state
const state = loadState();

// Save OpenClaw state
setOpenClawState({
  connected: true,
  mockMode: false,
  host: '127.0.0.1',
  port: 18789,
});

// Check connection status
if (isOpenClawConnected()) { ... }

// Check mock mode
if (isOpenClawMockMode()) { ... }

// Clear state (disconnect)
clearOpenClawState();

// Reset all state (testing)
resetState();
```

---

## Verification Commands

To verify the fix works:

```bash
# Reset state
rm -rf ~/.config/dash

# Connect in mock mode
dash openclaw connect --mock

# Check status (should show connected)
dash openclaw status

# List sessions (should work)
dash openclaw sessions list

# View persisted state
cat ~/.config/dash/cli-state.json
```

---

## Related Files

- `src/utils/cli-state.ts` - New state persistence utility
- `src/utils/index.ts` - Updated exports
- `src/cli/commands/openclaw.ts` - Updated to use persisted state

## Build Verification

```bash
npm run build
# ✓ TypeScript compilation successful (0 errors)
```
