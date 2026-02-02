# Claude Code Quick Reference

**Boris Cherny's Top Productivity Tips - Adapted for Mission Control**

---

## 🚀 The #1 Unlock: Parallel Worktrees

**Spin up 3-5 git worktrees, each with its own Claude session:**

```bash
# Create worktrees
git worktree add -b feature-a ../dash-feature-a main
git worktree add -b feature-b ../dash-feature-b main
git worktree add -b analysis ../dash-analysis main

# Shell aliases (add to ~/.zshrc)
alias za='cd ../dash-feature-a'
alias zb='cd ../dash-feature-b'
alias zc='cd ../dash-analysis'
alias zd='cd ~/clawd/projects/mission-control'
```

**Then in each worktree:**
```bash
claude "Your task here"
```

---

## 🧠 Plan Mode Discipline

**For ANY complex task:**

1. **Start in plan mode** - Pour energy into the plan
2. **Write the plan** - Use `/interview` for full specs
3. **Review the plan** - Spin up second Claude to critique it
4. **Execute** - Only after plan is solid
5. **Re-plan when stuck** - Don't keep pushing blindly

**Verification mode:**
> "Enter plan mode to verify this works. Don't make a PR until tests pass."

---

## 📝 Ruthless AGENTS.md Iteration

**After EVERY correction, end with:**
> "Update AGENTS.md so you don't make that mistake again."

**Process:**
1. Mistake happens or correction received
2. Capture the lesson in AGENTS.md
3. Test: Does this rule prevent the mistake?
4. Iterate until mistake rate drops

**Claude is eerily good at writing rules for itself.**

---

## 🛠️ Skills Creation Rule

**Threshold:** If you do something more than once a day → **Make it a skill.**

**Common skills to build:**
- `/techdebt` - Find and kill duplicated code
- `/sync` - Sync context from Slack, GitHub, etc.
- `/review` - Code review with criteria
- `/test` - Run tests with coverage
- `/analyze` - Deep worktree analysis

**Lifecycle:**
```
Identify pattern → Create skill → Document → Git → Reuse
```

---

## 🎯 Enhanced Prompting

**Grill mode:**
> "Grill me on these changes. Don't make a PR until I pass your test."

**Elegant solution mode:**
> "Knowing everything you know now, scrap this and implement the elegant solution."

**Proof mode:**
> "Prove to me this works. Show me the diff and test results."

**Spec mode:**
> "Write detailed specs before implementing. Reduce ambiguity."

---

## 🐛 Bug Fixing Shortcuts

```bash
# Fix CI failures
claude "Go fix the failing CI tests"

# Debug from logs
claude "Analyze these docker logs and find the root cause"

# Fix from Slack
claude "Fix this bug: [paste bug description]"
```

**Enable MCP servers** (Slack, GitHub) for zero-context-switch fixes.

---

## 💻 Claude Code CLI Commands

```bash
# Basic usage
claude "Implement feature X"

# With context file
claude "Fix issues in SPEC.md"

# Multi-turn
claude
> First task
> Second task based on first result
> Third task

# Pipe input
cat bug_report.txt | claude "fix this"
```

---

## ⚡ Quick Reference

| Pattern | Command |
|---------|---------|
| Parallel worktrees | `git worktree add -b name ../dash-name main` |
| Plan mode | Use `/interview` before implementing |
| Quick fix | `claude "Go fix the failing CI tests"` |
| Create skill | Add to `/Users/jasontang/clawd/skills/[name]/SKILL.md` |
| Update rules | End with "Update AGENTS.md..." |
| Shell alias | `alias za='cd ../dash-feature-a'` |

---

## 🎯 When to Use What

| Situation | Approach |
|-----------|----------|
| Complex multi-step task | Plan mode first, then implement |
| Bug in production | `claude "fix this"` with logs |
| Code review | "Grill me on these changes" |
| Repeated pattern | Create a skill |
| Mistake made | Update AGENTS.md |
| Unknown requirements | `/interview` to extract specs |
| Quick fix needed | Claude Code CLI directly |
| Large feature | Parallel worktrees + plan mode |

---

## ❌ Anti-Patterns

- ❌ Skipping plan mode for complex tasks
- ❌ Making PRs without verification
- ❌ Repeating patterns without skills
- ❌ Ignoring corrections (always update AGENTS.md)
- ❌ Using `rm` instead of `trash`
- ❌ Pushing when stuck (re-plan instead)

---

## 📚 Key Files

- `AGENTS.md` - Main operating rules
- `HEARTBEAT_CLAUDE_CODE.md` - Orchestrator guide
- `CLAUDE_CODE_QUICK_REF.md` - This file
- `SOUL.md` - Your identity and persona
- `USER.md` - Human preferences

---

:** There**Remember is no one right way. Experiment and find what works for you.

**Core principle:** Claude is infrastructure. Use it liberally.

---

**Source:** Boris Cherny (Creator of Claude Code)
**Adapted:** 2026-02-01
**Status:** Active quick reference
