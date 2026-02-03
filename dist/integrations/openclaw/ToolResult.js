"use strict";
/**
 * ToolResult.ts - Result capture and streaming for OpenClaw tools
 *
 * Handles:
 * - Tool result capture and formatting
 * - Large output handling (>1MB) with streaming
 * - Error capture with stack traces
 * - Result metadata (duration, success, timestamps)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultFormatter = exports.ErrorCapture = exports.LargeOutputManager = exports.ToolResultBuilder = exports.MAX_OUTPUT_SIZE = exports.DEFAULT_CHUNK_SIZE = exports.DEFAULT_STREAM_THRESHOLD = void 0;
exports.createSuccessResult = createSuccessResult;
exports.createErrorResult = createErrorResult;
exports.isSuccessResult = isSuccessResult;
exports.isErrorResult = isErrorResult;
const logger_1 = require("../../utils/logger");
// ============================================================================
// Constants
// ============================================================================
exports.DEFAULT_STREAM_THRESHOLD = 1024 * 1024; // 1MB
exports.DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
exports.MAX_OUTPUT_SIZE = 50 * 1024 * 1024; // 50MB hard limit
// ============================================================================
// ToolResultBuilder
// ============================================================================
class ToolResultBuilder {
    constructor() {
        this.result = {
            timestamp: new Date(),
        };
    }
    withRunId(runId) {
        this.result.runId = runId;
        return this;
    }
    withSessionKey(sessionKey) {
        this.result.sessionKey = sessionKey;
        return this;
    }
    withTool(tool) {
        this.result.tool = tool;
        return this;
    }
    withDuration(duration) {
        this.result.duration = duration;
        return this;
    }
    withSuccess(output, size) {
        const outputSize = size ?? JSON.stringify(output).length;
        return {
            ...this.result,
            tool: this.result.tool,
            runId: this.result.runId,
            duration: this.result.duration,
            timestamp: this.result.timestamp,
            success: true,
            output,
            outputSize,
        };
    }
    withError(code, message, stack, details) {
        return {
            ...this.result,
            tool: this.result.tool,
            runId: this.result.runId,
            duration: this.result.duration,
            timestamp: this.result.timestamp,
            success: false,
            error: {
                code,
                message,
                stack,
                details,
            },
        };
    }
}
exports.ToolResultBuilder = ToolResultBuilder;
// ============================================================================
// Large Output Handler
// ============================================================================
class LargeOutputManager {
    constructor(config = {}) {
        this.config = {
            threshold: config.threshold ?? exports.DEFAULT_STREAM_THRESHOLD,
            chunkSize: config.chunkSize ?? exports.DEFAULT_CHUNK_SIZE,
            onChunk: config.onChunk,
            onComplete: config.onComplete,
        };
    }
    /**
     * Check if output should be streamed
     */
    shouldStream(output) {
        const size = Buffer.byteLength(output, 'utf8');
        return size > this.config.threshold;
    }
    /**
     * Get the size of output in bytes
     */
    getSize(output) {
        return Buffer.byteLength(output, 'utf8');
    }
    /**
     * Stream output in chunks
     */
    async *streamOutput(output) {
        const totalSize = this.getSize(output);
        const numChunks = Math.ceil(totalSize / this.config.chunkSize);
        logger_1.logger.info(`[ToolResult] Streaming output: ${totalSize} bytes in ${numChunks} chunks`);
        for (let i = 0; i < numChunks; i++) {
            const start = i * this.config.chunkSize;
            const end = Math.min(start + this.config.chunkSize, totalSize);
            // Handle multi-byte characters correctly
            const chunk = this.sliceBuffer(output, start, end);
            if (this.config.onChunk) {
                await this.config.onChunk(chunk, i, numChunks);
            }
            yield chunk;
        }
        if (this.config.onComplete) {
            await this.config.onComplete();
        }
    }
    /**
     * Chunk output into array of strings
     */
    chunkOutput(output) {
        const chunks = [];
        const totalSize = this.getSize(output);
        const numChunks = Math.ceil(totalSize / this.config.chunkSize);
        for (let i = 0; i < numChunks; i++) {
            const start = i * this.config.chunkSize;
            const end = Math.min(start + this.config.chunkSize, totalSize);
            chunks.push(this.sliceBuffer(output, start, end));
        }
        return chunks;
    }
    /**
     * Create a summary for large outputs
     */
    createSummary(output, maxLength = 500) {
        if (output.length <= maxLength) {
            return output;
        }
        const truncated = output.slice(0, maxLength);
        const totalSize = this.getSize(output);
        return `${truncated}... [${totalSize} bytes total, truncated for display]`;
    }
    /**
     * Truncate output to maximum size
     */
    truncate(output, maxBytes = exports.MAX_OUTPUT_SIZE) {
        const size = this.getSize(output);
        if (size <= maxBytes) {
            return output;
        }
        // Binary search for truncation point
        let low = 0;
        let high = output.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            const testSize = Buffer.byteLength(output.slice(0, mid), 'utf8');
            if (testSize <= maxBytes) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return output.slice(0, low - 1);
    }
    /**
     * Slice a string by byte positions, handling multi-byte characters
     */
    sliceBuffer(str, start, end) {
        const buf = Buffer.from(str, 'utf8');
        return buf.slice(start, end).toString('utf8');
    }
}
exports.LargeOutputManager = LargeOutputManager;
// ============================================================================
// Error Handler
// ============================================================================
class ErrorCapture {
    /**
     * Capture error with full details
     */
    static capture(error) {
        if (error instanceof Error) {
            return {
                code: error.name,
                message: error.message,
                stack: error.stack,
                details: this.extractDetails(error),
            };
        }
        if (typeof error === 'string') {
            return {
                code: 'UNKNOWN_ERROR',
                message: error,
            };
        }
        if (typeof error === 'object' && error !== null) {
            const errorRecord = error;
            return {
                code: errorRecord['code'] || 'UNKNOWN_ERROR',
                message: errorRecord['message'] || String(error),
                details: errorRecord,
            };
        }
        return {
            code: 'UNKNOWN_ERROR',
            message: String(error),
        };
    }
    /**
     * Extract additional details from error object
     */
    static extractDetails(error) {
        const details = {};
        const errorWithProps = error;
        if (errorWithProps['code'])
            details['code'] = errorWithProps['code'];
        if (errorWithProps['statusCode'])
            details['statusCode'] = errorWithProps['statusCode'];
        if (errorWithProps['status'])
            details['status'] = errorWithProps['status'];
        if (errorWithProps['path'])
            details['path'] = errorWithProps['path'];
        if (errorWithProps['method'])
            details['method'] = errorWithProps['method'];
        if (errorWithProps['signal'])
            details['signal'] = errorWithProps['signal'];
        if (errorWithProps['cmd'])
            details['cmd'] = errorWithProps['cmd'];
        if (errorWithProps['killed'] !== undefined)
            details['killed'] = errorWithProps['killed'];
        if (errorWithProps['timedOut'] !== undefined)
            details['timedOut'] = errorWithProps['timedOut'];
        return details;
    }
    /**
     * Format error for logging
     */
    static formatForLog(error) {
        let log = `[${error.code}] ${error.message}`;
        if (error.stack) {
            log += `\nStack: ${error.stack}`;
        }
        if (error.details && Object.keys(error.details).length > 0) {
            log += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
        }
        return log;
    }
}
exports.ErrorCapture = ErrorCapture;
// ============================================================================
// Result Formatter
// ============================================================================
class ResultFormatter {
    /**
     * Format result for display
     */
    static format(result) {
        if (result.success) {
            let output;
            if (typeof result.output === 'string') {
                output = result.output;
            }
            else {
                output = JSON.stringify(result.output, null, 2);
            }
            if (result.truncated) {
                output += `\n[Output truncated, ${result.outputSize} bytes total]`;
            }
            return `✓ ${result.tool} (${result.duration}ms)\n${output}`;
        }
        else {
            const errorResult = result;
            return `✗ ${result.tool} (${result.duration}ms)\n[${errorResult.error.code}] ${errorResult.error.message}`;
        }
    }
    /**
     * Format result for storage
     */
    static toJSON(result) {
        const base = {
            tool: result.tool,
            success: result.success,
            duration: result.duration,
            timestamp: result.timestamp.toISOString(),
            runId: result.runId,
            sessionKey: result.sessionKey,
        };
        if (result.success) {
            return {
                ...base,
                output: result.output,
                outputSize: result.outputSize,
                truncated: result.truncated,
            };
        }
        else {
            const errorResult = result;
            return {
                ...base,
                error: errorResult.error,
            };
        }
    }
}
exports.ResultFormatter = ResultFormatter;
// ============================================================================
// Utility Functions
// ============================================================================
function createSuccessResult(tool, runId, output, duration, sessionKey) {
    const outputSize = typeof output === 'string'
        ? Buffer.byteLength(output, 'utf8')
        : output === undefined
            ? 0
            : JSON.stringify(output).length;
    return {
        tool,
        runId,
        sessionKey,
        success: true,
        output,
        outputSize,
        duration,
        timestamp: new Date(),
    };
}
function createErrorResult(tool, runId, error, duration, sessionKey) {
    return {
        tool,
        runId,
        sessionKey,
        success: false,
        error: ErrorCapture.capture(error),
        duration,
        timestamp: new Date(),
    };
}
function isSuccessResult(result) {
    return result.success;
}
function isErrorResult(result) {
    return !result.success;
}
exports.default = {
    ToolResultBuilder,
    LargeOutputManager,
    ErrorCapture,
    ResultFormatter,
    createSuccessResult,
    createErrorResult,
    isSuccessResult,
    isErrorResult,
};
//# sourceMappingURL=ToolResult.js.map