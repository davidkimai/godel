/**
 * Dependency Graph Module
 * Builds and analyzes dependency graphs with circular dependency detection
 */
import type { DependencyGraph } from './types';
/**
 * Simple language parser interface for dependency extraction
 */
interface LanguageParser {
    inferDependencies(_filePath: string, _content: string): string[];
}
/**
 * Cycle detection result
 */
export interface CycleDetectionResult {
    hasCycles: boolean;
    cycles: string[][];
    path: string[];
}
/**
 * Dependency analysis result
 */
export interface DependencyAnalysis {
    graph: DependencyGraph;
    directDependencies: Map<string, Set<string>>;
    transitiveDependencies: Map<string, Set<string>>;
    dependents: Map<string, Set<string>>;
    cycles: CycleDetectionResult;
    orphanFiles: string[];
    maxDepth: number;
}
/**
 * DependencyAnalyzer - Analyzes dependency graphs
 */
export declare class DependencyAnalyzer {
    private graph;
    private contents;
    private parser;
    constructor(dependencies: DependencyGraph, contents?: Map<string, string>, parser?: LanguageParser);
    /**
     * Get direct dependencies for a file
     */
    getDependencies(filePath: string): string[];
    /**
     * Get files that depend on the given file
     */
    getDependents(filePath: string): string[];
    /**
     * Calculate transitive dependencies (all dependencies recursively)
     */
    getTransitiveDependencies(filePath: string): Set<string>;
    /**
     * Detect circular dependencies in the graph
     */
    detectCycles(): CycleDetectionResult;
    /**
     * Find files that have no dependencies and no dependents (true orphans)
     */
    findOrphanFiles(): string[];
    /**
     * Calculate the maximum dependency depth
     */
    calculateMaxDepth(): number;
    private calculateDepth;
    /**
     * Perform complete dependency analysis
     */
    analyze(): DependencyAnalysis;
    /**
     * Topologically sort the dependency graph
     * Returns nodes in dependency order (dependencies before dependents)
     * For a graph where main -> a means "main depends on a", returns [a, b, main]
     */
    topologicalSort(): string[];
    private normalizePath;
    private resolvePath;
}
/**
 * DependencyGraphBuilder - Builds dependency graphs from files
 */
export declare class DependencyGraphBuilder {
    private nodes;
    private edges;
    private contents;
    private parser;
    private builtGraph;
    constructor();
    /**
     * Set the language parser
     */
    setParser(parser: LanguageParser | null): void;
    /**
     * Set language for parsing
     */
    setLanguage(_language: string): void;
    /**
     * Add a file to the graph
     */
    addFile(filePath: string, content?: string, metadata?: {
        imports?: string[];
        exports?: string[];
    }): void;
    /**
     * Add file content for parsing
     */
    addContent(filePath: string, content: string): void;
    /**
     * Parse all added contents and build dependencies
     */
    parseAll(): void;
    /**
     * Ensure all contents are parsed before building
     */
    private ensureParsed;
    /**
     * Add a direct dependency
     */
    addDependency(from: string, to: string): void;
    /**
     * Build the dependency graph
     */
    build(): DependencyGraph;
    /**
     * Resolve an import path relative to the importing file
     */
    private resolveImportPath;
    /**
     * Get the analyzer for this graph
     */
    getAnalyzer(): DependencyAnalyzer;
    /**
     * Get direct dependencies for a file
     */
    getDependencies(filePath: string): string[];
    /**
     * Get files that depend on the given file
     */
    getDependents(filePath: string): string[];
    /**
     * Detect circular dependencies
     */
    detectCycles(): {
        length: number;
        cycles: string[][];
    };
    /**
     * Get topological sort of the graph
     */
    getTopologicalSort(): string[];
    /**
     * Get the longest dependency chain
     */
    getLongestChain(): string[];
    /**
     * Build the longest chain starting from a given node
     */
    private buildChainFrom;
    private calculateDepth;
    /**
     * Get statistics about the dependency graph
     */
    getStatistics(): {
        totalFiles: number;
        totalEdges: number;
        maxDepth: number;
        cyclicDependencies: number;
        orphans: number;
    };
    private normalizePath;
}
/**
 * Build dependency graph from file tree
 */
export declare function buildDependencyGraph(filePaths: string[], contents?: Map<string, string>, language?: string): DependencyGraph;
/**
 * Detect circular dependencies in a list of files
 */
export declare function detectCycles(filePaths: string[], contents?: Map<string, string>, language?: string): CycleDetectionResult;
/**
 * Get all dependencies for a file
 */
export declare function getDependencies(filePath: string, filePaths: string[], contents?: Map<string, string>, language?: string): string[];
/**
 * Get all dependents for a file
 */
export declare function getDependents(filePath: string, filePaths: string[], contents?: Map<string, string>, language?: string): string[];
/**
 * Get dependencies and dependents for a specific file
 */
export declare function getFileDependencies(files: {
    path: string;
    content?: string;
    imports?: string[];
}[], filePath: string): {
    dependencies: string[];
    dependents: string[];
};
/**
 * Analyze dependency health for a collection of files
 */
export declare function analyzeDependencyHealth(files: {
    path: string;
    content?: string;
    imports?: string[];
}[]): {
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
};
export {};
//# sourceMappingURL=dependencies.d.ts.map