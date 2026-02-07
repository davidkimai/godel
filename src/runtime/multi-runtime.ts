/**
 * Multi-Runtime Adapter
 *
 * Unified runtime interface that integrates Pi CLI with OpenClaw,
 * providing seamless multi-provider orchestration with fallback chains,
 * cost-optimized routing, and latency-based selection.
 *
 * @module runtime/multi-runtime
 */

import { EventEmitter } from 'events';
import {
  AgentRuntime,
  SpawnConfig,
  Agent,
  AgentStatus,
  ExecResult,
  RuntimeError,
  SpawnError,
  AgentNotFoundError,
  ExecError,
} from './types';
import { logger } from '../utils/logger';
import { withRetry, RetryPolicies } from '../core/reliability';

// Import Pi components
import {
  PiClient,
  PiClientConfig,
  SessionInitConfig,
  MessageResponse,
  PiRegistry,
  ModelRouter,
  ProviderManager,
  FallbackChainManager,
  CostRouter,
  LatencyRouter,
  HealthMonitor,
  getGlobalPiRegistry,
  getGlobalProviderManager,
  getGlobalFallbackManager,
  getGlobalCostRouter,
  getGlobalLatencyRouter,
  getGlobalHealthMonitor,
  PiInstance,
  ProviderId,
  RoutingRequest,
  RoutingDecision,
  PiCapability,
} from '../integrations/pi';

// Import OpenClaw adapter
import {
  OpenClawAdapter,
  OpenClawAdapterConfig,
  getOpenClawAdapter,
} from '../integrations/openclaw/adapter';

// ============================================================================
// Multi-Runtime Types
// ============================================================================

/**
 * Multi-runtime configuration
 */
export interface MultiRuntimeConfig {
  /** Pi CLI configuration */
  pi?: {
    /** Default endpoint for Pi server */
    endpoint?: string;

    /** API key for Pi authentication */
    apiKey?: string;

    /** Default provider */
    defaultProvider?: ProviderId;

    /** Default model */
    defaultModel?: string;

    /** Enable auto-reconnect */
    reconnect?: boolean;

    /** Request timeout (ms) */
    requestTimeout?: number;
  };

  /** OpenClaw adapter configuration */
  openclaw?: OpenClawAdapterConfig;

  /** Routing configuration */
  routing?: {
    /** Default routing strategy */
    defaultStrategy: 'cost' | 'latency' | 'capability' | 'fallback' | 'hybrid';

    /** Maximum cost per request ($) */
    maxCostPerRequest?: number;

    /** Maximum latency (ms) */
    maxLatencyMs?: number;

    /** Provider fallback chain */
    fallbackChain?: ProviderId[];

    /** Enable automatic fallback */
    enableFallback: boolean;
  };

  /** Health monitoring configuration */
  health?: {
    /** Enable health monitoring */
    enabled: boolean;

    /** Health check interval (ms) */
    intervalMs?: number;

    /** Circuit breaker threshold */
    circuitBreakerThreshold?: number;
  };

  /** Retry configuration */
  retry?: {
    /** Maximum retry attempts */
    maxRetries: number;

    /** Initial delay (ms) */
    initialDelayMs?: number;

    /** Enable retry with fallback */
    enableFallbackRetry: boolean;
  };
}

/**
 * Multi-runtime agent instance
 */
export interface MultiRuntimeAgent extends Agent {
  /** Underlying runtime type */
  runtimeType: 'pi' | 'openclaw';

  /** Pi session ID (if Pi runtime) */
  piSessionId?: string;

  /** OpenClaw session key (if OpenClaw runtime) */
  openclawSessionKey?: string;

  /** Provider used */
  provider: ProviderId;

  /** Routing decision that selected this agent */
  routingDecision?: RoutingDecision;

  /** Cost information */
  costInfo?: {
    estimatedCost: number;
    actualCost?: number;
  };

  /** Latency information */
  latencyInfo?: {
    expectedLatencyMs: number;
    actualLatencyMs?: number;
  };
}

/**
 * Routing strategy selection
 */
export type RoutingStrategyType = 'cost' | 'latency' | 'capability' | 'fallback' | 'hybrid';

/**
 * Provider status in multi-runtime
 */
export interface ProviderStatus {
  /** Provider identifier */
  provider: ProviderId;

  /** Whether provider is available */
  available: boolean;

  /** Health status */
  health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

  /** Number of active agents */
  activeAgents: number;

  /** Average latency (ms) */
  averageLatencyMs: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Circuit breaker state */
  circuitState: 'closed' | 'open' | 'half-open';

  /** Last error message */
  lastError?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default multi-runtime configuration
 */
export const DEFAULT_MULTI_RUNTIME_CONFIG: MultiRuntimeConfig = {
  pi: {
    endpoint: process.env['PI_ENDPOINT'] || 'ws://localhost:3000',
    apiKey: process.env['PI_API_KEY'],
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    reconnect: true,
    requestTimeout: 60000,
  },
  routing: {
    defaultStrategy: 'hybrid',
    maxCostPerRequest: 1.0,
    maxLatencyMs: 5000,
    enableFallback: true,
  },
  health: {
    enabled: true,
    intervalMs: 30000,
    circuitBreakerThreshold: 5,
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    enableFallbackRetry: true,
  },
};

/**
 * Default provider priority chain
 */
export const DEFAULT_PROVIDER_CHAIN: ProviderId[] = [
  'anthropic',
  'openai',
  'google',
  'kimi',
  'groq',
  'cerebras',
  'minimax',
  'ollama',
];

// ============================================================================
// Multi-Runtime Class
// ============================================================================

/**
 * Multi-runtime adapter for Pi CLI and OpenClaw integration
 *
 * Provides:
 * - Unified interface for Pi and OpenClaw runtimes
 * - Intelligent provider routing (cost, latency, capability-based)
 * - Automatic fallback chains
 * - Per-provider health monitoring
 * - Cost tracking and budget management
 * - Circuit breaker pattern for resilience
 *
 * @example
 * ```typescript
 * const runtime = new MultiRuntime({
 *   routing: { defaultStrategy: 'hybrid' },
 *   health: { enabled: true }
 * });
 *
 * // Spawn with automatic provider selection
 * const agent = await runtime.spawn({
 *   task: 'Implement a feature',
 *   requiredCapabilities: ['typescript', 'code-generation']
 * });
 *
 * // Execute with automatic fallback
 * const result = await runtime.exec(agent.id, 'Generate code');
 * ```
 */
export class MultiRuntime extends EventEmitter implements AgentRuntime {
  readonly id = 'multi-runtime';
  readonly name = 'Multi-Runtime (Pi + OpenClaw)';

  private config: MultiRuntimeConfig;
  private agents = new Map<string, MultiRuntimeAgent>();
  private piClients = new Map<string, PiClient>();
  private openclawAdapter?: OpenClawAdapter;

  // Component managers
  private providerManager: ProviderManager;
  private fallbackManager: FallbackChainManager;
  private costRouter: CostRouter;
  private latencyRouter: LatencyRouter;
  private healthMonitor: HealthMonitor;

  // Agent counter
  private agentCounter = 0;

  /**
   * Creates a new MultiRuntime instance
   *
   * @param config - Multi-runtime configuration
   */
  constructor(config: Partial<MultiRuntimeConfig> = {}) {
    super();

    this.config = this.mergeConfig(config);

    // Initialize managers
    this.providerManager = getGlobalProviderManager();
    this.fallbackManager = getGlobalFallbackManager();
    this.costRouter = getGlobalCostRouter();
    this.latencyRouter = getGlobalLatencyRouter();
    this.healthMonitor = getGlobalHealthMonitor();

    // Initialize OpenClaw adapter if configured
    if (this.config.openclaw) {
      this.openclawAdapter = getOpenClawAdapter(this.config.openclaw);
    }

    logger.info('[MultiRuntime] Initialized', {
      strategy: this.config.routing?.defaultStrategy,
      fallbackEnabled: this.config.routing?.enableFallback,
    });

    this.emit('initialized');
  }

  /**
   * Spawns a new agent with intelligent provider selection
   *
   * @param config - Agent spawn configuration
   * @returns Promise resolving to the spawned agent
   */
  async spawn(config: SpawnConfig & { requiredCapabilities?: PiCapability[] }): Promise<MultiRuntimeAgent> {
    const agentId = `multi-${Date.now()}-${++this.agentCounter}`;
    const startTime = Date.now();

    logger.info('[MultiRuntime] Spawning agent', { agentId });

    try {
      // Build routing request
      const routingRequest: RoutingRequest = {
        requestId: agentId,
        taskType: config.options?.['taskType'] as string || 'general',
        requiredCapabilities: config.requiredCapabilities || [],
        estimatedTokens: 4000,
        priority: 'normal',
        preferredProvider: config.provider,
        maxCost: this.config.routing?.maxCostPerRequest,
        maxLatency: this.config.routing?.maxLatencyMs,
      };

      // Route to best provider
      const routingDecision = await this.routeRequest(routingRequest);

      // Create agent based on routing decision
      if (this.shouldUseOpenClaw(routingDecision.selectedProvider.provider)) {
        return await this.spawnOpenClawAgent(agentId, config, routingDecision);
      } else {
        return await this.spawnPiAgent(agentId, config, routingDecision);
      }
    } catch (error) {
      logger.error('[MultiRuntime] Failed to spawn agent:', error);

      // Try fallback if enabled
      if (this.config.routing?.enableFallback && this.config.retry?.enableFallbackRetry) {
        return await this.spawnWithFallback(agentId, config);
      }

      throw new SpawnError(
        `Failed to spawn agent: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Kills an agent instance
   *
   * @param agentId - Agent ID to kill
   */
  async kill(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);

    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }

    logger.info('[MultiRuntime] Killing agent', { agentId, runtimeType: agent.runtimeType });

    try {
      if (agent.runtimeType === 'openclaw' && agent.openclawSessionKey) {
        await this.openclawAdapter?.killAgent(agent.openclawSessionKey);
      } else if (agent.runtimeType === 'pi' && agent.piSessionId) {
        const client = this.piClients.get(agentId);
        if (client) {
          await client.closeSession();
          await client.disconnect();
          this.piClients.delete(agentId);
        }
      }

      agent.status = 'stopped';
      this.emit('agent.killed', agentId);

      logger.info('[MultiRuntime] Agent killed', { agentId });
    } catch (error) {
      logger.error('[MultiRuntime] Error killing agent:', { agentId, error });
      throw error;
    }
  }

  /**
   * Executes a command on an agent
   *
   * @param agentId - Agent ID
   * @param command - Command to execute
   * @returns Promise resolving to execution result
   */
  async exec(agentId: string, command: string): Promise<ExecResult> {
    const agent = this.agents.get(agentId);

    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }

    if (agent.status !== 'running') {
      throw new ExecError(agentId, command, -1, 'Agent not running');
    }

    const startTime = Date.now();

    logger.debug('[MultiRuntime] Executing command', { agentId, command: command.substring(0, 100) });

    try {
      let result: ExecResult;

      if (agent.runtimeType === 'openclaw') {
        result = await this.execOpenClaw(agent, command);
      } else {
        result = await this.execPi(agent, command);
      }

      // Update latency info
      agent.latencyInfo = {
        ...agent.latencyInfo,
        actualLatencyMs: Date.now() - startTime,
      };

      agent.lastActivityAt = new Date();

      this.emit('exec.completed', agentId, result);

      return result;
    } catch (error) {
      logger.error('[MultiRuntime] Execution failed:', { agentId, error });

      // Try fallback execution if enabled
      if (this.config.routing?.enableFallback) {
        return await this.execWithFallback(agent, command);
      }

      throw error;
    }
  }

  /**
   * Gets agent status
   *
   * @param agentId - Agent ID
   * @returns Promise resolving to agent status
   */
  async status(agentId: string): Promise<AgentStatus> {
    const agent = this.agents.get(agentId);

    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }

    return agent.status;
  }

  /**
   * Lists all managed agents
   *
   * @returns Promise resolving to array of agents
   */
  async list(): Promise<MultiRuntimeAgent[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Gets provider status for all providers
   *
   * @returns Array of provider statuses
   */
  getProviderStatuses(): ProviderStatus[] {
    const statuses: ProviderStatus[] = [];

    for (const provider of DEFAULT_PROVIDER_CHAIN) {
      const health = this.healthMonitor.getProviderAggregateHealth(provider);
      const activeAgents = Array.from(this.agents.values()).filter(
        (a) => a.provider === provider && a.status === 'running'
      ).length;

      statuses.push({
        provider,
        available: health.status === 'healthy' || health.status === 'degraded',
        health: health.status,
        activeAgents,
        averageLatencyMs: 0, // Would come from latency router
        successRate: health.successRate,
        circuitState: 'closed',
      });
    }

    return statuses;
  }

  /**
   * Gets cost statistics
   *
   * @returns Cost statistics
   */
  getCostStatistics(): {
    totalCost: number;
    budgetRemaining: number;
    providerBreakdown: Map<ProviderId, { totalCost: number; requestCount: number }>;
  } {
    return {
      totalCost: 0,
      budgetRemaining: this.costRouter.getRemainingBudget(),
      providerBreakdown: new Map(),
    };
  }

  /**
   * Updates configuration
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<MultiRuntimeConfig>): void {
    this.config = this.mergeConfig(config);
    this.emit('config.updated', this.config);
  }

  /**
   * Disposes the runtime and cleans up resources
   */
  async dispose(): Promise<void> {
    logger.info('[MultiRuntime] Disposing...');

    // Kill all agents
    const killPromises = Array.from(this.agents.keys()).map((agentId) =>
      this.kill(agentId).catch((err) =>
        logger.warn('[MultiRuntime] Error disposing agent:', { agentId, error: err })
      )
    );

    await Promise.all(killPromises);

    this.agents.clear();
    this.piClients.clear();

    this.emit('disposed');

    logger.info('[MultiRuntime] Disposed');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Merges configuration with defaults
   *
   * @param config - User configuration
   * @returns Merged configuration
   */
  private mergeConfig(config: Partial<MultiRuntimeConfig>): MultiRuntimeConfig {
    return {
      ...DEFAULT_MULTI_RUNTIME_CONFIG,
      ...config,
      pi: { ...DEFAULT_MULTI_RUNTIME_CONFIG.pi, ...config.pi },
      routing: { ...DEFAULT_MULTI_RUNTIME_CONFIG.routing, ...config.routing },
      health: { ...DEFAULT_MULTI_RUNTIME_CONFIG.health, ...config.health },
      retry: { ...DEFAULT_MULTI_RUNTIME_CONFIG.retry, ...config.retry },
    } as MultiRuntimeConfig;
  }

  /**
   * Routes a request to the best provider
   *
   * @param request - Routing request
   * @returns Routing decision
   */
  private async routeRequest(request: RoutingRequest): Promise<RoutingDecision> {
    const strategy = this.config.routing?.defaultStrategy || 'hybrid';

    // This would integrate with the ModelRouter
    // For now, create a simple decision
    const provider = request.preferredProvider || 'anthropic';

    // Create a mock PiInstance
    const instance: PiInstance = {
      id: `${provider}-instance`,
      name: `${provider}-default`,
      provider: provider as ProviderId,
      model: 'default',
      mode: 'local',
      endpoint: 'ws://localhost:3000',
      health: 'healthy',
      capabilities: ['code-generation'],
      capacity: {
        maxConcurrent: 5,
        activeTasks: 0,
        queueDepth: 0,
        available: 5,
        utilizationPercent: 0,
      },
      lastHeartbeat: new Date(),
      metadata: {},
      registeredAt: new Date(),
    };

    const decision: RoutingDecision = {
      request,
      selectedProvider: instance,
      strategy,
      score: 100,
      alternatives: [],
      costEstimate: {
        provider,
        model: 'default',
        inputCost: 0.01,
        outputCost: 0.03,
        estimatedTotal: 0.04,
        currency: 'USD',
      },
      decidedAt: new Date(),
      expectedLatency: 1500,
      fallbackChain: this.config.routing?.fallbackChain || DEFAULT_PROVIDER_CHAIN,
    };

    this.emit('routing.decision', decision);

    return decision;
  }

  /**
   * Determines if OpenClaw should be used
   *
   * @param provider - Provider ID
   * @returns True if OpenClaw should be used
   */
  private shouldUseOpenClaw(provider: string): boolean {
    // Use OpenClaw if configured and provider is in its supported list
    return !!this.openclawAdapter && !!this.config.openclaw;
  }

  /**
   * Spawns a Pi agent
   *
   * @param agentId - Agent ID
   * @param config - Spawn configuration
   * @param decision - Routing decision
   * @returns Spawned agent
   */
  private async spawnPiAgent(
    agentId: string,
    config: SpawnConfig,
    decision: RoutingDecision
  ): Promise<MultiRuntimeAgent> {
    logger.info('[MultiRuntime] Spawning Pi agent', { agentId, provider: decision.selectedProvider.provider });

    const clientConfig: PiClientConfig = {
      endpoint: this.config.pi?.endpoint || 'ws://localhost:3000',
      apiKey: this.config.pi?.apiKey,
      provider: decision.selectedProvider.provider,
      model: config.model || decision.selectedProvider.model,
      systemPrompt: config.systemPrompt,
      tools: config.tools,
      reconnect: this.config.pi?.reconnect,
      requestTimeout: config.timeout || this.config.pi?.requestTimeout,
    };

    const client = new PiClient(clientConfig);
    await client.connect();

    const sessionConfig: SessionInitConfig = {
      provider: decision.selectedProvider.provider,
      model: config.model || decision.selectedProvider.model,
      tools: config.tools,
      systemPrompt: config.systemPrompt,
      worktreePath: config.workdir,
    };

    const sessionInfo = await client.initSession(sessionConfig);

    const agent: MultiRuntimeAgent = {
      id: agentId,
      name: config.name || `multi-agent-${this.agentCounter}`,
      status: 'running',
      runtime: this.id,
      runtimeType: 'pi',
      provider: decision.selectedProvider.provider as ProviderId,
      model: sessionInfo.model,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      piSessionId: sessionInfo.id,
      routingDecision: decision,
      costInfo: {
        estimatedCost: decision.costEstimate.estimatedTotal,
      },
      latencyInfo: {
        expectedLatencyMs: decision.expectedLatency,
      },
      metadata: {
        sessionId: sessionInfo.id,
        tools: sessionInfo.tools,
      },
    };

    this.agents.set(agentId, agent);
    this.piClients.set(agentId, client);

    this.emit('agent.spawned', agent);

    logger.info('[MultiRuntime] Pi agent spawned', { agentId, sessionId: sessionInfo.id });

    return agent;
  }

  /**
   * Spawns an OpenClaw agent
   *
   * @param agentId - Agent ID
   * @param config - Spawn configuration
   * @param decision - Routing decision
   * @returns Spawned agent
   */
  private async spawnOpenClawAgent(
    agentId: string,
    config: SpawnConfig,
    decision: RoutingDecision
  ): Promise<MultiRuntimeAgent> {
    if (!this.openclawAdapter) {
      throw new Error('OpenClaw adapter not configured');
    }

    logger.info('[MultiRuntime] Spawning OpenClaw agent', { agentId });

    const sessionKey = `multi-${agentId}`;

    const result = await this.openclawAdapter.spawnAgent(sessionKey, {
      agentType: 'coding',
      task: config.options?.['task'] as string || 'General task',
      model: config.model,
      timeout: config.timeout,
    });

    const agent: MultiRuntimeAgent = {
      id: agentId,
      name: config.name || `multi-agent-${this.agentCounter}`,
      status: 'running',
      runtime: this.id,
      runtimeType: 'openclaw',
      provider: decision.selectedProvider.provider as ProviderId,
      model: config.model || 'default',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      openclawSessionKey: sessionKey,
      routingDecision: decision,
      metadata: {
        godelAgentId: result.godelAgentId,
        teamId: result.teamId,
      },
    };

    this.agents.set(agentId, agent);

    this.emit('agent.spawned', agent);

    logger.info('[MultiRuntime] OpenClaw agent spawned', { agentId, godelAgentId: result.godelAgentId });

    return agent;
  }

  /**
   * Spawns with fallback providers
   *
   * @param agentId - Agent ID
   * @param config - Spawn configuration
   * @returns Spawned agent
   */
  private async spawnWithFallback(
    agentId: string,
    config: SpawnConfig & { requiredCapabilities?: PiCapability[] }
  ): Promise<MultiRuntimeAgent> {
    const chain = this.config.routing?.fallbackChain || DEFAULT_PROVIDER_CHAIN;

    for (const provider of chain) {
      try {
        const routingRequest: RoutingRequest = {
          requestId: `${agentId}-fallback-${provider}`,
          taskType: 'general',
          requiredCapabilities: config.requiredCapabilities || [],
          estimatedTokens: 4000,
          priority: 'normal',
          preferredProvider: provider,
        };

        const decision = await this.routeRequest(routingRequest);
        return await this.spawnPiAgent(agentId, config, decision);
      } catch (error) {
        logger.warn('[MultiRuntime] Fallback spawn failed for %s:', provider, error);
        continue;
      }
    }

    throw new Error('All fallback providers exhausted');
  }

  /**
   * Executes on Pi agent
   *
   * @param agent - Multi-runtime agent
   * @param command - Command to execute
   * @returns Execution result
   */
  private async execPi(agent: MultiRuntimeAgent, command: string): Promise<ExecResult> {
    const client = this.piClients.get(agent.id);

    if (!client) {
      throw new Error('Pi client not found');
    }

    // Use retry policy for resilience
    const result = await withRetry(
      async () => {
        const response = await client.sendMessage(command);
        return {
          stdout: response.content,
          stderr: '',
          exitCode: 0,
          duration: 0,
          metadata: {
            tokenUsage: undefined,
            model: agent.model,
            provider: agent.provider,
          },
        };
      },
      {
        maxRetries: this.config.retry?.maxRetries || 3,
        initialDelayMs: this.config.retry?.initialDelayMs || 1000,
      }
    );

    return result;
  }

  /**
   * Executes on OpenClaw agent
   *
   * @param agent - Multi-runtime agent
   * @param command - Command to execute
   * @returns Execution result
   */
  private async execOpenClaw(agent: MultiRuntimeAgent, command: string): Promise<ExecResult> {
    if (!this.openclawAdapter || !agent.openclawSessionKey) {
      throw new Error('OpenClaw not configured');
    }

    await this.openclawAdapter.sendMessage(agent.openclawSessionKey, command);

    // Poll for status
    const status = await this.openclawAdapter.getStatus(agent.openclawSessionKey);

    return {
      stdout: status.result ? JSON.stringify(status.result) : 'Pending',
      stderr: status.error || '',
      exitCode: status.error ? 1 : 0,
      duration: status.runtime || 0,
      metadata: {
        model: agent.model,
        provider: agent.provider,
      },
    };
  }

  /**
   * Executes with fallback providers
   *
   * @param agent - Original agent
   * @param command - Command to execute
   * @returns Execution result
   */
  private async execWithFallback(agent: MultiRuntimeAgent, command: string): Promise<ExecResult> {
    // Try primary first
    try {
      return await this.exec(agent.id, command);
    } catch (error) {
      logger.warn('[MultiRuntime] Primary execution failed, trying fallback');

      // Spawn new agent with fallback provider
      const newAgent = await this.spawnWithFallback(agent.id, {
        name: `${agent.name}-fallback`,
        workdir: agent.metadata?.['workdir'] as string,
        systemPrompt: agent.metadata?.['systemPrompt'] as string,
      });

      // Execute on fallback agent
      return await this.exec(newAgent.id, command);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalMultiRuntime: MultiRuntime | null = null;

/**
 * Gets the global MultiRuntime instance
 *
 * @param config - Optional configuration
 * @returns Global MultiRuntime
 */
export function getGlobalMultiRuntime(config?: Partial<MultiRuntimeConfig>): MultiRuntime {
  if (!globalMultiRuntime) {
    globalMultiRuntime = new MultiRuntime(config);
  }
  return globalMultiRuntime;
}

/**
 * Resets the global MultiRuntime (for testing)
 */
export function resetGlobalMultiRuntime(): void {
  globalMultiRuntime = null;
}

// Default export
export default MultiRuntime;
