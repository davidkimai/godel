"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretManager = exports.SecretResolutionError = void 0;
exports.parseSecretReference = parseSecretReference;
exports.containsSecretReferences = containsSecretReferences;
exports.extractSecretReferences = extractSecretReferences;
exports.getGlobalSecretManager = getGlobalSecretManager;
exports.resetGlobalSecretManager = resetGlobalSecretManager;
exports.resolveSecret = resolveSecret;
exports.hasSecretReferences = hasSecretReferences;
exports.substituteEnvVars = substituteEnvVars;
exports.substituteEnvVarsInObject = substituteEnvVarsInObject;
// ============================================================================
// Error Classes
// ============================================================================
class SecretResolutionError extends Error {
    constructor(message, reference, provider, cause) {
        super(message);
        this.reference = reference;
        this.provider = provider;
        this.cause = cause;
        this.name = 'SecretResolutionError';
    }
}
exports.SecretResolutionError = SecretResolutionError;
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
function parseSecretReference(ref) {
    const match = ref.match(/^\$\{(\w+):([^?#}]+)(?:#([^}]+))?(?:\?default=([^}]+))?\}$/);
    if (!match) {
        throw new SecretResolutionError(`Invalid secret reference format: ${ref}`, ref, 'env');
    }
    const [, provider, path, key, defaultValue] = match;
    if (!['vault', 'env', 'file'].includes(provider.toLowerCase())) {
        throw new SecretResolutionError(`Unknown secret provider: ${provider}. Use VAULT, ENV, or FILE.`, ref, provider.toLowerCase());
    }
    return {
        provider: provider.toLowerCase(),
        path,
        key,
        default: defaultValue,
    };
}
/**
 * Check if a string contains secret references
 */
function containsSecretReferences(value) {
    return /\$\{(?:VAULT|ENV|FILE):[^}]+\}/i.test(value);
}
/**
 * Extract all secret references from a string
 */
function extractSecretReferences(value) {
    const matches = value.match(/\$\{(?:VAULT|ENV|FILE):[^}]+\}/gi);
    return matches || [];
}
// ============================================================================
// Environment Variable Resolver
// ============================================================================
function resolveEnvVar(reference) {
    const value = process.env[reference.path];
    if (value === undefined) {
        if (reference.default !== undefined) {
            return {
                value: reference.default,
                source: `env:${reference.path} (default)`,
                resolved: true,
            };
        }
        throw new SecretResolutionError(`Environment variable not found: ${reference.path}`, reference.path, 'env');
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
const fs_1 = require("fs");
function resolveFile(reference) {
    try {
        const content = (0, fs_1.readFileSync)(reference.path, 'utf-8').trim();
        return {
            value: content,
            source: `file:${reference.path}`,
            resolved: true,
        };
    }
    catch (error) {
        if (reference.default !== undefined) {
            return {
                value: reference.default,
                source: `file:${reference.path} (default)`,
                resolved: true,
            };
        }
        throw new SecretResolutionError(`Failed to read file: ${reference.path}`, reference.path, 'file', error);
    }
}
// ============================================================================
// Vault Resolver
// ============================================================================
class VaultResolver {
    constructor(config) {
        this.cache = new Map();
        this.config = config;
    }
    async resolve(reference) {
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
                throw new SecretResolutionError(`Secret not found in Vault: ${reference.path}`, reference.path, 'vault');
            }
            // Extract specific key if requested
            let value = secret;
            if (reference.key) {
                if (typeof secret === 'object' && secret !== null) {
                    value = secret[reference.key];
                    if (value === undefined) {
                        throw new SecretResolutionError(`Key '${reference.key}' not found in secret: ${reference.path}`, reference.path, 'vault');
                    }
                }
                else {
                    throw new SecretResolutionError(`Cannot extract key from non-object secret: ${reference.path}`, reference.path, 'vault');
                }
            }
            // Cache the result
            this.cache.set(cacheKey, value);
            return {
                value: String(value),
                source: `vault:${reference.path}${reference.key ? '#' + reference.key : ''}`,
                resolved: true,
            };
        }
        catch (error) {
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
    async fetchFromVault(path) {
        const { address, token, namespace, kvVersion, timeoutMs, tlsVerify } = this.config;
        if (!token) {
            throw new SecretResolutionError('Vault token not configured', path, 'vault');
        }
        // Build the URL based on KV version
        let url;
        if (kvVersion === 'v2') {
            // For KV v2: /v1/secret/data/{path}
            url = `${address}/v1/secret/data/${path}`;
        }
        else {
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
                throw new SecretResolutionError(`Vault request failed: ${response.status} ${response.statusText}`, path, 'vault');
            }
            const data = await response.json();
            // KV v2 returns { data: { data: { ... } } }
            // KV v1 returns { data: { ... } }
            if (kvVersion === 'v2') {
                return data.data?.data;
            }
            else {
                return data.data;
            }
        }
        catch (error) {
            clearTimeout(timeout);
            if (error instanceof SecretResolutionError) {
                throw error;
            }
            throw new SecretResolutionError(`Vault request failed: ${error.message}`, path, 'vault', error);
        }
    }
    clearCache() {
        this.cache.clear();
    }
}
// ============================================================================
// Secret Manager
// ============================================================================
class SecretManager {
    constructor(vaultConfig) {
        this.enabled = true;
        if (vaultConfig) {
            this.vaultResolver = new VaultResolver(vaultConfig);
        }
    }
    /**
     * Enable/disable secret resolution
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    /**
     * Resolve a single secret reference
     */
    async resolve(reference) {
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
                    throw new SecretResolutionError('Vault not configured', ref.path, 'vault');
                }
                return this.vaultResolver.resolve(ref);
            default:
                throw new SecretResolutionError(`Unknown provider: ${ref.provider}`, ref.path, ref.provider);
        }
    }
    /**
     * Resolve all secrets in a string value
     */
    async resolveInString(value) {
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
    async resolveInObject(obj) {
        if (!this.enabled) {
            return obj;
        }
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && containsSecretReferences(value)) {
                result[key] = await this.resolveInString(value);
            }
            else if (typeof value === 'object' && value !== null) {
                result[key] = await this.resolveInObject(value);
            }
            else {
                result[key] = value;
            }
        }
        return result;
    }
    /**
     * Clear the Vault cache
     */
    clearCache() {
        this.vaultResolver?.clearCache();
    }
}
exports.SecretManager = SecretManager;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalSecretManager = null;
function getGlobalSecretManager(vaultConfig) {
    if (!globalSecretManager) {
        globalSecretManager = new SecretManager(vaultConfig);
    }
    return globalSecretManager;
}
function resetGlobalSecretManager() {
    globalSecretManager = null;
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Quick resolve a secret reference
 */
async function resolveSecret(reference, vaultConfig) {
    const manager = getGlobalSecretManager(vaultConfig);
    const result = await manager.resolve(reference);
    return result.value;
}
/**
 * Check if value contains secret references
 */
function hasSecretReferences(value) {
    return containsSecretReferences(value);
}
/**
 * Substitute environment variables in a string
 * Supports: $VAR, ${VAR}, ${VAR:-default}, ${VAR:=default}
 */
function substituteEnvVars(value) {
    return value.replace(/\$\{(\w+)(?::-([^}]*))?(?::=([^}]*))?\}|\$(\w+)/g, (match, var1, default1, default2, var2) => {
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
    });
}
/**
 * Substitute environment variables in an object
 */
function substituteEnvVarsInObject(obj) {
    if (typeof obj === 'string') {
        return substituteEnvVars(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => substituteEnvVarsInObject(item));
    }
    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = substituteEnvVarsInObject(value);
        }
        return result;
    }
    return obj;
}
