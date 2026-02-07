# Godel Examples

This directory contains comprehensive examples demonstrating various Godel features and patterns.

## Available Examples

### 1. [basic-agent-creation](../../examples/basic-agent-creation/)
Learn how to create and manage individual agents.

- Spawn different agent roles
- Monitor agent status
- View and follow logs
- Terminate agents

```bash
cd examples/basic-agent-creation
npx ts-node index.ts
```

### 2. [team-orchestration](../../examples/team-orchestration/)
Create and manage coordinated agent teams.

- Parallel teams
- Map-reduce teams
- Pipeline teams
- Team scaling

```bash
cd examples/team-orchestration
npx ts-node index.ts
```

### 3. [intent-refactoring](../../examples/intent-refactoring/)
Use natural language to orchestrate work.

- Simple intents
- Multi-stage intents
- Intent monitoring
- Error recovery

```bash
cd examples/intent-refactoring
npx ts-node index.ts
```

### 4. [multi-runtime](../../examples/multi-runtime/)
Work with different agent runtimes.

- Pi runtime
- OpenClaw runtime
- Local runtime
- Runtime failover

```bash
cd examples/multi-runtime
npx ts-node index.ts
```

### 5. [federation](../../examples/federation/)
Scale across multiple Godel instances.

- Register instances
- Health-aware routing
- Session affinity
- Geographic routing

```bash
cd examples/federation
npx ts-node index.ts
```

### 6. [custom-skills](../../examples/custom-skills/)
Create and use custom agent skills.

- Skill definition
- Skill registration
- Skill composition
- Skill pipelines

```bash
cd examples/custom-skills
npx ts-node index.ts
```

### 7. [monitoring](../../examples/monitoring/)
Monitor system health and performance.

- Health checks
- Metrics collection
- Event streaming
- Log aggregation

```bash
cd examples/monitoring
npx ts-node index.ts
```

### 8. [security-setup](../../examples/security-setup/)
Configure authentication and authorization.

- API key management
- Role-based access
- Rate limiting
- Audit logging

```bash
cd examples/security-setup
npx ts-node index.ts
```

### 9. [ci-cd-integration](../../examples/ci-cd-integration/)
Integrate Godel into CI/CD pipelines.

- GitHub Actions
- GitLab CI
- Automated code review
- Security scanning

See `ci-cd-integration/github-workflow.yml` for workflow examples.

### 10. [advanced-patterns](../../examples/advanced-patterns/)
Advanced patterns for complex scenarios.

- Convoy pattern
- Reflex pattern
- Swarm pattern
- Circuit breaker
- Saga pattern
- Event sourcing

```bash
cd examples/advanced-patterns
npx ts-node index.ts
```

## Running Examples

### Prerequisites

1. Godel server running (`npm start`)
2. Dependencies installed (`npm install`)
3. Environment configured (`.env` file)

### Quick Start

```bash
# Run all examples
cd examples
./run-all.sh

# Run specific example
cd examples/basic-agent-creation
npx ts-node index.ts
```

## Tips

- Start with `basic-agent-creation` for fundamentals
- Progress through examples in order
- Modify examples to explore variations
- Check logs for detailed output
- Use `godel interactive` alongside examples
