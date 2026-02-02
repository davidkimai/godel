/**
 * Budget Tracker for OpenClaw Agent Cost Management
 *
 * Tracks costs across agents, swarms, and tool usage.
 * Enforces budget limits with automatic agent termination.
 *
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section 4.5
 */
import { UsageMetrics } from './UsageCalculator';
import { SQLiteStorage } from '../../storage/sqlite';
export interface BudgetConfig {
    totalBudget: number;
    perAgentLimit?: number;
    perSwarmLimit?: number;
    warningThreshold: number;
}
export interface BudgetStatus {
    agentId: string;
    swarmId?: string;
    totalSpent: number;
    budgetLimit: number;
    remaining: number;
    percentUsed: number;
    isExceeded: boolean;
    isWarning: boolean;
    lastUpdated: Date;
}
export interface AgentBudgetRecord {
    agentId: string;
    swarmId?: string;
    budgetLimit: number;
    totalSpent: number;
    warningTriggered: boolean;
    killed: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface BudgetAlert {
    type: 'warning' | 'exceeded' | 'killed';
    agentId: string;
    swarmId?: string;
    message: string;
    currentSpent: number;
    budgetLimit: number;
    timestamp: Date;
}
export interface SwarmBudgetSummary {
    swarmId: string;
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    agentCount: number;
    agentsExceeded: string[];
    agentsWarning: string[];
}
export declare class BudgetTracker {
    private storage;
    private agentBudgets;
    private swarmBudgets;
    private alertHandlers;
    private killHandler?;
    private costModel;
    constructor(storage: SQLiteStorage);
    private initializeTables;
    /**
     * Register an agent with a budget limit
     */
    registerAgent(agentId: string, config: BudgetConfig, swarmId?: string): Promise<void>;
    /**
     * Register a swarm with aggregate budget
     */
    registerSwarm(swarmId: string, config: BudgetConfig): Promise<void>;
    /**
     * Track usage for an agent and enforce budget limits
     */
    track(agentId: string, usage: UsageMetrics): Promise<BudgetStatus>;
    /**
     * Track usage from OpenClaw session history
     */
    trackFromSessionHistory(agentId: string, sessionHistory: SessionHistoryEntry[]): Promise<BudgetStatus>;
    /**
     * Check current budget status for an agent
     */
    check(agentId: string): Promise<BudgetStatus>;
    /**
     * Check budget status for an entire swarm
     */
    checkSwarm(swarmId: string): Promise<SwarmBudgetSummary>;
    /**
     * Send warning alert when approaching budget limit
     */
    warn(agentId: string, status: BudgetStatus): Promise<void>;
    /**
     * Handle budget exceeded - kill agent
     */
    private handleBudgetExceeded;
    /**
     * Get usage metrics aggregated across all agents
     */
    getAggregateMetrics(): Promise<UsageMetrics>;
    /**
     * Get budget report for all agents and swarms
     */
    getBudgetReport(): Promise<string>;
    /**
     * Set handler for budget alerts
     */
    onAlert(handler: (alert: BudgetAlert) => void): void;
    /**
     * Set handler for agent termination
     */
    onKill(handler: (agentId: string, reason: string) => Promise<void>): void;
    private emitAlert;
    private calculateStatus;
    private getBudgetConfig;
    private calculateCost;
    private updateSwarmSummary;
    private updateSwarmSpent;
    private persistAgentRecord;
    /**
     * Unregister an agent and clean up
     */
    unregisterAgent(agentId: string): Promise<void>;
    /**
     * Reset all budgets (for testing)
     */
    reset(): Promise<void>;
}
export interface SessionHistoryEntry {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokens?: {
        input?: number;
        output?: number;
    };
    tools?: Array<{
        name: string;
        input: unknown;
        output?: unknown;
    }>;
    timestamp: string;
}
export declare class BudgetError extends Error {
    constructor(message: string);
}
export declare class BudgetExceededError extends BudgetError {
    readonly agentId: string;
    readonly spent: number;
    readonly limit: number;
    constructor(agentId: string, spent: number, limit: number);
}
export declare function getBudgetTracker(storage: SQLiteStorage): BudgetTracker;
export declare function resetBudgetTracker(): void;
//# sourceMappingURL=BudgetTracker.d.ts.map