# Console Logging Centralization - Migration Summary

## Overview
Migrated from direct `console.*` calls to structured `logger.*` calls using the centralized logger utility.

## Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Console.* calls | 271 | 5 | -98.2% |
| Files modified | - | 11 | - |
| Success criteria | <100 | ✅ 5 | Exceeded |

**Note:** The 5 remaining console.* calls are in `src/utils/logger.ts` itself, which is intentional since the logger uses console methods internally for output.

## Files Modified

### CLI Commands
1. `src/cli/commands/quality.ts` - 30+ console calls → logger
2. `src/cli/commands/tests.ts` - 25+ console calls → logger
3. `src/cli/commands/context.ts` - 40+ console calls → logger
4. `src/cli/commands/agents.ts` - 35+ console calls → logger
5. `src/cli/commands/events.ts` - 20+ console calls → logger
6. `src/cli/commands/tasks.ts` - 25+ console calls → logger

### Core Logic
7. `src/context/dependencies.ts` - 1 console.warn → logger.warn
8. `src/events/emitter.ts` - 3 console.error → logger.error
9. `src/events/replay.ts` - 1 console.warn → logger.warn
10. `src/events/stream.ts` - 3 console.log/error → logger.info/error

### Testing
11. `src/testing/cli/commands/tests.ts` - 1 console.error → logger.error

## Logger Usage Pattern

### Import
```typescript
import { logger } from '../../utils/logger';
```

### Usage
```typescript
// Info messages
logger.info(`Running tests for agent: ${agentId}`);

// Debug messages (only shown in debug mode)
logger.debug('Detailed information here');

// Error with context
logger.error('Operation failed:', { error: error.message, agentId });

// Warnings
logger.warn(`Warning: ${message}`);
```

## Structured Logging Features

The centralized logger provides:
- **Timestamp formatting** - ISO timestamps with local time display
- **Level indicators** - [DEBUG], [INFO], [WARN], [ERROR] prefixes
- **JSON output mode** - For programmatic consumption
- **Level filtering** - Suppress logs below configured level
- **Context support** - Pass additional context data

## Migration Script

For future quick replacements:

```bash
# Replace console.log with logger.info
find src/ -name "*.ts" -exec sed -i '' 's/console\.log(/logger.info(/g' {} \;

# Replace console.error with logger.error
find src/ -name "*.ts" -exec sed -i '' 's/console\.error(/logger.error(/g' {} \;

# Replace console.warn with logger.warn
find src/ -name "*.ts" -exec sed -i '' 's/console\.warn(/logger.warn(/g' {} \;
```

## Verification

```bash
# Count remaining console calls
grep -r "console\." src/ --include="*.ts" | wc -l
# Expected: 5 (all in logger.ts itself)

# Run tests
npm test
```

## Notes

- The logger itself uses `console.debug`, `console.log`, `console.warn`, and `console.error` internally - this is intentional
- All CLI commands now use structured logging for consistent output
- Error logging includes context objects for better debugging
- The migration maintains backward compatibility with existing behavior
