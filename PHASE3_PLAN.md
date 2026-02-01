# Phase 3: Reasoning Features

**Goal:** Implement reasoning traces, decision logging, quality gates, and critique integration  
**Reference:** SPEC_V3.md Part V (Reasoning Trace System) and Part IV (Quality Gate Framework)  
**Status:** Planning (awaiting Phase 2 build green)

---

## Workstreams

### 1. Reasoning Traces (`phase3-reasoning-traces`)

**Files to create:**
- `src/reasoning/types.ts` — ReasoningTrace, DecisionLog, ConfidenceTracking interfaces
- `src/reasoning/traces.ts` — Trace recording, storage, retrieval
- `src/reasoning/decisions.ts` — Decision logging, alternatives, evaluation
- `src/reasoning/confidence.ts` — Confidence tracking, warning thresholds
- `src/reasoning/index.ts` — Module exports
- `src/cli/commands/reasoning.ts` — CLI commands

**CLI commands (from SPEC_V3):**
```bash
dash reasoning trace <agent-id> --type <hypothesis|analysis|decision|correction> --content <text> --evidence <files> --confidence <0-1>
dash reasoning decisions <agent-id>
dash reasoning summarize <task-id>
dash reasoning analyze <agent-id> --check-confidence-evidence
```

**Types from SPEC_V3:**
```typescript
interface ReasoningTrace {
  id: string;
  agentId: string;
  taskId?: string;
  timestamp: Date;
  type: 'hypothesis' | 'analysis' | 'decision' | 'correction';
  content: string;
  evidence: string[];
  confidence: number;
  parentTraceId?: string;
  childTraceIds: string[];
}

interface DecisionLog {
  id: string;
  agentId: string;
  timestamp: Date;
  decision: string;
  alternatives: string[];
  criteria: string[];
  evaluation: string;
  outcome?: string;
  confidence: number;
}

interface ConfidenceTracking {
  traceId: string;
  confidenceOverTime: { timestamp: Date; confidence: number }[];
  evidenceCount: number;
  lastEvidenceUpdate: Date;
  warningThreshold: number;
}
```

---

### 2. Quality Gates (`phase3-quality-gates`)

**Files to create:**
- `src/quality/types.ts` — QualityCriterion, QualityGate interfaces (extend existing)
- `src/quality/gates.ts` — Gate evaluation, weighted scoring
- `src/quality/criteria.ts` — Dimension handlers (correctness, completeness, etc.)
- `src/cli/commands/quality.ts` — Extend with gate commands

**CLI commands (from SPEC_V3):**
```bash
dash quality gate <task-id> --criteria <json>
dash quality lint <agent-id>
dash quality types <agent-id> --strict
dash quality security <agent-id> --cwe-list <list>
```

**Types from SPEC_V3:**
```typescript
interface QualityCriterion {
  dimension: 'correctness' | 'completeness' | 'consistency' | 'clarity' | 
             'performance' | 'security' | 'style' | 'type_safety' | 'test_coverage';
  weight: number;
  threshold: number;
}

interface QualityGate {
  type: 'critique' | 'test' | 'lint' | 'types' | 'security' | 'manual';
  criteria: QualityCriterion[];
  passingThreshold: number;
  maxIterations: number;
  autoRetry: boolean;
}
```

---

### 3. Critique System (`phase3-critique`)

**Files to create:**
- `src/critique/types.ts` — CritiqueRequest, CritiqueResult, SynthesisResult
- `src/critique/engine.ts` — Critique orchestration, multi-agent critique
- `src/critique/synthesis.ts` — Consensus/best-argument synthesis
- `src/critique/index.ts` — Module exports
- `src/cli/commands/critique.ts` — CLI commands

**CLI commands (from SPEC_V3):**
```bash
dash critique create --target-agent <agent-id> --dimensions <comma-list> --threshold <0-1>
dash critique status <critique-id>
dash critique synthesize <critique-id-1> <critique-id-2> [--type consensus|best-argument]
```

---

### 4. Integration Tests (`phase3-tests`)

**Files to create:**
- `tests/reasoning/traces.test.ts`
- `tests/reasoning/decisions.test.ts`
- `tests/quality/gates.test.ts`
- `tests/critique/engine.test.ts`

---

## Dependencies

- Phase 2 must be complete (build green)
- Agent/Task models from Phase 1
- Event system from Phase 1

## Spawn Commands

```bash
# When Phase 2 is complete, spawn these workstreams:

# Workstream 1: Reasoning Traces
sessions_spawn phase3-reasoning-traces "Implement reasoning trace system per SPEC_V3 Part V..."

# Workstream 2: Quality Gates
sessions_spawn phase3-quality-gates "Implement quality gate framework per SPEC_V3 Part IV..."

# Workstream 3: Critique System
sessions_spawn phase3-critique "Implement critique orchestration and synthesis..."

# Workstream 4: Integration Tests
sessions_spawn phase3-tests "Write tests for Phase 3 modules..."
```

---

## Success Criteria

- [ ] `npm run build` passes with 0 errors
- [ ] `npm test` passes with >90% coverage on new code
- [ ] CLI commands work: `dash reasoning`, `dash quality gate`, `dash critique`
- [ ] Integration with Agent/Task models verified
- [ ] Events emitted for all reasoning/quality actions
