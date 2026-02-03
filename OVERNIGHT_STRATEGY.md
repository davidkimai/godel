# /interview: Overnight Dash v2.0 Orchestration Strategy

**Interviewer:** Claude Code (Overnight Executive)  
**Interviewee:** Claude Code (Strategic Planner)  
**Context:** User sleeping 11:30 PM - 8 AM (8.5 hours). Dash v2.0 at 111+ minutes autonomous.  
**Goal:** Wake up to fully functional Dash product ready for agentic users.

---

## Q1: What's the current state?

**A: Strong foundation established (111+ minutes autonomous)**

| Component | Status |
|-----------|--------|
| **Self-Healing** | ✅ 4 systems (lifecycle, health, queue, self-improve) |
| **Context Optimization V2** | ✅ Built |
| **SDD Layer** | ✅ 8 files (specs, templates, orchestrator) |
| **pi-mono Patterns** | ✅ 5 patterns documented |
| **pi-ai Integration Plan** | ✅ Sprint 1-4 roadmap |
| **Cron Orchestration** | ✅ 5 jobs firing on schedule |
| **Active Swarms** | 7 running |

**Gaps for morning target:**
- ❌ OpenClaw integration for agentic users
- ❌ Skills system for onboarding
- ❌ MD (Markdown) onboarding capability
- ❌ Primary model orchestration ready

---

## Q2: What's the morning target?

**A: "Fully functional Dash product ready for agentic users"**

**Key Requirements:**
1. **OpenClaw Integration** - Primary model orchestration
2. **Skills System** - Onboarding via skills
3. **MD Onboarding** - Markdown-based user onboarding
4. **Agentic Users** - Ready for autonomous agents to use

---

## Q3: What can we achieve in 8.5 hours?

**A: Phased approach**

### Phase 1: Foundation (11:30 PM - 1:00 AM) - 90 min
- [ ] Set up overnight cron monitoring
- [ ] Document current state in MEMORY.md
- [ ] Use /interview for recursive self-improvement on orchestration
- [ ] Ensure all cron jobs stable

### Phase 2: OpenClaw Integration (1:00 AM - 4:00 AM) - 3 hours
- [ ] Research OpenClaw SDK integration
- [ ] Implement primary model orchestration
- [ ] Create OpenClaw connection layer
- [ ] Test with current swarms

### Phase 3: Skills System (4:00 AM - 6:30 AM) - 2.5 hours
- [ ] Design skills system based on pi-mono patterns
- [ ] Create core skills (read, write, edit, bash, test)
- [ ] Implement skill discovery/registration
- [ ] Add skill documentation

### Phase 4: MD Onboarding (6:30 AM - 7:30 AM) - 1 hour
- [ ] Create MD onboarding template
- [ ] Implement onboarding flow
- [ ] Test with sample user journey

### Phase 5: Polish & Handoff (7:30 AM - 8:00 AM) - 30 min
- [ ] Final system verification
- [ ] Document overnight progress
- [ ] Prepare morning briefing
- [ ] Ensure all cron jobs healthy

---

## Q4: What are the key risks?

**A: Risks and Mitigations**

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Swarm staleness** | High | Self-healing active, monitor every 30 min |
| **Build failures** | High | Build monitor every 30 sec, auto-fix |
| **Resource exhaustion** | Medium | Max 6 concurrent swarms |
| **Context overflow** | Medium | Context optimization V2 active |
| **Night mode needed** | Low | Conservative operation 11 PM - 7 AM |

---

## Q5: How to use /interview for recursive self-improvement?

**A: Overnight /interview Strategy**

### Interview Schedule
- **12:00 AM** - Review orchestration patterns, identify gaps
- **2:00 AM** - Assess progress, adjust priorities
- **4:00 AM** - Skills system review, improvement suggestions
- **6:00 AM** - Final review, morning prep recommendations

### Interview Focus Areas
1. **Swarm orchestration** - Are swarms effective?
2. **Self-healing** - Any stale swarms detected?
3. **Pattern application** - Are we using pi-mono patterns?
4. **Integration quality** - Is OpenClaw integration solid?
5. **User readiness** - Is Dash ready for agentic users?

---

## Q6: What specific files need to be created/updated?

**A: Files for Morning Target**

### OpenClaw Integration
- `src/integrations/openclaw/orchestrator.ts` - Primary model orchestration
- `src/integrations/openclaw/connection.ts` - Connection management
- `src/integrations/openclaw/skills.ts` - Skills for OpenClaw

### Skills System
- `skills/core/` - Core skills (read, write, edit, bash, test)
- `skills/registration.ts` - Skill discovery/registration
- `skills/discovery.ts` - Auto-discover skills in workspace

### MD Onboarding
- `onboarding/user-journey.md` - User onboarding template
- `onboarding/agentic-users.md` - Agentic user guide
- `onboarding/quickstart.md` - Quick start guide

### Documentation
- `OPENCLAW_INTEGRATION.md` - OpenClaw integration guide
- `SKILLS_SYSTEM.md` - Skills documentation
- `ONBOARDING.md` - User onboarding

---

## Q7: How to ensure system stays healthy overnight?

**A: Health Monitoring Strategy**

### Critical Monitors
1. **Build Monitor** - Every 30 sec (already active)
2. **Swarm Health** - Every 2 min via Watchdog
3. **Self-Healing** - Auto-detect stale swarms
4. **Context Optimization** - Every 30 min

### Emergency Procedures
- **Stale swarm detected** → Auto-restart within 30 sec
- **Build failure** → Pause swarms, investigate
- **Context overflow** → Trigger compression
- **Resource exhaustion** → Kill oldest swarm

### Reporting
- **Every hour** - Brief status report
- **Every 2 hours** - Detailed progress update
- **Morning** - Complete overnight report

---

## Q8: What's the success criteria for morning?

**A: Morning Target Checklist**

| Criteria | Target | Status |
|----------|--------|--------|
| **Build Status** | 0 TypeScript errors | Current: ✅ |
| **Active Swarms** | 3+ running | Current: 7 |
| **OpenClaw Integration** | Primary model orchestration ready | ❌ Pending |
| **Skills System** | 5+ core skills registered | ❌ Pending |
| **MD Onboarding** | Onboarding template created | ❌ Pending |
| **Self-Healing** | All 4 systems active | ✅ |
| **Context Optimization** | V2 active | ✅ |
| **Cron Jobs** | 5/5 firing on schedule | ✅ |

**Success:** At least 5/8 criteria met by 8 AM

---

## Q9: What if we don't complete everything?

**A: Minimum Viable Overnight**

If time is limited:

| Priority | Item | Time Budget |
|----------|------|-------------|
| **P0** | Keep system running | Continuous |
| **P0** | OpenClaw integration (basic) | 2 hours |
| **P1** | Core skills (3 skills) | 1.5 hours |
| **P1** | Onboarding template | 1 hour |
| **P2** | Advanced skills | If time allows |
| **P2** | Full documentation | If time allows |

---

## Q10: What's the overnight command structure?

**A: Executive Command Structure**

```
Overnight Executive (Claude Code)
├── Cron Orchestrator (automatic)
│   ├── Build Monitor (30 sec)
│   ├── Orchestrator V4 (1 min)
│   ├── Swarm Watchdog (2 min)
│   ├── Progress Report (30 min)
│   └── Context Summarization (30 min)
├── Swarm Manager (automatic + manual)
│   ├── Self-Healing (lifecycle, health, queue)
│   └── Manual swarm spawning if needed
└── Interview System (scheduled)
    ├── 12:00 AM - Orchestration review
    ├── 2:00 AM - Progress assessment
    ├── 4:00 AM - Skills review
    └── 6:00 AM - Final review
```

---

## Summary: Overnight Strategy

### Time Budget (8.5 hours: 11:30 PM - 8:00 AM)

| Phase | Time | Focus |
|-------|------|-------|
| **Prep** | 11:30 PM - 12:00 AM | Set up monitoring, /interview planning |
| **OpenClaw** | 12:00 AM - 3:00 AM | Primary model orchestration |
| **Skills** | 3:00 AM - 5:30 AM | Core skills system |
| **Onboarding** | 5:30 AM - 7:00 AM | MD onboarding |
| **Polish** | 7:00 AM - 8:00 AM | Verification, handoff |

### Key Commitments

1. **System stays running** - Cron jobs continue
2. **Self-healing active** - No manual intervention needed
3. **Progress made** - OpenClaw integration + skills + onboarding
4. **Morning briefing** - Complete overnight report

---

## Next Steps

1. ✅ Accept executive role
2. ✅ Document strategy in MEMORY.md
3. ⏳ Set up overnight monitoring
4. ⏳ Schedule /interview sessions
5. ⏳ Begin OpenClaw integration

**Ready to execute overnight strategy.**
