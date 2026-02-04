/**
 * YAML Configuration Loader
 * 
 * Parses and validates swarm.yaml files with support for:
 * - Environment variable substitution ($VAR, ${VAR}, ${VAR:-default})
 * - 1Password secret resolution ({{ op://vault/item/field }})
 * - Schema validation using TypeBox
 * - Error handling with helpful suggestions
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';
import { Value, type ValueError } from '@sinclair/typebox/value';
import { 
  SwarmYamlSchema, 
  type SwarmYamlConfig,
  type ConfigLoadOptions,
  type ConfigLoadResult,
  type ConfigValidationError,
  ConfigValidationException,
} from './types';

// Import SwarmStrategy for toSwarmConfig
import type { SwarmStrategy } from '../core/swarm';

// Re-export types for convenience
export type { ConfigLoadOptions, ConfigLoadResult, ConfigValidationError } from './types';
export { ConfigValidationException } from './types';

// ============================================================================
// Environment Variable Substitution
// ============================================================================

/**
 * Regex patterns for environment variable substitution
 */
const ENV_PATTERNS = {
  // ${VAR:-default} or ${VAR:-default with spaces}
  withDefault: /\$\{([A-Za-z_][A-Za-z0-9_]*):-([^}]*)\}/g,
  // ${VAR}
  braced: /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
  // $VAR
  simple: /\$([A-Za-z_][A-Za-z0-9_]*)/g,
};

/**
 * Substitute environment variables in a string value
 * Supports: $VAR, ${VAR}, ${VAR:-default}
 */
export function substituteEnvVars(
  value: string,
  env: NodeJS.ProcessEnv = process.env
): { result: string; substituted: string[] } {
  const substituted: string[] = [];
  
  let result = value;
  
  // Replace ${VAR:-default} first (most specific)
  result = result.replace(ENV_PATTERNS.withDefault, (match, varName, defaultValue) => {
    const envValue = env[varName];
    if (envValue !== undefined) {
      substituted.push(varName);
      return envValue;
    }
    return defaultValue || '';
  });
  
  // Replace ${VAR}
  result = result.replace(ENV_PATTERNS.braced, (match, varName) => {
    const envValue = env[varName];
    if (envValue !== undefined) {
      substituted.push(varName);
      return envValue;
    }
    // Keep original if not found
    return match;
  });
  
  // Replace $VAR
  result = result.replace(ENV_PATTERNS.simple, (match, varName) => {
    const envValue = env[varName];
    if (envValue !== undefined) {
      substituted.push(varName);
      return envValue;
    }
    // Keep original if not found
    return match;
  });
  
  return { result, substituted };
}

/**
 * Recursively substitute environment variables in an object
 */
export function substituteEnvVarsInObject<T extends Record<string, unknown>>(
  obj: T,
  env: NodeJS.ProcessEnv = process.env
): { result: T; substituted: string[] } {
  const allSubstituted: string[] = [];
  
  function recurse(value: unknown): unknown {
    if (typeof value === 'string') {
      const { result, substituted } = substituteEnvVars(value, env);
      allSubstituted.push(...substituted);
      return result;
    }
    
    if (Array.isArray(value)) {
      return value.map(recurse);
    }
    
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = recurse(val);
      }
      return result;
    }
    
    return value;
  }
  
  return { 
    result: recurse(obj) as T, 
    substituted: [...new Set(allSubstituted)] 
  };
}

// ============================================================================
// Secret Resolution (1Password CLI)
// ============================================================================

/**
 * Regex pattern for 1Password secret references
 * Format: {{ op://vault/item/field }}
 */
const SECRET_PATTERN = /\{\{\s*op:\/\/([^\/]+)\/([^\/]+)\/([^\s}]+)\s*\}\}/g;

/**
 * Check if a value contains secret references
 */
export function containsSecretReferences(value: string): boolean {
  SECRET_PATTERN.lastIndex = 0;
  return SECRET_PATTERN.test(value);
}

/**
 * Extract all secret references from a string
 */
export function extractSecretReferences(value: string): Array<{ 
  fullMatch: string;
  vault: string;
  item: string;
  field: string;
}> {
  const references: Array<{ fullMatch: string; vault: string; item: string; field: string }> = [];
  SECRET_PATTERN.lastIndex = 0;
  
  let match;
  while ((match = SECRET_PATTERN.exec(value)) !== null) {
    references.push({
      fullMatch: match[0],
      vault: match[1],
      item: match[2],
      field: match[3],
    });
  }
  
  return references;
}

/**
 * Resolve a single secret using 1Password CLI
 * Never logs the actual secret value
 */
export async function resolveSecret(
  vault: string,
  item: string,
  field: string
): Promise<string> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Use op CLI to get the secret
    // --no-newline prevents trailing newline in the output
    const command = `op read "op://${vault}/${item}/${field}" --no-newline`;
    
    const { stdout } = await execAsync(command, {
      timeout: 30000, // 30 second timeout
      env: {
        ...process.env,
        // Ensure OP CLI uses the user's default account
        ['OP_ACCOUNT']: process.env['OP_ACCOUNT'],
      },
    });
    
    return stdout;
  } catch (error) {
    throw new Error(
      `Failed to resolve secret op://${vault}/${item}/${field}: ` +
      (error instanceof Error ? error.message : String(error))
    );
  }
}

/**
 * Recursively resolve all secrets in an object
 * Returns the resolved object and a list of secret paths (not values!)
 */
export async function resolveSecretsInObject<T extends Record<string, unknown>>(
  obj: T
): Promise<{ result: T; resolvedSecrets: string[] }> {
  const resolvedSecrets: string[] = [];
  
  async function recurse(value: unknown): Promise<unknown> {
    if (typeof value === 'string' && containsSecretReferences(value)) {
      let result = value;
      const references = extractSecretReferences(value);
      
      for (const ref of references) {
        const secretValue = await resolveSecret(ref.vault, ref.item, ref.field);
        result = result.replace(ref.fullMatch, secretValue);
        // Log only the path, never the value
        resolvedSecrets.push(`op://${ref.vault}/${ref.item}/${ref.field}`);
      }
      
      return result;
    }
    
    if (Array.isArray(value)) {
      return Promise.all(value.map(recurse));
    }
    
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = await recurse(val);
      }
      return result;
    }
    
    return value;
  }
  
  return { 
    result: await recurse(obj) as T, 
    resolvedSecrets: [...new Set(resolvedSecrets)]
  };
}

// ============================================================================
// YAML Parsing
// ============================================================================

let yamlParser: typeof import('yaml') | null = null;

/**
 * Lazy load YAML parser
 */
async function getYamlParser(): Promise<typeof import('yaml')> {
  if (!yamlParser) {
    yamlParser = await import('yaml');
  }
  return yamlParser;
}

/**
 * Parse YAML content to an object
 */
export async function parseYaml(content: string): Promise<Record<string, unknown>> {
  const yaml = await getYamlParser();
  return yaml.parse(content) as Record<string, unknown>;
}

/**
 * Stringify an object to YAML
 */
export async function stringifyYaml(obj: Record<string, unknown>): Promise<string> {
  const yaml = await getYamlParser();
  return yaml.stringify(obj, {
    indent: 2,
    lineWidth: 0, // Don't wrap lines
  });
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Convert TypeBox ValueError to ConfigValidationError
 */
function convertValidationError(error: ValueError): ConfigValidationError {
  const path = error.path;
  const message = error.message;
  
  // Generate helpful suggestions based on error type
  let suggestion: string | undefined;
  
  if (path.includes('strategy')) {
    suggestion = 'Valid strategies are: parallel, map-reduce, pipeline, tree';
  } else if (path.includes('apiVersion')) {
    suggestion = 'apiVersion must be "dash.io/v1"';
  } else if (path.includes('kind')) {
    suggestion = 'kind must be "Swarm"';
  } else if (path.includes('budget') && path.includes('amount')) {
    suggestion = 'Budget amount must be a positive number';
  } else if (path.includes('initialAgents') || path.includes('maxAgents')) {
    suggestion = 'Agent counts must be positive integers';
  }
  
  return {
    path,
    message,
    code: String(error.type),
    suggestion,
  };
}

/**
 * Validate a config against the schema
 */
export function validateConfig(
  config: Record<string, unknown>,
  filePath?: string
): { valid: boolean; errors: ConfigValidationError[] } {
  const errors: ConfigValidationError[] = [];
  
  // Check using TypeBox Value.Check
  if (!Value.Check(SwarmYamlSchema, config)) {
    const iterator = Value.Errors(SwarmYamlSchema, config);
    for (const error of iterator) {
      errors.push(convertValidationError(error));
    }
  }
  
  // Additional custom validations
  const swarmConfig = config as Partial<SwarmYamlConfig>;
  const specAny = swarmConfig.spec as any;
  
  // Check that initialAgents <= maxAgents
  if (specAny?.initialAgents && specAny?.maxAgents) {
    if (specAny.initialAgents > specAny.maxAgents) {
      errors.push({
        path: '/spec/initialAgents',
        message: `initialAgents (${specAny.initialAgents}) cannot be greater than maxAgents (${specAny.maxAgents})`,
        code: 'custom/invalid_agent_count',
        suggestion: 'Set initialAgents <= maxAgents',
      });
    }
  }
  
  // Check budget thresholds
  if (specAny?.budget) {
    const { warningThreshold, criticalThreshold } = specAny.budget;
    if (warningThreshold !== undefined && criticalThreshold !== undefined) {
      if (warningThreshold > criticalThreshold) {
        errors.push({
          path: '/spec/budget/warningThreshold',
          message: 'warningThreshold cannot be greater than criticalThreshold',
          code: 'custom/invalid_thresholds',
          suggestion: 'Set warningThreshold <= criticalThreshold',
        });
      }
    }
  }
  
  // Check GitOps config has valid interval
  if (specAny?.gitops?.watchInterval) {
    if (specAny.gitops.watchInterval < 100) {
      errors.push({
        path: '/spec/gitops/watchInterval',
        message: 'watchInterval must be at least 100ms',
        code: 'custom/invalid_interval',
        suggestion: 'Set watchInterval >= 100',
      });
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate and throw on error
 */
export function validateConfigOrThrow(
  config: Record<string, unknown>,
  filePath?: string
): void {
  const { valid, errors } = validateConfig(config, filePath);
  if (!valid) {
    throw new ConfigValidationException(
      `Configuration validation failed for ${filePath || 'unknown file'}`,
      errors,
      filePath
    );
  }
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Calculate MD5 checksum of content
 */
function calculateChecksum(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Load and process a YAML configuration file
 */
export async function loadConfig(
  options: ConfigLoadOptions & { filePath: string; cwd?: string; substituteEnv?: boolean; resolveSecrets?: boolean; validate?: boolean }
): Promise<ConfigLoadResult> {
  const {
    filePath,
    cwd = process.cwd(),
    substituteEnv = true,
    resolveSecrets = false,
    validate = true,
  } = options;
  
  const resolvedPath = resolve(cwd, filePath);
  
  // Check file exists
  if (!existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found: ${resolvedPath}`);
  }
  
  // Read file
  let rawContent: string;
  try {
    rawContent = await readFile(resolvedPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  
  // Parse YAML
  let parsed: Record<string, unknown>;
  try {
    parsed = await parseYaml(rawContent);
  } catch (error) {
    throw new Error(
      `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  
  // Substitute environment variables
  let substitutedEnvVars: string[] = [];
  if (substituteEnv) {
    const envResult = substituteEnvVarsInObject(parsed);
    parsed = envResult.result;
    substitutedEnvVars = envResult.substituted;
  }
  
  // Resolve secrets
  let resolvedSecrets: string[] = [];
  if (resolveSecrets) {
    const secretResult = await resolveSecretsInObject(parsed);
    parsed = secretResult.result;
    resolvedSecrets = secretResult.resolvedSecrets;
  }
  
  // Validate against schema
  if (validate) {
    validateConfigOrThrow(parsed, resolvedPath);
  }
  
  const checksum = calculateChecksum(rawContent);
  
  return {
    config: parsed as SwarmYamlConfig,
    rawContent,
    filePath: resolvedPath,
    checksum,
    resolvedSecrets,
    substitutedEnvVars,
  };
}

/**
 * Load multiple config files and merge them
 * Later files override earlier ones
 */
export async function loadConfigs(
  filePaths: string[],
  options: Omit<ConfigLoadOptions, 'filePath'>
): Promise<ConfigLoadResult> {
  if (filePaths.length === 0) {
    throw new Error('At least one config file path is required');
  }
  
  // Load first config
  let result = await loadConfig({ ...options, filePath: filePaths[0] } as ConfigLoadOptions & { filePath: string });
  
  // Merge subsequent configs
  for (let i = 1; i < filePaths.length; i++) {
    const next = await loadConfig({ ...options, filePath: filePaths[i] } as ConfigLoadOptions & { filePath: string });
    
    // Deep merge configs (next overrides result)
    result.config = deepMerge(result.config, next.config);
    result.rawContent += `\n---\n${next.rawContent}`;
    result.filePath += `, ${next.filePath}`;
    result.resolvedSecrets = [...result.resolvedSecrets, ...next.resolvedSecrets];
    result.substitutedEnvVars = [...result.substitutedEnvVars, ...next.substitutedEnvVars];
  }
  
  return result;
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result: Record<string, unknown> = { ...target };
  
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      key in result &&
      result[key] !== null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

// ============================================================================
// Conversion to SwarmConfig
// ============================================================================

import type { SwarmConfig } from '../core/swarm';

/**
 * Convert SwarmYamlConfig to SwarmConfig for use with SwarmManager
 */
export function toSwarmConfig(yamlConfig: SwarmYamlConfig): SwarmConfig {
  const { spec, metadata } = yamlConfig;
  
  const specAny = spec as Record<string, unknown>;
  const metadataAny = metadata as Record<string, unknown>;
  
  return {
    name: metadata.name,
    task: spec.task,
    initialAgents: spec.initialAgents ?? 5,
    maxAgents: spec.maxAgents ?? 50,
    strategy: (spec.strategy ?? 'parallel') as SwarmStrategy,
    model: specAny['model'] as string | undefined,
    budget: specAny['budget'] as SwarmConfig['budget'],
    safety: specAny['safety'] ? {
      fileSandbox: specAny['safety']?.['fileSandbox'] as boolean | undefined,
      networkAllowlist: specAny['safety']?.['networkAllowlist'] as string[] | undefined,
      commandBlacklist: specAny['safety']?.['commandBlacklist'] as string[] | undefined,
      maxExecutionTime: specAny['safety']?.['maxExecutionTime'] as number | undefined,
    } : undefined,
    metadata: {
      ...((metadataAny['labels'] as Record<string, string>) || {}),
      ...((metadataAny['annotations'] as Record<string, string>) || {}),
      description: metadataAny['description'] as string | undefined,
    },
  };
}
