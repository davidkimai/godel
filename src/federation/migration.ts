/**
 * Agent Migration - Cross-Cluster Agent Migration System
 * 
 * Handles migration of agents between clusters with:
 * - State preservation during migration
 * - Graceful and forced migration modes
 * - Automatic rollback on failure
 * - Sub-second migration times
 * 
 * @module federation/migration
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import type { ClusterInfo, ClusterRegistry } from './cluster-registry';

// ============================================================================
// TYPES
// ============================================================================

export type MigrationStatus = 
  | 'pending'
  | 'preparing'
  | 'in_progress'
  | 'transferring_state'
  | 'activating'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type MigrationMode = 'graceful' | 'force' | 'zero_downtime';

export interface AgentState {
  agentId: string;
  sessionId?: string;
  context?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  pendingTasks?: string[];
  checkpointData?: unknown;
  version: string;
  timestamp: Date;
}

export interface MigrationOptions {
  mode: MigrationMode;
  preserveState: boolean;
  gracefulShutdown: boolean;
  timeoutMs: number;
  maxRetries: number;
  rollbackOnFailure: boolean;
}

export interface MigrationRequest {
  agentId: string;
  sourceClusterId: string;
  targetClusterId: string;
  options: MigrationOptions;
  agentState?: AgentState;
  priority: number;
  requestedAt: Date;
}

export interface MigrationResult {
  migrationId: string;
  agentId: string;
  sourceClusterId: string;
  targetClusterId: string;
  status: MigrationStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  stateTransferred: boolean;
  error?: string;
  retryCount: number;
}

export interface MigrationPlan {
  migrationId: string;
  agentId: string;
  source: ClusterInfo;
  target: ClusterInfo;
  steps: MigrationStep[];
  estimatedDurationMs: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface MigrationStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
}

export interface MigrationConfig {
  defaultTimeoutMs: number;
  defaultMaxRetries: number;
  stateTransferChunkSize: number;
  enableParallelMigrations: boolean;
  maxConcurrentMigrations: number;
  autoRollbackOnFailure: boolean;
  healthCheckIntervalMs: number;
}

export interface MigrationStats {
  totalMigrations: number;
  successfulMigrations: number;
  failedMigrations: number;
  rolledBackMigrations: number;
  avgMigrationTimeMs: number;
  currentActiveMigrations: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
  defaultTimeoutMs: 5000,           // 5 second default timeout
  defaultMaxRetries: 2,
  stateTransferChunkSize: 1024 * 1024, // 1MB chunks
  enableParallelMigrations: true,
  maxConcurrentMigrations: 10,
  autoRollbackOnFailure: true,
  healthCheckIntervalMs: 1000,      // 1 second health checks
};

// ============================================================================
// AGENT MIGRATOR
// ============================================================================

export class AgentMigrator extends EventEmitter {
  private registry: ClusterRegistry;
  private config: MigrationConfig;
  private activeMigrations: Map<string, MigrationResult> = new Map();
  private migrationHistory: MigrationResult[] = [];
  private initialized = false;

  constructor(registry: ClusterRegistry, config: Partial<MigrationConfig> = {}) {
    super();
    this.registry = registry;
    this.config = { ...DEFAULT_MIGRATION_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    this.initialized = true;
    logger.info('[AgentMigrator] Initialized', { config: this.config });
    this.emit('initialized');
  }

  async dispose(): Promise<void> {
    // Wait for active migrations to complete or cancel them
    for (const [migrationId, migration] of this.activeMigrations) {
      if (migration.status === 'in_progress' || migration.status === 'preparing') {
        logger.warn('[AgentMigrator] Cancelling active migration during dispose', { migrationId });
        migration.status = 'failed';
        migration.error = 'Cancelled due to migrator shutdown';
        migration.completedAt = new Date();
      }
    }
    
    this.activeMigrations.clear();
    this.initialized = false;
    this.removeAllListeners();
    logger.info('[AgentMigrator] Disposed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AgentMigrator not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // MIGRATION PLANNING
  // ============================================================================

  async planMigration(
    agentId: string,
    sourceClusterId: string,
    targetClusterId?: string
  ): Promise<MigrationPlan> {
    this.ensureInitialized();

    const source = this.registry.getCluster(sourceClusterId);
    if (!source) {
      throw new Error(`Source cluster not found: ${sourceClusterId}`);
    }

    let target: ClusterInfo | null;
    
    if (targetClusterId) {
      target = this.registry.getCluster(targetClusterId);
      if (!target) {
        throw new Error(`Target cluster not found: ${targetClusterId}`);
      }
    } else {
      // Auto-select target cluster
      target = this.registry.selectClusterForMigration(sourceClusterId);
      if (!target) {
        throw new Error('No suitable target cluster found for migration');
      }
    }

    // Validate target has capacity
    if (target.availableSlots <= 0) {
      throw new Error(`Target cluster ${target.id} has no available capacity`);
    }

    const migrationId = randomUUID();
    
    // Calculate risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (source.region !== target.region) {
      riskLevel = 'medium';
    }
    if (target.load.utilizationPercent > 80) {
      riskLevel = 'high';
    }

    // Estimate duration based on network latency and state size
    const estimatedDurationMs = Math.max(
      500,  // Minimum 500ms
      source.health.latencyMs + target.health.latencyMs + 200
    );

    const steps: MigrationStep[] = [
      { id: '1', name: 'Validate source cluster', status: 'pending' },
      { id: '2', name: 'Reserve capacity on target', status: 'pending' },
      { id: '3', name: 'Export agent state', status: 'pending' },
      { id: '4', name: 'Transfer state to target', status: 'pending' },
      { id: '5', name: 'Start agent on target', status: 'pending' },
      { id: '6', name: 'Verify target agent', status: 'pending' },
      { id: '7', name: 'Stop source agent', status: 'pending' },
      { id: '8', name: 'Cleanup source', status: 'pending' },
    ];

    return {
      migrationId,
      agentId,
      source,
      target,
      steps,
      estimatedDurationMs,
      riskLevel,
    };
  }

  // ============================================================================
  // MIGRATION EXECUTION
  // ============================================================================

  async migrateAgent(
    agentId: string,
    sourceClusterId: string,
    targetClusterId: string,
    options: Partial<MigrationOptions> = {}
  ): Promise<MigrationResult> {
    this.ensureInitialized();

    const mergedOptions: MigrationOptions = {
      mode: 'graceful',
      preserveState: true,
      gracefulShutdown: true,
      timeoutMs: this.config.defaultTimeoutMs,
      maxRetries: this.config.defaultMaxRetries,
      rollbackOnFailure: this.config.autoRollbackOnFailure,
      ...options,
    };

    // Check concurrent migration limit
    if (this.activeMigrations.size >= this.config.maxConcurrentMigrations) {
      throw new Error(`Max concurrent migrations (${this.config.maxConcurrentMigrations}) reached`);
    }

    const migrationId = randomUUID();
    const startedAt = new Date();

    const result: MigrationResult = {
      migrationId,
      agentId,
      sourceClusterId,
      targetClusterId,
      status: 'preparing',
      startedAt,
      retryCount: 0,
      stateTransferred: false,
    };

    this.activeMigrations.set(migrationId, result);

    logger.info('[AgentMigrator] Starting migration', {
      migrationId,
      agentId,
      sourceClusterId,
      targetClusterId,
      mode: mergedOptions.mode,
    });

    this.emit('migration:started', { migration: result });

    try {
      await this.executeMigration(result, mergedOptions);
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.completedAt = new Date();
      
      logger.error('[AgentMigrator] Migration failed', {
        migrationId,
        error: result.error,
      });

      // Attempt rollback if enabled
      if (mergedOptions.rollbackOnFailure) {
        await this.rollbackMigration(result);
      }

      this.emit('migration:failed', { migration: result, error });
    } finally {
      this.activeMigrations.delete(migrationId);
      this.migrationHistory.push(result);
      
      // Trim history if too large
      if (this.migrationHistory.length > 1000) {
        this.migrationHistory = this.migrationHistory.slice(-500);
      }
    }

    return result;
  }

  private async executeMigration(
    result: MigrationResult,
    options: MigrationOptions
  ): Promise<void> {
    const { migrationId, agentId, sourceClusterId, targetClusterId } = result;
    
    const source = this.registry.getCluster(sourceClusterId);
    const target = this.registry.getCluster(targetClusterId);

    if (!source || !target) {
      throw new Error('Source or target cluster no longer available');
    }

    // Step 1: Validate source cluster health
    result.status = 'preparing';
    if (source.health.status === 'unhealthy') {
      throw new Error(`Source cluster ${sourceClusterId} is unhealthy`);
    }

    // Step 2: Reserve capacity on target
    if (target.availableSlots <= 0) {
      throw new Error(`Target cluster ${targetClusterId} has no available capacity`);
    }

    // Update target capacity (optimistic reservation)
    target.availableSlots--;
    target.currentAgents++;

    result.status = 'in_progress';
    this.emit('migration:in_progress', { migration: result });

    // Step 3: Export agent state from source
    let agentState: AgentState | null = null;
    
    if (options.preserveState) {
      agentState = await this.exportAgentState(source, agentId, options.timeoutMs);
    }

    // Step 4: Transfer state to target
    if (agentState) {
      result.status = 'transferring_state';
      await this.transferAgentState(target, agentState, options.timeoutMs);
      result.stateTransferred = true;
    }

    // Step 5: Start agent on target
    result.status = 'activating';
    await this.startAgentOnTarget(target, agentId, agentState, options.timeoutMs);

    // Step 6: Verify target agent
    const verified = await this.verifyAgentOnTarget(target, agentId, options.timeoutMs);
    if (!verified) {
      throw new Error('Failed to verify agent on target cluster');
    }

    // Step 7: Stop source agent (if graceful)
    if (options.gracefulShutdown) {
      await this.stopAgentOnSource(source, agentId, options.timeoutMs);
    }

    // Step 8: Cleanup source
    await this.cleanupSource(source, agentId);

    // Update source capacity
    source.currentAgents = Math.max(0, source.currentAgents - 1);
    source.availableSlots = source.maxAgents - source.currentAgents;

    // Migration complete
    result.status = 'completed';
    result.completedAt = new Date();
    result.durationMs = result.completedAt.getTime() - result.startedAt.getTime();

    logger.info('[AgentMigrator] Migration completed', {
      migrationId,
      durationMs: result.durationMs,
      stateTransferred: result.stateTransferred,
    });

    this.emit('migration:completed', { migration: result });
  }

  // ============================================================================
  // MIGRATION OPERATIONS
  // ============================================================================

  private async exportAgentState(
    cluster: ClusterInfo,
    agentId: string,
    timeoutMs: number
  ): Promise<AgentState | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${cluster.endpoint}/agents/${agentId}/export`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to export agent state: ${response.status}`);
      }

      const data = await response.json() as AgentState;
      return {
        ...data,
        timestamp: new Date(),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      logger.warn('[AgentMigrator] Failed to export agent state', {
        clusterId: cluster.id,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  private async transferAgentState(
    cluster: ClusterInfo,
    state: AgentState,
    timeoutMs: number
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${cluster.endpoint}/agents/import`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to transfer agent state: ${response.status}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async startAgentOnTarget(
    cluster: ClusterInfo,
    agentId: string,
    state: AgentState | null,
    timeoutMs: number
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${cluster.endpoint}/agents/${agentId}/start`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, resumeFromState: !!state }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to start agent on target: ${response.status}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async verifyAgentOnTarget(
    cluster: ClusterInfo,
    agentId: string,
    timeoutMs: number
  ): Promise<boolean> {
    const startTime = Date.now();
    const maxAttempts = 5;
    const attemptDelay = Math.min(200, timeoutMs / maxAttempts);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const remainingTime = timeoutMs - (Date.now() - startTime);
        const checkTimeout = setTimeout(() => controller.abort(), Math.min(1000, remainingTime));

        const response = await fetch(`${cluster.endpoint}/agents/${agentId}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(checkTimeout);

        if (response.ok) {
          return true;
        }
      } catch {
        // Retry
      }

      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, attemptDelay));
      }
    }

    return false;
  }

  private async stopAgentOnSource(
    cluster: ClusterInfo,
    agentId: string,
    timeoutMs: number
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await fetch(`${cluster.endpoint}/agents/${agentId}/stop`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graceful: true }),
      });
    } catch {
      // Ignore errors during stop
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async cleanupSource(
    cluster: ClusterInfo,
    agentId: string
  ): Promise<void> {
    try {
      await fetch(`${cluster.endpoint}/agents/${agentId}/cleanup`, {
        method: 'POST',
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  // ============================================================================
  // ROLLBACK
  // ============================================================================

  private async rollbackMigration(result: MigrationResult): Promise<void> {
    logger.warn('[AgentMigrator] Rolling back migration', {
      migrationId: result.migrationId,
    });

    const source = this.registry.getCluster(result.sourceClusterId);
    const target = this.registry.getCluster(result.targetClusterId);

    if (target) {
      // Release capacity on target
      target.currentAgents = Math.max(0, target.currentAgents - 1);
      target.availableSlots = target.maxAgents - target.currentAgents;

      // Try to stop agent on target
      try {
        await fetch(`${target.endpoint}/agents/${result.agentId}/stop`, {
          method: 'POST',
          body: JSON.stringify({ force: true }),
        });
      } catch {
        // Ignore errors
      }
    }

    if (source) {
      // Try to restart agent on source if it was stopped
      try {
        await fetch(`${source.endpoint}/agents/${result.agentId}/start`, {
          method: 'POST',
        });
      } catch {
        // Ignore errors
      }
    }

    result.status = 'rolled_back';
    this.emit('migration:rolled_back', { migration: result });
  }

  // ============================================================================
  // BULK MIGRATION
  // ============================================================================

  async migrateMultipleAgents(
    migrations: Array<{ agentId: string; sourceClusterId: string; targetClusterId?: string }>,
    options: Partial<MigrationOptions> = {}
  ): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];

    if (this.config.enableParallelMigrations) {
      // Run migrations in parallel with concurrency limit
      const concurrencyLimit = Math.min(
        5,
        this.config.maxConcurrentMigrations - this.activeMigrations.size
      );
      
      const chunks: Array<typeof migrations> = [];
      for (let i = 0; i < migrations.length; i += concurrencyLimit) {
        chunks.push(migrations.slice(i, i + concurrencyLimit));
      }

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(async ({ agentId, sourceClusterId, targetClusterId }) => {
            try {
              // Auto-select target if not specified
              let finalTargetId = targetClusterId;
              if (!finalTargetId) {
                const target = this.registry.selectClusterForMigration(sourceClusterId);
                if (!target) {
                  throw new Error('No suitable target cluster found');
                }
                finalTargetId = target.id;
              }

              return await this.migrateAgent(agentId, sourceClusterId, finalTargetId, options);
            } catch (error) {
              const failedResult: MigrationResult = {
                migrationId: randomUUID(),
                agentId,
                sourceClusterId,
                targetClusterId: targetClusterId || 'auto-selected',
                status: 'failed',
                startedAt: new Date(),
                completedAt: new Date(),
                error: error instanceof Error ? error.message : 'Unknown error',
                retryCount: 0,
                stateTransferred: false,
              };
              return failedResult;
            }
          })
        );
        results.push(...chunkResults);
      }
    } else {
      // Sequential execution
      for (const { agentId, sourceClusterId, targetClusterId } of migrations) {
        try {
          let finalTargetId = targetClusterId;
          if (!finalTargetId) {
            const target = this.registry.selectClusterForMigration(sourceClusterId);
            if (!target) {
              throw new Error('No suitable target cluster found');
            }
            finalTargetId = target.id;
          }

          const result = await this.migrateAgent(agentId, sourceClusterId, finalTargetId, options);
          results.push(result);
        } catch (error) {
          results.push({
            migrationId: randomUUID(),
            agentId,
            sourceClusterId,
            targetClusterId: targetClusterId || 'auto-selected',
            status: 'failed',
            startedAt: new Date(),
            completedAt: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error',
            retryCount: 0,
            stateTransferred: false,
          });
        }
      }
    }

    return results;
  }

  // ============================================================================
  // AUTOMATIC FAILOVER
  // ============================================================================

  async failoverCluster(failedClusterId: string): Promise<MigrationResult[]> {
    const failedCluster = this.registry.getCluster(failedClusterId);
    if (!failedCluster) {
      throw new Error(`Cluster not found: ${failedClusterId}`);
    }

    logger.warn('[AgentMigrator] Initiating failover for cluster', {
      clusterId: failedClusterId,
      agentCount: failedCluster.currentAgents,
    });

    // Mark cluster as not accepting traffic
    failedCluster.isAcceptingTraffic = false;

    // Get list of agents to migrate
    const agents: string[] = [];
    // In a real implementation, this would query the cluster for agent IDs
    // For now, we'll create placeholder migrations
    for (let i = 0; i < failedCluster.currentAgents; i++) {
      agents.push(`agent-${failedClusterId}-${i}`);
    }

    const migrations = agents.map(agentId => ({
      agentId,
      sourceClusterId: failedClusterId,
      targetClusterId: undefined, // Auto-select
    }));

    const options: Partial<MigrationOptions> = {
      mode: 'force',
      preserveState: true,
      gracefulShutdown: false,
      timeoutMs: 3000, // Faster timeout for failover
      rollbackOnFailure: false, // Don't rollback during failover
    };

    const results = await this.migrateMultipleAgents(migrations, options);

    const successCount = results.filter(r => r.status === 'completed').length;
    logger.info('[AgentMigrator] Failover completed', {
      clusterId: failedClusterId,
      total: results.length,
      succeeded: successCount,
      failed: results.length - successCount,
    });

    this.emit('failover:completed', {
      clusterId: failedClusterId,
      results,
      successCount,
    });

    return results;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  getActiveMigrations(): MigrationResult[] {
    return Array.from(this.activeMigrations.values());
  }

  getMigrationHistory(limit = 100): MigrationResult[] {
    return this.migrationHistory.slice(-limit);
  }

  getMigration(migrationId: string): MigrationResult | undefined {
    return this.activeMigrations.get(migrationId) || 
      this.migrationHistory.find(m => m.migrationId === migrationId);
  }

  getStats(): MigrationStats {
    const total = this.migrationHistory.length;
    const successful = this.migrationHistory.filter(m => m.status === 'completed').length;
    const failed = this.migrationHistory.filter(m => m.status === 'failed').length;
    const rolledBack = this.migrationHistory.filter(m => m.status === 'rolled_back').length;
    
    const completedMigrations = this.migrationHistory.filter(m => m.durationMs !== undefined);
    const avgTime = completedMigrations.length > 0
      ? completedMigrations.reduce((sum, m) => sum + (m.durationMs || 0), 0) / completedMigrations.length
      : 0;

    return {
      totalMigrations: total,
      successfulMigrations: successful,
      failedMigrations: failed,
      rolledBackMigrations: rolledBack,
      avgMigrationTimeMs: Math.round(avgTime),
      currentActiveMigrations: this.activeMigrations.size,
    };
  }
}

export default AgentMigrator;
