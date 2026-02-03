/**
 * Session Tree - Tree-Structured Session Storage
 * 
 * Implements a tree-structured session storage system where each entry has
 * an id and parentId, enabling non-linear conversation history with branching,
 * forking, and navigation.
 * 
 * Inspired by pi-mono's session-manager.ts patterns.
 */

import { randomUUID } from 'crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs';
import { join, resolve } from 'path';

// ============================================================================
// Types
// ============================================================================

export const CURRENT_SESSION_VERSION = 1;

export interface SessionHeader {
  type: 'session';
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
  name?: string;
  parentSession?: string;
}

export interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface MessageEntry extends SessionEntryBase {
  type: 'message';
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: {
    model?: string;
    provider?: string;
    cost?: number;
    tokens?: number;
    [key: string]: unknown;
  };
}

export interface AgentActionEntry extends SessionEntryBase {
  type: 'agent_action';
  action: 'spawn' | 'complete' | 'fork' | 'branch';
  agentId: string;
  data?: Record<string, unknown>;
}

export interface BranchPointEntry extends SessionEntryBase {
  type: 'branch_point';
  branchName: string;
  description?: string;
}

export interface CompactionEntry extends SessionEntryBase {
  type: 'compaction';
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
}

export interface LabelEntry extends SessionEntryBase {
  type: 'label';
  targetId: string;
  label: string | undefined;
}

export type SessionEntry =
  | MessageEntry
  | AgentActionEntry
  | BranchPointEntry
  | CompactionEntry
  | LabelEntry;

export type FileEntry = SessionHeader | SessionEntry;

export interface SessionTreeNode {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
  depth: number;
}

export interface BranchInfo {
  id: string;
  name: string;
  rootEntryId: string;
  leafEntryId: string;
  entryCount: number;
  createdAt: string;
}

export interface ForkResult {
  newSessionId: string;
  newSessionFile: string;
  forkedFromEntryId: string;
}

export interface BranchComparison {
  branches: Array<{
    branchId: string;
    name: string;
    entryCount: number;
    totalCost: number;
    totalTokens: number;
    lastActivity: string;
    outcome?: string;
  }>;
  winner?: string;
  differences: Array<{
    metric: string;
    branchA: string;
    branchB: string;
    diff: number;
    percentDiff: number;
  }>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Generate a unique short ID (8 hex chars, collision-checked) */
function generateId(existingIds: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const id = randomUUID().slice(0, 8);
    if (!existingIds.has(id)) return id;
  }
  return randomUUID();
}

/** Parse session entries from JSONL content */
export function parseSessionEntries(content: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const lines = content.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as FileEntry;
      entries.push(entry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/** Load entries from a session file */
export function loadEntriesFromFile(filePath: string): FileEntry[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf8');
  return parseSessionEntries(content);
}

// ============================================================================
// Session Tree Manager
// ============================================================================

export class SessionTree {
  private sessionId: string;
  private sessionFile: string;
  private sessionDir: string;
  private cwd: string;
  private name?: string;

  private fileEntries: FileEntry[] = [];
  private byId: Map<string, SessionEntry> = new Map();
  private labelsById: Map<string, string> = new Map();
  private leafId: string | null = null;
  private branches: Map<string, BranchInfo> = new Map();
  private currentBranchId: string = 'main';

  private dirty: boolean = false;

  constructor(
    cwd: string,
    sessionDir: string,
    sessionFile: string,
    name?: string
  ) {
    this.cwd = cwd;
    this.sessionDir = sessionDir;
    this.sessionFile = sessionFile;
    this.name = name;

    if (existsSync(sessionFile)) {
      this.loadFromFile();
    } else {
      this.createNewSession();
    }
  }

  // =========================================================================
  // Session Management
  // =========================================================================

  private createNewSession(): void {
    this.sessionId = `sess_${randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();

    const header: SessionHeader = {
      type: 'session',
      version: CURRENT_SESSION_VERSION,
      id: this.sessionId,
      timestamp,
      cwd: this.cwd,
      name: this.name,
    };

    this.fileEntries = [header];
    this.byId.clear();
    this.labelsById.clear();
    this.leafId = null;
    this.dirty = true;

    // Create default main branch
    this.currentBranchId = 'main';
    this.branches.set('main', {
      id: 'main',
      name: 'main',
      rootEntryId: '',
      leafEntryId: '',
      entryCount: 0,
      createdAt: timestamp,
    });

    this.flush();
  }

  private loadFromFile(): void {
    this.fileEntries = loadEntriesFromFile(this.sessionFile);

    if (this.fileEntries.length === 0) {
      this.createNewSession();
      return;
    }

    const header = this.fileEntries.find(
      (e): e is SessionHeader => e.type === 'session'
    );

    if (!header) {
      throw new Error(`Invalid session file: missing header in ${this.sessionFile}`);
    }

    this.sessionId = header.id;
    this.name = header.name;
    this.rebuildIndex();
    this.dirty = false;
  }

  private rebuildIndex(): void {
    this.byId.clear();
    this.labelsById.clear();
    this.leafId = null;
    this.branches.clear();

    for (const entry of this.fileEntries) {
      if (entry.type === 'session') continue;

      this.byId.set(entry.id, entry);
      this.leafId = entry.id;

      if (entry.type === 'label' && entry.label) {
        this.labelsById.set(entry.targetId, entry.label);
      }

      // Rebuild branch info from branch_point entries
      if (entry.type === 'branch_point') {
        this.branches.set(entry.branchName, {
          id: entry.branchName,
          name: entry.branchName,
          rootEntryId: entry.parentId || entry.id,
          leafEntryId: entry.id,
          entryCount: 0,
          createdAt: entry.timestamp,
        });
      }
    }

    // Ensure main branch exists
    if (!this.branches.has('main')) {
      const firstEntry = this.fileEntries.find((e) => e.type !== 'session');
      this.branches.set('main', {
        id: 'main',
        name: 'main',
        rootEntryId: firstEntry?.id || '',
        leafEntryId: this.leafId || '',
        entryCount: this.byId.size,
        createdAt: new Date().toISOString(),
      });
    }

    this.currentBranchId = 'main';
  }

  // =========================================================================
  // Entry Operations
  // =========================================================================

  private appendEntry(entry: SessionEntry): string {
    this.fileEntries.push(entry);
    this.byId.set(entry.id, entry);
    this.leafId = entry.id;
    this.dirty = true;

    // Update current branch's leafEntryId if we're on a named branch
    const currentBranch = this.branches.get(this.currentBranchId);
    if (currentBranch) {
      currentBranch.leafEntryId = entry.id;
    }

    this.flush();
    return entry.id;
  }

  appendMessage(
    role: MessageEntry['role'],
    content: string,
    metadata?: MessageEntry['metadata']
  ): string {
    const entry: MessageEntry = {
      type: 'message',
      id: generateId(new Set(this.byId.keys())),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      role,
      content,
      metadata,
    };
    return this.appendEntry(entry);
  }

  appendAgentAction(
    action: AgentActionEntry['action'],
    agentId: string,
    data?: Record<string, unknown>
  ): string {
    const entry: AgentActionEntry = {
      type: 'agent_action',
      id: generateId(new Set(this.byId.keys())),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      action,
      agentId,
      data,
    };
    return this.appendEntry(entry);
  }

  appendLabel(targetId: string, label: string | undefined): string {
    if (!this.byId.has(targetId) && targetId !== '') {
      throw new Error(`Entry ${targetId} not found`);
    }

    const entry: LabelEntry = {
      type: 'label',
      id: generateId(new Set(this.byId.keys())),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      targetId,
      label,
    };

    if (label) {
      this.labelsById.set(targetId, label);
    } else {
      this.labelsById.delete(targetId);
    }

    return this.appendEntry(entry);
  }

  /**
   * Get the label for an entry, if any.
   */
  getLabel(entryId: string): string | undefined {
    return this.labelsById.get(entryId);
  }

  // =========================================================================
  // Branch Operations
  // =========================================================================

  /**
   * Create a new branch from the current leaf position
   */
  createBranch(branchName: string, description?: string): string {
    if (this.branches.has(branchName)) {
      throw new Error(`Branch ${branchName} already exists`);
    }

    const entry: BranchPointEntry = {
      type: 'branch_point',
      id: generateId(new Set(this.byId.keys())),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      branchName,
      description,
    };

    const entryId = this.appendEntry(entry);

    this.branches.set(branchName, {
      id: branchName,
      name: branchName,
      rootEntryId: this.leafId || entryId,
      leafEntryId: entryId,
      entryCount: 0,
      createdAt: new Date().toISOString(),
    });

    this.currentBranchId = branchName;

    return entryId;
  }

  /**
   * Create a branch from a specific entry point (for A/B testing)
   */
  createBranchAt(entryId: string, branchName: string, description?: string): string {
    if (!this.byId.has(entryId)) {
      throw new Error(`Entry ${entryId} not found`);
    }

    if (this.branches.has(branchName)) {
      throw new Error(`Branch ${branchName} already exists`);
    }

    // Move leaf to the entry point
    this.leafId = entryId;

    // Create branch point
    const entry: BranchPointEntry = {
      type: 'branch_point',
      id: generateId(new Set(this.byId.keys())),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      branchName,
      description,
    };

    const newEntryId = this.appendEntry(entry);

    this.branches.set(branchName, {
      id: branchName,
      name: branchName,
      rootEntryId: entryId,
      leafEntryId: newEntryId,
      entryCount: 0,
      createdAt: new Date().toISOString(),
    });

    this.currentBranchId = branchName;

    return newEntryId;
  }

  /**
   * Switch to a different branch
   */
  switchBranch(branchName: string): void {
    const branch = this.branches.get(branchName);
    if (!branch) {
      throw new Error(`Branch ${branchName} not found`);
    }

    this.currentBranchId = branchName;
    this.leafId = branch.leafEntryId;
  }

  /**
   * Get all entries in the current branch
   */
  getBranch(branchName?: string): SessionEntry[] {
    const targetBranch = branchName ? this.branches.get(branchName) : null;
    // Start from the branch's leaf if specified, otherwise use current leaf
    const startId = targetBranch?.leafEntryId || this.leafId;

    const path: SessionEntry[] = [];
    let current = startId ? this.byId.get(startId) : undefined;
    const stopId = targetBranch?.rootEntryId || null;

    while (current) {
      path.unshift(current);
      // Stop if we've reached the root entry of this branch
      if (stopId && current.id === stopId) break;
      current = current.parentId ? this.byId.get(current.parentId) : undefined;
    }

    return path;
  }

  /**
   * Get list of all branches
   */
  listBranches(): BranchInfo[] {
    return Array.from(this.branches.values());
  }

  /**
   * Get the current branch name
   */
  getCurrentBranch(): string {
    return this.currentBranchId;
  }

  // =========================================================================
  // Fork Operations
  // =========================================================================

  /**
   * Fork the session from a specific entry into a new session file
   */
  forkSession(entryId: string, newName: string): ForkResult {
    if (!this.byId.has(entryId)) {
      throw new Error(`Entry ${entryId} not found`);
    }

    // Get the path from root to the entry
    const path = this.getBranchFromEntry(entryId);

    // Create new session file
    const newSessionId = `sess_${randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();
    const fileTimestamp = timestamp.replace(/[:.]/g, '-');
    const newSessionFile = join(this.sessionDir, `${fileTimestamp}_${newSessionId}.jsonl`);

    // Create header
    const header: SessionHeader = {
      type: 'session',
      version: CURRENT_SESSION_VERSION,
      id: newSessionId,
      timestamp,
      cwd: this.cwd,
      name: newName,
      parentSession: this.sessionFile,
    };

    // Write header and path entries
    const lines = [JSON.stringify(header)];
    for (const entry of path) {
      lines.push(JSON.stringify(entry));
    }

    writeFileSync(newSessionFile, lines.join('\n') + '\n');

    return {
      newSessionId,
      newSessionFile,
      forkedFromEntryId: entryId,
    };
  }

  private getBranchFromEntry(entryId: string): SessionEntry[] {
    const path: SessionEntry[] = [];
    let current = this.byId.get(entryId);

    while (current) {
      path.unshift(current);
      current = current.parentId ? this.byId.get(current.parentId) : undefined;
    }

    return path;
  }

  // =========================================================================
  // Tree Operations
  // =========================================================================

  /**
   * Build the tree structure starting from roots
   */
  getTree(): SessionTreeNode[] {
    const entries = this.getEntries();
    const nodeMap = new Map<string, SessionTreeNode>();
    const roots: SessionTreeNode[] = [];

    // Create nodes
    for (const entry of entries) {
      const label = this.labelsById.get(entry.id);
      nodeMap.set(entry.id, {
        entry,
        children: [],
        label,
        depth: 0,
      });
    }

    // Build tree
    for (const entry of entries) {
      const node = nodeMap.get(entry.id)!;
      if (entry.parentId === null || entry.parentId === entry.id) {
        roots.push(node);
      } else {
        const parent = nodeMap.get(entry.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          // Orphan - treat as root
          roots.push(node);
        }
      }
    }

    // Calculate depths and sort children
    const calculateDepths = (nodes: SessionTreeNode[], depth: number) => {
      for (const node of nodes) {
        node.depth = depth;
        node.children.sort(
          (a: SessionTreeNode, b: SessionTreeNode) =>
            new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime()
        );
        calculateDepths(node.children, depth + 1);
      }
    };
    calculateDepths(roots, 0);

    return roots;
  }

  /**
   * Get all entries (excluding header)
   */
  getEntries(): SessionEntry[] {
    return this.fileEntries.filter(
      (e): e is SessionEntry => e.type !== 'session'
    );
  }

  /**
   * Get a specific entry by ID
   */
  getEntry(id: string): SessionEntry | undefined {
    return this.byId.get(id);
  }

  /**
   * Get the current leaf entry
   */
  getLeafEntry(): SessionEntry | undefined {
    return this.leafId ? this.byId.get(this.leafId) : undefined;
  }

  /**
   * Get the current leaf ID
   */
  getLeafId(): string | null {
    return this.leafId;
  }

  /**
   * Get children of an entry
   */
  getChildren(parentId: string): SessionEntry[] {
    const children: SessionEntry[] = [];
    for (const entry of this.byId.values()) {
      if (entry.parentId === parentId) {
        children.push(entry);
      }
    }
    return children.sort(
      (a: SessionEntry, b: SessionEntry) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  // =========================================================================
  // Comparison Operations (for A/B testing)
  // =========================================================================

  /**
   * Compare multiple branches and return analysis
   */
  compareBranches(branchIds: string[]): BranchComparison {
    const branches = branchIds
      .map((id) => this.branches.get(id))
      .filter((b): b is BranchInfo => b !== undefined);

    const comparison: BranchComparison = {
      branches: [],
      differences: [],
    };

    // Collect metrics for each branch
    for (const branch of branches) {
      const entries = this.getBranchEntries(branch.id);
      const messages = entries.filter((e): e is MessageEntry => e.type === 'message');

      let totalCost = 0;
      let totalTokens = 0;

      for (const msg of messages) {
        totalCost += msg.metadata?.cost || 0;
        totalTokens += msg.metadata?.tokens || 0;
      }

      comparison.branches.push({
        branchId: branch.id,
        name: branch.name,
        entryCount: entries.length,
        totalCost,
        totalTokens,
        lastActivity: branch.leafEntryId
          ? this.byId.get(branch.leafEntryId)?.timestamp || branch.createdAt
          : branch.createdAt,
      });
    }

    // Calculate differences
    if (comparison.branches.length >= 2) {
      for (let i = 0; i < comparison.branches.length; i++) {
        for (let j = i + 1; j < comparison.branches.length; j++) {
          const a = comparison.branches[i];
          const b = comparison.branches[j];

          // Compare cost
          const costDiff = b.totalCost - a.totalCost;
          const costPercentDiff = a.totalCost > 0 ? (costDiff / a.totalCost) * 100 : 0;
          comparison.differences.push({
            metric: 'cost',
            branchA: a.branchId,
            branchB: b.branchId,
            diff: costDiff,
            percentDiff: costPercentDiff,
          });

          // Compare tokens
          const tokenDiff = b.totalTokens - a.totalTokens;
          const tokenPercentDiff = a.totalTokens > 0 ? (tokenDiff / a.totalTokens) * 100 : 0;
          comparison.differences.push({
            metric: 'tokens',
            branchA: a.branchId,
            branchB: b.branchId,
            diff: tokenDiff,
            percentDiff: tokenPercentDiff,
          });
        }
      }
    }

    // Determine winner (lowest cost for now, can be customized)
    if (comparison.branches.length > 0) {
      const winner = comparison.branches.reduce((best, current) =>
        current.totalCost < best.totalCost ? current : best
      );
      comparison.winner = winner.branchId;
    }

    return comparison;
  }

  private getBranchEntries(branchId: string): SessionEntry[] {
    const branch = this.branches.get(branchId);
    if (!branch) return [];

    const entries: SessionEntry[] = [];
    let current = this.byId.get(branch.leafEntryId);

    while (current) {
      entries.unshift(current);
      if (current.id === branch.rootEntryId) break;
      current = current.parentId ? this.byId.get(current.parentId) : undefined;
    }

    return entries;
  }

  // =========================================================================
  // Persistence
  // =========================================================================

  private flush(): void {
    if (!this.dirty) return;

    const content = this.fileEntries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    writeFileSync(this.sessionFile, content);

    this.dirty = false;
  }

  /**
   * Force a sync to disk
   */
  sync(): void {
    this.flush();
  }

  // =========================================================================
  // Getters
  // =========================================================================

  getSessionId(): string {
    return this.sessionId;
  }

  getSessionFile(): string {
    return this.sessionFile;
  }

  getSessionDir(): string {
    return this.sessionDir;
  }

  getCwd(): string {
    return this.cwd;
  }

  getName(): string | undefined {
    return this.name;
  }

  setName(name: string): void {
    this.name = name;
    const header = this.fileEntries.find(
      (e): e is SessionHeader => e.type === 'session'
    );
    if (header) {
      header.name = name;
      this.dirty = true;
      this.flush();
    }
  }

  // =========================================================================
  // Static Factory Methods
  // =========================================================================

  /**
   * Create a new session
   */
  static create(
    cwd: string,
    sessionDir: string,
    name?: string
  ): SessionTree {
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionId = `sess_${randomUUID().slice(0, 8)}`;
    const sessionFile = join(sessionDir, `${timestamp}_${sessionId}.jsonl`);

    return new SessionTree(cwd, sessionDir, sessionFile, name);
  }

  /**
   * Open an existing session file
   */
  static open(sessionFile: string): SessionTree {
    const resolvedPath = resolve(sessionFile);
    const sessionDir = resolvedPath.split('/').slice(0, -1).join('/') || '.';

    // Extract cwd from header if possible
    const entries = loadEntriesFromFile(resolvedPath);
    const header = entries.find(
      (e): e is SessionHeader => e.type === 'session'
    );
    const cwd = header?.cwd || process.cwd();
    const name = header?.name;

    return new SessionTree(cwd, sessionDir, resolvedPath, name);
  }

  /**
   * Fork from an existing session file into a new one
   */
  static fork(
    sourceFile: string,
    entryId: string,
    newName: string,
    targetDir?: string
  ): ForkResult {
    const source = SessionTree.open(sourceFile);
    return source.forkSession(entryId, newName);
  }
}

// ============================================================================
// Singleton / Global Instance
// ============================================================================

let globalSessionTree: SessionTree | null = null;

export function getGlobalSessionTree(
  cwd?: string,
  sessionDir?: string
): SessionTree {
  if (!globalSessionTree) {
    const workDir = cwd || process.cwd();
    const dir = sessionDir || join(workDir, '.dash', 'sessions');
    globalSessionTree = SessionTree.create(workDir, dir);
  }
  return globalSessionTree;
}

export function setGlobalSessionTree(tree: SessionTree): void {
  globalSessionTree = tree;
}

export function resetGlobalSessionTree(): void {
  globalSessionTree = null;
}

export default SessionTree;