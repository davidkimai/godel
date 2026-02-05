/**
 * Dependency Graph Module
 * Builds and analyzes dependency graphs with circular dependency detection
 */

import { logger } from '../utils/logger';
import { parseImports, detectLanguage } from './parser';
import { ApplicationError, DashErrorCode, safeExecute } from '../errors';

import type { DependencyGraph, LanguageType } from './types';

/**
 * Simple language parser interface for dependency extraction
 */
interface LanguageParser {
  inferDependencies(_filePath: string, _content: string): string[];
}

/**
 * Create a parser for a specific language
 */
function createParser(language: LanguageType): LanguageParser {
  return {
    inferDependencies: (_filePath: string, _content: string): string[] => {
      const detectedLang = language || detectLanguage(_filePath);
      const imports = parseImports(_content, detectedLang);
      return imports.map(i => i.module);
    }
  };
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
export class DependencyAnalyzer {
  private graph: DependencyGraph;
  private contents: Map<string, string>;
  private parser: LanguageParser | null;

  constructor(dependencies: DependencyGraph, contents?: Map<string, string>, parser?: LanguageParser) {
    this.graph = dependencies;
    this.contents = contents || new Map();
    this.parser = parser || null;
  }

  /**
   * Get direct dependencies for a file
   */
  getDependencies(filePath: string): string[] {
    const normalizedPath = this.normalizePath(filePath);
    return this.graph.nodes.get(normalizedPath) || [];
  }

  /**
   * Get files that depend on the given file
   */
  getDependents(filePath: string): string[] {
    const normalizedPath = this.normalizePath(filePath);
    const dependents: string[] = [];

    for (const [file, deps] of this.graph.nodes) {
      if (deps.includes(normalizedPath) || deps.some(d => this.resolvePath(file, d) === normalizedPath)) {
        dependents.push(file);
      }
    }

    return dependents;
  }

  /**
   * Calculate transitive dependencies (all dependencies recursively)
   */
  getTransitiveDependencies(filePath: string): Set<string> {
    const visited = new Set<string>();
    const stack: string[] = [this.normalizePath(filePath)];
    const result = new Set<string>();

    while (stack.length > 0) {
      const current = stack.pop()!;
      
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const deps = this.getDependencies(current);
      for (const dep of deps) {
        if (!visited.has(dep)) {
          result.add(dep);
          stack.push(dep);
        }
      }
    }

    return result;
  }

  /**
   * Detect circular dependencies in the graph
   */
  detectCycles(): CycleDetectionResult {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];
    const cycles: string[][] = [];

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = this.getDependencies(node);
      
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycles.push([...cycle, neighbor]);
        }
      }

      recursionStack.delete(node);
      path.pop();
      return false;
    };

    for (const node of this.graph.nodes.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return {
      hasCycles: cycles.length > 0,
      cycles,
      path: [...path],
    };
  }

  /**
   * Find files that have no dependencies and no dependents (true orphans)
   */
  findOrphanFiles(): string[] {
    const orphans: string[] = [];
    
    for (const [file, deps] of this.graph.nodes) {
      // Check if file has no dependencies
      if (deps.length === 0) {
        // Also check if file has no dependents
        const dependents = this.getDependents(file);
        if (dependents.length === 0) {
          orphans.push(file);
        }
      }
    }
    
    return orphans;
  }

  /**
   * Calculate the maximum dependency depth
   */
  calculateMaxDepth(): number {
    let maxDepth = 0;
    
    for (const file of this.graph.nodes.keys()) {
      const depth = this.calculateDepth(file, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }
    
    return maxDepth;
  }

  private calculateDepth(filePath: string, visited: Set<string>): number {
    if (visited.has(filePath)) {
      return 0;
    }
    visited.add(filePath);

    const deps = this.getDependencies(filePath);
    if (deps.length === 0) {
      return 0;
    }

    let maxDepth = 0;
    for (const dep of deps) {
      maxDepth = Math.max(maxDepth, 1 + this.calculateDepth(dep, new Set(visited)));
    }

    return maxDepth;
  }

  /**
   * Perform complete dependency analysis
   */
  analyze(): DependencyAnalysis {
    const directDependencies = new Map<string, Set<string>>();
    const transitiveDependencies = new Map<string, Set<string>>();
    const dependents = new Map<string, Set<string>>();
    const cycles = this.detectCycles();
    const orphanFiles = this.findOrphanFiles();
    const maxDepth = this.calculateMaxDepth();

    // Build direct dependencies map
    for (const [file, deps] of this.graph.nodes) {
      directDependencies.set(file, new Set(deps));
    }

    // Build transitive dependencies map
    for (const file of this.graph.nodes.keys()) {
      transitiveDependencies.set(file, this.getTransitiveDependencies(file));
    }

    // Build dependents map
    for (const file of this.graph.nodes.keys()) {
      const deps = this.getDependencies(file);
      for (const dep of deps) {
        if (!dependents.has(dep)) {
          dependents.set(dep, new Set());
        }
        dependents.get(dep)!.add(file);
      }
    }

    return {
      graph: this.graph,
      directDependencies,
      transitiveDependencies,
      dependents,
      cycles,
      orphanFiles,
      maxDepth,
    };
  }

  /**
   * Topologically sort the dependency graph
   * Returns nodes in dependency order (dependencies before dependents)
   * For a graph where main -> a means "main depends on a", returns [a, b, main]
   */
  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const nodes = Array.from(this.graph.nodes.keys());

    // Initialize in-degrees to 0
    for (const node of nodes) {
      inDegree.set(node, 0);
    }

    // Calculate in-degrees
    // In a dependency graph, edge (from, to) means "from depends on to"
    // So we count how many nodes depend on each node (reversed interpretation)
    for (const edge of this.graph.edges) {
      const from = edge[0];
      const to = edge[1];
      if (from === undefined || to === undefined) continue;
      
      // 'from' depends on 'to', so increment 'from's in-degree
      inDegree.set(from, (inDegree.get(from) || 0) + 1);
      
      // Ensure 'to' exists in the graph
      if (!inDegree.has(to)) {
        inDegree.set(to, 0);
      }
    }

    // Start with nodes that have no dependencies (in-degree 0)
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    const result: string[] = [];
    const processed = new Set<string>();
    
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      processed.add(node);

      // Find all nodes that depend on this node
      for (const edge of this.graph.edges) {
        const from = edge[0];
        const to = edge[1];
        if (from === undefined || to === undefined) continue;
        if (to === node && !processed.has(from)) {
          inDegree.set(from, (inDegree.get(from) || 0) - 1);
          if (inDegree.get(from) === 0) {
            queue.push(from);
          }
        }
      }
    }

    // Check for cycles (if result doesn't include all nodes)
    const allNodes = new Set([...nodes, ...Array.from(inDegree.keys())]);
    if (result.length !== allNodes.size) {
      const cycles = this.detectCycles();
      throw new ApplicationError(
        'Graph contains cycles - topological sort not possible',
        DashErrorCode.CYCLIC_DEPENDENCY,
        400,
        { 
          detectedCycles: cycles.cycles,
          nodesProcessed: result.length,
          totalNodes: allNodes.size
        },
        true
      );
    }

    return result;
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  private resolvePath(from: string, to: string): string {
    // Simple path resolution for relative imports
    if (to.startsWith('.') || to.startsWith('/')) {
      const fromDir = from.substring(0, from.lastIndexOf('/'));
      const parts = (fromDir + '/' + to).split('/');
      const resolved: string[] = [];
      
      for (const part of parts) {
        if (part === '..') {
          resolved.pop();
        } else if (part !== '.') {
          resolved.push(part);
        }
      }
      
      return '/' + resolved.join('/');
    }
    return to;
  }
}

/**
 * DependencyGraphBuilder - Builds dependency graphs from files
 */
export class DependencyGraphBuilder {
  private nodes: Map<string, string[]>;
  private edges: string[][];
  private contents: Map<string, string>;
  private parser: LanguageParser | null;
  private builtGraph: DependencyGraph | null;

  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.contents = new Map();
    this.parser = null;
    this.builtGraph = null;
  }

  /**
   * Set the language parser
   */
  setParser(parser: LanguageParser | null): void {
    this.parser = parser;
  }

  /**
   * Set language for parsing
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setLanguage(_language: string): void {
    // TODO: Use language parameter to configure parser
    // For now, this is a placeholder for future parser configuration
    this.parser = null;
  }

  /**
   * Add a file to the graph
   */
  addFile(filePath: string, content?: string, metadata?: { imports?: string[]; exports?: string[] }): void {
    const normalizedPath = this.normalizePath(filePath);
    
    // Invalidate cached graph
    this.builtGraph = null;
    
    if (content) {
      this.contents.set(normalizedPath, content);
    }
    
    // If metadata is provided with imports, use those and populate edges
    if (metadata?.imports) {
      // Store raw imports temporarily - they'll be resolved during build()
      this.nodes.set(normalizedPath, metadata.imports);
      // Also populate edges for explicit imports
      for (const dep of metadata.imports) {
        this.edges.push([normalizedPath, dep]);
      }
    } else {
      // Ensure node exists even with no dependencies
      if (!this.nodes.has(normalizedPath)) {
        this.nodes.set(normalizedPath, []);
      }
    }
  }

  /**
   * Add file content for parsing
   */
  addContent(filePath: string, content: string): void {
    this.contents.set(this.normalizePath(filePath), content);
  }

  /**
   * Parse all added contents and build dependencies
   */
  parseAll(): void {
    if (!this.parser) {
      // Create a default parser if none is set
      this.parser = createParser('typescript');
    }

    for (const [filePath, content] of this.contents) {
      try {
        const dependencies = this.parser!.inferDependencies(filePath, content);
        this.nodes.set(filePath, dependencies);
        
        for (const dep of dependencies) {
          this.edges.push([filePath, dep]);
        }
      } catch (error) {
        logger.error('dependencies', `Error parsing ${filePath}: ${error}`);
      }
    }
  }

  /**
   * Ensure all contents are parsed before building
   */
  private ensureParsed(): void {
    if (this.contents.size > 0 && this.edges.length === 0) {
      // Note: parseAll is async, but we're calling it synchronously here
      // This is a design issue - callers should call parseAll() before build()
      // For now, we just don't auto-parse to avoid async issues
    }
  }

  /**
   * Add a direct dependency
   */
  addDependency(from: string, to: string): void {
    const normalizedFrom = this.normalizePath(from);
    const normalizedTo = this.normalizePath(to);
    
    const deps = this.nodes.get(normalizedFrom) || [];
    if (!deps.includes(normalizedTo)) {
      deps.push(normalizedTo);
      this.nodes.set(normalizedFrom, deps);
    }
    
    this.edges.push([normalizedFrom, normalizedTo]);
  }

  /**
   * Build the dependency graph
   */
  build(): DependencyGraph {
    // Return cached graph if available
    if (this.builtGraph) {
      return this.builtGraph;
    }

    // Note: We no longer auto-parse here to avoid async issues
    // Callers should call parseAll() before build() if they have content to parse

    // Normalize all edges by resolving relative paths
    const normalizedEdges: [string, string][] = [];
    const normalizedNodes = new Map<string, string[]>();
    
    // First, ensure all nodes exist in the normalized graph (even without edges)
    for (const nodeEntry of this.nodes) {
      const node = nodeEntry[0];
      if (node === undefined) continue;
      if (!normalizedNodes.has(node)) {
        normalizedNodes.set(node, []);
      }
    }
    
    // Then, collect all normalized edges
    for (const edge of this.edges) {
      const from = edge[0];
      const to = edge[1];
      if (from === undefined || to === undefined) continue;
      const normalizedTo = this.resolveImportPath(from, to);
      normalizedEdges.push([from, normalizedTo]);
    }
    
    // Build normalized adjacency list
    for (const [from, to] of normalizedEdges) {
      if (!normalizedNodes.has(from)) {
        normalizedNodes.set(from, []);
      }
      normalizedNodes.get(from)!.push(to);
      
      // Ensure the target node exists
      if (!normalizedNodes.has(to)) {
        normalizedNodes.set(to, []);
      }
    }

    this.builtGraph = {
      nodes: normalizedNodes,
      edges: normalizedEdges,
    };

    return this.builtGraph;
  }

  /**
   * Resolve an import path relative to the importing file
   */
  private resolveImportPath(fromPath: string, importPath: string): string {
    // If it's already an absolute path, return as-is
    if (importPath.startsWith('/')) {
      return importPath;
    }
    
    // If it doesn't look like a relative import, return as-is (e.g., node_modules)
    if (!importPath.startsWith('.')) {
      return importPath;
    }
    
    const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/'));
    let resolved = importPath;
    
    // Handle ./foo imports
    if (importPath.startsWith('./')) {
      resolved = fromDir + importPath.substring(1);
    } 
    // Handle ../foo imports
    else if (importPath.startsWith('../')) {
      let parentCount = 0;
      let relPath = importPath;
      while (relPath.startsWith('../')) {
        parentCount++;
        relPath = relPath.substring(3);
      }
      const fromParts = fromDir.split('/').filter(p => p);
      const resolvedDir = fromParts.slice(0, Math.max(0, fromParts.length - parentCount));
      resolved = '/' + [...resolvedDir, relPath].join('/');
    }
    
    // Add .ts extension if not present
    if (!resolved.match(/\.(ts|tsx|js|jsx)$/)) {
      // Check if .ts version exists in our nodes
      const withTs = resolved + '.ts';
      const withTsx = resolved + '.tsx';
      if (this.nodes.has(withTs)) {
        return withTs;
      } else if (this.nodes.has(withTsx)) {
        return withTsx;
      }
      return withTs; // Default to .ts
    }
    
    return resolved;
  }

  /**
   * Get the analyzer for this graph
   */
  getAnalyzer(): DependencyAnalyzer {
    const graph = this.build();
    return new DependencyAnalyzer(graph, this.contents, this.parser ?? undefined);
  }

  /**
   * Get direct dependencies for a file
   */
  getDependencies(filePath: string): string[] {
    const normalizedPath = this.normalizePath(filePath);
    // Build the graph to get normalized paths
    const graph = this.build();
    return graph.nodes.get(normalizedPath) || [];
  }

  /**
   * Get files that depend on the given file
   */
  getDependents(filePath: string): string[] {
    const normalizedPath = this.normalizePath(filePath);
    // Build the graph to get normalized paths
    const graph = this.build();
    const dependents: string[] = [];

    for (const [file, deps] of graph.nodes) {
      if (deps.includes(normalizedPath)) {
        dependents.push(file);
      }
    }

    return dependents;
  }

  /**
   * Detect circular dependencies
   */
  detectCycles(): { length: number; cycles: string[][] } {
    const analyzer = this.getAnalyzer();
    const result = analyzer.detectCycles();
    return {
      length: result.cycles.length,
      cycles: result.cycles,
    };
  }

  /**
   * Get topological sort of the graph
   */
  getTopologicalSort(): string[] {
    const analyzer = this.getAnalyzer();
    return analyzer.topologicalSort();
  }

  /**
   * Get the longest dependency chain
   */
  getLongestChain(): string[] {
    const graph = this.build();
    let longestChain: string[] = [];
    
    // Try building a chain from each node
    for (const startNode of graph.nodes.keys()) {
      const chain = this.buildChainFrom(startNode, graph, new Set());
      if (chain.length > longestChain.length) {
        longestChain = chain;
      }
    }
    
    return longestChain;
  }

  /**
   * Build the longest chain starting from a given node
   */
  private buildChainFrom(node: string, graph: DependencyGraph, visited: Set<string>): string[] {
    if (visited.has(node)) {
      return [];
    }
    
    visited.add(node);
    const deps = graph.nodes.get(node) || [];
    
    if (deps.length === 0) {
      return [node];
    }
    
    let longestSubChain: string[] = [];
    for (const dep of deps) {
      const subChain = this.buildChainFrom(dep, graph, new Set(visited));
      if (subChain.length > longestSubChain.length) {
        longestSubChain = subChain;
      }
    }
    
    return [node, ...longestSubChain];
  }

  private calculateDepth(filePath: string, visited: Set<string>): number {
    if (visited.has(filePath)) {
      return 0;
    }
    visited.add(filePath);

    const deps = this.nodes.get(filePath) || [];
    if (deps.length === 0) {
      return 0;
    }

    let maxDepth = 0;
    for (const dep of deps) {
      maxDepth = Math.max(maxDepth, 1 + this.calculateDepth(dep, new Set(visited)));
    }

    return maxDepth;
  }

  /**
   * Get statistics about the dependency graph
   */
  getStatistics(): {
    totalFiles: number;
    totalEdges: number;
    maxDepth: number;
    cyclicDependencies: number;
    orphans: number;
  } {
    const analyzer = this.getAnalyzer();
    const cycles = analyzer.detectCycles();
    const orphanFiles = analyzer.findOrphanFiles();
    const maxDepth = analyzer.calculateMaxDepth();

    return {
      totalFiles: this.nodes.size,
      totalEdges: this.edges.length,
      maxDepth,
      cyclicDependencies: cycles.cycles.length,
      orphans: orphanFiles.length,
    };
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
  }
}

/**
 * Build dependency graph from file tree
 */
export function buildDependencyGraph(
  filePaths: string[],
  contents?: Map<string, string>,
  language?: string
): DependencyGraph {
  const builder = new DependencyGraphBuilder();
  
  if (language) {
    builder.setLanguage(language);
  }
  
  for (const path of filePaths) {
    builder.addFile(path);
  }
  
  if (contents) {
    for (const [path, content] of contents) {
      builder.addContent(path, content);
    }
  }
  
  builder.parseAll();
  
  return builder.build();
}

/**
 * Detect circular dependencies in a list of files
 */
export function detectCycles(
  filePaths: string[],
  contents?: Map<string, string>,
  language?: string
): CycleDetectionResult {
  const graph = buildDependencyGraph(filePaths, contents, language);
  const analyzer = new DependencyAnalyzer(graph, contents);
  return analyzer.detectCycles();
}

/**
 * Get all dependencies for a file
 */
export function getDependencies(
  filePath: string,
  filePaths: string[],
  contents?: Map<string, string>,
  language?: string
): string[] {
  const graph = buildDependencyGraph(filePaths, contents, language);
  const analyzer = new DependencyAnalyzer(graph, contents);
  return analyzer.getDependencies(filePath);
}

/**
 * Get all dependents for a file
 */
export function getDependents(
  filePath: string,
  filePaths: string[],
  contents?: Map<string, string>,
  language?: string
): string[] {
  const graph = buildDependencyGraph(filePaths, contents, language);
  const analyzer = new DependencyAnalyzer(graph, contents);
  return analyzer.getDependents(filePath);
}

/**
 * Get dependencies and dependents for a specific file
 */
export function getFileDependencies(
  files: { path: string; content?: string; imports?: string[] }[],
  filePath: string
): { dependencies: string[]; dependents: string[] } {
  const builder = new DependencyGraphBuilder();

  for (const f of files) {
    if (f.imports) {
      builder.addFile(f.path, undefined, { imports: f.imports });
    } else {
      builder.addFile(f.path, f.content || '');
    }
  }

  builder.build();
  const analyzer = builder.getAnalyzer();

  return {
    dependencies: analyzer.getDependencies(filePath),
    dependents: analyzer.getDependents(filePath),
  };
}

/**
 * Analyze dependency health for a collection of files
 */
export function analyzeDependencyHealth(
  files: { path: string; content?: string; imports?: string[] }[]
): {
  statistics: {
    totalFiles: number;
    totalEdges: number;
    maxDepth: number;
    cyclicDependencies: number;
    orphans: number;
  };
  cycles: Array<{ path: string[]; nodes: string[] }>;
  recommendations: string[];
} {
  const builder = new DependencyGraphBuilder();
  
  for (const f of files) {
    if (f.imports) {
      builder.addFile(f.path, undefined, { imports: f.imports });
    } else {
      builder.addFile(f.path, f.content || '');
    }
  }
  
  const graph = builder.build();
  const analyzer = builder.getAnalyzer();
  const analysis = analyzer.analyze();
  const cycles = analyzer.detectCycles();
  const stats = {
    totalFiles: files.length,
    totalEdges: analysis.graph.edges.length,
    maxDepth: analysis.maxDepth
  };
  
  const recommendations: string[] = [];
  
  // Check for orphans
  if (analysis.orphanFiles.length > 0) {
    recommendations.push(`${analysis.orphanFiles.length} isolated file(s) with no dependencies - consider removing or connecting them`);
  }
  
  // Check for deep dependency chains
  if (analysis.maxDepth > 5) {
    recommendations.push(`Deep dependency chain detected (${analysis.maxDepth} levels) - consider refactoring to reduce coupling`);
  }
  
  // Check for cycles
  if (cycles.hasCycles) {
    recommendations.push(`${cycles.cycles.length} circular dependency(ies) detected - this can cause build issues`);
  }
  
  // Check for files with too many dependencies
  for (const [file, deps] of graph.nodes) {
    if (deps.length > 10) {
      recommendations.push(`File '${file}' has ${deps.length} dependencies - consider splitting or consolidating`);
      break; // Only report one to avoid noise
    }
  }
  
  return {
    statistics: {
      totalFiles: stats.totalFiles,
      totalEdges: stats.totalEdges,
      maxDepth: analysis.maxDepth,
      cyclicDependencies: cycles.cycles.length,
      orphans: analysis.orphanFiles.length,
    },
    cycles: cycles.cycles.map(path => ({ path, nodes: path })),
    recommendations,
  };
}
