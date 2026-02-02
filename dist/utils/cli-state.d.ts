/**
 * CLI State Persistence
 *
 * Persists CLI connection state to disk so it survives across process restarts.
 * Used by OpenClaw and other commands that need to maintain state between CLI invocations.
 */
export interface OpenClawState {
    connected: boolean;
    mockMode: boolean;
    host?: string;
    port?: number;
    connectedAt?: string;
    lastPing?: string;
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
/**
 * Load the current CLI state from disk
 */
export declare function loadState(): CLIState;
/**
 * Save the CLI state to disk
 */
export declare function saveState(state: Partial<CLIState>): void;
/**
 * Get OpenClaw state
 */
export declare function getOpenClawState(): OpenClawState | undefined;
/**
 * Set OpenClaw state
 */
export declare function setOpenClawState(openclawState: OpenClawState): void;
/**
 * Clear OpenClaw state (disconnect)
 */
export declare function clearOpenClawState(): void;
/**
 * Check if OpenClaw is connected (based on persisted state)
 */
export declare function isOpenClawConnected(): boolean;
/**
 * Check if OpenClaw is in mock mode
 */
export declare function isOpenClawMockMode(): boolean;
/**
 * Get the path to the state file (for debugging)
 */
export declare function getStateFilePath(): string;
/**
 * Reset all CLI state (for testing)
 */
export declare function resetState(): void;
/**
 * Get mock sessions from state
 */
export declare function getMockSessions(): MockSessionData[];
/**
 * Add or update a mock session
 */
export declare function setMockSession(session: MockSessionData): void;
/**
 * Remove a mock session
 */
export declare function removeMockSession(sessionId: string): void;
declare const _default: {
    loadState: typeof loadState;
    saveState: typeof saveState;
    getOpenClawState: typeof getOpenClawState;
    setOpenClawState: typeof setOpenClawState;
    clearOpenClawState: typeof clearOpenClawState;
    isOpenClawConnected: typeof isOpenClawConnected;
    isOpenClawMockMode: typeof isOpenClawMockMode;
    getStateFilePath: typeof getStateFilePath;
    resetState: typeof resetState;
    getMockSessions: typeof getMockSessions;
    setMockSession: typeof setMockSession;
    removeMockSession: typeof removeMockSession;
};
export default _default;
//# sourceMappingURL=cli-state.d.ts.map