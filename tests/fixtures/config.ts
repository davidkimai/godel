/**
 * Configuration Fixtures
 * 
 * Pre-built configuration data for consistent testing.
 * 
 * @example
 * ```typescript
 * import { mockConfig, mockRuntimeConfig } from '../fixtures/config';
 * 
 * // Use predefined fixture
 * const config = { ...mockConfig };
 * ```
 */

import type { RuntimeConfig } from '../../src/runtime/registry';
import type { PiClientConfig } from '../../src/integrations/pi/client';
import type { PostgresConfig } from '../../src/storage/postgres/config';

// ============================================================================
// Runtime Configuration Fixtures
// ============================================================================

/**
 * Default runtime configuration
 */
export const mockRuntimeConfig: RuntimeConfig = {
  default: 'pi',
  pi: {
    defaultModel: 'claude-sonnet-4-5',
    providers: ['anthropic', 'openai', 'google'],
    timeout: 300000,
    maxConcurrent: 10,
  },
  native: {
    binaryPath: '/usr/local/bin/godel-agent',
    workdir: '/tmp/godel',
    env: {
      NODE_ENV: 'test',
    },
  },
};

/**
 * Runtime config with OpenAI default
 */
export const mockOpenAIRuntimeConfig: RuntimeConfig = {
  ...mockRuntimeConfig,
  default: 'pi',
  pi: {
    ...mockRuntimeConfig.pi!,
    defaultModel: 'gpt-4o',
    providers: ['openai', 'anthropic', 'google'],
  },
};

/**
 * Runtime config with native default
 */
export const mockNativeRuntimeConfig: RuntimeConfig = {
  ...mockRuntimeConfig,
  default: 'native',
  native: {
    binaryPath: '/usr/local/bin/godel-agent',
    workdir: '/tmp/godel-native',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    },
  },
};

/**
 * Runtime config for high concurrency
 */
export const mockHighConcurrencyRuntimeConfig: RuntimeConfig = {
  ...mockRuntimeConfig,
  pi: {
    ...mockRuntimeConfig.pi!,
    maxConcurrent: 100,
    timeout: 600000,
  },
};

// ============================================================================
// Pi Client Configuration Fixtures
// ============================================================================

/**
 * Default Pi client configuration
 */
export const mockPiClientConfig: PiClientConfig = {
  endpoint: 'ws://localhost:3000',
  apiKey: 'test-api-key',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  systemPrompt: 'You are a helpful coding assistant',
  tools: ['Bash', 'Read', 'Write'],
  reconnect: true,
  reconnectInterval: 5000,
  maxReconnects: 3,
  requestTimeout: 60000,
  heartbeatInterval: 30000,
};

/**
 * Pi client config for OpenAI
 */
export const mockOpenAIPiConfig: PiClientConfig = {
  ...mockPiClientConfig,
  provider: 'openai',
  model: 'gpt-4o',
};

/**
 * Pi client config for Google
 */
export const mockGooglePiConfig: PiClientConfig = {
  ...mockPiClientConfig,
  provider: 'google',
  model: 'gemini-1.5-pro',
};

/**
 * Pi client config for local development
 */
export const mockLocalPiConfig: PiClientConfig = {
  endpoint: 'ws://localhost:3001',
  apiKey: undefined,
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  reconnect: false,
  requestTimeout: 120000,
  heartbeatInterval: 60000,
};

/**
 * Pi client config with all tools enabled
 */
export const mockPiConfigAllTools: PiClientConfig = {
  ...mockPiClientConfig,
  tools: ['Bash', 'Read', 'Write', 'Edit', 'Search', 'Fetch', 'Test'],
};

/**
 * Pi client config with no tools
 */
export const mockPiConfigNoTools: PiClientConfig = {
  ...mockPiClientConfig,
  tools: [],
};

// ============================================================================
// Database Configuration Fixtures
// ============================================================================

/**
 * Default PostgreSQL configuration
 */
export const mockPostgresConfig: PostgresConfig = {
  host: 'localhost',
  port: 5432,
  database: 'godel_test',
  user: 'godel',
  password: 'test-password',
  ssl: false,
  poolSize: 20,
  minPoolSize: 5,
  maxPoolSize: 50,
  idleTimeoutMs: 30000,
  connectionTimeoutMs: 5000,
  acquireTimeoutMs: 5000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

/**
 * PostgreSQL config for CI environment
 */
export const mockCiPostgresConfig: PostgresConfig = {
  ...mockPostgresConfig,
  host: 'postgres',
  database: 'godel_ci',
  user: 'postgres',
  password: 'postgres',
  ssl: false,
};

/**
 * PostgreSQL config with SSL
 */
export const mockSslPostgresConfig: PostgresConfig = {
  ...mockPostgresConfig,
  host: 'prod-db.example.com',
  port: 5432,
  database: 'godel_production',
  ssl: { rejectUnauthorized: false },
  maxPoolSize: 100,
  retryAttempts: 5,
};

/**
 * PostgreSQL config with connection pooling
 */
export const mockPooledPostgresConfig: PostgresConfig = {
  ...mockPostgresConfig,
  poolSize: 100,
  minPoolSize: 10,
  maxPoolSize: 200,
  idleTimeoutMs: 60000,
  connectionTimeoutMs: 10000,
  acquireTimeoutMs: 10000,
};

// ============================================================================
// Redis Configuration Fixtures
// ============================================================================

/**
 * Default Redis configuration
 */
export const mockRedisConfig = {
  host: 'localhost',
  port: 6379,
  db: 0,
  password: undefined as string | undefined,
  keyPrefix: 'godel:',
};

/**
 * Redis config for CI environment
 */
export const mockCiRedisConfig = {
  ...mockRedisConfig,
  host: 'redis',
  port: 6379,
  db: 1,
};

/**
 * Redis config with authentication
 */
export const mockAuthRedisConfig = {
  ...mockRedisConfig,
  host: 'prod-redis.example.com',
  port: 6380,
  password: 'redis-secret',
  db: 0,
};

/**
 * Redis cluster configuration
 */
export const mockRedisClusterConfig = {
  nodes: [
    { host: 'redis-1.example.com', port: 6379 },
    { host: 'redis-2.example.com', port: 6379 },
    { host: 'redis-3.example.com', port: 6379 },
  ],
  options: {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  },
};

// ============================================================================
// Application Configuration Fixtures
// ============================================================================

/**
 * Base application configuration type
 */
interface AppConfig {
  env: 'test' | 'development' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  api: {
    port: number;
    host: string;
    basePath: string;
  };
  websocket: {
    port: number;
    path: string;
  };
  dashboard: {
    enabled: boolean;
    port: number;
  };
  security: {
    apiKeyHeader: string;
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
  };
  features: {
    tracing: boolean;
    metrics: boolean;
    autoScaling: boolean;
  };
}

/**
 * Default application configuration
 */
export const mockAppConfig: AppConfig = {
  env: 'test',
  logLevel: 'debug',
  api: {
    port: 7373,
    host: 'localhost',
    basePath: '/api/v1',
  },
  websocket: {
    port: 7373,
    path: '/events',
  },
  dashboard: {
    enabled: true,
    port: 3000,
  },
  security: {
    apiKeyHeader: 'X-API-Key',
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100,
    },
  },
  features: {
    tracing: true,
    metrics: true,
    autoScaling: false,
  },
};

/**
 * Production application configuration
 */
export const mockProductionConfig: AppConfig = {
  ...mockAppConfig,
  env: 'production',
  logLevel: 'info',
  api: {
    port: 80,
    host: '0.0.0.0',
    basePath: '/api/v1',
  },
  security: {
    apiKeyHeader: 'X-API-Key',
    rateLimit: {
      windowMs: 60000,
      maxRequests: 1000,
    },
  },
  features: {
    tracing: true,
    metrics: true,
    autoScaling: true,
  },
};

/**
 * Development application configuration
 */
export const mockDevelopmentConfig: AppConfig = {
  ...mockAppConfig,
  env: 'development',
  logLevel: 'debug',
  api: {
    port: 7373,
    host: 'localhost',
    basePath: '/api/v1',
  },
  features: {
    tracing: false,
    metrics: false,
    autoScaling: false,
  },
};

// ============================================================================
// Swarm Configuration Fixtures
// ============================================================================

/**
 * Default swarm configuration
 */
export const mockSwarmConfig = {
  name: 'test-swarm',
  description: 'Test swarm for development',
  maxAgents: 10,
  timeout: 300000,
  strategy: 'parallel' as const,
  agents: [
    { type: 'analyzer', count: 2 },
    { type: 'implementer', count: 3 },
    { type: 'reviewer', count: 1 },
  ],
};

/**
 * Sequential swarm configuration
 */
export const mockSequentialSwarmConfig = {
  ...mockSwarmConfig,
  name: 'sequential-test-swarm',
  strategy: 'sequential' as const,
  agents: [
    { type: 'planner', count: 1 },
    { type: 'implementer', count: 1 },
    { type: 'tester', count: 1 },
  ],
};

/**
 * Large swarm configuration
 */
export const mockLargeSwarmConfig = {
  ...mockSwarmConfig,
  name: 'large-test-swarm',
  maxAgents: 100,
  agents: [
    { type: 'worker', count: 50 },
    { type: 'coordinator', count: 5 },
  ],
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a custom runtime configuration
 * 
 * @example
 * ```typescript
 * const config = createRuntimeConfig({
 *   default: 'native',
 *   pi: { maxConcurrent: 20 }
 * });
 * ```
 */
export function createRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    ...mockRuntimeConfig,
    ...overrides,
    pi: overrides.pi ? { ...mockRuntimeConfig.pi, ...overrides.pi } : mockRuntimeConfig.pi,
    native: overrides.native ? { ...mockRuntimeConfig.native, ...overrides.native } : mockRuntimeConfig.native,
  };
}

/**
 * Creates a custom Pi client configuration
 * 
 * @example
 * ```typescript
 * const config = createPiClientConfig({
 *   provider: 'openai',
 *   model: 'gpt-4o'
 * });
 * ```
 */
export function createPiClientConfig(overrides: Partial<PiClientConfig> = {}): PiClientConfig {
  return {
    ...mockPiClientConfig,
    ...overrides,
  };
}

/**
 * Creates a custom PostgreSQL configuration
 * 
 * @example
 * ```typescript
 * const config = createPostgresConfig({
 *   host: 'custom-db.example.com',
 *   database: 'custom_db'
 * });
 * ```
 */
export function createPostgresConfig(overrides: Partial<PostgresConfig> = {}): PostgresConfig {
  return {
    ...mockPostgresConfig,
    ...overrides,
  };
}

/**
 * Creates a custom Redis configuration
 * 
 * @example
 * ```typescript
 * const config = createRedisConfig({
 *   host: 'custom-redis.example.com',
 *   db: 2
 * });
 * ```
 */
export function createRedisConfig(overrides: Partial<typeof mockRedisConfig> = {}): typeof mockRedisConfig {
  return {
    ...mockRedisConfig,
    ...overrides,
  };
}

/**
 * Creates a custom application configuration
 * 
 * @example
 * ```typescript
 * const config = createAppConfig({
 *   env: 'staging',
 *   logLevel: 'warn'
 * });
 * ```
 */
export function createAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...mockAppConfig,
    ...overrides,
    api: overrides.api ? { ...mockAppConfig.api, ...overrides.api } : mockAppConfig.api,
    security: overrides.security ? { ...mockAppConfig.security, ...overrides.security } : mockAppConfig.security,
    features: overrides.features ? { ...mockAppConfig.features, ...overrides.features } : mockAppConfig.features,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Merges configuration with environment-specific overrides
 * 
 * @example
 * ```typescript
 * const config = mergeWithEnvConfig(mockAppConfig, {
 *   api: { port: process.env.PORT }
 * });
 * ```
 */
export function mergeWithEnvConfig<T extends Record<string, unknown>>(
  base: T,
  envOverrides: Partial<T>
): T {
  return {
    ...base,
    ...envOverrides,
  };
}

/**
 * Validates a configuration object (basic validation)
 * 
 * @example
 * ```typescript
 * const isValid = isValidRuntimeConfig(config);
 * ```
 */
export function isValidRuntimeConfig(config: unknown): config is RuntimeConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Partial<RuntimeConfig>;
  return (
    typeof c.default === 'string' &&
    (c.pi === undefined || typeof c.pi === 'object') &&
    (c.native === undefined || typeof c.native === 'object')
  );
}

/**
 * Gets configuration for a specific environment
 * 
 * @example
 * ```typescript
 * const config = getConfigForEnv('production');
 * ```
 */
export function getConfigForEnv(env: 'development' | 'test' | 'production'): AppConfig {
  switch (env) {
    case 'production':
      return mockProductionConfig;
    case 'development':
      return mockDevelopmentConfig;
    case 'test':
    default:
      return mockAppConfig;
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  mockRuntimeConfig,
  mockOpenAIRuntimeConfig,
  mockNativeRuntimeConfig,
  mockHighConcurrencyRuntimeConfig,
  mockPiClientConfig,
  mockOpenAIPiConfig,
  mockGooglePiConfig,
  mockLocalPiConfig,
  mockPiConfigAllTools,
  mockPiConfigNoTools,
  mockPostgresConfig,
  mockCiPostgresConfig,
  mockSslPostgresConfig,
  mockPooledPostgresConfig,
  mockRedisConfig,
  mockCiRedisConfig,
  mockAuthRedisConfig,
  mockRedisClusterConfig,
  mockAppConfig,
  mockProductionConfig,
  mockDevelopmentConfig,
  mockSwarmConfig,
  mockSequentialSwarmConfig,
  mockLargeSwarmConfig,
  createRuntimeConfig,
  createPiClientConfig,
  createPostgresConfig,
  createRedisConfig,
  createAppConfig,
  mergeWithEnvConfig,
  isValidRuntimeConfig,
  getConfigForEnv,
};
