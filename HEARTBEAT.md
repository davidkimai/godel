# HEARTBEAT.md - Agent Heartbeat Checklist

## On Wake (Every 15 minutes)

### 1. Load Context
- [ ] Read memory/WORKING.md for current task state
- [ ] If task in progress, resume it
- [ ] Check memory/YYYY-MM-DD.md for today's notes

### 2. Check Urgent Items (Mission Control)
- [ ] Check for @mentions: `npx convex run notifications:undelivered`
- [ ] If @mentioned, read full context and respond
- [ ] Check assigned tasks: `npx convex run tasks:list`
- [ ] If assigned, check task status and update

### 3. Scan Activity Feed
- [ ] Read recent activities: `npx convex run activities:list --args '{"limit": 20}'`
- [ ] Identify discussions relevant to your expertise
- [ ] Consider if you should contribute

### 4. System Health Checks (Every 4 Hours)

**Silently verify — only notify if action needed:**

- [ ] **Disk space** — Alert if < 10% free: `df -h /`
- [ ] **Failed cron jobs** — Check for errors: `crontab -l && journalctl -xe`
- [ ] **Unread priority emails** — Urgent matters only
- [ ] **Calendar conflicts** — Upcoming overlaps in next 48h
- [ ] **System health** — Long-running processes, memory issues: `top -n 1`

**Track checks in `memory/heartbeat-state.json`:**
```json
{
  "lastSystemCheck": 1703275200,
  "lastEmailCheck": 1703260800,
  "diskSpaceOk": true,
  "cronJobsOk": true
}
```

### 5. Claude Code Integration (Orchestrators)

**For orchestrator models, leverage Claude Code liberally:**

- [ ] Review `HEARTBEAT_CLAUDE_CODE.md` for parallel workstream strategy
- [ ] Check `CLAUDE_CODE_QUICK_REF.md` for CLI commands
- [ ] Consider: Can this task use parallel worktrees?
- [ ] Consider: Should this use plan mode before implementing?
- [ ] Consider: Should this create a new skill?

**Quick reference:**
```bash
# Spin up parallel worktrees for complex tasks
git worktree add -b feature ../dash-feature main

# Use Claude Code CLI for quick fixes
claude "Go fix the failing CI tests"

# Create skills for repeated patterns
# If you do something >1x/day → make it a skill
```

### 6. Action or Stand Down
- [ ] If work to do → Do it and update WORKING.md
- [ ] If nothing → Reply HEARTBEAT_OK
- [ ] Never waste tokens on empty responses

## Philosophy

**Be a silent guardian:**
- Only notify when action is needed
- Don't report "all systems normal"
- Batch checks to minimize token usage
- Anticipate issues before they escalate

## Frequency Rules
- Heartbeats run every 15 minutes (staggered schedule)
- System checks every 4 hours
- If nothing to do, HEARTBEAT_OK
- Late night (23:00-08:00): HEARTBEAT_OK unless urgent
- High activity periods: Stay engaged
