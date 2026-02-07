/**
 * Pi Runtime Implementation
 *
 * AgentRuntime adapter for the Pi CLI (@mariozechner/pi-coding-agent).
 * Wraps PiClient to provide the unified AgentRuntime interface.
 *
 * @module runtime/pi
 */

import { EventEmitter } from 'events';
import {
  AgentRuntime,
  SpawnConfig,
  Agent,
  AgentStatus,
  ExecResult,
  ExecMetadata,
  RuntimeError,
  AgentNotFoundError,
  SpawnError,
  ExecError,
  RuntimeEvents,
} from './types';
import {
  PiClient,
  PiClientConfig,
  SessionInitConfig,
  SessionStatus,
  MessageResponse,
  PiClientError,
  ConnectionError,
  SessionError,
} from '../integrations/pi/client';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for PiRuntime
 *
 * Runtime-specific configuration for Pi client connection.
 * Distinct from registry's PiRuntimeConfig which is for YAML config file.
 */
export interface PiClientRuntimeConfig {
  /** WebSocket endpoint for Pi server */
  endpoint?: string;

  /** API key for authentication */
  apiKey?: string;

  /** Default provider */
  provider?: string;

  /** Default model */
  model?: string;

  /** Enable auto-reconnect */
  reconnect?: boolean;

  /** Request timeout in milliseconds */
  requestTimeout?: number;

  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
}

/**
 * Internal tracking for managed Pi sessions
 */
interface ManagedAgent {
  agent: Agent;
  client: PiClient;
  sessionId: string;
  config: SpawnConfig;
}

// ============================================================================
// PiRuntime Class
// ============================================================================

/**
 * Pi CLI runtime implementation of AgentRuntime
 *
 * Manages Pi agent instances via WebSocket RPC protocol.
 * Each spawned agent corresponds to a Pi session.
 *
 * @example
 * ```typescript
 * const runtime = new PiRuntime({
 *   endpoint: 'ws://localhost:3000',
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-5'
 * });
 *
 * const agent = await runtime.spawn({
 *   name: 'my-agent',
 *   workdir: '/path/to/project'
 * });
 *
 * const result = await runtime.exec(agent.id, 'Implement a function');
 * await runtime.kill(agent.id);
 * ```
 */
export class PiRuntime extends EventEmitter implements AgentRuntime {
  readonly id = 'pi';
  readonly name = 'Pi Coding Agent';

  private config: PiClientRuntimeConfig;
  private agents = new Map<string, ManagedAgent>();
  private agentCounter = 0;

  /**
   * Create a new PiRuntime instance
   *
   * @param config - Runtime configuration
   */
  constructor(config: PiClientRuntimeConfig = {}) {
    super();

    this.config = {
      endpoint: config.endpoint || process.env['PI_ENDPOINT'] || 'ws://localhost:3000',
      apiKey: config.apiKey || process.env['PI_API_KEY'],
      provider: config.provider || 'anthropic',
      model: config.model || 'claude-sonnet-4-5',
      reconnect: config.reconnect ?? true,
      requestTimeout: config.requestTimeout || 60000,
      heartbeatInterval: config.heartbeatInterval || 30000,
    };

    logger.info('pi-runtime', 'PiRuntime initialized', {
      endpoint: this.config.endpoint,
      provider: this.config.provider,
      model: this.config.model,
    });
  }

  // ============================================================================
  // AgentRuntime Implementation
  // ============================================================================

  /**
   * Spawn a new Pi agent instance
   *
   * Creates a new Pi session and initializes the connection.
   *
   * @param config - Agent spawn configuration
   * @returns Promise resolving to the spawned agent
   * @throws SpawnError if spawn fails
   */
  async spawn(config: SpawnConfig): Promise<Agent> {
    const agentId = `pi-${Date.now()}-${++this.agentCounter}`;
    const agentName = config.name || `pi-agent-${this.agentCounter}`;

    logger.info('pi-runtime', 'Spawning agent', { agentId, name: agentName });

    try {
      // Create Pi client configuration
      const clientConfig: PiClientConfig = {
        endpoint: this.config.endpoint!,
        apiKey: this.config.apiKey,
        provider: config.provider || this.config.provider!,
        model: config.model || this.config.model!,
        systemPrompt: config.systemPrompt,
        tools: config.tools,
        reconnect: this.config.reconnect,
        requestTimeout: config.timeout || this.config.requestTimeout,
        heartbeatInterval: this.config.heartbeatInterval,
      };

      // Create and connect Pi client
      const client = new PiClient(clientConfig);
      await client.connect();

      // Initialize Pi session
      const sessionConfig: SessionInitConfig = {
        provider: config.provider || this.config.provider,
        model: config.model || this.config.model,
        tools: config.tools,
        systemPrompt: config.systemPrompt,
        worktreePath: config.workdir,
      };

      const sessionInfo = await client.initSession(sessionConfig);

      // Create agent record
      const agent: Agent = {
        id: agentId,
        name: agentName,
        status: 'running',
        runtime: this.id,
        model: sessionInfo.model,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        metadata: {
          sessionId: sessionInfo.id,
          provider: sessionInfo.provider,
          tools: sessionInfo.tools,
        },
      };

      // Store managed agent
      const managed: ManagedAgent = {
        agent,
        client,
        sessionId: sessionInfo.id,
        config,
      };
      this.agents.set(agentId, managed);

      // Set up event handlers
      this.setupClientHandlers(agentId, client);

      logger.info('pi-runtime', 'Agent spawned successfully', {
        agentId,
        sessionId: sessionInfo.id,
      });

      this.emit('agent.spawned', agent);

      return agent;
    } catch (error) {
      logger.error('pi-runtime', 'Failed to spawn agent', { agentId, error });
      throw new SpawnError(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Terminate an agent instance
   *
   * Closes the Pi session and disconnects the client.
   *
   * @param agentId - ID of the agent to kill
   * @returns Promise resolving when termination is complete
   * @throws AgentNotFoundError if agent not found
   */
  async kill(agentId: string): Promise<void> {
    logger.info('pi-runtime', 'Killing agent', { agentId });

    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new AgentNotFoundError(agentId);
    }

    try {
      // Update status before termination
      const previousStatus = managed.agent.status;
      managed.agent.status = 'stopped';

      // Close Pi session
      await managed.client.closeSession();

      // Disconnect client
      await managed.client.disconnect();

      // Remove from registry
      this.agents.delete(agentId);

      logger.info('pi-runtime', 'Agent killed successfully', { agentId });

      this.emit('agent.killed', agentId);
      this.emit('agent.status_changed', agentId, previousStatus, 'stopped');
    } catch (error) {
      logger.error('pi-runtime', 'Error killing agent', { agentId, error });

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
   * Sends a message to the Pi session and waits for response.
   *
   * @param agentId - ID of the target agent
   * @param command - Command to execute
   * @returns Promise resolving to execution result
   * @throws AgentNotFoundError if agent not found
   * @throws ExecError if execution fails
   */
  async exec(agentId: string, command: string): Promise<ExecResult> {
    const startTime = Date.now();

    logger.debug('pi-runtime', 'Executing command', { agentId, command: command.substring(0, 100) });

    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new AgentNotFoundError(agentId);
    }

    if (managed.agent.status !== 'running') {
      throw new ExecError(agentId, command, -1, `Agent is not running (status: ${managed.agent.status})`);
    }

    try {
      // Send message to Pi
      const response = await managed.client.sendMessage(command);

      const duration = Date.now() - startTime;

      // Build execution result
      const result: ExecResult = {
        stdout: response.content,
        stderr: '',
        exitCode: 0,
        duration,
        metadata: this.buildExecMetadata(response, duration),
      };

      // Update last activity
      managed.agent.lastActivityAt = new Date();

      logger.debug('pi-runtime', 'Command executed successfully', { agentId, duration });

      this.emit('exec.completed', agentId, result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('pi-runtime', 'Command execution failed', { agentId, error, duration });

      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: ExecResult = {
        stdout: '',
        stderr: errorMessage,
        exitCode: 1,
        duration,
        metadata: {
          timestamp: new Date(),
        },
      };

      this.emit('exec.completed', agentId, result);

      throw new ExecError(agentId, command, 1, errorMessage);
    }
  }

  /**
   * Get the status of an agent
   *
   * Queries the Pi session status via RPC.
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

    try {
      // Query Pi session status
      const sessionStatus = await managed.client.getStatus();

      // Map Pi status to AgentStatus
      const previousStatus = managed.agent.status;
      const currentStatus = this.mapPiStatus(sessionStatus.state);

      managed.agent.status = currentStatus;

      // Emit status change if different
      if (previousStatus !== currentStatus) {
        this.emit('agent.status_changed', agentId, previousStatus, currentStatus);
      }

      return currentStatus;
    } catch (error) {
      logger.warn('pi-runtime', 'Failed to get agent status', { agentId, error });

      // If we can't get status, mark as error
      managed.agent.status = 'error';
      return 'error';
    }
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
   * Get the Pi client for a specific agent
   *
   * @param agentId - Agent identifier
   * @returns PiClient or undefined if not found
   */
  getClient(agentId: string): PiClient | undefined {
    return this.agents.get(agentId)?.client;
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
    logger.info('pi-runtime', 'Killing all agents', { count: this.agents.size });

    const promises = Array.from(this.agents.keys()).map((agentId) =>
      this.kill(agentId).catch((error) => {
        logger.warn('pi-runtime', 'Failed to kill agent during killAll', { agentId, error });
      })
    );

    await Promise.all(promises);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Set up event handlers for a Pi client
   *
   * @param agentId - Agent identifier
   * @param client - Pi client instance
   */
  private setupClientHandlers(agentId: string, client: PiClient): void {
    const managed = this.agents.get(agentId);
    if (!managed) return;

    client.on('error', (error) => {
      logger.warn('pi-runtime', 'Pi client error', { agentId, error: error.message });
      managed.agent.status = 'error';
      this.emit('agent.error', agentId, error);
    });

    client.on('disconnected', (reason) => {
      logger.warn('pi-runtime', 'Pi client disconnected', { agentId, reason });
      if (managed.agent.status !== 'stopped') {
        managed.agent.status = 'error';
        this.emit('agent.status_changed', agentId, 'running', 'error');
      }
    });

    client.on('status_change', (status) => {
      const previousStatus = managed.agent.status;
      const currentStatus = this.mapPiStatus(status.state);

      if (previousStatus !== currentStatus) {
        managed.agent.status = currentStatus;
        this.emit('agent.status_changed', agentId, previousStatus, currentStatus);
      }
    });
  }

  /**
   * Map Pi session state to AgentStatus
   *
   * @param state - Pi session state
   * @returns Mapped AgentStatus
   */
  private mapPiStatus(state: SessionStatus['state']): AgentStatus {
    switch (state) {
      case 'active':
        return 'running';
      case 'paused':
        return 'pending';
      case 'error':
        return 'error';
      case 'terminated':
        return 'stopped';
      default:
        return 'error';
    }
  }

  /**
   * Build execution metadata from Pi response
   *
   * @param response - Pi message response
   * @param duration - Execution duration
   * @returns Execution metadata
   */
  private buildExecMetadata(response: MessageResponse, duration: number): ExecMetadata {
    return {
      timestamp: new Date(),
      toolCalls: response.toolCalls?.length,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalPiRuntime: PiRuntime | null = null;

/**
 * Get or create the global PiRuntime instance
 *
 * @param config - Optional configuration (only used on first call)
 * @returns PiRuntime instance
 */
export function getGlobalPiRuntime(config?: PiClientRuntimeConfig): PiRuntime {
  if (!globalPiRuntime) {
    globalPiRuntime = new PiRuntime(config);
  }
  return globalPiRuntime;
}

/**
 * Reset the global PiRuntime instance
 *
 * Note: This does not kill existing agents. Call killAll() first if needed.
 */
export function resetGlobalPiRuntime(): void {
  globalPiRuntime = null;
}

/**
 * Check if global PiRuntime exists
 *
 * @returns True if global instance exists
 */
export function hasGlobalPiRuntime(): boolean {
  return globalPiRuntime !== null;
}

// ============================================================================
// Default Export
// ============================================================================

export default PiRuntime;
