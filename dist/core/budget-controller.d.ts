export declare const HARD_LIMITS: {
    maxAgents: number;
    maxConcurrentSwarms: number;
    maxTotalSpendPerDay: number;
    maxSpendPerSwarm: number;
    emergencyBudgetCap: number;
    emergencyAgentCap: number;
    afkBudgetCap: number;
    afkAgentCap: number;
    afkAllowNewSwarms: boolean;
};
export declare const SOFT_LIMITS: {
    warnSpendPerHour: number;
    warnAgentsCount: number;
    warnSwarmsInFlight: number;
    warnTestCoverageDrop: number;
};
export declare const NIGHT_MODE_LIMITS: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    maxAgents: number;
    maxConcurrentSwarms: number;
    maxTotalSpendPerNight: number;
    maxSpendPerHour: number;
    newSwarmsAllowed: boolean;
    criticalFixesAllowed: boolean;
};
export declare const BUDGET_ALERTS: {
    threshold: number;
    action: string;
    notification: string;
}[];
export interface BudgetCheck {
    allowed: boolean;
    reason?: string;
    currentSpend: number;
    remainingBudget: number;
    agentCount: number;
    swarmCount: number;
}
export interface BudgetSnapshot {
    timestamp: Date;
    totalSpend: number;
    agentCount: number;
    swarmCount: number;
    perAgentSpend: number;
    perSwarmSpend: number;
}
export interface NightModeStatus {
    enabled: boolean;
    startHour: number;
    endHour: number;
    currentLimit: typeof NIGHT_MODE_LIMITS;
    timeUntilNextTransition: string;
    isWithinNightHours: boolean;
}
export declare class BudgetController {
    private totalSpend;
    private agentCount;
    private swarmCount;
    private hourSpend;
    private lastHourReset;
    private history;
    private nightModeEnabled;
    private config;
    /**
     * Check if an operation is allowed within current limits
     */
    checkLimits(request?: {
        agentCount?: number;
        swarmBudget?: number;
    }): BudgetCheck;
    /**
     * Record spend for tracking
     */
    recordSpend(amount: number): void;
    /**
     * Update agent count
     */
    updateAgentCount(count: number): void;
    /**
     * Update swarm count
     */
    updateSwarmCount(count: number): void;
    /**
     * Get current status
     */
    getStatus(): {
        totalSpend: number;
        dailyBudget: number;
        percentUsed: number;
        agentCount: number;
        agentCap: number;
        swarmCount: number;
        swarmCap: number;
        remainingBudget: number;
        history: BudgetSnapshot[];
        nightMode: NightModeStatus;
    };
    /**
     * Get night mode status
     */
    getNightModeStatus(): NightModeStatus;
    /**
     * Enable night mode
     */
    enableNightMode(): void;
    /**
     * Disable night mode
     */
    disableNightMode(): void;
    /**
     * Reset daily budget (call at start of new day)
     */
    resetDailyBudget(): void;
    /**
     * Check if we're within budget alerts
     */
    checkAlerts(): {
        threshold: number;
        action: string;
        notification: string;
    }[];
    /**
     * Get per-agent spend average
     */
    getPerAgentSpend(): number;
    /**
     * Get per-swarm spend average
     */
    getPerSwarmSpend(): number;
}
export declare const budgetController: BudgetController;
/**
 * Quick check if an operation is allowed
 */
export declare function canSpend(amount: number): boolean;
/**
 * Quick check if agent can be added
 */
export declare function canAddAgent(): boolean;
/**
 * Get formatted budget status
 */
export declare function getBudgetStatus(): string;
//# sourceMappingURL=budget-controller.d.ts.map