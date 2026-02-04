# Logging API Reference

Complete API documentation for the Dash structured logging module.

## Classes

### StructuredLogger

Main logger class providing structured logging capabilities.

#### Constructor

```typescript
new StructuredLogger(options?: LoggerOptions)
```

**Parameters:**
- `options` - Configuration options (optional)

#### Methods

##### `child(context: LogContext): StructuredLogger`

Create a child logger with additional context.

```typescript
const childLogger = logger.child({ agentId: 'agent-123' });
childLogger.info('Message'); // Includes agentId in all logs
```

##### `setContext(context: LogContext): void`

Set context for the current logger instance.

```typescript
logger.setContext({ traceId: 'abc-123' });
```

##### `clearContext(): void`

Clear all context from the logger.

```typescript
logger.clearContext();
```

##### `getTraceId(): string`

Get current trace ID or create a new one.

```typescript
const traceId = logger.getTraceId();
```

##### `startTrace(traceId?: string): string`

Create a new trace context.

```typescript
const traceId = logger.startTrace(); // Auto-generated
// or
const traceId = logger.startTrace('my-trace-id'); // Custom
```

##### `startSpan(spanName: string): string`

Start a child span within the current trace.

```typescript
const spanId = logger.startSpan('database-query');
```

##### `endSpan(): void`

End the current span and return to parent.

```typescript
logger.endSpan();
```

##### `debug(message: string, metadata?: Record<string, unknown>): void`

Log a debug message.

```typescript
logger.debug('Debug info', { detail: 'value' });
```

##### `info(message: string, metadata?: Record<string, unknown>): void`

Log an info message.

```typescript
logger.info('Operation completed', { count: 42 });
```

##### `warn(message: string, metadata?: Record<string, unknown>, error?: Error): void`

Log a warning message.

```typescript
logger.warn('Unexpected state', { state: 'pending' });
```

##### `error(message: string, error?: Error, metadata?: Record<string, unknown>): void`

Log an error message.

```typescript
try {
  // ...
} catch (error) {
  logger.error('Operation failed', error as Error, { operation: 'save' });
}
```

##### `fatal(message: string, error?: Error, metadata?: Record<string, unknown>): void`

Log a fatal error message.

```typescript
logger.fatal('System crashed', error);
```

##### `logDuration(level: LogLevel, message: string, durationMs: number, metadata?: Record<string, unknown>): void`

Log with timing information.

```typescript
logger.logDuration(LogLevel.INFO, 'Query executed', 150, { table: 'users' });
```

##### `time<T>(level: LogLevel, message: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>`

Time a function and log its execution.

```typescript
const result = await logger.time(
  LogLevel.INFO,
  'Fetch users',
  async () => await db.query('SELECT * FROM users'),
  { table: 'users' }
);
```

### ErrorPatternDetector

Detects common error patterns in log messages.

#### Constructor

```typescript
new ErrorPatternDetector(patterns?: ErrorPattern[])
```

**Parameters:**
- `patterns` - Array of error patterns (defaults to DEFAULT_ERROR_PATTERNS)

#### Methods

##### `detect(errorMessage: string): ErrorPattern | null`

Detect if an error message matches a known pattern.

```typescript
const pattern = detector.detect('Connection refused: localhost:5432');
if (pattern) {
  console.log(pattern.name); // 'ConnectionRefused'
}
```

##### `addPattern(pattern: ErrorPattern): void`

Add a custom error pattern.

```typescript
detector.addPattern({
  pattern: /custom.*error/i,
  name: 'CustomError',
  severity: 'high',
  category: 'custom',
  description: 'Custom error pattern'
});
```

##### `analyzeLogEntry(entry: LogEntry): { pattern: ErrorPattern | null; matched: boolean }`

Analyze a log entry for error patterns.

```typescript
const analysis = detector.analyzeLogEntry(logEntry);
if (analysis.matched) {
  console.log(`Detected: ${analysis.pattern?.name}`);
}
```

### LogMetricsCollector

Collects metrics about log volume and error rates.

#### Constructor

```typescript
new LogMetricsCollector(windowSizeMs?: number)
```

**Parameters:**
- `windowSizeMs` - Time window for metrics collection (default: 60000ms)

#### Methods

##### `record(entry: LogEntry): void`

Record a log entry for metrics.

```typescript
collector.record(logEntry);
```

##### `getMetrics(): LogMetrics`

Get current metrics.

```typescript
const metrics = collector.getMetrics();
console.log(metrics.errorRate);
console.log(metrics.logsByLevel);
```

##### `shouldAlert(errorThreshold?: number): boolean`

Check if error rate exceeds threshold.

```typescript
if (collector.shouldAlert(0.1)) {
  console.log('Error rate is too high!');
}
```

## Functions

### getLogger(options?: LoggerOptions): StructuredLogger

Get or create the global logger instance.

```typescript
const logger = getLogger({ level: LogLevel.DEBUG });
```

### setGlobalLogger(logger: StructuredLogger): void

Set the global logger instance.

```typescript
setGlobalLogger(new StructuredLogger({ service: 'my-service' }));
```

### createAgentLogger(agentId: string, swarmId?: string, options?: LoggerOptions): StructuredLogger

Create a logger for a specific agent.

```typescript
const logger = createAgentLogger('agent-123', 'swarm-456');
```

### createRequestLogger(requestId: string, userId?: string, options?: LoggerOptions): StructuredLogger

Create a logger for a specific request.

```typescript
const logger = createRequestLogger('req-abc', 'user-xyz');
```

### createWorkflowLogger(workflowId: string, taskId?: string, options?: LoggerOptions): StructuredLogger

Create a logger for workflow execution.

```typescript
const logger = createWorkflowLogger('wf-123', 'task-456');
```

### withContext<T>(context: LogContext, fn: (logger: StructuredLogger) => Promise<T>, options?: LoggerOptions): Promise<T>

Run a function with logging context.

```typescript
const result = await withContext(
  { traceId: 'abc-123', agentId: 'agent-1' },
  async (logger) => {
    logger.info('Processing...');
    return await processData();
  }
);
```

### requestLoggerMiddleware(options?: LoggerOptions)

Express middleware for request logging.

```typescript
app.use(requestLoggerMiddleware());
```

## Types

### LogLevel

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}
```

### LogContext

```typescript
interface LogContext {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  agentId?: string;
  swarmId?: string;
  workflowId?: string;
  taskId?: string;
  userId?: string;
  requestId?: string;
  sessionId?: string;
  [key: string]: unknown;
}
```

### LogEntry

```typescript
interface LogEntry {
  timestamp: string;
  level: string;
  levelCode: number;
  service: string;
  message: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  agent_id?: string;
  swarm_id?: string;
  workflow_id?: string;
  task_id?: string;
  user_id?: string;
  request_id?: string;
  session_id?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  source: {
    file?: string;
    line?: number;
    function?: string;
  };
}
```

### LoggerOptions

```typescript
interface LoggerOptions {
  service?: string;
  level?: LogLevel | string;
  enableConsole?: boolean;
  enableFile?: boolean;
  filePath?: string;
  enableSampling?: boolean;
  sampleRate?: number;
  redactFields?: string[];
  prettyPrint?: boolean;
  addSource?: boolean;
}
```

### ErrorPattern

```typescript
interface ErrorPattern {
  pattern: RegExp;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
}
```

### LogMetrics

```typescript
interface LogMetrics {
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByService: Record<string, number>;
  errorCount: number;
  errorRate: number;
  averageDuration?: number;
  timestamp: string;
}
```

## Constants

### LogLevelNames

```typescript
const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL'
};
```

### DEFAULT_ERROR_PATTERNS

Array of built-in error patterns for detection.

```typescript
import { DEFAULT_ERROR_PATTERNS } from './logging';

console.log(DEFAULT_ERROR_PATTERNS.map(p => p.name));
// ['ConnectionRefused', 'Timeout', 'OutOfMemory', ...]
```

## Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | string | `info` | Global log level |
| `DASH_LOG_LEVEL` | string | `info` | Alternative log level |
| `DASH_SERVICE_NAME` | string | `dash` | Service identifier |
| `NODE_ENV` | string | - | Controls prettyPrint default |
