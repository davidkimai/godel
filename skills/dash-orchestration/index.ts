/**
 * Dash Orchestration Skill
 * 
 * OpenClaw skill for spawning and managing agent swarms with Dash.
 * Provides native OpenClaw commands for Dash orchestration.
 * 
 * @module skills/dash-orchestration
 */

import { 
  OpenClawAdapter, 
  getOpenClawAdapter, 
  type SpawnAgentOptions,
  type AgentStatus,
} from '../../src/integrations/openclaw/adapter';

// ============================================================================
// Types
// ============================================================================

export interface CommandContext {
  /** OpenClaw session key */
  sessionKey: string;
  /** User input */
  input: string;
  /** Model being used */
  model: string;
  /** Reply function */
  reply: (message: string) => void;
  /** Reply with error */
  error: (message: string) => void;
}

export interface SkillConfig {
  /** Dash API URL */
  dashApiUrl: string;
  /** Dash API Key */
  dashApiKey: string;
  /** Event webhook URL */
  eventWebhookUrl?: string;
  /** Default timeout */
  defaultTimeout?: number;
}

export interface SpawnArgs {
  /** Agent type */
  type: string;
  /** Number of agents */
  agents?: number;
  /** Swarm strategy */
  strategy?: 'parallel' | 'sequential' | 'pipeline';
  /** Model to use */
  model?: string;
  /** Timeout in ms */
  timeout?: number;
  /** Task description */
  task?: string;
  /** Files to process */
  files?: string;
  /** Additional options */
  [key: string]: unknown;
}

export interface StatusArgs {
  /** Agent ID */
  agentId?: string;
}

export interface KillArgs {
  /** Agent ID */
  agentId?: string;
  /** Force kill */
  force?: boolean;
}

export interface LogsArgs {
  /** Agent ID */
  agentId?: string;
  /** Follow logs */
  follow?: boolean;
  /** Number of lines */
  lines?: number;
}

// ============================================================================
// Dash Orchestration Skill
// ============================================================================

/**
 * Dash Orchestration Skill
 * 
 * Provides OpenClaw-native commands for managing Dash agent swarms.
 */
export class DashOrchestrationSkill {
  name = 'dash-orchestration';
  description = 'Spawn and manage agent swarms with Dash';
  version = '1.0.0';
  
  private adapter: OpenClawAdapter;
  private config: SkillConfig;
  private activeStreams: Map<string, boolean>;

  constructor(config?: Partial<SkillConfig>) {
    this.config = {
      dashApiUrl: process.env.DASH_API_URL || 'http://localhost:7373',
      dashApiKey: process.env.DASH_API_KEY || '',
      eventWebhookUrl: process.env.OPENCLAW_EVENT_WEBHOOK_URL,
      defaultTimeout: 300000,
      ...config,
    };

    this.adapter = getOpenClawAdapter({
      dashApiUrl: this.config.dashApiUrl,
      dashApiKey: this.config.dashApiKey,
      openclawSessionKey: '', // Set per-command
      eventWebhookUrl: this.config.eventWebhookUrl,
    });

    this.activeStreams = new Map();

    console.log('[DashOrchestrationSkill] Initialized');
  }

  // ============================================================================
  // Commands
  // ============================================================================

  /**
   * Spawn a new agent or swarm
   * 
   * Usage: /dash spawn <type> [--agents N] [--strategy S] [--model M]
   */
  async spawn(context: CommandContext, args: string[]): Promise<void> {
    try {
      const parsed = this.parseSpawnArgs(args);
      
      if (!parsed.type) {
        context.error('Usage: /dash spawn <type> [--agents N] [--strategy S] [--model M]');
        return;
      }

      context.reply(`🚀 Spawning ${parsed.agents || 1} ${parsed.type} agent(s)...`);

      // Build spawn options
      const options: SpawnAgentOptions = {
        agentType: parsed.type,
        task: parsed.task || context.input,
        model: parsed.model || context.model,
        timeout: parsed.timeout || this.config.defaultTimeout,
        config: {
          strategy: parsed.strategy || 'parallel',
          files: parsed.files,
          ...parsed,
        },
      };

      // Spawn agent via adapter
      const result = await this.adapter.spawnAgent(context.sessionKey, options);

      context.reply(`✅ Spawned Dash agent: **${result.dashAgentId}**`);
      context.reply(`📊 Status: ${result.status}`);

      if (result.swarmId) {
        context.reply(`🐝 Swarm ID: ${result.swarmId}`);
      }

      // Stream progress if requested
      await this.streamProgress(context, result.dashAgentId, context.sessionKey);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.error(`❌ Failed to spawn agent: ${message}`);
    }
  }

  /**
   * Check agent status
   * 
   * Usage: /dash status [agent-id]
   */
  async status(context: CommandContext, args: string[]): Promise<void> {
    try {
      const parsed = this.parseStatusArgs(args);
      
      // If agent ID provided, check that specific agent
      if (parsed.agentId) {
        const result = await this.adapter.getAgent(dashAgentId);
        if (!result.success || !result.data) {
          context.error(`Agent ${parsed.agentId} not found`);
          return;
        }
        const agent = result.data;
        context.reply(`📊 Agent **${parsed.agentId}**`);
        context.reply(`   Status: ${agent.status}`);
        context.reply(`   Progress: ${agent.progress || 0}%`);
        if (agent.runtime) {
          context.reply(`   Runtime: ${this.formatDuration(agent.runtime)}`);
        }
        return;
      }

      // Otherwise check the session's agent
      const status = await this.adapter.getStatus(context.sessionKey);

      if (status.status === 'not_found') {
        context.reply('ℹ️ No active agent for this session');
        return;
      }

      context.reply(`📊 Agent Status: **${status.status}**`);
      
      if (status.progress !== undefined) {
        const bar = this.renderProgressBar(status.progress);
        context.reply(`${bar} ${status.progress}%`);
      }
      
      if (status.runtime) {
        context.reply(`⏱️ Runtime: ${this.formatDuration(status.runtime)}`);
      }

      if (status.error) {
        context.reply(`❌ Error: ${status.error}`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.error(`❌ Failed to get status: ${message}`);
    }
  }

  /**
   * Kill an agent
   * 
   * Usage: /dash kill [agent-id] [--force]
   */
  async kill(context: CommandContext, args: string[]): Promise<void> {
    try {
      const parsed = this.parseKillArgs(args);

      // If specific agent ID provided
      if (parsed.agentId) {
        // Find session key for this agent
        const sessionKey = this.adapter.getOpenClawSessionKey(parsed.agentId);
        if (!sessionKey) {
          context.error(`Agent ${parsed.agentId} not found`);
          return;
        }
        
        await this.adapter.killAgent(sessionKey, parsed.force);
        context.reply(`💀 Killed agent **${parsed.agentId}**`);
        return;
      }

      // Otherwise kill the session's agent
      await this.adapter.killAgent(context.sessionKey, parsed.force);
      context.reply('💀 Agent killed');

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.error(`❌ Failed to kill agent: ${message}`);
    }
  }

  /**
   * Stream agent logs
   * 
   * Usage: /dash logs [agent-id] [--follow] [--lines N]
   */
  async logs(context: CommandContext, args: string[]): Promise<void> {
    try {
      const parsed = this.parseLogsArgs(args);
      const lines = parsed.lines || 50;

      let dashAgentId: string;

      if (parsed.agentId) {
        dashAgentId = parsed.agentId;
      } else {
        const mappedId = this.adapter.getDashAgentId(context.sessionKey);
        if (!mappedId) {
          context.error('No active agent for this session');
          return;
        }
        dashAgentId = mappedId;
      }

      context.reply(`📜 Fetching logs for **${dashAgentId}**...`);

      // Get logs from API
      const result = await this.adapter.getAgent(dashAgentId);
      if (!result.success || !result.data) {
        context.error(`Agent ${dashAgentId} not found`);
        return;
      }

      // For now, show placeholder - full log streaming would need API support
      context.reply(`📄 Last ${lines} lines of logs:`);
      context.reply('```');
      context.reply(`[${new Date().toISOString()}] Agent ${dashAgentId} initialized`);
      context.reply(`[${new Date().toISOString()}] Status: ${result.data.status}`);
      context.reply('```');

      if (parsed.follow) {
        context.reply('👀 Following logs (Press Ctrl+C to stop)...');
        this.activeStreams.set(context.sessionKey, true);
        
        // Simulate log following
        let count = 0;
        const interval = setInterval(() => {
          if (!this.activeStreams.get(context.sessionKey) || count > 10) {
            clearInterval(interval);
            this.activeStreams.delete(context.sessionKey);
            context.reply('📜 Log stream ended');
            return;
          }
          context.reply(`[${new Date().toISOString()}] ...`);
          count++;
        }, 2000);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.error(`❌ Failed to get logs: ${message}`);
    }
  }

  /**
   * List all active agents
   * 
   * Usage: /dash list
   */
  async list(context: CommandContext): Promise<void> {
    try {
      const agents = await this.adapter.listAgents();

      if (agents.length === 0) {
        context.reply('ℹ️ No active Dash agents');
        return;
      }

      context.reply(`📋 **${agents.length} Active Dash Agent(s):**`);
      context.reply('');

      for (const agent of agents) {
        const statusEmoji = this.getStatusEmoji(agent.status);
        context.reply(`${statusEmoji} **${agent.dashAgentId}**`);
        context.reply(`   Type: ${agent.agentType}`);
        context.reply(`   Status: ${agent.status}`);
        context.reply(`   Session: ${agent.openclawSessionKey.slice(0, 8)}...`);
        context.reply(`   Created: ${agent.createdAt.toLocaleString()}`);
        context.reply('');
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.error(`❌ Failed to list agents: ${message}`);
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Stream progress updates for an agent
   */
  private async streamProgress(
    context: CommandContext, 
    agentId: string, 
    sessionKey: string
  ): Promise<void> {
    const maxUpdates = 10;
    let updates = 0;

    const checkProgress = async () => {
      if (updates >= maxUpdates) return;

      try {
        const result = await this.adapter.getAgent(agentId);
        if (!result.success || !result.data) return;

        const agent = result.data;
        
        if (agent.status === 'completed' || agent.status === 'failed') {
          const emoji = agent.status === 'completed' ? '✅' : '❌';
          context.reply(`${emoji} Agent **${agentId}** ${agent.status}`);
          
          if (agent.result) {
            context.reply(`📄 Result: ${JSON.stringify(agent.result, null, 2)}`);
          }
          return;
        }

        if (agent.progress !== undefined && agent.progress > 0) {
          const bar = this.renderProgressBar(agent.progress);
          context.reply(`⏳ ${bar} ${agent.progress}%`);
        }

        updates++;
        setTimeout(checkProgress, 2000);
      } catch {
        // Ignore errors during progress checks
      }
    };

    // Start progress checking
    setTimeout(checkProgress, 1000);
  }

  /**
   * Parse spawn command arguments
   */
  private parseSpawnArgs(args: string[]): SpawnArgs {
    const result: SpawnArgs = {
      type: '',
      agents: 1,
      strategy: 'parallel',
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const key = arg.replace('--', '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const value = args[++i];
        
        if (key === 'agents' || key === 'timeout') {
          (result as Record<string, unknown>)[key] = parseInt(value, 10);
        } else {
          (result as Record<string, unknown>)[key] = value;
        }
      } else if (!result.type) {
        result.type = arg;
      } else {
        result.task = (result.task || '') + ' ' + arg;
      }
    }

    if (result.task) {
      result.task = result.task.trim();
    }

    return result;
  }

  /**
   * Parse status command arguments
   */
  private parseStatusArgs(args: string[]): StatusArgs {
    return {
      agentId: args[0],
    };
  }

  /**
   * Parse kill command arguments
   */
  private parseKillArgs(args: string[]): KillArgs {
    const result: KillArgs = {};
    
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--force' || args[i] === '-f') {
        result.force = true;
      } else if (!result.agentId) {
        result.agentId = args[i];
      }
    }

    return result;
  }

  /**
   * Parse logs command arguments
   */
  private parseLogsArgs(args: string[]): LogsArgs {
    const result: LogsArgs = {
      lines: 50,
    };
    
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--follow' || args[i] === '-f') {
        result.follow = true;
      } else if ((args[i] === '--lines' || args[i] === '-n') && args[i + 1]) {
        result.lines = parseInt(args[++i], 10);
      } else if (!result.agentId) {
        result.agentId = args[i];
      }
    }

    return result;
  }

  /**
   * Render a progress bar
   */
  private renderProgressBar(progress: number, width = 20): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);
    return `[${filledBar}${emptyBar}]`;
  }

  /**
   * Format duration in ms to human readable
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get emoji for status
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'running':
      case 'active':
        return '🟢';
      case 'pending':
      case 'spawning':
        return '⏳';
      case 'completed':
      case 'succeeded':
        return '✅';
      case 'failed':
      case 'error':
        return '❌';
      case 'paused':
        return '⏸️';
      case 'killed':
        return '💀';
      default:
        return '⚪';
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initialize the skill
   */
  async initialize(): Promise<void> {
    console.log('[DashOrchestrationSkill] Initializing...');
    // Any async initialization here
  }

  /**
   * Dispose of the skill
   */
  async dispose(): Promise<void> {
    console.log('[DashOrchestrationSkill] Disposing...');
    
    // Stop all active streams
    for (const [key] of this.activeStreams) {
      this.activeStreams.set(key, false);
    }
    this.activeStreams.clear();
  }
}

// ============================================================================
// Export
// ============================================================================

export default DashOrchestrationSkill;

// Factory function for OpenClaw skill loader
export function createSkill(config?: Partial<SkillConfig>): DashOrchestrationSkill {
  return new DashOrchestrationSkill(config);
}
