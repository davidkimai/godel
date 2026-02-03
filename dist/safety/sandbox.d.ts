/**
 * Dash File Sandbox - Filesystem Security Restrictions
 *
 * PRD Section 2.5: File Sandbox
 *
 * Security features:
 * - Path traversal detection
 * - Allowed directories whitelist
 * - File size quotas per agent
 * - Execution time limits
 * - Restricted command list
 */
import { EventEmitter } from 'events';
export interface SandboxConfig {
    /** Allowed base directories for file operations */
    allowedDirectories: string[];
    /** Maximum file size in bytes (default: 100MB) */
    maxFileSize: number;
    /** Maximum total storage per agent in bytes (default: 1GB) */
    maxStoragePerAgent: number;
    /** Maximum execution time in milliseconds (default: 300000 = 5min) */
    maxExecutionTime: number;
    /** List of allowed commands */
    allowedCommands: string[];
    /** Blocked file extensions */
    blockedExtensions: string[];
}
export interface SandboxContext {
    agentId: string;
    swarmId: string;
    baseDirectory: string;
    startTime: Date;
    operations: SandboxOperation[];
    storageUsed: number;
}
export interface SandboxOperation {
    type: 'read' | 'write' | 'delete' | 'execute';
    path: string;
    timestamp: Date;
    success: boolean;
    error?: string;
}
export interface SandboxResult {
    allowed: boolean;
    path: string;
    reason?: string;
    resolvedPath?: string;
}
export interface ViolationReport {
    agentId: string;
    swarmId: string;
    operation: SandboxOperation;
    timestamp: Date;
    severity: 'warning' | 'critical';
}
export declare class FileSandbox extends EventEmitter {
    private config;
    private contexts;
    private violations;
    constructor(config?: Partial<SandboxConfig>);
    /**
     * Ensure all allowed directories exist
     */
    private ensureDirectories;
    /**
     * Create a sandbox context for an agent
     */
    createContext(agentId: string, swarmId: string): SandboxContext;
    /**
     * Check if a file operation is allowed
     */
    checkOperation(agentId: string, swarmId: string, operation: 'read' | 'write' | 'delete' | 'execute', filePath: string): SandboxResult;
    /**
     * Check if read operation is allowed
     */
    canRead(agentId: string, swarmId: string, filePath: string): SandboxResult;
    /**
     * Check if write operation is allowed
     */
    canWrite(agentId: string, swarmId: string, filePath: string): SandboxResult;
    /**
     * Check if delete operation is allowed
     */
    canDelete(agentId: string, swarmId: string, filePath: string): SandboxResult;
    /**
     * Check if execute operation is allowed
     */
    canExecute(agentId: string, swarmId: string, command: string): SandboxResult;
    /**
     * Check if file size limit would be exceeded
     */
    checkFileSize(agentId: string, swarmId: string, size: number): SandboxResult;
    /**
     * Check if execution time limit would be exceeded
     */
    checkExecutionTime(agentId: string, swarmId: string): SandboxResult;
    /**
     * Get relative path within sandbox
     */
    getSandboxPath(agentId: string, swarmId: string, relativePath: string): string;
    /**
     * Get violation history
     */
    getViolations(agentId?: string): ViolationReport[];
    /**
     * Get context statistics
     */
    getStatistics(agentId?: string, swarmId?: string): {
        operations: number;
        violations: number;
        storageUsed: number;
        executionTime: number;
    } | null;
    /**
     * Cleanup context
     */
    cleanup(agentId: string, swarmId: string): void;
    /**
     * Resolve path within context
     */
    private resolvePath;
    /**
     * Check if path is within allowed directories
     */
    private isPathAllowed;
    /**
     * Detect path traversal attempts
     */
    private detectPathTraversal;
    /**
     * Check if extension is blocked
     */
    private isExtensionBlocked;
    /**
     * Record operation
     */
    private recordOperation;
    /**
     * Record violation
     */
    private recordViolation;
    /**
     * Get directory size
     */
    private getDirectorySize;
    /**
     * Generate context key
     */
    private getContextKey;
}
export declare function getFileSandbox(): FileSandbox;
export declare function createSandbox(config?: Partial<SandboxConfig>): FileSandbox;
//# sourceMappingURL=sandbox.d.ts.map