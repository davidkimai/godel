/**
 * Structured Logger Utility
 * 
 * Provides structured logging with configurable log levels and output formats.
 * Replaces console.* calls throughout the codebase with consistent, structured output.
 */

import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export type LogLevelString = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger class providing structured logging capabilities
 */
export class Logger {
  private level: LogLevel = LogLevel.INFO;
  private format: 'json' | 'pretty' = 'pretty';
  private logFilePath?: string;
  private fileStream?: fs.WriteStream;

  constructor() {
    // Initialize log file path from environment or default
    const logDir = process.env['LOG_DIR'] || path.join(process.cwd(), 'logs');
    const logFile = process.env['LOG_FILE'] || 'app.log';
    this.logFilePath = path.join(logDir, logFile);
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Create write stream
    this.fileStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevelString): void {
    const levelMap: Record<LogLevelString, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    };
    this.level = levelMap[level];
  }

  /**
   * Set the output format
   */
  setFormat(format: 'json' | 'pretty'): void {
    this.format = format;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevelString {
    const levelMap: Record<LogLevel, LogLevelString> = {
      [LogLevel.DEBUG]: 'debug',
      [LogLevel.INFO]: 'info',
      [LogLevel.WARN]: 'warn',
      [LogLevel.ERROR]: 'error',
    };
    return levelMap[this.level];
  }

  /**
   * Get current format
   */
  getFormat(): 'json' | 'pretty' {
    return this.format;
  }

  /**
   * Check if a log level is enabled
   */
  private isEnabled(level: LogLevel): boolean {
    return level >= this.level;
  }

  /**
   * Create a log entry
   */
  private createEntry(
    level: LogLevel,
    module: string,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      metadata,
    };
  }

  /**
   * Format log entry for output
   */
  private formatEntry(entry: LogEntry): string {
    if (this.format === 'json') {
      return JSON.stringify(entry);
    }

    const { timestamp, level, module, message, metadata } = entry;
    const levelName = LogLevel[level].padEnd(5);
    const time = new Date(timestamp).toLocaleTimeString();

    let output = `[${time}] ${levelName} [${module}] ${message}`;

    if (metadata && Object.keys(metadata).length > 0) {
      const metadataStr = JSON.stringify(metadata);
      output += ` ${metadataStr}`;
    }

    return output;
  }

  /**
   * Output log entry to console and file
   */
  private output(entry: LogEntry): void {
    const formatted = this.formatEntry(entry);
    
    // Console output
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        process.stdout.write(`${formatted}\n`);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }

    // File output
    if (this.fileStream) {
      this.fileStream.write(formatted + '\n');
    }
  }

  /**
   * Log a debug message
   * Supports both signatures:
   * - debug(module, message, metadata?) 
   * - debug(message, metadata?) [backwards compatible, uses 'app' as module]
   */
  debug(moduleOrMessage: string, messageOrMetadata?: string | Record<string, unknown>, metadata?: Record<string, unknown>): void {
    if (!this.isEnabled(LogLevel.DEBUG)) return;
    let module: string;
    let message: string;
    let meta: Record<string, unknown> | undefined;
    
    if (typeof messageOrMetadata === 'string') {
      module = moduleOrMessage;
      message = messageOrMetadata;
      meta = metadata;
    } else {
      module = 'app';
      message = moduleOrMessage;
      meta = messageOrMetadata as Record<string, unknown> | undefined;
    }
    
    const entry = this.createEntry(LogLevel.DEBUG, module, message, meta);
    this.output(entry);
  }

  /**
   * Log an info message
   * Supports both signatures:
   * - info(module, message, metadata?)
   * - info(message, metadata?) [backwards compatible, uses 'app' as module]
   */
  info(moduleOrMessage: string, messageOrMetadata?: string | Record<string, unknown>, metadata?: Record<string, unknown>): void {
    if (!this.isEnabled(LogLevel.INFO)) return;
    let module: string;
    let message: string;
    let meta: Record<string, unknown> | undefined;
    
    if (typeof messageOrMetadata === 'string') {
      module = moduleOrMessage;
      message = messageOrMetadata;
      meta = metadata;
    } else {
      module = 'app';
      message = moduleOrMessage;
      meta = messageOrMetadata as Record<string, unknown> | undefined;
    }
    
    const entry = this.createEntry(LogLevel.INFO, module, message, meta);
    this.output(entry);
  }

  /**
   * Log a warning message
   * Supports both signatures:
   * - warn(module, message, metadata?)
   * - warn(message, metadata?) [backwards compatible, uses 'app' as module]
   */
  warn(moduleOrMessage: string, messageOrMetadata?: string | Record<string, unknown>, metadata?: Record<string, unknown>): void {
    if (!this.isEnabled(LogLevel.WARN)) return;
    let module: string;
    let message: string;
    let meta: Record<string, unknown> | undefined;
    
    if (typeof messageOrMetadata === 'string') {
      module = moduleOrMessage;
      message = messageOrMetadata;
      meta = metadata;
    } else {
      module = 'app';
      message = moduleOrMessage;
      meta = messageOrMetadata as Record<string, unknown> | undefined;
    }
    
    const entry = this.createEntry(LogLevel.WARN, module, message, meta);
    this.output(entry);
  }

  /**
   * Log an error message
   * Supports both signatures:
   * - error(module, message, metadata?)
   * - error(message, metadata?) [backwards compatible, uses 'app' as module]
   */
  error(moduleOrMessage: string, messageOrMetadata?: string | Record<string, unknown>, metadata?: Record<string, unknown>): void {
    if (!this.isEnabled(LogLevel.ERROR)) return;
    let module: string;
    let message: string;
    let meta: Record<string, unknown> | undefined;
    
    if (typeof messageOrMetadata === 'string') {
      module = moduleOrMessage;
      message = messageOrMetadata;
      meta = metadata;
    } else {
      module = 'app';
      message = moduleOrMessage;
      meta = messageOrMetadata as Record<string, unknown> | undefined;
    }
    
    const entry = this.createEntry(LogLevel.ERROR, module, message, meta);
    this.output(entry);
  }

  /**
   * Close the logger and flush file stream
   */
  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}

// Export a singleton instance
export const logger = new Logger();

// Export LogLevel enum values for convenience
export { LogLevel as LogLevelEnum };

/**
 * Create a module-specific logger with the module name preset
 * 
 * Usage:
 *   const log = createLogger('federation');
 *   log.info('Agent registered', { agentId: '123' });
 *   // Output: [INFO] [federation] Agent registered {"agentId":"123"}
 */
export function createLogger(module: string) {
  return {
    debug: (message: string, metadata?: Record<string, unknown>) => 
      logger.debug(module, message, metadata),
    info: (message: string, metadata?: Record<string, unknown>) => 
      logger.info(module, message, metadata),
    warn: (message: string, metadata?: Record<string, unknown>) => 
      logger.warn(module, message, metadata),
    error: (message: string, metadata?: Record<string, unknown>) => 
      logger.error(module, message, metadata),
    
    /**
     * Log an error with proper error object handling
     */
    logError: (message: string, error: unknown, additionalContext?: Record<string, unknown>) => {
      const errorContext: Record<string, unknown> = {
        ...additionalContext,
      };
      
      if (error instanceof Error) {
        errorContext['errorName'] = error.name;
        errorContext['errorMessage'] = error.message;
        if (process.env['NODE_ENV'] === 'development') {
          errorContext['stack'] = error.stack;
        }
        
        // Handle custom Godel errors with codes
        if ('code' in error && typeof error.code === 'string') {
          errorContext['errorCode'] = error.code;
        }
        
        // Handle errors with context
        if ('context' in error && typeof error.context === 'object') {
          errorContext['errorContext'] = error.context;
        }
      } else {
        errorContext['error'] = String(error);
      }
      
      logger.error(module, message, errorContext);
    },
  };
}

/**
 * Sanitize metadata to remove sensitive data before logging
 * 
 * Removes or redacts: passwords, tokens, secrets, keys, etc.
 */
export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /auth/i,
    /credential/i,
    /session/i,
    /cookie/i,
    /private/i,
    /apikey/i,
    /api[_-]?key/i,
  ];
  
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (sensitivePatterns.some(pattern => pattern.test(key))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}
