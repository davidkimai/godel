/**
 * Budget Repository - PostgreSQL Implementation
 * 
 * Full CRUD operations for budgets with PostgreSQL persistence.
 * Supports atomic budget consumption operations.
 */

import { PostgresPool, getPool } from '../postgres/pool';
import type { PostgresConfig } from '../postgres/config';

export type ScopeType = 'team' | 'agent' | 'project';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD';

export interface Budget {
  id: string;
  team_id: string;
  scope_type: ScopeType;
  scope_id: string;
  allocated: number;
  consumed: number;
  currency: Currency;
  max_tokens?: number;
  used_tokens: number;
  created_at: Date;
  updated_at: Date;
}

export interface BudgetCreateInput {
  team_id: string;
  scope_type?: ScopeType;
  scope_id: string;
  allocated: number;
  currency?: Currency;
  max_tokens?: number;
}

export interface BudgetUpdateInput {
  allocated?: number;
  currency?: Currency;
  max_tokens?: number;
}

export interface BudgetUsage {
  tokens: number;
  cost: number;
  percentageTokens: number;
  percentageCost: number;
  isExceeded: boolean;
  remainingTokens: number;
  remainingCost: number;
}

export interface BudgetFilter {
  team_id?: string;
  scope_type?: ScopeType;
  currency?: Currency;
  limit?: number;
  offset?: number;
}

export class BudgetRepository {
  private pool: PostgresPool | null = null;
  private config?: Partial<PostgresConfig>;

  constructor(config?: Partial<PostgresConfig>) {
    this.config = config;
  }

  /**
   * Initialize the repository with a database pool
   */
  async initialize(): Promise<void> {
    this.pool = await getPool(this.config);
  }

  /**
   * Create a new budget
   */
  async create(input: BudgetCreateInput): Promise<Budget> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<BudgetRow>(
      `INSERT INTO budgets (
        team_id, scope_type, scope_id, allocated, consumed, currency, max_tokens, used_tokens
      ) VALUES ($1, $2, $3, $4, 0, $5, $6, 0)
      RETURNING *`,
      [
        input.team_id,
        input.scope_type || 'team',
        input.scope_id,
        input.allocated,
        input.currency || 'USD',
        input.max_tokens || null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find a budget by ID
   */
  async findById(id: string): Promise<Budget | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<BudgetRow>(
      `SELECT * FROM budgets WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find budget by scope (type + id)
   */
  async findByScope(scopeType: ScopeType, scopeId: string): Promise<Budget | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<BudgetRow>(
      `SELECT * FROM budgets WHERE scope_type = $1 AND scope_id = $2`,
      [scopeType, scopeId]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find budgets by team ID
   */
  async findByTeamId(teamId: string): Promise<Budget[]> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<BudgetRow>(
      `SELECT * FROM budgets WHERE team_id = $1 ORDER BY created_at DESC`,
      [teamId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Update a budget
   */
  async update(id: string, input: BudgetUpdateInput): Promise<Budget | null> {
    this.ensureInitialized();
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.allocated !== undefined) {
      updates.push(`allocated = $${paramIndex++}`);
      values.push(input.allocated);
    }
    if (input.currency !== undefined) {
      updates.push(`currency = $${paramIndex++}`);
      values.push(input.currency);
    }
    if (input.max_tokens !== undefined) {
      updates.push(`max_tokens = $${paramIndex++}`);
      values.push(input.max_tokens);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE budgets 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool!.query<BudgetRow>(query, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete a budget by ID
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM budgets WHERE id = $1',
      [id]
    );

    return result.rowCount > 0;
  }

  /**
   * List budgets with filtering and pagination
   */
  async list(filter: BudgetFilter = {}): Promise<Budget[]> {
    this.ensureInitialized();
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.team_id) {
      conditions.push(`team_id = $${paramIndex++}`);
      values.push(filter.team_id);
    }
    if (filter.scope_type) {
      conditions.push(`scope_type = $${paramIndex++}`);
      values.push(filter.scope_type);
    }
    if (filter.currency) {
      conditions.push(`currency = $${paramIndex++}`);
      values.push(filter.currency);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    let query = `SELECT * FROM budgets ${whereClause} ORDER BY created_at DESC`;

    if (filter.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filter.limit);
    }

    if (filter.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filter.offset);
    }

    const result = await this.pool!.query<BudgetRow>(query, values);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get budget usage statistics
   */
  async getUsage(id: string): Promise<BudgetUsage | null> {
    const budget = await this.findById(id);
    if (!budget) return null;

    return this.calculateUsage(budget);
  }

  /**
   * Get budget usage by scope
   */
  async getUsageByScope(scopeType: ScopeType, scopeId: string): Promise<BudgetUsage | null> {
    const budget = await this.findByScope(scopeType, scopeId);
    if (!budget) return null;

    return this.calculateUsage(budget);
  }

  /**
   * Atomically consume budget - checks limits and updates if allowed.
   * Returns true if consumption was allowed, false if budget exceeded.
   */
  async consumeBudget(id: string, tokens: number, cost: number): Promise<boolean> {
    this.ensureInitialized();
    
    return this.pool!.withTransaction(async (client) => {
      // Lock the row for update
      const budgetResult = await client.query<BudgetRow>(
        'SELECT * FROM budgets WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (budgetResult.rows.length === 0) return false;
      
      const budget = this.mapRow(budgetResult.rows[0]);
      const newTokens = budget.used_tokens + tokens;
      const newCost = budget.consumed + cost;

      // Check limits
      if (budget.max_tokens !== null && budget.max_tokens !== undefined && newTokens > budget.max_tokens) {
        return false;
      }
      if (newCost > budget.allocated) {
        return false;
      }

      // Update within transaction
      await client.query(
        `UPDATE budgets 
         SET used_tokens = $1, consumed = $2, updated_at = NOW()
         WHERE id = $3`,
        [newTokens, newCost, id]
      );

      return true;
    });
  }

  /**
   * Add usage to budget (without limit checking)
   */
  async addUsage(id: string, tokens: number, cost: number): Promise<Budget | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<BudgetRow>(
      `UPDATE budgets 
       SET used_tokens = used_tokens + $1,
           consumed = consumed + $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [tokens, cost, id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Check if budget is exceeded
   */
  async isExceeded(id: string): Promise<boolean> {
    const budget = await this.findById(id);
    if (!budget) return true;
    return this.checkExceeded(budget);
  }

  /**
   * Get total budget summary for a team
   */
  async getTeamBudgetSummary(teamId: string): Promise<{
    totalAllocated: number;
    totalConsumed: number;
    totalRemaining: number;
    percentageUsed: number;
    budgets: Budget[];
  }> {
    this.ensureInitialized();
    
    const budgets = await this.findByTeamId(teamId);
    
    const totalAllocated = budgets.reduce((sum, b) => sum + b.allocated, 0);
    const totalConsumed = budgets.reduce((sum, b) => sum + b.consumed, 0);
    const totalRemaining = totalAllocated - totalConsumed;
    const percentageUsed = totalAllocated > 0 ? (totalConsumed / totalAllocated) * 100 : 0;

    return {
      totalAllocated,
      totalConsumed,
      totalRemaining,
      percentageUsed,
      budgets,
    };
  }

  /**
   * Reset budget consumption (use with caution!)
   */
  async resetConsumption(id: string): Promise<Budget | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<BudgetRow>(
      `UPDATE budgets 
       SET consumed = 0, used_tokens = 0, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete all budgets for a team
   */
  async deleteByTeamId(teamId: string): Promise<number> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM budgets WHERE team_id = $1',
      [teamId]
    );

    return result.rowCount;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.pool) {
      throw new Error('BudgetRepository not initialized. Call initialize() first.');
    }
  }

  private calculateUsage(budget: Budget): BudgetUsage {
    const percentageTokens = budget.max_tokens 
      ? (budget.used_tokens / budget.max_tokens) * 100 
      : 0;
    const percentageCost = (budget.consumed / budget.allocated) * 100;

    return {
      tokens: budget.used_tokens,
      cost: budget.consumed,
      percentageTokens,
      percentageCost,
      isExceeded: this.checkExceeded(budget),
      remainingTokens: budget.max_tokens ? budget.max_tokens - budget.used_tokens : Infinity,
      remainingCost: budget.allocated - budget.consumed,
    };
  }

  private checkExceeded(budget: Budget): boolean {
    if (budget.max_tokens !== null && budget.max_tokens !== undefined && 
        budget.used_tokens >= budget.max_tokens) {
      return true;
    }
    if (budget.consumed >= budget.allocated) {
      return true;
    }
    return false;
  }

  private mapRow(row: BudgetRow): Budget {
    return {
      id: row.id,
      team_id: row.team_id,
      scope_type: row.scope_type as ScopeType,
      scope_id: row.scope_id,
      allocated: parseFloat(String(row.allocated)),
      consumed: parseFloat(String(row.consumed)),
      currency: row.currency as Currency,
      max_tokens: row.max_tokens || undefined,
      used_tokens: row.used_tokens || 0,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}

// Database row types
interface BudgetRow {
  id: string;
  team_id: string;
  scope_type: string;
  scope_id: string;
  allocated: number | string;
  consumed: number | string;
  currency: string;
  max_tokens?: number;
  used_tokens: number;
  created_at: string;
  updated_at: string;
}

export default BudgetRepository;
