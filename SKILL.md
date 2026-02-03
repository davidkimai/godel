---
name: dash-agent-skill
version: 2.0.0
description: Agent orchestration platform for AI-powered development. A skill for agents to launch swarms, manage autonomous operations, and coordinate multi-agent workflows.
homepage: https://github.com/davidkimai/dash
repository: https://github.com/davidkimai/dash
license: MIT
keywords: [agent, orchestration, swarm, autonomous, multi-agent]
agents:
  - openclaw
  - claude-code
  - kimi-agent
  - generic-agents
---

# Dash - Agent Orchestration Platform

**Skill for agents to:** Launch parallel swarms, manage autonomous operations, and coordinate multi-agent workflows.

## For Agents

Dash is infrastructure for agents to work together. As an agent, you can use Dash to:
- **Spawn parallel agents** for complex tasks
- **Run autonomous operations** while you handle other work
- **Coordinate workflows** across multiple agent instances
- **Track progress** with built-in monitoring

## Quick Start (For Agents)

```bash
# Navigate to Dash project
cd /Users/jasontang/clawd/projects/dash

# Launch orchestrator-managed swarm
./orchestrator.sh

# Or launch manual sprints
./sprint-launcher.sh

# Monitor running swarms
ps aux | grep "kimi -p"

# Check build status
npm run build

# View orchestrator state
cat .dash/orchestrator-state.json
```

## Swarm Protocol (v3)

### Launch Parallel Sprints

```bash
cd /Users/jasontang/clawd/projects/dash
./sprint-launcher.sh
```

This creates:
- Git worktrees: `.claude-worktrees/sprint-YYYYMMDD-HHMMSS/[name]/`
- Isolated agent processes (kimi CLI)
- Output logs for tracking

### Swarm Types

| Swarm | Purpose | Timebox |
|-------|---------|---------|
| code-refactor | Refactor error handling, add error types | 10 min |
| docs-update | Update documentation, README, guides | 10 min |
| test-add | Add unit tests for core modules | 10 min |
| research-piai | Research APIs, document findings | 10 min |
| opt-build | Analyze and optimize build process | 10 min |

### Monitor Swarms

```bash
# List active kimi processes
ps aux | grep "kimi -p"

# Check worktrees
git worktree list

# View output logs
cat .claude-worktrees/sprint-*/[swarm]/output.log
```

## Autonomous Operation

Dash supports extended autonomous operation with monitoring.

### Cron Jobs (Active)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `DASH_ORCHESTRATOR_V4` | Every 1 min | Run orchestrator |
| `DASH_BUILD_MONITOR` | Every 30 sec | Check build status |
| `DASH_SWARM_WATCHDOG` | Every 2 min | Ensure swarms active |
| `DASH_PROGRESS_REPORT` | Every 30 min | Generate reports |

### Health Checks

```bash
# Verify build (0 errors required)
npm run build

# Check test pass rate
npm test

# Verify orchestrator running
ps aux | grep orchestrator

# View system state
cat .dash/orchestrator-state.json
```

## State Management

### Orchestrator State

```bash
cat .dash/orchestrator-state.json
```

Contains:
- Active swarms
- Session budget
- Last run timestamp
- Error states

### Session Budget

```json
{
  "budget": {
    "total": 1.0,
    "used": 0.25,
    "per_sprint": 0.25
  }
}
```

## Agent Communication

### Talk to Dash Orchestrator

```bash
# Send command to orchestrator
node .dash/orchestrator-v3.js --command status

# Check health
node .dash/orchestrator-v3.js --health
```

### Receive Updates

Dash broadcasts updates via:
- Log files: `.dash/logs/*.log`
- State files: `.dash/orchestrator-state.json`
- Git commits on sprint completion

## Integration Points

### For OpenClaw Agents

```bash
# Add Dash to your skills
mkdir -p ~/.openclaw/skills/dash
cp /Users/jasontang/clawd/projects/dash/SKILL.md ~/.openclaw/skills/dash/

# Use Dash from your context
cd /Users/jasontang/clawd/projects/dash
./sprint-launcher.sh
```

### For Claude Code

```bash
# From Claude Code CLI
cd /Users/jasontang/clawd/projects/dash
kimi -p "Launch a swarm to refactor error handling"
```

### For Generic Agents

```bash
# Launch swarm with any CLI agent
cd /Users/jasontang/clawd/projects/dash/.claude-worktrees/sprint-YYYYMMDD-HHMMSS/[swarm]
[your-agent] -p "[task description]"
```

## Best Practices for Agents

### Swarm Launching
1. Always create isolated worktrees
2. Timebox sprints to 10 minutes
3. Verify build before committing
4. Log outputs for monitoring

### Autonomous Mode
1. Check build every 30 seconds
2. Restart failed processes
3. Generate progress reports
4. Stay within budget limits

### Error Handling
1. Check `.dash/orchestrator-state.json` for errors
2. Restart stalling swarms manually
3. Clean up failed worktrees: `git worktree prune`

## File References

| File | Purpose |
|------|---------|
| `SKILL.md` | This file - agent onboarding |
| `README.md` | Human-readable overview |
| `.dash/orchestrator-v3.js` | Main orchestrator |
| `.swarm/swarm-protocol-v3.md` | Swarm rules |
| `sprint-launcher.sh` | Swarm launcher script |
| `.dash/orchestrator-state.json` | Persistent state |

## Example: Launch Swarm from Agent

```bash
#!/bin/bash
# Agent script to launch Dash swarm

cd /Users/jasontang/clawd/projects/dash

# Create worktree
WORKTREE=".claude-worktrees/sprint-$(date +%Y%m%d-%H%M%S)"
git worktree add "$WORKTREE/code-refactor" origin/main

# Launch agent
cd "$WORKTREE/code-refactor"
nohup kimi -p "Refactor error handling in src/core/llm.ts" > output.log 2>&1 &

echo "Swarm launched: $WORKTREE"
echo "Monitor with: tail -f $WORKTREE/code-refactor/output.log"
```

## Troubleshooting

### Swarm Won't Start
```bash
# Check git status
git status

# Prune stale worktrees
git worktree prune

# Check for running processes
ps aux | grep "kimi -p"
```

### Build Fails
```bash
# Check TypeScript errors
npm run build 2>&1 | grep "error TS"

# View full output
npm run build
```

### Orchestrator Stuck
```bash
# Check state
cat .dash/orchestrator-state.json

# Restart orchestrator
pkill -f orchestrator
node .dash/orchestrator-v3.js &
```

## Learning Resources

| Topic | Resource |
|-------|----------|
| Swarm Protocol | `.swarm/swarm-protocol-v3.md` |
| Orchestration | `ORCHESTRATION_IDEAL.md` |
| Patterns | `PATTERN_ADAPTATION.md` |
| Context | `CONTEXT_OPTIMIZATION_IDEAL.md` |

---

**Skill Version**: 2.0.0  
**For Agents**: OpenClaw, Claude Code, Kimi, Generic Agents  
**Purpose**: Agent-first orchestration infrastructure
