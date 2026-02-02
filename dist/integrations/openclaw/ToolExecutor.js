"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawToolExecutor = exports.GatewayClient = void 0;
exports.createToolExecutor = createToolExecutor;
const ws_1 = __importDefault(require("ws"));
const logger_1 = require("../../utils/logger");
const ToolResult_1 = require("./ToolResult");
// ============================================================================
// Gateway Client
// ============================================================================
class GatewayClient {
    constructor(host, port, token) {
        this.host = host;
        this.port = port;
        this.token = token;
        this.ws = null;
        this.pendingRequests = new Map();
        this.requestCounter = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
    }
    /**
     * Connect to OpenClaw Gateway
     */
    async connect() {
        return new Promise((resolve, reject) => {
            const url = `ws://${this.host}:${this.port}`;
            logger_1.logger.info(`[GatewayClient] Connecting to ${url}`);
            this.ws = new ws_1.default(url);
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 10000);
            this.ws.on('open', () => {
                clearTimeout(timeout);
                logger_1.logger.info('[GatewayClient] Connected to Gateway');
                this.reconnectAttempts = 0;
                resolve();
            });
            this.ws.on('message', (data) => {
                this.handleMessage(data.toString());
            });
            this.ws.on('close', () => {
                logger_1.logger.warn('[GatewayClient] Connection closed');
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
    async disconnect() {
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
    async request(method, params, timeoutMs = 30000) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            throw new Error('Gateway not connected');
        }
        const id = `req_${Date.now()}_${++this.requestCounter}`;
        const request = {
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
                resolve: (value) => resolve(value),
                reject,
                timeout
            });
            this.ws.send(JSON.stringify(request));
        });
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.ws?.readyState === ws_1.default.OPEN;
    }
    /**
     * Handle incoming message
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            if (message.type === 'res') {
                const request = this.pendingRequests.get(message.id);
                if (request) {
                    clearTimeout(request.timeout);
                    this.pendingRequests.delete(message.id);
                    if (message.ok) {
                        request.resolve(message.payload);
                    }
                    else {
                        request.reject(new Error(message.error?.message || 'Unknown error'));
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error('[GatewayClient] Failed to parse message:', { error: String(error) });
        }
    }
    /**
     * Handle disconnection with retry
     */
    handleDisconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            logger_1.logger.info(`[GatewayClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            setTimeout(() => {
                this.connect().catch(() => {
                    // Retry handled by handleDisconnect
                });
            }, delay);
        }
    }
}
exports.GatewayClient = GatewayClient;
// ============================================================================
// Tool Executor
// ============================================================================
class OpenClawToolExecutor {
    constructor(config) {
        this.config = config;
        this.runIdCounter = 0;
        this.client = new GatewayClient(config.gatewayHost, config.gatewayPort, config.gatewayToken);
        this.largeOutputManager = new ToolResult_1.LargeOutputManager({
            threshold: config.streamThreshold ?? ToolResult_1.DEFAULT_STREAM_THRESHOLD,
        });
    }
    /**
     * Generate unique run ID
     */
    generateRunId() {
        return `run_${Date.now()}_${++this.runIdCounter}`;
    }
    /**
     * Connect to Gateway
     */
    async connect() {
        await this.client.connect();
    }
    /**
     * Disconnect from Gateway
     */
    async disconnect() {
        await this.client.disconnect();
    }
    /**
     * Check if connected to Gateway
     */
    isConnected() {
        return this.client.isConnected();
    }
    // ============================================================================
    // File Operations
    // ============================================================================
    /**
     * Read file contents
     */
    async read(filePath, options = {}) {
        const runId = this.generateRunId();
        const startTime = Date.now();
        try {
            logger_1.logger.debug(`[ToolExecutor] read: ${filePath}`);
            const result = await this.client.request('read', {
                path: filePath,
                offset: options.offset,
                limit: options.limit,
            });
            const content = result.content;
            const outputSize = this.largeOutputManager.getSize(content);
            // Handle large outputs
            let output = content;
            let truncated = false;
            if (outputSize > ToolResult_1.DEFAULT_STREAM_THRESHOLD) {
                logger_1.logger.info(`[ToolExecutor] Large file detected: ${outputSize} bytes`);
                output = this.largeOutputManager.truncate(content);
                truncated = true;
            }
            return (0, ToolResult_1.createSuccessResult)('read', runId, output, Date.now() - startTime, this.config.sessionKey);
        }
        catch (error) {
            logger_1.logger.error(`[ToolExecutor] read failed: ${filePath}`, { error: String(error) });
            return (0, ToolResult_1.createErrorResult)('read', runId, error, Date.now() - startTime, this.config.sessionKey);
        }
    }
    /**
     * Write content to file
     */
    async write(filePath, content, options = {}) {
        const runId = this.generateRunId();
        const startTime = Date.now();
        try {
            logger_1.logger.debug(`[ToolExecutor] write: ${filePath}`);
            await this.client.request('write', {
                path: filePath,
                content,
                encoding: options.encoding,
                createDirs: options.createDirs,
            });
            return (0, ToolResult_1.createSuccessResult)('write', runId, undefined, Date.now() - startTime, this.config.sessionKey);
        }
        catch (error) {
            logger_1.logger.error(`[ToolExecutor] write failed: ${filePath}`, { error: String(error) });
            return (0, ToolResult_1.createErrorResult)('write', runId, error, Date.now() - startTime, this.config.sessionKey);
        }
    }
    /**
     * Edit file by replacing exact text
     */
    async edit(filePath, oldText, newText, options = {}) {
        const runId = this.generateRunId();
        const startTime = Date.now();
        try {
            logger_1.logger.debug(`[ToolExecutor] edit: ${filePath}`);
            await this.client.request('edit', {
                path: filePath,
                oldText,
                newText,
                createIfMissing: options.createIfMissing,
            });
            return (0, ToolResult_1.createSuccessResult)('edit', runId, undefined, Date.now() - startTime, this.config.sessionKey);
        }
        catch (error) {
            logger_1.logger.error(`[ToolExecutor] edit failed: ${filePath}`, { error: String(error) });
            return (0, ToolResult_1.createErrorResult)('edit', runId, error, Date.now() - startTime, this.config.sessionKey);
        }
    }
    // ============================================================================
    // Shell Execution
    // ============================================================================
    /**
     * Execute shell command
     */
    async exec(command, options = {}) {
        const runId = this.generateRunId();
        const startTime = Date.now();
        try {
            logger_1.logger.debug(`[ToolExecutor] exec: ${command}`);
            const result = await this.client.request('exec', {
                command,
                cwd: options.cwd,
                env: options.env,
                timeout: options.timeout ?? 60000,
                shell: options.shell,
                elevated: options.elevated,
            });
            const execResult = {
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
                timedOut: result.timedOut,
            };
            return (0, ToolResult_1.createSuccessResult)('exec', runId, execResult, Date.now() - startTime, this.config.sessionKey);
        }
        catch (error) {
            logger_1.logger.error(`[ToolExecutor] exec failed: ${command}`, { error: String(error) });
            return (0, ToolResult_1.createErrorResult)('exec', runId, error, Date.now() - startTime, this.config.sessionKey);
        }
    }
    // ============================================================================
    // Browser Automation
    // ============================================================================
    /**
     * Execute browser action
     */
    async browser(action) {
        const runId = this.generateRunId();
        const startTime = Date.now();
        try {
            logger_1.logger.debug(`[ToolExecutor] browser: ${action.type}`);
            const result = await this.client.request('browser', {
                action: action.type,
                url: action.url,
                ref: action.ref,
                text: action.text,
                selector: action.selector,
                script: action.script,
                options: action.options,
            });
            return (0, ToolResult_1.createSuccessResult)('browser', runId, result, Date.now() - startTime, this.config.sessionKey);
        }
        catch (error) {
            logger_1.logger.error(`[ToolExecutor] browser failed: ${action.type}`, { error: String(error) });
            return (0, ToolResult_1.createErrorResult)('browser', runId, error, Date.now() - startTime, this.config.sessionKey);
        }
    }
    /**
     * Navigate to URL
     */
    async navigate(url, options) {
        return this.browser({
            type: 'navigate',
            url,
            options,
        });
    }
    /**
     * Take browser snapshot
     */
    async snapshot() {
        return this.browser({ type: 'snapshot' });
    }
    /**
     * Click element by ref
     */
    async click(ref) {
        return this.browser({ type: 'click', ref });
    }
    /**
     * Type text into element
     */
    async type(ref, text) {
        return this.browser({ type: 'type', ref, text });
    }
    /**
     * Take screenshot
     */
    async screenshot(fullPage) {
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
    async canvas(action) {
        const runId = this.generateRunId();
        const startTime = Date.now();
        try {
            logger_1.logger.debug(`[ToolExecutor] canvas: ${action.type}`);
            const result = await this.client.request('canvas', {
                action: action.type,
                url: action.url,
                html: action.html,
                width: action.width,
                height: action.height,
                delayMs: action.delayMs,
            });
            return (0, ToolResult_1.createSuccessResult)('canvas', runId, result, Date.now() - startTime, this.config.sessionKey);
        }
        catch (error) {
            logger_1.logger.error(`[ToolExecutor] canvas failed: ${action.type}`, { error: String(error) });
            return (0, ToolResult_1.createErrorResult)('canvas', runId, error, Date.now() - startTime, this.config.sessionKey);
        }
    }
    /**
     * Present HTML in canvas
     */
    async present(html, width, height) {
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
    async hide() {
        return this.canvas({ type: 'hide' });
    }
    // ============================================================================
    // Nodes / Device Actions
    // ============================================================================
    /**
     * Execute node action (device operations)
     */
    async nodes(action) {
        const runId = this.generateRunId();
        const startTime = Date.now();
        try {
            logger_1.logger.debug(`[ToolExecutor] nodes: ${action.type}`);
            const result = await this.client.request('nodes', {
                action: action.type,
                deviceId: action.deviceId,
                facing: action.facing,
                duration: action.duration,
                title: action.title,
                body: action.body,
            });
            return (0, ToolResult_1.createSuccessResult)('nodes', runId, result, Date.now() - startTime, this.config.sessionKey);
        }
        catch (error) {
            logger_1.logger.error(`[ToolExecutor] nodes failed: ${action.type}`, { error: String(error) });
            return (0, ToolResult_1.createErrorResult)('nodes', runId, error, Date.now() - startTime, this.config.sessionKey);
        }
    }
    /**
     * Take camera snapshot
     */
    async cameraSnap(facing = 'back') {
        return this.nodes({ type: 'camera_snap', facing });
    }
    /**
     * Record camera clip
     */
    async cameraClip(duration, facing = 'back') {
        return this.nodes({ type: 'camera_clip', duration, facing });
    }
    /**
     * Send notification
     */
    async notify(title, body, deviceId) {
        return this.nodes({ type: 'notify', title, body, deviceId });
    }
    /**
     * Get device location
     */
    async location() {
        return this.nodes({ type: 'location' });
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Execute any tool by name
     */
    async execute(tool, params) {
        const runId = this.generateRunId();
        const startTime = Date.now();
        try {
            logger_1.logger.debug(`[ToolExecutor] execute: ${tool}`);
            const result = await this.client.request(tool, params);
            return (0, ToolResult_1.createSuccessResult)(tool, runId, result, Date.now() - startTime, this.config.sessionKey);
        }
        catch (error) {
            logger_1.logger.error(`[ToolExecutor] execute failed: ${tool}`, { error: String(error) });
            return (0, ToolResult_1.createErrorResult)(tool, runId, error, Date.now() - startTime, this.config.sessionKey);
        }
    }
}
exports.OpenClawToolExecutor = OpenClawToolExecutor;
// ============================================================================
// Factory Functions
// ============================================================================
function createToolExecutor(config) {
    return new OpenClawToolExecutor(config);
}
exports.default = OpenClawToolExecutor;
//# sourceMappingURL=ToolExecutor.js.map