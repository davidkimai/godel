"use strict";
/**
 * File Tree Module
 * Builds and formats file tree representations with dependency awareness
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTreeBuilder = exports.detectLanguage = void 0;
exports.formatTreeAsString = formatTreeAsString;
exports.buildFileTree = buildFileTree;
exports.buildFileTreeWithDeps = buildFileTreeWithDeps;
exports.treeToStructuredOutput = treeToStructuredOutput;
exports.buildTreeWithDependencyOutput = buildTreeWithDependencyOutput;
exports.createTreeParser = createTreeParser;
exports.indexSymbols = indexSymbols;
const dependencies_1 = require("./dependencies");
const parser_1 = require("./parser");
// Re-export detectLanguage for convenience
var parser_2 = require("./parser");
Object.defineProperty(exports, "detectLanguage", { enumerable: true, get: function () { return parser_2.detectLanguage; } });
/**
 * FileTreeBuilder - Constructs file tree structures from paths
 */
class FileTreeBuilder {
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
    addPath(filePath, metadata) {
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
    addFileContent(filePath, content) {
        const normalizedPath = this.normalizePath(filePath);
        const language = (0, parser_1.detectLanguage)(filePath) ?? 'typescript';
        this.fileContents.set(normalizedPath, { content, language });
    }
    /**
     * Build the complete tree structure
     */
    build() {
        return this.cleanupEmptyDirectories(this.root);
    }
    /**
     * Get tree as formatted output
     */
    format(maxDepth, showMetadata = false) {
        return this.formatNode(this.root, 0, maxDepth, showMetadata);
    }
    /**
     * Get a specific node by path
     */
    getNode(path) {
        return this.pathMap.get(this.normalizePath(path));
    }
    /**
     * Check if a path exists in the tree
     */
    hasPath(path) {
        return this.pathMap.has(this.normalizePath(path));
    }
    /**
     * Get all file paths in the tree
     */
    getAllPaths() {
        return Array.from(this.pathMap.entries())
            .filter(([path, node]) => path !== '/' && node.type === 'file')
            .map(([path]) => path);
    }
    /**
     * Extract dependencies from file contents
     */
    extractDependencies(filePaths) {
        const builder = new dependencies_1.DependencyGraphBuilder();
        if (filePaths) {
            // Use provided file paths
            for (const filePath of filePaths) {
                const fileData = this.fileContents.get(filePath);
                if (fileData) {
                    builder.addFile(filePath, fileData.content);
                }
            }
        }
        else {
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
    buildDependencyGraph() {
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
    parseAllSymbols() {
        return this.getSymbolTable();
    }
    /**
     * Get symbol index
     */
    getSymbolIndex() {
        return this.getSymbolTable();
    }
    /**
     * Convert file contents map to simple string map for DependencyAnalyzer
     */
    getContentsAsStringMap() {
        const result = new Map();
        for (const [path, data] of this.fileContents) {
            result.set(path, data.content);
        }
        return result;
    }
    /**
     * Detect circular dependencies in the dependency graph
     */
    detectCircularDependencies() {
        const graph = this.extractDependencies();
        const analyzer = new dependencies_1.DependencyAnalyzer(graph, this.getContentsAsStringMap());
        return analyzer.detectCycles();
    }
    /**
     * Get direct dependencies for a specific file
     */
    getFileDependencies(filePath) {
        const normalizedPath = this.normalizePath(filePath);
        const graph = this.extractDependencies();
        const analyzer = new dependencies_1.DependencyAnalyzer(graph, this.getContentsAsStringMap());
        return analyzer.getDependencies(normalizedPath);
    }
    /**
     * Get files that depend on the given file
     */
    getFileDependents(filePath) {
        const normalizedPath = this.normalizePath(filePath);
        const graph = this.extractDependencies();
        const analyzer = new dependencies_1.DependencyAnalyzer(graph, this.getContentsAsStringMap());
        return analyzer.getDependents(normalizedPath);
    }
    /**
     * Get transitive dependencies (all dependencies recursively)
     */
    getTransitiveDependencies(filePath) {
        const normalizedPath = this.normalizePath(filePath);
        const graph = this.extractDependencies();
        const analyzer = new dependencies_1.DependencyAnalyzer(graph, this.getContentsAsStringMap());
        return analyzer.getTransitiveDependencies(normalizedPath);
    }
    /**
     * Get transitive dependents (all files that depend on this, recursively)
     */
    getTransitiveDependents(filePath) {
        const normalizedPath = this.normalizePath(filePath);
        const graph = this.extractDependencies();
        const analyzer = new dependencies_1.DependencyAnalyzer(graph, this.getContentsAsStringMap());
        const dependents = analyzer.getDependents(normalizedPath);
        const transitive = new Set();
        const stack = [...dependents];
        while (stack.length > 0) {
            const current = stack.pop();
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
    topologicalSort() {
        const graph = this.extractDependencies();
        const analyzer = new dependencies_1.DependencyAnalyzer(graph, this.getContentsAsStringMap());
        try {
            const sorted = analyzer.topologicalSort();
            return { sorted, hasCycles: false };
        }
        catch {
            return { sorted: [], hasCycles: true };
        }
    }
    /**
     * Get symbol table for all files
     */
    getSymbolTable() {
        const symbols = new Map();
        for (const [filePath, fileData] of this.fileContents) {
            const exports = (0, parser_1.parseExports)(fileData.content, fileData.language);
            const imports = (0, parser_1.parseImports)(fileData.content, fileData.language).map(i => i.module);
            symbols.set(filePath, { exports, imports });
        }
        return symbols;
    }
    formatNode(node, currentDepth, maxDepth, showMetadata = false) {
        if (maxDepth !== undefined && currentDepth >= maxDepth) {
            return { name: node.name, truncated: true };
        }
        const result = {
            name: node.name,
            path: node.path,
            type: node.type,
        };
        if (showMetadata && node.metadata) {
            result['metadata'] = node.metadata;
        }
        if (node.children && node.children.length > 0) {
            result['children'] = node.children.map((child) => this.formatNode(child, currentDepth + 1, maxDepth, showMetadata));
        }
        return result;
    }
    normalizePath(path) {
        return path.replace(/\\/g, '/').replace(/\/+/g, '/');
    }
    cleanupEmptyDirectories(node) {
        if (node.children) {
            node.children = node.children
                .filter((child) => child.type === 'file' || (child.children && child.children.length > 0))
                .map((child) => this.cleanupEmptyDirectories(child));
        }
        return node;
    }
}
exports.FileTreeBuilder = FileTreeBuilder;
/**
 * Format a file tree as a string (for CLI output)
 */
function formatTreeAsString(node, prefix = '', isLast = true, maxDepth, currentDepth = 0, showDependencies = false) {
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
            result.push(formatTreeAsString(child, newPrefix, i === node.children.length - 1, maxDepth, currentDepth + 1, showDependencies));
        }
    }
    return result.join('\n');
}
/**
 * Build a complete file tree from a list of file paths
 */
function buildFileTree(filePaths, metadata) {
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
function buildFileTreeWithDeps(files) {
    const builder = new dependencies_1.DependencyGraphBuilder();
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
function treeToStructuredOutput(tree, maxDepth) {
    const builder = new FileTreeBuilder();
    builder.addPath(tree.path, tree.metadata);
    return builder.format(maxDepth, true);
}
/**
 * Build and format tree with full dependency information
 */
function buildTreeWithDependencyOutput(files, maxDepth) {
    const builder = new dependencies_1.DependencyGraphBuilder();
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
 * Create a tree parser for a specific language
 */
function createTreeParser(language) {
    const parser = (0, parser_1.createParser)(language);
    return {
        parseImports: parser.parseImports,
        parseExports: parser.parseExports,
        detectLanguage: parser.detectLanguage,
    };
}
/**
 * Parse and index symbols from a collection of files
 */
function indexSymbols(files) {
    const symbols = new Map();
    for (const file of files) {
        const language = (0, parser_1.detectLanguage)(file.path) ?? 'typescript';
        const exports = (0, parser_1.parseExports)(file.content, language);
        const imports = (0, parser_1.parseImports)(file.content, language).map(i => i.module);
        symbols.set(file.path, { exports, imports });
    }
    return symbols;
}
//# sourceMappingURL=tree.js.map