/**
 * Budget Repository
 * 
 * CRUD operations for budgets with atomic consumption tracking.
 */

import { getDb } from '../sqlite';

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

export class BudgetRepository {
  async create(data: Omit<Budget, 'id' | 'used_tokens' | 'used_cost' | 'created_at'>): Promise<Budget> {
    const db = await getDb();
    const id = `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const budget: Budget = {
      id,
      scope_type: data.scope_type,
      scope_id: data.scope_id,
      max_tokens: data.max_tokens,
      max_cost: data.max_cost,
      used_tokens: 0,
      used_cost: 0,
      created_at: new Date().toISOString()
    };

    await db.run(
      `INSERT INTO budgets (id, scope_type, scope_id, max_tokens, max_cost, 
        used_tokens, used_cost, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [budget.id, budget.scope_type, budget.scope_id, budget.max_tokens,
       budget.max_cost, budget.used_tokens, budget.used_cost, budget.created_at]
    );

    return budget;
  }

  async findById(id: string): Promise<Budget | undefined> {
    const db = await getDb();
    return db.get('SELECT * FROM budgets WHERE id = ?', [id]);
  }

  async findByScope(scopeType: Budget['scope_type'], scopeId: string): Promise<Budget | undefined> {
    const db = await getDb();
    return db.get(
      'SELECT * FROM budgets WHERE scope_type = ? AND scope_id = ?',
      [scopeType, scopeId]
    );
  }

  async getUsage(id: string): Promise<BudgetUsage | undefined> {
    const budget = await this.findById(id);
    if (!budget) return undefined;

    const percentageTokens = budget.max_tokens 
      ? (budget.used_tokens / budget.max_tokens) * 100 
      : 0;
    const percentageCost = budget.max_cost 
      ? (budget.used_cost / budget.max_cost) * 100 
      : 0;

    return {
      tokens: budget.used_tokens,
      cost: budget.used_cost,
      percentageTokens,
      percentageCost,
      isExceeded: this.checkExceeded(budget)
    };
  }

  async addUsage(id: string, tokens: number, cost: number): Promise<void> {
    const db = await getDb();
    await db.run(
      `UPDATE budgets 
       SET used_tokens = used_tokens + ?,
           used_cost = used_cost + ?
       WHERE id = ?`,
      [tokens, cost, id]
    );
  }

  /**
   * Atomically consume budget - checks limits and updates if allowed.
   * Returns true if consumption was allowed, false if budget exceeded.
   */
  async consumeBudget(id: string, tokens: number, cost: number): Promise<boolean> {
    const db = await getDb();
    
    return db.withTransaction(async () => {
      const budget = await this.findById(id);
      if (!budget) return false;

      const newTokens = budget.used_tokens + tokens;
      const newCost = budget.used_cost + cost;

      // Check limits
      if (budget.max_tokens && newTokens > budget.max_tokens) {
        return false;
      }
      if (budget.max_cost && newCost > budget.max_cost) {
        return false;
      }

      // Update within transaction
      await db.run(
        `UPDATE budgets SET used_tokens = ?, used_cost = ? WHERE id = ?`,
        [newTokens, newCost, id]
      );

      return true;
    });
  }

  async isExceeded(id: string): Promise<boolean> {
    const budget = await this.findById(id);
    if (!budget) return true;
    return this.checkExceeded(budget);
  }

  private checkExceeded(budget: Budget): boolean {
    if (budget.max_tokens && budget.used_tokens >= budget.max_tokens) {
      return true;
    }
    if (budget.max_cost && budget.used_cost >= budget.max_cost) {
      return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.run('DELETE FROM budgets WHERE id = ?', [id]);
    return (result.changes || 0) > 0;
  }

  async list(): Promise<Budget[]> {
    const db = await getDb();
    return db.all('SELECT * FROM budgets ORDER BY created_at DESC');
  }
}
