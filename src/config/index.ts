import { logger } from '../utils/logger';
/**
 * Configuration System
 * 
 * Comprehensive configuration management for Godel with:
 * - Multiple config sources (env vars, files, defaults)
 * - Zod schema validation
 * - Environment-specific configs
 * - Secret resolution from Vault
 * - Environment variable substitution
 * 
 * @example
 * ```typescript
 * import { getConfig, loadConfig } from './config';
 * 
 * // Load configuration
 * const config = await getConfig();
 * 
 * // Access configuration values
 * logger.info(config.server.port);
 * logger.info(config.database.url);
 * 
 * // Check if a feature is enabled
 * if (isFeatureEnabled(config, 'metrics')) {
 *   // Enable metrics
 * }
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Config types
  DashConfig,
  ServerConfig,
  DatabaseConfig,
  DatabaseSslConfig,
  RedisConfig,
  AuthConfig,
  LoggingConfig,
  LogLevel,
  LogFormat,
  MetricsConfig,
  BudgetConfig,
  OpenClawConfig,
  EventBusConfig,
  VaultConfig,
  
  // Utility types
  ConfigLoadOptions,
  ConfigValidationError,
  ConfigValidationException,
  SecretReference,
  SecretProvider,
  ConfigCliOptions,
} from './types';

// ============================================================================
// Schema & Validation
// ============================================================================

export {
  // Schemas
  dashConfigSchema,
  serverSchema,
  databaseSchema,
  databaseSslSchema,
  redisSchema,
  authSchema,
  loggingSchema,
  metricsSchema,
  budgetSchema,
  openclawSchema,
  eventBusSchema,
  vaultSchema,
  
  // Validation functions
  validateConfig,
  validateConfigOrThrow,
  formatValidationErrors,
  getPathIssues,
} from './schema';

// ============================================================================
// Defaults
// ============================================================================

export {
  // Default configs
  defaultConfig,
  defaultServerConfig,
  defaultDatabaseConfig,
  defaultRedisConfig,
  defaultAuthConfig,
  defaultLoggingConfig,
  defaultMetricsConfig,
  defaultBudgetConfig,
  defaultOpenClawConfig,
  defaultEventBusConfig,
  defaultVaultConfig,
  
  // Environment-specific
  developmentConfig,
  productionConfig,
  testConfig,
  getEnvironmentDefaults,
  
  // Metadata
  configMetadata,
} from './defaults';

// ============================================================================
// Loader
// ============================================================================

export {
  // Main functions
  loadConfig,
  getConfig,
  reloadConfig,
  clearConfigCache,
  
  // Utilities
  getConfigValue,
  isFeatureEnabled,
  flattenConfig,
  getConfigSources,
} from './loader';

// ============================================================================
// Secrets
// ============================================================================

export {
  // Classes
  SecretManager,
  SecretResolutionError,
  
  // Functions
  getGlobalSecretManager,
  resetGlobalSecretManager,
  resolveSecret,
  hasSecretReferences,
  parseSecretReference,
  containsSecretReferences,
  extractSecretReferences,
  substituteEnvVars,
  substituteEnvVarsInObject,
} from './secrets-manager';

// ============================================================================
// Runtime Configuration
// ============================================================================

export {
  // Zod schemas
  RuntimeTypeSchema,
  ResourceLimitsSchema,
  AgentRuntimeConfigSchema,
  TeamRuntimeConfigSchema,
  RuntimeFeatureFlagsSchema,
  GlobalRuntimeConfigSchema,
  
  // Types
  AgentRuntimeConfig,
  TeamRuntimeConfig,
  RuntimeFeatureFlags,
  GlobalRuntimeConfig,
  
  // Constants
  RuntimeEnvVars,
  defaultResourceLimits,
  defaultFeatureFlags,
  defaultRuntimeConfig,
  
  // Manager class
  RuntimeConfigManager,
  
  // Functions
  createRuntimeConfig,
  validateRuntimeConfig,
} from './runtime';

// ============================================================================
// Backwards Compatibility
// ============================================================================

// Re-export existing config modules for backwards compatibility
export * from './types';
export * from './yaml-loader';
export * from './gitops';
