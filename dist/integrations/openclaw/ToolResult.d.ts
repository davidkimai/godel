/**
 * ToolResult.ts - Result capture and streaming for OpenClaw tools
 *
 * Handles:
 * - Tool result capture and formatting
 * - Large output handling (>1MB) with streaming
 * - Error capture with stack traces
 * - Result metadata (duration, success, timestamps)
 */
export interface ToolResultBase {
    tool: string;
    success: boolean;
    duration: number;
    timestamp: Date;
    runId: string;
    sessionKey?: string;
}
export interface ToolSuccessResult<T = unknown> extends ToolResultBase {
    success: true;
    output: T;
    outputSize: number;
    truncated?: boolean;
}
export interface ToolErrorResult extends ToolResultBase {
    success: false;
    error: {
        code: string;
        message: string;
        stack?: string;
        details?: Record<string, unknown>;
    };
}
export type ToolResult<T = unknown> = ToolSuccessResult<T> | ToolErrorResult;
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut?: boolean;
}
export interface ExecOptions {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    shell?: string;
    elevated?: boolean;
}
export interface BrowserAction {
    type: 'navigate' | 'snapshot' | 'screenshot' | 'click' | 'type' | 'scroll' | 'close' | 'evaluate';
    url?: string;
    ref?: string;
    text?: string;
    selector?: string;
    script?: string;
    options?: Record<string, unknown>;
}
export interface BrowserResult {
    title?: string;
    url?: string;
    content?: string;
    screenshot?: string;
    elements?: Array<{
        ref: string;
        role: string;
        name?: string;
        description?: string;
    }>;
    result?: unknown;
}
export interface CanvasAction {
    type: 'present' | 'hide' | 'navigate' | 'snapshot' | 'a2ui';
    url?: string;
    html?: string;
    width?: number;
    height?: number;
    delayMs?: number;
}
export interface CanvasResult {
    screenshot?: string;
    url?: string;
    visible: boolean;
}
export interface NodeAction {
    type: 'camera_snap' | 'camera_clip' | 'screen_record' | 'notify' | 'location';
    deviceId?: string;
    facing?: 'front' | 'back' | 'both';
    duration?: number;
    title?: string;
    body?: string;
}
export interface NodeResult {
    image?: string;
    video?: string;
    location?: {
        latitude: number;
        longitude: number;
        accuracy: number;
    };
    devices?: string[];
}
export interface StreamConfig {
    threshold: number;
    chunkSize: number;
    onChunk?: (chunk: string, index: number, total: number) => void | Promise<void>;
    onComplete?: () => void | Promise<void>;
}
export interface LargeOutputHandler {
    stream: boolean;
    chunks: string[];
    totalSize: number;
}
export declare const DEFAULT_STREAM_THRESHOLD: number;
export declare const DEFAULT_CHUNK_SIZE: number;
export declare const MAX_OUTPUT_SIZE: number;
export declare class ToolResultBuilder {
    private result;
    withRunId(runId: string): this;
    withSessionKey(sessionKey: string): this;
    withTool(tool: string): this;
    withDuration(duration: number): this;
    withSuccess<T>(output: T, size?: number): ToolSuccessResult<T>;
    withError(code: string, message: string, stack?: string, details?: Record<string, unknown>): ToolErrorResult;
}
export declare class LargeOutputManager {
    private config;
    constructor(config?: Partial<StreamConfig>);
    /**
     * Check if output should be streamed
     */
    shouldStream(output: string): boolean;
    /**
     * Get the size of output in bytes
     */
    getSize(output: string): number;
    /**
     * Stream output in chunks
     */
    streamOutput(output: string): AsyncGenerator<string, void, unknown>;
    /**
     * Chunk output into array of strings
     */
    chunkOutput(output: string): string[];
    /**
     * Create a summary for large outputs
     */
    createSummary(output: string, maxLength?: number): string;
    /**
     * Truncate output to maximum size
     */
    truncate(output: string, maxBytes?: number): string;
    /**
     * Slice a string by byte positions, handling multi-byte characters
     */
    private sliceBuffer;
}
export declare class ErrorCapture {
    /**
     * Capture error with full details
     */
    static capture(error: unknown): ToolErrorResult['error'];
    /**
     * Extract additional details from error object
     */
    private static extractDetails;
    /**
     * Format error for logging
     */
    static formatForLog(error: ToolErrorResult['error']): string;
}
export declare class ResultFormatter {
    /**
     * Format result for display
     */
    static format<T>(result: ToolResult<T>): string;
    /**
     * Format result for storage
     */
    static toJSON<T>(result: ToolResult<T>): object;
}
export declare function createSuccessResult<T>(tool: string, runId: string, output: T, duration: number, sessionKey?: string): ToolSuccessResult<T>;
export declare function createErrorResult(tool: string, runId: string, error: unknown, duration: number, sessionKey?: string): ToolErrorResult;
export declare function isSuccessResult<T>(result: ToolResult<T>): result is ToolSuccessResult<T>;
export declare function isErrorResult<T>(result: ToolResult<T>): result is ToolErrorResult;
declare const _default: {
    ToolResultBuilder: typeof ToolResultBuilder;
    LargeOutputManager: typeof LargeOutputManager;
    ErrorCapture: typeof ErrorCapture;
    ResultFormatter: typeof ResultFormatter;
    createSuccessResult: typeof createSuccessResult;
    createErrorResult: typeof createErrorResult;
    isSuccessResult: typeof isSuccessResult;
    isErrorResult: typeof isErrorResult;
};
export default _default;
//# sourceMappingURL=ToolResult.d.ts.map