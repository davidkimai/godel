# Godel Spec Template

Template for Spec-Driven Development with godel Tasks.

## Directory Structure

```
.godel/
├── specs/
│   ├── constitution.md      # Project principles and rules
│   ├── features.md          # High-level feature list
│   └── features/
│       ├── auth/
│       │   ├── spec.md      # Feature specification
│       │   ├── plans.md     # Implementation plan
│       │   └── tasks.md     # Task checklist (hydrates to godel tasks)
│       └── payments/
│           ├── spec.md
│           ├── plans.md
│           └── tasks.md
└── tasks/
    └── lists/
        └── default.json
```

## Task Spec Format (tasks.md)

```markdown
## M1: Authentication
- [ ] M1-T01: Implement JWT token generation
- [ ] M1-T02: Add password hashing with bcrypt ⚠ blocked by M1-T01
- [ ] M1-T03: Create login endpoint

## M2: Authorization
- [ ] M2-T01: Define role-based permissions
- [ ] M2-T02: Add middleware for role checking ⚠ blocked by M2-T01
```

## Hydration Workflow

### Session Start (Hydrate)

```bash
# Load tasks from spec file into godel
godel task hydrate ./.godel/specs/features/auth/tasks.md --list auth-sprint

# Output:
# 📥 Hydrating tasks from spec file...
# ✅ Hydration complete!
#    Created: 6 tasks
#    Dependencies: 2 relationships
#
# 🚀 Ready to start:
#    ⏳ M1-T01: Implement JWT token generation
#    ⏳ M2-T01: Define role-based permissions
```

### During Work

```bash
# Start working on a task
godel task start M1-T01

# Complete it
godel task complete M1-T01
# This automatically unblocks M1-T02
```

### Session End (Sync)

```bash
# Export completed tasks back to spec
godel task sync --list auth-sprint --output ./.godel/specs/features/auth/tasks.md --update

# Commit changes
git add ./.godel/specs/
git commit -m "Complete M1-T01, progress on auth feature"
```

## Multi-Session Collaboration

### Terminal 1 (Orchestrator)
```bash
export GODEL_TASK_LIST_ID=auth-sprint
godel task hydrate ./specs/auth/tasks.md
godel task start M1-T01
```

### Terminal 2 (Subagent)
```bash
export GODEL_TASK_LIST_ID=auth-sprint
godel task start M2-T01  # Works on independent task
```

## Benefits

1. **Persistence**: Tasks survive session restarts via git
2. **Visibility**: Markdown files are human-readable
3. **Collaboration**: Multiple agents work from shared spec
4. **Audit Trail**: Git history shows task progression
5. **Flexibility**: Edit tasks in any text editor

## From Article: Claude Code Task System

Key patterns adopted:

- **subject**: Task title (imperative: "Implement X")
- **activeForm**: Present continuous ("Implementing X") - shown during work
- **blockedBy**: Dependencies that must complete first
- **metadata**: Arbitrary key-value pairs for tracking

## 3-Task Rule

Don't use tasks for simple work:

- ✅ Use tasks: Multi-file features, complex dependencies, parallel work
- ❌ Skip tasks: Single-function fixes, trivial edits, linear A→B→C work

If you have fewer than 3 related steps, just do them directly.
