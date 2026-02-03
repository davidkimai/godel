import { DecisionEngine, decisionEngine, AuthorizationTier } from '../../../src/core/decision-engine';

describe('DecisionEngine', () => {
  describe('getAuthorization', () => {
    it('should auto-approve low-cost fix operations', () => {
      const request = {
        estimatedCost: 3.00,
        agentCount: 3,
        operationType: 'fix' as const,
        riskLevel: 'low' as const,
        description: 'Fix minor bug',
        urgency: 'normal' as const,
        source: 'automation' as const,
      };

      const auth = decisionEngine.getAuthorization(request);
      // With featureRequiresReview=true default, falls to TIER_2
      expect(auth.allowed).toBe(true);
      expect(auth.tier).toMatch(/TIER_1_AUTO_APPROVE|TIER_2_IMPROVE/);
    });

    it('should require approval for high-cost operations', () => {
      const request = {
        estimatedCost: 25.00,
        agentCount: 5,
        operationType: 'feature' as const,
        riskLevel: 'high' as const,
        description: 'New feature',
        urgency: 'normal' as const,
        source: 'human' as const,
      };

      const auth = decisionEngine.getAuthorization(request);
      expect(auth.tier).toBe(AuthorizationTier.TIER_3_REVIEW);
      expect(auth.requiresApproval).toBe(true);
    });

    it('should block operations exceeding budget', () => {
      const request = {
        estimatedCost: 150.00,
        agentCount: 10,
        operationType: 'feature' as const,
        riskLevel: 'high' as const,
        description: 'Expensive feature',
        urgency: 'normal' as const,
        source: 'human' as const,
      };

      const auth = decisionEngine.getAuthorization(request);
      expect(auth.tier).toBe(AuthorizationTier.TIER_4_BLOCKED);
      expect(auth.allowed).toBe(false);
    });

    it('should fast-track critical emergency operations', () => {
      const request = {
        estimatedCost: 15.00,
        agentCount: 5,
        operationType: 'emergency' as const,
        riskLevel: 'critical' as const,
        description: 'Critical production issue',
        urgency: 'critical' as const,
        source: 'automation' as const,
      };

      const auth = decisionEngine.getAuthorization(request);
      expect(auth.tier).toBe(AuthorizationTier.TIER_3_REVIEW);
      expect(auth.allowed).toBe(true);
    });
  });

  describe('shouldAutoApprove', () => {
    it('should return true for Tier 1 operations', () => {
      const request = {
        estimatedCost: 2.00,
        agentCount: 2,
        operationType: 'fix' as const,
        riskLevel: 'low' as const,
        description: 'Quick fix',
        urgency: 'normal' as const,
        source: 'automation' as const,
      };

      expect(decisionEngine.shouldAutoApprove(request)).toBe(true);
    });

    it('should return true for Tier 2 operations (also auto-approves)', () => {
      const request = {
        estimatedCost: 8.00,
        agentCount: 5,
        operationType: 'improve' as const,
        riskLevel: 'medium' as const,
        description: 'Improvement',
        urgency: 'normal' as const,
        source: 'automation' as const,
      };

      // TIER_2 also auto-approves (no human approval needed)
      expect(decisionEngine.shouldAutoApprove(request)).toBe(true);
    });

    it('should return false for Tier 3 operations (requires review)', () => {
      const request = {
        estimatedCost: 25.00,
        agentCount: 5,
        operationType: 'feature' as const,
        riskLevel: 'high' as const,
        description: 'New feature',
        urgency: 'normal' as const,
        source: 'human' as const,
      };

      expect(decisionEngine.shouldAutoApprove(request)).toBe(false);
    });
  });

  describe('calculateRiskScore', () => {
    it('should calculate higher risk for more agents', () => {
      const lowAgentRequest = {
        estimatedCost: 5.00,
        agentCount: 2,
        operationType: 'fix' as const,
        riskLevel: 'low' as const,
        description: 'Simple fix',
        urgency: 'normal' as const,
        source: 'automation' as const,
      };

      const highAgentRequest = {
        ...lowAgentRequest,
        agentCount: 15,
      };

      const lowRisk = decisionEngine.calculateRiskScore(lowAgentRequest);
      const highRisk = decisionEngine.calculateRiskScore(highAgentRequest);

      expect(highRisk).toBeGreaterThan(lowRisk);
    });

    it('should return score between 0 and 1', () => {
      const request = {
        estimatedCost: 25.00,
        agentCount: 10,
        operationType: 'feature' as const,
        riskLevel: 'high' as const,
        description: 'Complex feature',
        urgency: 'normal' as const,
        source: 'human' as const,
      };

      const score = decisionEngine.calculateRiskScore(request);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('predictOutcome', () => {
    it('should predict higher success for lower risk', () => {
      const lowRiskRequest = {
        estimatedCost: 2.00,
        agentCount: 2,
        operationType: 'fix' as const,
        riskLevel: 'low' as const,
        description: 'Simple fix',
        urgency: 'normal' as const,
        source: 'automation' as const,
      };

      const highRiskRequest = {
        ...lowRiskRequest,
        riskLevel: 'critical' as const,
      };

      const lowRiskOutcome = decisionEngine.predictOutcome(lowRiskRequest);
      const highRiskOutcome = decisionEngine.predictOutcome(highRiskRequest);

      expect(lowRiskOutcome.successProbability).toBeGreaterThan(highRiskOutcome.successProbability);
    });

    it('should estimate longer duration for more agents', () => {
      const fewAgentsRequest = {
        estimatedCost: 5.00,
        agentCount: 2,
        operationType: 'fix' as const,
        riskLevel: 'low' as const,
        description: 'Simple fix',
        urgency: 'normal' as const,
        source: 'automation' as const,
      };

      const manyAgentsRequest = {
        ...fewAgentsRequest,
        agentCount: 15,
      };

      const fewOutcome = decisionEngine.predictOutcome(fewAgentsRequest);
      const manyOutcome = decisionEngine.predictOutcome(manyAgentsRequest);

      expect(manyOutcome.estimatedDuration).toBeGreaterThan(fewOutcome.estimatedDuration);
    });
  });

  describe('getDecisionStats', () => {
    it('should return decision statistics', () => {
      const stats = decisionEngine.getDecisionStats();

      expect(stats).toHaveProperty('totalDecisions');
      expect(stats).toHaveProperty('autoApproved');
      expect(stats).toHaveProperty('humanApproved');
      expect(stats).toHaveProperty('blocked');
      expect(stats).toHaveProperty('averageRiskScore');
    });
  });
});
