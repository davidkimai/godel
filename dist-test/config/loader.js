"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatValidationErrors = exports.validateConfig = void 0;
exports.loadConfig = loadConfig;
exports.getConfig = getConfig;
exports.reloadConfig = reloadConfig;
exports.clearConfigCache = clearConfigCache;
exports.getConfigSources = getConfigSources;
exports.getConfigValue = getConfigValue;
exports.isFeatureEnabled = isFeatureEnabled;
exports.flattenConfig = flattenConfig;
const fs_1 = require("fs");
const YAML = __importStar(require("yaml"));
const logger_1 = require("../utils/logger");
const schema_1 = require("./schema");
Object.defineProperty(exports, "validateConfig", { enumerable: true, get: function () { return schema_1.validateConfig; } });
Object.defineProperty(exports, "formatValidationErrors", { enumerable: true, get: function () { return schema_1.formatValidationErrors; } });
const defaults_1 = require("./defaults");
const secrets_manager_1 = require("./secrets-manager");
/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const sourceValue = source[key];
        const targetValue = result[key];
        if (sourceValue === undefined) {
            continue;
        }
        if (typeof sourceValue === 'object' &&
            sourceValue !== null &&
            !Array.isArray(sourceValue) &&
            typeof targetValue === 'object' &&
            targetValue !== null &&
            !Array.isArray(targetValue)) {
            result[key] = deepMerge(targetValue, sourceValue);
        }
        else {
            result[key] = sourceValue;
        }
    }
    return result;
}
/**
 * Parse a string value into appropriate type
 */
function parseValue(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    const num = Number(value);
    if (!isNaN(num) && value !== '')
        return num;
    if ((value.startsWith('[') && value.endsWith(']')) ||
        (value.startsWith('{') && value.endsWith('}'))) {
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    return value;
}
/**
 * Load configuration files from the config directory
 */
function loadConfigFiles(configDir, env) {
    const results = [];
    const envFiles = [
        `${configDir}/dash.${env}.yaml`,
        `${configDir}/dash.${env}.yml`,
        `${configDir}/dash.${env}.json`,
    ];
    const baseFiles = [
        `${configDir}/dash.yaml`,
        `${configDir}/dash.yml`,
        `${configDir}/dash.json`,
    ];
    // Load environment-specific config (higher priority)
    for (const filePath of envFiles) {
        if ((0, fs_1.existsSync)(filePath)) {
            try {
                const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
                const config = filePath.endsWith('.json') ? JSON.parse(content) : YAML.parse(content);
                results.push({ config: config, source: filePath });
                break;
            }
            catch (error) {
                results.push({
                    config: {},
                    source: filePath,
                    warning: `Failed to load ${filePath}: ${error.message}`,
                });
            }
        }
    }
    // Load base config (lower priority)
    for (const filePath of baseFiles) {
        if ((0, fs_1.existsSync)(filePath)) {
            try {
                const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
                const config = filePath.endsWith('.json') ? JSON.parse(content) : YAML.parse(content);
                results.push({ config: config, source: filePath });
                break;
            }
            catch (error) {
                results.push({
                    config: {},
                    source: filePath,
                    warning: `Failed to load ${filePath}: ${error.message}`,
                });
            }
        }
    }
    return results;
}
/**
 * Apply environment variable overrides
 */
function applyEnvVarOverrides(config) {
    const overrides = {
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
            const parts = path.split('.');
            let current = config;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = parseValue(value);
        }
    }
}
/**
 * Resolve secrets in configuration values
 */
async function resolveSecretsInConfig(config, secretManager) {
    const result = {};
    for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && (0, secrets_manager_1.containsSecretReferences)(value)) {
            result[key] = await secretManager.resolveInString(value);
        }
        else if (typeof value === 'object' && value !== null) {
            result[key] = await resolveSecretsInObject(value, secretManager);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Recursively resolve secrets in an object
 */
async function resolveSecretsInObject(obj, secretManager) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && (0, secrets_manager_1.containsSecretReferences)(value)) {
            result[key] = await secretManager.resolveInString(value);
        }
        else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result[key] = await resolveSecretsInObject(value, secretManager);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Load configuration from all sources
 */
async function loadConfig(options = {}) {
    const env = options.env || process.env['NODE_ENV'] || 'development';
    const configDir = options.configDir || './config';
    const sources = [];
    const warnings = [];
    // 1. Start with defaults
    let config = { ...defaults_1.defaultConfig };
    sources.push('defaults');
    // 2. Apply environment-specific defaults
    const envDefaults = (0, defaults_1.getEnvironmentDefaults)(env);
    config = deepMerge(config, envDefaults);
    sources.push(`env-defaults:${env}`);
    // 3. Load from config files (YAML or JSON)
    const fileConfigs = loadConfigFiles(configDir, env);
    for (const fileConfig of fileConfigs) {
        config = deepMerge(config, fileConfig.config);
        sources.push(fileConfig.source);
        if (fileConfig.warning)
            warnings.push(fileConfig.warning);
    }
    // 4. Environment variable substitution in loaded config
    if (!options.skipEnvSubstitution) {
        config = (0, secrets_manager_1.substituteEnvVarsInObject)(config);
    }
    // 5. Apply environment variable overrides (highest priority)
    applyEnvVarOverrides(config);
    sources.push('environment-variables');
    // 6. Set the environment
    config['env'] = env;
    // 7. Validate the configuration
    const validation = (0, schema_1.validateConfig)(config);
    if (!validation.success) {
        const errorMessage = (0, schema_1.formatValidationErrors)(validation.errors);
        throw new Error(`Configuration validation failed:\n${errorMessage}`);
    }
    // 8. Resolve secrets if Vault is enabled
    const validConfig = validation.data;
    if (options.enableVault && validConfig.vault) {
        const secretManager = (0, secrets_manager_1.getGlobalSecretManager)(validConfig.vault);
        const configWithSecrets = await resolveSecretsInConfig(validConfig, secretManager);
        sources.push('vault-secrets');
        // Re-validate after secret resolution
        const finalValidation = (0, schema_1.validateConfig)(configWithSecrets);
        if (!finalValidation.success) {
            throw new Error(`Configuration validation failed after secret resolution:\n${(0, schema_1.formatValidationErrors)(finalValidation.errors)}`);
        }
        return { config: finalValidation.data, sources, warnings };
    }
    return { config: validConfig, sources, warnings };
}
// ============================================================================
// Singleton Instance
// ============================================================================
let cachedConfig = null;
let cachedSources = [];
/**
 * Get or load the global configuration
 */
async function getConfig(options) {
    if (cachedConfig && !options?.env) {
        return cachedConfig;
    }
    const loaded = await loadConfig(options);
    cachedConfig = loaded.config;
    cachedSources = loaded.sources;
    if (loaded.warnings.length > 0) {
        for (const warning of loaded.warnings) {
            logger_1.logger.warn('config', warning);
        }
    }
    logger_1.logger.debug('config', 'Configuration loaded', { sources: loaded.sources });
    return cachedConfig;
}
/**
 * Reload the global configuration
 */
async function reloadConfig(options) {
    cachedConfig = null;
    return getConfig(options);
}
/**
 * Clear the cached configuration
 */
function clearConfigCache() {
    cachedConfig = null;
    cachedSources = [];
}
/**
 * Get the configuration sources
 */
function getConfigSources() {
    return [...cachedSources];
}
// ============================================================================
// Utilities
// ============================================================================
/**
 * Get a value from config by path
 */
function getConfigValue(config, path, defaultValue) {
    const parts = path.split('.');
    let current = config;
    for (const part of parts) {
        if (current === null || typeof current !== 'object') {
            return defaultValue;
        }
        current = current[part];
    }
    return current ?? defaultValue;
}
/**
 * Check if a feature is enabled
 */
function isFeatureEnabled(config, feature) {
    return config.features[feature] ?? false;
}
/**
 * Get configuration as a flat object (for display)
 */
function flattenConfig(config, prefix = '', hideSecrets = true) {
    const result = {};
    for (const [key, value] of Object.entries(config)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value === null || value === undefined) {
            result[fullKey] = 'null';
        }
        else if (typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenConfig(value, fullKey, hideSecrets));
        }
        else {
            if (hideSecrets && isSensitiveKey(fullKey)) {
                result[fullKey] = '***';
            }
            else if (Array.isArray(value)) {
                result[fullKey] = JSON.stringify(value);
            }
            else {
                result[fullKey] = String(value);
            }
        }
    }
    return result;
}
/**
 * Check if a config key contains sensitive data
 */
function isSensitiveKey(key) {
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
