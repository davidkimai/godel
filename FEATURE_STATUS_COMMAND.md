# Feature: `dash status` Command

## Overview

Implements the `dash status` CLI command to display a system overview of the Dash agent orchestration platform.

## Implementation Details

### Files Created/Modified

1. **src/cli/commands/status.ts** (NEW)
   - Main implementation file
   - Provides system status gathering and display
   - Supports both `table` (default) and `json` output formats

2. **src/cli/index.ts** (MODIFIED)
   - Registered the status command in `registerCoreCommands()`
   - Loaded immediately as a lightweight command

### Command Usage

```bash
# Show system status in table format (default)
dash status

# Show system status in JSON format
dash status --format json
dash status -f json
```

### Output Format

#### Table Format (Default)

```
✅ Dash v2.0 Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API:      v3.0.0 (healthy)
Agents:   5 total (3 running, 2 idle)
Swarms:   2 active
Budgets:  1 configured ($5.00/day)
OpenClaw: Connected (mock mode)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### JSON Format

```json
{
  "dash": {
    "version": "2.0.0",
    "apiVersion": "3.0.0",
    "health": "healthy"
  },
  "agents": {
    "total": 5,
    "running": 3,
    "idle": 2,
    "paused": 0,
    "failed": 0
  },
  "swarms": {
    "total": 2,
    "active": 2
  },
  "budgets": {
    "configured": 1,
    "dailyLimit": null,
    "dailyUsed": 5.00
  },
  "openclaw": {
    "connected": true,
    "mode": "mock",
    "version": "mock-1.0.0"
  },
  "timestamp": "2026-02-02T22:22:24.556Z"
}
```

### Data Sources

The status command gathers data from:

1. **Agents**: SQLite database via `AgentRepository`
   - Status counts: idle, spawning, running, paused, failed
   - 
2. **Swarms**: `SwarmManager.listSwarms()` and `listActiveSwarms()`
   - Total swarms and active swarms

3. **Budgets**: `activeBudgets` Map from budget module
   - Number of configured budgets
   - Total daily usage

4. **OpenClaw**: Environment variable detection
   - Checks for `OPENCLAW_SESSION` or `OPENCLAW_GATEWAY_URL`
   - Falls back to "mock mode" when not in OpenClaw environment

### Health Determination

System health is calculated based on:
- OpenClaw connection status
- Ratio of failed agents (>50% = degraded)
- Active swarms without connection = degraded

States:
- `healthy` (✅) - All systems operational
- `degraded` (⚠️) - Some issues but functional
- `unhealthy` (❌) - Critical problems

## Testing

### Build Verification

```bash
cd /Users/jasontang/clawd/projects/dash
npm run build
```

Result: ✅ Build passes with 0 errors

### Command Verification

```bash
node dist/index.js status
```

Output:
```
✅ Dash v2.0.0 Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API:      v3.0.0 (healthy)
Agents:   2 total (0 running, 2 idle)
Swarms:   0 active
Budgets:  None configured
OpenClaw: Connected (mock mode)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### JSON Format Verification

```bash
node dist/index.js status --format json
```

Output: Valid JSON with all expected fields

## Future Enhancements

1. **Real OpenClaw Connection Check**
   - Implement actual gateway health check
   - Display version from gateway API

2. **Budget Configuration**
   - Add daily budget limit from config
   - Show remaining budget percentage

3. **Performance Metrics**
   - Average agent runtime
   - Request rate
   - Error rate

4. **Service Health**
   - Database connection status
   - Message bus health
   - External API dependencies

## Changelog

- 2026-02-02: Initial implementation
  - Basic status display with agents, swarms, budgets, OpenClaw
  - Table and JSON output formats
  - Health determination logic
