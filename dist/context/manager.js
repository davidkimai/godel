"use strict";
/**
 * Context Manager
 * Core class for managing agent context, file references, and context operations
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const size_1 = require("./size");
const tree_1 = require("./tree");
// Default limits
const DEFAULT_MAX_CONTEXT_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_FILES = 100;
/**
 * ContextManager - Main class for context management operations
 */
class ContextManager {
    constructor(options) {
        this.agentContexts = new Map();
        this.sizeCalculator = new size_1.ContextSizeCalculator();
        this.maxContextSize = options?.maxContextSize ?? DEFAULT_MAX_CONTEXT_SIZE;
        this.maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
    }
    /**
     * Add a file to an agent's context
     */
    async addFile(agentId, filePath, type = 'input') {
        // Validate file path
        if (!this.validateFilePath(filePath)) {
            throw new Error(`Invalid file path: ${filePath}`);
        }
        // Check if file exists (async)
        let exists = false;
        let size = 0;
        let lastModified;
        try {
            const stats = await fs.promises.stat(filePath);
            exists = stats.isFile();
            size = stats.size;
            lastModified = stats.mtime;
        }
        catch {
            // File might not exist yet - allow adding reference anyway
            exists = false;
        }
        // Get or create agent context
        let context = this.agentContexts.get(agentId);
        if (!context) {
            context = this.createEmptyContext(agentId);
            this.agentContexts.set(agentId, context);
        }
        // Check max files limit
        const totalFiles = this.getTotalFileCount(context);
        if (totalFiles >= this.maxFiles) {
            throw new Error(`Maximum number of files (${this.maxFiles}) reached for agent ${agentId}`);
        }
        // Create context file entry
        const contextFile = {
            path: this.normalizePath(filePath),
            type,
            addedAt: new Date(),
            size,
            lastModified,
            checksum: exists ? await this.calculateChecksum(filePath) : undefined,
        };
        // Add to appropriate context type
        const contextArray = this.getContextArray(context, type);
        // Check for duplicate
        const existingIndex = contextArray.findIndex((f) => f.path === contextFile.path);
        if (existingIndex !== -1) {
            // Update existing file reference
            contextArray[existingIndex] = contextFile;
        }
        else {
            contextArray.push(contextFile);
        }
        // Update context size
        this.updateContextSize(context);
        return contextFile;
    }
    /**
     * Remove a file from an agent's context
     */
    removeFile(agentId, filePath) {
        const context = this.agentContexts.get(agentId);
        if (!context) {
            return false;
        }
        const normalizedPath = this.normalizePath(filePath);
        let removed = false;
        // Search and remove from all context types
        for (const type of ['input', 'output', 'shared', 'reasoning']) {
            const contextArray = this.getContextArray(context, type);
            const index = contextArray.findIndex((f) => f.path === normalizedPath);
            if (index !== -1) {
                contextArray.splice(index, 1);
                removed = true;
            }
        }
        if (removed) {
            this.updateContextSize(context);
        }
        return removed;
    }
    /**
     * Get context for an agent
     */
    getContext(agentId) {
        return this.agentContexts.get(agentId);
    }
    /**
     * Get context files for an agent
     */
    getContextFiles(agentId, type) {
        const context = this.agentContexts.get(agentId);
        if (!context) {
            return [];
        }
        if (type) {
            return this.getContextArray(context, type);
        }
        // Return all files
        return [
            ...context.inputContext,
            ...context.outputContext,
            ...context.sharedContext,
            ...context.reasoningContext,
        ];
    }
    /**
     * Analyze context for an agent - returns file tree and dependencies
     */
    async analyzeContext(agentId) {
        const context = this.agentContexts.get(agentId);
        if (!context) {
            throw new Error(`No context found for agent ${agentId}`);
        }
        const allFiles = this.getContextFiles(agentId);
        const filePaths = allFiles.map((f) => f.path);
        // Build file tree
        const fileTree = this.buildFileTreeFromContext(allFiles);
        // Build dependency graph
        const dependencies = this.buildDependencyGraph(filePaths);
        // Calculate size breakdown
        const sizeByType = this.sizeCalculator.calculateSizeByType(allFiles);
        const optimizationSuggestions = this.sizeCalculator.generateOptimizationSuggestions(allFiles);
        return {
            agentId,
            fileTree,
            dependencies,
            totalSize: context.contextSize,
            fileCount: allFiles.length,
            sizeByType,
            optimizationSuggestions,
        };
    }
    /**
     * Share a file between agents
     */
    async shareFile(sourceAgentId, targetAgentId, filePath) {
        const sourceContext = this.agentContexts.get(sourceAgentId);
        if (!sourceContext) {
            throw new Error(`No context found for source agent ${sourceAgentId}`);
        }
        // Find file in source context
        const file = this.findFileInContext(sourceContext, filePath);
        if (!file) {
            throw new Error(`File ${filePath} not found in source context`);
        }
        // Add to target agent as shared context
        return this.addFile(targetAgentId, filePath, 'shared');
    }
    /**
     * Validate context against limits
     */
    validateContext(agentId) {
        const context = this.agentContexts.get(agentId);
        if (!context) {
            return {
                valid: true,
                errors: [],
                warnings: ['No context found for agent'],
            };
        }
        const allFiles = this.getContextFiles(agentId);
        return this.sizeCalculator.validate(allFiles);
    }
    /**
     * Get context size statistics
     */
    getContextStats(agentId) {
        const context = this.agentContexts.get(agentId);
        if (!context) {
            return null;
        }
        const allFiles = this.getContextFiles(agentId);
        return (0, size_1.calculateContextStats)(allFiles);
    }
    /**
     * Get file tree as formatted string
     */
    getFileTreeString(agentId, maxDepth) {
        const context = this.agentContexts.get(agentId);
        if (!context) {
            return null;
        }
        const allFiles = this.getContextFiles(agentId);
        const fileTree = this.buildFileTreeFromContext(allFiles);
        return (0, tree_1.formatTreeAsString)(fileTree, '', true, maxDepth);
    }
    /**
     * Remove all context for an agent
     */
    clearContext(agentId) {
        return this.agentContexts.delete(agentId);
    }
    /**
     * Get all agents with context
     */
    getAgentsWithContext() {
        return Array.from(this.agentContexts.keys());
    }
    /**
     * Export context for serialization
     */
    exportContext(agentId) {
        const context = this.agentContexts.get(agentId);
        if (!context) {
            return null;
        }
        return {
            agentId: context.agentId,
            contextSize: context.contextSize,
            contextUsage: context.contextUsage,
            inputContext: context.inputContext,
            outputContext: context.outputContext,
            sharedContext: context.sharedContext,
            reasoningContext: context.reasoningContext,
        };
    }
    /**
     * Import context from serialized data
     */
    importContext(data) {
        const { agentId, contextSize, contextUsage, inputContext = [], outputContext = [], sharedContext = [], reasoningContext = [], } = data;
        const context = {
            agentId: agentId,
            contextSize: contextSize || 0,
            contextWindow: this.sizeCalculator.getLimits().maxContextWindow,
            contextUsage: contextUsage || 0,
            inputContext: inputContext,
            outputContext: outputContext,
            sharedContext: sharedContext,
            reasoningContext: reasoningContext,
        };
        this.agentContexts.set(agentId, context);
    }
    // Private helper methods
    createEmptyContext(agentId) {
        return {
            agentId,
            inputContext: [],
            outputContext: [],
            sharedContext: [],
            reasoningContext: [],
            contextSize: 0,
            contextWindow: this.sizeCalculator.getLimits().maxContextWindow,
            contextUsage: 0,
        };
    }
    getContextArray(context, type) {
        switch (type) {
            case 'input':
                return context.inputContext;
            case 'output':
                return context.outputContext;
            case 'shared':
                return context.sharedContext;
            case 'reasoning':
                return context.reasoningContext;
        }
        // Ensure all cases return a value (for consistent-return)
        return context.inputContext;
    }
    getTotalFileCount(context) {
        return (context.inputContext.length +
            context.outputContext.length +
            context.sharedContext.length +
            context.reasoningContext.length);
    }
    updateContextSize(context) {
        const allFiles = [
            ...context.inputContext,
            ...context.outputContext,
            ...context.sharedContext,
            ...context.reasoningContext,
        ];
        context.contextSize = allFiles.reduce((sum, f) => sum + f.size, 0);
        context.contextUsage = context.contextSize / this.maxContextSize;
    }
    validateFilePath(filePath) {
        // Basic path validation
        if (!filePath || typeof filePath !== 'string') {
            return false;
        }
        // Check for dangerous patterns
        const dangerousPatterns = [/\.\./, /^\//, /^[a-zA-Z]:/];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(filePath)) {
                return false;
            }
        }
        return true;
    }
    normalizePath(filePath) {
        return path.normalize(filePath).replace(/\\/g, '/');
    }
    async calculateChecksum(filePath) {
        try {
            const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
            const data = await fs.promises.readFile(filePath);
            return crypto.createHash('md5').update(data).digest('hex');
        }
        catch {
            return '';
        }
    }
    buildFileTreeFromContext(files) {
        const filePaths = files.map((f) => f.path);
        const metadata = new Map();
        for (const file of files) {
            metadata.set(file.path, {
                size: file.size,
                lastModified: file.lastModified,
            });
        }
        return (0, tree_1.buildFileTree)(filePaths, metadata);
    }
    buildDependencyGraph(filePaths) {
        const builder = new tree_1.FileTreeBuilder();
        for (const filePath of filePaths) {
            builder.addPath(filePath);
        }
        return builder.extractDependencies(filePaths);
    }
    findFileInContext(context, filePath) {
        const normalizedPath = this.normalizePath(filePath);
        const allFiles = [
            ...context.inputContext,
            ...context.outputContext,
            ...context.sharedContext,
            ...context.reasoningContext,
        ];
        return allFiles.find((f) => f.path === normalizedPath) || null;
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=manager.js.map