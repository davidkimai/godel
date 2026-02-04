# Getting Started with Dash

Complete guide to setting up and using Dash for agent orchestration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [First Swarm Creation](#first-swarm-creation)
4. [First Agent Spawn](#first-agent-spawn)
5. [Viewing Logs](#viewing-logs)
6. [Monitoring](#monitoring)
7. [Troubleshooting Basics](#troubleshooting-basics)

---

## Prerequisites

Before installing Dash, ensure you have the following:

### Required

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | 18+ | Runtime environment |
| **npm** | 9+ | Package manager |
| **Git** | 2.35+ | Worktree support for agent isolation |

### Optional (for production)

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **PostgreSQL** | 14+ | State persistence |
| **Redis** | 7+ | Caching and pub/sub |
| **Docker** | 20+ | Containerized deployment |
| **Docker Compose** | 2+ | Multi-service orchestration |

### Verify Prerequisites

```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher

# Check npm version
npm --version   # Should be 9.0.0 or higher

# Check Git version
git --version   # Should be 2.35.0 or higher

# Check Git worktree support
git worktree --help  # Should show help, not error
```

---

## Installation

### Method 1: npm Global Install (Recommended)

```bash
# Install globally
npm install -g @jtan15010/dash

# Verify installation
dash --version  # Should show version number
dash --help     # Show available commands
```

### Method 2: Using npx (No Install)

```bash
# Run without installing
npx @jtan15010/dash --help

# Example: Create a swarm
npx @jtan15010/dash swarm create --name test --task "hello world"
```

### Method 3: From Source

```bash
# Clone the repository
git clone https://github.com/davidkimai/dash.git
cd dash

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link globally (optional)
npm link

# Or use directly
npm run dev -- --help
```

### Method 4: Docker

```bash
# Pull the image
docker pull dashai/dash:latest

# Run with environment variables
docker run -it --rm \
  -e DASH_PROJECT_PATH=/workspace \
  -v $(pwd):/workspace \
  dashai/dash --help
```

### Method 5: Docker Compose (Full Stack)

```bash
# Clone repository
git clone https://github.com/davidkimai/dash.git
cd dash

# Start all services (Dash + PostgreSQL + Redis + Monitoring)
docker-compose up -d

# View logs
docker-compose logs -f

# Run commands in the container
docker-compose exec dash dash --help
```

---

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```bash
# Copy example file
cp .env.example .env
```

### Minimum Required Configuration

```env
# Project path (required)
DASH_PROJECT_PATH=/path/to/your/project

# Log level (optional, default: info)
DASH_LOG_LEVEL=info
```

### Full Configuration Options

```env
# Core Settings
DASH_PROJECT_PATH=/Users/jasontang/clawd/projects/dash
DASH_MAX_SWARMS=5
DASH_MAX_CONCURRENT=3

# Build Settings
DASH_BUILD_TIMEOUT=120000
DASH_TEST_TIMEOUT=60000

# Budget Settings
DASH_BUDGET_TOTAL=1.0
DASH_BUDGET_PER_SPRINT=0.25

# Database (optional)
DATABASE_URL=postgresql://user:password@localhost:5432/dash
REDIS_URL=redis://localhost:6379

# Notifications (optional)
OPENCLAW_GATEWAY_URL=http://127.0.0.1:8080/api
OPENCLAW_GATEWAY_TOKEN=your_token_here
NOTIFICATION_CHANNEL=telegram
NOTIFICATION_USER_ID=your_user_id

# Cron Settings
DASH_CRON_ENABLED=true
DASH_BUILD_MONITOR_INTERVAL=30
DASH_SWARM_WATCHDOG_INTERVAL=120

# Debug
DASH_DRY_RUN=false
```

### Verify Configuration

```bash
# Check configuration
dash status

# Should output current settings and health status
```

---

## First Swarm Creation

A **swarm** is a group of agents working together on a common task.

### Step 1: Create a Swarm

```bash
# Basic swarm creation
dash swarm create --name "my-first-swarm" --task "Review codebase for bugs"
```

### Step 2: Create with Options

```bash
# Advanced swarm creation
dash swarm create \
  --name "code-review-swarm" \
  --task "Review all TypeScript files for security issues" \
  --initial-agents 5 \
  --max-agents 20 \
  --strategy parallel \
  --model kimi-k2.5 \
  --budget 50.00
```

### Step 3: Monitor the Swarm

```bash
# List all swarms
dash swarm list

# Check swarm status
dash swarm status <swarm-id>

# Launch the TUI dashboard
dash dashboard
```

### Using a YAML Configuration File

Create `swarm.yaml`:

```yaml
apiVersion: dash.io/v1
kind: Swarm

metadata:
  name: code-review-swarm
  description: Review codebase for issues

spec:
  task: Review all TypeScript files for security vulnerabilities
  strategy: parallel
  initialAgents: 5
  maxAgents: 20
  
  budget:
    amount: 50.00
    currency: USD
    warningThreshold: 0.75
    criticalThreshold: 0.90
  
  safety:
    fileSandbox: true
    maxExecutionTime: 300000
  
  scaling:
    enabled: true
    minAgents: 2
    maxAgents: 20
```

Apply it:
```bash
dash swarm create --file swarm.yaml
```

---

## First Agent Spawn

An **agent** is a single AI worker that executes tasks.

### Step 1: Spawn an Agent

```bash
# Basic agent spawn
dash agents spawn "Implement a REST API endpoint"
```

### Step 2: Spawn with Options

```bash
# Advanced agent spawn
dash agents spawn \
  "Implement user authentication" \
  --model kimi-k2.5 \
  --timeout 600000 \
  --budget 10.00
```

### Step 3: Manage the Agent

```bash
# List all agents
dash agents list

# Check agent status
dash agents status <agent-id>

# Pause the agent
dash agents pause <agent-id>

# Resume the agent
dash agents resume <agent-id>

# Kill the agent
dash agents kill <agent-id>
```

### Agent Output

Agents work in isolated Git worktrees. Their output is available in:
```
.claude-worktrees/<agent-id>/
├── src/           # Modified source files
├── tests/         # Test files
├── README.md      # Agent's documentation
└── .dash/         # Agent metadata
```

---

## Viewing Logs

### Real-time Logs

```bash
# View all logs
dash logs tail

# View logs for specific agent
dash logs tail --agent <agent-id>

# View logs for specific swarm
dash logs tail --swarm <swarm-id>

# Follow logs (like tail -f)
dash logs tail --follow
```

### Query Logs

```bash
# Query with filters
dash logs query \
  --level error \
  --since 1h \
  --agent <agent-id>

# Query with JSON output
dash logs query --format json --limit 100
```

### Log Files Location

Logs are stored in:
```
.dash/logs/
├── orchestrator.log      # Main orchestrator logs
├── monitor.log          # Build monitor logs
├── watchdog.log         # Swarm watchdog logs
├── reports.log          # Progress reports
└── agents/              # Individual agent logs
    ├── agent-1.log
    └── agent-2.log
```

### Log Levels

| Level | Description |
|-------|-------------|
| `debug` | Detailed debugging information |
| `info` | General information |
| `warn` | Warning messages |
| `error` | Error messages |

Set log level:
```bash
# In .env file
DASH_LOG_LEVEL=debug

# Or via CLI
dash --log-level debug <command>
```

---

## Monitoring

### TUI Dashboard

Launch the interactive dashboard:

```bash
# Start dashboard
dash dashboard

# Dashboard shows:
# - Active swarms
# - Running agents
# - Recent events
# - Budget usage
# - System health
```

### Metrics and Observability

Start the monitoring stack:

```bash
# Start Grafana + Loki + Prometheus
docker-compose -f monitoring/docker-compose.yml up -d

# View Grafana (default: http://localhost:3000)
open http://localhost:3000

# Default credentials: admin/admin
```

### Key Metrics

| Metric | Description | Location |
|--------|-------------|----------|
| Active Swarms | Number of running swarms | Dashboard |
| Active Agents | Number of running agents | Dashboard |
| Budget Usage | Current budget consumption | Dashboard |
| Task Queue | Pending tasks | Dashboard |
| Events/sec | Event processing rate | Grafana |
| Latency | Response times | Grafana |

### Health Checks

```bash
# Check system health
dash status

# Check specific components
dash status --component database
dash status --component cache
dash status --component gateway
```

### Notifications

Configure notifications for important events:

```bash
# Set up notification channel
dash openclaw config \
  --gateway-url http://localhost:8080/api \
  --token your_token \
  --channel telegram

# Test notification
dash openclaw test-notification
```

---

## Troubleshooting Basics

### Common Issues

#### 1. "Command not found: dash"

```bash
# If installed globally but not found
export PATH="$PATH:$(npm config get prefix)/bin"

# Or use npx
npx @jtan15010/dash <command>
```

#### 2. "Git worktree not supported"

```bash
# Update Git to 2.35+
brew install git  # macOS
sudo apt update && sudo apt install git  # Ubuntu
```

#### 3. "Cannot find module"

```bash
# Rebuild the project
npm run build

# Or clean and reinstall
rm -rf node_modules dist
npm install
npm run build
```

#### 4. "Database connection failed"

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Or use SQLite instead (no external DB needed)
# Set in .env: DATABASE_URL=sqlite://./dash.db
```

#### 5. "Permission denied"

```bash
# Fix file permissions
chmod +x orchestrator.sh sprint-launcher.sh
chmod 600 .env
```

### Debug Mode

Enable debug logging:

```bash
# Set environment variable
export DASH_LOG_LEVEL=debug

# Run command
dash <command>

# Or use flag
dash --log-level debug <command>
```

### Getting Help

```bash
# Show help for any command
dash --help
dash swarm --help
dash agents spawn --help

# Check version
dash --version
```

### Community Support

- **GitHub Issues**: [github.com/davidkimai/dash/issues](https://github.com/davidkimai/dash/issues)
- **Documentation**: [docs/](docs/)
- **Examples**: [examples/](examples/)

---

## Next Steps

Now that you have Dash running:

1. **Explore Examples**: Check out [examples/](examples/) for real-world use cases
2. **Read Documentation**: Deep dive into [docs/](docs/) for advanced topics
3. **Create Workflows**: Learn about [DAG workflows](docs/WORKFLOW_ENGINE.md)
4. **Build Extensions**: Extend Dash with [custom extensions](docs/extensions.md)
5. **Deploy to Production**: Follow the [deployment guide](docs/DEPLOYMENT.md)

---

**Happy Orchestrating! 🐝**
