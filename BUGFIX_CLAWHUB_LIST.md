# Bugfix: ClawHub List Command Crash

## Issue Summary
The `dash clawhub list` command was crashing/not working due to improper lazy loading implementation for commands with subcommands.

## Root Cause
The `clawhub` command was registered using `setupLazyCommand()` which used a `preSubcommand` hook to lazily load the command module. However, this pattern doesn't work for commands with subcommands because:

1. The `preSubcommand` hook only fires when a subcommand IS found
2. When the lazy-loaded command is first invoked, its subcommands (like `list`, `search`, `install`) don't exist yet
3. Commander.js cannot match the subcommand, so the hook never fires
4. The command appears to do nothing or crash

## Files Modified
- `/Users/jasontang/clawd/projects/dash/src/cli/index.ts`

## Changes Made

### Before (Broken)
```typescript
// In registerCoreCommands():
setupLazyCommand(program, 'clawhub', './commands/clawhub', 'registerClawhubCommand');
```

The `setupLazyCommand` function used `preSubcommand` hook which doesn't work for commands with subcommands.

### After (Fixed)
```typescript
// In registerCommands(), alongside other immediately-loaded commands:
// Register clawhub command immediately (not lazy-loaded due to subcommand issues)
try {
  const { registerClawhubCommand } = require('./commands/clawhub');
  registerClawhubCommand(program);
} catch {
  // Command not available, skip
}
```

The `clawhub` command is now registered immediately (synchronously) like `agents` and `openclaw` commands, which also have subcommands.

## Pattern Analysis
Several commands in the codebase have the same issue:

| Command | Loading Pattern | Status |
|---------|----------------|--------|
| `agents` | Immediate (require) | ✅ Works |
| `openclaw` | Immediate (require) | ✅ Works |
| `clawhub` | Immediate (require) | ✅ Fixed |
| `swarm` | Lazy (preSubcommand) | ❌ Broken |
| `events` | Lazy (preSubcommand) | ❌ Broken |
| `tasks` | Lazy (preSubcommand) | ❌ Broken |
| `context` | Lazy (preSubcommand) | ❌ Broken |
| `tests` | Lazy (preSubcommand) | ❌ Broken |
| `safety` | Lazy (preSubcommand) | ❌ Broken |
| `self-improve` | Lazy (preSubcommand) | ❌ Broken |

**Recommendation:** All commands with subcommands should use immediate (synchronous) loading.

## Testing

### Test 1: Empty skills list
```bash
$ dash clawhub list
No skills installed.

Install skills with:
  dash clawhub install <skill>

Search for skills with:
  dash clawhub search <query>
```
✅ PASS

### Test 2: Populated skills list
```bash
$ dash clawhub list
Installed Skills (1):

Inactive (use --all to show):
  ... and 1 inactive skills

Registry: https://clawhub.ai
Skills directory: /Users/jasontang/clawd/projects/dash/skills
```
✅ PASS

### Test 3: Show all skills
```bash
$ dash clawhub list --all
Installed Skills (1):

Inactive:
  ○ test-skill @1.0.0

Registry: https://clawhub.ai
Skills directory: /Users/jasontang/clawd/projects/dash/skills
```
✅ PASS

## Verification Commands

```bash
# Build the project
cd /Users/jasontang/clawd/projects/dash
npm run build

# Test the list command
node dist/index.js clawhub list
node dist/index.js clawhub list --all
node dist/index.js clawhub list --json
```

## Impact
- **Severity:** Critical Blocker (prevented users from viewing installed skills)
- **User Impact:** Users couldn't see what skills were installed
- **Fix Complexity:** Low (one-line change to use immediate loading)

## Related Issues
This same pattern affects other commands (`swarm`, `events`, `tasks`, etc.) which should be fixed in a follow-up refactoring.
