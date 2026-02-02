/**
 * Reasoning Types for Dash
 * 
 * Defines core types for reasoning traces, decision logs, and confidence tracking.
 * Phase 3: Reasoning Features
 */

// ============================================================================
// Reasoning Types
// ============================================================================

export enum ReasoningType {
  HYPOTHESIS = 'hypothesis',
  ANALYSIS = 'analysis',
  DECISION = 'decision',
  CORRECTION = 'correction'
}

export interface ReasoningTrace {
  id: string;
  agentId: string;
  taskId?: string;
  type: ReasoningType;
  content: string;
  evidence: string[];
  confidence: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface DecisionLog {
  id: string;
  agentId: string;
  taskId?: string;
  decision: string;
  alternatives: string[];
  rationale: string;
  selected: string;
  confidence: number;
  timestamp: Date;
  outcome?: string;
  metadata?: Record<string, unknown>;
}

export interface ConfidenceTracking {
  agentId: string;
  taskId?: string;
  confidence: number;
  thresholds: {
    warning: number;
    critical: number;
  };
  warnings: string[];
  history: {
    timestamp: Date;
    confidence: number;
  }[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Reasoning Analysis
// ============================================================================

export interface ReasoningAnalysis {
  traceCount: number;
  decisionCount: number;
  averageConfidence: number;
  lowConfidenceWarnings: number;
  decisionQuality: 'high' | 'medium' | 'low';
  recommendations: string[];
}

export interface ReasoningSummary {
  agentId: string;
  taskId?: string;
  totalTraces: number;
  totalDecisions: number;
  averageConfidence: number;
  keyDecisions: DecisionLog[];
  lowConfidenceEvents: ReasoningTrace[];
  recommendations: string[];
}

// ============================================================================
// Query Types
// ============================================================================

export interface TraceQuery {
  agentId?: string;
  taskId?: string;
  type?: ReasoningType;
  minConfidence?: number;
  maxConfidence?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface DecisionQuery {
  agentId?: string;
  taskId?: string;
  minConfidence?: number;
  maxConfidence?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface ReasoningStorage {
  // Trace operations
  recordTrace(trace: Omit<ReasoningTrace, 'id' | 'timestamp'>): ReasoningTrace;
  getTraceById(id: string): ReasoningTrace | undefined;
  getTracesByAgent(agentId: string, limit?: number): ReasoningTrace[];
  getTracesByTask(taskId: string, limit?: number): ReasoningTrace[];
  getTracesByType(type: ReasoningType, limit?: number): ReasoningTrace[];
  queryTraces(query: TraceQuery): ReasoningTrace[];
  deleteTrace(id: string): boolean;
  
  // Decision operations
  logDecision(decision: Omit<DecisionLog, 'id' | 'timestamp'>): DecisionLog;
  getDecisionById(id: string): DecisionLog | undefined;
  getDecisionsByAgent(agentId: string, limit?: number): DecisionLog[];
  getDecisionsByTask(taskId: string, limit?: number): DecisionLog[];
  queryDecisions(query: DecisionQuery): DecisionLog[];
  deleteDecision(id: string): boolean;
  
  // Confidence operations
  trackConfidence(agentId: string, confidence: number, taskId?: string): ConfidenceTracking;
  getConfidenceByAgent(agentId: string): ConfidenceTracking | undefined;
  getConfidenceHistory(agentId: string, limit?: number): ConfidenceTracking['history'];
  warnLowConfidence(agentId: string, threshold: number): string[];
  
  // Analysis operations
  analyzeReasoning(agentId: string, taskId?: string): ReasoningAnalysis;
  summarizeReasoning(agentId: string, taskId?: string): ReasoningSummary;
}
