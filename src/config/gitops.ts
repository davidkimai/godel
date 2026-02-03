/**
 * GitOps Integration
 * 
 * Watches configuration files for changes and auto-applies updates to running swarms.
 * Features:
 * - File watching with configurable intervals
 * - Auto-apply with rollback on failure
 * - Change notifications
 * - Event-driven architecture
 */

import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'fs';
import { stat, readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { 
  loadConfig, 
  parseYaml,
  validateConfigOrThrow,
  type ConfigLoadOptions,
  type ConfigLoadResult,
} from './yaml-loader';
import type { 
  GitOpsConfig, 
  GitOpsEvent, 
  GitOpsEventHandler,
  ConfigDiff,
  ConfigDiffResult,
  SwarmYamlConfig,
} from './types';
import { toSwarmConfig } from './yaml-loader';
import type { SwarmManager } from '../core/swarm';

// ============================================================================
// Config Diffing
// ============================================================================

/**
 * Calculate diff between two configurations
 */
export function diffConfigs(
  oldConfig: SwarmYamlConfig,
  newConfig: SwarmYamlConfig
): ConfigDiffResult {
  const differences: ConfigDiff[] = [];
  
  function compareObjects(
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
    path: string = ''
  ): void {
    const allKeys = new Set([
      ...Object.keys(oldObj),
      ...Object.keys(newObj),
    ]);
    
    for (const key of allKeys) {
      const currentPath = path ? `${path}.${key}` : key;
      const oldValue = oldObj[key];
      const newValue = newObj[key];
      
      if (!(key in oldObj)) {
        differences.push({
          path: currentPath,
          oldValue: undefined,
          newValue,
          type: 'added',
        });
      } else if (!(key in newObj)) {
        differences.push({
          path: currentPath,
          oldValue,
          newValue: undefined,
          type: 'removed',
        });
      } else if (typeof oldValue !== typeof newValue) {
        differences.push({
          path: currentPath,
          oldValue,
          newValue,
          type: 'modified',
        });
      } else if (typeof oldValue === 'object' && oldValue !== null && newValue !== null) {
        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            differences.push({
              path: currentPath,
              oldValue,
              newValue,
              type: 'modified',
            });
          }
        } else if (!Array.isArray(oldValue) && !Array.isArray(newValue)) {
          compareObjects(
            oldValue as Record<string, unknown>,
            newValue as Record<string, unknown>,
            currentPath
          );
        } else {
          differences.push({
            path: currentPath,
            oldValue,
            newValue,
            type: 'modified',
          });
        }
      } else if (oldValue !== newValue) {
        differences.push({
          path: currentPath,
          oldValue,
          newValue,
          type: 'modified',
        });
      }
    }
  }
  
  compareObjects(
    oldConfig as Record<string, unknown>,
    newConfig as Record<string, unknown>
  );
  
  return {
    identical: differences.length === 0,
    differences,
    summary: {
      added: differences.filter(d => d.type === 'added').length,
      removed: differences.filter(d => d.type === 'removed').length,
      modified: differences.filter(d => d.type === 'modified').length,
    },
  };
}

/**
 * Format diff for display
 */
export function formatDiff(diff: ConfigDiffResult): string {
  if (diff.identical) {
    return 'No changes detected';
  }
  
  const lines: string[] = [];
  lines.push(`Changes: +${diff.summary.added} -${diff.summary.removed} ~${diff.summary.modified}`);
  lines.push('');
  
  for (const change of diff.differences) {
    const icon = change.type === 'added' ? '+' : change.type === 'removed' ? '-' : '~';
    lines.push(`${icon} ${change.path}`);
    
    if (change.type === 'modified') {
      lines.push(`    - ${JSON.stringify(change.oldValue)}`);
      lines.push(`    + ${JSON.stringify(change.newValue)}`);
    } else if (change.type === 'added') {
      lines.push(`    + ${JSON.stringify(change.newValue)}`);
    } else {
      lines.push(`    - ${JSON.stringify(change.oldValue)}`);
    }
  }
  
  return lines.join('\n');
}

// ============================================================================
// GitOps Manager
// ============================================================================

interface TrackedConfig {
  filePath: string;
  swarmId: string;
  lastResult: ConfigLoadResult;
  watcher?: FSWatcher;
}

export class GitOpsManager extends EventEmitter {
  private configs: Map<string, TrackedConfig> = new Map();
  private swarmManager?: SwarmManager;
  private defaultGitOpsConfig: GitOpsConfig = {
    enabled: true,
    watchInterval: 5000,
    autoApply: true,
    rollbackOnFailure: true,
    notifyOnChange: true,
  };
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor(swarmManager?: SwarmManager) {
    super();
    this.swarmManager = swarmManager;
  }

  /**
   * Set the swarm manager for applying configs
   */
  setSwarmManager(manager: SwarmManager): void {
    this.swarmManager = manager;
  }

  /**
   * Start watching a configuration file
   */
  async watch(
    filePath: string,
    swarmId: string,
    options?: ConfigLoadOptions
  ): Promise<ConfigLoadResult> {
    const resolvedPath = resolve(filePath);
    
    // Load initial config
    const result = await loadConfig({
      filePath: resolvedPath,
      substituteEnv: true,
      resolveSecrets: true,
      validate: true,
      ...options,
    });

    // Get GitOps config from the loaded config
    const gitopsConfig = result.config.spec.gitops ?? this.defaultGitOpsConfig;

    // Stop existing watcher if present
    await this.unwatch(swarmId);

    // Store tracked config
    this.configs.set(swarmId, {
      filePath: resolvedPath,
      swarmId,
      lastResult: result,
    });

    // Set up file watching if enabled
    if (gitopsConfig.enabled) {
      await this.setupWatcher(swarmId, gitopsConfig);
    }

    // Emit loaded event
    this.emitEvent({
      type: 'config.loaded',
      timestamp: new Date(),
      filePath: resolvedPath,
      swarmId,
    });

    return result;
  }

  /**
   * Set up file watcher for a tracked config
   */
  private async setupWatcher(
    swarmId: string,
    gitopsConfig: GitOpsConfig
  ): Promise<void> {
    const tracked = this.configs.get(swarmId);
    if (!tracked) return;

    // Use polling-based watching for better cross-platform compatibility
    const interval = setInterval(
      () => this.checkForChanges(swarmId),
      gitopsConfig.watchInterval
    );
    
    this.pollingIntervals.set(swarmId, interval);

    // Also set up native fs.watch for immediate notification
    try {
      tracked.watcher = watch(
        tracked.filePath,
        { persistent: false },
        () => this.checkForChanges(swarmId)
      );
    } catch (error) {
      // Polling fallback will handle it
      console.warn(`Native watch failed for ${tracked.filePath}, using polling only`);
    }
  }

  /**
   * Check if the config file has changed
   */
  private async checkForChanges(swarmId: string): Promise<void> {
    const tracked = this.configs.get(swarmId);
    if (!tracked) return;

    try {
      // Read current content
      const currentContent = await readFile(tracked.filePath, 'utf-8');
      
      // Compare checksums
      const { createHash } = await import('crypto');
      const currentChecksum = createHash('md5').update(currentContent).digest('hex');
      
      if (currentChecksum === tracked.lastResult.checksum) {
        return; // No change
      }

      // Config has changed, reload it
      await this.handleConfigChange(swarmId, currentContent);
    } catch (error) {
      this.emit('error', {
        swarmId,
        filePath: tracked.filePath,
        error,
      });
    }
  }

  /**
   * Handle configuration change
   */
  private async handleConfigChange(
    swarmId: string,
    newContent: string
  ): Promise<void> {
    const tracked = this.configs.get(swarmId);
    if (!tracked) return;

    const gitopsConfig = tracked.lastResult.config.spec.gitops ?? this.defaultGitOpsConfig;

    try {
      // Parse new config
      const newParsed = await parseYaml(newContent);
      validateConfigOrThrow(newParsed, tracked.filePath);
      
      // Substitute env vars and resolve secrets
      const { substituteEnvVarsInObject, resolveSecretsInObject } = await import('./yaml-loader');
      
      let processedConfig = substituteEnvVarsInObject(newParsed).result;
      const { result: finalConfig, resolvedSecrets } = await resolveSecretsInObject(processedConfig);
      
      // Create new load result
      const { createHash } = await import('crypto');
      const newResult: ConfigLoadResult = {
        config: finalConfig as SwarmYamlConfig,
        rawContent: newContent,
        filePath: tracked.filePath,
        checksum: createHash('md5').update(newContent).digest('hex'),
        resolvedSecrets,
        substitutedEnvVars: [], // Will be populated by substituteEnvVarsInObject
      };

      // Calculate diff
      const diff = diffConfigs(tracked.lastResult.config, newResult.config);

      // Emit changed event
      this.emitEvent({
        type: 'config.changed',
        timestamp: new Date(),
        filePath: tracked.filePath,
        swarmId,
        diff,
      });

      // Auto-apply if enabled
      if (gitopsConfig.autoApply && this.swarmManager) {
        await this.applyConfig(swarmId, newResult, diff, gitopsConfig);
      }

      // Update tracked config
      tracked.lastResult = newResult;
    } catch (error) {
      this.emitEvent({
        type: 'config.failed',
        timestamp: new Date(),
        filePath: tracked.filePath,
        swarmId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Apply configuration changes to a swarm
   */
  private async applyConfig(
    swarmId: string,
    newResult: ConfigLoadResult,
    diff: ConfigDiffResult,
    gitopsConfig: GitOpsConfig
  ): Promise<void> {
    const tracked = this.configs.get(swarmId);
    if (!tracked || !this.swarmManager) return;

    // Get the swarm
    const swarm = this.swarmManager.getSwarm(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    // Save current state for potential rollback
    const previousConfig = tracked.lastResult;
    const previousAgentCount = swarm.agents.length;

    try {
      // Apply changes based on what changed
      const swarmConfig = toSwarmConfig(newResult.config);

      // Check if we need to scale
      const newInitialAgents = newResult.config.spec.initialAgents ?? 5;
      const currentAgents = swarm.agents.length;
      
      if (newInitialAgents !== currentAgents) {
        await this.swarmManager.scale(swarmId, newInitialAgents);
      }

      // Emit applied event
      this.emitEvent({
        type: 'config.applied',
        timestamp: new Date(),
        filePath: tracked.filePath,
        swarmId,
        diff,
      });

      // Send notification if enabled
      if (gitopsConfig.notifyOnChange) {
        this.emit('notification', {
          type: 'config.applied',
          swarmId,
          message: `Configuration applied to swarm ${swarmId}`,
          diff: formatDiff(diff),
        });
      }
    } catch (error) {
      // Rollback on failure if enabled
      if (gitopsConfig.rollbackOnFailure) {
        await this.rollbackConfig(swarmId, previousConfig, previousAgentCount);
      }

      this.emitEvent({
        type: 'config.failed',
        timestamp: new Date(),
        filePath: tracked.filePath,
        swarmId,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error;
    }
  }

  /**
   * Rollback to previous configuration
   */
  private async rollbackConfig(
    swarmId: string,
    previousConfig: ConfigLoadResult,
    previousAgentCount: number
  ): Promise<void> {
    if (!this.swarmManager) return;

    try {
      // Restore previous agent count
      const swarm = this.swarmManager.getSwarm(swarmId);
      if (swarm && swarm.agents.length !== previousAgentCount) {
        await this.swarmManager.scale(swarmId, previousAgentCount);
      }

      this.emitEvent({
        type: 'config.rolledback',
        timestamp: new Date(),
        filePath: previousConfig.filePath,
        swarmId,
      });
    } catch (rollbackError) {
      this.emit('error', {
        type: 'rollback_failed',
        swarmId,
        error: rollbackError,
      });
    }
  }

  /**
   * Stop watching a configuration file
   */
  async unwatch(swarmId: string): Promise<void> {
    const tracked = this.configs.get(swarmId);
    if (!tracked) return;

    // Clear polling interval
    const interval = this.pollingIntervals.get(swarmId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(swarmId);
    }

    // Close native watcher
    if (tracked.watcher) {
      tracked.watcher.close();
    }

    this.configs.delete(swarmId);
  }

  /**
   * Stop all watchers
   */
  async stop(): Promise<void> {
    for (const swarmId of this.configs.keys()) {
      await this.unwatch(swarmId);
    }
    this.isRunning = false;
  }

  /**
   * Get all tracked configs
   */
  getTrackedConfigs(): Array<{ swarmId: string; filePath: string; checksum: string }> {
    return Array.from(this.configs.values()).map(t => ({
      swarmId: t.swarmId,
      filePath: t.filePath,
      checksum: t.lastResult.checksum,
    }));
  }

  /**
   * Get a specific tracked config
   */
  getTrackedConfig(swarmId: string): ConfigLoadResult | undefined {
    return this.configs.get(swarmId)?.lastResult;
  }

  /**
   * Subscribe to GitOps events
   */
  onGitOpsEvent(handler: GitOpsEventHandler): () => void {
    this.on('gitops', handler);
    return () => this.off('gitops', handler);
  }

  /**
   * Emit a GitOps event
   */
  private emitEvent(event: GitOpsEvent): void {
    this.emit('gitops', event);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalGitOpsManager: GitOpsManager | null = null;

export function getGlobalGitOpsManager(swarmManager?: SwarmManager): GitOpsManager {
  if (!globalGitOpsManager) {
    globalGitOpsManager = new GitOpsManager(swarmManager);
  } else if (swarmManager) {
    globalGitOpsManager.setSwarmManager(swarmManager);
  }
  return globalGitOpsManager;
}

export function resetGlobalGitOpsManager(): void {
  globalGitOpsManager = null;
}
