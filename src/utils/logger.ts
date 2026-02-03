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
        console.log(formatted);
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
