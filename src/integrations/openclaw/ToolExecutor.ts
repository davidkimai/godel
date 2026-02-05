/**
 * ToolExecutor.ts - OpenClaw Tool Executor for Dash Agents
 * 
 * Provides direct access to OpenClaw tools:
 * - exec() - Shell command execution
 * - read() - File read operations
 * - write() - File write operations
 * - edit() - File edit operations
 * - browser() - Web automation
 * - canvas() - UI rendering
 * - nodes() - Device actions (camera, screen)
 * 
 * All methods return ToolResult with proper error handling and large output support.
 */

import { logger } from '../../utils/logger';
import WebSocket from 'ws';
import {
  ToolResult,
  ToolSuccessResult,
  ToolErrorResult,
  ExecResult,
  ExecOptions,
  BrowserAction,
  BrowserResult,
  CanvasAction,
  CanvasResult,
  NodeAction,
  NodeResult,
  LargeOutputManager,
  ErrorCapture,
  createSuccessResult,
  createErrorResult,
  DEFAULT_STREAM_THRESHOLD,
} from './ToolResult';

// ============================================================================
// Types
// ============================================================================

export interface ToolExecutorConfig {
  sessionKey: string;
  gatewayHost: string;
  gatewayPort: number;
  gatewayToken?: string;
  timeout?: number;
  streamThreshold?: number;
}

export interface GatewayRequest {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface GatewayResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface ReadOptions {
  offset?: number;
  limit?: number;
  encoding?: BufferEncoding;
}

export interface WriteOptions {
  encoding?: BufferEncoding;
  createDirs?: boolean;
}

export interface EditOptions {
  createIfMissing?: boolean;
}

// ============================================================================
// Gateway Client
// ============================================================================

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: NodeJS.Timeout;
  }>();
  private requestCounter = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(
    private host: string,
    private port: number,
    private token?: string
  ) {}

  /**
   * Connect to OpenClaw Gateway
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}`;
      logger.info(`[GatewayClient] Connecting to ${url}`);

      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        logger.info('[GatewayClient] Connected to Gateway');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        logger.warn('[GatewayClient] Connection closed');
        this.handleDisconnect();
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Disconnect from Gateway
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Reject all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Send request to Gateway and wait for response
   */
  async request<T>(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway not connected');
    }

    const id = `req_${Date.now()}_${++this.requestCounter}`;
    
    const request: GatewayRequest = {
      type: 'req',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { 
        resolve: (value: unknown) => resolve(value as T), 
        reject, 
        timeout 
      });

      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as GatewayResponse;
      
      if (message.type === 'res') {
        const request = this.pendingRequests.get(message.id);
        if (request) {
          clearTimeout(request.timeout);
          this.pendingRequests.delete(message.id);

          if (message.ok) {
            request.resolve(message.payload);
          } else {
            request.reject(new Error(message.error?.message || 'Unknown error'));
          }
        }
      }
    } catch (error) {
      logger.error('[GatewayClient] Failed to parse message:', { error: String(error) });
    }
  }

  /**
   * Handle disconnection with retry
   */
  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      logger.info(`[GatewayClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(() => {
          // Retry handled by handleDisconnect
        });
      }, delay);
    }
  }
}

// ============================================================================
// Tool Executor
// ============================================================================

export class OpenClawToolExecutor {
  private client: GatewayClient;
  private largeOutputManager: LargeOutputManager;
  private runIdCounter = 0;

  constructor(private config: ToolExecutorConfig) {
    this.client = new GatewayClient(
      config.gatewayHost,
      config.gatewayPort,
      config.gatewayToken
    );
    this.largeOutputManager = new LargeOutputManager({
      threshold: config.streamThreshold ?? DEFAULT_STREAM_THRESHOLD,
    });
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `run_${Date.now()}_${++this.runIdCounter}`;
  }

  /**
   * Connect to Gateway
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Disconnect from Gateway
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  /**
   * Check if connected to Gateway
   */
  isConnected(): boolean {
    return this.client.isConnected();
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Read file contents
   */
  async read(filePath: string, options: ReadOptions = {}): Promise<ToolResult<string>> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    try {
      logger.debug(`[ToolExecutor] read: ${filePath}`);

      const result = await this.client.request<{ content: string; size: number }>('read', {
        path: filePath,
        offset: options.offset,
        limit: options.limit,
      });

      const content = result.content;
      const outputSize = this.largeOutputManager.getSize(content);

      // Handle large outputs
      let output = content;
      let truncated = false;
      
      if (outputSize > DEFAULT_STREAM_THRESHOLD) {
        logger.info(`[ToolExecutor] Large file detected: ${outputSize} bytes`);
        output = this.largeOutputManager.truncate(content);
        truncated = true;
      }

      return createSuccessResult(
        'read',
        runId,
        output,
        Date.now() - startTime,
        this.config.sessionKey
      );
    } catch (error) {
      logger.error(`[ToolExecutor] read failed: ${filePath}`, { error: String(error) });
      return createErrorResult(
        'read',
        runId,
        error,
        Date.now() - startTime,
        this.config.sessionKey
      );
    }
  }

  /**
   * Write content to file
   */
  async write(filePath: string, content: string, options: WriteOptions = {}): Promise<ToolResult<void>> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    try {
      logger.debug(`[ToolExecutor] write: ${filePath}`);

      await this.client.request<void>('write', {
        path: filePath,
        content,
        encoding: options.encoding,
        createDirs: options.createDirs,
      });

      return createSuccessResult(
        'write',
        runId,
        undefined,
        Date.now() - startTime,
        this.config.sessionKey
      );
    } catch (error) {
      logger.error(`[ToolExecutor] write failed: ${filePath}`, { error: String(error) });
      return createErrorResult(
        'write',
        runId,
        error,
        Date.now() - startTime,
        this.config.sessionKey
      );
    }
  }

  /**
   * Edit file by replacing exact text
   */
  async edit(
    filePath: string,
    oldText: string,
    newText: string,
    options: EditOptions = {}
  ): Promise<ToolResult<void>> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    try {
      logger.debug(`[ToolExecutor] edit: ${filePath}`);

      await this.client.request<void>('edit', {
        path: filePath,
        oldText,
        newText,
        createIfMissing: options.createIfMissing,
      });

      return createSuccessResult(
        'edit',
        runId,
        undefined,
        Date.now() - startTime,
        this.config.sessionKey
      );
    } catch (error) {
      logger.error(`[ToolExecutor] edit failed: ${filePath}`, { error: String(error) });
      return createErrorResult(
        'edit',
        runId,
        error,
        Date.now() - startTime,
        this.config.sessionKey
      );
    }
  }

  // ============================================================================
  // Shell Execution
  // ============================================================================

  /**
   * Execute shell command
   */
  async exec(command: string, options: ExecOptions = {}): Promise<ToolResult<ExecResult>> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    try {
      logger.debug(`[ToolExecutor] exec: ${command}`);

      const result = await this.client.request<{
        stdout: string;
        stderr: string;
        exitCode: number;
        timedOut?: boolean;
      }>('exec', {
        command,
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout ?? 60000,
        shell: options.shell,
        elevated: options.elevated,
      });

      const execResult: ExecResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      };

      return createSuccessResult(
        'exec',
        runId,
        execResult,
        Date.now() - startTime,
        this.config.sessionKey
      );
    } catch (error) {
      logger.error(`[ToolExecutor] exec failed: ${command}`, { error: String(error) });
      return createErrorResult(
        'exec',
        runId,
        error,
        Date.now() - startTime,
        this.config.sessionKey
      );
    }
  }

  // ============================================================================
  // Browser Automation
  // ============================================================================

  /**
   * Execute browser action
   */
  async browser(action: BrowserAction): Promise<ToolResult<BrowserResult>> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    try {
      logger.debug(`[ToolExecutor] browser: ${action.type}`);

      const result = await this.client.request<BrowserResult>('browser', {
        action: action.type,
        url: action.url,
        ref: action.ref,
        text: action.text,
        selector: action.selector,
        script: action.script,
        options: action.options,
      });

      return createSuccessResult(
        'browser',
        runId,
        result,
        Date.now() - startTime,
        this.config.sessionKey
      );
    } catch (error) {
      logger.error(`[ToolExecutor] browser failed: ${action.type}`, { error: String(error) });
      return createErrorResult(
        'browser',
        runId,
        error,
        Date.now() - startTime,
        this.config.sessionKey
      );
    }
  }

  /**
   * Navigate to URL
   */
  async navigate(url: string, options?: Record<string, unknown>): Promise<ToolResult<BrowserResult>> {
    return this.browser({
      type: 'navigate',
      url,
      options,
    });
  }

  /**
   * Take browser snapshot
   */
  async snapshot(): Promise<ToolResult<BrowserResult>> {
    return this.browser({ type: 'snapshot' });
  }

  /**
   * Click element by ref
   */
  async click(ref: string): Promise<ToolResult<BrowserResult>> {
    return this.browser({ type: 'click', ref });
  }

  /**
   * Type text into element
   */
  async type(ref: string, text: string): Promise<ToolResult<BrowserResult>> {
    return this.browser({ type: 'type', ref, text });
  }

  /**
   * Take screenshot
   */
  async screenshot(fullPage?: boolean): Promise<ToolResult<BrowserResult>> {
    return this.browser({
      type: 'screenshot',
      options: { fullPage },
    });
  }

  // ============================================================================
  // Canvas / UI Rendering
  // ============================================================================

  /**
   * Execute canvas action
   */
  async canvas(action: CanvasAction): Promise<ToolResult<CanvasResult>> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    try {
      logger.debug(`[ToolExecutor] canvas: ${action.type}`);

      const result = await this.client.request<CanvasResult>('canvas', {
        action: action.type,
        url: action.url,
        html: action.html,
        width: action.width,
        height: action.height,
        delayMs: action.delayMs,
      });

      return createSuccessResult(
        'canvas',
        runId,
        result,
        Date.now() - startTime,
        this.config.sessionKey
      );
    } catch (error) {
      logger.error(`[ToolExecutor] canvas failed: ${action.type}`, { error: String(error) });
      return createErrorResult(
        'canvas',
        runId,
        error,
        Date.now() - startTime,
        this.config.sessionKey
      );
    }
  }

  /**
   * Present HTML in canvas
   */
  async present(html: string, width?: number, height?: number): Promise<ToolResult<CanvasResult>> {
    return this.canvas({
      type: 'present',
      html,
      width,
      height,
    });
  }

  /**
   * Hide canvas
   */
  async hide(): Promise<ToolResult<CanvasResult>> {
    return this.canvas({ type: 'hide' });
  }

  // ============================================================================
  // Nodes / Device Actions
  // ============================================================================

  /**
   * Execute node action (device operations)
   */
  async nodes(action: NodeAction): Promise<ToolResult<NodeResult>> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    try {
      logger.debug(`[ToolExecutor] nodes: ${action.type}`);

      const result = await this.client.request<NodeResult>('nodes', {
        action: action.type,
        deviceId: action.deviceId,
        facing: action.facing,
        duration: action.duration,
        title: action.title,
        body: action.body,
      });

      return createSuccessResult(
        'nodes',
        runId,
        result,
        Date.now() - startTime,
        this.config.sessionKey
      );
    } catch (error) {
      logger.error(`[ToolExecutor] nodes failed: ${action.type}`, { error: String(error) });
      return createErrorResult(
        'nodes',
        runId,
        error,
        Date.now() - startTime,
        this.config.sessionKey
      );
    }
  }

  /**
   * Take camera snapshot
   */
  async cameraSnap(facing: 'front' | 'back' | 'both' = 'back'): Promise<ToolResult<NodeResult>> {
    return this.nodes({ type: 'camera_snap', facing });
  }

  /**
   * Record camera clip
   */
  async cameraClip(duration: number, facing: 'front' | 'back' = 'back'): Promise<ToolResult<NodeResult>> {
    return this.nodes({ type: 'camera_clip', duration, facing });
  }

  /**
   * Send notification
   */
  async notify(title: string, body: string, deviceId?: string): Promise<ToolResult<NodeResult>> {
    return this.nodes({ type: 'notify', title, body, deviceId });
  }

  /**
   * Get device location
   */
  async location(): Promise<ToolResult<NodeResult>> {
    return this.nodes({ type: 'location' });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Execute any tool by name
   */
  async execute<T = unknown>(
    tool: string,
    params: Record<string, unknown>
  ): Promise<ToolResult<T>> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    try {
      logger.debug(`[ToolExecutor] execute: ${tool}`);

      const result = await this.client.request<T>(tool, params);

      return createSuccessResult(
        tool,
        runId,
        result,
        Date.now() - startTime,
        this.config.sessionKey
      );
    } catch (error) {
      logger.error(`[ToolExecutor] execute failed: ${tool}`, { error: String(error) });
      return createErrorResult(
        tool,
        runId,
        error,
        Date.now() - startTime,
        this.config.sessionKey
      );
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createToolExecutor(config: ToolExecutorConfig): OpenClawToolExecutor {
  return new OpenClawToolExecutor(config);
}

export default OpenClawToolExecutor;
