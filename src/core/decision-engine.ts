import { logger } from '../utils/logger';
import { budgetController } from './budget-controller';

// ============================================================================
// AUTHORIZATION TIERS
// ============================================================================

export enum AuthorizationTier {
  TIER_1_AUTO_APPROVE = 'TIER_1_AUTO_APPROVE', // <$5, auto-fix, low risk
  TIER_2_IMPROVE = 'TIER_2_IMPROVE',           // <$10, improvements, medium risk
  TIER_3_REVIEW = 'TIER_3_REVIEW',             // >$10 or high risk, needs approval
  TIER_4_BLOCKED = 'TIER_4_BLOCKED',           // Exceeds limits, blocked
}

export interface TeamAuthorization {
  tier: AuthorizationTier;
  allowed: boolean;
  reason: string;
  maxSpend: number;
  requiresApproval: boolean;
  conditions?: string[];
}

export interface DecisionRequest {
  teamId?: string;
  estimatedCost: number;
  agentCount: number;
  operationType: 'fix' | 'improve' | 'feature' | 'research' | 'emergency';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  urgency: 'normal' | 'high' | 'critical';
  source: 'self_improvement' | 'human' | 'automation' | 'scheduled';
}

// ============================================================================
// DECISION ENGINE
// ============================================================================

export class DecisionEngine {
  // Configuration for tier thresholds
  private config = {
    tier1MaxCost: 5.00,        // Auto-approve under $5
    tier2MaxCost: 10.00,       // Auto-approve under $10
    tier3MinCost: 10.00,       // Review over $10
    maxAgentsPerTier1: 5,      // Max agents for auto-approve
    maxAgentsPerTier2: 10,     // Max agents for tier 2
    autoFixAllowed: true,      // Allow auto-fix operations
    featureRequiresReview: true, // Features always need review
    emergencyBypasses: true,   // Emergency operations bypass limits
  };

  // Operation risk weights
  private riskWeights = {
    fix: { low: 0.3, medium: 0.5, high: 0.7, critical: 0.9 },
    improve: { low: 0.4, medium: 0.6, high: 0.8, critical: 0.95 },
    feature: { low: 0.5, medium: 0.7, high: 0.9, critical: 1.0 },
    research: { low: 0.2, medium: 0.4, high: 0.6, critical: 0.8 },
    emergency: { low: 0.6, medium: 0.8, high: 0.95, critical: 1.0 },
  };

  // =========================================================================
  // PUBLIC METHODS
  // =========================================================================

  /**
   * Determine authorization tier for a team request
   */
  getAuthorization(request: DecisionRequest): TeamAuthorization {
    // Check emergency bypass
    if (request.urgency === 'critical' && this.config.emergencyBypasses) {
      return this.createAuthorization(
        AuthorizationTier.TIER_3_REVIEW,
        true,
        'Emergency operation - fast-tracked for review',
        request.estimatedCost,
        false,
        ['Emergency bypass active', 'Requires post-execution review']
      );
    }

    // Check budget limits
    const budgetCheck = budgetController.checkLimits({
      agentCount: request.agentCount,
      swarmBudget: request.estimatedCost,
    });

    if (!budgetCheck.allowed) {
      return this.createAuthorization(
        AuthorizationTier.TIER_4_BLOCKED,
        false,
        budgetCheck.reason || 'Budget limits exceeded',
        request.estimatedCost,
        true,
        ['Reduce cost', 'Reduce agent count', 'Wait for budget reset']
      );
    }

    // Determine tier based on cost and operation type
    const tier = this.determineTier(request);

    return this.createAuthorizationForTier(tier, request);
  }

  /**
   * Quick check if operation should auto-approve
   */
  shouldAutoApprove(request: DecisionRequest): boolean {
    const auth = this.getAuthorization(request);
    // TIER_1 and TIER_2 both don't require approval
    return (
      (auth.tier === AuthorizationTier.TIER_1_AUTO_APPROVE ||
       auth.tier === AuthorizationTier.TIER_2_IMPROVE) &&
      auth.allowed
    );
  }

  /**
   * Get approval requirements for a request
   */
  getApprovalRequirements(request: DecisionRequest): {
    required: boolean;
    approverType: 'human' | 'system' | 'none';
    conditions: string[];
    escalationPath: string[];
  } {
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
  calculateRiskScore(request: DecisionRequest): number {
    const weight = this.riskWeights[request.operationType]?.[request.riskLevel] || 0.5;
    const agentFactor = Math.min(request.agentCount / 20, 1) * 0.3;
    const costFactor = Math.min(request.estimatedCost / 50, 1) * 0.4;
    
    return Math.min(weight + agentFactor + costFactor, 1.0);
  }

  /**
   * Predict outcome based on historical patterns
   */
  predictOutcome(request: DecisionRequest): {
    successProbability: number;
    estimatedDuration: number;
    riskFactors: string[];
  } {
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
    const riskFactors: string[] = [];
    if (request.agentCount > 10) riskFactors.push('High agent count');
    if (request.estimatedCost > 20) riskFactors.push('High cost');
    if (request.riskLevel === 'high' || request.riskLevel === 'critical') {
      riskFactors.push('High risk operation');
    }
    if (request.operationType === 'feature') riskFactors.push('Feature development');

    return {
      successProbability,
      estimatedDuration,
      riskFactors,
    };
  }

  /**
   * Get decision history for learning
   */
  getDecisionStats(): {
    totalDecisions: number;
    autoApproved: number;
    humanApproved: number;
    blocked: number;
    averageRiskScore: number;
  } {
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

  private determineTier(request: DecisionRequest): AuthorizationTier {
    // Tier 1: Auto-approve small, low-risk operations
    if (
      request.estimatedCost <= this.config.tier1MaxCost &&
      request.agentCount <= this.config.maxAgentsPerTier1 &&
      (request.operationType === 'fix' || request.operationType === 'research') &&
      request.riskLevel !== 'critical' &&
      !this.config.featureRequiresReview
    ) {
      return AuthorizationTier.TIER_1_AUTO_APPROVE;
    }

    // Tier 2: Auto-approve medium operations
    if (
      request.estimatedCost <= this.config.tier2MaxCost &&
      request.agentCount <= this.config.maxAgentsPerTier2 &&
      (request.operationType === 'fix' || request.operationType === 'improve') &&
      request.riskLevel !== 'critical'
    ) {
      return AuthorizationTier.TIER_2_IMPROVE;
    }

    // Tier 3: Review required for larger operations
    if (
      request.estimatedCost > this.config.tier3MinCost ||
      request.operationType === 'feature' ||
      request.riskLevel === 'critical'
    ) {
      return AuthorizationTier.TIER_3_REVIEW;
    }

    // Default to tier 3 for unknown cases
    return AuthorizationTier.TIER_3_REVIEW;
  }

  private createAuthorizationForTier(
    tier: AuthorizationTier,
    request: DecisionRequest
  ): TeamAuthorization {
    switch (tier) {
      case AuthorizationTier.TIER_1_AUTO_APPROVE:
        return this.createAuthorization(
          tier,
          true,
          'Auto-approved: low-cost, low-risk operation',
          request.estimatedCost,
          false,
          ['No approval needed', 'Run immediately']
        );

      case AuthorizationTier.TIER_2_IMPROVE:
        return this.createAuthorization(
          tier,
          true,
          'Auto-approved: within improvement budget',
          request.estimatedCost,
          false,
          ['System approval granted', 'Execute with monitoring']
        );

      case AuthorizationTier.TIER_3_REVIEW:
        return this.createAuthorization(
          tier,
          true,
          'Requires approval: higher-cost operation',
          request.estimatedCost,
          true,
          ['Review estimated cost', 'Verify operation necessity', 'Check budget availability']
        );

      case AuthorizationTier.TIER_4_BLOCKED:
      default:
        return this.createAuthorization(
          AuthorizationTier.TIER_4_BLOCKED,
          false,
          'Operation blocked: exceeds limits',
          request.estimatedCost,
          true,
          ['Reduce cost', 'Wait for budget reset']
        );
    }
  }

  private createAuthorization(
    tier: AuthorizationTier,
    allowed: boolean,
    reason: string,
    maxSpend: number,
    requiresApproval: boolean,
    conditions: string[]
  ): TeamAuthorization {
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

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const decisionEngine = new DecisionEngine();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick authorization check
 */
export function authorizeTeam(request: DecisionRequest): TeamAuthorization {
  return decisionEngine.getAuthorization(request);
}

/**
 * Check if team should auto-approve
 */
export function canAutoApprove(request: DecisionRequest): boolean {
  return decisionEngine.shouldAutoApprove(request);
}

/**
 * Get formatted authorization status
 */
export function getAuthorizationStatus(request: DecisionRequest): string {
  const auth = decisionEngine.getAuthorization(request);
  const icon = auth.allowed ? '✅' : '⛔';
  return `${icon} ${auth.tier}: ${auth.reason}`;
}
