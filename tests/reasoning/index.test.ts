/**
 * Reasoning Module Tests - Index Tests
 * 
 * Tests for initReasoning(), getReasoningReport(), and integration tests.
 * Phase 3: Reasoning Features
 */

import {
  initReasoning,
  recordTrace,
  getTraceById,
  getTracesByAgent,
  logDecision,
  getDecisionById,
  trackConfidence,
  warnLowConfidence,
  getReasoningReport,
  getTraceStats,
  getConfidenceStats,
  clearTraces,
  clearDecisions
} from '../../src/reasoning';
import { ReasoningType } from '../../src/reasoning/types';

// ============================================================================
// Test Setup
// ============================================================================

beforeEach(() => {
  // Clear all in-memory stores before each test
  clearTraces();
  clearDecisions();
});

afterEach(() => {
  // Clean up after each test
  jest.clearAllMocks();
});

// ============================================================================
// initReasoning Tests
// ============================================================================

describe('initReasoning', () => {
  it('should initialize reasoning for an agent without errors', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Should not throw
    expect(() => initReasoning('test-agent')).not.toThrow();
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Reasoning initialized for agent: test-agent')
    );
    
    consoleSpy.mockRestore();
  });

  it('should handle multiple agent initializations', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    initReasoning('agent-1');
    initReasoning('agent-2');
    initReasoning('agent-3');
    
    expect(consoleSpy).toHaveBeenCalledTimes(3);
    
    consoleSpy.mockRestore();
  });

  it('should accept empty agent ID without throwing', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    expect(() => initReasoning('')).not.toThrow();
    
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// getReasoningReport Tests
// ============================================================================

describe('getReasoningReport', () => {
  it('should generate a report for an agent with no data', () => {
    const report = getReasoningReport('empty-agent');
    
    expect(report).toHaveProperty('traceStats');
    expect(report).toHaveProperty('confidenceStats');
    expect(report).toHaveProperty('decisions');
    expect(report).toHaveProperty('lowConfidenceWarnings');
    
    expect(report.traceStats.totalTraces).toBe(0);
    expect(report.traceStats.byType).toBeDefined();
    expect(report.confidenceStats.current).toBe(0);
    expect(report.decisions).toEqual([]);
    expect(report.lowConfidenceWarnings).toEqual([]);
  });

  it('should include traces and decisions in the report', () => {
    // Add some traces
    recordTrace('agent-1', ReasoningType.HYPOTHESIS, 'Test hypothesis', ['evidence1'], 0.8, 'task-1');
    recordTrace('agent-1', ReasoningType.ANALYSIS, 'Test analysis', ['evidence2'], 0.6);
    
    // Add a decision
    logDecision('agent-1', 'Test decision', ['alt1', 'alt2'], 'Test rationale', 'alt1', 0.9, 'task-1');
    
    const report = getReasoningReport('agent-1');
    
    expect(report.traceStats.totalTraces).toBe(2);
    expect(report.decisions.length).toBe(1);
    expect(report.traceStats.averageConfidence).toBe(0.7);
  });

  it('should include confidence warnings when confidence is low', () => {
    // Track low confidence
    trackConfidence('agent-2', 0.3);
    
    const report = getReasoningReport('agent-2');
    
    expect(report.lowConfidenceWarnings.length).toBeGreaterThan(0);
  });

  it('should include optional taskId in report generation', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    const report = getReasoningReport('agent-3', 'specific-task');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('task: specific-task')
    );
    
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Integration Tests - Full Workflow
// ============================================================================

describe('Reasoning Module Integration', () => {
  it('should handle complete reasoning workflow', () => {
    const agentId = 'workflow-agent';
    
    // Initialize
    initReasoning(agentId);
    
    // Record traces
    const trace1 = recordTrace(agentId, ReasoningType.HYPOTHESIS, 'Initial hypothesis', [], 0.7, 'task-1');
    const trace2 = recordTrace(agentId, ReasoningType.ANALYSIS, 'Analysis of hypothesis', ['data'], 0.85, 'task-1');
    const trace3 = recordTrace(agentId, ReasoningType.DECISION, 'Final decision trace', [], 0.9, 'task-1');
    
    expect(trace1.id).toBeDefined();
    expect(trace2.id).toBeDefined();
    expect(trace3.id).toBeDefined();
    
    // Retrieve traces by agent
    const agentTraces = getTracesByAgent(agentId);
    expect(agentTraces.length).toBe(3);
    
    // Retrieve by ID
    const retrievedTrace = getTraceById(trace1.id);
    expect(retrievedTrace).toEqual(trace1);
    
    // Log decision
    const decision = logDecision(
      agentId,
      'Choose approach A',
      ['approach A', 'approach B', 'approach C'],
      'A has better performance',
      'approach A',
      0.88,
      'task-1'
    );
    
    expect(decision.id).toBeDefined();
    
    const retrievedDecision = getDecisionById(decision.id);
    expect(retrievedDecision).toEqual(decision);
    
    // Track confidence
    const confidence = trackConfidence(agentId, 0.75, 'task-1');
    expect(confidence.confidence).toBe(0.75);
    
    // Get warnings
    const warnings = warnLowConfidence(agentId);
    // Low confidence is 0.75 which is above threshold 0.5, so no warnings
    expect(warnings.length).toBe(0);
    
    // Get report
    const report = getReasoningReport(agentId);
    expect(report.traceStats.totalTraces).toBe(3);
    expect(report.decisions.length).toBe(1);
    expect(report.confidenceStats.current).toBe(0.75);
  });

  it('should correctly calculate trace statistics', () => {
    const agentId = 'stats-agent';
    
    // Record traces of different types
    recordTrace(agentId, ReasoningType.HYPOTHESIS, 'H1', [], 0.5);
    recordTrace(agentId, ReasoningType.HYPOTHESIS, 'H2', [], 0.6);
    recordTrace(agentId, ReasoningType.ANALYSIS, 'A1', [], 0.7);
    recordTrace(agentId, ReasoningType.DECISION, 'D1', [], 0.8);
    recordTrace(agentId, ReasoningType.CORRECTION, 'C1', [], 0.9);
    
    const stats = getTraceStats(agentId);
    
    expect(stats.totalTraces).toBe(5);
    expect(stats.byType[ReasoningType.HYPOTHESIS]).toBe(2);
    expect(stats.byType[ReasoningType.ANALYSIS]).toBe(1);
    expect(stats.byType[ReasoningType.DECISION]).toBe(1);
    expect(stats.byType[ReasoningType.CORRECTION]).toBe(1);
    expect(stats.averageConfidence).toBeCloseTo(0.7, 1);
    expect(stats.latestTrace).not.toBeNull();
  });

  it('should correctly calculate confidence statistics', () => {
    const agentId = 'conf-stats-agent';
    
    // Track multiple confidence values
    trackConfidence(agentId, 0.9);
    trackConfidence(agentId, 0.7);
    trackConfidence(agentId, 0.5);
    trackConfidence(agentId, 0.6);
    
    const stats = getConfidenceStats(agentId);
    
    expect(stats.current).toBe(0.6); // Last tracked value
    expect(stats.average).toBeCloseTo(0.675, 2); // (0.9 + 0.7 + 0.5 + 0.6) / 4
    expect(stats.min).toBe(0.5);
    expect(stats.max).toBe(0.9);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Reasoning Module Edge Cases', () => {
  it('should handle non-existent trace ID gracefully', () => {
    const trace = getTraceById('non-existent-id');
    expect(trace).toBeUndefined();
  });

  it('should handle non-existent decision ID gracefully', () => {
    const decision = getDecisionById('non-existent-id');
    expect(decision).toBeUndefined();
  });

  it('should handle non-existent agent for trace stats', () => {
    const stats = getTraceStats('non-existent-agent');
    expect(stats.totalTraces).toBe(0);
    expect(stats.averageConfidence).toBe(0);
    expect(stats.latestTrace).toBeNull();
  });

  it('should handle non-existent agent for confidence stats', () => {
    const stats = getConfidenceStats('non-existent-agent');
    expect(stats.current).toBe(0);
    expect(stats.average).toBe(0);
  });

  it('should clamp confidence values between 0 and 1', () => {
    const agentId = 'clamp-test-agent';
    
    const lowTrace = recordTrace(agentId, ReasoningType.HYPOTHESIS, 'Low confidence', [], -0.5);
    const highTrace = recordTrace(agentId, ReasoningType.HYPOTHESIS, 'High confidence', [], 1.5);
    
    expect(lowTrace.confidence).toBe(0);
    expect(highTrace.confidence).toBe(1);
    
    const lowDecision = logDecision(agentId, 'Decision 1', [], 'Rationale', 'sel', -0.1);
    const highDecision = logDecision(agentId, 'Decision 2', [], 'Rationale', 'sel', 2.0);
    
    expect(lowDecision.confidence).toBe(0);
    expect(highDecision.confidence).toBe(1);
    
    const lowConfidence = trackConfidence(agentId, -0.3);
    const highConfidence = trackConfidence(agentId, 1.3);
    
    expect(lowConfidence.confidence).toBe(0);
    expect(highConfidence.confidence).toBe(1);
  });
});
