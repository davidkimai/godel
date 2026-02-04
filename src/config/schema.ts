/**
 * Configuration Schema
 * 
 * Zod validation schema for the Dash configuration system.
 * Provides runtime validation with helpful error messages.
 */

import { z } from 'zod';
import type { ConfigValidationError } from './types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a schema with environment variable fallback
 */
function envAwareNumber(
  envVar: string,
  defaultValue: number,
  opts?: { min?: number; max?: number }
): z.ZodDefault<z.ZodNumber> {
  let schema = z.coerce.number().default(
    process.env[envVar] ? parseFloat(process.env[envVar]!) : defaultValue
  );
  
  if (opts?.min !== undefined) {
    schema = schema.refine((val) => val >= opts.min!, {
      message: `Must be at least ${opts.min}`,
    });
  }
  if (opts?.max !== undefined) {
    schema = schema.refine((val) => val <= opts.max!, {
      message: `Must be at most ${opts.max}`,
    });
  }
  
  return schema;
}

function envAwareString(envVar: string, defaultValue: string): z.ZodDefault<z.ZodString> {
  return z.string().default(process.env[envVar] || defaultValue);
}

function envAwareBoolean(envVar: string, defaultValue: boolean): z.ZodDefault<z.ZodBoolean> {
  return z.boolean().default(
    process.env[envVar] ? process.env[envVar] === 'true' : defaultValue
  );
}

function envAwareEnum<T extends string>(
  envVar: string,
  values: readonly [string, ...string[]],
  defaultValue: T
): z.ZodDefault<z.ZodEnum<[string, ...string[]]>> {
  return z.enum(values).default(
    (process.env[envVar] as T) || defaultValue
  );
}

// ============================================================================
// Server Schema
// ============================================================================

export const serverSchema = z.object({
  port: envAwareNumber('PORT', 7373, { min: 1, max: 65535 }),
  host: envAwareString('HOST', 'localhost'),
  cors: z.object({
    origins: z.union([
      z.string().transform((val) => val.split(',').map((s) => s.trim())),
      z.array(z.string()),
    ]).default(
      process.env['DASH_CORS_ORIGINS']?.split(',').map((s) => s.trim()) || 
      ['http://localhost:3000']
    ),
    credentials: envAwareBoolean('DASH_CORS_CREDENTIALS', true),
  }),
  rateLimit: envAwareNumber('DASH_RATE_LIMIT', 100, { min: 1 }),
  timeoutMs: envAwareNumber('DASH_REQUEST_TIMEOUT', 30000, { min: 1000 }),
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
  url: envAwareString('DATABASE_URL', '').refine(
    (val) => val.length > 0 || 
      (process.env['POSTGRES_HOST'] && process.env['POSTGRES_DB']),
    {
      message: 'DATABASE_URL or POSTGRES_HOST/POSTGRES_DB must be set',
    }
  ),
  poolSize: envAwareNumber('POSTGRES_POOL_SIZE', 10, { min: 1 }),
  minPoolSize: envAwareNumber('POSTGRES_MIN_POOL_SIZE', 2, { min: 1 }),
  maxPoolSize: envAwareNumber('POSTGRES_MAX_POOL_SIZE', 20, { min: 1 }),
  ssl: databaseSslSchema.default(
    process.env['POSTGRES_SSL'] === 'true' ? { rejectUnauthorized: false } : false
  ),
  connectionTimeoutMs: envAwareNumber('POSTGRES_CONNECTION_TIMEOUT', 5000, { min: 100 }),
  idleTimeoutMs: envAwareNumber('POSTGRES_IDLE_TIMEOUT', 30000, { min: 1000 }),
  acquireTimeoutMs: envAwareNumber('POSTGRES_ACQUIRE_TIMEOUT', 5000, { min: 100 }),
  retryAttempts: envAwareNumber('POSTGRES_RETRY_ATTEMPTS', 3, { min: 0 }),
  retryDelayMs: envAwareNumber('POSTGRES_RETRY_DELAY', 1000, { min: 100 }),
}).transform((data) => {
  // Build URL from components if not provided
  if (!data.url || data.url === '') {
    const host = process.env['POSTGRES_HOST'] || 'localhost';
    const port = process.env['POSTGRES_PORT'] || '5432';
    const db = process.env['POSTGRES_DB'] || 'dash';
    const user = process.env['POSTGRES_USER'] || 'dash';
    const password = process.env['POSTGRES_PASSWORD'] || 'dash';
    data.url = `postgresql://${user}:${password}@${host}:${port}/${db}`;
  }
  return data;
});

export type DatabaseSchema = z.infer<typeof databaseSchema>;

// ============================================================================
// Redis Schema
// ============================================================================

export const redisSchema = z.object({
  url: envAwareString('REDIS_URL', '').transform((val) => {
    if (val) return val;
    const host = process.env['REDIS_HOST'] || 'localhost';
    const port = process.env['REDIS_PORT'] || '6379';
    const db = process.env['REDIS_DB'] || '0';
    return `redis://${host}:${port}/${db}`;
  }),
  password: z.string().optional().default(process.env['REDIS_PASSWORD'] || ''),
  db: envAwareNumber('REDIS_DB', 0),
  connectTimeoutMs: envAwareNumber('REDIS_CONNECT_TIMEOUT', 10000, { min: 1000 }),
  commandTimeoutMs: envAwareNumber('REDIS_COMMAND_TIMEOUT', 5000, { min: 1000 }),
  maxRetriesPerRequest: envAwareNumber('REDIS_MAX_RETRIES', 3, { min: 0 }),
  enableOfflineQueue: envAwareBoolean('REDIS_OFFLINE_QUEUE', true),
});

export type RedisSchema = z.infer<typeof redisSchema>;

// ============================================================================
// Auth Schema
// ============================================================================

export const authSchema = z.object({
  apiKeys: z.union([
    z.string().transform((val) => val.split(',').map((s) => s.trim()).filter(Boolean)),
    z.array(z.string()),
  ]).default(
    process.env['DASH_API_KEY'] ? [process.env['DASH_API_KEY']] : ['dash-api-key']
  ),
  jwtSecret: envAwareString('DASH_JWT_SECRET', 'change-me-in-production'),
  tokenExpirySeconds: envAwareNumber('DASH_TOKEN_EXPIRY', 3600, { min: 60 }),
  refreshTokenExpirySeconds: envAwareNumber('DASH_REFRESH_TOKEN_EXPIRY', 604800, { min: 3600 }),
  enableApiKeyAuth: envAwareBoolean('DASH_ENABLE_API_KEY_AUTH', true),
  enableJwtAuth: envAwareBoolean('DASH_ENABLE_JWT_AUTH', false),
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
  level: envAwareEnum('LOG_LEVEL', ['debug', 'info', 'warn', 'error', 'silent'] , 'info'),
  format: envAwareEnum('LOG_FORMAT', ['json', 'pretty', 'compact'] , 'pretty'),
  destination: envAwareEnum('LOG_DESTINATION', ['stdout', 'stderr', 'file', 'loki', 'multiple'] , 'stdout'),
  filePath: z.string().optional().default(process.env['LOG_FILE_PATH'] || './logs/dash.log'),
  lokiUrl: z.string().optional().default(process.env['LOKI_URL'] || 'http://localhost:3100'),
  serviceName: envAwareString('DASH_SERVICE_NAME', 'dash'),
  includeTimestamp: envAwareBoolean('LOG_INCLUDE_TIMESTAMP', true),
  includeSourceLocation: envAwareBoolean('LOG_INCLUDE_SOURCE', false),
});

export type LoggingSchema = z.infer<typeof loggingSchema>;

// ============================================================================
// Metrics Schema
// ============================================================================

export const metricsSchema = z.object({
  enabled: envAwareBoolean('METRICS_ENABLED', true),
  port: envAwareNumber('METRICS_PORT', 9090, { min: 1, max: 65535 }),
  host: envAwareString('METRICS_HOST', 'localhost'),
  path: envAwareString('METRICS_PATH', '/metrics'),
  enableDefaultMetrics: envAwareBoolean('METRICS_DEFAULT_ENABLED', true),
  prefix: envAwareString('METRICS_PREFIX', 'dash_'),
  collectIntervalMs: envAwareNumber('METRICS_COLLECT_INTERVAL', 5000, { min: 1000 }),
});

export type MetricsSchema = z.infer<typeof metricsSchema>;

// ============================================================================
// Budget Schema
// ============================================================================

export const budgetSchema = z.object({
  defaultLimit: envAwareNumber('DEFAULT_AGENT_BUDGET', 1.0, { min: 0 }),
  currency: envAwareString('BUDGET_CURRENCY', 'USD'),
  warningThreshold: envAwareNumber('BUDGET_WARNING_THRESHOLD', 0.8, { min: 0, max: 1 }),
  criticalThreshold: envAwareNumber('BUDGET_CRITICAL_THRESHOLD', 0.95, { min: 0, max: 1 }),
  selfImprovementMaxBudget: envAwareNumber('SELF_IMPROVEMENT_MAX_BUDGET', 10.0, { min: 0 }),
  maxTokensPerAgent: envAwareNumber('MAX_TOKENS_PER_AGENT', 100000, { min: 1000 }),
});

export type BudgetSchema = z.infer<typeof budgetSchema>;

// ============================================================================
// OpenClaw Schema
// ============================================================================

export const openclawSchema = z.object({
  gatewayUrl: envAwareString('OPENCLAW_GATEWAY_URL', 'ws://127.0.0.1:18789'),
  gatewayToken: z.string().optional().default(process.env['OPENCLAW_GATEWAY_TOKEN'] || ''),
  sessionId: z.string().optional(),
  mode: envAwareEnum('OPENCLAW_MODE', ['restricted', 'full'] , 'restricted'),
  sandboxMode: envAwareEnum('OPENCLAW_SANDBOX_MODE', ['none', 'non-main', 'docker'] , 'non-main'),
  mockMode: envAwareBoolean('MOCK_OPENCLAW', false),
  verbose: envAwareBoolean('VERBOSE_OPENCLAW', false),
});

export type OpenClawSchema = z.infer<typeof openclawSchema>;

// ============================================================================
// Event Bus Schema
// ============================================================================

export const eventBusSchema = z.object({
  type: envAwareEnum('EVENT_BUS_TYPE', ['memory', 'redis'] , 'redis'),
  streamKey: envAwareString('EVENT_BUS_STREAM_KEY', 'dash:events'),
  consumerGroup: envAwareString('EVENT_BUS_CONSUMER_GROUP', 'dash:consumers'),
  compressionThreshold: envAwareNumber('EVENT_BUS_COMPRESSION_THRESHOLD', 1024, { min: 100 }),
  maxStreamLength: envAwareNumber('EVENT_BUS_MAX_STREAM_LENGTH', 100000, { min: 1000 }),
  maxQueuedEvents: envAwareNumber('EVENT_BUS_MAX_QUEUED', 10000, { min: 100 }),
  retry: z.object({
    maxRetries: envAwareNumber('EVENT_BUS_RETRY_MAX', 3, { min: 0 }),
    retryDelayMs: envAwareNumber('EVENT_BUS_RETRY_DELAY', 1000, { min: 100 }),
    retryDelayMultiplier: envAwareNumber('EVENT_BUS_RETRY_MULTIPLIER', 2, { min: 1 }),
  }),
});

export type EventBusSchema = z.infer<typeof eventBusSchema>;

// ============================================================================
// Vault Schema
// ============================================================================

export const vaultSchema = z.object({
  address: envAwareString('VAULT_ADDR', 'http://localhost:8200'),
  token: z.string().optional().default(process.env['VAULT_TOKEN'] || ''),
  namespace: z.string().optional(),
  kvVersion: envAwareEnum('VAULT_KV_VERSION', ['v1', 'v2'] , 'v2'),
  timeoutMs: envAwareNumber('VAULT_TIMEOUT', 5000, { min: 1000 }),
  tlsVerify: envAwareBoolean('VAULT_TLS_VERIFY', true),
});

export type VaultSchema = z.infer<typeof vaultSchema>;

// ============================================================================
// Main Configuration Schema
// ============================================================================

export const dashConfigSchema = z.object({
  env: envAwareString('NODE_ENV', 'development'),
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

/**
 * Validate configuration with helpful error messages
 */
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
    
    // Provide helpful suggestions based on error type
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

/**
 * Validate configuration and throw on error
 */
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

/**
 * Check if a specific path in config has issues
 */
export function getPathIssues(
  errors: ConfigValidationError[],
  pathPrefix: string
): ConfigValidationError[] {
  return errors.filter((e) => e.path.startsWith(pathPrefix));
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ConfigValidationError[]): string {
  return errors
    .map((e) => {
      const suggestion = e.suggestion ? `\n     💡 ${e.suggestion}` : '';
      return `❌ ${e.path}\n   ${e.message}${suggestion}`;
    })
    .join('\n\n');
}
