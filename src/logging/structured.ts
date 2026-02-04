/**
 * Structured Logging Module for Dash
 * 
 * Provides JSON-formatted logs with correlation IDs, trace context,
 * and agent-specific metadata for centralized log aggregation.
 * 
 * @module logging/structured
 */

import { randomUUID } from 'crypto';

// ============================================================================
// Types and Interfaces
// ============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL'
};

export interface LogContext {
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

export interface LogEntry {
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

export interface LoggerConfig {
  service: string;
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableSampling: boolean;
  sampleRate: number;
  redactFields: string[];
  prettyPrint: boolean;
  addSource: boolean;
}

export interface LoggerOptions {
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

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: LoggerConfig = {
  service: 'dash',
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: false,
  enableSampling: false,
  sampleRate: 1.0,
  redactFields: ['password', 'token', 'secret', 'api_key', 'apikey', 'authorization', 'cookie'],
  prettyPrint: process.env.NODE_ENV === 'development',
  addSource: true
};

// Sensitive fields to redact
const DEFAULT_REDACT_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /session/i,
  /cookie/i
];

// ============================================================================
// AsyncLocalStorage for Context Propagation
// ============================================================================

// Simple context storage without async_hooks for broader compatibility
class ContextStore {
  private contexts = new Map<string, LogContext>();
  
  get(key: string): LogContext | undefined {
    return this.contexts.get(key);
  }
  
  set(key: string, context: LogContext): void {
    this.contexts.set(key, context);
  }
  
  delete(key: string): void {
    this.contexts.delete(key);
  }
  
  clear(): void {
    this.contexts.clear();
  }
}

const contextStore = new ContextStore();

// ============================================================================
// Utility Functions
// ============================================================================

function parseLogLevel(level: LogLevel | string): LogLevel {
  if (typeof level === 'number') return level;
  const normalized = level.toUpperCase();
  switch (normalized) {
    case 'DEBUG': return LogLevel.DEBUG;
    case 'INFO': return LogLevel.INFO;
    case 'WARN':
    case 'WARNING': return LogLevel.WARN;
    case 'ERROR': return LogLevel.ERROR;
    case 'FATAL': return LogLevel.FATAL;
    default: return LogLevel.INFO;
  }
}

function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL || process.env.DASH_LOG_LEVEL;
  if (envLevel) {
    return parseLogLevel(envLevel);
  }
  return DEFAULT_CONFIG.level;
}

function redactSensitiveData(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const shouldRedact = fields.some(field => 
      key.toLowerCase().includes(field.toLowerCase()) ||
      DEFAULT_REDACT_PATTERNS.some(pattern => pattern.test(key))
    );
    
    if (shouldRedact && typeof value === 'string') {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactSensitiveData(value as Record<string, unknown>, fields);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

function getSourceLocation(): { file?: string; line?: number; function?: string } {
  const stack = new Error().stack;
  if (!stack) return {};
  
  const lines = stack.split('\n');
  // Skip first 3 lines (Error, getSourceLocation, log function)
  const callerLine = lines[3] || lines[2];
  if (!callerLine) return {};
  
  const match = callerLine.match(/at\s+(?:(\S+)\s+)?\(?(.*?):(\d+):(\d+)\)?/);
  if (match) {
    return {
      function: match[1],
      file: match[2]?.split('/').pop(),
      line: parseInt(match[3], 10)
    };
  }
  
  return {};
}

function formatError(error: Error): LogEntry['error'] {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: (error as { code?: string }).code
  };
}

// ============================================================================
// Logger Implementation
// ============================================================================

export class StructuredLogger {
  private config: LoggerConfig;
  private context: LogContext = {};
  private writeStream?: NodeJS.WritableStream;

  constructor(options: LoggerOptions = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
      service: options.service || process.env.DASH_SERVICE_NAME || DEFAULT_CONFIG.service,
      level: options.level !== undefined ? parseLogLevel(options.level) : getLogLevelFromEnv(),
      redactFields: [...DEFAULT_CONFIG.redactFields, ...(options.redactFields || [])]
    };

    if (this.config.enableFile && this.config.filePath) {
      // File streaming would be implemented here with fs.createWriteStream
      // For now, we log to console only
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    const child = new StructuredLogger(this.config);
    child.context = { ...this.context, ...context };
    return child;
  }

  /**
   * Set context for the current logger instance
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear all context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Get current trace ID or create a new one
   */
  getTraceId(): string {
    return this.context.traceId || randomUUID();
  }

  /**
   * Create a new trace context
   */
  startTrace(traceId?: string): string {
    const id = traceId || randomUUID();
    this.context.traceId = id;
    this.context.spanId = randomUUID();
    return id;
  }

  /**
   * Start a child span within the current trace
   */
  startSpan(spanName: string): string {
    const spanId = randomUUID();
    this.context.parentSpanId = this.context.spanId;
    this.context.spanId = spanId;
    return spanId;
  }

  /**
   * End the current span and return to parent
   */
  endSpan(): void {
    if (this.context.parentSpanId) {
      this.context.spanId = this.context.parentSpanId;
      this.context.parentSpanId = undefined;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (level < this.config.level) return false;
    
    if (this.config.enableSampling && Math.random() > this.config.sampleRate) {
      return false;
    }
    
    return true;
  }

  private formatLogEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error,
    durationMs?: number
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevelNames[level],
      levelCode: level,
      service: this.config.service,
      message,
      source: this.config.addSource ? getSourceLocation() : {}
    };

    // Add context fields
    if (this.context.traceId) entry.trace_id = this.context.traceId;
    if (this.context.spanId) entry.span_id = this.context.spanId;
    if (this.context.parentSpanId) entry.parent_span_id = this.context.parentSpanId;
    if (this.context.agentId) entry.agent_id = this.context.agentId;
    if (this.context.swarmId) entry.swarm_id = this.context.swarmId;
    if (this.context.workflowId) entry.workflow_id = this.context.workflowId;
    if (this.context.taskId) entry.task_id = this.context.taskId;
    if (this.context.userId) entry.user_id = this.context.userId;
    if (this.context.requestId) entry.request_id = this.context.requestId;
    if (this.context.sessionId) entry.session_id = this.context.sessionId;

    // Add error if present
    if (error) {
      entry.error = formatError(error);
    }

    // Add duration if present
    if (durationMs !== undefined) {
      entry.duration_ms = durationMs;
    }

    // Add and redact metadata
    if (metadata && Object.keys(metadata).length > 0) {
      entry.metadata = redactSensitiveData(metadata, this.config.redactFields);
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    if (!this.config.enableConsole) return;

    if (this.config.prettyPrint) {
      this.prettyPrint(entry);
    } else {
      // JSON output for production
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    }
  }

  private prettyPrint(entry: LogEntry): void {
    const colors: Record<string, string> = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
      FATAL: '\x1b[35m', // Magenta
      RESET: '\x1b[0m'
    };

    const color = colors[entry.level] || '';
    const reset = colors.RESET;

    let output = `${color}[${entry.level}]${reset} ${entry.timestamp} ${entry.message}`;
    
    if (entry.agent_id) output += ` (agent:${entry.agent_id})`;
    if (entry.trace_id) output += ` (trace:${entry.trace_id.slice(0, 8)})`;
    if (entry.duration_ms) output += ` (${entry.duration_ms}ms)`;
    
    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        const stackLines = entry.error.stack.split('\n').slice(1, 4);
        output += '\n' + stackLines.map(l => `    ${l.trim()}`).join('\n');
      }
    }

    process.stdout.write(`${output}\n`);
  }

  // ============================================================================
  // Public Logging Methods
  // ============================================================================

  debug(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const entry = this.formatLogEntry(LogLevel.DEBUG, message, metadata);
    this.output(entry);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const entry = this.formatLogEntry(LogLevel.INFO, message, metadata);
    this.output(entry);
  }

  warn(message: string, metadata?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const entry = this.formatLogEntry(LogLevel.WARN, message, metadata, error);
    this.output(entry);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const entry = this.formatLogEntry(LogLevel.ERROR, message, metadata, error);
    this.output(entry);
  }

  fatal(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.FATAL)) return;
    const entry = this.formatLogEntry(LogLevel.FATAL, message, metadata, error);
    this.output(entry);
    
    // Fatal logs should trigger immediate flush and potentially exit
    // This is handled by the application layer
  }

  /**
   * Log with timing information
   */
  logDuration(
    level: LogLevel,
    message: string,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) return;
    const entry = this.formatLogEntry(level, message, metadata, undefined, durationMs);
    this.output(entry);
  }

  /**
   * Time a function and log its execution
   */
  async time<T>(
    level: LogLevel,
    message: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.logDuration(level, message, Date.now() - start, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.logDuration(level, message, Date.now() - start, { 
        ...metadata, 
        success: false, 
        error: (error as Error).message 
      });
      throw error;
    }
  }
}

// ============================================================================
// Global Logger Instance and Context Management
// ============================================================================

let globalLogger: StructuredLogger | null = null;

export function getLogger(options?: LoggerOptions): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger(options);
  }
  return globalLogger;
}

export function setGlobalLogger(logger: StructuredLogger): void {
  globalLogger = logger;
}

/**
 * Create a logger for a specific agent
 */
export function createAgentLogger(agentId: string, swarmId?: string, options?: LoggerOptions): StructuredLogger {
  return getLogger(options).child({
    agentId,
    swarmId,
    traceId: randomUUID()
  });
}

/**
 * Create a logger for a specific request
 */
export function createRequestLogger(requestId: string, userId?: string, options?: LoggerOptions): StructuredLogger {
  return getLogger(options).child({
    requestId,
    userId,
    traceId: randomUUID()
  });
}

/**
 * Create a logger for workflow execution
 */
export function createWorkflowLogger(
  workflowId: string,
  taskId?: string,
  options?: LoggerOptions
): StructuredLogger {
  return getLogger(options).child({
    workflowId,
    taskId,
    traceId: randomUUID()
  });
}

/**
 * Run a function with logging context
 */
export async function withContext<T>(
  context: LogContext,
  fn: (logger: StructuredLogger) => Promise<T>,
  options?: LoggerOptions
): Promise<T> {
  const logger = getLogger(options).child(context);
  return fn(logger);
}

// ============================================================================
// Express Middleware
// ============================================================================

export interface RequestWithContext {
  id: string;
  traceId: string;
  logger: StructuredLogger;
}

/**
 * Express middleware for request logging with context
 */
export function requestLoggerMiddleware(options?: LoggerOptions) {
  return (req: unknown, res: unknown, next: () => void) => {
    const expressReq = req as { 
      id?: string;
      headers: Record<string, string>;
      method: string;
      url: string;
      logger?: StructuredLogger;
    };
    
    const traceId = expressReq.headers['x-trace-id'] || randomUUID();
    const requestId = expressReq.id || randomUUID();
    
    const logger = getLogger(options).child({
      traceId: traceId as string,
      requestId,
      requestMethod: expressReq.method,
      requestPath: expressReq.url
    });
    
    expressReq.logger = logger;
    
    const startTime = Date.now();
    
    // Log request start
    logger.info(`Request started: ${expressReq.method} ${expressReq.url}`, {
      userAgent: expressReq.headers['user-agent'],
      contentType: expressReq.headers['content-type']
    });
    
    // Hook into response finish
    const expressRes = res as { on: (event: string, cb: () => void) => void; statusCode: number };
    expressRes.on('finish', () => {
      const duration = Date.now() - startTime;
      const level = expressRes.statusCode >= 500 ? LogLevel.ERROR : 
                    expressRes.statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
      
      logger.logDuration(level, `Request completed: ${expressReq.method} ${expressReq.url}`, duration, {
        statusCode: expressRes.statusCode
      });
    });
    
    next();
  };
}

// ============================================================================
// Error Pattern Detection
// ============================================================================

export interface ErrorPattern {
  pattern: RegExp;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
}

export const DEFAULT_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /connection.*refused|ECONNREFUSED/i,
    name: 'ConnectionRefused',
    severity: 'high',
    category: 'network',
    description: 'Connection to a service was refused'
  },
  {
    pattern: /timeout|ETIMEDOUT/i,
    name: 'Timeout',
    severity: 'medium',
    category: 'network',
    description: 'Request or operation timed out'
  },
  {
    pattern: /memory.*exhausted|out of memory|ENOMEM/i,
    name: 'OutOfMemory',
    severity: 'critical',
    category: 'resource',
    description: 'Process ran out of memory'
  },
  {
    pattern: /database.*error|pg_|sqlite_|sequelize/i,
    name: 'DatabaseError',
    severity: 'high',
    category: 'database',
    description: 'Database operation failed'
  },
  {
    pattern: /unauthorized|forbidden|401|403/i,
    name: 'AuthError',
    severity: 'medium',
    category: 'security',
    description: 'Authentication or authorization failed'
  },
  {
    pattern: /rate.*limit|too many requests|429/i,
    name: 'RateLimit',
    severity: 'low',
    category: 'rate_limiting',
    description: 'Rate limit exceeded'
  },
  {
    pattern: /agent.*crash|agent.*error/i,
    name: 'AgentError',
    severity: 'high',
    category: 'agent',
    description: 'Agent execution error'
  },
  {
    pattern: /workflow.*failed|step.*failed/i,
    name: 'WorkflowError',
    severity: 'high',
    category: 'workflow',
    description: 'Workflow execution failed'
  }
];

export class ErrorPatternDetector {
  private patterns: ErrorPattern[];

  constructor(patterns: ErrorPattern[] = DEFAULT_ERROR_PATTERNS) {
    this.patterns = patterns;
  }

  detect(errorMessage: string): ErrorPattern | null {
    for (const pattern of this.patterns) {
      if (pattern.pattern.test(errorMessage)) {
        return pattern;
      }
    }
    return null;
  }

  addPattern(pattern: ErrorPattern): void {
    this.patterns.push(pattern);
  }

  analyzeLogEntry(entry: LogEntry): { pattern: ErrorPattern | null; matched: boolean } {
    const message = entry.message;
    const errorMessage = entry.error?.message || '';
    const combined = `${message} ${errorMessage}`;
    
    const pattern = this.detect(combined);
    return {
      pattern,
      matched: pattern !== null
    };
  }
}

// ============================================================================
// Log Volume Metrics
// ============================================================================

export interface LogMetrics {
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByService: Record<string, number>;
  errorCount: number;
  errorRate: number;
  averageDuration?: number;
  timestamp: string;
}

export class LogMetricsCollector {
  private metrics: LogMetrics;
  private windowStart: number;
  private windowSize: number;

  constructor(windowSizeMs: number = 60000) {
    this.windowSize = windowSizeMs;
    this.windowStart = Date.now();
    this.metrics = this.resetMetrics();
  }

  private resetMetrics(): LogMetrics {
    return {
      totalLogs: 0,
      logsByLevel: {},
      logsByService: {},
      errorCount: 0,
      errorRate: 0,
      timestamp: new Date().toISOString()
    };
  }

  record(entry: LogEntry): void {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.windowStart > this.windowSize) {
      this.metrics = this.resetMetrics();
      this.windowStart = now;
    }

    this.metrics.totalLogs++;
    
    // Count by level
    this.metrics.logsByLevel[entry.level] = (this.metrics.logsByLevel[entry.level] || 0) + 1;
    
    // Count by service
    this.metrics.logsByService[entry.service] = (this.metrics.logsByService[entry.service] || 0) + 1;
    
    // Count errors
    if (entry.level === 'ERROR' || entry.level === 'FATAL') {
      this.metrics.errorCount++;
    }
    
    // Calculate error rate
    this.metrics.errorRate = this.metrics.errorCount / this.metrics.totalLogs;
  }

  getMetrics(): LogMetrics {
    return { ...this.metrics };
  }

  shouldAlert(errorThreshold: number = 0.1): boolean {
    return this.metrics.errorRate > errorThreshold;
  }
}

// ============================================================================
// Export Default Logger
// ============================================================================

export default getLogger();
