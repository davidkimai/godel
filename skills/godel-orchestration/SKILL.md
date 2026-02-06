# Godel Orchestration Skill

## Description

Spawn and manage agent swarms using Godel from within OpenClaw. This skill provides native OpenClaw commands for Godel orchestration, enabling seamless integration between the two platforms.

## Capabilities

- **Spawn** - Create and launch agent swarms for various tasks
- **Status** - Monitor agent and swarm progress in real-time
- **Kill** - Terminate agents gracefully or forcefully
- **Logs** - Stream logs from agents
- **List** - View all active Godel-managed agents

## Installation

```bash
# Copy skill to OpenClaw skills directory
cp -r skills/godel-orchestration /path/to/openclaw/skills/

# Configure environment variables
export GODEL_API_URL=http://localhost:7373
export GODEL_API_KEY=your_api_key_here
```

## Configuration

Add to your OpenClaw configuration:

```yaml
skills:
  - name: godel-orchestration
    path: /path/to/openclaw/skills/godel-orchestration
    config:
      godel_api_url: http://godel:7373
      godel_api_key: ${GODEL_API_KEY}
```

### Required Environment Variables

- `GODEL_API_URL` - URL of the Godel API (default: http://localhost:7373)
- `GODEL_API_KEY` - API key for Godel authentication

### Optional Environment Variables

- `OPENCLAW_GODEL_ADAPTER_ENABLED` - Enable the adapter (default: true)
- `OPENCLAW_EVENT_WEBHOOK_URL` - Webhook URL for event streaming
- `GODEL_DEFAULT_TIMEOUT` - Default agent timeout in ms (default: 300000)

## Usage

### Spawn a Swarm

Spawn a new agent swarm for a specific task:

```
/godel spawn code-review --files "src/**/*.ts"
```

Options:
- `--agents, -a` - Number of agents to spawn (default: 1)
- `--strategy, -s` - Swarm strategy: parallel, sequential, or pipeline (default: parallel)
- `--model, -m` - Model to use for agents
- `--timeout, -t` - Timeout in milliseconds (default: 300000)

### Check Status

Get the current status of an agent:

```
/godel status agent-abc123
```

### Kill an Agent

Terminate a running agent:

```
/godel kill agent-abc123 --force
```

Options:
- `--force, -f` - Force kill without graceful shutdown

### View Logs

Stream logs from an agent:

```
/godel logs agent-abc123 --follow --lines 100
```

Options:
- `--follow, -f` - Follow logs in real-time
- `--lines, -n` - Number of lines to show (default: 50)

### List Active Agents

Show all active Godel-managed agents:

```
/godel list
```

## Examples

### Code Review Swarm

Spawn 5 agents to review code in parallel:

```
/godel spawn code-review \
  --agents 5 \
  --strategy parallel \
  --files "src/**/*.ts" \
  --model claude-3-sonnet
```

### Security Audit

Run comprehensive security audit:

```
/godel spawn security-audit \
  --scope full \
  --tools dependency,static,secrets \
  --timeout 600000
```

### Refactoring Task

Spawn agents to refactor a codebase:

```
/godel spawn refactoring \
  --agents 3 \
  --strategy pipeline \
  --task "Migrate from callbacks to async/await" \
  --files "src/**/*.js"
```

### Testing Swarm

Run tests across multiple configurations:

```
/godel spawn testing \
  --agents 4 \
  --strategy parallel \
  --browsers chrome,firefox,safari,edge \
  --suites "tests/e2e/**/*.spec.ts"
```

## Events

The skill emits the following events:

- `godel.agent.spawned` - When an agent is spawned
- `godel.agent.status` - Status updates from agents
- `godel.agent.completed` - When an agent completes
- `godel.agent.failed` - When an agent fails
- `godel.agent.killed` - When an agent is killed

## Troubleshooting

### Connection Issues

If you see "Connection refused" errors:

1. Verify Godel is running: `curl http://localhost:7373/health`
2. Check `GODEL_API_URL` is correct
3. Verify network connectivity between OpenClaw and Godel

### Authentication Errors

If you see "Unauthorized" errors:

1. Verify `GODEL_API_KEY` is set correctly
2. Check the API key format (should start with `godel_`)
3. Ensure the key has not expired

### Agent Spawn Failures

If agents fail to spawn:

1. Check Godel logs: `docker-compose logs godel`
2. Verify sufficient resources (memory, CPU)
3. Check if the requested model is available
4. Review the task description for validity

### Event Streaming Issues

If events are not being received:

1. Verify `OPENCLAW_EVENT_WEBHOOK_URL` is configured
2. Check webhook endpoint is accessible
3. Review firewall rules
4. Check event filter configuration

## Advanced Usage

### Custom Swarm Configurations

Create custom swarm configurations in Godel:

```typescript
// swarm-config.ts
export default {
  name: 'custom-swarm',
  strategy: 'pipeline',
  stages: [
    { name: 'analyze', agents: 2 },
    { name: 'process', agents: 5 },
    { name: 'verify', agents: 1 },
  ],
};
```

### Event Filtering

Filter events to reduce noise:

```yaml
config:
  event_filter:
    - agent.spawned
    - agent.completed
    - agent.failed
```

### Webhook Authentication

Secure webhook endpoints:

```yaml
config:
  webhook_auth:
    type: bearer
    token: ${WEBHOOK_AUTH_TOKEN}
```

## API Reference

### Commands

| Command | Description | Arguments |
|---------|-------------|-----------|
| `spawn` | Spawn a new swarm | `type`, `--agents`, `--strategy`, `--model`, `--timeout` |
| `status` | Get agent status | `agentId` |
| `kill` | Kill an agent | `agentId`, `--force` |
| `logs` | Stream agent logs | `agentId`, `--follow`, `--lines` |
| `list` | List active agents | none |

### Response Format

All commands return JSON responses:

```json
{
  "success": true,
  "data": {
    "agentId": "agent-abc123",
    "status": "running",
    "progress": 45
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent agent-abc123 not found"
  }
}
```

## Contributing

To contribute to this skill:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - See LICENSE file for details
