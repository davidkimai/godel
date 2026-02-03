/**
 * Structured Logger Utility
 *
 * Provides structured logging with configurable log levels and output formats.
 * Replaces console.* calls throughout the codebase with consistent, structured output.
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
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
export declare class Logger {
    private level;
    private format;
    private logFilePath?;
    private fileStream?;
    constructor();
    /**
     * Set the minimum log level
     */
    setLevel(level: LogLevelString): void;
    /**
     * Set the output format
     */
    setFormat(format: 'json' | 'pretty'): void;
    /**
     * Get current log level
     */
    getLevel(): LogLevelString;
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
     * Output log entry to console and file
     */
    private output;
    /**
     * Log a debug message
     * Supports both signatures:
     * - debug(module, message, metadata?)
     * - debug(message, metadata?) [backwards compatible, uses 'app' as module]
     */
    debug(moduleOrMessage: string, messageOrMetadata?: string | Record<string, unknown>, metadata?: Record<string, unknown>): void;
    /**
     * Log an info message
     * Supports both signatures:
     * - info(module, message, metadata?)
     * - info(message, metadata?) [backwards compatible, uses 'app' as module]
     */
    info(moduleOrMessage: string, messageOrMetadata?: string | Record<string, unknown>, metadata?: Record<string, unknown>): void;
    /**
     * Log a warning message
     * Supports both signatures:
     * - warn(module, message, metadata?)
     * - warn(message, metadata?) [backwards compatible, uses 'app' as module]
     */
    warn(moduleOrMessage: string, messageOrMetadata?: string | Record<string, unknown>, metadata?: Record<string, unknown>): void;
    /**
     * Log an error message
     * Supports both signatures:
     * - error(module, message, metadata?)
     * - error(message, metadata?) [backwards compatible, uses 'app' as module]
     */
    error(moduleOrMessage: string, messageOrMetadata?: string | Record<string, unknown>, metadata?: Record<string, unknown>): void;
    /**
     * Close the logger and flush file stream
     */
    close(): void;
}
export declare const logger: Logger;
export { LogLevel as LogLevelEnum };
//# sourceMappingURL=logger.d.ts.map