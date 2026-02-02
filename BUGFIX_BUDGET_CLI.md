# Bugfix: Budget CLI Argument Parsing (BUG-001)

## Issue Summary
The Budget CLI was non-functional due to incorrect argument parsing in the lazy-loading mechanism. Commands like `dash budget set --project test --daily 10.00` would fail with "unknown option" errors.

## Root Cause
The `setupLazyCreateCommand` function in `src/cli/index.ts` was incorrectly passing arguments to the subcommand's `parseAsync()` method.

### Problematic Code
```typescript
const subArgs = process.argv.slice(process.argv.indexOf(name));
await cmd.parseAsync(subArgs);
```

This produced argument arrays like `['budget', 'set', '--project', 'test']`, but:
1. Commander.js expects the first two arguments to be `node` and the script path
2. The named command (`budget`) was being interpreted as an argument

## Fix Applied

### File: `src/cli/index.ts`

Updated `setupLazyCreateCommand` to properly format arguments:

```typescript
.action(async (...args) => {
  const module = await import(modulePath);
  const createFn = module[exportName];
  if (typeof createFn === 'function') {
    const cmd = createFn();
    // Commander expects process.argv format: [node, script, command, ...]
    // Pass node, script, then everything AFTER the command name (subcommand args)
    const nameIndex = process.argv.indexOf(name);
    const subArgs = [...process.argv.slice(0, 2), ...process.argv.slice(nameIndex + 1)];
    await cmd.parseAsync(subArgs);
  }
});
```

The fix:
- Preserves `process.argv[0]` (node executable) and `process.argv[1]` (script path)
- Slices from AFTER the command name to get subcommand arguments
- Results in correct format: `['node', '/path/to/dash', 'set', '--project', 'test']`

## Verification

### Test 1: Budget Set Command
```bash
$ node dist/index.js budget set --project test --daily 1000 --cost 10.00
✅ Project daily budget set: 1.0K tokens / $10.0000
   Project: test
   Reset: 0:00 UTC
```

### Test 2: Budget Status Command
```bash
$ node dist/index.js budget status --project test

BUDGET STATUS: Project test
════════════════════════════════════════════════════════════

No budget configured for this project
Total used: $0.0000

Active Budgets: 0
```

**Note:** Status shows "No budget configured" because budget data is stored in-memory and doesn't persist between CLI runs. This is a known limitation - the BudgetRepository (SQLite) exists but the safety/budget.ts module uses in-memory Maps.

### Test 3: Help Commands
```bash
$ node dist/index.js budget set --help
Usage: budget set [options]

Set budget limits

Options:
  --task <tokens>       Set per-task token limit
  --cost <dollars>      Set budget cost limit in USD
  --daily <tokens>      Set daily token limit
  --agent <id>          Agent ID for agent-level budget
  --project <name>      Project name
  --reset-hour <hour>   UTC hour for daily reset (0-23) (default: "0")
  -h, --help            Display help for command
```

## Known Limitations

### Persistence Issue
Budget configurations and active budgets are stored in-memory using JavaScript Maps. Each CLI invocation creates a new process with empty storage. To persist budgets between commands, the safety/budget.ts module would need to be updated to use the BudgetRepository (SQLite) instead of in-memory Maps.

**Workaround:** Within a single process (e.g., in a running server or long-lived agent), budgets persist correctly.

## Files Modified
- `src/cli/index.ts` - Fixed argument parsing in `setupLazyCreateCommand`

## Testing Commands
```bash
# Build
cd /Users/jasontang/clawd/projects/dash
npm run build

# Set budget
node dist/index.js budget set --project test --daily 1000 --cost 10.00

# Check status
node dist/index.js budget status --project test
node dist/index.js budget status

# View help
node dist/index.js budget --help
node dist/index.js budget set --help
node dist/index.js budget status --help
```

## Related Issues
- **Future:** Budget persistence via BudgetRepository (SQLite)
- **Fixed:** BUG-001 - CLI argument parsing failure
