/**
 * Dash v2.0 Autonomous State Manager
 * Crash recovery and state persistence for 24/7 autonomous operation
 */
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
/**
 * Load state from file with corruption handling
 */
export declare function loadState(): StateVersion | null;
/**
 * Save state atomically with backup
 */
export declare function saveState(state: StateVersion): boolean;
/**
 * Update health metrics
 */
export declare function updateHealth(metrics: Partial<StateVersion['operationalState']>): StateVersion;
/**
 * Get current escalation level
 */
export declare function getEscalationLevel(): number;
/**
 * Switch operational mode
 */
export declare function setMode(mode: StateVersion['mode']): StateVersion;
/**
 * Record a decision in history
 */
export declare function recordDecision(type: string, result: string, swarmsSpawned: number): void;
/**
 * Schedule a future action
 */
export declare function scheduleAction(action: string, delayMs: number): void;
/**
 * Get recovery point for crash recovery
 */
export declare function getRecoveryPoint(): StateVersion | null;
//# sourceMappingURL=autonomous-state.d.ts.map