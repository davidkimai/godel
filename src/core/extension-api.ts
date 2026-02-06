/**
 * Extension API types and interfaces for Godel
 * 
 * Based on pi-mono's extension architecture, adapted for Godel's swarm orchestration.
 */

import { Static, TSchema } from '@sinclair/typebox';

// ============================================================================
// Event Types
// ============================================================================

/** Base event interface */
export interface ExtensionEvent {
  type: string;
  timestamp?: number;
}

/** Agent lifecycle events */
export interface AgentStartEvent extends ExtensionEvent {
  type: 'agent_start';
  agentId: string;
  task: string;
  swarmId?: string;
}

export interface AgentCompleteEvent extends ExtensionEvent {
  type: 'agent_complete';
  agentId: string;
  result: unknown;
  duration: number;
  cost?: number;
}

export interface AgentErrorEvent extends ExtensionEvent {
  type: 'agent_error';
  agentId: string;
  error: string;
}

/** Swarm lifecycle events */
export interface SwarmStartEvent extends ExtensionEvent {
  type: 'swarm_start';
  swarmId: string;
  name: string;
  task: string;
  agentCount: number;
}

export interface SwarmCompleteEvent extends ExtensionEvent {
  type: 'swarm_complete';
  swarmId: string;
  results: unknown[];
  totalCost?: number;
}

/** Tool execution events */
export interface ToolCallEvent extends ExtensionEvent {
  type: 'tool_call';
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  agentId?: string;
}

export interface ToolResultEvent extends ExtensionEvent {
  type: 'tool_result';
  toolName: string;
  toolCallId: string;
  result: unknown;
  duration: number;
  error?: string;
}

/** Command events */
export interface CommandExecuteEvent extends ExtensionEvent {
  type: 'command_execute';
  command: string;
  args: string[];
}

/** Union of all extension events */
export type GodelExtensionEvent =
  | AgentStartEvent
  | AgentCompleteEvent
  | AgentErrorEvent
  | SwarmStartEvent
  | SwarmCompleteEvent
  | ToolCallEvent
  | ToolResultEvent
  | CommandExecuteEvent;

// ============================================================================
// Tool Types
// ============================================================================

/** Tool execution context passed to tools */
export interface ToolContext {
  /** Agent ID executing the tool */
  agentId?: string;
  /** Swarm ID if running in a swarm */
  swarmId?: string;
  /** Current working directory */
  cwd: string;
  /** Signal for cancellation */
  signal?: AbortSignal;
  /** Permission verifier */
  hasPermission: (permission: string) => boolean;
}

/** Tool result */
export interface ToolResult<TDetails = unknown> {
  /** Result content */
  content: string;
  /** Whether the result is an error */
  isError: boolean;
  /** Optional structured details */
  details?: TDetails;
}

/** Tool update callback for streaming results */
export type ToolUpdateCallback<TDetails = unknown> = (
  update: Partial<ToolResult<TDetails>>
) => void;

/** Tool definition */
export interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown> {
  /** Tool name (used in LLM tool calls) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Parameter schema using TypeBox */
  parameters: TParams;
  /** Required permissions for this tool */
  permissions?: string[];
  /** Execute the tool */
  execute: (
    toolCallId: string,
    params: Static<TParams>,
    ctx: ToolContext,
    onUpdate?: ToolUpdateCallback<TDetails>
  ) => Promise<ToolResult<TDetails> | { content: string; isError: true; details?: unknown }>;
}

// ============================================================================
// Command Types
// ============================================================================

/** Command handler context */
export interface CommandContext {
  /** Current working directory */
  cwd: string;
  /** Logger instance */
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    debug: (message: string) => void;
  };
  /** Execute a shell command */
  exec: (command: string, args?: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /** Spawn an agent */
  spawnAgent: (task: string, options?: { model?: string }) => Promise<unknown>;
  /** Send notification */
  notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
}

/** Command definition */
export interface CommandDefinition {
  /** Command name (e.g., 'deploy', 'notify') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Argument pattern for help text */
  args?: string;
  /** Command handler */
  handler: (args: string, ctx: CommandContext) => Promise<void>;
  /** Auto-complete suggestions */
  getCompletions?: (argPrefix: string) => string[];
}

// ============================================================================
// Extension Context
// ============================================================================

/** Context passed to extension factory function */
export interface ExtensionContext {
  /** Godel version */
  version: string;
  /** Extension directory path */
  extensionDir: string;
  /** Whether running in development mode */
  isDev: boolean;
}

// ============================================================================
// Permission Types
// ============================================================================

/** Permission string format: 'resource:action' or 'resource:*' */
export type Permission = 
  | 'fs:read'
  | 'fs:write'
  | 'fs:*'
  | 'net:read'
  | 'net:write'
  | 'net:*'
  | 'exec:read'
  | 'exec:write'
  | 'exec:*'
  | 'agent:read'
  | 'agent:write'
  | 'agent:*'
  | string; // Allow custom permissions

/** Permission descriptor for extensions */
export interface PermissionDescriptor {
  /** Permission pattern */
  pattern: string;
  /** Whether to allow by default */
  default?: boolean;
  /** Description of what this permission allows */
  description?: string;
}

// ============================================================================
// Extension API Interface
// ============================================================================

/** Event handler type */
export type EventHandler<E extends ExtensionEvent = ExtensionEvent> = (
  event: E,
  ctx: ExtensionContext
) => Promise<void | { cancel?: boolean }> | void | { cancel?: boolean };

/** Extension API interface passed to extension factory functions */
export interface ExtensionAPI {
  // ========================================================================
  // Event Subscription
  // ========================================================================
  
  /** Subscribe to agent start events */
  on(event: 'agent_start', handler: EventHandler<AgentStartEvent>): void;
  /** Subscribe to agent complete events */
  on(event: 'agent_complete', handler: EventHandler<AgentCompleteEvent>): void;
  /** Subscribe to agent error events */
  on(event: 'agent_error', handler: EventHandler<AgentErrorEvent>): void;
  /** Subscribe to swarm start events */
  on(event: 'swarm_start', handler: EventHandler<SwarmStartEvent>): void;
  /** Subscribe to swarm complete events */
  on(event: 'swarm_complete', handler: EventHandler<SwarmCompleteEvent>): void;
  /** Subscribe to tool call events */
  on(event: 'tool_call', handler: EventHandler<ToolCallEvent>): void;
  /** Subscribe to tool result events */
  on(event: 'tool_result', handler: EventHandler<ToolResultEvent>): void;
  /** Subscribe to command execute events */
  on(event: 'command_execute', handler: EventHandler<CommandExecuteEvent>): void;
  /** Subscribe to any event with wildcard */
  on(event: string, handler: EventHandler): void;

  // ========================================================================
  // Tool Registration
  // ========================================================================
  
  /**
   * Register a custom tool
   * @param tool Tool definition
   */
  registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(
    tool: ToolDefinition<TParams, TDetails>
  ): void;

  // ========================================================================
  // Command Registration
  // ========================================================================
  
  /**
   * Register a custom CLI command
   * @param name Command name (e.g., 'deploy')
   * @param command Command definition
   */
  registerCommand(name: string, command: CommandDefinition): void;

  // ========================================================================
  // Utility Methods
  // ========================================================================
  
  /** Log a message */
  log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void;
  
  /** Get extension configuration */
  getConfig<T = unknown>(key: string, defaultValue?: T): T;
  
  /** Set extension configuration */
  setConfig<T = unknown>(key: string, value: T): void;
}

// ============================================================================
// Extension Factory
// ============================================================================

/** Extension factory function type */
export type ExtensionFactory = (api: ExtensionAPI, ctx: ExtensionContext) => void | Promise<void>;

// ============================================================================
// Registered Extension Types
// ============================================================================

/** Internal representation of a registered tool */
export interface RegisteredTool {
  definition: ToolDefinition;
  extensionPath: string;
  extensionName: string;
}

/** Internal representation of a registered command */
export interface RegisteredCommand {
  definition: CommandDefinition;
  extensionPath: string;
  extensionName: string;
}

/** Internal representation of a loaded extension */
export interface LoadedExtension {
  /** Extension file path */
  path: string;
  /** Resolved absolute path */
  resolvedPath: string;
  /** Extension name (derived from filename) */
  name: string;
  /** Event handlers */
  handlers: Map<string, EventHandler[]>;
  /** Registered tools */
  tools: Map<string, RegisteredTool>;
  /** Registered commands */
  commands: Map<string, RegisteredCommand>;
  /** Declared permissions */
  permissions: Permission[];
}

// ============================================================================
// Extension Loader Result
// ============================================================================

export interface LoadExtensionsResult {
  /** Successfully loaded extensions */
  extensions: LoadedExtension[];
  /** Errors during loading */
  errors: Array<{ path: string; error: string }>;
  /** All registered tools */
  tools: Map<string, RegisteredTool>;
  /** All registered commands */
  commands: Map<string, RegisteredCommand>;
}

// ============================================================================
// Hot Reload Types
// ============================================================================

export interface HotReloadOptions {
  /** Enable hot reloading */
  enabled: boolean;
  /** Debounce time in milliseconds */
  debounceMs: number;
  /** File patterns to watch */
  patterns: string[];
}

// ============================================================================
// Sandbox Types
// ============================================================================

/** Sandbox configuration */
export interface SandboxConfig {
  /** Allowed permissions */
  permissions: Permission[];
  /** Read-only paths */
  readOnlyPaths: string[];
  /** Blocked paths */
  blockedPaths: string[];
  /** Allowed network hosts */
  allowedHosts: string[];
  /** Maximum execution time for tools (ms) */
  maxExecutionTime: number;
}

/** Default sandbox configuration */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  permissions: ['fs:read', 'exec:read'],
  readOnlyPaths: [],
  blockedPaths: ['~/.ssh', '~/.aws', '~/.kube', '/etc'],
  allowedHosts: [],
  maxExecutionTime: 30000,
};
