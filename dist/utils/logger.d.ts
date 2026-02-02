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
export declare class Logger {
    private level;
    private format;
    /**
     * Set the minimum log level
     */
    setLevel(level: LogLevel): void;
    /**
     * Set the output format
     */
    setFormat(format: 'json' | 'pretty'): void;
    /**
     * Get current log level
     */
    getLevel(): LogLevel;
    /**
     * Get current format
     */
    getFormat(): 'json' | 'pretty';
    /**
     * Check if a log level is enabled
     */
    private isEnabled;
    /**
     * Create a log entry
     */
    private createEntry;
    /**
     * Format log entry for output
     */
    private formatEntry;
    /**
     * Log a debug message
     */
    debug(message: string, context?: Record<string, unknown>): void;
    /**
     * Log an info message
     */
    info(message: string, context?: Record<string, unknown>): void;
    /**
     * Log a warning message
     */
    warn(message: string, context?: Record<string, unknown>): void;
    /**
     * Log an error message
     */
    error(message: string, context?: Record<string, unknown>): void;
}
export declare const logger: Logger;
export declare function createLogger(baseContext: Record<string, unknown>): Logger;
//# sourceMappingURL=logger.d.ts.map