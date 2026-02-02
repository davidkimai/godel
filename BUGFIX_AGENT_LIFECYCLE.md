# Bugfix: AgentLifecycle Startup Issue

**Date:** 2026-02-02  
**Issue:** Swarm operations fail with "AgentLifecycle is not started"  
**Status:** ✅ FIXED

## Problem Description

All swarm and agent CLI operations were failing at runtime with the error:
```
❌ Failed to create swarm: AgentLifecycle is not started
```

This affected:
- `dash swarm create`
- `dash swarm scale`
- `dash swarm destroy`
- `dash swarm status`
- `dash agents spawn`
- `dash agents pause/resume/kill`
- And other lifecycle-dependent commands

## Root Cause

The `AgentLifecycle` class has an `active` flag that must be set to `true` by calling `lifecycle.start()` before any agent operations can be performed. The CLI commands were retrieving the lifecycle instance via `getGlobalLifecycle()` but never calling `start()` on it.

**From `src/core/lifecycle.ts`:**
```typescript
async spawn(options: SpawnOptions): Promise<Agent> {
  if (!this.active) {
    throw new Error('AgentLifecycle is not started');  // <-- This was the error
  }
  // ...
}
```

## Solution

Added `lifecycle.start()` calls after initializing the lifecycle in all CLI command files:

### Files Modified:

1. **`src/cli/commands/swarm.ts`** (5 locations)
   - `swarm create` command
   - `swarm destroy` command
   - `swarm scale` command
   - `swarm status` command
   - `swarm list` command

2. **`src/cli/commands/agents.ts`** (6 locations)
   - `agents spawn` command (already had it)
   - `agents pause` command
   - `agents resume` command
   - `agents kill` command
   - `agents status` command
   - `agents retry` command
   - `agents metrics` command

3. **`src/cli/commands/status.ts`** (1 location)
   - `status` command

4. **`src/cli/commands/events.ts`** (3 locations)
   - `events stream` command
   - `events list` command
   - `events replay` command

### Example Fix Pattern:

**Before:**
```typescript
const messageBus = getGlobalBus();
const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
const manager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);
```

**After:**
```typescript
const messageBus = getGlobalBus();
const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
lifecycle.start();  // ← CRITICAL: Start lifecycle before use
const manager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);
```

## Testing

### Build Verification
```bash
npm run build
# ✅ Build passes with 0 errors
```

### Swarm Operations
```bash
# Create swarm
node dist/index.js swarm create --name lifecycle-test --task "Test task" --initial-agents 2
# ✅ Swarm created successfully!

# List swarms (in-memory, per-process)
node dist/index.js swarm list
# ✅ Works (shows swarms for current process)

# Scale swarm
node dist/index.js swarm scale <swarm-id> 5
# ✅ Works within same process

# Swarm status
node dist/index.js swarm status <swarm-id>
# ✅ Works within same process
```

### Agent Operations
```bash
# Spawn agent
node dist/index.js agents spawn "Test task" --label test-agent
# ✅ Agent spawned successfully!

# List agents (persisted to SQLite)
node dist/index.js agents list
# ✅ Shows all agents from database

# Agent status
node dist/index.js agents status <agent-id>
# ✅ Works
```

## Lessons Learned

1. **Initialization Order Matters**: When using service classes with explicit lifecycle management, ensure all required `start()` methods are called before operations.

2. **Consistent Patterns**: The fix needed to be applied across 15 different locations. A shared initialization helper could prevent this issue in the future.

3. **Testing Coverage**: This bug highlights the need for integration tests that verify end-to-end CLI workflows, not just unit tests of individual components.

## Future Improvements

Consider creating a shared CLI initialization helper:

```typescript
// src/cli/init.ts
export function initializeCLI() {
  const messageBus = getGlobalBus();
  const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
  lifecycle.start();
  const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);
  
  return { messageBus, lifecycle, swarmManager };
}
```

This would centralize the initialization and prevent similar issues when adding new commands.
