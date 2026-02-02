# SPEC: Natural Language Intent Parsing for Dash

**Version:** 1.0  
**Date:** 2026-02-01  
**Status:** Draft  
**Source:** Interview via Claude Code CLI subagent + existing Dash documentation

---

## Executive Summary

This spec defines natural language intent parsing for Dash, enabling users to express goals in natural language that are automatically:
1. Parsed into discrete tasks
2. Assigned to appropriate agents
3. Configured with quality gates
4. Orchestrated for execution

**Current State:** Manual task creation via explicit commands  
**Target State:** `dash "Build me a REST API for user management with auth"` → automatic orchestration

---

## Problem Statement

Current Dash requires explicit, technical task definitions:
```bash
dash tasks create --title "Build API" --agent swarms
dash quality add --task <id> --gate critique
dash agents spawn --swarm <id>
```

This creates a barrier for non-technical users and slows down rapid prototyping.

---

## User Personas

1. **Product Manager** - Describes features in user story format
2. **Developer** - Expresses technical tasks in natural language
3. **DevOps Engineer** - Describes infrastructure needs conversationally
4. **Non-Technical Stakeholder** - Describes goals without technical jargon

---

## Functional Requirements

### FR1: Intent Classification Taxonomy

#### FR1.1: Intent Categories

| Category | Examples | Complexity | Typical Tasks |
|----------|----------|------------|---------------|
| **Build** | "Build a REST API", "Create a React component", "Write a function" | Medium | 3-7 tasks |
| **Fix** | "Fix the login bug", "Repair the build", "Debug the API" | Low | 1-3 tasks |
| **Refactor** | "Clean up the codebase", "Optimize performance", "Modernize the UI" | High | 5-10 tasks |
| **Research** | "Find the best auth library", "Investigate the error", "Explore alternatives" | Medium | 2-5 tasks |
| **Test** | "Write tests for the API", "Add unit tests", "Create integration tests" | Low | 2-4 tasks |
| **Deploy** | "Deploy to production", "Ship the update", "Release version 2.0" | Medium | 3-5 tasks |
| **Document** | "Write docs for the API", "Create README", "Document the flow" | Low | 1-3 tasks |
| **Analyze** | "Analyze performance", "Review the code", "Audit security" | Medium | 2-4 tasks |

#### FR1.2: Entity Extraction

```typescript
interface ExtractedEntities {
  // Target type
  targetType?: 'api' | 'component' | 'function' | 'service' | 'database' | 'infrastructure';
  
  // Technology stack
  techStack?: {
    language?: string;  // 'typescript', 'python', 'go'
    framework?: string;  // 'react', 'express', 'fastify'
    database?: string;  // 'postgresql', 'mongodb', 'redis'
    cloud?: string;  // 'aws', 'gcp', 'azure'
  };
  
  // Operations
  operations?: string[];  // ['create', 'read', 'update', 'delete', 'auth']
  
  // Quality requirements
  quality?: {
    tests?: boolean;
    docs?: boolean;
    typeSafety?: boolean;
    linting?: boolean;
  };
  
  // Scope
  scope?: {
    files?: string[];
    modules?: string[];
    depth?: 'shallow' | 'medium' | 'deep';
  };
}

function parseIntent(input: string): IntentParseResult {
  // Parse the natural language input
  // Extract entities using NLP/pattern matching
  // Return structured intent + confidence score
}
```

#### FR1.3: Intent Schema

```typescript
interface ParsedIntent {
  id: string;
  originalInput: string;
  
  category: IntentCategory;
  entities: ExtractedEntities;
  
  // Task decomposition
  tasks: DecomposedTask[];
  
  // Agent assignment
  agentConfig: AgentConfiguration;
  
  // Quality gates
  qualityGates: QualityGateConfig[];
  
  // Confidence
  confidence: {
    overall: number;  // 0-1
    category: number;
    entities: number;
    decomposition: number;
  };
  
  // Warnings
  warnings: string[];
  suggestions: string[];
}

type IntentCategory = 
  | 'build' 
  | 'fix' 
  | 'refactor' 
  | 'research' 
  | 'test' 
  | 'deploy' 
  | 'document' 
  | 'analyze';
```

### FR2: Parsing Algorithm

#### FR2.1: Multi-Stage Parsing

```
Input: "Build a REST API for user management with auth"

Stage 1: Normalization
├─ Lowercase
├─ Remove extra whitespace
└─ Standardize punctuation

Stage 2: Pattern Matching
├─ Match intent keywords (build, fix, deploy, etc.)
├─ Extract technology patterns (react, python, api, etc.)
└─ Identify operation patterns (crud, auth, test, etc.)

Stage 3: Entity Extraction
├─ Extract target type (api, component, service, etc.)
├─ Identify tech stack (typescript, express, postgresql, etc.)
└─ Determine quality requirements (tests, docs, types)

Stage 4: Task Decomposition
├─ Break into atomic tasks
├─ Determine task dependencies
└─ Estimate complexity

Stage 5: Agent Selection
├─ Match requirements to agent capabilities
└─ Configure agent parameters

Stage 6: Quality Gate Configuration
├─ Determine required gates based on category
└─ Set thresholds based on complexity

Output: ParsedIntent with tasks, agents, quality gates
```

#### FR2.2: Confidence Scoring

```typescript
interface ConfidenceScore {
  overall: number;
  breakdown: {
    category: number;  // How confident in category classification
    entities: number;  // How confident in entity extraction
    decomposition: number;  // How confident in task breakdown
  };
  factors: {
    matchedPatterns: number;
    ambiguousTerms: number;
    missingContext: number;
  };
}

function calculateConfidence(input: string, parse: ParsedIntent): ConfidenceScore {
  // Count pattern matches
  // Identify ambiguous terms
  // Flag missing context
  // Return weighted confidence score
}
```

### FR3: Task Decomposition

#### FR3.1: Decomposition Rules

| Category | Typical Task Count | Task Types |
|----------|-------------------|------------|
| Build | 3-7 | plan, implement, test, document |
| Fix | 1-3 | diagnose, implement, verify |
| Refactor | 5-10 | analyze, plan, refactor, test, document |
| Research | 2-5 | search, analyze, summarize |
| Test | 2-4 | write, run, verify |
| Deploy | 3-5 | build, test, deploy, verify |
| Document | 1-3 | write, review, publish |
| Analyze | 2-4 | scan, analyze, report |

#### FR3.2: Task Schema

```typescript
interface DecomposedTask {
  id: string;
  title: string;
  description: string;
  category: IntentCategory;
  
  dependencies: string[];  // Task IDs this depends on
  
  estimatedComplexity: 'low' | 'medium' | 'high';
  estimatedTokens: number;
  
  agentRequirements: {
    capabilities: string[];
    modelPreference?: string;
    maxTokens?: number;
  };
  
  qualityRequirements: {
    tests?: boolean;
    linting?: boolean;
    docs?: boolean;
    typeCheck?: boolean;
  };
}

function decomposeIntent(category: IntentCategory, entities: ExtractedEntities): DecomposedTask[] {
  // Return array of decomposed tasks
}
```

### FR4: Agent Selection

#### FR4.1: Agent Matching

```typescript
interface AgentRequirements {
  capabilities: string[];  // ['typescript', 'react', 'testing']
  modelPreference?: string;
  maxTokens?: number;
  costConstraint?: number;
}

interface AgentCapability {
  id: string;
  name: string;
  capabilities: string[];
  models: string[];
  maxContext: number;
  costPerToken: number;
}

function selectAgent(requirements: AgentRequirements): AgentCapability {
  // Match requirements to available agents
  // Consider capabilities, models, cost
  // Return best match with confidence
}
```

#### FR4.2: Default Agent Templates

```yaml
# dash-intent-defaults.yaml
agents:
  build:
    default: "full-stack-developer"
    variants:
      frontend: "frontend-specialist"
      backend: "backend-specialist"
      api: "api-specialist"
  
  fix:
    default: "bug-fixer"
    variants:
      critical: "senior-developer"
      simple: "junior-developer"
  
  test:
    default: "qa-engineer"
  
  document:
    default: "technical-writer"
  
  research:
    default: "research-analyst"
```

### FR5: Quality Gate Configuration

#### FR5.1: Category-Based Gates

| Category | Required Gates | Optional Gates |
|----------|---------------|----------------|
| Build | critique, test | security, performance |
| Fix | test | lint, type-check |
| Refactor | test, lint | type-check, performance |
| Research | none | summary, citations |
| Test | test-run | coverage, lint |
| Deploy | test, integration | security, performance |
| Document | review | lint |
| Analyze | report | recommendations |

#### FR5.2: Gate Configuration

```typescript
interface QualityGateConfig {
  type: 'critique' | 'test' | 'lint' | 'type-check' | 'security' | 'performance';
  required: boolean;
  config?: {
    threshold?: number;
    coverage?: number;
    strictness?: 'lenient' | 'normal' | 'strict';
  };
}
```

### FR6: Error Handling & Ambiguity

#### FR6.1: Confidence Thresholds

| Confidence Level | Action |
|-----------------|--------|
| > 0.9 | Auto-execute |
| 0.7-0.9 | Confirm before execute |
| 0.5-0.7 | Show breakdown, confirm |
| 0.3-0.5 | Ask clarifying questions |
| < 0.3 | Request rephrasing |

#### FR6.2: Ambiguity Detection

```typescript
interface Ambiguity {
  type: 'technology' | 'scope' | 'operation' | 'quality';
  term: string;
  possibleInterpretations: string[];
  suggestion: string;
}

function detectAmbiguities(input: string, parse: ParsedIntent): Ambiguity[] {
  // Check for ambiguous terms
  // Flag multiple interpretations
  // Suggest clarifying questions
}
```

#### FR6.3: Clarifying Questions

```typescript
interface ClarifyingQuestion {
  id: string;
  ambiguity: string;
  question: string;
  options?: string[];
  freeform?: boolean;
}

const CLARIFYING_QUESTIONS = {
  technology: [
    "Which programming language should I use?",
    "What framework do you prefer?",
    "Which database should I use?",
  ],
  scope: [
    "Which files should I focus on?",
    "How deep should I go with this?",
    "What's the scope of this change?",
  ],
  operation: [
    "What specific operations do you need?",
    "Should this include authentication?",
    "Do you need CRUD operations?",
  ],
  quality: [
    "Do you need tests?",
    "Should I include documentation?",
    "How strict should linting be?",
  ],
};
```

### FR7: Learning from Corrections

#### FR7.1: Feedback Loop

```typescript
interface IntentFeedback {
  intentId: string;
  userId: string;
  feedback: {
    categoryCorrect: boolean;
    entitiesCorrect: boolean;
    tasksComplete: boolean;
    agentAppropriate: boolean;
  };
  corrections?: {
    field: string;
    original: string;
    corrected: string;
  };
  rating: number;  // 1-5
}

function recordFeedback(feedback: IntentFeedback): void {
  // Store feedback
  // Update parsing model weights
  // Improve future interpretations
}
```

#### FR7.2: Pattern Learning

```bash
# User corrects parsing
$ dash "build an api"
[INTENT] Detected: build → API
[INTENT] Tech stack: unknown
[INTENT] Tasks: 5
[INTENT] Confidence: 0.72

$ dash accept --edit "tech-stack=typescript" "tasks=7"
[INTENT] Updated: tech-stack=typescript, tasks=7
[INTENT] Pattern learned: "build api" → TypeScript, 7 tasks

# Future similar intents will use learned pattern
```

---

## UX/CLI Design

### Commands

```bash
# Natural language intent
dash "Build a REST API for user management with auth"
dash "Fix the login bug on the homepage"
dash "Write unit tests for the user service"

# With options
dash "Build an API" --confirm           # Confirm before execute
dash "Deploy to production" --dry-run    # Preview only
dash "Research auth libraries" --output json  # Machine-readable

# Clarifying questions
dash "Build an API" --interactive
[INTENT] Which language? (typescript/python/go): typescript
[INTENT] Which framework? (express/fastify/nestjs): fastify
[INTENT] Database? (postgresql/mongodb/none): postgresql
[INTENT] Auth needed? (yes/no): yes

# Feedback
dash feedback --intent <id> --rating 4
dash feedback --intent <id> --correct "tasks=5"
```

### Interactive Mode

```bash
$ dash "build a web app"
╔═══════════════════════════════════════════════════════════════╗
║                     INTENT PARSING RESULT                      ║
╠═══════════════════════════════════════════════════════════════╣
║ Input: "build a web app"                                       ║
╠═══════════════════════════════════════════════════════════════╣
║ Category: build (confidence: 0.94)                             ║
║ Entities:                                                      ║
║   - Type: web-app (inferred)                                  ║
║   - Stack: unknown                                            ║
╠═══════════════════════════════════════════════════════════════╣
║ Tasks (5):                                                     ║
║   1. Plan project structure                                   ║
║   2. Set up frontend scaffold                                 ║
║   3. Set up backend API                                       ║
║   4. Implement core features                                  ║
║   5. Add tests and documentation                              ║
╠═══════════════════════════════════════════════════════════════╣
║ Confidence: 0.72 (low - clarifying questions recommended)     ║
╠═══════════════════════════════════════════════════════════════╣
║ ⚠️  Clarifying questions:                                     ║
║   1. Which language? (typescript/python/ruby)                 ║
║   2. Which framework? (react/vue/angular)                     ║
║   3. Backend needed? (yes/no)                                 ║
╠═══════════════════════════════════════════════════════════════╣
║ [y] Execute with defaults    [e] Edit    [c] Clarify    [n] Cancel ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Technical Constraints

### Performance

| Operation | Target Latency |
|-----------|----------------|
| Intent parsing | < 500ms |
| Task decomposition | < 200ms |
| Agent selection | < 100ms |
| Full parse + preview | < 1s |

### Scalability

- Maximum intent length: 1000 characters
- Maximum tasks per intent: 20
- Maximum parallel interpretations: 3

### Integration Points

| Component | Integration Method |
|-----------|-------------------|
| Dash Tasks | Create tasks from decomposition |
| Dash Agents | Select and configure agents |
| Dash Quality | Configure quality gates |
| Dash Reasoning | Record intent parsing reasoning |

---

## Edge Cases & Error Handling

### EC1: Unparseable Input

**Scenario:** Input is gibberish or unrelated text

**Handling:**
1. Return confidence = 0
2. Suggest rephrasing
3. Offer examples

### EC2: Multiple Interpretations

**Scenario:** Input could mean multiple things

**Handling:**
1. Show top 3 interpretations
2. Ask user to select
3. Learn from selection

### EC3: Contradictory Requirements

**Scenario:** User specifies conflicting requirements

**Handling:**
1. Flag contradiction
2. Ask for clarification
3. Suggest resolution

### EC4: Out of Scope Request

**Scenario:** Request requires external tools not available

**Handling:**
1. Explain limitation
2. Suggest alternative approach
3. Offer partial execution

---

## Trade-offs

| Decision | Trade-off | Rationale |
|----------|-----------|-----------|
| Pattern-based parsing | Less flexible than LLM | Faster, deterministic, auditable |
| Max 20 tasks | May not handle complex requests | Prevents explosion, encourages decomposition |
| Fixed agent templates | Less flexibility | Consistency, predictability |
| Confidence thresholds | May ask too many questions | Balances automation vs. accuracy |

---

## Future Considerations

### FC1: LLM-Enhanced Parsing

Use LLM for intent parsing when patterns are insufficient.

### FC2: Learning from History

Improve parsing based on user's past intents and corrections.

### FC3: Context-Aware Parsing

Use project context (package.json, etc.) to inform parsing.

### FC4: Multi-Language Support

Support intent parsing in multiple languages.

---

## Open Questions

1. **Q:** Should parsing be deterministic or use LLM?
   **A:** Hybrid approach - pattern-based first, LLM for ambiguity

2. **Q:** How to handle very large requests?
   **A:** Suggest breaking into smaller intents

3. **Q:** Should parsing consider project context?
   **A:** Yes, infer from package.json, existing code structure

4. **Q:** How to handle domain-specific terminology?
   **A:** Allow custom vocabulary configuration

---

## Implementation Plan

### Phase 1: Core Parsing
1. Implement intent classification
2. Implement entity extraction
3. Create pattern library
4. Build CLI commands

### Phase 2: Decomposition
1. Implement task decomposition
2. Create agent matching
3. Build quality gate configuration

### Phase 3: Ambiguity Handling
1. Implement confidence scoring
2. Create clarifying questions
3. Build interactive mode

### Phase 4: Learning
1. Implement feedback loop
2. Create pattern learning
3. Build analytics dashboard

---

## Acceptance Criteria

- [ ] Intent classification works for 8 categories
- [ ] Entity extraction captures tech stack, operations, quality
- [ ] Task decomposition produces 3-10 tasks per intent
- [ ] Agent selection matches requirements
- [ ] Confidence scoring guides user interaction
- [ ] Ambiguity detection asks clarifying questions
- [ ] CLI commands work as specified
- [ ] All tests pass
- [ ] Documentation complete

---

**Document Version:** 1.0  
**Created:** 2026-02-01  
**Next Review:** After implementation prototype
