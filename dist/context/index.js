"use strict";
/**
 * Context Management Module
 * Exports all context-related classes and types
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
exports.SizeCalculator = exports.DEFAULT_CONTEXT_LIMITS = exports.calculateContextStats = exports.ContextSizeCalculator = exports.DependencyAnalyzer = exports.DependencyGraphBuilder = exports.analyzeDependencyHealth = exports.getFileDependencies = exports.getDependents = exports.getDependencies = exports.detectCycles = exports.buildDependencyGraph = exports.parseFile = exports.createParser = exports.detectLanguageFromPath = exports.parseExports = exports.parseImports = exports.buildTreeWithDependencyOutput = exports.createTreeParser = exports.indexSymbols = exports.detectLanguage = exports.treeToStructuredOutput = exports.formatTreeAsString = exports.buildFileTreeWithDeps = exports.buildFileTree = exports.FileTreeBuilder = exports.ContextManager = void 0;
// Types
__exportStar(require("./types"), exports);
// Core manager
var manager_1 = require("./manager");
Object.defineProperty(exports, "ContextManager", { enumerable: true, get: function () { return manager_1.ContextManager; } });
// Analysis
__exportStar(require("./analyze"), exports);
// Optimization
__exportStar(require("./optimize"), exports);
// Compact/Consolidation
__exportStar(require("./compact"), exports);
// File tree
var tree_1 = require("./tree");
Object.defineProperty(exports, "FileTreeBuilder", { enumerable: true, get: function () { return tree_1.FileTreeBuilder; } });
Object.defineProperty(exports, "buildFileTree", { enumerable: true, get: function () { return tree_1.buildFileTree; } });
Object.defineProperty(exports, "buildFileTreeWithDeps", { enumerable: true, get: function () { return tree_1.buildFileTreeWithDeps; } });
Object.defineProperty(exports, "formatTreeAsString", { enumerable: true, get: function () { return tree_1.formatTreeAsString; } });
Object.defineProperty(exports, "treeToStructuredOutput", { enumerable: true, get: function () { return tree_1.treeToStructuredOutput; } });
Object.defineProperty(exports, "detectLanguage", { enumerable: true, get: function () { return tree_1.detectLanguage; } });
Object.defineProperty(exports, "indexSymbols", { enumerable: true, get: function () { return tree_1.indexSymbols; } });
Object.defineProperty(exports, "createTreeParser", { enumerable: true, get: function () { return tree_1.createTreeParser; } });
Object.defineProperty(exports, "buildTreeWithDependencyOutput", { enumerable: true, get: function () { return tree_1.buildTreeWithDependencyOutput; } });
// Parser exports
var parser_1 = require("./parser");
Object.defineProperty(exports, "parseImports", { enumerable: true, get: function () { return parser_1.parseImports; } });
Object.defineProperty(exports, "parseExports", { enumerable: true, get: function () { return parser_1.parseExports; } });
Object.defineProperty(exports, "detectLanguageFromPath", { enumerable: true, get: function () { return parser_1.detectLanguage; } });
Object.defineProperty(exports, "createParser", { enumerable: true, get: function () { return parser_1.createParser; } });
Object.defineProperty(exports, "parseFile", { enumerable: true, get: function () { return parser_1.parseFile; } });
// Dependencies
var dependencies_1 = require("./dependencies");
Object.defineProperty(exports, "buildDependencyGraph", { enumerable: true, get: function () { return dependencies_1.buildDependencyGraph; } });
Object.defineProperty(exports, "detectCycles", { enumerable: true, get: function () { return dependencies_1.detectCycles; } });
Object.defineProperty(exports, "getDependencies", { enumerable: true, get: function () { return dependencies_1.getDependencies; } });
Object.defineProperty(exports, "getDependents", { enumerable: true, get: function () { return dependencies_1.getDependents; } });
Object.defineProperty(exports, "getFileDependencies", { enumerable: true, get: function () { return dependencies_1.getFileDependencies; } });
Object.defineProperty(exports, "analyzeDependencyHealth", { enumerable: true, get: function () { return dependencies_1.analyzeDependencyHealth; } });
Object.defineProperty(exports, "DependencyGraphBuilder", { enumerable: true, get: function () { return dependencies_1.DependencyGraphBuilder; } });
Object.defineProperty(exports, "DependencyAnalyzer", { enumerable: true, get: function () { return dependencies_1.DependencyAnalyzer; } });
// Size tracking
var size_1 = require("./size");
Object.defineProperty(exports, "ContextSizeCalculator", { enumerable: true, get: function () { return size_1.ContextSizeCalculator; } });
Object.defineProperty(exports, "calculateContextStats", { enumerable: true, get: function () { return size_1.calculateContextStats; } });
Object.defineProperty(exports, "DEFAULT_CONTEXT_LIMITS", { enumerable: true, get: function () { return size_1.DEFAULT_CONTEXT_LIMITS; } });
// Convenience re-exports
var size_2 = require("./size");
Object.defineProperty(exports, "SizeCalculator", { enumerable: true, get: function () { return size_2.ContextSizeCalculator; } });
//# sourceMappingURL=index.js.map