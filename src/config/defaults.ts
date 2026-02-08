/**
 * Default Configuration Values
 * 
 * Provides sensible defaults for all configuration options.
 * These values are used as fallbacks when not specified in
 * environment variables or config files.
 */

import type {
  DashConfig,
  ServerConfig,
  DatabaseConfig,
  RedisConfig,
  AuthConfig,
  LoggingConfig,
  MetricsConfig,
  BudgetConfig,
  OpenClawConfig,
  EventBusConfig,
  VaultConfig,
} from './types';

// ============================================================================
// Server Defaults
// ============================================================================

export const defaultServerConfig: ServerConfig = {
  framework: 'express',
  port: 3000,
  host: 'localhost',
  cors: {
    origins: ['http://localhost:3000'],
    credentials: true,
  },
  rateLimit: 100,
  timeoutMs: 30000,
};

// ============================================================================
// Database Defaults
// ============================================================================

export const defaultDatabaseConfig: DatabaseConfig = {
  url: 'postgresql://godel:godel@localhost:5432/godel',
  poolSize: 25,
  minPoolSize: 5,
  maxPoolSize: 50,
  ssl: false,
  connectionTimeoutMs: 30000,
  idleTimeoutMs: 300000,
  acquireTimeoutMs: 30000,
  statementTimeoutMs: 60000,
  retryAttempts: 5,
  retryDelayMs: 1000,
  retryMaxDelayMs: 30000,
  keepAlive: true,
  keepAliveInitialDelayMs: 10000,
  maxUses: 7500,
  applicationName: 'godel',
};

// ============================================================================
// Redis Defaults
// ============================================================================

export const defaultRedisConfig: RedisConfig = {
  url: 'redis://localhost:6379/0',
  password: undefined,
  db: 0,
  connectTimeoutMs: 10000,
  commandTimeoutMs: 5000,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
};

// ============================================================================
// Auth Defaults
// ============================================================================

export const defaultAuthConfig: AuthConfig = {
  // SECURITY: No default API keys. Must be explicitly configured.
  apiKeys: [],
  // SECURITY: Must be overridden in production
  jwtSecret: process.env['GODEL_JWT_SECRET'] || 'development-only-change-me',
  tokenExpirySeconds: 3600,
  refreshTokenExpirySeconds: 604800,
  enableApiKeyAuth: true,
  enableJwtAuth: false,
};

// ============================================================================
// Logging Defaults
// ============================================================================

export const defaultLoggingConfig: LoggingConfig = {
  level: 'info',
  format: 'pretty',
  destination: 'stdout',
  filePath: './logs/godel.log',
  lokiUrl: 'http://localhost:3100',
  serviceName: 'godel',
  includeTimestamp: true,
  includeSourceLocation: false,
};

// ============================================================================
// Metrics Defaults
// ============================================================================

export const defaultMetricsConfig: MetricsConfig = {
  enabled: true,
  port: 9090,
  host: 'localhost',
  path: '/metrics',
  enableDefaultMetrics: true,
  prefix: 'godel_',
  collectIntervalMs: 5000,
};

// ============================================================================
// Budget Defaults
// ============================================================================

export const defaultBudgetConfig: BudgetConfig = {
  defaultLimit: 1.0,
  currency: 'USD',
  warningThreshold: 0.8,
  criticalThreshold: 0.95,
  selfImprovementMaxBudget: 10.0,
  maxTokensPerAgent: 100000,
};

// ============================================================================
// OpenClaw Defaults
// ============================================================================

export const defaultOpenClawConfig: OpenClawConfig = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  gatewayUrls: undefined,
  gatewayToken: undefined,
  sessionId: undefined,
  mode: 'restricted',
  sandboxMode: 'non-main',
  maxConcurrentSessions: 50,
  perGatewayMaxConcurrentSessions: 25,
  autoStartGateway: false,
  gatewayStartCommand: undefined,
  gatewayStartupTimeoutMs: 30000,
  gatewayStartupProbeIntervalMs: 1000,
  mockMode: false,
  verbose: false,
};

// ============================================================================
// Event Bus Defaults
// ============================================================================

export const defaultEventBusConfig: EventBusConfig = {
  type: 'redis',
  streamKey: 'godel:events',
  consumerGroup: 'godel:consumers',
  compressionThreshold: 1024,
  maxStreamLength: 100000,
  maxQueuedEvents: 10000,
  retry: {
    maxRetries: 3,
    retryDelayMs: 1000,
    retryDelayMultiplier: 2,
  },
};

// ============================================================================
// Vault Defaults
// ============================================================================

export const defaultVaultConfig: VaultConfig = {
  address: 'http://localhost:8200',
  token: undefined,
  namespace: undefined,
  kvVersion: 'v2',
  timeoutMs: 5000,
  tlsVerify: true,
};

// ============================================================================
// Complete Default Configuration
// ============================================================================

export const defaultConfig: DashConfig = {
  env: 'development',
  server: defaultServerConfig,
  database: defaultDatabaseConfig,
  redis: defaultRedisConfig,
  auth: defaultAuthConfig,
  logging: defaultLoggingConfig,
  metrics: defaultMetricsConfig,
  budget: defaultBudgetConfig,
  openclaw: defaultOpenClawConfig,
  eventBus: defaultEventBusConfig,
  vault: defaultVaultConfig,
  features: {
    gitops: true,
    autoScaling: false,
    selfImprovement: true,
    metrics: true,
    tracing: true,
  },
};

// ============================================================================
// Environment-Specific Overrides
// ============================================================================

export const developmentConfig: Partial<DashConfig> = {
  env: 'development',
  logging: {
    ...defaultLoggingConfig,
    level: 'debug',
    format: 'pretty',
  },
  auth: {
    ...defaultAuthConfig,
    enableApiKeyAuth: true,
    enableJwtAuth: false,
  },
  metrics: {
    ...defaultMetricsConfig,
    enabled: true,
  },
};

export const productionConfig: Partial<DashConfig> = {
  env: 'production',
  server: {
    ...defaultServerConfig,
    framework: 'express',
    host: '0.0.0.0',
    cors: {
      origins: [], // Must be explicitly configured
      credentials: true,
    },
  },
  logging: {
    ...defaultLoggingConfig,
    level: 'info',
    format: 'json',
  },
  auth: {
    // SECURITY: Production requires explicit API key configuration
    apiKeys: process.env['GODEL_API_KEY'] 
      ? process.env['GODEL_API_KEY'].split(',').map(k => k.trim())
      : [],
    // SECURITY: Production requires strong JWT secret
    jwtSecret: process.env['GODEL_JWT_SECRET'] || '',
    tokenExpirySeconds: 3600,
    refreshTokenExpirySeconds: 604800,
    enableApiKeyAuth: true,
    enableJwtAuth: false,
  },
  metrics: {
    ...defaultMetricsConfig,
    enabled: true,
  },
  features: {
    gitops: true,
    autoScaling: true,
    selfImprovement: true,
    metrics: true,
    tracing: true,
  },
};

export const testConfig: Partial<DashConfig> = {
  env: 'test',
  server: {
    ...defaultServerConfig,
    framework: 'express',
    port: 3001, // Use valid port for tests (schema requires 1-65535)
  },
  database: {
    ...defaultDatabaseConfig,
    url: 'postgresql://godel:godel@localhost:5432/dash_test',
  },
  redis: {
    ...defaultRedisConfig,
    url: 'redis://localhost:6379/15', // Use DB 15 for tests
  },
  logging: {
    ...defaultLoggingConfig,
    level: 'error',
    destination: 'stderr',
  },
  metrics: {
    ...defaultMetricsConfig,
    enabled: false,
  },
  eventBus: {
    ...defaultEventBusConfig,
    type: 'memory', // Use in-memory for tests
  },
  features: {
    gitops: false,
    autoScaling: false,
    selfImprovement: false,
    metrics: false,
    tracing: false,
  },
};

/**
 * Get environment-specific default configuration
 */
export function getEnvironmentDefaults(env: string): Partial<DashConfig> {
  switch (env) {
    case 'production':
      return productionConfig;
    case 'test':
      return testConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

// ============================================================================
// Configuration Metadata
// ============================================================================

export interface ConfigMetadata {
  description: string;
  sensitive?: boolean;
  requiresRestart?: boolean;
  envVar?: string;
}

export const configMetadata: Record<string, ConfigMetadata> = {
  'server.framework': {
    description: 'Server framework: express or fastify',
    requiresRestart: true,
    envVar: 'GODEL_SERVER_FRAMEWORK',
  },
  'server.port': {
    description: 'Server port number',
    requiresRestart: true,
    envVar: 'PORT',
  },
  'server.host': {
    description: 'Server host address',
    requiresRestart: true,
    envVar: 'HOST',
  },
  'server.cors.origins': {
    description: 'Allowed CORS origins (comma-separated)',
    envVar: 'GODEL_CORS_ORIGINS',
  },
  'database.url': {
    description: 'PostgreSQL connection URL',
    sensitive: true,
    requiresRestart: true,
    envVar: 'DATABASE_URL',
  },
  'redis.url': {
    description: 'Redis connection URL',
    sensitive: true,
    requiresRestart: true,
    envVar: 'REDIS_URL',
  },
  'auth.apiKeys': {
    description: 'API keys for authentication (comma-separated)',
    sensitive: true,
    envVar: 'GODEL_API_KEY',
  },
  'auth.jwtSecret': {
    description: 'JWT secret for token signing',
    sensitive: true,
    requiresRestart: true,
    envVar: 'GODEL_JWT_SECRET',
  },
  'logging.level': {
    description: 'Log level (debug, info, warn, error, silent)',
    envVar: 'LOG_LEVEL',
  },
  'metrics.enabled': {
    description: 'Enable metrics collection',
    envVar: 'METRICS_ENABLED',
  },
  'budget.defaultLimit': {
    description: 'Default budget limit per agent (USD)',
    envVar: 'DEFAULT_AGENT_BUDGET',
  },
  'openclaw.gatewayToken': {
    description: 'OpenClaw Gateway authentication token',
    sensitive: true,
    envVar: 'OPENCLAW_GATEWAY_TOKEN',
  },
};
