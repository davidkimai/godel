# Bugfix: Self-Improve Status Lazy Loading

**Date:** 2026-02-02  
**Issue:** `dash self-improve status` produces no output  
**Fix Pattern:** S54 (immediate `require()` instead of lazy hook)

---

## Problem

The `dash self-improve status` command produced no output because the lazy loading mechanism using the `preSubcommand` hook was not properly registering subcommands.

## Root Cause

In `src/cli/index.ts`, the self-improve command was registered using `setupLazyCommand()`:

```typescript
setupLazyCommand(program, 'self-improve', './commands/self-improve', 'registerSelfImproveCommand');
```

This pattern uses the `preSubcommand` hook to lazy-load the module, but it has issues with subcommand registration timing.

## Solution

Applied the same fix pattern used for swarm, agents, openclaw, and clawhub commands - using immediate `require()` instead of lazy loading:

```typescript
// BEFORE (broken - lazy loading with preSubcommand hook)
setupLazyCommand(program, 'self-improve', './commands/self-improve', 'registerSelfImproveCommand');

// AFTER (working - immediate require pattern)
try {
  const { registerSelfImproveCommand } = require('./commands/self-improve');
  registerSelfImproveCommand(program);
} catch {
  // Command not available, skip
}
```

## Verification

### Before Fix
```bash
$ dash self-improve status
(no output)
```

### After Fix
```bash
$ dash self-improve status
📊 Self-improvement status:
   API: http://localhost:7373
   Status: Running
   Ready for self-improvement commands
```

## Commands Tested

- [x] `dash self-improve status` - Shows system status
- [x] `dash self-improve --help` - Lists all subcommands
- [x] `dash self-improve run --help` - Shows run command options
- [x] `dash self-improve report` - Generates report (stub)

## Affected File

- `src/cli/index.ts` - Changed self-improve command registration pattern

## Related

- S54 Fix Pattern: Similar fixes applied to swarm, agents, openclaw, clawhub commands
- Note: `tasks`, `context`, `tests`, `safety` commands still use lazy loading and may have similar issues
