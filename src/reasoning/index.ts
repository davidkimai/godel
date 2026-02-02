/**
 * Reasoning Module
 * 
 * Complete reasoning module for Dash - Phase 3: Reasoning Features
 * 
 * @module reasoning
 */

// ============================================================================
// Types
// ============================================================================

export * from './types';

// ============================================================================
// Traces
// ============================================================================

export {
  recordTrace,
  getTraceById,
  getTracesByAgent,
  getTracesByTask,
  getTracesByType,
  queryTraces,
  deleteTrace,
  getTraceStats
} from './traces';

// ============================================================================
// Decisions
// ============================================================================

export {
  logDecision,
  getDecisionById,
  getDecisionsByAgent,
  getDecisionsByTask,
  queryDecisions,
  deleteDecision,
  compareDecisions,
  analyzeDecisionQuality
} from './decisions';

// ============================================================================
// Confidence
// ============================================================================

export {
  trackConfidence,
  getConfidenceByAgent,
  getConfidenceHistory,
  warnLowConfidence,
  getConfidenceStats
} from './decisions';

// ============================================================================
// Analysis (re-export from types)
// ============================================================================

export type {
  ReasoningAnalysis,
  ReasoningSummary
} from './types';

// ============================================================================
// Convenience Functions
// ============================================================================

import { getTraceStats } from './traces';
import { 
  getDecisionsByAgent, 
  warnLowConfidence, 
  getConfidenceStats 
} from './decisions';

/**
 * Initialize reasoning for an agent
 */
export function initReasoning(agentId: string): void {
  // Initialize empty traces and decisions
  // This is a no-op for in-memory storage
  // Can be extended for persistence
}

/**
 * Get complete reasoning report for an agent
 */
export function getReasoningReport(agentId: string, taskId?: string) {
  return {
    traceStats: getTraceStats(agentId),
    confidenceStats: getConfidenceStats(agentId),
    decisions: getDecisionsByAgent(agentId),
    lowConfidenceWarnings: warnLowConfidence(agentId)
  };
}
