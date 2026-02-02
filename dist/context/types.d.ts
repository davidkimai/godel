/**
 * Context Types
 * Defines types for context management in Mission Control
 */
export type ContextType = 'input' | 'output' | 'shared' | 'reasoning';
export interface CycleDetectionResult {
    hasCycles: boolean;
    cycles: string[][];
    path: string[];
}
export interface ContextFile {
    path: string;
    type: ContextType;
    addedAt: Date;
    size: number;
    lastModified?: Date;
    checksum?: string;
}
export interface AgentContext {
    agentId: string;
    inputContext: ContextFile[];
    outputContext: ContextFile[];
    sharedContext: ContextFile[];
    reasoningContext: ContextFile[];
    contextSize: number;
    contextWindow: number;
    contextUsage: number;
}
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
export interface ContextAnalysis {
    agentId: string;
    fileTree: FileNode;
    dependencies: DependencyGraph;
    totalSize: number;
    fileCount: number;
    sizeByType: Record<ContextType, number>;
    optimizationSuggestions: OptimizationSuggestion[];
}
export interface DependencyGraph {
    nodes: Map<string, string[]>;
    edges: string[][];
}
export interface ContextLimits {
    maxContextSize: number;
    maxContextWindow: number;
    maxFilesPerType: number;
    warningThreshold: number;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface OptimizationSuggestion {
    type: 'remove' | 'compress' | 'split' | 'consolidate';
    filePath: string;
    reason: string;
    estimatedSavings: number;
}
export type ImportType = 'default' | 'named' | 'namespace' | 'type' | 'require';
export interface ImportStatement {
    module: string;
    type: ImportType;
    isRelative: boolean;
    line: number;
}
export type LanguageType = 'typescript' | 'javascript' | 'python' | 'rust' | 'go';
export interface DependencyParser {
    parseImports(_content: string): ImportStatement[];
    parseExports(_content: string): string[];
    detectLanguage(_filePath: string): LanguageType;
}
export interface SymbolTable {
    get(_path: string): {
        exports: string[];
        imports: string[];
    } | undefined;
    set(_path: string, _value: {
        exports: string[];
        imports: string[];
    }): void;
    has(_path: string): boolean;
    delete(_path: string): void;
    entries(): IterableIterator<[string, {
        exports: string[];
        imports: string[];
    }]>;
    keys(): IterableIterator<string>;
    values(): IterableIterator<{
        exports: string[];
        imports: string[];
    }>;
    size: number;
}
export interface FileWithContent {
    path: string;
    content: string;
    language?: LanguageType;
}
export interface TreeOutputOptions {
    maxDepth?: number;
    showMetadata?: boolean;
    showDependencies?: boolean;
    format?: 'json' | 'table' | 'string';
}
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
//# sourceMappingURL=types.d.ts.map