# Godel Usage Guide

**Version:** 2.0  
**Last Updated:** 2026-02-06

Complete guide for using Godel with Pi runtime.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Pi Runtime Basics](#pi-runtime-basics)
3. [Spawning Pi Agents](#spawning-pi-agents)
4. [Model Selection](#model-selection)
5. [Provider Switching](#provider-switching)
6. [Session Management](#session-management)
7. [Best Practices](#best-practices)
8. [Advanced Patterns](#advanced-patterns)

---

## Getting Started

### Installation

```bash
# Clone and install
git clone https://github.com/davidkimai/godel.git
cd godel
npm install
npm run build

# Install Pi CLI
npm install -g @mariozechner/pi-coding-agent
```

### Configuration

Create `.godel/config.yaml`:

```yaml
runtime:
  default: pi
  pi:
    defaultModel: claude-sonnet-4-5
    defaultProvider: anthropic
```

### Verify Setup

```bash
# Check Godel status
godel status

# Verify Pi installation
pi --version

# List configured providers
godel pi providers list
```

---

## Pi Runtime Basics

### What is Pi Runtime?

Pi runtime integrates the [Pi CLI](https://github.com/mariozechner/pi-coding-agent) into Godel, enabling:

- **Multi-provider orchestration** - 15+ LLM providers
- **Tree-structured sessions** - Branch and fork conversations
- **Model cycling** - Switch models mid-session
- **Enhanced isolation** - Process-per-agent architecture

### Architecture Overview

```
User → Godel CLI → RuntimeRegistry → PiRuntime → Pi CLI → Agent
```

---

## Spawning Pi Agents

### Basic Spawning

```bash
# Spawn with default settings
godel agent spawn --runtime pi "Review this code"

# Spawn with specific model
godel agent spawn --runtime pi --model claude-sonnet-4-5 "Implement auth"

# Spawn with label
godel agent spawn --runtime pi --label "security-review" "Check for vulnerabilities"
```

### Spawning into Teams

```bash
# Create a Pi-based team
godel team create \
  --name "feature-team" \
  --runtime pi \
  --coordinator-model claude-opus-4 \
  --worker-model claude-sonnet-4-5 \
  --task "Build new feature"

# Add agents to existing team
godel agent spawn \
  --runtime pi \
  --team team-abc123 \
  "Implement API endpoint"
```

### Parallel Spawning

```bash
# Spawn multiple agents in parallel
for task in "auth" "database" "frontend" "tests"; do
  godel agent spawn --runtime pi "Implement $task module" &
done
wait
```

---

## Model Selection

### Available Models by Provider

#### Anthropic (Claude)

```bash
# Claude Opus 4 - Best for complex reasoning
godel agent spawn --runtime pi \
  --provider anthropic \
  --model claude-opus-4 \
  "Design system architecture"

# Claude Sonnet 4.5 - Balanced speed/quality
godel agent spawn --runtime pi \
  --provider anthropic \
  --model claude-sonnet-4-5 \
  "Review pull request"

# Claude Haiku 3.5 - Fast, cost-effective
godel agent spawn --runtime pi \
  --provider anthropic \
  --model claude-haiku-3-5 \
  "Summarize documentation"
```

#### OpenAI (GPT)

```bash
# GPT-4o - Best all-around
godel agent spawn --runtime pi \
  --provider openai \
  --model gpt-4o \
  "Implement feature"

# GPT-4o-mini - Cost-effective
godel agent spawn --runtime pi \
  --provider openai \
  --model gpt-4o-mini \
  "Quick code review"

# o1 - Reasoning models
godel agent spawn --runtime pi \
  --provider openai \
  --model o1 \
  "Solve complex algorithm"

# o3-mini - Fast reasoning
godel agent spawn --runtime pi \
  --provider openai \
  --model o3-mini \
  "Analyze data patterns"
```

#### Google (Gemini)

```bash
# Gemini 1.5 Pro - Long context
godel agent spawn --runtime pi \
  --provider google \
  --model gemini-1.5-pro \
  "Analyze entire codebase"

# Gemini 1.5 Flash - Fast responses
godel agent spawn --runtime pi \
  --provider google \
  --model gemini-1.5-flash \
  "Quick questions"
```

#### Groq (Fast Inference)

```bash
# Llama 3.3 70B - Ultra-fast
godel agent spawn --runtime pi \
  --provider groq \
  --model llama-3.3-70b-versatile \
  "High-volume processing"

# Mixtral 8x7B - MoE architecture
godel agent spawn --runtime pi \
  --provider groq \
  --model mixtral-8x7b-32768 \
  "Balanced performance"
```

#### Ollama (Local Models)

```bash
# Local Llama
godel agent spawn --runtime pi \
  --provider ollama \
  --model llama3:70b \
  "Private code analysis"

# Local CodeLlama
godel agent spawn --runtime pi \
  --provider ollama \
  --model codellama:70b \
  "Local development"
```

### Model Aliases

Use convenient aliases instead of full model names:

```bash
# Smart routing (Godel picks best model)
godel agent spawn --runtime pi --model smart "Complex task"

# Fast routing (prioritize speed)
godel agent spawn --runtime pi --model fast "Quick task"

# Cheap routing (prioritize cost)
godel agent spawn --runtime pi --model cheap "Simple task"
```

---

## Provider Switching

### Manual Provider Selection

```bash
# Explicit provider selection
godel agent spawn --runtime pi --provider anthropic "Task"
godel agent spawn --runtime pi --provider openai "Task"
godel agent spawn --runtime pi --provider google "Task"
```

### Auto Provider Selection

```bash
# Let Godel choose based on model
godel agent spawn --runtime pi --model gpt-4o "Task"  # Auto-routes to OpenAI
godel agent spawn --runtime pi --model claude-4.5 "Task"  # Auto-routes to Anthropic
```

### Runtime Provider Switching (in session)

When interacting with a Pi session directly:

```bash
# Inside Pi session, press Ctrl+P to cycle models
# Or use /model command
pi
/model gpt-4o
```

### Fallback Chains

Configure automatic fallbacks in `.godel/config.yaml`:

```yaml
runtime:
  default: pi
  pi:
    fallbackChain:
      - provider: anthropic
        model: claude-opus-4
      - provider: openai
        model: gpt-4o
      - provider: groq
        model: llama-3.3-70b
```

---

## Session Management

### Tree-Structured Sessions

Pi supports branching conversations:

```bash
# Start a session
godel pi session create --name "feature-design"

# Inside Pi session
pi "Initial approach to the problem"

# Branch to explore alternative
/tree
# Select node → Branch

# Continue on branch
pi "Alternative approach"

# Switch back to original branch
/tree
# Select original node

# View full tree
pi /tree
```

### Forking Sessions

Create new sessions from any point:

```bash
# Fork current session
pi /fork

# Fork with new name
pi /fork --name "variation-2"
```

### Session Persistence

Sessions automatically persist:

```bash
# List all sessions
godel pi sessions list

# Resume session
godel pi session resume <session-id>

# Compact long sessions
pi /compact
```

---

## Best Practices

### 1. Choose the Right Model

| Task Type | Recommended Model | Why |
|-----------|-------------------|-----|
| Complex architecture | claude-opus-4 | Best reasoning |
| Code review | claude-sonnet-4.5 | Balanced |
| Documentation | claude-haiku-3.5 | Fast, cheap |
| High-volume processing | llama-3.3-70b (Groq) | Ultra-fast |
| Private/sensitive data | ollama/codellama | Local processing |
| Long context | gemini-1.5-pro | 2M token context |

### 2. Use Labels for Organization

```bash
# Label agents by purpose
godel agent spawn --runtime pi --label "security-audit" "Check auth"
godel agent spawn --runtime pi --label "performance" "Optimize queries"
godel agent spawn --runtime pi --label "docs" "Update README"

# Filter by label
godel agent list --label security-audit
```

### 3. Set Appropriate Budgets

```bash
# Set per-agent budget
godel agent spawn --runtime pi --budget 5.00 "Expensive task"

# Set per-team budget
godel team create --runtime pi --budget 50.00 --name "big-project"
```

### 4. Use Worktrees for Isolation

```bash
# Create isolated worktree
godel worktree create --name "feature-branch"

# Spawn agent in worktree
godel agent spawn --runtime pi --worktree feature-branch "Implement feature"
```

### 5. Model Cycling for Quality

```bash
# Start with fast model, switch to powerful one
pi --model claude-haiku-3-5 "Draft implementation"
# Ctrl+P → Switch to claude-opus-4
"Refine this to production quality"
```

---

## Advanced Patterns

### Pattern 1: Multi-Model Verification

Use multiple models to verify critical work:

```bash
#!/bin/bash
TASK="Review this security-critical code"

# Get opinions from multiple models
for model in claude-opus-4 gpt-4o gemini-1.5-pro; do
  godel agent spawn --runtime pi --model "$model" "$TASK" &
done
wait

# Compare results
godel team aggregate --compare-results
```

### Pattern 2: Hierarchical Teams

Create specialized sub-teams:

```bash
# Main coordinator (powerful model)
godel team create \
  --name "main-coordinator" \
  --runtime pi \
  --coordinator-model claude-opus-4 \
  --task "Coordinate development"

# Worker team (fast models)
godel team create \
  --name "workers" \
  --runtime pi \
  --worker-model claude-haiku-3-5 \
  --scale 10 \
  --task "Process subtasks"
```

### Pattern 3: Provider Load Balancing

Distribute load across providers:

```yaml
# .godel/config.yaml
runtime:
  pi:
    loadBalancing:
      strategy: round-robin
      providers:
        - anthropic
        - openai
        - groq
```

### Pattern 4: Cost-Optimized Routing

Route based on task complexity:

```bash
# Simple tasks → cheap models
if [ "$COMPLEXITY" = "low" ]; then
  MODEL="claude-haiku-3-5"
  PROVIDER="anthropic"
elif [ "$COMPLEXITY" = "medium" ]; then
  MODEL="claude-sonnet-4-5"
  PROVIDER="anthropic"
else
  MODEL="claude-opus-4"
  PROVIDER="anthropic"
fi

godel agent spawn --runtime pi --provider "$PROVIDER" --model "$MODEL" "$TASK"
```

### Pattern 5: Session Tree Exploration

Use tree structure for design exploration:

```bash
# Start design session
pi "Design the API for new service"

# Branch 1: REST approach
/tree → branch
pi "Design REST API endpoints"

# Branch 2: GraphQL approach  
/tree → select root → branch
pi "Design GraphQL schema"

# Branch 3: gRPC approach
/tree → select root → branch  
pi "Design gRPC services"

# Compare all branches
/tree → view all branches side-by-side
```

---

## Quick Reference

### Commands

```bash
# Spawn agent
godel agent spawn --runtime pi [options] <task>

# Create team
godel team create --runtime pi [options] --task <task>

# List Pi sessions
godel pi sessions list

# View Pi stats
godel pi stats

# List providers
godel pi providers list

# List models
godel pi models list --provider <provider>
```

### Options

| Option | Description | Example |
|--------|-------------|---------|
| `--runtime pi` | Use Pi runtime | Required for Pi features |
| `--provider` | LLM provider | anthropic, openai, google |
| `--model` | Model name | claude-sonnet-4-5, gpt-4o |
| `--label` | Agent label | security-review |
| `--budget` | Cost limit | 10.00 |
| `--worktree` | Isolated worktree | feature-branch |

---

## See Also

- [CLI Reference](CLI.md) - Complete command reference
- [Migration Guide](MIGRATION_TO_PI.md) - Migrating from legacy
- [Architecture](ARCHITECTURE.md) - System architecture
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
