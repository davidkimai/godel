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
 * Get PostgreSQL configuration from environment variables
 */
export function getPostgresConfig(): PostgresConfig {
  return {
    host: process.env['POSTGRES_HOST'] || 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] || '5432', 10),
    database: process.env['POSTGRES_DB'] || 'dash',
    user: process.env['POSTGRES_USER'] || 'dash',
    password: process.env['POSTGRES_PASSWORD'] || 'dash',
    
    // Pool sizing based on load testing recommendations
    // Default: 10-20 for 50+ agents
    poolSize: parseInt(process.env['POSTGRES_POOL_SIZE'] || '10', 10),
    minPoolSize: parseInt(process.env['POSTGRES_MIN_POOL_SIZE'] || '2', 10),
    maxPoolSize: parseInt(process.env['POSTGRES_MAX_POOL_SIZE'] || '20', 10),
    
    // Timeouts
    connectionTimeoutMs: parseInt(process.env['POSTGRES_CONNECTION_TIMEOUT'] || '5000', 10),
    idleTimeoutMs: parseInt(process.env['POSTGRES_IDLE_TIMEOUT'] || '30000', 10),
    acquireTimeoutMs: parseInt(process.env['POSTGRES_ACQUIRE_TIMEOUT'] || '5000', 10),
    
    // Retry configuration for transient failures
    retryAttempts: parseInt(process.env['POSTGRES_RETRY_ATTEMPTS'] || '3', 10),
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
