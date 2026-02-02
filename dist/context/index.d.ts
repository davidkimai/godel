/**
 * Context Management Module
 * Exports all context-related classes and types
 */
export * from './types';
export { ContextManager } from './manager';
export * from './analyze';
export * from './optimize';
export * from './compact';
export { FileTreeBuilder, buildFileTree, buildFileTreeWithDeps, formatTreeAsString, treeToStructuredOutput, detectLanguage, indexSymbols, TreeParser, createTreeParser, TreeWithDepsOutput, buildTreeWithDependencyOutput } from './tree';
export { parseImports, parseExports, detectLanguage as detectLanguageFromPath, createParser, parseFile } from './parser';
export { buildDependencyGraph, detectCycles, getDependencies, getDependents, getFileDependencies, analyzeDependencyHealth, DependencyGraphBuilder, DependencyAnalyzer } from './dependencies';
export { ContextSizeCalculator, calculateContextStats, DEFAULT_CONTEXT_LIMITS } from './size';
export { ContextSizeCalculator as SizeCalculator } from './size';
//# sourceMappingURL=index.d.ts.map