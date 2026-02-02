# Dash Scripts

This directory contains utility scripts for Dash self-improvement and orchestration.

## dash-claude-code.sh

**Purpose:** Integrate Claude Code CLI directly with Dash for parallel workstreams.

### Usage

```bash
# Run quick tasks
./scripts/dash-claude-code.sh quick "Fix the failing CI tests"

# Create worktree and run Claude
./scripts/dash-claude-code.sh worktree quality quality-fix "Fix all lint errors"

# Run parallel workstreams
./scripts/dash-claude-code.sh parallel \
  "Fix lint errors in src/cli" \
  "Add tests for testing module" \
  "Update documentation" \
  "Refactor context module"

# Self-improvement cycle
./scripts/dash-claude-code.sh self-improve
```

---

## dash-self-improve.sh

**Purpose:** Orchestrate recursive self-improvement using Claude Code agents. Creates parallel workstreams, runs quality gates, and feeds results back.

### Usage

```bash
# Full self-improvement cycle
./scripts/dash-self-improve.sh self-improve

# Quick improvement task
./scripts/dash-self-improve.sh quick "Fix all lint errors"

# Parallel swarm of agents
./scripts/dash-self-improve.sh swarm \
  "Fix lint errors in src/cli" \
  "Add tests for untested modules" \
  "Update CHANGELOG.md" \
  "Refactor context module"

# Analyze improvement trends
./scripts/dash-self-improve.sh analyze

# Check current quality status
./scripts/dash-self-improve.sh status
```

### Phases

1. **Quality Assessment** - Run lint, typecheck, tests
2. **Spawn Claude Code Agents** - Create parallel workstreams
3. **Verification** - Re-run quality gates
4. **Commit & Push** - Automated commit with self-improve message
5. **Feedback Analysis** - Analyze trends and recommendations

### Features

- **Parallel agent spawning** - Multiple Claude Code sessions in worktrees
- **Quality gates** - Automated pass/fail checks
- **Feedback loop** - Results feed into next improvement cycle
- **Audit trail** - All outputs logged to `logs/` directory
- **Auto-commit** - Changes automatically committed and pushed

### Examples

```bash
# Run full self-improvement cycle
./scripts/dash-self-improve.sh self-improve

# Quick fix
./scripts/dash-self-improve.sh quick "Fix type errors in src/models/"

# Swarm of 4 agents
./scripts/dash-self-improve.sh swarm \
  "Fix all ESLint errors" \
  "Add 10 new unit tests" \
  "Update for reasoning module" \
  documentation "Refactor storage module"

# Check status
./scripts/dash-self-improve.sh status
```

### Output

All outputs saved to:
- `logs/self-improve-[timestamp].log` - Main improvement log
- `logs/agent-[name].log` - Individual agent outputs
- `logs/agent-[name].pid` - Process IDs

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Self-Improvement Loop                    │
│  1. Quality Assessment (lint, types, tests)                │
│  2. Spawn Claude Code Agents in Worktrees                  │
│  3. Parallel Execution                                     │
│  4. Verification (re-run quality gates)                    │
│  5. Commit & Push                                          │
│  6. Feedback Analysis → Back to Step 1                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌──────────┴──────────┐
          ▼                     ▼
    ┌──────────┐          ┌──────────┐
    │ Claude   │          │ Claude   │
    │ Agent 1  │          │ Agent 2  │
    │ (Worktree│          │ (Worktree│
    │  fix)    │          │  tests)  │
    └──────────┘          └──────────┘
```

### See Also

- `/Users/jasontang/clawd/HEARTBEAT_CLAUDE_CODE.md` - Orchestrator guide
- `/Users/jasontang/clawd/CLAUDE_CODE_QUICK_REF.md` - Quick reference
- `CLAUDE_CODE_CLI_INTEGRATION.md` - Claude Code CLI integration guide
