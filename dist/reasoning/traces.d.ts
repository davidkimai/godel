/**
 * Reasoning Traces Module
 *
 * Trace recording, storage, and retrieval for agent reasoning.
 * Phase 3: Reasoning Features
 */
import { ReasoningType } from './types';
import type { ReasoningTrace, TraceQuery } from './types';
/**
 * Clear all traces - used for testing
 */
export declare function clearTraces(): void;
/**
 * Record a reasoning trace for an agent
 */
export declare function recordTrace(agentId: string, type: ReasoningType, content: string, evidence?: string[], confidence?: number, taskId?: string, metadata?: Record<string, unknown>): ReasoningTrace;
/**
 * Get trace by ID
 */
export declare function getTraceById(id: string): ReasoningTrace | undefined;
/**
 * Get all traces for an agent
 */
export declare function getTracesByAgent(agentId: string, limit?: number): ReasoningTrace[];
/**
 * Get all traces for a task
 */
export declare function getTracesByTask(taskId: string, limit?: number): ReasoningTrace[];
/**
 * Get all traces by type
 */
export declare function getTracesByType(type: ReasoningType, limit?: number): ReasoningTrace[];
/**
 * Query traces with filters
 */
export declare function queryTraces(query: TraceQuery): ReasoningTrace[];
/**
 * Delete a trace
 */
export declare function deleteTrace(id: string): boolean;
/**
 * Get trace statistics for an agent
 */
export declare function getTraceStats(agentId: string): {
    totalTraces: number;
    byType: Record<ReasoningType, number>;
    averageConfidence: number;
    latestTrace: ReasoningTrace | null;
};
//# sourceMappingURL=traces.d.ts.map