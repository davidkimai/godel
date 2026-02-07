# Godel Key Features

**Comprehensive Feature Guide for Godel v2.0.0**

---

## Feature Categories

1. [Intent-Based Interface](#intent-based-interface)
2. [Multi-Provider Orchestration](#multi-provider-orchestration)
3. [Tree-Structured Sessions](#tree-structured-sessions)
4. [Git Worktree Isolation](#git-worktree-isolation)
5. [Agent Role System](#agent-role-system)
6. [Federation Architecture](#federation-architecture)
7. [Server-Side LLM Proxy](#server-side-llm-proxy)
8. [Observability & Analytics](#observability--analytics)

---

## Intent-Based Interface

### The Revolutionary `godel do` Command

Transform natural language into orchestrated agent execution.

**Before:**
```bash
# Complex command sequence
godel agent create --role worker --model claude-sonnet-4
godel worktree create --repo /path --branch feature
godel task create --agent agent-123 --priority high \
  --prompt "Implement OAuth2 with CSRF protection, add rate limiting..."
```

**After:**
```bash
# Simple intent
godel do "Add Google OAuth login with security best practices"
```

### How It Works

1. **Intent Parsing:** Natural language → structured command
2. **Agent Selection:** Automatically choose optimal agent composition
3. **Dependency Detection:** Identify package needs, migrations
4. **Parallelization:** Execute independent tasks concurrently
5. **Quality Gates:** Apply automated testing and validation
6. **Rollback:** Automatic recovery if issues detected

### Example Intents

```bash
# Feature implementation
godel do "Implement user authentication with JWT tokens"

# Refactoring
godel do "Refactor database layer to use connection pooling"

# Testing
godel do "Add comprehensive tests for the API layer with 90% coverage"

# Security audit
godel do "Audit codebase for security vulnerabilities"

# Performance optimization
godel do "Optimize database queries and add caching"

# Deployment
godel do "Deploy to production with blue-green strategy"
```

### Intent Templates

Pre-built templates for common tasks:

```yaml
# templates/feature-implementation.yaml
name: feature-implementation
description: "Implement a new feature"
team:
  coordinator: 1
  workers: 3
  reviewer: 1
workflow:
  - analyze_requirements
  - design_architecture
  - implement_code
  - write_tests
  - code_review
  - integration_test
```

---

## Multi-Provider Orchestration

### 15+ LLM Providers

Single interface for all major LLM providers:

| Provider | Models | Best For |
|----------|--------|----------|
| **Anthropic** | Claude 3.5/4 Sonnet, Opus, Haiku | Complex reasoning |
| **OpenAI** | GPT-4o, o1, o3-mini | General tasks |
| **Google** | Gemini 1.5 Pro, Flash | Long context |
| **Groq** | Llama 3, Mixtral | Fast inference |
| **Cerebras** | Cerebras-GPT | Ultra-fast |
| **Ollama** | Local models | Privacy, offline |

### Intelligent Routing

**Cost-Optimized Routing:**
```typescript
// Route simple tasks to cheaper models
if (task.complexity === 'low') {
  return 'groq/llama-3.1-8b';
}

// Route complex tasks to capable models
if (task.requiresReasoning) {
  return 'anthropic/claude-opus-4';
}
```

**Capability-Matched Routing:**
```typescript
// Match task requirements to model capabilities
if (task.requiresVision) {
  return provider.withCapability('vision');
}

if (task.requiresLongContext) {
  return provider.withMinContext(100000);
}
```

**Latency-Optimized Routing:**
```typescript
// Route to fastest available provider
return providerRegistry.getFastestAvailable();
```

### Fallback Chains

Automatic failover between providers:

```yaml
fallback_chain:
  primary: anthropic/claude-opus-4
  secondary: openai/gpt-4o
  tertiary: google/gemini-1.5-pro
  timeout: 30000ms
```

### Cost Tracking

Granular cost visibility:

```bash
# View cost breakdown
godel costs breakdown

# Provider usage
godel costs by-provider

# Model usage
godel costs by-model

# Cost projections
godel costs project --days 30
```

---

## Tree-Structured Sessions

### Branching

Explore multiple approaches from any point:

```
Session: Implement authentication
├── Branch 1: JWT approach
│   ├── Pros: Stateless, scalable
│   └── Cons: Token size
├── Branch 2: Session-based
│   ├── Pros: Server control
│   └── Cons: Database load
└── Branch 3: OAuth only
    ├── Pros: Third-party auth
    └── Cons: External dependency
```

**Commands:**
```bash
# View tree
godel pi tree <session-id>

# Create branch
godel pi branch <session-id> --node <node-id>

# Switch branch
godel pi switch <branch-id>
```

### Forking

Create new session from any node:

```bash
# Fork at specific point
godel pi fork <session-id> --node <node-id>

# Fork with new configuration
godel pi fork <session-id> --node <node-id> --model gpt-4o
```

### Context Management

Automatic compaction when context windows fill:

```bash
# Compact session (summarize older messages)
godel pi compact <session-id>

# Manual compaction with strategy
godel pi compact <session-id> --strategy summarize
```

### Navigation

```bash
# Navigate session tree
/tree

# Switch to node
/switch <node-id>

# View message history
/history

# Compare branches
/compare <branch-1> <branch-2>
```

---

## Git Worktree Isolation

### Per-Session Worktrees

Each agent operates in isolated environment:

```
repo/
├── main/                    # Main worktree
├── .claude-worktrees/
│   ├── agent-001/          # Agent 1 worktree
│   ├── agent-002/          # Agent 2 worktree
│   └── agent-003/          # Agent 3 worktree
```

### Dependency Sharing

Share dependencies across worktrees:

```yaml
worktree:
  shared:
    - node_modules
    - .venv
    - .npm
  isolated:
    - .env
    - dist/
    - build/
```

### Cleanup Policies

Configurable cleanup strategies:

| Policy | Description | Use Case |
|--------|-------------|----------|
| **immediate** | Delete on completion | Ephemeral tasks |
| **on_success** | Keep on failure | Debugging |
| **delayed** | Delete after TTL | Review period |
| **manual** | Never auto-delete | Long-running |

```bash
# Create worktree with cleanup policy
godel worktree create --cleanup on_success

# Manual cleanup
godel worktree cleanup <worktree-id>

# Bulk cleanup
godel worktree cleanup --older-than 7d
```

### Conflict Prevention

Concurrent work without conflicts:

```bash
# Each agent on different branch
godel agent spawn --branch feature/auth
godel agent spawn --branch feature/ui
godel agent spawn --branch feature/api
```

---

## Agent Role System

### Built-in Roles

| Role | Purpose | Tools | Ideal For |
|------|---------|-------|-----------|
| **Coordinator** | Orchestrate workflows | delegate, query_status, create_convoy | Complex multi-step tasks |
| **Worker** | Execute tasks | read, write, edit, bash | Implementation |
| **Reviewer** | Quality assurance | read, diff, comment, approve | Code review |
| **Refinery** | Integration | git_merge, git_rebase, resolve_conflict | Merge conflicts |
| **Monitor** | System health | query_metrics, check_health, alert | Operations |
| **Security** | Security audit | security_scan, dependency_check | Security tasks |
| **Performance** | Optimization | profile, benchmark, optimize | Performance work |

### Role-Based Teams

```bash
# Create team with role composition
godel team create \
  --name "feature-auth" \
  --coordinator 1 \
  --workers 3 \
  --reviewer 1 \
  --task "Implement OAuth2 authentication"
```

### Custom Roles

Define custom agent roles:

```yaml
roles:
  database-expert:
    description: "Database schema and optimization specialist"
    model: claude-sonnet-4
    tools:
      - read
      - write
      - database_query
      - profile
    permissions:
      - read_all
      - write_database
    system_prompt: |
      You are a database expert. Focus on:
      - Query optimization
      - Schema design
      - Index recommendations
      - Migration safety
```

---

## Federation Architecture

### Multi-Instance Management

Route across multiple Godel instances:

```yaml
federation:
  instances:
    - id: us-east-1
      url: https://godel-us-east.example.com
      capacity: 25
    - id: eu-west-1
      url: https://godel-eu-west.example.com
      capacity: 25
    - id: ap-south-1
      url: https://godel-apac.example.com
      capacity: 25
```

### Health-Aware Routing

Automatic failover to healthy instances:

```typescript
// Route to healthy instance
if (instance.health.status === 'unhealthy') {
  return routeToNextHealthyInstance();
}
```

### Session Affinity

Keep related sessions on same instance:

```yaml
affinity:
  rules:
    - attribute: team_id
      strategy: sticky
    - attribute: user_id
      strategy: consistent_hash
```

### Capacity Management

Backpressure and load balancing:

```typescript
// Reject new sessions if at capacity
if (instance.sessions.active >= instance.capacity.max) {
  return routeToAlternativeInstance();
}
```

---

## Server-Side LLM Proxy

### Security

**API Key Protection:**
- Keys stored server-side only
- Never exposed to clients
- Automatic rotation support

```bash
# Client never sees API keys
curl http://godel/proxy/v1/chat/completions \
  -H "Authorization: Bearer $GODEL_API_KEY" \
  -d '{"model": "smart", "messages": [...]}'
```

### Rate Limiting

Token bucket algorithm:

```yaml
rate_limits:
  default:
    requests: 60
    window: 60s
    tokens: 100000
  premium:
    requests: 600
    window: 60s
    tokens: 1000000
```

### Content Filtering

PII detection and sanitization:

```typescript
// Detect and redact PII
const sanitized = await contentFilter.sanitize(input, {
  detect: ['email', 'phone', 'ssn', 'credit_card'],
  action: 'redact'
});
```

### Caching

Response caching to reduce costs:

```yaml
cache:
  enabled: true
  ttl: 3600s
  max_size: 100MB
  strategies:
    - exact_match
    - semantic_similarity
```

### Audit Logging

Complete request/response trail:

```json
{
  "timestamp": "2026-02-06T10:00:00Z",
  "request_id": "req_123",
  "user_id": "user_456",
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "tokens_in": 150,
  "tokens_out": 250,
  "cost": 0.0045,
  "duration_ms": 1200
}
```

---

## Observability & Analytics

### Dashboard

Web dashboard at `http://localhost:7373`:

**Views:**
- **Overview:** Active teams, agent status, recent events
- **Team Management:** Team list, create wizard, real-time monitoring
- **Session Tree:** Interactive tree navigation
- **Worktree Map:** Active worktrees visualization
- **Cost Analytics:** Provider usage, token consumption, budget tracking

### Metrics

Prometheus metrics at `/metrics`:

```
# Agent metrics
godel_agents_connected{status="active"} 42
godel_agents_tasks_completed_total 1583

# Session metrics
godel_sessions_active{provider="anthropic"} 15
godel_sessions_duration_seconds_bucket 0.5

# Queue metrics
godel_queue_depth{priority="high"} 3
godel_queue_wait_seconds 0.125

# Proxy metrics
godel_proxy_requests_total{provider="anthropic"} 10458
godel_proxy_cost_total{provider="anthropic"} 45.23
godel_proxy_latency_seconds 0.234
```

### Logging

Structured JSON logging:

```bash
# Log levels
godel logs --level error
godel logs --level warn
godel logs --level info
godel logs --level debug

# Filter by agent
godel logs --agent agent-123

# Time range
godel logs --since 1h
godel logs --since 24h
```

### Alerts

Configurable alerting:

```yaml
alerts:
  - name: HighErrorRate
    condition: error_rate > 1%
    duration: 5m
    severity: critical
    
  - name: BudgetThreshold
    condition: budget_used > 75%
    duration: 1m
    severity: warning
```

---

## Integration Features

### API

RESTful API with OpenAPI specification:

```bash
# Create session
curl -X POST /api/v1/pi/sessions \
  -d '{"agent_id": "agent_001", "pi_config": {...}}'

# Create worktree
curl -X POST /api/v1/worktrees \
  -d '{"repository": "/path", "base_branch": "main"}'

# Execute intent
curl -X POST /api/v1/tasks \
  -d '{"payload": {"type": "pi_execute", "prompt": "..."}}'
```

### SDK

TypeScript SDK for programmatic access:

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({
  baseUrl: 'http://localhost:7373',
  apiKey: process.env.GODEL_API_KEY
});

// Create session
const session = await client.pi.sessions.create({...});

// Create worktree
const worktree = await client.worktrees.create({...});

// Execute intent
const result = await client.tasks.execute({...});
```

### WebSocket

Real-time event streaming:

```javascript
const ws = new WebSocket('ws://localhost:7373/events');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Agent update:', data);
};
```

---

## Enterprise Features

### Multi-Tenancy

Isolate teams and resources:

```yaml
tenancy:
  enabled: true
  isolation: strict
  resources:
    - sessions
    - agents
    - worktrees
```

### SSO Integration

Enterprise authentication:

```yaml
auth:
  sso:
    provider: okta
    client_id: xxx
    client_secret: xxx
    domain: company.okta.com
```

### Audit Compliance

Complete audit trail:

```yaml
audit:
  enabled: true
  retention: 90d
  events:
    - agent_spawn
    - task_execute
    - config_change
    - auth_login
```

---

**All features available in Godel v2.0.0**

[Get Started](../GETTING_STARTED.md) | [API Reference](../API.md) | [View Pricing](https://godel.io/pricing)
