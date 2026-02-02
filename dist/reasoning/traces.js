"use strict";
/**
 * Reasoning Traces Module
 *
 * Trace recording, storage, and retrieval for agent reasoning.
 * Phase 3: Reasoning Features
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearTraces = clearTraces;
exports.recordTrace = recordTrace;
exports.getTraceById = getTraceById;
exports.getTracesByAgent = getTracesByAgent;
exports.getTracesByTask = getTracesByTask;
exports.getTracesByType = getTracesByType;
exports.queryTraces = queryTraces;
exports.deleteTrace = deleteTrace;
exports.getTraceStats = getTraceStats;
const types_1 = require("./types");
// ============================================================================
// In-Memory Trace Store
// ============================================================================
const traceStore = new Map();
const agentTraces = new Map();
const taskTraces = new Map();
const typeTraces = new Map();
/**
 * Clear all traces - used for testing
 */
function clearTraces() {
    traceStore.clear();
    agentTraces.clear();
    taskTraces.clear();
    typeTraces.clear();
}
// ============================================================================
// Trace Recording
// ============================================================================
/**
 * Record a reasoning trace for an agent
 */
function recordTrace(agentId, type, content, evidence = [], confidence = 0.5, taskId, metadata) {
    const id = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const trace = {
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
    agentTraces.get(agentId).push(id);
    // Index by task
    if (taskId) {
        if (!taskTraces.has(taskId)) {
            taskTraces.set(taskId, []);
        }
        taskTraces.get(taskId).push(id);
    }
    // Index by type
    const typeKey = type;
    if (!typeTraces.has(typeKey)) {
        typeTraces.set(typeKey, []);
    }
    typeTraces.get(typeKey).push(id);
    return trace;
}
/**
 * Get trace by ID
 */
function getTraceById(id) {
    return traceStore.get(id);
}
/**
 * Get all traces for an agent
 */
function getTracesByAgent(agentId, limit) {
    const traceIds = agentTraces.get(agentId) || [];
    const idToIndex = new Map(traceIds.map((id, idx) => [id, idx]));
    const traces = traceIds
        .map(id => traceStore.get(id))
        .filter((t) => t !== undefined)
        .sort((a, b) => {
        const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
        if (timeDiff !== 0)
            return timeDiff;
        // Secondary sort by creation order (higher index = newer)
        const idxA = idToIndex.get(a.id) ?? 0;
        const idxB = idToIndex.get(b.id) ?? 0;
        return idxB - idxA;
    });
    return limit ? traces.slice(0, limit) : traces;
}
/**
 * Get all traces for a task
 */
function getTracesByTask(taskId, limit) {
    const traceIds = taskTraces.get(taskId) || [];
    const traces = traceIds
        .map(id => traceStore.get(id))
        .filter((t) => t !== undefined)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? traces.slice(0, limit) : traces;
}
/**
 * Get all traces by type
 */
function getTracesByType(type, limit) {
    const traceIds = typeTraces.get(type) || [];
    const traces = traceIds
        .map(id => traceStore.get(id))
        .filter((t) => t !== undefined)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? traces.slice(0, limit) : traces;
}
/**
 * Query traces with filters
 */
function queryTraces(query) {
    // Start with agent filter if provided (most restrictive)
    let traces;
    if (query.agentId) {
        const traceIds = agentTraces.get(query.agentId) || [];
        traces = traceIds
            .map(id => traceStore.get(id))
            .filter((t) => t !== undefined);
    }
    else {
        traces = Array.from(traceStore.values());
    }
    if (query.taskId) {
        traces = traces.filter(t => t.taskId === query.taskId);
    }
    if (query.type) {
        traces = traces.filter(t => t.type === query.type);
    }
    if (query.minConfidence !== undefined) {
        traces = traces.filter(t => t.confidence >= query.minConfidence);
    }
    if (query.maxConfidence !== undefined) {
        traces = traces.filter(t => t.confidence <= query.maxConfidence);
    }
    if (query.startDate) {
        traces = traces.filter(t => t.timestamp >= query.startDate);
    }
    if (query.endDate) {
        traces = traces.filter(t => t.timestamp <= query.endDate);
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
function deleteTrace(id) {
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
function getTraceStats(agentId) {
    const traces = getTracesByAgent(agentId);
    const byType = {
        [types_1.ReasoningType.HYPOTHESIS]: 0,
        [types_1.ReasoningType.ANALYSIS]: 0,
        [types_1.ReasoningType.DECISION]: 0,
        [types_1.ReasoningType.CORRECTION]: 0
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
//# sourceMappingURL=traces.js.map