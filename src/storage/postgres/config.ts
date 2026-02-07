/**
 * PostgreSQL Database Configuration
 * 
 * Environment-based configuration for PostgreSQL connection pooling.
 * Supports connection retries and configurable pool sizes.
 */

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  
  // Pool configuration
  poolSize: number;
  minPoolSize: number;
  maxPoolSize: number;
  
  // Connection timeouts
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
  
  // Retry configuration
  retryAttempts: number;
  retryDelayMs: number;
  
  // SSL configuration
  ssl: boolean | { rejectUnauthorized: boolean; ca?: string; cert?: string; key?: string };
}

/**
 * Optimized pool configuration for 50+ concurrent agents
 * These settings ensure stable connections under high concurrency
 */
export const optimizedPoolConfig = {
  // Increase for concurrent agents (50+ agents)
  max: 50,                    // Was: 20 - Support 50+ concurrent connections
  min: 5,                     // Was: 2 - Keep warm connections ready
  
  // Extended timeouts for stability under load
  acquireTimeoutMillis: 30000, // Was: 5000 - 30s to acquire connection
  idleTimeoutMillis: 300000,   // Was: 30000 - 5min idle timeout
  connectionTimeoutMillis: 30000, // Was: 5000 - 30s to create connection
  
  // Health checks
  reapIntervalMillis: 1000,    // Check idle connections every 1s
  
  // Connection lifecycle
  maxUses: 7500,               // Recycle connections after 7500 uses
};

/**
 * Get PostgreSQL configuration from environment variables
 * Optimized defaults for high-concurrency scenarios (50+ agents)
 */
export function getPostgresConfig(): PostgresConfig {
  return {
    host: process.env['POSTGRES_HOST'] || 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] || '5432', 10),
    database: process.env['POSTGRES_DB'] || 'godel',
    user: process.env['POSTGRES_USER'] || 'godel',
    password: process.env['POSTGRES_PASSWORD'] || 'godel',
    
    // Pool sizing optimized for 50+ concurrent agents
    // Uses Levenshtein formula: connections ≈ (cores * 2) + effective_spindle_count
    // With connection pooling, we can support many more agents
    poolSize: parseInt(process.env['POSTGRES_POOL_SIZE'] || '25', 10),
    minPoolSize: parseInt(process.env['POSTGRES_MIN_POOL_SIZE'] || '5', 10),
    maxPoolSize: parseInt(process.env['POSTGRES_MAX_POOL_SIZE'] || '50', 10),
    
    // Extended timeouts for stability under concurrent load
    connectionTimeoutMs: parseInt(process.env['POSTGRES_CONNECTION_TIMEOUT'] || '30000', 10),
    idleTimeoutMs: parseInt(process.env['POSTGRES_IDLE_TIMEOUT'] || '300000', 10),
    acquireTimeoutMs: parseInt(process.env['POSTGRES_ACQUIRE_TIMEOUT'] || '30000', 10),
    
    // Retry configuration for transient failures
    retryAttempts: parseInt(process.env['POSTGRES_RETRY_ATTEMPTS'] || '5', 10),
    retryDelayMs: parseInt(process.env['POSTGRES_RETRY_DELAY'] || '1000', 10),
    
    // SSL
    ssl: process.env['POSTGRES_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  };
}

/**
 * Get connection string from configuration
 */
export function getConnectionString(config?: Partial<PostgresConfig>): string {
  const cfg = { ...getPostgresConfig(), ...config };
  const sslParam = typeof cfg.ssl === 'object' ? '?sslmode=require' : '';
  return `postgresql://${cfg.user}:${cfg.password}@${cfg.host}:${cfg.port}/${cfg.database}${sslParam}`;
}

export default getPostgresConfig;
