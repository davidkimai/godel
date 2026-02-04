# Troubleshooting Guide

Common issues, error codes, and debugging techniques for Dash.

## Table of Contents

1. [Common Issues](#common-issues)
2. [Error Codes Reference](#error-codes-reference)
3. [Debug Mode](#debug-mode)
4. [Log Analysis](#log-analysis)
5. [Getting Help](#getting-help)

---

## Common Issues

### Installation Issues

#### "npm install fails with EACCES permission errors"

**Cause**: npm global install permission issues

**Solutions**:
```bash
# Option 1: Change npm default directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Option 2: Use npx instead
npx @jtan15010/dash <command>

# Option 3: Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
```

#### "Cannot find module '@dash/core' or similar"

**Cause**: Build artifacts missing or out of date

**Solutions**:
```bash
# Clean and rebuild
rm -rf node_modules dist
npm install
npm run build

# Verify build output
ls -la dist/
```

#### "TypeScript compilation errors"

**Cause**: TypeScript version mismatch or missing types

**Solutions**:
```bash
# Install dependencies
npm install

# Run type check
npm run typecheck

# Fix linting issues
npm run lint:fix
```

### Runtime Issues

#### "Git worktree not supported" or "worktree failed"

**Cause**: Git version too old or worktree not properly configured

**Solutions**:
```bash
# Check Git version (need 2.35+)
git --version

# Update Git
brew install git              # macOS
sudo apt update && sudo apt install git  # Ubuntu/Debian

# Check worktree support
git worktree list

# Prune stale worktrees
git worktree prune
```

#### "Error: Cannot find .dash directory"

**Cause**: Dash configuration directory missing

**Solutions**:
```bash
# Create .dash directory
mkdir -p .dash/logs

# Set proper permissions
chmod 755 .dash

# Initialize state
mkdir -p .dash/logs
```

#### "Database connection failed" or "ECONNREFUSED"

**Cause**: Database not running or connection string incorrect

**Solutions**:
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Start PostgreSQL
brew services start postgresql  # macOS
sudo service postgresql start   # Ubuntu

# Use SQLite instead (no external DB needed)
# Add to .env: DATABASE_URL=sqlite://./dash.db

# Or start with Docker
docker-compose up -d postgres
```

#### "Redis connection failed"

**Cause**: Redis not running

**Solutions**:
```bash
# Check if Redis is running
redis-cli ping

# Start Redis
brew services start redis       # macOS
redis-server                    # Manual start

# Or use Docker
docker-compose up -d redis

# Disable Redis (use in-memory cache)
# Remove REDIS_URL from .env
```

#### "Gateway connection failed" or "ENOTFOUND"

**Cause**: OpenClaw Gateway not running or URL incorrect

**Solutions**:
```bash
# Check gateway status
openclaw gateway status

# Start gateway
openclaw gateway start

# Test connection
curl $OPENCLAW_GATEWAY_URL/health

# Disable notifications (optional)
# Remove OPENCLAW_GATEWAY_URL from .env
```

### Agent Issues

#### "Agent spawn failed" or "Failed to create worktree"

**Cause**: Worktree creation failed, possibly due to existing worktree or disk space

**Solutions**:
```bash
# List existing worktrees
git worktree list

# Remove stale worktrees
git worktree prune
rm -rf .claude-worktrees/stale-worktree

# Check disk space
df -h

# Check permissions
ls -la .claude-worktrees/
```

#### "Agent timeout" or "Execution timeout"

**Cause**: Agent took too long to complete

**Solutions**:
```bash
# Increase timeout
dash agents spawn "task" --timeout 600000  # 10 minutes

# Or in swarm config
spec:
  safety:
    maxExecutionTime: 600000
```

#### "Budget exceeded"

**Cause**: Token usage exceeded budget limit

**Solutions**:
```bash
# Check current usage
dash budget status

# Increase budget
dash budget set --amount 100.00

# Adjust thresholds
# In .env:
DASH_BUDGET_TOTAL=2.0
```

### Swarm Issues

#### "Swarm creation failed" or "Max swarms reached"

**Cause**: Too many active swarms or configuration issue

**Solutions**:
```bash
# List active swarms
dash swarm list

# Destroy old swarms
dash swarm destroy <swarm-id>

# Increase limit in .env
DASH_MAX_SWARMS=10
```

#### "No agents spawned in swarm"

**Cause**: Agent spawning failed or initial agents set to 0

**Solutions**:
```bash
# Check swarm config
dash swarm status <swarm-id>

# Recreate with initial agents
dash swarm create --name test --task "test" --initial-agents 5
```

### Workflow Issues

#### "Workflow validation failed"

**Cause**: Invalid workflow YAML structure

**Solutions**:
```bash
# Validate workflow YAML
dash workflow validate workflow.yaml

# Check for:
# - Duplicate step IDs
# - Missing required fields
# - Circular dependencies
# - Invalid YAML syntax
```

#### "Workflow execution stuck"

**Cause**: Step dependencies not resolving or agent not responding

**Solutions**:
```bash
# Check workflow status
dash workflow status <workflow-id>

# Cancel and retry
dash workflow cancel <workflow-id>
dash workflow run workflow.yaml

# Check agent logs
dash logs tail --agent <agent-id>
```

---

## Error Codes Reference

### CLI Error Codes

| Code | Error | Description | Resolution |
|------|-------|-------------|------------|
| `E001` | `CONFIG_NOT_FOUND` | Configuration file missing | Create `.env` file |
| `E002` | `INVALID_CONFIG` | Invalid configuration value | Check `.env` syntax |
| `E003` | `DATABASE_ERROR` | Database connection failed | Check `DATABASE_URL` |
| `E004` | `CACHE_ERROR` | Cache connection failed | Check Redis or disable |
| `E005` | `GATEWAY_ERROR` | Gateway connection failed | Start OpenClaw Gateway |
| `E010` | `AGENT_SPAWN_FAILED` | Failed to create agent | Check worktree permissions |
| `E011` | `AGENT_TIMEOUT` | Agent execution timeout | Increase timeout |
| `E012` | `AGENT_KILLED` | Agent was forcibly terminated | Check memory/CPU |
| `E020` | `SWARM_CREATE_FAILED` | Failed to create swarm | Check max swarms limit |
| `E021` | `SWARM_NOT_FOUND` | Swarm ID not found | List swarms with `dash swarm list` |
| `E022` | `MAX_SWARMS_REACHED` | Too many active swarms | Destroy old swarms |
| `E030` | `WORKFLOW_INVALID` | Workflow validation failed | Check YAML syntax |
| `E031` | `WORKFLOW_CIRCULAR_DEP` | Circular dependency detected | Fix step dependencies |
| `E032` | `WORKFLOW_TIMEOUT` | Workflow execution timeout | Increase timeout |
| `E040` | `BUDGET_EXCEEDED` | Budget limit reached | Increase budget or reset |
| `E041` | `PERMISSION_DENIED` | Insufficient permissions | Check file permissions |
| `E050` | `EXTENSION_LOAD_FAILED` | Failed to load extension | Check extension syntax |
| `E051` | `EXTENSION_NOT_FOUND` | Extension not found | Verify extension path |

### HTTP Status Codes (API)

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `400` | Bad Request | Invalid request body or parameters |
| `401` | Unauthorized | Missing or invalid API key |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource already exists |
| `422` | Unprocessable | Validation failed |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Internal server error |
| `503` | Service Unavailable | Service temporarily down |

### Git Error Codes

| Code | Error | Resolution |
|------|-------|------------|
| `G001` | `WORKTREE_EXISTS` | Worktree already exists - use `git worktree prune` |
| `G002` | `WORKTREE_INVALID` | Invalid worktree path - check path permissions |
| `G003` | `WORKTREE_LOCKED` | Worktree is locked - remove `.git/worktrees/*/locked` |
| `G004` | `NOT_A_GIT_REPO` | Not a git repository - run `git init` |
| `G005` | `UNCLEAN_WORKTREE` | Uncommitted changes - commit or stash changes |

---

## Debug Mode

### Enabling Debug Mode

```bash
# Method 1: Environment variable
export DASH_LOG_LEVEL=debug

# Method 2: CLI flag
dash --log-level debug <command>

# Method 3: Configuration file
echo "DASH_LOG_LEVEL=debug" >> .env
```

### Debug Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `error` | Errors only | Production monitoring |
| `warn` | Warnings and errors | Standard operations |
| `info` | General information (default) | Normal development |
| `debug` | Detailed debugging | Troubleshooting |
| `trace` | Very verbose | Deep debugging |

### Debug Output

```bash
# Debug agent spawning
dash --log-level debug agents spawn "test task"

# Expected debug output:
# [DEBUG] Loading configuration from /path/.env
# [DEBUG] Initializing agent manager
# [DEBUG] Creating worktree at .claude-worktrees/agent-xxx
# [DEBUG] Spawning agent with model: kimi-k2.5
# [DEBUG] Agent started: agent-xxx
```

### Verbose Mode

```bash
# Maximum verbosity
dash --verbose <command>

# Shows:
# - Full stack traces
# - Request/response bodies
# - Internal state dumps
```

---

## Log Analysis

### Log File Locations

```
.dash/logs/
├── orchestrator.log      # Main orchestrator activity
├── monitor.log          # Build/test monitoring
├── watchdog.log         # Swarm health checks
├── reports.log          # Progress reports
├── events.log           # Event stream
└── agents/
    ├── agent-xxx.log    # Individual agent logs
    └── agent-yyy.log
```

### Common Log Patterns

#### Successful Agent Spawn
```
[INFO] AgentManager: Spawning agent for task: "Implement auth"
[DEBUG] WorktreeManager: Creating worktree at .claude-worktrees/agent-xxx
[INFO] Agent: agent-xxx started successfully
[INFO] Agent: agent-xxx completed in 45.2s
```

#### Failed Agent Spawn
```
[ERROR] AgentManager: Failed to spawn agent
[ERROR] WorktreeManager: EACCES: permission denied
[DEBUG] Stack trace: ...
```

#### Budget Alert
```
[WARN] BudgetManager: Budget threshold reached: 75%
[WARN] BudgetManager: Approaching limit: $37.50 / $50.00
[INFO] BudgetManager: Budget limit reached: 90%
[ERROR] BudgetManager: Budget exceeded: $52.00 / $50.00
```

#### Database Connection Issue
```
[ERROR] Database: Connection failed: ECONNREFUSED
[ERROR] Database: Could not connect to PostgreSQL at localhost:5432
[WARN] Database: Falling back to SQLite
```

### Log Querying

```bash
# Search for errors
dash logs query --level error --since 1h

# Search for specific agent
dash logs query --agent agent-xxx --since 24h

# Search for specific pattern
dash logs query --grep "budget exceeded"

# Export logs
dash logs query --since 7d --format json > logs.json
```

### Analyzing with jq

```bash
# Parse JSON logs
dash logs query --format json | jq '.[] | select(.level == "ERROR")'

# Count errors by type
dash logs query --format json | jq -r '.message' | sort | uniq -c

# Find slow operations
dash logs query --format json | jq '.[] | select(.durationMs > 60000)'
```

### Log Rotation

Logs are automatically rotated when they reach 10MB. Old logs are compressed:
```
.dash/logs/
├── orchestrator.log
├── orchestrator.log.1.gz
├── orchestrator.log.2.gz
└── ...
```

---

## Getting Help

### Self-Service Resources

1. **Documentation**: Check the [docs/](docs/) directory
2. **Examples**: Review [examples/](examples/) for working code
3. **CLI Help**: Use `--help` flag for any command
4. **Status Check**: Run `dash status` for system health

### Community Support

- **GitHub Issues**: [github.com/davidkimai/dash/issues](https://github.com/davidkimai/dash/issues)
  - Search existing issues first
  - Include error messages and logs
  - Provide steps to reproduce

- **GitHub Discussions**: [github.com/davidkimai/dash/discussions](https://github.com/davidkimai/dash/discussions)
  - Q&A and general help
  - Feature requests
  - Show and tell

### Reporting Bugs

When reporting bugs, please include:

```markdown
**Environment:**
- Dash version: `dash --version`
- Node.js version: `node --version`
- OS: macOS/Linux/Windows

**Steps to Reproduce:**
1. Run `...`
2. Execute `...`
3. Observe error

**Expected Behavior:**
...

**Actual Behavior:**
...

**Logs:**
```
[Paste relevant log output]
```

**Configuration:**
```env
[Paste sanitized .env content]
```
```

### Emergency Recovery

If Dash is completely broken:

```bash
# 1. Stop all Dash processes
pkill -f "dash"

# 2. Backup state
cp -r .dash .dash.backup

# 3. Clean worktrees
git worktree prune
rm -rf .claude-worktrees/*

# 4. Reset to clean state
rm -rf .dash/logs/*

# 5. Restart
npm run build
dash status
```

### Professional Support

For enterprise support:
- Email: support@dash-ai.io
- Include your organization and support tier

---

**Still stuck?** Check the [GitHub Issues](https://github.com/davidkimai/dash/issues) or start a [Discussion](https://github.com/davidkimai/dash/discussions).
