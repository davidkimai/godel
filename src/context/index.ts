/**
 * Context Management Module
 * Exports all context-related classes and types
 */

// Types
export * from './types';

// Core manager
export { ContextManager } from './manager';
export type { 
  ContextFile, 
  ContextType, 
  AgentContext, 
  ContextAnalysis,
  FileNode,
  DependencyGraph,
  ValidationResult,
  OptimizationSuggestion,
  ContextLimits
} from './types';

// File tree
export { 
  FileTreeBuilder, 
  buildFileTree, 
  buildFileTreeWithDeps,
  formatTreeAsString,
  treeToStructuredOutput,
  detectLanguage,
  indexSymbols,
  TreeParser,
  createTreeParser,
  TreeWithDepsOutput,
  buildTreeWithDependencyOutput
} from './tree';

// Parser exports
export {
  parseImports,
  parseExports,
  detectLanguage as detectLanguageFromPath,
  createParser,
  parseFile
} from './parser';

// Dependencies
export {
  buildDependencyGraph,
  detectCycles,
  getDependencies,
  getDependents,
  getFileDependencies,
  analyzeDependencyHealth,
  DependencyGraphBuilder,
  DependencyAnalyzer,
  DependencyAnalysis,
  CycleDetectionResult
} from './dependencies';

// Size tracking
export { 
  ContextSizeCalculator, 
  calculateContextStats,
  DEFAULT_CONTEXT_LIMITS 
} from './size';

// Convenience re-exports
export { 
  ContextSizeCalculator as SizeCalculator
} from './size';
