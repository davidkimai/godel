/**
 * Reasoning Traces Module
 * 
 * Trace recording, storage, and retrieval for agent reasoning.
 * Phase 3: Reasoning Features
 */

import { 
  ReasoningType 
} from './types';

import type { 
  ReasoningTrace, 
  TraceQuery 
} from './types';

// ============================================================================
// In-Memory Trace Store
// ============================================================================

const traceStore: Map<string, ReasoningTrace> = new Map();
const agentTraces: Map<string, string[]> = new Map();
const taskTraces: Map<string, string[]> = new Map();
const typeTraces: Map<string, string[]> = new Map();

// ============================================================================
// Trace Recording
// ============================================================================

/**
 * Record a reasoning trace for an agent
 */
export function recordTrace(
  agentId: string,
  type: ReasoningType,
  content: string,
  evidence: string[] = [],
  confidence: number = 0.5,
  taskId?: string,
  metadata?: Record<string, unknown>
): ReasoningTrace {
  const id = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const trace: ReasoningTrace = {
    id,
    agentId,
    taskId,
    type,
    content,
    evidence,
    confidence: Math.max(0, Math.min(1, confidence)), // Clamp to 0-1
    timestamp: new Date(),
    metadata
  };
  
  // Store trace
  traceStore.set(id, trace);
  
  // Index by agent
  if (!agentTraces.has(agentId)) {
    agentTraces.set(agentId, []);
  }
  agentTraces.get(agentId)!.push(id);
  
  // Index by task
  if (taskId) {
    if (!taskTraces.has(taskId)) {
      taskTraces.set(taskId, []);
    }
    taskTraces.get(taskId)!.push(id);
  }
  
  // Index by type
  const typeKey = type;
  if (!typeTraces.has(typeKey)) {
    typeTraces.set(typeKey, []);
  }
  typeTraces.get(typeKey)!.push(id);
  
  return trace;
}

/**
 * Get trace by ID
 */
export function getTraceById(id: string): ReasoningTrace | undefined {
  return traceStore.get(id);
}

/**
 * Get all traces for an agent
 */
export function getTracesByAgent(agentId: string, limit?: number): ReasoningTrace[] {
  const traceIds = agentTraces.get(agentId) || [];
  const traces = traceIds
    .map(id => traceStore.get(id))
    .filter((t): t is ReasoningTrace => t !== undefined)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return limit ? traces.slice(0, limit) : traces;
}

/**
 * Get all traces for a task
 */
export function getTracesByTask(taskId: string, limit?: number): ReasoningTrace[] {
  const traceIds = taskTraces.get(taskId) || [];
  const traces = traceIds
    .map(id => traceStore.get(id))
    .filter((t): t is ReasoningTrace => t !== undefined)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return limit ? traces.slice(0, limit) : traces;
}

/**
 * Get all traces by type
 */
export function getTracesByType(type: ReasoningType, limit?: number): ReasoningTrace[] {
  const traceIds = typeTraces.get(type) || [];
  const traces = traceIds
    .map(id => traceStore.get(id))
    .filter((t): t is ReasoningTrace => t !== undefined)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return limit ? traces.slice(0, limit) : traces;
}

/**
 * Query traces with filters
 */
export function queryTraces(query: TraceQuery): ReasoningTrace[] {
  let traces = Array.from(traceStore.values());
  
  if (query.agentId) {
    traces = traces.filter(t => t.agentId === query.agentId);
  }
  
  if (query.taskId) {
    traces = traces.filter(t => t.taskId === query.taskId);
  }
  
  if (query.type) {
    traces = traces.filter(t => t.type === query.type);
  }
  
  if (query.minConfidence !== undefined) {
    traces = traces.filter(t => t.confidence >= query.minConfidence!);
  }
  
  if (query.maxConfidence !== undefined) {
    traces = traces.filter(t => t.confidence <= query.maxConfidence!);
  }
  
  if (query.startDate) {
    traces = traces.filter(t => t.timestamp >= query.startDate!);
  }
  
  if (query.endDate) {
    traces = traces.filter(t => t.timestamp <= query.endDate!);
  }
  
  // Sort by timestamp descending
  traces.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  // Apply pagination
  const offset = query.offset || 0;
  const limit = query.limit || traces.length;
  
  return traces.slice(offset, offset + limit);
}

/**
 * Delete a trace
 */
export function deleteTrace(id: string): boolean {
  const trace = traceStore.get(id);
  
  if (!trace) {
    return false;
  }
  
  // Remove from store
  traceStore.delete(id);
  
  // Remove from indexes
  const agentIds = agentTraces.get(trace.agentId);
  if (agentIds) {
    const idx = agentIds.indexOf(id);
    if (idx > -1) {
      agentIds.splice(idx, 1);
    }
  }
  
  if (trace.taskId) {
    const taskIds = taskTraces.get(trace.taskId);
    if (taskIds) {
      const idx = taskIds.indexOf(id);
      if (idx > -1) {
        taskIds.splice(idx, 1);
      }
    }
  }
  
  const typeIds = typeTraces.get(trace.type);
  if (typeIds) {
    const idx = typeIds.indexOf(id);
    if (idx > -1) {
      typeIds.splice(idx, 1);
    }
  }
  
  return true;
}

/**
 * Get trace statistics for an agent
 */
export function getTraceStats(agentId: string): {
  totalTraces: number;
  byType: Record<ReasoningType, number>;
  averageConfidence: number;
  latestTrace: ReasoningTrace | null;
} {
  const traces = getTracesByAgent(agentId);
  
  const byType: Record<ReasoningType, number> = {
    [ReasoningType.HYPOTHESIS]: 0,
    [ReasoningType.ANALYSIS]: 0,
    [ReasoningType.DECISION]: 0,
    [ReasoningType.CORRECTION]: 0
  };
  
  let totalConfidence = 0;
  
  for (const trace of traces) {
    byType[trace.type]++;
    totalConfidence += trace.confidence;
  }
  
  return {
    totalTraces: traces.length,
    byType,
    averageConfidence: traces.length > 0 ? totalConfidence / traces.length : 0,
    latestTrace: traces[0] || null
  };
}
