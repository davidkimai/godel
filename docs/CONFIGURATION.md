# Dash YAML Configuration

Dash supports declarative configuration through YAML files, enabling GitOps workflows and infrastructure-as-code practices for managing agent swarms.

## Overview

```bash
# Apply a configuration file
swarmctl apply -f swarm.yaml

# Validate a configuration file
swarmctl validate swarm.yaml

# Show differences between config and running swarm
swarmctl diff swarm.yaml
```

## Configuration Format

### Basic Structure

```yaml
apiVersion: dash.io/v1
kind: Swarm

metadata:
  name: my-swarm
  description: A swarm of agents for processing

spec:
  task: Process the input data and generate reports
  strategy: parallel
  initialAgents: 5
  maxAgents: 20
  model: kimi-k2.5
```

### Full Example

```yaml
apiVersion: dash.io/v1
kind: Swarm

metadata:
  name: code-review-swarm
  description: A swarm of agents for code review
  labels:
    environment: production
    team: platform
  annotations:
    owner: platform-team@example.com

spec:
  task: Review the codebase for security vulnerabilities
  strategy: parallel
  initialAgents: 5
  maxAgents: 20
  model: kimi-k2.5
  
  budget:
    amount: 50.00
    currency: USD
    warningThreshold: 0.75
    criticalThreshold: 0.90
  
  safety:
    fileSandbox: true
    networkAllowlist:
      - github.com
    commandBlacklist:
      - rm -rf /
    maxExecutionTime: 300000
  
  scaling:
    enabled: true
    minAgents: 2
    maxAgents: 20
    scaleUpThreshold: 10
    scaleDownCooldown: 300
  
  gitops:
    enabled: true
    watchInterval: 5000
    autoApply: true
    rollbackOnFailure: true
  
  env:
    LOG_LEVEL: info
    API_KEY: ${API_KEY}
    DATABASE_URL: ${DATABASE_URL:-sqlite://./default.db}
```

## Field Reference

### apiVersion
- **Required**: Yes
- **Value**: `dash.io/v1`
- **Description**: API version for the configuration schema

### kind
- **Required**: Yes
- **Value**: `Swarm`
- **Description**: Type of resource being defined

### metadata

#### name
- **Required**: Yes
- **Type**: string
- **Description**: Unique name for the swarm

#### description
- **Required**: No
- **Type**: string
- **Description**: Human-readable description

#### labels
- **Required**: No
- **Type**: object (string key-value pairs)
- **Description**: Labels for organization and filtering

#### annotations
- **Required**: No
- **Type**: object (string key-value pairs)
- **Description**: Metadata for tooling and documentation

### spec

#### task
- **Required**: Yes
- **Type**: string
- **Description**: The main task description for the swarm

#### strategy
- **Required**: No
- **Type**: string
- **Default**: `parallel`
- **Options**: `parallel`, `map-reduce`, `pipeline`, `tree`
- **Description**: Execution strategy for the swarm

#### initialAgents
- **Required**: No
- **Type**: number
- **Default**: `5`
- **Description**: Initial number of agents to spawn

#### maxAgents
- **Required**: No
- **Type**: number
- **Default**: `50`
- **Description**: Maximum number of agents (for scaling)

#### model
- **Required**: No
- **Type**: string
- **Description**: Default model for all agents

### spec.budget

#### amount
- **Required**: Yes (if budget specified)
- **Type**: number
- **Description**: Budget limit in specified currency

#### currency
- **Required**: No
- **Type**: string
- **Default**: `USD`
- **Description**: Currency code (ISO 4217)

#### warningThreshold
- **Required**: No
- **Type**: number (0-1)
- **Default**: `0.75`
- **Description**: Percentage at which to warn about budget

#### criticalThreshold
- **Required**: No
- **Type**: number (0-1)
- **Default**: `0.90`
- **Description**: Percentage at which to stop the swarm

### spec.safety

#### fileSandbox
- **Required**: No
- **Type**: boolean
- **Default**: `true`
- **Description**: Enable file sandboxing

#### networkAllowlist
- **Required**: No
- **Type**: string[]
- **Description**: Allowed network domains

#### commandBlacklist
- **Required**: No
- **Type**: string[]
- **Description**: Blacklisted shell commands

#### maxExecutionTime
- **Required**: No
- **Type**: number (milliseconds)
- **Description**: Maximum agent execution time

### spec.scaling

#### enabled
- **Required**: No
- **Type**: boolean
- **Default**: `false`
- **Description**: Enable auto-scaling

#### minAgents
- **Required**: No
- **Type**: number
- **Default**: `1`
- **Description**: Minimum agent count

#### maxAgents
- **Required**: No
- **Type**: number
- **Default**: `50`
- **Description**: Maximum agent count

#### scaleUpThreshold
- **Required**: No
- **Type**: number
- **Default**: `10`
- **Description**: Queue depth to trigger scale up

#### scaleDownCooldown
- **Required**: No
- **Type**: number (seconds)
- **Default**: `300`
- **Description**: Cooldown before scaling down

### spec.gitops

#### enabled
- **Required**: No
- **Type**: boolean
- **Default**: `true`
- **Description**: Enable GitOps file watching

#### watchInterval
- **Required**: No
- **Type**: number (milliseconds)
- **Default**: `5000`
- **Description**: File check interval

#### autoApply
- **Required**: No
- **Type**: boolean
- **Default**: `true`
- **Description**: Automatically apply changes

#### rollbackOnFailure
- **Required**: No
- **Type**: boolean
- **Default**: `true`
- **Description**: Rollback on apply failure

#### notifyOnChange
- **Required**: No
- **Type**: boolean
- **Default**: `true`
- **Description**: Send notifications on changes

## Environment Variable Substitution

Dash supports environment variable substitution in configuration values using the following syntax:

### Syntax

| Syntax | Description |
|--------|-------------|
| `$VAR` | Simple substitution |
| `${VAR}` | Braced substitution |
| `${VAR:-default}` | Substitution with default value |

### Examples

```yaml
spec:
  env:
    # Simple substitution
    API_KEY: $API_KEY
    
    # Braced substitution
    DATABASE_URL: ${DATABASE_URL}
    
    # With default value
    LOG_LEVEL: ${LOG_LEVEL:-info}
    
    # Default with spaces
    COMPLEX_VAR: ${COMPLEX_VAR:-default value with spaces}
```

### Security Note

Environment variables are substituted at load time. The actual values are never stored in the configuration file.

## Secret Management (1Password)

Dash integrates with 1Password CLI for secure secret management.

### Prerequisites

1. Install 1Password CLI: https://developer.1password.com/docs/cli/get-started
2. Sign in: `op signin`

### Syntax

Use the template syntax to reference secrets:

```yaml
spec:
  env:
    API_KEY: {{ op://vault-name/item-name/field-name }}
```

### Example

```yaml
spec:
  env:
    GITHUB_TOKEN: {{ op://Production/GitHub/token }}
    DATABASE_PASSWORD: {{ op://Production/Database/password }}
```

### Security Features

- Secrets are resolved at load time, not stored in files
- Secret paths are logged for audit purposes, never values
- Cache with TTL (5 minutes default) to reduce CLI calls
- Automatic retry on transient failures

### Resolving Secrets

To resolve secrets during apply:

```bash
swarmctl apply -f swarm.yaml --resolve-secrets
```

Or set the environment variable:

```bash
export DASH_RESOLVE_SECRETS=true
swarmctl apply -f swarm.yaml
```

## GitOps Integration

Dash supports GitOps workflows with automatic configuration reloading.

### How It Works

1. Dash watches the configuration file for changes
2. When changes are detected, the new configuration is validated
3. Valid changes are automatically applied to the running swarm
4. Failed changes trigger a rollback to the previous configuration

### Enable GitOps

GitOps is enabled by default. To disable:

```yaml
spec:
  gitops:
    enabled: false
```

### Configuration Options

```yaml
spec:
  gitops:
    enabled: true
    watchInterval: 5000        # Check every 5 seconds
    autoApply: true            # Automatically apply changes
    rollbackOnFailure: true    # Rollback if apply fails
    notifyOnChange: true       # Send notifications
```

### Manual Watch Mode

Apply with watch mode from the CLI:

```bash
swarmctl apply -f swarm.yaml --watch
```

This enables file watching even if `spec.gitops.enabled` is false.

## CLI Commands

### Apply

Apply a configuration file to create or update a swarm:

```bash
# Apply configuration
swarmctl apply -f swarm.yaml

# Dry run (show what would happen)
swarmctl apply -f swarm.yaml --dry-run

# Watch for changes
swarmctl apply -f swarm.yaml --watch

# Resolve 1Password secrets
swarmctl apply -f swarm.yaml --resolve-secrets

# Skip confirmation
swarmctl apply -f swarm.yaml --yes
```

### Validate

Validate a configuration file without applying:

```bash
# Basic validation
swarmctl validate swarm.yaml

# Strict validation
swarmctl validate swarm.yaml --strict

# Verbose output
swarmctl validate swarm.yaml --verbose
```

### Diff

Show differences between a configuration file and a running swarm:

```bash
# Diff against swarm with matching name
swarmctl diff swarm.yaml

# Diff against specific swarm
swarmctl diff swarm.yaml --swarm-id swarm-123
```

## Programmatic API

### Loading Configurations

```typescript
import { loadConfig, toSwarmConfig } from '@jtan15010/dash/config';

// Load and validate
const result = await loadConfig({
  filePath: './swarm.yaml',
  substituteEnv: true,
  resolveSecrets: true,
  validate: true,
});

// Convert to SwarmConfig
const swarmConfig = toSwarmConfig(result.config);

// Create swarm
const swarm = await swarmManager.create(swarmConfig);
```

### GitOps Manager

```typescript
import { getGlobalGitOpsManager } from '@jtan15010/dash/config';

const gitops = getGlobalGitOpsManager(swarmManager);

// Watch a configuration file
await gitops.watch('./swarm.yaml', swarm.id);

// Subscribe to events
gitops.onGitOpsEvent((event) => {
  console.log(`${event.type}: ${event.filePath}`);
});

// Stop watching
await gitops.unwatch(swarm.id);
```

### Secret Resolution

```typescript
import { getGlobalSecretManager } from '@jtan15010/dash/config';

const secrets = getGlobalSecretManager();

// Resolve a single secret
const apiKey = await secrets.resolve('{{ op://Production/API/key }}');

// Resolve all secrets in an object
const { result } = await secrets.resolveInObject({
  apiKey: '{{ op://Production/API/key }}',
  dbPassword: '{{ op://Production/Database/password }}',
});
```

## Best Practices

### 1. Version Control

Store your configuration files in version control:

```bash
git add swarm.yaml
git commit -m "Add production swarm configuration"
```

### 2. Environment-Specific Configs

Use environment variable substitution for environment-specific values:

```yaml
# swarm.yaml
spec:
  env:
    ENV: ${ENV:-development}
    LOG_LEVEL: ${LOG_LEVEL:-debug}
```

### 3. Secret Management

Never commit secrets to version control. Use 1Password references:

```yaml
# GOOD - Secret reference
spec:
  env:
    API_KEY: {{ op://Production/API/key }}

# BAD - Hardcoded secret
spec:
  env:
    API_KEY: sk-live-12345
```

### 4. Validation in CI/CD

Validate configurations in your CI/CD pipeline:

```yaml
# .github/workflows/validate.yml
- name: Validate Dash configs
  run: |
    for f in configs/*.yaml; do
      swarmctl validate "$f"
    done
```

### 5. Configuration Drift Detection

Use `swarmctl diff` to detect configuration drift:

```bash
# In your monitoring/alerting
swarmctl diff swarm.yaml --swarm-id production-swarm
```

## Troubleshooting

### Validation Errors

```bash
# Get detailed error information
swarmctl validate swarm.yaml --verbose
```

Common validation errors:

- `initialAgents > maxAgents`: Ensure initialAgents <= maxAgents
- `apiVersion` mismatch: Must be exactly `dash.io/v1`
- `strategy` invalid: Must be one of: parallel, map-reduce, pipeline, tree

### Secret Resolution Failures

```bash
# Check 1Password CLI is available
op --version

# Check you're signed in
op account list

# Test secret resolution
op read "op://vault/item/field"
```

### GitOps Not Detecting Changes

1. Check the watch interval is reasonable (> 100ms)
2. Ensure the file path is absolute or relative to working directory
3. Check file permissions
4. Review logs for watcher errors

```yaml
spec:
  gitops:
    enabled: true
    watchInterval: 5000  # 5 seconds
```

## Migration from TypeScript Config

If you're migrating from TypeScript configuration:

### Before (TypeScript)

```typescript
const config: SwarmConfig = {
  name: 'my-swarm',
  task: 'Process data',
  initialAgents: 5,
  maxAgents: 20,
  strategy: 'parallel',
  budget: {
    amount: 50,
    currency: 'USD',
  },
};
```

### After (YAML)

```yaml
apiVersion: dash.io/v1
kind: Swarm
metadata:
  name: my-swarm
spec:
  task: Process data
  initialAgents: 5
  maxAgents: 20
  strategy: parallel
  budget:
    amount: 50
    currency: USD
```

## Examples

See the `examples/` directory for complete configuration examples:

- `examples/swarm.yaml` - Basic swarm configuration
- `examples/production-swarm.yaml` - Production-ready with all features
- `examples/scaling-swarm.yaml` - Auto-scaling configuration
