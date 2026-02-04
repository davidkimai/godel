"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitOpsManager = void 0;
exports.diffConfigs = diffConfigs;
exports.formatDiff = formatDiff;
exports.getGlobalGitOpsManager = getGlobalGitOpsManager;
exports.resetGlobalGitOpsManager = resetGlobalGitOpsManager;
const events_1 = require("events");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const yaml_loader_1 = require("./yaml-loader");
const yaml_loader_2 = require("./yaml-loader");
// ============================================================================
// Config Diffing
// ============================================================================
/**
 * Calculate diff between two configurations
 */
function diffConfigs(oldConfig, newConfig) {
    const differences = [];
    function compareObjects(oldObj, newObj, path = '') {
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
            }
            else if (!(key in newObj)) {
                differences.push({
                    path: currentPath,
                    oldValue,
                    newValue: undefined,
                    type: 'removed',
                });
            }
            else if (typeof oldValue !== typeof newValue) {
                differences.push({
                    path: currentPath,
                    oldValue,
                    newValue,
                    type: 'modified',
                });
            }
            else if (typeof oldValue === 'object' && oldValue !== null && newValue !== null) {
                if (Array.isArray(oldValue) && Array.isArray(newValue)) {
                    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                        differences.push({
                            path: currentPath,
                            oldValue,
                            newValue,
                            type: 'modified',
                        });
                    }
                }
                else if (!Array.isArray(oldValue) && !Array.isArray(newValue)) {
                    compareObjects(oldValue, newValue, currentPath);
                }
                else {
                    differences.push({
                        path: currentPath,
                        oldValue,
                        newValue,
                        type: 'modified',
                    });
                }
            }
            else if (oldValue !== newValue) {
                differences.push({
                    path: currentPath,
                    oldValue,
                    newValue,
                    type: 'modified',
                });
            }
        }
    }
    compareObjects(oldConfig, newConfig);
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
function formatDiff(diff) {
    if (diff.identical) {
        return 'No changes detected';
    }
    const lines = [];
    lines.push(`Changes: +${diff.summary.added} -${diff.summary.removed} ~${diff.summary.modified}`);
    lines.push('');
    for (const change of diff.differences) {
        const icon = change.type === 'added' ? '+' : change.type === 'removed' ? '-' : '~';
        lines.push(`${icon} ${change.path}`);
        if (change.type === 'modified') {
            lines.push(`    - ${JSON.stringify(change.oldValue)}`);
            lines.push(`    + ${JSON.stringify(change.newValue)}`);
        }
        else if (change.type === 'added') {
            lines.push(`    + ${JSON.stringify(change.newValue)}`);
        }
        else {
            lines.push(`    - ${JSON.stringify(change.oldValue)}`);
        }
    }
    return lines.join('\n');
}
class GitOpsManager extends events_1.EventEmitter {
    constructor(swarmManager) {
        super();
        this.configs = new Map();
        this.defaultGitOpsConfig = {
            enabled: true,
            watchInterval: 5000,
            autoApply: true,
            rollbackOnFailure: true,
            notifyOnChange: true,
        };
        this.pollingIntervals = new Map();
        this.isRunning = false;
        this.swarmManager = swarmManager;
    }
    /**
     * Set the swarm manager for applying configs
     */
    setSwarmManager(manager) {
        this.swarmManager = manager;
    }
    /**
     * Start watching a configuration file
     */
    async watch(filePath, swarmId, options) {
        const resolvedPath = (0, path_1.resolve)(filePath);
        // Load initial config
        const result = await (0, yaml_loader_1.loadConfig)({
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
    async setupWatcher(swarmId, gitopsConfig) {
        const tracked = this.configs.get(swarmId);
        if (!tracked)
            return;
        // Use polling-based watching for better cross-platform compatibility
        const interval = setInterval(() => this.checkForChanges(swarmId), gitopsConfig.watchInterval);
        this.pollingIntervals.set(swarmId, interval);
        // Also set up native fs.watch for immediate notification
        try {
            tracked.watcher = (0, fs_1.watch)(tracked.filePath, { persistent: false }, () => this.checkForChanges(swarmId));
        }
        catch (error) {
            // Polling fallback will handle it
            console.warn(`Native watch failed for ${tracked.filePath}, using polling only`);
        }
    }
    /**
     * Check if the config file has changed
     */
    async checkForChanges(swarmId) {
        const tracked = this.configs.get(swarmId);
        if (!tracked)
            return;
        try {
            // Read current content
            const currentContent = await (0, promises_1.readFile)(tracked.filePath, 'utf-8');
            // Compare checksums
            const { createHash } = await Promise.resolve().then(() => __importStar(require('crypto')));
            const currentChecksum = createHash('md5').update(currentContent).digest('hex');
            if (currentChecksum === tracked.lastResult.checksum) {
                return; // No change
            }
            // Config has changed, reload it
            await this.handleConfigChange(swarmId, currentContent);
        }
        catch (error) {
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
    async handleConfigChange(swarmId, newContent) {
        const tracked = this.configs.get(swarmId);
        if (!tracked)
            return;
        const gitopsConfig = tracked.lastResult.config.spec.gitops ?? this.defaultGitOpsConfig;
        try {
            // Parse new config
            const newParsed = await (0, yaml_loader_1.parseYaml)(newContent);
            (0, yaml_loader_1.validateConfigOrThrow)(newParsed, tracked.filePath);
            // Substitute env vars and resolve secrets
            const { substituteEnvVarsInObject, resolveSecretsInObject } = await Promise.resolve().then(() => __importStar(require('./yaml-loader')));
            let processedConfig = substituteEnvVarsInObject(newParsed).result;
            const { result: finalConfig, resolvedSecrets } = await resolveSecretsInObject(processedConfig);
            // Create new load result
            const { createHash } = await Promise.resolve().then(() => __importStar(require('crypto')));
            const newResult = {
                config: finalConfig,
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
        }
        catch (error) {
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
    async applyConfig(swarmId, newResult, diff, gitopsConfig) {
        const tracked = this.configs.get(swarmId);
        if (!tracked || !this.swarmManager)
            return;
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
            const swarmConfig = (0, yaml_loader_2.toSwarmConfig)(newResult.config);
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
        }
        catch (error) {
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
    async rollbackConfig(swarmId, previousConfig, previousAgentCount) {
        if (!this.swarmManager)
            return;
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
        }
        catch (rollbackError) {
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
    async unwatch(swarmId) {
        const tracked = this.configs.get(swarmId);
        if (!tracked)
            return;
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
    async stop() {
        for (const swarmId of this.configs.keys()) {
            await this.unwatch(swarmId);
        }
        this.isRunning = false;
    }
    /**
     * Get all tracked configs
     */
    getTrackedConfigs() {
        return Array.from(this.configs.values()).map(t => ({
            swarmId: t.swarmId,
            filePath: t.filePath,
            checksum: t.lastResult.checksum,
        }));
    }
    /**
     * Get a specific tracked config
     */
    getTrackedConfig(swarmId) {
        return this.configs.get(swarmId)?.lastResult;
    }
    /**
     * Subscribe to GitOps events
     */
    onGitOpsEvent(handler) {
        this.on('gitops', handler);
        return () => this.off('gitops', handler);
    }
    /**
     * Emit a GitOps event
     */
    emitEvent(event) {
        this.emit('gitops', event);
    }
}
exports.GitOpsManager = GitOpsManager;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalGitOpsManager = null;
function getGlobalGitOpsManager(swarmManager) {
    if (!globalGitOpsManager) {
        globalGitOpsManager = new GitOpsManager(swarmManager);
    }
    else if (swarmManager) {
        globalGitOpsManager.setSwarmManager(swarmManager);
    }
    return globalGitOpsManager;
}
function resetGlobalGitOpsManager() {
    globalGitOpsManager = null;
}
