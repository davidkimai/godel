# Migrating to Pi Runtime

**Version:** 1.0  
**Last Updated:** 2026-02-06

## Overview

This guide helps you migrate from the legacy agent system to the Pi runtime.

## What's New

### Pi Runtime

The Pi runtime brings powerful capabilities to Godel:

| Feature | Description | Benefit |
|---------|-------------|---------|
| **Multi-Provider** | 15+ LLM providers | Choose the best model for each task |
| **Tree Sessions** | Branch/fork conversations | Explore multiple approaches |
| **Model Cycling** | Ctrl+P to switch models | Compare outputs across models |
| **Session Trees** | Visual conversation history | Navigate complex discussions |
| **Better Isolation** | Each agent in separate process | Improved stability |

### Provider Support

Pi runtime supports 15+ providers:

- **Anthropic** - Claude Opus 4, Sonnet 4.5, Haiku 3.5
- **OpenAI** - GPT-4o, GPT-4o-mini, o1, o3-mini
- **Google** - Gemini 1.5 Pro, Flash
- **Groq** - Llama 3, Mixtral (fast inference)
- **Cerebras** - Llama 3 (ultra-fast)
- **Ollama** - Local models for privacy
- **Kimi** - Moonshot AI models
- **MiniMax** - Cost-effective options
- And more...

## Migration Steps

### Step 1: Update Configuration

Add to `.godel/config.yaml`:

```yaml
runtime:
  default: pi
  pi:
    defaultModel: claude-sonnet-4-5
    defaultProvider: anthropic
    providers:
      - anthropic
      - openai
      - google
```

### Step 2: Install Pi CLI

Ensure Pi is installed globally:

```bash
npm install -g @mariozechner/pi-coding-agent

# Verify installation
pi --version
```

### Step 3: Spawn New Agents

#### Old Way (Legacy)

```bash
godel agent spawn --model gpt-4 "Review code"
```

#### New Way (Pi Runtime)

```bash
# With explicit runtime
godel agent spawn --runtime pi --model gpt-4o "Review code"

# Or use default (if set in config)
godel agent spawn --model gpt-4o "Review code"
```

### Step 4: Update Scripts

If you have scripts that spawn agents, add `--runtime pi` flag:

```bash
#!/bin/bash
# Before
for task in "$@"; do
    godel agent spawn --model claude-sonnet-4 "$task"
done

# After
for task in "$@"; do
    godel agent spawn --runtime pi --model claude-sonnet-4-5 "$task"
done
```

### Step 5: Environment Variables

Update your `.env` file:

```bash
# Pi Configuration
GODEL_PI_ENABLED=true
GODEL_PI_DEFAULT_PROVIDER=anthropic
GODEL_PI_DEFAULT_MODEL=claude-sonnet-4-5

# Provider API Keys (server-side)
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
```

## Backward Compatibility

### Existing Agents

Existing agents continue to work with the `native` runtime:

```bash
# Legacy agents still work
godel agent list --runtime native

# Results include runtime information
# ID          | Runtime | Model          | Status
# agent-001   | native  | gpt-4          | running
# agent-002   | pi      | claude-4.5     | running
```

### Mixed Runtime Swarms

You can mix runtimes in swarms:

```bash
# Create swarm with mixed runtimes
godel swarm create \
  --name "mixed-swarm" \
  --coordinator-runtime pi \
  --worker-runtime native \
  --task "Analyze codebase"
```

## Feature Comparison

| Feature | Legacy (native) | Pi Runtime |
|---------|-----------------|------------|
| Multi-provider | ❌ Single | ✅ 15+ providers |
| Model switching | ❌ Fixed | ✅ Runtime cycling |
| Session trees | ❌ Linear | ✅ Branch/fork |
| Process isolation | ✅ Yes | ✅ Yes |
| Session persistence | ⚠️ Limited | ✅ Full |
| Cost tracking | ✅ Yes | ✅ Enhanced |
| Local models | ❌ No | ✅ Ollama |

## Common Patterns

### Pattern 1: Model Comparison

Compare model outputs for the same task:

```bash
# Spawn agents with different models
for model in claude-sonnet-4-5 gpt-4o gemini-1.5-pro; do
    godel agent spawn \
      --runtime pi \
      --provider auto \
      --model "$model" \
      "Review this PR for security issues"
done
```

### Pattern 2: Fallback Chain

Set up automatic fallbacks:

```yaml
# .godel/config.yaml
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

### Pattern 3: Session Trees

Use tree-structured sessions for complex tasks:

```bash
# Start a session
godel pi session create --name "feature-design"

# Branch to explore alternatives
pi /branch "Alternative approach"

# Fork to start fresh variation
pi /fork

# Navigate the tree
pi /tree
```

### Pattern 4: Local-First Development

Use Ollama for local development:

```bash
# Configure for local models
godel agent spawn \
  --runtime pi \
  --provider ollama \
  --model codellama:70b \
  --task "Refactor this function"
```

## Troubleshooting

### Issue: Pi CLI Not Found

**Error:** `Error: pi command not found`

**Solution:**
```bash
npm install -g @mariozechner/pi-coding-agent

# Or use npx
npx @mariozechner/pi-coding-agent --version
```

### Issue: Provider Not Available

**Error:** `Provider 'xyz' not configured`

**Solution:**
```bash
# Check configured providers
godel pi providers list

# Add provider API key to .env
export XYZ_API_KEY=your_key_here
```

### Issue: Model Not Found

**Error:** `Model 'claude-xyz' not available for provider 'anthropic'`

**Solution:**
```bash
# List available models
godel pi models list --provider anthropic

# Use correct model name
godel agent spawn --runtime pi --model claude-sonnet-4-5
```

## Migration Checklist

- [ ] Install Pi CLI globally (`npm install -g @mariozechner/pi-coding-agent`)
- [ ] Update `.godel/config.yaml` with runtime settings
- [ ] Add provider API keys to `.env`
- [ ] Update scripts to use `--runtime pi`
- [ ] Test Pi agent spawning
- [ ] Verify backward compatibility with native agents
- [ ] Update CI/CD pipelines if needed
- [ ] Document new runtime for team members
- [ ] Train team on model cycling and session trees

## Post-Migration

### Monitoring

Monitor Pi runtime metrics:

```bash
# View Pi runtime statistics
godel pi stats

# Check provider usage
godel pi providers usage

# Monitor costs
godel budget status --runtime pi
```

### Optimization

Fine-tune Pi runtime settings:

```yaml
# .godel/config.yaml
runtime:
  default: pi
  pi:
    # Enable response caching
    cache:
      enabled: true
      ttl: 3600
    
    # Cost optimization
    costOptimization:
      defaultTier: balanced  # speed | quality | cost
      maxCostPerRequest: 1.00
    
    # Session management
    sessions:
      autoCompact: true
      maxTreeDepth: 100
```

## Support

- **Documentation:** [docs/PI_INTEGRATION.md](PI_INTEGRATION.md)
- **CLI Reference:** [docs/CLI.md](CLI.md)
- **Troubleshooting:** [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **GitHub Issues:** https://github.com/davidkimai/godel/issues

---

**Happy migrating!** 🚀
