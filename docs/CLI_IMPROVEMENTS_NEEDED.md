# CLI Improvements Needed

**Status:** Specification Document  
**Purpose:** Define complete CLI interface for Dash agent integration  
**Estimated Implementation:** 2 weeks

---

## Overview

Dash currently has **NO CLI INTERFACE**. This document specifies a complete `swarmctl` CLI for programmatic agent integration.

---

## Directory Structure

```
src/cli/
├── index.ts              # CLI entry point
├── commands/
│   ├── swarm.ts          # Swarm management
│   ├── agent.ts          # Agent management
│   ├── task.ts           # Task management
│   ├── events.ts         # Event streaming
│   ├── bus.ts            # Message bus
│   ├── metrics.ts        # Metrics and monitoring
│   └── config.ts         # Configuration
├── lib/
│   ├── client.ts         # API client
│   ├── output.ts         # Output formatting
│   └── errors.ts         # Error handling
└── types.ts              # CLI types
```

---

## Commands Specification

### Swarm Management

#### `swarmctl swarm list`
List all swarms.

```bash
swarmctl swarm list [options]

Options:
  --status <status>    Filter by status (active, paused, destroyed)
  --format <format>   Output format (table, json, jsonl) [default: table]
  --limit <n>         Maximum results [default: 50]
  --offset <n>        Offset for pagination
  --watch, -w         Watch for changes

Examples:
  swarmctl swarm list
  swarmctl swarm list --status active --format json
  swarmctl swarm list --watch

Exit Codes:
  0 - Success
  1 - API error
  2 - Invalid filter
```

#### `swarmctl swarm create`
Create a new swarm.

```bash
swarmctl swarm create [options]

Options:
  --name <name>       Swarm name (required)
  --count <n>         Initial agent count [default: 1]
  --strategy <type>   Scaling strategy [default: round-robin]
  --config <file>    Configuration file (JSON/YAML)
  --budget <amount>  Budget limit (e.g., "100 USD")
  --wait              Wait for swarm to be ready
  --timeout <s>      Timeout for --wait [default: 60]
  --format <format>  Output format (table, json)

Examples:
  swarmctl swarm create --name "security-audit" --count 10
  swarmctl swarm create --config swarm.yaml --wait
  swarmctl swarm create --name "test" --count 5 --budget "50 USD" --format json

Exit Codes:
  0 - Created successfully
  1 - API error
  3 - Budget exceeded
  4 - Timeout waiting for ready
```

#### `swarmctl swarm get`
Get swarm details.

```bash
swarmctl swarm get <id> [options]

Options:
  --format <format>  Output format (table, json, yaml)
  --watch, -w         Watch for changes

Examples:
  swarmctl swarm get swarm-abc123
  swarmctl swarm get swarm-abc123 --format json
  swarmctl swarm get swarm-abc123 --watch

Exit Codes:
  0 - Success
  1 - API error
  5 - Swarm not found
```

#### `swarmctl swarm scale`
Scale a swarm.

```bash
swarmctl swarm scale <id> --count <n> [options]

Options:
  --count <n>         Target agent count (required)
  --wait              Wait for scale to complete
  --timeout <s>      Timeout [default: 300]
  --format <format>  Output format

Examples:
  swarmctl swarm scale swarm-abc123 --count 20
  swarmctl swarm scale swarm-abc123 --count 50 --wait

Exit Codes:
  0 - Scaled successfully
  1 - API error
  5 - Swarm not found
  6 - Scale failed
```

#### `swarmctl swarm destroy`
Destroy a swarm.

```bash
swarmctl swarm destroy <id> [options]

Options:
  --force, -f         Force destroy (kill running agents)
  --wait              Wait for destruction
  --timeout <s>      Timeout [default: 60]
  --yes, -y           Skip confirmation

Examples:
  swarmctl swarm destroy swarm-abc123
  swarmctl swarm destroy swarm-abc123 --force --yes

Exit Codes:
  0 - Destroyed successfully
  1 - API error
  5 - Swarm not found
```

### Agent Management

#### `swarmctl agent list`
List agents.

```bash
swarmctl agent list [options]

Options:
  --swarm <id>       Filter by swarm
  --status <status>  Filter by status
  --format <format>  Output format
  --limit <n>
  --offset <n>
  --watch, -w

Examples:
  swarmctl agent list
  swarmctl agent list --swarm swarm-abc123 --status running
  swarmctl agent list --format jsonl
```

#### `swarmctl agent spawn`
Spawn an agent.

```bash
swarmctl agent spawn [options]

Options:
  --swarm <id>       Swarm ID (required)
  --config <file>    Agent configuration
  --wait              Wait for agent to be ready
  --format <format>  Output format

Examples:
  swarmctl agent spawn --swarm swarm-abc123
  swarmctl agent spawn --swarm swarm-abc123 --config agent.json
```

#### `swarmctl agent get`
Get agent details.

```bash
swarmctl agent get <id> [options]

Options:
  --format <format>  Output format
  --watch, -w

Examples:
  swarmctl agent get agent-xyz789
  swarmctl agent get agent-xyz789 --format json
```

#### `swarmctl agent kill`
Kill an agent.

```bash
swarmctl agent kill <id> [options]

Options:
  --force, -f         Force kill (immediate)
  --yes, -y           Skip confirmation

Examples:
  swarmctl agent kill agent-xyz789
  swarmctl agent kill agent-xyz789 --force --yes
```

#### `swarmctl agent logs`
Get agent logs.

```bash
swarmctl agent logs <id> [options]

Options:
  --follow, -f        Follow logs (tail -f)
  --lines <n>        Number of lines [default: 100]
  --since <time>     Show logs since (e.g., "1h", "2024-01-01")
  --level <level>   Filter by level (debug, info, warn, error)
  --search <text>   Search/filter text

Examples:
  swarmctl agent logs agent-xyz789
  swarmctl agent logs agent-xyz789 --follow
  swarmctl agent logs agent-xyz789 --lines 500 --level error
```

### Task Management

#### `swarmctl task create`
Create a task.

```bash
swarmctl task create [options]

Options:
  --type <type>      Task type (required)
  --payload <json>   Task payload (JSON)
  --payload-file <f> Read payload from file
  --swarm <id>       Assign to swarm
  --priority <n>     Priority [default: 0]
  --format <format>  Output format

Examples:
  swarmctl task create --type "code-review" --payload '{"file": "src/index.ts"}'
  swarmctl task create --type "test" --payload-file task.json --swarm swarm-abc123
```

#### `swarmctl task list`
List tasks.

```bash
swarmctl task list [options]

Options:
  --swarm <id>
  --status <status>
  --type <type>
  --format <format>
  --limit <n>
  --offset <n>

Examples:
  swarmctl task list
  swarmctl task list --swarm swarm-abc123 --status pending
```

#### `swarmctl task get`
Get task details.

```bash
swarmctl task get <id> [options]

Options:
  --format <format>

Examples:
  swarmctl task get task-123
```

### Event Streaming

#### `swarmctl events`
Stream events.

```bash
swarmctl events [options]

Options:
  --follow, -f        Follow events continuously
  --filter <expr>    Filter expression
  --types <types>     Event types (comma-separated)
  --swarm <id>       Filter by swarm
  --agent <id>       Filter by agent
  --since <time>     Start time
  --until <time>     End time
  --format <format>  Output format (json, jsonl)

Examples:
  swarmctl events --follow
  swarmctl events --types "agent:spawned,agent:completed" --follow
  swarmctl events --swarm swarm-abc123 --since "1h" --format jsonl
```

### Message Bus

#### `swarmctl bus publish`
Publish to message bus.

```bash
swarmctl bus publish <topic> <message> [options]

Options:
  --type <type>      Message type [default: event]

Examples:
  swarmctl bus publish "swarm:updates" '{"status": "active"}'
```

#### `swarmctl bus subscribe`
Subscribe to message bus.

```bash
swarmctl bus subscribe <topic> [options]

Options:
  --format <format>  Output format

Examples:
  swarmctl bus subscribe "swarm:updates"
```

### Monitoring

#### `swarmctl status`
Show system status.

```bash
swarmctl status [options]

Options:
  --format <format>  Output format

Examples:
  swarmctl status
  swarmctl status --format json
```

#### `swarmctl metrics`
Get metrics.

```bash
swarmctl metrics [options]

Options:
  --format <format>  Output format (prometheus, json)
  --metric <name>    Specific metric

Examples:
  swarmctl metrics
  swarmctl metrics --format json
  swarmctl metrics --metric "dash_agents_active"
```

#### `swarmctl health`
Check health.

```bash
swarmctl health [options]

Options:
  --detailed          Show detailed health
  --format <format>  Output format

Examples:
  swarmctl health
  swarmctl health --detailed --format json
```

### Configuration

#### `swarmctl config`
Manage configuration.

```bash
swarmctl config [command]

Commands:
  get <key>          Get configuration value
  set <key> <val>   Set configuration value
  list                List all configuration

Examples:
  swarmctl config get api.url
  swarmctl config set api.url http://localhost:7373
  swarmctl config list
```

---

## Output Formats

### Table Format (Default)
Human-readable table output.

```
ID                  NAME              STATUS    AGENTS    CREATED
swarm-abc123        security-audit    active    10/10     2h ago
swarm-def456        data-pipeline     active    5/5       1d ago
```

### JSON Format
Single JSON object or array.

```bash
swarmctl swarm list --format json
```

```json
{
  "swarms": [
    {
      "id": "swarm-abc123",
      "name": "security-audit",
      "status": "active",
      "agentCount": 10,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 1
}
```

### JSONL Format
One JSON object per line (for streaming).

```bash
swarmctl events --follow --format jsonl
```

```jsonl
{"type": "agent:spawned", "timestamp": "2024-01-15T10:00:01Z", "agentId": "agent-1"}
{"type": "agent:spawned", "timestamp": "2024-01-15T10:00:02Z", "agentId": "agent-2"}
```

### YAML Format
Human-readable YAML (for config/get commands).

```bash
swarmctl swarm get swarm-abc123 --format yaml
```

```yaml
id: swarm-abc123
name: security-audit
status: active
agents:
  total: 10
  running: 10
  failed: 0
config:
  strategy: round-robin
  budget:
    limit: 100
    currency: USD
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | API error / General failure |
| 2 | Invalid arguments |
| 3 | Budget exceeded |
| 4 | Timeout |
| 5 | Resource not found |
| 6 | Operation failed |
| 7 | Authentication failed |
| 8 | Permission denied |
| 9 | Resource already exists |
| 10 | Service unavailable |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DASH_API_URL` | API base URL | `http://localhost:7373` |
| `DASH_API_KEY` | API key for authentication | - |
| `DASH_CONFIG` | Path to config file | `~/.config/swarmctl/config.yaml` |
| `DASH_OUTPUT` | Default output format | `table` |
| `DASH_TIMEOUT` | Default timeout (seconds) | `30` |

---

## Implementation Phases

### Phase 1: Core Commands (1 week)
- `swarm list`, `swarm get`, `swarm create`, `swarm destroy`
- `agent list`, `agent get`, `agent spawn`, `agent kill`
- Basic JSON output support

### Phase 2: Full Swarm/Agent (1 week)
- `swarm scale`
- `agent logs`
- Watch/follow support
- All output formats

### Phase 3: Tasks & Events (1 week)
- `task create`, `task list`, `task get`
- `events` with filtering
- `bus publish`, `bus subscribe`

### Phase 4: Monitoring (1 week)
- `status`, `metrics`, `health`
- `config` commands
- Advanced formatting

### Phase 5: Polish (1 week)
- Shell completion (bash, zsh, fish)
- Man pages
- Interactive mode
- Aliases

**Total: 5 weeks for complete CLI**

---

## Example Workflows

### Create and Monitor Swarm
```bash
# Create swarm
SWARM_ID=$(swarmctl swarm create --name "test" --count 5 --format json | jq -r .id)

# Watch agents
swarmctl agent list --swarm $SWARM_ID --watch

# Scale up
swarmctl swarm scale $SWARM_ID --count 10

# Stream events
swarmctl events --swarm $SWARM_ID --follow

# Destroy when done
swarmctl swarm destroy $SWARM_ID --yes
```

### CI/CD Integration
```bash
# Create swarm for test run
swarmctl swarm create --name "ci-$BUILD_ID" --count 20 --format json > swarm.json
SWARM_ID=$(jq -r .id swarm.json)

# Run tests through agents
swarmctl task create --swarm $SWARM_ID --type "test" --payload-file tests.json

# Wait for completion
swarmctl events --swarm $SWARM_ID --types "task:completed" --follow | \
  jq -r 'select(.status == "failed") | .agentId'

# Cleanup
swarmctl swarm destroy $SWARM_ID --yes
```

### Debugging
```bash
# Check system health
swarmctl health --detailed

# Get metrics
swarmctl metrics --format json | jq '.agents.active'

# Stream errors
swarmctl events --types "agent:failed,task:failed" --follow --format jsonl

# Check specific agent logs
swarmctl agent logs agent-xyz789 --follow --level error
```
