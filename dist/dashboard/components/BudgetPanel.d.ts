/**
 * Budget Panel Component
 *
 * Displays budget information.
 */
export interface Budget {
    id: string;
    used_cost: number;
    max_cost?: number;
    used_tokens: number;
    max_tokens?: number;
}
export declare function formatBudget(budget: Budget): string;
//# sourceMappingURL=BudgetPanel.d.ts.map