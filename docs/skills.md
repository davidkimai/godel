# Agent Skills System

Dash implements the [Agent Skills standard](https://agentskills.io) - an open format for defining reusable agent capabilities.

## Overview

Skills are Markdown files that provide agents with:
- **Structured instructions** for specific tasks
- **When-to-use guidance** for context-aware loading
- **Step-by-step procedures** for complex workflows
- **Examples** for consistent behavior
- **Tool definitions** for capability discovery

## Quick Start

### Loading Skills

```typescript
import { SkillRegistry } from '@dash/core/skills';

const registry = new SkillRegistry();
await registry.loadAll();

// Get all loaded skills
const skills = registry.getAll();

// Get skills by source
const builtins = registry.getBySource('builtin');
```

### Auto-Loading Based on Context

```typescript
// Automatically find and activate relevant skills
const matches = await registry.autoLoad('deploy to production');

// matches contains:
// - skill: The matched skill
// - score: Relevance score (0-1)
// - matchedTerms: Matching keywords
// - reason: Why it matched
```

### Manual Skill Activation

```typescript
// Activate a specific skill
await registry.activate('deployment');

// Get active skills for prompt
const prompt = registry.formatForPrompt();
```

## Skill Format

Skills are defined in `SKILL.md` files with YAML frontmatter:

```markdown
---
name: deployment
description: Automate deployment workflows for services
metadata:
  author: your-name
  version: "1.0.0"
---

# Deployment Skill

## When to Use

- User asks to "deploy" or "ship to production"
- Setting up CI/CD pipelines
- Managing releases

## Steps

1. Analyze deployment requirements
2. Run pre-deployment checks
3. Deploy to target environment
4. Verify deployment health

## Tools Available

- `deploy_service`: Deploy to environment
- `run_tests`: Execute test suite
- `rollback`: Revert deployment

## Examples

### Example 1: Deploy to Production

Input: "Deploy the API service"
Output: Successfully deployed v2.3.1 to production
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill name (lowercase, hyphens, max 64 chars) |
| `description` | Yes | What the skill does and when to use it (max 1024 chars) |
| `license` | No | License identifier |
| `compatibility` | No | Environment requirements |
| `metadata` | No | Key-value pairs for additional data |
| `allowed-tools` | No | Space-delimited list of pre-approved tools |
| `disable-model-invocation` | No | Set to `true` to prevent auto-activation |

## Skill Locations

Skills are loaded from multiple sources:

1. **User skills** (`~/.godel/skills/`) - Personal skills
2. **Project skills** (`./.godel/skills/`) - Project-specific skills
3. **Built-in skills** (`./skills/`) - Bundled with Dash
4. **Explicit paths** - Passed via configuration

### Directory Structure

```
skills/
├── deployment/
│   └── SKILL.md
├── testing/
│   └── SKILL.md
│   └── references/
│       └── test-patterns.md
└── code-review/
    └── SKILL.md
    └── scripts/
        └── analyze.sh
```

## Built-in Skills

Dash includes several built-in skills:

### Deployment
Automates deployment workflows for web applications, APIs, and services.

**When to use:**
- Deploying to production, staging, or development
- Setting up CI/CD pipelines
- Rollback procedures

**Key steps:**
1. Analyze requirements
2. Pre-deployment checks
3. Execute deployment
4. Post-deployment verification
5. Handle rollback if needed

### Code Review
Conducts thorough code reviews for quality and maintainability.

**When to use:**
- Reviewing pull requests
- Analyzing code changes
- Providing feedback on implementation

**Key steps:**
1. Understand context
2. Review for correctness
3. Review for maintainability
4. Review for performance
5. Review for security
6. Review for testing
7. Provide constructive feedback

### Testing
Designs and implements comprehensive test strategies.

**When to use:**
- Writing tests
- Improving test coverage
- Debugging test failures
- Setting up testing infrastructure

**Key steps:**
1. Analyze code under test
2. Design test cases
3. Set up test environment
4. Write unit tests
5. Write integration tests
6. Write end-to-end tests
7. Ensure test quality

### Refactoring
Restructures code to improve internal quality.

**When to use:**
- Code has technical debt
- Poor readability
- Code duplication
- Modernizing legacy code

**Key steps:**
1. Understand current code
2. Ensure test coverage
3. Identify opportunities
4. Plan refactoring
5. Execute changes
6. Verify behavior preservation
7. Review and improve

## Creating Custom Skills

### 1. Create Skill Directory

```bash
mkdir -p ~/.godel/skills/my-skill
cd ~/.godel/skills/my-skill
```

### 2. Write SKILL.md

```markdown
---
name: my-skill
description: Brief description of what this skill does
metadata:
  author: your-name
  version: "1.0.0"
---

# My Skill

## When to Use

- When users ask about X
- When working with Y

## Steps

1. First step
2. Second step
3. Third step

## Tools Available

- `tool1`: Description of tool 1
- `tool2`: Description of tool 2

## Examples

### Example 1: Basic Usage

Input: user query
Output: expected result
```

### 3. Test Your Skill

```typescript
import { loadSkillFromFile } from '@dash/core/skills';

const result = loadSkillFromFile(
  '~/.godel/skills/my-skill/SKILL.md',
  'user'
);

console.log(result.skill);
console.log(result.diagnostics);
```

### Skill Design Best Practices

1. **Be specific** - Skills should solve one problem well
2. **Include examples** - Show expected inputs/outputs
3. **List clear steps** - Numbered procedures work best
4. **Define triggers** - Help agents know when to use the skill
5. **Keep it focused** - Move detailed reference to separate files
6. **Version your skills** - Use metadata.version

## Swarm Integration

Skills integrate with Dash swarms for multi-agent scenarios:

### Shared Skills Across Agents

```typescript
import { SwarmSkillManager } from '@dash/core/skills';

const swarmManager = new SwarmSkillManager(registry);

// Initialize swarm with shared skills
await swarmManager.initializeSwarm({
  swarmId: 'my-swarm',
  task: 'deploy application',
  skillConfig: {
    sharedSkills: ['deployment', 'monitoring'],
    roleSkills: {
      'devops': ['deployment', 'security'],
      'qa': ['testing'],
    },
    autoLoad: true,
    dynamicSharing: true,
  },
});
```

### Skill-Specific Agent Roles

```typescript
// Register agents with role-specific skills
await swarmManager.registerAgent(
  'my-swarm',
  'agent-1',
  'devops'
);

// Agent-1 now has: deployment, monitoring (shared), security (role)
```

### Dynamic Skill Sharing

```typescript
// Share skills between agents
await swarmManager.shareSkills(
  'expert-agent',
  'novice-agent',
  ['security']
);

// Request skills from another agent
await swarmManager.requestSkill(
  'agent-a',
  'agent-b',
  'deployment'
);

// Broadcast skills to all agents
await swarmManager.broadcastSkills(
  'my-swarm',
  'source-agent',
  ['testing', 'monitoring']
);
```

### Dynamic Skill Loading

```typescript
// Load skills based on context during execution
const activated = await swarmManager.dynamicLoad(
  'my-swarm',
  'agent-1',
  'We need to run security audit'
);
// Automatically activates 'security' skill
```

## Relevance Scoring

Auto-loading uses relevance scoring to find the best skills:

| Factor | Weight | Description |
|--------|--------|-------------|
| Name match | 0.5 | Query contains skill name |
| Description match | 0.2 | Query matches description |
| When-to-use match | 0.3 | Query matches when-to-use items |
| Word boundary | +0.1 | Whole word match bonus |

Skills scoring above `autoLoadThreshold` (default 0.3) are candidates for auto-loading.

## API Reference

### SkillRegistry

```typescript
class SkillRegistry {
  // Loading
  loadAll(): Promise<LoadSkillsResult>
  loadFromDir(dir: string, source: SkillSource): LoadSkillsResult
  loadFromFile(filePath: string, source: SkillSource): { skill: Skill | null; diagnostics: SkillDiagnostic[] }

  // Retrieval
  get(name: string): LoadedSkill | undefined
  getAll(): LoadedSkill[]
  getBySource(source: SkillSource): LoadedSkill[]
  getActiveSkills(): LoadedSkill[]

  // Auto-loading
  findRelevant(query: string, limit?: number): SkillMatch[]
  autoLoad(context: string): Promise<SkillMatch[]>

  // Activation
  activate(name: string): Promise<boolean>
  deactivate(name: string): Promise<boolean>

  // Formatting
  formatForPrompt(skills?: LoadedSkill[]): string

  // Events
  on(event: SkillEventType, listener: (event: SkillEvent) => void): void
}
```

### SwarmSkillManager

```typescript
class SwarmSkillManager {
  // Initialization
  initializeSwarm(config: SkillAwareSwarmConfig): Promise<SwarmSkillContext>
  registerAgent(swarmId: string, agentId: string, role?: string): Promise<SkillEnabledAgent>

  // Sharing
  shareSkills(sourceAgentId: string, targetAgentId: string, skillNames: string[]): Promise<boolean>
  broadcastSkills(swarmId: string, sourceAgentId: string, skillNames: string[]): Promise<void>
  requestSkill(requesterAgentId: string, targetAgentId: string, skillName: string): Promise<boolean>

  // Dynamic loading
  dynamicLoad(swarmId: string, agentId: string, context: string): Promise<SkillMatch[]>

  // Role management
  defineRole(role: SkillAgentRole): void
  assignRole(agentId: string, role: string, config: SwarmSkillConfig): Promise<void>

  // Queries
  getAgentSkills(agentId: string): LoadedSkill[]
  getSwarmActiveSkills(swarmId: string): LoadedSkill[]

  // Cleanup
  cleanupSwarm(swarmId: string): Promise<void>
}
```

## Examples

### Complete Example: Setting Up a DevOps Swarm

```typescript
import { SkillRegistry, SwarmSkillManager } from '@dash/core/skills';

async function setupDevOpsSwarm() {
  // Initialize registry
  const registry = new SkillRegistry();
  await registry.loadAll();

  // Create swarm manager
  const swarmManager = new SwarmSkillManager(registry);

  // Initialize swarm
  const context = await swarmManager.initializeSwarm({
    swarmId: 'production-deploy',
    task: 'Deploy new API version with zero downtime',
    skillConfig: {
      sharedSkills: ['deployment', 'monitoring'],
      roleSkills: {
        'lead': ['deployment', 'security', 'testing'],
        'support': ['testing', 'monitoring'],
      },
      autoLoad: true,
      dynamicSharing: true,
    },
  });

  // Register agents with roles
  const lead = await swarmManager.registerAgent(
    'production-deploy',
    'lead-agent',
    'lead'
  );

  const support = await swarmManager.registerAgent(
    'production-deploy',
    'support-agent',
    'support'
  );

  // During execution, dynamically load needed skills
  const newSkills = await swarmManager.dynamicLoad(
    'production-deploy',
    'support-agent',
    'We need to run a security scan'
  );

  // Share expertise between agents
  await swarmManager.shareSkills(
    'lead-agent',
    'support-agent',
    ['security']
  );

  // Get formatted skills for LLM prompt
  const skillsPrompt = registry.formatForPrompt();

  return { swarmManager, lead, support, skillsPrompt };
}
```

## Troubleshooting

### Skills not loading
- Check file permissions on skill directories
- Verify SKILL.md has required frontmatter (name, description)
- Check diagnostics from `loadAll()` or `loadFromFile()`

### Auto-loading not working
- Ensure `autoLoad` is enabled in config
- Lower `autoLoadThreshold` if needed
- Check that skill has descriptive `whenToUse` section

### Name collisions
- Skills are loaded in order: user > project > builtin > path
- First loaded skill wins
- Check diagnostics for collision warnings

## See Also

- [Agent Skills Specification](https://agentskills.io/specification)
- [Skill Examples](https://github.com/agentskills/agentskills/tree/main/skills-ref)
- [Built-in Skills Reference](../skills/)
