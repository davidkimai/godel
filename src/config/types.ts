/**
 * Configuration Types
 * 
 * TypeScript type definitions for the Dash configuration system.
 */

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
  /** Retry attempts */
  retryAttempts: number;
  /** Retry delay in milliseconds */
  retryDelayMs: number;
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
  };
  /** Specification */
  spec: {
    /** Task definition */
    task: string;
    /** Strategy: parallel, sequential, or custom */
    strategy?: 'parallel' | 'sequential' | 'round-robin';
    /** Initial number of agents */
    initialAgents?: number;
    /** Maximum agents */
    maxAgents?: number;
    /** Minimum agents */
    minAgents?: number;
    /** Agent type */
    agentType?: string;
    /** Configuration */
    config?: Record<string, unknown>;
  };
}

// ============================================================================
// Config Diff Result
// ============================================================================

export interface ConfigDiffResult {
  /** Whether configs are identical */
  identical: boolean;
  /** List of differences */
  differences: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
    type: 'added' | 'removed' | 'modified';
  }>;
  /** Timestamp of diff */
  timestamp: string;
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
