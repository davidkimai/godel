# Agent Pool Management

## Overview
This document defines the agent pool management strategy for maintaining maximum orchestration capacity during the beta phase.

## Configuration

```bash
# Target number of active agents
TARGET_COUNT=10

# Replenishment threshold - spawn new agents when count drops below this
REPLENISH_THRESHOLD=5
```

## Quick Commands

### Check Agent Status
```bash
node dist/index.js agents list
```

### Monitor Script
```bash
# Check and auto-replenish if needed
./scripts/monitor-agents.sh check

# Force replenish 10 agents
./scripts/monitor-agents.sh replenish

# Show detailed status
./scripts/monitor-agents.sh status
```

### Spawn Single Agent
```bash
node dist/index.js agents spawn "Task description" --label "agent-label"
```

### Kill an Agent
```bash
node dist/index.js agents kill <agent-id>
```

## Current Capacity Agents

The following agents are maintained for beta maximization:

| Agent ID | Label | Status | Purpose |
|----------|-------|--------|---------|
| (Dynamic) | capacity-agent-* | Active | Pool maintenance |

## Monitoring Strategy

### Automated Monitoring
- Run `monitor-agents.sh check` every 5 minutes during active sessions
- Replenishment triggers when active agent count < 5
- Logs all activity to `logs/agent-monitor.log`

### Manual Checks
```bash
# Quick count
cd /Users/jasontang/clawd/projects/dash
node dist/index.js agents list | grep -E "(idle|running|spawning)" | wc -l
```

## Troubleshooting

### Race Conditions
When spawning multiple agents in parallel, initialization race conditions may occur. Use sequential spawning with 2-second delays between agents.

### Authentication Failures
If agents fail with "Authentication failed" errors, check:
1. OpenClaw gateway is running
2. Gateway token is valid
3. Client ID/mode configuration is correct

## Pool Statistics

- **Total Agents Spawned:** 31 (as of 2026-02-02)
- **Target Active:** 10
- **Current Status:** EXCEEDED TARGET ✓

## Maintenance Log

| Date | Action | Count | Notes |
|------|--------|-------|-------|
| 2026-02-02 | Initial spawn | 31 | Beta maximization - exceeded 10 target |
