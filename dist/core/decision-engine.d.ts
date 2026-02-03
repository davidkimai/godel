export declare enum AuthorizationTier {
    TIER_1_AUTO_APPROVE = "TIER_1_AUTO_APPROVE",// <$5, auto-fix, low risk
    TIER_2_IMPROVE = "TIER_2_IMPROVE",// <$10, improvements, medium risk
    TIER_3_REVIEW = "TIER_3_REVIEW",// >$10 or high risk, needs approval
    TIER_4_BLOCKED = "TIER_4_BLOCKED"
}
export interface SwarmAuthorization {
    tier: AuthorizationTier;
    allowed: boolean;
    reason: string;
    maxSpend: number;
    requiresApproval: boolean;
    conditions?: string[];
}
export interface DecisionRequest {
    swarmId?: string;
    estimatedCost: number;
    agentCount: number;
    operationType: 'fix' | 'improve' | 'feature' | 'research' | 'emergency';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    urgency: 'normal' | 'high' | 'critical';
    source: 'self_improvement' | 'human' | 'automation' | 'scheduled';
}
export declare class DecisionEngine {
    private config;
    private riskWeights;
    /**
     * Determine authorization tier for a swarm request
     */
    getAuthorization(request: DecisionRequest): SwarmAuthorization;
    /**
     * Quick check if operation should auto-approve
     */
    shouldAutoApprove(request: DecisionRequest): boolean;
    /**
     * Get approval requirements for a request
     */
    getApprovalRequirements(request: DecisionRequest): {
        required: boolean;
        approverType: 'human' | 'system' | 'none';
        conditions: string[];
        escalationPath: string[];
    };
    /**
     * Calculate risk score for an operation
     */
    calculateRiskScore(request: DecisionRequest): number;
    /**
     * Predict outcome based on historical patterns
     */
    predictOutcome(request: DecisionRequest): {
        successProbability: number;
        estimatedDuration: number;
        riskFactors: string[];
    };
    /**
     * Get decision history for learning
     */
    getDecisionStats(): {
        totalDecisions: number;
        autoApproved: number;
        humanApproved: number;
        blocked: number;
        averageRiskScore: number;
    };
    private determineTier;
    private createAuthorizationForTier;
    private createAuthorization;
}
export declare const decisionEngine: DecisionEngine;
/**
 * Quick authorization check
 */
export declare function authorizeSwarm(request: DecisionRequest): SwarmAuthorization;
/**
 * Check if swarm should auto-approve
 */
export declare function canAutoApprove(request: DecisionRequest): boolean;
/**
 * Get formatted authorization status
 */
export declare function getAuthorizationStatus(request: DecisionRequest): string;
//# sourceMappingURL=decision-engine.d.ts.map