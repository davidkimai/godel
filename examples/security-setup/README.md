# Security Setup Example

This example demonstrates Godel's security features and best practices.

## Overview

Godel provides enterprise-grade security:
- Authentication (JWT, API Keys)
- Authorization (RBAC)
- API Key Management
- Rate Limiting
- Audit Logging
- Secret Management

## Examples

### 1. Configure Authentication

```bash
# Generate API key
godel config generate-api-key --name "production" --role admin

# List API keys
godel config list-api-keys

# Revoke API key
godel config revoke-api-key <key-id>
```

### 2. JWT Authentication

```typescript
import { GodelClient } from '@jtan15010/godel';

// Using JWT token
const client = new GodelClient({
  baseUrl: 'http://localhost:7373',
  auth: {
    type: 'jwt',
    token: 'your-jwt-token'
  }
});

// Or use API key
const clientWithKey = new GodelClient({
  baseUrl: 'http://localhost:7373',
  apiKey: 'your-api-key'
});
```

### 3. Role-Based Access Control

```typescript
// Create role with specific permissions
await client.auth.createRole({
  name: 'developer',
  permissions: [
    'agents:read',
    'agents:write',
    'tasks:read',
    'tasks:write',
    'teams:read'
  ],
  restrictions: {
    maxAgents: 10,
    maxTeams: 3,
    allowedModels: ['claude-sonnet-4-5', 'gpt-4o'],
    budgetLimit: 100.00
  }
});

// Assign role to API key
await client.auth.assignRole({
  apiKeyId: 'key-123',
  role: 'developer'
});
```

### 4. Rate Limiting

```bash
# Configure rate limits
godel config set rateLimit.requestsPerMinute 100
godel config set rateLimit.tokensPerHour 1000000
```

```typescript
// Rate limit configuration
await client.config.setRateLimits({
  default: {
    requestsPerMinute: 60,
    tokensPerHour: 100000
  },
  byRole: {
    admin: { requestsPerMinute: 1000, tokensPerHour: 10000000 },
    developer: { requestsPerMinute: 100, tokensPerHour: 1000000 }
  }
});
```

### 5. Audit Logging

```typescript
// Query audit logs
const logs = await client.audit.query({
  since: '24h',
  actions: ['agent.spawn', 'task.create', 'config.update'],
  userId: 'user-123'
});

for (const log of logs) {
  console.log(`[${log.timestamp}] ${log.user} ${log.action}`);
}
```

### 6. Secret Management

```typescript
// Store secrets securely
await client.secrets.set({
  name: 'DATABASE_URL',
  value: 'postgresql://...',
  scope: 'team',
  teamId: 'team-001'
});

// Use in agent configuration
const agent = await client.agents.spawn({
  role: 'worker',
  secrets: ['DATABASE_URL', 'API_KEY']
});

// Secrets are injected as environment variables
// Never exposed in logs or API responses
```

### 7. Input Validation

```typescript
// Validate task input
await client.tasks.create({
  title: 'Process data',
  input: data,
  validation: {
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', minimum: 0 }
      },
      required: ['email']
    }
  }
});
```

### 8. Content Filtering

```typescript
// Configure content filters
await client.security.configureFilters({
  input: {
    piiDetection: true,
    blocklist: ['password', 'secret', 'token'],
    maxLength: 10000
  },
  output: {
    piiMasking: true,
    logSanitization: true
  }
});
```

### 9. Network Security

```bash
# Configure CORS
godel config set cors.allowedOrigins "https://app.example.com"
godel config set cors.allowedMethods "GET,POST,PUT,DELETE"

# Enable HTTPS only
godel config set security.httpsOnly true

# Configure TLS
godel config set tls.cert /path/to/cert.pem
godel config set tls.key /path/to/key.pem
```

### 10. Security Scanning

```bash
# Run security scan
godel security scan

# Scan with specific rules
godel security scan --rules secrets,vulnerabilities,compliance

# Generate report
godel security scan --output report.json
```

```typescript
// Security scan via SDK
const scan = await client.security.scan({
  rules: ['secrets', 'vulnerabilities', 'compliance'],
  scope: 'full'
});

console.log(`Issues found: ${scan.issues.length}`);
for (const issue of scan.issues) {
  console.log(`[${issue.severity}] ${issue.message}`);
}
```

## Security Checklist

- [ ] API keys rotated every 90 days
- [ ] Rate limits configured per role
- [ ] Audit logging enabled
- [ ] Secrets stored in vault, not code
- [ ] HTTPS enforced in production
- [ ] Content filters configured
- [ ] Regular security scans scheduled
- [ ] Access reviewed quarterly

## Best Practices

1. **Use least privilege** - Grant minimum necessary permissions
2. **Rotate keys regularly** - Set up automated rotation
3. **Monitor audit logs** - Set up alerts for suspicious activity
4. **Encrypt at rest** - Enable database encryption
5. **Network isolation** - Use VPCs and private subnets
6. **Regular audits** - Run security scans weekly
