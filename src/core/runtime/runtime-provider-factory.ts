/**
 * RuntimeProviderFactory
 * 
 * Factory pattern implementation for creating and managing RuntimeProvider instances.
 * Provides singleton management, configuration loading, and provider registration.
 * 
 * @module core/runtime/runtime-provider-factory
 * @version 1.0.0
 * @since 2026-02-08
 * @see SPEC-002 Section 4.1
 */

import {
  RuntimeType,
  RuntimeProvider,
  ProviderConfig,
  RuntimeError,
} from './runtime-provider';
import { WorktreeRuntimeProvider } from './providers/worktree-runtime-provider';
import { KataRuntimeProvider } from './providers/kata-runtime-provider';
import { logger } from '../../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function type for creating provider instances
 */
export type ProviderFactory = (config?: ProviderConfig) => RuntimeProvider;

/**
 * Configuration source types
 */
export type ConfigSource = 'environment' | 'file' | 'default';

/**
 * Factory configuration options
 */
export interface FactoryConfig {
  /** Enable singleton caching (default: true) */
  enableSingletonCache?: boolean;
  /** Enable configuration file loading (default: true) */
  enableConfigLoading?: boolean;
  /** Base configuration directory */
  configDir?: string;
  /** Environment variable prefix (default: GODEL_RUNTIME_) */
  envPrefix?: string;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Default runtime type */
  defaultRuntime?: RuntimeType;
  /** Team-specific runtime policies */
  teamPolicies?: Map<string, RuntimeType>;
}

/**
 * Runtime selection options
 */
export interface RuntimeSelectionOptions {
  /** Preferred runtime type */
  runtime?: RuntimeType;
  /** Agent ID for this runtime */
  agentId?: string;
  /** Team ID for policy lookup */
  teamId?: string;
  /** Force specific runtime regardless of policy */
  forceRuntime?: boolean;
}

/**
 * Cached provider instance with metadata
 */
interface CachedProvider {
  provider: RuntimeProvider;
  config: ProviderConfig;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

/**
 * Configuration overrides by team
 */
interface TeamOverrides {
  [teamId: string]: Partial<ProviderConfig>;
}

/**
 * Configuration overrides by agent
 */
interface AgentOverrides {
  [agentId: string]: Partial<ProviderConfig>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error when provider is not registered
 */
export class ProviderNotRegisteredError extends RuntimeError {
  readonly code = 'PROVIDER_NOT_REGISTERED';
  readonly retryable = false;
  providerType: RuntimeType;

  constructor(providerType: RuntimeType) {
    super(`Provider '${providerType}' is not registered`, undefined, { providerType });
    this.providerType = providerType;
  }
}

/**
 * Error when provider is already registered
 */
export class ProviderAlreadyRegisteredError extends RuntimeError {
  readonly code = 'PROVIDER_ALREADY_REGISTERED';
  readonly retryable = false;
  providerType: RuntimeType;

  constructor(providerType: RuntimeType) {
    super(`Provider '${providerType}' is already registered`, undefined, { providerType });
    this.providerType = providerType;
  }
}

/**
 * Error during factory initialization
 */
export class FactoryInitializationError extends RuntimeError {
  readonly code = 'FACTORY_INITIALIZATION_ERROR';
  readonly retryable = false;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, undefined, context);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME PROVIDER FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory for creating and managing RuntimeProvider instances.
 * 
 * Implements the singleton pattern for provider instances and provides
 * configuration loading from multiple sources (environment, files, overrides).
 * 
 * @example
 * ```typescript
 * const factory = RuntimeProviderFactory.getInstance();
 * 
 * // Register a provider
 * factory.registerProvider('kata', (config) => new KataRuntimeProvider(config));
 * 
 * // Get singleton instance
 * const kataProvider = factory.getProvider('kata');
 * 
 * // Create new instance with custom config
 * const customProvider = factory.createProvider('kata', customConfig);
 * ```
 */
export class RuntimeProviderFactory {
  private static instance: RuntimeProviderFactory | null = null;
  private static initializationLock = false;

  private registry: Map<RuntimeType, ProviderFactory> = new Map();
  private singletonCache: Map<RuntimeType, CachedProvider> = new Map();
  private teamOverrides: TeamOverrides = {};
  private agentOverrides: AgentOverrides = {};
  private baseConfig: Partial<ProviderConfig> = {};
  private config: FactoryConfig;
  private disposed = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: FactoryConfig = {}) {
    this.config = {
      enableSingletonCache: true,
      enableConfigLoading: true,
      configDir: './config/runtime',
      envPrefix: 'GODEL_RUNTIME_',
      debug: false,
      ...config,
    };

    if (this.config.enableConfigLoading) {
      this.loadConfiguration();
    }

    // Auto-register built-in providers
    this.registerBuiltInProviders();
  }

  /**
   * Register built-in provider implementations
   */
  private registerBuiltInProviders(): void {
    // Register WorktreeRuntimeProvider
    this.registerProvider('worktree', (config?: ProviderConfig) => {
      const worktreeConfig = {
        baseWorktreePath: process.cwd(),
        defaultBranch: 'main',
        ...(config?.settings || {}),
      };
      return new WorktreeRuntimeProvider(worktreeConfig as any);
    });

    // Register KataRuntimeProvider
    this.registerProvider('kata', (config?: ProviderConfig) => {
      const kataConfig = {
        namespace: process.env['K8S_NAMESPACE'] || 'default',
        runtimeClassName: process.env['KATA_RUNTIME_CLASS'] || 'kata',
        defaultImage: process.env['KATA_DEFAULT_IMAGE'] || 'busybox:latest',
        ...(config?.settings || {}),
      };
      return new KataRuntimeProvider(kataConfig);
    });

    logger.info('[RuntimeProviderFactory] Registered built-in providers');
  }

  /**
   * Get the singleton factory instance
   * @param config - Optional factory configuration (only used on first call)
   * @returns The RuntimeProviderFactory instance
   */
  public static getInstance(config?: FactoryConfig): RuntimeProviderFactory {
    if (!RuntimeProviderFactory.instance) {
      if (RuntimeProviderFactory.initializationLock) {
        throw new FactoryInitializationError('Factory is being initialized by another thread');
      }

      RuntimeProviderFactory.initializationLock = true;
      try {
        RuntimeProviderFactory.instance = new RuntimeProviderFactory(config);
      } finally {
        RuntimeProviderFactory.initializationLock = false;
      }
    }

    return RuntimeProviderFactory.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (RuntimeProviderFactory.instance) {
      RuntimeProviderFactory.instance.dispose();
    }
    RuntimeProviderFactory.instance = null;
  }

  /**
   * Register a provider factory for a runtime type
   * @param type - Runtime type to register
   * @param factory - Factory function for creating provider instances
   * @throws {ProviderAlreadyRegisteredError} If provider is already registered
   */
  public registerProvider(type: RuntimeType, factory: ProviderFactory): void {
    this.ensureNotDisposed();

    if (this.registry.has(type)) {
      throw new ProviderAlreadyRegisteredError(type);
    }

    this.registry.set(type, factory);

    if (this.config.debug) {
      console.log(`[RuntimeProviderFactory] Registered provider: ${type}`);
    }
  }

  /**
   * Unregister a provider factory
   * @param type - Runtime type to unregister
   * @returns true if provider was registered and removed, false otherwise
   */
  public unregisterProvider(type: RuntimeType): boolean {
    this.ensureNotDisposed();

    const hadProvider = this.registry.has(type);
    
    if (hadProvider) {
      // Remove from singleton cache if present
      if (this.singletonCache.has(type)) {
        this.singletonCache.delete(type);
      }
      
      this.registry.delete(type);

      if (this.config.debug) {
        console.log(`[RuntimeProviderFactory] Unregistered provider: ${type}`);
      }
    }

    return hadProvider;
  }

  /**
   * Check if a provider is registered
   * @param type - Runtime type to check
   * @returns true if provider is registered
   */
  public isProviderRegistered(type: RuntimeType): boolean {
    this.ensureNotDisposed();
    return this.registry.has(type);
  }

  /**
   * Create a provider using selection options (runtime, teamId, etc.)
   * @param options - Runtime selection options
   * @returns RuntimeProvider instance
   */
  public createProviderWithOptions(options: RuntimeSelectionOptions = {}): RuntimeProvider {
    const runtimeType = this.selectRuntimeType(options);
    return this.getProvider(runtimeType);
  }

  /**
   * Select the appropriate runtime type based on options and policies
   * @param options - Runtime selection options
   * @returns Selected runtime type
   */
  public selectRuntimeType(options: RuntimeSelectionOptions): RuntimeType {
    // 1. Check for explicit runtime preference (unless force is disabled)
    if (options.runtime && !options.forceRuntime) {
      return options.runtime;
    }

    // 2. Check team policy if teamId provided
    if (options.teamId && this.config.teamPolicies?.has(options.teamId)) {
      const teamRuntime = this.config.teamPolicies.get(options.teamId)!;
      logger.debug('[RuntimeProviderFactory] Using team policy runtime', {
        teamId: options.teamId,
        runtime: teamRuntime,
      });
      return teamRuntime;
    }

    // 3. Fall back to default runtime
    return this.config.defaultRuntime || 'worktree';
  }

  /**
   * Set team runtime policy
   * @param teamId - Team identifier
   * @param runtime - Runtime type for this team
   */
  public setTeamPolicy(teamId: string, runtime: RuntimeType): void {
    if (!this.config.teamPolicies) {
      this.config.teamPolicies = new Map();
    }
    this.config.teamPolicies.set(teamId, runtime);
    logger.info('[RuntimeProviderFactory] Team policy set', { teamId, runtime });
  }

  /**
   * Get team runtime policy
   * @param teamId - Team identifier
   * @returns Runtime type or undefined
   */
  public getTeamPolicy(teamId: string): RuntimeType | undefined {
    return this.config.teamPolicies?.get(teamId);
  }

  /**
   * Create a new provider instance with the specified configuration
   * @param type - Runtime type to create
   * @param config - Optional provider configuration
   * @returns New RuntimeProvider instance
   * @throws {ProviderNotRegisteredError} If provider is not registered
   */
  public createProvider(type: RuntimeType, config?: ProviderConfig): RuntimeProvider {
    this.ensureNotDisposed();

    const factory = this.registry.get(type);
    if (!factory) {
      throw new ProviderNotRegisteredError(type);
    }

    // Merge configurations
    const mergedConfig = this.mergeConfiguration(type, config);

    if (this.config.debug) {
      console.log(`[RuntimeProviderFactory] Creating provider: ${type}`);
    }

    return factory(mergedConfig);
  }

  /**
   * Get a singleton provider instance (creates if not exists)
   * @param type - Runtime type to get
   * @param config - Optional configuration (used only on first creation)
   * @returns RuntimeProvider instance (cached singleton)
   * @throws {ProviderNotRegisteredError} If provider is not registered
   */
  public getProvider(type: RuntimeType, config?: ProviderConfig): RuntimeProvider {
    this.ensureNotDisposed();

    if (!this.config.enableSingletonCache) {
      return this.createProvider(type, config);
    }

    // Check cache
    const cached = this.singletonCache.get(type);
    if (cached) {
      cached.lastAccessedAt = new Date();
      cached.accessCount++;
      return cached.provider;
    }

    // Create new instance and cache it
    const provider = this.createProvider(type, config);
    const now = new Date();
    
    this.singletonCache.set(type, {
      provider,
      config: config || this.mergeConfiguration(type),
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
    });

    return provider;
  }

  /**
   * List all registered provider types
   * @returns Array of registered runtime types
   */
  public listRegisteredProviders(): RuntimeType[] {
    this.ensureNotDisposed();
    return Array.from(this.registry.keys());
  }

  /**
   * Get cache statistics for singleton providers
   * @returns Object with cache statistics
   */
  public getCacheStats(): {
    totalProviders: number;
    cachedProviders: number;
    cacheEntries: Array<{
      type: RuntimeType;
      createdAt: Date;
      lastAccessedAt: Date;
      accessCount: number;
    }>;
  } {
    this.ensureNotDisposed();

    const cacheEntries = Array.from(this.singletonCache.entries()).map(([type, cached]) => ({
      type,
      createdAt: cached.createdAt,
      lastAccessedAt: cached.lastAccessedAt,
      accessCount: cached.accessCount,
    }));

    return {
      totalProviders: this.registry.size,
      cachedProviders: this.singletonCache.size,
      cacheEntries,
    };
  }

  /**
   * Clear the singleton cache for all or specific providers
   * @param type - Optional runtime type to clear (clears all if not specified)
   */
  public clearCache(type?: RuntimeType): void {
    this.ensureNotDisposed();

    if (type) {
      this.singletonCache.delete(type);
      
      if (this.config.debug) {
        console.log(`[RuntimeProviderFactory] Cleared cache for: ${type}`);
      }
    } else {
      this.singletonCache.clear();
      
      if (this.config.debug) {
        console.log('[RuntimeProviderFactory] Cleared all caches');
      }
    }
  }

  /**
   * Set configuration override for a team
   * @param teamId - Team identifier
   * @param config - Configuration override
   */
  public setTeamOverride(teamId: string, config: Partial<ProviderConfig>): void {
    this.ensureNotDisposed();
    this.teamOverrides[teamId] = config;
  }

  /**
   * Set configuration override for an agent
   * @param agentId - Agent identifier
   * @param config - Configuration override
   */
  public setAgentOverride(agentId: string, config: Partial<ProviderConfig>): void {
    this.ensureNotDisposed();
    this.agentOverrides[agentId] = config;
  }

  /**
   * Set base configuration
   * @param config - Base configuration
   */
  public setBaseConfig(config: Partial<ProviderConfig>): void {
    this.ensureNotDisposed();
    this.baseConfig = config;
  }

  /**
   * Dispose of the factory and cleanup resources
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clear singleton cache
    this.singletonCache.clear();

    // Clear registry
    this.registry.clear();

    // Reset configuration
    this.teamOverrides = {};
    this.agentOverrides = {};
    this.baseConfig = {};

    if (this.config.debug) {
      console.log('[RuntimeProviderFactory] Disposed');
    }
  }

  /**
   * Check if factory is disposed
   * @returns true if factory is disposed
   */
  public isDisposed(): boolean {
    return this.disposed;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Ensure factory is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('RuntimeProviderFactory has been disposed');
    }
  }

  /**
   * Load configuration from environment variables and files
   */
  private loadConfiguration(): void {
    try {
      this.loadEnvironmentConfig();
      this.loadConfigFile();
    } catch (error) {
      if (this.config.debug) {
        console.error('[RuntimeProviderFactory] Configuration loading error:', error);
      }
      // Continue with default configuration
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadEnvironmentConfig(): void {
    const prefix = this.config.envPrefix || 'GODEL_RUNTIME_';
    
    // Load default resources
    const cpu = process.env[`${prefix}CPU`];
    const memory = process.env[`${prefix}MEMORY`];
    const disk = process.env[`${prefix}DISK`];

    if (cpu || memory || disk) {
      this.baseConfig.defaults = {
        resources: {
          cpu: cpu ? parseFloat(cpu) : 1,
          memory: memory || '512Mi',
          ...(disk && { disk }),
        },
      };
    }

    // Load timeout
    const timeout = process.env[`${prefix}TIMEOUT`];
    if (timeout) {
      if (!this.baseConfig.settings) {
        this.baseConfig.settings = {};
      }
      this.baseConfig.settings['timeout'] = parseInt(timeout, 10);
    }

    // Load team overrides from environment
    // Format: GODEL_RUNTIME_TEAM_TEAMID_KEY=value
    const teamRegex = new RegExp(`^${prefix}TEAM_(.+?)_(.+)$`);
    for (const [key, value] of Object.entries(process.env)) {
      const match = key?.match(teamRegex);
      if (match) {
        const [, teamId, configKey] = match;
        if (!this.teamOverrides[teamId]) {
          this.teamOverrides[teamId] = {};
        }
        this.setNestedValue(this.teamOverrides[teamId], configKey.toLowerCase(), value);
      }
    }

    // Load agent overrides from environment
    // Format: GODEL_RUNTIME_AGENT_AGENTID_KEY=value
    const agentRegex = new RegExp(`^${prefix}AGENT_(.+?)_(.+)$`);
    for (const [key, value] of Object.entries(process.env)) {
      const match = key?.match(agentRegex);
      if (match) {
        const [, agentId, configKey] = match;
        if (!this.agentOverrides[agentId]) {
          this.agentOverrides[agentId] = {};
        }
        this.setNestedValue(this.agentOverrides[agentId], configKey.toLowerCase(), value);
      }
    }

    if (this.config.debug) {
      console.log('[RuntimeProviderFactory] Loaded environment config');
    }
  }

  /**
   * Load configuration from file
   */
  private loadConfigFile(): void {
    try {
      // Dynamic import to avoid issues if file doesn't exist
      const fs = require('fs');
      const path = require('path');
      
      const configPath = path.resolve(this.config.configDir || './config/runtime', 'providers.json');
      
      if (!fs.existsSync(configPath)) {
        return;
      }

      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);

      if (config.base) {
        this.baseConfig = { ...this.baseConfig, ...config.base };
      }

      if (config.teams) {
        this.teamOverrides = { ...this.teamOverrides, ...config.teams };
      }

      if (config.agents) {
        this.agentOverrides = { ...this.agentOverrides, ...config.agents };
      }

      if (this.config.debug) {
        console.log(`[RuntimeProviderFactory] Loaded config file: ${configPath}`);
      }
    } catch (error) {
      // Config file is optional
      if (this.config.debug) {
        console.log('[RuntimeProviderFactory] No config file found or error loading');
      }
    }
  }

  /**
   * Merge all configuration sources
   */
  private mergeConfiguration(
    type: RuntimeType,
    config?: ProviderConfig
  ): ProviderConfig {
    // Start with base config
    let merged: ProviderConfig = {
      type,
      name: `${type}-provider`,
      capabilities: {
        snapshots: true,
        streaming: true,
        interactive: true,
        fileOperations: true,
        networkConfiguration: true,
        resourceLimits: true,
        healthChecks: true,
      },
      defaults: {},
      ...this.baseConfig,
    };

    // Apply config from parameter
    if (config) {
      merged = { ...merged, ...config };
    }

    // Apply team override if teamId is specified
    const teamId = (config?.settings?.['teamId'] as string) ||
                   (this.baseConfig.settings?.['teamId'] as string);
    if (teamId && this.teamOverrides[teamId]) {
      merged = { ...merged, ...this.teamOverrides[teamId] };
    }

    // Apply agent override if agentId is specified
    const agentId = (config?.settings?.['agentId'] as string) ||
                    (this.baseConfig.settings?.['agentId'] as string);
    if (agentId && this.agentOverrides[agentId]) {
      merged = { ...merged, ...this.agentOverrides[agentId] };
    }

    return merged;
  }

  /**
   * Set a nested value in an object using dot notation
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
    const parts = path.split('_');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    // Try to parse value as number or boolean
    const lastPart = parts[parts.length - 1];
    const parsedValue = this.parseValue(value);
    current[lastPart] = parsedValue;
  }

  /**
   * Parse a string value to appropriate type
   */
  private parseValue(value: string): string | number | boolean {
    // Try boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Try number
    const num = parseFloat(value);
    if (!isNaN(num) && isFinite(num)) {
      // Check if it's an integer
      if (Number.isInteger(num)) {
        return parseInt(value, 10);
      }
      return num;
    }

    // Return as string
    return value;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default factory instance
 */
let defaultFactory: RuntimeProviderFactory | null = null;

/**
 * Get the default factory instance
 * @returns The default RuntimeProviderFactory
 */
export function getFactory(): RuntimeProviderFactory {
  if (!defaultFactory) {
    defaultFactory = RuntimeProviderFactory.getInstance();
  }
  return defaultFactory;
}

/**
 * Reset the default factory instance
 */
export function resetFactory(): void {
  if (defaultFactory) {
    defaultFactory.dispose();
    defaultFactory = null;
  }
  RuntimeProviderFactory.resetInstance();
}

export default RuntimeProviderFactory;
