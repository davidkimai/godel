/**
 * Pi Registry
 *
 * Discovers, monitors, and manages Pi instances across different deployment modes.
 * Provides instance registration, health monitoring, capacity tracking, and intelligent
 * instance selection with routing logic.
 *
 * @example
 * ```typescript
 * const registry = new PiRegistry({
 *   discoveryStrategies: [
 *     { type: 'static', instances: [...] },
 *     { type: 'openclaw-gateway', gatewayUrl: 'ws://localhost:18789' }
 *   ],
 *   healthMonitoring: { enabled: true, intervalMs: 30000 }
 * });
 *
 * await registry.discoverInstances();
 * const instance = registry.selectInstance({ preferredProvider: 'anthropic' });
 * ```
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  // Core types
  PiInstance,
  HealthStatus,
  InstanceCapacity,
  ProviderId,
  PiCapability,
  DeploymentMode,

  // Discovery types
  DiscoveryStrategy,
  DiscoveryStrategyType,
  StaticDiscoveryConfig,
  OpenClawDiscoveryConfig,
  KubernetesDiscoveryConfig,
  AutoSpawnDiscoveryConfig,
  SpawnConfig,

  // Configuration
  PiRegistryConfig,

  // Selection types
  SelectionCriteria,
  CapacityReport,
  ProviderCapacity,
  RegionCapacity,

  // Errors
  PiRegistryError,
  InstanceNotFoundError,
  DiscoveryError,

  // Defaults
  DEFAULT_INSTANCE_CAPACITY,
  DEFAULT_HEALTH_MONITORING,
  DEFAULT_CIRCUIT_BREAKER,
} from './types';

// ============================================================================
// Circuit Breaker for Health Checks
// ============================================================================

/**
 * Circuit breaker state for external calls
 */
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number | null;
  state: 'closed' | 'open' | 'half-open';
}

// ============================================================================
// PiRegistry Class
// ============================================================================

/**
 * Registry for managing Pi instances across different deployment modes.
 *
 * The PiRegistry provides:
 * - Multi-strategy instance discovery (static, OpenClaw Gateway, Kubernetes, auto-spawn)
 * - Health monitoring with automatic cleanup of unhealthy instances
 * - Capacity tracking and load balancing
 * - Intelligent instance selection with multiple routing strategies
 * - Event-driven architecture for instance lifecycle changes
 *
 * Events emitted:
 * - 'instance.registered' - When a new instance is registered (payload: PiInstance)
 * - 'instance.unregistered' - When an instance is unregistered (payload: instanceId, reason)
 * - 'instance.health_changed' - When instance health status changes (payload: instanceId, previousHealth, newHealth)
 * - 'instance.failed' - When an instance fails health check (payload: instanceId, error)
 * - 'capacity.changed' - When overall capacity changes significantly (payload: CapacityReport)
 * - 'discovery.completed' - When discovery completes (payload: strategy, instancesFound)
 * - 'discovery.failed' - When discovery fails (payload: strategy, error)
 */
export class PiRegistry extends EventEmitter {
  /** Map of registered instances by ID */
  private instances: Map<string, PiInstance> = new Map();

  /** Registry configuration */
  private config: PiRegistryConfig;

  /** Health monitoring interval handle */
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /** Circuit breakers for external calls */
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  /** Track instances pending removal */
  private pendingRemovals: Map<string, NodeJS.Timeout> = new Map();

  /** Round-robin counter for selection */
  private roundRobinIndex: number = 0;

  /** Last capacity report for change detection */
  private lastCapacityReport: CapacityReport | null = null;

  /**
   * Creates a new PiRegistry instance.
   *
   * @param config - Registry configuration with discovery strategies and health monitoring settings
   */
  constructor(config: PiRegistryConfig) {
    super();
    this.config = this.normalizeConfig(config);
    logger.info('[PiRegistry] Initialized with %d discovery strategies', config.discoveryStrategies.length);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Normalizes the registry configuration with defaults.
   *
   * @param config - Raw configuration
   * @returns Normalized configuration
   */
  private normalizeConfig(config: PiRegistryConfig): PiRegistryConfig {
    return {
      discoveryStrategies: config.discoveryStrategies,
      healthMonitoring: {
        ...DEFAULT_HEALTH_MONITORING,
        ...config.healthMonitoring,
      },
      defaults: {
        capacity: { ...DEFAULT_INSTANCE_CAPACITY, ...config.defaults?.capacity },
        capabilities: config.defaults?.capabilities || [],
        region: config.defaults?.region || 'default',
      },
      circuitBreaker: {
        ...DEFAULT_CIRCUIT_BREAKER,
        ...config.circuitBreaker,
      },
    };
  }

  /**
   * Updates the registry configuration.
   *
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<PiRegistryConfig>): void {
    this.config = this.normalizeConfig({ ...this.config, ...config });
    logger.info('[PiRegistry] Configuration updated');
  }

  // ============================================================================
  // Discovery Methods
  // ============================================================================

  /**
   * Discovers Pi instances using the configured strategies.
   *
   * Iterates through all configured discovery strategies and aggregates
   * discovered instances. Optionally auto-registers instances if configured.
   *
   * @param strategy - Optional specific strategy to use (uses all if not specified)
   * @returns Array of discovered Pi instances
   * @throws {DiscoveryError} If all discovery strategies fail
   */
  async discoverInstances(strategy?: DiscoveryStrategy): Promise<PiInstance[]> {
    const strategies = strategy ? [strategy] : this.config.discoveryStrategies;
    const allDiscovered: PiInstance[] = [];
    const errors: Error[] = [];

    for (const strat of strategies) {
      try {
        const startTime = Date.now();
        const instances = await this.executeDiscoveryStrategy(strat);
        const duration = Date.now() - startTime;

        logger.info(
          '[PiRegistry] Discovered %d instances via %s strategy in %dms',
          instances.length,
          strat.type,
          duration
        );

        // Auto-register if configured
        if (strat.autoRegister !== false) {
          for (const instance of instances) {
            this.register(instance);
          }
        }

        allDiscovered.push(...instances);
        this.emit('discovery.completed', strat.type, instances.length);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('[PiRegistry] Discovery failed for strategy %s: %s', strat.type, err.message);
        errors.push(err);
        this.emit('discovery.failed', strat.type, err);
      }
    }

    if (allDiscovered.length === 0 && errors.length > 0) {
      throw new DiscoveryError(strategies[0]?.type || 'static', 'All discovery strategies failed', errors[0]);
    }

    return allDiscovered;
  }

  /**
   * Executes a specific discovery strategy.
   *
   * @param strategy - Discovery strategy configuration
   * @returns Array of discovered instances
   */
  private async executeDiscoveryStrategy(strategy: DiscoveryStrategy): Promise<PiInstance[]> {
    switch (strategy.type) {
      case 'static':
        return this.discoverFromStaticConfig(strategy);
      case 'openclaw-gateway':
        return this.discoverFromOpenClawGateway(strategy);
      case 'kubernetes':
        return this.discoverFromKubernetes(strategy);
      case 'auto-spawn':
        return this.autoSpawnInstances(strategy);
      default: {
        // Exhaustiveness check
        const _exhaustiveCheck: never = strategy;
        throw new DiscoveryError('static', `Unknown discovery strategy type`);
      }
    }
  }

  /**
   * Discovers instances from static configuration.
   *
   * @param config - Static discovery configuration
   * @returns Array of Pi instances from configuration
   */
  private async discoverFromStaticConfig(config: StaticDiscoveryConfig): Promise<PiInstance[]> {
    const now = new Date();

    return config.instances.map((instanceConfig) => ({
      id: instanceConfig.id,
      name: instanceConfig.name,
      provider: instanceConfig.provider,
      model: instanceConfig.model,
      mode: 'local' as DeploymentMode,
      endpoint: instanceConfig.endpoint,
      health: 'unknown' as HealthStatus,
      capabilities: instanceConfig.capabilities || this.config.defaults?.capabilities || [],
      region: instanceConfig.region || this.config.defaults?.region,
      capacity: {
        ...DEFAULT_INSTANCE_CAPACITY,
        ...instanceConfig.capacity,
        available: (instanceConfig.capacity?.maxConcurrent || DEFAULT_INSTANCE_CAPACITY.maxConcurrent) -
                   (instanceConfig.capacity?.activeTasks || DEFAULT_INSTANCE_CAPACITY.activeTasks),
        utilizationPercent: 0,
      },
      lastHeartbeat: now,
      metadata: {},
      auth: instanceConfig.auth,
      registeredAt: now,
      tags: instanceConfig.tags,
    }));
  }

  /**
   * Discovers instances from an OpenClaw Gateway.
   *
   * Queries the OpenClaw Gateway WebSocket API for available Pi sessions
   * and converts them to PiInstance objects.
   *
   * @param config - OpenClaw Gateway discovery configuration
   * @returns Array of Pi instances from the gateway
   * @throws {DiscoveryError} If the gateway query fails
   */
  private async discoverFromOpenClawGateway(config: OpenClawDiscoveryConfig): Promise<PiInstance[]> {
    if (!this.checkCircuitBreaker('openclaw-gateway')) {
      logger.warn('[PiRegistry] Circuit breaker open for OpenClaw Gateway');
      return [];
    }

    try {
      // This would typically use the GatewayClient from openclaw integration
      // For now, we implement a basic HTTP/WebSocket query
      const instances = await this.queryOpenClawGateway(config);
      this.recordSuccess('openclaw-gateway');
      return instances;
    } catch (error) {
      this.recordFailure('openclaw-gateway');
      throw error;
    }
  }

  /**
   * Queries the OpenClaw Gateway for sessions.
   *
   * @param config - Gateway configuration
   * @returns Array of Pi instances
   */
  private async queryOpenClawGateway(config: OpenClawDiscoveryConfig): Promise<PiInstance[]> {
    // Note: In production, this would use the GatewayClient
    // This is a placeholder implementation
    const timeout = config.healthCheckTimeoutMs || 5000;

    try {
      // Simulate gateway query - in production, use WebSocket or HTTP API
      logger.debug('[PiRegistry] Querying OpenClaw Gateway at %s', config.gatewayUrl);

      // Placeholder: Return empty array for now
      // Real implementation would:
      // 1. Connect to gateway WebSocket
      // 2. Send sessions_list request
      // 3. Parse response into PiInstance objects
      return [];
    } catch (error) {
      throw new DiscoveryError(
        'openclaw-gateway',
        `Failed to query gateway at ${config.gatewayUrl}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Discovers instances from Kubernetes.
   *
   * Uses the Kubernetes API to discover Pi pods/services in the specified
   * namespace matching the label selector.
   *
   * @param config - Kubernetes discovery configuration
   * @returns Array of Pi instances from Kubernetes
   * @throws {DiscoveryError} If the Kubernetes API query fails
   */
  private async discoverFromKubernetes(config: KubernetesDiscoveryConfig): Promise<PiInstance[]> {
    if (!this.checkCircuitBreaker('kubernetes')) {
      logger.warn('[PiRegistry] Circuit breaker open for Kubernetes');
      return [];
    }

    try {
      const instances = await this.queryKubernetes(config);
      this.recordSuccess('kubernetes');
      return instances;
    } catch (error) {
      this.recordFailure('kubernetes');
      throw error;
    }
  }

  /**
   * Queries Kubernetes for Pi pods/services.
   *
   * @param config - Kubernetes configuration
   * @returns Array of Pi instances
   */
  private async queryKubernetes(config: KubernetesDiscoveryConfig): Promise<PiInstance[]> {
    try {
      // Note: In production, this would use the Kubernetes client library
      // This is a placeholder implementation
      logger.debug(
        '[PiRegistry] Querying Kubernetes namespace %s with selector %s',
        config.namespace,
        config.labelSelector
      );

      // Placeholder: Return empty array for now
      // Real implementation would:
      // 1. Create Kubernetes client
      // 2. Query pods/endpoints in namespace
      // 3. Filter by label selector
      // 4. Extract instance info from pod annotations/labels
      return [];
    } catch (error) {
      throw new DiscoveryError(
        'kubernetes',
        `Failed to query Kubernetes: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Auto-spawns new Pi instances based on capacity requirements.
   *
   * Spawns new instances when available capacity falls below the threshold,
   * up to the configured maximum.
   *
   * @param config - Auto-spawn configuration
   * @returns Array of spawned Pi instances
   * @throws {DiscoveryError} If spawning fails
   */
  private async autoSpawnInstances(config: AutoSpawnDiscoveryConfig): Promise<PiInstance[]> {
    const currentInstances = this.getAllInstances().filter(
      (i) => i.provider === config.spawn.provider && i.model === config.spawn.model
    );

    const currentCapacity = currentInstances.reduce((sum, i) => sum + i.capacity.available, 0);
    const threshold = config.capacityThreshold || 0;

    if (currentCapacity > threshold) {
      logger.debug('[PiRegistry] Sufficient capacity available (%d > %d), skipping auto-spawn', currentCapacity, threshold);
      return [];
    }

    const needed = Math.min(
      config.maxInstances - currentInstances.length,
      config.minInstances
    );

    if (needed <= 0) {
      logger.debug('[PiRegistry] At max instances (%d), skipping auto-spawn', config.maxInstances);
      return [];
    }

    const spawned: PiInstance[] = [];

    for (let i = 0; i < needed; i++) {
      try {
        const instance = await this.spawnInstance(config.spawn);
        spawned.push(instance);
      } catch (error) {
        logger.error('[PiRegistry] Failed to spawn instance %d: %s', i, error instanceof Error ? error.message : String(error));
      }
    }

    logger.info('[PiRegistry] Auto-spawned %d/%d instances', spawned.length, needed);
    return spawned;
  }

  /**
   * Spawns a single Pi instance.
   *
   * @param spawnConfig - Spawn configuration
   * @returns Spawned Pi instance
   */
  private async spawnInstance(spawnConfig: SpawnConfig): Promise<PiInstance> {
    const now = new Date();
    const id = `pi-${spawnConfig.provider}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Note: In production, this would:
    // 1. Create Docker container / K8s pod / process
    // 2. Wait for instance to be ready
    // 3. Extract endpoint and other details

    logger.info('[PiRegistry] Spawning new Pi instance: %s', id);

    return {
      id,
      name: `${spawnConfig.provider}-${spawnConfig.model}-${id.slice(-6)}`,
      provider: spawnConfig.provider,
      model: spawnConfig.model,
      mode: spawnConfig.mode,
      endpoint: `http://localhost:8080/${id}`, // Placeholder
      health: 'unknown',
      capabilities: spawnConfig.capabilities || this.config.defaults?.capabilities || [],
      region: spawnConfig.region || this.config.defaults?.region,
      capacity: { ...DEFAULT_INSTANCE_CAPACITY },
      lastHeartbeat: now,
      metadata: {
        spawned: true,
        spawnConfig,
      },
      registeredAt: now,
      tags: spawnConfig.tags,
    };
  }

  // ============================================================================
  // Instance Management
  // ============================================================================

  /**
   * Registers a new Pi instance in the registry.
   *
   * If an instance with the same ID already exists, it will be replaced
   * and an 'instance.unregistered' event will be emitted before the
   * 'instance.registered' event.
   *
   * @param instance - Pi instance to register
   * @emits instance.registered
   * @emits instance.unregistered (if replacing existing)
   */
  register(instance: PiInstance): void {
    const existing = this.instances.get(instance.id);

    if (existing) {
      logger.warn('[PiRegistry] Replacing existing instance: %s', instance.id);
      this.emit('instance.unregistered', instance.id, 'replaced');
    }

    // Ensure capacity fields are computed
    const normalizedInstance: PiInstance = {
      ...instance,
      capacity: {
        ...DEFAULT_INSTANCE_CAPACITY,
        ...instance.capacity,
        available: instance.capacity.maxConcurrent - instance.capacity.activeTasks,
        utilizationPercent: instance.capacity.maxConcurrent > 0
          ? (instance.capacity.activeTasks / instance.capacity.maxConcurrent) * 100
          : 0,
      },
    };

    this.instances.set(instance.id, normalizedInstance);
    logger.info('[PiRegistry] Registered instance: %s (%s/%s)', instance.id, instance.provider, instance.model);

    this.emit('instance.registered', normalizedInstance);
    this.checkCapacityChanged();
  }

  /**
   * Unregisters a Pi instance from the registry.
   *
   * Optionally removes the instance after a grace period if it's unhealthy.
   *
   * @param instanceId - ID of the instance to unregister
   * @param reason - Optional reason for unregistration
   * @returns True if the instance was found and removed, false otherwise
   * @emits instance.unregistered
   */
  unregister(instanceId: string, reason?: string): boolean {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      logger.warn('[PiRegistry] Attempted to unregister unknown instance: %s', instanceId);
      return false;
    }

    // Cancel any pending removal
    const pendingRemoval = this.pendingRemovals.get(instanceId);
    if (pendingRemoval) {
      clearTimeout(pendingRemoval);
      this.pendingRemovals.delete(instanceId);
    }

    this.instances.delete(instanceId);
    logger.info('[PiRegistry] Unregistered instance: %s (reason: %s)', instanceId, reason || 'none');

    this.emit('instance.unregistered', instanceId, reason);
    this.checkCapacityChanged();

    return true;
  }

  /**
   * Gets a Pi instance by ID.
   *
   * @param instanceId - ID of the instance to retrieve
   * @returns The Pi instance if found, undefined otherwise
   */
  getInstance(instanceId: string): PiInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Gets all registered Pi instances.
   *
   * @returns Array of all registered instances
   */
  getAllInstances(): PiInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Gets all healthy Pi instances.
   *
   * Instances with 'healthy' or 'degraded' health status are considered healthy.
   *
   * @returns Array of healthy instances
   */
  getHealthyInstances(): PiInstance[] {
    return this.getAllInstances().filter(
      (i) => i.health === 'healthy' || i.health === 'degraded'
    );
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  /**
   * Checks the health of a specific instance.
   *
   * Performs an active health check by querying the instance's endpoint.
   * Updates the instance's health status and emits events if changed.
   *
   * @param instanceId - ID of the instance to check
   * @returns Current health status of the instance
   * @throws {InstanceNotFoundError} If the instance is not found
   * @emits instance.health_changed
   * @emits instance.failed
   */
  async checkHealth(instanceId: string): Promise<HealthStatus> {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      throw new InstanceNotFoundError(instanceId);
    }

    const previousHealth = instance.health;
    const timeout = this.config.healthMonitoring?.timeoutMs || 5000;

    try {
      const startTime = Date.now();
      const result = await this.performHealthCheck(instance, timeout);
      const responseTime = Date.now() - startTime;

      // Determine health status based on response
      let newHealth: HealthStatus;
      if (result.success) {
        newHealth = responseTime > timeout * 0.8 ? 'degraded' : 'healthy';
      } else {
        newHealth = 'unhealthy';
      }

      // Update instance
      instance.health = newHealth;
      instance.lastHeartbeat = new Date();

      // Emit event if health changed
      if (newHealth !== previousHealth) {
        logger.info(
          '[PiRegistry] Instance %s health changed: %s -> %s',
          instanceId,
          previousHealth,
          newHealth
        );
        this.emit('instance.health_changed', instanceId, previousHealth, newHealth);
      }

      // Schedule removal if unhealthy
      if (newHealth === 'unhealthy') {
        this.scheduleUnhealthyRemoval(instanceId);
        this.emit('instance.failed', instanceId, new Error(result.error || 'Health check failed'));
      }

      return newHealth;
    } catch (error) {
      instance.health = 'unhealthy';

      if (previousHealth !== 'unhealthy') {
        this.emit('instance.health_changed', instanceId, previousHealth, 'unhealthy');
      }

      this.scheduleUnhealthyRemoval(instanceId);
      this.emit('instance.failed', instanceId, error instanceof Error ? error : new Error(String(error)));

      return 'unhealthy';
    }
  }

  /**
   * Performs an actual health check against an instance.
   *
   * @param instance - Instance to check
   * @param timeoutMs - Timeout in milliseconds
   * @returns Health check result
   */
  private async performHealthCheck(
    instance: PiInstance,
    timeoutMs: number
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Health check timeout' });
      }, timeoutMs);

      // Note: In production, this would make an actual HTTP request
      // to the instance's health endpoint
      // For now, we simulate based on current health
      const shouldSucceed = instance.health !== 'unhealthy';

      // Simulate async health check
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ success: shouldSucceed });
      }, Math.random() * 100);
    });
  }

  /**
   * Schedules removal of an unhealthy instance after the grace period.
   *
   * @param instanceId - ID of the unhealthy instance
   */
  private scheduleUnhealthyRemoval(instanceId: string): void {
    const gracePeriod = this.config.healthMonitoring?.removalGracePeriodMs || 300000;

    // Cancel any existing scheduled removal
    const existing = this.pendingRemovals.get(instanceId);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      logger.warn('[PiRegistry] Removing unhealthy instance after grace period: %s', instanceId);
      this.unregister(instanceId, 'unhealthy_grace_period_expired');
      this.pendingRemovals.delete(instanceId);
    }, gracePeriod);

    this.pendingRemovals.set(instanceId, timeout);
  }

  /**
   * Starts automatic health monitoring.
   *
   * Periodically checks the health of all registered instances.
   *
   * @param intervalMs - Check interval in milliseconds (defaults to config)
   */
  startHealthMonitoring(intervalMs?: number): void {
    if (this.healthCheckInterval) {
      logger.warn('[PiRegistry] Health monitoring already running');
      return;
    }

    const interval = intervalMs || this.config.healthMonitoring?.intervalMs || 30000;

    logger.info('[PiRegistry] Starting health monitoring with %dms interval', interval);

    this.healthCheckInterval = setInterval(async () => {
      const instanceIds = Array.from(this.instances.keys());

      for (const instanceId of instanceIds) {
        try {
          await this.checkHealth(instanceId);
        } catch (error) {
          logger.error('[PiRegistry] Health check failed for %s: %s', instanceId, error instanceof Error ? error.message : String(error));
        }
      }
    }, interval);
  }

  /**
   * Stops automatic health monitoring.
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('[PiRegistry] Health monitoring stopped');
    }
  }

  /**
   * Performs a one-time health check on all instances.
   *
   * @returns Map of instance IDs to health statuses
   */
  async checkAllHealth(): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>();

    for (const instanceId of this.instances.keys()) {
      try {
        const health = await this.checkHealth(instanceId);
        results.set(instanceId, health);
      } catch (error) {
        results.set(instanceId, 'unknown');
      }
    }

    return results;
  }

  // ============================================================================
  // Capacity Tracking
  // ============================================================================

  /**
   * Gets a comprehensive capacity report.
   *
   * @returns Capacity report with overall and breakdown metrics
   */
  getAvailableCapacity(): CapacityReport {
    const instances = this.getAllInstances();
    const healthyInstances = this.getHealthyInstances();

    const totalCapacity = instances.reduce((sum, i) => sum + i.capacity.maxConcurrent, 0);
    const availableCapacity = healthyInstances.reduce((sum, i) => sum + i.capacity.available, 0);
    const utilizationPercent = totalCapacity > 0
      ? ((totalCapacity - availableCapacity) / totalCapacity) * 100
      : 0;

    // Build provider breakdown
    const byProvider: Record<string, ProviderCapacity> = {};
    for (const instance of instances) {
      const provider = instance.provider;
      if (!byProvider[provider]) {
        byProvider[provider] = {
          provider,
          instances: 0,
          healthyInstances: 0,
          totalCapacity: 0,
          availableCapacity: 0,
          utilizationPercent: 0,
        };
      }

      byProvider[provider].instances++;
      if (instance.health === 'healthy' || instance.health === 'degraded') {
        byProvider[provider].healthyInstances++;
        byProvider[provider].availableCapacity += instance.capacity.available;
      }
      byProvider[provider].totalCapacity += instance.capacity.maxConcurrent;
    }

    // Calculate provider utilization
    for (const provider of Object.values(byProvider)) {
      provider.utilizationPercent = provider.totalCapacity > 0
        ? ((provider.totalCapacity - provider.availableCapacity) / provider.totalCapacity) * 100
        : 0;
    }

    // Build region breakdown
    const byRegion: Record<string, RegionCapacity> = {};
    for (const instance of instances) {
      const region = instance.region || 'unknown';
      if (!byRegion[region]) {
        byRegion[region] = {
          region,
          instances: 0,
          healthyInstances: 0,
          totalCapacity: 0,
          availableCapacity: 0,
          utilizationPercent: 0,
        };
      }

      byRegion[region].instances++;
      if (instance.health === 'healthy' || instance.health === 'degraded') {
        byRegion[region].healthyInstances++;
        byRegion[region].availableCapacity += instance.capacity.available;
      }
      byRegion[region].totalCapacity += instance.capacity.maxConcurrent;
    }

    // Calculate region utilization
    for (const region of Object.values(byRegion)) {
      region.utilizationPercent = region.totalCapacity > 0
        ? ((region.totalCapacity - region.availableCapacity) / region.totalCapacity) * 100
        : 0;
    }

    return {
      totalInstances: instances.length,
      healthyInstances: healthyInstances.length,
      totalCapacity,
      availableCapacity,
      utilizationPercent,
      byProvider,
      byRegion,
    };
  }

  /**
   * Checks if capacity has changed significantly and emits event if so.
   */
  private checkCapacityChanged(): void {
    const currentReport = this.getAvailableCapacity();

    if (this.lastCapacityReport) {
      const prev = this.lastCapacityReport;
      const curr = currentReport;

      // Check for significant changes
      const capacityChange = Math.abs(curr.availableCapacity - prev.availableCapacity);
      const percentChange = prev.availableCapacity > 0
        ? (capacityChange / prev.availableCapacity) * 100
        : 0;

      if (percentChange > 10 || curr.healthyInstances !== prev.healthyInstances) {
        this.emit('capacity.changed', currentReport);
      }
    }

    this.lastCapacityReport = currentReport;
  }

  /**
   * Gets the least loaded instance.
   *
   * @param capabilities - Optional required capabilities
   * @returns The least loaded instance or null if none found
   */
  getLeastLoadedInstance(capabilities?: string[]): PiInstance | null {
    const candidates = capabilities && capabilities.length > 0
      ? this.getHealthyInstances().filter((i) =>
          capabilities.every((cap) => i.capabilities.includes(cap as PiCapability))
        )
      : this.getHealthyInstances();

    if (candidates.length === 0) {
      return null;
    }

    // Sort by available capacity (descending) and queue depth (ascending)
    return candidates.sort((a, b) => {
      if (b.capacity.available !== a.capacity.available) {
        return b.capacity.available - a.capacity.available;
      }
      return a.capacity.queueDepth - b.capacity.queueDepth;
    })[0];
  }

  // ============================================================================
  // Instance Selection
  // ============================================================================

  /**
   * Selects an instance based on the provided criteria.
   *
   * Supports multiple selection strategies:
   * - 'least-loaded': Selects the instance with the most available capacity
   * - 'round-robin': Cycles through instances sequentially
   * - 'random': Selects a random instance
   * - 'capability-match': Prioritizes instances matching all required capabilities
   *
   * @param criteria - Selection criteria
   * @returns Selected Pi instance or null if no match found
   */
  selectInstance(criteria: SelectionCriteria): PiInstance | null {
    const strategy = criteria.strategy || 'least-loaded';

    // Build candidate list
    let candidates = this.getHealthyInstances();

    // Apply filters
    if (criteria.preferredProvider) {
      candidates = candidates.filter((i) => i.provider === criteria.preferredProvider);
    }

    if (criteria.requiredCapabilities && criteria.requiredCapabilities.length > 0) {
      candidates = candidates.filter((i) =>
        criteria.requiredCapabilities!.every((cap) => i.capabilities.includes(cap as PiCapability))
      );
    }

    if (criteria.region) {
      candidates = candidates.filter((i) => i.region === criteria.region);
    }

    if (criteria.excludeInstances && criteria.excludeInstances.length > 0) {
      candidates = candidates.filter((i) => !criteria.excludeInstances!.includes(i.id));
    }

    if (criteria.tags && criteria.tags.length > 0) {
      candidates = candidates.filter((i) =>
        criteria.tags!.some((tag) => i.tags?.includes(tag))
      );
    }

    if (criteria.minAvailableCapacity && criteria.minAvailableCapacity > 0) {
      candidates = candidates.filter(
        (i) => i.capacity.available >= criteria.minAvailableCapacity!
      );
    }

    if (candidates.length === 0) {
      return null;
    }

    // Apply selection strategy
    switch (strategy) {
      case 'least-loaded':
        return this.selectLeastLoaded(candidates);
      case 'round-robin':
        return this.selectRoundRobin(candidates);
      case 'random':
        return this.selectRandom(candidates);
      case 'capability-match':
        return this.selectByCapabilityMatch(candidates, criteria.requiredCapabilities || []);
      default:
        return this.selectLeastLoaded(candidates);
    }
  }

  /**
   * Selects an instance by provider ID.
   *
   * @param providerId - Provider ID to match
   * @returns First healthy instance with the matching provider, or null
   */
  selectByProvider(providerId: string): PiInstance | null {
    const candidates = this.getHealthyInstances().filter((i) => i.provider === providerId);

    if (candidates.length === 0) {
      return null;
    }

    return this.selectLeastLoaded(candidates);
  }

  /**
   * Selects an instance by required capabilities.
   *
   * @param requiredCapabilities - Capabilities that must be supported
   * @returns First healthy instance supporting all capabilities, or null
   */
  selectByCapability(requiredCapabilities: string[]): PiInstance | null {
    if (requiredCapabilities.length === 0) {
      return this.getLeastLoadedInstance();
    }

    return this.getLeastLoadedInstance(requiredCapabilities);
  }

  /**
   * Selects the least loaded instance from candidates.
   *
   * @param candidates - Candidate instances
   * @returns Least loaded instance
   */
  private selectLeastLoaded(candidates: PiInstance[]): PiInstance {
    return candidates.sort((a, b) => {
      // Primary: available capacity (higher is better)
      if (b.capacity.available !== a.capacity.available) {
        return b.capacity.available - a.capacity.available;
      }
      // Secondary: utilization percentage (lower is better)
      return a.capacity.utilizationPercent - b.capacity.utilizationPercent;
    })[0];
  }

  /**
   * Selects an instance using round-robin.
   *
   * @param candidates - Candidate instances
   * @returns Next instance in rotation
   */
  private selectRoundRobin(candidates: PiInstance[]): PiInstance {
    const sorted = candidates.sort((a, b) => a.id.localeCompare(b.id));
    const index = this.roundRobinIndex % sorted.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % sorted.length;
    return sorted[index];
  }

  /**
   * Selects a random instance.
   *
   * @param candidates - Candidate instances
   * @returns Randomly selected instance
   */
  private selectRandom(candidates: PiInstance[]): PiInstance {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Selects instance by best capability match.
   *
   * @param candidates - Candidate instances
   * @param requiredCapabilities - Required capabilities
   * @returns Best matching instance
   */
  private selectByCapabilityMatch(
    candidates: PiInstance[],
    requiredCapabilities: string[]
  ): PiInstance {
    // Score instances by capability match and load
    const scored = candidates.map((instance) => {
      const matchingCaps = requiredCapabilities.filter((cap) =>
        instance.capabilities.includes(cap as PiCapability)
      ).length;
      const capabilityScore = matchingCaps / requiredCapabilities.length;

      // Combine capability score with available capacity
      const score = capabilityScore * 100 + instance.capacity.available;

      return { instance, score };
    });

    return scored.sort((a, b) => b.score - a.score)[0].instance;
  }

  // ============================================================================
  // Circuit Breaker
  // ============================================================================

  /**
   * Checks if a circuit breaker allows the operation.
   *
   * @param key - Circuit breaker key
   * @returns True if the circuit is closed (operation allowed)
   */
  private checkCircuitBreaker(key: string): boolean {
    const cb = this.circuitBreakers.get(key);

    if (!cb) {
      // Initialize new circuit breaker
      this.circuitBreakers.set(key, {
        failures: 0,
        lastFailureTime: null,
        state: 'closed',
      });
      return true;
    }

    if (cb.state === 'open') {
      const resetTimeout = this.config.circuitBreaker?.resetTimeoutMs || 60000;

      if (cb.lastFailureTime && Date.now() - cb.lastFailureTime > resetTimeout) {
        // Transition to half-open
        cb.state = 'half-open';
        logger.info('[PiRegistry] Circuit breaker for %s entering half-open state', key);
        return true;
      }

      return false;
    }

    return true;
  }

  /**
   * Records a successful operation for circuit breaker.
   *
   * @param key - Circuit breaker key
   */
  private recordSuccess(key: string): void {
    const cb = this.circuitBreakers.get(key);

    if (cb) {
      if (cb.state === 'half-open') {
        // Reset circuit breaker
        cb.state = 'closed';
        cb.failures = 0;
        logger.info('[PiRegistry] Circuit breaker for %s reset to closed', key);
      } else {
        cb.failures = 0;
      }
    }
  }

  /**
   * Records a failure for circuit breaker.
   *
   * @param key - Circuit breaker key
   */
  private recordFailure(key: string): void {
    const cb = this.circuitBreakers.get(key);

    if (cb) {
      cb.failures++;
      cb.lastFailureTime = Date.now();

      const threshold = this.config.circuitBreaker?.failureThreshold || 5;

      if (cb.failures >= threshold) {
        cb.state = 'open';
        logger.warn('[PiRegistry] Circuit breaker for %s opened after %d failures', key, cb.failures);
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Gets the number of registered instances.
   *
   * @returns Total instance count
   */
  getInstanceCount(): number {
    return this.instances.size;
  }

  /**
   * Gets the number of healthy instances.
   *
   * @returns Healthy instance count
   */
  getHealthyCount(): number {
    return this.getHealthyInstances().length;
  }

  /**
   * Checks if any healthy instances are available.
   *
   * @returns True if at least one healthy instance exists
   */
  hasHealthyInstances(): boolean {
    return this.getHealthyInstances().length > 0;
  }

  /**
   * Clears all registered instances.
   *
   * @param reason - Optional reason for clearing
   * @emits instance.unregistered for each instance
   */
  clear(reason?: string): void {
    const instanceIds = Array.from(this.instances.keys());

    for (const instanceId of instanceIds) {
      this.unregister(instanceId, reason || 'registry_cleared');
    }

    logger.info('[PiRegistry] Cleared all %d instances', instanceIds.length);
  }

  /**
   * Disposes the registry and cleans up resources.
   *
   * Stops health monitoring, clears pending removals, and optionally
   * unregisters all instances.
   *
   * @param clearInstances - Whether to unregister all instances
   */
  dispose(clearInstances: boolean = false): void {
    this.stopHealthMonitoring();

    // Clear pending removals
    for (const timeout of this.pendingRemovals.values()) {
      clearTimeout(timeout);
    }
    this.pendingRemovals.clear();

    if (clearInstances) {
      this.clear('registry_disposed');
    }

    this.removeAllListeners();
    logger.info('[PiRegistry] Disposed');
  }

  /**
   * Updates the capacity metrics for an instance.
   *
   * @param instanceId - Instance ID
   * @param updates - Partial capacity updates
   * @returns True if the instance was found and updated
   */
  updateInstanceCapacity(
    instanceId: string,
    updates: Partial<Omit<InstanceCapacity, 'available' | 'utilizationPercent'>>
  ): boolean {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      return false;
    }

    // Apply updates
    Object.assign(instance.capacity, updates);

    // Recalculate derived fields
    instance.capacity.available = instance.capacity.maxConcurrent - instance.capacity.activeTasks;
    instance.capacity.utilizationPercent = instance.capacity.maxConcurrent > 0
      ? (instance.capacity.activeTasks / instance.capacity.maxConcurrent) * 100
      : 0;

    this.checkCapacityChanged();

    return true;
  }

  /**
   * Gets statistics about the registry.
   *
   * @returns Registry statistics
   */
  getStats(): {
    totalInstances: number;
    healthyInstances: number;
    unhealthyInstances: number;
    unknownHealth: number;
    byProvider: Record<string, number>;
    byRegion: Record<string, number>;
  } {
    const instances = this.getAllInstances();
    const healthy = this.getHealthyInstances();

    const byProvider: Record<string, number> = {};
    const byRegion: Record<string, number> = {};

    for (const instance of instances) {
      byProvider[instance.provider] = (byProvider[instance.provider] || 0) + 1;
      const region = instance.region || 'unknown';
      byRegion[region] = (byRegion[region] || 0) + 1;
    }

    return {
      totalInstances: instances.length,
      healthyInstances: healthy.length,
      unhealthyInstances: instances.filter((i) => i.health === 'unhealthy').length,
      unknownHealth: instances.filter((i) => i.health === 'unknown').length,
      byProvider,
      byRegion,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalPiRegistry: PiRegistry | null = null;

/**
 * Gets or creates the global PiRegistry instance.
 *
 * @param config - Configuration for creating the registry (used only on first call)
 * @returns The global PiRegistry instance
 * @throws {PiRegistryError} If no config provided and no global instance exists
 */
export function getGlobalPiRegistry(config?: PiRegistryConfig): PiRegistry {
  if (!globalPiRegistry) {
    if (!config) {
      throw new PiRegistryError(
        'Global PiRegistry requires configuration on first initialization',
        'INITIALIZATION_REQUIRED'
      );
    }
    globalPiRegistry = new PiRegistry(config);
  }
  return globalPiRegistry;
}

/**
 * Resets the global PiRegistry instance.
 * Useful for testing.
 */
export function resetGlobalPiRegistry(): void {
  if (globalPiRegistry) {
    globalPiRegistry.dispose(true);
    globalPiRegistry = null;
  }
}

/**
 * Checks if a global PiRegistry instance exists.
 *
 * @returns True if global instance exists
 */
export function hasGlobalPiRegistry(): boolean {
  return globalPiRegistry !== null;
}

// ============================================================================
// Exports
// ============================================================================

export default PiRegistry;
