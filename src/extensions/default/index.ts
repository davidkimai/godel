/**
 * Default Dash Extension
 * 
 * Provides built-in tools that are always available:
 * - read: Read file contents
 * - write: Write content to files
 * - edit: Edit existing files
 * - bash: Execute shell commands
 * - grep: Search file contents
 * - find: Find files by pattern
 * 
 * These tools form the foundation of Dash agent capabilities.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { exec, execFile } from 'node:child_process';
import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext } from '../../core/extension-api';

const execAsync = promisify(exec);

export default function defaultExtension(api: ExtensionAPI, ctx: ExtensionContext) {
  
  // ========================================================================
  // Helper Functions
  // ========================================================================
  
  /**
   * Resolve path with ~ expansion
   */
  function resolvePath(inputPath: string): string {
    if (inputPath.startsWith('~/')) {
      return path.join(process.env['HOME'] || '/', inputPath.slice(2));
    }
    return path.resolve(inputPath);
  }
  
  /**
   * Check if path is within allowed directories
   */
  function isPathAllowed(targetPath: string, requireWrite = false): boolean {
    // Default extension has full fs access
    // Extensions should use the permission system for sandboxing
    return true;
  }
  
  /**
   * Read file with safety checks
   */
  async function safeReadFile(filePath: string, limit?: number): Promise<string> {
    const resolved = resolvePath(filePath);
    
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const stats = fs.statSync(resolved);
    
    if (stats.isDirectory()) {
      throw new Error(`Cannot read directory: ${filePath}`);
    }
    
    // Read file
    let content = fs.readFileSync(resolved, 'utf-8');
    
    // Apply limit if specified
    if (limit && content.length > limit) {
      content = content.slice(0, limit) + `\n\n[... truncated at ${limit} characters]`;
    }
    
    return content;
  }
  
  // ========================================================================
  // read Tool
  // ========================================================================
  
  api.registerTool({
    name: 'read',
    description: 'Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.',
    parameters: Type.Object({
      path: Type.String({ description: 'Path to the file to read (relative or absolute)' }),
      file_path: Type.Optional(Type.String({ description: 'Path to the file (alias for path)' })),
      limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to read' })),
      offset: Type.Optional(Type.Number({ description: 'Line number to start reading from (1-indexed)' })),
    }),
    permissions: ['fs:read'],
    async execute(toolCallId, params, ctx) {
      try {
        const filePath = params.path || params.file_path;
        if (!filePath) {
          return {
            content: 'Error: path is required',
            isError: true,
          };
        }
        
        const content = await safeReadFile(filePath, params.limit);
        
        return {
          content,
          isError: false,
          details: { path: filePath, size: content.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Error reading file: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // ========================================================================
  // write Tool
  // ========================================================================
  
  api.registerTool({
    name: 'write',
    description: 'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does. Automatically creates parent directories.',
    parameters: Type.Object({
      path: Type.String({ description: 'Path to the file to write' }),
      content: Type.String({ description: 'Content to write to the file' }),
    }),
    permissions: ['fs:write'],
    async execute(toolCallId, params, ctx) {
      try {
        const resolved = resolvePath(params.path);
        
        // Create parent directories
        const parentDir = path.dirname(resolved);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        
        // Write file
        fs.writeFileSync(resolved, params.content, 'utf-8');
        
        return {
          content: `Successfully wrote ${params.content.length} characters to ${params.path}`,
          isError: false,
          details: { path: params.path, bytesWritten: params.content.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Error writing file: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // ========================================================================
  // edit Tool
  // ========================================================================
  
  api.registerTool({
    name: 'edit',
    description: 'Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.',
    parameters: Type.Object({
      path: Type.String({ description: 'Path to the file to edit' }),
      oldString: Type.String({ description: 'Exact text to find and replace' }),
      newString: Type.String({ description: 'New text to replace the old text with' }),
      oldText: Type.Optional(Type.String({ description: 'Alias for oldString' })),
      newText: Type.Optional(Type.String({ description: 'Alias for newString' })),
    }),
    permissions: ['fs:write'],
    async execute(toolCallId, params, ctx) {
      try {
        const filePath = params.path;
        const oldText = params.oldString || params.oldText;
        const newText = params.newString || params.newText;
        
        if (!filePath || oldText === undefined || newText === undefined) {
          return {
            content: 'Error: path, oldString/oldText, and newString/newText are required',
            isError: true,
          };
        }
        
        const resolved = resolvePath(filePath);
        
        if (!fs.existsSync(resolved)) {
          return {
            content: `File not found: ${filePath}`,
            isError: true,
          };
        }
        
        let content = fs.readFileSync(resolved, 'utf-8');
        
        if (!content.includes(oldText)) {
          return {
            content: `Could not find the specified text in ${filePath}`,
            isError: true,
          };
        }
        
        // Replace all occurrences
        const newContent = content.split(oldText).join(newText);
        fs.writeFileSync(resolved, newContent, 'utf-8');
        
        const occurrences = (content.match(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        
        return {
          content: `Successfully edited ${filePath} (${occurrences} replacement${occurrences !== 1 ? 's' : ''})`,
          isError: false,
          details: { path: filePath, replacements: occurrences },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Error editing file: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // ========================================================================
  // bash Tool
  // ========================================================================
  
  api.registerTool({
    name: 'bash',
    description: 'Execute shell commands with background continuation. Use yieldMs/background for long-running commands. Use pty=true for TTY-required commands (terminal UIs, coding agents).',
    parameters: Type.Object({
      command: Type.String({ description: 'Shell command to execute' }),
      args: Type.Optional(Type.Array(Type.String(), { description: 'Command arguments' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' })),
      timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds' })),
      env: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Environment variables' })),
    }),
    permissions: ['exec:write'],
    async execute(toolCallId, params, ctx) {
      const { command, args, cwd, timeout, env } = params;
      
      // Build command string
      let cmd = command;
      if (args && args.length > 0) {
        cmd += ' ' + args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ');
      }
      
      try {
        const options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {};
        if (cwd) options.cwd = resolvePath(cwd);
        if (timeout) options.timeout = timeout * 1000;
        if (env) options.env = { ...process.env, ...env };
        
        api.log('debug', `Executing: ${cmd}`);
        
        const { stdout, stderr } = await execAsync(cmd, options);
        
        const output = stdout + (stderr ? `\nstderr: ${stderr}` : '');
        
        return {
          content: output || '(command executed successfully with no output)',
          isError: false,
          details: { command: cmd, exitCode: 0 },
        };
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string; message: string; code?: number; cmd?: string };
        const output = (execError.stdout || '') + (execError.stderr ? `\nstderr: ${execError.stderr}` : '');
        
        return {
          content: `Command failed (exit ${execError.code ?? 1}): ${output || execError.message}`,
          isError: true,
          details: { command: execError.cmd || cmd, exitCode: execError.code ?? 1 },
        };
      }
    },
  });
  
  // ========================================================================
  // grep Tool
  // ========================================================================
  
  api.registerTool({
    name: 'grep',
    description: 'Search file contents using patterns (grep/ripgrep style)',
    parameters: Type.Object({
      query: Type.String({ description: 'Search pattern' }),
      path: Type.Optional(Type.String({ description: 'Path to search in (file or directory)' })),
      include: Type.Optional(Type.String({ description: 'File pattern to include (e.g., "*.ts")' })),
      ignoreCase: Type.Optional(Type.Boolean({ description: 'Case-insensitive search', default: false })),
      maxResults: Type.Optional(Type.Number({ description: 'Maximum number of results', default: 50 })),
    }),
    permissions: ['fs:read', 'exec:read'],
    async execute(toolCallId, params, ctx) {
      try {
        const { query, path: searchPath = '.', include, ignoreCase, maxResults = 50 } = params;
        
        // Try ripgrep first, fall back to grep
        let cmd = 'rg';
        const rgArgs: string[] = [];
        
        // Build ripgrep command
        if (ignoreCase) rgArgs.push('-i');
        rgArgs.push('--line-number');
        rgArgs.push('--max-count', String(maxResults));
        if (include) rgArgs.push('--glob', include);
        rgArgs.push(query);
        rgArgs.push(searchPath);
        
        try {
          const { stdout } = await execAsync(`${cmd} ${rgArgs.join(' ')}`, { cwd: process.cwd() });
          
          return {
            content: stdout || 'No matches found',
            isError: false,
            details: { query, path: searchPath, matches: stdout.split('\n').filter(l => l).length },
          };
        } catch {
          // Fall back to grep if ripgrep not available
          const grepArgs = ['-rn'];
          if (ignoreCase) grepArgs.push('-i');
          if (include) grepArgs.push('--include', include);
          grepArgs.push(query);
          grepArgs.push(searchPath);
          
          try {
            const { stdout } = await execAsync(`grep ${grepArgs.join(' ')}`, { cwd: process.cwd() });
            
            return {
              content: stdout || 'No matches found',
              isError: false,
              details: { query, path: searchPath, matches: stdout.split('\n').filter(l => l).length },
            };
          } catch (grepError) {
            return {
              content: 'No matches found',
              isError: false,
              details: { query, path: searchPath, matches: 0 },
            };
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Search error: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // ========================================================================
  // find Tool
  // ========================================================================
  
  api.registerTool({
    name: 'find',
    description: 'Find files by name pattern',
    parameters: Type.Object({
      pattern: Type.String({ description: 'File name pattern (supports wildcards)' }),
      path: Type.Optional(Type.String({ description: 'Directory to search in', default: '.' })),
      type: Type.Optional(Type.Union([Type.Literal('file'), Type.Literal('directory')], { 
        description: 'Find only files or directories' 
      })),
      maxResults: Type.Optional(Type.Number({ description: 'Maximum number of results', default: 100 })),
    }),
    permissions: ['fs:read', 'exec:read'],
    async execute(toolCallId, params, ctx) {
      try {
        const { pattern, path: searchPath = '.', type, maxResults = 100 } = params;
        
        // Use find command
        const findArgs: string[] = [resolvePath(searchPath), '-name', pattern];
        
        if (type === 'file') {
          findArgs.push('-type', 'f');
        } else if (type === 'directory') {
          findArgs.push('-type', 'd');
        }
        
        findArgs.push('-maxdepth', '10');
        
        const { stdout } = await execAsync(`find ${findArgs.join(' ')} 2>/dev/null | head -n ${maxResults}`);
        
        const results = stdout.split('\n').filter(l => l);
        
        if (results.length === 0) {
          return {
            content: `No files found matching "${pattern}"`,
            isError: false,
            details: { pattern, path: searchPath, count: 0 },
          };
        }
        
        return {
          content: results.join('\n'),
          isError: false,
          details: { pattern, path: searchPath, count: results.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Find error: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // ========================================================================
  // ls Tool (Bonus)
  // ========================================================================
  
  api.registerTool({
    name: 'ls',
    description: 'List directory contents',
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: 'Directory path', default: '.' })),
      showHidden: Type.Optional(Type.Boolean({ description: 'Show hidden files', default: false })),
    }),
    permissions: ['fs:read'],
    async execute(toolCallId, params, ctx) {
      try {
        const dirPath = resolvePath(params.path || '.');
        
        if (!fs.existsSync(dirPath)) {
          return {
            content: `Directory not found: ${params.path}`,
            isError: true,
          };
        }
        
        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
          return {
            content: `Not a directory: ${params.path}`,
            isError: true,
          };
        }
        
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        const lines = entries
          .filter(e => params.showHidden || !e.name.startsWith('.'))
          .map(e => {
            const prefix = e.isDirectory() ? 'd ' : 'f ';
            return `${prefix}${e.name}`;
          })
          .sort();
        
        return {
          content: lines.join('\n') || '(empty directory)',
          isError: false,
          details: { path: dirPath, count: entries.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Error listing directory: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // ========================================================================
  // Event Handlers
  // ========================================================================
  
  api.on('agent_start', async (event) => {
    api.log('debug', `Agent ${event.agentId} started task: ${event.task.slice(0, 50)}...`);
  });
  
  api.on('agent_complete', async (event) => {
    api.log('debug', `Agent ${event.agentId} completed in ${event.duration}ms`);
  });
  
  api.log('info', 'Default extension loaded with built-in tools: read, write, edit, bash, grep, find, ls');
}
