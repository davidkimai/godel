# Dash v2.0 - Agent Orchestration Platform

<div align="center">

**Multi-agent orchestration for complex AI tasks**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT/)

A production-ready platform for orchestrating multiple AI agents to collaborate on complex tasks.

[Features](#features) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Contributing](#contributing)

</div>

---

## ✨ Features

- 🤖 **Agent Management** - Spawn, monitor, and terminate AI agents
- 🐝 **Swarm Orchestration** - Coordinate groups of agents working together
- 📊 **Real-time Monitoring** - WebSocket-based event streaming
- ⚡ **Workflow Engine** - Define and execute multi-step workflows
- 🔄 **Session Persistence** - SQLite-backed state management
- 📈 **Observability** - Built-in metrics, tracing, and logging

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/davidkimai/dash.git
cd dash

# Install dependencies
npm install

# Build the project
npm run build

# Start the CLI
./dist/src/index.js --help
```

### CLI Usage

```bash
# Check version
dash --version

# List running agents
dash agent list

# Spawn an agent
dash agent spawn "Analyze this codebase and find all TODO comments"

# Create a swarm
dash swarm create --name "research-team" --task "Research AI agents"

# Monitor system status
dash status
```

### Programmatic API

```typescript
import { createApp } from './dist/src/api/index.js';

const app = await createApp({ port: 7373 });

// Spawn an agent
const response = await fetch('http://localhost:7373/api/agents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'kimi-k2.5',
    task: 'Write a comprehensive report on renewable energy'
  })
});
```

## 📁 Project Structure

```
dash/
├── src/
│   ├── api/              # REST API routes
│   ├── cli/              # CLI commands
│   ├── core/             # Core orchestration logic
│   ├── storage/          # Database and persistence
│   ├── workflow/         # Workflow engine
│   └── ...
├── dist/                 # Compiled JavaScript
├── tests/                # Test suites
├── docs/                # Documentation
└── package.json
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run type checking
npm run typecheck

# Run tests
npm test

# Build for production
npm run build
```

## 📖 Documentation

- [API Documentation](docs/openapi.yaml) - OpenAPI specification
- [Architecture](docs/ARCHITECTURE.md) - System architecture
- [Error Codes](docs/error-codes.md) - Reference for error codes

## 🐳 Docker

```bash
# Build and run with Docker
docker build -t dash .
docker run -p 7373:7373 dash
```

## 📦 Publishing to npm

```bash
# Update version
npm version patch

# Build
npm run build

# Publish
npm publish --access public
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with TypeScript and Fastify
- Inspired by [OpenClaw](https://github.com/openclaw/openclaw)
- Uses [Kimi](https://moonshot.ai/) for agent intelligence
