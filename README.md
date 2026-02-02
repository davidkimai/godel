# Dash

[![npm version](https://img.shields.io/npm/v/@dash/agent-orchestrator.svg?style=flat-square)](https://www.npmjs.com/package/@dash/agent-orchestrator)
[![Build Status](https://img.shields.io/github/actions/workflow/status/dash-ai/dash/ci.yml?style=flat-square)](https://github.com/dash-ai/dash/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Downloads](https://img.shields.io/npm/dm/@dash/agent-orchestrator.svg?style=flat-square)](https://www.npmjs.com/package/@dash/agent-orchestrator)
[![Test Coverage](https://img.shields.io/codecov/c/github/dash-ai/dash?style=flat-square)](https://codecov.io/gh/dash-ai/dash)

> 🚀 Agent orchestration platform for AI-powered development

Dash is a powerful CLI tool and framework for orchestrating multiple AI agents to work together on complex development tasks. Built with TypeScript and designed for scale.

## ✨ Features

- 🤖 **Multi-Agent Orchestration** - Spawn and manage multiple AI agents working in parallel
- 📋 **Task Management** - Create, assign, and track tasks across your agent fleet
- 📊 **Quality Assurance** - Built-in code quality checks and test enforcement
- 💰 **Budget Control** - Token usage tracking and budget enforcement per session
- ✅ **Approval Workflows** - Human-in-the-loop approval for critical operations
- 🧠 **Reasoning Modes** - Toggle between fast and deep reasoning modes
- 📡 **Event System** - Real-time event streaming and logging
- 🔒 **Safety First** - Built-in safety checks and guardrails

## 🚀 Quick Start

```bash
# Install Dash globally
npm install -g dash

# Initialize a new project
dash init my-project

# Spawn your first agent
dash agents spawn "Build a REST API"
```

## 📦 Installation

### npm (Recommended)

```bash
npm install -g dash
```

### npx (No Install)

```bash
npx dash <command>
```

### From Source

```bash
git clone https://github.com/dash-ai/dash.git
cd dash
npm install
npm run build
npm link
```

## 💻 Usage

### Agent Management

```bash
# List all running agents
dash agents list

# Spawn a new agent for a task
dash agents spawn "Implement authentication" --model claude --priority high

# Check agent status
dash agents status <agent-id>

# Pause/resume agents
dash agents pause <agent-id>
dash agents resume <agent-id>
```

### Task Management

```bash
# Create a new task
dash tasks create "Fix login bug" --priority high --description "Users can't log in"

# Assign task to agent
dash tasks assign <task-id> <agent-id>

# List all tasks
dash tasks list --status pending

# Mark task complete
dash tasks complete <task-id>
```

### Quality & Testing

```bash
# Run quality checks
dash quality check

# Run tests
dash tests run

# Check test coverage
dash tests coverage
```

### Budget Management

```bash
# Set session budget
dash budget set --max-tokens 100000

# Check current usage
dash budget status
```

## 📖 Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `dash agents list` | List all agents | `dash agents list -f json` |
| `dash agents spawn <task>` | Spawn new agent | `dash agents spawn "Refactor API"` |
| `dash agents pause <id>` | Pause an agent | `dash agents pause agent-123` |
| `dash agents resume <id>` | Resume an agent | `dash agents resume agent-123` |
| `dash agents kill <id>` | Kill an agent | `dash agents kill agent-123 --force` |
| `dash tasks list` | List all tasks | `dash tasks list -s pending` |
| `dash tasks create <title>` | Create task | `dash tasks create "Fix bug" -p high` |
| `dash tasks assign <tid> <aid>` | Assign task | `dash tasks assign task-1 agent-1` |
| `dash tasks complete <id>` | Complete task | `dash tasks complete task-1` |
| `dash quality check` | Run quality checks | `dash quality check --strict` |
| `dash tests run` | Run test suite | `dash tests run --watch` |
| `dash budget set` | Set budget limits | `dash budget set --max-tokens 50k` |
| `dash reasoning toggle` | Toggle reasoning mode | `dash reasoning --mode deep` |
| `dash events stream` | Stream events | `dash events stream --follow` |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Dash CLI                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐    │
│  │  Agent  │  │  Task   │  │ Quality │  │   Budget    │    │
│  │  Mgmt   │  │  Mgmt   │  │  Checks │  │   Control   │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬──────┘    │
│       └─────────────┴─────────────┴─────────────┘           │
│                         │                                    │
│              ┌──────────┴──────────┐                        │
│              │   Agent Manager     │                        │
│              │   (Orchestrator)    │                        │
│              └──────────┬──────────┘                        │
│                         │                                    │
│       ┌─────────────────┼─────────────────┐                 │
│       │                 │                 │                 │
│  ┌────┴────┐      ┌────┴────┐      ┌────┴────┐           │
│  │ Agent 1 │      │ Agent 2 │      │ Agent N │           │
│  │(Worker) │      │(Worker) │      │(Worker) │           │
│  └────┬────┘      └────┬────┘      └────┬────┘           │
│       │                 │                 │                 │
│       └─────────────────┴─────────────────┘                 │
│                         │                                    │
│              ┌──────────┴──────────┐                        │
│              │   Shared Context    │                        │
│              │   (State & Events)  │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

### Quick Contributing Steps

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

Dash is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Dash Contributors

## 🙏 Acknowledgments

- Built with [Commander.js](https://github.com/tj/commander.js/) for CLI structure
- Inspired by the need for better AI agent coordination in development workflows

---

<div align="center">

**[Documentation](https://docs.dash.dev)** • **[NPM](https://www.npmjs.com/package/@dash/agent-orchestrator)** • **[Issues](https://github.com/dash-ai/dash/issues)** • **[Discussions](https://github.com/dash-ai/dash/discussions)**

</div>
