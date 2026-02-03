"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetController = exports.BudgetController = exports.BUDGET_ALERTS = exports.NIGHT_MODE_LIMITS = exports.SOFT_LIMITS = exports.HARD_LIMITS = void 0;
exports.canSpend = canSpend;
exports.canAddAgent = canAddAgent;
exports.getBudgetStatus = getBudgetStatus;
const logger_1 = require("../utils/logger");
// ============================================================================
// HARD LIMITS - Absolute boundaries that cannot be overridden
// ============================================================================
exports.HARD_LIMITS = {
    // Absolute maximums
    maxAgents: 50,
    maxConcurrentSwarms: 10,
    maxTotalSpendPerDay: 100.00, // dollars
    maxSpendPerSwarm: 50.00, // dollars
    // Emergency stops
    emergencyBudgetCap: 50.00, // per day
    emergencyAgentCap: 10,
    // AFK mode (human not seen for 4+ hours)
    afkBudgetCap: 25.00,
    afkAgentCap: 5,
    afkAllowNewSwarms: false,
};
// ============================================================================
// SOFT LIMITS - Warning thresholds (does not block, just warns)
// ============================================================================
exports.SOFT_LIMITS = {
    warnSpendPerHour: 10.00, // Warning at this spend per hour
    warnAgentsCount: 20, // Warning at this agent count
    warnSwarmsInFlight: 5, // Warning at this swarm count
    warnTestCoverageDrop: 5, // Percentage points
};
// ============================================================================
// NIGHT MODE - Conservative operation while human sleeps (11 PM - 7 AM)
// ============================================================================
exports.NIGHT_MODE_LIMITS = {
    enabled: true,
    startHour: 23, // 11 PM
    endHour: 7, // 7 AM
    maxAgents: 5,
    maxConcurrentSwarms: 2,
    maxTotalSpendPerNight: 25.00, // $25 max overnight
    maxSpendPerHour: 5.00, // $5 per hour max
    newSwarmsAllowed: false, // Only finish existing
    criticalFixesAllowed: true, // Critical fixes OK
};
// ============================================================================
// BUDGET ALERT THRESHOLDS
// ============================================================================
exports.BUDGET_ALERTS = [
    { threshold: 0.25, action: 'log', notification: 'none' }, // 25%
    { threshold: 0.50, action: 'warn', notification: 'dashboard' }, // 50%
    { threshold: 0.75, action: 'alert', notification: 'human' }, // 75%
    { threshold: 0.90, action: 'pause', notification: 'human_urgent' }, // 90%
    { threshold: 1.00, action: 'stop', notification: 'human_critical' }, // 100%
];
// ============================================================================
// BUDGET CONTROLLER
// ============================================================================
class BudgetController {
    constructor() {
        this.totalSpend = 0;
        this.agentCount = 0;
        this.swarmCount = 0;
        this.hourSpend = 0;
        this.lastHourReset = new Date();
        this.history = [];
        this.nightModeEnabled = false;
        // --------------------------------------------------------------------------
        // CONFIGURATION
        // --------------------------------------------------------------------------
        this.config = {
            dailyBudget: exports.HARD_LIMITS.maxTotalSpendPerDay,
            agentCap: exports.HARD_LIMITS.maxAgents,
            swarmCap: exports.HARD_LIMITS.maxConcurrentSwarms,
            perSwarmCap: exports.HARD_LIMITS.maxSpendPerSwarm,
        };
    }
    // --------------------------------------------------------------------------
    // PUBLIC METHODS
    // --------------------------------------------------------------------------
    /**
     * Check if an operation is allowed within current limits
     */
    checkLimits(request) {
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
        // Check swarm budget
        if (swarmBudget > this.config.perSwarmCap) {
            return {
                allowed: false,
                reason: `Swarm budget exceeded: $${swarmBudget}/$${this.config.perSwarmCap}`,
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
    recordSpend(amount) {
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
            perSwarmSpend: this.swarmCount > 0 ? this.totalSpend / this.swarmCount : 0,
        });
        // Keep only last 100 entries
        if (this.history.length > 100) {
            this.history = this.history.slice(-100);
        }
    }
    /**
     * Update agent count
     */
    updateAgentCount(count) {
        this.agentCount = count;
    }
    /**
     * Update swarm count
     */
    updateSwarmCount(count) {
        this.swarmCount = count;
    }
    /**
     * Get current status
     */
    getStatus() {
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
    getNightModeStatus() {
        const now = new Date();
        const currentHour = now.getHours();
        const isNight = currentHour >= exports.NIGHT_MODE_LIMITS.startHour || currentHour < exports.NIGHT_MODE_LIMITS.endHour;
        // Calculate time until next transition
        let timeUntilNext;
        if (isNight) {
            // Night mode active, calculate until 7 AM
            const targetHour = exports.NIGHT_MODE_LIMITS.endHour;
            const target = new Date(now);
            target.setHours(targetHour, 0, 0, 0);
            if (target <= now)
                target.setDate(target.getDate() + 1);
            const diffMs = target.getTime() - now.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            timeUntilNext = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
        }
        else {
            // Day mode, calculate until 11 PM
            const targetHour = exports.NIGHT_MODE_LIMITS.startHour;
            const target = new Date(now);
            target.setHours(targetHour, 0, 0, 0);
            if (target <= now)
                target.setDate(target.getDate() + 1);
            const diffMs = target.getTime() - now.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            timeUntilNext = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
        }
        return {
            enabled: this.nightModeEnabled,
            startHour: exports.NIGHT_MODE_LIMITS.startHour,
            endHour: exports.NIGHT_MODE_LIMITS.endHour,
            currentLimit: exports.NIGHT_MODE_LIMITS,
            timeUntilNextTransition: timeUntilNext,
            isWithinNightHours: isNight,
        };
    }
    /**
     * Enable night mode
     */
    enableNightMode() {
        this.nightModeEnabled = true;
        logger_1.logger.info('budget', 'Night mode enabled', {
            maxAgents: exports.NIGHT_MODE_LIMITS.maxAgents,
            maxSpendPerNight: exports.NIGHT_MODE_LIMITS.maxTotalSpendPerNight,
        });
    }
    /**
     * Disable night mode
     */
    disableNightMode() {
        this.nightModeEnabled = false;
        // Reset to day mode limits
        this.config.agentCap = exports.HARD_LIMITS.maxAgents;
        this.config.swarmCap = exports.HARD_LIMITS.maxConcurrentSwarms;
        logger_1.logger.info('budget', 'Night mode disabled, restored day mode limits');
    }
    /**
     * Reset daily budget (call at start of new day)
     */
    resetDailyBudget() {
        this.totalSpend = 0;
        this.hourSpend = 0;
        this.lastHourReset = new Date();
        logger_1.logger.info('budget', 'Daily budget reset', { newBudget: this.config.dailyBudget });
    }
    /**
     * Check if we're within budget alerts
     */
    checkAlerts() {
        const percentUsed = this.totalSpend / this.config.dailyBudget;
        const triggered = exports.BUDGET_ALERTS.filter(a => percentUsed >= a.threshold);
        return triggered;
    }
    /**
     * Get per-agent spend average
     */
    getPerAgentSpend() {
        if (this.agentCount <= 0)
            return 0;
        return this.totalSpend / this.agentCount;
    }
    /**
     * Get per-swarm spend average
     */
    getPerSwarmSpend() {
        if (this.swarmCount <= 0)
            return 0;
        return this.totalSpend / this.swarmCount;
    }
}
exports.BudgetController = BudgetController;
// ============================================================================
// SINGLETON INSTANCE FOR EASY IMPORT
// ============================================================================
exports.budgetController = new BudgetController();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Quick check if an operation is allowed
 */
function canSpend(amount) {
    return exports.budgetController.checkLimits({ swarmBudget: amount }).allowed;
}
/**
 * Quick check if agent can be added
 */
function canAddAgent() {
    const status = exports.budgetController.getStatus();
    return status.agentCount < status.agentCap;
}
/**
 * Get formatted budget status
 */
function getBudgetStatus() {
    const status = exports.budgetController.getStatus();
    return `Budget: $${status.totalSpend.toFixed(2)}/${status.dailyBudget} (${status.percentUsed.toFixed(1)}%) | Agents: ${status.agentCount}/${status.agentCap} | Swarms: ${status.swarmCount}/${status.swarmCap}`;
}
//# sourceMappingURL=budget-controller.js.map