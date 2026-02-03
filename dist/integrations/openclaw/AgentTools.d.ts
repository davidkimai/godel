/**
 * Enhanced Agent with Full OpenClaw Tool Access
 *
 * Provides agents with native access to OpenClaw tools:
 * - read, write, edit, exec
 * - browser, canvas, nodes
 * - sessions_spawn, sessions_send, sessions_history
 * - cron, gateway, message
 * - And all skills from ClawHub
 *
 * Integrates with permission system and budget tracking.
 *
 * @module integrations/openclaw/AgentTools
 */
import { ToolResult, ExecResult, BrowserResult, CanvasResult, NodeResult } from './ToolResult';
import { BudgetConfig } from './BudgetTracker';
import { AgentPermissions, SandboxMode } from './defaults';
/**
 * Configuration for an agent with OpenClaw tool access
 */
export interface AgentToolsConfig {
    /** Agent ID */
    agentId: string;
    /** Session key for OpenClaw */
    sessionKey?: string;
    /** Gateway configuration */
    gateway: {
        host: string;
        port: number;
        token?: string;
    };
    /** Permissions for this agent */
    permissions?: Partial<AgentPermissions>;
    /** Budget configuration */
    budget?: BudgetConfig;
    /** Skills to activate on startup */
    skills?: string[];
    /** Auto-connect to gateway on creation */
    autoConnect?: boolean;
}
/**
 * Tool call options
 */
export interface ToolCallOptions {
    /** Timeout in milliseconds */
    timeout?: number;
    /** Retry on failure */
    retry?: boolean;
    /** Maximum retries */
    maxRetries?: number;
    /** Metadata for tracking */
    metadata?: Record<string, unknown>;
}
/**
 * Session spawn options for agents
 */
export interface AgentSessionSpawnOptions {
    /** Task to execute */
    task: string;
    /** Model to use */
    model?: string;
    /** Thinking level */
    thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    /** System prompt */
    systemPrompt?: string;
    /** Skills to load */
    skills?: string[];
    /** Sandbox configuration */
    sandbox?: {
        mode: SandboxMode;
        allowedTools?: string[];
        deniedTools?: string[];
    };
    /** Timeout in milliseconds */
    timeout?: number;
}
/**
 * Session send options
 */
export interface AgentSessionSendOptions {
    /** Message to send */
    message: string;
    /** Attachments */
    attachments?: Array<{
        path?: string;
        buffer?: string;
        mimeType?: string;
        filename: string;
    }>;
    /** Reply to message ID */
    replyTo?: string;
}
/**
 * Session history options
 */
export interface AgentSessionHistoryOptions {
    /** Maximum messages to return */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
}
/**
 * Skill installation options
 */
export interface AgentSkillOptions {
    /** Skill configuration */
    config?: Record<string, unknown>;
    /** Skip validation */
    skipValidation?: boolean;
    /** Auto-activate dependencies */
    activateDependencies?: boolean;
}
/**
 * Result from using a skill
 */
export interface SkillUseResult {
    /** Whether the skill execution succeeded */
    success: boolean;
    /** Output from the skill */
    output: unknown;
    /** Error if failed */
    error?: string;
    /** Skill that was used */
    skill: string;
    /** Execution duration in ms */
    duration: number;
}
/**
 * Enhanced agent with full OpenClaw tool access
 *
 * Example usage:
 * ```typescript
 * const agent = new AgentTools({
 *   agentId: 'agent-123',
 *   gateway: { host: '127.0.0.1', port: 18789 }
 * });
 *
 * await agent.connect();
 *
 * // Use OpenClaw tools
 * const result = await agent.useOpenClawTool('read', {
 *   path: '/path/to/file.txt'
 * });
 *
 * // Spawn sub-agents
 * const session = await agent.useOpenClawTool('sessions_spawn', {
 *   task: 'Analyze code',
 *   model: 'sonnet'
 * });
 *
 * // Install and use skills
 * await agent.installSkill('flowmind');
 * const skillResult = await agent.useSkill('flowmind', { prompt: '...' });
 * ```
 */
export declare class AgentTools {
    private config;
    private toolExecutor;
    private permissionManager;
    private budgetTracker;
    private skillInstaller;
    private sessionManager;
    private agentExecutor;
    private connected;
    private installedSkills;
    private activeSessions;
    constructor(config: AgentToolsConfig);
    /**
     * Connect to the OpenClaw Gateway
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the OpenClaw Gateway
     */
    disconnect(): Promise<void>;
    /**
     * Check if connected to Gateway
     */
    isConnected(): boolean;
    /**
     * Use any OpenClaw tool by name
     *
     * This is the primary method for accessing all OpenClaw tools:
     * - 'read', 'write', 'edit' - File operations
     * - 'exec' - Shell execution
     * - 'browser' - Web automation
     * - 'canvas' - UI rendering
     * - 'nodes' - Device actions
     * - 'sessions_spawn', 'sessions_send', 'sessions_history' - Session management
     * - 'cron' - Scheduled tasks
     * - 'gateway' - Gateway management
     * - 'message' - Messaging
     *
     * @param tool - Tool name
     * @param params - Tool parameters
     * @param options - Call options
     * @returns Tool result
     *
     * @example
     * ```typescript
     * // Read a file
     * const result = await agent.useOpenClawTool('read', {
     *   path: '/project/file.txt'
     * });
     *
     * // Execute a command
     * const result = await agent.useOpenClawTool('exec', {
     *   command: 'npm test'
     * });
     *
     * // Spawn a sub-agent
     * const result = await agent.useOpenClawTool('sessions_spawn', {
     *   task: 'Analyze this code',
     *   model: 'sonnet'
     * });
     * ```
     */
    useOpenClawTool<T = unknown>(tool: string, params: Record<string, unknown>, options?: ToolCallOptions): Promise<ToolResult<T>>;
    /**
     * Read file contents
     */
    readFile(path: string, options?: {
        offset?: number;
        limit?: number;
    }): Promise<ToolResult<string>>;
    /**
     * Write content to file
     */
    writeFile(path: string, content: string): Promise<ToolResult<void>>;
    /**
     * Edit file by replacing text
     */
    editFile(path: string, oldText: string, newText: string): Promise<ToolResult<void>>;
    /**
     * Execute shell command
     */
    exec(command: string, options?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }): Promise<ToolResult<ExecResult>>;
    /**
     * Navigate browser to URL
     */
    browserNavigate(url: string): Promise<ToolResult<BrowserResult>>;
    /**
     * Get browser snapshot
     */
    browserSnapshot(): Promise<ToolResult<BrowserResult>>;
    /**
     * Click element in browser
     */
    browserClick(ref: string): Promise<ToolResult<BrowserResult>>;
    /**
     * Type text in browser element
     */
    browserType(ref: string, text: string): Promise<ToolResult<BrowserResult>>;
    /**
     * Take browser screenshot
     */
    browserScreenshot(fullPage?: boolean): Promise<ToolResult<BrowserResult>>;
    /**
     * Present HTML in canvas
     */
    canvasPresent(html: string, width?: number, height?: number): Promise<ToolResult<CanvasResult>>;
    /**
     * Hide canvas
     */
    canvasHide(): Promise<ToolResult<CanvasResult>>;
    /**
     * Take camera snapshot
     */
    cameraSnap(facing?: 'front' | 'back' | 'both'): Promise<ToolResult<NodeResult>>;
    /**
     * Send notification to device
     */
    notify(title: string, body: string, deviceId?: string): Promise<ToolResult<NodeResult>>;
    /**
     * Spawn a new OpenClaw session (sub-agent)
     *
     * @param options - Session spawn options
     * @returns Session key and ID
     *
     * @example
     * ```typescript
     * const session = await agent.sessionsSpawn({
     *   task: 'Analyze this code',
     *   model: 'sonnet',
     *   thinking: 'medium'
     * });
     * console.log(session.sessionKey); // 'sess_abc123'
     * ```
     */
    sessionsSpawn(options: AgentSessionSpawnOptions): Promise<{
        sessionKey: string;
        sessionId: string;
    }>;
    /**
     * Send a message to a session
     *
     * @param sessionKey - Target session key
     * @param options - Send options
     * @returns Run ID and status
     *
     * @example
     * ```typescript
     * const result = await agent.sessionsSend('sess_abc123', {
     *   message: 'Continue with the analysis'
     * });
     * console.log(result.runId); // 'run_xyz789'
     * ```
     */
    sessionsSend(sessionKey: string, options: AgentSessionSendOptions): Promise<{
        runId: string;
        status: string;
    }>;
    /**
     * Get session history
     *
     * @param sessionKey - Session key
     * @param options - History options
     * @returns Array of messages
     *
     * @example
     * ```typescript
     * const history = await agent.sessionsHistory('sess_abc123', { limit: 10 });
     * for (const message of history.messages) {
     *   console.log(`${message.role}: ${message.content}`);
     * }
     * ```
     */
    sessionsHistory(sessionKey: string, options?: AgentSessionHistoryOptions): Promise<{
        messages: Array<{
            id: string;
            role: string;
            content: string;
            timestamp: string;
        }>;
        total: number;
    }>;
    /**
     * List active sessions
     *
     * @returns List of session info
     */
    sessionsList(): Promise<Array<{
        key: string;
        id: string;
        model: string;
        status: string;
    }>>;
    /**
     * Install a skill from ClawHub
     *
     * @param skillName - Name/slug of the skill
     * @param options - Installation options
     * @returns Installation result
     *
     * @example
     * ```typescript
     * await agent.installSkill('flowmind');
     * await agent.installSkill('web-search', {
     *   config: { apiKey: '...' }
     * });
     * ```
     */
    installSkill(skillName: string, options?: AgentSkillOptions): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Use an installed skill
     *
     * @param skillName - Name of the skill to use
     * @param params - Skill parameters
     * @returns Skill execution result
     *
     * @example
     * ```typescript
     * await agent.installSkill('flowmind');
     * const result = await agent.useSkill('flowmind', {
     *   prompt: 'Generate ideas for...'
     * });
     *
     * if (result.success) {
     *   console.log(result.output);
     * }
     * ```
     */
    useSkill(skillName: string, params: Record<string, unknown>): Promise<SkillUseResult>;
    /**
     * Uninstall a skill
     *
     * @param skillName - Name of the skill to uninstall
     */
    uninstallSkill(skillName: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * List installed skills
     */
    listSkills(): Array<{
        name: string;
        version: string;
        status: string;
    }>;
    /**
     * Get current permissions for this agent
     */
    getPermissions(): AgentPermissions | undefined;
    /**
     * Update permissions for this agent
     */
    updatePermissions(updates: Partial<AgentPermissions>): AgentPermissions;
    /**
     * Check if this agent has permission to use a tool
     */
    hasPermission(tool: string): boolean;
    /**
     * Get budget status (if budget tracking is enabled)
     */
    getBudgetStatus(): Promise<{
        spent: number;
        limit: number;
        remaining: number;
    } | null>;
    private createPermissionErrorResult;
    private createBudgetErrorResult;
    private createErrorResult;
    private sleep;
    get agentId(): string;
    get sessionKey(): string | undefined;
}
/**
 * Create a new agent with OpenClaw tool access
 */
export declare function createAgentTools(config: AgentToolsConfig): AgentTools;
/**
 * Create an agent with full permissions (use with caution)
 */
export declare function createFullAccessAgent(agentId: string, gateway: {
    host: string;
    port: number;
    token?: string;
}): AgentTools;
/**
 * Create a restricted agent (safe for untrusted tasks)
 */
export declare function createRestrictedAgent(agentId: string, gateway: {
    host: string;
    port: number;
    token?: string;
}): AgentTools;
export default AgentTools;
//# sourceMappingURL=AgentTools.d.ts.map