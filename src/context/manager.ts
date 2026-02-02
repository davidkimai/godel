/**
 * Context Manager
 * Core class for managing agent context, file references, and context operations
 */

import * as fs from 'fs';
import * as path from 'path';

import { ContextSizeCalculator, calculateContextStats } from './size';
import { FileTreeBuilder, buildFileTree, formatTreeAsString } from './tree';
import { 
  ContextFile, 
  ContextType, 
  AgentContext, 
  ContextAnalysis,
  FileNode,
  DependencyGraph
} from './types';

import type {
  ValidationResult} from './types';

// Default limits
const DEFAULT_MAX_CONTEXT_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_FILES = 100;

/**
 * ContextManager - Main class for context management operations
 */
export class ContextManager {
  private agentContexts: Map<string, AgentContext>;
  private sizeCalculator: ContextSizeCalculator;
  private maxContextSize: number;
  private maxFiles: number;

  constructor(options?: {
    maxContextSize?: number;
    maxFiles?: number;
  }) {
    this.agentContexts = new Map();
    this.sizeCalculator = new ContextSizeCalculator();
    this.maxContextSize = options?.maxContextSize ?? DEFAULT_MAX_CONTEXT_SIZE;
    this.maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
  }

  /**
   * Add a file to an agent's context
   */
  async addFile(
    agentId: string, 
    filePath: string, 
    type: ContextType = 'input'
  ): Promise<ContextFile> {
    // Validate file path
    if (!this.validateFilePath(filePath)) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    // Check if file exists (async)
    let exists = false;
    let size = 0;
    let lastModified: Date | undefined;

    try {
      const stats = await fs.promises.stat(filePath);
      exists = stats.isFile();
      size = stats.size;
      lastModified = stats.mtime;
    } catch {
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
    const contextFile: ContextFile = {
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
    } else {
      contextArray.push(contextFile);
    }

    // Update context size
    this.updateContextSize(context);

    return contextFile;
  }

  /**
   * Remove a file from an agent's context
   */
  removeFile(agentId: string, filePath: string): boolean {
    const context = this.agentContexts.get(agentId);
    if (!context) {
      return false;
    }

    const normalizedPath = this.normalizePath(filePath);
    let removed = false;

    // Search and remove from all context types
    for (const type of ['input', 'output', 'shared', 'reasoning'] as ContextType[]) {
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
  getContext(agentId: string): AgentContext | undefined {
    return this.agentContexts.get(agentId);
  }

  /**
   * Get context files for an agent
   */
  getContextFiles(agentId: string, type?: ContextType): ContextFile[] {
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
  async analyzeContext(agentId: string): Promise<ContextAnalysis> {
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
  async shareFile(
    sourceAgentId: string, 
    targetAgentId: string, 
    filePath: string
  ): Promise<ContextFile | null> {
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
  validateContext(agentId: string): ValidationResult {
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
  getContextStats(agentId: string): object | null {
    const context = this.agentContexts.get(agentId);
    if (!context) {
      return null;
    }

    const allFiles = this.getContextFiles(agentId);
    return calculateContextStats(allFiles);
  }

  /**
   * Get file tree as formatted string
   */
  getFileTreeString(agentId: string, maxDepth?: number): string | null {
    const context = this.agentContexts.get(agentId);
    if (!context) {
      return null;
    }

    const allFiles = this.getContextFiles(agentId);
    const fileTree = this.buildFileTreeFromContext(allFiles);
    
    return formatTreeAsString(fileTree, '', true, maxDepth);
  }

  /**
   * Remove all context for an agent
   */
  clearContext(agentId: string): boolean {
    return this.agentContexts.delete(agentId);
  }

  /**
   * Get all agents with context
   */
  getAgentsWithContext(): string[] {
    return Array.from(this.agentContexts.keys());
  }

  /**
   * Export context for serialization
   */
  exportContext(agentId: string): object | null {
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
  importContext(data: Record<string, unknown>): void {
    const {
      agentId,
      contextSize,
      contextUsage,
      inputContext = [],
      outputContext = [],
      sharedContext = [],
      reasoningContext = [],
    } = data;

    const context: AgentContext = {
      agentId: agentId as string,
      contextSize: (contextSize as number) || 0,
      contextWindow: this.sizeCalculator.getLimits().maxContextWindow,
      contextUsage: (contextUsage as number) || 0,
      inputContext: inputContext as ContextFile[],
      outputContext: outputContext as ContextFile[],
      sharedContext: sharedContext as ContextFile[],
      reasoningContext: reasoningContext as ContextFile[],
    };

    this.agentContexts.set(agentId as string, context);
  }

  // Private helper methods

  private createEmptyContext(agentId: string): AgentContext {
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

  private getContextArray(context: AgentContext, type: ContextType): ContextFile[] {
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

  private getTotalFileCount(context: AgentContext): number {
    return (
      context.inputContext.length +
      context.outputContext.length +
      context.sharedContext.length +
      context.reasoningContext.length
    );
  }

  private updateContextSize(context: AgentContext): void {
    const allFiles = [
      ...context.inputContext,
      ...context.outputContext,
      ...context.sharedContext,
      ...context.reasoningContext,
    ];

    context.contextSize = allFiles.reduce((sum, f) => sum + f.size, 0);
    context.contextUsage = context.contextSize / this.maxContextSize;
  }

  private validateFilePath(filePath: string): boolean {
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

  private normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    try {
      const crypto = await import('crypto');
      const data = await fs.promises.readFile(filePath);
      return crypto.createHash('md5').update(data).digest('hex');
    } catch {
      return '';
    }
  }

  private buildFileTreeFromContext(files: ContextFile[]): FileNode {
    const filePaths = files.map((f) => f.path);
    const metadata = new Map<string, FileNode['metadata']>();
    
    for (const file of files) {
      metadata.set(file.path, {
        size: file.size,
        lastModified: file.lastModified,
      });
    }

    return buildFileTree(filePaths, metadata);
  }

  private buildDependencyGraph(filePaths: string[]): DependencyGraph {
    const builder = new FileTreeBuilder();
    
    for (const filePath of filePaths) {
      builder.addPath(filePath);
    }

    return builder.extractDependencies(filePaths);
  }

  private findFileInContext(context: AgentContext, filePath: string): ContextFile | null {
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

// Type exports for convenience
export { ContextFile, ContextType, AgentContext, ContextAnalysis, FileNode, DependencyGraph };
