# Dash

[![npm version](https://img.shields.io/npm/v/@jtan15010/dash.svg)](https://www.npmjs.com/package/@jtan15010/dash)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

Dash is a powerful agent orchestration platform for AI-powered development workflows. It enables you to coordinate multiple AI agents working together on complex tasks, manage swarms of agents, define DAG-based workflows, and maintain quality and budget control across your entire AI-assisted development process.

## ✨ Features

### Core Capabilities
- **🐝 Multi-Agent Swarms** - Spawn and coordinate multiple AI agents working in parallel
- **📊 DAG Workflows** - Define complex workflows with dependencies using directed acyclic graphs
- **🎯 Task Management** - Create, assign, and track tasks across your agent fleet
- **🛡️ Safety & Security** - Built-in sandboxing, permission system, and safety guardrails
- **💰 Budget Control** - Token usage tracking and budget enforcement per session
- **✅ Quality Assurance** - Built-in code quality checks, tests, and enforcement

### Advanced Features
- **🔧 Extension System** - TypeScript-based plugin architecture for custom tools and integrations
- **🧠 Skills System** - Auto-loading agent skills based on context (Agent Skills standard)
- **📈 Event Streaming** - Real-time event system for monitoring and integration
- **🔄 GitOps Integration** - Automatic file watching and deployment
- **📊 OpenTelemetry** - Full observability with tracing and metrics
- **🗄️ State Persistence** - PostgreSQL/SQLite backends for workflow state

## 🚀 Quick Start (5 Minutes)

### 1. Install Dash

```bash
# Using npm (recommended)
npm install -g @jtan15010/dash

# Using npx (no install)
npx @jtan15010/dash <command>

# From source
git clone https://github.com/davidkimai/dash.git
cd dash
npm install
npm run build
npm link
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your settings
# Minimum required: DASH_PROJECT_PATH
```

### 3. Create Your First Swarm

```bash
# Create a swarm of agents to work on a task
dash swarm create --name "code-review" --task "Review the codebase for security issues"

# Monitor the swarm
dash dashboard
```

### 4. Define a Workflow (Optional)

Create a `workflow.yaml` file:

```yaml
name: data-pipeline
steps:
  - id: extract
    name: Extract Data
    agent: data-extractor
    task: Fetch data from API
    next: [transform]

  - id: transform
    name: Transform Data
    agent: transformer
    task: Normalize data format
    dependsOn: [extract]
    next: [load]

  - id: load
    name: Load to Database
    agent: db-loader
    task: Insert into database
    dependsOn: [transform]
```

Run it:
```bash
dash workflow run workflow.yaml
```

## 📖 Installation

### Prerequisites

- **Node.js** 18+ with npm
- **Git** 2.35+ with worktree support
- **PostgreSQL** 14+ (optional, for production)
- **Redis** 7+ (optional, for caching)

### Methods

#### npm Global Install
```bash
npm install -g @jtan15010/dash
dash --version
```

#### Docker
```bash
docker pull dashai/dash:latest
docker run -it --rm dashai/dash --help
```

#### From Source
```bash
git clone https://github.com/davidkimai/dash.git
cd dash
npm install
npm run build
npm link  # Makes 'dash' available globally
```

## 📚 Usage Examples

### Agent Management

```bash
# List all running agents
dash agents list

# Spawn a new agent for a specific task
dash agents spawn "Implement user authentication" --model kimi-k2.5

# Check agent status
dash agents status <agent-id>

# Pause and resume agents
dash agents pause <agent-id>
dash agents resume <agent-id>
```

### Swarm Management

```bash
# Create a swarm with multiple agents
dash swarm create \
  --name "security-audit" \
  --task "Audit codebase for security vulnerabilities" \
  --initial-agents 5 \
  --max-agents 20 \
  --strategy parallel \
  --budget 50.00

# List active swarms
dash swarm list

# Destroy a swarm
dash swarm destroy <swarm-id>
```

### Workflow Execution

```bash
# Run a workflow from YAML
dash workflow run ./workflows/my-workflow.yaml

# Check workflow status
dash workflow status <workflow-id>

# Cancel a running workflow
dash workflow cancel <workflow-id>
```

### Quality & Testing

```bash
# Run all quality checks
dash quality run

# Run specific checks
dash quality lint
dash quality types
dash quality security

# Run tests
dash tests run
dash tests coverage
```

### Budget Management

```bash
# Set session budget
dash budget set --amount 100.00 --currency USD

# Check current usage
dash budget status

# Set up alerts
dash budget alerts --warning 75 --critical 90
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Dash Platform                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  CLI Layer  │  │  TUI Dash   │  │    API Server           │ │
│  │  (Commander)│  │   (Blessed) │  │    (Express)            │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         └─────────────────┴─────────────────────┘               │
│                            │                                    │
│  ┌─────────────────────────┴─────────────────────────┐          │
│  │              Core Services Layer                   │          │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │          │
│  │  │  Agent  │ │  Swarm  │ │ Workflow│ │  Task   │ │          │
│  │  │ Manager │ │ Manager │ │ Engine  │ │ Manager │ │          │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │          │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │          │
│  │  │  Skill  │ │Extension│ │  Event  │ │  Budget │ │          │
│  │  │Registry │ │ Loader  │ │  Bus    │ │ Manager │ │          │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │          │
│  └───────────────────────────────────────────────────┘          │
│                            │                                    │
│  ┌─────────────────────────┴─────────────────────────┐          │
│  │              Infrastructure Layer                  │          │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │          │
│  │  │PostgreSQL│ │  Redis  │ │ SQLite  │ │OpenClaw │ │          │
│  │  │ (State) │ │ (Cache) │ │ (Local) │ │Gateway  │ │          │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │          │
│  └───────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose | Documentation |
|-----------|---------|---------------|
| **Agent Manager** | Spawns and manages individual AI agents | [docs/AGENT_FIRST_ARCHITECTURE_REVIEW.md](docs/AGENT_FIRST_ARCHITECTURE_REVIEW.md) |
| **Swarm Manager** | Orchestrates multi-agent coordination | [CLI Reference](docs/CLI_COMMAND_REFERENCE.md#swarm) |
| **Workflow Engine** | DAG-based execution with dependencies | [docs/WORKFLOW_ENGINE.md](docs/WORKFLOW_ENGINE.md) |
| **Skill Registry** | Auto-loading agent capabilities | [docs/skills.md](docs/skills.md) |
| **Extension System** | TypeScript plugin architecture | [docs/extensions.md](docs/extensions.md) |
| **Event Bus** | Real-time event streaming | [docs/events.md](docs/events.md) |

## 📁 Project Structure

```
dash/
├── src/                    # Core source code
│   ├── commands/           # CLI command implementations
│   ├── core/               # Core services (agent, swarm, workflow)
│   ├── storage/            # Database repositories
│   ├── skills/             # Built-in agent skills
│   └── types/              # TypeScript type definitions
├── docs/                   # Documentation
│   ├── GETTING_STARTED.md  # Complete getting started guide
│   ├── ARCHITECTURE.md     # System architecture details
│   ├── DEPLOYMENT.md       # Production deployment
│   ├── TROUBLESHOOTING.md  # Common issues and solutions
│   └── CONTRIBUTING.md     # Contribution guidelines
├── examples/               # Example configurations and code
│   ├── basic-swarm/        # Simple swarm examples
│   ├── workflow-dag/       # DAG workflow examples
│   ├── ci-cd-integration/  # CI/CD integration examples
│   ├── custom-agent/       # Custom agent implementations
│   └── api-client/         # API client usage examples
├── skills/                 # Built-in skills
│   ├── deployment/
│   ├── testing/
│   ├── code-review/
│   └── refactoring/
├── monitoring/             # Observability configuration
│   ├── docker-compose.yml  # Grafana + Loki setup
│   └── dashboards/         # Pre-built dashboards
├── scripts/                # Utility scripts
├── tests/                  # Test suites
├── package.json
├── docker-compose.yml      # Local development stack
└── README.md               # This file
```

## 🔗 Documentation Links

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/GETTING_STARTED.md) | Complete setup and first steps guide |
| [Architecture](docs/ARCHITECTURE.md) | System design and component details |
| [CLI Reference](docs/CLI_COMMAND_REFERENCE.md) | Complete command reference |
| [API Documentation](docs/API_ENDPOINT_REFERENCE.md) | REST API endpoints |
| [Deployment](docs/DEPLOYMENT.md) | Production deployment guide |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and debugging |
| [Contributing](docs/CONTRIBUTING.md) | How to contribute to Dash |
| [Skills](docs/skills.md) | Agent skills system |
| [Extensions](docs/extensions.md) | Extension system |
| [Workflows](docs/WORKFLOW_ENGINE.md) | Workflow engine |

## 🛠️ Built With

- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[Commander.js](https://github.com/tj/commander.js/)** - CLI framework
- **[Blessed](https://github.com/chjj/blessed)** - Terminal UI
- **[TypeBox](https://github.com/sinclairzx81/typebox)** - Runtime type validation
- **[Zod](https://zod.dev/)** - Schema validation
- **[OpenTelemetry](https://opentelemetry.io/)** - Observability
- **[PostgreSQL](https://www.postgresql.org/)** - Primary database
- **[Redis](https://redis.io/)** - Caching and pub/sub

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

Quick start for contributors:
```bash
# Fork and clone
git clone https://github.com/your-username/dash.git
cd dash

# Install dependencies
npm install

# Run tests
npm test

# Start development
npm run dev
```

## 📜 License

Dash is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Dash Contributors

## 💬 Community

- **GitHub Discussions** - [github.com/davidkimai/dash/discussions](https://github.com/davidkimai/dash/discussions)
- **Issues** - [github.com/davidkimai/dash/issues](https://github.com/davidkimai/dash/issues)
- **Discord** - [discord.gg/dash-ai](https://discord.gg/dash-ai) (coming soon)

---

**Ready to orchestrate your AI agents?** [Get Started →](docs/GETTING_STARTED.md)
