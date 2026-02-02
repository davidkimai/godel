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

// Note: These functions are used by CLI commands (reasoning.ts)
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
export {
  trackConfidence,
  getConfidenceByAgent,
  getConfidenceHistory,
  warnLowConfidence,
  getConfidenceStats
} from './decisions';
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */

// ============================================================================
// Analysis (re-export from types)
// ============================================================================

// Analysis types are already exported from './types' above
// No need to re-export them here

// ============================================================================
// Convenience Functions
// ============================================================================

import { 
  getDecisionsByAgent, 
  warnLowConfidence, 
  getConfidenceStats
} from './decisions';
import { getTraceStats } from './traces';

/**
 * Initialize reasoning for an agent
 */
export function initReasoning(_agentId: string): void {
  // Initialize empty traces and decisions
  // This is a no-op for in-memory storage
  // Can be extended for persistence
  console.log(`Reasoning initialized for agent: ${_agentId}`);
}

/**
 * Get complete reasoning report for an agent
 */
export function getReasoningReport(agentId: string, taskId?: string) {
  // taskId is reserved for future task-scoped reasoning reports
  console.log(`Generating reasoning report for agent: ${agentId}${taskId ? ` (task: ${taskId})` : ''}`);
  return {
    traceStats: getTraceStats(agentId),
    confidenceStats: getConfidenceStats(agentId),
    decisions: getDecisionsByAgent(agentId),
    lowConfidenceWarnings: warnLowConfidence(agentId)
  };
}
