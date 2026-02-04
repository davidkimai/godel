"use strict";
/**
 * Configuration System
 *
 * Comprehensive configuration management for Dash with:
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
 * console.log(config.server.port);
 * console.log(config.database.url);
 *
 * // Check if a feature is enabled
 * if (isFeatureEnabled(config, 'metrics')) {
 *   // Enable metrics
 * }
 * ```
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.substituteEnvVars = exports.extractSecretReferences = exports.containsSecretReferences = exports.parseSecretReference = exports.hasSecretReferences = exports.resolveSecret = exports.resetGlobalSecretManager = exports.getGlobalSecretManager = exports.SecretResolutionError = exports.SecretManager = exports.getConfigSources = exports.flattenConfig = exports.isFeatureEnabled = exports.getConfigValue = exports.clearConfigCache = exports.reloadConfig = exports.getConfig = exports.loadConfig = exports.configMetadata = exports.getEnvironmentDefaults = exports.testConfig = exports.productionConfig = exports.developmentConfig = exports.defaultVaultConfig = exports.defaultEventBusConfig = exports.defaultOpenClawConfig = exports.defaultBudgetConfig = exports.defaultMetricsConfig = exports.defaultLoggingConfig = exports.defaultAuthConfig = exports.defaultRedisConfig = exports.defaultDatabaseConfig = exports.defaultServerConfig = exports.defaultConfig = exports.getPathIssues = exports.formatValidationErrors = exports.validateConfigOrThrow = exports.validateConfig = exports.vaultSchema = exports.eventBusSchema = exports.openclawSchema = exports.budgetSchema = exports.metricsSchema = exports.loggingSchema = exports.authSchema = exports.redisSchema = exports.databaseSslSchema = exports.databaseSchema = exports.serverSchema = exports.dashConfigSchema = void 0;
exports.substituteEnvVarsInObject = void 0;
// ============================================================================
// Schema & Validation
// ============================================================================
var schema_1 = require("./schema");
// Schemas
Object.defineProperty(exports, "dashConfigSchema", { enumerable: true, get: function () { return schema_1.dashConfigSchema; } });
Object.defineProperty(exports, "serverSchema", { enumerable: true, get: function () { return schema_1.serverSchema; } });
Object.defineProperty(exports, "databaseSchema", { enumerable: true, get: function () { return schema_1.databaseSchema; } });
Object.defineProperty(exports, "databaseSslSchema", { enumerable: true, get: function () { return schema_1.databaseSslSchema; } });
Object.defineProperty(exports, "redisSchema", { enumerable: true, get: function () { return schema_1.redisSchema; } });
Object.defineProperty(exports, "authSchema", { enumerable: true, get: function () { return schema_1.authSchema; } });
Object.defineProperty(exports, "loggingSchema", { enumerable: true, get: function () { return schema_1.loggingSchema; } });
Object.defineProperty(exports, "metricsSchema", { enumerable: true, get: function () { return schema_1.metricsSchema; } });
Object.defineProperty(exports, "budgetSchema", { enumerable: true, get: function () { return schema_1.budgetSchema; } });
Object.defineProperty(exports, "openclawSchema", { enumerable: true, get: function () { return schema_1.openclawSchema; } });
Object.defineProperty(exports, "eventBusSchema", { enumerable: true, get: function () { return schema_1.eventBusSchema; } });
Object.defineProperty(exports, "vaultSchema", { enumerable: true, get: function () { return schema_1.vaultSchema; } });
// Validation functions
Object.defineProperty(exports, "validateConfig", { enumerable: true, get: function () { return schema_1.validateConfig; } });
Object.defineProperty(exports, "validateConfigOrThrow", { enumerable: true, get: function () { return schema_1.validateConfigOrThrow; } });
Object.defineProperty(exports, "formatValidationErrors", { enumerable: true, get: function () { return schema_1.formatValidationErrors; } });
Object.defineProperty(exports, "getPathIssues", { enumerable: true, get: function () { return schema_1.getPathIssues; } });
// ============================================================================
// Defaults
// ============================================================================
var defaults_1 = require("./defaults");
// Default configs
Object.defineProperty(exports, "defaultConfig", { enumerable: true, get: function () { return defaults_1.defaultConfig; } });
Object.defineProperty(exports, "defaultServerConfig", { enumerable: true, get: function () { return defaults_1.defaultServerConfig; } });
Object.defineProperty(exports, "defaultDatabaseConfig", { enumerable: true, get: function () { return defaults_1.defaultDatabaseConfig; } });
Object.defineProperty(exports, "defaultRedisConfig", { enumerable: true, get: function () { return defaults_1.defaultRedisConfig; } });
Object.defineProperty(exports, "defaultAuthConfig", { enumerable: true, get: function () { return defaults_1.defaultAuthConfig; } });
Object.defineProperty(exports, "defaultLoggingConfig", { enumerable: true, get: function () { return defaults_1.defaultLoggingConfig; } });
Object.defineProperty(exports, "defaultMetricsConfig", { enumerable: true, get: function () { return defaults_1.defaultMetricsConfig; } });
Object.defineProperty(exports, "defaultBudgetConfig", { enumerable: true, get: function () { return defaults_1.defaultBudgetConfig; } });
Object.defineProperty(exports, "defaultOpenClawConfig", { enumerable: true, get: function () { return defaults_1.defaultOpenClawConfig; } });
Object.defineProperty(exports, "defaultEventBusConfig", { enumerable: true, get: function () { return defaults_1.defaultEventBusConfig; } });
Object.defineProperty(exports, "defaultVaultConfig", { enumerable: true, get: function () { return defaults_1.defaultVaultConfig; } });
// Environment-specific
Object.defineProperty(exports, "developmentConfig", { enumerable: true, get: function () { return defaults_1.developmentConfig; } });
Object.defineProperty(exports, "productionConfig", { enumerable: true, get: function () { return defaults_1.productionConfig; } });
Object.defineProperty(exports, "testConfig", { enumerable: true, get: function () { return defaults_1.testConfig; } });
Object.defineProperty(exports, "getEnvironmentDefaults", { enumerable: true, get: function () { return defaults_1.getEnvironmentDefaults; } });
// Metadata
Object.defineProperty(exports, "configMetadata", { enumerable: true, get: function () { return defaults_1.configMetadata; } });
// ============================================================================
// Loader
// ============================================================================
var loader_1 = require("./loader");
// Main functions
Object.defineProperty(exports, "loadConfig", { enumerable: true, get: function () { return loader_1.loadConfig; } });
Object.defineProperty(exports, "getConfig", { enumerable: true, get: function () { return loader_1.getConfig; } });
Object.defineProperty(exports, "reloadConfig", { enumerable: true, get: function () { return loader_1.reloadConfig; } });
Object.defineProperty(exports, "clearConfigCache", { enumerable: true, get: function () { return loader_1.clearConfigCache; } });
// Utilities
Object.defineProperty(exports, "getConfigValue", { enumerable: true, get: function () { return loader_1.getConfigValue; } });
Object.defineProperty(exports, "isFeatureEnabled", { enumerable: true, get: function () { return loader_1.isFeatureEnabled; } });
Object.defineProperty(exports, "flattenConfig", { enumerable: true, get: function () { return loader_1.flattenConfig; } });
Object.defineProperty(exports, "getConfigSources", { enumerable: true, get: function () { return loader_1.getConfigSources; } });
// ============================================================================
// Secrets
// ============================================================================
var secrets_manager_1 = require("./secrets-manager");
// Classes
Object.defineProperty(exports, "SecretManager", { enumerable: true, get: function () { return secrets_manager_1.SecretManager; } });
Object.defineProperty(exports, "SecretResolutionError", { enumerable: true, get: function () { return secrets_manager_1.SecretResolutionError; } });
// Functions
Object.defineProperty(exports, "getGlobalSecretManager", { enumerable: true, get: function () { return secrets_manager_1.getGlobalSecretManager; } });
Object.defineProperty(exports, "resetGlobalSecretManager", { enumerable: true, get: function () { return secrets_manager_1.resetGlobalSecretManager; } });
Object.defineProperty(exports, "resolveSecret", { enumerable: true, get: function () { return secrets_manager_1.resolveSecret; } });
Object.defineProperty(exports, "hasSecretReferences", { enumerable: true, get: function () { return secrets_manager_1.hasSecretReferences; } });
Object.defineProperty(exports, "parseSecretReference", { enumerable: true, get: function () { return secrets_manager_1.parseSecretReference; } });
Object.defineProperty(exports, "containsSecretReferences", { enumerable: true, get: function () { return secrets_manager_1.containsSecretReferences; } });
Object.defineProperty(exports, "extractSecretReferences", { enumerable: true, get: function () { return secrets_manager_1.extractSecretReferences; } });
Object.defineProperty(exports, "substituteEnvVars", { enumerable: true, get: function () { return secrets_manager_1.substituteEnvVars; } });
Object.defineProperty(exports, "substituteEnvVarsInObject", { enumerable: true, get: function () { return secrets_manager_1.substituteEnvVarsInObject; } });
// ============================================================================
// Backwards Compatibility
// ============================================================================
// Re-export existing config modules for backwards compatibility
__exportStar(require("./types"), exports);
__exportStar(require("./yaml-loader"), exports);
__exportStar(require("./gitops"), exports);
