# Dash Phase 2 Documentation

This is the documentation worktree for Dash Phase 2, containing API specifications and development guides.

## Project Overview

Dash is a multi-agent orchestration platform designed to coordinate multiple AI agents for complex tasks. It provides:

- **Agent Management**: Spawn, monitor, and terminate AI agents
- **Swarm Orchestration**: Coordinate groups of agents working together
- **Session Tracking**: Maintain state and history of orchestration sessions
- **Workflow Engine**: Define and execute multi-step workflows
- **Real-time Events**: WebSocket-based event streaming

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Dash Architecture                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Client    │     │   Client    │     │   Client    │                   │
│  │   (HTTP)    │     │  (WebSocket)│     │   (CLI)     │                   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                  │                  │                             │
│         └──────────────────┼──────────────────┘                             │
│                            │                                                │
│                   ┌────────▼────────┐                                       │
│                   │   API Gateway   │                                       │
│                   │  (Express.js)   │                                       │
│                   │  :7373          │                                       │
│                   └────────┬────────┘                                       │
│                            │                                                │
│         ┌──────────────────┼──────────────────┐                             │
│         │                  │                  │                             │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                     │
│  │   Agent     │    │   Swarm     │    │  Workflow   │                     │
│  │  Manager    │    │ Orchestrator│    │   Engine    │                     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                     │
│         │                  │                  │                             │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                     │
│  │  Agent      │    │   Session   │    │   Event     │                     │
│  │  Pool       │    │   Store     │    │   Bus       │                     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                     │
│         │                  │                  │                             │
│         └──────────────────┼──────────────────┘                             │
│                            │                                                │
│                   ┌────────▼────────┐                                       │
│                   │   SQLite DB     │                                       │
│                   │  (dash.db)      │                                       │
│                   └─────────────────┘                                       │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                            External Services                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │  AI Model   │    │  Message    │    │   OpenClaw  │                     │
│  │  Providers  │    │   Queue     │    │   Gateway   │                     │
│  │ (Kimi, GPT) │    │  (Bull)     │    │             │                     │
│  └─────────────┘    └─────────────┘    └─────────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Description | Technology |
|-----------|-------------|------------|
| API Gateway | REST API endpoint handling | Express.js |
| Agent Manager | Spawns and monitors individual agents | TypeScript |
| Swarm Orchestrator | Coordinates groups of agents | TypeScript |
| Workflow Engine | Executes multi-step workflows | TypeScript |
| Session Store | Persists session state | SQLite |
| Event Bus | Real-time event distribution | WebSocket/SSE |

## Quickstart

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- SQLite 3

### Installation

```bash
# Clone the repository
git clone https://github.com/jasontang/clawd/projects/dash.git
cd dash

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start the server
npm run dev
```

### Configuration

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=7373
NODE_ENV=development

# API Authentication
DASH_API_KEY=dash-api-key

# Database
DATABASE_PATH=./dash.db

# AI Model Providers
KIMI_API_KEY=your-kimi-key
OPENAI_API_KEY=your-openai-key
```

### Running with Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f dash

# Stop services
docker-compose down
```

### API Examples

#### Health Check

```bash
curl http://localhost:7373/health
```

#### List Agents

```bash
curl -H "X-API-Key: dash-api-key" \
  "http://localhost:7373/api/agents?status=running"
```

#### Create an Agent

```bash
curl -X POST -H "X-API-Key: dash-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k2.5",
    "task": "Analyze this dataset",
    "label": "analyzer-1"
  }' \
  "http://localhost:7373/api/agents"
```

#### Stream Events (WebSocket)

```javascript
const ws = new WebSocket('ws://localhost:7373/events', {
  headers: { 'X-API-Key': 'dash-api-key' }
});

ws.onmessage = (event) => {
  console.log('Event:', JSON.parse(event.data));
};
```

## Documentation

| Document | Description |
|----------|-------------|
| [OpenAPI Spec](docs/openapi.yaml) | Complete API specification |
| [Error Codes](docs/error-codes.md) | Reference for all error codes |
| [Architecture](docs/ARCHITECTURE.md) | Detailed architecture documentation |

## Troubleshooting

### Common Issues

#### Server Won't Start

**Symptoms:**
- Port already in use error
- Database lock errors

**Solutions:**
```bash
# Kill processes on port 7373
lsof -ti:7373 | xargs kill -9

# Remove database lock
rm -f dash.db-shm dash.db-wal

# Restart with fresh database
npm run db:migrate:fresh
```

#### Agents Not Spawning

**Symptoms:**
- Agents stuck in "pending" status
- No errors in logs

**Solutions:**
1. Check API key validity
2. Verify model provider credentials
3. Check system resources (memory, CPU)

```bash
# Check server logs
tail -f logs/dash.log

# Verify environment variables
npm run env:check
```

#### WebSocket Connection Failed

**Symptoms:**
- Cannot connect to event stream
- Connection timeout errors

**Solutions:**
1. Verify WebSocket URL is correct
2. Check firewall rules
3. Ensure authentication header is passed

```javascript
// Correct WebSocket connection with auth
const ws = new WebSocket('ws://localhost:7373/events', {
  headers: { 'X-API-Key': 'dash-api-key' }
});
```

#### Database Migration Failures

**Symptoms:**
- "Database is locked" errors
- Missing table errors

**Solutions:**
```bash
# Backup database
cp dash.db dash.db.backup

# Run migrations fresh
npm run db:migrate:fresh

# Seed if needed
npm run db:seed
```

### Log Locations

| Log | Location | Purpose |
|-----|----------|---------|
| Application | `logs/dash.log` | Main application logs |
| Error | `logs/error.log` | Error-only logs |
| Access | `logs/access.log` | HTTP access logs |

### Performance Tuning

For production deployments:

```bash
# Increase worker threads
DASH_WORKERS=4 npm start

# Configure connection pool
DB_POOL_SIZE=20

# Enable compression
ENABLE_COMPRESSION=true
```

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: GitHub Issues
- **Discord**: [OpenClaw Discord](https://discord.gg/openclaw)
