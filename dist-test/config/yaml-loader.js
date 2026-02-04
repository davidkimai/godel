"use strict";
/**
 * YAML Configuration Loader
 *
 * Parses and validates swarm.yaml files with support for:
 * - Environment variable substitution ($VAR, ${VAR}, ${VAR:-default})
 * - 1Password secret resolution ({{ op://vault/item/field }})
 * - Schema validation using TypeBox
 * - Error handling with helpful suggestions
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
exports.ConfigValidationException = void 0;
exports.substituteEnvVars = substituteEnvVars;
exports.substituteEnvVarsInObject = substituteEnvVarsInObject;
exports.containsSecretReferences = containsSecretReferences;
exports.extractSecretReferences = extractSecretReferences;
exports.resolveSecret = resolveSecret;
exports.resolveSecretsInObject = resolveSecretsInObject;
exports.parseYaml = parseYaml;
exports.stringifyYaml = stringifyYaml;
exports.validateConfig = validateConfig;
exports.validateConfigOrThrow = validateConfigOrThrow;
exports.loadConfig = loadConfig;
exports.loadConfigs = loadConfigs;
exports.toSwarmConfig = toSwarmConfig;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const value_1 = require("@sinclair/typebox/value");
const types_1 = require("./types");
var types_2 = require("./types");
Object.defineProperty(exports, "ConfigValidationException", { enumerable: true, get: function () { return types_2.ConfigValidationException; } });
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
function substituteEnvVars(value, env = process.env) {
    const substituted = [];
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
function substituteEnvVarsInObject(obj, env = process.env) {
    const allSubstituted = [];
    function recurse(value) {
        if (typeof value === 'string') {
            const { result, substituted } = substituteEnvVars(value, env);
            allSubstituted.push(...substituted);
            return result;
        }
        if (Array.isArray(value)) {
            return value.map(recurse);
        }
        if (value !== null && typeof value === 'object') {
            const result = {};
            for (const [key, val] of Object.entries(value)) {
                result[key] = recurse(val);
            }
            return result;
        }
        return value;
    }
    return {
        result: recurse(obj),
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
function containsSecretReferences(value) {
    SECRET_PATTERN.lastIndex = 0;
    return SECRET_PATTERN.test(value);
}
/**
 * Extract all secret references from a string
 */
function extractSecretReferences(value) {
    const references = [];
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
async function resolveSecret(vault, item, field) {
    try {
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
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
    }
    catch (error) {
        throw new Error(`Failed to resolve secret op://${vault}/${item}/${field}: ` +
            (error instanceof Error ? error.message : String(error)));
    }
}
/**
 * Recursively resolve all secrets in an object
 * Returns the resolved object and a list of secret paths (not values!)
 */
async function resolveSecretsInObject(obj) {
    const resolvedSecrets = [];
    async function recurse(value) {
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
            const result = {};
            for (const [key, val] of Object.entries(value)) {
                result[key] = await recurse(val);
            }
            return result;
        }
        return value;
    }
    return {
        result: await recurse(obj),
        resolvedSecrets: [...new Set(resolvedSecrets)]
    };
}
// ============================================================================
// YAML Parsing
// ============================================================================
let yamlParser = null;
/**
 * Lazy load YAML parser
 */
async function getYamlParser() {
    if (!yamlParser) {
        yamlParser = await Promise.resolve().then(() => __importStar(require('yaml')));
    }
    return yamlParser;
}
/**
 * Parse YAML content to an object
 */
async function parseYaml(content) {
    const yaml = await getYamlParser();
    return yaml.parse(content);
}
/**
 * Stringify an object to YAML
 */
async function stringifyYaml(obj) {
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
function convertValidationError(error) {
    const path = error.path;
    const message = error.message;
    // Generate helpful suggestions based on error type
    let suggestion;
    if (path.includes('strategy')) {
        suggestion = 'Valid strategies are: parallel, map-reduce, pipeline, tree';
    }
    else if (path.includes('apiVersion')) {
        suggestion = 'apiVersion must be "dash.io/v1"';
    }
    else if (path.includes('kind')) {
        suggestion = 'kind must be "Swarm"';
    }
    else if (path.includes('budget') && path.includes('amount')) {
        suggestion = 'Budget amount must be a positive number';
    }
    else if (path.includes('initialAgents') || path.includes('maxAgents')) {
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
function validateConfig(config, filePath) {
    const errors = [];
    // Check using TypeBox Value.Check
    if (!value_1.Value.Check(types_1.SwarmYamlSchema, config)) {
        const iterator = value_1.Value.Errors(types_1.SwarmYamlSchema, config);
        for (const error of iterator) {
            errors.push(convertValidationError(error));
        }
    }
    // Additional custom validations
    const swarmConfig = config;
    const specAny = swarmConfig.spec;
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
function validateConfigOrThrow(config, filePath) {
    const { valid, errors } = validateConfig(config, filePath);
    if (!valid) {
        throw new types_1.ConfigValidationException(`Configuration validation failed for ${filePath || 'unknown file'}`, errors, filePath);
    }
}
// ============================================================================
// Config Loading
// ============================================================================
/**
 * Calculate MD5 checksum of content
 */
function calculateChecksum(content) {
    return (0, crypto_1.createHash)('md5').update(content).digest('hex');
}
/**
 * Load and process a YAML configuration file
 */
async function loadConfig(options) {
    const { filePath, cwd = process.cwd(), substituteEnv = true, resolveSecrets = false, validate = true, } = options;
    const resolvedPath = (0, path_1.resolve)(cwd, filePath);
    // Check file exists
    if (!(0, fs_1.existsSync)(resolvedPath)) {
        throw new Error(`Configuration file not found: ${resolvedPath}`);
    }
    // Read file
    let rawContent;
    try {
        rawContent = await (0, promises_1.readFile)(resolvedPath, 'utf-8');
    }
    catch (error) {
        throw new Error(`Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Parse YAML
    let parsed;
    try {
        parsed = await parseYaml(rawContent);
    }
    catch (error) {
        throw new Error(`Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Substitute environment variables
    let substitutedEnvVars = [];
    if (substituteEnv) {
        const envResult = substituteEnvVarsInObject(parsed);
        parsed = envResult.result;
        substitutedEnvVars = envResult.substituted;
    }
    // Resolve secrets
    let resolvedSecrets = [];
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
        config: parsed,
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
async function loadConfigs(filePaths, options) {
    if (filePaths.length === 0) {
        throw new Error('At least one config file path is required');
    }
    // Load first config
    let result = await loadConfig({ ...options, filePath: filePaths[0] });
    // Merge subsequent configs
    for (let i = 1; i < filePaths.length; i++) {
        const next = await loadConfig({ ...options, filePath: filePaths[i] });
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
function deepMerge(target, source) {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            key in result &&
            result[key] !== null &&
            typeof result[key] === 'object' &&
            !Array.isArray(result[key])) {
            result[key] = deepMerge(result[key], value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Convert SwarmYamlConfig to SwarmConfig for use with SwarmManager
 */
function toSwarmConfig(yamlConfig) {
    const { spec, metadata } = yamlConfig;
    const specAny = spec;
    const metadataAny = metadata;
    return {
        name: metadata.name,
        task: spec.task,
        initialAgents: spec.initialAgents ?? 5,
        maxAgents: spec.maxAgents ?? 50,
        strategy: (spec.strategy ?? 'parallel'),
        model: specAny['model'],
        budget: specAny['budget'],
        safety: specAny['safety'] ? {
            fileSandbox: specAny['safety']?.['fileSandbox'],
            networkAllowlist: specAny['safety']?.['networkAllowlist'],
            commandBlacklist: specAny['safety']?.['commandBlacklist'],
            maxExecutionTime: specAny['safety']?.['maxExecutionTime'],
        } : undefined,
        metadata: {
            ...(metadataAny['labels'] || {}),
            ...(metadataAny['annotations'] || {}),
            description: metadataAny['description'],
        },
    };
}
