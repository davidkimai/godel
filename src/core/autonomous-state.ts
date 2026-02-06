/**
 * Godel v2.0 Autonomous State Manager
 * Crash recovery and state persistence for 24/7 autonomous operation
 */

import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface StateVersion {
  version: string;
  mode: 'ACTIVE_DEVELOPMENT' | 'NIGHT_MODE' | 'MAINTENANCE' | 'CRISIS';
  lastHeartbeat: number;
  lastFullCheck: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  operationalState: {
    activeSwarms: number;
    maxSwarms: number;
    budgetRemaining: number;
    budgetDaily: number;
    agentsStuck: number;
    buildStatus: 'PASSING' | 'BROKEN';
    coveragePercent: number;
    errorsLastHour: number;
  };
  modeConfig: {
    heartbeatMs: number;
    maxSwarms: number;
    budgetLimit: number;
    nightModeStart: string;
    nightModeEnd: string;
  };
  escalationLevel: number;
  lastCrisis: number | null;
  recentDecisions: Array<{
    timestamp: number;
    type: string;
    result: string;
    swarmsSpawned: number;
  }>;
  pendingActions: string[];
  nightModeActive: boolean;
  nextScheduledEvent: number | null;
}

const STATE_FILE = path.join(process.cwd(), '.dash', 'orchestrator-state.json');
const STATE_BACKUP = path.join(process.cwd(), '.dash', 'orchestrator-state.backup.json');

/**
 * Load state from file with corruption handling
 */
export function loadState(): StateVersion | null {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return null;
    }
    const data = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(data) as StateVersion;
  } catch (error) {
    logger.error('autonomous-state', `Error loading state: ${error}`);
    return null;
  }
}

/**
 * Save state atomically with backup
 */
export function saveState(state: StateVersion): boolean {
  try {
    // Create backup first
    if (fs.existsSync(STATE_FILE)) {
      fs.copyFileSync(STATE_FILE, STATE_BACKUP);
    }
    
    // Write new state
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    logger.error('autonomous-state', `Error saving state: ${error}`);
    return false;
  }
}

/**
 * Update health metrics
 */
export function updateHealth(metrics: Partial<StateVersion['operationalState']>): StateVersion {
  let state = loadState();
  
  if (!state) {
    state = createDefaultState();
  }
  
  // Update metrics
  if (metrics.activeSwarms !== undefined) state.operationalState.activeSwarms = metrics.activeSwarms;
  if (metrics.budgetRemaining !== undefined) state.operationalState.budgetRemaining = metrics.budgetRemaining;
  if (metrics.agentsStuck !== undefined) state.operationalState.agentsStuck = metrics.agentsStuck;
  if (metrics.buildStatus !== undefined) state.operationalState.buildStatus = metrics.buildStatus;
  if (metrics.coveragePercent !== undefined) state.operationalState.coveragePercent = metrics.coveragePercent;
  if (metrics.errorsLastHour !== undefined) state.operationalState.errorsLastHour = metrics.errorsLastHour;
  
  // Update heartbeat
  state.lastHeartbeat = Date.now();
  
  // Auto-detect status
  if (state.operationalState.buildStatus === 'BROKEN') {
    state.status = 'CRITICAL';
    state.escalationLevel = 4;
  } else if (state.operationalState.agentsStuck > 0 || state.operationalState.errorsLastHour > 10) {
    state.status = 'WARNING';
    state.escalationLevel = Math.max(state.escalationLevel, 2);
  } else {
    state.status = 'HEALTHY';
    state.escalationLevel = 1;
  }
  
  saveState(state);
  return state;
}

/**
 * Get current escalation level
 */
export function getEscalationLevel(): number {
  const state = loadState();
  return state?.escalationLevel || 1;
}

/**
 * Switch operational mode
 */
export function setMode(mode: StateVersion['mode']): StateVersion {
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
export function recordDecision(type: string, result: string, swarmsSpawned: number): void {
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
export function scheduleAction(action: string, delayMs: number): void {
  const state = loadState() || createDefaultState();
  
  state.pendingActions.push(action);
  state.nextScheduledEvent = Date.now() + delayMs;
  
  saveState(state);
}

/**
 * Get recovery point for crash recovery
 */
export function getRecoveryPoint(): StateVersion | null {
  // Try main state first, then backup
  let state = loadState();
  
  if (!state) {
    try {
      const backup = fs.readFileSync(STATE_BACKUP, 'utf8');
      state = JSON.parse(backup) as StateVersion;
    } catch {
      return null;
    }
  }
  
  return state;
}

/**
 * Create default state for new installations
 */
function createDefaultState(): StateVersion {
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
  logger.info('=== Autonomous State Manager ===');
  const state = loadState();
  if (state) {
    logger.info('State loaded successfully');
    logger.info(`Version: ${state.version}`);
    logger.info(`Mode: ${state.mode}`);
    logger.info(`Status: ${state.status}`);
    logger.info(`Active Swarms: ${state.operationalState.activeSwarms}`);
  } else {
    logger.info('No state file found, creating default...');
    saveState(createDefaultState());
    logger.info('Default state created');
  }
}
