"use strict";
/**
 * Testing Module
 *
 * Test execution and coverage reporting for Dash
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
exports.generateTest = exports.listTemplateNames = exports.getTemplate = exports.getTemplates = exports.TEST_TEMPLATES = exports.testsCommand = exports.generateCoverageBadge = exports.formatCoverageSummary = exports.checkCoverageThresholds = exports.parseCoverage = exports.detectCoverageFormat = exports.runIncrementalTests = exports.runTests = exports.findAffectedTests = exports.getChangedFiles = exports.discoverTests = exports.detectFramework = void 0;
// Re-export types
__exportStar(require("./types"), exports);
// Runner exports
var runner_1 = require("./runner");
Object.defineProperty(exports, "detectFramework", { enumerable: true, get: function () { return runner_1.detectFramework; } });
Object.defineProperty(exports, "discoverTests", { enumerable: true, get: function () { return runner_1.discoverTests; } });
Object.defineProperty(exports, "getChangedFiles", { enumerable: true, get: function () { return runner_1.getChangedFiles; } });
Object.defineProperty(exports, "findAffectedTests", { enumerable: true, get: function () { return runner_1.findAffectedTests; } });
Object.defineProperty(exports, "runTests", { enumerable: true, get: function () { return runner_1.runTests; } });
Object.defineProperty(exports, "runIncrementalTests", { enumerable: true, get: function () { return runner_1.runIncrementalTests; } });
// Coverage exports
var coverage_1 = require("./coverage");
Object.defineProperty(exports, "detectCoverageFormat", { enumerable: true, get: function () { return coverage_1.detectCoverageFormat; } });
Object.defineProperty(exports, "parseCoverage", { enumerable: true, get: function () { return coverage_1.parseCoverage; } });
Object.defineProperty(exports, "checkCoverageThresholds", { enumerable: true, get: function () { return coverage_1.checkCoverageThresholds; } });
Object.defineProperty(exports, "formatCoverageSummary", { enumerable: true, get: function () { return coverage_1.formatCoverageSummary; } });
Object.defineProperty(exports, "generateCoverageBadge", { enumerable: true, get: function () { return coverage_1.generateCoverageBadge; } });
// CLI Command
var tests_1 = require("./cli/commands/tests");
Object.defineProperty(exports, "testsCommand", { enumerable: true, get: function () { return tests_1.testsCommand; } });
// Templates exports
var templates_1 = require("./templates");
Object.defineProperty(exports, "TEST_TEMPLATES", { enumerable: true, get: function () { return templates_1.TEST_TEMPLATES; } });
Object.defineProperty(exports, "getTemplates", { enumerable: true, get: function () { return templates_1.getTemplates; } });
Object.defineProperty(exports, "getTemplate", { enumerable: true, get: function () { return templates_1.getTemplate; } });
Object.defineProperty(exports, "listTemplateNames", { enumerable: true, get: function () { return templates_1.listTemplateNames; } });
Object.defineProperty(exports, "generateTest", { enumerable: true, get: function () { return templates_1.generateTest; } });
//# sourceMappingURL=index.js.map