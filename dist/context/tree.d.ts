/**
 * File Tree Module
 * Builds and formats file tree representations with dependency awareness
 */
import { parseImports, parseExports } from './parser';
import type { FileNode, DependencyGraph, LanguageType, SymbolTable, CycleDetectionResult } from './types';
export { detectLanguage } from './parser';
/**
 * FileTreeBuilder - Constructs file tree structures from paths
 */
export declare class FileTreeBuilder {
    private root;
    private pathMap;
    private fileContents;
    constructor();
    /**
     * Add a file path to the tree
     */
    addPath(filePath: string, metadata?: FileNode['metadata']): FileNode;
    /**
     * Add file content for dependency parsing
     */
    addFileContent(filePath: string, content: string): void;
    /**
     * Build the complete tree structure
     */
    build(): FileNode;
    /**
     * Get tree as formatted output
     */
    format(maxDepth?: number, showMetadata?: boolean): object;
    /**
     * Get a specific node by path
     */
    getNode(path: string): FileNode | undefined;
    /**
     * Check if a path exists in the tree
     */
    hasPath(path: string): boolean;
    /**
     * Get all file paths in the tree
     */
    getAllPaths(): string[];
    /**
     * Extract dependencies from file contents
     */
    extractDependencies(filePaths?: string[]): DependencyGraph;
    /**
     * Build dependency graph with full analysis
     */
    buildDependencyGraph(): DependencyGraph & {
        symbolIndex?: SymbolTable;
    };
    /**
     * Parse all symbols from added file contents
     */
    parseAllSymbols(): SymbolTable;
    /**
     * Get symbol index
     */
    getSymbolIndex(): SymbolTable;
    /**
     * Convert file contents map to simple string map for DependencyAnalyzer
     */
    private getContentsAsStringMap;
    /**
     * Detect circular dependencies in the dependency graph
     */
    detectCircularDependencies(): CycleDetectionResult;
    /**
     * Get direct dependencies for a specific file
     */
    getFileDependencies(filePath: string): string[];
    /**
     * Get files that depend on the given file
     */
    getFileDependents(filePath: string): string[];
    /**
     * Get transitive dependencies (all dependencies recursively)
     */
    getTransitiveDependencies(filePath: string): Set<string>;
    /**
     * Get transitive dependents (all files that depend on this, recursively)
     */
    getTransitiveDependents(filePath: string): Set<string>;
    /**
     * Topological sort of the dependency graph
     */
    topologicalSort(): {
        sorted: string[];
        hasCycles: boolean;
    };
    /**
     * Get symbol table for all files
     */
    getSymbolTable(): SymbolTable;
    private formatNode;
    private normalizePath;
    private cleanupEmptyDirectories;
}
/**
 * Format a file tree as a string (for CLI output)
 */
export declare function formatTreeAsString(node: FileNode, prefix?: string, isLast?: boolean, maxDepth?: number, currentDepth?: number, showDependencies?: boolean): string;
/**
 * Build a complete file tree from a list of file paths
 */
export declare function buildFileTree(filePaths: string[], metadata?: Map<string, FileNode['metadata']>): FileNode;
/**
 * Build file tree with dependency parsing
 */
export declare function buildFileTreeWithDeps(files: {
    path: string;
    content: string;
}[]): FileNode;
/**
 * Convert file tree to a structured output format
 */
export declare function treeToStructuredOutput(tree: FileNode, maxDepth?: number): object;
/**
 * Format tree with dependencies for output
 */
export interface TreeWithDepsOutput {
    fileTree: string | object;
    dependencyGraph: DependencyGraph;
    statistics: {
        totalFiles: number;
        totalEdges: number;
        maxDepth: number;
    };
}
/**
 * Build and format tree with full dependency information
 */
export declare function buildTreeWithDependencyOutput(files: {
    path: string;
    content: string;
}[], maxDepth?: number): TreeWithDepsOutput;
/**
 * Language-agnostic parser interface
 */
export interface TreeParser {
    parseImports(_content: string): ReturnType<typeof parseImports>;
    parseExports(_content: string): ReturnType<typeof parseExports>;
    detectLanguage(_filePath: string): LanguageType;
}
/**
 * Create a tree parser for a specific language
 */
export declare function createTreeParser(language: LanguageType): TreeParser;
/**
 * Parse and index symbols from a collection of files
 */
export declare function indexSymbols(files: {
    path: string;
    content: string;
}[]): SymbolTable;
//# sourceMappingURL=tree.d.ts.map