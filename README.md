# Dash - Agent Orchestration Platform

<div align="center">

**Coordinate multiple AI agents to solve complex problems**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT/)
[![npm](https://img.shields.io/badge/npm-2.0.0-blue.svg)](https://www.npmjs.com/package/@jtan15010/dash)

</div>

---

## What is Dash?

Dash is a **multi-agent orchestration platform** that coordinates AI agents to work together on complex tasks. Think of it as an operating system for AI agents.

```
┌─────────────────────────────────────────────────────────────────┐
│                        DASH PLATFORM                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │  Agent 1    │    │  Agent 2    │    │  Agent N    │        │
│   │  (Claude)  │    │   (Kimi)    │    │  (GPT-4)   │        │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │
│          │                   │                   │                │
│          └───────────────────┼───────────────────┘                │
│                              │                                    │
│                    ┌─────────▼─────────┐                        │
│                    │   SWARM ORCHESTRATOR │                      │
│                    │   (Coordination)    │                      │
│                    └─────────┬─────────┘                        │
│                              │                                  │
│          ┌───────────────────┼───────────────────┐              │
│          │                   │                   │                │
│   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐       │
│   │  WORKFLOW   │    │   CONTEXT    │    │   SAFETY    │       │
│   │   ENGINE    │    │   MANAGER    │    │   MANAGER   │       │
│   └─────────────┘    └─────────────┘    └─────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why Dash?

| Approach | Problem | Dash Solution |
|----------|---------|---------------|
| Single Agent | Limited context, can't handle complex tasks | Coordinate multiple specialized agents |
| Manual Handoffs | Slow, error-prone, no visibility | Automatic routing, real-time tracking |
| Siloed Agents | No shared context, duplicate work | Centralized context management |
| Black Box | Don't know what's happening | Full observability, event streaming |

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │   CLI    │  │   TUI    │  │   API    │  │   WEB DASHBOARD  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
└───────┼─────────────┼─────────────┼───────────────────┼─────────────┘
        │             │             │                   │
        └─────────────┴─────────────┴───────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                        API GATEWAY                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐   │
│  │   REST     │  │  WebSocket │  │   AUTH & RATE     │   │
│  │   API      │  │  (Events)  │  │   LIMITS          │   │
│  └────────────┘  └────────────┘  └────────────────────┘   │
└─────────────────────────────┬─────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                      CORE SERVICES                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              ORCHESTRATION ENGINE                   │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐        │  │
│  │  │   Agent   │  │   Swarm  │  │ Workflow  │        │  │
│  │  │  Manager  │  │  Manager │  │  Engine   │        │  │
│  │  └───────────┘  └───────────┘  └───────────┘        │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────┐ │
│  │  Context  │  │  Event    │  │  Safety   │  │Quality  │ │
│  │  Manager  │  │    Bus    │  │  Manager  │  │Control  │ │
│  └───────────┘  └───────────┘  └───────────┘  └─────────┘ │
│                                                              │
└─────────────────────────────┬─────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                    INFRASTRUCTURE                            │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────┐ │
│  │  SQLite   │  │   Redis   │  │  Git      │  │ External│ │
│  │  (State)  │  │  (Cache)  │  │(Worktree)│  │  APIs  │ │
│  └───────────┘  └───────────┘  └───────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Agent Swarm Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    SWARM COORDINATION                         │
│                                                              │
│    ┌─────────────────────────────────────────────┐        │
│    │           SWARM LEADER (Orchestrator)        │        │
│    │  ┌─────────────────────────────────────────┐│        │
│    │  │  Task Decomposition                     ││        │
│    │  │  Work Distribution                     ││        │
│    │  │  Result Aggregation                    ││        │
│    │  └─────────────────────────────────────────┘│        │
│    └───────────────────────┬─────────────────────┘        │
│                            │                             │
│         ┌─────────────────┼─────────────────┐            │
│         │                 │                 │            │
│    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐       │
│    │ Agent 1 │      │ Agent 2 │      │ Agent 3 │       │
│    │ Write   │      │ Review  │      │ Test   │       │
│    │ Code    │ ───► │ Code   │ ───► │ Code   │       │
│    └─────────┘      └─────────┘      └─────────┘       │
│         │                 │                 │            │
│         └─────────────────┼─────────────────┘            │
│                           │                              │
│                    ┌──────▼──────┐                      │
│                    │  RESULTS    │                      │
│                    │  MERGED     │                      │
│                    └─────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### Event Flow

```
    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │  Agent  │      │  Swarm  │      │  User   │
    │ Created │      │ Created │      │ Action  │
    └────┬────┘      └────┬────┘      └────┬────┘
         │                │                │
         └────────────────┼────────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │    EVENT BUS     │
              │   (Pub/Sub)      │
              └─────────┬─────────┘
                        │
      ┌────────────┬────┴────┬────────────┐
      │            │         │            │
      ▼            ▼         ▼            ▼
  ┌───────┐  ┌────────┐  ┌─────────┐  ┌────────┐
  │Logger │  │Metrics │  │Dashboard│  │Webhooks│
  └───────┘  └────────┘  └─────────┘  └────────┘
```

## Key Features

### 1. Agent Management

```
┌─────────────────────────────────────────────────────────┐
│                  AGENT LIFECYCLE                         │
│                                                          │
│   ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐ │
│   │ SPAWN  │───►│ ACTIVE │───►│ IDLE   │───►│TERMINATE│
│   └────────┘    └────────┘    └────────┘    └────────┘ │
│       │              │              │           │       │
│       ▼              ▼              ▼           ▼       │
│   Created         Running       Waiting     Completed      │
│                   (LLM call)   (queue)     (Done)      │
└─────────────────────────────────────────────────────────┘
```

**Commands:**
```bash
# List all agents
dash agent list

# Spawn a new agent
dash agent spawn "Analyze this codebase"

# Get agent status
dash agent status <agent-id>

# Terminate an agent
dash agent terminate <agent-id>
```

### 2. Swarm Orchestration

```
┌─────────────────────────────────────────────────────────┐
│                 SWARM TYPES                             │
│                                                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │           PARALLEL SWARM                          │  │
│  │                                                 │  │
│  │     [A1]  [A2]  [A3]                            │  │
│  │      │     │     │                               │  │
│  │      └─────┼─────┘                               │  │
│  │            │                                     │  │
│  │            ▼                                     │  │
│  │       [AGGREGATE]                                │  │
│  └─────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │           SEQUENTIAL SWARM                       │  │
│  │                                                 │  │
│  │  [A1] ──► [A2] ──► [A3] ──► [A4]              │  │
│  │                                                 │  │
│  │  Each agent waits for previous to complete       │  │
│  └─────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │           HIERARCHICAL SWARM                     │  │
│  │                                                 │  │
│  │          ┌───────┐                              │  │
│  │          │LEADER │                              │  │
│  │          └──┬────┘                              │  │
│  │        ┌────┼────┐                              │  │
│  │       ▼     ▼     ▼                              │  │
│  │     [A1]  [A2]  [A3]                            │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3. Workflow Engine

```typescript
// Define a workflow
const workflow = {
  name: "Code Review Pipeline",
  steps: [
    { name: "lint", agent: "lint-agent", parallel: false },
    { name: "test", agent: "test-agent", parallel: true, count: 3 },
    { name: "security", agent: "security-agent", parallel: false },
    { name: "report", agent: "report-agent", parallel: false }
  ]
};

// Execute
const result = await workflowEngine.execute(workflow);
```

### 4. Context Management

```
┌─────────────────────────────────────────────────────────┐
│              CONTEXT STACK                              │
│                                                          │
│   ┌───────────────────────────────────────────────┐   │
│   │  Global Context (Shared by all agents)          │   │
│   │  - Project structure                           │   │
│   │  - Shared memory                               │   │
│   │  - Configuration                               │   │
│   └─────────────────────────────────────────────────┘   │
│                        │                                │
│                        ▼                                │
│   ┌───────────────────────────────────────────────┐   │
│   │  Swarm Context (Shared by swarm members)       │   │
│   │  - Task requirements                           │   │
│   │  - Partial results                            │   │
│   │  - Inter-agent messages                       │   │
│   └─────────────────────────────────────────────────┘   │
│                        │                                │
│                        ▼                                │
│   ┌───────────────────────────────────────────────┐   │
│   │  Agent Context (Per agent)                     │   │
│   │  - Current task                               │   │
│   │  - Local reasoning                            │   │
│   │  - Tool usage history                         │   │
│   └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
# Clone
git clone https://github.com/davidkimai/dash.git
cd dash

# Install
npm install

# Build
npm run build

# Verify
./dist/src/index.js --version
```

### CLI Usage

```bash
# System status
dash status

# Agent operations
dash agent list           # List all agents
dash agent spawn "Task"   # Create agent
dash agent terminate <id>  # Stop agent

# Swarm operations  
dash swarm list           # List swarms
dash swarm create        # Create swarm
dash swarm status <id>    # Check progress

# Workflow operations
dash workflow list       # List workflows
dash workflow run <id>   # Execute workflow
```

### Programmatic API

```typescript
import { createApp } from 'dash';

const app = await createApp({ port: 7373 });

// Create agent
const agent = await app.agents.create({
  model: 'kimi-k2.5',
  task: 'Research AI agents',
  context: { priority: 'high' }
});

// Create swarm
const swarm = await app.swarms.create({
  name: 'research-team',
  agents: [agent1, agent2, agent3],
  strategy: 'parallel'
});

// Execute workflow
const result = await app.workflows.execute({
  name: 'analysis-pipeline',
  steps: [...]
});
```

## Project Structure

```
dash/
├── src/
│   ├── api/              # REST API endpoints
│   ├── cli/              # CLI commands
│   ├── core/             # Core orchestration
│   ├── events/           # Event bus system
│   ├── workflow/         # Workflow engine
│   ├── scheduling/       # Task scheduling
│   ├── scaling/          # Auto-scaling
│   ├── recovery/         # Fault tolerance
│   ├── safety/           # Safety checks
│   ├── storage/          # Database layer
│   ├── tracing/          # OpenTelemetry tracing
│   └── dashboard/        # Web dashboard
├── dist/                 # Compiled output
├── docs/                 # Documentation
│   ├── ARCHITECTURE.md   # System design
│   ├── API.md           # API reference
│   └── CLI.md           # CLI reference
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Type checking
npm run typecheck

# Run tests
npm test

# Build for production
npm run build

# Lint code
npm run lint
```

## Monitoring

### Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│                    DASH DASHBOARD                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  System Health  ████████████████████████████ 100%   │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │                                                      │ │
│  │  Active Agents    │███████████████      12/15       │ │
│  │  Active Swarms   │█████████              5/8        │ │
│  │  Queue Length    │█                      2          │ │
│  │                                                      │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │  Events Stream                                   ▲    │ │
│  │  [14:23:01] Agent spawned: agent-1234                 │ │
│  │  [14:23:02] Task completed: lint-check               │ │
│  │  [14:23:03] Swarm created: research-team            │ │
│  │  [14:23:04] Workflow started: code-review           │ │
│  │                                                          │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Metrics

- Agent count (active/idle/total)
- Swarm status (running/completed/failed)
- Task throughput
- Error rates
- Latency percentiles

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and components |
| [API.md](docs/API.md) | REST API reference |
| [CLI.md](docs/CLI.md) | CLI command reference |
| [ERROR_CODES.md](docs/ERROR_CODES.md) | Error code reference |

## Docker

```bash
# Build image
docker build -t dash .

# Run container
docker run -p 7373:7373 dash

# With custom config
docker run -p 7373:7373 \
  -v $(pwd)/config:/app/config \
  dash
```

## Publishing to npm

```bash
# Update version
npm version patch   # 2.0.0 -> 2.0.1
npm version minor   # 2.0.0 -> 2.1.0
npm version major  # 2.0.0 -> 3.0.0

# Build
npm run build

# Publish
npm publish --access public
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/new-feature`)
3. Commit changes (`git commit -m 'Add new feature'`)
4. Push to branch (`git push origin feature/new-feature`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with TypeScript, Fastify, and SQLite
- Inspired by [OpenClaw](https://github.com/openclaw/openclaw)
- Uses [Kimi](https://moonshot.ai/) for agent intelligence
