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

## 🎯 Subagent Pattern

**Append "use subagents" to throw more compute at problems:**

```bash
claude "Analyze this codebase and identify refactoring opportunities use subagents"
```

**Benefits:**
- Maintains clean context
- Parallel execution
- Focused expertise per subagent
- Isolated debugging

---

## 🧠 Plan Mode Discipline

**For ANY complex task:**

1. Start in plan mode - Use `/interview` for full specs
2. Write the plan - Pour energy into planning
3. Review the plan - Spin up second Claude to critique
4. Execute - Only after plan is solid
5. Re-plan when stuck - Don't keep pushing blindly

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

---

## 🎤 Voice Dictation (3x Faster!)

- Hit `fn` x2 on macOS for voice dictation
- Speak 3x faster than typing
- Prompts become way more detailed
- Great for complex specifications

**Example:**
```
User: [fn x2] "Implement comprehensive OAuth2 authentication with JWT tokens, refresh token rotation, rate limiting, and proper error handling. Add comprehensive tests."
```

---

## 💻 Terminal Setup

**Status bar:**
- Use `/statusline` to show context usage + git branch

**Tab organization:**
- Color-code tabs by task
- One tab per worktree
- Use tmux for advanced management

**Recommended terminal:** Ghostty
- Synchronized rendering
- 24-bit color
- Proper unicode

---

## 🛠️ Skills Creation Rule

**Threshold:** If you do something more than once a day → **Make it a skill.**

**Common skills:**
- `/techdebt` - Find duplicated code
- `/sync` - Sync context from Slack/GitHub
- `/review` - Code review
- `/test` - Tests with coverage
- `/analyze` - Deep analysis
- `/bq` - BigQuery analytics
- `/learning` - Spaced repetition

---

## 🎯 Enhanced Prompting

| Mode | Trigger |
|------|---------|
| Grill mode | "Grill me on these changes. Don't make a PR until I pass." |
| Elegant solution | "Knowing everything, scrap this and implement the elegant solution." |
| Proof mode | "Prove to me this works. Show the diff and test results." |
| Spec mode | "Write detailed specs before implementing." |

---

## 🐛 Bug Fixing Shortcuts

```bash
# Fix CI failures
claude "Go fix the failing CI tests"

# Debug from logs
claude "Analyze these docker logs and find the root cause"

# Fix from Slack
claude "Fix this bug: [paste description]"

# With MCP servers enabled (Slack, GitHub)
# Zero context switching required
```

---

## 📊 Data & Analytics

**Use Claude for queries instead of SQL:**

```bash
# Instead of writing SQL
claude "Show me error rate trend last 7 days using bq"

# Works with any database that has:
# - CLI tool
# - MCP server  
# - API access
```

**Benefit:** "Haven't written SQL in 6+ months."

---

## 📚 Learning Patterns

**Explanatory mode:**
- Use `/config` → "Explanatory" or "Learning" style
- Claude explains the *why* behind changes

**Visual learning:**
```bash
claude "Make me HTML slides about this architecture"
claude "Draw an ASCII diagram of this protocol"
```

**Spaced repetition:**
```bash
claude "Let's do a learning session about [topic]"
# Claude asks follow-ups, stores insights for future review
```

---

## ⚡ Quick Reference

| Pattern | Command/Trigger |
|---------|-----------------|
| Parallel worktrees | `git worktree add -b name ../dash-name main` |
| Plan mode | Use `/interview` before implementing |
| Use subagents | Append "use subagents" to request |
| Quick fix | `claude "Go fix the failing CI tests"` |
| Create skill | Add to `/Users/jasontang/clawd/skills/[name]/SKILL.md` |
| Update rules | End with "Update AGENTS.md..." |
| Shell alias | `alias za='cd ../dash-feature-a'` |
| Voice dictation | Hit `fn` x2 on macOS |
| Status bar | Use `/statusline` |

---

## ❌ Anti-Patterns

- ❌ Skipping plan mode for complex tasks
- ❌ Making PRs without verification
- ❌ Repeating patterns without skills
- ❌ Ignoring corrections (always update AGENTS.md)
- ❌ Using `rm` instead of `trash`
- ❌ Pushing when stuck (re-plan instead)

---

## 🎯 When to Use What

| Situation | Approach |
|-----------|----------|
| Complex multi-step task | Plan mode first, then subagents |
| Bug in production | `claude "fix this"` with logs |
| Code review | "Grill me on these changes" |
| Repeated pattern | Create a skill |
| Mistake made | Update AGENTS.md |
| Unknown requirements | `/interview` to extract specs |
| Quick fix needed | Claude Code CLI directly |
| Large feature | Parallel worktrees + plan mode |
| Data analysis | Claude with bq/MCP |
| Learning | Explanatory mode + spaced repetition |

---

## 📚 Key Files

- `AGENTS.md` - Main operating rules (READ THIS FIRST)
- `HEARTBEAT_CLAUDE_CODE.md` - Orchestrator guide
- `CLAUDE_CODE_QUICK_REF.md` - This file
- `SOUL.md` - Your identity and persona
- `USER.md` - Human preferences

---

**Remember:** There is no one right way. Experiment and find what works for you.

**Core principle:** Claude is infrastructure. Use it liberally.

---

**Source:** Boris Cherny (Creator of Claude Code)
**Adapted:** 2026-02-01
**Status:** Active quick reference
