/**
 * GitOps Integration
 * 
 * Watches configuration files for changes and auto-applies updates to running teams.
 * Features:
 * - File watching with configurable intervals
 * - Auto-apply with rollback on failure
 * - Change notifications
 * - Event-driven architecture
 */

import { logger } from '../utils/logger';
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
  TeamYamlConfig,
} from './types';
import { toTeamConfig } from './yaml-loader';
import type { TeamManager } from '../core/team';

// ============================================================================
// Config Diffing
// ============================================================================

/**
 * Calculate diff between two configurations
 */
export function diffConfigs(
  oldConfig: TeamYamlConfig,
  newConfig: TeamYamlConfig
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
    oldConfig as unknown as Record<string, unknown>,
    newConfig as unknown as Record<string, unknown>
  );
  
  return {
    identical: differences.length === 0,
    differences,
    summary: {
      added: differences.filter(d => d.type === 'added').length,
      removed: differences.filter(d => d.type === 'removed').length,
      modified: differences.filter(d => d.type === 'modified').length,
    },
    timestamp: new Date().toISOString(),
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
  const summary = diff.summary ?? { added: 0, removed: 0, modified: 0 };
  lines.push(`Changes: +${summary.added} -${summary.removed} ~${summary.modified}`);
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
  teamId: string;
  lastResult: ConfigLoadResult;
  watcher?: FSWatcher;
}

export class GitOpsManager extends EventEmitter {
  private configs: Map<string, TrackedConfig> = new Map();
  private teamManager?: TeamManager;
  private defaultGitOpsConfig: GitOpsConfig = {
    enabled: true,
    watchInterval: 5000,
    autoApply: true,
    rollbackOnFailure: true,
    notifyOnChange: true,
  };
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor(teamManager?: TeamManager) {
    super();
    this.teamManager = teamManager;
  }

  /**
   * Set the team manager for applying configs
   */
  setTeamManager(manager: TeamManager): void {
    this.teamManager = manager;
  }

  /**
   * Start watching a configuration file
   */
  async watch(
    filePath: string,
    teamId: string,
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
    await this.unwatch(teamId);

    // Store tracked config
    this.configs.set(teamId, {
      filePath: resolvedPath,
      teamId,
      lastResult: result,
    });

    // Set up file watching if enabled
    if (gitopsConfig.enabled) {
      await this.setupWatcher(teamId, gitopsConfig);
    }

    // Emit loaded event
    this.emitEvent({
      type: 'config.loaded',
      timestamp: new Date(),
      filePath: resolvedPath,
      teamId,
    });

    return result;
  }

  /**
   * Set up file watcher for a tracked config
   */
  private async setupWatcher(
    teamId: string,
    gitopsConfig: GitOpsConfig
  ): Promise<void> {
    const tracked = this.configs.get(teamId);
    if (!tracked) return;

    // Use polling-based watching for better cross-platform compatibility
    const interval = setInterval(
      () => this.checkForChanges(teamId),
      gitopsConfig.watchInterval
    );
    
    this.pollingIntervals.set(teamId, interval);

    // Also set up native fs.watch for immediate notification
    try {
      tracked.watcher = watch(
        tracked.filePath,
        { persistent: false },
        () => this.checkForChanges(teamId)
      );
    } catch (error) {
      // Polling fallback will handle it
      logger.warn('gitops', `Native watch failed for ${tracked.filePath}, using polling only`);
    }
  }

  /**
   * Check if the config file has changed
   */
  private async checkForChanges(teamId: string): Promise<void> {
    const tracked = this.configs.get(teamId);
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
      await this.handleConfigChange(teamId, currentContent);
    } catch (error) {
      this.emit('error', {
        teamId,
        filePath: tracked.filePath,
        error,
      });
    }
  }

  /**
   * Handle configuration change
   */
  private async handleConfigChange(
    teamId: string,
    newContent: string
  ): Promise<void> {
    const tracked = this.configs.get(teamId);
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
        config: finalConfig as TeamYamlConfig,
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
        teamId,
        diff,
      });

      // Auto-apply if enabled
      if (gitopsConfig.autoApply && this.teamManager) {
        // Apply config changes
        await this.applyConfig(teamId, newResult, diff, gitopsConfig);
      }

      // Update tracked config
      tracked.lastResult = newResult;
    } catch (error) {
      this.emitEvent({
        type: 'config.failed',
        timestamp: new Date(),
        filePath: tracked.filePath,
        teamId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Apply configuration changes to a team
   */
  private async applyConfig(
    teamId: string,
    newResult: ConfigLoadResult,
    diff: ConfigDiffResult,
    gitopsConfig: GitOpsConfig
  ): Promise<void> {
    const tracked = this.configs.get(teamId);
    if (!tracked || !this.teamManager) return;

    // Get the team
    const team = this.teamManager.getTeam(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    // Save current state for potential rollback
    const previousConfig = tracked.lastResult;
    const previousAgentCount = team.agents.length;

    try {
      // Apply changes based on what changed
      const teamConfig = toTeamConfig(newResult.config);

      // Check if we need to scale
      const newInitialAgents = newResult.config.spec.initialAgents ?? 5;
      const currentAgents = team.agents.length;
      
      if (newInitialAgents !== currentAgents) {
        await this.teamManager.scale(teamId, newInitialAgents);
      }

      // Emit applied event
      this.emitEvent({
        type: 'config.applied',
        timestamp: new Date(),
        filePath: tracked.filePath,
        teamId,
        diff,
      });

      // Send notification if enabled
      if (gitopsConfig.notifyOnChange) {
        this.emit('notification', {
          type: 'config.applied',
          teamId,
          message: `Configuration applied to team ${teamId}`,
          diff: formatDiff(diff),
        });
      }
    } catch (error) {
      // Rollback on failure if enabled
      if (gitopsConfig.rollbackOnFailure) {
        await this.rollbackConfig(teamId, previousConfig, previousAgentCount);
      }

      this.emitEvent({
        type: 'config.failed',
        timestamp: new Date(),
        filePath: tracked.filePath,
        teamId,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error;
    }
  }

  /**
   * Rollback to previous configuration
   */
  private async rollbackConfig(
    teamId: string,
    previousConfig: ConfigLoadResult,
    previousAgentCount: number
  ): Promise<void> {
    if (!this.teamManager) return;

    try {
      // Restore previous agent count
      const team = this.teamManager.getTeam(teamId);
      if (team && team.agents.length !== previousAgentCount) {
        await this.teamManager.scale(teamId, previousAgentCount);
      }

      this.emitEvent({
        type: 'config.rolledback',
        timestamp: new Date(),
        filePath: previousConfig.filePath,
        teamId,
      });
    } catch (rollbackError) {
      this.emit('error', {
        type: 'rollback_failed',
        teamId,
        error: rollbackError,
      });
    }
  }

  /**
   * Stop watching a configuration file
   */
  async unwatch(teamId: string): Promise<void> {
    const tracked = this.configs.get(teamId);
    if (!tracked) return;

    // Clear polling interval
    const interval = this.pollingIntervals.get(teamId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(teamId);
    }

    // Close native watcher
    if (tracked.watcher) {
      tracked.watcher.close();
    }

    this.configs.delete(teamId);
  }

  /**
   * Stop all watchers
   */
  async stop(): Promise<void> {
    for (const teamId of this.configs.keys()) {
      await this.unwatch(teamId);
    }
    this.isRunning = false;
  }

  /**
   * Get all tracked configs
   */
  getTrackedConfigs(): Array<{ teamId: string; filePath: string; checksum: string }> {
    return Array.from(this.configs.values()).map(t => ({
      teamId: t.teamId,
      filePath: t.filePath,
      checksum: t.lastResult.checksum,
    }));
  }

  /**
   * Get a specific tracked config
   */
  getTrackedConfig(teamId: string): ConfigLoadResult | undefined {
    return this.configs.get(teamId)?.lastResult;
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

export function getGlobalGitOpsManager(teamManager?: TeamManager): GitOpsManager {
  if (!globalGitOpsManager) {
    globalGitOpsManager = new GitOpsManager(teamManager);
  } else if (teamManager) {
    globalGitOpsManager.setTeamManager(teamManager);
  }
  return globalGitOpsManager;
}

export function resetGlobalGitOpsManager(): void {
  globalGitOpsManager = null;
}
