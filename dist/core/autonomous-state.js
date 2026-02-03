"use strict";
/**
 * Dash v2.0 Autonomous State Manager
 * Crash recovery and state persistence for 24/7 autonomous operation
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
exports.loadState = loadState;
exports.saveState = saveState;
exports.updateHealth = updateHealth;
exports.getEscalationLevel = getEscalationLevel;
exports.setMode = setMode;
exports.recordDecision = recordDecision;
exports.scheduleAction = scheduleAction;
exports.getRecoveryPoint = getRecoveryPoint;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const STATE_FILE = path.join(process.cwd(), '.dash', 'orchestrator-state.json');
const STATE_BACKUP = path.join(process.cwd(), '.dash', 'orchestrator-state.backup.json');
/**
 * Load state from file with corruption handling
 */
function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return null;
        }
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Error loading state:', error);
        return null;
    }
}
/**
 * Save state atomically with backup
 */
function saveState(state) {
    try {
        // Create backup first
        if (fs.existsSync(STATE_FILE)) {
            fs.copyFileSync(STATE_FILE, STATE_BACKUP);
        }
        // Write new state
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        return true;
    }
    catch (error) {
        console.error('Error saving state:', error);
        return false;
    }
}
/**
 * Update health metrics
 */
function updateHealth(metrics) {
    let state = loadState();
    if (!state) {
        state = createDefaultState();
    }
    // Update metrics
    if (metrics.activeSwarms !== undefined)
        state.operationalState.activeSwarms = metrics.activeSwarms;
    if (metrics.budgetRemaining !== undefined)
        state.operationalState.budgetRemaining = metrics.budgetRemaining;
    if (metrics.agentsStuck !== undefined)
        state.operationalState.agentsStuck = metrics.agentsStuck;
    if (metrics.buildStatus !== undefined)
        state.operationalState.buildStatus = metrics.buildStatus;
    if (metrics.coveragePercent !== undefined)
        state.operationalState.coveragePercent = metrics.coveragePercent;
    if (metrics.errorsLastHour !== undefined)
        state.operationalState.errorsLastHour = metrics.errorsLastHour;
    // Update heartbeat
    state.lastHeartbeat = Date.now();
    // Auto-detect status
    if (state.operationalState.buildStatus === 'BROKEN') {
        state.status = 'CRITICAL';
        state.escalationLevel = 4;
    }
    else if (state.operationalState.agentsStuck > 0 || state.operationalState.errorsLastHour > 10) {
        state.status = 'WARNING';
        state.escalationLevel = Math.max(state.escalationLevel, 2);
    }
    else {
        state.status = 'HEALTHY';
        state.escalationLevel = 1;
    }
    saveState(state);
    return state;
}
/**
 * Get current escalation level
 */
function getEscalationLevel() {
    const state = loadState();
    return state?.escalationLevel || 1;
}
/**
 * Switch operational mode
 */
function setMode(mode) {
    let state = loadState();
    if (!state) {
        state = createDefaultState();
    }
    state.mode = mode;
    state.nightModeActive = mode === 'NIGHT_MODE';
    // Apply mode configuration
    switch (mode) {
        case 'ACTIVE_DEVELOPMENT':
            state.modeConfig.heartbeatMs = 60000;
            state.modeConfig.maxSwarms = 10;
            state.modeConfig.budgetLimit = 100;
            break;
        case 'NIGHT_MODE':
            state.modeConfig.heartbeatMs = 180000;
            state.modeConfig.maxSwarms = 3;
            state.modeConfig.budgetLimit = 25;
            break;
        case 'CRISIS':
            state.modeConfig.heartbeatMs = 10000;
            state.modeConfig.maxSwarms = 15;
            state.modeConfig.budgetLimit = 200;
            break;
        default:
            state.modeConfig.heartbeatMs = 300000;
            state.modeConfig.maxSwarms = 5;
            state.modeConfig.budgetLimit = 50;
    }
    saveState(state);
    return state;
}
/**
 * Record a decision in history
 */
function recordDecision(type, result, swarmsSpawned) {
    const state = loadState() || createDefaultState();
    state.recentDecisions.push({
        timestamp: Date.now(),
        type,
        result,
        swarmsSpawned
    });
    // Keep only last 100 decisions
    if (state.recentDecisions.length > 100) {
        state.recentDecisions = state.recentDecisions.slice(-100);
    }
    saveState(state);
}
/**
 * Schedule a future action
 */
function scheduleAction(action, delayMs) {
    const state = loadState() || createDefaultState();
    state.pendingActions.push(action);
    state.nextScheduledEvent = Date.now() + delayMs;
    saveState(state);
}
/**
 * Get recovery point for crash recovery
 */
function getRecoveryPoint() {
    // Try main state first, then backup
    let state = loadState();
    if (!state) {
        try {
            const backup = fs.readFileSync(STATE_BACKUP, 'utf8');
            state = JSON.parse(backup);
        }
        catch {
            return null;
        }
    }
    return state;
}
/**
 * Create default state for new installations
 */
function createDefaultState() {
    return {
        version: '4.0',
        mode: 'ACTIVE_DEVELOPMENT',
        lastHeartbeat: Date.now(),
        lastFullCheck: Date.now(),
        status: 'HEALTHY',
        operationalState: {
            activeSwarms: 0,
            maxSwarms: 10,
            budgetRemaining: 100,
            budgetDaily: 100,
            agentsStuck: 0,
            buildStatus: 'PASSING',
            coveragePercent: 2.2,
            errorsLastHour: 0
        },
        modeConfig: {
            heartbeatMs: 60000,
            maxSwarms: 10,
            budgetLimit: 100,
            nightModeStart: '23:00',
            nightModeEnd: '07:00'
        },
        escalationLevel: 1,
        lastCrisis: null,
        recentDecisions: [],
        pendingActions: [],
        nightModeActive: false,
        nextScheduledEvent: null
    };
}
// CLI interface for testing
if (require.main === module) {
    console.log('=== Autonomous State Manager ===');
    const state = loadState();
    if (state) {
        console.log('State loaded successfully');
        console.log(`Version: ${state.version}`);
        console.log(`Mode: ${state.mode}`);
        console.log(`Status: ${state.status}`);
        console.log(`Active Swarms: ${state.operationalState.activeSwarms}`);
    }
    else {
        console.log('No state file found, creating default...');
        saveState(createDefaultState());
        console.log('Default state created');
    }
}
//# sourceMappingURL=autonomous-state.js.map