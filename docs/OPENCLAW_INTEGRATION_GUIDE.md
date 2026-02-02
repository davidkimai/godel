# OpenClaw Integration Guide

**Version:** v2.0  
**Last Updated:** 2026-02-02

Complete guide for integrating Dash with OpenClaw Gateway.

---

## Overview

The OpenClaw integration allows Dash to:
- Spawn agents via the OpenClaw Gateway
- Manage OpenClaw sessions
- Send tasks to remote agents
- Monitor agent execution
- Integrate with ClawHub skill registry

---

## Prerequisites

1. **OpenClaw Gateway** running and accessible
2. **Authentication token** (optional but recommended)
3. **Dash CLI** installed

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_GATEWAY_TOKEN` | Authentication token | - |

### Default Connection Settings

| Setting | Value |
|---------|-------|
| Host | `127.0.0.1` |
| Port | `18789` |
| Protocol | WebSocket (`ws://`) |

---

## CLI Commands

### Connecting to OpenClaw

#### `dash openclaw connect`

Establish connection to OpenClaw Gateway.

```bash
# Connect to local gateway
dash openclaw connect

# Connect to remote gateway
dash openclaw connect --host 192.168.1.100 --port 18789

# Connect with authentication
dash openclaw connect --token your-token-here

# Use environment variable for token
export OPENCLAW_GATEWAY_TOKEN=your-token-here
dash openclaw connect
```

**Connection Persistence:**
- Connection state is persisted across CLI invocations
- Reconnect automatically restores previous session
- Use `dash openclaw status` to verify connection

---

### Checking Status

#### `dash openclaw status`

Verify gateway connection and view statistics.

```bash
dash openclaw status
```

**Example Output:**
```
🔌 OpenClaw Gateway Status

✓ Connected: connected
  Connection State: connected
  Connected At: 2026-02-02T10:00:00Z
  Requests Sent: 15
  Responses Received: 15
  Events Received: 42
  Reconnections: 0
  Last Ping: 2026-02-02T10:05:00Z
```

---

### Managing Sessions

#### `dash openclaw sessions list`

List all OpenClaw sessions.

```bash
# List all sessions
dash openclaw sessions list

# List only active sessions (last 60 min)
dash openclaw sessions list --active

# Filter by session kind
dash openclaw sessions list --kind main
dash openclaw sessions list --kind group
dash openclaw sessions list --kind thread
```

**Example Output:**
```
SESSIONS (3 total)

├── session-abc-123 (active, 2.5K tokens, 5m ago)
├── session-def-456 (idle, 0 tokens, 1h ago)
└── session-ghi-789 (active, 15K tokens, now)
```

---

#### `dash openclaw sessions history`

View session history and transcript.

```bash
# View full history
dash openclaw sessions history session-abc-123

# Limit number of messages
dash openclaw sessions history session-abc-123 --limit 20
```

**Example Output:**
```
📜 Session History: session-abc-123

👤 [10:00:00] Please analyze this code...
🤖 [10:00:05] I'll analyze the code for you...
🤖 [10:00:10] Here are my findings: ...
```

---

### Spawning Agents

#### `dash openclaw spawn`

Spawn an agent via OpenClaw Gateway.

```bash
# Basic spawn
dash openclaw spawn --task "Analyze this codebase"

# With model selection
dash openclaw spawn \
  --task "Write a React component" \
  --model gpt-4

# With budget limit
dash openclaw spawn \
  --task "Review PR" \
  --budget 5.00

# With additional skills
dash openclaw spawn \
  --task "Build API" \
  --skills "typescript,express,prisma"

# With custom system prompt
dash openclaw spawn \
  --task "Analyze sentiment" \
  --system-prompt "You are a sentiment analysis expert."

# Disable sandbox
dash openclaw spawn \
  --task "System task" \
  --no-sandbox
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --task` | Task description (required) | - |
| `-m, --model` | Model to use | `kimi-k2.5` |
| `-b, --budget` | Max budget in USD | `1.00` |
| `--sandbox` | Enable sandbox mode | `true` |
| `--skills` | Comma-separated skill list | - |
| `--system-prompt` | Custom system prompt | - |

**Example Output:**
```
🚀 Spawning agent via OpenClaw...

✓ Spawned agent: sessionKey=session-abc-123
✓ Model: kimi-k2.5
✓ Budget: $1.00
✓ Status: idle (awaiting task)

💡 Use "dash openclaw send --session session-abc-123 <message>" to send a task
```

---

### Sending Messages

#### `dash openclaw send`

Send a message/task to an OpenClaw agent.

```bash
# Send a simple message
dash openclaw send --session session-abc-123 "Process this data"

# Send with file attachment
dash openclaw send \
  --session session-abc-123 \
  --attach ./data.csv \
  "Analyze this CSV file"

# Send code for review
dash openclaw send \
  --session session-abc-123 \
  --attach ./src/app.ts \
  "Review this TypeScript code"
```

**Example Output:**
```
📤 Sending message to agent...

✓ Message sent to session-abc-123
✓ RunId: run-xyz-789
✓ Status: processing
```

---

### Killing Sessions

#### `dash openclaw kill`

Terminate an OpenClaw session.

```bash
# Normal kill
dash openclaw kill session-abc-123

# Force kill (immediate termination)
dash openclaw kill session-abc-123 --force
```

**Example Output:**
```
💀 Killing session session-abc-123...

✓ Session session-abc-123 killed
```

---

## Mock Mode

Mock mode allows testing OpenClaw integration without a real gateway.

### Using Mock Mode

```bash
# Connect in mock mode
dash openclaw connect --mock

# All commands support --mock flag
dash openclaw status --mock
dash openclaw spawn --task "test" --mock
dash openclaw sessions list --mock
```

**Mock Mode Features:**
- Simulates gateway responses
- Persists mock sessions
- No network required
- Perfect for CI/CD testing

---

## Integration Patterns

### Pattern 1: Spawn and Monitor

```bash
# 1. Connect to gateway
dash openclaw connect

# 2. Spawn an agent
SESSION=$(dash openclaw spawn --task "Analyze logs" --format json | jq -r '.sessionKey')

# 3. Send data
dash openclaw send --session "$SESSION" --attach ./logs.txt "Find errors"

# 4. Monitor progress
dash openclaw sessions history "$SESSION" --limit 10

# 5. Clean up
dash openclaw kill "$SESSION"
```

---

### Pattern 2: Batch Processing

```bash
#!/bin/bash

# Connect
dash openclaw connect

# Process multiple files
for file in ./data/*.csv; do
  SESSION=$(dash openclaw spawn --task "Process CSV" --budget 2.00 --format json | jq -r '.sessionKey')
  dash openclaw send --session "$SESSION" --attach "$file" "Analyze this file"
  echo "Queued: $file -> $SESSION"
done

# Monitor all sessions
dash openclaw sessions list --active
```

---

### Pattern 3: CI/CD Integration

```yaml
# .github/workflows/dash.yml
- name: Run Dash Analysis
  env:
    OPENCLAW_GATEWAY_TOKEN: ${{ secrets.OPENCLAW_TOKEN }}
  run: |
    # Connect to gateway
    dash openclaw connect --host ${{ vars.OPENCLAW_HOST }}
    
    # Spawn code review agent
    SESSION=$(dash openclaw spawn \
      --task "Review PR code" \
      --model gpt-4 \
      --format json | jq -r '.sessionKey')
    
    # Send PR diff
    dash openclaw send --session "$SESSION" \
      --attach pr.diff \
      "Review this pull request"
    
    # Wait and get results (pseudo-code)
    sleep 60
    dash openclaw sessions history "$SESSION"
```

---

## ClawHub Skill Registry

### Searching for Skills

```bash
# Basic search
dash clawhub search "typescript"

# Advanced search
dash clawhub search "web scraping" \
  --tag cli \
  --tag automation \
  --sort downloads \
  --limit 20

# Search by author
dash clawhub search --author "openclaw-team"

# Sort options
dash clawhub search --sort relevance   # Default
dash clawhub search --sort downloads
dash clawhub search --sort stars
dash clawhub search --sort recent
```

---

### Installing Skills

```bash
# Install latest version
dash clawhub install typescript-linter

# Install specific version
dash clawhub install typescript-linter --version 1.2.3

# Force reinstall
dash clawhub install typescript-linter --force

# Skip dependencies
dash clawhub install typescript-linter --no-deps

# Custom directory
dash clawhub install typescript-linter --target-dir ./custom-skills
```

---

### Managing Skills

```bash
# List installed skills
dash clawhub list
dash clawhub list --all
dash clawhub list --json

# Show skill info
dash clawhub info typescript-linter
dash clawhub info typescript-linter --readme

# Update skills
dash clawhub update typescript-linter
dash clawhub update --all

# Uninstall
dash clawhub uninstall typescript-linter --yes
```

---

### Using Skills with OpenClaw

```bash
# Spawn agent with skills
dash openclaw spawn \
  --task "Analyze code" \
  --skills "typescript-linter,security-scanner"

# Multiple skills
dash openclaw spawn \
  --task "Full code review" \
  --skills "typescript-linter,eslint,prettier,jest-runner"
```

---

## Combining Dash and OpenClaw

### Using with Swarms

```bash
# Create a swarm
dash swarm create \
  --name "distributed-analysis" \
  --task "Process large dataset" \
  --initial-agents 5

# Spawn OpenClaw agents into swarm
for i in {1..5}; do
  dash openclaw spawn \
    --task "Process partition $i" \
    --skills "data-processor"
done

# Monitor swarm
dash swarm status distributed-analysis
```

---

### Using with Budget System

```bash
# Set project budget
dash budget set \
  --project "openclaw-integration" \
  --daily 100000 \
  --cost 100.00

# Spawn with budget awareness
dash openclaw spawn \
  --task "Expensive analysis" \
  --budget 25.00

# Check usage
dash budget usage --project "openclaw-integration"
```

---

## Troubleshooting

### Connection Issues

```bash
# Check if gateway is running
dash openclaw status

# Test with mock mode
dash openclaw connect --mock
dash openclaw status --mock

# Verify network connectivity
nc -zv 127.0.0.1 18789
```

**Common Solutions:**
1. Verify gateway is running
2. Check host and port configuration
3. Validate authentication token
4. Check firewall settings
5. Use `--mock` flag for testing

---

### Session Issues

```bash
# List all sessions
dash openclaw sessions list

# Check specific session
dash openclaw sessions history session-abc-123

# Kill stuck sessions
dash openclaw kill session-abc-123 --force
```

---

### Skill Installation Issues

```bash
# Verify skill exists
dash clawhub search "skill-name"

# Check skill info
dash clawhub info skill-name

# Force reinstall
dash clawhub install skill-name --force

# Check installed skills
dash clawhub list --all
```

---

## Best Practices

### 1. Connection Management

```bash
# Connect once at start of session
dash openclaw connect

# Verify connection before operations
dash openclaw status || dash openclaw connect

# Use mock mode for testing
dash openclaw connect --mock
```

---

### 2. Session Lifecycle

```bash
# Always clean up sessions
dash openclaw kill session-abc-123

# Use budget limits
dash openclaw spawn --task "Task" --budget 5.00

# Monitor session history
dash openclaw sessions history session-abc-123 --limit 5
```

---

### 3. Error Handling

```bash
# Check command exit codes
if ! dash openclaw status; then
  dash openclaw connect
fi

# Use --format json for scripting
SESSION=$(dash openclaw spawn --task "test" --format json | jq -r '.sessionKey')
```

---

### 4. Security

```bash
# Use environment variables for tokens
export OPENCLAW_GATEWAY_TOKEN=your-token

# Never commit tokens to git
echo "OPENCLAW_GATEWAY_TOKEN" >> .gitignore

# Use sandbox mode for untrusted code
dash openclaw spawn --task "Analyze" --sandbox
```

---

## API Integration

### Direct API Usage

```bash
# Spawn via API
curl -X POST \
  -H "X-API-Key: dash-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Analyze code",
    "model": "kimi-k2.5",
    "skills": ["typescript-linter"]
  }' \
  http://localhost:7373/api/agents

# Create event
curl -X POST \
  -H "X-API-Key: dash-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "openclaw.spawn",
    "payload": {"task": "Analyze"}
  }' \
  http://localhost:7373/api/events
```

---

## Quick Reference

### Command Summary

| Command | Purpose |
|---------|---------|
| `dash openclaw connect` | Connect to gateway |
| `dash openclaw status` | Check connection status |
| `dash openclaw sessions list` | List sessions |
| `dash openclaw sessions history` | View session transcript |
| `dash openclaw spawn` | Spawn agent |
| `dash openclaw send` | Send message to agent |
| `dash openclaw kill` | Kill session |
| `dash clawhub search` | Search for skills |
| `dash clawhub install` | Install skill |
| `dash clawhub list` | List installed skills |

### Common Workflows

```bash
# Quick start
dash openclaw connect
dash openclaw spawn --task "Hello world"

# Full workflow
dash openclaw connect
dash clawhub install useful-skill
dash openclaw spawn --task "Do work" --skills "useful-skill"
dash openclaw send --session session-xxx "Additional context"
dash openclaw kill session-xxx

# Batch processing
dash openclaw connect
for task in task1 task2 task3; do
  dash openclaw spawn --task "$task" --budget 1.00
done
dash openclaw sessions list --active
```
