/**
 * CLI State Persistence
 * 
 * Persists CLI connection state to disk so it survives across process restarts.
 * Used by OpenClaw and other commands that need to maintain state between CLI invocations.
 */

import { logger } from '../integrations/utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// State file location (in user's home directory for persistence)
const STATE_DIR = path.join(os.homedir(), '.config', 'godel');
const STATE_FILE = path.join(STATE_DIR, 'cli-state.json');

export interface OpenClawState {
  connected: boolean;
  mockMode: boolean;
  host?: string;
  port?: number;
  connectedAt?: string;
  lastPing?: string;
  fallbackReason?: string;
}

export interface MockSessionData {
  sessionId: string;
  agentId: string;
  status: string;
  createdAt: string;
  model?: string;
  task?: string;
}

export interface CLIState {
  openclaw?: OpenClawState;
  version: string;
  updatedAt: string;
  mockSessions?: MockSessionData[];
}

const DEFAULT_STATE: CLIState = {
  version: '1.0.0',
  updatedAt: new Date().toISOString(),
};

/**
 * Ensure the state directory exists
 */
function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

/**
 * Load the current CLI state from disk
 */
export function loadState(): CLIState {
  try {
    ensureStateDir();
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(data) as CLIState;
      // Merge with defaults for backward compatibility
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch (error) {
    logger.error('[cli-state.loadState] Error:', error);
  }
  return { ...DEFAULT_STATE };
}

/**
 * Save the CLI state to disk
 */
export function saveState(state: Partial<CLIState>): void {
  try {
    ensureStateDir();
    const current = loadState();
    const updated: CLIState = {
      ...current,
      ...state,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (error) {
    logger.error('[cli-state.saveState] Error:', error);
  }
}

/**
 * Get OpenClaw state
 */
export function getOpenClawState(): OpenClawState | undefined {
  const state = loadState();
  return state.openclaw;
}

/**
 * Set OpenClaw state
 */
export function setOpenClawState(openclawState: OpenClawState): void {
  saveState({ openclaw: openclawState });
}

/**
 * Clear OpenClaw state (disconnect)
 */
export function clearOpenClawState(): void {
  const state = loadState();
  delete state.openclaw;
  saveState(state);
}

/**
 * Check if OpenClaw is connected (based on persisted state)
 */
export function isOpenClawConnected(): boolean {
  const state = getOpenClawState();
  return state?.connected === true;
}

/**
 * Check if OpenClaw is in mock mode
 */
export function isOpenClawMockMode(): boolean {
  const state = getOpenClawState();
  return state?.mockMode === true;
}

/**
 * Get the path to the state file (for debugging)
 */
export function getStateFilePath(): string {
  return STATE_FILE;
}

/**
 * Reset all CLI state (for testing)
 */
export function resetState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch (error) {
    logger.error('[cli-state.resetState] Error:', error);
  }
}

// ============================================================================
// Mock Session Persistence
// ============================================================================

/**
 * Get mock sessions from state
 */
export function getMockSessions(): MockSessionData[] {
  const state = loadState();
  return state.mockSessions || [];
}

/**
 * Add or update a mock session
 */
export function setMockSession(session: MockSessionData): void {
  const state = loadState();
  const sessions = state.mockSessions || [];
  const existingIndex = sessions.findIndex(s => s.sessionId === session.sessionId);
  
  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.push(session);
  }
  
  saveState({ ...state, mockSessions: sessions });
}

/**
 * Remove a mock session
 */
export function removeMockSession(sessionId: string): void {
  const state = loadState();
  if (state.mockSessions) {
    state.mockSessions = state.mockSessions.filter(s => s.sessionId !== sessionId);
    saveState(state);
  }
}

export default {
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
