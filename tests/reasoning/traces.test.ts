/**
 * Reasoning Module Tests - Traces Tests
 * 
 * Tests for trace recording, retrieval, and management operations.
 * Phase 3: Reasoning Features
 */

import {
  recordTrace,
  getTraceById,
  getTracesByAgent,
  getTracesByTask,
  getTracesByType,
  queryTraces,
  deleteTrace,
  getTraceStats,
  clearTraces
} from '../../src/reasoning';
import { ReasoningType } from '../../src/reasoning/types';

// ============================================================================
// Test Setup
// ============================================================================

beforeEach(() => {
  clearTraces();
});

// ============================================================================
// Trace Recording Tests
// ============================================================================

describe('recordTrace', () => {
  it('should record a trace with all required fields', () => {
    const trace = recordTrace(
      'agent-1',
      ReasoningType.HYPOTHESIS,
      'Test hypothesis content',
      ['evidence1', 'evidence2'],
      0.8,
      'task-1'
    );
    
    expect(trace.id).toBeDefined();
    expect(trace.id).toMatch(/^trace-[\d]+-[a-z0-9]+$/);
    
    expect(trace.agentId).toBe('agent-1');
    expect(trace.taskId).toBe('task-1');
    expect(trace.type).toBe(ReasoningType.HYPOTHESIS);
    expect(trace.content).toBe('Test hypothesis content');
    expect(trace.evidence).toEqual(['evidence1', 'evidence2']);
    expect(trace.confidence).toBe(0.8);
    expect(trace.timestamp).toBeInstanceOf(Date);
  });

  it('should record trace with default values for optional fields', () => {
    const trace = recordTrace(
      'agent-2',
      ReasoningType.ANALYSIS,
      'Analysis without optional fields'
    );
    
    expect(trace.evidence).toEqual([]);
    expect(trace.confidence).toBe(0.5); // Default confidence
    expect(trace.taskId).toBeUndefined();
    expect(trace.metadata).toBeUndefined();
  });

  it('should accept metadata with trace', () => {
    const metadata = { source: 'test', version: '1.0' };
    
    const trace = recordTrace(
      'agent-3',
      ReasoningType.DECISION,
      'Decision with metadata',
      [],
      0.9,
      'task-2',
      metadata
    );
    
    expect(trace.metadata).toEqual(metadata);
  });

  it('should generate unique IDs for each trace', () => {
    const trace1 = recordTrace('agent', ReasoningType.HYPOTHESIS, 'Trace 1');
    const trace2 = recordTrace('agent', ReasoningType.HYPOTHESIS, 'Trace 2');
    const trace3 = recordTrace('agent', ReasoningType.HYPOTHESIS, 'Trace 3');
    
    expect(trace1.id).not.toBe(trace2.id);
    expect(trace2.id).not.toBe(trace3.id);
    expect(trace1.id).not.toBe(trace3.id);
  });

  it('should clamp confidence to valid range', () => {
    const lowTrace = recordTrace('agent', ReasoningType.HYPOTHESIS, 'Low', [], -0.5);
    const highTrace = recordTrace('agent', ReasoningType.HYPOTHESIS, 'High', [], 1.5);
    
    expect(lowTrace.confidence).toBe(0);
    expect(highTrace.confidence).toBe(1);
  });
});

// ============================================================================
// Trace Retrieval Tests
// ============================================================================

describe('getTraceById', () => {
  it('should retrieve trace by ID', () => {
    const trace = recordTrace('agent', ReasoningType.HYPOTHESIS, 'Test');
    
    const retrieved = getTraceById(trace.id);
    
    expect(retrieved).toEqual(trace);
  });

  it('should return undefined for non-existent ID', () => {
    const result = getTraceById('trace-12345-nonexistent');
    
    expect(result).toBeUndefined();
  });
});

describe('getTracesByAgent', () => {
  it('should return all traces for an agent', () => {
    recordTrace('agent-1', ReasoningType.HYPOTHESIS, 'H1');
    recordTrace('agent-1', ReasoningType.ANALYSIS, 'A1');
    recordTrace('agent-2', ReasoningType.HYPOTHESIS, 'H2');
    
    const agent1Traces = getTracesByAgent('agent-1');
    
    expect(agent1Traces.length).toBe(2);
    expect(agent1Traces.every(t => t.agentId === 'agent-1')).toBe(true);
  });

  it('should return traces sorted by timestamp (newest first)', () => {
    recordTrace('agent', ReasoningType.HYPOTHESIS, 'First');
    recordTrace('agent', ReasoningType.ANALYSIS, 'Second');
    recordTrace('agent', ReasoningType.DECISION, 'Third');
    
    const traces = getTracesByAgent('agent');
    
    expect(traces[0].content).toBe('Third');
    expect(traces[1].content).toBe('Second');
    expect(traces[2].content).toBe('First');
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      recordTrace('agent', ReasoningType.HYPOTHESIS, `Trace ${i}`);
    }
    
    const traces = getTracesByAgent('agent', 3);
    
    expect(traces.length).toBe(3);
  });

  it('should return empty array for non-existent agent', () => {
    const traces = getTracesByAgent('non-existent-agent');
    
    expect(traces).toEqual([]);
  });
});

describe('getTracesByTask', () => {
  it('should return traces for a specific task', () => {
    recordTrace('agent', ReasoningType.HYPOTHESIS, 'Task 1 trace 1', [], 0.5, 'task-1');
    recordTrace('agent', ReasoningType.ANALYSIS, 'Task 1 trace 2', [], 0.6, 'task-1');
    recordTrace('agent', ReasoningType.DECISION, 'Task 2 trace', [], 0.7, 'task-2');
    
    const task1Traces = getTracesByTask('task-1');
    
    expect(task1Traces.length).toBe(2);
    expect(task1Traces.every(t => t.taskId === 'task-1')).toBe(true);
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      recordTrace('agent', ReasoningType.HYPOTHESIS, `Trace ${i}`, [], 0.5, 'task-limit');
    }
    
    const traces = getTracesByTask('task-limit', 2);
    
    expect(traces.length).toBe(2);
  });
});

describe('getTracesByType', () => {
  it('should return traces filtered by type', () => {
    recordTrace('agent', ReasoningType.HYPOTHESIS, 'H1');
    recordTrace('agent', ReasoningType.HYPOTHESIS, 'H2');
    recordTrace('agent', ReasoningType.ANALYSIS, 'A1');
    recordTrace('agent', ReasoningType.DECISION, 'D1');
    recordTrace('agent', ReasoningType.CORRECTION, 'C1');
    
    const hypotheses = getTracesByType(ReasoningType.HYPOTHESIS);
    const analysis = getTracesByType(ReasoningType.ANALYSIS);
    
    expect(hypotheses.length).toBe(2);
    expect(hypotheses.every(t => t.type === ReasoningType.HYPOTHESIS)).toBe(true);
    
    expect(analysis.length).toBe(1);
    expect(analysis[0].type).toBe(ReasoningType.ANALYSIS);
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      recordTrace('agent', ReasoningType.HYPOTHESIS, `H${i}`);
    }
    
    const traces = getTracesByType(ReasoningType.HYPOTHESIS, 3);
    
    expect(traces.length).toBe(3);
  });
});

// ============================================================================
// Trace Query Tests
// ============================================================================

describe('queryTraces', () => {
  beforeEach(() => {
    // Set up test data
    recordTrace('agent-1', ReasoningType.HYPOTHESIS, 'H1', [], 0.8, 'task-1');
    recordTrace('agent-1', ReasoningType.ANALYSIS, 'A1', [], 0.6, 'task-1');
    recordTrace('agent-1', ReasoningType.DECISION, 'D1', [], 0.9, 'task-2');
    recordTrace('agent-2', ReasoningType.HYPOTHESIS, 'H2', [], 0.7, 'task-1');
  });

  it('should filter by agentId', () => {
    const results = queryTraces({ agentId: 'agent-1' });
    
    expect(results.every(t => t.agentId === 'agent-1')).toBe(true);
    expect(results.length).toBe(3);
  });

  it('should filter by taskId', () => {
    const results = queryTraces({ taskId: 'task-1' });
    
    expect(results.every(t => t.taskId === 'task-1')).toBe(true);
    expect(results.length).toBe(3);
  });

  it('should filter by type', () => {
    const results = queryTraces({ type: ReasoningType.HYPOTHESIS });
    
    expect(results.every(t => t.type === ReasoningType.HYPOTHESIS)).toBe(true);
    expect(results.length).toBe(2);
  });

  it('should filter by minConfidence', () => {
    const results = queryTraces({ minConfidence: 0.75 });

    expect(results.every(t => t.confidence >= 0.75)).toBe(true);
    // Should include traces with confidence 0.8, 0.9 (0.7 is excluded since 0.7 < 0.75)
    expect(results.length).toBe(2);
  });

  it('should filter by maxConfidence', () => {
    const results = queryTraces({ maxConfidence: 0.7 });
    
    expect(results.every(t => t.confidence <= 0.7)).toBe(true);
    // Should include traces with confidence 0.6 and 0.7
    expect(results.length).toBe(2);
  });

  it('should combine multiple filters', () => {
    const results = queryTraces({
      agentId: 'agent-1',
      type: ReasoningType.DECISION
    });
    
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('D1');
  });

  it('should apply pagination with limit and offset', () => {
    const results = queryTraces({
      agentId: 'agent-1',
      limit: 2,
      offset: 1
    });
    
    expect(results.length).toBe(2);
  });
});

// ============================================================================
// Trace Deletion Tests
// ============================================================================

describe('deleteTrace', () => {
  it('should delete an existing trace', () => {
    const trace = recordTrace('agent', ReasoningType.HYPOTHESIS, 'To delete');
    
    expect(getTraceById(trace.id)).toEqual(trace);
    
    const result = deleteTrace(trace.id);
    
    expect(result).toBe(true);
    expect(getTraceById(trace.id)).toBeUndefined();
  });

  it('should return false for non-existent trace', () => {
    const result = deleteTrace('non-existent-id');
    
    expect(result).toBe(false);
  });

  it('should remove trace from agent index', () => {
    const trace = recordTrace('delete-agent', ReasoningType.HYPOTHESIS, 'Test');
    
    deleteTrace(trace.id);
    
    const traces = getTracesByAgent('delete-agent');
    expect(traces.length).toBe(0);
  });

  it('should remove trace from task index', () => {
    const trace = recordTrace('agent', ReasoningType.HYPOTHESIS, 'Test', [], 0.5, 'delete-task');
    
    deleteTrace(trace.id);
    
    const traces = getTracesByTask('delete-task');
    expect(traces.length).toBe(0);
  });

  it('should remove trace from type index', () => {
    const trace = recordTrace('agent', ReasoningType.HYPOTHESIS, 'Test');
    
    deleteTrace(trace.id);
    
    const traces = getTracesByType(ReasoningType.HYPOTHESIS);
    expect(traces.every(t => t.id !== trace.id)).toBe(true);
  });
});

// ============================================================================
// Trace Stats Tests
// ============================================================================

describe('getTraceStats', () => {
  it('should return stats for an agent with traces', () => {
    recordTrace('stats-agent', ReasoningType.HYPOTHESIS, 'H1', [], 0.5);
    recordTrace('stats-agent', ReasoningType.ANALYSIS, 'A1', [], 0.7);
    recordTrace('stats-agent', ReasoningType.DECISION, 'D1', [], 0.9);
    recordTrace('stats-agent', ReasoningType.HYPOTHESIS, 'H2', [], 0.6);
    
    const stats = getTraceStats('stats-agent');
    
    expect(stats.totalTraces).toBe(4);
    expect(stats.byType[ReasoningType.HYPOTHESIS]).toBe(2);
    expect(stats.byType[ReasoningType.ANALYSIS]).toBe(1);
    expect(stats.byType[ReasoningType.DECISION]).toBe(1);
    expect(stats.byType[ReasoningType.CORRECTION]).toBe(0);
    expect(stats.averageConfidence).toBeCloseTo(0.675, 2);
    expect(stats.latestTrace).not.toBeNull();
  });

  it('should return empty stats for agent with no traces', () => {
    const stats = getTraceStats('empty-agent');
    
    expect(stats.totalTraces).toBe(0);
    expect(stats.averageConfidence).toBe(0);
    expect(stats.latestTrace).toBeNull();
    expect(stats.byType[ReasoningType.HYPOTHESIS]).toBe(0);
    expect(stats.byType[ReasoningType.ANALYSIS]).toBe(0);
    expect(stats.byType[ReasoningType.DECISION]).toBe(0);
    expect(stats.byType[ReasoningType.CORRECTION]).toBe(0);
  });
});
