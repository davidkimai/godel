# Dash CLI Command Reference

**Version:** v2.0  
**Last Updated:** 2026-02-02

Complete reference for all Dash CLI commands.

---

## Global Options

```bash
dash [options] [command]
```

| Option | Description |
|--------|-------------|
| `-v, --version` | Display version number |
| `-h, --help` | Display help for command |

---

## Command Overview

| Command | Description |
|---------|-------------|
| `swarm` | Manage agent swarms |
| `dashboard` | Launch the Dash TUI dashboard |
| `agents` | Manage AI agents |
| `openclaw` | Manage OpenClaw Gateway integration |
| `clawhub` | Manage skills from ClawHub registry |
| `events` | Stream and list events |
| `quality` | Code quality checks |
| `reasoning` | Analyze agent reasoning |
| `tasks` | Manage tasks |
| `context` | Manage context |
| `tests` | Run tests |
| `safety` | Safety commands |
| `self-improve` | Run self-improvement cycles |
| `budget` | Manage budget limits |
| `approve` | Approval workflow commands |
| `status` | Show system status |

---

## `swarm` - Manage Agent Swarms

### `swarm create`
Create a new swarm of agents.

```bash
dash swarm create --name <name> --task <task> [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | **(Required)** Swarm name | - |
| `-t, --task <task>` | **(Required)** Task description | - |
| `-i, --initial-agents <count>` | Initial number of agents | `5` |
| `-m, --max-agents <count>` | Maximum number of agents | `50` |
| `-s, --strategy <strategy>` | Strategy: `parallel`, `map-reduce`, `pipeline`, `tree` | `parallel` |
| `--model <model>` | Model to use | `kimi-k2.5` |
| `-b, --budget <amount>` | Budget limit (USD) | - |
| `--warning-threshold <percentage>` | Budget warning threshold (0-100) | `75` |
| `--critical-threshold <percentage>` | Budget critical threshold (0-100) | `90` |
| `--sandbox` | Enable file sandboxing | `true` |
| `--dry-run` | Show configuration without creating | - |

**Examples:**

```bash
# Create a basic swarm
dash swarm create --name "analysis-swarm" --task "Analyze user feedback"

# Create with custom settings
dash swarm create \
  --name "code-review" \
  --task "Review all TypeScript files" \
  --initial-agents 10 \
  --max-agents 100 \
  --strategy map-reduce \
  --budget 50.00

# Preview configuration
dash swarm create --name "test" --task "test task" --dry-run
```

---

### `swarm destroy`
Destroy a swarm and all its agents.

```bash
dash swarm destroy <swarm-id> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `swarm-id` | Swarm ID to destroy |

**Options:**

| Option | Description |
|--------|-------------|
| `-f, --force` | Force destroy without confirmation |
| `--yes` | Skip confirmation prompt |

**Examples:**

```bash
# Destroy with confirmation prompt
dash swarm destroy swarm-abc-123

# Force destroy
dash swarm destroy swarm-abc-123 --force --yes
```

---

### `swarm scale`
Scale a swarm to a target number of agents.

```bash
dash swarm scale <swarm-id> <target-size>
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `swarm-id` | Swarm ID to scale |
| `target-size` | Target number of agents |

**Examples:**

```bash
# Scale up to 20 agents
dash swarm scale swarm-abc-123 20

# Scale down to 3 agents
dash swarm scale swarm-abc-123 3
```

---

### `swarm status`
Get swarm status.

```bash
dash swarm status [swarm-id] [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `swarm-id` | Swarm ID (shows all if omitted) |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Output format: `table` or `json` | `table` |

**Examples:**

```bash
# Show all swarms
dash swarm status

# Show specific swarm
dash swarm status swarm-abc-123

# Output as JSON
dash swarm status swarm-abc-123 --format json
```

---

### `swarm list`
List all swarms.

```bash
dash swarm list [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-a, --active` | Show only active swarms |
| `-f, --format <format>` | Output format: `table` or `json` | `table` |

**Examples:**

```bash
# List all swarms
dash swarm list

# List only active swarms as JSON
dash swarm list --active --format json
```

---

## `agents` - Manage AI Agents

### `agents list`
List all agents.

```bash
dash agents list [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Output format: `table` or `json` | `table` |
| `-s, --swarm <swarmId>` | Filter by swarm ID | - |
| `--status <status>` | Filter by status: `pending`, `running`, `paused`, `completed`, `failed`, `killed` | - |

**Examples:**

```bash
# List all agents
dash agents list

# Filter by swarm
dash agents list --swarm swarm-abc-123

# Filter by status
dash agents list --status running

# Output as JSON
dash agents list --format json
```

---

### `agents spawn`
Spawn a new agent.

```bash
dash agents spawn <task> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `task` | Task description |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-m, --model <model>` | Model to use | `kimi-k2.5` |
| `-l, --label <label>` | Agent label | - |
| `-s, --swarm <swarmId>` | Add to existing swarm | - |
| `-p, --parent <parentId>` | Parent agent ID (for hierarchical spawning) | - |
| `-r, --retries <count>` | Max retry attempts | `3` |
| `-b, --budget <limit>` | Budget limit (USD) | - |
| `--dry-run` | Show configuration without spawning | - |

**Examples:**

```bash
# Spawn a simple agent
dash agents spawn "Review PR #123"

# Spawn with options
dash agents spawn "Analyze codebase" \
  --model claude-sonnet-4-5 \
  --label "code-analyzer" \
  --retries 5 \
  --budget 10.00

# Spawn into a swarm
dash agents spawn "Sub-task" --swarm swarm-abc-123

# Preview configuration
dash agents spawn "test task" --dry-run
```

---

### `agents pause`
Pause a running agent.

```bash
dash agents pause <agent-id>
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `agent-id` | Agent ID to pause |

**Example:**

```bash
dash agents pause agent-abc-123
```

---

### `agents resume`
Resume a paused agent.

```bash
dash agents resume <agent-id>
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `agent-id` | Agent ID to resume |

**Example:**

```bash
dash agents resume agent-abc-123
```

---

### `agents kill`
Kill an agent.

```bash
dash agents kill <agent-id> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `agent-id` | Agent ID to kill |

**Options:**

| Option | Description |
|--------|-------------|
| `-f, --force` | Force kill without confirmation |
| `--yes` | Skip confirmation prompt |

**Examples:**

```bash
# Kill with confirmation
dash agents kill agent-abc-123

# Force kill
dash agents kill agent-abc-123 --force --yes
```

---

### `agents status`
Get detailed agent status.

```bash
dash agents status <agent-id> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `agent-id` | Agent ID |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Output format: `table` or `json` | `table` |
| `--logs` | Include recent logs | - |

**Examples:**

```bash
# Get agent status
dash agents status agent-abc-123

# Get status with logs as JSON
dash agents status agent-abc-123 --logs --format json
```

---

### `agents retry`
Manually retry a failed agent.

```bash
dash agents retry <agent-id> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `agent-id` | Agent ID to retry |

**Options:**

| Option | Description |
|--------|-------------|
| `-m, --model <model>` | Use alternate model for retry |
| `--reset` | Reset retry count before retrying |

**Examples:**

```bash
# Retry with same model
dash agents retry agent-abc-123

# Retry with different model
dash agents retry agent-abc-123 --model gpt-4

# Reset retry count and retry
dash agents retry agent-abc-123 --reset
```

---

### `agents metrics`
Show agent lifecycle metrics.

```bash
dash agents metrics [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Output format: `table` or `json` | `table` |

**Example:**

```bash
dash agents metrics
dash agents metrics --format json
```

---

## `openclaw` - OpenClaw Gateway Integration

### `openclaw connect`
Connect to OpenClaw Gateway.

```bash
dash openclaw connect [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--host <host>` | Gateway host | `127.0.0.1` |
| `--port <port>` | Gateway port | `18789` |
| `--token <token>` | Authentication token (or set `OPENCLAW_GATEWAY_TOKEN`) | - |
| `--mock` | Use mock client for testing | - |

**Examples:**

```bash
# Connect to local gateway
dash openclaw connect

# Connect to remote gateway
dash openclaw connect --host 192.168.1.100 --port 18789

# Connect with token
dash openclaw connect --token your-token-here

# Connect in mock mode (testing)
dash openclaw connect --mock
```

---

### `openclaw status`
Check OpenClaw Gateway status.

```bash
dash openclaw status [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--mock` | Use mock client for testing |

**Example:**

```bash
dash openclaw status
```

---

### `openclaw sessions list`
List OpenClaw sessions.

```bash
dash openclaw sessions list [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--active` | Only show active sessions (last 60 min) |
| `--kind <kind>` | Filter by session kind: `main`, `group`, `thread` |
| `--mock` | Use mock client for testing |

**Examples:**

```bash
# List all sessions
dash openclaw sessions list

# List only active sessions
dash openclaw sessions list --active

# Filter by kind
dash openclaw sessions list --kind main
```

---

### `openclaw sessions history`
View session history/transcript.

```bash
dash openclaw sessions history <session-key> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `session-key` | Session key |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --limit <limit>` | Number of messages to show | `50` |
| `--mock` | Use mock client for testing | - |

**Example:**

```bash
dash openclaw sessions history session-abc-123 --limit 20
```

---

### `openclaw spawn`
Spawn an agent via OpenClaw.

```bash
dash openclaw spawn [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --task <task>` | **(Required)** Task description | - |
| `-m, --model <model>` | Model to use | `kimi-k2.5` |
| `-b, --budget <amount>` | Max budget (USD) | `1.00` |
| `--sandbox` | Enable sandbox | `true` |
| `--skills <skills>` | Additional skills (comma-separated) | - |
| `--system-prompt <prompt>` | System prompt override | - |
| `--mock` | Use mock client for testing | - |

**Examples:**

```bash
# Spawn a simple agent
dash openclaw spawn --task "Analyze this data"

# Spawn with skills
dash openclaw spawn \
  --task "Build a React component" \
  --skills "typescript,react" \
  --budget 5.00

# Spawn in mock mode
dash openclaw spawn --task "Test task" --mock
```

---

### `openclaw send`
Send a message to an OpenClaw agent.

```bash
dash openclaw send [options] <message>
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `message` | Message to send |

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --session <sessionKey>` | **(Required)** Session key |
| `-a, --attach <file>` | File attachment |
| `--mock` | Use mock client for testing |

**Examples:**

```bash
# Send a message
dash openclaw send --session session-abc-123 "Process this file"

# Send with attachment
dash openclaw send --session session-abc-123 --attach ./data.csv "Analyze this data"
```

---

### `openclaw kill`
Kill an OpenClaw session.

```bash
dash openclaw kill <session-key> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `session-key` | Session key to kill |

**Options:**

| Option | Description |
|--------|-------------|
| `-f, --force` | Force kill (immediate termination) |
| `--mock` | Use mock client for testing |

**Examples:**

```bash
# Kill a session
dash openclaw kill session-abc-123

# Force kill
dash openclaw kill session-abc-123 --force
```

---

## `clawhub` - ClawHub Registry

### `clawhub search`
Search for skills in ClawHub.

```bash
dash clawhub search [query] [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --limit <limit>` | Maximum results to show | `20` |
| `--sort <sort>` | Sort by: `relevance`, `downloads`, `stars`, `recent` | `relevance` |
| `--tag <tag>` | Filter by tag (can be used multiple times) | - |
| `--author <author>` | Filter by author | - |

**Examples:**

```bash
# Search for skills
dash clawhub search "typescript"

# Search with filters
dash clawhub search "web scraping" --tag cli --tag automation --sort downloads

# List top skills
dash clawhub search --limit 50 --sort stars
```

---

### `clawhub install`
Install a skill from ClawHub.

```bash
dash clawhub install <skill> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `skill` | Skill name/slug to install |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-v, --version <version>` | Specific version to install | latest |
| `-f, --force` | Force reinstall if already installed | `false` |
| `--no-deps` | Skip installing dependencies | - |
| `--target-dir <dir>` | Custom installation directory | - |

**Examples:**

```bash
# Install a skill
dash clawhub install typescript-linter

# Install specific version
dash clawhub install typescript-linter --version 1.2.3

# Force reinstall
dash clawhub install typescript-linter --force
```

---

### `clawhub list`
List installed skills.

```bash
dash clawhub list [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-a, --all` | Show all skills including inactive | `false` |
| `--json` | Output as JSON | - |

**Examples:**

```bash
# List active skills
dash clawhub list

# List all skills
dash clawhub list --all

# Output as JSON
dash clawhub list --json
```

---

### `clawhub uninstall`
Uninstall a skill.

```bash
dash clawhub uninstall <skill> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `skill` | Skill name/slug to uninstall |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-y, --yes` | Skip confirmation | `false` |

**Examples:**

```bash
# Uninstall with confirmation
dash clawhub uninstall typescript-linter

# Uninstall without confirmation
dash clawhub uninstall typescript-linter --yes
```

---

### `clawhub info`
Show detailed information about a skill.

```bash
dash clawhub info <skill> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `skill` | Skill name/slug |

**Options:**

| Option | Description |
|--------|-------------|
| `--readme` | Show full README content |

**Examples:**

```bash
# Show skill info
dash clawhub info typescript-linter

# Show with README
dash clawhub info typescript-linter --readme
```

---

### `clawhub update`
Update installed skills.

```bash
dash clawhub update [skill] [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--all` | Update all skills | `false` |

**Examples:**

```bash
# Update specific skill
dash clawhub update typescript-linter

# Update all skills
dash clawhub update --all
```

---

## `budget` - Budget Management

### `budget set`
Set budget limits.

```bash
dash budget set [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--task <tokens>` | Set per-task token limit |
| `--cost <dollars>` | **(Required)** Set budget cost limit in USD |
| `--daily <tokens>` | Set daily token limit |
| `--agent <id>` | Agent ID for agent-level budget |
| `--project <name>` | **(Required for daily)** Project name |
| `--reset-hour <hour>` | UTC hour for daily reset (0-23) | `0` |

**Examples:**

```bash
# Set project daily budget
dash budget set --project "my-project" --daily 100000 --cost 50.00

# Set task budget
dash budget set --task 10000 --cost 5.00 --agent agent-abc-123
```

---

### `budget status`
View current budget status.

```bash
dash budget status [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--agent <id>` | Filter by agent ID |
| `--project <name>` | Filter by project name |
| `--format <format>` | Output format: `table` or `json` | `table` |

**Examples:**

```bash
# Show all budgets
dash budget status

# Show agent budgets
dash budget status --agent agent-abc-123

# Show project budgets
dash budget status --project "my-project" --format json
```

---

### `budget usage`
View budget usage reports.

```bash
dash budget usage [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--project <name>` | **(Required)** Project name | - |
| `--period <period>` | Time period: `week`, `month` | `month` |
| `--since <duration>` | Since duration (e.g., "1h", "2d", "1w") | - |
| `--format <format>` | Output format: `table` or `json` | `table` |

**Examples:**

```bash
# View monthly usage
dash budget usage --project "my-project"

# View weekly usage with duration
dash budget usage --project "my-project" --period week --since 7d
```

---

### `budget alert`
Manage budget alerts.

#### `budget alert add`
Add a budget alert.

```bash
dash budget alert add [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--threshold <percent>` | **(Required)** Alert threshold percentage |
| `--webhook <url>` | Webhook URL for notifications |
| `--email <address>` | Email address for notifications |
| `--sms <number>` | SMS number for notifications |
| `--project <name>` | **(Required)** Project to add alert for |

**Examples:**

```bash
# Add webhook alert
dash budget alert add --project "my-project" --threshold 80 --webhook https://hooks.slack.com/...

# Add email alert
dash budget alert add --project "my-project" --threshold 90 --email admin@example.com
```

#### `budget alert list`
List configured alerts.

```bash
dash budget alert list [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--project <name>` | Filter by project |
| `--format <format>` | Output format: `table` or `json` | `table` |

**Example:**

```bash
dash budget alert list --project "my-project"
```

#### `budget alert remove`
Remove a budget alert.

```bash
dash budget alert remove <id> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `id` | Alert ID to remove |

**Options:**

| Option | Description |
|--------|-------------|
| `--project <name>` | **(Required)** Project the alert belongs to |

**Example:**

```bash
dash budget alert remove alert-abc-123 --project "my-project"
```

---

### `budget history`
View budget history.

```bash
dash budget history [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--project <name>` | **(Required)** Project name | - |
| `--since <duration>` | Since duration | `7d` |
| `--format <format>` | Output format: `table` or `json` | `table` |

**Example:**

```bash
dash budget history --project "my-project" --since 30d
```

---

### `budget report`
Generate budget reports.

```bash
dash budget report [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--project <name>` | **(Required)** Project to report on | - |
| `--period <period>` | Report period: `week`, `month` | `month` |
| `--format <format>` | Output format: `json` or `table` | `table` |

**Example:**

```bash
dash budget report --project "my-project" --period month
```

---

### `budget blocked`
Manage blocked agents.

#### `budget blocked list`
List blocked agents.

```bash
dash budget blocked list [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--format <format>` | Output format: `table` or `json` | `table` |

**Example:**

```bash
dash budget blocked list
```

#### `budget blocked unblock`
Unblock an agent.

```bash
dash budget blocked unblock <agent-id>
```

**Example:**

```bash
dash budget blocked unblock agent-abc-123
```

---

### `budget dashboard`
Show budget dashboard.

```bash
dash budget dashboard [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--project <name>` | Project to focus on |

**Example:**

```bash
dash budget dashboard --project "my-project"
```

---

## `quality` - Code Quality

### `quality lint`
Run linter.

```bash
dash quality lint [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--fix` | Automatically fix issues | `false` |
| `--strict` | Fail on warnings | `false` |

**Examples:**

```bash
dash quality lint
dash quality lint --fix
dash quality lint --strict
```

---

### `quality types`
Run TypeScript type checking.

```bash
dash quality types [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--strict` | Enable strict mode | `false` |

**Example:**

```bash
dash quality types --strict
```

---

### `quality security`
Run security audit.

```bash
dash quality security
```

---

### `quality gate`
Run all quality checks (lint + types + security).

```bash
dash quality gate [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--strict` | Fail on warnings | `false` |

**Example:**

```bash
dash quality gate --strict
```

---

### `quality status`
Show quality status summary.

```bash
dash quality status
```

---

## `reasoning` - Reasoning Analysis

### `reasoning trace`
Show reasoning traces.

```bash
dash reasoning trace <agent-id> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `agent-id` | Agent ID |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type <type>` | Filter by trace type | - |
| `-l, --limit <n>` | Limit results | `10` |

**Example:**

```bash
dash reasoning trace agent-abc-123 --limit 20
```

---

### `reasoning decisions`
Show decision log.

```bash
dash reasoning decisions <agent-id> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `agent-id` | Agent ID |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Output format | `table` |

**Example:**

```bash
dash reasoning decisions agent-abc-123
```

---

### `reasoning analyze`
Analyze reasoning patterns.

```bash
dash reasoning analyze <agent-id> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `agent-id` | Agent ID |

**Options:**

| Option | Description |
|--------|-------------|
| `--confidence` | Check confidence alignment |

**Example:**

```bash
dash reasoning analyze agent-abc-123 --confidence
```

---

### `reasoning summarize`
Summarize reasoning for a task.

```bash
dash reasoning summarize <task-id>
```

**Example:**

```bash
dash reasoning summarize task-abc-123
```

---

## `self-improve` - Self Improvement

### `self-improve run`
Run self-improvement cycle.

```bash
dash self-improve run [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--area <area>` | Specific area: `codeQuality`, `documentation`, `testing` | `all` |
| `--iterations <n>` | Number of iterations | `1` |

**Examples:**

```bash
# Run all improvements
dash self-improve run

# Focus on documentation
dash self-improve run --area documentation

# Multiple iterations
dash self-improve run --iterations 3
```

---

### `self-improve status`
Check self-improvement status.

```bash
dash self-improve status
```

---

### `self-improve report`
Generate self-improvement report.

```bash
dash self-improve report
```

---

## `status` - System Status

Show Dash system status and overview.

```bash
dash status [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Output format: `table` or `json` | `table` |

**Example:**

```bash
dash status
dash status --format json
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCLAW_GATEWAY_TOKEN` | Authentication token for OpenClaw Gateway |
| `DASH_API_KEY` | API key for Dash API server |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments / Not found |
| `3` | Command execution failed |
