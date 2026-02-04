# ORCHESTRATION IMPROVEMENT PLAN - February 4, 2026 00:34 CST

## 🎯 PROBLEMS IDENTIFIED

### 1. Ghost Agent Problem
- Agents report success but don't commit work
- 20+ agents announced completion
- Only ~4-6 actually did work

### 2. No Commit Contract
- Agents weren't explicitly told to commit
- Work exists but uncommitted

### 3. No Verification Gates
- Accepted "I'm done" without checking
- No build/test verification required

### 4. Batch Size Too Large
- 18 agents at once = can't track them
- Optimal: 3-5 agents

### 5. AgentId Format Wrong
- Used model name: `openai-codex-gpt-5-2-codex`
- Should use unique IDs: `codex-fix-auth-001`

---

## ✅ FIXES TO IMPLEMENT

### 1. Mandatory Commit Protocol
Add to every agent spawn:
```markdown
## BEFORE REPORTING COMPLETE, YOU MUST:

1. [ ] Run `git status` - confirm changes visible
2. [ ] Run `git add <your-files>` - stage work
3. [ ] Run `git commit -m "[<type>]: <summary>"`
4. [ ] Run `git log --oneline -3` - verify commit exists
5. [ ] Only THEN report completion

IF ANY STEP FAILS: Report failure, not success.
```

### 2. Unique Agent IDs
Change from:
```
agentId: "openai-codex-gpt-5-2-codex"
```
To:
```
agentId: "codex-fix-jwt-001"
agentId: "codex-fix-auth-002"
```

### 3. Verification Gates
Require agents to verify:
- Code compiles: `npm run build`
- Tests pass: `npm test`
- No stubs: `grep -r "TODO|FIXME" src/`
- Commits exist: `git log --oneline -3`

### 4. Smaller Batches
```
Batch 1 (3 agents): P0 critical security
  → Wait for commits
  → Verify each
  → Merge
Batch 2 (3 agents): P0 critical reliability
  → Wait for commits
  → Verify each
  → Merge
...
```

### 5. Checkpoint Protocol
Require agents to report at:
- 25%: "Started, file structure created"
- 50%: "Core logic implemented"
- 75%: "Tests passing locally"
- 100%: "Committed, ready for verification"

---

## 📋 NEW AGENT SPAWN TEMPLATE

```typescript
sessions_spawn({
  agentId: "codex-[task]-[number]", // UNIQUE ID
  label: "[task-name]",
  task: `
    ## CHECKPOINT PROTOCOL
    
    At 25%: Report "Started, files created"
    At 50%: Report "Core logic done"
    At 75%: Report "Tests passing"
    At 100%: COMMIT THEN report complete
    
    ## MANDATORY BEFORE COMPLETION:
    
    1. [ ] git status (verify changes)
    2. [ ] git add -A
    3. [ ] git commit -m "fix: [description]"
    4. [ ] git log --oneline -3 (verify)
    5. [ ] npm run build (must pass)
    
    ## ONLY THEN:
    
    Report completion with commit hash.
    
    [TASK DESCRIPTION]
  `
})
```

---

## 🎯 IMMEDIATE ACTIONS

1. ✅ Document findings (done)
2. ⏳ Stop spawning new agents
3. ⏳ Audit current "running" agents
4. ⏳ Manually commit uncommitted work
5. ⏳ Restart with new protocol (3 agents max)

---

## LESSON LEARNED

**"I'm done" ≠ "Code is committed and verified"**

Fix the commit contract and verification gates,
drop batch size to 3-5, and you'll see real progress.

