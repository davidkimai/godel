# CLI Reference - swarmctl

`swarmctl` is the official command-line interface for the Godel Agent Orchestration Platform. It provides comprehensive management capabilities for teams, agents, tasks, events, and system configuration.

## Installation

```bash
# Global installation
npm install -g @jtan15010/godel

# Local usage with npx
npx @jtan15010/godel swarmctl --help
```

## Quick Start

```bash
# Create a team
swarmctl team create --name "my-team" --task "Implement user authentication" --count 5

# List all teams
swarmctl team list

# Check system status
swarmctl status

# Stream events in real-time
swarmctl events stream
```

## Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `-h, --help` | Show help | - |
| `-V, --version` | Show version | - |
| `--format <format>` | Output format (table, json, jsonl) | table |

## Commands

### Team Commands

Manage agent teams.

#### `swarmctl team list`

List all teams.

```bash
swarmctl team list [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json|jsonl)
- `-a, --active` - Show only active teams
- `--page <page>` - Page number (default: 1)
- `--page-size <size>` - Items per page (default: 50)

**Examples:**
```bash
swarmctl team list
swarmctl team list --format json
swarmctl team list --active
```

#### `swarmctl team create`

Create a new team of agents.

```bash
swarmctl team create [options]
```

**Options:**
- `-n, --name <name>` - Team name (required)
- `-t, --task <task>` - Task description (required)
- `-c, --count <count>` - Initial number of agents (default: 5)
- `--max <count>` - Maximum number of agents (default: 50)
- `-s, --strategy <strategy>` - Team strategy: parallel, map-reduce, pipeline, tree (default: parallel)
- `-m, --model <model>` - Model to use (default: kimi-k2.5)
- `-b, --budget <amount>` - Budget limit in USD
- `--warning-threshold <percentage>` - Budget warning threshold (default: 75)
- `--critical-threshold <percentage>` - Budget critical threshold (default: 90)
- `--sandbox` - Enable file sandboxing (default: true)
- `--dry-run` - Show configuration without creating

**Examples:**
```bash
swarmctl team create --name "api-team" --task "Build REST API"
swarmctl team create -n "code-review" -t "Review pull requests" -c 3 -s pipeline
swarmctl team create -n "test-team" -t "Run tests" --budget 100.00
```

#### `swarmctl team get`

Get detailed information about a team.

```bash
swarmctl team get <team-id> [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl team get team-abc123
swarmctl team get team-abc123 --format json
```

#### `swarmctl team scale`

Scale a team to a target number of agents.

```bash
swarmctl team scale <team-id> <target-size>
```

**Examples:**
```bash
swarmctl team scale team-abc123 10
swarmctl team scale team-abc123 0  # Scale down to zero
```

#### `swarmctl team destroy`

Destroy a team and all its agents.

```bash
swarmctl team destroy <team-id> [options]
```

**Options:**
- `-f, --force` - Force destroy without confirmation
- `--yes` - Skip confirmation prompt

**Examples:**
```bash
swarmctl team destroy team-abc123 --yes
swarmctl team destroy team-abc123 --force --yes
```

---

### Agent Commands

Manage individual AI agents.

#### `swarmctl agent list`

List all agents.

```bash
swarmctl agent list [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json|jsonl)
- `-s, --team <swarmId>` - Filter by team ID
- `--status <status>` - Filter by status
- `--page <page>` - Page number
- `--page-size <size>` - Items per page

**Examples:**
```bash
swarmctl agent list
swarmctl agent list --format json --team team-abc123
swarmctl agent list --status running
```

#### `swarmctl agent spawn`

Spawn a new agent.

```bash
swarmctl agent spawn <task> [options]
```

**Options:**
- `-m, --model <model>` - Model to use (default: kimi-k2.5)
- `-l, --label <label>` - Agent label
- `-s, --team <swarmId>` - Add to existing team
- `-p, --parent <parentId>` - Parent agent ID
- `-r, --retries <count>` - Max retry attempts (default: 3)
- `-b, --budget <limit>` - Budget limit in USD
- `--dry-run` - Show configuration without spawning

**Examples:**
```bash
swarmctl agent spawn "Implement login page"
swarmctl agent spawn "Fix bug #123" --label "bugfix-agent" --team team-abc123
```

#### `swarmctl agent get`

Get detailed information about an agent.

```bash
swarmctl agent get <agent-id> [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)
- `--logs` - Include recent logs

**Examples:**
```bash
swarmctl agent get agent-xyz789
swarmctl agent get agent-xyz789 --logs
```

#### `swarmctl agent kill`

Kill an agent.

```bash
swarmctl agent kill <agent-id> [options]
```

**Options:**
- `-f, --force` - Force kill without confirmation
- `--yes` - Skip confirmation prompt

**Examples:**
```bash
swarmctl agent kill agent-xyz789 --yes
```

#### `swarmctl agent logs`

Get agent logs.

```bash
swarmctl agent logs <agent-id> [options]
```

**Options:**
- `-f, --follow` - Follow log output (tail -f style)
- `-n, --lines <count>` - Number of lines to show (default: 50)

**Examples:**
```bash
swarmctl agent logs agent-xyz789
swarmctl agent logs agent-xyz789 --follow
swarmctl agent logs agent-xyz789 --lines 100
```

---

### Task Commands

Manage tasks.

#### `swarmctl task list`

List all tasks.

```bash
swarmctl task list [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json|jsonl)
- `-s, --status <status>` - Filter by status
- `-a, --assignee <agent-id>` - Filter by assignee
- `--page <page>` - Page number
- `--page-size <size>` - Items per page

**Examples:**
```bash
swarmctl task list
swarmctl task list --status pending --assignee agent-xyz789
```

#### `swarmctl task create`

Create a new task.

```bash
swarmctl task create [options]
```

**Options:**
- `-t, --title <title>` - Task title (required)
- `-d, --description <description>` - Task description (required)
- `-p, --priority <priority>` - Priority: low, medium, high, critical (default: medium)
- `-a, --assignee <agent-id>` - Assignee agent ID
- `--depends-on <ids>` - Comma-separated list of task IDs
- `--dry-run` - Show configuration without creating

**Examples:**
```bash
swarmctl task create --title "Implement auth" --description "Add JWT authentication"
swarmctl task create -t "Fix bug" -d "Fix login issue" -p high --assignee agent-xyz789
```

#### `swarmctl task get`

Get task details.

```bash
swarmctl task get <task-id> [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl task get task-abc123
```

#### `swarmctl task assign`

Assign a task to an agent.

```bash
swarmctl task assign <task-id> <agent-id>
```

**Examples:**
```bash
swarmctl task assign task-abc123 agent-xyz789
```

#### `swarmctl task complete`

Mark a task as complete.

```bash
swarmctl task complete <task-id>
```

**Examples:**
```bash
swarmctl task complete task-abc123
```

#### `swarmctl task cancel`

Cancel a task.

```bash
swarmctl task cancel <task-id> [options]
```

**Options:**
- `--yes` - Skip confirmation prompt

**Examples:**
```bash
swarmctl task cancel task-abc123 --yes
```

---

### Events Commands

Event streaming and management.

#### `swarmctl events list`

List historical events.

```bash
swarmctl events list [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json|jsonl)
- `-a, --agent <agent-id>` - Filter by agent ID
- `-t, --task <task-id>` - Filter by task ID
- `--type <type>` - Filter by event type
- `--since <duration>` - Time window (e.g., 1h, 1d, 30m)
- `--until <iso-date>` - End time (ISO format)
- `-l, --limit <n>` - Maximum events to show (default: 50)

**Examples:**
```bash
swarmctl events list
swarmctl events list --since 1h --limit 100
swarmctl events list --agent agent-xyz789 --format json
```

#### `swarmctl events stream`

Stream events in real-time.

```bash
swarmctl events stream [options]
```

**Options:**
- `-a, --agent <agent-id>` - Filter by agent ID
- `-t, --task <task-id>` - Filter by task ID
- `--type <type>` - Filter by event type
- `--severity <level>` - Filter by severity (default: info)
- `--raw` - Output raw JSON

**Examples:**
```bash
swarmctl events stream
swarmctl events stream --agent agent-xyz789 --follow
swarmctl events stream --type agent.spawned
```

#### `swarmctl events get`

Get event details.

```bash
swarmctl events get <event-id>
```

**Examples:**
```bash
swarmctl events get event-abc123
```

---

### Bus Commands

Message bus operations.

#### `swarmctl bus publish`

Publish a message to a topic.

```bash
swarmctl bus publish <topic> [options]
```

**Options:**
- `-m, --message <message>` - Message payload (JSON string, required)
- `--priority <level>` - Message priority: low, medium, high, critical (default: medium)
- `--source <source>` - Message source identifier

**Examples:**
```bash
swarmctl bus publish agent.123.commands --message '{"action":"pause"}'
swarmctl bus publish system.alerts --message '{"severity":"critical","message":"Disk full"}' --priority critical
```

#### `swarmctl bus subscribe`

Subscribe to a topic and print messages.

```bash
swarmctl bus subscribe <topic> [options]
```

**Options:**
- `-f, --follow` - Keep listening for new messages
- `--raw` - Output raw JSON

**Examples:**
```bash
swarmctl bus subscribe agent.*.events --follow
swarmctl bus subscribe team.abc123.broadcast --follow
```

#### `swarmctl bus topics`

List active topics.

```bash
swarmctl bus topics [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl bus topics
```

#### `swarmctl bus status`

Show message bus status.

```bash
swarmctl bus status [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl bus status
```

---

### Metrics Commands

System metrics and monitoring.

#### `swarmctl metrics show`

Show system metrics.

```bash
swarmctl metrics show [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl metrics show
swarmctl metrics show --format json
```

#### `swarmctl metrics agents`

Show agent metrics.

```bash
swarmctl metrics agents [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl metrics agents
```

#### `swarmctl metrics teams`

Show team metrics.

```bash
swarmctl metrics teams [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl metrics teams
```

---

### System Commands

#### `swarmctl status`

Show overall system status.

```bash
swarmctl status [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl status
swarmctl status --format json
```

#### `swarmctl health`

Health check.

```bash
swarmctl health [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)
- `--exit-code` - Exit with non-zero code if unhealthy

**Examples:**
```bash
swarmctl health
swarmctl health --exit-code && echo "System is healthy"
```

---

### Config Commands

Configuration management.

#### `swarmctl config show`

Show current configuration.

```bash
swarmctl config show [options]
```

**Options:**
- `-f, --format <format>` - Output format (table|json)

**Examples:**
```bash
swarmctl config show
```

#### `swarmctl config set`

Set a configuration value.

```bash
swarmctl config set <key> <value>
```

**Examples:**
```bash
swarmctl config set logLevel debug
swarmctl config set maxAgents 100
```

---

### Completion Command

Generate shell completion scripts.

#### `swarmctl completion`

Generate shell completion script.

```bash
swarmctl completion <shell>
```

**Arguments:**
- `shell` - Shell type: bash or zsh

**Examples:**
```bash
# Bash
source <(swarmctl completion bash)

# Add to ~/.bashrc for permanent use
echo 'source <(swarmctl completion bash)' >> ~/.bashrc

# Zsh
source <(swarmctl completion zsh)

# Install system-wide (macOS)
swarmctl completion zsh > /usr/local/share/zsh/site-functions/_swarmctl
```

---

## Output Formats

### Table Format (Default)

Human-readable tabular output.

```
ID                   NAME                STATUS   AGENTS  PROGRESS
───────────────────  ──────────────────  ───────  ──────  ────────
team-abc123...      api-team           active       5      0.60
team-def456...      code-review         active       3      0.25
```

### JSON Format

Pretty-printed JSON for programmatic use.

```bash
swarmctl team list --format json
```

```json
[
  {
    "id": "team-abc123...",
    "name": "api-team",
    "status": "active",
    "agentCount": 5,
    "progress": 0.6
  }
]
```

### JSONL Format

JSON Lines format, one JSON object per line.

```bash
swarmctl team list --format jsonl
```

```json
{"id":"team-abc123...","name":"api-team","status":"active","agentCount":5}
{"id":"team-def456...","name":"code-review","status":"active","agentCount":3}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GODEL_DB_PATH` | Path to SQLite database (default: ./.godel/godel.db) |
| `GODEL_LOG_LEVEL` | Log level: debug, info, warn, error (default: info) |
| `GODEL_API_URL` | API URL for HTTP mode (optional) |

---

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Not found |
| 3 | Operation failed |

---

## Tips and Tricks

### Watch Mode

Combine with `watch` for live monitoring:

```bash
# Watch team status
watch -n 5 swarmctl team get team-abc123

# Watch metrics
watch -n 10 swarmctl metrics show
```

### JSON Processing

Use with `jq` for powerful queries:

```bash
# Get only team names
swarmctl team list --format json | jq '.[].name'

# Filter active agents
swarmctl agent list --format json | jq '.[] | select(.status == "running")'
```

### Automation

Use in scripts with `--yes` and exit codes:

```bash
#!/bin/bash
if ! swarmctl health --exit-code; then
  echo "System is unhealthy, triggering alert..."
  # Send alert
fi
```

---

## Troubleshooting

### Command not found

Ensure `swarmctl` is in your PATH:

```bash
npm install -g @jtan15010/godel
which swarmctl
```

### Permission denied

If you get permission errors, try:

```bash
# Use npx
npx @jtan15010/godel swarmctl --help

# Or fix permissions
chmod +x $(which swarmctl)
```

### Database errors

If you see database-related errors, check:

1. Write permissions in the current directory
2. Disk space available
3. Whether another process has the database locked

---

## See Also

- [Godel Documentation](./README.md)
- [API Reference](./API_REFERENCE.md)
- [Configuration Guide](./CONFIGURATION.md)
