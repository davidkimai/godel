# Godel Phase 2: Intent Interface Design

## Overview

This document describes the Phase 2 Intent Interface architecture for Godel, implementing the `godel do "intent"` natural language command system.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Intent Interface                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │   Parser     │───▶│   Router     │───▶│  Handler     │     │
│   │              │    │              │    │              │     │
│   │ - NL to      │    │ - Route to   │    │ - Execute    │     │
│   │   Intent     │    │   handler    │    │   intent     │     │
│   │ - Pattern    │    │ - Preprocess │    │ - Generate   │     │
│   │   matching   │    │ - Fallback   │    │   plan       │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
│                                                        │        │
│   ┌────────────────────────────────────────────────────┘        │
│   │                                                             │
│   ▼                                                             │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Handler Registry                         │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│ │
│  │  │refactor │ │   fix   │ │implement│ │  test   │ │optimize││ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘│ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Types (`src/intent/types.ts`)

The core `Intent` interface as specified in Phase 2 requirements:

```typescript
interface Intent {
  action: 'refactor' | 'fix' | 'implement' | 'test' | 'optimize';
  target: string;
  constraints?: {
    budget?: number;
    timeLimit?: number;
    teamSize?: number;
  };
}
```

Key types:
- `IntentAction`: Core action types (refactor, fix, implement, test, optimize)
- `IntentHandler`: Interface for all handlers
- `HandlerResult`: Standard execution result format
- `RouterConfig`: Configuration for routing behavior

### 2. Parser (`src/intent/parser.ts`)

Deterministic parser using rule-based matching with optional LLM enhancement.

**Features:**
- Pattern matching for intent detection
- Keyword-based classification
- Complexity assessment
- Constraint extraction
- Confidence scoring

**Parse Flow:**
1. Normalize input
2. Try LLM parsing (if enabled)
3. Fall back to rule-based parsing
4. Extract task type, target, constraints
5. Return structured `ParsedIntent`

### 3. Router (`src/intent/router.ts`)

Routes intents to appropriate handlers with preprocessing support.

**Features:**
- Action-based routing
- Handler registration/management
- Intent preprocessing
- Fallback handling
- Execution metrics

**Route Flow:**
1. Preprocess intent (apply defaults)
2. Select handler by action type
3. Validate handler can process
4. Execute handler
5. Return result with metrics

### 4. Handlers (`src/intent/handlers/`)

Five specialized handlers for each intent type:

#### Refactor Handler
- **Purpose**: Restructure and improve existing code
- **Strategies**: extract-method, rename, modernize, decouple, simplify
- **Output**: Refactoring plan with phases and checkpoints

#### Fix Handler
- **Purpose**: Resolve bugs and errors
- **Categories**: logic-error, type-error, runtime-error, performance-issue, security-issue
- **Severity**: critical, high, medium, low
- **Output**: Diagnostic and fix plan

#### Implement Handler
- **Purpose**: Create new features and functionality
- **Feature Types**: api, ui, service, database, integration, utility, cli, test-suite
- **Approaches**: from-scratch, incremental, prototype, integration
- **Output**: Implementation plan with deliverables

#### Test Handler
- **Purpose**: Write and run tests
- **Test Types**: unit, integration, e2e, performance, security, contract, snapshot, mutation
- **Frameworks**: jest, vitest, mocha, cypress, playwright
- **Output**: Test plan with coverage targets

#### Optimize Handler
- **Purpose**: Improve performance and efficiency
- **Targets**: performance, memory, cpu, bundle-size, startup-time, throughput, latency
- **Approaches**: profile-and-fix, algorithmic, caching, parallelization, compression, lazy-loading
- **Output**: Optimization plan with performance targets

## Design Principles

### 1. No LLM Dependency (Yet)

The parser works without LLM using deterministic pattern matching:
- Regex patterns for intent detection
- Keyword dictionaries for classification
- Rule-based complexity assessment
- Optional LLM enhancement for future improvement

### 2. Command Pattern

Each handler implements the `IntentHandler` interface:
```typescript
interface IntentHandler {
  readonly action: IntentAction;
  readonly name: string;
  readonly description: string;
  execute(intent: Intent): Promise<HandlerResult>;
  canHandle(intent: Intent): boolean;
}
```

### 3. Extensibility

- Easy to add new handlers
- Configurable preprocessing
- Pluggable routing strategies
- Custom pattern support

### 4. Type Safety

Full TypeScript support with:
- Strict interfaces
- Exhaustive type checking
- Proper error handling
- Documentation annotations

## Usage Examples

### Direct API Usage

```typescript
import { createRouter, Intent } from '@godel/intent';

const router = createRouter();

const intent: Intent = {
  action: 'refactor',
  target: 'auth module',
  constraints: {
    budget: 50,
    timeLimit: 60,
  }
};

const result = await router.route(intent);
console.log(result);
```

### CLI Usage

```bash
# Refactor command
godel do "refactor the authentication module"

# Fix command  
godel do "fix bug in payment processing"

# Implement command
godel do "implement user authentication with JWT"

# Test command
godel do "write unit tests for the API"

# Optimize command
godel do "optimize database query performance"
```

### Dry Run Mode

```bash
godel do "implement user dashboard" --dry-run
```

## File Structure

```
src/intent/
├── types.ts                 # Core type definitions
├── parser.ts               # Natural language parser
├── router.ts               # Intent router
├── executor.ts             # Execution orchestrator
├── complexity-analyzer.ts  # Code complexity analysis
├── team-config-generator.ts # Team configuration
├── index.ts                # Module exports
├── handlers/
│   ├── index.ts            # Handler exports
│   ├── base.ts             # Abstract base handler
│   ├── refactor.ts         # Refactoring handler
│   ├── fix.ts              # Bug fix handler
│   ├── implement.ts        # Implementation handler
│   ├── test.ts             # Testing handler
│   └── optimize.ts         # Optimization handler
```

## Integration Points

### With CLI (`src/cli/intent/`)

The CLI module (`src/cli/intent/`) integrates with this core intent system:
- Uses the parser for NL understanding
- Routes to handlers for plan generation
- Executes plans via the executor

### Future LLM Integration

Designed for future LLM integration:
- `LLMService` interface ready for implementation
- Parser supports `useLLM` configuration
- Fallback to rule-based parsing ensures reliability

### Team Orchestration

Handlers integrate with team orchestration:
- Generate team configurations
- Estimate effort and cost
- Spawn appropriate agents

## Performance Considerations

- **Parse Time**: < 10ms for rule-based parsing
- **Router Overhead**: < 1ms per intent
- **Handler Execution**: Async, non-blocking
- **Memory**: Stateless handlers, minimal footprint

## Error Handling

- **Parse Errors**: Return error with suggestions
- **Routing Errors**: Fallback handler or clear error
- **Handler Errors**: Wrapped in HandlerResult with error details
- **Validation Errors**: Pre-execution validation with specific messages

## Future Enhancements

1. **LLM Integration**: Primary parsing with LLM
2. **Intent Chaining**: Multi-step intent pipelines
3. **Context Awareness**: Project-aware intent resolution
4. **Learning**: Pattern learning from successful executions
5. **Multi-language**: Support for intent in multiple languages

## Code Quality

- **Build**: TypeScript compilation passes
- **Types**: Full type safety throughout
- **Documentation**: JSDoc comments on all public APIs
- **Testing**: Ready for unit test implementation
