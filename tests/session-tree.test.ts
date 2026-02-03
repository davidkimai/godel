/**
 * Session Tree Tests
 * 
 * Tests for the SessionTree with branching and forking functionality.
 */

import { SessionTree, parseSessionEntries } from '../src/core/session-tree';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SessionTree', () => {
  let tree: SessionTree;
  let tempDir: string;
  const testCwd = '/test/project';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'session-tree-test-'));
    tree = SessionTree.create(testCwd, tempDir, 'test-session');
  });

  describe('Basic Operations', () => {
    it('should create a new session with header', () => {
      expect(tree.getSessionId()).toMatch(/^sess_/);
      expect(tree.getCwd()).toBe(testCwd);
      expect(tree.getName()).toBe('test-session');
      expect(existsSync(tree.getSessionFile())).toBe(true);
    });

    it('should append messages', () => {
      const entryId = tree.appendMessage('user', 'Hello');
      
      expect(entryId).toBeDefined();
      expect(entryId.length).toBe(8);
      
      const entry = tree.getEntry(entryId);
      expect(entry).toBeDefined();
      expect(entry?.type).toBe('message');
      expect((entry as any).role).toBe('user');
      expect((entry as any).content).toBe('Hello');
    });

    it('should track leaf position', () => {
      const id1 = tree.appendMessage('user', 'Message 1');
      expect(tree.getLeafId()).toBe(id1);

      const id2 = tree.appendMessage('assistant', 'Message 2');
      expect(tree.getLeafId()).toBe(id2);
    });

    it('should build branch from leaf', () => {
      const id1 = tree.appendMessage('user', 'Message 1');
      const id2 = tree.appendMessage('assistant', 'Message 2');
      const id3 = tree.appendMessage('user', 'Message 3');

      const branch = tree.getBranch();
      
      expect(branch.length).toBe(3);
      expect(branch[0].id).toBe(id1);
      expect(branch[1].id).toBe(id2);
      expect(branch[2].id).toBe(id3);
    });

    it('should get children of an entry', () => {
      const parentId = tree.appendMessage('user', 'Parent');
      
      // Create two children (branches)
      tree.appendMessage('assistant', 'Child 1');
      
      // Reset leaf to parent and create second child
      (tree as any).leafId = parentId;
      tree.appendMessage('assistant', 'Child 2');

      const children = tree.getChildren(parentId);
      expect(children.length).toBe(2);
    });
  });

  describe('Branching', () => {
    it('should create a new branch', () => {
      // Add some initial messages
      tree.appendMessage('user', 'Hello');
      tree.appendMessage('assistant', 'Hi there');

      // Create a branch
      const entryId = tree.createBranch('feature-branch', 'Working on feature');

      expect(entryId).toBeDefined();
      
      // Check branch was created
      const branches = tree.listBranches();
      expect(branches.length).toBe(2); // main + feature-branch
      expect(branches.some(b => b.name === 'feature-branch')).toBe(true);

      // Current branch should be the new branch
      expect(tree.getCurrentBranch()).toBe('feature-branch');
    });

    it('should create a branch at a specific entry', () => {
      const id1 = tree.appendMessage('user', 'Message 1');
      tree.appendMessage('assistant', 'Message 2');
      tree.appendMessage('user', 'Message 3');

      // Create branch at first message
      const entryId = tree.createBranchAt(id1, 'from-start', 'Branch from beginning');

      expect(entryId).toBeDefined();
      
      const branches = tree.listBranches();
      expect(branches.some(b => b.name === 'from-start')).toBe(true);
    });

    it('should throw when creating branch with duplicate name', () => {
      tree.createBranch('my-branch');

      expect(() => {
        tree.createBranch('my-branch');
      }).toThrow('Branch my-branch already exists');
    });

    it('should throw when branching from non-existent entry', () => {
      expect(() => {
        tree.createBranchAt('nonexistent', 'test');
      }).toThrow('Entry nonexistent not found');
    });

    it('should switch between branches', () => {
      const helloId = tree.appendMessage('user', 'Hello');
      
      // Create branch-a from helloId and add content
      tree.createBranchAt(helloId, 'branch-a');
      tree.appendMessage('assistant', 'Branch A response');

      // Switch back to main before creating branch-b to preserve branch-a state
      tree.switchBranch('main');
      
      // Create branch-b from helloId and add content
      tree.createBranchAt(helloId, 'branch-b');
      tree.appendMessage('assistant', 'Branch B response');

      // Verify branches have different content
      tree.switchBranch('branch-a');
      const branchA = tree.getBranch();
      expect(branchA.some(e => (e as any).content === 'Branch A response')).toBe(true);
      expect(branchA.some(e => (e as any).content === 'Branch B response')).toBe(false);

      tree.switchBranch('branch-b');
      const branchB = tree.getBranch();
      expect(branchB.some(e => (e as any).content === 'Branch B response')).toBe(true);
      expect(branchB.some(e => (e as any).content === 'Branch A response')).toBe(false);
    });
  });

  describe('Forking', () => {
    it('should fork session from entry', () => {
      const id1 = tree.appendMessage('user', 'Message 1');
      tree.appendMessage('assistant', 'Message 2');
      tree.appendMessage('user', 'Message 3');

      const result = tree.forkSession(id1, 'forked-session');

      expect(result.newSessionId).toMatch(/^sess_/);
      expect(result.forkedFromEntryId).toBe(id1);
      expect(existsSync(result.newSessionFile)).toBe(true);

      // Verify forked session has correct header
      const content = readFileSync(result.newSessionFile, 'utf8');
      const lines = content.trim().split('\n');
      const header = JSON.parse(lines[0]);
      
      expect(header.type).toBe('session');
      expect(header.name).toBe('forked-session');
      expect(header.parentSession).toBe(tree.getSessionFile());
    });

    it('should include path to entry in forked session', () => {
      const id1 = tree.appendMessage('user', 'Message 1');
      const id2 = tree.appendMessage('assistant', 'Message 2');

      // Fork from id2 - should include id1 and id2
      const result = tree.forkSession(id2, 'forked');
      
      const content = readFileSync(result.newSessionFile, 'utf8');
      const lines = content.trim().split('\n');
      
      // Header + 2 messages (Message 1 and Message 2)
      expect(lines.length).toBe(3);
    });

    it('should throw when forking from non-existent entry', () => {
      expect(() => {
        tree.forkSession('nonexistent', 'test');
      }).toThrow('Entry nonexistent not found');
    });
  });

  describe('Tree Structure', () => {
    it('should build tree structure', () => {
      // Create a simple tree:
      // root
      //   ├─ child1
      //   └─ child2
      const root = tree.appendMessage('user', 'Root');
      
      (tree as any).leafId = root;
      const child1 = tree.appendMessage('assistant', 'Child 1');
      
      (tree as any).leafId = root;
      const child2 = tree.appendMessage('assistant', 'Child 2');

      const treeStruct = tree.getTree();
      
      expect(treeStruct.length).toBe(1); // One root
      expect(treeStruct[0].entry.id).toBe(root);
      expect(treeStruct[0].children.length).toBe(2);
      
      const childIds = treeStruct[0].children.map(c => c.entry.id);
      expect(childIds).toContain(child1);
      expect(childIds).toContain(child2);
    });

    it('should calculate depths correctly', () => {
      const root = tree.appendMessage('user', 'Root');
      const child = tree.appendMessage('assistant', 'Child');
      const grandchild = tree.appendMessage('user', 'Grandchild');

      const treeStruct = tree.getTree();
      
      expect(treeStruct[0].depth).toBe(0);
      expect(treeStruct[0].children[0].depth).toBe(1);
      expect(treeStruct[0].children[0].children[0].depth).toBe(2);
    });
  });

  describe('Labels', () => {
    it('should add labels to entries', () => {
      const entryId = tree.appendMessage('user', 'Important message');
      tree.appendLabel(entryId, 'important');

      const label = tree.getLabel(entryId);
      expect(label).toBe('important');
    });

    it('should remove labels', () => {
      const entryId = tree.appendMessage('user', 'Message');
      tree.appendLabel(entryId, 'label1');
      tree.appendLabel(entryId, undefined);

      const label = tree.getLabel(entryId);
      expect(label).toBeUndefined();
    });

    it('should throw when labeling non-existent entry', () => {
      expect(() => {
        tree.appendLabel('nonexistent', 'test');
      }).toThrow('Entry nonexistent not found');
    });
  });

  describe('Agent Actions', () => {
    it('should record agent actions', () => {
      const entryId = tree.appendAgentAction('spawn', 'agent-123', { task: 'test' });

      const entry = tree.getEntry(entryId);
      expect(entry).toBeDefined();
      expect(entry?.type).toBe('agent_action');
      expect((entry as any).action).toBe('spawn');
      expect((entry as any).agentId).toBe('agent-123');
    });
  });

  describe('Persistence', () => {
    it('should persist to JSONL file', () => {
      tree.appendMessage('user', 'Hello');
      tree.appendMessage('assistant', 'World');
      
      tree.sync();

      const content = readFileSync(tree.getSessionFile(), 'utf8');
      const lines = content.trim().split('\n');
      
      expect(lines.length).toBe(3); // header + 2 messages
      
      const header = JSON.parse(lines[0]);
      expect(header.type).toBe('session');
      expect(header.id).toBe(tree.getSessionId());
    });

    it('should reload existing session', () => {
      const msgId = tree.appendMessage('user', 'Test message');
      tree.sync();

      // Open same session
      const loadedTree = SessionTree.open(tree.getSessionFile());
      
      expect(loadedTree.getSessionId()).toBe(tree.getSessionId());
      
      const entry = loadedTree.getEntry(msgId);
      expect(entry).toBeDefined();
      expect((entry as any).content).toBe('Test message');
    });
  });

  describe('Session Metadata', () => {
    it('should get and set session name', () => {
      expect(tree.getName()).toBe('test-session');
      
      tree.setName('new-name');
      expect(tree.getName()).toBe('new-name');
      
      // Verify persistence
      const content = readFileSync(tree.getSessionFile(), 'utf8');
      const lines = content.trim().split('\n');
      const header = JSON.parse(lines[0]);
      expect(header.name).toBe('new-name');
    });
  });
});

describe('Branch and Fork Integration', () => {
  let tree: SessionTree;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'branch-fork-test-'));
    tree = SessionTree.create('/test', tempDir, 'integration-test');
  });

  it('should support A/B testing workflow', () => {
    // Setup: Create initial conversation
    tree.appendMessage('user', 'How do I optimize this code?');
    const assistantEntry = tree.appendMessage('assistant', 'I can help with that. What language?');
    tree.appendMessage('user', 'TypeScript');

    // Create branch A: Use algorithm optimization
    tree.createBranchAt(assistantEntry, 'algorithm-approach');
    tree.appendMessage('assistant', 'Approach A: Use memoization for O(n) complexity');
    tree.appendMessage('user', 'Thanks!');

    // Switch back and create branch B: Use data structure optimization
    tree.switchBranch('main');
    tree.createBranchAt(assistantEntry, 'datastructure-approach');
    tree.appendMessage('assistant', 'Approach B: Use a Map for better lookup performance');
    tree.appendMessage('user', 'Thanks!');

    // Compare branches
    const comparison = tree.compareBranches(['algorithm-approach', 'datastructure-approach']);
    
    expect(comparison.branches.length).toBe(2);
    expect(comparison.branches[0].entryCount).toBeGreaterThan(0);
    expect(comparison.branches[1].entryCount).toBeGreaterThan(0);
    expect(comparison.differences.length).toBeGreaterThan(0);
    expect(comparison.winner).toBeDefined();
  });

  it('should handle complex tree structures', () => {
    // Build a complex tree with multiple branches
    const root = tree.appendMessage('user', 'Start');
    
    // Branch 1
    tree.createBranchAt(root, 'branch-1');
    const b1Msg1 = tree.appendMessage('assistant', 'Branch 1 response');
    tree.createBranchAt(b1Msg1, 'branch-1-sub');
    tree.appendMessage('user', 'Branch 1 sub-message');

    // Branch 2
    tree.switchBranch('main');
    tree.createBranchAt(root, 'branch-2');
    tree.appendMessage('assistant', 'Branch 2 response');

    // Branch 3
    tree.switchBranch('main');
    tree.createBranchAt(root, 'branch-3');
    tree.appendMessage('assistant', 'Branch 3 response');

    const branches = tree.listBranches();
    // main + branch-1 + branch-1-sub + branch-2 + branch-3 = 5
    // (each createBranchAt creates a BranchPointEntry)
    expect(branches.length).toBe(5);

    const treeStruct = tree.getTree();
    expect(treeStruct[0].children.length).toBe(3); // 3 direct children from root
  });

  it('should maintain isolation between branches', () => {
    // Create main branch content
    const msg1 = tree.appendMessage('user', 'Main message 1');
    
    // Create side branch from msg1 BEFORE adding more to main
    tree.createBranchAt(msg1, 'side-branch');
    tree.appendMessage('assistant', 'Side branch response');

    // Switch back to main and add more content
    tree.switchBranch('main');
    tree.appendMessage('assistant', 'Main assistant response');

    // Main branch should have both messages
    tree.switchBranch('main');
    const mainBranch = tree.getBranch();
    expect(mainBranch.some(e => (e as any).content === 'Main message 1')).toBe(true);
    expect(mainBranch.some(e => (e as any).content === 'Main assistant response')).toBe(true);
    // Main should NOT see side branch content
    expect(mainBranch.some(e => (e as any).content === 'Side branch response')).toBe(false);

    // Side branch should have fork point but not main's later content
    tree.switchBranch('side-branch');
    const sideBranch = tree.getBranch();
    expect(sideBranch.some(e => (e as any).content === 'Main message 1')).toBe(true);
    expect(sideBranch.some(e => (e as any).content === 'Side branch response')).toBe(true);
    expect(sideBranch.some(e => (e as any).content === 'Main assistant response')).toBe(false);
  });
});

describe('SessionTree Static Methods', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'static-test-'));
  });

  it('should create new session', () => {
    const tree = SessionTree.create('/test', tempDir, 'static-test');
    
    expect(tree.getSessionId()).toMatch(/^sess_/);
    expect(existsSync(tree.getSessionFile())).toBe(true);
  });

  it('should open existing session', () => {
    const original = SessionTree.create('/test', tempDir, 'to-open');
    original.appendMessage('user', 'Test');
    original.sync();

    const opened = SessionTree.open(original.getSessionFile());
    
    expect(opened.getSessionId()).toBe(original.getSessionId());
  });

  it('should fork from existing session', () => {
    const original = SessionTree.create('/test', tempDir, 'original');
    const entryId = original.appendMessage('user', 'To fork from');
    original.appendMessage('assistant', 'Response');
    original.sync();

    const result = SessionTree.fork(original.getSessionFile(), entryId, 'forked');
    
    expect(result.newSessionId).toMatch(/^sess_/);
    expect(existsSync(result.newSessionFile)).toBe(true);
    expect(result.forkedFromEntryId).toBe(entryId);
  });
});

describe('parseSessionEntries', () => {
  it('should parse valid JSONL', () => {
    const jsonl = `{"type":"session","version":1,"id":"sess_1","timestamp":"2024-01-01T00:00:00.000Z","cwd":"/test"}
{"type":"message","id":"msg_1","parentId":null,"timestamp":"2024-01-01T00:00:01.000Z","role":"user","content":"Hello"}`;

    const entries = parseSessionEntries(jsonl);
    
    expect(entries.length).toBe(2);
    expect(entries[0].type).toBe('session');
    expect(entries[1].type).toBe('message');
  });

  it('should skip empty lines', () => {
    const jsonl = `{"type":"session","version":1,"id":"sess_1","timestamp":"2024-01-01T00:00:00.000Z","cwd":"/test"}

{"type":"message","id":"msg_1","parentId":null,"timestamp":"2024-01-01T00:00:01.000Z","role":"user","content":"Hello"}`;

    const entries = parseSessionEntries(jsonl);
    
    expect(entries.length).toBe(2);
  });

  it('should skip malformed lines', () => {
    const jsonl = `{"type":"session","version":1,"id":"sess_1","timestamp":"2024-01-01T00:00:00.000Z","cwd":"/test"}
not valid json
{"type":"message","id":"msg_1","parentId":null,"timestamp":"2024-01-01T00:00:01.000Z","role":"user","content":"Hello"}`;

    const entries = parseSessionEntries(jsonl);
    
    expect(entries.length).toBe(2);
  });
});