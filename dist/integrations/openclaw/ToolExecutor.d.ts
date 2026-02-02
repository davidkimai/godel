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
import { ToolResult, ExecResult, ExecOptions, BrowserAction, BrowserResult, CanvasAction, CanvasResult, NodeAction, NodeResult } from './ToolResult';
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
export declare class GatewayClient {
    private host;
    private port;
    private token?;
    private ws;
    private pendingRequests;
    private requestCounter;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    constructor(host: string, port: number, token?: string);
    /**
     * Connect to OpenClaw Gateway
     */
    connect(): Promise<void>;
    /**
     * Disconnect from Gateway
     */
    disconnect(): Promise<void>;
    /**
     * Send request to Gateway and wait for response
     */
    request<T>(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Handle incoming message
     */
    private handleMessage;
    /**
     * Handle disconnection with retry
     */
    private handleDisconnect;
}
export declare class OpenClawToolExecutor {
    private config;
    private client;
    private largeOutputManager;
    private runIdCounter;
    constructor(config: ToolExecutorConfig);
    /**
     * Generate unique run ID
     */
    private generateRunId;
    /**
     * Connect to Gateway
     */
    connect(): Promise<void>;
    /**
     * Disconnect from Gateway
     */
    disconnect(): Promise<void>;
    /**
     * Check if connected to Gateway
     */
    isConnected(): boolean;
    /**
     * Read file contents
     */
    read(filePath: string, options?: ReadOptions): Promise<ToolResult<string>>;
    /**
     * Write content to file
     */
    write(filePath: string, content: string, options?: WriteOptions): Promise<ToolResult<void>>;
    /**
     * Edit file by replacing exact text
     */
    edit(filePath: string, oldText: string, newText: string, options?: EditOptions): Promise<ToolResult<void>>;
    /**
     * Execute shell command
     */
    exec(command: string, options?: ExecOptions): Promise<ToolResult<ExecResult>>;
    /**
     * Execute browser action
     */
    browser(action: BrowserAction): Promise<ToolResult<BrowserResult>>;
    /**
     * Navigate to URL
     */
    navigate(url: string, options?: Record<string, unknown>): Promise<ToolResult<BrowserResult>>;
    /**
     * Take browser snapshot
     */
    snapshot(): Promise<ToolResult<BrowserResult>>;
    /**
     * Click element by ref
     */
    click(ref: string): Promise<ToolResult<BrowserResult>>;
    /**
     * Type text into element
     */
    type(ref: string, text: string): Promise<ToolResult<BrowserResult>>;
    /**
     * Take screenshot
     */
    screenshot(fullPage?: boolean): Promise<ToolResult<BrowserResult>>;
    /**
     * Execute canvas action
     */
    canvas(action: CanvasAction): Promise<ToolResult<CanvasResult>>;
    /**
     * Present HTML in canvas
     */
    present(html: string, width?: number, height?: number): Promise<ToolResult<CanvasResult>>;
    /**
     * Hide canvas
     */
    hide(): Promise<ToolResult<CanvasResult>>;
    /**
     * Execute node action (device operations)
     */
    nodes(action: NodeAction): Promise<ToolResult<NodeResult>>;
    /**
     * Take camera snapshot
     */
    cameraSnap(facing?: 'front' | 'back' | 'both'): Promise<ToolResult<NodeResult>>;
    /**
     * Record camera clip
     */
    cameraClip(duration: number, facing?: 'front' | 'back'): Promise<ToolResult<NodeResult>>;
    /**
     * Send notification
     */
    notify(title: string, body: string, deviceId?: string): Promise<ToolResult<NodeResult>>;
    /**
     * Get device location
     */
    location(): Promise<ToolResult<NodeResult>>;
    /**
     * Execute any tool by name
     */
    execute<T = unknown>(tool: string, params: Record<string, unknown>): Promise<ToolResult<T>>;
}
export declare function createToolExecutor(config: ToolExecutorConfig): OpenClawToolExecutor;
export default OpenClawToolExecutor;
//# sourceMappingURL=ToolExecutor.d.ts.map