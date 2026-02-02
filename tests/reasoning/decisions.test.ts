/**
 * Reasoning Module Tests - Decisions Tests
 * 
 * Tests for decision logging, retrieval, confidence tracking, and analysis.
 * Phase 3: Reasoning Features
 */

import {
  logDecision,
  getDecisionById,
  getDecisionsByAgent,
  getDecisionsByTask,
  queryDecisions,
  deleteDecision,
  compareDecisions,
  analyzeDecisionQuality,
  trackConfidence,
  getConfidenceByAgent,
  getConfidenceHistory,
  warnLowConfidence,
  getConfidenceStats,
  clearDecisions
} from '../../src/reasoning';

// ============================================================================
// Test Setup
// ============================================================================

beforeEach(() => {
  clearDecisions();
});

// ============================================================================
// Decision Logging Tests
// ============================================================================

describe('logDecision', () => {
  it('should log a decision with all required fields', () => {
    const decision = logDecision(
      'agent-1',
      'Choose approach A',
      ['approach A', 'approach B'],
      'A has better performance characteristics',
      'approach A',
      0.85,
      'task-1'
    );
    
    expect(decision.id).toBeDefined();
    expect(decision.id).toMatch(/^decision-[\d]+-[a-z0-9]+$/);
    expect(decision.agentId).toBe('agent-1');
    expect(decision.taskId).toBe('task-1');
    expect(decision.decision).toBe('Choose approach A');
    expect(decision.alternatives).toEqual(['approach A', 'approach B']);
    expect(decision.rationale).toBe('A has better performance characteristics');
    expect(decision.selected).toBe('approach A');
    expect(decision.confidence).toBe(0.85);
    expect(decision.timestamp).toBeInstanceOf(Date);
  });

  it('should log decision with default confidence value', () => {
    const decision = logDecision(
      'agent-2',
      'Test decision',
      ['alt1', 'alt2', 'alt3'],
      'Test rationale',
      'alt1'
    );
    
    expect(decision.confidence).toBe(0.5);
  });

  it('should clamp confidence to valid range', () => {
    const lowDecision = logDecision('agent', 'D1', [], 'R', 'sel', -0.1);
    const highDecision = logDecision('agent', 'D2', [], 'R', 'sel', 1.5);
    
    expect(lowDecision.confidence).toBe(0);
    expect(highDecision.confidence).toBe(1);
  });
});

// ============================================================================
// Decision Retrieval Tests
// ============================================================================

describe('getDecisionById', () => {
  it('should retrieve decision by ID', () => {
    const decision = logDecision('agent', 'Test', [], 'Rationale', 'sel', 0.8);
    const retrieved = getDecisionById(decision.id);
    expect(retrieved).toEqual(decision);
  });

  it('should return undefined for non-existent ID', () => {
    const result = getDecisionById('decision-12345-nonexistent');
    expect(result).toBeUndefined();
  });
});

describe('getDecisionsByAgent', () => {
  it('should return all decisions for an agent sorted by timestamp', () => {
    logDecision('agent-1', 'D1', [], 'R1', 'sel1', 0.5);
    logDecision('agent-1', 'D2', [], 'R2', 'sel2', 0.6);
    logDecision('agent-2', 'D3', [], 'R3', 'sel3', 0.7);
    
    const agent1Decisions = getDecisionsByAgent('agent-1');
    
    expect(agent1Decisions.length).toBe(2);
    expect(agent1Decisions.every(d => d.agentId === 'agent-1')).toBe(true);
    // Newest first
    expect(agent1Decisions[0].decision).toBe('D2');
  });

  it('should return empty array for non-existent agent', () => {
    const decisions = getDecisionsByAgent('non-existent-agent');
    expect(decisions).toEqual([]);
  });
});

// ============================================================================
// Decision Deletion Tests
// ============================================================================

describe('deleteDecision', () => {
  it('should delete an existing decision', () => {
    const decision = logDecision('agent', 'To delete', [], 'R', 'sel', 0.5);
    expect(getDecisionById(decision.id)).toEqual(decision);
    
    const result = deleteDecision(decision.id);
    
    expect(result).toBe(true);
    expect(getDecisionById(decision.id)).toBeUndefined();
  });

  it('should return false for non-existent decision', () => {
    const result = deleteDecision('non-existent-id');
    expect(result).toBe(false);
  });
});

// ============================================================================
// Decision Comparison Tests
// ============================================================================

describe('compareDecisions', () => {
  it('should compare two decisions', () => {
    const d1 = logDecision('agent', 'D1', ['a', 'b', 'c'], 'rationale one two three', 'a', 0.8);
    const d2 = logDecision('agent', 'D2', ['x', 'y'], 'rationale one three', 'x', 0.6);
    
    const comparison = compareDecisions(d1.id, d2.id);
    
    expect(comparison.decision1).toEqual(d1);
    expect(comparison.decision2).toEqual(d2);
    expect(comparison.comparison.confidenceDiff).toBeCloseTo(0.2, 1);
    expect(comparison.comparison.alternativeCountDiff).toBe(1);
    expect(['high', 'medium', 'low']).toContain(comparison.comparison.rationaleSimilarity);
  });

  it('should handle non-existent decisions gracefully', () => {
    const comparison = compareDecisions('non-existent-1', 'non-existent-2');
    
    expect(comparison.decision1).toBeUndefined();
    expect(comparison.decision2).toBeUndefined();
    expect(comparison.comparison.rationaleSimilarity).toBe('unknown');
  });
});

// ============================================================================
// Decision Quality Analysis Tests
// ============================================================================

describe('analyzeDecisionQuality', () => {
  it('should analyze decision quality', () => {
    const decision = logDecision(
      'agent',
      'High quality decision',
      ['alt1', 'alt2', 'alt3', 'alt4', 'alt5'],
      'This is a detailed rationale explaining the reasoning behind the decision with sufficient context and explanation.',
      'alt1',
      0.95
    );
    
    const analysis = analyzeDecisionQuality(decision.id);
    
    expect(analysis.decision).toEqual(decision);
    expect(analysis.quality).toBe('high');
    expect(analysis.score).toBeGreaterThanOrEqual(70);
    expect(analysis.factors.confidenceScore).toBeGreaterThan(90);
    expect(analysis.factors.alternativeScore).toBe(100);
  });

  it('should return low quality for non-existent decision', () => {
    const analysis = analyzeDecisionQuality('non-existent-id');
    
    expect(analysis.decision).toBeUndefined();
    expect(analysis.quality).toBe('low');
    expect(analysis.score).toBe(0);
    expect(analysis.suggestions).toContain('Decision not found');
  });

  it('should provide suggestions for low quality decisions', () => {
    const decision = logDecision('agent', 'D', [], 'Short', 'sel', 0.3);
    
    const analysis = analyzeDecisionQuality(decision.id);
    
    expect(analysis.quality).toBe('low');
    expect(analysis.suggestions.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Confidence Tracking Tests
// ============================================================================

describe('trackConfidence', () => {
  it('should track confidence for an agent', () => {
    const tracking = trackConfidence('agent-1', 0.75, 'task-1');
    
    expect(tracking.agentId).toBe('agent-1');
    expect(tracking.taskId).toBe('task-1');
    expect(tracking.confidence).toBe(0.75);
    expect(tracking.thresholds.warning).toBe(0.5);
    expect(tracking.thresholds.critical).toBe(0.3);
  });

  it('should clamp confidence to valid range', () => {
    const lowTracking = trackConfidence('agent', -0.5);
    expect(lowTracking.confidence).toBe(0);
    
    const highTracking = trackConfidence('agent', 1.5);
    expect(highTracking.confidence).toBe(1);
  });

  it('should add warnings when confidence is low', () => {
    const tracking = trackConfidence('agent-low', 0.2);
    
    expect(tracking.warnings.length).toBeGreaterThan(0);
    expect(tracking.warnings[0]).toContain('CRITICAL');
  });
});

describe('getConfidenceByAgent', () => {
  it('should retrieve confidence tracking for an agent', () => {
    trackConfidence('conf-agent', 0.8);
    
    const tracking = getConfidenceByAgent('conf-agent');
    
    expect(tracking).toBeDefined();
    expect(tracking?.confidence).toBe(0.8);
  });

  it('should return undefined for non-existent agent', () => {
    const tracking = getConfidenceByAgent('non-existent-agent');
    expect(tracking).toBeUndefined();
  });
});

describe('getConfidenceHistory', () => {
  it('should return confidence history for an agent', () => {
    trackConfidence('history-agent', 0.9);
    trackConfidence('history-agent', 0.7);
    trackConfidence('history-agent', 0.5);
    
    const history = getConfidenceHistory('history-agent');
    
    expect(history.length).toBe(3);
    expect(history[0].confidence).toBe(0.9);
    expect(history[2].confidence).toBe(0.5);
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      trackConfidence('limit-agent', 0.5 + i * 0.05);
    }
    
    const history = getConfidenceHistory('limit-agent', 3);
    
    expect(history.length).toBe(3);
  });
});

describe('warnLowConfidence', () => {
  it('should return warnings when confidence is below threshold', () => {
    trackConfidence('warn-agent', 0.3);
    
    const warnings = warnLowConfidence('warn-agent', 0.5);
    
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('below threshold');
  });

  it('should return no warnings when confidence is above threshold', () => {
    trackConfidence('high-conf-agent', 0.8);
    
    const warnings = warnLowConfidence('high-conf-agent', 0.5);
    
    expect(warnings.length).toBe(0);
  });

  it('should return empty array for non-existent agent', () => {
    const warnings = warnLowConfidence('non-existent-agent');
    expect(warnings).toEqual([]);
  });
});

describe('getConfidenceStats', () => {
  it('should return confidence statistics for an agent', () => {
    trackConfidence('stats-agent', 0.9);
    trackConfidence('stats-agent', 0.7);
    trackConfidence('stats-agent', 0.5);
    trackConfidence('stats-agent', 0.6);
    
    const stats = getConfidenceStats('stats-agent');
    
    expect(stats.current).toBe(0.6);
    expect(stats.average).toBeCloseTo(0.675, 2);
    expect(stats.min).toBe(0.5);
    expect(stats.max).toBe(0.9);
    expect(['up', 'down', 'stable']).toContain(stats.trend);
  });

  it('should return zero stats for non-existent agent', () => {
    const stats = getConfidenceStats('non-existent-agent');
    
    expect(stats.current).toBe(0);
    expect(stats.average).toBe(0);
    expect(stats.warningCount).toBe(0);
  });
});
