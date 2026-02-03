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

import { Agent, AgentStatus } from '../../models/agent';
import { logger } from '../../utils/logger';
import { 
  OpenClawToolExecutor, 
  ToolExecutorConfig 
} from './ToolExecutor';
import { 
  ToolResult,
  ToolErrorResult,
  ExecResult, 
  BrowserResult, 
  CanvasResult, 
  NodeResult 
} from './ToolResult';
import { 
  PermissionManager 
} from './PermissionManager';
import { 
  BudgetTracker, 
  BudgetConfig 
} from './BudgetTracker';
import { 
  SkillInstaller 
} from './SkillInstaller';
import {
  InstalledSkill
} from './ClawHubTypes';
import { 
  SessionManager 
} from './SessionManager';
import { 
  AgentExecutor, 
  TaskDispatchOptions 
} from './AgentExecutor';
import {
  AgentPermissions,
  SandboxMode
} from './defaults';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Agent Tools Manager
// ============================================================================

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
export class AgentTools {
  private config: AgentToolsConfig;
  private toolExecutor: OpenClawToolExecutor;
  private permissionManager: PermissionManager;
  private budgetTracker: BudgetTracker;
  private skillInstaller: SkillInstaller;
  private sessionManager: SessionManager;
  private agentExecutor: AgentExecutor;
  private connected: boolean = false;
  private installedSkills: Map<string, InstalledSkill> = new Map();
  private activeSessions: Map<string, AgentExecutor> = new Map();

  constructor(config: AgentToolsConfig) {
    this.config = {
      autoConnect: true,
      ...config,
    };

    // Initialize tool executor
    const toolConfig: ToolExecutorConfig = {
      sessionKey: config.sessionKey || `agent-${config.agentId}`,
      gatewayHost: config.gateway.host,
      gatewayPort: config.gateway.port,
      gatewayToken: config.gateway.token,
      timeout: 60000,
    };
    this.toolExecutor = new OpenClawToolExecutor(toolConfig);

    // Initialize permission manager
    this.permissionManager = new PermissionManager({
      strictMode: true,
      autoTerminateOnViolation: true,
      violationThreshold: 3,
    });

    // Register agent permissions
    this.permissionManager.registerAgent(config.agentId, config.permissions);

    // Initialize budget tracker (requires storage - passed in config)
    // this.budgetTracker = ... initialized externally

    // Initialize skill installer
    // this.skillInstaller = ... initialized externally

    // Initialize session manager
    // this.sessionManager = ... initialized externally

    // Initialize agent executor
    // this.agentExecutor = ... initialized externally

    logger.info(`[AgentTools] Created agent ${config.agentId} with OpenClaw tool access`);
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to the OpenClaw Gateway
   */
  async connect(): Promise<void> {
    if (this.connected) {
      logger.debug(`[AgentTools] Agent ${this.config.agentId} already connected`);
      return;
    }

    try {
      await this.toolExecutor.connect();
      this.connected = true;
      logger.info(`[AgentTools] Agent ${this.config.agentId} connected to Gateway`);
    } catch (error) {
      logger.error(`[AgentTools] Failed to connect agent ${this.config.agentId}:`, { error: String(error) });
      throw error;
    }
  }

  /**
   * Disconnect from the OpenClaw Gateway
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.toolExecutor.disconnect();
    this.connected = false;
    logger.info(`[AgentTools] Agent ${this.config.agentId} disconnected`);
  }

  /**
   * Check if connected to Gateway
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================================
  // Core Tool Access
  // ============================================================================

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
  async useOpenClawTool<T = unknown>(
    tool: string,
    params: Record<string, unknown>,
    options: ToolCallOptions = {}
  ): Promise<ToolResult<T>> {
    // Check permission
    const allowed = this.permissionManager.checkToolPermission(this.config.agentId, tool, true);
    if (!allowed) {
      return this.createPermissionErrorResult(tool, 'Tool not permitted');
    }

    // Check budget
    // const budgetStatus = await this.budgetTracker.check(this.config.agentId);
    // if (budgetStatus.isExceeded) {
    //   return this.createBudgetErrorResult(tool, budgetStatus);
    // }

    // Ensure connected
    if (!this.connected) {
      await this.connect();
    }

    const startTime = Date.now();
    let attempts = 0;
    const maxRetries = options.maxRetries ?? (options.retry ? 3 : 0);

    while (true) {
      try {
        const result = await this.toolExecutor.execute<T>(tool, params);
        
        // Track usage
        // await this.trackToolUsage(tool, result);

        return result;
      } catch (error) {
        attempts++;
        
        if (attempts > maxRetries) {
          return this.createErrorResult(tool, error, Date.now() - startTime);
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
        await this.sleep(delay);
      }
    }
  }

  // ============================================================================
  // Convenience Methods for Common Tools
  // ============================================================================

  /**
   * Read file contents
   */
  async readFile(path: string, options?: { offset?: number; limit?: number }): Promise<ToolResult<string>> {
    return this.useOpenClawTool('read', {
      path,
      offset: options?.offset,
      limit: options?.limit,
    });
  }

  /**
   * Write content to file
   */
  async writeFile(path: string, content: string): Promise<ToolResult<void>> {
    return this.useOpenClawTool('write', { path, content });
  }

  /**
   * Edit file by replacing text
   */
  async editFile(path: string, oldText: string, newText: string): Promise<ToolResult<void>> {
    return this.useOpenClawTool('edit', { path, oldText, newText });
  }

  /**
   * Execute shell command
   */
  async exec(command: string, options?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<ToolResult<ExecResult>> {
    return this.useOpenClawTool('exec', {
      command,
      cwd: options?.cwd,
      env: options?.env,
      timeout: options?.timeout,
    });
  }

  /**
   * Navigate browser to URL
   */
  async browserNavigate(url: string): Promise<ToolResult<BrowserResult>> {
    return this.useOpenClawTool('browser', { action: 'navigate', url });
  }

  /**
   * Get browser snapshot
   */
  async browserSnapshot(): Promise<ToolResult<BrowserResult>> {
    return this.useOpenClawTool('browser', { action: 'snapshot' });
  }

  /**
   * Click element in browser
   */
  async browserClick(ref: string): Promise<ToolResult<BrowserResult>> {
    return this.useOpenClawTool('browser', { action: 'click', ref });
  }

  /**
   * Type text in browser element
   */
  async browserType(ref: string, text: string): Promise<ToolResult<BrowserResult>> {
    return this.useOpenClawTool('browser', { action: 'type', ref, text });
  }

  /**
   * Take browser screenshot
   */
  async browserScreenshot(fullPage?: boolean): Promise<ToolResult<BrowserResult>> {
    return this.useOpenClawTool('browser', { action: 'screenshot', options: { fullPage } });
  }

  /**
   * Present HTML in canvas
   */
  async canvasPresent(html: string, width?: number, height?: number): Promise<ToolResult<CanvasResult>> {
    return this.useOpenClawTool('canvas', { action: 'present', html, width, height });
  }

  /**
   * Hide canvas
   */
  async canvasHide(): Promise<ToolResult<CanvasResult>> {
    return this.useOpenClawTool('canvas', { action: 'hide' });
  }

  /**
   * Take camera snapshot
   */
  async cameraSnap(facing: 'front' | 'back' | 'both' = 'back'): Promise<ToolResult<NodeResult>> {
    return this.useOpenClawTool('nodes', { action: 'camera_snap', facing });
  }

  /**
   * Send notification to device
   */
  async notify(title: string, body: string, deviceId?: string): Promise<ToolResult<NodeResult>> {
    return this.useOpenClawTool('nodes', { action: 'notify', title, body, deviceId });
  }

  // ============================================================================
  // Session Management
  // ============================================================================

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
  async sessionsSpawn(options: AgentSessionSpawnOptions): Promise<{ sessionKey: string; sessionId: string }> {
    const result = await this.useOpenClawTool<{ sessionKey: string; sessionId: string }>('sessions_spawn', {
      model: options.model,
      thinking: options.thinking,
      systemPrompt: options.systemPrompt,
      skills: options.skills,
      sandbox: options.sandbox,
    });

    if (!result.success) {
      throw new Error(`Failed to spawn session: ${(result as any).error?.message}`);
    }

    return result.output;
  }

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
  async sessionsSend(sessionKey: string, options: AgentSessionSendOptions): Promise<{ runId: string; status: string }> {
    const result = await this.useOpenClawTool<{ runId: string; status: string }>('sessions_send', {
      sessionKey,
      message: options.message,
      attachments: options.attachments,
      replyTo: options.replyTo,
    });

    if (!result.success) {
      throw new Error(`Failed to send message: ${(result as any).error?.message}`);
    }

    return result.output;
  }

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
  async sessionsHistory(sessionKey: string, options?: AgentSessionHistoryOptions): Promise<{ messages: Array<{ id: string; role: string; content: string; timestamp: string }>; total: number }> {
    const result = await this.useOpenClawTool<{ messages: Array<{ id: string; role: string; content: string; timestamp: string }>; total: number }>('sessions_history', {
      sessionKey,
      limit: options?.limit,
      offset: options?.offset,
    });

    if (!result.success) {
      throw new Error(`Failed to get history: ${(result as any).error?.message}`);
    }

    return result.output;
  }

  /**
   * List active sessions
   * 
   * @returns List of session info
   */
  async sessionsList(): Promise<Array<{ key: string; id: string; model: string; status: string }>> {
    const result = await this.useOpenClawTool<Array<{ key: string; id: string; model: string; status: string }>>('sessions_list', {});

    if (!result.success) {
      throw new Error(`Failed to list sessions: ${(result as any).error?.message}`);
    }

    return result.output;
  }

  // ============================================================================
  // Skill Management
  // ============================================================================

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
  async installSkill(skillName: string, options: AgentSkillOptions = {}): Promise<{ success: boolean; error?: string }> {
    // Check permission
    const allowed = this.permissionManager.checkToolPermission(this.config.agentId, 'skill_install', false);
    if (!allowed) {
      return { success: false, error: 'Permission denied: skill_install' };
    }

    try {
      // In production, this would use the actual SkillInstaller
      // const result = await this.skillInstaller.install(skillName);
      // await this.skillInstaller.activate(skillName, { config: options.config });

      // Mock for now
      this.installedSkills.set(skillName, {
        slug: skillName,
        name: skillName,
        description: `Skill ${skillName}`,
        author: { id: 'clawhub', username: 'ClawHub' },
        version: '1.0.0',
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        downloads: 0,
        stars: 0,
        status: 'active',
        installPath: `/skills/${skillName}`,
        activationState: 'active',
        config: options.config || {},
      });

      logger.info(`[AgentTools] Agent ${this.config.agentId} installed skill: ${skillName}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[AgentTools] Failed to install skill ${skillName}:`, { error: message });
      return { success: false, error: message };
    }
  }

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
  async useSkill(skillName: string, params: Record<string, unknown>): Promise<SkillUseResult> {
    // Check if skill is installed
    const skill = this.installedSkills.get(skillName);
    if (!skill) {
      return {
        success: false,
        error: `Skill '${skillName}' not installed. Call installSkill() first.`,
        skill: skillName,
        output: null,
        duration: 0,
      };
    }

    // Check permission
    const allowed = this.permissionManager.checkToolPermission(this.config.agentId, `skill:${skillName}`, false);
    if (!allowed) {
      return {
        success: false,
        error: `Permission denied: skill:${skillName}`,
        skill: skillName,
        output: null,
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      // In production, this would execute the skill via OpenClaw
      // const result = await this.skillInstaller.execute(skillName, params);

      // For now, return mock success
      const duration = Date.now() - startTime;
      
      logger.info(`[AgentTools] Agent ${this.config.agentId} used skill: ${skillName}`);
      
      return {
        success: true,
        output: { skill: skillName, params, executedAt: new Date().toISOString() },
        skill: skillName,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      
      logger.error(`[AgentTools] Skill ${skillName} failed:`, { error: message });
      
      return {
        success: false,
        error: message,
        skill: skillName,
        output: null,
        duration,
      };
    }
  }

  /**
   * Uninstall a skill
   * 
   * @param skillName - Name of the skill to uninstall
   */
  async uninstallSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.installedSkills.has(skillName)) {
      return { success: false, error: `Skill '${skillName}' not installed` };
    }

    this.installedSkills.delete(skillName);
    logger.info(`[AgentTools] Agent ${this.config.agentId} uninstalled skill: ${skillName}`);
    
    return { success: true };
  }

  /**
   * List installed skills
   */
  listSkills(): Array<{ name: string; version: string; status: string }> {
    return Array.from(this.installedSkills.values()).map(skill => ({
      name: skill.name,
      version: skill.version,
      status: skill.activationState,
    }));
  }

  // ============================================================================
  // Permission & Budget Integration
  // ============================================================================

  /**
   * Get current permissions for this agent
   */
  getPermissions(): AgentPermissions | undefined {
    return this.permissionManager.getPermissions(this.config.agentId);
  }

  /**
   * Update permissions for this agent
   */
  updatePermissions(updates: Partial<AgentPermissions>): AgentPermissions {
    return this.permissionManager.updatePermissions(this.config.agentId, updates);
  }

  /**
   * Check if this agent has permission to use a tool
   */
  hasPermission(tool: string): boolean {
    return this.permissionManager.checkToolPermission(this.config.agentId, tool, false);
  }

  /**
   * Get budget status (if budget tracking is enabled)
   */
  async getBudgetStatus(): Promise<{ spent: number; limit: number; remaining: number } | null> {
    // if (!this.budgetTracker) return null;
    // const status = await this.budgetTracker.check(this.config.agentId);
    // return {
    //   spent: status.totalSpent,
    //   limit: status.budgetLimit,
    //   remaining: status.remaining,
    // };
    return null; // Placeholder until budget tracker is integrated
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private createPermissionErrorResult<T>(tool: string, reason: string): ToolResult<T> {
    return {
      tool,
      runId: `perm-${Date.now()}`,
      sessionKey: this.config.sessionKey,
      success: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: reason,
        details: { agentId: this.config.agentId, tool },
      },
      duration: 0,
      timestamp: new Date(),
    } as ToolErrorResult;
  }

  private createBudgetErrorResult<T>(tool: string, budgetStatus: { isExceeded: boolean; totalSpent: number; budgetLimit: number }): ToolResult<T> {
    return {
      tool,
      runId: `budget-${Date.now()}`,
      sessionKey: this.config.sessionKey,
      success: false,
      error: {
        code: 'BUDGET_EXCEEDED',
        message: `Budget exceeded: $${budgetStatus.totalSpent.toFixed(2)} / $${budgetStatus.budgetLimit.toFixed(2)}`,
        details: { agentId: this.config.agentId, budgetStatus },
      },
      duration: 0,
      timestamp: new Date(),
    } as ToolErrorResult;
  }

  private createErrorResult<T>(tool: string, error: unknown, duration: number): ToolResult<T> {
    return {
      tool,
      runId: `err-${Date.now()}`,
      sessionKey: this.config.sessionKey,
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      duration,
      timestamp: new Date(),
    } as ToolErrorResult;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Getters
  // ============================================================================

  get agentId(): string {
    return this.config.agentId;
  }

  get sessionKey(): string | undefined {
    return this.config.sessionKey;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new agent with OpenClaw tool access
 */
export function createAgentTools(config: AgentToolsConfig): AgentTools {
  return new AgentTools(config);
}

/**
 * Create an agent with full permissions (use with caution)
 */
export function createFullAccessAgent(agentId: string, gateway: { host: string; port: number; token?: string }): AgentTools {
  return new AgentTools({
    agentId,
    gateway,
    permissions: {
      allowedTools: ['*'],
      deniedTools: [],
      sandboxMode: 'none',
      canSpawnAgents: true,
      maxConcurrentTools: 10,
    },
  });
}

/**
 * Create a restricted agent (safe for untrusted tasks)
 */
export function createRestrictedAgent(agentId: string, gateway: { host: string; port: number; token?: string }): AgentTools {
  return new AgentTools({
    agentId,
    gateway,
    permissions: {
      allowedTools: ['read', 'web_search', 'web_fetch', 'image', 'tts'],
      deniedTools: ['write', 'edit', 'exec', 'sessions_spawn', 'gateway'],
      sandboxMode: 'docker',
      canSpawnAgents: false,
      maxConcurrentTools: 2,
      requireApproval: true,
    },
  });
}

export default AgentTools;
