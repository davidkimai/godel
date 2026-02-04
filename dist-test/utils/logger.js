"use strict";
/**
 * Structured Logger Utility
 *
 * Provides structured logging with configurable log levels and output formats.
 * Replaces console.* calls throughout the codebase with consistent, structured output.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogLevelEnum = exports.logger = exports.Logger = exports.LogLevel = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (exports.LogLevelEnum = exports.LogLevel = LogLevel = {}));
/**
 * Logger class providing structured logging capabilities
 */
class Logger {
    constructor() {
        this.level = LogLevel.INFO;
        this.format = 'pretty';
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
    setLevel(level) {
        const levelMap = {
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
    setFormat(format) {
        this.format = format;
    }
    /**
     * Get current log level
     */
    getLevel() {
        const levelMap = {
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
    getFormat() {
        return this.format;
    }
    /**
     * Check if a log level is enabled
     */
    isEnabled(level) {
        return level >= this.level;
    }
    /**
     * Create a log entry
     */
    createEntry(level, module, message, metadata) {
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
    formatEntry(entry) {
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
    output(entry) {
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
    debug(moduleOrMessage, messageOrMetadata, metadata) {
        if (!this.isEnabled(LogLevel.DEBUG))
            return;
        let module;
        let message;
        let meta;
        if (typeof messageOrMetadata === 'string') {
            module = moduleOrMessage;
            message = messageOrMetadata;
            meta = metadata;
        }
        else {
            module = 'app';
            message = moduleOrMessage;
            meta = messageOrMetadata;
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
    info(moduleOrMessage, messageOrMetadata, metadata) {
        if (!this.isEnabled(LogLevel.INFO))
            return;
        let module;
        let message;
        let meta;
        if (typeof messageOrMetadata === 'string') {
            module = moduleOrMessage;
            message = messageOrMetadata;
            meta = metadata;
        }
        else {
            module = 'app';
            message = moduleOrMessage;
            meta = messageOrMetadata;
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
    warn(moduleOrMessage, messageOrMetadata, metadata) {
        if (!this.isEnabled(LogLevel.WARN))
            return;
        let module;
        let message;
        let meta;
        if (typeof messageOrMetadata === 'string') {
            module = moduleOrMessage;
            message = messageOrMetadata;
            meta = metadata;
        }
        else {
            module = 'app';
            message = moduleOrMessage;
            meta = messageOrMetadata;
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
    error(moduleOrMessage, messageOrMetadata, metadata) {
        if (!this.isEnabled(LogLevel.ERROR))
            return;
        let module;
        let message;
        let meta;
        if (typeof messageOrMetadata === 'string') {
            module = moduleOrMessage;
            message = messageOrMetadata;
            meta = metadata;
        }
        else {
            module = 'app';
            message = moduleOrMessage;
            meta = messageOrMetadata;
        }
        const entry = this.createEntry(LogLevel.ERROR, module, message, meta);
        this.output(entry);
    }
    /**
     * Close the logger and flush file stream
     */
    close() {
        if (this.fileStream) {
            this.fileStream.end();
        }
    }
}
exports.Logger = Logger;
// Export a singleton instance
exports.logger = new Logger();
