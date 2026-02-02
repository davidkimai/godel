# Dash

[![npm version](https://img.shields.io/npm/v/dash-agent.svg)](https://www.npmjs.com/package/dash-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Dash is an agent orchestration platform for AI-powered development. It provides a CLI tool and framework for coordinating multiple AI agents to work together on complex tasks.

## Overview

Dash helps you manage AI agents, track tasks, enforce quality standards, and control costs. Built with TypeScript, it offers a robust foundation for automating development workflows with AI assistance.

## Features

- **Multi-Agent Orchestration** - Spawn and coordinate multiple AI agents working in parallel
- **Task Management** - Create, assign, and track tasks across your agent fleet
- **Quality Assurance** - Built-in code quality checks and test enforcement
- **Budget Control** - Token usage tracking and budget enforcement per session
- **Approval Workflows** - Human-in-the-loop approval for critical operations
- **Reasoning Traces** - Decision logging and confidence tracking
- **Event System** - Real-time event streaming and logging
- **Safety Boundaries** - Built-in safety checks and guardrails

## Quick Start

```bash
# Install Dash globally
npm install -g dash-agent

# View available commands
dash --help

# Spawn your first agent
dash agents spawn "Build a REST API"
```

## Installation

### npm (Recommended)

```bash
npm install -g dash-agent
```

### npx (No Install)

```bash
npx dash-agent <command>
```

### From Source

```bash
git clone https://github.com/davidkimai/dash.git
cd dash
npm install
npm run build
npm link
```

## Usage

### Agent Management

```bash
# List all running agents
dash agents list

# Spawn a new agent for a task
dash agents spawn "Implement authentication"

# Check agent status
dash agents status <agent-id>

# Pause/resume agents
dash agents pause <agent-id>
dash agents resume <agent-id>
```

### Task Management

```bash
# Create a new task
dash tasks create "Fix login bug" --priority high

# Assign task to agent
dash tasks assign <task-id> <agent-id>

# List all tasks
dash tasks list --status pending

# Mark task complete
dash tasks complete <task-id>
```

### Quality and Testing

```bash
# Run quality checks
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
dash budget set --task 100000 --cost 5.00

# Check current usage
dash budget status
```

## Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `dash agents list` | List all agents | `dash agents list` |
| `dash agents spawn <task>` | Spawn new agent | `dash agents spawn "Refactor API"` |
| `dash agents pause <id>` | Pause an agent | `dash agents pause agent-123` |
| `dash agents resume <id>` | Resume an agent | `dash agents resume agent-123` |
| `dash agents kill <id>` | Kill an agent | `dash agents kill agent-123` |
| `dash tasks list` | List all tasks | `dash tasks list` |
| `dash tasks create <title>` | Create task | `dash tasks create "Fix bug"` |
| `dash tasks assign <tid> <aid>` | Assign task | `dash tasks assign task-1 agent-1` |
| `dash tasks complete <id>` | Complete task | `dash tasks complete task-1` |
| `dash quality lint` | Run linter | `dash quality lint` |
| `dash quality types` | Type check | `dash quality types` |
| `dash quality security` | Security scan | `dash quality security` |
| `dash tests run` | Run tests | `dash tests run` |
| `dash budget status` | Budget status | `dash budget status` |
| `dash reasoning trace <id>` | View traces | `dash reasoning trace agent-1` |
| `dash events list` | List events | `dash events list` |

## Architecture

Dash follows a modular architecture with clear separation of concerns:

- **CLI Layer** - Commander.js-based command interface
- **Core Modules** - Agent, task, quality, reasoning, safety, events, budget
- **Storage Layer** - In-memory with extensible storage backends
- **Event System** - Pub/sub for real-time coordination

## Contributing

Contributions are welcome. Please see [Contributing Guide](docs/CONTRIBUTING.md) for details.

## License

Dash is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Dash Contributors
