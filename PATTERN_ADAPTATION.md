# Pattern Adaptation: Moltbook → Dash

## Executive Summary
Extracted 10 strategic patterns from Moltbook's skill.md and adapted for Dash agent orchestration platform.

---

## 1. Versioned Skill Metadata

### Moltbook Pattern:
```yaml
---
name: moltbook
version: 1.9.0
description: The social network for AI agents...
metadata: {"moltbot":{...}}
---
```

### Dash Adaptation:
```yaml
---
name: dash
version: 2.0.0
description: Agent orchestration platform for AI-powered development...
metadata: {
  "orchestrator": {"version": "v3"},
  "protocol": {"version": "v3", "timebox": "10min"},
  "features": ["swarm", "autonomy", "monitoring"]
}
---
```

### Benefit:
- Track skill versions separately from code versions
- Enable backward compatibility checks
- Support plugin/extension metadata

---

## 2. Clear Installation Flow

### Moltbook Pattern:
```bash
# Install locally
mkdir -p ~/.moltbot/skills/moltbook
curl -s https://www.moltbook.com/skill.md > ~/.moltbot/skills/moltbook/SKILL.md

# Or just read from URLs!
```

### Dash Adaptation:
```bash
# Install Dash skill
mkdir -p ~/.openclaw/skills/dash
curl -s https://github.com/davidkimai/clawd/skills/dash/SKILL.md > ~/.openclaw/skills/dash/SKILL.md

# Or clone the entire skill
git clone https://github.com/davidkimai/clawd skills/dash
```

### Benefit:
- Skill becomes self-installing
- Supports both URL-based and clone-based installation
- Enables skill marketplace (ClawHub)

---

## 3. Registration & Claiming Workflow

### Moltbook Pattern:
```bash
# Register agent
curl -X POST https://www.moltbook.com/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name": "YourAgentName", "description": "..."}'

# Response includes API key and claim URL
{
  "api_key": "moltbook_xxx",
  "claim_url": "https://www.moltbook.com/claim/xxx"
}
```

### Dash Adaptation:
```bash
# Register Dash instance
curl -X POST https://dash.local/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{"instance": "main", "orchestrator": "v3"}'

# Response includes API key and verification
{
  "instance_id": "dash_xxx",
  "api_key": "dash_xxx",
  "verify_url": "https://dash.local/verify/xxx"
}
```

### Benefit:
- Clear registration flow for Dash instances
- API key management for authenticated operations
- Verification workflow for human ownership

---

## 4. Heartbeat Integration Pattern

### Moltbook Pattern:
```markdown
## Moltbook (every 4+ hours)
If 4+ hours since last Moltbook check:
1. Fetch https://www.moltbook.com/heartbeat.md and follow it
2. Update lastMoltbookCheck timestamp in memory
```

### Dash Adaptation:
```markdown
## Dash Health Check (every 15 minutes)
Every 15 minutes:
1. Fetch https://localhost:3000/api/health or check local state
2. Run: npm run build (verify 0 TypeScript errors)
3. Check: ps aux | grep orchestrator (verify running)
4. Update lastDashCheck timestamp in memory
5. Log to: .dash/health-logs.json
```

### Benefit:
- Standardized health check workflow
- Automated monitoring integration
- Memory-backed state tracking

---

## 5. Rate Limiting Awareness

### Moltbook Pattern:
```json
Rate Limits:
- 100 requests/minute
- 1 post per 30 minutes
- 1 comment per 20 seconds
- 50 comments per day
```

### Dash Adaptation:
```json
Dash Limits:
- Orchestrator runs: every 1 minute (60/minute max)
- Swarm launches: 5 parallel max
- Build checks: every 30 seconds (120/hour max)
- Heartbeat reports: every 15 minutes (4/hour max)
- Budget: 0.25 credits per 10-minute sprint
```

### Benefit:
- Prevent resource exhaustion
- Set clear operational boundaries
- Enable budget tracking

---

## 6. Standardized Response Format

### Moltbook Pattern:
```json
Success: {"success": true, "data": {...}}
Error: {"success": false, "error": "Description", "hint": "How to fix"}
```

### Dash Adaptation:
```json
Success: {"status": "ok", "data": {...}, "timestamp": "..."}
Error: {"status": "error", "message": "...", "hint": "...", "code": "..."}
Pending: {"status": "pending", "task_id": "..."}
```

### Benefit:
- Consistent API responses
- Error hints for debugging
- Status codes for automation

---

## 7. Human-Agent Bond Pattern

### Moltbook Pattern:
```markdown
## The Human-Agent Bond 🤝
Every agent has a human owner who verifies via tweet.
- Anti-spam: One bot per X account
- Accountability: Humans own their bot's behavior
- Trust: Verified agents only
```

### Dash Adaptation:
```markdown
## The Orchestrator-Human Bond 🤝
Dash instances have human owners who verify via GitHub.
- Accountability: Humans approve critical operations
- Safety: Humans can override autonomous decisions
- Trust: Human-in-the-loop for budget exceeding limits
```

### Benefit:
- Clear ownership model
- Safety boundaries
- Approval workflows

---

## 8. Progressive Feature Disclosure

### Moltbook Pattern:
```markdown
# Step 1: Register First
# Step 2: Set Up Heartbeat
# Step 3: Start Posting
# ...
```

### Dash Adaptation:
```markdown
# Step 1: Install & Verify
- npm install -g dash-agent
- npm run build (verify 0 errors)
- npm test (verify tests pass)

# Step 2: Configure Orchestrator
- Edit .dash/orchestrator-config.json
- Set budget limits
- Configure approval thresholds

# Step 3: Launch First Swarm
- ./sprint-launcher.sh
- Monitor outputs
- Review commits
```

### Benefit:
- Guided onboarding
- Clear success criteria
- Step-by-step validation

---

## 9. Self-Documenting API

### Moltbook Pattern:
```markdown
| Action | What it does |
|--------|--------------|
| Post | Share thoughts, questions, discoveries |
| Comment | Reply to posts, join conversations |
| Upvote | Show you like something |
```

### Dash Adaptation:
```markdown
| Action | Command | Purpose |
|--------|---------|---------|
| Build | npm run build | Verify 0 TypeScript errors |
| Test | npm test | Run test suite |
| Swarm | ./sprint-launcher.sh | Launch 5 parallel agents |
| Monitor | ps aux \| grep orchestrator | Check orchestrator status |
| Health | cat .dash/health.json | View system health |
```

### Benefit:
- Quick reference for operators
- Automation-friendly tables
- Clear purpose documentation

---

## 10. Trust & Safety Boundaries

### Moltbook Pattern:
```markdown
🔒 CRITICAL SECURITY WARNING:
- NEVER send your API key to any domain other than `www.moltbook.com`
- Your API key should ONLY appear in requests to `https://www.moltbook.com/api/v1/*`
```

### Dash Adaptation:
```markdown
🔒 CRITICAL SAFETY WARNING:
- NEVER execute unapproved commands
- ALWAYS verify before: git push, npm publish, curl external APIs
- Budget limits: 0.25 credits per sprint, 10 credits per day
- Approval required for: budget > 1.0, new integrations, system changes
```

### Benefit:
- Clear safety boundaries
- Approval workflows for critical operations
- Budget enforcement

---

## Implementation Roadmap

### Phase 1: Quick Wins (This Sprint)
- [ ] Add version metadata to SKILL.md
- [ ] Create installation script
- [ ] Implement standardized response format

### Phase 2: Core Features (Next Sprint)
- [ ] Registration API endpoint
- [ ] Heartbeat integration
- [ ] Rate limiting enforcement

### Phase 3: Advanced Features (Future)
- [ ] Human approval workflows
- [ ] Budget tracking system
- [ ] Marketplace integration (ClawHub)

---

## Summary: 10 Patterns Extracted

| # | Pattern | Moltbook Use | Dash Use |
|---|---------|--------------|----------|
| 1 | Versioned Metadata | Track skill version | Track skill + orchestrator version |
| 2 | Installation Flow | URL-based install | Clone + URL options |
| 3 | Registration | API registration | Instance registration |
| 4 | Heartbeat | Social check-in | Health monitoring |
| 5 | Rate Limiting | API limits | Resource limits |
| 6 | Response Format | Success/Error | Status + data + hints |
| 7 | Human-Agent Bond | Twitter verification | GitHub verification |
| 8 | Progressive Disclosure | Step-by-step onboarding | Guided setup |
| 9 | Self-Documenting API | Action table | Command reference |
| 10 | Safety Boundaries | API key protection | Approval workflows |

---

**Created**: 2026-02-03
**Source**: https://www.moltbook.com/skill.md
**Adapted For**: Dash v2.0
