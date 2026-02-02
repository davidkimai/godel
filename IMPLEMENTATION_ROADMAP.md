# Dash — Implementation Roadmap & Swarm Orchestration Guide

**Version:** 1.0  
**Date:** 2026-02-01  
**Status:** Active  
**Primary Model:** Kimi K2.5 (moonshot/kimi-k2-5)  
**Derived From:** DASH_PRD_V2.md, MISSION_CONTROL_SPEC_V3.md, PHASE2_PROGRESS.md, PHASE3_PLAN.md

---

## Table of Contents

1. [Swarm Orchestration Architecture](#1-swarm-orchestration-architecture)
2. [Phase 1: Core Foundation — Cleanup & Stabilization](#phase-1-core-foundation--cleanup--stabilization)
3. [Phase 2: Code Features — Build Fixes & Completion](#phase-2-code-features--build-fixes--completion)
4. [Phase 3: Reasoning Features](#phase-3-reasoning-features)
5. [Phase 4: Safety Framework](#phase-4-safety-framework)
6. [Phase 5: Advanced Integration](#phase-5-advanced-integration)
7. [Swarm Spawn Commands](#7-swarm-spawn-commands)
8. [Verification Checklist](#8-verification-checklist)
9. [Milestone Timeline](#9-milestone-timeline)

---

## 1. Swarm Orchestration Architecture

### 1.1 Primary Model Configuration

```bash
# Default model for all swarm operations
export DEFAULT_MODEL=moonshot/kimi-k2-5

# When spawning subagents, always use:
sessions_spawn --model moonshot/kimi-k2-5
```

**Why Kimi K2.5?**
- Strong CLI/code generation capabilities
- Excellent for TypeScript projects
- Good reasoning for complex orchestration tasks
- Cost-effective for high-volume swarm operations

### 1.2 Swarm Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator (Kimi K2.5)                      │
│  Primary session managing overall progress, spawning subagents   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Workstream A  │   │ Workstream B  │   │ Workstream C  │
│ (Isolated)    │   │ (Isolated)    │   │ (Isolated)    │
│ Kimi K2.5     │   │ Kimi K2.5     │   │ Kimi K2.5     │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Integration Tests  │
                    │  (Shared Context)   │
                    └─────────────────────┘
```

### 1.3 Swarm Communication Pattern

```bash
# Orchestrator → Subagent: Task assignment
sessions_spawn --label "dash-fix-build-errors" \
  --task "Fix the 24 TypeScript build errors..." \
  --model moonshot/kimi-k2-5

# Subagent → Orchestrator: Progress updates
# Via comments in shared document or cron heartbeat

# Subagent → Orchestrator: Completion signal
# Via sessions_send with "COMPLETED" or "BLOCKED"
```

---

## Phase 1: Core Foundation — Cleanup & Stabilization

**Goal:** Fix 24 TypeScript build errors, verify Phase 1 completion  
**Primary Model:** Kimi K2.5  
**Target:** 0 build errors, 172+ tests passing  
**Status:** 🔄 Active

### 1.1 Workstream: Build Error Resolution

**Subagent:** `phase1-build-fix`  
**Task:** Fix all 24 TypeScript build errors preventing `npm run build`

**Known Issues to Fix:**
1. Missing exports (`parseImports`, `parseExports`) from context/index.ts
2. Import path issues (`.js` extensions in TypeScript imports)
3. `LanguageType | null` type mismatches in context/parser.ts
4. Missing `filesScanned` property in error returns
5. Quality module default export issues
6. TestFramework null handling in testing/runner.ts
7. CLI command argument/type issues in commands/*.ts

**Files Involved:**
- `src/context/index.ts` — Export missing functions
- `src/context/parser.ts` — Fix LanguageType handling
- `src/quality/index.ts` — Fix default export
- `src/testing/runner.ts` — Fix TestFramework nulls
- `src/cli/commands/*.ts` — Fix argument types

**Verification:**
```bash
cd /Users/jasontang/clawd/projects/mission-control
npm run build  # Must exit 0
npm test       # Must pass with 0 failures
```

### 1.2 Workstream: Context Analyze/Optimize

**Subagent:** `phase1-context-tools`  
**Task:** Implement `dash context analyze` and `dash context optimize` commands

**Requirements:**
- Analyze context usage per agent
- Suggest optimizations (compress, archive, remove)
- `--aggressive` flag for aggressive optimization
- Output: actionable recommendations

**Files to Create/Modify:**
- `src/context/analyze.ts` — New file
- `src/context/optimize.ts` — New file
- `src/cli/commands/context.ts` — Add analyze/optimize commands

**Verification:**
```bash
dash context analyze <agent-id>
dash context optimize <agent-id> --aggressive
# Both commands complete without errors
```

### 1.3 Workstream: Agent Pause/Resume/Retry

**Subagent:** `phase1-agent-lifecycle`  
**Task:** Implement missing agent lifecycle commands

**Commands to Implement:**
- `dash agents pause <agent-id>`
- `dash agents resume <agent-id>`
- `dash agents retry <agent-id> [--skip-backoff]`

**Files to Modify:**
- `src/cli/commands/agents.ts` — Add pause/resume/retry
- `src/models/agent.ts` — Add status transitions
- `src/events/emitter.ts` — Add pause/resume events

**Verification:**
```bash
dash agents pause <agent-id>
dash agents resume <agent-id>
dash agents retry <agent-id>
# All commands work without errors
```

---

## Phase 2: Code Features — Build Fixes & Completion

**Goal:** Complete file tree, test execution, quality gates  
**Primary Model:** Kimi K2.5  
**Target:** All Phase 2 features implemented, 100% test coverage  
**Status:** 📋 Not Started

### 2.1 Workstream: Enhanced Linting

**Subagent:** `phase2-linting-expansion`  
**Task:** Support additional linters beyond ESLint

**Linters to Support:**
- Python: Pylint, flake8, Black, isort
- Go: golangci-lint, gofmt
- Rust: rustfmt, clippy
- Java: Checkstyle

**Files to Create:**
- `src/quality/pylint.ts` — Python linting
- `src/quality/golangci.ts` — Go linting
- `src/quality/rustfmt.ts` — Rust linting

**Configuration:**
```typescript
interface LinterConfig {
  language: string;
  linter: string;
  command: string[];
  outputFormat: 'json' | 'text' | 'xml';
  parseErrors: (output: string) => LintResult[];
}
```

### 2.2 Workstream: Type Checking Integration

**Subagent:** `phase2-type-checking`  
**Task:** Implement `dash quality types` command

**Type Checkers to Support:**
- TypeScript: `tsc --noEmit`
- Python: mypy, pyright
- Go: `go vet`, `go build`
- Rust: `cargo check`

**Commands:**
```bash
dash quality types <agent-id>           # Default strictness
dash quality types <agent-id> --strict  # Maximum strictness
```

**Files to Create:**
- `src/quality/typescript.ts` — TypeScript checking
- `src/quality/mypy.ts` — Python checking
- `src/quality/go.ts` — Go checking

### 2.3 Workstream: Security Scanning

**Subagent:** `phase2-security-scanning`  
**Task:** Implement `dash quality security` command

**Security Tools:**
- SAST: Semgrep, SonarQube
- Dependency: npm audit, safety, Snyk
- Secrets: gitleaks, TruffleHog

**Commands:**
```bash
dash quality security <agent-id>
dash quality security <agent-id> --cwe-list CWE-89,CWE-79
dash quality security <agent-id> --severity critical,high
```

**Files to Create:**
- `src/quality/security/sast.ts` — SAST integration
- `src/quality/security/dependencies.ts` — Dependency scanning
- `src/quality/security/secrets.ts` — Secret detection

### 2.4 Workstream: Quality Gate Framework

**Subagent:** `phase2-quality-gates`  
**Task:** Implement multi-dimensional quality gate evaluation

**Features:**
- Weighted scoring across dimensions
- Configurable thresholds per dimension
- Auto-retry with backoff
- Human escalation on persistent failure

**Files to Create:**
- `src/quality/gates/evaluator.ts` — Gate evaluation logic
- `src/quality/gates/scorer.ts` — Weighted scoring
- `src/quality/gates/reporter.ts` — Result formatting
- `src/cli/commands/quality.ts` — Gate commands

**Verification:**
```bash
dash quality gate <task-id> --criteria correctness:0.3,security:0.2,types:0.15,style:0.15,coverage:0.2 --passing-threshold 0.8
# Returns pass/fail with detailed breakdown
```

---

## Phase 3: Reasoning Features

**Goal:** Reasoning traces, decision logging, confidence tracking  
**Primary Model:** Kimi K2.5  
**Target:** Full reasoning visibility on all agents  
**Status:** 📋 Not Started

### 3.1 Workstream: Reasoning Traces

**Subagent:** `phase3-reasoning-traces`  
**Task:** Implement reasoning trace system

**Files to Create:**
- `src/reasoning/types.ts` — ReasoningTrace, DecisionLog, ConfidenceTracking
- `src/reasoning/traces.ts` — Trace recording, storage, retrieval
- `src/reasoning/decisions.ts` — Decision logging with alternatives
- `src/reasoning/confidence.ts` — Confidence tracking and warnings
- `src/reasoning/index.ts` — Module exports
- `src/cli/commands/reasoning.ts` — CLI commands

**Commands:**
```bash
dash reasoning trace <agent-id> \
  --type hypothesis|analysis|decision|correction \
  --content "Using Redis for caching will improve performance by 40%" \
  --evidence "docs/performance-analysis.md, benchmarks/results.json" \
  --confidence 0.75

dash reasoning decisions <agent-id> --format table
dash reasoning summarize <task-id>
dash reasoning analyze <agent-id> --check-confidence-evidence
```

### 3.2 Workstream: Critique System

**Subagent:** `phase3-critique-system`  
**Task:** Implement multi-agent critique orchestration

**Files to Create:**
- `src/critique/types.ts` — CritiqueRequest, CritiqueResult, SynthesisResult
- `src/critique/engine.ts` — Critique orchestration
- `src/critique/synthesis.ts` — Consensus/best-argument synthesis
- `src/critique/index.ts` — Module exports
- `src/cli/commands/critique.ts` — CLI commands

**Commands:**
```bash
dash critique create --target-agent <agent-id> --dimensions correctness,security,clarity --threshold 0.8
dash critique status <critique-id>
dash critique synthesize <id-1> <id-2> --type consensus|best-argument
```

### 3.3 Workstream: Integration Tests

**Subagent:** `phase3-tests`  
**Task:** Write integration tests for Phase 3 modules

**Test Files:**
- `tests/reasoning/traces.test.ts`
- `tests/reasoning/decisions.test.ts`
- `tests/quality/gates.test.ts`
- `tests/critique/engine.test.ts`

---

## Phase 4: Safety Framework

**Goal:** Ethics boundaries, human escalation, audit trails  
**Primary Model:** Kimi K2.5  
**Target:** Comprehensive safety controls  
**Status:** 📋 Not Started

### 4.1 Workstream: Safety Boundaries

**Subagent:** `phase4-safety-boundaries`  
**Task:** Implement ethics boundaries and dangerous action handling

**Files to Create:**
- `src/safety/types.ts` — SafetyConfig, EthicsBoundaries
- `src/safety/boundaries.ts` — Boundary enforcement
- `src/safety/actions.ts` — Dangerous action classification
- `src/safety/index.ts` — Module exports

**Safety Model:**
```typescript
interface SafetyConfig {
  ethicsBoundaries: {
    doNotHarm: boolean;
    preservePrivacy: boolean;
    noDeception: boolean;
    authorizedAccessOnly: boolean;
  };
  
  dangerousActions: {
    dataDestruction: 'block' | 'confirm' | 'allow';
    agentTermination: 'confirm' | 'allow';
    externalPublishing: 'confirm' | 'block';
    resourceExhaustion: 'block' | 'confirm';
  };
}
```

**Commands:**
```bash
dash safety status
dash safety boundaries list
dash safety boundaries set doNotHarm true
dash safety check --action "rm -rf /prod"
```

### 4.2 Workstream: Human Escalation

**Subagent:** `phase4-escalation`  
**Task:** Implement human escalation workflow

**Files to Create:**
- `src/safety/escalation.ts` — Escalation request/response
- `src/safety/notifications.ts` — Alert routing
- `src/cli/commands/safety.ts` — Safety/escalation commands

**Commands:**
```bash
dash escalation request --type safety --reason "Agent attempted data destruction"
dash escalation list --status pending
dash escalation respond <id> --decision approve|deny --notes "Verified fix applied"
```

### 4.3 Workstream: Audit Trails

**Subagent:** `phase4-audit`  
**Task:** Comprehensive action logging for compliance

**Files to Create:**
- `src/safety/audit.ts` — Audit log storage
- `src/cli/commands/audit.ts` — Audit query commands

**Commands:**
```bash
dash audit log --agent <id> --since "1h ago"
dash audit export --format json --output audit.json
```

---

## Phase 5: Advanced Integration

**Goal:** CI/CD, Git operations, analytics  
**Primary Model:** Kimi K2.5  
**Target:** Enterprise-ready platform  
**Status:** 📋 Not Started

### 5.1 Workstream: CI/CD Integration

**Subagent:** `phase5-cicd`  
**Task:** GitHub Actions, GitLab CI integration

**Files to Create:**
- `src/ci/github.ts` — GitHub Actions integration
- `src/ci/gitlab.ts` — GitLab CI integration
- `src/ci/runner.ts` — Pipeline execution
- `src/cli/commands/ci.ts` — CI commands

**Commands:**
```bash
dash ci run <agent-id> --pipeline "test-and-lint"
dash ci status <run-id>
dash ci deploy <run-id> --environment staging
```

### 5.2 Workstream: Git Operations

**Subagent:** `phase5-git`  
**Task:** Branch, commit, PR creation

**Files to Create:**
- `src/git/operations.ts` — Git operations
- `src/git/pr.ts` — PR creation
- `src/cli/commands/git.ts` — Git commands

**Commands:**
```bash
dash git create-branch feature/new-api
dash git commit <agent-id> --message "feat: Implement new API endpoint"
dash git pr-create <agent-id> --title "Feature: New API" --body "Implements..."
```

### 5.3 Workstream: Analytics Dashboard

**Subagent:** `phase5-analytics`  
**Task:** Metrics, reporting, cost tracking

**Files to Create:**
- `src/analytics/metrics.ts` — Metrics collection
- `src/analytics/reporting.ts` — Report generation
- `src/analytics/cost.ts` — Cost attribution
- `src/cli/commands/analytics.ts` — Analytics commands

**Commands:**
```bash
dash analytics agents --metric tokens,cost,runtime
dash analytics bottlenecks
dash analytics cost --group swarm --rollup monthly
dash analytics cascade-risk --swarm <swarm-id>
```

---

## 7. Swarm Spawn Commands

### 7.1 Immediate Spawn Commands

```bash
# Phase 1: Build Fix (IMMEDIATE - blocking all other work)
sessions_spawn \
  --label "phase1-build-fix" \
  --model moonshot/kimi-k2-5 \
  --task "Fix the 24 TypeScript build errors in /Users/jasontang/clawd/projects/mission-control. 
Focus on: (1) Missing exports from context/index.ts, (2) Import path .js issues, 
(3) LanguageType | null mismatches, (4) Missing filesScanned in errors.
Run 'npm run build' to verify. Report each fixed error with file and line number."

# Phase 1: Context Tools (after build passes)
sessions_spawn \
  --label "phase1-context-tools" \
  --model moonshot/kimi-k2-5 \
  --task "Implement 'dash context analyze' and 'dash context optimize' commands.
Analyze should show context usage breakdown, suggest optimizations.
Optimize should compress/archive old context with --aggressive flag.
Add to src/cli/commands/context.ts"

# Phase 1: Agent Lifecycle (after build passes)
sessions_spawn \
  --label "phase1-agent-lifecycle" \
  --model moonshot/kimi-k2-5 \
  --task "Implement missing agent lifecycle commands:
- dash agents pause <id>
- dash agents resume <id>
- dash agents retry <id> [--skip-backoff]
Update src/cli/commands/agents.ts and emit events for each action."
```

### 7.2 Phase 2 Spawn Commands

```bash
# After Phase 1 complete:

# Workstream 1: Enhanced Linting
sessions_spawn \
  --label "phase2-linting-expansion" \
  --model moonshot/kimi-k2-5 \
  --task "Implement additional linter support beyond ESLint:
- Python: Pylint, flake8, Black, isort
- Go: golangci-lint
- Rust: rustfmt, clippy
Create src/quality/pylint.ts, src/quality/golangci.ts, src/quality/rustfmt.ts"

# Workstream 2: Type Checking
sessions_spawn \
  --label "phase2-type-checking" \
  --model moonshot/kimi-k2-5 \
  --task "Implement 'dash quality types' command supporting:
- TypeScript: tsc --noEmit
- Python: mypy, pyright
- Go: go vet
Create src/quality/typescript.ts, src/quality/mypy.ts, src/quality/go.ts"

# Workstream 3: Security Scanning
sessions_spawn \
  --label "phase2-security-scanning" \
  --model moonshot/kimi-k2-5 \
  --task "Implement 'dash quality security' command:
- SAST: Semgrep integration
- Dependency: npm audit, safety
- Secrets: gitleaks
Create src/quality/security/sast.ts, src/quality/security/dependencies.ts, src/quality/security/secrets.ts"

# Workstream 4: Quality Gates
sessions_spawn \
  --label "phase2-quality-gates" \
  --model moonshot/kimi-k2-5 \
  --task "Implement multi-dimensional quality gate framework:
- Weighted scoring across correctness, security, types, style, coverage
- Configurable thresholds per dimension
- Auto-retry with backoff
Create src/quality/gates/evaluator.ts, src/quality/gates/scorer.ts"
```

### 7.3 Phase 3 Spawn Commands

```bash
# After Phase 2 complete:

# Workstream 1: Reasoning Traces
sessions_spawn \
  --label "phase3-reasoning-traces" \
  --model moonshot/kimi-k2-5 \
  --task "Implement reasoning trace system per DASH_PRD_V2 Section 3.5:
- ReasoningTrace, DecisionLog, ConfidenceTracking types
- Trace recording, storage, retrieval
- Confidence-evidence alignment checking
Create src/reasoning/types.ts, traces.ts, decisions.ts, confidence.ts, and CLI commands"

# Workstream 2: Critique System
sessions_spawn \
  --label "phase3-critique-system" \
  --model moonshot/kimi-k2-5 \
  --task "Implement multi-agent critique orchestration:
- CritiqueRequest, CritiqueResult, SynthesisResult types
- Consensus and best-argument synthesis
Create src/critique/types.ts, engine.ts, synthesis.ts, and CLI commands"

# Workstream 3: Integration Tests
sessions_spawn \
  --label "phase3-tests" \
  --model moonshot/kimi-k2-5 \
  --task "Write integration tests for Phase 3 modules:
- tests/reasoning/traces.test.ts
- tests/reasoning/decisions.test.ts
- tests/quality/gates.test.ts
- tests/critique/engine.test.ts"
```

### 7.4 Phase 4 Spawn Commands

```bash
# After Phase 3 complete:

# Workstream 1: Safety Boundaries
sessions_spawn \
  --label "phase4-safety-boundaries" \
  --model moonshot/kimi-k2-5 \
  --task "Implement safety framework per DASH_PRD_V2 Section 3.7:
- Ethics boundaries (doNotHarm, preservePrivacy, noDeception, authorizedAccessOnly)
- Dangerous action classification (block/confirm/allow)
- SafetyConfig type with escalationTriggers
Create src/safety/types.ts, boundaries.ts, actions.ts"

# Workstream 2: Human Escalation
sessions_spawn \
  --label "phase4-escalation" \
  --model moonshot/kimi-k2-5 \
  --task "Implement human escalation workflow:
- dash escalation request --type safety|quality|cost
- dash escalation list --status pending
- dash escalation respond <id> --decision approve|deny
Create src/safety/escalation.ts and CLI commands"

# Workstream 3: Audit Trails
sessions_spawn \
  --label "phase4-audit" \
  --model moonshot/kimi-k2-5 \
  --task "Implement comprehensive audit logging:
- All agent actions logged with timestamp
- Query by agent, time range, action type
- Export to JSON for compliance
Create src/safety/audit.ts and dash audit log command"
```

### 7.5 Phase 5 Spawn Commands

```bash
# After Phase 4 complete:

# Workstream 1: CI/CD Integration
sessions_spawn \
  --label "phase5-cicd" \
  --model moonshot/kimi-k2-5 \
  --task "Implement CI/CD integration:
- GitHub Actions workflow integration
- Pipeline execution (dash ci run)
- Environment promotion (dash ci deploy)
Create src/ci/github.ts, src/ci/gitlab.ts, runner.ts"

# Workstream 2: Git Operations
sessions_spawn \
  --label "phase5-git" \
  --model moonshot/kimi-k2-5 \
  --task "Implement Git operations:
- dash git create-branch <name>
- dash git commit <agent-id> --message
- dash git pr-create <agent-id> --title --body
Create src/git/operations.ts, pr.ts"

# Workstream 3: Analytics Dashboard
sessions_spawn \
  --label "phase5-analytics" \
  --model moonshot/kimi-k2-5 \
  --task "Implement analytics and reporting:
- Agent metrics (tokens, cost, runtime)
- Task analytics (completion rates, bottlenecks)
- Cost attribution by swarm
Create src/analytics/metrics.ts, reporting.ts, cost.ts"
```

---

## 8. Verification Checklist

### 8.1 Phase 1 Verification

```bash
# Step 1: Run build
cd /Users/jasontang/clawd/projects/mission-control
npm run build
# Expected: 0 errors, 0 warnings

# Step 2: Run tests
npm test
# Expected: All 172 tests pass, 0 failures

# Step 3: Verify CLI commands
dash agents list --format table
dash agents spawn "test task"
dash agents pause <agent-id>
dash agents resume <agent-id>
dash agents retry <agent-id>
dash agents kill <agent-id>
# Expected: All commands work without errors

# Step 4: Verify context commands
dash context tree <agent-id>
dash context analyze <agent-id>
dash context optimize <agent-id> --aggressive
# Expected: Commands complete with useful output
```

### 8.2 Phase 2 Verification

```bash
# Step 1: Linting
dash quality lint <agent-id> --format json
# Expected: Valid lint results

# Step 2: Type checking
dash quality types <agent-id> --strict
# Expected: Type errors detected and reported

# Step 3: Security scanning
dash quality security <agent-id> --cwe-list CWE-89
# Expected: Security issues detected

# Step 4: Quality gate
dash quality gate <task-id> \
  --criteria correctness:0.3,security:0.2,types:0.2,style:0.15,coverage:0.15 \
  --passing-threshold 0.8
# Expected: Pass/fail with detailed breakdown
```

### 8.3 Phase 3 Verification

```bash
# Step 1: Reasoning traces
dash reasoning trace <agent-id> --type hypothesis --content "Test" --confidence 0.5
dash reasoning decisions <agent-id> --format table
# Expected: Traces recorded and retrievable

# Step 2: Confidence tracking
dash reasoning analyze <agent-id> --check-confidence-evidence
# Expected: Confidence-evidence alignment check

# Step 3: Critique
dash critique create --target-agent <agent-id> --dimensions correctness,security
dash critique synthesize <id-1> <id-2> --type consensus
# Expected: Critique completed, synthesis generated
```

### 8.4 Phase 4 Verification

```bash
# Step 1: Safety boundaries
dash safety boundaries list
dash safety check --action "rm -rf /"
# Expected: Blocked with explanation

# Step 2: Escalation workflow
dash escalation request --type safety --reason "Test"
dash escalation list --status pending
dash escalation respond <id> --decision approve
# Expected: Escalation workflow complete

# Step 3: Audit logging
dash audit log --since "1h ago"
dash audit export --output audit.json
# Expected: Complete audit trail
```

### 8.5 Phase 5 Verification

```bash
# Step 1: CI/CD
dash ci run <agent-id> --pipeline test
dash ci status <run-id>
# Expected: Pipeline runs successfully

# Step 2: Git operations
dash git create-branch test-branch
dash git commit <agent-id> --message "Test commit"
# Expected: Branch created, commit recorded

# Step 3: Analytics
dash analytics agents --metric cost
dash analytics bottlenecks
dash analytics cost --group swarm
# Expected: Metrics reported accurately
```

---

## 9. Milestone Timeline

### 9.1 Timeline Overview

| Phase | Duration | Start | End | Status |
|-------|----------|-------|-----|--------|
| Phase 1 | 1-2 days | 2026-02-01 | 2026-02-02 | Active |
| Phase 2 | 3-5 days | 2026-02-03 | 2026-02-07 | Not Started |
| Phase 3 | 5-7 days | 2026-02-08 | 2026-02-14 | Not Started |
| Phase 4 | 3-5 days | 2026-02-15 | 2026-02-19 | Not Started |
| Phase 5 | 5-7 days | 2026-02-20 | 2026-02-26 | Not Started |

### 9.2 Sprint Structure

**Each Phase = 1 Sprint**

- **Day 1-2:** Core implementation (subagents spawn)
- **Day 3-4:** Integration and testing
- **Day 5:** Verification and cleanup

### 9.3 Milestone Markers

| Milestone | Description | Criteria |
|-----------|-------------|----------|
| M1 | Build Green | `npm run build` exits 0 |
| M2 | Tests Pass | 172+ tests, 0 failures |
| M3 | Phase 2 Complete | All quality commands working |
| M4 | Reasoning Live | Reasoning traces on agents |
| M5 | Safety Active | Boundaries and escalation working |
| M6 | V1 Release | All 5 phases complete |

### 9.4 Progress Tracking

```bash
# Daily standup commands
npm run build  # Verify build status
npm test       # Verify test status
dash agents list  # Check active workstreams
```

---

## 10. Quick Reference

### 10.1 Essential Commands

```bash
# Build and test
cd /Users/jasontang/clawd/projects/mission-control
npm run build
npm test

# Spawn workstream
sessions_spawn --label "<workstream-name>" \
  --model moonshot/kimi-k2-5 \
  --task "<task-description>"

# Check status
dash status
dash agents list
dash tasks list
```

### 10.2 File Locations

| Purpose | Location |
|---------|----------|
| Source code | `/Users/jasontang/clawd/projects/mission-control/src/` |
| Tests | `/Users/jasontang/clawd/projects/mission-control/tests/` |
| PRD | `/Users/jasontang/clawd/projects/mission-control/DASH_PRD_V2.md` |
| Roadmap | `/Users/jasontang/clawd/projects/mission-control/IMPLEMENTATION_ROADMAP.md` |

### 10.3 Key Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Build errors | 0 | `npm run build` |
| Test pass rate | 100% | `npm test` |
| CLI commands | 50+ | Count commands |
| Event latency | <50ms | Benchmark |
| Time-to-resolution | <5min | User study |

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-01  
**Primary Model:** moonshot/kimi-k2-5  
**Next Review:** After Phase 1 build passes

**Spawn the first workstream:**
```bash
sessions_spawn --label "phase1-build-fix" --model moonshot/kimi-k2-5 --task "Fix the 24 TypeScript build errors..."
```
