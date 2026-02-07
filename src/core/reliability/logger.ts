/**
 * Structured Logger with Correlation ID Support
 *
 * Provides structured logging with automatic correlation ID injection,
 * log levels, and multiple output formats.
 *
 * @module core/reliability/logger
 */

import { getCorrelationContext, getCorrelationId, getTraceId } from './correlation-context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Timestamp */
  timestamp: string;
  /** Correlation ID */
  correlationId?: string;
  /** Trace ID */
  traceId?: string;
  /** Additional metadata */
  meta?: Record<string, unknown>;
  /** Source location */
  source?: {
    file?: string;
    line?: number;
    function?: string;
  };
}

export interface LoggerOptions {
  /** Minimum log level (default: 'info') */
  minLevel?: LogLevel;
  /** Include correlation ID (default: true) */
  includeCorrelationId?: boolean;
  /** Include trace ID (default: true) */
  includeTraceId?: boolean;
  /** Include timestamp (default: true) */
  includeTimestamp?: boolean;
  /** JSON format output (default: false in dev, true in production) */
  jsonFormat?: boolean;
  /** Additional default metadata */
  defaultMeta?: Record<string, unknown>;
  /** Custom output function (default: console) */
  output?: (entry: LogEntry) => void;
  /** Redact sensitive fields */
  redact?: string[];
}

/**
 * Log level priorities
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * ANSI color codes for console output
 */
const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',  // Cyan
  info: '\x1b[32m',   // Green
  warn: '\x1b[33m',   // Yellow
  error: '\x1b[31m',  // Red
  fatal: '\x1b[35m',  // Magenta
};

const RESET = '\x1b[0m';

/**
 * Default redacted fields
 */
const DEFAULT_REDACT_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'auth',
  'cookie',
  'session',
  'creditCard',
  'cvv',
  'ssn',
];

/**
 * Redact sensitive fields from metadata
 */
function redactFields(obj: unknown, fields: string[]): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactFields(item, fields));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (fields.some(field => lowerKey.includes(field.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactFields(value, fields);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Format log entry for console output
 */
function formatConsole(entry: LogEntry, useColors: boolean): string {
  const color = useColors ? COLORS[entry.level] : '';
  const reset = useColors ? RESET : '';
  
  const parts: string[] = [];
  
  // Timestamp
  if (entry.timestamp) {
    parts.push(`[${entry.timestamp}]`);
  }
  
  // Level
  parts.push(`${color}[${entry.level.toUpperCase()}]${reset}`);
  
  // Correlation ID
  if (entry.correlationId) {
    parts.push(`[${entry.correlationId.slice(0, 8)}]`);
  }
  
  // Message
  parts.push(entry.message);
  
  // Metadata
  if (entry.meta && Object.keys(entry.meta).length > 0) {
    const metaStr = Object.entries(entry.meta)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    parts.push(`{${metaStr}}`);
  }
  
  return parts.join(' ');
}

/**
 * Create a structured logger instance
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

/**
 * Logger class with correlation ID support
 */
export class Logger {
  private options: Required<Pick<LoggerOptions, 'minLevel' | 'includeCorrelationId' | 'includeTraceId' | 'includeTimestamp' | 'jsonFormat' | 'defaultMeta' | 'redact'>> & Pick<LoggerOptions, 'output'>;

  constructor(options: LoggerOptions = {}) {
    const isProduction = process.env['NODE_ENV'] === 'production';
    
    this.options = {
      minLevel: options.minLevel || (isProduction ? 'info' : 'debug') as LogLevel,
      includeCorrelationId: options.includeCorrelationId ?? true,
      includeTraceId: options.includeTraceId ?? true,
      includeTimestamp: options.includeTimestamp ?? true,
      jsonFormat: options.jsonFormat ?? isProduction,
      defaultMeta: options.defaultMeta || {},
      redact: [...DEFAULT_REDACT_FIELDS, ...(options.redact || [])],
      output: options.output,
    };
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.options.minLevel];
  }

  /**
   * Build log entry
   */
  private buildEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
    const context = getCorrelationContext();
    
    const entry: LogEntry = {
      level,
      message,
      timestamp: this.options.includeTimestamp ? new Date().toISOString() : '',
    };

    if (this.options.includeCorrelationId) {
      entry.correlationId = context?.correlationId || getCorrelationId();
    }

    if (this.options.includeTraceId) {
      entry.traceId = context?.traceId || getTraceId();
    }

    // Merge metadata with redaction
    const mergedMeta = {
      ...this.options.defaultMeta,
      ...meta,
    };

    if (Object.keys(mergedMeta).length > 0) {
      entry.meta = redactFields(mergedMeta, this.options.redact) as Record<string, unknown>;
    }

    return entry;
  }

  /**
   * Output log entry
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.buildEntry(level, message, meta);

    if (this.options.output) {
      this.options.output(entry);
    } else if (this.options.jsonFormat) {
      console.log(JSON.stringify(entry));
    } else {
      const useColors = process.env['NO_COLOR'] !== 'true' && process.stdout.isTTY;
      const formatted = formatConsole(entry, useColors);
      
      switch (level) {
        case 'debug':
          console.debug(formatted);
          break;
        case 'info':
          console.info(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'error':
        case 'fatal':
          console.error(formatted);
          break;
      }
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  /**
   * Log info message
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta: Record<string, unknown> = { ...meta };
    
    if (error instanceof Error) {
      errorMeta['error'] = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    } else if (error !== undefined) {
      errorMeta['error'] = String(error);
    }

    this.log('error', message, errorMeta);
  }

  /**
   * Log fatal message
   */
  fatal(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta: Record<string, unknown> = { ...meta };
    
    if (error instanceof Error) {
      errorMeta['error'] = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    } else if (error !== undefined) {
      errorMeta['error'] = String(error);
    }

    this.log('fatal', message, errorMeta);
  }

  /**
   * Create a child logger with additional default metadata
   */
  child(defaultMeta: Record<string, unknown>): Logger {
    return new Logger({
      ...this.options,
      defaultMeta: {
        ...this.options.defaultMeta,
        ...defaultMeta,
      },
    });
  }

  /**
   * Create a logger for a specific component
   */
  component(name: string): Logger {
    return this.child({ component: name });
  }
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Create a child logger
 */
export function createChildLogger(meta: Record<string, unknown>): Logger {
  return logger.child(meta);
}

export default {
  createLogger,
  Logger,
  logger,
  createChildLogger,
};
