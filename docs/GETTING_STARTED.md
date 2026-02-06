# Getting Started with Godel

Complete guide to setting up and using Godel for agent orchestration.

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

Before installing Godel, ensure you have the following:

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
npm install -g @jtan15010/godel

# Verify installation
godel --version  # Should show version number
godel --help     # Show available commands
```

### Method 2: Using npx (No Install)

```bash
# Run without installing
npx @jtan15010/godel --help

# Example: Create a swarm
npx @jtan15010/godel swarm create --name test --task "hello world"
```

### Method 3: From Source

```bash
# Clone the repository
git clone https://github.com/davidkimai/godel.git
cd godel

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
docker pull godelai/godel:latest

# Run with environment variables
docker run -it --rm \
  -e GODEL_PROJECT_PATH=/workspace \
  -v $(pwd):/workspace \
  godelai/godel --help
```

### Method 5: Docker Compose (Full Stack)

```bash
# Clone repository
git clone https://github.com/davidkimai/godel.git
cd godel

# Start all services (Godel + PostgreSQL + Redis + Monitoring)
docker-compose up -d

# View logs
docker-compose logs -f

# Run commands in the container
docker-compose exec godel godel --help
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
GODEL_PROJECT_PATH=/path/to/your/project

# Log level (optional, default: info)
GODEL_LOG_LEVEL=info
```

### Full Configuration Options

```env
# Core Settings
GODEL_PROJECT_PATH=/Users/jasontang/clawd/projects/godel
GODEL_MAX_SWARMS=5
GODEL_MAX_CONCURRENT=3

# Build Settings
GODEL_BUILD_TIMEOUT=120000
GODEL_TEST_TIMEOUT=60000

# Budget Settings
GODEL_BUDGET_TOTAL=1.0
GODEL_BUDGET_PER_SPRINT=0.25

# Database (optional)
DATABASE_URL=postgresql://user:password@localhost:5432/godel
REDIS_URL=redis://localhost:6379

# Notifications (optional)
OPENCLAW_GATEWAY_URL=http://127.0.0.1:8080/api
OPENCLAW_GATEWAY_TOKEN=your_token_here
NOTIFICATION_CHANNEL=telegram
NOTIFICATION_USER_ID=your_user_id

# Cron Settings
GODEL_CRON_ENABLED=true
GODEL_BUILD_MONITOR_INTERVAL=30
GODEL_SWARM_WATCHDOG_INTERVAL=120

# Debug
GODEL_DRY_RUN=false
```

### Verify Configuration

```bash
# Check configuration
godel status

# Should output current settings and health status
```

---

## First Swarm Creation

A **swarm** is a group of agents working together on a common task.

### Step 1: Create a Swarm

```bash
# Basic swarm creation
godel swarm create --name "my-first-swarm" --task "Review codebase for bugs"
```

### Step 2: Create with Options

```bash
# Advanced swarm creation
godel swarm create \
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
godel swarm list

# Check swarm status
godel swarm status <swarm-id>

# Launch the TUI dashboard
godel dashboard
```

### Using a YAML Configuration File

Create `swarm.yaml`:

```yaml
apiVersion: godel.io/v1
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
godel swarm create --file swarm.yaml
```

---

## First Agent Spawn

An **agent** is a single AI worker that executes tasks.

### Step 1: Spawn an Agent

```bash
# Basic agent spawn
godel agents spawn "Implement a REST API endpoint"
```

### Step 2: Spawn with Options

```bash
# Advanced agent spawn
godel agents spawn \
  "Implement user authentication" \
  --model kimi-k2.5 \
  --timeout 600000 \
  --budget 10.00
```

### Step 3: Manage the Agent

```bash
# List all agents
godel agents list

# Check agent status
godel agents status <agent-id>

# Pause the agent
godel agents pause <agent-id>

# Resume the agent
godel agents resume <agent-id>

# Kill the agent
godel agents kill <agent-id>
```

### Agent Output

Agents work in isolated Git worktrees. Their output is available in:
```
.claude-worktrees/<agent-id>/
├── src/           # Modified source files
├── tests/         # Test files
├── README.md      # Agent's documentation
└── .godel/         # Agent metadata
```

---

## Viewing Logs

### Real-time Logs

```bash
# View all logs
godel logs tail

# View logs for specific agent
godel logs tail --agent <agent-id>

# View logs for specific swarm
godel logs tail --swarm <swarm-id>

# Follow logs (like tail -f)
godel logs tail --follow
```

### Query Logs

```bash
# Query with filters
godel logs query \
  --level error \
  --since 1h \
  --agent <agent-id>

# Query with JSON output
godel logs query --format json --limit 100
```

### Log Files Location

Logs are stored in:
```
.godel/logs/
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
GODEL_LOG_LEVEL=debug

# Or via CLI
godel --log-level debug <command>
```

---

## Monitoring

### TUI Godelboard

Launch the interactive dashboard:

```bash
# Start dashboard
godel dashboard

# Godelboard shows:
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
| Active Swarms | Number of running swarms | Godelboard |
| Active Agents | Number of running agents | Godelboard |
| Budget Usage | Current budget consumption | Godelboard |
| Task Queue | Pending tasks | Godelboard |
| Events/sec | Event processing rate | Grafana |
| Latency | Response times | Grafana |

### Health Checks

```bash
# Check system health
godel status

# Check specific components
godel status --component database
godel status --component cache
godel status --component gateway
```

### Notifications

Configure notifications for important events:

```bash
# Set up notification channel
godel openclaw config \
  --gateway-url http://localhost:8080/api \
  --token your_token \
  --channel telegram

# Test notification
godel openclaw test-notification
```

---

## Troubleshooting Basics

### Common Issues

#### 1. "Command not found: godel"

```bash
# If installed globally but not found
export PATH="$PATH:$(npm config get prefix)/bin"

# Or use npx
npx @jtan15010/godel <command>
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
# Set in .env: DATABASE_URL=sqlite://./godel.db
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
export GODEL_LOG_LEVEL=debug

# Run command
godel <command>

# Or use flag
godel --log-level debug <command>
```

### Getting Help

```bash
# Show help for any command
godel --help
godel swarm --help
godel agents spawn --help

# Check version
godel --version
```

### Community Support

- **GitHub Issues**: [github.com/davidkimai/godel/issues](https://github.com/davidkimai/godel/issues)
- **Documentation**: [docs/](docs/)
- **Examples**: [examples/](examples/)

---

## Next Steps

Now that you have Godel running:

1. **Explore Examples**: Check out [examples/](examples/) for real-world use cases
2. **Read Documentation**: Deep dive into [docs/](docs/) for advanced topics
3. **Create Workflows**: Learn about [DAG workflows](docs/WORKFLOW_ENGINE.md)
4. **Build Extensions**: Extend Godel with [custom extensions](docs/extensions.md)
5. **Deploy to Production**: Follow the [deployment guide](docs/DEPLOYMENT.md)

---

**Happy Orchestrating! 🐝**
