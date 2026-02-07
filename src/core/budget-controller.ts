import { logger } from '../utils/logger';

// ============================================================================
// HARD LIMITS - Absolute boundaries that cannot be overridden
// ============================================================================
export const HARD_LIMITS = {
  // Absolute maximums
  maxAgents: 50,
  maxConcurrentTeams: 10,
  maxTotalSpendPerDay: 100.00, // dollars
  maxSpendPerTeam: 50.00, // dollars

  // Emergency stops
  emergencyBudgetCap: 50.00, // per day
  emergencyAgentCap: 10,

  // AFK mode (human not seen for 4+ hours)
  afkBudgetCap: 25.00,
  afkAgentCap: 5,
  afkAllowNewTeams: false,
};

// ============================================================================
// SOFT LIMITS - Warning thresholds (does not block, just warns)
// ============================================================================
export const SOFT_LIMITS = {
  warnSpendPerHour: 10.00, // Warning at this spend per hour
  warnAgentsCount: 20, // Warning at this agent count
  warnTeamsInFlight: 5, // Warning at this team count
  warnTestCoverageDrop: 5, // Percentage points
};

// ============================================================================
// NIGHT MODE - Conservative operation while human sleeps (11 PM - 7 AM)
// ============================================================================
export const NIGHT_MODE_LIMITS = {
  enabled: true,
  startHour: 23, // 11 PM
  endHour: 7, // 7 AM

  maxAgents: 5,
  maxConcurrentTeams: 2,
  maxTotalSpendPerNight: 25.00, // $25 max overnight
  maxSpendPerHour: 5.00, // $5 per hour max

  newTeamsAllowed: false, // Only finish existing
  criticalFixesAllowed: true, // Critical fixes OK
};

// ============================================================================
// BUDGET ALERT THRESHOLDS
// ============================================================================
export const BUDGET_ALERTS = [
  { threshold: 0.25, action: 'log', notification: 'none' },       // 25%
  { threshold: 0.50, action: 'warn', notification: 'dashboard' }, // 50%
  { threshold: 0.75, action: 'alert', notification: 'human' },    // 75%
  { threshold: 0.90, action: 'pause', notification: 'human_urgent' }, // 90%
  { threshold: 1.00, action: 'stop', notification: 'human_critical' }, // 100%
];

// ============================================================================
// INTERFACES
// ============================================================================
export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  currentSpend: number;
  remainingBudget: number;
  agentCount: number;
  swarmCount: number;
}

export interface BudgetSnapshot {
  timestamp: Date;
  totalSpend: number;
  agentCount: number;
  swarmCount: number;
  perAgentSpend: number;
  perTeamSpend: number;
}

export interface NightModeStatus {
  enabled: boolean;
  startHour: number;
  endHour: number;
  currentLimit: typeof NIGHT_MODE_LIMITS;
  timeUntilNextTransition: string;
  isWithinNightHours: boolean;
}

// ============================================================================
// BUDGET CONTROLLER
// ============================================================================
export class BudgetController {
  private totalSpend: number = 0;
  private agentCount: number = 0;
  private swarmCount: number = 0;
  private hourSpend: number = 0;
  private lastHourReset: Date = new Date();
  private history: BudgetSnapshot[] = [];
  private nightModeEnabled: boolean = false;

  // --------------------------------------------------------------------------
  // CONFIGURATION
  // --------------------------------------------------------------------------
  private config = {
    dailyBudget: HARD_LIMITS.maxTotalSpendPerDay,
    agentCap: HARD_LIMITS.maxAgents,
    swarmCap: HARD_LIMITS.maxConcurrentTeams,
    perTeamCap: HARD_LIMITS.maxSpendPerTeam,
  };

  // --------------------------------------------------------------------------
  // PUBLIC METHODS
  // --------------------------------------------------------------------------

  /**
   * Check if an operation is allowed within current limits
   */
  checkLimits(request?: { agentCount?: number; swarmBudget?: number }): BudgetCheck {
    const agentCount = request?.agentCount ?? this.agentCount;
    const swarmBudget = request?.swarmBudget ?? 0;

    // Check agent limit
    if (agentCount > this.config.agentCap) {
      return {
        allowed: false,
        reason: `Agent limit exceeded: ${agentCount}/${this.config.agentCap}`,
        currentSpend: this.totalSpend,
        remainingBudget: this.config.dailyBudget - this.totalSpend,
        agentCount,
        swarmCount: this.swarmCount,
      };
    }

    // Check team budget
    if (swarmBudget > this.config.perTeamCap) {
      return {
        allowed: false,
        reason: `Team budget exceeded: $${swarmBudget}/$${this.config.perTeamCap}`,
        currentSpend: this.totalSpend,
        remainingBudget: this.config.dailyBudget - this.totalSpend,
        agentCount,
        swarmCount: this.swarmCount,
      };
    }

    // Check total spend
    if (this.totalSpend + swarmBudget > this.config.dailyBudget) {
      return {
        allowed: false,
        reason: `Daily budget exceeded: $${this.totalSpend + swarmBudget}/$${this.config.dailyBudget}`,
        currentSpend: this.totalSpend,
        remainingBudget: this.config.dailyBudget - this.totalSpend,
        agentCount,
        swarmCount: this.swarmCount,
      };
    }

    return {
      allowed: true,
      currentSpend: this.totalSpend,
      remainingBudget: this.config.dailyBudget - this.totalSpend,
      agentCount,
      swarmCount: this.swarmCount,
    };
  }

  /**
   * Record spend for tracking
   */
  recordSpend(amount: number): void {
    this.totalSpend += amount;
    this.hourSpend += amount;

    // Reset hourly tracking if needed
    const now = new Date();
    if (now.getHours() !== this.lastHourReset.getHours()) {
      this.hourSpend = amount;
      this.lastHourReset = now;
    }

    // Record history
    this.history.push({
      timestamp: now,
      totalSpend: this.totalSpend,
      agentCount: this.agentCount,
      swarmCount: this.swarmCount,
      perAgentSpend: this.agentCount > 0 ? this.totalSpend / this.agentCount : 0,
      perTeamSpend: this.swarmCount > 0 ? this.totalSpend / this.swarmCount : 0,
    });

    // Keep only last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }

  /**
   * Update agent count
   */
  updateAgentCount(count: number): void {
    this.agentCount = count;
  }

  /**
   * Update team count
   */
  updateTeamCount(count: number): void {
    this.swarmCount = count;
  }

  /**
   * Get current status
   */
  getStatus(): {
    totalSpend: number;
    dailyBudget: number;
    percentUsed: number;
    agentCount: number;
    agentCap: number;
    swarmCount: number;
    swarmCap: number;
    remainingBudget: number;
    history: BudgetSnapshot[];
    nightMode: NightModeStatus;
  } {
    return {
      totalSpend: this.totalSpend,
      dailyBudget: this.config.dailyBudget,
      percentUsed: (this.totalSpend / this.config.dailyBudget) * 100,
      agentCount: this.agentCount,
      agentCap: this.config.agentCap,
      swarmCount: this.swarmCount,
      swarmCap: this.config.swarmCap,
      remainingBudget: this.config.dailyBudget - this.totalSpend,
      history: this.history,
      nightMode: this.getNightModeStatus(),
    };
  }

  /**
   * Get night mode status
   */
  getNightModeStatus(): NightModeStatus {
    const now = new Date();
    const currentHour = now.getHours();
    const isNight = currentHour >= NIGHT_MODE_LIMITS.startHour || currentHour < NIGHT_MODE_LIMITS.endHour;

    // Calculate time until next transition
    let timeUntilNext: string;
    if (isNight) {
      // Night mode active, calculate until 7 AM
      const targetHour = NIGHT_MODE_LIMITS.endHour;
      const target = new Date(now);
      target.setHours(targetHour, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const diffMs = target.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      timeUntilNext = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
    } else {
      // Day mode, calculate until 11 PM
      const targetHour = NIGHT_MODE_LIMITS.startHour;
      const target = new Date(now);
      target.setHours(targetHour, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const diffMs = target.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      timeUntilNext = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
    }

    return {
      enabled: this.nightModeEnabled,
      startHour: NIGHT_MODE_LIMITS.startHour,
      endHour: NIGHT_MODE_LIMITS.endHour,
      currentLimit: NIGHT_MODE_LIMITS,
      timeUntilNextTransition: timeUntilNext,
      isWithinNightHours: isNight,
    };
  }

  /**
   * Enable night mode
   */
  enableNightMode(): void {
    this.nightModeEnabled = true;
    logger.info('budget', 'Night mode enabled', {
      maxAgents: NIGHT_MODE_LIMITS.maxAgents,
      maxSpendPerNight: NIGHT_MODE_LIMITS.maxTotalSpendPerNight,
    });
  }

  /**
   * Disable night mode
   */
  disableNightMode(): void {
    this.nightModeEnabled = false;
    // Reset to day mode limits
    this.config.agentCap = HARD_LIMITS.maxAgents;
    this.config.swarmCap = HARD_LIMITS.maxConcurrentTeams;
    logger.info('budget', 'Night mode disabled, restored day mode limits');
  }

  /**
   * Reset daily budget (call at start of new day)
   */
  resetDailyBudget(): void {
    this.totalSpend = 0;
    this.hourSpend = 0;
    this.lastHourReset = new Date();
    logger.info('budget', 'Daily budget reset', { newBudget: this.config.dailyBudget });
  }

  /**
   * Check if we're within budget alerts
   */
  checkAlerts(): { threshold: number; action: string; notification: string }[] {
    const percentUsed = this.totalSpend / this.config.dailyBudget;
    const triggered = BUDGET_ALERTS.filter(a => percentUsed >= a.threshold);
    return triggered;
  }

  /**
   * Get per-agent spend average
   */
  getPerAgentSpend(): number {
    if (this.agentCount <= 0) return 0;
    return this.totalSpend / this.agentCount;
  }

  /**
   * Get per-team spend average
   */
  getPerTeamSpend(): number {
    if (this.swarmCount <= 0) return 0;
    return this.totalSpend / this.swarmCount;
  }
}

// ============================================================================
// SINGLETON INSTANCE FOR EASY IMPORT
// ============================================================================
export const budgetController = new BudgetController();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick check if an operation is allowed
 */
export function canSpend(amount: number): boolean {
  return budgetController.checkLimits({ swarmBudget: amount }).allowed;
}

/**
 * Quick check if agent can be added
 */
export function canAddAgent(): boolean {
  const status = budgetController.getStatus();
  return status.agentCount < status.agentCap;
}

/**
 * Get formatted budget status
 */
export function getBudgetStatus(): string {
  const status = budgetController.getStatus();
  return `Budget: $${status.totalSpend.toFixed(2)}/${status.dailyBudget} (${status.percentUsed.toFixed(1)}%) | Agents: ${status.agentCount}/${status.agentCap} | Teams: ${status.swarmCount}/${status.swarmCap}`;
}
