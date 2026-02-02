# Claude Code Orchestration Heartbeat

**Purpose:** Guide orchestrator models to leverage Claude Code liberally and spin up parallel workstreams.

**When to use this heartbeat:**
- Main orchestrator session needs parallel work
- Complex task requires multiple focused sessions
- Need to investigate issues while implementing features
- Want to review plans from different perspectives

---

## Claude Code Integration Checklist

### 1. Before Complex Task

- [ ] **Assess complexity:** Is this multi-step or multi-faceted?
- [ ] **Identify parallelizable work:** What can run independently?
- [ ] **Create worktrees:** Spin up 2-5 git worktrees for parallel Claude sessions
- [ ] **Define task distribution:** Assign different aspects to different sessions

### 2. Parallel Session Strategy

**Pattern for complex work:**
```
Main Session (Orchestrator)
├── Worktree A: Feature implementation
├── Worktree B: Testing & verification
├── Worktree C: Documentation & specs
└── Worktree D: Investigation/analysis (if needed)
```

**Shell aliases for quick switching:**
```bash
# Add to ~/.zshrc or ~/.bashrc
alias za='cd $(ghq root)/github.com/davidkimai/dash-feature-a'
alias zb='cd $(ghq root)/github.com/davidkimai/dash-feature-b'
alias zc='cd $(ghq root)/github.com/davidkimai/dash-analysis'
alias zd='cd ~/clawd/projects/mission-control'  # main dev
```

### 3. Claude Code CLI Commands

**Quick fixes:**
```bash
# Fix failing CI
claude "Go fix the failing CI tests"

# Debug production issue
claude "Analyze these docker logs and identify the root cause"

# Bug fix from Slack
claude "Fix this bug: [paste bug description]"
```

**Parallel execution:**
```bash
# In worktree A
cd ../dash-feature-a && claude "Implement feature X"

# In worktree B  
cd ../dash-feature-b && claude "Write comprehensive tests for feature X"

# In worktree C
cd ../dash-analysis && claude "Review the implementation and suggest improvements"
```

### 4. Plan Mode Discipline

**When to enter plan mode:**
- Task has more than 3 sub-tasks
- Unclear requirements or edge cases
- First implementation attempt failed
- Verification step needed

**Plan mode workflow:**
1. Use `/interview` to extract full requirements
2. Write detailed SPEC.md
3. (Optional) Second Claude reviews plan as senior engineer
4. Execute implementation only after plan is solid
5. When stuck: Return to plan mode, don't keep pushing

**Verification mode:**
```bash
# Explicit verification step
claude "Verify this implementation works. Don't make a PR until tests pass and coverage is maintained."
```

### 5. AGENTS.md Iteration

**After every mistake or correction:**

**Trigger phrase:** "Update AGENTS.md so you don't make that mistake again."

**Process:**
1. Claude makes mistake or receives correction
2. End with: "Update AGENTS.md with this lesson"
3. Verify the rule prevents future mistakes
4. Track: Is mistake rate decreasing?

**Example:**
```
Claude: "I accidentally deleted the wrong file."

User: "Use trash instead of rm. Update AGENTS.md so you don't make that mistake again."

Claude: [Updates AGENTS.md with trash > rm rule]
```

### 6. Skills Creation Trigger

**Threshold:** If you do something more than once a day, create a skill.

**When to create skills:**
- Repeated command pattern identified
- Common workflow with slight variations
- Useful for other sessions/projects

**Skill creation workflow:**
1. Identify repeated pattern
2. Create skill: `skills/[skill-name]/SKILL.md`
3. Document purpose, usage, examples
4. Commit to git for cross-project reuse
5. Update TOOLS.md with new capability

### 7. Enhanced Prompting Triggers

**Challenge mode:**
> "Grill me on these changes. Don't make a PR until I pass your test."

**Elegant solution mode:**
> "Knowing everything you know now, scrap this and implement the elegant solution."

**Detailed spec mode:**
> "Write detailed specs before implementing. Reduce ambiguity."

**Self-correction triggers:**
- "This is mediocre" → Demand elegant solution
- "Tests failing" → Auto-fix CI
- "Code unclear" → Demand explanation + improvements

---

## Parallel Workstream Creation Script

```bash
#!/bin/bash
# create-worktrees.sh - Spin up parallel worktrees for Claude Code

PROJECT_DIR="mission-control"
BASE_DIR=$(dirname $(pwd))
PROJECT_PATH="$BASE_DIR/$PROJECT_DIR"

# Create worktrees for parallel Claude sessions
create_worktree() {
    local name=$1
    local branch="claude-$name"
    cd "$PROJECT_PATH"
    git worktree add -b "$branch" "../dash-$name" main
    echo "Created worktree: ../dash-$name"
}

# Main worktree (current)
echo "Using main worktree: $PROJECT_PATH"

# Feature worktree
create_worktree "feature"

# Analysis worktree  
create_worktree "analysis"

# Testing worktree
create_worktree "test"

echo "✅ Created 3 parallel worktrees"
echo "Run 'claude' in each to spin up parallel sessions"
```

---

## MCP Integration Checklist

- [ ] **Slack MCP** enabled for bug report pasting
- [ ] **GitHub MCP** enabled for PR context
- [ ] **Custom MCPs** for project-specific tools
- [ ] **Test:** Paste bug report → "fix" works

---

## Metrics to Track

**Productivity metrics:**
- Worktrees created this session
- Parallel sessions running
- Skills created this month
- AGENTS.md updates this session
- Mistake rate (goal: decreasing)

**Quality metrics:**
- Plan mode usage (should be high for complex tasks)
- PR pass rate on first attempt
- Bug fix success rate
- Code coverage changes

---

## Session Templates

### Quick Fix Session
```bash
claude "Fix the failing CI tests. Report what you changed."
```

### Plan + Implement Session
```bash
# Plan first
/interinterview implement FEATURE with full specs
# Then execute
claude "Implement according to SPEC.md. Run tests before completing."
```

### Parallel Swarm Session
```bash
# Terminal 1 (main orchestrator)
cd mission-control
claude "Orchestrate feature implementation with parallel workstreams"

# Terminal 2 (worktree A)
cd ../dash-feature
claude "Implement feature X according to specs"

# Terminal 3 (worktree B)
cd ../dash-test
claude "Write comprehensive tests for feature X"

# Terminal 4 (worktree C)
cd ../dash-analysis
claude "Review feature X implementation and suggest improvements"
```

---

## Anti-Patterns to Avoid

❌ **Don't** spin up worktrees without clear task separation
❌ **Don't** skip plan mode for complex tasks
❌ **Don't** make PRs without verification
❌ **Don't** repeat patterns without creating skills
❌ **Don't** ignore corrections - always update AGENTS.md
❌ **Don't** use rm without checking - use trash

---

## Success Criteria

**Session is successful when:**
- [ ] Complex task broken into parallel workstreams
- [ ] Plan mode used for multi-step work
- [ ] Verification step included before completion
- [ ] AGENTS.md updated with any lessons
- [ ] Skills created for repeated patterns
- [ ] Claude Code CLI used for quick fixes
- [ ] MCP integration tested where applicable

---

**Created:** 2026-02-01
**Source:** Boris Cherny (Claude Code creator) tips
**Status:** Active guidance for orchestrators
