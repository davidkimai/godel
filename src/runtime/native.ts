/**
 * Native Runtime Implementation
 *
 * AgentRuntime adapter for native process-based execution.
 * Acts as a fallback for backward compatibility.
 *
 * @module runtime/native
 */

import { EventEmitter } from 'events';
import {
  AgentRuntime,
  SpawnConfig,
  Agent,
  AgentStatus,
  ExecResult,
  RuntimeError,
  AgentNotFoundError,
  SpawnError,
  ExecError,
  RuntimeEvents,
} from './types';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for NativeRuntime
 */
export interface NativeRuntimeConfig {
  /** Binary path for native agent */
  binaryPath?: string;
  /** Default working directory */
  workdir?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Default timeout in milliseconds */
  timeout?: number;
}

/**
 * Internal tracking for managed agents
 */
interface ManagedAgent {
  agent: Agent;
  config: SpawnConfig;
}

// ============================================================================
// NativeRuntime Class
// ============================================================================

/**
 * Native process-based runtime implementation of AgentRuntime
 *
 * Provides a fallback runtime for backward compatibility.
 * Manages agents as native OS processes.
 *
 * @example
 * ```typescript
 * const runtime = new NativeRuntime({
 *   binaryPath: '/usr/local/bin/godel-agent',
 *   workdir: '/path/to/project'
 * });
 *
 * const agent = await runtime.spawn({
 *   name: 'my-agent',
 *   model: 'kimi-k2.5'
 * });
 *
 * await runtime.kill(agent.id);
 * ```
 */
export class NativeRuntime extends EventEmitter implements AgentRuntime {
  readonly id = 'native';
  readonly name = 'Native Process Runtime';

  private config: NativeRuntimeConfig;
  private agents = new Map<string, ManagedAgent>();
  private agentCounter = 0;

  /**
   * Create a new NativeRuntime instance
   *
   * @param config - Runtime configuration
   */
  constructor(config: NativeRuntimeConfig = {}) {
    super();

    this.config = {
      binaryPath: config.binaryPath || process.env['GODEL_AGENT_BINARY'],
      workdir: config.workdir || process.cwd(),
      env: config.env || {},
      timeout: config.timeout || 300000, // 5 minutes
    };

    logger.info('native-runtime', 'NativeRuntime initialized', {
      binaryPath: this.config.binaryPath,
      workdir: this.config.workdir,
    });
  }

  // ============================================================================
  // AgentRuntime Implementation
  // ============================================================================

  /**
   * Spawn a new native agent instance
   *
   * Creates a new agent record for native process management.
   * Note: Full process spawning will be implemented in future versions.
   *
   * @param config - Agent spawn configuration
   * @returns Promise resolving to the spawned agent
   * @throws SpawnError if spawn fails
   */
  async spawn(config: SpawnConfig): Promise<Agent> {
    const agentId = `native-${Date.now()}-${++this.agentCounter}`;
    const agentName = config.name || `native-agent-${this.agentCounter}`;

    logger.info('native-runtime', 'Spawning agent', { agentId, name: agentName });

    try {
      // Create agent record
      // Note: This is a stub implementation for backward compatibility
      // Full process spawning will be implemented in future versions
      const agent: Agent = {
        id: agentId,
        name: agentName,
        status: 'pending', // Native agents start as pending until fully implemented
        runtime: this.id,
        model: config.model || 'default',
        createdAt: new Date(),
        lastActivityAt: new Date(),
        metadata: {
          workdir: config.workdir || this.config.workdir,
          env: { ...this.config.env, ...config.env },
          systemPrompt: config.systemPrompt,
          tools: config.tools,
          timeout: config.timeout || this.config.timeout,
          // Mark as stub implementation
          implementation: 'stub',
          note: 'Native runtime is a stub for backward compatibility. Use pi runtime for full functionality.',
        },
      };

      // Store managed agent
      const managed: ManagedAgent = {
        agent,
        config,
      };
      this.agents.set(agentId, managed);

      logger.info('native-runtime', 'Agent spawned (stub mode)', {
        agentId,
        note: 'Native runtime is a stub implementation',
      });

      this.emit('agent.spawned', agent);

      return agent;
    } catch (error) {
      logger.error('native-runtime', 'Failed to spawn agent', { agentId, error });
      throw new SpawnError(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Terminate an agent instance
   *
   * @param agentId - ID of the agent to kill
   * @returns Promise resolving when termination is complete
   * @throws AgentNotFoundError if agent not found
   */
  async kill(agentId: string): Promise<void> {
    logger.info('native-runtime', 'Killing agent', { agentId });

    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new AgentNotFoundError(agentId);
    }

    try {
      // Update status before termination
      const previousStatus = managed.agent.status;
      managed.agent.status = 'stopped';

      // Remove from registry
      this.agents.delete(agentId);

      logger.info('native-runtime', 'Agent killed successfully', { agentId });

      this.emit('agent.killed', agentId);
      this.emit('agent.status_changed', agentId, previousStatus, 'stopped');
    } catch (error) {
      logger.error('native-runtime', 'Error killing agent', { agentId, error });

      // Mark as error state but still remove
      managed.agent.status = 'error';
      this.agents.delete(agentId);

      this.emit('agent.error', agentId, error instanceof Error ? error : new Error(String(error)));

      throw error;
    }
  }

  /**
   * Execute a command on an agent
   *
   * Note: Execution is not implemented in stub mode.
   *
   * @param agentId - ID of the target agent
   * @param command - Command to execute
   * @returns Promise resolving to execution result
   * @throws AgentNotFoundError if agent not found
   * @throws ExecError if execution fails
   */
  async exec(agentId: string, command: string): Promise<ExecResult> {
    const startTime = Date.now();

    logger.debug('native-runtime', 'Executing command (stub)', { agentId, command: command.substring(0, 100) });

    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new AgentNotFoundError(agentId);
    }

    // Stub implementation - return error indicating not implemented
    const duration = Date.now() - startTime;

    const result: ExecResult = {
      stdout: '',
      stderr: 'Native runtime exec() is not implemented. Use pi runtime for full functionality.',
      exitCode: 1,
      duration,
      metadata: {
        timestamp: new Date(),
      },
    };

    logger.warn('native-runtime', 'Command execution not implemented (stub)', { agentId });

    this.emit('exec.completed', agentId, result);

    throw new ExecError(agentId, command, 1, 'Native runtime exec() is not implemented. Use pi runtime for full functionality.');
  }

  /**
   * Get the status of an agent
   *
   * @param agentId - ID of the agent to check
   * @returns Promise resolving to agent status
   * @throws AgentNotFoundError if agent not found
   */
  async status(agentId: string): Promise<AgentStatus> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new AgentNotFoundError(agentId);
    }

    return managed.agent.status;
  }

  /**
   * List all managed agents
   *
   * @returns Promise resolving to array of agents
   */
  async list(): Promise<Agent[]> {
    return Array.from(this.agents.values()).map((managed) => ({
      ...managed.agent,
    }));
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Get a specific agent by ID
   *
   * @param agentId - Agent identifier
   * @returns Agent or undefined if not found
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  /**
   * Get the number of managed agents
   *
   * @returns Agent count
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  /**
   * Terminate all agents
   *
   * @returns Promise resolving when all agents are killed
   */
  async killAll(): Promise<void> {
    logger.info('native-runtime', 'Killing all agents', { count: this.agents.size });

    const promises = Array.from(this.agents.keys()).map((agentId) =>
      this.kill(agentId).catch((error) => {
        logger.warn('native-runtime', 'Failed to kill agent during killAll', { agentId, error });
      })
    );

    await Promise.all(promises);
  }

  /**
   * Check if this is a stub implementation
   *
   * @returns true (NativeRuntime is currently a stub)
   */
  isStub(): boolean {
    return true;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalNativeRuntime: NativeRuntime | null = null;

/**
 * Get or create the global NativeRuntime instance
 *
 * @param config - Optional configuration (only used on first call)
 * @returns NativeRuntime instance
 */
export function getGlobalNativeRuntime(config?: NativeRuntimeConfig): NativeRuntime {
  if (!globalNativeRuntime) {
    globalNativeRuntime = new NativeRuntime(config);
  }
  return globalNativeRuntime;
}

/**
 * Reset the global NativeRuntime instance
 *
 * Note: This does not kill existing agents. Call killAll() first if needed.
 */
export function resetGlobalNativeRuntime(): void {
  globalNativeRuntime = null;
}

/**
 * Check if global NativeRuntime exists
 *
 * @returns True if global instance exists
 */
export function hasGlobalNativeRuntime(): boolean {
  return globalNativeRuntime !== null;
}

// ============================================================================
// Default Export
// ============================================================================

export default NativeRuntime;
