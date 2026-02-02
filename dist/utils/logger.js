"use strict";
/**
 * Structured Logger Utility
 *
 * Provides structured logging with configurable log levels and output formats.
 * Replaces console.* calls throughout the codebase with consistent, structured output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = void 0;
exports.createLogger = createLogger;
/**
 * Logger class providing structured logging capabilities
 */
class Logger {
    constructor() {
        this.level = 'info';
        this.format = 'pretty';
    }
    /**
     * Set the minimum log level
     */
    setLevel(level) {
        this.level = level;
    }
    /**
     * Set the output format
     */
    setFormat(format) {
        this.format = format;
    }
    /**
     * Get current log level
     */
    getLevel() {
        return this.level;
    }
    /**
     * Get current format
     */
    getFormat() {
        return this.format;
    }
    /**
     * Check if a log level is enabled
     */
    isEnabled(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentIndex = levels.indexOf(this.level);
        const targetIndex = levels.indexOf(level);
        return targetIndex >= currentIndex;
    }
    /**
     * Create a log entry
     */
    createEntry(level, message, context) {
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
    formatEntry(entry) {
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
    debug(message, context) {
        if (!this.isEnabled('debug'))
            return;
        const entry = this.createEntry('debug', message, context);
        console.debug(this.formatEntry(entry));
    }
    /**
     * Log an info message
     */
    info(message, context) {
        if (!this.isEnabled('info'))
            return;
        const entry = this.createEntry('info', message, context);
        console.log(this.formatEntry(entry));
    }
    /**
     * Log a warning message
     */
    warn(message, context) {
        if (!this.isEnabled('warn'))
            return;
        const entry = this.createEntry('warn', message, context);
        console.warn(this.formatEntry(entry));
    }
    /**
     * Log an error message
     */
    error(message, context) {
        if (!this.isEnabled('error'))
            return;
        const entry = this.createEntry('error', message, context);
        console.error(this.formatEntry(entry));
    }
}
exports.Logger = Logger;
// Export a singleton instance
exports.logger = new Logger();
// Convenience function to create a child logger with additional context
function createLogger(baseContext) {
    const child = new Logger();
    child.setLevel(exports.logger.getLevel());
    child.setFormat(exports.logger.getFormat());
    // Override methods to include base context
    const originalDebug = child.debug.bind(child);
    const originalInfo = child.info.bind(child);
    const originalWarn = child.warn.bind(child);
    const originalError = child.error.bind(child);
    child.debug = (message, context) => {
        originalDebug(message, { ...baseContext, ...context });
    };
    child.info = (message, context) => {
        originalInfo(message, { ...baseContext, ...context });
    };
    child.warn = (message, context) => {
        originalWarn(message, { ...baseContext, ...context });
    };
    child.error = (message, context) => {
        originalError(message, { ...baseContext, ...context });
    };
    return child;
}
//# sourceMappingURL=logger.js.map