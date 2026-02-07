/**
 * Tool Interceptor Module - Pi Integration
 *
 * Routes tool calls between Pi, Godel tools, and remote executors with policy enforcement.
 * Provides a centralized mechanism for tool registration, policy-based access control,
 * audit logging, and execution routing.
 *
 * @module @godel/integrations/pi/tools
 *
 * @example
 * ```typescript
 * // Create interceptor with audit logging
 * const auditLog = new AuditLogger();
 * const interceptor = new ToolInterceptor(auditLog);
 *
 * // Register built-in tools
 * interceptor.registerTool(readTool);
 * interceptor.registerTool(writeTool);
 * interceptor.registerTool(bashTool);
 *
 * // Add policy for read-only mode
 * interceptor.addPolicy({
 *   name: 'read_only_mode',
 *   condition: (tool, context) => context.permissions.includes('read_only'),
 *   decision: { allowed: true, requireApproval: tool !== 'read' }
 * });
 *
 * // Execute tool through interceptor
 * const result = await interceptor.intercept(
 *   { name: 'read', arguments: { path: 'src/index.ts' } },
 *   { sessionId: 'sess-123', agentId: 'agent-456', permissions: ['read_only'] }
 * );
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import type { PiInstance, Logger } from './types';
import type { SessionTreeManager, ConversationTree, MessageNode } from './tree';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Tool call structure representing a request to execute a tool
 */
export interface ToolCall {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Optional tool call ID for tracking */
  id?: string;
}

/**
 * Tool result structure representing the outcome of tool execution
 */
export interface ToolResult {
  /** Whether the execution was successful */
  success: boolean;
  /** Result data on success */
  result?: unknown;
  /** Error message on failure */
  error?: string;
  /** Execution metadata */
  metadata?: {
    /** Execution time in milliseconds */
    executionTimeMs?: number;
    /** Tool name that was executed */
    toolName?: string;
    /** Timestamp of execution */
    timestamp?: string;
  };
}

/**
 * Tool context providing execution environment information
 */
export interface ToolContext {
  /** Session identifier */
  sessionId: string;
  /** Agent identifier */
  agentId: string;
  /** User identifier */
  userId: string;
  /** Tenant/organization identifier */
  tenantId: string;
  /** Optional worktree path for file operations */
  worktreePath?: string;
  /** List of permissions granted to this context */
  permissions: string[];
  /** Associated Pi instance */
  piInstance?: PiInstance;
  /** Optional session tree manager for tree operations */
  treeManager?: SessionTreeManager;
  /** Optional conversation tree */
  conversationTree?: ConversationTree;
}

/**
 * JSON Schema type for tool parameters
 */
export interface JSONSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    default?: unknown;
    items?: unknown;
  }>;
  required?: string[];
}

/**
 * Tool definition with metadata and execution function
 */
export interface Tool {
  /** Tool name (unique identifier) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON schema for tool parameters */
  parameters: JSONSchema;
  /** Execution function */
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
  /** Optional tags for categorization */
  tags?: string[];
  /** Whether this tool requires confirmation */
  requiresConfirmation?: boolean;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Policy decision result
 */
export interface PolicyDecision {
  /** Whether the tool call is allowed */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** Sanitized/modified arguments */
  sanitizedArgs?: Record<string, unknown>;
  /** Whether approval is required before execution */
  requireApproval?: boolean;
  /** Additional policy metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool policy for access control
 */
export interface ToolPolicy {
  /** Policy name (unique identifier) */
  name: string;
  /** Priority level (higher = evaluated first) */
  priority?: number;
  /** Condition function to check if policy applies */
  condition: (toolName: string, context: ToolContext, args?: Record<string, unknown>) => boolean;
  /** Decision function or static decision */
  decision: PolicyDecision | ((toolName: string, context: ToolContext, args?: Record<string, unknown>) => PolicyDecision);
  /** Optional description for logging */
  description?: string;
}

/**
 * Remote executor interface for external tool execution
 */
export interface RemoteExecutor {
  /** Executor name */
  name: string;
  /** Check if this executor can handle a tool */
  canHandle: (toolName: string, context: ToolContext) => boolean;
  /** Execute the tool remotely */
  execute: (toolCall: ToolCall, context: ToolContext) => Promise<ToolResult>;
  /** Get health status of the remote executor */
  health?: () => Promise<{ healthy: boolean; latencyMs?: number }>;
}

/**
 * Audit log entry for tool execution
 */
export interface AuditLogEntry {
  /** Event type */
  event: 'tool.execution.started' | 'tool.execution.completed' | 'tool.execution.failed' | 'tool.execution.blocked';
  /** Tool name */
  tool: string;
  /** Session identifier */
  sessionId: string;
  /** Agent identifier */
  agentId?: string;
  /** Tenant identifier */
  tenantId?: string;
  /** Tool arguments (may be sanitized) */
  args?: Record<string, unknown>;
  /** Execution result (on completion) */
  result?: unknown;
  /** Error message (on failure) */
  error?: string;
  /** Policy that blocked execution (if blocked) */
  blockingPolicy?: string;
  /** Execution time in milliseconds */
  executionTimeMs?: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Audit logger interface for tracking tool executions
 */
export interface AuditLogger {
  /** Log an audit entry */
  log: (entry: AuditLogEntry) => void;
  /** Query audit logs (optional) */
  query?: (filter: AuditQuery) => Promise<AuditLogEntry[]>;
}

/**
 * Audit query filter
 */
export interface AuditQuery {
  sessionId?: string;
  tool?: string;
  agentId?: string;
  tenantId?: string;
  event?: AuditLogEntry['event'];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

/**
 * Todo item structure
 */
export interface TodoItem {
  /** Unique identifier */
  id: string;
  /** Todo content/description */
  content: string;
  /** Current status */
  status: 'pending' | 'in_progress' | 'completed';
  /** Priority level */
  priority: 'low' | 'medium' | 'high';
  /** Creation timestamp */
  createdAt?: string;
  /** Completion timestamp */
  completedAt?: string;
}

/**
 * Edit operation for file modifications
 */
export interface EditOperation {
  /** Search pattern */
  search: string;
  /** Replacement text */
  replace: string;
}

// ============================================================================
// Audit Logger Implementation
// ============================================================================

/**
 * Default audit logger that writes to structured logs
 */
export class DefaultAuditLogger implements AuditLogger {
  private logger: Logger;
  private entries: AuditLogEntry[] = [];
  private maxEntries: number;

  /**
   * Create a new DefaultAuditLogger
   *
   * @param maxEntries - Maximum number of entries to keep in memory
   */
  constructor(maxEntries = 10000) {
    this.logger = logger;
    this.maxEntries = maxEntries;
  }

  /**
   * Log an audit entry
   *
   * @param entry - Audit log entry
   */
  log(entry: AuditLogEntry): void {
    // Add to in-memory buffer
    this.entries.push(entry);

    // Trim if exceeding max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Log to structured logger
    const logData = {
      event: entry.event,
      tool: entry.tool,
      sessionId: entry.sessionId,
      agentId: entry.agentId,
      tenantId: entry.tenantId,
      executionTimeMs: entry.executionTimeMs,
      error: entry.error,
      blockingPolicy: entry.blockingPolicy,
    };

    switch (entry.event) {
      case 'tool.execution.started':
        this.logger.debug(`[ToolInterceptor] Tool execution started: ${entry.tool}`, logData);
        break;
      case 'tool.execution.completed':
        this.logger.info(`[ToolInterceptor] Tool execution completed: ${entry.tool}`, logData);
        break;
      case 'tool.execution.failed':
        this.logger.error(`[ToolInterceptor] Tool execution failed: ${entry.tool}`, logData);
        break;
      case 'tool.execution.blocked':
        this.logger.warn(`[ToolInterceptor] Tool execution blocked: ${entry.tool}`, logData);
        break;
    }
  }

  /**
   * Query audit logs
   *
   * @param filter - Query filter
   * @returns Matching audit entries
   */
  async query(filter: AuditQuery): Promise<AuditLogEntry[]> {
    return this.entries.filter((entry) => {
      if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
      if (filter.tool && entry.tool !== filter.tool) return false;
      if (filter.agentId && entry.agentId !== filter.agentId) return false;
      if (filter.tenantId && entry.tenantId !== filter.tenantId) return false;
      if (filter.event && entry.event !== filter.event) return false;
      if (filter.startTime && new Date(entry.timestamp) < filter.startTime) return false;
      if (filter.endTime && new Date(entry.timestamp) > filter.endTime) return false;
      return true;
    }).slice(0, filter.limit || 100);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Resolve a path within the worktree, preventing directory traversal
 *
 * @param relativePath - Relative path to resolve
 * @param worktreePath - Base worktree path
 * @returns Absolute resolved path
 * @throws Error if path escapes worktree
 */
export function resolveInWorktree(relativePath: string, worktreePath?: string): string {
  if (!worktreePath) {
    throw new Error('Worktree path not provided in tool context');
  }

  // Normalize and resolve the path
  const resolved = path.resolve(worktreePath, relativePath);

  // Ensure path is within worktree (prevent directory traversal)
  const relative = path.relative(worktreePath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path '${relativePath}' escapes worktree boundary`);
  }

  return resolved;
}

/**
 * Execute a bash command with timeout
 *
 * @param command - Command to execute
 * @param cwd - Working directory
 * @param timeoutMs - Timeout in milliseconds
 * @returns Command result
 */
export async function executeBash(
  command: string,
  cwd?: string,
  timeoutMs = 60000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', command], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set timeout
    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Force kill after grace period
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (killed) {
        resolve({
          stdout,
          stderr: stderr || 'Command timed out',
          exitCode: 124,
        });
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Apply edits to file content
 *
 * @param content - Original content
 * @param edits - Edit operations
 * @returns Modified content
 */
export function applyEdits(content: string, edits: EditOperation[]): string {
  let result = content;

  for (const edit of edits) {
    const searchRegex = new RegExp(escapeRegExp(edit.search), 'g');
    const matches = result.match(searchRegex);

    if (!matches) {
      throw new Error(`Search pattern not found: ${edit.search.slice(0, 50)}...`);
    }

    if (matches.length > 1) {
      throw new Error(`Multiple matches found for: ${edit.search.slice(0, 50)}...`);
    }

    result = result.replace(searchRegex, edit.replace);
  }

  return result;
}

/**
 * Escape special regex characters
 *
 * @param string - String to escape
 * @returns Escaped string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a diff between two strings
 *
 * @param original - Original content
 * @param modified - Modified content
 * @returns Diff string
 */
export function generateDiff(original: string, modified: string): string {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const diff: string[] = [];

  // Simple line-based diff
  let i = 0;
  let j = 0;

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i >= originalLines.length) {
      diff.push(`+ ${modifiedLines[j]}`);
      j++;
    } else if (j >= modifiedLines.length) {
      diff.push(`- ${originalLines[i]}`);
      i++;
    } else if (originalLines[i] === modifiedLines[j]) {
      diff.push(`  ${originalLines[i]}`);
      i++;
      j++;
    } else {
      diff.push(`- ${originalLines[i]}`);
      diff.push(`+ ${modifiedLines[j]}`);
      i++;
      j++;
    }
  }

  return diff.join('\n');
}

// ============================================================================
// Built-in Tools
// ============================================================================

/**
 * Read tool - Read file contents from the worktree
 *
 * @example
 * ```typescript
 * const result = await readTool.execute(
 *   { path: 'src/index.ts' },
 *   { sessionId: 'sess-123', worktreePath: '/path/to/worktree', permissions: [] }
 * );
 * // result: { content: '...file contents...' }
 * ```
 */
export const readTool: Tool = {
  name: 'read',
  description: 'Read file contents from the worktree',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to file within the worktree',
      },
      offset: {
        type: 'number',
        description: 'Line offset to start reading from (0-indexed)',
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read',
        default: 1000,
      },
    },
    required: ['path'],
  },
  async execute(args, context) {
    const { path: filePath, offset = 0, limit = 1000 } = args;
    const fullPath = resolveInWorktree(String(filePath), context.worktreePath);
    const offsetNum = Number(offset) || 0;
    const limitNum = Number(limit) || 1000;

    // Check if file exists
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }
    } catch (error) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file content
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Apply offset and limit
    const slicedLines = lines.slice(offsetNum, offsetNum + limitNum);
    const result = slicedLines.join('\n');

    return {
      content: result,
      totalLines: lines.length,
      readLines: slicedLines.length,
      truncated: lines.length > limitNum,
    };
  },
};

/**
 * Write tool - Write file contents in the worktree
 *
 * @example
 * ```typescript
 * const result = await writeTool.execute(
 *   { path: 'src/new-file.ts', content: 'console.log("hello");' },
 *   { sessionId: 'sess-123', worktreePath: '/path/to/worktree', permissions: [] }
 * );
 * // result: { success: true, bytesWritten: 23 }
 * ```
 */
export const writeTool: Tool = {
  name: 'write',
  description: 'Write file contents in the worktree',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to file within the worktree',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  requiresConfirmation: true,
  async execute(args, context) {
    const { path: filePath, content } = args;
    const fullPath = resolveInWorktree(String(filePath), context.worktreePath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Write file
    await fs.writeFile(fullPath, String(content), 'utf-8');

    return {
      success: true,
      bytesWritten: String(content).length,
      path: filePath,
    };
  },
};

/**
 * Edit tool - Apply edits to a file using search/replace blocks
 *
 * @example
 * ```typescript
 * const result = await editTool.execute(
 *   {
 *     path: 'src/index.ts',
 *     edits: [
 *       { search: 'const x = 1;', replace: 'const x = 2;' }
 *     ]
 *   },
 *   { sessionId: 'sess-123', worktreePath: '/path/to/worktree', permissions: [] }
 * );
 * // result: { success: true, changes: 1, diff: '...' }
 * ```
 */
export const editTool: Tool = {
  name: 'edit',
  description: 'Apply edits to a file using search/replace blocks',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to file within the worktree',
      },
      edits: {
        type: 'array',
        description: 'Array of search/replace operations',
        items: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Text to search for',
            },
            replace: {
              type: 'string',
              description: 'Replacement text',
            },
          },
          required: ['search', 'replace'],
        },
      },
    },
    required: ['path', 'edits'],
  },
  requiresConfirmation: true,
  async execute(args, context) {
    const { path: filePath, edits } = args;
    const fullPath = resolveInWorktree(String(filePath), context.worktreePath);

    // Validate edits array
    if (!Array.isArray(edits)) {
      throw new Error('Edits must be an array');
    }

    // Read original content
    const originalContent = await fs.readFile(fullPath, 'utf-8');

    // Apply edits
    const newContent = applyEdits(originalContent, edits as EditOperation[]);

    // Write back
    await fs.writeFile(fullPath, newContent, 'utf-8');

    // Generate diff
    const diff = generateDiff(originalContent, newContent);

    return {
      success: true,
      changes: edits.length,
      diff,
      path: filePath,
    };
  },
};

/**
 * Bash tool - Execute bash commands in the worktree
 *
 * @example
 * ```typescript
 * const result = await bashTool.execute(
 *   { command: 'ls -la', timeout: 30000 },
 *   { sessionId: 'sess-123', worktreePath: '/path/to/worktree', permissions: [] }
 * );
 * // result: { stdout: '...', stderr: '', exitCode: 0 }
 * ```
 */
export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute bash commands in the worktree',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Bash command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 60000)',
        default: 60000,
      },
    },
    required: ['command'],
  },
  requiresConfirmation: true,
  async execute(args, context) {
    const { command, timeout = 60000 } = args;

    // Validate command is a string
    if (typeof command !== 'string') {
      throw new Error('Command must be a string');
    }

    // Check for dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      />\s*\/dev\/(null|zero|random|urandom)/,
      /:\(\)\{\s*:\|:\s*&\s*\};/,
      /curl.*\|.*sh/,
      /wget.*\|.*sh/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Potentially dangerous command detected: ${command.slice(0, 50)}`);
      }
    }

    // Execute command
    const result = await executeBash(command, context.worktreePath, Number(timeout));

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      command: command.slice(0, 100), // Truncated for safety
    };
  },
};

/**
 * Todo write tool - Create and manage todo lists for tracking task progress
 *
 * @example
 * ```typescript
 * const result = await todoWriteTool.execute(
 *   {
 *     todos: [
 *       { id: '1', content: 'Implement feature A', status: 'in_progress', priority: 'high' },
 *       { id: '2', content: 'Write tests', status: 'pending', priority: 'medium' }
 *     ]
 *   },
 *   { sessionId: 'sess-123', permissions: [] }
 * );
 * // result: { success: true, todos: [...] }
 * ```
 */
export const todoWriteTool: Tool = {
  name: 'todo_write',
  description: 'Create and manage todo lists for tracking task progress',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'Array of todo items to set',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the todo',
            },
            content: {
              type: 'string',
              description: 'Todo description',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Current status',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Priority level',
              default: 'medium',
            },
          },
          required: ['id', 'content', 'status'],
        },
      },
    },
    required: ['todos'],
  },
  async execute(args, context) {
    const { todos } = args;

    if (!Array.isArray(todos)) {
      throw new Error('Todos must be an array');
    }

    // Validate and normalize todo items
    const normalizedTodos: TodoItem[] = todos.map((todo: Record<string, unknown>) => {
      if (!todo['id'] || !todo['content'] || !todo['status']) {
        throw new Error('Each todo must have id, content, and status');
      }

      const normalized: TodoItem = {
        id: String(todo['id']),
        content: String(todo['content']),
        status: todo['status'] as TodoItem['status'],
        priority: (todo['priority'] as TodoItem['priority']) || 'medium',
      };

      // Set completion timestamp if completed
      if (normalized.status === 'completed') {
        normalized.completedAt = new Date().toISOString();
      }

      return normalized;
    });

    // In a real implementation, this would persist to storage
    // For now, we return the normalized todos
    return {
      success: true,
      todos: normalizedTodos,
      count: normalizedTodos.length,
      completed: normalizedTodos.filter((t) => t.status === 'completed').length,
      pending: normalizedTodos.filter((t) => t.status === 'pending').length,
      inProgress: normalizedTodos.filter((t) => t.status === 'in_progress').length,
    };
  },
};

/**
 * Tree navigation tool - Navigate conversation tree: /tree, /branch, /fork, /switch
 *
 * @example
 * ```typescript
 * const result = await treeNavigateTool.execute(
 *   { action: 'show_tree' },
 *   { sessionId: 'sess-123', treeManager: sessionTreeManager, permissions: [] }
 * );
 * ```
 */
export const treeNavigateTool: Tool = {
  name: 'tree_navigate',
  description: 'Navigate conversation tree: show_tree, create_branch, switch_branch, fork',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['show_tree', 'create_branch', 'switch_branch', 'fork'],
        description: 'Navigation action to perform',
      },
      name: {
        type: 'string',
        description: 'Name for new branch (for create_branch/fork actions)',
      },
      nodeId: {
        type: 'string',
        description: 'Node ID to branch from (for create_branch action)',
      },
      branchId: {
        type: 'string',
        description: 'Branch ID to switch to (for switch_branch action)',
      },
    },
    required: ['action'],
  },
  async execute(args, context) {
    const { action } = args;
    const { treeManager, sessionId } = context;

    if (!treeManager) {
      throw new Error('SessionTreeManager not available in context');
    }

    const tree = await treeManager.getTree(sessionId);
    if (!tree) {
      throw new Error(`Conversation tree not found for session ${sessionId}`);
    }

    switch (action) {
      case 'show_tree': {
        // Return tree information
        return {
          success: true,
          tree: {
            id: tree.id,
            sessionId: tree.sessionId,
            currentNodeId: tree.currentNodeId,
            currentBranchId: tree.currentBranchId,
            totalNodes: tree.metadata.totalNodes,
            totalBranches: tree.branches.length,
            branches: tree.branches.map((b) => ({
              id: b.id,
              name: b.name,
              status: b.status,
              baseNodeId: b.baseNodeId,
              headNodeId: b.headNodeId,
            })),
          },
        };
      }

      case 'create_branch': {
        const { name, nodeId } = args;
        if (!name || typeof name !== 'string') {
          throw new Error('Branch name is required');
        }

        const baseNodeId = nodeId && typeof nodeId === 'string'
          ? nodeId
          : tree.currentNodeId;

        const branch = await treeManager.createBranch(sessionId, baseNodeId, name);
        return {
          success: true,
          action: 'create_branch',
          branch: {
            id: branch.id,
            name: branch.name,
            baseNodeId: branch.baseNodeId,
            status: branch.status,
          },
        };
      }

      case 'switch_branch': {
        const { branchId } = args;
        if (!branchId || typeof branchId !== 'string') {
          throw new Error('Branch ID is required');
        }

        await treeManager.switchBranch(sessionId, branchId);
        const updatedTree = await treeManager.getTree(sessionId);

        return {
          success: true,
          action: 'switch_branch',
          currentBranchId: updatedTree?.currentBranchId,
          currentNodeId: updatedTree?.currentNodeId,
        };
      }

      case 'fork': {
        const { name, nodeId: forkNodeId } = args;
        if (!name || typeof name !== 'string') {
          throw new Error('Fork name is required');
        }

        const fromNodeId = forkNodeId && typeof forkNodeId === 'string'
          ? forkNodeId
          : tree.currentNodeId;

        const forkedSession = await treeManager.forkSession(sessionId, fromNodeId, {
          name,
        });

        return {
          success: true,
          action: 'fork',
          forkedSession: {
            id: forkedSession.id,
            name,
            createdAt: forkedSession.createdAt,
          },
        };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
};

// ============================================================================
// Built-in Policies
// ============================================================================

/**
 * Default policies for tool access control
 */
export const DEFAULT_POLICIES: ToolPolicy[] = [
  /**
   * Block writes outside worktree
   */
  {
    name: 'worktree_containment',
    description: 'Ensure file operations stay within worktree',
    condition: (toolName) => ['read', 'write', 'edit'].includes(toolName),
    decision: { allowed: true }, // Actual validation in tool
  },

  /**
   * Require approval for bash commands
   */
  {
    name: 'bash_approval',
    priority: 100,
    description: 'Require approval for bash tool execution',
    condition: (toolName) => toolName === 'bash',
    decision: { allowed: true, requireApproval: true },
  },

  /**
   * Require approval for write operations
   */
  {
    name: 'write_approval',
    priority: 100,
    description: 'Require approval for write tool execution',
    condition: (toolName) => toolName === 'write',
    decision: { allowed: true, requireApproval: true },
  },

  /**
   * Require approval for edit operations
   */
  {
    name: 'edit_approval',
    priority: 100,
    description: 'Require approval for edit tool execution',
    condition: (toolName) => toolName === 'edit',
    decision: { allowed: true, requireApproval: true },
  },

  /**
   * Read-only mode policy
   */
  {
    name: 'read_only',
    priority: 200,
    description: 'Block all modifying operations in read-only mode',
    condition: (toolName, context) =>
      context.permissions.includes('read_only') &&
      ['write', 'edit', 'bash'].includes(toolName),
    decision: {
      allowed: false,
      reason: 'Read-only mode active - modifying operations not allowed',
    },
  },

  /**
   * Block dangerous bash commands
   */
  {
    name: 'dangerous_commands',
    priority: 300,
    description: 'Block known dangerous bash commands',
    condition: (toolName, _context, args) => {
      if (toolName !== 'bash' || !args?.['command']) return false;

      const command = String(args['command']).toLowerCase();
      const dangerousPatterns = [
        'rm -rf /',
        'rm -rf /*',
        'mkfs.',
        'dd if=/dev/zero',
        ':(){ :|:& };:',
      ];

      return dangerousPatterns.some((pattern) => command.includes(pattern));
    },
    decision: {
      allowed: false,
      reason: 'Dangerous command blocked by policy',
    },
  },
];

// ============================================================================
// Tool Interceptor Class
// ============================================================================

/**
 * ToolInterceptor routes tool calls between Pi, Godel tools, and remote executors
 * with policy enforcement and audit logging.
 *
 * Key responsibilities:
 * - Tool registration and management
 * - Policy-based access control
 * - Remote executor routing
 * - Audit logging
 * - Execution coordination
 *
 * @example
 * ```typescript
 * // Create interceptor
 * const auditLog = new DefaultAuditLogger();
 * const interceptor = new ToolInterceptor(auditLog);
 *
 * // Register tools
 * interceptor.registerTool(readTool);
 * interceptor.registerTool(writeTool);
 *
 * // Execute with policy enforcement
 * const result = await interceptor.intercept(
 *   { name: 'read', arguments: { path: 'file.txt' } },
 *   { sessionId: 'sess-123', agentId: 'agent-456', permissions: [] }
 * );
 * ```
 */
export class ToolInterceptor {
  /** Tool registry by name */
  private tools: Map<string, Tool> = new Map();

  /** Remote executors registry */
  private remoteExecutors: Map<string, RemoteExecutor> = new Map();

  /** Policy registry */
  private policies: ToolPolicy[] = [];

  /** Default policy when no policies match */
  private defaultPolicy: PolicyDecision;

  /** Audit logger for tracking executions */
  private auditLog: AuditLogger;

  /** In-memory todo storage by session */
  private sessionTodos: Map<string, TodoItem[]> = new Map();

  /**
   * Create a new ToolInterceptor
   *
   * @param auditLog - Audit logger for tracking tool executions
   * @param policies - Initial policies to register
   * @param defaultPolicy - Default policy decision when no policies match
   */
  constructor(
    auditLog: AuditLogger,
    policies: ToolPolicy[] = DEFAULT_POLICIES,
    defaultPolicy: PolicyDecision = { allowed: true }
  ) {
    this.auditLog = auditLog;
    this.policies = [...policies];
    this.defaultPolicy = defaultPolicy;

    logger.info('ToolInterceptor', 'ToolInterceptor initialized', {
      policiesCount: policies.length,
    });
  }

  // ============================================================================
  // Tool Registration
  // ============================================================================

  /**
   * Register a tool with the interceptor
   *
   * @param tool - Tool definition to register
   * @throws Error if tool name is already registered
   *
   * @example
   * ```typescript
   * interceptor.registerTool(readTool);
   * ```
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }

    this.tools.set(tool.name, tool);
    logger.debug('ToolInterceptor', `Registered tool: ${tool.name}`);
  }

  /**
   * Unregister a tool from the interceptor
   *
   * @param toolName - Name of the tool to unregister
   * @returns True if tool was found and removed
   *
   * @example
   * ```typescript
   * interceptor.unregisterTool('read');
   * ```
   */
  unregisterTool(toolName: string): boolean {
    const deleted = this.tools.delete(toolName);
    if (deleted) {
      logger.debug('ToolInterceptor', `Unregistered tool: ${toolName}`);
    }
    return deleted;
  }

  /**
   * Register a remote executor
   *
   * Remote executors handle tools that should be executed externally,
   * such as in Kubernetes pods or remote servers.
   *
   * @param executor - Remote executor to register
   *
   * @example
   * ```typescript
   * interceptor.registerRemoteExecutor({
   *   name: 'kubernetes',
   *   canHandle: (tool) => ['bash', 'read'].includes(tool),
   *   execute: async (toolCall, context) => {
   *     // Execute in K8s pod
   *     return { success: true, result: '...' };
   *   }
   * });
   * ```
   */
  registerRemoteExecutor(executor: RemoteExecutor): void {
    this.remoteExecutors.set(executor.name, executor);
    logger.debug('ToolInterceptor', `Registered remote executor: ${executor.name}`);
  }

  /**
   * Unregister a remote executor
   *
   * @param executorName - Name of the executor to unregister
   * @returns True if executor was found and removed
   */
  unregisterRemoteExecutor(executorName: string): boolean {
    return this.remoteExecutors.delete(executorName);
  }

  // ============================================================================
  // Main Execution Method
  // ============================================================================

  /**
   * Intercept and execute a tool call with policy enforcement
   *
   * This is the main entry point for tool execution. It:
   * 1. Checks policies
   * 2. Routes to local tool or remote executor
   * 3. Logs execution
   * 4. Returns result
   *
   * @param toolCall - Tool call to execute
   * @param context - Tool execution context
   * @returns Tool execution result
   *
   * @example
   * ```typescript
   * const result = await interceptor.intercept(
   *   { name: 'read', arguments: { path: 'file.txt' } },
   *   { sessionId: 'sess-123', agentId: 'agent-456', permissions: [] }
   * );
   * ```
   */
  async intercept(toolCall: ToolCall, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = toolCall.name;

    // 1. Check policies
    const policyDecision = this.checkPolicy(toolName, context, toolCall.arguments);

    if (!policyDecision.allowed) {
      // Log blocked execution
      this.auditLog.log({
        event: 'tool.execution.blocked',
        tool: toolName,
        sessionId: context.sessionId,
        agentId: context.agentId,
        tenantId: context.tenantId,
        args: toolCall.arguments,
        blockingPolicy: policyDecision.reason,
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        error: `Tool '${toolName}' not allowed: ${policyDecision.reason || 'blocked by policy'}`,
        metadata: {
          toolName,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 2. Log execution start
    this.auditLog.log({
      event: 'tool.execution.started',
      tool: toolName,
      sessionId: context.sessionId,
      agentId: context.agentId,
      tenantId: context.tenantId,
      args: toolCall.arguments,
      timestamp: new Date().toISOString(),
    });

    // 3. Route to remote executor if applicable
    const remoteExecutor = this.findRemoteExecutor(toolName, context);
    if (remoteExecutor) {
      try {
        const result = await remoteExecutor.execute(toolCall, context);

        // Log completion
        this.auditLog.log({
          event: result.success ? 'tool.execution.completed' : 'tool.execution.failed',
          tool: toolName,
          sessionId: context.sessionId,
          agentId: context.agentId,
          tenantId: context.tenantId,
          result: result.result,
          error: result.error,
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        });

        return {
          ...result,
          metadata: {
            executionTimeMs: Date.now() - startTime,
            toolName,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log failure
        this.auditLog.log({
          event: 'tool.execution.failed',
          tool: toolName,
          sessionId: context.sessionId,
          agentId: context.agentId,
          tenantId: context.tenantId,
          error: errorMessage,
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        });

        return {
          success: false,
          error: errorMessage,
          metadata: {
            executionTimeMs: Date.now() - startTime,
            toolName,
            timestamp: new Date().toISOString(),
          },
        };
      }
    }

    // 4. Get local tool
    const tool = this.tools.get(toolName);
    if (!tool) {
      const error = `Tool '${toolName}' not found`;

      // Log failure
      this.auditLog.log({
        event: 'tool.execution.failed',
        tool: toolName,
        sessionId: context.sessionId,
        agentId: context.agentId,
        tenantId: context.tenantId,
        error,
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        error,
        metadata: {
          toolName,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 5. Execute with timeout
    try {
      const timeout = tool.timeout || 60000;
      const result = await this.executeWithTimeout(tool, toolCall.arguments, context, timeout);

      // 6. Log success
      this.auditLog.log({
        event: 'tool.execution.completed',
        tool: toolName,
        sessionId: context.sessionId,
        agentId: context.agentId,
        tenantId: context.tenantId,
        result,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        result,
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolName,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 7. Log failure
      this.auditLog.log({
        event: 'tool.execution.failed',
        tool: toolName,
        sessionId: context.sessionId,
        agentId: context.agentId,
        tenantId: context.tenantId,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolName,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Execute a tool with timeout protection
   *
   * @param tool - Tool to execute
   * @param args - Tool arguments
   * @param context - Execution context
   * @param timeoutMs - Timeout in milliseconds
   * @returns Tool execution result
   */
  private async executeWithTimeout(
    tool: Tool,
    args: Record<string, unknown>,
    context: ToolContext,
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      tool.execute(args, context)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  // ============================================================================
  // Policy Checking
  // ============================================================================

  /**
   * Check policies for a tool call
   *
   * Evaluates all registered policies in priority order and returns
   * the most restrictive decision.
   *
   * @param toolName - Tool name
   * @param context - Execution context
   * @param args - Tool arguments
   * @returns Policy decision
   *
   * @example
   * ```typescript
   * const decision = interceptor.checkPolicy('bash', context, { command: 'ls' });
   * if (!decision.allowed) {
   *   console.log(`Blocked: ${decision.reason}`);
   * }
   * ```
   */
  checkPolicy(
    toolName: string,
    context: ToolContext,
    args?: Record<string, unknown>
  ): PolicyDecision {
    // Sort policies by priority (highest first)
    const sortedPolicies = [...this.policies].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    // Check each policy
    for (const policy of sortedPolicies) {
      if (policy.condition(toolName, context, args)) {
        const decision =
          typeof policy.decision === 'function'
            ? policy.decision(toolName, context, args)
            : policy.decision;

        // If policy denies, return immediately
        if (!decision.allowed) {
          return {
            ...decision,
            reason: decision.reason || `Blocked by policy: ${policy.name}`,
          };
        }

        // If policy requires approval, return that
        if (decision.requireApproval) {
          return decision;
        }
      }
    }

    // Return default policy
    return this.defaultPolicy;
  }

  /**
   * Add a policy to the interceptor
   *
   * @param policy - Policy to add
   *
   * @example
   * ```typescript
   * interceptor.addPolicy({
   *   name: 'custom_policy',
   *   condition: (tool) => tool === 'bash',
   *   decision: { allowed: true, requireApproval: true }
   * });
   * ```
   */
  addPolicy(policy: ToolPolicy): void {
    this.policies.push(policy);

    // Sort by priority
    this.policies.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    logger.debug('ToolInterceptor', `Added policy: ${policy.name}`);
  }

  /**
   * Remove a policy by name
   *
   * @param policyName - Name of the policy to remove
   * @returns True if policy was found and removed
   */
  removePolicy(policyName: string): boolean {
    const index = this.policies.findIndex((p) => p.name === policyName);
    if (index >= 0) {
      this.policies.splice(index, 1);
      logger.debug('ToolInterceptor', `Removed policy: ${policyName}`);
      return true;
    }
    return false;
  }

  /**
   * Set the default policy
   *
   * @param policy - Default policy decision
   */
  setDefaultPolicy(policy: PolicyDecision): void {
    this.defaultPolicy = policy;
  }

  // ============================================================================
  // Remote Executor Support
  // ============================================================================

  /**
   * Find a remote executor that can handle a tool
   *
   * @param toolName - Tool name
   * @param context - Execution context
   * @returns Remote executor or undefined
   */
  private findRemoteExecutor(
    toolName: string,
    context: ToolContext
  ): RemoteExecutor | undefined {
    for (const executor of this.remoteExecutors.values()) {
      if (executor.canHandle(toolName, context)) {
        return executor;
      }
    }
    return undefined;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get all registered tools
   *
   * @returns Array of registered tools
   */
  getRegisteredTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   *
   * @param toolName - Tool name
   * @returns Tool definition or undefined
   */
  getTool(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * List available tools filtered by policy
   *
   * Returns only tools that are allowed in the given context.
   *
   * @param context - Tool context for policy filtering
   * @returns Array of allowed tools
   */
  listAvailableTools(context: ToolContext): Tool[] {
    return this.getRegisteredTools().filter((tool) => {
      const decision = this.checkPolicy(tool.name, context);
      return decision.allowed;
    });
  }

  /**
   * Get all registered policies
   *
   * @returns Array of registered policies
   */
  getPolicies(): ToolPolicy[] {
    return [...this.policies];
  }

  /**
   * Get todos for a session
   *
   * @param sessionId - Session identifier
   * @returns Array of todos
   */
  getSessionTodos(sessionId: string): TodoItem[] {
    return this.sessionTodos.get(sessionId) || [];
  }

  /**
   * Set todos for a session
   *
   * @param sessionId - Session identifier
   * @param todos - Todo items
   */
  setSessionTodos(sessionId: string, todos: TodoItem[]): void {
    this.sessionTodos.set(sessionId, todos);
  }

  /**
   * Clear todos for a session
   *
   * @param sessionId - Session identifier
   */
  clearSessionTodos(sessionId: string): void {
    this.sessionTodos.delete(sessionId);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a ToolInterceptor with default tools and policies
 *
 * @param auditLog - Optional custom audit logger (defaults to DefaultAuditLogger)
 * @returns Configured ToolInterceptor
 *
 * @example
 * ```typescript
 * const interceptor = createDefaultToolInterceptor();
 *
 * // Ready to use with all built-in tools
 * const result = await interceptor.intercept(
 *   { name: 'read', arguments: { path: 'file.txt' } },
 *   { sessionId: 'sess-123', permissions: [] }
 * );
 * ```
 */
export function createDefaultToolInterceptor(auditLog?: AuditLogger): ToolInterceptor {
  const logger = auditLog || new DefaultAuditLogger();
  const interceptor = new ToolInterceptor(logger);

  // Register all built-in tools
  interceptor.registerTool(readTool);
  interceptor.registerTool(writeTool);
  interceptor.registerTool(editTool);
  interceptor.registerTool(bashTool);
  interceptor.registerTool(todoWriteTool);
  interceptor.registerTool(treeNavigateTool);

  return interceptor;
}

/**
 * Create a read-only tool interceptor
 *
 * Useful for scenarios where only read operations should be allowed.
 *
 * @param auditLog - Optional custom audit logger
 * @returns Configured ToolInterceptor in read-only mode
 */
export function createReadOnlyToolInterceptor(auditLog?: AuditLogger): ToolInterceptor {
  const logger = auditLog || new DefaultAuditLogger();

  // Start with default policies
  const policies: ToolPolicy[] = [
    ...DEFAULT_POLICIES,
    {
      name: 'read_only_override',
      priority: 1000,
      description: 'Override all policies to allow only read operations',
      condition: (toolName) =>
        !['read', 'tree_navigate'].includes(toolName),
      decision: {
        allowed: false,
        reason: 'Read-only mode - only read and tree_navigate tools allowed',
      },
    },
  ];

  const interceptor = new ToolInterceptor(logger, policies);

  // Register only read-safe tools
  interceptor.registerTool(readTool);
  interceptor.registerTool(treeNavigateTool);

  return interceptor;
}

// ============================================================================
// Kubernetes Remote Executor Example
// ============================================================================

/**
 * Kubernetes remote executor implementation
 *
 * Example of how to implement a remote executor for Kubernetes-based execution.
 * This is a reference implementation showing the pattern.
 *
 * @example
 * ```typescript
 * const k8sExecutor = createKubernetesExecutor('default', 'my-pod');
 * interceptor.registerRemoteExecutor(k8sExecutor);
 * ```
 */
export function createKubernetesExecutor(
  namespace: string,
  podName: string,
  container?: string
): RemoteExecutor {
  return {
    name: 'kubernetes',

    canHandle: (toolName) => {
      // This executor handles bash, read, and write tools
      return ['bash', 'read', 'write'].includes(toolName);
    },

    execute: async (toolCall, context) => {
      // In a real implementation, this would use the Kubernetes API
      // to execute commands in the specified pod
      logger.info('ToolInterceptor', `Executing ${toolCall.name} in K8s pod`, {
        namespace,
        podName,
        tool: toolCall.name,
      });

      // Placeholder implementation
      return {
        success: true,
        result: {
          message: `Executed ${toolCall.name} in ${namespace}/${podName}`,
          toolCall,
          context: {
            sessionId: context.sessionId,
            agentId: context.agentId,
          },
        },
      };
    },

    health: async () => {
      // In a real implementation, check pod health
      return {
        healthy: true,
        latencyMs: 0,
      };
    },
  };
}

// ============================================================================
// Export Built-in Tools Map for Convenience
// ============================================================================

/**
 * Map of all built-in tools by name
 */
export const BUILTIN_TOOLS: Record<string, Tool> = {
  read: readTool,
  write: writeTool,
  edit: editTool,
  bash: bashTool,
  todo_write: todoWriteTool,
  tree_navigate: treeNavigateTool,
};

/**
 * List of all built-in tool names
 */
export const BUILTIN_TOOL_NAMES = ['read', 'write', 'edit', 'bash', 'todo_write', 'tree_navigate'] as const;

/**
 * Type for built-in tool names
 */
export type BuiltInToolName = (typeof BUILTIN_TOOL_NAMES)[number];
