/**
 * Configuration Types
 * 
 * TypeScript type definitions for the Dash configuration system.
 */

import type { Static } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';

// ============================================================================
// TypeBox Schemas
// ============================================================================

export const SwarmYamlSchema = Type.Object({
  apiVersion: Type.String({ pattern: '^dash\\.io/v1$' }),
  kind: Type.Literal('Swarm'),
  metadata: Type.Object({
    name: Type.String(),
    namespace: Type.Optional(Type.String()),
    labels: Type.Optional(Type.Record(Type.String(), Type.String())),
    annotations: Type.Optional(Type.Record(Type.String(), Type.String())),
    description: Type.Optional(Type.String()),
  }),
  spec: Type.Object({
    task: Type.String(),
    strategy: Type.Optional(Type.Union([
      Type.Literal('parallel'),
      Type.Literal('map-reduce'),
      Type.Literal('pipeline'),
      Type.Literal('tree'),
      Type.Literal('sequential'),
      Type.Literal('round-robin'),
    ])),
    initialAgents: Type.Optional(Type.Number()),
    maxAgents: Type.Optional(Type.Number()),
    minAgents: Type.Optional(Type.Number()),
    agentType: Type.Optional(Type.String()),
    model: Type.Optional(Type.String()),
    config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    budget: Type.Optional(Type.Object({
      amount: Type.Number(),
      currency: Type.Optional(Type.String()),
      warningThreshold: Type.Optional(Type.Number()),
      criticalThreshold: Type.Optional(Type.Number()),
    })),
    safety: Type.Optional(Type.Object({
      fileSandbox: Type.Optional(Type.Boolean()),
      networkAllowlist: Type.Optional(Type.Array(Type.String())),
      commandBlacklist: Type.Optional(Type.Array(Type.String())),
      maxExecutionTime: Type.Optional(Type.Number()),
    })),
    gitops: Type.Optional(Type.Object({
      enabled: Type.Optional(Type.Boolean()),
      watchInterval: Type.Optional(Type.Number()),
      autoApply: Type.Optional(Type.Boolean()),
      rollbackOnFailure: Type.Optional(Type.Boolean()),
      notifyOnChange: Type.Optional(Type.Boolean()),
    })),
  }),
});

// ============================================================================
// Server Configuration
// ============================================================================

export interface ServerConfig {
  /** Server framework: 'express' | 'fastify' */
  framework: 'express' | 'fastify';
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** CORS configuration */
  cors: {
    /** Allowed origins */
    origins: string[];
    /** Allow credentials */
    credentials: boolean;
  };
  /** Rate limit (requests per minute) */
  rateLimit: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

// ============================================================================
// Database Configuration
// ============================================================================

export interface DatabaseConfig {
  /** PostgreSQL connection URL */
  url: string;
  /** Connection pool size */
  poolSize: number;
  /** Minimum pool size */
  minPoolSize: number;
  /** Maximum pool size */
  maxPoolSize: number;
  /** Enable SSL */
  ssl: boolean | DatabaseSslConfig;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: number;
  /** Idle timeout in milliseconds */
  idleTimeoutMs: number;
  /** Acquire timeout in milliseconds */
  acquireTimeoutMs: number;
  /** Statement timeout in milliseconds */
  statementTimeoutMs: number;
  /** Retry attempts */
  retryAttempts: number;
  /** Retry delay in milliseconds */
  retryDelayMs: number;
  /** Maximum retry delay in milliseconds */
  retryMaxDelayMs: number;
  /** Enable TCP keep-alive */
  keepAlive: boolean;
  /** TCP keep-alive initial delay in milliseconds */
  keepAliveInitialDelayMs: number;
  /** Maximum uses per connection (0 = unlimited) */
  maxUses: number;
  /** Application name for PostgreSQL */
  applicationName: string;
}

export interface DatabaseSslConfig {
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

// ============================================================================
// Redis Configuration
// ============================================================================

export interface RedisConfig {
  /** Redis connection URL */
  url: string;
  /** Redis password */
  password?: string;
  /** Redis database number */
  db: number;
  /** Connection timeout in milliseconds */
  connectTimeoutMs: number;
  /** Command timeout in milliseconds */
  commandTimeoutMs: number;
  /** Max retries per request */
  maxRetriesPerRequest: number;
  /** Enable offline queue */
  enableOfflineQueue: boolean;
}

// ============================================================================
// Authentication Configuration
// ============================================================================

export interface AuthConfig {
  /** API keys for authentication */
  apiKeys: string[];
  /** JWT secret for token signing */
  jwtSecret: string;
  /** Token expiry in seconds */
  tokenExpirySeconds: number;
  /** Refresh token expiry in seconds */
  refreshTokenExpirySeconds: number;
  /** Enable API key auth */
  enableApiKeyAuth: boolean;
  /** Enable JWT auth */
  enableJwtAuth: boolean;
}

// ============================================================================
// Logging Configuration
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
export type LogFormat = 'json' | 'pretty' | 'compact';

export interface LoggingConfig {
  /** Log level */
  level: LogLevel;
  /** Log format */
  format: LogFormat;
  /** Log destination */
  destination: 'stdout' | 'stderr' | 'file' | 'loki' | 'multiple';
  /** Log file path (when destination is 'file') */
  filePath?: string;
  /** Loki URL (when destination includes 'loki') */
  lokiUrl?: string;
  /** Service name for logging */
  serviceName: string;
  /** Include timestamps */
  includeTimestamp: boolean;
  /** Include source file/line */
  includeSourceLocation: boolean;
}

// ============================================================================
// Metrics Configuration
// ============================================================================

export interface MetricsConfig {
  /** Enable metrics collection */
  enabled: boolean;
  /** Metrics server port */
  port: number;
  /** Metrics server host */
  host: string;
  /** Metrics endpoint path */
  path: string;
  /** Enable default Node.js metrics */
  enableDefaultMetrics: boolean;
  /** Metrics prefix */
  prefix: string;
  /** Collect interval in milliseconds */
  collectIntervalMs: number;
}

// ============================================================================
// Budget Configuration
// ============================================================================

export interface BudgetConfig {
  /** Default budget limit */
  defaultLimit: number;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Warning threshold (0-1) */
  warningThreshold: number;
  /** Critical threshold (0-1) */
  criticalThreshold: number;
  /** Maximum budget for self-improvement */
  selfImprovementMaxBudget: number;
  /** Max tokens per agent */
  maxTokensPerAgent: number;
}

// ============================================================================
// OpenClaw Configuration
// ============================================================================

export interface OpenClawConfig {
  /** Gateway WebSocket URL */
  gatewayUrl: string;
  /** Gateway authentication token */
  gatewayToken?: string;
  /** Session identifier */
  sessionId?: string;
  /** Mode: restricted or full */
  mode: 'restricted' | 'full';
  /** Sandbox mode */
  sandboxMode: 'none' | 'non-main' | 'docker';
  /** Enable mock mode for testing */
  mockMode: boolean;
  /** Verbose logging */
  verbose: boolean;
}

// ============================================================================
// Event Bus Configuration
// ============================================================================

export interface EventBusConfig {
  /** Event bus type */
  type: 'memory' | 'redis';
  /** Stream key for Redis */
  streamKey: string;
  /** Consumer group name */
  consumerGroup: string;
  /** Compression threshold in bytes */
  compressionThreshold: number;
  /** Max stream length */
  maxStreamLength: number;
  /** Max queued events during fallback */
  maxQueuedEvents: number;
  /** Retry configuration */
  retry: {
    maxRetries: number;
    retryDelayMs: number;
    retryDelayMultiplier: number;
  };
}

// ============================================================================
// Vault Configuration (for secrets)
// ============================================================================

export interface VaultConfig {
  /** Vault address */
  address: string;
  /** Vault token */
  token?: string;
  /** Vault namespace (Enterprise) */
  namespace?: string;
  /** KV secrets engine version */
  kvVersion: 'v1' | 'v2';
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Enable TLS verification */
  tlsVerify: boolean;
}

// ============================================================================
// Main Configuration
// ============================================================================

export interface DashConfig {
  /** Environment name */
  env: string;
  /** Server configuration */
  server: ServerConfig;
  /** Database configuration */
  database: DatabaseConfig;
  /** Redis configuration */
  redis: RedisConfig;
  /** Authentication configuration */
  auth: AuthConfig;
  /** Logging configuration */
  logging: LoggingConfig;
  /** Metrics configuration */
  metrics: MetricsConfig;
  /** Budget configuration */
  budget: BudgetConfig;
  /** OpenClaw configuration */
  openclaw: OpenClawConfig;
  /** Event bus configuration */
  eventBus: EventBusConfig;
  /** Vault configuration (optional) */
  vault?: VaultConfig;
  /** Feature flags */
  features: Record<string, boolean>;
}

// ============================================================================
// Configuration Loading Options
// ============================================================================

export interface ConfigLoadOptions {
  /** Environment name (overrides NODE_ENV) */
  env?: string;
  /** Configuration directory path */
  configDir?: string;
  /** Enable Vault secret resolution */
  enableVault?: boolean;
  /** Skip environment variable substitution */
  skipEnvSubstitution?: boolean;
}

// ============================================================================
// Configuration Validation Error
// ============================================================================

export interface ConfigValidationError {
  /** Error path in the config */
  path: string;
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** Suggested fix */
  suggestion?: string;
}

export class ConfigValidationException extends Error {
  constructor(
    message: string,
    public readonly errors: ConfigValidationError[],
    public readonly configPath?: string
  ) {
    super(message);
    this.name = 'ConfigValidationException';
  }
}

// ============================================================================
// Swarm YAML Configuration
// ============================================================================

export interface SwarmYamlConfig {
  /** API version */
  apiVersion: string;
  /** Resource kind */
  kind: 'Swarm';
  /** Metadata */
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    description?: string;
  };
  /** Specification */
  spec: {
    /** Task definition */
    task: string;
    /** Strategy: parallel, sequential, or custom */
    strategy?: 'parallel' | 'sequential' | 'round-robin' | 'map-reduce' | 'pipeline' | 'tree';
    /** Initial number of agents */
    initialAgents?: number;
    /** Maximum agents */
    maxAgents?: number;
    /** Minimum agents */
    minAgents?: number;
    /** Agent type */
    agentType?: string;
    /** Model to use */
    model?: string;
    /** Configuration */
    config?: Record<string, unknown>;
    /** Budget configuration */
    budget?: {
      amount: number;
      currency?: string;
      warningThreshold?: number;
      criticalThreshold?: number;
    };
    /** Safety configuration */
    safety?: {
      fileSandbox?: boolean;
      networkAllowlist?: string[];
      commandBlacklist?: string[];
      maxExecutionTime?: number;
    };
    /** GitOps configuration */
    gitops?: GitOpsConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ============================================================================
// Config Diff
// ============================================================================

export interface ConfigDiff {
  /** Path to the changed property */
  path: string;
  /** Old value */
  oldValue: unknown;
  /** New value */
  newValue: unknown;
  /** Type of change */
  type: 'added' | 'removed' | 'modified';
}

export interface ConfigDiffResult {
  /** Whether configs are identical */
  identical: boolean;
  /** List of differences */
  differences: ConfigDiff[];
  /** Summary of changes */
  summary?: {
    added: number;
    removed: number;
    modified: number;
  };
  /** Timestamp of diff */
  timestamp: string;
}

// ============================================================================
// GitOps Configuration
// ============================================================================

export interface GitOpsConfig {
  /** Enable GitOps watching */
  enabled: boolean;
  /** Watch interval in milliseconds */
  watchInterval: number;
  /** Auto-apply changes */
  autoApply: boolean;
  /** Rollback on failure */
  rollbackOnFailure: boolean;
  /** Notify on change */
  notifyOnChange: boolean;
}

export interface GitOpsEvent {
  /** Event type */
  type: 'config.loaded' | 'config.changed' | 'config.applied' | 'config.failed' | 'config.rolledback';
  /** Event timestamp */
  timestamp: Date;
  /** Path to config file */
  filePath: string;
  /** Swarm ID */
  swarmId: string;
  /** Config diff (for change events) */
  diff?: ConfigDiffResult;
  /** Error (for failed events) */
  error?: Error;
}

export type GitOpsEventHandler = (event: GitOpsEvent) => void;

// ============================================================================
// Configuration Load Result
// ============================================================================

export interface ConfigLoadResult {
  /** Loaded and validated configuration */
  config: SwarmYamlConfig;
  /** Raw file content */
  rawContent: string;
  /** Path to config file */
  filePath: string;
  /** MD5 checksum of content */
  checksum: string;
  /** List of resolved secret paths */
  resolvedSecrets: string[];
  /** List of substituted environment variables */
  substitutedEnvVars: string[];
}

// ============================================================================
// Secret Resolution
// ============================================================================

export type SecretProvider = 'vault' | 'env' | 'file';

export interface SecretReference {
  /** Secret provider */
  provider: SecretProvider;
  /** Secret path */
  path: string;
  /** Secret key (for nested secrets) */
  key?: string;
  /** Default value if secret not found */
  default?: string;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface ConfigCliOptions {
  /** Configuration directory */
  configDir?: string;
  /** Environment */
  env?: string;
  /** Output format */
  format?: 'json' | 'yaml' | 'table';
  /** Show secrets */
  showSecrets?: boolean;
}
