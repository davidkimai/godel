"use strict";
/**
 * CLI State Persistence
 *
 * Persists CLI connection state to disk so it survives across process restarts.
 * Used by OpenClaw and other commands that need to maintain state between CLI invocations.
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
exports.getOpenClawState = getOpenClawState;
exports.setOpenClawState = setOpenClawState;
exports.clearOpenClawState = clearOpenClawState;
exports.isOpenClawConnected = isOpenClawConnected;
exports.isOpenClawMockMode = isOpenClawMockMode;
exports.getStateFilePath = getStateFilePath;
exports.resetState = resetState;
exports.getMockSessions = getMockSessions;
exports.setMockSession = setMockSession;
exports.removeMockSession = removeMockSession;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// State file location (in user's home directory for persistence)
const STATE_DIR = path.join(os.homedir(), '.config', 'dash');
const STATE_FILE = path.join(STATE_DIR, 'cli-state.json');
const DEFAULT_STATE = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
};
/**
 * Ensure the state directory exists
 */
function ensureStateDir() {
    if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
    }
}
/**
 * Load the current CLI state from disk
 */
function loadState() {
    try {
        ensureStateDir();
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            // Merge with defaults for backward compatibility
            return { ...DEFAULT_STATE, ...parsed };
        }
    }
    catch (error) {
        console.error('[cli-state.loadState] Error:', error);
    }
    return { ...DEFAULT_STATE };
}
/**
 * Save the CLI state to disk
 */
function saveState(state) {
    try {
        ensureStateDir();
        const current = loadState();
        const updated = {
            ...current,
            ...state,
            updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    }
    catch (error) {
        console.error('[cli-state.saveState] Error:', error);
    }
}
/**
 * Get OpenClaw state
 */
function getOpenClawState() {
    const state = loadState();
    return state.openclaw;
}
/**
 * Set OpenClaw state
 */
function setOpenClawState(openclawState) {
    saveState({ openclaw: openclawState });
}
/**
 * Clear OpenClaw state (disconnect)
 */
function clearOpenClawState() {
    const state = loadState();
    delete state.openclaw;
    saveState(state);
}
/**
 * Check if OpenClaw is connected (based on persisted state)
 */
function isOpenClawConnected() {
    const state = getOpenClawState();
    return state?.connected === true;
}
/**
 * Check if OpenClaw is in mock mode
 */
function isOpenClawMockMode() {
    const state = getOpenClawState();
    return state?.mockMode === true;
}
/**
 * Get the path to the state file (for debugging)
 */
function getStateFilePath() {
    return STATE_FILE;
}
/**
 * Reset all CLI state (for testing)
 */
function resetState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            fs.unlinkSync(STATE_FILE);
        }
    }
    catch (error) {
        console.error('[cli-state.resetState] Error:', error);
    }
}
// ============================================================================
// Mock Session Persistence
// ============================================================================
/**
 * Get mock sessions from state
 */
function getMockSessions() {
    const state = loadState();
    return state.mockSessions || [];
}
/**
 * Add or update a mock session
 */
function setMockSession(session) {
    const state = loadState();
    const sessions = state.mockSessions || [];
    const existingIndex = sessions.findIndex(s => s.sessionId === session.sessionId);
    if (existingIndex >= 0) {
        sessions[existingIndex] = session;
    }
    else {
        sessions.push(session);
    }
    saveState({ ...state, mockSessions: sessions });
}
/**
 * Remove a mock session
 */
function removeMockSession(sessionId) {
    const state = loadState();
    if (state.mockSessions) {
        state.mockSessions = state.mockSessions.filter(s => s.sessionId !== sessionId);
        saveState(state);
    }
}
exports.default = {
    loadState,
    saveState,
    getOpenClawState,
    setOpenClawState,
    clearOpenClawState,
    isOpenClawConnected,
    isOpenClawMockMode,
    getStateFilePath,
    resetState,
    getMockSessions,
    setMockSession,
    removeMockSession,
};
//# sourceMappingURL=cli-state.js.map