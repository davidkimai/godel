/**
 * Configuration Loader
 * 
 * Loads and merges configuration from multiple sources:
 * 1. Default values (lowest priority)
 * 2. Environment-specific defaults
 * 3. Config files (JSON/YAML)
 * 4. Environment variables (highest priority)
 * 
 * Supports secret resolution from Vault and environment variable substitution.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import { logger } from '../utils/logger';
import type { DashConfig, ConfigLoadOptions } from './types';
import { 
  dashConfigSchema, 
  validateConfig, 
  validateConfigOrThrow,
  formatValidationErrors 
} from './schema';
import { 
  defaultConfig, 
  getEnvironmentDefaults 
} from './defaults';
import { 
  SecretManager, 
  getGlobalSecretManager,
  substituteEnvVars,
  substituteEnvVarsInObject,
  containsSecretReferences,
  type VaultConfig 
} from './secrets-manager';

// ============================================================================
// Configuration Loading
// ============================================================================

export interface LoadedConfig {
  config: DashConfig;
  sources: string[];
  warnings: string[];
}

/**
 * Load configuration from all sources
 */
export async function loadConfig(options: ConfigLoadOptions = {}): Promise<LoadedConfig> {
  const env = options.env || process.env['NODE_ENV'] || 'development';
  const configDir = options.configDir || './config';
  const sources: string[] = [];
  const warnings: string[] = [];

  // 1. Start with defaults
  let config: Partial<DashConfig> = { ...defaultConfig };
  sources.push('defaults');

  // 2. Apply environment-specific defaults
  const envDefaults = getEnvironmentDefaults(env);
  config = deepMerge(config, envDefaults);
  sources.push(`env-defaults:${env}`);

  // 3. Load from config files (YAML or JSON)
  const fileConfigs = loadConfigFiles(configDir, env);
  for (const fileConfig of fileConfigs) {
    config = deepMerge(config, fileConfig.config);
    sources.push(fileConfig.source);
    
    if (fileConfig.warning) {
      warnings.push(fileConfig.warning);
    }
  }

  // 4. Environment variable substitution in loaded config
  if (!options.skipEnvSubstitution) {
    config = substituteEnvVarsInObject(config);
  }

  // 5. Apply environment variable overrides (highest priority)
  config = applyEnvVarOverrides(config);
  sources.push('environment-variables');

  // 6. Set the environment
  config.env = env;

  // 7. Validate the configuration
  const validation = validateConfig(config);
  if (!validation.success) {
    const errorMessage = formatValidationErrors(validation.errors!);
    throw new Error(`Configuration validation failed:\n${errorMessage}`);
  }

  // 8. Resolve secrets if Vault is enabled
  if (options.enableVault && config.vault) {
    const secretManager = getGlobalSecretManager(config.vault as VaultConfig);
    const configWithSecrets = await resolveSecretsInConfig(
      validation.data!,
      secretManager
    );
    sources.push('vault-secrets');
    
    // Re-validate after secret resolution
    const finalValidation = validateConfig(configWithSecrets);
    if (!finalValidation.success) {
      throw new Error(
        `Configuration validation failed after secret resolution:\n${formatValidationErrors(finalValidation.errors!)}`
      );
    }
    
    return {
      config: finalValidation.data!,
      sources,
      warnings,
    };
  }

  return {
    config: validation.data!,
    sources,
    warnings,
  };
}

/**
 * Load configuration files from the config directory
 */
function loadConfigFiles(
  configDir: string,
  env: string
): Array<{ config: Partial<DashConfig>; source: string; warning?: string }> {
  const results: Array<{ config: Partial<DashConfig>; source: string; warning?: string }> = [];
  
  // Try environment-specific files first
  const envFiles = [
    `${configDir}/dash.${env}.yaml`,
    `${configDir}/dash.${env}.yml`,
    `${configDir}/dash.${env}.json`,
  ];
  
  // Then try base config files
  const baseFiles = [
    `${configDir}/dash.yaml`,
    `${configDir}/dash.yml`,
    `${configDir}/dash.json`,
  ];
  
  // Load environment-specific config (higher priority)
  for (const filePath of envFiles) {
    if (existsSync(filePath)) {
      try {
        const config = loadConfigFile(filePath);
        results.push({ config, source: filePath });
        break; // Only load the first one found
      } catch (error) {
        results.push({
          config: {},
          source: filePath,
          warning: `Failed to load ${filePath}: ${(error as Error).message}`,
        });
      }
    }
  }
  
  // Load base config (lower priority)
  for (const filePath of baseFiles) {
    if (existsSync(filePath)) {
      try {
        const config = loadConfigFile(filePath);
        results.push({ config, source: filePath });
        break; // Only load the first one found
      } catch (error) {
        results.push({
          config: {},
          source: filePath,
          warning: `Failed to load ${filePath}: ${(error as Error).message}`,
        });
      }
    }
  }
  
  return results;
}

/**
 * Load a single config file (YAML or JSON)
 */
function loadConfigFile(filePath: string): Partial<DashConfig> {
  const content = readFileSync(filePath, 'utf-8');
  
  if (filePath.endsWith('.json')) {
    return JSON.parse(content) as Partial<DashConfig>;
  } else {
    return YAML.parse(content) as Partial<DashConfig>;
  }
}

/**
 * Apply environment variable overrides
 * Maps environment variables to config paths
 */
function applyEnvVarOverrides(config: Partial<DashConfig>): Partial<DashConfig> {
  const overrides: Record<string, string | undefined> = {
    'server.port': process.env['PORT'],
    'server.host': process.env['HOST'],
    'server.rateLimit': process.env['DASH_RATE_LIMIT'],
    'database.url': process.env['DATABASE_URL'],
    'redis.url': process.env['REDIS_URL'],
    'auth.jwtSecret': process.env['DASH_JWT_SECRET'],
    'logging.level': process.env['LOG_LEVEL'],
    'metrics.enabled': process.env['METRICS_ENABLED'],
    'openclaw.gatewayToken': process.env['OPENCLAW_GATEWAY_TOKEN'],
  };

  for (const [path, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      setValueAtPath(config, path, parseValue(value));
    }
  }

  return config;
}

/**
 * Parse a string value into appropriate type
 */
function parseValue(value: string): unknown {
  // Try boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  // Try number
  const num = Number(value);
  if (!isNaN(num) && value !== '') {
    return num;
  }
  
  // Try JSON array/object
  if ((value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('{') && value.endsWith('}'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  
  return value;
}

/**
 * Set a value at a dotted path in an object
 */
function setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  
  current[parts[parts.length - 1]] = value;
}

/**
 * Deep merge two objects
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (sourceValue === undefined) {
      continue;
    }
    
    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else {
      result[key] = sourceValue;
    }
  }
  
  return result;
}

/**
 * Resolve secrets in configuration values
 */
async function resolveSecretsInConfig(
  config: DashConfig,
  secretManager: SecretManager
): Promise<DashConfig> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && containsSecretReferences(value)) {
      result[key] = await secretManager.resolveInString(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = await resolveSecretsInObject(
        value as Record<string, unknown>,
        secretManager
      );
    } else {
      result[key] = value;
    }
  }
  
  return result as DashConfig;
}

/**
 * Recursively resolve secrets in an object
 */
async function resolveSecretsInObject(
  obj: Record<string, unknown>,
  secretManager: SecretManager
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && containsSecretReferences(value)) {
      result[key] = await secretManager.resolveInString(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = await resolveSecretsInObject(
        value as Record<string, unknown>,
        secretManager
      );
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let cachedConfig: DashConfig | null = null;
let cachedSources: string[] = [];

/**
 * Get or load the global configuration
 */
export async function getConfig(options?: ConfigLoadOptions): Promise<DashConfig> {
  if (cachedConfig && !options?.env) {
    return cachedConfig;
  }
  
  const loaded = await loadConfig(options);
  cachedConfig = loaded.config;
  cachedSources = loaded.sources;
  
  if (loaded.warnings.length > 0) {
    for (const warning of loaded.warnings) {
      logger.warn('config', warning);
    }
  }
  
  logger.debug('config', 'Configuration loaded', { sources: loaded.sources });
  
  return cachedConfig;
}

/**
 * Reload the global configuration
 */
export async function reloadConfig(options?: ConfigLoadOptions): Promise<DashConfig> {
  cachedConfig = null;
  return getConfig(options);
}

/**
 * Get the configuration sources
 */
export function getConfigSources(): string[] {
  return [...cachedSources];
}

/**
 * Clear the cached configuration
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cachedSources = [];
}

// ============================================================================
// Validation
// ============================================================================

export { validateConfig, validateConfigOrThrow, formatValidationErrors };

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get a value from config by path
 */
export function getConfigValue<T>(
  config: DashConfig,
  path: string,
  defaultValue?: T
): T | undefined {
  const parts = path.split('.');
  let current: unknown = config;
  
  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return (current as T) ?? defaultValue;
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(config: DashConfig, feature: string): boolean {
  return config.features[feature] ?? false;
}

/**
 * Get configuration as a flat object (for display)
 */
export function flattenConfig(
  config: DashConfig,
  prefix = '',
  hideSecrets = true
): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(config)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (value === null || value === undefined) {
      result[fullKey] = 'null';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenConfig(value as DashConfig, fullKey, hideSecrets));
    } else {
      // Hide sensitive values
      if (hideSecrets && isSensitiveKey(fullKey)) {
        result[fullKey] = '***';
      } else if (Array.isArray(value)) {
        result[fullKey] = JSON.stringify(value);
      } else {
        result[fullKey] = String(value);
      }
    }
  }
  
  return result;
}

/**
 * Check if a config key contains sensitive data
 */
function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /credential/i,
    /auth/i,
  ];
  
  return sensitivePatterns.some((pattern) => pattern.test(key));
}
