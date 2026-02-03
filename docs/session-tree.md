# Session Tree Architecture

The Session Tree module provides tree-structured session storage for Dash, enabling non-linear conversation history with branching, forking, and navigation.

## Overview

Traditional session storage is linear - a simple array of messages. Session Tree stores entries as a tree structure where each entry has:
- **id**: Unique identifier (8-character hex string)
- **parentId**: Reference to parent entry (null for root)
- **type**: Entry type (message, agent_action, branch_point, etc.)
- **timestamp**: ISO timestamp

This structure enables:
- **Branching**: Create multiple continuations from any point
- **Forking**: Create new sessions from specific entries
- **A/B Testing**: Compare outcomes of different branches
- **Navigation**: Jump to any point in history

## Entry Types

### MessageEntry
Standard conversation messages:
```typescript
{
  type: 'message',
  id: 'abc123',
  parentId: 'def456',
  timestamp: '2024-01-01T00:00:00.000Z',
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: 'Hello',
  metadata?: { model, provider, cost, tokens }
}
```

### AgentActionEntry
Agent lifecycle events:
```typescript
{
  type: 'agent_action',
  id: 'abc123',
  parentId: 'def456',
  timestamp: '2024-01-01T00:00:00.000Z',
  action: 'spawn' | 'complete' | 'fork' | 'branch',
  agentId: 'agent-123',
  data?: { ... }
}
```

### BranchPointEntry
Marks branch creation:
```typescript
{
  type: 'branch_point',
  id: 'abc123',
  parentId: 'def456',
  timestamp: '2024-01-01T00:00:00.000Z',
  branchName: 'feature-branch',
  description?: 'Working on feature X'
}
```

## Usage

### Creating a Session

```typescript
import { SessionTree } from './core/session-tree';

// Create new session
const tree = SessionTree.create(
  '/project/path',     // Working directory
  './sessions',        // Session storage directory
  'my-session'         // Optional name
);

console.log(tree.getSessionId());  // sess_abc123
```

### Adding Messages

```typescript
// Append messages (becomes child of current leaf)
const entryId = tree.appendMessage('user', 'Hello');
const responseId = tree.appendMessage('assistant', 'Hi there!', {
  model: 'kimi-k2.5',
  provider: 'moonshot',
  cost: 0.001,
  tokens: 150
});
```

### Branching

```typescript
// Create branch from current position
tree.appendMessage('user', 'How do I optimize this?');
tree.appendMessage('assistant', 'I have several approaches...');

// Create branch for approach A
tree.createBranch('approach-a', 'Using algorithm optimization');
tree.appendMessage('assistant', 'Approach A: Use memoization');

// Switch back to main and create branch B
tree.switchBranch('main');
tree.createBranch('approach-b', 'Using data structure changes');
tree.appendMessage('assistant', 'Approach B: Use a Map');
```

### Branch at Specific Entry

```typescript
// Create branch from a specific historical entry
const someEntryId = 'abc123';
tree.createBranchAt(someEntryId, 'alternative', 'Try different approach');
```

### Forking

Fork creates a new session file containing only the path from root to a specific entry:

```typescript
// Fork from specific entry
const result = tree.forkSession(entryId, 'forked-session-name');

console.log(result.newSessionId);      // sess_def456
console.log(result.newSessionFile);    // /path/to/sessions/2024-01-01..._sess_def456.jsonl
console.log(result.forkedFromEntryId); // abc123
```

### Navigating

```typescript
// Get current branch (path from root to leaf)
const branch = tree.getBranch();
branch.forEach(entry => console.log(entry.type));

// Get specific entry
const entry = tree.getEntry('abc123');

// Get children of an entry
const children = tree.getChildren('parent-id');

// Switch to different branch
tree.switchBranch('approach-a');

// Get all branches
const branches = tree.listBranches();
```

### Tree Visualization

```typescript
// Get tree structure for visualization
const treeData = tree.getTree();

// treeData is an array of SessionTreeNode:
// {
//   entry: SessionEntry,
//   children: SessionTreeNode[],
//   label?: string,
//   depth: number
// }
```

### A/B Testing - Branch Comparison

```typescript
// Compare branches for A/B testing
const comparison = tree.compareBranches(['approach-a', 'approach-b']);

console.log(comparison);
// {
//   branches: [
//     { branchId: 'approach-a', name: 'approach-a', entryCount: 5, totalCost: 0.05, ... },
//     { branchId: 'approach-b', name: 'approach-b', entryCount: 3, totalCost: 0.03, ... }
//   ],
//   winner: 'approach-b',  // Lowest cost by default
//   differences: [
//     { metric: 'cost', branchA: 'approach-a', branchB: 'approach-b', diff: -0.02, percentDiff: -40 },
//     ...
//   ]
// }
```

### Labels

```typescript
// Label important entries
tree.appendLabel(entryId, 'critical-decision');
tree.appendLabel(entryId, 'checkpoint-1');

// Remove label
tree.appendLabel(entryId, undefined);

// Get label
const label = tree.getLabel(entryId);
```

## Storage Format

Sessions are stored as JSONL (JSON Lines) files:

```jsonl
{"type":"session","version":1,"id":"sess_abc123","timestamp":"2024-01-01T00:00:00.000Z","cwd":"/project"}
{"type":"message","id":"a1b2c3d4","parentId":null,"timestamp":"2024-01-01T00:00:01.000Z","role":"user","content":"Hello"}
{"type":"message","id":"e5f6g7h8","parentId":"a1b2c3d4","timestamp":"2024-01-01T00:00:02.000Z","role":"assistant","content":"Hi!"}
{"type":"branch_point","id":"i9j0k1l2","parentId":"e5f6g7h8","timestamp":"2024-01-01T00:00:03.000Z","branchName":"branch-a"}
```

## Integration with SwarmOrchestrator

```typescript
import { SwarmOrchestrator } from './core/swarm-orchestrator';

// Create swarm with branching enabled
const swarm = await orchestrator.create({
  name: 'optimization-swarm',
  task: 'Optimize database queries',
  initialAgents: 2,
  maxAgents: 5,
  strategy: 'parallel',
  enableBranching: true,  // Enable session tree
  enableEventStreaming: true
});

// Create branches for A/B testing
await orchestrator.createBranch(swarm.id, 'approach-1', 'Use indexing');
await orchestrator.createBranch(swarm.id, 'approach-2', 'Use caching');

// Agents work on different branches
// ...

// Compare results
const comparison = orchestrator.compareBranches(swarm.id, ['approach-1', 'approach-2']);
console.log(`Winner: ${comparison.winner}`);
```

## Dashboard Integration

The session tree is exposed via REST API:

```
GET  /api/swarms/:id/tree          - Get tree visualization
GET  /api/swarms/:id/branches      - List branches
POST /api/swarms/:id/branches      - Create new branch
POST /api/swarms/:id/switch-branch - Switch active branch
POST /api/swarms/:id/compare       - Compare branches
```

## Architecture Decisions

### Tree Structure
- Parent references (not child references) for efficient append operations
- 8-character hex IDs for readability while maintaining uniqueness
- Immutable entries - tree grows by adding, never modifying

### Persistence
- JSONL format for human readability and easy debugging
- Append-only writes for performance
- Full file rewrite on structural changes (rare)

### Branching Model
- Branches are named pointers to leaf positions
- Branch points stored as entries for audit trail
- Current branch tracked separately for navigation

### Forking vs Branching
- **Branching**: Stays in same session file, switches context
- **Forking**: Creates new session file, preserves original

## Performance Considerations

- Entry lookup: O(1) via Map index
- Branch traversal: O(depth) - typically small
- Tree building: O(n) - for visualization only
- File writes: Append-only for normal operations

## Future Enhancements

- Context compaction for long sessions
- Lazy loading for large trees
- Branch merging/rebasing
- Distributed session storage