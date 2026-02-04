"use strict";
/**
 * Configuration Schema
 *
 * Zod validation schema for the Dash configuration system.
 * Provides runtime validation with helpful error messages.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashConfigSchema = exports.vaultSchema = exports.eventBusSchema = exports.openclawSchema = exports.budgetSchema = exports.metricsSchema = exports.loggingSchema = exports.authSchema = exports.redisSchema = exports.databaseSchema = exports.databaseSslSchema = exports.serverSchema = void 0;
exports.validateConfig = validateConfig;
exports.validateConfigOrThrow = validateConfigOrThrow;
exports.getPathIssues = getPathIssues;
exports.formatValidationErrors = formatValidationErrors;
const zod_1 = require("zod");
// ============================================================================
// Server Schema
// ============================================================================
exports.serverSchema = zod_1.z.object({
    framework: zod_1.z.enum(['express', 'fastify']).default('express'),
    port: zod_1.z.coerce.number().default(3000).refine((val) => val >= 1 && val <= 65535, {
        message: 'Must be between 1 and 65535',
    }),
    host: zod_1.z.string().default('localhost'),
    cors: zod_1.z.object({
        origins: zod_1.z.union([
            zod_1.z.string().transform((val) => val.split(',').map((s) => s.trim())),
            zod_1.z.array(zod_1.z.string()),
        ]).default(['http://localhost:3000']),
        credentials: zod_1.z.boolean().default(true),
    }),
    rateLimit: zod_1.z.coerce.number().default(100),
    timeoutMs: zod_1.z.coerce.number().default(30000),
});
// ============================================================================
// Database Schema
// ============================================================================
exports.databaseSslSchema = zod_1.z.union([
    zod_1.z.boolean(),
    zod_1.z.object({
        rejectUnauthorized: zod_1.z.boolean().default(false),
        ca: zod_1.z.string().optional(),
        cert: zod_1.z.string().optional(),
        key: zod_1.z.string().optional(),
    }),
]);
exports.databaseSchema = zod_1.z.object({
    url: zod_1.z.string().default('').transform((val) => {
        if (val && val.length > 0)
            return val;
        const host = process.env['POSTGRES_HOST'] || 'localhost';
        const port = process.env['POSTGRES_PORT'] || '5432';
        const db = process.env['POSTGRES_DB'] || 'dash';
        const user = process.env['POSTGRES_USER'] || 'dash';
        const password = process.env['POSTGRES_PASSWORD'] || 'dash';
        return `postgresql://${user}:${password}@${host}:${port}/${db}`;
    }),
    poolSize: zod_1.z.coerce.number().default(10),
    minPoolSize: zod_1.z.coerce.number().default(2),
    maxPoolSize: zod_1.z.coerce.number().default(20),
    ssl: exports.databaseSslSchema.default(false),
    connectionTimeoutMs: zod_1.z.coerce.number().default(5000),
    idleTimeoutMs: zod_1.z.coerce.number().default(30000),
    acquireTimeoutMs: zod_1.z.coerce.number().default(5000),
    retryAttempts: zod_1.z.coerce.number().default(3),
    retryDelayMs: zod_1.z.coerce.number().default(1000),
});
// ============================================================================
// Redis Schema
// ============================================================================
exports.redisSchema = zod_1.z.object({
    url: zod_1.z.string().default('').transform((val) => {
        if (val && val.length > 0)
            return val;
        const host = process.env['REDIS_HOST'] || 'localhost';
        const port = process.env['REDIS_PORT'] || '6379';
        const db = process.env['REDIS_DB'] || '0';
        return `redis://${host}:${port}/${db}`;
    }),
    password: zod_1.z.string().optional().default(''),
    db: zod_1.z.coerce.number().default(0),
    connectTimeoutMs: zod_1.z.coerce.number().default(10000),
    commandTimeoutMs: zod_1.z.coerce.number().default(5000),
    maxRetriesPerRequest: zod_1.z.coerce.number().default(3),
    enableOfflineQueue: zod_1.z.boolean().default(true),
});
// ============================================================================
// Auth Schema
// ============================================================================
exports.authSchema = zod_1.z.object({
    apiKeys: zod_1.z.union([
        zod_1.z.string().transform((val) => val.split(',').map((s) => s.trim()).filter(Boolean)),
        zod_1.z.array(zod_1.z.string()),
    ]).default(['dash-api-key']),
    jwtSecret: zod_1.z.string().default('change-me-in-production'),
    tokenExpirySeconds: zod_1.z.coerce.number().default(3600),
    refreshTokenExpirySeconds: zod_1.z.coerce.number().default(604800),
    enableApiKeyAuth: zod_1.z.boolean().default(true),
    enableJwtAuth: zod_1.z.boolean().default(false),
}).refine((data) => data.enableApiKeyAuth || data.enableJwtAuth, {
    message: 'At least one authentication method must be enabled',
    path: ['enableApiKeyAuth'],
});
// ============================================================================
// Logging Schema
// ============================================================================
exports.loggingSchema = zod_1.z.object({
    level: zod_1.z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
    format: zod_1.z.enum(['json', 'pretty', 'compact']).default('pretty'),
    destination: zod_1.z.enum(['stdout', 'stderr', 'file', 'loki', 'multiple']).default('stdout'),
    filePath: zod_1.z.string().optional().default('./logs/dash.log'),
    lokiUrl: zod_1.z.string().optional().default('http://localhost:3100'),
    serviceName: zod_1.z.string().default('dash'),
    includeTimestamp: zod_1.z.boolean().default(true),
    includeSourceLocation: zod_1.z.boolean().default(false),
});
// ============================================================================
// Metrics Schema
// ============================================================================
exports.metricsSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    port: zod_1.z.coerce.number().default(9090),
    host: zod_1.z.string().default('localhost'),
    path: zod_1.z.string().default('/metrics'),
    enableDefaultMetrics: zod_1.z.boolean().default(true),
    prefix: zod_1.z.string().default('dash_'),
    collectIntervalMs: zod_1.z.coerce.number().default(5000),
});
// ============================================================================
// Budget Schema
// ============================================================================
exports.budgetSchema = zod_1.z.object({
    defaultLimit: zod_1.z.coerce.number().default(1.0),
    currency: zod_1.z.string().default('USD'),
    warningThreshold: zod_1.z.coerce.number().default(0.8),
    criticalThreshold: zod_1.z.coerce.number().default(0.95),
    selfImprovementMaxBudget: zod_1.z.coerce.number().default(10.0),
    maxTokensPerAgent: zod_1.z.coerce.number().default(100000),
});
// ============================================================================
// OpenClaw Schema
// ============================================================================
exports.openclawSchema = zod_1.z.object({
    gatewayUrl: zod_1.z.string().default('ws://127.0.0.1:18789'),
    gatewayToken: zod_1.z.string().optional().default(''),
    sessionId: zod_1.z.string().optional(),
    mode: zod_1.z.enum(['restricted', 'full']).default('restricted'),
    sandboxMode: zod_1.z.enum(['none', 'non-main', 'docker']).default('non-main'),
    mockMode: zod_1.z.boolean().default(false),
    verbose: zod_1.z.boolean().default(false),
});
// ============================================================================
// Event Bus Schema
// ============================================================================
exports.eventBusSchema = zod_1.z.object({
    type: zod_1.z.enum(['memory', 'redis']).default('redis'),
    streamKey: zod_1.z.string().default('dash:events'),
    consumerGroup: zod_1.z.string().default('dash:consumers'),
    compressionThreshold: zod_1.z.coerce.number().default(1024),
    maxStreamLength: zod_1.z.coerce.number().default(100000),
    maxQueuedEvents: zod_1.z.coerce.number().default(10000),
    retry: zod_1.z.object({
        maxRetries: zod_1.z.coerce.number().default(3),
        retryDelayMs: zod_1.z.coerce.number().default(1000),
        retryDelayMultiplier: zod_1.z.coerce.number().default(2),
    }),
});
// ============================================================================
// Vault Schema
// ============================================================================
exports.vaultSchema = zod_1.z.object({
    address: zod_1.z.string().default('http://localhost:8200'),
    token: zod_1.z.string().optional().default(''),
    namespace: zod_1.z.string().optional(),
    kvVersion: zod_1.z.enum(['v1', 'v2']).default('v2'),
    timeoutMs: zod_1.z.coerce.number().default(5000),
    tlsVerify: zod_1.z.boolean().default(true),
});
// ============================================================================
// Main Configuration Schema
// ============================================================================
exports.dashConfigSchema = zod_1.z.object({
    env: zod_1.z.string().default('development'),
    server: exports.serverSchema,
    database: exports.databaseSchema,
    redis: exports.redisSchema,
    auth: exports.authSchema,
    logging: exports.loggingSchema,
    metrics: exports.metricsSchema,
    budget: exports.budgetSchema,
    openclaw: exports.openclawSchema,
    eventBus: exports.eventBusSchema,
    vault: exports.vaultSchema.optional(),
    features: zod_1.z.record(zod_1.z.boolean()).default({}),
});
// ============================================================================
// Validation Functions
// ============================================================================
function validateConfig(config) {
    const result = exports.dashConfigSchema.safeParse(config);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const errors = result.error.errors.map((err) => {
        const path = err.path.join('.');
        let suggestion;
        if (err.code === 'too_small') {
            suggestion = `Value must be at least ${err.minimum}`;
        }
        else if (err.code === 'too_big') {
            suggestion = `Value must be at most ${err.maximum}`;
        }
        else if (err.code === 'invalid_string' && err.validation === 'url') {
            suggestion = 'Provide a valid URL (e.g., http://localhost:8080)';
        }
        else if (path.includes('port')) {
            suggestion = 'Port must be between 1 and 65535';
        }
        else if (path.includes('secret') || path.includes('password') || path.includes('token')) {
            suggestion = 'This is a sensitive value. Consider using ${VAULT:secret/path} syntax';
        }
        return {
            path,
            message: err.message,
            code: err.code,
            suggestion,
        };
    });
    return { success: false, errors };
}
function validateConfigOrThrow(config) {
    const result = validateConfig(config);
    if (!result.success) {
        const errorMessages = result.errors
            .map((e) => `  - ${e.path}: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`)
            .join('\n');
        throw new Error(`Configuration validation failed:\n${errorMessages}`);
    }
    return result.data;
}
function getPathIssues(errors, pathPrefix) {
    return errors.filter((e) => e.path.startsWith(pathPrefix));
}
function formatValidationErrors(errors) {
    return errors
        .map((e) => {
        const suggestion = e.suggestion ? `\n     💡 ${e.suggestion}` : '';
        return `❌ ${e.path}\n   ${e.message}${suggestion}`;
    })
        .join('\n\n');
}
