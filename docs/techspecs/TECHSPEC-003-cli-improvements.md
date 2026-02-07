# TECHSPEC-003: CLI Improvements

**Version:** 1.0.0
**Created:** 2026-02-04
**Status:** DRAFT
**Priority:** MEDIUM

## Problem Statement

CLI commands have implementation gaps that cause failures.

### Test Evidence

| Command | Status | Error |
|---------|--------|-------|
| `godel status` | ⚠️ PARTIAL | Crashes on OpenClaw init |
| `godel config get server.port` | ❌ FAIL | Command 'get' not recognized |
| `godel team create --name test` | ❌ FAIL | Missing `--task` option |

## Root Cause Analysis

### Finding 1: OpenClaw Dependency

The `status` command tries to initialize OpenClaw core, which fails when the gateway is unavailable.

### Finding 2: Missing Subcommand

The `config` command only has `set` but not `get`.

### Finding 3: Incomplete Validation

The `team create` command requires `--task` but the error message doesn't indicate this.

## Technical Requirements

### Fix 1: Status Command

Current:
```typescript
// src/cli/commands/status.ts

export default command('status', 'Show system status')
  .action(async () => {
    await openclaw.init();  // FAILS: Gateway unavailable
    const status = await openclaw.getStatus();
    console.log(status);
  });
```

Fixed:
```typescript
// src/cli/commands/status.ts

export default command('status', 'Show system status')
  .option('--simple', 'Show simplified status')
  .action(async (options) => {
    // Always show basic status first
    const basicStatus = {
      version: pkg.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
    
    console.log('=== Godel Status ===');
    console.log(JSON.stringify(basicStatus, null, 2));
    
    // Try OpenClaw only if available
    try {
      await openclaw.init();
      const advancedStatus = await openclaw.getStatus();
      console.log('\n=== OpenClaw Status ===');
      console.log(JSON.stringify(advancedStatus, null, 2));
    } catch (error) {
      console.log('\n⚠️  OpenClaw: Not available');
      console.log('   Run: godel init to configure');
    }
  });
```

### Fix 2: Config Get Command

Current:
```typescript
// src/cli/commands/config.ts

export default command('config', 'Configuration management')
  .addCommand(setCommand);  // Only 'set'
```

Fixed:
```typescript
// src/cli/commands/config.ts

export default command('config', 'Configuration management')
  .addCommand(getCommand)
  .addCommand(setCommand)
  .addCommand(listCommand);

// Get command
const getCommand = command('get <key>', 'Get configuration value')
  .action(async (key: string) => {
    const config = loadConfig();
    const value = getNestedValue(config, key);
    
    if (value === undefined) {
      console.log(`❌  Config key not found: ${key}`);
      console.log('💡  Use "godel config list" to see all keys');
      process.exit(1);
    }
    
    console.log(`${key}=${JSON.stringify(value)}`);
  });

// Helper for nested values
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
```

### Fix 3: Team Create Validation

Current:
```typescript
// src/cli/commands/team.ts

export default command('create [options]', 'Create a team')
  .option('-n, --name <name>', 'Team name')
  .action(async (options) => {
    if (!options.name) {
      console.log('❌  Missing required option: --name');
      return;
    }
    // Does NOT check for --task
    await swarmManager.create({ name: options.name });
  });
```

Fixed:
```typescript
// src/cli/commands/team.ts

export default command('create [options]', 'Create a team')
  .option('-n, --name <name>', 'Team name (required)')
  .option('-t, --task <task>', 'Initial task for team (required)')
  .option('-a, --agents <count>', 'Number of agents', { default: 3 })
  .action(async (options) => {
    // Validation with helpful errors
    const errors: string[] = [];
    
    if (!options.name) {
      errors.push('Missing required option: --name or -n');
    }
    if (!options.task) {
      errors.push('Missing required option: --task or -t');
    }
    
    if (errors.length > 0) {
      console.log('❌  Validation failed:\n');
      errors.forEach(e => console.log(`   ${e}`));
      console.log('\n💡  Example:');
      console.log('   godel team create -n "my-team" -t "Analyze this codebase"');
      console.log('   godel team create --name research --task "Research AI agents"');
      process.exit(1);
    }
    
    // Success case
    const team = await swarmManager.create({
      name: options.name,
      task: options.task,
      agentCount: options.agents
    });
    
    console.log(`✅  Team created: ${team.id}`);
    console.log(`   Name: ${team.name}`);
    console.log(`   Task: ${team.task}`);
    console.log(`   Agents: ${team.agentCount}`);
  });
```

## Implementation Plan

### Phase 1: Status Command Fix
- [ ] Update status command to show basic info first
- [ ] Add graceful handling of OpenClaw unavailability
- [ ] Add `--json` option for scripting

### Phase 2: Config Command
- [ ] Add `get` subcommand
- [ ] Add `list` subcommand
- [ ] Add nested key support (e.g., `server.port`)

### Phase 3: Team Command
- [ ] Add `--task` as required option
- [ ] Improve validation messages
- [ ] Add example usage in help

### Phase 4: Help Improvements
- [ ] Add examples to all commands
- [ ] Add troubleshooting hints
- [ ] Add `--verbose` option for debugging

## Testing Strategy

### CLI Tests

```typescript
// tests/cli/status.test.ts

describe('godel status', () => {
  it('should show basic status without OpenClaw', async () => {
    const output = await runCli(['status', '--simple']);
    
    expect(output).toContain('Godel Status');
    expect(output).toContain('version');
    expect(output).toContain('uptime');
  });
  
  it('should show JSON output', async () => {
    const output = await runCli(['status', '--json']);
    const status = JSON.parse(output);
    
    expect(status.version).toBeDefined();
    expect(status.uptime).toBeDefined();
  });
});

// tests/cli/config.test.ts

describe('godel config', () => {
  it('should get a config value', async () => {
    const output = await runCli(['config', 'get', 'server.port']);
    expect(output).toContain('server.port=7373');
  });
  
  it('should list all config', async () => {
    const output = await runCli(['config', 'list']);
    expect(output).toContain('server.port');
    expect(output).toContain('database.url');
  });
  
  it('should error on missing key', async () => {
    const result = await runCli(['config', 'get', 'missing.key']);
    expect(result.code).toBe(1);
    expect(result.output).toContain('not found');
  });
});

// tests/cli/team.test.ts

describe('godel team create', () => {
  it('should error without --name', async () => {
    const result = await runCli(['team', 'create', '-t', 'Task']);
    expect(result.code).toBe(1);
    expect(result.output).toContain('--name');
  });
  
  it('should error without --task', async () => {
    const result = await runCli(['team', 'create', '-n', 'Name']);
    expect(result.code).toBe(1);
    expect(result.output).toContain('--task');
  });
  
  it('should create team with both options', async () => {
    const result = await runCli([
      'team', 'create',
      '-n', 'test-team',
      '-t', 'Test task',
      '-a', '2'
    ]);
    
    expect(result.code).toBe(0);
    expect(result.output).toContain('Team created');
  });
});
```

## Success Criteria

- [ ] `godel status` shows status without crashing
- [ ] `godel config get server.port` works
- [ ] `godel config list` works
- [ ] `godel team create -n name -t task` works
- [ ] All CLI tests pass
- [ ] Helpful error messages for all edge cases

## Files Affected

- `src/cli/commands/status.ts`
- `src/cli/commands/config.ts`
- `src/cli/commands/team.ts`
- `tests/cli/status.test.ts`
- `tests/cli/config.test.ts`
- `tests/cli/team.test.ts`

## Estimated Effort

- Phase 1: 1 hour
- Phase 2: 1 hour
- Phase 3: 1 hour
- Phase 4: 1 hour
- Testing: 2 hours

**Total: ~6 hours**
