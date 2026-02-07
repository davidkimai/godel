/**
 * Runtime Integration
 *
 * Integrates the federation system with the runtime registry.
 * Auto-registers agents when they are spawned via the runtime system.
 *
 * @module federation/runtime-integration
 */

import { EventEmitter } from 'events';
import { AgentRegistry, RegisteredAgent, AgentCapabilities } from './agent-registry';
import { getRuntimeRegistry } from '../runtime/registry';
import { Agent, AgentStatus } from '../runtime/types';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for runtime integration
 */
export interface RuntimeIntegrationConfig {
  /** Agent registry to use (defaults to global) */
  registry?: AgentRegistry;

  /** Auto-infer capabilities from runtime agent metadata */
  inferCapabilities?: boolean;

  /** Default capabilities for agents without metadata */
  defaultCapabilities?: Partial<AgentCapabilities>;

  /** Enable automatic heartbeat on spawn */
  autoHeartbeat?: boolean;

  /** Enable automatic status sync with runtime */
  syncStatus?: boolean;
}

/**
 * Map of runtime types to default capabilities
 */
const RUNTIME_CAPABILITIES: Record<string, Partial<AgentCapabilities>> = {
  pi: {
    skills: ['multi-model', 'coding', 'reasoning'],
    languages: ['typescript', 'javascript', 'python', 'rust', 'go'],
    specialties: ['general-purpose', 'multi-provider'],
    costPerHour: 3.0,
    avgSpeed: 15,
    reliability: 0.95,
  },
  native: {
    skills: ['native-execution', 'system-integration'],
    languages: ['typescript', 'javascript'],
    specialties: ['local-execution'],
    costPerHour: 2.0,
    avgSpeed: 10,
    reliability: 0.90,
  },
  openclaw: {
    skills: ['web-integration', 'async-processing'],
    languages: ['typescript', 'javascript'],
    specialties: ['remote-execution'],
    costPerHour: 2.5,
    avgSpeed: 12,
    reliability: 0.92,
  },
};

// ============================================================================
// Runtime Integration Class
// ============================================================================

/**
 * Runtime integration for auto-registering agents
 *
 * Listens to runtime events and automatically registers/unregisters
 * agents in the federation registry.
 *
 * @example
 * ```typescript
 * const integration = new RuntimeIntegration();
 * integration.enable();
 *
 * // Now when agents are spawned via runtime, they're auto-registered
 * const runtime = getRuntimeRegistry().getDefault();
 * const agent = await runtime.spawn({ name: 'my-agent' });
 *
 * // Agent is now in the federation registry
 * const registry = getAgentRegistry();
 * console.log(registry.has(agent.id)); // true
 * ```
 */
export class RuntimeIntegration extends EventEmitter {
  private config: Required<RuntimeIntegrationConfig>;
  private enabled = false;
  private runtimeRegistry = getRuntimeRegistry();
  private unbindFunctions: Array<() => void> = [];

  /**
   * Create a new RuntimeIntegration instance
   *
   * @param config - Integration configuration
   */
  constructor(config: RuntimeIntegrationConfig = {}) {
    super();

    const { getAgentRegistry } = require('./agent-registry');

    this.config = {
      registry: config.registry ?? getAgentRegistry(),
      inferCapabilities: config.inferCapabilities ?? true,
      defaultCapabilities: config.defaultCapabilities ?? {},
      autoHeartbeat: config.autoHeartbeat ?? true,
      syncStatus: config.syncStatus ?? true,
    };
  }

  /**
   * Enable runtime integration
   *
   * Starts listening to runtime events and auto-registering agents.
   */
  enable(): void {
    if (this.enabled) {
      return;
    }

    this.enabled = true;
    this.setupEventListeners();

    this.emit('enabled');
  }

  /**
   * Disable runtime integration
   *
   * Stops listening to runtime events.
   */
  disable(): void {
    if (!this.enabled) {
      return;
    }

    this.enabled = false;

    // Unbind all event listeners
    for (const unbind of this.unbindFunctions) {
      unbind();
    }
    this.unbindFunctions = [];

    this.emit('disabled');
  }

  /**
   * Check if integration is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the agent registry being used
   */
  getRegistry(): AgentRegistry {
    return this.config.registry;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Setup event listeners for all runtimes
   */
  private setupEventListeners(): void {
    // Get all registered runtimes
    const runtimes = this.runtimeRegistry.list();

    for (const runtime of runtimes) {
      this.attachToRuntime(runtime.id, runtime);
    }

    // Listen for new runtimes being registered
    // Note: This would require the runtime registry to emit events
    // For now, we'll check when spawn is called
  }

  /**
   * Attach event listeners to a specific runtime
   */
  private attachToRuntime(runtimeId: string, runtime: any): void {
    // Wrap the spawn method to intercept agent creation
    const originalSpawn = runtime.spawn.bind(runtime);

    runtime.spawn = async (...args: any[]) => {
      const agent = await originalSpawn(...args);
      this.handleAgentSpawned(runtimeId, agent);
      return agent;
    };

    // Store unbind function
    this.unbindFunctions.push(() => {
      runtime.spawn = originalSpawn;
    });

    // If the runtime has an EventEmitter interface, listen to events
    if (runtime instanceof EventEmitter || runtime.on) {
      const onSpawned = (agent: Agent) => this.handleAgentSpawned(runtimeId, agent);
      const onKilled = (agentId: string) => this.handleAgentKilled(agentId);
      const onStatusChanged = (agentId: string, previous: AgentStatus, current: AgentStatus) =>
        this.handleStatusChanged(agentId, current);

      runtime.on('agent.spawned', onSpawned);
      runtime.on('agent.killed', onKilled);
      runtime.on('agent.status_changed', onStatusChanged);

      this.unbindFunctions.push(() => {
        runtime.off('agent.spawned', onSpawned);
        runtime.off('agent.killed', onKilled);
        runtime.off('agent.status_changed', onStatusChanged);
      });
    }
  }

  /**
   * Handle agent spawned event
   */
  private handleAgentSpawned(runtimeId: string, agent: Agent): void {
    // Check if already registered
    if (this.config.registry.has(agent.id)) {
      return;
    }

    // Infer capabilities from runtime type and agent metadata
    const capabilities = this.inferCapabilities(runtimeId, agent);

    // Register the agent
    const registeredAgent = this.config.registry.register({
      id: agent.id,
      runtime: runtimeId,
      status: this.mapRuntimeStatus(agent.status),
      capabilities,
      currentLoad: 0,
      metadata: {
        ...agent.metadata,
        name: agent.name,
        model: agent.model,
        pid: agent.pid,
        createdAt: agent.createdAt,
      },
    });

    // Auto heartbeat if enabled
    if (this.config.autoHeartbeat) {
      this.config.registry.heartbeat(agent.id);
    }

    this.emit('agent.registered', registeredAgent);
  }

  /**
   * Handle agent killed event
   */
  private handleAgentKilled(agentId: string): void {
    if (!this.config.registry.has(agentId)) {
      return;
    }

    this.config.registry.unregister(agentId);
    this.emit('agent.unregistered', agentId);
  }

  /**
   * Handle status changed event
   */
  private handleStatusChanged(agentId: string, status: AgentStatus): void {
    if (!this.config.registry.has(agentId)) {
      return;
    }

    if (this.config.syncStatus) {
      const mappedStatus = this.mapRuntimeStatus(status);
      this.config.registry.updateStatus(agentId, mappedStatus);
    }

    this.emit('agent.status_changed', agentId, status);
  }

  /**
   * Infer capabilities from runtime type and agent metadata
   */
  private inferCapabilities(runtimeId: string, agent: Agent): AgentCapabilities {
    const runtimeDefaults = RUNTIME_CAPABILITIES[runtimeId] ?? {};
    const metadataCapabilities = this.extractCapabilitiesFromMetadata(agent.metadata);

    return {
      skills: metadataCapabilities.skills ?? runtimeDefaults.skills ?? ['general'],
      languages: metadataCapabilities.languages ?? runtimeDefaults.languages ?? ['typescript'],
      specialties: metadataCapabilities.specialties ?? runtimeDefaults.specialties ?? ['general-purpose'],
      costPerHour: metadataCapabilities.costPerHour ?? runtimeDefaults.costPerHour ?? 2.5,
      avgSpeed: metadataCapabilities.avgSpeed ?? runtimeDefaults.avgSpeed ?? 10,
      reliability: metadataCapabilities.reliability ?? runtimeDefaults.reliability ?? 0.95,
    };
  }

  /**
   * Extract capabilities from agent metadata
   */
  private extractCapabilitiesFromMetadata(
    metadata: Record<string, unknown> | undefined
  ): Partial<AgentCapabilities> {
    if (!metadata) {
      return {};
    }

    return {
      skills: this.parseArray(metadata['skills']) ?? this.parseArray(metadata['capabilities']),
      languages: this.parseArray(metadata['languages']) ?? this.parseArray(metadata['programmingLanguages']),
      specialties: this.parseArray(metadata['specialties']) ?? this.parseArray(metadata['expertise']),
      costPerHour: this.parseNumber(metadata['costPerHour']) ?? this.parseNumber(metadata['hourlyRate']),
      avgSpeed: this.parseNumber(metadata['avgSpeed']) ?? this.parseNumber(metadata['tasksPerHour']),
      reliability: this.parseNumber(metadata['reliability']) ?? this.parseNumber(metadata['successRate']),
    };
  }

  /**
   * Parse array from metadata value
   */
  private parseArray(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value === 'string') {
      return value.split(',').map(s => s.trim());
    }
    return undefined;
  }

  /**
   * Parse number from metadata value
   */
  private parseNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  /**
   * Map runtime status to registry status
   */
  private mapRuntimeStatus(runtimeStatus: AgentStatus): import('./agent-registry').AgentStatus {
    switch (runtimeStatus) {
      case 'pending':
        return 'idle';
      case 'running':
        return 'busy';
      case 'error':
        return 'unhealthy';
      case 'stopped':
        return 'offline';
      default:
        return 'idle';
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Global integration instance */
let globalIntegration: RuntimeIntegration | null = null;

/**
 * Get or create the global runtime integration
 */
function getGlobalIntegration(): RuntimeIntegration {
  if (!globalIntegration) {
    globalIntegration = new RuntimeIntegration();
  }
  return globalIntegration;
}

/**
 * Enable runtime integration globally
 *
 * Auto-registers agents spawned via the runtime system.
 */
export function enableRuntimeIntegration(config?: RuntimeIntegrationConfig): RuntimeIntegration {
  const integration = new RuntimeIntegration(config);
  integration.enable();

  // Store as global if no config overrides
  if (!config) {
    globalIntegration = integration;
  }

  return integration;
}

/**
 * Disable runtime integration globally
 */
export function disableRuntimeIntegration(): void {
  if (globalIntegration) {
    globalIntegration.disable();
    globalIntegration = null;
  }
}

/**
 * Check if runtime integration is enabled globally
 */
export function isRuntimeIntegrationEnabled(): boolean {
  return globalIntegration?.isEnabled() ?? false;
}
