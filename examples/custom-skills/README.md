# Custom Skills Example

This example demonstrates how to create and use custom skills to extend agent capabilities.

## What are Skills?

Skills are reusable, composable capabilities that enhance agent abilities:
- Domain-specific knowledge
- Workflow patterns
- Tool integrations
- Reference material

## Creating a Custom Skill

### 1. Skill Structure

```
skills/
└── my-skill/
    ├── SKILL.md          # Documentation and usage
    ├── index.ts          # Main implementation
    ├── schemas.ts        # Input/output schemas
    └── tests/
        └── index.test.ts
```

### 2. Skill Definition

```typescript
// skills/code-review/SKILL.md
---
name: code-review
description: Automated code review with best practices
triggers:
  - code review
  - review PR
  - check code quality
---

# Code Review Skill

## Usage

```
/review <file or PR>
```

## Capabilities

- Detects security issues
- Checks performance
- Validates patterns
- Suggests improvements
```

### 3. Skill Implementation

```typescript
// skills/code-review/index.ts
import { Skill, SkillContext, SkillResult } from '@jtan15010/godel';

export const codeReviewSkill: Skill = {
  name: 'code-review',
  version: '1.0.0',
  
  // Schema validation
  inputSchema: {
    type: 'object',
    properties: {
      target: { type: 'string' },
      focus: { 
        type: 'array',
        items: { 
          enum: ['security', 'performance', 'style', 'architecture']
        }
      }
    },
    required: ['target']
  },
  
  // Main execution
  async execute(input: any, context: SkillContext): Promise<SkillResult> {
    const { target, focus = ['security', 'performance'] } = input;
    
    // Read the code
    const code = await context.tools.read(target);
    
    // Analyze
    const issues = [];
    
    if (focus.includes('security')) {
      issues.push(...await checkSecurity(code));
    }
    
    if (focus.includes('performance')) {
      issues.push(...await checkPerformance(code));
    }
    
    return {
      success: true,
      output: {
        issues,
        summary: `Found ${issues.length} issues`
      }
    };
  }
};

async function checkSecurity(code: string): Promise<any[]> {
  const issues = [];
  // Security checks...
  return issues;
}

async function checkPerformance(code: string): Promise<any[]> {
  const issues = [];
  // Performance checks...
  return issues;
}
```

### 4. Register Skill

```bash
# Register via CLI
godel skills register ./skills/code-review

# Or via SDK
await client.skills.register({
  path: './skills/code-review',
  scope: 'global'  // or 'team', 'agent'
});
```

## Using Skills

### 5. Invoke Skill

```typescript
// Direct invocation
const result = await client.skills.invoke('code-review', {
  target: 'src/auth.ts',
  focus: ['security', 'performance']
});

// In an intent
const result = await client.intent.execute({
  description: '/review src/auth.ts --focus security'
});
```

### 6. Skill Composition

```typescript
// Chain skills together
const pipeline = await client.skills.compose({
  name: 'full-review',
  steps: [
    { skill: 'code-review', input: { focus: ['security'] } },
    { skill: 'test-generation', input: { coverage: 80 } },
    { skill: 'documentation', input: { format: 'jsdoc' } }
  ]
});

const result = await pipeline.run({ target: 'src/auth.ts' });
```

### 7. Skill Store

```typescript
// Browse available skills
const skills = await client.skills.list();

// Install from store
await client.skills.install('godel/test-generation', 'latest');

// Update
await client.skills.update('code-review');

// Uninstall
await client.skills.uninstall('code-review');
```

## Advanced Features

### 8. Skill Parameters

```typescript
const skill = {
  name: 'database-migration',
  parameters: {
    dryRun: {
      type: 'boolean',
      default: true,
      description: 'Preview changes without applying'
    },
    rollback: {
      type: 'boolean',
      default: false,
      description: 'Perform rollback instead'
    }
  },
  
  async execute(input, context) {
    if (input.dryRun) {
      context.log('Running in dry-run mode...');
    }
    // ...
  }
};
```

### 9. Skill Hooks

```typescript
const skill = {
  name: 'deployment',
  
  async beforeExecute(input, context) {
    // Pre-execution hook
    const confirmed = await context.confirm('Deploy to production?');
    if (!confirmed) {
      throw new Error('Deployment cancelled');
    }
  },
  
  async execute(input, context) {
    // Main execution
  },
  
  async afterExecute(result, context) {
    // Post-execution hook
    await context.notify('Deployment complete');
  }
};
```

### 10. Skill Testing

```typescript
// skills/code-review/index.test.ts
import { testSkill } from '@jtan15010/godel/testing';
import { codeReviewSkill } from './index';

describe('code-review skill', () => {
  it('detects SQL injection', async () => {
    const result = await testSkill(codeReviewSkill, {
      target: 'test-files/vulnerable.ts'
    });
    
    expect(result.output.issues).toContain(
      expect.objectContaining({ type: 'security', severity: 'high' })
    );
  });
});
```

## Best Practices

1. **Document thoroughly** in SKILL.md
2. **Validate inputs** using schemas
3. **Handle errors** gracefully
4. **Log progress** for long-running skills
5. **Test extensively** before deployment
6. **Version your skills** for compatibility
