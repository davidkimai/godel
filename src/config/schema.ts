/**
 * Configuration Schema
 * 
 * Zod validation schema for the Dash configuration system.
 * Provides runtime validation with helpful error messages.
 */

import { z } from 'zod';
import type { ConfigValidationError } from './types';

// ============================================================================
// Server Schema
// ============================================================================

export const serverSchema = z.object({
  framework: z.enum(['express', 'fastify']).default('express'),
  port: z.coerce.number().default(3000).refine((val) => val >= 1 && val <= 65535, {
    message: 'Must be between 1 and 65535',
  }),
  host: z.string().default('localhost'),
  cors: z.object({
    origins: z.union([
      z.string().transform((val) => val.split(',').map((s) => s.trim())),
      z.array(z.string()),
    ]).default(['http://localhost:3000']),
    credentials: z.boolean().default(true),
  }),
  rateLimit: z.coerce.number().default(100),
  timeoutMs: z.coerce.number().default(30000),
});

export type ServerSchema = z.infer<typeof serverSchema>;

// ============================================================================
// Database Schema
// ============================================================================

export const databaseSslSchema = z.union([
  z.boolean(),
  z.object({
    rejectUnauthorized: z.boolean().default(false),
    ca: z.string().optional(),
    cert: z.string().optional(),
    key: z.string().optional(),
  }),
]);

export const databaseSchema = z.object({
  url: z.string().default('').transform((val) => {
    if (val && val.length > 0) return val;
    const host = process.env['POSTGRES_HOST'] || 'localhost';
    const port = process.env['POSTGRES_PORT'] || '5432';
    const db = process.env['POSTGRES_DB'] || 'dash';
    const user = process.env['POSTGRES_USER'] || 'dash';
    const password = process.env['POSTGRES_PASSWORD'] || 'dash';
    return `postgresql://${user}:${password}@${host}:${port}/${db}`;
  }),
  // Optimized defaults for 50+ concurrent agents
  poolSize: z.coerce.number().default(25),
  minPoolSize: z.coerce.number().default(5),
  maxPoolSize: z.coerce.number().default(50),
  ssl: databaseSslSchema.default(false),
  connectionTimeoutMs: z.coerce.number().default(30000),
  idleTimeoutMs: z.coerce.number().default(300000),
  acquireTimeoutMs: z.coerce.number().default(30000),
  retryAttempts: z.coerce.number().default(5),
  retryDelayMs: z.coerce.number().default(1000),
});

export type DatabaseSchema = z.infer<typeof databaseSchema>;

// ============================================================================
// Redis Schema
// ============================================================================

export const redisSchema = z.object({
  url: z.string().default('').transform((val) => {
    if (val && val.length > 0) return val;
    const host = process.env['REDIS_HOST'] || 'localhost';
    const port = process.env['REDIS_PORT'] || '6379';
    const db = process.env['REDIS_DB'] || '0';
    return `redis://${host}:${port}/${db}`;
  }),
  password: z.string().optional().default(''),
  db: z.coerce.number().default(0),
  connectTimeoutMs: z.coerce.number().default(10000),
  commandTimeoutMs: z.coerce.number().default(5000),
  maxRetriesPerRequest: z.coerce.number().default(3),
  enableOfflineQueue: z.boolean().default(true),
});

export type RedisSchema = z.infer<typeof redisSchema>;

// ============================================================================
// Auth Schema
// ============================================================================

export const authSchema = z.object({
  apiKeys: z.union([
    z.string().transform((val) => val.split(',').map((s) => s.trim()).filter(Boolean)),
    z.array(z.string()),
  ]).default(['dash-api-key']),
  jwtSecret: z.string().default('change-me-in-production'),
  tokenExpirySeconds: z.coerce.number().default(3600),
  refreshTokenExpirySeconds: z.coerce.number().default(604800),
  enableApiKeyAuth: z.boolean().default(true),
  enableJwtAuth: z.boolean().default(false),
}).refine(
  (data) => data.enableApiKeyAuth || data.enableJwtAuth,
  {
    message: 'At least one authentication method must be enabled',
    path: ['enableApiKeyAuth'],
  }
);

export type AuthSchema = z.infer<typeof authSchema>;

// ============================================================================
// Logging Schema
// ============================================================================

export const loggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  format: z.enum(['json', 'pretty', 'compact']).default('pretty'),
  destination: z.enum(['stdout', 'stderr', 'file', 'loki', 'multiple']).default('stdout'),
  filePath: z.string().optional().default('./logs/dash.log'),
  lokiUrl: z.string().optional().default('http://localhost:3100'),
  serviceName: z.string().default('dash'),
  includeTimestamp: z.boolean().default(true),
  includeSourceLocation: z.boolean().default(false),
});

export type LoggingSchema = z.infer<typeof loggingSchema>;

// ============================================================================
// Metrics Schema
// ============================================================================

export const metricsSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.coerce.number().default(9090),
  host: z.string().default('localhost'),
  path: z.string().default('/metrics'),
  enableDefaultMetrics: z.boolean().default(true),
  prefix: z.string().default('dash_'),
  collectIntervalMs: z.coerce.number().default(5000),
});

export type MetricsSchema = z.infer<typeof metricsSchema>;

// ============================================================================
// Budget Schema
// ============================================================================

export const budgetSchema = z.object({
  defaultLimit: z.coerce.number().default(1.0),
  currency: z.string().default('USD'),
  warningThreshold: z.coerce.number().default(0.8),
  criticalThreshold: z.coerce.number().default(0.95),
  selfImprovementMaxBudget: z.coerce.number().default(10.0),
  maxTokensPerAgent: z.coerce.number().default(100000),
});

export type BudgetSchema = z.infer<typeof budgetSchema>;

// ============================================================================
// OpenClaw Schema
// ============================================================================

export const openclawSchema = z.object({
  gatewayUrl: z.string().default('ws://127.0.0.1:18789'),
  gatewayUrls: z.union([
    z.string().transform((val) => val.split(',').map((s) => s.trim()).filter(Boolean)),
    z.array(z.string()),
  ]).optional(),
  gatewayToken: z.string().optional().default(''),
  sessionId: z.string().optional(),
  mode: z.enum(['restricted', 'full']).default('restricted'),
  sandboxMode: z.enum(['none', 'non-main', 'docker']).default('non-main'),
  maxConcurrentSessions: z.coerce.number().default(50).refine((val) => val >= 1, {
    message: 'Must be at least 1',
  }),
  perGatewayMaxConcurrentSessions: z.coerce.number().default(25).refine((val) => val >= 1, {
    message: 'Must be at least 1',
  }),
  autoStartGateway: z.boolean().default(false),
  gatewayStartCommand: z.string().optional().default(''),
  gatewayStartupTimeoutMs: z.coerce.number().default(30000).refine((val) => val >= 1000, {
    message: 'Must be at least 1000',
  }),
  gatewayStartupProbeIntervalMs: z.coerce.number().default(1000).refine((val) => val >= 100, {
    message: 'Must be at least 100',
  }),
  mockMode: z.boolean().default(false),
  verbose: z.boolean().default(false),
});

export type OpenClawSchema = z.infer<typeof openclawSchema>;

// ============================================================================
// Event Bus Schema
// ============================================================================

export const eventBusSchema = z.object({
  type: z.enum(['memory', 'redis']).default('redis'),
  streamKey: z.string().default('dash:events'),
  consumerGroup: z.string().default('dash:consumers'),
  compressionThreshold: z.coerce.number().default(1024),
  maxStreamLength: z.coerce.number().default(100000),
  maxQueuedEvents: z.coerce.number().default(10000),
  retry: z.object({
    maxRetries: z.coerce.number().default(3),
    retryDelayMs: z.coerce.number().default(1000),
    retryDelayMultiplier: z.coerce.number().default(2),
  }),
});

export type EventBusSchema = z.infer<typeof eventBusSchema>;

// ============================================================================
// Vault Schema
// ============================================================================

export const vaultSchema = z.object({
  address: z.string().default('http://localhost:8200'),
  token: z.string().optional().default(''),
  namespace: z.string().optional(),
  kvVersion: z.enum(['v1', 'v2']).default('v2'),
  timeoutMs: z.coerce.number().default(5000),
  tlsVerify: z.boolean().default(true),
});

export type VaultSchema = z.infer<typeof vaultSchema>;

// ============================================================================
// Main Configuration Schema
// ============================================================================

export const dashConfigSchema = z.object({
  env: z.string().default('development'),
  server: serverSchema,
  database: databaseSchema,
  redis: redisSchema,
  auth: authSchema,
  logging: loggingSchema,
  metrics: metricsSchema,
  budget: budgetSchema,
  openclaw: openclawSchema,
  eventBus: eventBusSchema,
  vault: vaultSchema.optional(),
  features: z.record(z.boolean()).default({}),
});

export type DashConfigSchema = z.infer<typeof dashConfigSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

export function validateConfig(config: unknown): {
  success: boolean;
  data?: DashConfigSchema;
  errors?: ConfigValidationError[];
} {
  const result = dashConfigSchema.safeParse(config);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors: ConfigValidationError[] = result.error.errors.map((err) => {
    const path = err.path.join('.');
    let suggestion: string | undefined;
    
    if (err.code === 'too_small') {
      suggestion = `Value must be at least ${err.minimum}`;
    } else if (err.code === 'too_big') {
      suggestion = `Value must be at most ${err.maximum}`;
    } else if (err.code === 'invalid_string' && err.validation === 'url') {
      suggestion = 'Provide a valid URL (e.g., http://localhost:8080)';
    } else if (path.includes('port')) {
      suggestion = 'Port must be between 1 and 65535';
    } else if (path.includes('secret') || path.includes('password') || path.includes('token')) {
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

export function validateConfigOrThrow(config: unknown): DashConfigSchema {
  const result = validateConfig(config);
  
  if (!result.success) {
    const errorMessages = result.errors!
      .map((e) => `  - ${e.path}: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`)
      .join('\n');
    
    throw new Error(`Configuration validation failed:\n${errorMessages}`);
  }
  
  return result.data!;
}

export function getPathIssues(
  errors: ConfigValidationError[],
  pathPrefix: string
): ConfigValidationError[] {
  return errors.filter((e) => e.path.startsWith(pathPrefix));
}

export function formatValidationErrors(errors: ConfigValidationError[]): string {
  return errors
    .map((e) => {
      const suggestion = e.suggestion ? `\n     💡 ${e.suggestion}` : '';
      return `❌ ${e.path}\n   ${e.message}${suggestion}`;
    })
    .join('\n\n');
}
