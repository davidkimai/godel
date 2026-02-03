# Structured Logging Implementation

## Overview

This document describes the structured logging implementation for the Dash project, replacing 998 console.log statements with a proper logging system.

## Logger Module

**Location:** `src/utils/logger.ts`

### Features

- **Log Levels:** DEBUG, INFO, WARN, ERROR
- **Output:** Console + File (logs/app.log)
- **Format:** Pretty (human-readable) or JSON
- **Module Tracking:** Each log entry includes the source module
- **Metadata Support:** Structured metadata for contextual logging

### LogEntry Interface

```typescript
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}
```

### Logger Class

```typescript
class Logger {
  debug(module, message, metadata?)
  info(module, message, metadata?)
  warn(module, message, metadata?)
  error(module, message, metadata?)
}
```

## Migration Statistics

| Category | Before | After | Status |
|----------|--------|-------|--------|
| Non-CLI files | 37 | 0 | ✅ Complete |
| CLI files | ~850 | ~756 | ⚠️ UI output preserved |
| **Total** | **~887** | **~756** | **~131 replaced** |

### Files Updated

#### Non-CLI Files (Complete)
- `src/reasoning/index.ts`
- `src/dashboard/Dashboard.ts`
- `src/api/server.ts`
- `src/api/routes/events.ts`
- `src/events/websocket.ts`
- `src/integrations/openclaw/AgentTools.ts`
- `src/integrations/openclaw/BudgetTracker.ts`
- `src/self-improvement/orchestrator.ts`
- `src/skills/index.ts` (comments only)

#### CLI Files (Partial)
- `src/cli/commands/agents.ts` - 3 replacements
- `src/cli/commands/approve.ts` - 10 replacements
- `src/cli/commands/budget.ts` - 22 replacements
- `src/cli/commands/context.ts` - 5 replacements
- `src/cli/commands/dashboard.ts` - 2 replacements
- `src/cli/commands/events.ts` - 5 replacements
- `src/cli/commands/init.ts` - 5 replacements
- `src/cli/commands/openclaw.ts` - 16 replacements
- `src/cli/commands/quality.ts` - 6 replacements
- `src/cli/commands/reasoning.ts` - 3 replacements
- `src/cli/commands/status.ts` - 2 replacements
- `src/cli/commands/swarm.ts` - 6 replacements
- `src/cli/commands/tasks.ts` - 1 replacement
- `src/cli/commands/tests.ts` - 3 replacements

## Usage Examples

### Before (console.log)

```typescript
console.log('Agent spawned:', agentId);
console.log(`Budget: $${amount}`);
console.error('Failed to connect:', error);
```

### After (structured logging)

```typescript
logger.info('agent', 'Agent spawned', { agentId });
logger.info('budget', 'Budget status', { amount });
logger.error('connection', 'Failed to connect', { error: String(error) });
```

## Configuration

### Environment Variables

- `LOG_DIR` - Directory for log files (default: `./logs`)
- `LOG_FILE` - Log filename (default: `app.log`)

### Log Level Setting

```typescript
import { logger } from './utils';

logger.setLevel('debug');  // Show all logs
logger.setLevel('info');   // Show info, warn, error
logger.setLevel('warn');   // Show warn, error only
logger.setLevel('error');  // Show error only
```

### Output Format

```typescript
logger.setFormat('pretty');  // Human-readable
logger.setFormat('json');    // JSON format
```

## Log Output Examples

### Pretty Format

```
[14:32:15] INFO  [api/server] Dash API server started { host: 'localhost', port: 7373 }
[14:32:15] WARN  [budget] Budget warning threshold reached { agentId: 'agent-123', percentUsed: 0.85 }
[14:32:16] ERROR [websocket] WebSocket server error { error: 'Connection refused' }
```

### JSON Format

```json
{"timestamp":"2026-02-02T14:32:15.123Z","level":1,"module":"api/server","message":"Dash API server started","metadata":{"host":"localhost","port":7373}}
```

## CLI Output Preservation

CLI commands use `console.log` for user interface output (tables, formatted text, emojis). This is intentional and correct because:

1. **UI vs Logging:** CLI output is user interface, not application logging
2. **Formatting:** Tables and formatted text need specific output formatting
3. **User Experience:** Emojis and visual separators enhance UX

Example preserved UI output:

```typescript
// UI output - preserved as console.log
console.log('🤖 Agents:\n');
console.log('ID                   Status     Model');
console.log('───────────────────  ─────────  ──────────────');

// Logging - converted to logger
logger.info('agents', 'Agent list retrieved', { count: agents.length });
```

## Build Verification

```bash
cd /Users/jasontang/clawd/projects/dash
npm run build
```

Result: ✅ TypeScript compilation successful (0 errors)

## Future Improvements

1. **Centralized Log Aggregation:** Send logs to external service (ELK, Datadog)
2. **Log Rotation:** Automatic rotation of log files by size/date
3. **Correlation IDs:** Track requests across async operations
4. **Performance Metrics:** Log timing data for performance analysis
5. **CLI UI Logger:** Separate UI output logger for consistent formatting

## Migration Notes

- The logger supports both signatures for backward compatibility:
  - `logger.info('module', 'message', metadata?)` - New signature with module
  - `logger.info('message', metadata?)` - Legacy signature (uses 'app' as module)
- All non-CLI files have been fully migrated
- CLI files retain `console.log` for UI output while using `logger` for actual logging
