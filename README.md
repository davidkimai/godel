# Godel - OpenClaw Agent Orchestration Platform

<div align="center">

**Production-grade meta-orchestration for 10-50+ concurrent AI agent sessions**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT/)
[![npm](https://img.shields.io/badge/npm-2.0.0-blue.svg)](https://www.npmjs.com/package/@jtan15010/godel)

</div>

---

## What is Godel?

Godel is a **production-grade meta-orchestration control plane** designed to manage 10-50+ concurrent OpenClaw/Pi agent sessions with enterprise reliability, observability, and operational efficiency. Godel operates as the central nervous system for AI agent swarms, providing unified task dispatch, priority queue management, session federation, and comprehensive lifecycle orchestration across heterogeneous agent instances.

### The "Intent-Based" Interface

Instead of manually managing individual agents, you describe what you want:

```bash
# Traditional approach - high cognitive load
godel task create --agent agent-7 --priority high --worktree /path/to/repo \
  --prompt "Implement OAuth2 login with Google, ensure CSRF protection, add rate limiting..."

# Godel approach - intent-based
godel do "Add Google OAuth login with security best practices"
```

Godel automatically:
- Selects the right agents for the task
- Determines dependency order
- Parallelizes where possible
- Applies quality gates
- Handles rollback if issues detected

---

## Key Features

### Multi-Provider Orchestration
- **Pi Integration First-Class**: Native support for Pi multi-provider CLI (15+ providers)
- **Model Routing**: Cost-optimized, capability-matched, and latency-optimized routing
- **Fallback Chains**: Automatic failover between providers (Anthropic → OpenAI → Google)
- **Unified API**: Single interface for Claude, GPT-4, Gemini, and more

### Tree-Structured Sessions
- **Branching**: Explore multiple approaches from any point in conversation
- **Forking**: Create new sessions from any conversation node
- **Navigation**: `/tree`, `/branch`, `/fork`, `/switch`, `/compact` commands
- **Context Management**: Automatic compaction when context windows fill

### Git Worktree Isolation
- **Per-Session Worktrees**: Each agent operates in isolated git worktrees
- **Dependency Sharing**: node_modules, .venv shared via symlinks
- **Automatic Cleanup**: Policies for immediate, on-success, delayed, or manual cleanup
- **Conflict Prevention**: Concurrent work on different branches without conflicts

### Agent Role System
Specialized roles for coordinated multi-agent workflows:

| Role | Purpose | Tools |
|------|---------|-------|
| **Coordinator** | Orchestrates multi-agent workflows | delegate, query_status, create_convoy |
| **Worker** | Ephemeral task executor | read, write, edit, bash, todo_write |
| **Reviewer** | Quality assurance and validation | read, diff, comment, approve, reject |
| **Refinery** | Merge conflicts and integration | git_merge, git_rebase, resolve_conflict |
| **Monitor** | System health and alerting | query_metrics, check_health, alert |

### Federation Architecture
- **Multi-Instance Management**: Route across 10-50+ OpenClaw instances
- **Health-Aware Routing**: Automatic failover to healthy instances
- **Session Affinity**: Keep related sessions on the same instance
- **Capacity Management**: Backpressure and load balancing

### Server-Side LLM Proxy
- **Security**: API keys stay server-side, never exposed to clients
- **Rate Limiting**: Token bucket algorithm with per-user quotas
- **Content Filtering**: PII detection and input/output sanitization
- **Caching**: Response caching to reduce costs and latency
- **Audit Logging**: Complete request/response audit trail

---

## Architecture

```mermaid
graph TB
    subgraph Clients
        CLI[CLI Tool]
        WEB[Web Dashboard]
        SDK[SDK Client]
        EXT[IDE Extensions]
    end

    subgraph API_Gateway
        REST[REST API /api/v1]
        PROXY[LLM Proxy /proxy/v1]
        WS[WebSocket /events]
        AUTH[JWT/API Key Auth]
    end

    subgraph Pi_Integration
        PI_REG[PiRegistry]
        PI_ROUT[ModelRouter]
        PI_SESS[PiSessionManager]
        PI_TREE[SessionTreeManager]
        PI_TOOL[ToolInterceptor]
    end

    subgraph Core_Services
        ORCH[Orchestration Engine]
        WM[Worktree Manager]
        FED[Federation Router]
        ROLE[Role Registry]
        BUS[Inter-Agent Bus]
    end

    subgraph Data_Layer
        PG[(PostgreSQL)]
        RED[(Redis)]
        GIT[(Git Worktrees)]
    end

    CLI --> REST
    WEB --> REST
    WEB --> WS
    SDK --> REST
    EXT --> PROXY

    REST --> AUTH
    PROXY --> AUTH
    WS --> AUTH

    AUTH --> ORCH
    REST --> PI_REG
    REST --> PI_SESS
    REST --> WM
    REST --> FED
    REST --> ROLE

    PI_REG --> PI_ROUT
    PI_ROUT --> PI_SESS
    PI_SESS --> PI_TREE
    PI_SESS --> PI_TOOL
    PI_TREE --> PG
    PI_SESS --> RED

    ORCH --> BUS
    WM --> GIT
    FED --> RED
    ROLE --> BUS

    ORCH --> PG
    ORCH --> RED
```

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/davidkimai/godel.git
cd godel

# Install dependencies
npm install

# Build the project
npm run build

# Run database migrations
npm run migrate
```

### Configuration

Create a `.env` file:

```bash
# Server
GODEL_PORT=7373
GODEL_HOST=0.0.0.0

# Database
GODEL_DATABASE_URL=postgresql://user:pass@localhost:5432/godel

# Redis
GODEL_REDIS_URL=redis://localhost:6379

# Pi / OpenClaw
GODEL_OPENCLAW_COMMAND=openclaw
GODEL_OPENCLAW_MAX_SESSIONS=50

# LLM Providers (server-side only)
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

### Start the Server

```bash
# Start API server
npm start

# Or with dashboard
npm run dashboard

# Development mode with hot reload
npm run dev
```

---

## Pi Runtime

Godel now supports Pi (pi-mono) as a first-class runtime for agent execution.

### Quick Start

```bash
# Spawn a Pi agent
godel agent spawn --runtime pi --model claude-sonnet-4-5

# Execute a task
godel agent exec pi-abc123 "Implement OAuth"

# List Pi agents
godel agent list
```

### Configuration

Create `.godel/config.yaml`:

```yaml
runtime:
  default: pi
  pi:
    defaultModel: claude-sonnet-4-5
    providers:
      - anthropic
      - openai
```

### Features

- **Multi-Provider**: Use 15+ LLM providers through a unified interface
- **Tree-Structured Sessions**: Branch and fork conversations
- **Model Cycling**: Switch models mid-session with Ctrl+P
- **Session Persistence**: Conversations survive restarts

### Model Selection

```bash
# Use Anthropic Claude
godel agent spawn --runtime pi --provider anthropic --model claude-sonnet-4-5

# Use OpenAI GPT-4
godel agent spawn --runtime pi --provider openai --model gpt-4o

# Use Google Gemini
godel agent spawn --runtime pi --provider google --model gemini-1.5-pro
```

---

## API Usage

### Create a Pi Session

```bash
curl -X POST http://localhost:7373/api/v1/pi/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "agent_id": "agent_001",
    "pi_config": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5",
      "tools": ["read", "write", "edit", "bash"]
    }
  }'
```

### Create a Worktree

```bash
curl -X POST http://localhost:7373/api/v1/worktrees \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "repository": "/home/user/projects/myapp",
    "base_branch": "main",
    "dependencies": {
      "shared": ["node_modules", ".venv"],
      "isolated": [".env", "dist/"]
    },
    "cleanup": "on_success"
  }'
```

### LLM Proxy (OpenAI-Compatible)

```bash
curl -X POST http://localhost:7373/proxy/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "smart",
    "messages": [{"role": "user", "content": "Hello!"}],
    "routing": {
      "fallback_allowed": true,
      "cost_limit": 0.50
    }
  }'
```

### Execute Intent-Based Task

```bash
curl -X POST http://localhost:7373/api/v1/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "payload": {
      "type": "pi_execute",
      "prompt": "Implement user authentication with OAuth2",
      "pi_config": {
        "provider": "anthropic",
        "model": "claude-opus-4"
      }
    },
    "priority": "high"
  }'
```

---

## CLI Commands

### System Operations

```bash
# Check status
godel status

# View logs
godel logs --follow

# Health check
godel health
```

### Agent Management

```bash
# List agents
godel agent list

# Create agent with specific role
godel agent create --role worker --model claude-sonnet-4

# Terminate agent
godel agent terminate <agent-id>
```

### Swarm Operations

```bash
# Create a swarm with role composition
godel swarm create \
  --name "feature-auth" \
  --coordinator coordinator \
  --workers 3 \
  --reviewer 1 \
  --task "Implement OAuth2 authentication"

# List swarms
godel swarm list

# Monitor swarm
godel swarm status <swarm-id>
```

### Worktree Operations

```bash
# List worktrees
godel worktree list

# Create worktree for feature
godel worktree create --repo /path/to/repo --branch feature/new-auth

# Clean up worktree
godel worktree cleanup <worktree-id>
```

### Pi Operations

```bash
# List Pi instances
godel pi instances

# Create Pi session
godel pi session create --provider anthropic --model claude-sonnet-4

# View conversation tree
godel pi tree <session-id>

# Fork session at node
godel pi fork <session-id> --node <node-id>
```

---

## Programmatic API

### TypeScript SDK

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({
  baseUrl: 'http://localhost:7373',
  apiKey: 'your-api-key'
});

// Create Pi session with tree-structured conversations
const session = await client.pi.sessions.create({
  agent_id: 'agent_001',
  pi_config: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    tools: ['read', 'write', 'edit', 'bash', 'todo_write']
  }
});

// Create worktree for isolated development
const worktree = await client.worktrees.create({
  repository: '/home/user/projects/myapp',
  base_branch: 'main',
  dependencies: {
    shared: ['node_modules', '.venv'],
    isolated: ['.env', 'dist/']
  }
});

// Use LLM proxy with automatic routing
const response = await client.proxy.complete({
  model: 'smart',  // Alias for claude-opus-4
  messages: [{ role: 'user', content: 'Implement auth' }],
  routing: {
    fallback_allowed: true,
    cost_limit: 0.50
  }
});

// Create role-based swarm
const swarm = await client.swarms.create({
  name: 'auth-implementation',
  composition: {
    coordinator: { role: 'coordinator', model: 'claude-opus-4' },
    workers: [{ role: 'worker', count: 3, model: 'claude-sonnet-4' }],
    reviewers: [{ role: 'reviewer', count: 1, model: 'claude-sonnet-4' }]
  },
  task: {
    description: 'Implement OAuth2 authentication',
    worktree_id: worktree.id
  }
});
```

---

## Project Structure

```
godel/
├-- src/
│   ├-- api/                    # REST API endpoints
│   │   ├-- routes/
│   │   │   ├-- pi.ts          # Pi integration routes
│   │   │   ├-- worktrees.ts   # Worktree management
│   │   │   ├-- proxy.ts       # LLM proxy routes
│   │   │   ├-- federation.ts  # Instance federation
│   │   │   └-- roles.ts       # Agent roles
│   │   └-- fastify-server.ts  # Main server
│   ├-- core/
│   │   ├-- worktree/          # Git worktree isolation
│   │   ├-- federation/        # Multi-instance federation
│   │   └-- roles/             # Agent role system
│   ├-- integrations/
│   │   └-- pi/                # Pi SDK integration
│   │       ├-- registry.ts    # Provider registry
│   │       ├-- router.ts      # Model routing
│   │       ├-- session.ts     # Session management
│   │       ├-- tree.ts        # Tree-structured sessions
│   │       ├-- tools.ts       # Tool interceptor
│   │       └-- client.ts      # Pi RPC client
│   ├-- proxy/                 # Server-side LLM proxy
│   │   ├-- proxy.ts           # Main proxy
│   │   ├-- adapters.ts        # Provider adapters
│   │   ├-- security.ts        # Auth & rate limiting
│   │   └-- cache.ts           # Response caching
│   ├-- cli/                   # CLI commands
│   ├-- dashboard/             # Web UI
│   └-- storage/               # Database layer
├-- migrations/                # Database migrations
├-- tests/                     # Test suites
└-- docs/                      # Documentation
```

---

## Development

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Type checking
npm run typecheck

# Run tests
npm test
npm run test:unit
npm run test:integration

# Build for production
npm run build

# Run release gate checks
npm run verify:release
```

---

## Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GODEL_PORT` | API server port | `7373` |
| `GODEL_HOST` | API server host | `0.0.0.0` |
| `GODEL_DATABASE_URL` | PostgreSQL connection | - |
| `GODEL_REDIS_URL` | Redis connection | - |
| `GODEL_JWT_SECRET` | JWT signing secret | - |
| `GODEL_OPENCLAW_COMMAND` | OpenClaw CLI command | `openclaw` |
| `GODEL_OPENCLAW_MAX_SESSIONS` | Max concurrent sessions | `50` |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `OPENAI_API_KEY` | OpenAI API key | - |

### Provider Configuration

Providers are configured server-side in the proxy:

```typescript
// Example proxy config
{
  providers: [
    {
      id: 'anthropic',
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultModel: 'claude-sonnet-4-5',
      models: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku'],
      capabilities: ['streaming', 'function_calling', 'vision'],
      pricing: { inputPer1k: 0.015, outputPer1k: 0.075 }
    }
  ]
}
```

---

## Monitoring & Observability

### Dashboard

Access the web dashboard at `http://localhost:7373` when the server is running.

**Available Views:**
- **Swarm Overview**: Real-time visualization of active swarms
- **Agent Status**: Individual agent health and activity
- **Conversation Trees**: Visual tree navigation for Pi sessions
- **Worktree Map**: Active worktrees and their status
- **Cost Analytics**: Token usage and cost breakdown by provider

### Metrics

Prometheus metrics available at `/metrics`:

```
godel_agents_connected{status="active"}
godel_sessions_active{provider="anthropic"}
godel_queue_depth{priority="high"}
godel_proxy_requests_total{provider="anthropic",model="claude-sonnet-4"}
godel_proxy_cost_total{provider="anthropic"}
```

### Health Checks

- `GET /health` - Overall system health
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /proxy/health` - LLM proxy health

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and architecture decisions |
| [API.md](docs/API.md) | Complete REST API reference |
| [CLI.md](docs/CLI.md) | CLI command reference |
| [specifications.md](specifications.md) | Technical specifications v2.0 |
| [prd.md](prd.md) | Product requirements document |

---

## Docker Deployment

```bash
# Build image
docker build -t godel:latest .

# Run with docker-compose
docker-compose up -d

# Scale OpenClaw instances
docker-compose up -d --scale openclaw=10
```

### Kubernetes

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/

# Or use Helm
helm install godel ./helm/godel
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with TypeScript, Fastify, PostgreSQL, and Redis
- Pi integration powered by [@mariozechner/pi-coding-agent](https://github.com/mariozechner/pi-coding-agent)
- Inspired by [OpenClaw](https://github.com/openclaw/openclaw)
- Tree-structured sessions inspired by Pi CLI

---

<div align="center">

**[Documentation](https://github.com/davidkimai/godel/tree/main/docs)** • **[Issues](https://github.com/davidkimai/godel/issues)** • **[Discussions](https://github.com/davidkimai/godel/discussions)**

</div>
