"use strict";
/**
 * Budget Panel Component
 *
 * Displays budget information.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatBudget = formatBudget;
function formatBudget(budget) {
    const costPercent = budget.max_cost
        ? (budget.used_cost / budget.max_cost) * 100
        : 0;
    const bar = '█'.repeat(Math.round(costPercent / 5)) + '░'.repeat(20 - Math.round(costPercent / 5));
    return `Cost: $${budget.used_cost.toFixed(2)} / $${budget.max_cost?.toFixed(2) || '∞'} [${bar}] ${costPercent.toFixed(1)}%`;
}
//# sourceMappingURL=BudgetPanel.js.map