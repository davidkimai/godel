# Basic Agent Creation Example

This example demonstrates how to create and manage individual agents using the Godel CLI and SDK.

## Prerequisites

- Godel server running (`npm start`)
- CLI configured (`godel interactive setup`)

## Examples

### 1. Create a Simple Worker Agent

```bash
# Using CLI
godel agent spawn --role worker --model claude-sonnet-4-5 --label "my-worker"

# Using interactive mode
godel interactive agent
```

### 2. Create a Coordinator Agent

```bash
godel agent spawn --role coordinator --model claude-opus-4 --label "team-lead"
```

### 3. Using the SDK

```typescript
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({
  baseUrl: 'http://localhost:7373',
  apiKey: 'your-api-key'
});

// Create a worker agent
const agent = await client.agents.spawn({
  role: 'worker',
  model: 'claude-sonnet-4-5',
  label: 'auth-implementer',
  runtime: 'pi',
  config: {
    maxTokens: 4000,
    temperature: 0.7
  }
});

console.log(`Agent created: ${agent.id}`);
```

### 4. List and Filter Agents

```bash
# List all agents
godel agent list

# Filter by status
godel agent list --status running

# Filter by role
godel agent list --role worker
```

### 5. Monitor Agent Logs

```bash
# View last 100 lines
godel agent logs agent-001 --lines 100

# Follow logs in real-time
godel agent logs agent-001 --follow
```

### 6. Terminate an Agent

```bash
# Graceful shutdown
godel agent kill agent-001

# Force kill
godel agent kill agent-001 --force
```

## Key Concepts

- **Roles**: Worker, Coordinator, Reviewer, Refinery, Specialist
- **Models**: Claude, GPT-4, Gemini supported
- **Runtimes**: Pi, OpenClaw, Local
- **Lifecycle**: Spawn → Run → Complete/Kill

## Next Steps

See [team-orchestration](../team-orchestration/) for multi-agent examples.
