/**
 * Reasoning Decisions Module
 * 
 * Decision logging with alternatives and confidence tracking.
 * Phase 3: Reasoning Features
 */

import { 
  DecisionLog, 
  ConfidenceTracking,
  DecisionQuery 
} from './types';

// ============================================================================
// In-Memory Stores
// ============================================================================

const decisionStore: Map<string, DecisionLog> = new Map();
const agentDecisions: Map<string, string[]> = new Map();
const taskDecisions: Map<string, string[]> = new Map();
const confidenceStore: Map<string, ConfidenceTracking> = new Map();
const agentConfidenceHistory: Map<string, ConfidenceTracking['history']> = new Map();

// ============================================================================
// Decision Logging
// ============================================================================

/**
 * Log a decision made by an agent
 */
export function logDecision(
  agentId: string,
  decision: string,
  alternatives: string[],
  rationale: string,
  selected: string,
  confidence: number = 0.5,
  taskId?: string,
  metadata?: Record<string, unknown>
): DecisionLog {
  const id = `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const decisionLog: DecisionLog = {
    id,
    agentId,
    taskId,
    decision,
    alternatives,
    rationale,
    selected,
    confidence: Math.max(0, Math.min(1, confidence)),
    timestamp: new Date(),
    metadata
  };
  
  // Store decision
  decisionStore.set(id, decisionLog);
  
  // Index by agent
  if (!agentDecisions.has(agentId)) {
    agentDecisions.set(agentId, []);
  }
  agentDecisions.get(agentId)!.push(id);
  
  // Index by task
  if (taskId) {
    if (!taskDecisions.has(taskId)) {
      taskDecisions.set(taskId, []);
    }
    taskDecisions.get(taskId)!.push(id);
  }
  
  return decisionLog;
}

/**
 * Get decision by ID
 */
export function getDecisionById(id: string): DecisionLog | undefined {
  return decisionStore.get(id);
}

/**
 * Get all decisions for an agent
 */
export function getDecisionsByAgent(agentId: string, limit?: number): DecisionLog[] {
  const decisionIds = agentDecisions.get(agentId) || [];
  const decisions = decisionIds
    .map(id => decisionStore.get(id))
    .filter((d): d is DecisionLog => d !== undefined)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return limit ? decisions.slice(0, limit) : decisions;
}

/**
 * Get all decisions for a task
 */
export function getDecisionsByTask(taskId: string, limit?: number): DecisionLog[] {
  const decisionIds = taskDecisions.get(taskId) || [];
  const decisions = decisionIds
    .map(id => decisionStore.get(id))
    .filter((d): d is DecisionLog => d !== undefined)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return limit ? decisions.slice(0, limit) : decisions;
}

/**
 * Query decisions with filters
 */
export function queryDecisions(query: DecisionQuery): DecisionLog[] {
  let decisions = Array.from(decisionStore.values());
  
  if (query.agentId) {
    decisions = decisions.filter(d => d.agentId === query.agentId);
  }
  
  if (query.taskId) {
    decisions = decisions.filter(d => d.taskId === query.taskId);
  }
  
  if (query.minConfidence !== undefined) {
    decisions = decisions.filter(d => d.confidence >= query.minConfidence!);
  }
  
  if (query.maxConfidence !== undefined) {
    decisions = decisions.filter(d => d.confidence <= query.maxConfidence!);
  }
  
  if (query.startDate) {
    decisions = decisions.filter(d => d.timestamp >= query.startDate!);
  }
  
  if (query.endDate) {
    decisions = decisions.filter(d => d.timestamp <= query.endDate!);
  }
  
  // Sort by timestamp descending
  decisions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  // Apply pagination
  const offset = query.offset || 0;
  const limit = query.limit || decisions.length;
  
  return decisions.slice(offset, offset + limit);
}

/**
 * Delete a decision
 */
export function deleteDecision(id: string): boolean {
  const decision = decisionStore.get(id);
  
  if (!decision) {
    return false;
  }
  
  // Remove from store
  decisionStore.delete(id);
  
  // Remove from indexes
  const agentIds = agentDecisions.get(decision.agentId);
  if (agentIds) {
    const idx = agentIds.indexOf(id);
    if (idx > -1) {
      agentIds.splice(idx, 1);
    }
  }
  
  if (decision.taskId) {
    const taskIds = taskDecisions.get(decision.taskId);
    if (taskIds) {
      const idx = taskIds.indexOf(id);
      if (idx > -1) {
        taskIds.splice(idx, 1);
      }
    }
  }
  
  return true;
}

/**
 * Compare two decisions
 */
export function compareDecisions(
  decisionId1: string,
  decisionId2: string
): {
  decision1: DecisionLog | undefined;
  decision2: DecisionLog | undefined;
  comparison: {
    confidenceDiff: number;
    alternativeCountDiff: number;
    rationaleSimilarity: 'high' | 'medium' | 'low' | 'unknown';
  };
} {
  const decision1 = decisionStore.get(decisionId1);
  const decision2 = decisionStore.get(decisionId2);
  
  let rationaleSimilarity: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
  
  if (decision1 && decision2) {
    const words1 = new Set(decision1.rationale.toLowerCase().split(/\s+/));
    const words2 = new Set(decision2.rationale.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const jaccard = intersection.size / union.size;
    
    if (jaccard > 0.5) rationaleSimilarity = 'high';
    else if (jaccard > 0.2) rationaleSimilarity = 'medium';
    else rationaleSimilarity = 'low';
  }
  
  return {
    decision1,
    decision2,
    comparison: {
      confidenceDiff: decision1 && decision2 
        ? Math.abs(decision1.confidence - decision2.confidence) 
        : 0,
      alternativeCountDiff: decision1 && decision2
        ? Math.abs(decision1.alternatives.length - decision2.alternatives.length)
        : 0,
      rationaleSimilarity
    }
  };
}

/**
 * Analyze decision quality
 */
export function analyzeDecisionQuality(decisionId: string): {
  decision: DecisionLog | undefined;
  quality: 'high' | 'medium' | 'low';
  score: number;
  factors: {
    confidenceScore: number;
    alternativeScore: number;
    rationaleScore: number;
  };
  suggestions: string[];
} {
  const decision = decisionStore.get(decisionId);
  
  if (!decision) {
    return {
      decision: undefined,
      quality: 'low',
      score: 0,
      factors: {
        confidenceScore: 0,
        alternativeScore: 0,
        rationaleScore: 0
      },
      suggestions: ['Decision not found']
    };
  }
  
  // Calculate scores
  const confidenceScore = decision.confidence * 100;
  const alternativeScore = Math.min(100, decision.alternatives.length * 20);
  const rationaleScore = Math.min(100, Math.min(decision.rationale.length / 5, 100));
  
  const overallScore = (confidenceScore * 0.4) + (alternativeScore * 0.3) + (rationaleScore * 0.3);
  
  let quality: 'high' | 'medium' | 'low';
  if (overallScore >= 70) quality = 'high';
  else if (overallScore >= 40) quality = 'medium';
  else quality = 'low';
  
  const suggestions: string[] = [];
  
  if (decision.confidence < 0.7) {
    suggestions.push('Consider gathering more evidence before deciding');
  }
  
  if (decision.alternatives.length < 2) {
    suggestions.push('Explore more alternatives before committing');
  }
  
  if (decision.rationale.length < 50) {
    suggestions.push('Provide more detailed rationale for the decision');
  }
  
  return {
    decision,
    quality,
    score: Math.round(overallScore),
    factors: {
      confidenceScore: Math.round(confidenceScore),
      alternativeScore,
      rationaleScore: Math.round(rationaleScore)
    },
    suggestions
  };
}

// ============================================================================
// Confidence Tracking
// ============================================================================

/**
 * Track confidence for an agent
 */
export function trackConfidence(
  agentId: string,
  confidence: number,
  taskId?: string
): ConfidenceTracking {
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  
  // Get or create tracking record
  let tracking = confidenceStore.get(agentId);
  
  if (!tracking) {
    tracking = {
      agentId,
      taskId,
      confidence: clampedConfidence,
      thresholds: {
        warning: 0.5,
        critical: 0.3
      },
      warnings: [],
      history: []
    };
    confidenceStore.set(agentId, tracking);
  }
  
  // Update confidence
  tracking.confidence = clampedConfidence;
  tracking.taskId = taskId;
  
  // Add to history
  if (!agentConfidenceHistory.has(agentId)) {
    agentConfidenceHistory.set(agentId, []);
  }
  
  agentConfidenceHistory.get(agentId)!.push({
    timestamp: new Date(),
    confidence: clampedConfidence
  });
  
  // Keep only last 100 history entries
  const history = agentConfidenceHistory.get(agentId)!;
  if (history.length > 100) {
    history.shift();
  }
  
  // Check thresholds and update warnings
  tracking.warnings = [];
  
  if (clampedConfidence < tracking.thresholds.critical) {
    tracking.warnings.push(`CRITICAL: Confidence below ${tracking.thresholds.critical * 100}%`);
  } else if (clampedConfidence < tracking.thresholds.warning) {
    tracking.warnings.push(`WARNING: Confidence below ${tracking.thresholds.warning * 100}%`);
  }
  
  return tracking;
}

/**
 * Get confidence tracking for an agent
 */
export function getConfidenceByAgent(agentId: string): ConfidenceTracking | undefined {
  return confidenceStore.get(agentId);
}

/**
 * Get confidence history for an agent
 */
export function getConfidenceHistory(agentId: string, limit?: number): ConfidenceTracking['history'] {
  const history = agentConfidenceHistory.get(agentId) || [];
  return limit ? history.slice(-limit) : history;
}

/**
 * Get warnings for low confidence
 */
export function warnLowConfidence(agentId: string, threshold: number = 0.5): string[] {
  const tracking = confidenceStore.get(agentId);
  
  if (!tracking) {
    return [];
  }
  
  const warnings: string[] = [];
  
  if (tracking.confidence < threshold) {
    warnings.push(`Agent ${agentId} confidence (${(tracking.confidence * 100).toFixed(1)}%) below threshold (${(threshold * 100).toFixed(1)}%)`);
  }
  
  // Check history for declining confidence
  const history = agentConfidenceHistory.get(agentId) || [];
  if (history.length >= 5) {
    const recentAvg = history.slice(-5).reduce((sum, h) => sum + h.confidence, 0) / 5;
    const olderAvg = history.slice(-10, -5).reduce((sum, h) => sum + h.confidence, 0) / Math.min(5, history.length - 5);
    
    if (recentAvg < olderAvg * 0.9) {
      warnings.push(`Agent ${agentId} confidence trending downward (recent avg: ${(recentAvg * 100).toFixed(1)}%, previous avg: ${(olderAvg * 100).toFixed(1)}%)`);
    }
  }
  
  return warnings;
}

/**
 * Get confidence statistics for an agent
 */
export function getConfidenceStats(agentId: string): {
  current: number;
  average: number;
  min: number;
  max: number;
  trend: 'up' | 'down' | 'stable';
  warningCount: number;
} {
  const history = agentConfidenceHistory.get(agentId) || [];
  const tracking = confidenceStore.get(agentId);
  
  let current = tracking?.confidence || 0;
  let min = 1;
  let max = 0;
  let sum = 0;
  
  for (const entry of history) {
    if (entry.confidence < min) min = entry.confidence;
    if (entry.confidence > max) max = entry.confidence;
    sum += entry.confidence;
  }
  
  const average = history.length > 0 ? sum / history.length : current;
  
  // Calculate trend
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (history.length >= 5) {
    const recentAvg = history.slice(-3).reduce((sum, h) => sum + h.confidence, 0) / 3;
    const olderAvg = history.slice(-5, -2).reduce((sum, h) => sum + h.confidence, 0) / 3;
    
    if (recentAvg > olderAvg + 0.05) trend = 'up';
    else if (recentAvg < olderAvg - 0.05) trend = 'down';
  }
  
  return {
    current,
    average: Math.round(average * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    trend,
    warningCount: tracking?.warnings.length || 0
  };
}
