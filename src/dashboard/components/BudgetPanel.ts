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

export function formatBudget(budget: Budget): string {
  const costPercent = budget.max_cost 
    ? (budget.used_cost / budget.max_cost) * 100 
    : 0;
  
  const bar = '█'.repeat(Math.round(costPercent / 5)) + '░'.repeat(20 - Math.round(costPercent / 5));
  
  return `Cost: $${budget.used_cost.toFixed(2)} / $${budget.max_cost?.toFixed(2) || '∞'} [${bar}] ${costPercent.toFixed(1)}%`;
}
