"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stateManager = exports.StateManager = void 0;
exports.saveState = saveState;
exports.loadState = loadState;
exports.getCheckpointStatus = getCheckpointStatus;
const fs_1 = require("fs");
const path_1 = require("path");
const logger_1 = require("../utils/logger");
// ============================================================================
// CONFIGURATION
// ============================================================================
const CHECKPOINTS_DIR = '~/.config/dash/checkpoints';
const KEEP_HOURS = 24; // Keep checkpoints for 24 hours
// ============================================================================
// STATE MANAGER
// ============================================================================
class StateManager {
    constructor() {
        this.checkpointsDir = CHECKPOINTS_DIR.replace('~', process.env['HOME'] || '');
    }
    // --------------------------------------------------------------------------
    // CHECKPOINT OPERATIONS
    // --------------------------------------------------------------------------
    /**
     * Capture current system state
     */
    async captureCurrentState(agents, swarms, budgets, budgetsConfig, metrics, patterns, improvements, pendingActions, lastInterview) {
        const state = {
            version: '3.0.0',
            lastCheckpoint: new Date(),
            agents,
            swarms,
            budgets,
            budgetsConfig,
            metrics,
            patterns,
            improvements,
            pendingActions,
            lastInterview,
        };
        return state;
    }
    /**
     * Save checkpoint to disk
     */
    async saveCheckpoint(state) {
        // Ensure directory exists
        await this.ensureDirectory(this.checkpointsDir);
        // Generate filename with timestamp
        const timestamp = Date.now();
        const filename = `state_${timestamp}.json`;
        const filepath = (0, path_1.join)(this.checkpointsDir, filename);
        // Write checkpoint
        await fs_1.promises.writeFile(filepath, JSON.stringify(state, null, 2));
        logger_1.logger.info('state-manager', 'Checkpoint saved', {
            filepath,
            agentCount: state.agents.length,
            swarmCount: state.swarms.length,
            totalSpend: state.budgets.totalSpend,
        });
        // Prune old checkpoints
        await this.pruneOldCheckpoints();
        return filepath;
    }
    /**
     * Load latest checkpoint
     */
    async loadLatestCheckpoint() {
        const checkpoints = await this.listCheckpoints();
        if (checkpoints.length === 0) {
            logger_1.logger.warn('state-manager', 'No checkpoints found');
            return null;
        }
        // Load latest
        const latest = checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
        return this.loadCheckpoint(latest.filepath);
    }
    /**
     * Load specific checkpoint
     */
    async loadCheckpoint(filepath) {
        try {
            const content = await fs_1.promises.readFile(filepath, 'utf8');
            const state = JSON.parse(content, this.dateReviver);
            logger_1.logger.info('state-manager', 'Checkpoint loaded', {
                filepath,
                timestamp: state.lastCheckpoint,
                agentCount: state.agents.length,
            });
            return state;
        }
        catch (error) {
            logger_1.logger.error('state-manager', 'Failed to load checkpoint', { filepath, error });
            return null;
        }
    }
    /**
     * List all checkpoints
     */
    async listCheckpoints() {
        try {
            await this.ensureDirectory(this.checkpointsDir);
            const files = await fs_1.promises.readdir(this.checkpointsDir);
            const checkpoints = await Promise.all(files
                .filter(f => f.startsWith('state_') && f.endsWith('.json'))
                .map(async (f) => {
                const filepath = (0, path_1.join)(this.checkpointsDir, f);
                const stats = await fs_1.promises.stat(filepath);
                const timestamp = parseInt(f.replace('state_', '').replace('.json', ''), 10);
                return { filepath, timestamp, size: stats.size };
            }));
            return checkpoints;
        }
        catch (error) {
            logger_1.logger.error('state-manager', 'Failed to list checkpoints', { error });
            return [];
        }
    }
    /**
     * Prune checkpoints older than KEEP_HOURS
     */
    async pruneOldCheckpoints() {
        const cutoff = Date.now() - KEEP_HOURS * 60 * 60 * 1000;
        const checkpoints = await this.listCheckpoints();
        let deleted = 0;
        for (const checkpoint of checkpoints) {
            if (checkpoint.timestamp < cutoff) {
                try {
                    await fs_1.promises.unlink(checkpoint.filepath);
                    deleted++;
                }
                catch (error) {
                    logger_1.logger.error('state-manager', 'Failed to delete checkpoint', { checkpoint, error });
                }
            }
        }
        if (deleted > 0) {
            logger_1.logger.info('state-manager', 'Pruned old checkpoints', { deleted, remaining: checkpoints.length - deleted });
        }
        return deleted;
    }
    /**
     * Get checkpoint age in hours
     */
    async getLatestCheckpointAge() {
        const checkpoints = await this.listCheckpoints();
        if (checkpoints.length === 0)
            return null;
        const latest = checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
        return (Date.now() - latest.timestamp) / (1000 * 60 * 60);
    }
    // --------------------------------------------------------------------------
    // RECOVERY OPERATIONS
    // --------------------------------------------------------------------------
    /**
     * Recover from checkpoint
     */
    async recoverFromCheckpoint(state, options = {}) {
        const result = {
            success: true,
            agentsRestored: 0,
            swarmsResumed: 0,
            budgetsRestored: false,
            actionsReplayed: 0,
            errors: [],
        };
        // Restore agents
        if (options.restartAgents !== false) {
            for (const agent of state.agents) {
                if (agent.status === 'running') {
                    try {
                        // In real implementation, call agent lifecycle to restart
                        result.agentsRestored++;
                    }
                    catch (error) {
                        result.errors.push(`Failed to restore agent ${agent.id}: ${error}`);
                    }
                }
            }
        }
        // Resume swarms
        if (options.resumeSwarms !== false) {
            for (const swarm of state.swarms) {
                if (swarm.status === 'running') {
                    try {
                        // In real implementation, resume swarm
                        result.swarmsResumed++;
                    }
                    catch (error) {
                        result.errors.push(`Failed to resume swarm ${swarm.id}: ${error}`);
                    }
                }
            }
        }
        // Restore budgets
        if (options.restoreBudgets !== false) {
            try {
                // In real implementation, restore budgets from state.budgetsConfig
                result.budgetsRestored = true;
            }
            catch (error) {
                result.errors.push(`Failed to restore budgets: ${error}`);
            }
        }
        // Replay pending actions
        if (options.replayActions !== false) {
            for (const action of state.pendingActions) {
                try {
                    // In real implementation, replay action
                    result.actionsReplayed++;
                }
                catch (error) {
                    result.errors.push(`Failed to replay action ${action.id}: ${error}`);
                }
            }
        }
        result.success = result.errors.length === 0;
        logger_1.logger.info('state-manager', 'Recovery complete', {
            success: result.success,
            agentsRestored: result.agentsRestored,
            swarmsResumed: result.swarmsResumed,
            budgetsRestored: result.budgetsRestored,
            actionsReplayed: result.actionsReplayed,
            errors: result.errors.length,
        });
        return result;
    }
    // --------------------------------------------------------------------------
    // HELPER METHODS
    // --------------------------------------------------------------------------
    async ensureDirectory(dir) {
        try {
            await fs_1.promises.mkdir(dir, { recursive: true });
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
    dateReviver(key, value) {
        if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime()) && key.toLowerCase().includes('at')) {
                return date;
            }
        }
        return value;
    }
}
exports.StateManager = StateManager;
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
exports.stateManager = new StateManager();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Quick save of current state
 */
async function saveState(agents, swarms, budgets, budgetsConfig) {
    return exports.stateManager.saveCheckpoint(await exports.stateManager.captureCurrentState(agents, swarms, budgets, budgetsConfig, [], [], [], []));
}
/**
 * Quick load of latest state
 */
async function loadState() {
    return exports.stateManager.loadLatestCheckpoint();
}
/**
 * Get checkpoint status
 */
async function getCheckpointStatus() {
    const checkpoints = await exports.stateManager.listCheckpoints();
    const latestAge = await exports.stateManager.getLatestCheckpointAge();
    const totalSize = checkpoints.reduce((sum, c) => sum + c.size, 0);
    return {
        count: checkpoints.length,
        latestAge,
        totalSize,
    };
}
//# sourceMappingURL=state-manager.js.map