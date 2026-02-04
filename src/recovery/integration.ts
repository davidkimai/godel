/**
 * Recovery Integration - Unified Recovery System
 * 
 * Integrates:
 * - Checkpoint system with state persistence
 * - Self-healing controller with auto-scaler
 * - Circuit breaker with external service calls
 * - Event bus for failure notifications
 * - Metrics export
 */

import { EventEmitter } from 'events';
import { CheckpointManager, CheckpointProvider } from './checkpoint';
import { CircuitBreaker, CircuitBreakerRegistry, withCircuitBreaker } from './circuit-breaker';
import { SelfHealingController, AgentRecoveryHandler, SelfHealingConfig } from './self-healing';
import { RecoveryObservability } from './metrics';
import type { RedisEventBus } from '../core/event-bus-redis';
import type { PostgresConfig } from '../storage/postgres/config';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface RecoverySystemConfig {
  /** Enable recovery system (default: true) */
  enabled: boolean;
  /** Checkpoint configuration */
  checkpoint?: {
    enabled: boolean;
    intervalMs: number;
    maxCheckpointsPerEntity: number;
    maxAgeHours: number;
  };
  /** Self-healing configuration */
  selfHealing?: Partial<SelfHealingConfig>;
  /** Observability configuration */
  observability?: {
    enabled: boolean;
    prefix: string;
    includeDefaultMetrics: boolean;
  };
  /** PostgreSQL configuration */
  postgresConfig?: Partial<PostgresConfig>;
}

export interface RecoverySystemStatus {
  initialized: boolean;
  running: boolean;
  components: {
    checkpoint: boolean;
    selfHealing: boolean;
    observability: boolean;
  };
  agents: {
    registered: number;
    healthy: number;
    recovering: number;
    escalated: number;
  };
  circuitBreakers: {
    total: number;
    open: number;
    halfOpen: number;
    closed: number;
  };
}

export interface RecoveryEvent {
  type: 'failure' | 'recovery_start' | 'recovery_success' | 'recovery_failed' | 'escalation';
  timestamp: Date;
  agentId: string;
  swarmId?: string;
  details: Record<string, unknown>;
}

// ============================================================================
// Recovery System
// ============================================================================

export class RecoverySystem extends EventEmitter {
  private config: RecoverySystemConfig;
  private checkpointManager: CheckpointManager | null = null;
  private selfHealingController: SelfHealingController | null = null;
  private observability: RecoveryObservability | null = null;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private eventBus?: RedisEventBus;
  
  private isInitialized = false;
  private isRunning = false;

  constructor(config: Partial<RecoverySystemConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      checkpoint: {
        enabled: true,
        intervalMs: 30000,
        maxCheckpointsPerEntity: 10,
        maxAgeHours: 24,
      },
      selfHealing: {
        enabled: true,
        checkIntervalMs: 10000,
        maxRetries: 3,
        retryDelayMs: 5000,
        useCheckpoints: true,
        enableEscalation: true,
      },
      observability: {
        enabled: true,
        prefix: 'dash_recovery',
        includeDefaultMetrics: true,
      },
      ...config,
    };

    this.circuitBreakerRegistry = new CircuitBreakerRegistry();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(eventBus?: RedisEventBus): Promise<void> {
    if (this.isInitialized) return;

    if (!this.config.enabled) {
      logger.warn('[RecoverySystem] Recovery system is disabled');
      return;
    }

    try {
      // Initialize checkpoint manager
      if (this.config.checkpoint?.enabled) {
        this.checkpointManager = new CheckpointManager({
          enabled: this.config.checkpoint.enabled,
          intervalMs: this.config.checkpoint.intervalMs,
          maxCheckpointsPerEntity: this.config.checkpoint.maxCheckpointsPerEntity,
          maxAgeHours: this.config.checkpoint.maxAgeHours,
          postgresConfig: this.config.postgresConfig,
        });
        await this.checkpointManager.initialize();
        logger.info('[RecoverySystem] CheckpointManager initialized');
      }

      // Initialize self-healing controller
      if (this.config.selfHealing?.enabled) {
        this.selfHealingController = new SelfHealingController({
          ...this.config.selfHealing,
          useCheckpoints: this.config.checkpoint?.enabled && this.config.selfHealing.useCheckpoints!,
          postgresConfig: this.config.postgresConfig,
        });
        await this.selfHealingController.initialize(this.checkpointManager || undefined);
        logger.info('[RecoverySystem] SelfHealingController initialized');
      }

      // Initialize observability
      if (this.config.observability?.enabled) {
        this.observability = new RecoveryObservability({
          enabled: this.config.observability.enabled,
          prefix: this.config.observability.prefix,
          includeDefaultMetrics: this.config.observability.includeDefaultMetrics,
        });

        // Attach to components
        if (this.checkpointManager) {
          this.observability.attachCheckpointManager(this.checkpointManager);
        }
        if (this.circuitBreakerRegistry) {
          this.observability.attachCircuitBreakerRegistry(this.circuitBreakerRegistry);
        }
        if (this.selfHealingController) {
          this.observability.attachSelfHealingController(this.selfHealingController);
        }

        logger.info('[RecoverySystem] RecoveryObservability initialized');
      }

      // Setup event bus integration
      if (eventBus) {
        this.setupEventBusIntegration(eventBus);
      }

      this.isInitialized = true;
      logger.info('[RecoverySystem] Recovery system initialized successfully');
      this.emit('initialized');
    } catch (error) {
      logger.error('[RecoverySystem] Initialization failed:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.stop();

    if (this.selfHealingController) {
      await this.selfHealingController.shutdown();
    }

    if (this.checkpointManager) {
      await this.checkpointManager.shutdown();
    }

    this.isInitialized = false;
    logger.info('[RecoverySystem] Recovery system shutdown complete');
    this.emit('shutdown');
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (!this.isInitialized || !this.config.enabled) return;

    this.selfHealingController?.start();
    this.isRunning = true;
    
    logger.info('[RecoverySystem] Recovery system started');
    this.emit('started');
  }

  stop(): void {
    this.selfHealingController?.stop();
    this.isRunning = false;
    
    logger.info('[RecoverySystem] Recovery system stopped');
    this.emit('stopped');
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  /**
   * Register an agent for checkpoint and recovery
   */
  registerAgent(handler: AgentRecoveryHandler): void {
    if (!this.isInitialized) {
      throw new Error('Recovery system not initialized');
    }

    // Register with self-healing controller
    this.selfHealingController?.registerAgent(handler);

    // Also ensure checkpoint provider is registered if using custom provider
    if (this.checkpointManager) {
      const provider: CheckpointProvider = {
        getCheckpointData: () => handler.getAgentState(),
        restoreFromCheckpoint: (data) => handler.restoreFromCheckpoint(data),
        getEntityId: () => handler.getAgentId(),
        getEntityType: () => 'agent',
      };
      this.checkpointManager.registerProvider(provider);
    }

    logger.debug(`[RecoverySystem] Registered agent ${handler.getAgentId()}`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.selfHealingController?.unregisterAgent(agentId);
    this.checkpointManager?.unregisterProvider(agentId);
    
    logger.debug(`[RecoverySystem] Unregistered agent ${agentId}`);
  }

  /**
   * Register a generic checkpoint provider
   */
  registerCheckpointProvider(provider: CheckpointProvider): void {
    if (!this.checkpointManager) {
      throw new Error('Checkpoint manager not initialized');
    }

    this.checkpointManager.registerProvider(provider);
  }

  /**
   * Unregister a checkpoint provider
   */
  unregisterCheckpointProvider(entityId: string): void {
    this.checkpointManager?.unregisterProvider(entityId);
  }

  // ============================================================================
  // Manual Operations
  // ============================================================================

  /**
   * Manually trigger a checkpoint for an entity
   */
  async createCheckpoint(
    entityType: 'agent' | 'swarm' | 'session' | 'service',
    entityId: string,
    data: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.checkpointManager) {
      throw new Error('Checkpoint manager not initialized');
    }

    await this.checkpointManager.createCheckpoint(entityType, entityId, data, metadata);
  }

  /**
   * Manually restore from checkpoint
   */
  async restoreFromCheckpoint(entityId: string): Promise<boolean> {
    if (!this.checkpointManager) {
      throw new Error('Checkpoint manager not initialized');
    }

    const result = await this.checkpointManager.restoreFromLatestCheckpoint(entityId);
    return result.success;
  }

  /**
   * Report an agent failure manually
   */
  async reportFailure(
    agentId: string,
    reason: string,
    source: 'health_check' | 'event' | 'heartbeat' | 'manual' = 'manual'
  ): Promise<void> {
    await this.selfHealingController?.reportFailure(agentId, reason, source);
  }

  /**
   * Mark an escalated agent as handled
   */
  async handleEscalation(
    agentId: string,
    handledBy: string,
    action?: string
  ): Promise<void> {
    await this.selfHealingController?.markEscalationHandled(agentId, handledBy, action);
  }

  // ============================================================================
  // Circuit Breaker Operations
  // ============================================================================

  /**
   * Get or create a circuit breaker for a service
   */
  getCircuitBreaker(name: string, config?: Parameters<CircuitBreakerRegistry['getOrCreate']>[0]): CircuitBreaker {
    return this.circuitBreakerRegistry.getOrCreate({ name, ...config });
  }

  /**
   * Execute with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    serviceName: string,
    fn: () => Promise<T>,
    config?: Parameters<CircuitBreakerRegistry['getOrCreate']>[0]
  ): Promise<T> {
    const breaker = this.getCircuitBreaker(serviceName, config);
    return breaker.execute(fn);
  }

  /**
   * Get circuit breaker registry
   */
  getCircuitBreakerRegistry(): CircuitBreakerRegistry {
    return this.circuitBreakerRegistry;
  }

  // ============================================================================
  // Event Bus Integration
  // ============================================================================

  private setupEventBusIntegration(eventBus: RedisEventBus): void {
    this.eventBus = eventBus;

    // Subscribe to failure events
    const subscription = eventBus.subscribe(['error'], (event) => {
      if (event.type === 'error') {
        const agentId = event.agentId;
        const errorMsg = event.error?.message || 'Unknown error';
        
        this.reportFailure(agentId, errorMsg, 'event').catch(error => {
          logger.error(`[RecoverySystem] Failed to process failure event for ${agentId}:`, error);
        });
      }
    });

    // Forward recovery events to event bus
    this.selfHealingController?.on('recovery.success', (event) => {
      this.emitRecoveryEvent('recovery_success', event);
    });

    this.selfHealingController?.on('recovery.failed', (event) => {
      this.emitRecoveryEvent('recovery_failed', event);
    });

    this.selfHealingController?.on('escalation', (event) => {
      this.emitRecoveryEvent('escalation', event);
    });

    logger.debug('[RecoverySystem] Event bus integration setup complete');
  }

  private emitRecoveryEvent(
    type: RecoveryEvent['type'],
    data: { agentId: string; swarmId?: string; [key: string]: unknown }
  ): void {
    if (!this.eventBus) return;

    const event: RecoveryEvent = {
      type,
      timestamp: new Date(),
      agentId: data.agentId,
      swarmId: data.swarmId,
      details: data,
    };

    // Emit via EventEmitter for local subscribers
    this.emit('recovery.event', event);

    // Note: Actual event bus emission would depend on event bus capabilities
    logger.debug(`[RecoverySystem] Emitted recovery event: ${type} for ${data.agentId}`);
  }

  // ============================================================================
  // Auto-Scaler Integration
  // ============================================================================

  /**
   * Connect to auto-scaler for agent replacement on failure
   */
  connectToAutoScaler(autoScaler: {
    replaceAgent: (agentId: string, reason: string) => Promise<boolean>;
  }): void {
    // Listen for escalations and trigger agent replacement
    this.selfHealingController?.on('escalation', async (event) => {
      if (event.suggestedAction === 'auto_scale' || event.suggestedAction === 'terminate') {
        try {
          const success = await autoScaler.replaceAgent(
            event.agentId,
            `Escalated: ${event.reason}`
          );
          
          if (success) {
            logger.info(`[RecoverySystem] Auto-scaler replaced agent ${event.agentId}`);
            this.emit('auto_scale.replaced', { agentId: event.agentId });
          }
        } catch (error) {
          logger.error(`[RecoverySystem] Auto-scaler replacement failed for ${event.agentId}:`, error);
        }
      }
    });

    logger.info('[RecoverySystem] Auto-scaler integration established');
  }

  // ============================================================================
  // Metrics Export
  // ============================================================================

  /**
   * Get Prometheus-formatted metrics
   */
  async getMetrics(): Promise<string> {
    if (!this.observability) {
      return '# Recovery observability disabled';
    }
    return this.observability.getMetrics();
  }

  /**
   * Get dashboard data
   */
  async getDashboardData(): Promise<import('./metrics').RecoveryDashboardData> {
    if (!this.observability) {
      throw new Error('Observability not initialized');
    }
    return this.observability.getDashboardData();
  }

  /**
   * Get health status
   */
  getHealthStatus(): ReturnType<RecoveryObservability['getHealthStatus']> {
    if (!this.observability) {
      return {
        status: 'healthy',
        details: {
          checkpointManager: false,
          circuitBreakerRegistry: true,
          selfHealingController: false,
          openCircuits: 0,
          escalatedAgents: 0,
        },
      };
    }
    return this.observability.getHealthStatus();
  }

  // ============================================================================
  // Status
  // ============================================================================

  getStatus(): RecoverySystemStatus {
    const stats = this.selfHealingController?.getStats();
    const cbStats = this.circuitBreakerRegistry.getAllStats();

    return {
      initialized: this.isInitialized,
      running: this.isRunning,
      components: {
        checkpoint: !!this.checkpointManager,
        selfHealing: !!this.selfHealingController,
        observability: !!this.observability,
      },
      agents: {
        registered: stats?.totalAgentsMonitored || 0,
        healthy: stats?.healthyAgents || 0,
        recovering: stats?.recoveringAgents || 0,
        escalated: stats?.escalatedAgents || 0,
      },
      circuitBreakers: {
        total: cbStats.length,
        open: cbStats.filter(s => s.state === 'open').length,
        halfOpen: cbStats.filter(s => s.state === 'half-open').length,
        closed: cbStats.filter(s => s.state === 'closed').length,
      },
    };
  }

  // ============================================================================
  // Accessors
  // ============================================================================

  getCheckpointManager(): CheckpointManager | null {
    return this.checkpointManager;
  }

  getSelfHealingController(): SelfHealingController | null {
    return this.selfHealingController;
  }

  getObservability(): RecoveryObservability | null {
    return this.observability;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalRecoverySystem: RecoverySystem | null = null;

export function getGlobalRecoverySystem(
  config?: Partial<RecoverySystemConfig>
): RecoverySystem {
  if (!globalRecoverySystem) {
    globalRecoverySystem = new RecoverySystem(config);
  }
  return globalRecoverySystem;
}

export function resetGlobalRecoverySystem(): void {
  globalRecoverySystem = null;
}

// ============================================================================
// Decorator Export
// ============================================================================

export { withCircuitBreaker };

// ============================================================================
// Re-exports
// ============================================================================

export * from './checkpoint';
export * from './circuit-breaker';
export * from './self-healing';
export * from './metrics';

export default RecoverySystem;
