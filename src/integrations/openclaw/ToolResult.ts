/**
 * ToolResult.ts - Result capture and streaming for OpenClaw tools
 * 
 * Handles:
 * - Tool result capture and formatting
 * - Large output handling (>1MB) with streaming
 * - Error capture with stack traces
 * - Result metadata (duration, success, timestamps)
 */

import { logger } from '../../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface ToolResultBase {
  tool: string;
  success: boolean;
  duration: number; // milliseconds
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
  screenshot?: string; // base64 encoded
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
  screenshot?: string; // base64 encoded
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
  image?: string; // base64 encoded
  video?: string; // path or base64
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  devices?: string[];
}

export interface StreamConfig {
  threshold: number; // Size in bytes to trigger streaming (default: 1MB)
  chunkSize: number; // Size of each chunk (default: 64KB)
  onChunk?: (chunk: string, index: number, total: number) => void | Promise<void>;
  onComplete?: () => void | Promise<void>;
}

export interface LargeOutputHandler {
  stream: boolean;
  chunks: string[];
  totalSize: number;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_STREAM_THRESHOLD = 1024 * 1024; // 1MB
export const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
export const MAX_OUTPUT_SIZE = 50 * 1024 * 1024; // 50MB hard limit

// ============================================================================
// ToolResultBuilder
// ============================================================================

export class ToolResultBuilder {
  private result: Partial<ToolResult> = {
    timestamp: new Date(),
  };

  withRunId(runId: string): this {
    this.result.runId = runId;
    return this;
  }

  withSessionKey(sessionKey: string): this {
    this.result.sessionKey = sessionKey;
    return this;
  }

  withTool(tool: string): this {
    this.result.tool = tool;
    return this;
  }

  withDuration(duration: number): this {
    this.result.duration = duration;
    return this;
  }

  withSuccess<T>(output: T, size?: number): ToolSuccessResult<T> {
    const outputSize = size ?? JSON.stringify(output).length;
    return {
      ...this.result,
      tool: this.result.tool!,
      runId: this.result.runId!,
      duration: this.result.duration!,
      timestamp: this.result.timestamp!,
      success: true,
      output,
      outputSize,
    } as ToolSuccessResult<T>;
  }

  withError(
    code: string,
    message: string,
    stack?: string,
    details?: Record<string, unknown>
  ): ToolErrorResult {
    return {
      ...this.result,
      tool: this.result.tool!,
      runId: this.result.runId!,
      duration: this.result.duration!,
      timestamp: this.result.timestamp!,
      success: false,
      error: {
        code,
        message,
        stack,
        details,
      },
    } as ToolErrorResult;
  }
}

// ============================================================================
// Large Output Handler
// ============================================================================

export class LargeOutputManager {
  private config: StreamConfig;

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = {
      threshold: config.threshold ?? DEFAULT_STREAM_THRESHOLD,
      chunkSize: config.chunkSize ?? DEFAULT_CHUNK_SIZE,
      onChunk: config.onChunk,
      onComplete: config.onComplete,
    };
  }

  /**
   * Check if output should be streamed
   */
  shouldStream(output: string): boolean {
    const size = Buffer.byteLength(output, 'utf8');
    return size > this.config.threshold;
  }

  /**
   * Get the size of output in bytes
   */
  getSize(output: string): number {
    return Buffer.byteLength(output, 'utf8');
  }

  /**
   * Stream output in chunks
   */
  async *streamOutput(output: string): AsyncGenerator<string, void, unknown> {
    const totalSize = this.getSize(output);
    const numChunks = Math.ceil(totalSize / this.config.chunkSize);
    
    logger.info(`[ToolResult] Streaming output: ${totalSize} bytes in ${numChunks} chunks`);

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
  chunkOutput(output: string): string[] {
    const chunks: string[] = [];
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
  createSummary(output: string, maxLength: number = 500): string {
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
  truncate(output: string, maxBytes: number = MAX_OUTPUT_SIZE): string {
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
      } else {
        high = mid;
      }
    }

    return output.slice(0, low - 1);
  }

  /**
   * Slice a string by byte positions, handling multi-byte characters
   */
  private sliceBuffer(str: string, start: number, end: number): string {
    const buf = Buffer.from(str, 'utf8');
    return buf.slice(start, end).toString('utf8');
  }
}

// ============================================================================
// Error Handler
// ============================================================================

export class ErrorCapture {
  /**
   * Capture error with full details
   */
  static capture(error: unknown): ToolErrorResult['error'] {
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
      const errorRecord = error as Record<string, unknown>;
      return {
        code: (errorRecord['code'] as string) || 'UNKNOWN_ERROR',
        message: (errorRecord['message'] as string) || String(error),
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
  private static extractDetails(error: Error): Record<string, unknown> {
    const details: Record<string, unknown> = {};
    const errorWithProps = error as unknown as Record<string, unknown>;
    
    if (errorWithProps['code']) details['code'] = errorWithProps['code'];
    if (errorWithProps['statusCode']) details['statusCode'] = errorWithProps['statusCode'];
    if (errorWithProps['status']) details['status'] = errorWithProps['status'];
    if (errorWithProps['path']) details['path'] = errorWithProps['path'];
    if (errorWithProps['method']) details['method'] = errorWithProps['method'];
    if (errorWithProps['signal']) details['signal'] = errorWithProps['signal'];
    if (errorWithProps['cmd']) details['cmd'] = errorWithProps['cmd'];
    if (errorWithProps['killed'] !== undefined) details['killed'] = errorWithProps['killed'];
    if (errorWithProps['timedOut'] !== undefined) details['timedOut'] = errorWithProps['timedOut'];

    return details;
  }

  /**
   * Format error for logging
   */
  static formatForLog(error: ToolErrorResult['error']): string {
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

// ============================================================================
// Result Formatter
// ============================================================================

export class ResultFormatter {
  /**
   * Format result for display
   */
  static format<T>(result: ToolResult<T>): string {
    if (result.success) {
      let output: string;
      
      if (typeof result.output === 'string') {
        output = result.output;
      } else {
        output = JSON.stringify(result.output, null, 2);
      }

      if (result.truncated) {
        output += `\n[Output truncated, ${result.outputSize} bytes total]`;
      }

      return `✓ ${result.tool} (${result.duration}ms)\n${output}`;
    } else {
      const errorResult = result as ToolErrorResult;
      return `✗ ${result.tool} (${result.duration}ms)\n[${errorResult.error.code}] ${errorResult.error.message}`;
    }
  }

  /**
   * Format result for storage
   */
  static toJSON<T>(result: ToolResult<T>): object {
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
    } else {
      const errorResult = result as ToolErrorResult;
      return {
        ...base,
        error: errorResult.error,
      };
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createSuccessResult<T>(
  tool: string,
  runId: string,
  output: T,
  duration: number,
  sessionKey?: string
): ToolSuccessResult<T> {
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

export function createErrorResult(
  tool: string,
  runId: string,
  error: unknown,
  duration: number,
  sessionKey?: string
): ToolErrorResult {
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

export function isSuccessResult<T>(result: ToolResult<T>): result is ToolSuccessResult<T> {
  return result.success;
}

export function isErrorResult<T>(result: ToolResult<T>): result is ToolErrorResult {
  return !result.success;
}

export default {
  ToolResultBuilder,
  LargeOutputManager,
  ErrorCapture,
  ResultFormatter,
  createSuccessResult,
  createErrorResult,
  isSuccessResult,
  isErrorResult,
};
