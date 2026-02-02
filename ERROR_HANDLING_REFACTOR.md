# Error Handling Refactor

## Overview

This document describes the production-grade error handling system implemented in Dash. The refactor ensures consistent error handling across the codebase, eliminates silent failures, and provides proper error recovery strategies.

## Changes Made

### 1. Error Index File Created

**File:** `src/errors/index.ts`

Created a comprehensive index file that exports:
- All error classes from `custom.ts`
- All error handlers from `handler.ts`
- **NEW:** Dash-specific error codes (E-Codes)
- **NEW:** Error recovery strategies
- **NEW:** Assertion utilities
- **NEW:** Safe execution wrappers

### 2. Error Codes Added

**Enum:** `DashErrorCode`

Machine-readable error codes for programmatic handling:

| Code Range | Category |
|------------|----------|
| E1xx | Lifecycle Errors |
| E2xx | Agent Errors |
| E3xx | Swarm Errors |
| E4xx | Context Errors |
| E5xx | OpenClaw Errors |
| E6xx | Budget Errors |
| E7xx | Dependency Errors |
| E8xx | Configuration Errors |
| E9xx | System Errors |

### 3. Error Recovery Strategies

**Object:** `ErrorRecoveryStrategies`

Predefined recovery actions for common errors:

```typescript
{
  [DashErrorCode.AGENT_SPAWN_FAILED]: { type: 'retry', delayMs: 1000, maxAttempts: 3 },
  [DashErrorCode.BUDGET_EXHAUSTED]: { type: 'escalate', toModel: 'cheaper-model' },
  [DashErrorCode.CONTEXT_NOT_FOUND]: { type: 'fallback', fallbackValue: { files: [] } },
  // ... more strategies
}
```

### 4. Files Refactored

#### Core Files
- `src/core/lifecycle.ts` - Converted to use ApplicationError with proper error codes
- `src/core/swarm.ts` - Added proper error handling with SwarmNotFoundError
- `src/core/openclaw.ts` - Added OpenClaw-specific error handling

#### Context Files
- `src/context/manager.ts` - Added context-specific errors
- `src/context/dependencies.ts` - Added cyclic dependency errors

#### Utility Files
- `src/utils/cli-state.ts` - Converted console.error to proper logging

## Error Handling Patterns

### Pattern 1: Basic Error Throwing

**Before:**
```typescript
throw new Error('Agent not found');
```

**After:**
```typescript
import { AgentNotFoundError, DashErrorCode } from '../errors';

throw new AgentNotFoundError(agentId, { code: DashErrorCode.AGENT_NOT_FOUND });
```

### Pattern 2: Try/Catch with Recovery

**Before:**
```typescript
try {
  await spawnSession();
} catch (error) {
  console.error('Failed:', error);
  // Silent failure
}
```

**After:**
```typescript
import { withErrorHandling, DashErrorCode } from '../errors';

const spawnWithRecovery = withErrorHandling(
  async () => await spawnSession(),
  {
    errorCode: DashErrorCode.SESSION_SPAWN_FAILED,
    context: { agentId },
    recovery: true,
    onError: (error) => logger.error('Spawn failed', error)
  }
);
```

### Pattern 3: Safe Execution

**Before:**
```typescript
let result;
try {
  result = await riskyOperation();
} catch {
  result = defaultValue;
}
```

**After:**
```typescript
import { safeExecute } from '../errors';

const result = await safeExecute(
  () => riskyOperation(),
  defaultValue,
  { logError: true, context: 'riskyOperation' }
);
```

### Pattern 4: Assertions

**Before:**
```typescript
if (!lifecycle.isStarted()) {
  throw new Error('Call lifecycle.start() first');
}
```

**After:**
```typescript
import { assert, DashErrorCode } from '../errors';

assert(
  lifecycle.isStarted(),
  'Call lifecycle.start() first',
  { code: DashErrorCode.LIFECYCLE_NOT_STARTED }
);
```

### Pattern 5: Existential Check

**Before:**
```typescript
const state = this.states.get(agentId);
if (!state) {
  throw new Error(`Agent ${agentId} not found`);
}
```

**After:**
```typescript
import { assertExists, DashErrorCode } from '../errors';

const state = assertExists(
  this.states.get(agentId),
  'Agent',
  agentId,
  { code: DashErrorCode.AGENT_NOT_FOUND }
);
```

## Migration Guide

### Step 1: Replace Generic Errors

Replace all `throw new Error()` with appropriate ApplicationError subclasses:

| Old Pattern | New Pattern |
|-------------|-------------|
| `throw new Error('Not found')` | `throw new NotFoundError(resource, id)` |
| `throw new Error('Invalid')` | `throw new ValidationError(message)` |
| `throw new Error('Timeout')` | `throw new AgentTimeoutError(agentId, ms)` |
| `throw new Error('Auth failed')` | `throw new AuthenticationError()` |

### Step 2: Fix Silent Failures

Replace empty catch blocks:

**Before:**
```typescript
try {
  await operation();
} catch {
  // ignore
}
```

**After:**
```typescript
try {
  await operation();
} catch (error) {
  logger.warn('Operation failed, continuing', { error });
  // Or use safeExecute for expected failures
}
```

### Step 3: Add Error Context

Always include context with errors:

```typescript
throw new AgentExecutionError(agentId, message, {
  attempt: retryCount,
  lastError: error.message,
  timestamp: new Date().toISOString()
});
```

### Step 4: Implement Recovery

For recoverable errors, implement retry logic:

```typescript
import { withRetry } from '../errors';

const result = await withRetry(
  async () => await fetchData(),
  {
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    retryableErrors: [DashErrorCode.NETWORK_ERROR]
  }
);
```

## Error Recovery Strategies Reference

| Error Code | Strategy | Description |
|------------|----------|-------------|
| E200-207 | retry | Agent operations retry 3 times |
| E300-306 | abort | Swarm errors are fatal |
| E400-404 | fallback/skip | Context errors use defaults |
| E500-506 | retry | Session operations retry |
| E600 | escalate | Budget exhausted → cheaper model |
| E700 | abort | Cyclic dependencies are fatal |

## Testing

### Unit Tests for Error Handling

```typescript
describe('Error Handling', () => {
  it('should throw AgentNotFoundError for missing agent', () => {
    expect(() => {
      assertExists(null, 'Agent', '123', { code: DashErrorCode.AGENT_NOT_FOUND });
    }).toThrow(AgentNotFoundError);
  });

  it('should retry on recoverable errors', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new NetworkError('fail');
      return 'success';
    };

    const result = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});
```

## Monitoring and Observability

### Error Metrics

The error system tracks:
- Total error count
- Errors by code
- Errors by HTTP status
- Operational vs programming error ratio

Access metrics:
```typescript
import { getErrorMetrics } from '../errors';

const metrics = getErrorMetrics();
console.log(`Total errors: ${metrics.total}`);
console.log(`Operational: ${metrics.operational}`);
```

### Logging

All errors should be logged with structured context:

```typescript
logger.error('Operation failed', {
  error: error.toLogEntry(),
  agentId,
  operation: 'spawn'
});
```

## Best Practices

1. **Never swallow errors** - Always handle or propagate
2. **Use specific error types** - Don't use generic Error
3. **Include context** - Add relevant metadata to errors
4. **Implement recovery** - Use retry for transient failures
5. **Log properly** - Use structured logging with context
6. **Test error paths** - Write tests for failure scenarios
7. **Document error codes** - Keep this document updated

## Checklist

- [x] Error index file created with all exports
- [x] Dash-specific error codes defined (E-Codes)
- [x] Error recovery strategies implemented
- [x] Core lifecycle errors refactored
- [x] Swarm errors refactored
- [x] Context manager errors refactored
- [x] OpenClaw integration errors refactored
- [x] Silent failures eliminated
- [x] Console.error calls converted to proper logging
- [x] Assertion utilities added
- [x] Safe execution wrappers added
- [x] Documentation complete

## Summary of Changes

### Files Created/Modified

| File | Status | Description |
|------|--------|-------------|
| `src/errors/index.ts` | **Created** | Main error module with all exports, E-Codes, recovery strategies |
| `src/core/lifecycle.ts` | **Refactored** | Now uses ApplicationError, assertExists, safeExecute |
| `src/core/swarm.ts` | **Refactored** | Now uses SwarmNotFoundError, ApplicationError, safeExecute |
| `src/core/openclaw.ts` | **Refactored** | Now uses NotFoundError, ApplicationError, safeExecute |
| `src/context/manager.ts` | **Refactored** | Now uses ValidationError, assert, assertExists |
| `src/context/dependencies.ts` | **Refactored** | Now uses ApplicationError for cyclic dependencies |
| `src/utils/cli-state.ts` | **Refactored** | Uses logger instead of console.error |

### Error Codes Added (E-Codes)

- **E1xx**: Lifecycle Errors (not started, invalid transitions)
- **E2xx**: Agent Errors (not found, spawn/start/pause/resume/kill/complete failed)
- **E3xx**: Swarm Errors (not found, create/destroy/scale failed, max agents exceeded)
- **E4xx**: Context Errors (not found, invalid path, max files exceeded)
- **E5xx**: OpenClaw Errors (session not found, initialization failed)
- **E6xx**: Budget Errors (exhausted, invalid config)
- **E7xx**: Dependency Errors (cyclic dependency)
- **E8xx**: Configuration Errors
- **E9xx**: System Errors (initialization failed)

### Build Status

✅ **TypeScript compilation successful**

```bash
cd /Users/jasontang/clawd/projects/dash
npm run build  # ✅ No errors
```

### Verification

All core files verified to have:
- ✅ No `throw new Error()` - using structured ApplicationError subclasses
- ✅ Proper error imports from `'../errors'`
- ✅ Error recovery strategies for transient failures
- ✅ Safe execution wrappers for non-critical operations

## Future Improvements

1. **Error Aggregation** - Centralized error collection service
2. **Alerting** - Automatic alerts for programming errors
3. **Error Budgets** - SLO-based error rate monitoring
4. **Distributed Tracing** - Trace errors across service boundaries
5. **Error Sampling** - Intelligent error sampling for high-volume scenarios
