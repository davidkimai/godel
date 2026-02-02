"use strict";
/**
 * Reasoning Types for Dash
 *
 * Defines core types for reasoning traces, decision logs, and confidence tracking.
 * Phase 3: Reasoning Features
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReasoningType = void 0;
// ============================================================================
// Reasoning Types
// ============================================================================
// Note: All ReasoningType values are exported for use across the codebase
// They are used in traces.ts, decisions.ts, and CLI commands (reasoning.ts)
/* eslint-disable no-unused-vars */
var ReasoningType;
(function (ReasoningType) {
    ReasoningType["HYPOTHESIS"] = "hypothesis";
    ReasoningType["ANALYSIS"] = "analysis";
    ReasoningType["DECISION"] = "decision";
    ReasoningType["CORRECTION"] = "correction";
})(ReasoningType || (exports.ReasoningType = ReasoningType = {}));
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */
//# sourceMappingURL=types.js.map