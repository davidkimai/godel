/**
 * Context Types
 * Defines types for context management in Mission Control
 */

// Context type categories as specified in SPEC_V3.md
export type ContextType = 'input' | 'output' | 'shared' | 'reasoning';

// Cycle detection result
export interface CycleDetectionResult {
  hasCycles: boolean;
  cycles: string[][];
  path: string[];
}

// File reference with metadata
export interface ContextFile {
  path: string;
  type: ContextType;
  addedAt: Date;
  size: number; // in bytes
  lastModified?: Date;
  checksum?: string;
}

// Agent context container
export interface AgentContext {
  agentId: string;
  inputContext: ContextFile[];
  outputContext: ContextFile[];
  sharedContext: ContextFile[];
  reasoningContext: ContextFile[];
  contextSize: number; // total size in bytes
  contextWindow: number; // max tokens allowed
  contextUsage: number; // percentage used
}

// File tree node for representation
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  metadata?: {
    size?: number;
    lastModified?: Date;
    exports?: string[];
    imports?: string[];
  };
}

// Context analysis result
export interface ContextAnalysis {
  agentId: string;
  fileTree: FileNode;
  dependencies: DependencyGraph;
  totalSize: number;
  fileCount: number;
  sizeByType: Record<ContextType, number>;
  optimizationSuggestions: OptimizationSuggestion[];
}

// Dependency graph for code analysis
export interface DependencyGraph {
  nodes: Map<string, string[]>; // file -> dependencies
  edges: string[][]; // [file, dependency] pairs
}

// Context limits configuration
export interface ContextLimits {
  maxContextSize: number; // bytes
  maxContextWindow: number; // tokens
  maxFilesPerType: number;
  warningThreshold: number; // percentage
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Optimization suggestion
export interface OptimizationSuggestion {
  type: 'remove' | 'compress' | 'split' | 'consolidate';
  filePath: string;
  reason: string;
  estimatedSavings: number; // bytes or tokens
}

// Import statement type
export type ImportType = 'default' | 'named' | 'namespace' | 'type' | 'require';

// Import statement
export interface ImportStatement {
  module: string;
  type: ImportType;
  isRelative: boolean;
  line: number;
}

// Supported languages
export type LanguageType = 'typescript' | 'javascript' | 'python' | 'rust' | 'go';

// Dependency parser interface (language-agnostic)
export interface DependencyParser {
  parseImports(content: string): ImportStatement[];
  parseExports(content: string): string[];
  detectLanguage(filePath: string): LanguageType;
}

// Symbol table for indexing
export interface SymbolTable {
  get(path: string): { exports: string[]; imports: string[] } | undefined;
  set(path: string, value: { exports: string[]; imports: string[] }): void;
  has(path: string): boolean;
  delete(path: string): void;
  entries(): IterableIterator<[string, { exports: string[]; imports: string[] }]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<{ exports: string[]; imports: string[] }>;
  size: number;
}

// File with content for dependency parsing
export interface FileWithContent {
  path: string;
  content: string;
  language?: LanguageType;
}

// Tree output options
export interface TreeOutputOptions {
  maxDepth?: number;
  showMetadata?: boolean;
  showDependencies?: boolean;
  format?: 'json' | 'table' | 'string';
}

// Dependency analysis result
export interface DependencyAnalysis {
  graph: DependencyGraph;
  statistics: {
    totalFiles: number;
    totalEdges: number;
    maxDepth: number;
    cyclicDependencies: number;
    orphans: number;
  };
  cycles: Array<{
    path: string[];
    nodes: string[];
  }>;
  recommendations: string[];
}
