/**
 * Godel Extension System
 * 
 * Provides a TypeScript-based plugin architecture for extending Godel functionality.
 * Extensions can register tools, commands, and event handlers.
 * 
 * @example
 * ```typescript
 * import { ExtensionLoader, Type } from '@godel/core/extension-loader';
 * 
 * const loader = new ExtensionLoader({
 *   paths: ['./extensions'],
 *   hotReload: true
 * });
 * 
 * const result = await loader.load();
 * ```
 */

// Core types
export type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
  ExtensionEvent,
  AgentStartEvent,
  AgentCompleteEvent,
  AgentErrorEvent,
  TeamStartEvent,
  TeamCompleteEvent,
  ToolCallEvent,
  ToolResultEvent,
  CommandExecuteEvent,
  ToolContext,
  ToolResult,
  ToolUpdateCallback,
  ToolDefinition,
  CommandContext,
  CommandDefinition,
  Permission,
  PermissionDescriptor,
  EventHandler,
  RegisteredTool,
  RegisteredCommand,
  LoadedExtension,
  LoadExtensionsResult,
  HotReloadOptions,
  SandboxConfig,
} from './extension-api';

// Loader
export {
  ExtensionLoader,
  loadExtensions,
  PermissionManager,
  getExtensionsDir,
  DEFAULT_SANDBOX_CONFIG,
} from './extension-loader';

// Re-export TypeBox for extensions
export { Type } from '@sinclair/typebox';
