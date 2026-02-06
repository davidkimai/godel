/**
 * OpenClaw Adapter
 * 
 * Translates OpenClaw protocol to Godel API, enabling OpenClaw to use
 * Godel as its native orchestration platform for agent swarms.
 * 
 * @module integrations/openclaw/adapter
 */

import { logger } from '../../utils/logger';
import { EventEmitter } from 'events';
import { getGlobalClient, type DashApiClient } from '../../cli/lib/client';
import { getGlobalBus, type MessageBus, type Subscription } from '../../bus/index';
import {
  ApplicationError,
  NotFoundError,
  DashErrorCode,
} from '../../errors';

// ============================================================================
// Types
// ============================================================================

export interface OpenClawAdapterConfig {
  /** Godel API URL */
  godelApiUrl: string;
  /** Godel API Key */
  godelApiKey: string;
  /** OpenClaw session key for authentication */
  openclawSessionKey: string;
  /** Optional webhook URL for event forwarding */
  eventWebhookUrl?: string;
}

/** @deprecated Use OpenClawAdapterConfig with godelApiUrl/godelApiKey */
export type DashOpenClawAdapterConfig = OpenClawAdapterConfig;

export interface SpawnAgentOptions {
  /** Type of agent to spawn */
  agentType: string;
  /** Task description for the agent */
  task: string;
  /** Model to use (optional) */
  model?: string;
  /** Timeout in milliseconds (default: 300000) */
  timeout?: number;
  /** Additional configuration */
  config?: Record<string, unknown>;
}

export interface SpawnAgentResult {
  /** Godel agent ID */
  godelAgentId: string;
  /** @deprecated Use godelAgentId */
  dashAgentId: string;
  /** Initial status */
  status: string;
  /** Swarm ID if created */
  swarmId?: string;
}

export interface AgentStatus {
  /** Current status */
  status: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Result data if completed */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Runtime in milliseconds */
  runtime?: number;
}

export interface ActiveAgent {
  /** OpenClaw session key */
  openclawSessionKey: string;
  /** Godel agent ID */
  godelAgentId: string;
  /** @deprecated Use godelAgentId */
  dashAgentId?: string;
  /** Current status */
  status: string;
  /** Agent type */
  agentType: string;
  /** Created timestamp */
  createdAt: Date;
}

// ============================================================================
// OpenClaw Adapter
// ============================================================================

/**
 * OpenClaw Adapter - Protocol translation layer
 *
 * Maps OpenClaw sessions to Godel agents and swarms, enabling
 * bidirectional communication between OpenClaw and Godel.
 */
export class OpenClawAdapter extends EventEmitter {
  private config: OpenClawAdapterConfig;
  private client: DashApiClient;
  private messageBus: MessageBus;

  /** Maps OpenClaw session keys to Godel agent IDs */
  private agentIdMap: Map<string, string>;
  /** Maps Godel agent IDs to OpenClaw session keys */
  private sessionKeyMap: Map<string, string>;
  /** Maps OpenClaw session keys to swarm IDs */
  private swarmIdMap: Map<string, string>;
  /** Tracks agent metadata */
  private agentMetadata: Map<string, { agentType: string; createdAt: Date }>;
  /** Event forwarding handlers */
  private eventHandlers: Map<string, Subscription>;

  constructor(config: OpenClawAdapterConfig) {
    super();
    this.config = config;
    this.client = getGlobalClient();
    this.messageBus = getGlobalBus();

    this.agentIdMap = new Map();
    this.sessionKeyMap = new Map();
    this.swarmIdMap = new Map();
    this.agentMetadata = new Map();
    this.eventHandlers = new Map();

    logger.info('[OpenClawAdapter] Initialized with config:', {
      godelApiUrl: config.godelApiUrl,
      hasApiKey: !!config.godelApiKey,
    });
  }

  // ============================================================================
  // Agent Lifecycle
  // ============================================================================

  /**
   * Spawn an agent in Godel from OpenClaw session
   *
   * Creates a swarm and spawns an agent within it, mapping the OpenClaw
   * session key to the Godel agent ID for future operations.
   */
  async spawnAgent(
    openclawSessionKey: string,
    options: SpawnAgentOptions
  ): Promise<SpawnAgentResult> {
    logger.info(`[OpenClawAdapter] Spawning agent for session ${openclawSessionKey}`, {
      agentType: options.agentType,
      model: options.model,
    });

    try {
      // Create a swarm for this agent
      const swarmResult = await this.client.createSwarm({
        name: `openclaw-${openclawSessionKey}`,
        task: options.task,
        initialAgents: 1,
        maxAgents: 1,
        strategy: 'parallel' as const,
        model: options.model,
        metadata: {
          agentType: options.agentType,
          openclawSessionKey,
        },
      });

      if (!swarmResult.success || !swarmResult.data) {
        throw new ApplicationError(
          'Failed to create swarm',
          DashErrorCode.SWARM_CREATE_FAILED,
          500,
          { error: swarmResult.error }
        );
      }

      const swarmId = swarmResult.data.id;
      this.swarmIdMap.set(openclawSessionKey, swarmId);

      // Spawn agent in the swarm
      const agentResult = await this.client.spawnAgent({
        label: `openclaw-agent-${Date.now()}`,
        model: options.model,
        task: options.task,
        swarmId,
      });

      if (!agentResult.success || !agentResult.data) {
        // Clean up swarm if agent spawn failed
        await this.client.destroySwarm(swarmId, true);
        throw new ApplicationError(
          'Failed to spawn agent',
          DashErrorCode.AGENT_SPAWN_FAILED,
          500,
          { error: agentResult.error }
        );
      }

      const dashAgentId = agentResult.data.id;

      // Map OpenClaw session to Godel agent
      this.agentIdMap.set(openclawSessionKey, dashAgentId);
      this.sessionKeyMap.set(dashAgentId, openclawSessionKey);
      this.agentMetadata.set(openclawSessionKey, {
        agentType: options.agentType,
        createdAt: new Date(),
      });

      // Set up event forwarding for this agent
      await this.setupEventForwarding(openclawSessionKey, dashAgentId);

      logger.info(`[OpenClawAdapter] Agent spawned successfully: ${dashAgentId}`);

      return {
        godelAgentId: dashAgentId,
        dashAgentId, // backward compatibility
        status: agentResult.data.status,
        swarmId,
      };
    } catch (error) {
      logger.error('[OpenClawAdapter] Failed to spawn agent:', error);
      throw error;
    }
  }

  /**
   * Send message to Godel agent from OpenClaw
   *
   * Routes messages from an OpenClaw session to the corresponding
   * Godel agent.
   */
  async sendMessage(openclawSessionKey: string, message: string): Promise<void> {
    const dashAgentId = this.agentIdMap.get(openclawSessionKey);

    if (!dashAgentId) {
      throw new NotFoundError(
        `No Godel agent mapped for session ${openclawSessionKey}`,
        'SESSION_NOT_FOUND'
      );
    }

    logger.info(`[OpenClawAdapter] Sending message to agent ${dashAgentId}`);

    // Publish message to agent's message bus topic
    this.messageBus.publish(
      `agent.${dashAgentId}.messages`,
      {
        type: 'openclaw.message',
        content: message,
        timestamp: new Date().toISOString(),
      },
      { source: 'openclaw', priority: 'high' }
    );
  }

  /**
   * Kill Godel agent from OpenClaw
   *
   * Terminates the agent and cleans up associated resources.
   */
  async killAgent(openclawSessionKey: string, force = false): Promise<void> {
    const dashAgentId = this.agentIdMap.get(openclawSessionKey);
    const swarmId = this.swarmIdMap.get(openclawSessionKey);

    if (!dashAgentId) {
      logger.warn(`[OpenClawAdapter] No agent to kill for session ${openclawSessionKey}`);
      return;
    }

    logger.info(`[OpenClawAdapter] Killing agent ${dashAgentId} (force=${force})`);

    try {
      const forceArg = force ? true : undefined;

      // Kill the agent
      const result = await this.client.killAgent(dashAgentId, forceArg);

      if (!result || !result.success) {
        logger.warn(`[OpenClawAdapter] Kill agent returned error:`, result?.error);
      }

      // Clean up swarm if exists
      if (swarmId) {
        await this.client.destroySwarm(swarmId, forceArg);
      }

      // Clean up event forwarding
      this.cleanupEventForwarding(openclawSessionKey);

      // Remove mappings
      this.agentIdMap.delete(openclawSessionKey);
      this.sessionKeyMap.delete(dashAgentId);
      this.swarmIdMap.delete(openclawSessionKey);
      this.agentMetadata.delete(openclawSessionKey);

      logger.info(`[OpenClawAdapter] Agent ${dashAgentId} killed successfully`);
    } catch (error) {
      logger.error('[OpenClawAdapter] Error killing agent:', error);
      throw error;
    }
  }

  /**
   * Get status of Godel agent
   *
   * Returns current status, progress, and result (if completed).
   */
  async getStatus(openclawSessionKey: string): Promise<AgentStatus> {
    const dashAgentId = this.agentIdMap.get(openclawSessionKey);

    if (!dashAgentId) {
      return { status: 'not_found' };
    }

    const result = await this.client.getAgent(dashAgentId);

    if (!result.success || !result.data) {
      return { status: 'not_found' };
    }

    const agent = result.data as typeof result.data & {
      progress?: number;
      result?: unknown;
    };

    return {
      status: agent.status,
      progress: (agent.progress as number | undefined) ?? (agent.metadata?.['progress'] as number | undefined),
      result: (agent.result as unknown) ?? (agent.metadata?.['result'] as unknown),
      error: agent.lastError,
      runtime: agent.runtime,
    };
  }

  /**
   * List all active OpenClaw-managed agents
   *
   * Returns all agents currently mapped from OpenClaw sessions.
   */
  async listAgents(): Promise<ActiveAgent[]> {
    const agents: ActiveAgent[] = [];

    for (const [sessionKey, agentId] of this.agentIdMap.entries()) {
      const metadata = this.agentMetadata.get(sessionKey);

      // Get current status
      const statusResult = await this.client.getAgent(agentId);
      const status =
        statusResult && statusResult.success ? statusResult.data?.status : 'unknown';

      agents.push({
        openclawSessionKey: sessionKey,
        godelAgentId: agentId,
        dashAgentId: agentId, // backward compatibility
        status: status || 'unknown',
        agentType: metadata?.agentType || 'unknown',
        createdAt: metadata?.createdAt || new Date(),
      });
    }

    return agents;
  }

  // ============================================================================
  // Event Forwarding
  // ============================================================================

  /**
   * Set up event forwarding for an agent
   *
   * Subscribes to Godel events for this agent and forwards them
   * to the configured webhook or internal handlers.
   */
  private async setupEventForwarding(
    openclawSessionKey: string,
    dashAgentId: string
  ): Promise<void> {
    logger.info(`[OpenClawAdapter] Setting up event forwarding for agent ${dashAgentId}`);

    // Subscribe to agent events
    const subscription = this.messageBus.subscribe(
      `agent.${dashAgentId}.events`,
      (message) => {
        this.forwardEvent(openclawSessionKey, dashAgentId, message);
      }
    );

    if (!Array.isArray(subscription)) {
      this.eventHandlers.set(openclawSessionKey, subscription);
    }
  }

  /**
   * Clean up event forwarding for a session
   */
  private cleanupEventForwarding(openclawSessionKey: string): void {
    const subscription = this.eventHandlers.get(openclawSessionKey);
    if (subscription) {
      const maybeBus = this.messageBus as unknown as { unsubscribe?: (sub: Subscription) => boolean };
      if (typeof maybeBus.unsubscribe === 'function') {
        maybeBus.unsubscribe(subscription);
      } else if (typeof (subscription as unknown as () => void) === 'function') {
        (subscription as unknown as () => void)();
      }
      this.eventHandlers.delete(openclawSessionKey);
    }
  }

  /**
   * Forward an event to OpenClaw
   *
   * Transforms Godel events to OpenClaw format and sends them
   * to the configured webhook URL.
   */
  private async forwardEvent(
    openclawSessionKey: string,
    dashAgentId: string,
    message: unknown
  ): Promise<void> {
    const event = this.transformEvent(openclawSessionKey, dashAgentId, message);

    // Emit locally
    this.emit('agent.event', event);

    // Forward to webhook if configured
    if (this.config.eventWebhookUrl) {
      try {
        await fetch(this.config.eventWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Godel-Event': 'true',
            'X-OpenClaw-Session': openclawSessionKey,
          },
          body: JSON.stringify(event),
        });
      } catch (error) {
        logger.error('[OpenClawAdapter] Failed to forward event to webhook:', error);
      }
    }
  }

  /**
   * Transform Godel event to OpenClaw format
   */
  private transformEvent(
    openclawSessionKey: string,
    dashAgentId: string,
    message: unknown
  ): OpenClawEvent {
    const msg = message as {
      id?: string;
      payload?: Record<string, unknown>;
      timestamp?: Date;
      metadata?: Record<string, unknown>;
    };

    return {
      source: 'dash',
      type: (msg.payload?.['eventType'] as string) || 'agent.update',
      timestamp: msg.timestamp || new Date(),
      sessionKey: openclawSessionKey,
      data: msg.payload || {},
      metadata: {
        dashAgentId,
        messageId: msg.id,
        ...msg.metadata,
      },
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get Godel agent ID for an OpenClaw session
   */
  getGodelAgentId(openclawSessionKey: string): string | undefined {
    return this.agentIdMap.get(openclawSessionKey);
  }

  /**
   * Get OpenClaw session key for a Godel agent
   */
  getOpenClawSessionKey(dashAgentId: string): string | undefined {
    return this.sessionKeyMap.get(dashAgentId);
  }

  /**
   * Check if a session has an active agent
   */
  hasAgent(openclawSessionKey: string): boolean {
    return this.agentIdMap.has(openclawSessionKey);
  }

  /**
   * Get adapter statistics
   */
  getStats(): {
    activeSessions: number;
    activeAgents: number;
    activeSwarms: number;
  } {
    return {
      activeSessions: this.agentIdMap.size,
      activeAgents: this.sessionKeyMap.size,
      activeSwarms: this.swarmIdMap.size,
    };
  }

  /**
   * Dispose of the adapter and clean up all resources
   */
  async dispose(): Promise<void> {
    logger.info('[OpenClawAdapter] Disposing adapter...');

    // Kill all active agents
    const sessions = Array.from(this.agentIdMap.keys());
    await Promise.all(
      sessions.map(async (key) => {
        try {
          await this.killAgent(key, true);
        } catch (error) {
          logger.warn('[OpenClawAdapter] Failed to kill agent during dispose', {
            sessionKey: key,
            error,
          });
        }
      })
    );

    // Clear all maps
    this.agentIdMap.clear();
    this.sessionKeyMap.clear();
    this.swarmIdMap.clear();
    this.agentMetadata.clear();
    this.eventHandlers.clear();

    logger.info('[OpenClawAdapter] Adapter disposed');
  }
}

// ============================================================================
// Event Types
// ============================================================================

export interface OpenClawEvent {
  /** Event source */
  source: 'dash';
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: Date;
  /** OpenClaw session key */
  sessionKey: string;
  /** Event data payload */
  data: Record<string, unknown>;
  /** Event metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalAdapter: OpenClawAdapter | null = null;

/**
 * Get or create the global OpenClaw adapter instance
 */
export function getOpenClawAdapter(config?: OpenClawAdapterConfig): OpenClawAdapter {
  if (!globalAdapter && config) {
    globalAdapter = new OpenClawAdapter(config);
  }

  if (!globalAdapter) {
    throw new ApplicationError(
      'OpenClawAdapter not initialized. Provide config on first call.',
      DashErrorCode.INITIALIZATION_FAILED,
      500,
      {}
    );
  }

  return globalAdapter;
}

/**
 * Reset the global adapter instance (for testing)
 */
export function resetOpenClawAdapter(): void {
  globalAdapter = null;
}

/**
 * Check if adapter is initialized
 */
export function isOpenClawAdapterInitialized(): boolean {
  return globalAdapter !== null;
}

export default OpenClawAdapter;
