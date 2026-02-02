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

import * as path from 'path';
import * as fs from 'fs';
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

const DEFAULT_CONFIG: SandboxConfig = {
  allowedDirectories: [
    '/tmp/dash',
    '/Users/jasontang/clawd/projects/dash/workspace'
  ],
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxStoragePerAgent: 1024 * 1024 * 1024, // 1GB per agent
  maxExecutionTime: 300000, // 5 minutes
  allowedCommands: [
    'ls', 'cat', 'echo', 'head', 'tail', 'grep', 'find', 'wc',
    'mkdir', 'rm', 'cp', 'mv', 'touch', 'chmod', 'pwd', 'cd'
  ],
  blockedExtensions: [
    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.dll', '.so', '.bin'
  ]
};

export class FileSandbox extends EventEmitter {
  private config: SandboxConfig;
  private contexts: Map<string, SandboxContext> = new Map();
  private violations: ViolationReport[] = [];

  constructor(config: Partial<SandboxConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureDirectories();
  }

  /**
   * Ensure all allowed directories exist
   */
  private ensureDirectories(): void {
    this.config.allowedDirectories.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Create a sandbox context for an agent
   */
  createContext(agentId: string, swarmId: string): SandboxContext {
    const baseDirectory = path.join(
      this.config.allowedDirectories[0],
      'swarms',
      swarmId,
      'agents',
      agentId
    );

    // Ensure directory exists
    fs.mkdirSync(baseDirectory, { recursive: true });

    const context: SandboxContext = {
      agentId,
      swarmId,
      baseDirectory,
      startTime: new Date(),
      operations: [],
      storageUsed: this.getDirectorySize(baseDirectory)
    };

    this.contexts.set(this.getContextKey(agentId, swarmId), context);
    this.emit('context_created', { agentId, swarmId, baseDirectory });

    return context;
  }

  /**
   * Check if a file operation is allowed
   */
  checkOperation(
    agentId: string,
    swarmId: string,
    operation: 'read' | 'write' | 'delete' | 'execute',
    filePath: string
  ): SandboxResult {
    const contextKey = this.getContextKey(agentId, swarmId);
    let context = this.contexts.get(contextKey);

    // Create context if it doesn't exist
    if (!context) {
      context = this.createContext(agentId, swarmId);
    }

    // Normalize and resolve path
    const resolvedPath = this.resolvePath(context, filePath);

    // Check if path is within allowed directories
    if (!this.isPathAllowed(resolvedPath)) {
      this.recordViolation(context, operation, filePath, false, 'Path not in allowed directories');
      return {
        allowed: false,
        path: filePath,
        reason: 'Path is outside allowed directories',
        resolvedPath
      };
    }

    // Check for path traversal attempts
    if (this.detectPathTraversal(filePath)) {
      this.recordViolation(context, operation, filePath, false, 'Path traversal detected');
      return {
        allowed: false,
        path: filePath,
        reason: 'Path traversal attempt detected',
        resolvedPath
      };
    }

    // Check file extension
    if (this.isExtensionBlocked(filePath)) {
      this.recordViolation(context, operation, filePath, false, 'Blocked file extension');
      return {
        allowed: false,
        path: filePath,
        reason: 'File extension is blocked',
        resolvedPath
      };
    }

    // Record successful operation
    this.recordOperation(context, operation, filePath, true);

    return {
      allowed: true,
      path: filePath,
      resolvedPath
    };
  }

  /**
   * Check if read operation is allowed
   */
  canRead(agentId: string, swarmId: string, filePath: string): SandboxResult {
    return this.checkOperation(agentId, swarmId, 'read', filePath);
  }

  /**
   * Check if write operation is allowed
   */
  canWrite(agentId: string, swarmId: string, filePath: string): SandboxResult {
    return this.checkOperation(agentId, swarmId, 'write', filePath);
  }

  /**
   * Check if delete operation is allowed
   */
  canDelete(agentId: string, swarmId: string, filePath: string): SandboxResult {
    return this.checkOperation(agentId, swarmId, 'delete', filePath);
  }

  /**
   * Check if execute operation is allowed
   */
  canExecute(agentId: string, swarmId: string, command: string): SandboxResult {
    // Extract command name
    const commandName = path.basename(command).split('?')[0];

    if (!this.config.allowedCommands.includes(commandName)) {
      const contextKey = this.getContextKey(agentId, swarmId);
      const context = this.contexts.get(contextKey);
      if (context) {
        this.recordViolation(context, 'execute', command, false, 'Command not allowed');
      }
      return {
        allowed: false,
        path: command,
        reason: `Command '${commandName}' is not in allowed list`
      };
    }

    // Record successful operation
    const contextKey = this.getContextKey(agentId, swarmId);
    const context = this.contexts.get(contextKey);
    if (context) {
      this.recordOperation(context, 'execute', command, true);
    }

    return {
      allowed: true,
      path: command
    };
  }

  /**
   * Check if file size limit would be exceeded
   */
  checkFileSize(agentId: string, swarmId: string, size: number): SandboxResult {
    if (size > this.config.maxFileSize) {
      return {
        allowed: false,
        path: `size:${size}`,
        reason: `File size (${size} bytes) exceeds limit (${this.config.maxFileSize} bytes)`
      };
    }

    const contextKey = this.getContextKey(agentId, swarmId);
    const context = this.contexts.get(contextKey);

    if (context && context.storageUsed + size > this.config.maxStoragePerAgent) {
      return {
        allowed: false,
        path: `storage:${context.storageUsed + size}`,
        reason: `Storage quota exceeded (${context.storageUsed + size} > ${this.config.maxStoragePerAgent})`
      };
    }

    return { allowed: true, path: 'size check passed' };
  }

  /**
   * Check if execution time limit would be exceeded
   */
  checkExecutionTime(agentId: string, swarmId: string): SandboxResult {
    const contextKey = this.getContextKey(agentId, swarmId);
    const context = this.contexts.get(contextKey);

    if (!context) {
      return { allowed: true, path: 'no context' };
    }

    const elapsed = Date.now() - context.startTime.getTime();

    if (elapsed > this.config.maxExecutionTime) {
      return {
        allowed: false,
        path: `elapsed:${elapsed}`,
        reason: `Execution time (${elapsed}ms) exceeds limit (${this.config.maxExecutionTime}ms)`
      };
    }

    return { allowed: true, path: 'time check passed' };
  }

  /**
   * Get relative path within sandbox
   */
  getSandboxPath(agentId: string, swarmId: string, relativePath: string): string {
    const contextKey = this.getContextKey(agentId, swarmId);
    let context = this.contexts.get(contextKey);

    if (!context) {
      context = this.createContext(agentId, swarmId);
    }

    return path.join(context.baseDirectory, relativePath);
  }

  /**
   * Get violation history
   */
  getViolations(agentId?: string): ViolationReport[] {
    if (agentId) {
      return this.violations.filter((v) => v.agentId === agentId);
    }
    return [...this.violations];
  }

  /**
   * Get context statistics
   */
  getStatistics(agentId?: string, swarmId?: string): {
    operations: number;
    violations: number;
    storageUsed: number;
    executionTime: number;
  } | null {
    const contextKey = agentId && swarmId ? this.getContextKey(agentId, swarmId) : null;

    if (contextKey) {
      const context = this.contexts.get(contextKey);
      if (!context) return null;

      return {
        operations: context.operations.length,
        violations: this.violations.filter((v) => v.agentId === agentId).length,
        storageUsed: context.storageUsed,
        executionTime: Date.now() - context.startTime.getTime()
      };
    }

    // Aggregate stats
    let totalOps = 0;
    let totalViolations = 0;
    let totalStorage = 0;

    this.contexts.forEach((context) => {
      totalOps += context.operations.length;
      totalStorage += context.storageUsed;
    });

    totalViolations = this.violations.length;

    return {
      operations: totalOps,
      violations: totalViolations,
      storageUsed: totalStorage,
      executionTime: 0
    };
  }

  /**
   * Cleanup context
   */
  cleanup(agentId: string, swarmId: string): void {
    const contextKey = this.getContextKey(agentId, swarmId);
    this.contexts.delete(contextKey);
    this.emit('context_cleaned', { agentId, swarmId });
  }

  /**
   * Resolve path within context
   */
  private resolvePath(context: SandboxContext, filePath: string): string {
    // Handle absolute paths
    if (path.isAbsolute(filePath)) {
      return path.normalize(filePath);
    }

    // Handle relative paths
    return path.resolve(context.baseDirectory, filePath);
  }

  /**
   * Check if path is within allowed directories
   */
  private isPathAllowed(resolvedPath: string): boolean {
    return this.config.allowedDirectories.some((dir) => {
      return resolvedPath.startsWith(path.normalize(dir) + path.sep) ||
             resolvedPath === path.normalize(dir);
    });
  }

  /**
   * Detect path traversal attempts
   */
  private detectPathTraversal(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    return normalized.includes('..') || normalized.startsWith('/etc/') ||
           normalized.startsWith('/usr/bin') || normalized.startsWith('/bin/') ||
           normalized.includes('\0');
  }

  /**
   * Check if extension is blocked
   */
  private isExtensionBlocked(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.config.blockedExtensions.includes(ext);
  }

  /**
   * Record operation
   */
  private recordOperation(
    context: SandboxContext,
    type: SandboxOperation['type'],
    path: string,
    success: boolean,
    error?: string
  ): void {
    const operation: SandboxOperation = {
      type,
      path,
      timestamp: new Date(),
      success,
      error
    };

    context.operations.push(operation);
  }

  /**
   * Record violation
   */
  private recordViolation(
    context: SandboxContext,
    type: SandboxOperation['type'],
    path: string,
    success: boolean,
    error: string
  ): void {
    const operation: SandboxOperation = {
      type,
      path,
      timestamp: new Date(),
      success: false,
      error
    };

    context.operations.push(operation);

    const violation: ViolationReport = {
      agentId: context.agentId,
      swarmId: context.swarmId,
      operation,
      timestamp: new Date(),
      severity: error.toLowerCase().includes('traversal') ? 'critical' : 'warning'
    };

    this.violations.push(violation);
    this.emit('violation', violation);
  }

  /**
   * Get directory size
   */
  private getDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;

    let totalSize = 0;

    const getSize = (dirPath: string) => {
      if (fs.statSync(dirPath).isDirectory()) {
        fs.readdirSync(dirPath).forEach((file) => {
          getSize(path.join(dirPath, file));
        });
      } else {
        totalSize += fs.statSync(dirPath).size;
      }
    };

    getSize(dirPath);
    return totalSize;
  }

  /**
   * Generate context key
   */
  private getContextKey(agentId: string, swarmId: string): string {
    return `${swarmId}:${agentId}`;
  }
}

/**
 * Singleton instance
 */
let instance: FileSandbox | null = null;

export function getFileSandbox(): FileSandbox {
  if (!instance) {
    instance = new FileSandbox();
  }
  return instance;
}

export function createSandbox(config?: Partial<SandboxConfig>): FileSandbox {
  return new FileSandbox(config);
}
