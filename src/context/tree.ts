/**
 * File Tree Module
 * Builds and formats file tree representations with dependency awareness
 */

import { DependencyGraphBuilder, DependencyAnalyzer } from './dependencies';
import { parseImports, parseExports, detectLanguage as detectLang, createParser } from './parser';

import type { FileNode, DependencyGraph, LanguageType, SymbolTable, CycleDetectionResult } from './types';

// Re-export detectLanguage for convenience
export { detectLanguage } from './parser';

/**
 * FileTreeBuilder - Constructs file tree structures from paths
 */
export class FileTreeBuilder {
  private root: FileNode;
  private pathMap: Map<string, FileNode>;
  private fileContents: Map<string, { content: string; language: LanguageType }>;

  constructor() {
    this.root = {
      name: '/',
      path: '/',
      type: 'directory',
      children: [],
    };
    this.pathMap = new Map();
    this.pathMap.set('/', this.root);
    this.fileContents = new Map();
  }

  /**
   * Add a file path to the tree
   */
  addPath(filePath: string, metadata?: FileNode['metadata']): FileNode {
    const normalizedPath = this.normalizePath(filePath);
    const parts = normalizedPath.split('/').filter((p) => p.length > 0);
    
    let currentNode = this.root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = '/' + parts.slice(0, i + 1).join('/');
      
      let childNode = currentNode.children?.find((c) => c.name === part);
      
      if (!childNode) {
        childNode = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'directory',
          children: isLast ? undefined : [],
          metadata: isLast ? metadata : undefined,
        };
        
        if (!currentNode.children) {
          currentNode.children = [];
        }
        currentNode.children.push(childNode);
      }
      
      this.pathMap.set(currentPath, childNode);
      currentNode = childNode;
    }
    
    return currentNode;
  }

  /**
   * Add file content for dependency parsing
   */
  addFileContent(filePath: string, content: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const language = detectLang(filePath) ?? 'typescript';
    this.fileContents.set(normalizedPath, { content, language });
  }

  /**
   * Build the complete tree structure
   */
  build(): FileNode {
    return this.cleanupEmptyDirectories(this.root);
  }

  /**
   * Get tree as formatted output
   */
  format(maxDepth?: number, showMetadata: boolean = false): object {
    return this.formatNode(this.root, 0, maxDepth, showMetadata);
  }

  /**
   * Get a specific node by path
   */
  getNode(path: string): FileNode | undefined {
    return this.pathMap.get(this.normalizePath(path));
  }

  /**
   * Check if a path exists in the tree
   */
  hasPath(path: string): boolean {
    return this.pathMap.has(this.normalizePath(path));
  }

  /**
   * Get all file paths in the tree
   */
  getAllPaths(): string[] {
    return Array.from(this.pathMap.entries())
      .filter(([path, node]) => path !== '/' && node.type === 'file')
      .map(([path]) => path);
  }

  /**
   * Extract dependencies from file contents
   */
  extractDependencies(filePaths?: string[]): DependencyGraph {
    const builder = new DependencyGraphBuilder();
    
    if (filePaths) {
      // Use provided file paths
      for (const filePath of filePaths) {
        const fileData = this.fileContents.get(filePath);
        if (fileData) {
          builder.addFile(filePath, fileData.content);
        }
      }
    } else {
      // Use all stored contents
      for (const [filePath, fileData] of this.fileContents) {
        builder.addFile(filePath, fileData.content);
      }
    }
    
    return builder.build();
  }

  /**
   * Build dependency graph with full analysis
   */
  buildDependencyGraph(): DependencyGraph & { symbolIndex?: SymbolTable } {
    const graph = this.extractDependencies();
    const symbolIndex = this.getSymbolTable();
    
    return {
      ...graph,
      symbolIndex,
    };
  }

  /**
   * Parse all symbols from added file contents
   */
  parseAllSymbols(): SymbolTable {
    return this.getSymbolTable();
  }

  /**
   * Get symbol index
   */
  getSymbolIndex(): SymbolTable {
    return this.getSymbolTable();
  }

  /**
   * Convert file contents map to simple string map for DependencyAnalyzer
   */
  private getContentsAsStringMap(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [path, data] of this.fileContents) {
      result.set(path, data.content);
    }
    return result;
  }

  /**
   * Detect circular dependencies in the dependency graph
   */
  detectCircularDependencies(): CycleDetectionResult {
    const graph = this.extractDependencies();
    const analyzer = new DependencyAnalyzer(graph, this.getContentsAsStringMap());
    return analyzer.detectCycles();
  }

  /**
   * Get direct dependencies for a specific file
   */
  getFileDependencies(filePath: string): string[] {
    const normalizedPath = this.normalizePath(filePath);
    const graph = this.extractDependencies();
    const analyzer = new DependencyAnalyzer(graph, this.getContentsAsStringMap());
    return analyzer.getDependencies(normalizedPath);
  }

  /**
   * Get files that depend on the given file
   */
  getFileDependents(filePath: string): string[] {
    const normalizedPath = this.normalizePath(filePath);
    const graph = this.extractDependencies();
    const analyzer = new DependencyAnalyzer(graph, this.getContentsAsStringMap());
    return analyzer.getDependents(normalizedPath);
  }

  /**
   * Get transitive dependencies (all dependencies recursively)
   */
  getTransitiveDependencies(filePath: string): Set<string> {
    const normalizedPath = this.normalizePath(filePath);
    const graph = this.extractDependencies();
    const analyzer = new DependencyAnalyzer(graph, this.getContentsAsStringMap());
    return analyzer.getTransitiveDependencies(normalizedPath);
  }

  /**
   * Get transitive dependents (all files that depend on this, recursively)
   */
  getTransitiveDependents(filePath: string): Set<string> {
    const normalizedPath = this.normalizePath(filePath);
    const graph = this.extractDependencies();
    const analyzer = new DependencyAnalyzer(graph, this.getContentsAsStringMap());
    const dependents = analyzer.getDependents(normalizedPath);
    
    const transitive = new Set<string>();
    const stack = [...dependents];
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (!transitive.has(current)) {
        transitive.add(current);
        const currentDependents = analyzer.getDependents(current);
        stack.push(...currentDependents);
      }
    }
    
    return transitive;
  }

  /**
   * Topological sort of the dependency graph
   */
  topologicalSort(): { sorted: string[]; hasCycles: boolean } {
    const graph = this.extractDependencies();
    const analyzer = new DependencyAnalyzer(graph, this.getContentsAsStringMap());
    
    try {
      const sorted = analyzer.topologicalSort();
      return { sorted, hasCycles: false };
    } catch {
      return { sorted: [], hasCycles: true };
    }
  }

  /**
   * Get symbol table for all files
   */
  getSymbolTable(): SymbolTable {
    const symbols = new Map<string, { exports: string[]; imports: string[] }>();
    
    for (const [filePath, fileData] of this.fileContents) {
      const exports = parseExports(fileData.content, fileData.language);
      const imports = parseImports(fileData.content, fileData.language).map(i => i.module);
      
      symbols.set(filePath, { exports, imports });
    }
    
    return symbols;
  }

  private formatNode(
    node: FileNode,
    currentDepth: number,
    maxDepth?: number,
    showMetadata: boolean = false
  ): object {
    if (maxDepth !== undefined && currentDepth >= maxDepth) {
      return { name: node.name, truncated: true };
    }

    const result: Record<string, unknown> = {
      name: node.name,
      path: node.path,
      type: node.type,
    };

    if (showMetadata && node.metadata) {
      result['metadata'] = node.metadata;
    }

    if (node.children && node.children.length > 0) {
      result['children'] = node.children.map((child) =>
        this.formatNode(child, currentDepth + 1, maxDepth, showMetadata)
      );
    }

    return result;
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  private cleanupEmptyDirectories(node: FileNode): FileNode {
    if (node.children) {
      node.children = node.children
        .filter((child) => child.type === 'file' || (child.children && child.children.length > 0))
        .map((child) => this.cleanupEmptyDirectories(child));
    }
    return node;
  }
}

/**
 * Format a file tree as a string (for CLI output)
 */
export function formatTreeAsString(
  node: FileNode,
  prefix: string = '',
  isLast: boolean = true,
  maxDepth?: number,
  currentDepth: number = 0,
  showDependencies: boolean = false
): string {
  if (maxDepth !== undefined && currentDepth >= maxDepth) {
    // Return the node name even when truncated
    return `${prefix}${isLast ? '└── ' : '├── '}${node.name}${node.type === 'directory' ? '/' : ''}`;
  }

  const connector = isLast ? '└── ' : '├── ';
  let line = `${prefix}${connector}${node.name}${node.type === 'directory' ? '/' : ''}`;
  
  if (showDependencies && node.metadata?.imports) {
    const deps = node.metadata.imports.slice(0, 3);
    const depStr = deps.length < (node.metadata.imports?.length || 0)
      ? `${deps.join(', ')}...`
      : deps.join(', ');
    line += ` [${depStr}]`;
  }
  
  const result = [line];

  if (node.children && node.children.length > 0) {
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      result.push(
        formatTreeAsString(
          child,
          newPrefix,
          i === node.children.length - 1,
          maxDepth,
          currentDepth + 1,
          showDependencies
        )
      );
    }
  }

  return result.join('\n');
}

/**
 * Build a complete file tree from a list of file paths
 */
export function buildFileTree(
  filePaths: string[],
  metadata?: Map<string, FileNode['metadata']>
): FileNode {
  const builder = new FileTreeBuilder();
  
  for (const path of filePaths) {
    const meta = metadata?.get(path);
    builder.addPath(path, meta);
  }
  
  return builder.build();
}

/**
 * Build file tree with dependency parsing
 */
export function buildFileTreeWithDeps(
  files: { path: string; content: string }[]
): FileNode {
  const builder = new DependencyGraphBuilder();
  for (const file of files) {
    builder.addFile(file.path, file.content);
  }
  
  const treeBuilder = new FileTreeBuilder();
  for (const file of files) {
    treeBuilder.addPath(file.path);
    treeBuilder.addFileContent(file.path, file.content);
  }
  
  return treeBuilder.build();
}

/**
 * Convert file tree to a structured output format
 */
export function treeToStructuredOutput(tree: FileNode, maxDepth?: number): object {
  const builder = new FileTreeBuilder();
  builder.addPath(tree.path, tree.metadata);
  return builder.format(maxDepth, true);
}

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
export function buildTreeWithDependencyOutput(
  files: { path: string; content: string }[],
  maxDepth?: number
): TreeWithDepsOutput {
  const builder = new DependencyGraphBuilder();
  
  for (const file of files) {
    builder.addFile(file.path, file.content);
  }
  
  const graph = builder.build();
  const tree = buildFileTreeWithDeps(files);
  
  return {
    fileTree: formatTreeAsString(tree, '', true, maxDepth, 0, false),
    dependencyGraph: graph,
    statistics: {
      totalFiles: files.length,
      totalEdges: graph.edges.length,
      maxDepth: 0,
    },
  };
}

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
export function createTreeParser(language: LanguageType): TreeParser {
  const parser = createParser(language);
  return {
    parseImports: parser.parseImports,
    parseExports: parser.parseExports,
    detectLanguage: parser.detectLanguage,
  };
}

/**
 * Parse and index symbols from a collection of files
 */
export function indexSymbols(
  files: { path: string; content: string }[]
): SymbolTable {
  const symbols = new Map<string, { exports: string[]; imports: string[] }>();
  
  for (const file of files) {
    const language = detectLang(file.path) ?? 'typescript';
    const exports = parseExports(file.content, language);
    const imports = parseImports(file.content, language).map(i => i.module);
    
    symbols.set(file.path, { exports, imports });
  }
  
  return symbols;
}
