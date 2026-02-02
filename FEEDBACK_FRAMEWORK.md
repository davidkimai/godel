# Dash — Feedback-Driven Interview Framework

**Version:** 1.0  
**Date:** 2026-02-01  
**Purpose:** Recursive interview process to continuously improve implementation

---

## Core Philosophy

> "The interview is not a one-time information gathering session. It's a recursive feedback loop that continuously improves the implementation."

### The Feedback Loop Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                     Implementation                               │
│              (PRD, Specs, Code, Tests)                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Feedback Interview                            │
│         "Review X and provide specific improvements"            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Improved Implementation                        │
│              (Refined PRD, Fixed Specs, Updated Code)            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
                        [Loop Again]
```

---

## Interview Types

### 1. PRD Review Interview

**Trigger:** After any major PRD change  
**Purpose:** Validate requirements are complete and coherent

**Questions to Ask:**
1. "What assumptions in this PRD might be wrong?"
2. "What's missing that would block implementation?"
3. "Are the priority levels (P0/P1/P2) correctly assigned?"
4. "What edge cases have we not considered?"
5. "Are the success metrics measurable and achievable?"

**Output:** Refined PRD with identified gaps filled

---

### 2. Code Review Interview

**Trigger:** After any code implementation  
**Purpose:** Catch bugs, improve quality, ensure spec compliance

**Questions to Ask:**
1. "Does this code match the PRD requirements exactly?"
2. "What error cases are not handled?"
3. "What would make this code fail in production?"
4. "Is the error messaging clear and actionable?"
5. "Does this follow the CLI design principles?"

**Output:** Bug fixes, error handling improvements, spec compliance

---

### 3. Test Review Interview

**Trigger:** After test implementation  
**Purpose:** Ensure tests catch real issues

**Questions to Ask:**
1. "What realistic failure modes are NOT covered?"
2. "Are the tests too permissive (passing when they shouldn't)?"
3. "What edge cases would break this code that tests don't catch?"
4. "Are the test descriptions clear enough to understand what's being tested?"
5. "Do tests verify the actual behavior users would experience?"

**Output:** Improved test coverage, better assertions, edge case tests

---

### 4. API Review Interview

**Trigger:** After any CLI command implementation  
**Purpose:** Ensure APIs are intuitive and complete

**Questions to Ask:**
1. "Would a new user understand this command from the help text?"
2. "What common workflows does this command NOT support?"
3. "Is the output format appropriate for both humans and scripts?"
4. "What flags are missing that would be useful?"
5. "Is the error message actionable?"

**Output:** Improved CLI UX, missing flags added, better help text

---

### 5. Integration Review Interview

**Trigger:** After any integration (between modules)  
**Purpose:** Ensure modules work together correctly

**Questions to Ask:**
1. "What happens when Module A fails while Module B is running?"
2. "Is the data flow between modules clear and consistent?"
3. "What state is shared and how is it synchronized?"
4. "Are there circular dependencies that could cause issues?"
5. "What happens during partial failures?"

**Output:** Better error handling, state management, integration tests

---

## Recursive Feedback Session Template

### Session Setup

```yaml
session:
  type: feedback_interview
  focus: <what to review>
  iteration: <1st, 2nd, 3rd...>
  model: moonshot/kimi-k2-5
```

### Session Structure

**1. Opening (2 minutes)**
```
"I've been asked to review [X] and provide specific, actionable 
improvements. I'll start by examining the current state, then 
identify gaps, and finally propose concrete changes."
```

**2. Review Phase (10 minutes)**
- Read the artifact (PRD, code, tests, etc.)
- Identify issues, gaps, edge cases
- Note specific line numbers, requirements, or behaviors

**3. Feedback Phase (10 minutes)**
Present findings in this format:
```
ISSUE #1: [Title]
- Location: [File:line or Section]
- Current: [What's wrong]
- Impact: [Why it matters]
- Recommendation: [Specific fix]
- Priority: [P0/P1/P2]

ISSUE #2: ...
```

**4. Discussion Phase (5 minutes)**
- Clarify any ambiguities
- Prioritize fixes
- Assign ownership

**5. Summary Phase (3 minutes)**
```
"To summarize, I found [N] issues requiring attention:

P0 (Blocking):
- [Issue 1]
- [Issue 2]

P1 (Important):
- [Issue 3]
- [Issue 4]

P2 (Nice to have):
- [Issue 5]

The most critical improvement is [X] because [reason]."
```

---

## Example Feedback Session

### Session: CLI Command Review - `dash quality gate`

**Review Focus:** `dash quality gate` command implementation  
**Iteration:** 1st pass  
**Model:** Kimi K2.5

**Feedback Output:**

```
ISSUE #1: Missing --auto-retry flag
- Location: src/cli/commands/quality.ts:45
- Current: No way to configure automatic retry on failure
- Impact: Users must manually retry when gate fails
- Recommendation: Add --auto-retry flag with configurable max iterations
- Priority: P1

ISSUE #2: Error message not actionable
- Location: src/cli/commands/quality.ts:78
- Current: "Quality gate failed" with no guidance
- Impact: Users don't know how to fix the failure
- Recommendation: Show which dimension(s) failed and threshold values
- Priority: P0

ISSUE #3: No --quiet mode for CI
- Location: src/cli/commands/quality.ts:12
- Current: Always shows detailed output
- Impact: CI logs become noisy
- Recommendation: Add --quiet / -q flag for minimal output
- Priority: P2

ISSUE #4: Missing --fail-at option
- Location: src/cli/commands/quality.ts:23
- Current: Fails on first dimension below threshold
- Impact: Users want to see all failures at once
- Recommendation: Add --fail-at <dimension> to fail on specific dimension
- Priority: P2

SUMMARY:
P0 (Blocking): 1 issue - Error message needs improvement
P1 (Important): 1 issue - Auto-retry configuration needed
P2 (Nice to have): 2 issues - CI mode, fail-at option

Most critical: Improve error messages to show which dimension failed
and what the actual vs. expected values were.
```

---

## Feedback Categories

### Category 1: Completeness

| Question | Check |
|----------|-------|
| Are all P0 requirements implemented? | Complete/Incomplete |
| Are edge cases handled? | Yes/No/Partial |
| Are error states defined? | Yes/No |
| Is the API surface complete? | Yes/No |

### Category 2: Correctness

| Question | Check |
|----------|-------|
| Does it match the PRD? | Exact/Minor deviation/Major deviation |
| Are types correct? | Yes/No |
| Are edge cases handled correctly? | Yes/No |
| Is the output format correct? | Yes/No |

### Category 3: Usability

| Question | Check |
|----------|-------|
| Is the help text clear? | Yes/No |
| Are error messages actionable? | Yes/No |
| Is the command intuitive? | Yes/No |
| Does it work well in scripts? | Yes/No |

### Category 4: Performance

| Question | Check |
|----------|-------|
| Does it meet performance targets? | Yes/No |
| Are there unnecessary operations? | Yes/No |
| Is memory usage acceptable? | Yes/No |
| Does it scale? | Yes/No |

### Category 5: Quality

| Question | Check |
|----------|-------|
| Are there obvious bugs? | Yes/No |
| Is the code readable? | Yes/No |
| Are there security concerns? | Yes/No |
| Is test coverage adequate? | Yes/No |

---

## Feedback-Driven Swarm Pattern

### Traditional Swarm
```
1. Spawn workstream
2. Workstream implements
3. Workstream reports done
```

### Feedback-Driven Swarm
```
1. Spawn workstream (spec + feedback prompt)
2. Workstream implements
3. Workstream requests feedback review
4. Feedback interview conducted
5. Issues identified
6. Workstream fixes issues
7. Workstream requests feedback review
8. Loop until clean
9. Workstream reports done
```

### Feedback Session Frequency

| Phase | Frequency | Trigger |
|-------|-----------|---------|
| Phase 1 | After each workstream | Build/test verification |
| Phase 2 | After each command | CLI UX review |
| Phase 3 | After each module | Reasoning accuracy review |
| Phase 4 | After safety features | Security review |
| Phase 5 | After each integration | End-to-end flow review |

---

## Templates for Feedback Sessions

### Template 1: Quick Feedback Request

```markdown
## Feedback Request: [Component Name]

**What to review:** [File or feature]
**Current state:** [Brief description]
**Success criteria:** [What "done" looks like]
**Known concerns:** [Anything specific to check]

Please provide:
1. 3 most critical issues found
2. Specific line/file for each issue
3. Concrete recommendation for each
```

### Template 2: Deep Feedback Session

```markdown
## Deep Feedback Session: [Component Name]

**Scope:** [What to review]
**Iteration:** [1st/2nd/3rd...]
**Time limit:** [30 minutes]

**Review Checklist:**
- [ ] Completeness check
- [ ] Correctness check
- [ ] Usability check
- [ ] Performance check
- [ ] Quality check

**Output Format:**
- Issue #1: [Title]
  - Location: [File:line]
  - Current: [What's wrong]
  - Impact: [Why it matters]
  - Fix: [Specific recommendation]
  - Priority: [P0/P1/P2]

- Issue #2: ...

**Summary:**
- P0 issues: [N]
- P1 issues: [N]
- P2 issues: [N]
- Most critical: [Issue X because Y]
```

### Template 3: Post-Implementation Review

```markdown
## Post-Implementation Review: [Feature]

**Implementation:** [PR or branch]
**Tests:** [Test file]
**Reviewed by:** [Agent/model]
**Date:** [Date]

**Questions Answered:**
1. Does it match the PRD? [Yes/No + details]
2. Are all edge cases handled? [Yes/No + missing cases]
3. Is error handling complete? [Yes/No + gaps]
4. Is the API intuitive? [Yes/No + suggestions]
5. Are tests adequate? [Yes/No + coverage gaps]

**Issues Found:**
- [Issue 1]
- [Issue 2]

**Verdict:** 
- [ ] Approved
- [ ] Approved with minor changes
- [ ] Request changes
- [ ] Blocked

**Next Steps:**
- [ ] Merge
- [ ] Fix issues and re-review
- [ ] Add tests and re-review
```

---

## Running Feedback Interviews

### Example: PRD Feedback Session

```bash
# Spawn a feedback interview for the PRD
sessions_spawn \
  --label "feedback-prd-review" \
  --model moonshot/kimi-k2-5 \
  --task "Review DASH_PRD_V2.md and provide specific improvements.

FOCUS AREAS:
1. Completeness - Are all P0 requirements defined?
2. Clarity - Is each requirement unambiguous?
3. Testability - Can each requirement be verified?
4. Priority - Are P0/P1/P2 assignments correct?
5. Gaps - What's missing that would block implementation?

OUTPUT FORMAT:
For each issue found:
- ISSUE: [Title]
- SECTION: [PRD section]
- CURRENT: [What's written]
- PROBLEM: [Why it's a problem]
- RECOMMENDATION: [Specific fix]
- PRIORITY: P0/P1/P2

SUMMARY:
- P0 issues: [N] - these block implementation
- P1 issues: [N] - these should be fixed before release
- P2 issues: [N] - these are nice to have

Most critical finding: [What would cause the biggest problem]"
```

### Example: Code Feedback Session

```bash
# Spawn a feedback interview for a specific file
sessions_spawn \
  --label "feedback-quality-gates" \
  --model moonshot/kimi-k2-5 \
  --task "Review src/quality/gates/evaluator.ts and provide specific improvements.

FOCUS AREAS:
1. Correctness - Does it match the PRD quality gate spec?
2. Edge cases - What happens with null/undefined/empty values?
3. Error handling - Are all error states handled?
4. Performance - Any obvious performance issues?
5. Clarity - Is the code readable and maintainable?

OUTPUT FORMAT:
For each issue found:
- ISSUE: [Title]
- LINE: [Line number]
- CURRENT: [Code snippet]
- PROBLEM: [Why it's an issue]
- FIX: [Specific recommendation]

SUMMARY:
- Critical bugs: [N]
- Issues to fix: [N]
- Suggestions: [N]"
```

---

## Feedback Response Template

When responding to a feedback session:

```markdown
## Feedback Response

**Feedback from:** [Session label]
**Date:** [Date]
**Reviewed by:** [Model name]

### Acknowledged Issues

**P0 (Will fix immediately):**
- [Issue 1] → [Fix applied or planned]
- [Issue 2] → [Fix applied or planned]

**P1 (Will fix before release):**
- [Issue 3] → [Fix planned]
- [Issue 4] → [Fix planned]

**P2 (Nice to have):**
- [Issue 5] → [Deferred to backlog / Wontfix]
- [Issue 6] → [Deferred to backlog / Wontfix]

### Disputed Issues

If you disagree with feedback:
- [Issue] → [Reason for disagreement]
- [Alternative approach]

### Changes Made

List specific changes made in response to feedback:
1. [Change 1]
2. [Change 2]
3. [Change 3]

### Request for Re-Review

After making changes, request another feedback session:
```
Please re-review [component] after implementing fixes for [issues].
Focus on: [specific areas]
```
```

---

## Success Metrics for Feedback Process

| Metric | Target | Measurement |
|--------|--------|-------------|
| Feedback sessions per phase | 5+ | Count sessions |
| P0 issues caught before merge | 100% | Zero P0 bugs post-merge |
| Iteration count per workstream | 2-3 | Average 2 feedback loops |
| Feedback-to-fix time | <4 hours | Time from feedback to fix |
| Rejection rate | <10% | Issues accepted vs disputed |

---

## Quick Reference

### When to Request Feedback

| Trigger | Action |
|---------|--------|
| New feature implemented | Request code review feedback |
| PRD updated | Request PRD review feedback |
| Tests written | Request test review feedback |
| Integration completed | Request integration feedback |
| Before merge | Request final review feedback |

### Feedback Session Checklist

- [ ] Clear scope defined
- [ ] Appropriate model (Kimi K2.5)
- [ ] Specific questions prepared
- [ ] Output format specified
- [ ] Issues categorized (P0/P1/P2)
- [ ] Summary with most critical issue
- [ ] Response template ready

---

**Document Version:** 1.0  
**Date:** 2026-02-01  
**Purpose:** Enable recursive improvement through feedback-driven interviews

**Key Principle:** Every interview provides feedback. Every feedback session improves the implementation. Loop until clean.
