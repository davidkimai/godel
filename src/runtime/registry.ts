/**
 * Runtime Registry
 *
 * Manages multiple agent runtimes with a singleton pattern.
 * Provides runtime discovery, selection, and configuration management.
 *
 * @module runtime/registry
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentRuntime } from './types';
import { NativeRuntime } from './native';
import { PiRuntime } from './pi';

// ============================================================================
// Runtime Configuration Types
// ============================================================================

/**
 * Pi runtime-specific configuration
 */
export interface PiRuntimeConfig {
  /** Default model to use */
  defaultModel: string;
  /** Available providers */
  providers: string[];
  /** Timeout for operations in milliseconds */
  timeout?: number;
  /** Maximum concurrent agents */
  maxConcurrent?: number;
}

/**
 * Native runtime-specific configuration
 */
export interface NativeRuntimeConfig {
  /** Binary path for native agent */
  binaryPath?: string;
  /** Default working directory */
  workdir?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Runtime configuration loaded from config file
 */
export interface RuntimeConfig {
  /** Default runtime identifier */
  default: string;
  /** Pi runtime configuration */
  pi?: PiRuntimeConfig;
  /** Native runtime configuration */
  native?: NativeRuntimeConfig;
  /** Docker runtime configuration (future) */
  docker?: Record<string, unknown>;
  /** Kubernetes runtime configuration (future) */
  kubernetes?: Record<string, unknown>;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default runtime configuration values */
const DEFAULT_CONFIG: RuntimeConfig = {
  default: 'pi',
  pi: {
    defaultModel: 'claude-sonnet-4-5',
    providers: ['anthropic', 'openai', 'google'],
    timeout: 300000, // 5 minutes
    maxConcurrent: 10,
  },
  native: {
    workdir: process.cwd(),
  },
};

// ============================================================================
// Runtime Registry Class
// ============================================================================

/**
 * Registry for managing multiple agent runtimes
 *
 * Provides a central registry pattern for runtime discovery and selection.
 * Implements singleton pattern for global access.
 *
 * @example
 * ```typescript
 * const registry = getRuntimeRegistry();
 * const piRuntime = registry.get('pi');
 * const defaultRuntime = registry.getDefault();
 * ```
 */
export class RuntimeRegistry {
  /** Map of runtime ID to runtime instance */
  private runtimes: Map<string, AgentRuntime> = new Map();

  /** Default runtime identifier */
  private defaultRuntimeId: string = 'pi';

  /** Runtime configuration */
  private config: RuntimeConfig;

  /**
   * Create a new RuntimeRegistry instance
   *
   * @param config - Optional runtime configuration (loads from file if not provided)
   */
  constructor(config?: RuntimeConfig) {
    this.config = config ?? loadRuntimeConfig();
    this.defaultRuntimeId = this.config.default;
    
    // Initialize built-in runtimes
    initializeRuntimes(this);
  }

  /**
   * Register a runtime with the registry
   *
   * @param runtime - Runtime instance to register
   * @throws Error if runtime with same ID already registered
   *
   * @example
   * ```typescript
   * registry.register(new PiRuntime());
   * ```
   */
  register(runtime: AgentRuntime): void {
    if (this.runtimes.has(runtime.id)) {
      throw new Error(
        `Runtime '${runtime.id}' is already registered. ` +
        `Use unregister('${runtime.id}') first to replace it.`
      );
    }
    this.runtimes.set(runtime.id, runtime);
  }

  /**
   * Unregister a runtime from the registry
   *
   * @param id - Runtime identifier to unregister
   * @returns true if runtime was found and removed, false otherwise
   */
  unregister(id: string): boolean {
    return this.runtimes.delete(id);
  }

  /**
   * Get a runtime by its identifier
   *
   * @param id - Runtime identifier
   * @returns The requested runtime instance
   * @throws Error if runtime not found
   *
   * @example
   * ```typescript
   * const pi = registry.get('pi');
   * ```
   */
  get(id: string): AgentRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      const available = this.listIds();
      const suggestion = available.length > 0
        ? ` Available runtimes: ${available.join(', ')}`
        : ' No runtimes are currently registered.';
      throw new Error(
        `Runtime '${id}' not found.${suggestion} ` +
        `Use register() to add new runtimes.`
      );
    }
    return runtime;
  }

  /**
   * Get the default runtime
   *
   * @returns The default runtime instance
   * @throws Error if default runtime not registered
   *
   * @example
   * ```typescript
   * const runtime = registry.getDefault();
   * const agent = await runtime.spawn({ name: 'my-agent' });
   * ```
   */
  getDefault(): AgentRuntime {
    return this.get(this.defaultRuntimeId);
  }

  /**
   * Set the default runtime
   *
   * @param id - Runtime identifier to set as default
   * @throws Error if runtime not registered
   *
   * @example
   * ```typescript
   * registry.setDefault('native');
   * ```
   */
  setDefault(id: string): void {
    if (!this.runtimes.has(id)) {
      const available = this.listIds();
      const suggestion = available.length > 0
        ? ` Available: ${available.join(', ')}`
        : ' No runtimes registered.';
      throw new Error(
        `Cannot set default: runtime '${id}' is not registered.${suggestion}`
      );
    }
    this.defaultRuntimeId = id;
    // Update config to persist the change
    this.config.default = id;
  }

  /**
   * Get the current default runtime ID
   *
   * @returns The default runtime identifier
   */
  getDefaultId(): string {
    return this.defaultRuntimeId;
  }

  /**
   * List all registered runtimes
   *
   * @returns Array of registered runtime instances
   */
  list(): AgentRuntime[] {
    return Array.from(this.runtimes.values());
  }

  /**
   * List all registered runtime IDs
   *
   * @returns Array of runtime identifiers
   */
  listIds(): string[] {
    return Array.from(this.runtimes.keys());
  }

  /**
   * Check if a runtime is registered
   *
   * @param id - Runtime identifier to check
   * @returns true if runtime exists, false otherwise
   */
  has(id: string): boolean {
    return this.runtimes.has(id);
  }

  /**
   * Get the number of registered runtimes
   *
   * @returns Count of registered runtimes
   */
  count(): number {
    return this.runtimes.size;
  }

  /**
   * Clear all registered runtimes
   *
   * Use with caution - this removes all runtime registrations.
   */
  clear(): void {
    this.runtimes.clear();
  }

  /**
   * Get the current runtime configuration
   *
   * @returns Runtime configuration object
   */
  getConfig(): RuntimeConfig {
    return { ...this.config };
  }

  /**
   * Update the runtime configuration
   *
   * @param config - New configuration (partial updates supported)
   */
  updateConfig(config: Partial<RuntimeConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.default) {
      this.defaultRuntimeId = config.default;
    }
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

/** Global singleton registry instance */
let globalRegistry: RuntimeRegistry | null = null;

/**
 * Get the global RuntimeRegistry singleton instance
 *
 * Creates and initializes the registry on first call.
 * Subsequent calls return the same instance.
 *
 * @returns The global RuntimeRegistry instance
 *
 * @example
 * ```typescript
 * const registry = getRuntimeRegistry();
 * console.log('Available runtimes:', registry.listIds());
 * ```
 */
export function getRuntimeRegistry(): RuntimeRegistry {
  if (!globalRegistry) {
    globalRegistry = new RuntimeRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global RuntimeRegistry singleton
 *
 * Clears the global instance. Next call to getRuntimeRegistry()
 * will create a fresh instance.
 *
 * Useful for testing and when configuration needs to be reloaded.
 */
export function resetRuntimeRegistry(): void {
  globalRegistry = null;
}

/**
 * Initialize the global registry with built-in runtimes
 *
 * This is called internally when the registry is first created.
 * It registers all available runtime implementations.
 *
 * @param registry - Registry instance to initialize
 * @internal
 */
function initializeRuntimes(registry: RuntimeRegistry): void {
  // Register Pi runtime
  try {
    const piConfig = registry.getConfig().pi;
    registry.register(new PiRuntime({
      model: piConfig?.defaultModel,
      provider: piConfig?.providers?.[0],
      requestTimeout: piConfig?.timeout,
    }));
  } catch (error) {
    console.warn('Warning: Failed to register Pi runtime:', error);
  }

  // Register Native runtime
  try {
    const nativeConfig = registry.getConfig().native;
    registry.register(new NativeRuntime({
      binaryPath: nativeConfig?.binaryPath,
      workdir: nativeConfig?.workdir,
    }));
  } catch (error) {
    console.warn('Warning: Failed to register Native runtime:', error);
  }
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load runtime configuration from config file
 *
 * Searches for configuration in the following locations:
 * 1. .godel/config.yaml (project-local)
 * 2. ~/.godel/config.yaml (user-global)
 * 3. Uses defaults if no config found
 *
 * @returns Loaded or default runtime configuration
 *
 * @example
 * ```typescript
 * const config = loadRuntimeConfig();
 * console.log('Default runtime:', config.default);
 * ```
 */
export function loadRuntimeConfig(): RuntimeConfig {
  const configPaths = [
    // Project-local config
    path.join(process.cwd(), '.godel', 'config.yaml'),
    // User-global config
    path.join(os.homedir(), '.godel', 'config.yaml'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = parseConfigFile(configPath);
        return mergeWithDefaults(config);
      } catch (error) {
        console.warn(
          `Warning: Failed to load config from ${configPath}: ${error}`
        );
      }
    }
  }

  // Return defaults if no config found
  return { ...DEFAULT_CONFIG };
}

/**
 * Parse a YAML config file
 *
 * @param configPath - Path to the YAML config file
 * @returns Parsed configuration object
 * @throws Error if parsing fails
 */
function parseConfigFile(configPath: string): Partial<RuntimeConfig> {
  const content = fs.readFileSync(configPath, 'utf-8');

  // Simple YAML parser for runtime config
  // In production, consider using a proper YAML library like js-yaml
  const config: Partial<RuntimeConfig> = {};
  const lines = content.split('\n');
  let currentSection: keyof RuntimeConfig | null = null;
  let indent = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Calculate indent level
    const currentIndent = line.length - line.trimStart().length;

    // Parse top-level keys
    if (currentIndent === 0 && trimmed.includes(':')) {
      const [key, value] = trimmed.split(':').map(s => s.trim());
      currentSection = key as keyof RuntimeConfig;

      if (value && value !== '') {
        // Inline value
        if (key === 'default') {
          config.default = value;
        }
      } else {
        // Section start - initialize based on section type
        if (currentSection === 'pi') {
          config.pi = {} as PiRuntimeConfig;
        } else if (currentSection === 'native') {
          config.native = {} as NativeRuntimeConfig;
        } else if (currentSection === 'docker' || currentSection === 'kubernetes') {
          (config as Record<string, unknown>)[currentSection] = {};
        }
      }
    }
    // Parse nested values
    else if (currentSection && currentIndent === 2 && trimmed.includes(':')) {
      const [key, value] = trimmed.split(':').map(s => s.trim());
      const section = config[currentSection] as Record<string, unknown>;

      if (value && value !== '') {
        // Parse arrays (e.g., "providers: [a, b, c]")
        if (value.startsWith('[') && value.endsWith(']')) {
          section[key] = value
            .slice(1, -1)
            .split(',')
            .map(s => s.trim().replace(/['"]/g, ''));
        }
        // Parse numbers
        else if (/^\d+$/.test(value)) {
          section[key] = parseInt(value, 10);
        }
        // Parse booleans
        else if (value === 'true' || value === 'false') {
          section[key] = value === 'true';
        }
        // Strings (remove quotes)
        else {
          section[key] = value.replace(/['"]/g, '');
        }
      }
    }
  }

  return config;
}

/**
 * Merge loaded config with defaults
 *
 * @param config - Loaded configuration (partial)
 * @returns Complete configuration with defaults applied
 */
function mergeWithDefaults(config: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    default: config.default ?? DEFAULT_CONFIG.default,
    pi: config.pi ? { ...DEFAULT_CONFIG.pi, ...config.pi } : DEFAULT_CONFIG.pi,
    native: config.native ? { ...DEFAULT_CONFIG.native, ...config.native } : DEFAULT_CONFIG.native,
    docker: config.docker,
    kubernetes: config.kubernetes,
  };
}

/**
 * Save runtime configuration to the user-global config file
 *
 * Creates the config directory if it doesn't exist.
 *
 * @param config - Configuration to save
 * @throws Error if write fails
 */
export function saveRuntimeConfig(config: RuntimeConfig): void {
  const configDir = path.join(os.homedir(), '.godel');
  const configPath = path.join(configDir, 'config.yaml');

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Build YAML content
  const lines: string[] = [
    '# Godel Runtime Configuration',
    '#',
    '# This file configures the default agent runtime and provider settings.',
    '#',
    `default: ${config.default}`,
    '',
  ];

  if (config.pi) {
    lines.push('pi:');
    lines.push(`  defaultModel: ${config.pi.defaultModel}`);
    lines.push(`  providers: [${config.pi.providers.join(', ')}]`);
    if (config.pi.timeout) {
      lines.push(`  timeout: ${config.pi.timeout}`);
    }
    if (config.pi.maxConcurrent) {
      lines.push(`  maxConcurrent: ${config.pi.maxConcurrent}`);
    }
    lines.push('');
  }

  if (config.native) {
    lines.push('native:');
    if (config.native.binaryPath) {
      lines.push(`  binaryPath: ${config.native.binaryPath}`);
    }
    if (config.native.workdir) {
      lines.push(`  workdir: ${config.native.workdir}`);
    }
    lines.push('');
  }

  fs.writeFileSync(configPath, lines.join('\n'), 'utf-8');
}

// ============================================================================
// Runtime Discovery
// ============================================================================

/**
 * Available runtime types with metadata
 */
export const AVAILABLE_RUNTIMES = [
  {
    id: 'pi',
    name: 'Pi Multi-Model Runtime',
    description: 'Multi-provider agent runtime supporting Claude, GPT-4, Gemini, and more',
    available: true,
  },
  {
    id: 'native',
    name: 'Native Runtime',
    description: 'Direct process-based agent runtime for local execution',
    available: true, // Implemented by B2
  },
  {
    id: 'docker',
    name: 'Docker Runtime',
    description: 'Containerized agent runtime for isolated execution',
    available: false, // Future implementation
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes Runtime',
    description: 'Distributed agent runtime for cluster execution',
    available: false, // Future implementation
  },
] as const;

/**
 * Get metadata about available runtime types
 *
 * @returns Array of runtime metadata
 */
export function getAvailableRuntimes(): typeof AVAILABLE_RUNTIMES {
  return AVAILABLE_RUNTIMES;
}
