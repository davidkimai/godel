/**
 * Budget Repository
 *
 * CRUD operations for budgets with atomic consumption tracking.
 */
export interface Budget {
    id: string;
    scope_type: 'swarm' | 'agent' | 'project';
    scope_id: string;
    max_tokens?: number;
    max_cost?: number;
    used_tokens: number;
    used_cost: number;
    created_at: string;
}
export interface BudgetUsage {
    tokens: number;
    cost: number;
    percentageTokens: number;
    percentageCost: number;
    isExceeded: boolean;
}
export declare class BudgetRepository {
    create(data: Omit<Budget, 'id' | 'used_tokens' | 'used_cost' | 'created_at'>): Promise<Budget>;
    findById(id: string): Promise<Budget | undefined>;
    findByScope(scopeType: Budget['scope_type'], scopeId: string): Promise<Budget | undefined>;
    getUsage(id: string): Promise<BudgetUsage | undefined>;
    addUsage(id: string, tokens: number, cost: number): Promise<void>;
    /**
     * Atomically consume budget - checks limits and updates if allowed.
     * Returns true if consumption was allowed, false if budget exceeded.
     */
    consumeBudget(id: string, tokens: number, cost: number): Promise<boolean>;
    isExceeded(id: string): Promise<boolean>;
    private checkExceeded;
    delete(id: string): Promise<boolean>;
    list(): Promise<Budget[]>;
}
//# sourceMappingURL=BudgetRepository.d.ts.map