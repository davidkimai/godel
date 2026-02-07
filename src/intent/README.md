# Intent-Based "Magic" System

This module provides natural language intent parsing and automatic swarm configuration for Godel.

## Features

- **LLM-based Intent Parsing**: Primary parsing using LLM with rule-based fallback
- **Complexity Analysis**: Code metrics analysis (LOC, cyclomatic complexity, dependencies)
- **Automatic Swarm Configuration**: Intelligent agent selection based on intent and complexity
- **Cost & Time Estimation**: Budget enforcement and time estimates

## Quick Start

```typescript
import { IntentExecutor } from '@godel/intent';

const executor = new IntentExecutor();

// Execute a natural language command
const result = await executor.execute('Refactor the auth module with better error handling');
```

## Architecture

```
User Input → IntentParser → ComplexityAnalyzer → SwarmConfigGenerator → IntentExecutor
                ↓                    ↓                     ↓
         ParsedIntent       SwarmComplexity      SwarmConfiguration
```

## Components

### IntentParser (`parser.ts`)

Parses natural language into structured `ParsedIntent`:

```typescript
interface ParsedIntent {
  taskType: 'refactor' | 'implement' | 'fix' | 'test' | 'review' | 'document' | 'analyze';
  target: string;
  targetType: 'file' | 'module' | 'function' | 'feature' | 'bug' | 'test';
  focus?: string;
  constraints?: string[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  raw: string;
}
```

### ComplexityAnalyzer (`complexity-analyzer.ts`)

Analyzes code complexity using metrics:

- Lines of code
- Cyclomatic complexity
- Cognitive complexity
- Dependencies
- Test coverage
- Change frequency

### SwarmConfigGenerator (`swarm-config-generator.ts`)

Generates optimal swarm configuration based on intent type and complexity:

- **Refactor**: Architect + Refactoring Specialists + Reviewer
- **Implement**: Architect + Implementers + Tester + Reviewer
- **Fix**: Investigator + Test Writer + Fix Implementer + Regression Tester
- **Test**: Test Lead + Test Developers
- **Review**: Lead Reviewer + Code Reviewers
- **Document**: Technical Writer + Documentation Engineer + Review Editor
- **Analyze**: Principal Analyst + Code Analysts

### IntentExecutor (`executor.ts`)

Orchestrates the entire process:

1. Parse intent
2. Analyze complexity
3. Generate swarm config
4. Spawn agents
5. Execute workflow

## Usage Examples

```bash
# Refactoring example
godel do "Refactor the auth module with better error handling"

# Bug fix with budget
godel do "Fix the login timeout bug" --budget 3.00 --yes

# Test generation
godel do "Write tests for the user service"

# Dry run to see plan
godel do "Implement payment processing" --dry-run
```

## Testing

```bash
# Run all intent tests
npm test -- src/intent

# Run specific test file
npm test -- src/intent/__tests__/parser.test.ts
```

## API Reference

### IntentParser

```typescript
const parser = new IntentParser({ useLLM: false });
const intent = await parser.parse('Refactor auth module');
```

### ComplexityAnalyzer

```typescript
const analyzer = new ComplexityAnalyzer();
const complexity = await analyzer.analyze('src/auth', 'module');
```

### SwarmConfigGenerator

```typescript
const generator = new SwarmConfigGenerator();
const config = await generator.generate(intent, complexity);
```

### IntentExecutor

```typescript
const executor = new IntentExecutor();
const result = await executor.execute('Refactor auth module', {
  budget: 5.00,
  yes: true,
});
```

## Configuration

The system can be configured via:

- `ParserConfig`: LLM settings, strict mode
- `ExecuteOptions`: Budget, dry-run, confirmation skip

## Future Enhancements

- [ ] Real LLM integration with @godel/ai
- [ ] Git integration for change frequency analysis
- [ ] Coverage report parsing
- [ ] AST-based complexity analysis
- [ ] Template customization
- [ ] Cost tracking integration
