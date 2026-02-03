/**
 * Context Manager
 * Core class for managing agent context, file references, and context operations
 */
import { ContextFile, ContextType, AgentContext, ContextAnalysis, FileNode, DependencyGraph } from './types';
import type { ValidationResult } from './types';
/**
 * ContextManager - Main class for context management operations
 */
export declare class ContextManager {
    private agentContexts;
    private sizeCalculator;
    private maxContextSize;
    private maxFiles;
    constructor(options?: {
        maxContextSize?: number;
        maxFiles?: number;
    });
    /**
     * Add a file to an agent's context
     */
    addFile(agentId: string, filePath: string, type?: ContextType): Promise<ContextFile>;
    /**
     * Remove a file from an agent's context
     */
    removeFile(agentId: string, filePath: string): boolean;
    /**
     * Get context for an agent
     */
    getContext(agentId: string): AgentContext | undefined;
    /**
     * Get context files for an agent
     */
    getContextFiles(agentId: string, type?: ContextType): ContextFile[];
    /**
     * Analyze context for an agent - returns file tree and dependencies
     */
    analyzeContext(agentId: string): Promise<ContextAnalysis>;
    /**
     * Share a file between agents
     */
    shareFile(sourceAgentId: string, targetAgentId: string, filePath: string): Promise<ContextFile | null>;
    /**
     * Validate context against limits
     */
    validateContext(agentId: string): ValidationResult;
    /**
     * Get context size statistics
     */
    getContextStats(agentId: string): object | null;
    /**
     * Get file tree as formatted string
     */
    getFileTreeString(agentId: string, maxDepth?: number): string | null;
    /**
     * Remove all context for an agent
     */
    clearContext(agentId: string): boolean;
    /**
     * Get all agents with context
     */
    getAgentsWithContext(): string[];
    /**
     * Export context for serialization
     */
    exportContext(agentId: string): object | null;
    /**
     * Import context from serialized data
     */
    importContext(data: Record<string, unknown>): void;
    private createEmptyContext;
    private getContextArray;
    private getTotalFileCount;
    private updateContextSize;
    private validateFilePath;
    private normalizePath;
    private calculateChecksum;
    private buildFileTreeFromContext;
    private buildDependencyGraph;
    private findFileInContext;
}
export { ContextFile, ContextType, AgentContext, ContextAnalysis, FileNode, DependencyGraph };
//# sourceMappingURL=manager.d.ts.map