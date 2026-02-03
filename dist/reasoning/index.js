"use strict";
/**
 * Reasoning Module
 *
 * Complete reasoning module for Dash - Phase 3: Reasoning Features
 *
 * @module reasoning
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfidenceStats = exports.warnLowConfidence = exports.getConfidenceHistory = exports.getConfidenceByAgent = exports.trackConfidence = exports.clearDecisions = exports.analyzeDecisionQuality = exports.compareDecisions = exports.deleteDecision = exports.queryDecisions = exports.getDecisionsByTask = exports.getDecisionsByAgent = exports.getDecisionById = exports.logDecision = exports.clearTraces = exports.getTraceStats = exports.deleteTrace = exports.queryTraces = exports.getTracesByType = exports.getTracesByTask = exports.getTracesByAgent = exports.getTraceById = exports.recordTrace = void 0;
exports.initReasoning = initReasoning;
exports.getReasoningReport = getReasoningReport;
// ============================================================================
// Types
// ============================================================================
__exportStar(require("./types"), exports);
// ============================================================================
// Traces
// ============================================================================
var traces_1 = require("./traces");
Object.defineProperty(exports, "recordTrace", { enumerable: true, get: function () { return traces_1.recordTrace; } });
Object.defineProperty(exports, "getTraceById", { enumerable: true, get: function () { return traces_1.getTraceById; } });
Object.defineProperty(exports, "getTracesByAgent", { enumerable: true, get: function () { return traces_1.getTracesByAgent; } });
Object.defineProperty(exports, "getTracesByTask", { enumerable: true, get: function () { return traces_1.getTracesByTask; } });
Object.defineProperty(exports, "getTracesByType", { enumerable: true, get: function () { return traces_1.getTracesByType; } });
Object.defineProperty(exports, "queryTraces", { enumerable: true, get: function () { return traces_1.queryTraces; } });
Object.defineProperty(exports, "deleteTrace", { enumerable: true, get: function () { return traces_1.deleteTrace; } });
Object.defineProperty(exports, "getTraceStats", { enumerable: true, get: function () { return traces_1.getTraceStats; } });
Object.defineProperty(exports, "clearTraces", { enumerable: true, get: function () { return traces_1.clearTraces; } });
// ============================================================================
// Decisions
// ============================================================================
var decisions_1 = require("./decisions");
Object.defineProperty(exports, "logDecision", { enumerable: true, get: function () { return decisions_1.logDecision; } });
Object.defineProperty(exports, "getDecisionById", { enumerable: true, get: function () { return decisions_1.getDecisionById; } });
Object.defineProperty(exports, "getDecisionsByAgent", { enumerable: true, get: function () { return decisions_1.getDecisionsByAgent; } });
Object.defineProperty(exports, "getDecisionsByTask", { enumerable: true, get: function () { return decisions_1.getDecisionsByTask; } });
Object.defineProperty(exports, "queryDecisions", { enumerable: true, get: function () { return decisions_1.queryDecisions; } });
Object.defineProperty(exports, "deleteDecision", { enumerable: true, get: function () { return decisions_1.deleteDecision; } });
Object.defineProperty(exports, "compareDecisions", { enumerable: true, get: function () { return decisions_1.compareDecisions; } });
Object.defineProperty(exports, "analyzeDecisionQuality", { enumerable: true, get: function () { return decisions_1.analyzeDecisionQuality; } });
Object.defineProperty(exports, "clearDecisions", { enumerable: true, get: function () { return decisions_1.clearDecisions; } });
// ============================================================================
// Confidence
// ============================================================================
// Note: These functions are used by CLI commands (reasoning.ts)
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
var decisions_2 = require("./decisions");
Object.defineProperty(exports, "trackConfidence", { enumerable: true, get: function () { return decisions_2.trackConfidence; } });
Object.defineProperty(exports, "getConfidenceByAgent", { enumerable: true, get: function () { return decisions_2.getConfidenceByAgent; } });
Object.defineProperty(exports, "getConfidenceHistory", { enumerable: true, get: function () { return decisions_2.getConfidenceHistory; } });
Object.defineProperty(exports, "warnLowConfidence", { enumerable: true, get: function () { return decisions_2.warnLowConfidence; } });
Object.defineProperty(exports, "getConfidenceStats", { enumerable: true, get: function () { return decisions_2.getConfidenceStats; } });
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */
// ============================================================================
// Analysis (re-export from types)
// ============================================================================
// Analysis types are already exported from './types' above
// No need to re-export them here
// ============================================================================
// Convenience Functions
// ============================================================================
const decisions_3 = require("./decisions");
const traces_2 = require("./traces");
/**
 * Initialize reasoning for an agent
 */
function initReasoning(_agentId) {
    // Initialize empty traces and decisions
    // This is a no-op for in-memory storage
    // Can be extended for persistence
}
/**
 * Get complete reasoning report for an agent
 */
function getReasoningReport(agentId, taskId) {
    // taskId is reserved for future task-scoped reasoning reports
    return {
        traceStats: (0, traces_2.getTraceStats)(agentId),
        confidenceStats: (0, decisions_3.getConfidenceStats)(agentId),
        decisions: (0, decisions_3.getDecisionsByAgent)(agentId),
        lowConfidenceWarnings: (0, decisions_3.warnLowConfidence)(agentId)
    };
}
//# sourceMappingURL=index.js.map