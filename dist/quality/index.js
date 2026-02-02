"use strict";
/**
 * Quality Gate Framework - Main Export
 *
 * Unified module for linting, type checking, security scanning,
 * and quality gate evaluation.
 *
 * Matches SPEC_V3.md Part IV (Quality Gate Framework)
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
exports.formatGateResult = exports.createGateFromCriteria = exports.parseCriteriaJson = exports.DEFAULT_GATES = exports.generateLintSummary = exports.evaluateQualityGate = exports.calculateSecurityScore = exports.calculatePassRateScore = exports.calculateCoverageScore = exports.calculateTypeScore = exports.calculateLintScore = exports.calculateScore = exports.lintAgentCodebase = exports.runLinters = exports.runSecurityScan = exports.runTypeScriptCheck = exports.runGolangciLint = exports.runCargoCheck = exports.runRustfmt = exports.runMyPy = exports.runPylint = exports.runPrettier = exports.runESLint = void 0;
exports.quickLint = quickLint;
exports.passesLintGate = passesLintGate;
// Types
__exportStar(require("./types"), exports);
// Linter Integration
var linter_1 = require("./linter");
Object.defineProperty(exports, "runESLint", { enumerable: true, get: function () { return linter_1.runESLint; } });
Object.defineProperty(exports, "runPrettier", { enumerable: true, get: function () { return linter_1.runPrettier; } });
Object.defineProperty(exports, "runPylint", { enumerable: true, get: function () { return linter_1.runPylint; } });
Object.defineProperty(exports, "runMyPy", { enumerable: true, get: function () { return linter_1.runMyPy; } });
Object.defineProperty(exports, "runRustfmt", { enumerable: true, get: function () { return linter_1.runRustfmt; } });
Object.defineProperty(exports, "runCargoCheck", { enumerable: true, get: function () { return linter_1.runCargoCheck; } });
Object.defineProperty(exports, "runGolangciLint", { enumerable: true, get: function () { return linter_1.runGolangciLint; } });
Object.defineProperty(exports, "runTypeScriptCheck", { enumerable: true, get: function () { return linter_1.runTypeScriptCheck; } });
Object.defineProperty(exports, "runSecurityScan", { enumerable: true, get: function () { return linter_1.runSecurityScan; } });
Object.defineProperty(exports, "runLinters", { enumerable: true, get: function () { return linter_1.runLinters; } });
Object.defineProperty(exports, "lintAgentCodebase", { enumerable: true, get: function () { return linter_1.lintAgentCodebase; } });
// Quality Gates
var gates_1 = require("./gates");
Object.defineProperty(exports, "calculateScore", { enumerable: true, get: function () { return gates_1.calculateScore; } });
Object.defineProperty(exports, "calculateLintScore", { enumerable: true, get: function () { return gates_1.calculateLintScore; } });
Object.defineProperty(exports, "calculateTypeScore", { enumerable: true, get: function () { return gates_1.calculateTypeScore; } });
Object.defineProperty(exports, "calculateCoverageScore", { enumerable: true, get: function () { return gates_1.calculateCoverageScore; } });
Object.defineProperty(exports, "calculatePassRateScore", { enumerable: true, get: function () { return gates_1.calculatePassRateScore; } });
Object.defineProperty(exports, "calculateSecurityScore", { enumerable: true, get: function () { return gates_1.calculateSecurityScore; } });
Object.defineProperty(exports, "evaluateQualityGate", { enumerable: true, get: function () { return gates_1.evaluateQualityGate; } });
Object.defineProperty(exports, "generateLintSummary", { enumerable: true, get: function () { return gates_1.generateLintSummary; } });
Object.defineProperty(exports, "DEFAULT_GATES", { enumerable: true, get: function () { return gates_1.DEFAULT_GATES; } });
Object.defineProperty(exports, "parseCriteriaJson", { enumerable: true, get: function () { return gates_1.parseCriteriaJson; } });
Object.defineProperty(exports, "createGateFromCriteria", { enumerable: true, get: function () { return gates_1.createGateFromCriteria; } });
Object.defineProperty(exports, "formatGateResult", { enumerable: true, get: function () { return gates_1.formatGateResult; } });
// ============================================================================
// Convenience Functions
// ============================================================================
const gates_2 = require("./gates");
const linter_2 = require("./linter");
/**
 * Quick lint function for a project
 */
async function quickLint(cwd, language = 'all') {
    const results = await (0, linter_2.runLinters)({ cwd, language, includePrettier: true, includeTypes: true });
    const summary = (0, gates_2.generateLintSummary)(results);
    return {
        results,
        summary: {
            errors: summary.aggregate.errors,
            warnings: summary.aggregate.warnings,
            score: summary.score,
            passed: summary.passed
        }
    };
}
/**
 * Check if a project passes the default lint gate
 */
async function passesLintGate(cwd, language = 'all') {
    const { summary } = await quickLint(cwd, language);
    return summary.passed;
}
//# sourceMappingURL=index.js.map