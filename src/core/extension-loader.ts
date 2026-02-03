/**
 * Extension Loader - Loads and manages TypeScript extensions with JIT compilation
 * 
 * Features:
 * - JIT TypeScript compilation using jiti
 * - Permission-based security sandbox
 * - Hot reloading
 * - Extension discovery from ~/.dash/extensions/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createJiti } from 'jiti';
import {
  ExtensionAPI,
  ExtensionFactory,
  LoadedExtension,
  LoadExtensionsResult,
  RegisteredTool,
  RegisteredCommand,
  EventHandler,
  ExtensionContext,
  Permission,
  SandboxConfig,
  DEFAULT_SANDBOX_CONFIG,
  HotReloadOptions,
  ToolDefinition,
  CommandDefinition,
  ToolContext,
} from './extension-api';

// Re-export TypeBox for extensions to use
export { Type } from '@sinclair/typebox';

// Re-export default sandbox config
export { DEFAULT_SANDBOX_CONFIG } from './extension-api';

// ============================================================================
// Constants
// ============================================================================

const EXTENSIONS_DIR = path.join(os.homedir(), '.dash', 'extensions');
const DEFAULT_HOT_RELOAD_OPTIONS: HotReloadOptions = {
  enabled: true,
  debounceMs: 500,
  patterns: ['**/*.ts', '**/*.js'],
};

// ============================================================================
// Permission Checker
// ============================================================================

/**
 * Check if a permission matches a pattern
 * e.g., 'fs:read' matches 'fs:*' and 'fs:read'
 */
function matchesPermission(permission: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (permission === pattern) return true;
  
  // Handle wildcards like 'fs:*'
  if (pattern.endsWith(':*')) {
    const resource = pattern.slice(0, -2);
    return permission.startsWith(`${resource}:`);
  }
  
  return false;
}

/**
 * Permission manager for sandboxed execution
 */
export class PermissionManager {
  private permissions: Set<string> = new Set();
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
    this.config.permissions.forEach(p => this.permissions.add(p));
  }

  /**
   * Check if a permission is granted
   */
  hasPermission(permission: string): boolean {
    for (const granted of this.permissions) {
      if (matchesPermission(permission, granted)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Grant a permission
   */
  grantPermission(permission: string): void {
    this.permissions.add(permission);
  }

  /**
   * Revoke a permission
   */
  revokePermission(permission: string): void {
    this.permissions.delete(permission);
  }

  /**
   * Check if path is allowed for operation
   */
  isPathAllowed(targetPath: string, operation: 'read' | 'write'): boolean {
    const normalizedPath = path.normalize(targetPath);
    const expandedPath = normalizedPath.startsWith('~')
      ? path.join(os.homedir(), normalizedPath.slice(1))
      : normalizedPath;

    // Check blocked paths
    for (const blocked of this.config.blockedPaths) {
      const expandedBlocked = blocked.startsWith('~')
        ? path.join(os.homedir(), blocked.slice(1))
        : blocked;
      if (expandedPath.startsWith(expandedBlocked)) {
        return false;
      }
    }

    // Check permissions
    const perm = operation === 'read' ? 'fs:read' : 'fs:write';
    return this.hasPermission(perm);
  }

  /**
   * Check if network host is allowed
   */
  isHostAllowed(host: string): boolean {
    if (this.config.allowedHosts.includes('*')) return true;
    return this.config.allowedHosts.includes(host);
  }
}

// ============================================================================
// Sandbox Proxy
// ============================================================================

/**
 * Creates a sandboxed proxy for extension API
 */
function createSandboxedAPI(
  extension: LoadedExtension,
  permissionManager: PermissionManager,
  baseAPI: ExtensionAPI
): ExtensionAPI {
  return {
    on: baseAPI.on,
    
    registerTool: (tool: ToolDefinition) => {
      // Wrap tool execution with permission checks
      const wrappedTool: ToolDefinition = {
        ...tool,
        execute: async (toolCallId, params, ctx, onUpdate) => {
          // Check tool-specific permissions
          if (tool.permissions) {
            for (const perm of tool.permissions) {
              if (!permissionManager.hasPermission(perm)) {
                return {
                  content: `Permission denied: ${perm}`,
                  isError: true,
                  details: { missingPermission: perm },
                };
              }
            }
          }
          
          // Create sandboxed context
          const sandboxedCtx: ToolContext = {
            ...ctx,
            hasPermission: (perm) => permissionManager.hasPermission(perm),
          };
          
          return tool.execute(toolCallId, params, sandboxedCtx, onUpdate);
        },
      };
      
      baseAPI.registerTool(wrappedTool as any);
    },
    
    registerCommand: baseAPI.registerCommand,
    
    log: baseAPI.log,
    getConfig: baseAPI.getConfig,
    setConfig: baseAPI.setConfig,
  };
}

// ============================================================================
// JIT Compilation
// ============================================================================

/**
 * Create jiti instance for TypeScript compilation
 */
function createJITI(_cwd: string) {
  // Always resolve from project root to find node_modules
  const projectRoot = process.cwd();
  
  return createJiti(projectRoot, {
    moduleCache: false,
    requireCache: false,
    interopDefault: true,
    // Allow requiring from node_modules
    tryNative: true,
    alias: {
      '@dash/core': path.resolve(projectRoot, 'src/core'),
      '@dash/api': path.resolve(projectRoot, 'src/api'),
    },
  });
}

/**
 * Load a single extension module using JIT compilation
 */
async function loadExtensionModule(
  extensionPath: string,
  cwd: string
): Promise<ExtensionFactory | null> {
  const jiti = createJITI(cwd);
  
  try {
    const module = await jiti.import(extensionPath, { default: true });
    const factory = module as ExtensionFactory;
    
    if (typeof factory !== 'function') {
      return null;
    }
    
    return factory;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JIT compilation failed: ${message}`);
  }
}

// ============================================================================
// Extension Loading
// ============================================================================

/**
 * Create a new empty extension object
 */
function createExtension(extensionPath: string, resolvedPath: string): LoadedExtension {
  const name = path.basename(extensionPath, path.extname(extensionPath));
  
  return {
    path: extensionPath,
    resolvedPath,
    name,
    handlers: new Map(),
    tools: new Map(),
    commands: new Map(),
    permissions: [],
  };
}

/**
 * Resolve extension path (handle ~ expansion)
 */
function resolveExtensionPath(extPath: string, cwd: string): string {
  let normalized = extPath;
  
  // Expand ~ to home directory
  if (normalized.startsWith('~/')) {
    normalized = path.join(os.homedir(), normalized.slice(2));
  } else if (normalized.startsWith('~')) {
    normalized = path.join(os.homedir(), normalized.slice(1));
  }
  
  // Resolve relative paths
  if (!path.isAbsolute(normalized)) {
    normalized = path.resolve(cwd, normalized);
  }
  
  return normalized;
}

/**
 * Discover extensions in a directory
 */
function discoverExtensionsInDir(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const discovered: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      
      // Direct .ts or .js files
      if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        // Skip test files and type definitions
        if (!entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
          discovered.push(entryPath);
        }
        continue;
      }
      
      // Subdirectories with index.ts or index.js
      if (entry.isDirectory()) {
        const indexTs = path.join(entryPath, 'index.ts');
        const indexJs = path.join(entryPath, 'index.js');
        
        if (fs.existsSync(indexTs)) {
          discovered.push(indexTs);
        } else if (fs.existsSync(indexJs)) {
          discovered.push(indexJs);
        }
      }
    }
  } catch {
    // Return empty if we can't read the directory
    return [];
  }
  
  return discovered;
}

// ============================================================================
// ExtensionAPI Implementation
// ============================================================================

/**
 * Create ExtensionAPI for an extension
 */
function createExtensionAPI(
  extension: LoadedExtension,
  allTools: Map<string, RegisteredTool>,
  allCommands: Map<string, RegisteredCommand>,
  config: Map<string, unknown>
): ExtensionAPI {
  const api = {
    on: (event: string, handler: EventHandler): void => {
      const list = extension.handlers.get(event) ?? [];
      list.push(handler);
      extension.handlers.set(event, list);
    },
    
    registerTool: (tool: ToolDefinition): void => {
      const registeredTool: RegisteredTool = {
        definition: tool,
        extensionPath: extension.resolvedPath,
        extensionName: extension.name,
      };
      
      extension.tools.set(tool.name, registeredTool);
      allTools.set(tool.name, registeredTool);
    },
    
    registerCommand: (name: string, command: CommandDefinition): void => {
      const registeredCommand: RegisteredCommand = {
        definition: { ...command, name },
        extensionPath: extension.resolvedPath,
        extensionName: extension.name,
      };
      
      extension.commands.set(name, registeredCommand);
      allCommands.set(name, registeredCommand);
    },
    
    log: (level: 'info' | 'warn' | 'error' | 'debug', message: string): void => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${extension.name}] [${level.toUpperCase()}] ${message}`);
    },
    
    getConfig: <T>(key: string, defaultValue?: T): T => {
      const fullKey = `${extension.name}.${key}`;
      return (config.get(fullKey) as T) ?? defaultValue!;
    },
    
    setConfig: <T>(key: string, value: T): void => {
      const fullKey = `${extension.name}.${key}`;
      config.set(fullKey, value);
    },
  };
  
  return api as ExtensionAPI;
}

// ============================================================================
// Main Loader
// ============================================================================

export interface ExtensionLoaderOptions {
  /** Additional extension paths to load */
  paths?: string[];
  /** Working directory for relative paths */
  cwd?: string;
  /** Enable/disable hot reloading */
  hotReload?: HotReloadOptions | boolean;
  /** Sandbox configuration */
  sandbox?: Partial<SandboxConfig>;
  /** Extension configuration store */
  config?: Map<string, unknown>;
}

/**
 * Internal options with normalized types
 */
interface InternalLoaderOptions {
  paths: string[];
  cwd: string;
  hotReload: HotReloadOptions;
  sandbox: Partial<SandboxConfig>;
  config: Map<string, unknown>;
}

/**
 * Extension loader class
 */
export class ExtensionLoader {
  private options: InternalLoaderOptions;
  private extensions: LoadedExtension[] = [];
  private tools: Map<string, RegisteredTool> = new Map();
  private commands: Map<string, RegisteredCommand> = new Map();
  private permissionManager: PermissionManager;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private reloadTimers: Map<string, NodeJS.Timeout> = new Map();
  private extensionContext: ExtensionContext;
  private onReloadCallbacks: Array<(result: LoadExtensionsResult) => void> = [];

  constructor(options: ExtensionLoaderOptions = {}) {
    const hotReloadOptions: HotReloadOptions = typeof options.hotReload === 'boolean'
      ? (options.hotReload ? DEFAULT_HOT_RELOAD_OPTIONS : { enabled: false, debounceMs: 500, patterns: [] })
      : { ...DEFAULT_HOT_RELOAD_OPTIONS, ...(options.hotReload ?? {}) };
    
    this.options = {
      paths: options.paths ?? [],
      cwd: options.cwd ?? process.cwd(),
      hotReload: hotReloadOptions,
      sandbox: options.sandbox ?? {},
      config: options.config ?? new Map(),
    };
    
    this.permissionManager = new PermissionManager(this.options.sandbox);
    
    // Ensure extensions directory exists
    if (!fs.existsSync(EXTENSIONS_DIR)) {
      fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
    }
    
    this.extensionContext = {
      version: '2.0.0',
      extensionDir: EXTENSIONS_DIR,
      isDev: process.env['NODE_ENV'] === 'development',
    };
  }

  /**
   * Load all extensions from configured paths
   */
  async load(): Promise<LoadExtensionsResult> {
    // Clean up existing watchers
    this.cleanup();
    
    // Collect all extension paths
    const allPaths: string[] = [];
    const seen = new Set<string>();
    
    const addPath = (p: string) => {
      const resolved = resolveExtensionPath(p, this.options.cwd);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        allPaths.push(resolved);
      }
    };
    
    // 1. Global extensions: ~/.dash/extensions/
    if (fs.existsSync(EXTENSIONS_DIR)) {
      discoverExtensionsInDir(EXTENSIONS_DIR).forEach(addPath);
    }
    
    // 2. Project-local extensions: ./.dash/extensions/
    const localExtDir = path.join(this.options.cwd, '.dash', 'extensions');
    if (fs.existsSync(localExtDir)) {
      discoverExtensionsInDir(localExtDir).forEach(addPath);
    }
    
    // 3. Explicitly configured paths
    for (const p of this.options.paths) {
      const resolved = resolveExtensionPath(p, this.options.cwd);
      
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        // Discover extensions in directory
        discoverExtensionsInDir(resolved).forEach(addPath);
      } else {
        addPath(p);
      }
    }
    
    // Load each extension
    const errors: Array<{ path: string; error: string }> = [];
    
    for (const extPath of allPaths) {
      try {
        const extension = await this.loadSingleExtension(extPath);
        if (extension) {
          this.extensions.push(extension);
          
          // Set up hot reload watcher
          if (this.options.hotReload.enabled) {
            this.setupWatcher(extPath);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ path: extPath, error: message });
      }
    }
    
    const result: LoadExtensionsResult = {
      extensions: this.extensions,
      errors,
      tools: this.tools,
      commands: this.commands,
    };
    
    return result;
  }

  /**
   * Load a single extension
   */
  private async loadSingleExtension(extPath: string): Promise<LoadedExtension | null> {
    // Check if file exists
    if (!fs.existsSync(extPath)) {
      throw new Error(`Extension file not found: ${extPath}`);
    }
    
    const resolvedPath = path.resolve(extPath);
    const extension = createExtension(extPath, resolvedPath);
    
    // Create API for this extension
    const api = createExtensionAPI(extension, this.tools, this.commands, this.options.config);
    
    // Apply sandbox if configured
    const sandboxedAPI = this.options.sandbox 
      ? createSandboxedAPI(extension, this.permissionManager, api)
      : api;
    
    // Load and execute the extension factory
    const factory = await loadExtensionModule(resolvedPath, this.options.cwd);
    
    if (!factory) {
      throw new Error(`Extension does not export a valid factory function`);
    }
    
    await factory(sandboxedAPI, this.extensionContext);
    
    return extension;
  }

  /**
   * Set up file watcher for hot reload
   */
  private setupWatcher(extPath: string): void {
    if (this.watchers.has(extPath)) {
      return;
    }
    
    const watcher = fs.watch(extPath, (eventType) => {
      if (eventType === 'change') {
        this.scheduleReload(extPath);
      }
    });
    
    this.watchers.set(extPath, watcher);
  }

  /**
   * Schedule a reload with debouncing
   */
  private scheduleReload(extPath: string): void {
    // Clear existing timer
    const existingTimer = this.reloadTimers.get(extPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      this.reloadExtension(extPath);
    }, this.options.hotReload.debounceMs);
    
    this.reloadTimers.set(extPath, timer);
  }

  /**
   * Reload a single extension
   */
  private async reloadExtension(extPath: string): Promise<void> {
    console.log(`🔄 Reloading extension: ${path.basename(extPath)}`);
    
    // Find and remove old extension
    const index = this.extensions.findIndex(e => e.resolvedPath === extPath);
    if (index >= 0) {
      const oldExtension = this.extensions[index];
      
      // Remove old tools
      for (const toolName of oldExtension.tools.keys()) {
        this.tools.delete(toolName);
      }
      
      // Remove old commands
      for (const cmdName of oldExtension.commands.keys()) {
        this.commands.delete(cmdName);
      }
      
      // Remove from list
      this.extensions.splice(index, 1);
    }
    
    // Reload the extension
    try {
      const extension = await this.loadSingleExtension(extPath);
      if (extension) {
        this.extensions.push(extension);
        console.log(`✅ Reloaded extension: ${extension.name}`);
      }
      
      // Notify listeners
      this.notifyReloadListeners();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to reload extension: ${message}`);
    }
  }

  /**
   * Notify all reload listeners
   */
  private notifyReloadListeners(): void {
    const result: LoadExtensionsResult = {
      extensions: this.extensions,
      errors: [],
      tools: this.tools,
      commands: this.commands,
    };
    
    for (const callback of this.onReloadCallbacks) {
      try {
        callback(result);
      } catch (error) {
        console.error('Error in reload callback:', error);
      }
    }
  }

  /**
   * Register a callback for reload events
   */
  onReload(callback: (result: LoadExtensionsResult) => void): () => void {
    this.onReloadCallbacks.push(callback);
    
    return () => {
      const index = this.onReloadCallbacks.indexOf(callback);
      if (index >= 0) {
        this.onReloadCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get all loaded extensions
   */
  getExtensions(): LoadedExtension[] {
    return [...this.extensions];
  }

  /**
   * Get all registered tools
   */
  getTools(): Map<string, RegisteredTool> {
    return new Map(this.tools);
  }

  /**
   * Get all registered commands
   */
  getCommands(): Map<string, RegisteredCommand> {
    return new Map(this.commands);
  }

  /**
   * Get a specific tool
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get a specific command
   */
  getCommand(name: string): RegisteredCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Emit an event to all registered handlers
   */
  async emitEvent(event: { type: string; [key: string]: unknown }): Promise<void> {
    for (const extension of this.extensions) {
      const handlers = extension.handlers.get(event.type);
      if (!handlers) continue;
      
      for (const handler of handlers) {
        try {
          await handler(event as Parameters<EventHandler>[0], this.extensionContext);
        } catch (error) {
          console.error(`Error in extension ${extension.name} handler:`, error);
        }
      }
    }
  }

  /**
   * Clean up watchers and timers
   */
  cleanup(): void {
    // Clear timers
    for (const timer of this.reloadTimers.values()) {
      clearTimeout(timer);
    }
    this.reloadTimers.clear();
    
    // Close watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    
    // Clear extensions
    this.extensions = [];
    this.tools.clear();
    this.commands.clear();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Load extensions from paths (convenience function)
 */
export async function loadExtensions(
  options: ExtensionLoaderOptions = {}
): Promise<LoadExtensionsResult> {
  const loader = new ExtensionLoader(options);
  return loader.load();
}

/**
 * Get the default extensions directory path
 */
export function getExtensionsDir(): string {
  return EXTENSIONS_DIR;
}
