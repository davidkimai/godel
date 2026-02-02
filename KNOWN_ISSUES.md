# Known Issues & Workarounds

**Document Version:** 2.0  
**Last Updated:** 2026-02-02  
**Applies To:** Dash v2.0.0  

---

## Critical Issues

### 1. Swarm Operations Require Lifecycle Startup
**Issue ID:** BUG-010  
**Severity:** 🔴 Critical  
**Component:** CLI / Swarm  
**Status:** NEW (Found in Final Production Test)

#### Problem
Swarm creation fails because AgentLifecycle is not started:

```bash
$ dash swarm create -n prod-test -t "Test" -i 3
🐝 Creating swarm...
❌ Failed to create swarm: AgentLifecycle is not started
```

#### Impact
- Cannot create swarms via CLI
- Cannot scale swarms
- Cannot check swarm status
- Core orchestration feature unavailable

#### Root Cause
The AgentLifecycle component needs to be explicitly started before swarm operations, but the CLI doesn't initialize it automatically.

#### Workaround
**None available.** Swarm operations are non-functional until lifecycle startup is implemented.

#### Fix Required
Start AgentLifecycle during CLI initialization in `src/cli/index.ts` or `src/core/lifecycle.ts`.

---

### 2. Self-Improve Status Broken (Lazy Loading)
**Issue ID:** BUG-011  
**Severity:** 🟡 Medium  
**Component:** CLI / Self-Improve  
**Status:** NEW (Found in Final Production Test)

#### Problem
Self-improve status command produces no output:

```bash
$ dash self-improve status
(no output)
```

Direct module invocation works:
```bash
$ node -e "const {registerSelfImproveCommand} = require('./dist/cli/commands/self-improve'); ..."
📊 Self-improvement status:
   API: http://localhost:7373
   Status: Running
```

#### Impact
- Cannot check self-improvement status
- Lazy loading pattern broken for this command

#### Root Cause
The lazy loading hook in `src/cli/index.ts` doesn't properly load subcommands for self-improve.

#### Workaround
Use direct module invocation (not practical for end users).

#### Fix Required
Either:
- Load self-improve command immediately (not lazy)
- Fix the lazy loading hook mechanism

---

## Resolved Issues

### ✅ S49: Budget CLI Now Working
**Issue ID:** BUG-001  
**Status:** RESOLVED  

The budget CLI now works correctly:
```bash
$ dash budget set --project final-test --daily 50 --cost 5
✅ Project daily budget set: 50 tokens / $5.0000
```

### ✅ S53: Budget Persistence Fixed
**Issue ID:** BUG-001b  
**Status:** RESOLVED  

Budgets now persist across CLI invocations:
```bash
$ dash budget set --project final-test --daily 50 --cost 5
# ... new process ...
$ dash budget status --project final-test
Budget: 50 tokens / $5.0000
Used: $0.0000 (0.0%)
```

### ✅ S50: OpenClaw State Persistence
**Issue ID:** BUG-002  
**Status:** RESOLVED  

OpenClaw mock connection and state fully functional.

### ✅ S51: ClawHub List Fixed
**Issue ID:** BUG-003  
**Status:** RESOLVED  

ClawHub list no longer crashes with lazy-loading errors.

### ✅ Status Command Implemented
**Issue ID:** BUG-006  
**Status:** RESOLVED  

`dash status` command now works and shows system overview.

---

## High Priority Issues

### 3. ClawHub Search Server Error (500)
**Issue ID:** BUG-012  
**Severity:** 🟡 Medium  
**Component:** CLI / ClawHub  
**Status:** NEW (Found in Final Production Test)

#### Problem
ClawHub search returns 500 error:

```bash
$ dash clawhub search "test"
🔍 Searching ClawHub...
❌ Search failed: Error: Search failed: 500 Internal Server Error
```

#### Impact
- Cannot search for skills on ClawHub
- Limits skill discovery

#### Root Cause
External API issue - ClawHub registry returning 500.

#### Workaround
List installed skills instead:
```bash
dash clawhub list
```

#### Fix Required
- Add retry logic for 500 errors
- Or investigate ClawHub API issue

---

### 4. Swarm Status Requires ID Instead of Name
**Issue ID:** BUG-004  
**Severity:** 🟡 Medium  
**Component:** CLI / Swarm  
**Status:** Open

#### Problem
Cannot check swarm status by name:

```bash
dash swarm create --name prod-test --task "Test" --initial-agents 5
# Creates: swarm_1770069657363

dash swarm status prod-test
# Error: "Swarm prod-test not found"
```

#### Impact
- Poor user experience
- Requires users to track IDs separately
- Inconsistent with create command that accepts name

#### Workaround
Use the swarm ID returned from create:
```bash
# After creating, use the ID:
dash swarm status swarm_1770069657363
```

Or list swarms to find the ID:
```bash
dash swarm list
# Copy the ID from the list
dash swarm status <id>
```

#### Fix Required
Add name-based lookup in `src/cli/commands/swarm.ts` status command.

---

### 5. Agent List Output Format
**Issue ID:** BUG-013  
**Severity:** 🟢 Low  
**Component:** CLI / Agents  
**Status:** NEW (Found in Final Production Test)

#### Problem
Agent labels are not displayed in list output, making grep filtering difficult:

```bash
$ dash agents spawn "Test agent" --label prod-agent-test
✅ Agent spawned successfully!

$ dash agents list | grep prod-agent-test
# No match - label not shown in output
```

#### Impact
- Cannot filter agents by label using grep
- Scripting around agent labels is difficult

#### Workaround
Use agent IDs instead of labels for scripting:
```bash
# Capture ID from spawn output
AGENT_ID=$(dash agents spawn "Test agent" | grep "ID:" | awk '{print $2}')
dash agents status $AGENT_ID
```

#### Fix Required
Add label column to agent list output.

---

## Workaround Summary Table

| Issue | Status | Workaround Available | Effort |
|-------|--------|---------------------|--------|
| Swarm lifecycle | 🔴 Critical | ❌ No - blocked | - |
| Self-improve lazy loading | 🟡 Medium | ❌ No | - |
| ClawHub search 500 | 🟡 Medium | ✅ Use list instead | Low |
| Swarm status by name | 🟡 Medium | ✅ Use ID instead | Medium |
| Agent label grep | 🟢 Low | ✅ Use IDs for scripting | Medium |

---

## Issue History

### Fixed in This Release (v2.0.0)
- BUG-001: Budget CLI argument parsing
- BUG-001b: Budget persistence (S53)
- BUG-002: OpenClaw state persistence (S50)
- BUG-003: ClawHub list lazy loading (S51)
- BUG-006: Missing status command

### Discovered in Final Test
- BUG-010: Swarm lifecycle startup
- BUG-011: Self-improve lazy loading
- BUG-012: ClawHub search 500 error
- BUG-013: Agent labels not in list output

---

## Reporting New Issues

When reporting issues, please include:

1. **Command executed** (exact syntax)
2. **Expected behavior**
3. **Actual behavior** (with full error message)
4. **Environment:** OS, Node version, Dash version
5. **Workaround attempted**

Report to: [GitHub Issues](https://github.com/davidkimai/dash/issues)

---

## Issue Tracking

| Issue ID | Status | Target Fix |
|----------|--------|------------|
| BUG-010 | 🔴 Open | v2.0.1 |
| BUG-011 | 🔴 Open | v2.0.1 |
| BUG-012 | 🟡 Open | v2.0.1 |
| BUG-004 | 🟡 Open | v2.0.2 |
| BUG-013 | 🟢 Open | v2.0.2 |
| BUG-001 | ✅ Resolved | v2.0.0 |
| BUG-001b | ✅ Resolved | v2.0.0 |
| BUG-002 | ✅ Resolved | v2.0.0 |
| BUG-003 | ✅ Resolved | v2.0.0 |
| BUG-006 | ✅ Resolved | v2.0.0 |
