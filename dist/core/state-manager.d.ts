export interface SystemState {
    version: string;
    lastCheckpoint: Date;
    agents: AgentState[];
    swarms: SwarmState[];
    budgets: BudgetState;
    budgetsConfig: Record<string, unknown>;
    metrics: MetricSnapshot[];
    patterns: Pattern[];
    improvements: Improvement[];
    pendingActions: PendingAction[];
    lastInterview?: InterviewResult;
}
export interface AgentState {
    id: string;
    name: string;
    status: 'running' | 'paused' | 'failed' | 'completed';
    model: string;
    createdAt: Date;
    lastActivity: Date;
    task?: string;
    budget?: number;
}
export interface SwarmState {
    id: string;
    name: string;
    status: 'running' | 'completed' | 'failed' | 'pending';
    createdAt: Date;
    completedAt?: Date;
    spend: number;
    model: string;
    task: string;
    result?: unknown;
    error?: string;
}
export interface BudgetState {
    totalSpend: number;
    agentCount: number;
    swarmCount: number;
    history: BudgetSnapshot[];
}
export interface BudgetSnapshot {
    timestamp: Date;
    totalSpend: number;
    agentCount: number;
    swarmCount: number;
}
export interface MetricSnapshot {
    timestamp: Date;
    testPassRate: number;
    buildDuration: number;
    errorCount: number;
    agentCount: number;
    activeSwarms: number;
    spend: number;
}
export interface Pattern {
    name: string;
    description: string;
    frequency: number;
    evidence: string[];
    firstSeen: Date;
    lastSeen: Date;
    severity: 'low' | 'medium' | 'high';
}
export interface Improvement {
    id: string;
    description: string;
    category: 'fix' | 'feature' | 'refactor' | 'optimization';
    status: 'pending' | 'in_progress' | 'completed' | 'skipped';
    createdAt: Date;
    completedAt?: Date;
    impact?: string;
}
export interface PendingAction {
    id: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: Date;
    retries: number;
}
export interface InterviewResult {
    timestamp: Date;
    findings: string[];
    recommendations: string[];
    priorities: string[];
}
export declare class StateManager {
    private checkpointsDir;
    constructor();
    /**
     * Capture current system state
     */
    captureCurrentState(agents: AgentState[], swarms: SwarmState[], budgets: BudgetState, budgetsConfig: Record<string, unknown>, metrics: MetricSnapshot[], patterns: Pattern[], improvements: Improvement[], pendingActions: PendingAction[], lastInterview?: InterviewResult): Promise<SystemState>;
    /**
     * Save checkpoint to disk
     */
    saveCheckpoint(state: SystemState): Promise<string>;
    /**
     * Load latest checkpoint
     */
    loadLatestCheckpoint(): Promise<SystemState | null>;
    /**
     * Load specific checkpoint
     */
    loadCheckpoint(filepath: string): Promise<SystemState | null>;
    /**
     * List all checkpoints
     */
    listCheckpoints(): Promise<{
        filepath: string;
        timestamp: number;
        size: number;
    }[]>;
    /**
     * Prune checkpoints older than KEEP_HOURS
     */
    pruneOldCheckpoints(): Promise<number>;
    /**
     * Get checkpoint age in hours
     */
    getLatestCheckpointAge(): Promise<number | null>;
    /**
     * Recover from checkpoint
     */
    recoverFromCheckpoint(state: SystemState, options?: {
        restartAgents?: boolean;
        resumeSwarms?: boolean;
        restoreBudgets?: boolean;
        replayActions?: boolean;
    }): Promise<RecoveryResult>;
    private ensureDirectory;
    private dateReviver;
}
export interface RecoveryResult {
    success: boolean;
    agentsRestored: number;
    swarmsResumed: number;
    budgetsRestored: boolean;
    actionsReplayed: number;
    errors: string[];
}
export declare const stateManager: StateManager;
/**
 * Quick save of current state
 */
export declare function saveState(agents: AgentState[], swarms: SwarmState[], budgets: BudgetState, budgetsConfig: Record<string, unknown>): Promise<string>;
/**
 * Quick load of latest state
 */
export declare function loadState(): Promise<SystemState | null>;
/**
 * Get checkpoint status
 */
export declare function getCheckpointStatus(): Promise<{
    count: number;
    latestAge: number | null;
    totalSize: number;
}>;
//# sourceMappingURL=state-manager.d.ts.map