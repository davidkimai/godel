# Dash Configuration System

Comprehensive configuration management for Dash with validation, secrets management, and environment-specific configs.

## Table of Contents

- [Overview](#overview)
- [Configuration Sources](#configuration-sources)
- [Configuration Files](#configuration-files)
- [Environment Variables](#environment-variables)
- [Configuration Schema](#configuration-schema)
- [Secrets Management](#secrets-management)
- [CLI Commands](#cli-commands)
- [Programmatic API](#programmatic-api)
- [Environment-Specific Configs](#environment-specific-configs)
- [Validation](#validation)
- [Migration Guide](#migration-guide)

## Overview

The Dash configuration system provides:

- **Multiple config sources**: Environment variables, YAML/JSON files, and defaults
- **Type-safe validation**: Zod schema validation with helpful error messages
- **Secrets management**: HashiCorp Vault integration with `${VAULT:path}` syntax
- **Environment-specific configs**: Separate configs for dev, production, and test
- **CLI tools**: Manage configuration via `swarmctl config` commands
- **Hot reloading**: Config changes detected and applied automatically

## Configuration Sources

Configuration is loaded in the following priority order (highest to lowest):

1. **Environment Variables** - Override all other sources
2. **Environment-specific config files** - `config/dash.{env}.yaml`
3. **Base config files** - `config/dash.yaml`
4. **Environment-specific defaults** - Built-in defaults for the environment
5. **Default values** - Built-in fallback values (lowest priority)

## Configuration Files

### Location

Configuration files are stored in the `config/` directory:

```
config/
├── dash.yaml              # Base configuration
├── dash.development.yaml  # Development overrides
├── dash.production.yaml   # Production overrides
├── dash.test.yaml         # Test overrides
└── dash.example.yaml      # Example/template
```

### File Formats

Both YAML and JSON are supported:

```yaml
# config/dash.yaml
server:
  port: 7373
  host: localhost
  
database:
  url: postgresql://dash:dash@localhost:5432/dash
```

```json
// config/dash.json
{
  "server": {
    "port": 7373,
    "host": "localhost"
  },
  "database": {
    "url": "postgresql://dash:dash@localhost:5432/dash"
  }
}
```

### Environment Variable Substitution

Use `$VAR` or `${VAR}` syntax in config files:

```yaml
database:
  url: ${DATABASE_URL}
  
auth:
  jwtSecret: ${GODEL_JWT_SECRET}
```

Default values are supported:

```yaml
server:
  port: ${PORT:-7373}        # Use 7373 if PORT not set
  host: ${HOST:=localhost}   # Set HOST to localhost if not set
```

## Environment Variables

All configuration values can be set via environment variables:

### Server
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `7373` |
| `HOST` | Server host | `localhost` |
| `GODEL_CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:3000` |
| `GODEL_RATE_LIMIT` | Rate limit (requests/minute) | `100` |

### Database
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Full PostgreSQL connection URL | - |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DB` | Database name | `dash` |
| `POSTGRES_USER` | Database user | `dash` |
| `POSTGRES_PASSWORD` | Database password | `dash` |
| `POSTGRES_POOL_SIZE` | Connection pool size | `10` |
| `POSTGRES_SSL` | Enable SSL | `false` |

### Redis
| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Full Redis connection URL | `redis://localhost:6379/0` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `REDIS_DB` | Redis database number | `0` |

### Authentication
| Variable | Description | Default |
|----------|-------------|---------|
| `GODEL_API_KEY` | API keys (comma-separated) | `dash-api-key` |
| `GODEL_JWT_SECRET` | JWT secret for token signing | `change-me-in-production` |

### Logging
| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Log level (debug, info, warn, error) | `info` |
| `LOG_FORMAT` | Log format (json, pretty, compact) | `pretty` |
| `LOG_DESTINATION` | Log destination | `stdout` |
| `LOKI_URL` | Loki URL for log aggregation | `http://localhost:3100` |

### OpenClaw
| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_GATEWAY_URL` | Gateway WebSocket URL | `ws://127.0.0.1:18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway authentication token | - |
| `OPENCLAW_MODE` | Mode (restricted, full) | `restricted` |

### Vault
| Variable | Description | Default |
|----------|-------------|---------|
| `VAULT_ADDR` | Vault server address | `http://localhost:8200` |
| `VAULT_TOKEN` | Vault authentication token | - |
| `VAULT_NAMESPACE` | Vault namespace (Enterprise) | - |

## Configuration Schema

### Server Configuration

```typescript
interface ServerConfig {
  port: number;              // Server port
  host: string;              // Server host
  cors: {
    origins: string[];       // Allowed origins
    credentials: boolean;    // Allow credentials
  };
  rateLimit: number;         // Requests per minute
  timeoutMs: number;         // Request timeout
}
```

### Database Configuration

```typescript
interface DatabaseConfig {
  url: string;               // Connection URL
  poolSize: number;          // Pool size
  minPoolSize: number;       // Minimum connections
  maxPoolSize: number;       // Maximum connections
  ssl: boolean | SslConfig;  // SSL configuration
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}
```

### Redis Configuration

```typescript
interface RedisConfig {
  url: string;               // Connection URL
  password?: string;         // Password
  db: number;                // Database number
  connectTimeoutMs: number;
  commandTimeoutMs: number;
  maxRetriesPerRequest: number;
  enableOfflineQueue: boolean;
}
```

### Authentication Configuration

```typescript
interface AuthConfig {
  apiKeys: string[];         // API keys
  jwtSecret: string;         // JWT secret
  tokenExpirySeconds: number;
  refreshTokenExpirySeconds: number;
  enableApiKeyAuth: boolean;
  enableJwtAuth: boolean;
}
```

### Logging Configuration

```typescript
interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  format: 'json' | 'pretty' | 'compact';
  destination: 'stdout' | 'stderr' | 'file' | 'loki' | 'multiple';
  filePath?: string;
  lokiUrl?: string;
  serviceName: string;
  includeTimestamp: boolean;
  includeSourceLocation: boolean;
}
```

### Metrics Configuration

```typescript
interface MetricsConfig {
  enabled: boolean;
  port: number;
  host: string;
  path: string;
  enableDefaultMetrics: boolean;
  prefix: string;
  collectIntervalMs: number;
}
```

### Budget Configuration

```typescript
interface BudgetConfig {
  defaultLimit: number;      // Default budget per agent (USD)
  currency: string;          // Currency code
  warningThreshold: number;  // Warning at % (0-1)
  criticalThreshold: number; // Critical at % (0-1)
  selfImprovementMaxBudget: number;
  maxTokensPerAgent: number;
}
```

## Secrets Management

### Vault Integration

Dash supports HashiCorp Vault for secret management:

```yaml
# Enable Vault in config
vault:
  address: https://vault.example.com:8200
  token: ${VAULT_TOKEN}
  kvVersion: v2
  timeoutMs: 5000
  tlsVerify: true
```

### Secret Reference Syntax

Reference secrets in configuration using `${VAULT:path}` syntax:

```yaml
database:
  url: postgresql://user:${VAULT:secret/db/password}@localhost:5432/dash
  
auth:
  jwtSecret: ${VAULT:secret/dash/jwt#secret}
  
openclaw:
  gatewayToken: ${VAULT:secret/dash/openclaw#token}
```

### Secret Reference Formats

| Format | Description | Example |
|--------|-------------|---------|
| `${VAULT:path}` | Full secret value | `${VAULT:secret/db/creds}` |
| `${VAULT:path#key}` | Specific key from secret | `${VAULT:secret/db/creds#password}` |
| `${VAULT:path?default=value}` | With default value | `${VAULT:secret/key?default=fallback}` |

### Environment Variable Secrets

For simpler setups, use environment variables:

```yaml
auth:
  jwtSecret: ${ENV:GODEL_JWT_SECRET}
```

### File-Based Secrets

Read secrets from files (useful for Docker secrets):

```yaml
auth:
  jwtSecret: ${FILE:/run/secrets/jwt_secret}
```

## CLI Commands

### Get Configuration

```bash
# Get all configuration values
swarmctl config list

# Get specific value
swarmctl config get server.port
swarmctl config get database.url

# Output formats
swarmctl config get server.port --format json
swarmctl config get server.port --format yaml
swarmctl config get --format table

# Show secrets (hidden by default)
swarmctl config get auth.jwtSecret --show-secrets
```

### Set Configuration

```bash
# Show how to set a value
swarmctl config set server.port 8080

# Dry run
swarmctl config set server.port 8080 --dry-run
```

### Validate Configuration

```bash
# Validate current configuration
swarmctl config validate

# Validate for specific environment
swarmctl config validate --env production

# Enable Vault secret resolution
swarmctl config validate --enable-vault

# Strict mode (exit on warnings)
swarmctl config validate --strict
```

### List Configuration

```bash
# List all values
swarmctl config list

# Filter by pattern
swarmctl config list --filter "server.*"
swarmctl config list --filter "auth.*"

# Output formats
swarmctl config list --format json
swarmctl config list --format yaml
swarmctl config list --format table
```

### Show Sources

```bash
# Show configuration sources
swarmctl config sources
```

### Feature Flags

```bash
# List feature flags
swarmctl config features
```

## Programmatic API

### Loading Configuration

```typescript
import { loadConfig, getConfig, reloadConfig } from './config';

// Load configuration
const { config, sources, warnings } = await loadConfig({
  env: 'production',
  configDir: './config',
  enableVault: true,
});

// Get cached configuration
const cachedConfig = await getConfig();

// Reload configuration
const freshConfig = await reloadConfig();
```

### Accessing Values

```typescript
import { getConfig, getConfigValue, isFeatureEnabled } from './config';

const config = await getConfig();

// Direct access
console.log(config.server.port);
console.log(config.database.url);

// By path
const port = getConfigValue(config, 'server.port');
const dbUrl = getConfigValue(config, 'database.url');

// Check features
if (isFeatureEnabled(config, 'metrics')) {
  // Enable metrics
}
```

### Validation

```typescript
import { validateConfig, validateConfigOrThrow } from './config';

// Validate without throwing
const result = validateConfig(config);
if (!result.success) {
  console.error(result.errors);
}

// Validate and throw on error
try {
  const validConfig = validateConfigOrThrow(config);
} catch (error) {
  console.error('Invalid configuration:', error.message);
}
```

### Secrets

```typescript
import { 
  SecretManager, 
  resolveSecret,
  hasSecretReferences 
} from './config';

// Check if value contains secrets
if (hasSecretReferences(value)) {
  // Resolve secrets
}

// Resolve a single secret
const password = await resolveSecret('${VAULT:secret/db/password}');

// Using SecretManager
const manager = new SecretManager(vaultConfig);
const result = await manager.resolve('${VAULT:secret/db/password}');
console.log(result.value, result.source);
```

## Environment-Specific Configs

### Development

```yaml
# config/dash.development.yaml
env: development

server:
  port: 7373
  cors:
    origins:
      - http://localhost:3000
      - http://localhost:5173

logging:
  level: debug
  format: pretty

features:
  autoScaling: false
```

### Production

```yaml
# config/dash.production.yaml
env: production

server:
  host: 0.0.0.0
  cors:
    origins: []  # Must be explicitly configured

database:
  ssl:
    rejectUnauthorized: true

logging:
  level: info
  format: json
  destination: loki

features:
  autoScaling: true
```

### Test

```yaml
# config/dash.test.yaml
env: test

server:
  port: 0  # Random port

database:
  url: postgresql://dash:dash@localhost:5432/dash_test

redis:
  url: redis://localhost:6379/15  # Use DB 15

eventBus:
  type: memory  # In-memory for tests

logging:
  level: error

features:
  gitops: false
  autoScaling: false
  selfImprovement: false
```

## Validation

### Validation Errors

When validation fails, helpful error messages are provided:

```
❌ Configuration validation failed:

❌ server.port
   Number must be less than or equal to 65535
   💡 Port must be between 1 and 65535

❌ auth.jwtSecret
   String must contain at least 32 character(s)
   💡 This is a sensitive value. Consider using ${VAULT:secret/path} syntax

❌ database.url
   Invalid URL format
   💡 Provide a valid URL (e.g., postgresql://localhost:5432/dash)
```

### Production Readiness Check

When validating for production, additional checks are performed:

```bash
$ swarmctl config validate --env production

✅ Configuration is valid

Production Readiness Check:
  ✓ JWT Secret
  ✓ API Keys
  ⚠ Database URL: Database should not use localhost in production
  ⚠ CORS Origins: CORS origins should be explicitly configured
```

## Migration Guide

### From Environment Variables Only

Before:
```typescript
const port = process.env.PORT || 7373;
const dbUrl = process.env.DATABASE_URL;
```

After:
```typescript
import { getConfig } from './config';

const config = await getConfig();
const port = config.server.port;
const dbUrl = config.database.url;
```

### From Custom Config Files

Before:
```typescript
import { readFileSync } from 'fs';
import YAML from 'yaml';

const config = YAML.parse(readFileSync('./config.yaml', 'utf-8'));
```

After:
```typescript
import { loadConfig } from './config';

const { config } = await loadConfig({
  configDir: './config',
  env: process.env.NODE_ENV,
});
```

### Adding Secrets

Before:
```typescript
const dbPassword = process.env.DB_PASSWORD;
```

After:
```yaml
# config/dash.yaml
database:
  url: postgresql://user:${VAULT:secret/db/password}@localhost:5432/dash
```

```typescript
const { config } = await loadConfig({ enableVault: true });
// Password is automatically resolved from Vault
```

## Best Practices

1. **Use environment-specific configs**: Separate configs for dev/staging/production
2. **Use Vault for secrets**: Never commit secrets to version control
3. **Validate on startup**: Always validate configuration before starting services
4. **Use environment variables for containerization**: Override config in containers
5. **Document your config**: Use `swarmctl config list` to see all available options
6. **Test config changes**: Use `--dry-run` to preview changes
7. **Monitor feature flags**: Use `swarmctl config features` to track enabled features

## Troubleshooting

### Configuration not loading

1. Check file paths: `swarmctl config sources`
2. Verify file syntax: `swarmctl config validate`
3. Check environment: `echo $NODE_ENV`

### Secrets not resolving

1. Verify Vault is accessible: `curl $VAULT_ADDR/v1/sys/health`
2. Check token permissions
3. Enable Vault in config: `enableVault: true`

### Validation errors

1. Run validation: `swarmctl config validate`
2. Check error messages for suggestions
3. Review the example config: `config/dash.example.yaml`
