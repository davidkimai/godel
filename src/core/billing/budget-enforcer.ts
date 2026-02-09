/**
 * BudgetEnforcer - Budget enforcement with alerts and hard stops
 * 
 * Enforces budget limits across teams and agents:
 * - 80% threshold: Warning alerts
 * - 100% threshold: Hard stop (terminate runtime)
 * 
 * Integrates with CostTracker for real-time monitoring.
 * 
 * @module @godel/core/billing/budget-enforcer
 * @version 1.0.0
 * @since 2026-02-08
 * @see SPEC-002 Section 5.2
 */

import { EventEmitter } from 'events';
import { CostTracker, AgentCost, CostReport } from './cost-tracker';

// ============================================================================
// Types
// ============================================================================

/**
 * Budget configuration
 */
export interface BudgetConfig {
  /** Team budgets by team ID */
  teamBudgets?: Record<string, number>;
  /** Agent budgets by agent ID */
  agentBudgets?: Record<string, number>;
  /** Default budget for teams without explicit budget */
  defaultTeamBudget?: number;
  /** Default budget for agents without explicit budget */
  defaultAgentBudget?: number;
  /** Warning threshold (0-1, default 0.8 = 80%) */
  warningThreshold?: number;
  /** Hard stop threshold (0-1, default 1.0 = 100%) */
  stopThreshold?: number;
  /** Enable automatic runtime termination on budget exceeded */
  autoStop?: boolean;
  /** Callback for budget warnings */
  onWarning?: (context: BudgetAlertContext) => void;
  /** Callback for budget exceeded */
  onExceeded?: (context: BudgetAlertContext) => void;
  /** Callback for runtime stopped */
  onStopped?: (context: StopContext) => void;
}

/**
 * Budget alert context
 */
export interface BudgetAlertContext {
  /** Team ID (if team budget) */
  teamId?: string;
  /** Agent ID (if agent budget) */
  agentId?: string;
  /** Current cost */
  currentCost: number;
  /** Budget limit */
  budget: number;
  /** Percentage used (0-100) */
  percentUsed: number;
  /** Alert type */
  type: 'warning' | 'critical';
}

/**
 * Stop context
 */
export interface StopContext {
  /** Agent ID */
  agentId: string;
  /** Runtime ID */
  runtimeId: string;
  /** Reason for stopping */
  reason: string;
  /** Final cost */
  finalCost: number;
  /** Budget that was exceeded */
  budget: number;
}

/**
 * Budget status
 */
export interface BudgetStatus {
  /** Team or agent ID */
  id: string;
  /** Budget type */
  type: 'team' | 'agent';
  /** Budget limit */
  budget: number;
  /** Current cost */
  currentCost: number;
  /** Remaining budget */
  remaining: number;
  /** Percentage used (0-100) */
  percentUsed: number;
  /** Status */
  status: 'ok' | 'warning' | 'exceeded';
}

/**
 * Enforcement action
 */
export type EnforcementAction = 'none' | 'warn' | 'stop';

// ============================================================================
// BudgetEnforcer Implementation
// ============================================================================

export class BudgetEnforcer extends EventEmitter {
  private costTracker: CostTracker;
  private teamBudgets: Map<string, number> = new Map();
  private agentBudgets: Map<string, number> = new Map();
  private defaultTeamBudget: number;
  private defaultAgentBudget: number;
  private warningThreshold: number;
  private stopThreshold: number;
  private autoStop: boolean;
  private onWarning?: (context: BudgetAlertContext) => void;
  private onExceeded?: (context: BudgetAlertContext) => void;
  private onStopped?: (context: StopContext) => void;
  private warningSent: Set<string> = new Set();
  private exceededSent: Set<string> = new Set();
  private stoppedRuntimes: Set<string> = new Set();
  private checkInterval?: NodeJS.Timeout;

  constructor(costTracker: CostTracker, config: BudgetConfig = {}) {
    super();

    this.costTracker = costTracker;
    this.defaultTeamBudget = config.defaultTeamBudget ?? 100; // $100 default
    this.defaultAgentBudget = config.defaultAgentBudget ?? 10; // $10 default
    this.warningThreshold = config.warningThreshold ?? 0.8; // 80%
    this.stopThreshold = config.stopThreshold ?? 1.0; // 100%
    this.autoStop = config.autoStop ?? true;
    this.onWarning = config.onWarning;
    this.onExceeded = config.onExceeded;
    this.onStopped = config.onStopped;

    // Initialize budgets
    if (config.teamBudgets) {
      Object.entries(config.teamBudgets).forEach(([teamId, budget]) => {
        this.teamBudgets.set(teamId, budget);
      });
    }

    if (config.agentBudgets) {
      Object.entries(config.agentBudgets).forEach(([agentId, budget]) => {
        this.agentBudgets.set(agentId, budget);
      });
    }

    // Listen to cost tracker events
    this.setupEventListeners();

    // Start periodic checks
    this.startPeriodicChecks();
  }

  /**
   * Set budget for a team
   */
  setTeamBudget(teamId: string, budget: number): void {
    this.teamBudgets.set(teamId, budget);
    this.emit('budgetSet', { type: 'team', id: teamId, budget });
  }

  /**
   * Get budget for a team
   */
  getTeamBudget(teamId: string): number {
    return this.teamBudgets.get(teamId) ?? this.defaultTeamBudget;
  }

  /**
   * Set budget for an agent
   */
  setAgentBudget(agentId: string, budget: number): void {
    this.agentBudgets.set(agentId, budget);
    this.costTracker.setThreshold(agentId, budget);
    this.emit('budgetSet', { type: 'agent', id: agentId, budget });
  }

  /**
   * Get budget for an agent
   */
  getAgentBudget(agentId: string): number {
    return this.agentBudgets.get(agentId) ?? this.defaultAgentBudget;
  }

  /**
   * Get budget status for a team
   */
  getTeamBudgetStatus(teamId: string): BudgetStatus {
    const budget = this.getTeamBudget(teamId);
    const teamCosts = this.costTracker.getTeamCosts(teamId);
    const currentCost = teamCosts.totalCost;
    const percentUsed = budget > 0 ? (currentCost / budget) * 100 : 0;

    let status: 'ok' | 'warning' | 'exceeded' = 'ok';
    if (percentUsed >= this.stopThreshold * 100) {
      status = 'exceeded';
    } else if (percentUsed >= this.warningThreshold * 100) {
      status = 'warning';
    }

    return {
      id: teamId,
      type: 'team',
      budget,
      currentCost,
      remaining: Math.max(0, budget - currentCost),
      percentUsed,
      status,
    };
  }

  /**
   * Get budget status for an agent
   */
  getAgentBudgetStatus(agentId: string): BudgetStatus {
    const budget = this.getAgentBudget(agentId);
    const agentCost = this.costTracker.getAgentCost(agentId);
    const currentCost = agentCost?.cost ?? 0;
    const percentUsed = budget > 0 ? (currentCost / budget) * 100 : 0;

    let status: 'ok' | 'warning' | 'exceeded' = 'ok';
    if (percentUsed >= this.stopThreshold * 100) {
      status = 'exceeded';
    } else if (percentUsed >= this.warningThreshold * 100) {
      status = 'warning';
    }

    return {
      id: agentId,
      type: 'agent',
      budget,
      currentCost,
      remaining: Math.max(0, budget - currentCost),
      percentUsed,
      status,
    };
  }

  /**
   * Check if enforcement action is needed
   */
  checkEnforcement(agentId: string): { action: EnforcementAction; context?: BudgetAlertContext } {
    const agentStatus = this.getAgentBudgetStatus(agentId);
    const agentCost = this.costTracker.getAgentCost(agentId);

    // Check agent budget first
    if (agentStatus.status === 'exceeded') {
      const context: BudgetAlertContext = {
        agentId,
        currentCost: agentStatus.currentCost,
        budget: agentStatus.budget,
        percentUsed: agentStatus.percentUsed,
        type: 'critical',
      };
      return { action: 'stop', context };
    }

    if (agentStatus.status === 'warning') {
      const context: BudgetAlertContext = {
        agentId,
        currentCost: agentStatus.currentCost,
        budget: agentStatus.budget,
        percentUsed: agentStatus.percentUsed,
        type: 'warning',
      };
      return { action: 'warn', context };
    }

    // Check team budget
    if (agentCost?.teamId) {
      const teamStatus = this.getTeamBudgetStatus(agentCost.teamId);
      
      if (teamStatus.status === 'exceeded') {
        const context: BudgetAlertContext = {
          teamId: agentCost.teamId,
          agentId,
          currentCost: teamStatus.currentCost,
          budget: teamStatus.budget,
          percentUsed: teamStatus.percentUsed,
          type: 'critical',
        };
        return { action: 'stop', context };
      }

      if (teamStatus.status === 'warning') {
        const context: BudgetAlertContext = {
          teamId: agentCost.teamId,
          agentId,
          currentCost: teamStatus.currentCost,
          budget: teamStatus.budget,
          percentUsed: teamStatus.percentUsed,
          type: 'warning',
        };
        return { action: 'warn', context };
      }
    }

    return { action: 'none' };
  }

  /**
   * Register a runtime for enforcement
   */
  registerRuntime(agentId: string, runtimeId: string, teamId?: string): void {
    // Set up cost tracking if not already tracking
    const existing = this.costTracker.getAgentCost(agentId);
    if (!existing) {
      // Determine runtime type from runtimeId prefix
      let runtimeType: 'e2b' | 'kata' | 'worktree' = 'worktree';
      if (runtimeId.startsWith('e2b-')) runtimeType = 'e2b';
      else if (runtimeId.startsWith('kata-')) runtimeType = 'kata';

      this.costTracker.startTracking(agentId, runtimeType, runtimeId, {
        teamId,
        threshold: this.getAgentBudget(agentId),
      });
    }

    // Set team budget if provided
    if (teamId && !this.teamBudgets.has(teamId)) {
      this.teamBudgets.set(teamId, this.defaultTeamBudget);
    }
  }

  /**
   * Stop a runtime due to budget exceeded
   */
  async stopRuntime(agentId: string, reason: string): Promise<void> {
    if (this.stoppedRuntimes.has(agentId)) {
      return; // Already stopped
    }

    const agentCost = this.costTracker.getAgentCost(agentId);
    if (!agentCost) {
      return;
    }

    this.stoppedRuntimes.add(agentId);

    // Stop cost tracking
    this.costTracker.stopTracking(agentId);

    const context: StopContext = {
      agentId,
      runtimeId: agentCost.runtimeId,
      reason,
      finalCost: agentCost.cost,
      budget: this.getAgentBudget(agentId),
    };

    this.emit('runtimeStopped', context);

    if (this.onStopped) {
      this.onStopped(context);
    }
  }

  /**
   * Get all budget statuses
   */
  getAllBudgetStatuses(): { teams: BudgetStatus[]; agents: BudgetStatus[] } {
    // Get unique team IDs
    const teamIds = new Set<string>();
    const allSessions = [
      ...this.costTracker.getActiveSessions(),
      ...this.costTracker.getCompletedSessions(),
    ];
    
    allSessions.forEach(s => {
      if (s.teamId) teamIds.add(s.teamId);
    });

    // Add teams with explicit budgets
    this.teamBudgets.forEach((_, teamId) => teamIds.add(teamId));

    // Get team statuses
    const teams = Array.from(teamIds).map(id => this.getTeamBudgetStatus(id));

    // Get agent statuses
    const agentIds = new Set<string>();
    allSessions.forEach(s => agentIds.add(s.agentId));
    this.agentBudgets.forEach((_, agentId) => agentIds.add(agentId));

    const agents = Array.from(agentIds).map(id => this.getAgentBudgetStatus(id));

    return { teams, agents };
  }

  /**
   * Generate budget report
   */
  generateReport(): {
    budgets: { teams: BudgetStatus[]; agents: BudgetStatus[] };
    costReport: CostReport;
    violations: Array<{ id: string; type: 'team' | 'agent'; exceededBy: number }>;
  } {
    const budgets = this.getAllBudgetStatuses();
    const costReport = this.costTracker.generateReport();

    const violations: Array<{ id: string; type: 'team' | 'agent'; exceededBy: number }> = [];

    // Find team violations
    budgets.teams.forEach(team => {
      if (team.status === 'exceeded') {
        violations.push({
          id: team.id,
          type: 'team',
          exceededBy: team.currentCost - team.budget,
        });
      }
    });

    // Find agent violations
    budgets.agents.forEach(agent => {
      if (agent.status === 'exceeded') {
        violations.push({
          id: agent.id,
          type: 'agent',
          exceededBy: agent.currentCost - agent.budget,
        });
      }
    });

    return { budgets, costReport, violations };
  }

  /**
   * Reset all budgets and state
   */
  reset(): void {
    this.teamBudgets.clear();
    this.agentBudgets.clear();
    this.warningSent.clear();
    this.exceededSent.clear();
    this.stoppedRuntimes.clear();
    this.emit('reset');
  }

  /**
   * Dispose of the enforcer
   */
  dispose(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.removeAllListeners();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Set up event listeners for cost tracker
   */
  private setupEventListeners(): void {
    // Listen for cost updates
    this.costTracker.on('costUpdated', ({ agentId, cost }) => {
      this.checkAndEnforce(agentId);
    });

    // Listen for threshold warnings from cost tracker
    this.costTracker.on('thresholdWarning', ({ agentId, cost, threshold }) => {
      const context: BudgetAlertContext = {
        agentId,
        currentCost: cost,
        budget: threshold,
        percentUsed: (cost / threshold) * 100,
        type: 'warning',
      };

      if (!this.warningSent.has(agentId)) {
        this.warningSent.add(agentId);
        this.emit('warning', context);

        if (this.onWarning) {
          this.onWarning(context);
        }
      }
    });

    // Listen for threshold exceeded
    this.costTracker.on('thresholdExceeded', ({ agentId, cost, threshold }) => {
      const context: BudgetAlertContext = {
        agentId,
        currentCost: cost,
        budget: threshold,
        percentUsed: (cost / threshold) * 100,
        type: 'critical',
      };

      if (!this.exceededSent.has(agentId)) {
        this.exceededSent.add(agentId);
        this.emit('exceeded', context);

        if (this.onExceeded) {
          this.onExceeded(context);
        }

        // Auto-stop if enabled
        if (this.autoStop) {
          this.stopRuntime(agentId, 'Budget exceeded');
        }
      }
    });
  }

  /**
   * Check and enforce budget for an agent
   */
  private checkAndEnforce(agentId: string): void {
    const { action, context } = this.checkEnforcement(agentId);

    if (action === 'warn' && context) {
      if (!this.warningSent.has(agentId)) {
        this.warningSent.add(agentId);
        this.emit('warning', context);

        if (this.onWarning) {
          this.onWarning(context);
        }
      }
    } else if (action === 'stop' && context) {
      if (!this.exceededSent.has(agentId)) {
        this.exceededSent.add(agentId);
        this.emit('exceeded', context);

        if (this.onExceeded) {
          this.onExceeded(context);
        }

        if (this.autoStop) {
          this.stopRuntime(agentId, 'Budget exceeded');
        }
      }
    }
  }

  /**
   * Start periodic budget checks
   */
  private startPeriodicChecks(): void {
    this.checkInterval = setInterval(() => {
      // Check all active agents
      const activeSessions = this.costTracker.getActiveSessions();
      
      for (const session of activeSessions) {
        this.checkAndEnforce(session.agentId);
      }
    }, 5000); // Check every 5 seconds
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalBudgetEnforcer: BudgetEnforcer | null = null;

/**
 * Get or create the global BudgetEnforcer instance
 */
export function getGlobalBudgetEnforcer(
  costTracker: CostTracker,
  config?: BudgetConfig
): BudgetEnforcer {
  if (!globalBudgetEnforcer) {
    globalBudgetEnforcer = new BudgetEnforcer(costTracker, config);
  }
  return globalBudgetEnforcer;
}

/**
 * Initialize the global BudgetEnforcer
 */
export function initializeGlobalBudgetEnforcer(
  costTracker: CostTracker,
  config: BudgetConfig
): BudgetEnforcer {
  if (globalBudgetEnforcer) {
    globalBudgetEnforcer.dispose();
  }
  globalBudgetEnforcer = new BudgetEnforcer(costTracker, config);
  return globalBudgetEnforcer;
}

/**
 * Reset the global BudgetEnforcer
 */
export function resetGlobalBudgetEnforcer(): void {
  if (globalBudgetEnforcer) {
    globalBudgetEnforcer.dispose();
    globalBudgetEnforcer = null;
  }
}

export default BudgetEnforcer;
