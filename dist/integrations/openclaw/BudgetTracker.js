"use strict";
/**
 * Budget Tracker for OpenClaw Agent Cost Management
 *
 * Tracks costs across agents, swarms, and tool usage.
 * Enforces budget limits with automatic agent termination.
 *
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section 4.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetExceededError = exports.BudgetError = exports.BudgetTracker = void 0;
exports.getBudgetTracker = getBudgetTracker;
exports.resetBudgetTracker = resetBudgetTracker;
const utils_1 = require("../../utils");
// ============================================================================
// Budget Tracker
// ============================================================================
class BudgetTracker {
    constructor(storage) {
        this.agentBudgets = new Map();
        this.swarmBudgets = new Map();
        this.alertHandlers = [];
        // Default cost model (can be overridden)
        this.costModel = {
            inputTokenCost: 0.000003, // $3 per 1M input tokens
            outputTokenCost: 0.000015, // $15 per 1M output tokens
            toolBaseCost: 0.001, // $0.001 per tool call
        };
        this.storage = storage;
        this.initializeTables();
    }
    // ========================================================================
    // Initialization
    // ========================================================================
    async initializeTables() {
        // Create budget tracking table using run() method
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS openclaw_budgets (
        agent_id TEXT PRIMARY KEY,
        swarm_id TEXT,
        budget_limit REAL NOT NULL,
        total_spent REAL DEFAULT 0,
        warning_triggered INTEGER DEFAULT 0,
        killed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;
        try {
            await this.storage.run(createTableSQL);
            // Create indexes
            await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_budgets_swarm ON openclaw_budgets(swarm_id)`);
            await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_budgets_killed ON openclaw_budgets(killed)`);
        }
        catch (error) {
            utils_1.logger.error('BudgetTracker', 'Failed to initialize budget tables', { error: String(error) });
            throw error;
        }
    }
    // ========================================================================
    // Budget Registration
    // ========================================================================
    /**
     * Register an agent with a budget limit
     */
    async registerAgent(agentId, config, swarmId) {
        const budgetLimit = config.perAgentLimit ?? config.totalBudget;
        const record = {
            agentId,
            swarmId,
            budgetLimit,
            totalSpent: 0,
            warningTriggered: false,
            killed: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        // Store in memory
        this.agentBudgets.set(agentId, record);
        // Persist to database
        await this.storage.run(`INSERT OR REPLACE INTO openclaw_budgets 
       (agent_id, swarm_id, budget_limit, total_spent, warning_triggered, killed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, agentId, swarmId || null, budgetLimit, 0, 0, 0, record.createdAt.toISOString(), record.updatedAt.toISOString());
        // Update swarm summary if applicable
        if (swarmId) {
            this.updateSwarmSummary(swarmId, config);
        }
        utils_1.logger.info('BudgetTracker', 'Registered agent with budget', { agentId, budgetLimit });
    }
    /**
     * Register a swarm with aggregate budget
     */
    async registerSwarm(swarmId, config) {
        const summary = {
            swarmId,
            totalBudget: config.totalBudget,
            totalSpent: 0,
            remaining: config.totalBudget,
            agentCount: 0,
            agentsExceeded: [],
            agentsWarning: [],
        };
        this.swarmBudgets.set(swarmId, summary);
        utils_1.logger.info('BudgetTracker', 'Registered swarm with budget', { swarmId, totalBudget: config.totalBudget });
    }
    // ========================================================================
    // Usage Tracking
    // ========================================================================
    /**
     * Track usage for an agent and enforce budget limits
     */
    async track(agentId, usage) {
        const record = this.agentBudgets.get(agentId);
        if (!record) {
            throw new BudgetError(`Agent ${agentId} not registered with budget tracker`);
        }
        if (record.killed) {
            throw new BudgetExceededError(agentId, record.totalSpent, record.budgetLimit);
        }
        // Calculate new total
        const previousSpent = record.totalSpent;
        const newSpent = previousSpent + usage.totalSpent;
        // Update record
        record.totalSpent = newSpent;
        record.updatedAt = new Date();
        // Persist to database
        await this.persistAgentRecord(record);
        // Update swarm summary
        if (record.swarmId) {
            this.updateSwarmSpent(record.swarmId, usage.totalSpent);
        }
        // Check budget status
        const status = this.calculateStatus(agentId, record);
        // Handle warning threshold
        const config = await this.getBudgetConfig(agentId);
        if (status.isWarning && !record.warningTriggered) {
            record.warningTriggered = true;
            await this.persistAgentRecord(record);
            await this.warn(agentId, status);
        }
        // Handle budget exceeded
        if (status.isExceeded) {
            await this.handleBudgetExceeded(agentId, status);
        }
        return status;
    }
    /**
     * Track usage from OpenClaw session history
     */
    async trackFromSessionHistory(agentId, sessionHistory) {
        const record = this.agentBudgets.get(agentId);
        if (!record) {
            throw new BudgetError(`Agent ${agentId} not registered`);
        }
        // Calculate usage from session history
        let inputTokens = 0;
        let outputTokens = 0;
        let toolCalls = 0;
        for (const entry of sessionHistory) {
            if (entry.tokens) {
                inputTokens += entry.tokens.input || 0;
                outputTokens += entry.tokens.output || 0;
            }
            if (entry.tools) {
                toolCalls += entry.tools.length;
            }
        }
        const usage = {
            totalSpent: this.calculateCost(inputTokens, outputTokens, toolCalls),
            agentBreakdown: { [agentId]: this.calculateCost(inputTokens, outputTokens, toolCalls) },
            toolBreakdown: {},
            tokenBreakdown: {
                input: inputTokens,
                output: outputTokens,
                total: inputTokens + outputTokens,
            },
        };
        return this.track(agentId, usage);
    }
    // ========================================================================
    // Budget Checking
    // ========================================================================
    /**
     * Check current budget status for an agent
     */
    async check(agentId) {
        const record = this.agentBudgets.get(agentId);
        if (!record) {
            throw new BudgetError(`Agent ${agentId} not registered`);
        }
        return this.calculateStatus(agentId, record);
    }
    /**
     * Check budget status for an entire swarm
     */
    async checkSwarm(swarmId) {
        const summary = this.swarmBudgets.get(swarmId);
        if (!summary) {
            throw new BudgetError(`Swarm ${swarmId} not registered`);
        }
        // Recalculate from all agents in swarm
        const agents = Array.from(this.agentBudgets.values()).filter(a => a.swarmId === swarmId);
        summary.totalSpent = agents.reduce((sum, a) => sum + a.totalSpent, 0);
        summary.remaining = summary.totalBudget - summary.totalSpent;
        summary.agentCount = agents.length;
        summary.agentsExceeded = agents.filter(a => a.totalSpent > a.budgetLimit).map(a => a.agentId);
        summary.agentsWarning = agents
            .filter(a => {
            const percentUsed = a.totalSpent / a.budgetLimit;
            return percentUsed >= 0.8 && a.totalSpent <= a.budgetLimit;
        })
            .map(a => a.agentId);
        return summary;
    }
    // ========================================================================
    // Alerting & Enforcement
    // ========================================================================
    /**
     * Send warning alert when approaching budget limit
     */
    async warn(agentId, status) {
        const alert = {
            type: 'warning',
            agentId,
            swarmId: status.swarmId,
            message: `⚠️ Budget warning: ${(status.percentUsed * 100).toFixed(1)}% used ($${status.totalSpent.toFixed(2)} / $${status.budgetLimit.toFixed(2)})`,
            currentSpent: status.totalSpent,
            budgetLimit: status.budgetLimit,
            timestamp: new Date(),
        };
        utils_1.logger.warn('BudgetTracker', 'Budget warning threshold reached', {
            agentId,
            percentUsed: status.percentUsed,
            totalSpent: status.totalSpent,
            budgetLimit: status.budgetLimit
        });
        this.emitAlert(alert);
    }
    /**
     * Handle budget exceeded - kill agent
     */
    async handleBudgetExceeded(agentId, status) {
        const record = this.agentBudgets.get(agentId);
        if (!record || record.killed)
            return;
        // Mark as killed
        record.killed = true;
        record.updatedAt = new Date();
        await this.persistAgentRecord(record);
        // Emit exceeded alert
        const exceededAlert = {
            type: 'exceeded',
            agentId,
            swarmId: status.swarmId,
            message: `🚫 Budget exceeded: $${status.totalSpent.toFixed(2)} / $${status.budgetLimit.toFixed(2)}`,
            currentSpent: status.totalSpent,
            budgetLimit: status.budgetLimit,
            timestamp: new Date(),
        };
        this.emitAlert(exceededAlert);
        // Kill the agent
        if (this.killHandler) {
            utils_1.logger.info('BudgetTracker', 'Killing agent due to budget exhaustion', { agentId, totalSpent: status.totalSpent, budgetLimit: status.budgetLimit });
            await this.killHandler(agentId, `Budget exceeded: $${status.totalSpent.toFixed(2)} / $${status.budgetLimit.toFixed(2)}`);
            // Emit killed alert
            const killedAlert = {
                type: 'killed',
                agentId,
                swarmId: status.swarmId,
                message: `☠️ Agent ${agentId} killed due to budget exhaustion`,
                currentSpent: status.totalSpent,
                budgetLimit: status.budgetLimit,
                timestamp: new Date(),
            };
            this.emitAlert(killedAlert);
        }
        else {
            utils_1.logger.warn('BudgetTracker', 'No kill handler set for agent. Budget exceeded but agent not killed.', { agentId, totalSpent: status.totalSpent, budgetLimit: status.budgetLimit });
        }
    }
    // ========================================================================
    // Aggregation & Reporting
    // ========================================================================
    /**
     * Get usage metrics aggregated across all agents
     */
    async getAggregateMetrics() {
        const agents = Array.from(this.agentBudgets.values());
        const agentBreakdown = {};
        const toolBreakdown = {};
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalSpent = 0;
        for (const agent of agents) {
            agentBreakdown[agent.agentId] = agent.totalSpent;
            totalSpent += agent.totalSpent;
        }
        // Load tool breakdown from database
        try {
            const toolRows = await this.storage.all(`
        SELECT tool_name, SUM(cost) as total_cost 
        FROM openclaw_tool_usage 
        GROUP BY tool_name
      `);
            for (const row of toolRows) {
                toolBreakdown[row.tool_name] = row.total_cost;
            }
        }
        catch {
            // Table might not exist yet
        }
        return {
            totalSpent,
            agentBreakdown,
            toolBreakdown,
            tokenBreakdown: {
                input: totalInputTokens,
                output: totalOutputTokens,
                total: totalInputTokens + totalOutputTokens,
            },
        };
    }
    /**
     * Get budget report for all agents and swarms
     */
    async getBudgetReport() {
        const agents = Array.from(this.agentBudgets.values());
        const swarms = Array.from(this.swarmBudgets.values());
        let report = '\n╔══════════════════════════════════════════════════════════════╗\n';
        report += '║           OPENCLAW BUDGET REPORT                             ║\n';
        report += '╠══════════════════════════════════════════════════════════════╣\n';
        // Swarm summary
        report += '║ SWARMS:\n';
        for (const swarm of swarms) {
            const percentUsed = (swarm.totalSpent / swarm.totalBudget) * 100;
            report += `║   ${swarm.swarmId}\n`;
            report += `║     Budget: $${swarm.totalSpent.toFixed(2)} / $${swarm.totalBudget.toFixed(2)} (${percentUsed.toFixed(1)}%)\n`;
            report += `║     Agents: ${swarm.agentCount}, Exceeded: ${swarm.agentsExceeded.length}, Warning: ${swarm.agentsWarning.length}\n`;
        }
        report += '╠══════════════════════════════════════════════════════════════╣\n';
        report += '║ AGENTS:\n';
        // Group by swarm
        const agentsBySwarm = new Map();
        for (const agent of agents) {
            const list = agentsBySwarm.get(agent.swarmId) || [];
            list.push(agent);
            agentsBySwarm.set(agent.swarmId, list);
        }
        for (const [swarmId, swarmAgents] of Array.from(agentsBySwarm.entries())) {
            report += `║   ${swarmId || 'no-swarm'}:\n`;
            for (const agent of swarmAgents) {
                const status = agent.killed ? '☠️' : agent.totalSpent > agent.budgetLimit ? '🚫' : agent.warningTriggered ? '⚠️' : '✅';
                const percentUsed = (agent.totalSpent / agent.budgetLimit) * 100;
                report += `║     ${status} ${agent.agentId}: $${agent.totalSpent.toFixed(2)} / $${agent.budgetLimit.toFixed(2)} (${percentUsed.toFixed(1)}%)\n`;
            }
        }
        report += '╚══════════════════════════════════════════════════════════════╝\n';
        return report;
    }
    // ========================================================================
    // Event Handlers
    // ========================================================================
    /**
     * Set handler for budget alerts
     */
    onAlert(handler) {
        this.alertHandlers.push(handler);
    }
    /**
     * Set handler for agent termination
     */
    onKill(handler) {
        this.killHandler = handler;
    }
    emitAlert(alert) {
        for (const handler of this.alertHandlers) {
            try {
                handler(alert);
            }
            catch (error) {
                utils_1.logger.error('BudgetTracker', 'Alert handler error', { error: String(error) });
            }
        }
    }
    // ========================================================================
    // Helper Methods
    // ========================================================================
    calculateStatus(agentId, record) {
        const percentUsed = record.totalSpent / record.budgetLimit;
        const config = { warningThreshold: 0.8 }; // Default
        return {
            agentId,
            swarmId: record.swarmId,
            totalSpent: record.totalSpent,
            budgetLimit: record.budgetLimit,
            remaining: record.budgetLimit - record.totalSpent,
            percentUsed,
            isExceeded: record.totalSpent > record.budgetLimit,
            isWarning: percentUsed >= config.warningThreshold && !record.killed,
            lastUpdated: record.updatedAt,
        };
    }
    async getBudgetConfig(agentId) {
        // In real implementation, this would load from config storage
        return {
            totalBudget: 10.0,
            warningThreshold: 0.8,
        };
    }
    calculateCost(inputTokens, outputTokens, toolCalls) {
        const inputCost = inputTokens * this.costModel.inputTokenCost;
        const outputCost = outputTokens * this.costModel.outputTokenCost;
        const toolCost = toolCalls * this.costModel.toolBaseCost;
        return inputCost + outputCost + toolCost;
    }
    updateSwarmSummary(swarmId, config) {
        let summary = this.swarmBudgets.get(swarmId);
        if (!summary) {
            summary = {
                swarmId,
                totalBudget: config.totalBudget,
                totalSpent: 0,
                remaining: config.totalBudget,
                agentCount: 0,
                agentsExceeded: [],
                agentsWarning: [],
            };
        }
        summary.agentCount++;
        this.swarmBudgets.set(swarmId, summary);
    }
    updateSwarmSpent(swarmId, amount) {
        const summary = this.swarmBudgets.get(swarmId);
        if (summary) {
            summary.totalSpent += amount;
            summary.remaining = summary.totalBudget - summary.totalSpent;
        }
    }
    async persistAgentRecord(record) {
        await this.storage.run(`UPDATE openclaw_budgets 
       SET total_spent = ?, warning_triggered = ?, killed = ?, updated_at = ?
       WHERE agent_id = ?`, record.totalSpent, record.warningTriggered ? 1 : 0, record.killed ? 1 : 0, record.updatedAt.toISOString(), record.agentId);
    }
    // ========================================================================
    // Cleanup
    // ========================================================================
    /**
     * Unregister an agent and clean up
     */
    async unregisterAgent(agentId) {
        this.agentBudgets.delete(agentId);
        await this.storage.run(`DELETE FROM openclaw_budgets WHERE agent_id = ?`, agentId);
        utils_1.logger.info('BudgetTracker', 'Unregistered agent', { agentId });
    }
    /**
     * Reset all budgets (for testing)
     */
    async reset() {
        this.agentBudgets.clear();
        this.swarmBudgets.clear();
        await this.storage.run('DELETE FROM openclaw_budgets');
        utils_1.logger.info('BudgetTracker', 'All budgets reset');
    }
}
exports.BudgetTracker = BudgetTracker;
// ============================================================================
// Errors
// ============================================================================
class BudgetError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BudgetError';
    }
}
exports.BudgetError = BudgetError;
class BudgetExceededError extends BudgetError {
    constructor(agentId, spent, limit) {
        super(`Budget exceeded for agent ${agentId}: $${spent.toFixed(2)} / $${limit.toFixed(2)}`);
        this.name = 'BudgetExceededError';
        this.agentId = agentId;
        this.spent = spent;
        this.limit = limit;
    }
}
exports.BudgetExceededError = BudgetExceededError;
// ============================================================================
// Factory
// ============================================================================
let globalBudgetTracker = null;
function getBudgetTracker(storage) {
    if (!globalBudgetTracker) {
        globalBudgetTracker = new BudgetTracker(storage);
    }
    return globalBudgetTracker;
}
function resetBudgetTracker() {
    globalBudgetTracker = null;
}
//# sourceMappingURL=BudgetTracker.js.map