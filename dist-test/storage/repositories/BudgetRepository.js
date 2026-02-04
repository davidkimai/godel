"use strict";
/**
 * Budget Repository - PostgreSQL Implementation
 *
 * Full CRUD operations for budgets with PostgreSQL persistence.
 * Supports atomic budget consumption operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetRepository = void 0;
const pool_1 = require("../postgres/pool");
class BudgetRepository {
    constructor(config) {
        this.pool = null;
        this.config = config;
    }
    /**
     * Initialize the repository with a database pool
     */
    async initialize() {
        this.pool = await (0, pool_1.getPool)(this.config);
    }
    /**
     * Create a new budget
     */
    async create(input) {
        this.ensureInitialized();
        const result = await this.pool.query(`INSERT INTO budgets (
        swarm_id, scope_type, scope_id, allocated, consumed, currency, max_tokens, used_tokens
      ) VALUES ($1, $2, $3, $4, 0, $5, $6, 0)
      RETURNING *`, [
            input.swarm_id,
            input.scope_type || 'swarm',
            input.scope_id,
            input.allocated,
            input.currency || 'USD',
            input.max_tokens || null,
        ]);
        return this.mapRow(result.rows[0]);
    }
    /**
     * Find a budget by ID
     */
    async findById(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM budgets WHERE id = $1`, [id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Find budget by scope (type + id)
     */
    async findByScope(scopeType, scopeId) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM budgets WHERE scope_type = $1 AND scope_id = $2`, [scopeType, scopeId]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Find budgets by swarm ID
     */
    async findBySwarmId(swarmId) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM budgets WHERE swarm_id = $1 ORDER BY created_at DESC`, [swarmId]);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Update a budget
     */
    async update(id, input) {
        this.ensureInitialized();
        const updates = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Delete a budget by ID
     */
    async delete(id) {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM budgets WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
    /**
     * List budgets with filtering and pagination
     */
    async list(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
        let paramIndex = 1;
        if (filter.swarm_id) {
            conditions.push(`swarm_id = $${paramIndex++}`);
            values.push(filter.swarm_id);
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
        const result = await this.pool.query(query, values);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Get budget usage statistics
     */
    async getUsage(id) {
        const budget = await this.findById(id);
        if (!budget)
            return null;
        return this.calculateUsage(budget);
    }
    /**
     * Get budget usage by scope
     */
    async getUsageByScope(scopeType, scopeId) {
        const budget = await this.findByScope(scopeType, scopeId);
        if (!budget)
            return null;
        return this.calculateUsage(budget);
    }
    /**
     * Atomically consume budget - checks limits and updates if allowed.
     * Returns true if consumption was allowed, false if budget exceeded.
     */
    async consumeBudget(id, tokens, cost) {
        this.ensureInitialized();
        return this.pool.withTransaction(async (client) => {
            // Lock the row for update
            const budgetResult = await client.query('SELECT * FROM budgets WHERE id = $1 FOR UPDATE', [id]);
            if (budgetResult.rows.length === 0)
                return false;
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
            await client.query(`UPDATE budgets 
         SET used_tokens = $1, consumed = $2, updated_at = NOW()
         WHERE id = $3`, [newTokens, newCost, id]);
            return true;
        });
    }
    /**
     * Add usage to budget (without limit checking)
     */
    async addUsage(id, tokens, cost) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE budgets 
       SET used_tokens = used_tokens + $1,
           consumed = consumed + $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`, [tokens, cost, id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Check if budget is exceeded
     */
    async isExceeded(id) {
        const budget = await this.findById(id);
        if (!budget)
            return true;
        return this.checkExceeded(budget);
    }
    /**
     * Get total budget summary for a swarm
     */
    async getSwarmBudgetSummary(swarmId) {
        this.ensureInitialized();
        const budgets = await this.findBySwarmId(swarmId);
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
    async resetConsumption(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE budgets 
       SET consumed = 0, used_tokens = 0, updated_at = NOW()
       WHERE id = $1
       RETURNING *`, [id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Delete all budgets for a swarm
     */
    async deleteBySwarmId(swarmId) {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM budgets WHERE swarm_id = $1', [swarmId]);
        return result.rowCount;
    }
    // ============================================================================
    // Private helpers
    // ============================================================================
    ensureInitialized() {
        if (!this.pool) {
            throw new Error('BudgetRepository not initialized. Call initialize() first.');
        }
    }
    calculateUsage(budget) {
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
    checkExceeded(budget) {
        if (budget.max_tokens !== null && budget.max_tokens !== undefined &&
            budget.used_tokens >= budget.max_tokens) {
            return true;
        }
        if (budget.consumed >= budget.allocated) {
            return true;
        }
        return false;
    }
    mapRow(row) {
        return {
            id: row.id,
            swarm_id: row.swarm_id,
            scope_type: row.scope_type,
            scope_id: row.scope_id,
            allocated: parseFloat(String(row.allocated)),
            consumed: parseFloat(String(row.consumed)),
            currency: row.currency,
            max_tokens: row.max_tokens || undefined,
            used_tokens: row.used_tokens || 0,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at),
        };
    }
}
exports.BudgetRepository = BudgetRepository;
exports.default = BudgetRepository;
