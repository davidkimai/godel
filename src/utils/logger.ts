/**
 * Structured Logger Utility
 * 
 * Provides structured logging with configurable log levels and output formats.
 * Replaces console.* calls throughout the codebase with consistent, structured output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Logger class providing structured logging capabilities
 */
export class Logger {
  private level: LogLevel = 'info';
  private format: 'json' | 'pretty' = 'pretty';

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
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
  getLevel(): LogLevel {
    return this.level;
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
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(this.level);
    const targetIndex = levels.indexOf(level);
    return targetIndex >= currentIndex;
  }

  /**
   * Create a log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };
  }

  /**
   * Format log entry for output
   */
  private formatEntry(entry: LogEntry): string {
    if (this.format === 'json') {
      return JSON.stringify(entry);
    }

    const { timestamp, level, message, context } = entry;
    const levelUpper = level.toUpperCase().padEnd(5);
    const time = new Date(timestamp).toLocaleTimeString();

    let output = `[${time}] ${levelUpper} ${message}`;

    if (context && Object.keys(context).length > 0) {
      const contextStr = JSON.stringify(context);
      output += ` ${contextStr}`;
    }

    return output;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.isEnabled('debug')) return;
    const entry = this.createEntry('debug', message, context);
    console.debug(this.formatEntry(entry));
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (!this.isEnabled('info')) return;
    const entry = this.createEntry('info', message, context);
    console.log(this.formatEntry(entry));
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.isEnabled('warn')) return;
    const entry = this.createEntry('warn', message, context);
    console.warn(this.formatEntry(entry));
  }

  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    if (!this.isEnabled('error')) return;
    const entry = this.createEntry('error', message, context);
    console.error(this.formatEntry(entry));
  }
}

// Export a singleton instance
export const logger = new Logger();

// Convenience function to create a child logger with additional context
export function createLogger(baseContext: Record<string, unknown>): Logger {
  const child = new Logger();
  child.setLevel(logger.getLevel());
  child.setFormat(logger.getFormat());

  // Override methods to include base context
  const originalDebug = child.debug.bind(child);
  const originalInfo = child.info.bind(child);
  const originalWarn = child.warn.bind(child);
  const originalError = child.error.bind(child);

  child.debug = (message: string, context?: Record<string, unknown>) => {
    originalDebug(message, { ...baseContext, ...context });
  };

  child.info = (message: string, context?: Record<string, unknown>) => {
    originalInfo(message, { ...baseContext, ...context });
  };

  child.warn = (message: string, context?: Record<string, unknown>) => {
    originalWarn(message, { ...baseContext, ...context });
  };

  child.error = (message: string, context?: Record<string, unknown>) => {
    originalError(message, { ...baseContext, ...context });
  };

  return child;
}
