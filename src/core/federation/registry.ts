/**
 * Federation Registry - Instance Management for OpenClaw Federation
 * 
 * Manages a registry of 10-50+ OpenClaw instances with health monitoring,
 * capacity tracking, and event-driven updates. Persists instance data
 * via StorageAdapter with optional Redis caching.
 * 
 * @module federation/registry
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import {
  DEFAULT_REGISTRY_CONFIG,
  InstanceNotFoundError,
  InstanceRegistrationError,
} from './types';
import type {
  OpenClawInstance,
  OpenClawInstanceInput,
  FederationRegistryConfig,
  FederationCapacityReport,
  RegionCapacity,
  HealthStatus,
  HealthCheckHistory,
  StorageAdapter,
  FederationRegistryEvents,
} from './types';

// ============================================================================
// FEDERATION REGISTRY
// ============================================================================

/**
 * FederationRegistry manages OpenClaw instances in a distributed federation.
 * 
 * Features:
 * - Instance registration/unregistration
 * - Health status tracking
 * - Capacity reporting
 * - Event-driven updates
 * - Persistent storage via StorageAdapter
 * 
 * @example
 * ```typescript
 * const registry = new FederationRegistry(config, storage);
 * await registry.register({ endpoint: 'https://oc1.example.com', maxSessions: 100 });
 * const healthy = registry.getHealthyInstances();
 * ```
 */
export class FederationRegistry extends EventEmitter {
  /** In-memory cache of all registered instances */
  private instances: Map<string, OpenClawInstance> = new Map();
  
  /** Configuration for the registry */
  private config: FederationRegistryConfig;
  
  /** Storage adapter for persistence */
  private storage: StorageAdapter;
  
  /** Timer for health check cycles */
  private healthCheckTimer?: NodeJS.Timeout;
  
  /** Health check history for failure tracking */
  private healthHistory: Map<string, HealthCheckHistory> = new Map();
  
  /** Whether the registry has been initialized */
  private initialized = false;
  
  /** Consecutive failure counts per instance */
  private failureCounts: Map<string, number> = new Map();

  /**
   * Create a new FederationRegistry
   * 
   * @param config - Registry configuration (merged with defaults)
   * @param storage - Storage adapter for persistence
   */
  constructor(config: Partial<FederationRegistryConfig>, storage: StorageAdapter) {
    super();
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
    this.storage = storage;
  }

  /**
   * Initialize the registry by loading instances from storage
   * Must be called before using other methods
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('federation-registry', 'Registry already initialized');
      return;
    }

    try {
      const instances = await this.storage.list();
      for (const instance of instances) {
        this.instances.set(instance.id, instance);
        this.failureCounts.set(instance.id, 0);
      }
      
      this.initialized = true;
      logger.info('federation-registry', `Initialized with ${instances.length} instances`);
    } catch (error) {
      logger.error('federation-registry', 'Failed to initialize registry', { error });
      throw new InstanceRegistrationError('Failed to initialize registry', error as Error);
    }
  }

  /**
   * Ensure registry is initialized
   * @throws Error if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('FederationRegistry not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // INSTANCE MANAGEMENT
  // ============================================================================

  /**
   * Register a new OpenClaw instance
   * 
   * @param input - Instance configuration (without auto-generated fields)
   * @returns The registered instance with generated ID
   * @throws InstanceRegistrationError if registration fails
   * 
   * @example
   * ```typescript
   * const instance = await registry.register({
   *   endpoint: 'https://instance-1.openclaw.io',
   *   region: 'us-east-1',
   *   maxSessions: 100,
   *   capabilities: ['gpu', 'vision']
   * });
   * ```
   */
  async register(input: OpenClawInstanceInput): Promise<OpenClawInstance> {
    this.ensureInitialized();

    // Check for duplicate endpoint
    const existing = await this.storage.findByEndpoint(input.endpoint);
    if (existing) {
      logger.warn('federation-registry', `Instance with endpoint ${input.endpoint} already exists`);
      throw new InstanceRegistrationError(`Instance with endpoint ${input.endpoint} already exists`);
    }

    const now = new Date();
    const instance: OpenClawInstance = {
      id: randomUUID(),
      endpoint: input.endpoint,
      region: input.region,
      zone: input.zone,
      version: input.version,
      capabilities: input.capabilities || [],
      healthStatus: 'unknown',
      currentSessions: 0,
      maxSessions: input.maxSessions,
      routingWeight: input.routingWeight ?? 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Save to persistent storage first
      await this.storage.save(instance);
      
      // Update in-memory cache
      this.instances.set(instance.id, instance);
      this.failureCounts.set(instance.id, 0);
      
      // Emit event
      this.emit('instance.registered', { instance, timestamp: now });
      
      logger.info('federation-registry', `Registered instance ${instance.id} at ${instance.endpoint}`);
      
      return instance;
    } catch (error) {
      logger.error('federation-registry', `Failed to register instance at ${input.endpoint}`, { error });
      throw new InstanceRegistrationError('Failed to register instance', error as Error);
    }
  }

  /**
   * Unregister an instance from the federation
   * 
   * @param instanceId - ID of the instance to unregister
   * @throws InstanceNotFoundError if instance doesn't exist
   * 
   * @example
   * ```typescript
   * await registry.unregister('instance-uuid-here');
   * ```
   */
  async unregister(instanceId: string): Promise<void> {
    this.ensureInitialized();

    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new InstanceNotFoundError(instanceId);
    }

    try {
      // Remove from persistent storage
      await this.storage.delete(instanceId);
      
      // Remove from in-memory cache
      this.instances.delete(instanceId);
      this.failureCounts.delete(instanceId);
      this.healthHistory.delete(instanceId);
      
      // Emit event
      this.emit('instance.unregistered', { instanceId, timestamp: new Date() });
      
      logger.info('federation-registry', `Unregistered instance ${instanceId}`);
    } catch (error) {
      logger.error('federation-registry', `Failed to unregister instance ${instanceId}`, { error });
      throw error;
    }
  }

  /**
   * Update an existing instance
   * 
   * @param instanceId - ID of the instance to update
   * @param updates - Partial instance data to update
   * @returns Updated instance
   * @throws InstanceNotFoundError if instance doesn't exist
   * 
   * @example
   * ```typescript
   * await registry.update('instance-uuid', { 
   *   maxSessions: 150,
   *   capabilities: ['gpu', 'vision', 'audio']
   * });
   * ```
   */
  async update(
    instanceId: string, 
    updates: Partial<Omit<OpenClawInstance, 'id' | 'createdAt'>>
  ): Promise<OpenClawInstance> {
    this.ensureInitialized();

    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new InstanceNotFoundError(instanceId);
    }

    const previousStatus = instance.healthStatus;
    const changes: string[] = [];
    
    // Track which fields changed
    for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
      const newValue = updates[key];
      const oldValue = instance[key];
      if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
        changes.push(key as string);
      }
      (instance as unknown as Record<string, unknown>)[key] = newValue;
    }

    instance.updatedAt = new Date();

    try {
      // Update persistent storage
      await this.storage.update(instanceId, updates);
      
      // Update in-memory cache
      this.instances.set(instanceId, instance);
      
      // Emit events
      this.emit('instance.updated', { instance, changes, timestamp: new Date() });
      
      // Also emit health_changed if status changed
      if (updates.healthStatus && updates.healthStatus !== previousStatus) {
        this.emit('instance.health_changed', {
          instance,
          previousStatus,
          newStatus: updates.healthStatus,
          timestamp: new Date(),
        });
        
        // Reset failure count on recovery
        if (updates.healthStatus === 'healthy') {
          this.failureCounts.set(instanceId, 0);
        }
      }
      
      logger.info('federation-registry', `Updated instance ${instanceId}: ${changes.join(', ')}`);
      
      return instance;
    } catch (error) {
      logger.error('federation-registry', `Failed to update instance ${instanceId}`, { error });
      throw error;
    }
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get a single instance by ID
   * 
   * @param instanceId - Instance ID
   * @returns Instance or undefined if not found
   */
  getInstance(instanceId: string): OpenClawInstance | undefined {
    this.ensureInitialized();
    return this.instances.get(instanceId);
  }

  /**
   * Get all registered instances
   * 
   * @returns Array of all instances
   */
  getAllInstances(): OpenClawInstance[] {
    this.ensureInitialized();
    return Array.from(this.instances.values());
  }

  /**
   * Get all healthy instances
   * 
   * @returns Array of healthy instances that are active
   */
  getHealthyInstances(): OpenClawInstance[] {
    this.ensureInitialized();
    return this.getAllInstances().filter(
      i => i.healthStatus === 'healthy' && i.isActive
    );
  }

  /**
   * Get instances by region
   * 
   * @param region - Region name
   * @returns Array of instances in the specified region
   */
  getInstancesByRegion(region: string): OpenClawInstance[] {
    this.ensureInitialized();
    return this.getAllInstances().filter(i => i.region === region);
  }

  /**
   * Get instances by capability
   * 
   * @param capability - Required capability
   * @returns Array of instances that support the capability
   */
  getInstancesByCapability(capability: string): OpenClawInstance[] {
    this.ensureInitialized();
    return this.getAllInstances().filter(
      i => i.capabilities.includes(capability)
    );
  }

  /**
   * Find instances matching multiple capabilities
   * 
   * @param capabilities - Required capabilities (all must match)
   * @returns Array of instances supporting all capabilities
   */
  getInstancesByCapabilities(capabilities: string[]): OpenClawInstance[] {
    this.ensureInitialized();
    if (capabilities.length === 0) return this.getAllInstances();
    
    return this.getAllInstances().filter(instance =>
      capabilities.every(cap => instance.capabilities.includes(cap))
    );
  }

  /**
   * Check if an instance exists
   * 
   * @param instanceId - Instance ID to check
   * @returns True if instance exists
   */
  hasInstance(instanceId: string): boolean {
    this.ensureInitialized();
    return this.instances.has(instanceId);
  }

  // ============================================================================
  // CAPACITY
  // ============================================================================

  /**
   * Get comprehensive capacity report across the federation
   * 
   * @returns Detailed capacity breakdown by region and totals
   */
  getCapacityReport(): FederationCapacityReport {
    this.ensureInitialized();

    const instances = this.getAllInstances();
    const healthyInstances = this.getHealthyInstances();
    
    const totalCapacity = instances.reduce((sum, i) => sum + i.maxSessions, 0);
    const usedCapacity = instances.reduce((sum, i) => sum + i.currentSessions, 0);
    const availableCapacity = totalCapacity - usedCapacity;
    
    const utilizationPercent = totalCapacity > 0 
      ? (usedCapacity / totalCapacity) * 100 
      : 0;

    // Group by region
    const byRegion: Record<string, RegionCapacity> = {};
    
    for (const instance of instances) {
      const region = instance.region || 'unknown';
      
      if (!byRegion[region]) {
        byRegion[region] = {
          instances: 0,
          healthy: 0,
          capacity: 0,
          available: 0,
          utilizationPercent: 0,
        };
      }
      
      const regionData = byRegion[region];
      regionData.instances++;
      regionData.capacity += instance.maxSessions;
      regionData.available += (instance.maxSessions - instance.currentSessions);
      
      if (instance.healthStatus === 'healthy') {
        regionData.healthy++;
      }
    }
    
    // Calculate utilization per region
    for (const region of Object.values(byRegion)) {
      region.utilizationPercent = region.capacity > 0
        ? ((region.capacity - region.available) / region.capacity) * 100
        : 0;
    }

    return {
      totalInstances: instances.length,
      healthyInstances: healthyInstances.length,
      totalCapacity,
      availableCapacity,
      utilizationPercent,
      byRegion,
      generatedAt: new Date(),
    };
  }

  /**
   * Get available capacity (total - used)
   * 
   * @returns Number of available session slots
   */
  getAvailableCapacity(): number {
    this.ensureInitialized();
    
    return this.getAllInstances().reduce((sum, instance) => {
      if (instance.healthStatus === 'healthy') {
        return sum + (instance.maxSessions - instance.currentSessions);
      }
      return sum;
    }, 0);
  }

  /**
   * Get total capacity across all instances
   * 
   * @returns Total session capacity
   */
  getTotalCapacity(): number {
    this.ensureInitialized();
    return this.getAllInstances().reduce((sum, i) => sum + i.maxSessions, 0);
  }

  /**
   * Get current utilization percentage
   * 
   * @returns Utilization as 0-100 percentage
   */
  getUtilizationPercent(): number {
    this.ensureInitialized();
    
    const total = this.getTotalCapacity();
    if (total === 0) return 0;
    
    const used = this.getAllInstances().reduce((sum, i) => sum + i.currentSessions, 0);
    return (used / total) * 100;
  }

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  /**
   * Check health of a specific instance
   * Updates instance status based on check result
   * 
   * @param instanceId - ID of instance to check
   * @returns New health status
   */
  async checkHealth(instanceId: string): Promise<HealthStatus> {
    this.ensureInitialized();

    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new InstanceNotFoundError(instanceId);
    }

    const startTime = Date.now();
    let newStatus: HealthStatus = 'unknown';
    let failureCount = this.failureCounts.get(instanceId) || 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);
      
      const response = await fetch(`${instance.endpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;
        
        // Parse health status from response
        const statusFromResponse = data.status as string | undefined;
        if (statusFromResponse === 'degraded') {
          newStatus = 'degraded';
        } else {
          newStatus = 'healthy';
          failureCount = 0; // Reset on success
        }
        
        // Update instance metrics if provided
        const updates: Partial<OpenClawInstance> = {
          lastHealthCheck: new Date(),
          healthStatus: newStatus,
        };
        
        if (typeof data.cpuPercent === 'number') {
          updates.cpuPercent = data.cpuPercent;
        }
        if (typeof data.memoryPercent === 'number') {
          updates.memoryPercent = data.memoryPercent;
        }
        if (typeof data.currentSessions === 'number') {
          updates.currentSessions = data.currentSessions;
        }
        if (typeof data.version === 'string') {
          updates.version = data.version;
        }
        
        await this.update(instanceId, updates);
      } else {
        failureCount++;
        if (failureCount >= this.config.unhealthyThreshold) {
          newStatus = 'unhealthy';
          await this.update(instanceId, {
            healthStatus: newStatus,
            lastHealthCheck: new Date(),
          });
        } else {
          newStatus = instance.healthStatus; // Keep existing status
        }
      }
      
      logger.debug('federation-registry', `Health check for ${instanceId}: ${newStatus} (${Date.now() - startTime}ms)`);
      
    } catch (error) {
      failureCount++;
      
      if (failureCount >= this.config.unhealthyThreshold) {
        newStatus = 'unhealthy';
        await this.update(instanceId, {
          healthStatus: newStatus,
          lastHealthCheck: new Date(),
        });
      } else {
        newStatus = instance.healthStatus;
      }
      
      logger.warn('federation-registry', `Health check failed for ${instanceId}`, { 
        error: (error as Error).message,
        failureCount 
      });
    }
    
    this.failureCounts.set(instanceId, failureCount);
    return newStatus;
  }

  /**
   * Start periodic health monitoring
   * Health checks run at configured intervals
   */
  startHealthMonitoring(): void {
    this.ensureInitialized();

    if (this.healthCheckTimer) {
      logger.warn('federation-registry', 'Health monitoring already running');
      return;
    }

    logger.info('federation-registry', `Starting health monitoring (interval: ${this.config.healthCheckInterval}ms)`);

    // Run first check immediately
    this.runHealthChecks().catch(error => {
      logger.error('federation-registry', 'Initial health check failed', { error });
    });

    // Schedule periodic checks
    this.healthCheckTimer = setInterval(() => {
      this.runHealthChecks().catch(error => {
        logger.error('federation-registry', 'Health check cycle failed', { error });
      });
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop periodic health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      logger.info('federation-registry', 'Stopped health monitoring');
    }
  }

  /**
   * Run health checks on all active instances
   * Emits health.check_completed event when done
   */
  private async runHealthChecks(): Promise<void> {
    const startTime = Date.now();
    const instances = this.getAllInstances().filter(i => i.isActive);
    
    if (instances.length === 0) {
      return;
    }

    logger.debug('federation-registry', `Running health checks on ${instances.length} instances`);

    const results = await Promise.allSettled(
      instances.map(instance => this.checkHealth(instance.id))
    );

    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const status = result.value;
        if (status === 'healthy') healthy++;
        else if (status === 'degraded') degraded++;
        else if (status === 'unhealthy') unhealthy++;
      } else {
        unhealthy++;
      }
    });

    const duration = Date.now() - startTime;

    this.emit('health.check_completed', {
      checked: instances.length,
      healthy,
      degraded,
      unhealthy,
      duration,
      timestamp: new Date(),
    });

    logger.info('federation-registry', `Health check completed: ${healthy} healthy, ${degraded} degraded, ${unhealthy} unhealthy (${duration}ms)`);

    // Auto-remove unhealthy instances if configured
    if (this.config.autoRemoveAfterMs) {
      await this.autoRemoveUnhealthy();
    }
  }

  /**
   * Automatically remove instances that have been unhealthy for too long
   */
  private async autoRemoveUnhealthy(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    Array.from(this.instances.entries()).forEach(([id, instance]) => {
      if (instance.healthStatus === 'unhealthy' && instance.lastHealthCheck) {
        const unhealthyDuration = now - instance.lastHealthCheck.getTime();
        
        if (unhealthyDuration > (this.config.autoRemoveAfterMs || 0)) {
          toRemove.push(id);
        }
      }
    });

    for (const id of toRemove) {
      logger.warn('federation-registry', `Auto-removing unhealthy instance ${id}`);
      await this.unregister(id).catch(error => {
        logger.error('federation-registry', `Failed to auto-remove instance ${id}`, { error });
      });
    }
  }

  /**
   * Get health check history for an instance
   * 
   * @param instanceId - Instance ID
   * @returns Health check history or undefined
   */
  getHealthHistory(instanceId: string): HealthCheckHistory | undefined {
    return this.healthHistory.get(instanceId);
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Dispose of the registry and cleanup resources
   */
  async dispose(): Promise<void> {
    this.stopHealthMonitoring();
    this.removeAllListeners();
    this.instances.clear();
    this.healthHistory.clear();
    this.failureCounts.clear();
    this.initialized = false;
    logger.info('federation-registry', 'Registry disposed');
  }
}

// Re-export types for convenience
export type {
  OpenClawInstance,
  OpenClawInstanceInput,
  FederationRegistryConfig,
  FederationCapacityReport,
  RegionCapacity,
  HealthStatus,
  HealthCheckHistory,
  StorageAdapter,
  FederationRegistryEvents,
  InstanceNotFoundError,
  InstanceRegistrationError,
};

// Export default
export default FederationRegistry;
