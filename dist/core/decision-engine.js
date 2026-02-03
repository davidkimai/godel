"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionEngine = exports.DecisionEngine = exports.AuthorizationTier = void 0;
exports.authorizeSwarm = authorizeSwarm;
exports.canAutoApprove = canAutoApprove;
exports.getAuthorizationStatus = getAuthorizationStatus;
const budget_controller_1 = require("./budget-controller");
// ============================================================================
// AUTHORIZATION TIERS
// ============================================================================
var AuthorizationTier;
(function (AuthorizationTier) {
    AuthorizationTier["TIER_1_AUTO_APPROVE"] = "TIER_1_AUTO_APPROVE";
    AuthorizationTier["TIER_2_IMPROVE"] = "TIER_2_IMPROVE";
    AuthorizationTier["TIER_3_REVIEW"] = "TIER_3_REVIEW";
    AuthorizationTier["TIER_4_BLOCKED"] = "TIER_4_BLOCKED";
})(AuthorizationTier || (exports.AuthorizationTier = AuthorizationTier = {}));
// ============================================================================
// DECISION ENGINE
// ============================================================================
class DecisionEngine {
    constructor() {
        // Configuration for tier thresholds
        this.config = {
            tier1MaxCost: 5.00, // Auto-approve under $5
            tier2MaxCost: 10.00, // Auto-approve under $10
            tier3MinCost: 10.00, // Review over $10
            maxAgentsPerTier1: 5, // Max agents for auto-approve
            maxAgentsPerTier2: 10, // Max agents for tier 2
            autoFixAllowed: true, // Allow auto-fix operations
            featureRequiresReview: true, // Features always need review
            emergencyBypasses: true, // Emergency operations bypass limits
        };
        // Operation risk weights
        this.riskWeights = {
            fix: { low: 0.3, medium: 0.5, high: 0.7, critical: 0.9 },
            improve: { low: 0.4, medium: 0.6, high: 0.8, critical: 0.95 },
            feature: { low: 0.5, medium: 0.7, high: 0.9, critical: 1.0 },
            research: { low: 0.2, medium: 0.4, high: 0.6, critical: 0.8 },
            emergency: { low: 0.6, medium: 0.8, high: 0.95, critical: 1.0 },
        };
    }
    // =========================================================================
    // PUBLIC METHODS
    // =========================================================================
    /**
     * Determine authorization tier for a swarm request
     */
    getAuthorization(request) {
        // Check emergency bypass
        if (request.urgency === 'critical' && this.config.emergencyBypasses) {
            return this.createAuthorization(AuthorizationTier.TIER_3_REVIEW, true, 'Emergency operation - fast-tracked for review', request.estimatedCost, false, ['Emergency bypass active', 'Requires post-execution review']);
        }
        // Check budget limits
        const budgetCheck = budget_controller_1.budgetController.checkLimits({
            agentCount: request.agentCount,
            swarmBudget: request.estimatedCost,
        });
        if (!budgetCheck.allowed) {
            return this.createAuthorization(AuthorizationTier.TIER_4_BLOCKED, false, budgetCheck.reason || 'Budget limits exceeded', request.estimatedCost, true, ['Reduce cost', 'Reduce agent count', 'Wait for budget reset']);
        }
        // Determine tier based on cost and operation type
        const tier = this.determineTier(request);
        return this.createAuthorizationForTier(tier, request);
    }
    /**
     * Quick check if operation should auto-approve
     */
    shouldAutoApprove(request) {
        const auth = this.getAuthorization(request);
        // TIER_1 and TIER_2 both don't require approval
        return ((auth.tier === AuthorizationTier.TIER_1_AUTO_APPROVE ||
            auth.tier === AuthorizationTier.TIER_2_IMPROVE) &&
            auth.allowed);
    }
    /**
     * Get approval requirements for a request
     */
    getApprovalRequirements(request) {
        const auth = this.getAuthorization(request);
        if (!auth.allowed) {
            return {
                required: true,
                approverType: 'human',
                conditions: ['Operation blocked - see reason'],
                escalationPath: ['Human review required', 'Fix issues and resubmit'],
            };
        }
        if (auth.requiresApproval) {
            if (auth.tier === AuthorizationTier.TIER_2_IMPROVE) {
                return {
                    required: true,
                    approverType: 'system',
                    conditions: auth.conditions || [],
                    escalationPath: ['System auto-approval', 'Dashboard notification'],
                };
            }
            return {
                required: true,
                approverType: 'human',
                conditions: auth.conditions || [],
                escalationPath: ['Human approval required', 'Review in dashboard'],
            };
        }
        return {
            required: false,
            approverType: 'none',
            conditions: [],
            escalationPath: [],
        };
    }
    /**
     * Calculate risk score for an operation
     */
    calculateRiskScore(request) {
        const weight = this.riskWeights[request.operationType]?.[request.riskLevel] || 0.5;
        const agentFactor = Math.min(request.agentCount / 20, 1) * 0.3;
        const costFactor = Math.min(request.estimatedCost / 50, 1) * 0.4;
        return Math.min(weight + agentFactor + costFactor, 1.0);
    }
    /**
     * Predict outcome based on historical patterns
     */
    predictOutcome(request) {
        const riskScore = this.calculateRiskScore(request);
        const successProbability = Math.max(0.5, 1 - riskScore);
        // Estimate duration based on agent count and operation type
        const baseDuration = {
            fix: 2,
            improve: 5,
            feature: 10,
            research: 15,
            emergency: 3,
        }[request.operationType] || 5;
        const estimatedDuration = baseDuration * (1 + request.agentCount * 0.1);
        // Identify risk factors
        const riskFactors = [];
        if (request.agentCount > 10)
            riskFactors.push('High agent count');
        if (request.estimatedCost > 20)
            riskFactors.push('High cost');
        if (request.riskLevel === 'high' || request.riskLevel === 'critical') {
            riskFactors.push('High risk operation');
        }
        if (request.operationType === 'feature')
            riskFactors.push('Feature development');
        return {
            successProbability,
            estimatedDuration,
            riskFactors,
        };
    }
    /**
     * Get decision history for learning
     */
    getDecisionStats() {
        // This would normally come from a database
        return {
            totalDecisions: 156,
            autoApproved: 89,
            humanApproved: 52,
            blocked: 15,
            averageRiskScore: 0.42,
        };
    }
    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================
    determineTier(request) {
        // Tier 1: Auto-approve small, low-risk operations
        if (request.estimatedCost <= this.config.tier1MaxCost &&
            request.agentCount <= this.config.maxAgentsPerTier1 &&
            (request.operationType === 'fix' || request.operationType === 'research') &&
            request.riskLevel !== 'critical' &&
            !this.config.featureRequiresReview) {
            return AuthorizationTier.TIER_1_AUTO_APPROVE;
        }
        // Tier 2: Auto-approve medium operations
        if (request.estimatedCost <= this.config.tier2MaxCost &&
            request.agentCount <= this.config.maxAgentsPerTier2 &&
            (request.operationType === 'fix' || request.operationType === 'improve') &&
            request.riskLevel !== 'critical') {
            return AuthorizationTier.TIER_2_IMPROVE;
        }
        // Tier 3: Review required for larger operations
        if (request.estimatedCost > this.config.tier3MinCost ||
            request.operationType === 'feature' ||
            request.riskLevel === 'critical') {
            return AuthorizationTier.TIER_3_REVIEW;
        }
        // Default to tier 3 for unknown cases
        return AuthorizationTier.TIER_3_REVIEW;
    }
    createAuthorizationForTier(tier, request) {
        switch (tier) {
            case AuthorizationTier.TIER_1_AUTO_APPROVE:
                return this.createAuthorization(tier, true, 'Auto-approved: low-cost, low-risk operation', request.estimatedCost, false, ['No approval needed', 'Run immediately']);
            case AuthorizationTier.TIER_2_IMPROVE:
                return this.createAuthorization(tier, true, 'Auto-approved: within improvement budget', request.estimatedCost, false, ['System approval granted', 'Execute with monitoring']);
            case AuthorizationTier.TIER_3_REVIEW:
                return this.createAuthorization(tier, true, 'Requires approval: higher-cost operation', request.estimatedCost, true, ['Review estimated cost', 'Verify operation necessity', 'Check budget availability']);
            case AuthorizationTier.TIER_4_BLOCKED:
            default:
                return this.createAuthorization(AuthorizationTier.TIER_4_BLOCKED, false, 'Operation blocked: exceeds limits', request.estimatedCost, true, ['Reduce cost', 'Wait for budget reset']);
        }
    }
    createAuthorization(tier, allowed, reason, maxSpend, requiresApproval, conditions) {
        return {
            tier,
            allowed,
            reason,
            maxSpend,
            requiresApproval,
            conditions,
        };
    }
}
exports.DecisionEngine = DecisionEngine;
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
exports.decisionEngine = new DecisionEngine();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Quick authorization check
 */
function authorizeSwarm(request) {
    return exports.decisionEngine.getAuthorization(request);
}
/**
 * Check if swarm should auto-approve
 */
function canAutoApprove(request) {
    return exports.decisionEngine.shouldAutoApprove(request);
}
/**
 * Get formatted authorization status
 */
function getAuthorizationStatus(request) {
    const auth = exports.decisionEngine.getAuthorization(request);
    const icon = auth.allowed ? '✅' : '⛔';
    return `${icon} ${auth.tier}: ${auth.reason}`;
}
//# sourceMappingURL=decision-engine.js.map