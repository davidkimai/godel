# OpenClaw Integration Guide

**Version:** v2.0  
**Last Updated:** 2026-02-02

Complete guide for integrating Godel with OpenClaw Gateway.

---

## Overview

The OpenClaw integration allows Godel to:
- Spawn agents via the OpenClaw Gateway
- Manage OpenClaw sessions
- Send tasks to remote agents
- Monitor agent execution
- Integrate with ClawHub skill registry

---

## Prerequisites

1. **OpenClaw Gateway** running and accessible
2. **Authentication token** (optional but recommended)
3. **Godel CLI** installed

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

#### `godel openclaw connect`

Establish connection to OpenClaw Gateway.

```bash
# Connect to local gateway
godel openclaw connect

# Connect to remote gateway
godel openclaw connect --host 192.168.1.100 --port 18789

# Connect with authentication
godel openclaw connect --token your-token-here

# Use environment variable for token
export OPENCLAW_GATEWAY_TOKEN=your-token-here
godel openclaw connect
```

**Connection Persistence:**
- Connection state is persisted across CLI invocations
- Reconnect automatically restores previous session
- Use `godel openclaw status` to verify connection

---

### Checking Status

#### `godel openclaw status`

Verify gateway connection and view statistics.

```bash
godel openclaw status
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

#### `godel openclaw sessions list`

List all OpenClaw sessions.

```bash
# List all sessions
godel openclaw sessions list

# List only active sessions (last 60 min)
godel openclaw sessions list --active

# Filter by session kind
godel openclaw sessions list --kind main
godel openclaw sessions list --kind group
godel openclaw sessions list --kind thread
```

**Example Output:**
```
SESSIONS (3 total)

├── session-abc-123 (active, 2.5K tokens, 5m ago)
├── session-def-456 (idle, 0 tokens, 1h ago)
└── session-ghi-789 (active, 15K tokens, now)
```

---

#### `godel openclaw sessions history`

View session history and transcript.

```bash
# View full history
godel openclaw sessions history session-abc-123

# Limit number of messages
godel openclaw sessions history session-abc-123 --limit 20
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

#### `godel openclaw spawn`

Spawn an agent via OpenClaw Gateway.

```bash
# Basic spawn
godel openclaw spawn --task "Analyze this codebase"

# With model selection
godel openclaw spawn \
  --task "Write a React component" \
  --model gpt-4

# With budget limit
godel openclaw spawn \
  --task "Review PR" \
  --budget 5.00

# With additional skills
godel openclaw spawn \
  --task "Build API" \
  --skills "typescript,express,prisma"

# With custom system prompt
godel openclaw spawn \
  --task "Analyze sentiment" \
  --system-prompt "You are a sentiment analysis expert."

# Disable sandbox
godel openclaw spawn \
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

💡 Use "godel openclaw send --session session-abc-123 <message>" to send a task
```

---

### Sending Messages

#### `godel openclaw send`

Send a message/task to an OpenClaw agent.

```bash
# Send a simple message
godel openclaw send --session session-abc-123 "Process this data"

# Send with file attachment
godel openclaw send \
  --session session-abc-123 \
  --attach ./data.csv \
  "Analyze this CSV file"

# Send code for review
godel openclaw send \
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

#### `godel openclaw kill`

Terminate an OpenClaw session.

```bash
# Normal kill
godel openclaw kill session-abc-123

# Force kill (immediate termination)
godel openclaw kill session-abc-123 --force
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
godel openclaw connect --mock

# All commands support --mock flag
godel openclaw status --mock
godel openclaw spawn --task "test" --mock
godel openclaw sessions list --mock
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
godel openclaw connect

# 2. Spawn an agent
SESSION=$(godel openclaw spawn --task "Analyze logs" --format json | jq -r '.sessionKey')

# 3. Send data
godel openclaw send --session "$SESSION" --attach ./logs.txt "Find errors"

# 4. Monitor progress
godel openclaw sessions history "$SESSION" --limit 10

# 5. Clean up
godel openclaw kill "$SESSION"
```

---

### Pattern 2: Batch Processing

```bash
#!/bin/bash

# Connect
godel openclaw connect

# Process multiple files
for file in ./data/*.csv; do
  SESSION=$(godel openclaw spawn --task "Process CSV" --budget 2.00 --format json | jq -r '.sessionKey')
  godel openclaw send --session "$SESSION" --attach "$file" "Analyze this file"
  echo "Queued: $file -> $SESSION"
done

# Monitor all sessions
godel openclaw sessions list --active
```

---

### Pattern 3: CI/CD Integration

```yaml
# .github/workflows/godel.yml
- name: Run Godel Analysis
  env:
    OPENCLAW_GATEWAY_TOKEN: ${{ secrets.OPENCLAW_TOKEN }}
  run: |
    # Connect to gateway
    godel openclaw connect --host ${{ vars.OPENCLAW_HOST }}
    
    # Spawn code review agent
    SESSION=$(godel openclaw spawn \
      --task "Review PR code" \
      --model gpt-4 \
      --format json | jq -r '.sessionKey')
    
    # Send PR diff
    godel openclaw send --session "$SESSION" \
      --attach pr.diff \
      "Review this pull request"
    
    # Wait and get results (pseudo-code)
    sleep 60
    godel openclaw sessions history "$SESSION"
```

---

## ClawHub Skill Registry

### Searching for Skills

```bash
# Basic search
godel clawhub search "typescript"

# Advanced search
godel clawhub search "web scraping" \
  --tag cli \
  --tag automation \
  --sort downloads \
  --limit 20

# Search by author
godel clawhub search --author "openclaw-team"

# Sort options
godel clawhub search --sort relevance   # Default
godel clawhub search --sort downloads
godel clawhub search --sort stars
godel clawhub search --sort recent
```

---

### Installing Skills

```bash
# Install latest version
godel clawhub install typescript-linter

# Install specific version
godel clawhub install typescript-linter --version 1.2.3

# Force reinstall
godel clawhub install typescript-linter --force

# Skip dependencies
godel clawhub install typescript-linter --no-deps

# Custom directory
godel clawhub install typescript-linter --target-dir ./custom-skills
```

---

### Managing Skills

```bash
# List installed skills
godel clawhub list
godel clawhub list --all
godel clawhub list --json

# Show skill info
godel clawhub info typescript-linter
godel clawhub info typescript-linter --readme

# Update skills
godel clawhub update typescript-linter
godel clawhub update --all

# Uninstall
godel clawhub uninstall typescript-linter --yes
```

---

### Using Skills with OpenClaw

```bash
# Spawn agent with skills
godel openclaw spawn \
  --task "Analyze code" \
  --skills "typescript-linter,security-scanner"

# Multiple skills
godel openclaw spawn \
  --task "Full code review" \
  --skills "typescript-linter,eslint,prettier,jest-runner"
```

---

## Combining Godel and OpenClaw

### Using with Teams

```bash
# Create a team
godel team create \
  --name "distributed-analysis" \
  --task "Process large dataset" \
  --initial-agents 5

# Spawn OpenClaw agents into team
for i in {1..5}; do
  godel openclaw spawn \
    --task "Process partition $i" \
    --skills "data-processor"
done

# Monitor team
godel team status distributed-analysis
```

---

### Using with Budget System

```bash
# Set project budget
godel budget set \
  --project "openclaw-integration" \
  --daily 100000 \
  --cost 100.00

# Spawn with budget awareness
godel openclaw spawn \
  --task "Expensive analysis" \
  --budget 25.00

# Check usage
godel budget usage --project "openclaw-integration"
```

---

## Troubleshooting

### Connection Issues

```bash
# Check if gateway is running
godel openclaw status

# Test with mock mode
godel openclaw connect --mock
godel openclaw status --mock

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
godel openclaw sessions list

# Check specific session
godel openclaw sessions history session-abc-123

# Kill stuck sessions
godel openclaw kill session-abc-123 --force
```

---

### Skill Installation Issues

```bash
# Verify skill exists
godel clawhub search "skill-name"

# Check skill info
godel clawhub info skill-name

# Force reinstall
godel clawhub install skill-name --force

# Check installed skills
godel clawhub list --all
```

---

## Best Practices

### 1. Connection Management

```bash
# Connect once at start of session
godel openclaw connect

# Verify connection before operations
godel openclaw status || godel openclaw connect

# Use mock mode for testing
godel openclaw connect --mock
```

---

### 2. Session Lifecycle

```bash
# Always clean up sessions
godel openclaw kill session-abc-123

# Use budget limits
godel openclaw spawn --task "Task" --budget 5.00

# Monitor session history
godel openclaw sessions history session-abc-123 --limit 5
```

---

### 3. Error Handling

```bash
# Check command exit codes
if ! godel openclaw status; then
  godel openclaw connect
fi

# Use --format json for scripting
SESSION=$(godel openclaw spawn --task "test" --format json | jq -r '.sessionKey')
```

---

### 4. Security

```bash
# Use environment variables for tokens
export OPENCLAW_GATEWAY_TOKEN=your-token

# Never commit tokens to git
echo "OPENCLAW_GATEWAY_TOKEN" >> .gitignore

# Use sandbox mode for untrusted code
godel openclaw spawn --task "Analyze" --sandbox
```

---

## API Integration

### Direct API Usage

```bash
# Spawn via API
curl -X POST \
  -H "X-API-Key: godel-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Analyze code",
    "model": "kimi-k2.5",
    "skills": ["typescript-linter"]
  }' \
  http://localhost:7373/api/agents

# Create event
curl -X POST \
  -H "X-API-Key: godel-api-key" \
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
| `godel openclaw connect` | Connect to gateway |
| `godel openclaw status` | Check connection status |
| `godel openclaw sessions list` | List sessions |
| `godel openclaw sessions history` | View session transcript |
| `godel openclaw spawn` | Spawn agent |
| `godel openclaw send` | Send message to agent |
| `godel openclaw kill` | Kill session |
| `godel clawhub search` | Search for skills |
| `godel clawhub install` | Install skill |
| `godel clawhub list` | List installed skills |

### Common Workflows

```bash
# Quick start
godel openclaw connect
godel openclaw spawn --task "Hello world"

# Full workflow
godel openclaw connect
godel clawhub install useful-skill
godel openclaw spawn --task "Do work" --skills "useful-skill"
godel openclaw send --session session-xxx "Additional context"
godel openclaw kill session-xxx

# Batch processing
godel openclaw connect
for task in task1 task2 task3; do
  godel openclaw spawn --task "$task" --budget 1.00
done
godel openclaw sessions list --active
```
