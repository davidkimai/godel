# Bugfix: Swarm CLI Subcommand Registration

## Issue
Swarm subcommand registration had lazy-loading timing issues that caused `dash swarm create` (and other subcommands) to fail with CLI structure errors.

## Root Cause
The `swarm` command was registered using a `preSubcommand` hook with dynamic `import()`:

```typescript
// BROKEN: Lazy loading with hook - timing issue
program
  .command('swarm')
  .description('Manage swarms of agents')
  .hook('preSubcommand', async () => {
    const { registerSwarmCommand } = await import('./commands/swarm');
    registerSwarmCommand(program);
  });
```

This approach has a timing issue: the hook runs asynchronously AFTER Commander has already started parsing the subcommand. By the time `registerSwarmCommand` runs and adds subcommands to the program, Commander has already finished parsing and doesn't see the subcommands.

## Solution
Changed to immediate registration using `require()`, matching the pattern used by `agents`, `openclaw`, and `clawhub` commands (which worked correctly):

```typescript
// FIXED: Immediate registration with require()
try {
  const { registerSwarmCommand } = require('./commands/swarm');
  registerSwarmCommand(program);
} catch {
  // Command not available, skip
}
```

## Files Changed
- `src/cli/index.ts` - Changed swarm registration from lazy hook to immediate require()

## Verification
All swarm subcommands now work correctly:

```bash
# Build passes
npm run build

# Help works for all commands
node dist/index.js swarm --help
node dist/index.js swarm create --help
node dist/index.js swarm destroy --help
node dist/index.js swarm scale --help
node dist/index.js swarm status --help
node dist/index.js swarm list --help

# Commands execute (returns empty list as expected)
node dist/index.js swarm list
# 📭 No swarms found

node dist/index.js swarm status
# 📭 No swarms found
# 💡 Use "dash swarm create" to create a swarm
```

## Pattern for Future Commands
For commands with subcommands, use immediate `require()` registration:

```typescript
// ✅ CORRECT: Immediate registration
try {
  const { registerMyCommand } = require('./commands/mycommand');
  registerMyCommand(program);
} catch {
  // Command not available, skip
}

// ❌ AVOID: Lazy loading with preSubcommand hook for subcommand-heavy commands
program
  .command('mycommand')
  .hook('preSubcommand', async () => {
    const { registerMyCommand } = await import('./commands/mycommand');
    registerMyCommand(program);
  });
```

Lazy loading via `setupLazyCommand()` is acceptable for simple commands without subcommands, but subcommand-heavy commands should use immediate registration.

## Date Fixed
2026-02-02
