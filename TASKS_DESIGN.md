# Godel Tasks System Design

## Overview

Inspired by Claude Code's Tasks (which was inspired by Steve Yegge's Beads), godel Tasks is a file-system-based task management system for coordinating work across multiple agents and sessions.

## Key Differences from Existing Task System

| Feature | Current (v2.0) | New Tasks System (v3.0) |
|---------|---------------|------------------------|
| Storage | In-memory | Filesystem (~/.godel/tasks/) |
| Persistence | None (lost on restart) | Persistent across sessions |
| Dependencies | ❌ No | ✅ Yes (task dependencies) |
| Multi-session | ❌ No | ✅ Yes (file-based sharing) |
| Subagent sync | ❌ No | ✅ Yes (broadcast updates) |
| TaskLists | ❌ No | ✅ Yes (grouped tasks) |

## Architecture

### Directory Structure

```
~/.godel/tasks/
├── lists/
│   ├── default.json          # Default task list
│   ├── sprint-1.json         # Named task list
│   └── feature-auth.json     # Project-specific list
├── index.json                # Index of all task lists
└── .lock/                    # Lock files for coordination
```

### Task Schema

```typescript
interface Task {
  id: string;                    // godel-{5-char} format
  title: string;
  description?: string;
  status: 'open' | 'in-progress' | 'blocked' | 'review' | 'done';
  
  // Dependencies
  dependsOn: string[];           // Task IDs that must complete first
  blocks: string[];              // Tasks blocked by this one
  
  // Assignment
  assignee?: string;             // Agent ID
  worktree?: string;             // Git worktree path
  
  // Metadata
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'task' | 'bug' | 'feature' | 'refactor' | 'research';
  tags: string[];
  
  // Git integration
  branch?: string;               // Git branch for this task
  commits: string[];             // Associated commits
  
  // Timestamps
  createdAt: string;             // ISO 8601
  updatedAt: string;
  completedAt?: string;
  
  // Subagent coordination
  sessions: string[];            // Session IDs working on this task
}
```

### TaskList Schema

```typescript
interface TaskList {
  id: string;                    // Unique list ID
  name: string;                  // Human-readable name
  description?: string;
  tasks: string[];               // Task IDs
  status: 'active' | 'completed' | 'archived';
  
  // Collaboration
  sessions: string[];            // Sessions subscribed to this list
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

## Workflow

### Creating a Task

```bash
# Create a task in default list
godel task create "Fix authentication bug" --type bug --priority high

# Create with dependencies
godel task create "Implement OAuth" --type feature --depends-on godel-abc12

# Create in specific list
godel task create "Add tests" --list sprint-1
```

### Task Lifecycle

```
┌─────────┐    start     ┌─────────────┐    complete    ┌─────────┐
│  open   │ ───────────▶ │ in-progress │ ─────────────▶ │  done   │
└────┬────┘              └──────┬──────┘                └─────────┘
     │                          │
     │ block                    │ fail
     ▼                          ▼
┌─────────┐              ┌─────────────┐
│ blocked │              │    open     │ (retry)
└─────────┘              └─────────────┘
```

### Multi-Session Coordination

```bash
# Session 1 starts working on task list
GODEL_TASK_LIST_ID=sprint-1 godel

# Session 2 (subagent) joins same list
GODEL_TASK_LIST_ID=sprint-1 godel agent spawn --task godel-abc12

# Updates are broadcast via file watchers
```

## CLI Commands

### Task Commands

```bash
godel task create <title> [options]
  --type <type>           # task, bug, feature, refactor, research
  --priority <priority>   # low, medium, high, critical
  --description <desc>    # Task description
  --depends-on <ids>      # Comma-separated task IDs
  --list <list-id>        # Task list ID

godel task list [options]
  --status <status>       # Filter by status
  --assignee <agent>      # Filter by assignee
  --list <list-id>        # Show tasks from specific list
  --all                   # Show all tasks across lists

godel task show <task-id>
  # Display task details including dependencies

godel task start <task-id>
  # Mark task as in-progress

godel task complete <task-id>
  # Mark task as done

godel task block <task-id> --reason <reason>
  # Mark task as blocked

godel task assign <task-id> --agent <agent-id>
  # Assign task to agent

godel task delete <task-id>
  # Delete task
```

### TaskList Commands

```bash
godel tasklist create <name> [options]
  --description <desc>

godel tasklist list
  # Show all task lists

godel tasklist show <list-id>
  # Show tasks in list (kanban view)

godel tasklist archive <list-id>
  # Archive completed list

godel tasklist delete <list-id>
  # Delete list and all tasks
```

## Implementation Plan

### Team A: Data Models (1 day)
- Create Task interface
- Create TaskList interface
- Define enums and types
- Validation schemas

### Team B: File Storage (2 days)
- Task storage (CRUD operations)
- TaskList storage
- File locking for coordination
- JSON serialization/deserialization
- Error handling

### Team C: TaskList Management (2 days)
- TaskList service
- Task coordination
- Dependency resolution
- Status propagation
- File watching for updates

### Team D: CLI Commands (2 days)
- Task commands implementation
- TaskList commands implementation
- Output formatting
- Error handling
- Help text

### Team E: Tests & Docs (2 days)
- Unit tests
- Integration tests
- CLI tests
- Documentation
- Examples

## Benefits

1. **Persistence**: Tasks survive crashes and restarts
2. **Collaboration**: Multiple agents can work on same task list
3. **Dependencies**: Model complex project workflows
4. **Git Integration**: Link tasks to branches and commits
5. **Simple**: File-based, no database required
6. **Observable**: Tasks are just JSON files - inspectable and debuggable
