/**
 * Secrets Manager
 * 
 * Handles secret resolution from multiple providers:
 * - HashiCorp Vault
 * - Environment variables
 * - Files
 * 
 * Supports ${VAULT:secret/path} and ${VAULT:secret/path#key} syntax
 * as well as ${ENV:VAR_NAME} and ${FILE:/path/to/file} syntax.
 */

import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export type SecretProvider = 'vault' | 'env' | 'file';

export interface SecretReference {
  provider: SecretProvider;
  path: string;
  key?: string;
  default?: string;
}

export interface SecretResolutionResult {
  value: string;
  source: string;
  resolved: boolean;
}

export interface VaultConfig {
  address: string;
  token?: string;
  namespace?: string;
  kvVersion: 'v1' | 'v2';
  timeoutMs: number;
  tlsVerify: boolean;
}

// ============================================================================
// Error Classes
// ============================================================================

export class SecretResolutionError extends Error {
  constructor(
    message: string,
    public readonly reference: string,
    public readonly provider: SecretProvider,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SecretResolutionError';
  }
}

// ============================================================================
// Secret Reference Parser
// ============================================================================

/**
 * Parse a secret reference string
 * Supported formats:
 * - ${VAULT:secret/path} - Full secret value
 * - ${VAULT:secret/path#key} - Specific key from secret
 * - ${VAULT:secret/path?default=value} - With default value
 * - ${ENV:VAR_NAME} - Environment variable
 * - ${FILE:/path/to/file} - File contents
 */
export function parseSecretReference(ref: string): SecretReference {
  const match = ref.match(/^\$\{(\w+):([^?#}]+)(?:#([^}]+))?(?:\?default=([^}]+))?\}$/);
  
  if (!match) {
    throw new SecretResolutionError(
      `Invalid secret reference format: ${ref}`,
      ref,
      'env'
    );
  }
  
  const [, provider, path, key, defaultValue] = match;
  
  if (!['vault', 'env', 'file'].includes(provider.toLowerCase())) {
    throw new SecretResolutionError(
      `Unknown secret provider: ${provider}. Use VAULT, ENV, or FILE.`,
      ref,
      provider.toLowerCase() as SecretProvider
    );
  }
  
  return {
    provider: provider.toLowerCase() as SecretProvider,
    path,
    key,
    default: defaultValue,
  };
}

/**
 * Check if a string contains secret references
 */
export function containsSecretReferences(value: string): boolean {
  return /\$\{(?:VAULT|ENV|FILE):[^}]+\}/i.test(value);
}

/**
 * Extract all secret references from a string
 */
export function extractSecretReferences(value: string): string[] {
  const matches = value.match(/\$\{(?:VAULT|ENV|FILE):[^}]+\}/gi);
  return matches || [];
}

// ============================================================================
// Environment Variable Resolver
// ============================================================================

function resolveEnvVar(reference: SecretReference): SecretResolutionResult {
  const value = process.env[reference.path];
  
  if (value === undefined) {
    if (reference.default !== undefined) {
      return {
        value: reference.default,
        source: `env:${reference.path} (default)`,
        resolved: true,
      };
    }
    throw new SecretResolutionError(
      `Environment variable not found: ${reference.path}`,
      reference.path,
      'env'
    );
  }
  
  return {
    value,
    source: `env:${reference.path}`,
    resolved: true,
  };
}

// ============================================================================
// File Resolver
// ============================================================================

import { readFileSync } from 'fs';

function resolveFile(reference: SecretReference): SecretResolutionResult {
  try {
    const content = readFileSync(reference.path, 'utf-8').trim();
    return {
      value: content,
      source: `file:${reference.path}`,
      resolved: true,
    };
  } catch (error) {
    if (reference.default !== undefined) {
      return {
        value: reference.default,
        source: `file:${reference.path} (default)`,
        resolved: true,
      };
    }
    throw new SecretResolutionError(
      `Failed to read file: ${reference.path}`,
      reference.path,
      'file',
      error as Error
    );
  }
}

// ============================================================================
// Vault Resolver
// ============================================================================

class VaultResolver {
  private config: VaultConfig;
  private cache: Map<string, unknown> = new Map();

  constructor(config: VaultConfig) {
    this.config = config;
  }

  async resolve(reference: SecretReference): Promise<SecretResolutionResult> {
    const cacheKey = `${reference.path}#${reference.key || 'full'}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return {
        value: String(cached),
        source: `vault:${reference.path} (cached)`,
        resolved: true,
      };
    }

    try {
      const secret = await this.fetchFromVault(reference.path);
      
      if (!secret) {
        if (reference.default !== undefined) {
          return {
            value: reference.default,
            source: `vault:${reference.path} (default)`,
            resolved: true,
          };
        }
        throw new SecretResolutionError(
          `Secret not found in Vault: ${reference.path}`,
          reference.path,
          'vault'
        );
      }

      // Extract specific key if requested
      let value: unknown = secret;
      if (reference.key) {
        if (typeof secret === 'object' && secret !== null) {
          value = (secret as Record<string, unknown>)[reference.key];
          if (value === undefined) {
            throw new SecretResolutionError(
              `Key '${reference.key}' not found in secret: ${reference.path}`,
              reference.path,
              'vault'
            );
          }
        } else {
          throw new SecretResolutionError(
            `Cannot extract key from non-object secret: ${reference.path}`,
            reference.path,
            'vault'
          );
        }
      }

      // Cache the result
      this.cache.set(cacheKey, value);

      return {
        value: String(value),
        source: `vault:${reference.path}${reference.key ? '#' + reference.key : ''}`,
        resolved: true,
      };
    } catch (error) {
      if (reference.default !== undefined) {
        return {
          value: reference.default,
          source: `vault:${reference.path} (default)`,
          resolved: true,
        };
      }
      throw error;
    }
  }

  private async fetchFromVault(path: string): Promise<unknown> {
    const { address, token, namespace, kvVersion, timeoutMs, tlsVerify } = this.config;

    if (!token) {
      throw new SecretResolutionError(
        'Vault token not configured',
        path,
        'vault'
      );
    }

    // Build the URL based on KV version
    let url: string;
    if (kvVersion === 'v2') {
      // For KV v2: /v1/secret/data/{path}
      url = `${address}/v1/secret/data/${path}`;
    } else {
      // For KV v1: /v1/secret/{path}
      url = `${address}/v1/secret/${path}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Vault-Token': token,
          ...(namespace && { 'X-Vault-Namespace': namespace }),
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new SecretResolutionError(
          `Vault request failed: ${response.status} ${response.statusText}`,
          path,
          'vault'
        );
      }

      const data = await response.json();

      // KV v2 returns { data: { data: { ... } } }
      // KV v1 returns { data: { ... } }
      if (kvVersion === 'v2') {
        return data.data?.data;
      } else {
        return data.data;
      }
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof SecretResolutionError) {
        throw error;
      }
      throw new SecretResolutionError(
        `Vault request failed: ${(error as Error).message}`,
        path,
        'vault',
        error as Error
      );
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Secret Manager
// ============================================================================

export class SecretManager {
  private vaultResolver?: VaultResolver;
  private enabled: boolean = true;

  constructor(vaultConfig?: VaultConfig) {
    if (vaultConfig) {
      this.vaultResolver = new VaultResolver(vaultConfig);
    }
  }

  /**
   * Enable/disable secret resolution
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Resolve a single secret reference
   */
  async resolve(reference: string | SecretReference): Promise<SecretResolutionResult> {
    if (!this.enabled) {
      return {
        value: typeof reference === 'string' ? reference : reference.path,
        source: 'disabled',
        resolved: false,
      };
    }

    const ref = typeof reference === 'string' 
      ? parseSecretReference(reference) 
      : reference;

    switch (ref.provider) {
      case 'env':
        return resolveEnvVar(ref);
      case 'file':
        return resolveFile(ref);
      case 'vault':
        if (!this.vaultResolver) {
          throw new SecretResolutionError(
            'Vault not configured',
            ref.path,
            'vault'
          );
        }
        return this.vaultResolver.resolve(ref);
      default:
        throw new SecretResolutionError(
          `Unknown provider: ${ref.provider}`,
          ref.path,
          ref.provider
        );
    }
  }

  /**
   * Resolve all secrets in a string value
   */
  async resolveInString(value: string): Promise<string> {
    if (!this.enabled || !containsSecretReferences(value)) {
      return value;
    }

    const references = extractSecretReferences(value);
    let result = value;

    for (const ref of references) {
      const resolved = await this.resolve(ref);
      result = result.replace(ref, resolved.value);
    }

    return result;
  }

  /**
   * Resolve all secrets in an object recursively
   */
  async resolveInObject<T extends Record<string, unknown>>(obj: T): Promise<T> {
    if (!this.enabled) {
      return obj;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && containsSecretReferences(value)) {
        result[key] = await this.resolveInString(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = await this.resolveInObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Clear the Vault cache
   */
  clearCache(): void {
    this.vaultResolver?.clearCache();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalSecretManager: SecretManager | null = null;

export function getGlobalSecretManager(vaultConfig?: VaultConfig): SecretManager {
  if (!globalSecretManager) {
    globalSecretManager = new SecretManager(vaultConfig);
  }
  return globalSecretManager;
}

export function resetGlobalSecretManager(): void {
  globalSecretManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick resolve a secret reference
 */
export async function resolveSecret(
  reference: string,
  vaultConfig?: VaultConfig
): Promise<string> {
  const manager = getGlobalSecretManager(vaultConfig);
  const result = await manager.resolve(reference);
  return result.value;
}

/**
 * Check if value contains secret references
 */
export function hasSecretReferences(value: string): boolean {
  return containsSecretReferences(value);
}

/**
 * Substitute environment variables in a string
 * Supports: $VAR, ${VAR}, ${VAR:-default}, ${VAR:=default}
 */
export function substituteEnvVars(value: string): string {
  return value.replace(
    /\$\{(\w+)(?::-([^}]*))?(?::=([^}]*))?\}|\$(\w+)/g,
    (match, var1, default1, default2, var2) => {
      const varName = var1 || var2;
      const defaultValue = default1 || default2;
      
      if (varName) {
        const envValue = process.env[varName];
        if (envValue !== undefined) {
          return envValue;
        }
        if (defaultValue !== undefined) {
          // Set the default if using := syntax
          if (match.includes(':=')) {
            process.env[varName] = defaultValue;
          }
          return defaultValue;
        }
      }
      return match; // Keep original if not found
    }
  );
}

/**
 * Substitute environment variables in an object
 */
export function substituteEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map((item) => substituteEnvVarsInObject(item)) as unknown as T;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsInObject(value);
    }
    return result as T;
  }
  
  return obj;
}
