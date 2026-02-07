/**
 * Budget Tracker for OpenClaw Agent Cost Management
 * 
 * Tracks costs across agents, teams, and tool usage.
 * Enforces budget limits with automatic agent termination.
 * 
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section 4.5
 */

import { logger } from '../../utils/logger';
import { UsageMetrics, TokenBreakdown } from './UsageCalculator';
import { SQLiteStorage } from '../../storage/sqlite';

// ============================================================================
// Types
// ============================================================================

export interface BudgetConfig {
  totalBudget: number;        // e.g., $10.00
  perAgentLimit?: number;     // max per agent
  perTeamLimit?: number;     // max per team
  warningThreshold: number;   // e.g., 80% (0.8)
}

export interface BudgetStatus {
  agentId: string;
  teamId?: string;
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
  teamId?: string;
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
  teamId?: string;
  message: string;
  currentSpent: number;
  budgetLimit: number;
  timestamp: Date;
}

export interface TeamBudgetSummary {
  teamId: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  agentCount: number;
  agentsExceeded: string[];
  agentsWarning: string[];
}

// ============================================================================
// Budget Tracker
// ============================================================================

export class BudgetTracker {
  private storage: SQLiteStorage;
  private agentBudgets: Map<string, AgentBudgetRecord> = new Map();
  private swarmBudgets: Map<string, TeamBudgetSummary> = new Map();
  private alertHandlers: ((alert: BudgetAlert) => void)[] = [];
  private killHandler?: (agentId: string, reason: string) => Promise<void>;

  // Default cost model (can be overridden)
  private costModel = {
    inputTokenCost: 0.000003,   // $3 per 1M input tokens
    outputTokenCost: 0.000015,  // $15 per 1M output tokens
    toolBaseCost: 0.001,        // $0.001 per tool call
  };

  constructor(storage: SQLiteStorage) {
    this.storage = storage;
    this.initializeTables();
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  private async initializeTables(): Promise<void> {
    // Create budget tracking table using run() method
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS openclaw_budgets (
        agent_id TEXT PRIMARY KEY,
        team_id TEXT,
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
      await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_budgets_swarm ON openclaw_budgets(team_id)`);
      await this.storage.run(`CREATE INDEX IF NOT EXISTS idx_budgets_killed ON openclaw_budgets(killed)`);
    } catch (error) {
      logger.error('BudgetTracker', 'Failed to initialize budget tables', { error: String(error) });
      throw error;
    }
  }

  // ========================================================================
  // Budget Registration
  // ========================================================================

  /**
   * Register an agent with a budget limit
   */
  async registerAgent(
    agentId: string,
    config: BudgetConfig,
    teamId?: string
  ): Promise<void> {
    const budgetLimit = config.perAgentLimit ?? config.totalBudget;
    
    const record: AgentBudgetRecord = {
      agentId,
      teamId,
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
    await this.storage.run(
      `INSERT OR REPLACE INTO openclaw_budgets 
       (agent_id, team_id, budget_limit, total_spent, warning_triggered, killed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      agentId,
      teamId || null,
      budgetLimit,
      0,
      0,
      0,
      record.createdAt.toISOString(),
      record.updatedAt.toISOString()
    );

    // Update team summary if applicable
    if (teamId) {
      this.updateTeamSummary(teamId, config);
    }

    logger.info('BudgetTracker', 'Registered agent with budget', { agentId, budgetLimit });
  }

  /**
   * Register a team with aggregate budget
   */
  async registerTeam(
    teamId: string,
    config: BudgetConfig
  ): Promise<void> {
    const summary: TeamBudgetSummary = {
      teamId,
      totalBudget: config.totalBudget,
      totalSpent: 0,
      remaining: config.totalBudget,
      agentCount: 0,
      agentsExceeded: [],
      agentsWarning: [],
    };

    this.swarmBudgets.set(teamId, summary);

    logger.info('BudgetTracker', 'Registered team with budget', { teamId, totalBudget: config.totalBudget });
  }

  // ========================================================================
  // Usage Tracking
  // ========================================================================

  /**
   * Track usage for an agent and enforce budget limits
   */
  async track(agentId: string, usage: UsageMetrics): Promise<BudgetStatus> {
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

    // Update team summary
    if (record.teamId) {
      this.updateTeamSpent(record.teamId, usage.totalSpent);
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
  async trackFromSessionHistory(
    agentId: string,
    sessionHistory: SessionHistoryEntry[]
  ): Promise<BudgetStatus> {
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

    const usage: UsageMetrics = {
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
  async check(agentId: string): Promise<BudgetStatus> {
    const record = this.agentBudgets.get(agentId);
    if (!record) {
      throw new BudgetError(`Agent ${agentId} not registered`);
    }

    return this.calculateStatus(agentId, record);
  }

  /**
   * Check budget status for an entire team
   */
  async checkTeam(teamId: string): Promise<TeamBudgetSummary> {
    const summary = this.swarmBudgets.get(teamId);
    if (!summary) {
      throw new BudgetError(`Team ${teamId} not registered`);
    }

    // Recalculate from all agents in team
    const agents = Array.from(this.agentBudgets.values()).filter(a => a.teamId === teamId);
    
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
  async warn(agentId: string, status: BudgetStatus): Promise<void> {
    const alert: BudgetAlert = {
      type: 'warning',
      agentId,
      teamId: status.teamId,
      message: `⚠️ Budget warning: ${(status.percentUsed * 100).toFixed(1)}% used ($${status.totalSpent.toFixed(2)} / $${status.budgetLimit.toFixed(2)})`,
      currentSpent: status.totalSpent,
      budgetLimit: status.budgetLimit,
      timestamp: new Date(),
    };

    logger.warn('BudgetTracker', 'Budget warning threshold reached', {
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
  private async handleBudgetExceeded(agentId: string, status: BudgetStatus): Promise<void> {
    const record = this.agentBudgets.get(agentId);
    if (!record || record.killed) return;

    // Mark as killed
    record.killed = true;
    record.updatedAt = new Date();
    await this.persistAgentRecord(record);

    // Emit exceeded alert
    const exceededAlert: BudgetAlert = {
      type: 'exceeded',
      agentId,
      teamId: status.teamId,
      message: `🚫 Budget exceeded: $${status.totalSpent.toFixed(2)} / $${status.budgetLimit.toFixed(2)}`,
      currentSpent: status.totalSpent,
      budgetLimit: status.budgetLimit,
      timestamp: new Date(),
    };
    this.emitAlert(exceededAlert);

    // Kill the agent
    if (this.killHandler) {
      logger.info('BudgetTracker', 'Killing agent due to budget exhaustion', { agentId, totalSpent: status.totalSpent, budgetLimit: status.budgetLimit });
      await this.killHandler(agentId, `Budget exceeded: $${status.totalSpent.toFixed(2)} / $${status.budgetLimit.toFixed(2)}`);
      
      // Emit killed alert
      const killedAlert: BudgetAlert = {
        type: 'killed',
        agentId,
        teamId: status.teamId,
        message: `☠️ Agent ${agentId} killed due to budget exhaustion`,
        currentSpent: status.totalSpent,
        budgetLimit: status.budgetLimit,
        timestamp: new Date(),
      };
      this.emitAlert(killedAlert);
    } else {
      logger.warn('BudgetTracker', 'No kill handler set for agent. Budget exceeded but agent not killed.', { agentId, totalSpent: status.totalSpent, budgetLimit: status.budgetLimit });
    }
  }

  // ========================================================================
  // Aggregation & Reporting
  // ========================================================================

  /**
   * Get usage metrics aggregated across all agents
   */
  async getAggregateMetrics(): Promise<UsageMetrics> {
    const agents = Array.from(this.agentBudgets.values());
    
    const agentBreakdown: Record<string, number> = {};
    const toolBreakdown: Record<string, number> = {};
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
      `) as Array<{ tool_name: string; total_cost: number }>;
      
      for (const row of toolRows) {
        toolBreakdown[row.tool_name] = row.total_cost;
      }
    } catch {
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
   * Get budget report for all agents and teams
   */
  async getBudgetReport(): Promise<string> {
    const agents = Array.from(this.agentBudgets.values());
    const teams = Array.from(this.swarmBudgets.values());

    let report = '\n╔══════════════════════════════════════════════════════════════╗\n';
    report += '║           OPENCLAW BUDGET REPORT                             ║\n';
    report += '╠══════════════════════════════════════════════════════════════╣\n';

    // Team summary
    report += '║ TEAMS:\n';
    for (const team of teams) {
      const percentUsed = (team.totalSpent / team.totalBudget) * 100;
      report += `║   ${team.teamId}\n`;
      report += `║     Budget: $${team.totalSpent.toFixed(2)} / $${team.totalBudget.toFixed(2)} (${percentUsed.toFixed(1)}%)\n`;
      report += `║     Agents: ${team.agentCount}, Exceeded: ${team.agentsExceeded.length}, Warning: ${team.agentsWarning.length}\n`;
    }

    report += '╠══════════════════════════════════════════════════════════════╣\n';
    report += '║ AGENTS:\n';
    
    // Group by team
    const agentsByTeam = new Map<string | undefined, AgentBudgetRecord[]>();
    for (const agent of agents) {
      const list = agentsByTeam.get(agent.teamId) || [];
      list.push(agent);
      agentsByTeam.set(agent.teamId, list);
    }

    for (const [teamId, swarmAgents] of Array.from(agentsByTeam.entries())) {
      report += `║   ${teamId || 'no-team'}:\n`;
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
  onAlert(handler: (alert: BudgetAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Set handler for agent termination
   */
  onKill(handler: (agentId: string, reason: string) => Promise<void>): void {
    this.killHandler = handler;
  }

  private emitAlert(alert: BudgetAlert): void {
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        logger.error('BudgetTracker', 'Alert handler error', { error: String(error) });
      }
    }
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private calculateStatus(agentId: string, record: AgentBudgetRecord): BudgetStatus {
    const percentUsed = record.totalSpent / record.budgetLimit;
    const config = { warningThreshold: 0.8 }; // Default

    return {
      agentId,
      teamId: record.teamId,
      totalSpent: record.totalSpent,
      budgetLimit: record.budgetLimit,
      remaining: record.budgetLimit - record.totalSpent,
      percentUsed,
      isExceeded: record.totalSpent > record.budgetLimit,
      isWarning: percentUsed >= config.warningThreshold && !record.killed,
      lastUpdated: record.updatedAt,
    };
  }

  private async getBudgetConfig(agentId: string): Promise<BudgetConfig> {
    // In real implementation, this would load from config storage
    return {
      totalBudget: 10.0,
      warningThreshold: 0.8,
    };
  }

  private calculateCost(inputTokens: number, outputTokens: number, toolCalls: number): number {
    const inputCost = inputTokens * this.costModel.inputTokenCost;
    const outputCost = outputTokens * this.costModel.outputTokenCost;
    const toolCost = toolCalls * this.costModel.toolBaseCost;
    return inputCost + outputCost + toolCost;
  }

  private updateTeamSummary(teamId: string, config: BudgetConfig): void {
    let summary = this.swarmBudgets.get(teamId);
    if (!summary) {
      summary = {
        teamId,
        totalBudget: config.totalBudget,
        totalSpent: 0,
        remaining: config.totalBudget,
        agentCount: 0,
        agentsExceeded: [],
        agentsWarning: [],
      };
    }
    summary.agentCount++;
    this.swarmBudgets.set(teamId, summary);
  }

  private updateTeamSpent(teamId: string, amount: number): void {
    const summary = this.swarmBudgets.get(teamId);
    if (summary) {
      summary.totalSpent += amount;
      summary.remaining = summary.totalBudget - summary.totalSpent;
    }
  }

  private async persistAgentRecord(record: AgentBudgetRecord): Promise<void> {
    await this.storage.run(
      `UPDATE openclaw_budgets 
       SET total_spent = ?, warning_triggered = ?, killed = ?, updated_at = ?
       WHERE agent_id = ?`,
      record.totalSpent,
      record.warningTriggered ? 1 : 0,
      record.killed ? 1 : 0,
      record.updatedAt.toISOString(),
      record.agentId
    );
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  /**
   * Unregister an agent and clean up
   */
  async unregisterAgent(agentId: string): Promise<void> {
    this.agentBudgets.delete(agentId);
    
    await this.storage.run(`DELETE FROM openclaw_budgets WHERE agent_id = ?`, agentId);

    logger.info('BudgetTracker', 'Unregistered agent', { agentId });
  }

  /**
   * Reset all budgets (for testing)
   */
  async reset(): Promise<void> {
    this.agentBudgets.clear();
    this.swarmBudgets.clear();
    
    await this.storage.run('DELETE FROM openclaw_budgets');
    
    logger.info('BudgetTracker', 'All budgets reset');
  }
}

// ============================================================================
// Session History Types
// ============================================================================

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

// ============================================================================
// Errors
// ============================================================================

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetError';
  }
}

export class BudgetExceededError extends BudgetError {
  public readonly agentId: string;
  public readonly spent: number;
  public readonly limit: number;

  constructor(agentId: string, spent: number, limit: number) {
    super(`Budget exceeded for agent ${agentId}: $${spent.toFixed(2)} / $${limit.toFixed(2)}`);
    this.name = 'BudgetExceededError';
    this.agentId = agentId;
    this.spent = spent;
    this.limit = limit;
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalBudgetTracker: BudgetTracker | null = null;

export function getBudgetTracker(storage: SQLiteStorage): BudgetTracker {
  if (!globalBudgetTracker) {
    globalBudgetTracker = new BudgetTracker(storage);
  }
  return globalBudgetTracker;
}

export function resetBudgetTracker(): void {
  globalBudgetTracker = null;
}
