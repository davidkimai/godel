# Getting Started with Godel

Welcome to Godel! This guide will get you up and running in under 5 minutes.

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/davidkimai/godel.git
cd godel

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Configuration

Create a `.env` file:

```bash
# Server configuration
GODEL_PORT=7373
GODEL_HOST=0.0.0.0

# Database (PostgreSQL)
GODEL_DATABASE_URL=postgresql://user:pass@localhost:5432/godel

# Cache (Redis)
GODEL_REDIS_URL=redis://localhost:6379

# LLM Providers
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

### 3. Start the Server

```bash
# Start infrastructure (PostgreSQL, Redis)
npm run db:up

# Run migrations
npm run migrate

# Start the server
npm start
```

### 4. Verify Installation

```bash
# Check health
godel health

# View status
godel status
```

## Your First Agent

### Interactive Mode (Recommended for Beginners)

```bash
# Launch interactive mode
godel interactive

# Follow the prompts to:
# 1. Spawn your first agent
# 2. Create a team
# 3. Execute an intent
```

### CLI Mode

```bash
# Spawn a worker agent
godel agent spawn --role worker --model claude-sonnet-4-5

# List agents
godel agent list

# Execute a task
godel agent exec agent-001 "Implement a fibonacci function"
```

## Your First Team

```bash
# Create a parallel team
godel team create \
  --name "my-first-team" \
  --strategy parallel \
  --coordinator 1 \
  --workers 3 \
  --reviewer 1

# Monitor team status
godel team status <team-id>
```

## Intent-Based Execution

Instead of manually managing agents, describe what you want:

```bash
# Traditional approach (manual)
godel agent spawn
godel task create --agent agent-001 --prompt "Implement OAuth"

# Intent-based approach (automatic)
godel do "Implement OAuth2 authentication with Google provider"
```

Godel automatically:
1. Selects appropriate agents
2. Determines dependencies
3. Parallelizes work
4. Applies quality gates

## Quick Templates

Use pre-configured templates for faster setup:

```bash
# Basic single agent
godel template apply quickstart/basic

# Full team setup
godel template apply quickstart/team

# Development environment
godel template apply quickstart/development
```

## SDK Usage

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({
  baseUrl: 'http://localhost:7373',
  apiKey: 'your-api-key'
});

// Spawn an agent
const agent = await client.agents.spawn({
  role: 'worker',
  model: 'claude-sonnet-4-5'
});

// Execute an intent
const result = await client.intent.execute({
  description: 'Refactor the database layer'
});
```

## Dashboard

Access the web dashboard:

```bash
# Open in browser
godel dashboard open

# Or manually
open http://localhost:7373
```

## Monitoring

Start the monitoring stack:

```bash
# Start Prometheus, Grafana, Loki
npm run monitoring:up

# Open Grafana
open http://localhost:3000
```

## Troubleshooting

### Connection Refused

```bash
# Check if server is running
curl http://localhost:7373/health

# Check logs
npm run logs
```

### Database Errors

```bash
# Verify database is running
docker-compose ps

# Run migrations
npm run migrate
```

### Authentication Issues

```bash
# Verify API key
godel config show

# Generate new key
godel config generate-api-key
```

## Next Steps

- **Examples**: See `examples/` directory for detailed examples
- **Documentation**: Read full docs at `docs/`
- **CLI Reference**: Run `godel --help` or see `docs/CLI.md`
- **API Reference**: See `docs/API.md`

## Common Commands

```bash
# Agents
godel agent list
godel agent spawn --role worker
godel agent kill <agent-id>

# Teams
godel team list
godel team create --name my-team --workers 3
godel team scale <team-id> --workers 5

# Tasks
godel task list
godel task create --title "My task"
godel task assign <task-id> --agent <agent-id>

# Intents
godel do "Refactor authentication"
godel do "Add tests for user module" --agents 2

# Monitoring
godel health
godel status
godel metrics show
```

## Getting Help

- **Documentation**: `docs/` directory
- **CLI Help**: `godel <command> --help`
- **Examples**: `examples/` directory
- **Issues**: https://github.com/davidkimai/godel/issues
