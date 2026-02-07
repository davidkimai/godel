# Error Handling and Logging Standards

## Overview

This document outlines the standardized error handling and logging approach used across the Godel codebase.

## Files Created/Modified

### 1. New Error Classes (`src/utils/errors.ts`)

Created a comprehensive set of domain-specific error classes:

#### Base Error Class
- `GodelError` - Base class with code, context, and JSON serialization

#### Domain-Specific Errors
- `AgentError` / `AgentNotFoundError` / `AgentInitializationError` / `AgentExecutionError`
- `FederationError` / `AgentRegistryError` / `LoadBalancerError` / `CircuitBreakerError`
- `TaskDecompositionError` / `ExecutionEngineError`
- `LoopError` / `EventStoreError` / `StateMachineError` / `EventReplayError` / `WorkflowError`
- `AutonomicError` / `PatchApplicationError` / `TestGenerationError`
- `IntentError` / `IntentParseError` / `ComplexityAnalysisError`
- `CoreError` / `EventBusError` / `SwarmError` / `ExtensionError`
- `ConfigurationError` / `ValidationError`
- `ResourceError` / `ResourceNotFoundError` / `ResourceConflictError`
- `NetworkError` / `TimeoutError`

#### Helper Functions
- `isGodelError()`, `isAgentError()`, `isFederationError()`, etc.
- `toGodelError()` - Convert any error to GodelError
- `ErrorCode` enum - Type-safe error codes

### 2. Enhanced Logger (`src/utils/logger.ts`)

Added new utility functions:

- `createLogger(module)` - Creates module-specific logger with preset module name
- `sanitizeForLogging(data)` - Removes sensitive fields (passwords, tokens, secrets) from log data

Module logger provides:
- `debug()`, `info()`, `warn()`, `error()` - Standard log methods
- `logError(message, error, context)` - Properly logs error objects with stack traces

### 3. Updated Exports (`src/utils/index.ts`)

Exported all error classes and logger utilities for easy importing.

## Files Updated to Use Logger

### Federation Module
- `src/federation/execution-tracker.ts` - Replaced verbose console.log with structured logging
- `src/federation/strategies/consistent-hash.ts` - Added warning logging for fallback scenarios

### Loop Module (Alerts)
- `src/loop/alerts/rules.ts` - Error logging for rule evaluation and action execution
- `src/loop/alerts/manager.ts` - Info and error logging for manager lifecycle
- `src/loop/alerts/anomaly-detection.ts` - Error logging for detection failures
- `src/loop/alerts/storage.ts` - Error logging for storage operations

### Loop Module (Metrics & Read Models)
- `src/loop/metrics/system-collector.ts` - Error logging for metrics collection
- `src/loop/read-models/agent-read-model.ts` - Warning logging for persistence failures

### Intent Module
- `src/intent/parser.ts` - Warning logging for LLM parsing fallback
- `src/intent/complexity-analyzer.ts` - Warning logging for file analysis failures

## Standards Applied

### Error Handling Standards

1. **Custom Error Classes**
   ```typescript
   class AgentNotFoundError extends AgentError {
     constructor(agentId: string) {
       super(
         `Agent '${agentId}' not found`,
         agentId,
         'AGENT_NOT_FOUND',
         { agentId }
       );
     }
   }
   ```

2. **Consistent Error Format**
   - `name`: Error class name
   - `message`: Human-readable description
   - `code`: Machine-readable error code
   - `stack`: Stack trace (development only)
   - `context`: Additional contextual data

3. **Async Error Handling**
   ```typescript
   try {
     await someAsyncOperation();
   } catch (error) {
     log.logError('Operation failed', error, { context: 'data' });
     throw new CustomError('message', 'CODE', { context: 'data' });
   }
   ```

4. **Error Propagation**
   - Don't swallow errors without logging
   - Wrap errors in domain-specific types
   - Preserve original error in context

### Logging Standards

1. **Structured Logging**
   ```typescript
   const log = createLogger('module-name');
   log.info('Operation completed', { key: 'value', count: 42 });
   ```

2. **Log Levels**
   - `debug` - Detailed information for debugging
   - `info` - General operational information
   - `warn` - Warning conditions (fallbacks, recoverable errors)
   - `error` - Error conditions requiring attention

3. **Context Inclusion**
   ```typescript
   log.info('Task started', { taskId, agentId, sessionId });
   ```

4. **Sensitive Data Handling**
   ```typescript
   import { sanitizeForLogging } from '../utils/logger';
   log.info('Config', sanitizeForLogging(config));
   ```

5. **Error Logging Pattern**
   ```typescript
   log.logError('Failed to process', error, { additional: 'context' });
   ```

## Exceptions (Console Allowed)

The following cases are acceptable to use `console`:

1. **CLI User-Facing Output** - `src/intent/executor.ts` uses chalk-colored console output for CLI
2. **Visual Progress UI** - `createConsoleReporter()` in execution-tracker.ts for terminal UI
3. **JSDoc Examples** - Documentation examples in comments

## Usage Examples

### Creating a Module Logger
```typescript
import { createLogger } from '../utils/logger';

const log = createLogger('my-module');
```

### Logging at Different Levels
```typescript
log.debug('Detailed debug info', { data: 'value' });
log.info('Something happened', { id: 123 });
log.warn('Warning condition', { reason: 'fallback' });
log.error('Error occurred', { code: 'ERROR_CODE' });
```

### Logging Errors
```typescript
try {
  await riskyOperation();
} catch (error) {
  log.logError('Operation failed', error, { context: 'data' });
}
```

### Throwing Custom Errors
```typescript
import { AgentNotFoundError } from '../utils/errors';

if (!agent) {
  throw new AgentNotFoundError(agentId);
}
```

### Type Guards
```typescript
import { isGodelError, isAgentError } from '../utils/errors';

if (isAgentError(error)) {
  // Handle agent-specific error
}
```
