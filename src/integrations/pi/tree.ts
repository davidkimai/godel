/**
 * Session Tree Manager - Pi Integration
 *
 * Manages tree-structured conversation navigation with branching and forking,
 * inspired by Pi's `/tree`, `/fork`, `/branch` commands.
 *
 * This module provides:
 * - Tree-structured conversation history with parent-child relationships
 * - Branch operations (create, switch, merge) similar to git
 * - Session forking for parallel exploration
 * - Context compaction for managing token limits
 * - Tree visualization for UI rendering
 *
 * @example
 * ```typescript
 * const manager = new SessionTreeManager(storage);
 * const tree = await manager.createTree('session-123');
 *
 * // Add messages
 * const node1 = await manager.addNode('session-123', 'user', 'Hello');
 * const node2 = await manager.addNode('session-123', 'assistant', 'Hi!');
 *
 * // Create a branch
 * const branch = await manager.createBranch('session-123', node1.id, 'alternative');
 * await manager.switchBranch('session-123', branch.id);
 *
 * // Get context for LLM
 * const messages = manager.getMessagesForContext(tree, node2.id, 4000);
 * ```
 */

import { randomUUID } from 'crypto';
import type { SessionRepository } from '../../storage/repositories/SessionRepository';

// ============================================================================
// Types
// ============================================================================

/**
 * Message role types for conversation participants
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Tool call structure for function calling
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool result structure for function results
 */
export interface ToolResult {
  toolCallId: string;
  role: 'tool';
  content: string;
  name?: string;
}

/**
 * Branch status for lifecycle management
 */
export type BranchStatus = 'active' | 'merged' | 'abandoned';

/**
 * Message node representing a single conversation entry
 */
export interface MessageNode {
  /** Unique identifier for the node */
  id: string;

  /** Role of the message sender */
  role: MessageRole;

  /** Message content */
  content: string;

  /** Parent node ID (undefined for root) */
  parentId?: string;

  /** Child node IDs */
  children: string[];

  /** Branch this node belongs to */
  branchId: string;

  /** Tool calls made by this node (assistant only) */
  toolCalls?: ToolCall[];

  /** Tool results for this node */
  toolResults?: ToolResult[];

  /** Pi-specific checkpoint identifier */
  piCheckpoint?: string;

  /** Creation timestamp */
  timestamp: Date;

  /** Token count for this node */
  tokenCount: number;

  /** Cumulative tokens from root to this node */
  cumulativeTokens: number;

  /** Whether this node has been compacted/summarized */
  isCompacted: boolean;

  /** Summary text if node is compacted */
  summary?: string;
}

/**
 * Branch structure for parallel conversation paths
 */
export interface Branch {
  /** Unique branch identifier */
  id: string;

  /** Human-readable branch name */
  name: string;

  /** Node ID where branch diverged from parent */
  baseNodeId: string;

  /** Current tip node ID of this branch */
  headNodeId: string;

  /** Branch creation timestamp */
  createdAt: Date;

  /** Branch lifecycle status */
  status: BranchStatus;
}

/**
 * Tree metadata for tracking overall state
 */
export interface TreeMetadata {
  /** Total number of nodes in the tree */
  totalNodes: number;

  /** Total branches created */
  totalBranches: number;

  /** Total tokens across all nodes */
  totalTokens: number;

  /** Tree creation timestamp */
  createdAt: Date;

  /** Last modification timestamp */
  updatedAt: Date;

  /** Version for optimistic locking */
  version: number;

  /** Number of times tree has been compacted */
  compactionCount: number;

  /** Custom metadata fields */
  [key: string]: unknown;
}

/**
 * Complete conversation tree structure
 */
export interface ConversationTree {
  /** Tree identifier (matches session ID) */
  id: string;

  /** Associated session ID */
  sessionId: string;

  /** Root node of the tree */
  root: MessageNode;

  /** All nodes indexed by ID */
  nodes: Map<string, MessageNode>;

  /** All branches in the tree */
  branches: Branch[];

  /** Currently active branch ID */
  currentBranchId: string;

  /** Current node ID on the active branch */
  currentNodeId: string;

  /** Tree metadata */
  metadata: TreeMetadata;

  /** Optional system prompt for the session */
  systemPrompt?: string;
}

/**
 * Options for adding a new node
 */
export interface NodeOptions {
  /** Parent node ID (defaults to current node) */
  parentId?: string;

  /** Branch ID (defaults to current branch) */
  branchId?: string;

  /** Tool calls for assistant messages */
  toolCalls?: ToolCall[];

  /** Tool results for tool messages */
  toolResults?: ToolResult[];

  /** Pi checkpoint identifier */
  piCheckpoint?: string;

  /** Whether to calculate tokens immediately */
  calculateTokens?: boolean;
}

/**
 * Session configuration for forking
 */
export interface SessionConfig {
  /** Session name */
  name?: string;

  /** Provider identifier */
  provider?: string;

  /** Model identifier */
  model?: string;

  /** System prompt */
  systemPrompt?: string;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Pi session interface (minimal for forking)
 */
export interface PiSession {
  id: string;
  tree: ConversationTree;
  config: SessionConfig;
  createdAt: Date;
}

/**
 * Compaction report detailing what was summarized
 */
export interface CompactionReport {
  /** Session ID that was compacted */
  sessionId: string;

  /** Number of nodes compacted */
  nodesCompacted: number;

  /** Token count before compaction */
  tokensBefore: number;

  /** Token count after compaction */
  tokensAfter: number;

  /** Tokens saved */
  tokensSaved: number;

  /** IDs of compacted nodes */
  compactedNodeIds: string[];

  /** Summary of compacted content */
  summary?: string;

  /** Timestamp of compaction */
  timestamp: Date;
}

/**
 * Message formatted for LLM context
 */
export interface MessageForLLM {
  role: MessageRole;
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * Tree visualization for UI rendering
 */
export interface TreeVisualization {
  /** Tree ID */
  treeId: string;

  /** Session ID */
  sessionId: string;

  /** Visual nodes with position data */
  nodes: VisualNode[];

  /** Visual connections between nodes */
  connections: VisualConnection[];

  /** Branch visual data */
  branches: VisualBranch[];

  /** Current active node */
  currentNodeId: string;
}

/**
 * Visual node for tree rendering
 */
export interface VisualNode {
  id: string;
  role: MessageRole;
  branchId: string;
  depth: number;
  x: number;
  y: number;
  isCompacted: boolean;
  hasChildren: boolean;
  timestamp: Date;
}

/**
 * Visual connection between nodes
 */
export interface VisualConnection {
  from: string;
  to: string;
  branchId: string;
  isActive: boolean;
}

/**
 * Visual branch data
 */
export interface VisualBranch {
  id: string;
  name: string;
  color: string;
  baseNodeId: string;
  headNodeId: string;
  isActive: boolean;
  nodeCount: number;
}

/**
 * Branch visualization for UI
 */
export interface BranchVisualization {
  branchId: string;
  name: string;
  nodes: MessageNode[];
  totalTokens: number;
  depth: number;
  status: BranchStatus;
}

/**
 * Storage adapter interface for persistence
 */
export interface StorageAdapter {
  /** Repository for session operations */
  sessions: SessionRepository;
}

// ============================================================================
// Constants
// ============================================================================

/** Approximate tokens per character (conservative estimate) */
const TOKENS_PER_CHAR = 0.25;

/** Default maximum tokens for context window */
const DEFAULT_MAX_TOKENS = 128000;

/** Default compaction threshold */
const DEFAULT_COMPACTION_THRESHOLD = 100000;

/** Branch colors for visualization */
const BRANCH_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a short unique ID
 */
function generateId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Calculate approximate token count for text content.
 * Uses a conservative character-based estimate.
 *
 * @param content - Text content to count
 * @returns Approximate token count
 */
export function calculateTokenCount(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length * TOKENS_PER_CHAR);
}

/**
 * Serialize a ConversationTree for storage.
 * Converts Maps to serializable objects.
 *
 * @param tree - Tree to serialize
 * @returns Serializable tree data
 */
function serializeTree(tree: ConversationTree): Record<string, unknown> {
  return {
    id: tree.id,
    sessionId: tree.sessionId,
    root: serializeNode(tree.root),
    nodes: Object.fromEntries(
      Array.from(tree.nodes.entries()).map(([k, v]) => [k, serializeNode(v)])
    ),
    branches: tree.branches,
    currentBranchId: tree.currentBranchId,
    currentNodeId: tree.currentNodeId,
    metadata: tree.metadata,
    systemPrompt: tree.systemPrompt,
  };
}

/**
 * Serialize a MessageNode for storage
 */
function serializeNode(node: MessageNode): Record<string, unknown> {
  return { ...node };
}

/**
 * Deserialize a ConversationTree from storage data
 *
 * @param data - Serialized tree data
 * @returns Deserialized ConversationTree
 */
function deserializeTree(data: Record<string, unknown>): ConversationTree {
  const nodesMap = new Map<string, MessageNode>();

  // Deserialize all nodes
  if (data['nodes'] && typeof data['nodes'] === 'object') {
    for (const [id, nodeData] of Object.entries(data['nodes'])) {
      nodesMap.set(id, deserializeNode(nodeData as Record<string, unknown>));
    }
  }

  // Deserialize root
  const root = data['root']
    ? deserializeNode(data['root'] as Record<string, unknown>)
    : createRootNode();

  // Ensure root is in nodes map
  if (!nodesMap.has(root.id)) {
    nodesMap.set(root.id, root);
  }

  return {
    id: (data['id'] as string) || generateId(),
    sessionId: (data['sessionId'] as string) || '',
    root,
    nodes: nodesMap,
    branches: ((data['branches'] as Branch[]) || []).map((b) => ({
      ...b,
      createdAt: new Date(b.createdAt),
    })),
    currentBranchId: (data['currentBranchId'] as string) || 'main',
    currentNodeId: (data['currentNodeId'] as string) || root.id,
    metadata: deserializeMetadata(data['metadata'] as Record<string, unknown>),
    systemPrompt: data['systemPrompt'] as string | undefined,
  };
}

/**
 * Deserialize a MessageNode from storage
 */
function deserializeNode(data: Record<string, unknown>): MessageNode {
  return {
    id: (data['id'] as string) || generateId(),
    role: (data['role'] as MessageRole) || 'user',
    content: (data['content'] as string) || '',
    parentId: data['parentId'] as string | undefined,
    children: (data['children'] as string[]) || [],
    branchId: (data['branchId'] as string) || 'main',
    toolCalls: data['toolCalls'] as ToolCall[] | undefined,
    toolResults: data['toolResults'] as ToolResult[] | undefined,
    piCheckpoint: data['piCheckpoint'] as string | undefined,
    timestamp: new Date((data['timestamp'] as string) || Date.now()),
    tokenCount: (data['tokenCount'] as number) || 0,
    cumulativeTokens: (data['cumulativeTokens'] as number) || 0,
    isCompacted: (data['isCompacted'] as boolean) || false,
    summary: data['summary'] as string | undefined,
  };
}

/**
 * Deserialize metadata with defaults
 */
function deserializeMetadata(data: Record<string, unknown> | undefined): TreeMetadata {
  const now = new Date();
  return {
    totalNodes: (data?.['totalNodes'] as number) || 0,
    totalBranches: (data?.['totalBranches'] as number) || 0,
    totalTokens: (data?.['totalTokens'] as number) || 0,
    createdAt: new Date((data?.['createdAt'] as string) || now),
    updatedAt: new Date((data?.['updatedAt'] as string) || now),
    version: (data?.['version'] as number) || 1,
    compactionCount: (data?.['compactionCount'] as number) || 0,
    ...data,
  };
}

/**
 * Create a root node for a new tree
 */
function createRootNode(): MessageNode {
  const id = generateId();
  return {
    id,
    role: 'system',
    content: '',
    children: [],
    branchId: 'main',
    timestamp: new Date(),
    tokenCount: 0,
    cumulativeTokens: 0,
    isCompacted: false,
  };
}

// ============================================================================
// Session Tree Manager
// ============================================================================

/**
 * SessionTreeManager manages tree-structured conversation navigation.
 *
 * This class provides comprehensive tree management capabilities:
 * - Create and manage conversation trees with parent-child relationships
 * - Support branching like git (create, switch, merge branches)
 * - Fork sessions for parallel exploration
 * - Compact history to manage token limits
 * - Build context for LLM consumption
 * - Visualize trees for UI rendering
 *
 * @example
 * ```typescript
 * const storage: StorageAdapter = { sessions: sessionRepository };
 * const manager = new SessionTreeManager(storage);
 *
 * // Create a new tree
 * const tree = await manager.createTree('sess-123', 'You are a helpful assistant');
 *
 * // Add conversation messages
 * const userNode = await manager.addNode('sess-123', 'user', 'Hello!');
 * const assistantNode = await manager.addNode('sess-123', 'assistant', 'Hi there!');
 *
 * // Create a branch for alternative path
 * const branch = await manager.createBranch('sess-123', userNode.id, 'alternative');
 * await manager.switchBranch('sess-123', branch.id);
 *
 * // Get context for LLM
 * const context = manager.getMessagesForContext(tree, assistantNode.id);
 * ```
 */
export class SessionTreeManager {
  /** Storage adapter for persistence */
  private storage: StorageAdapter;

  /** In-memory cache of loaded trees */
  private trees: Map<string, ConversationTree> = new Map();

  /**
   * Create a new SessionTreeManager
   *
   * @param storage - Storage adapter for persistence
   */
  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  // ============================================================================
  // Tree Lifecycle
  // ============================================================================

  /**
   * Create a new conversation tree for a session.
   *
   * Initializes a new tree with a root node and default 'main' branch.
   * The tree is immediately persisted to storage.
   *
   * @param sessionId - Unique session identifier
   * @param systemPrompt - Optional system prompt for the session
   * @returns The newly created conversation tree
   * @throws Error if tree creation fails
   *
   * @example
   * ```typescript
   * const tree = await manager.createTree('sess-123', 'You are a helpful assistant');
   * console.log(tree.id); // Tree ID
   * console.log(tree.currentBranchId); // 'main'
   * ```
   */
  async createTree(sessionId: string, systemPrompt?: string): Promise<ConversationTree> {
    const now = new Date();
    const rootNode = createRootNode();

    if (systemPrompt) {
      rootNode.content = systemPrompt;
      rootNode.tokenCount = calculateTokenCount(systemPrompt);
      rootNode.cumulativeTokens = rootNode.tokenCount;
    }

    const tree: ConversationTree = {
      id: generateId(),
      sessionId,
      root: rootNode,
      nodes: new Map([[rootNode.id, rootNode]]),
      branches: [
        {
          id: 'main',
          name: 'main',
          baseNodeId: rootNode.id,
          headNodeId: rootNode.id,
          createdAt: now,
          status: 'active',
        },
      ],
      currentBranchId: 'main',
      currentNodeId: rootNode.id,
      metadata: {
        totalNodes: 1,
        totalBranches: 1,
        totalTokens: rootNode.tokenCount,
        createdAt: now,
        updatedAt: now,
        version: 1,
        compactionCount: 0,
      },
      systemPrompt,
    };

    // Persist to storage
    await this.saveTree(tree);

    // Cache in memory
    this.trees.set(sessionId, tree);

    return tree;
  }

  /**
   * Retrieve a conversation tree by session ID.
   *
   * First checks the in-memory cache, then falls back to storage.
   * Returns null if the tree doesn't exist.
   *
   * @param sessionId - Session identifier
   * @returns The conversation tree or null if not found
   *
   * @example
   * ```typescript
   * const tree = await manager.getTree('sess-123');
   * if (tree) {
   *   console.log(`Tree has ${tree.metadata.totalNodes} nodes`);
   * }
   * ```
   */
  async getTree(sessionId: string): Promise<ConversationTree | null> {
    // Check cache first
    const cached = this.trees.get(sessionId);
    if (cached) {
      return cached;
    }

    // Load from storage
    try {
      const session = await this.storage.sessions.findById(sessionId);
      if (!session || !session.tree_data) {
        return null;
      }

      const tree = deserializeTree(session.tree_data);
      this.trees.set(sessionId, tree);
      return tree;
    } catch (error) {
      console.error(`Failed to load tree for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save a conversation tree to storage.
   *
   * Updates the tree's metadata and persists it to the session repository.
   * Also updates the in-memory cache.
   *
   * @param tree - Tree to save
   * @throws Error if save fails
   *
   * @example
   * ```typescript
   * tree.metadata.updatedAt = new Date();
   * await manager.saveTree(tree);
   * ```
   */
  async saveTree(tree: ConversationTree): Promise<void> {
    // Update metadata
    tree.metadata.updatedAt = new Date();
    tree.metadata.version += 1;

    // Serialize and save
    const treeData = serializeTree(tree);

    await this.storage.sessions.updateTreeData(
      tree.sessionId,
      treeData,
      tree.currentBranchId
    );

    // Update cache
    this.trees.set(tree.sessionId, tree);
  }

  // ============================================================================
  // Node Operations
  // ============================================================================

  /**
   * Add a new message node to a conversation tree.
   *
   * Creates a new node with the given role and content, linking it to the
   * parent node. Automatically calculates token counts and updates cumulative
   * totals.
   *
   * @param sessionId - Session identifier
   * @param role - Message role (user, assistant, system, tool)
   * @param content - Message content
   * @param options - Optional node configuration
   * @returns The newly created message node
   * @throws Error if the tree doesn't exist or parent node is invalid
   *
   * @example
   * ```typescript
   * // Add user message
   * const userNode = await manager.addNode('sess-123', 'user', 'Hello!');
   *
   * // Add assistant message with tool calls
   * const assistantNode = await manager.addNode('sess-123', 'assistant', 'Let me check...', {
   *   toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{}' } }]
   * });
   * ```
   */
  async addNode(
    sessionId: string,
    role: MessageRole,
    content: string,
    options: NodeOptions = {}
  ): Promise<MessageNode> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    // Determine parent and branch
    const parentId = options.parentId || tree.currentNodeId;
    const branchId = options.branchId || tree.currentBranchId;

    // Validate parent exists
    const parent = tree.nodes.get(parentId);
    if (!parent) {
      throw new Error(`Parent node ${parentId} not found`);
    }

    // Calculate tokens
    const tokenCount =
      options.calculateTokens !== false ? calculateTokenCount(content) : 0;
    const cumulativeTokens = parent.cumulativeTokens + tokenCount;

    // Create node
    const node: MessageNode = {
      id: generateId(),
      role,
      content,
      parentId,
      children: [],
      branchId,
      toolCalls: options.toolCalls,
      toolResults: options.toolResults,
      piCheckpoint: options.piCheckpoint,
      timestamp: new Date(),
      tokenCount,
      cumulativeTokens,
      isCompacted: false,
    };

    // Update parent's children
    parent.children.push(node.id);

    // Add to tree
    tree.nodes.set(node.id, node);

    // Update current node if on same branch
    if (branchId === tree.currentBranchId) {
      tree.currentNodeId = node.id;
    }

    // Update branch head
    const branch = tree.branches.find((b) => b.id === branchId);
    if (branch) {
      branch.headNodeId = node.id;
    }

    // Update metadata
    tree.metadata.totalNodes += 1;
    tree.metadata.totalTokens += tokenCount;

    // Save tree
    await this.saveTree(tree);

    return node;
  }

  /**
   * Get a specific node from a tree by ID.
   *
   * @param tree - Conversation tree
   * @param nodeId - Node identifier
   * @returns The message node or null if not found
   *
   * @example
   * ```typescript
   * const node = manager.getNode(tree, 'node-abc123');
   * if (node) {
   *   console.log(node.content);
   * }
   * ```
   */
  getNode(tree: ConversationTree, nodeId: string): MessageNode | null {
    return tree.nodes.get(nodeId) || null;
  }

  /**
   * Get the path from a node to the root.
   *
   * Returns nodes in order from root to the specified node.
   * Useful for building conversation context.
   *
   * @param tree - Conversation tree
   * @param nodeId - Starting node ID
   * @returns Array of nodes from root to the specified node
   *
   * @example
   * ```typescript
   * const path = manager.getPathToRoot(tree, 'node-xyz789');
   * // Returns [root, child, grandchild, node-xyz789]
   * ```
   */
  getPathToRoot(tree: ConversationTree, nodeId: string): MessageNode[] {
    const path: MessageNode[] = [];
    let current = tree.nodes.get(nodeId);

    while (current) {
      path.unshift(current);
      if (!current.parentId) break;
      current = tree.nodes.get(current.parentId);
    }

    return path;
  }

  /**
   * Get all direct children of a node.
   *
   * Returns child nodes in chronological order.
   *
   * @param tree - Conversation tree
   * @param nodeId - Parent node ID
   * @returns Array of child nodes
   *
   * @example
   * ```typescript
   * const children = manager.getChildren(tree, 'node-abc123');
   * console.log(`Node has ${children.length} children`);
   * ```
   */
  getChildren(tree: ConversationTree, nodeId: string): MessageNode[] {
    const parent = tree.nodes.get(nodeId);
    if (!parent) return [];

    return parent.children
      .map((childId) => tree.nodes.get(childId))
      .filter((n): n is MessageNode => n !== undefined)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get all descendants of a node (recursive).
   *
   * @param tree - Conversation tree
   * @param nodeId - Starting node ID
   * @returns Array of all descendant nodes
   */
  getDescendants(tree: ConversationTree, nodeId: string): MessageNode[] {
    const descendants: MessageNode[] = [];
    const queue = [nodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = this.getChildren(tree, currentId);

      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return descendants;
  }

  // ============================================================================
  // Branch Operations
  // ============================================================================

  /**
   * Create a new branch from a specific node.
   *
   * Similar to `git branch`, creates a new conversation path diverging
   * from the specified node. The branch is created in 'active' status.
   *
   * @param sessionId - Session identifier
   * @param fromNodeId - Node where the branch diverges
   * @param name - Human-readable branch name
   * @returns The newly created branch
   * @throws Error if the tree doesn't exist or node is invalid
   *
   * @example
   * ```typescript
   * const branch = await manager.createBranch('sess-123', 'node-abc123', 'alternative-approach');
   * console.log(branch.id); // New branch ID
   * ```
   */
  async createBranch(
    sessionId: string,
    fromNodeId: string,
    name: string
  ): Promise<Branch> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    // Validate node exists
    const baseNode = tree.nodes.get(fromNodeId);
    if (!baseNode) {
      throw new Error(`Node ${fromNodeId} not found`);
    }

    // Check for duplicate branch name
    if (tree.branches.some((b) => b.name === name)) {
      throw new Error(`Branch with name '${name}' already exists`);
    }

    // Create branch
    const branch: Branch = {
      id: generateId(),
      name,
      baseNodeId: fromNodeId,
      headNodeId: fromNodeId,
      createdAt: new Date(),
      status: 'active',
    };

    tree.branches.push(branch);
    tree.metadata.totalBranches += 1;

    await this.saveTree(tree);

    return branch;
  }

  /**
   * Switch to a different branch.
   *
   * Updates the current branch and sets the current node to the
   * head of the target branch.
   *
   * @param sessionId - Session identifier
   * @param branchId - Target branch ID
   * @throws Error if the tree or branch doesn't exist
   *
   * @example
   * ```typescript
   * await manager.switchBranch('sess-123', 'branch-xyz789');
   * console.log('Switched to branch');
   * ```
   */
  async switchBranch(sessionId: string, branchId: string): Promise<void> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    // Validate branch exists
    const branch = tree.branches.find((b) => b.id === branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    // Update current state
    tree.currentBranchId = branchId;
    tree.currentNodeId = branch.headNodeId;

    await this.saveTree(tree);
  }

  /**
   * Merge a branch into another node.
   *
   * Creates a merge commit connecting the branch head to the target node.
   * The source branch is marked as 'merged' status.
   *
   * @param sessionId - Session identifier
   * @param branchId - Source branch ID to merge
   * @param targetNodeId - Target node to merge into
   * @throws Error if the tree, branch, or node doesn't exist
   *
   * @example
   * ```typescript
   * await manager.mergeBranch('sess-123', 'branch-xyz789', 'node-abc123');
   * console.log('Branch merged successfully');
   * ```
   */
  async mergeBranch(
    sessionId: string,
    branchId: string,
    targetNodeId: string
  ): Promise<void> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    // Validate branch exists
    const sourceBranch = tree.branches.find((b) => b.id === branchId);
    if (!sourceBranch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    // Validate target node exists
    const targetNode = tree.nodes.get(targetNodeId);
    if (!targetNode) {
      throw new Error(`Target node ${targetNodeId} not found`);
    }

    // Cannot merge into itself
    if (sourceBranch.headNodeId === targetNodeId) {
      throw new Error('Cannot merge branch into its own head node');
    }

    // Create merge commit node
    const mergeNode = await this.addNode(
      sessionId,
      'system',
      `[Merged branch "${sourceBranch.name}" into this conversation]`,
      {
        parentId: targetNodeId,
        branchId: tree.currentBranchId,
      }
    );

    // Also add as child of branch head (dual parent)
    const branchHead = tree.nodes.get(sourceBranch.headNodeId);
    if (branchHead) {
      mergeNode.parentId = sourceBranch.headNodeId;
      branchHead.children.push(mergeNode.id);
    }

    // Mark source branch as merged
    sourceBranch.status = 'merged';

    await this.saveTree(tree);
  }

  /**
   * Abandon a branch without merging.
   *
   * Marks the branch as 'abandoned' status. Does not delete the branch
   * or its nodes to preserve history.
   *
   * @param sessionId - Session identifier
   * @param branchId - Branch ID to abandon
   * @throws Error if the tree or branch doesn't exist
   */
  async abandonBranch(sessionId: string, branchId: string): Promise<void> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    const branch = tree.branches.find((b) => b.id === branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    branch.status = 'abandoned';
    await this.saveTree(tree);
  }

  /**
   * List all branches in a tree.
   *
   * @param sessionId - Session identifier
   * @returns Array of branches
   */
  async listBranches(sessionId: string): Promise<Branch[]> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    return [...tree.branches];
  }

  /**
   * Get the current branch for a session.
   *
   * @param sessionId - Session identifier
   * @returns Current branch or null if tree not found
   */
  async getCurrentBranch(sessionId: string): Promise<Branch | null> {
    const tree = await this.getTree(sessionId);
    if (!tree) return null;

    return tree.branches.find((b) => b.id === tree.currentBranchId) || null;
  }

  // ============================================================================
  // Forking
  // ============================================================================

  /**
   * Fork a session from a specific node into a new session.
   *
   * Creates a new session with a copy of the conversation tree up to
   * the specified node. The new session starts with a new branch.
   *
   * @param fromSessionId - Source session identifier
   * @param fromNodeId - Node to fork from
   * @param newSessionConfig - Configuration for the new session
   * @returns The newly created Pi session
   * @throws Error if the source session or node doesn't exist
   *
   * @example
   * ```typescript
   * const newSession = await manager.forkSession('sess-123', 'node-abc123', {
   *   name: 'experimental-approach',
   *   provider: 'anthropic',
   *   model: 'claude-sonnet-4-5'
   * });
   * console.log(newSession.id); // New session ID
   * ```
   */
  async forkSession(
    fromSessionId: string,
    fromNodeId: string,
    newSessionConfig: SessionConfig
  ): Promise<PiSession> {
    const sourceTree = await this.getTree(fromSessionId);
    if (!sourceTree) {
      throw new Error(`Source tree not found for session ${fromSessionId}`);
    }

    // Validate node exists
    const forkNode = sourceTree.nodes.get(fromNodeId);
    if (!forkNode) {
      throw new Error(`Node ${fromNodeId} not found`);
    }

    // Get path from root to fork node
    const pathToFork = this.getPathToRoot(sourceTree, fromNodeId);

    // Create new session in repository
    const newSession = await this.storage.sessions.create({
      metadata: {
        ...newSessionConfig.metadata,
        forkedFrom: fromSessionId,
        forkedFromNode: fromNodeId,
        provider: newSessionConfig.provider,
        model: newSessionConfig.model,
        name: newSessionConfig.name,
      },
    });

    // Create new tree
    const now = new Date();
    const rootNode = { ...pathToFork[0] };
    rootNode.id = generateId();
    rootNode.children = [];

    const newTree: ConversationTree = {
      id: generateId(),
      sessionId: newSession.id,
      root: rootNode,
      nodes: new Map([[rootNode.id, rootNode]]),
      branches: [],
      currentBranchId: 'main',
      currentNodeId: rootNode.id,
      metadata: {
        totalNodes: 1,
        totalBranches: 0,
        totalTokens: rootNode.tokenCount,
        createdAt: now,
        updatedAt: now,
        version: 1,
        compactionCount: 0,
      },
      systemPrompt: newSessionConfig.systemPrompt || sourceTree.systemPrompt,
    };

    // Copy nodes along the path
    let lastNodeId = rootNode.id;
    for (let i = 1; i < pathToFork.length; i++) {
      const originalNode = pathToFork[i];
      const newNode: MessageNode = {
        ...originalNode,
        id: generateId(),
        parentId: lastNodeId,
        children: [],
        timestamp: new Date(),
      };

      // Update parent's children
      const parent = newTree.nodes.get(lastNodeId);
      if (parent) {
        parent.children.push(newNode.id);
      }

      newTree.nodes.set(newNode.id, newNode);
      lastNodeId = newNode.id;
      newTree.metadata.totalNodes += 1;
      newTree.metadata.totalTokens += newNode.tokenCount;
    }

    // Create main branch for new tree
    const mainBranch: Branch = {
      id: 'main',
      name: 'main',
      baseNodeId: rootNode.id,
      headNodeId: lastNodeId,
      createdAt: now,
      status: 'active',
    };

    newTree.branches.push(mainBranch);
    newTree.metadata.totalBranches = 1;
    newTree.currentBranchId = 'main';
    newTree.currentNodeId = lastNodeId;

    // Save new tree
    await this.saveTree(newTree);

    return {
      id: newSession.id,
      tree: newTree,
      config: newSessionConfig,
      createdAt: now,
    };
  }

  // ============================================================================
  // Context Management
  // ============================================================================

  /**
   * Compact conversation history to reduce token usage.
   *
   * When token count exceeds the threshold, older nodes are summarized
   * and marked as compacted. This preserves context while staying within
   * token limits.
   *
   * @param sessionId - Session identifier
   * @param threshold - Token threshold to trigger compaction (default: 100000)
   * @returns Compaction report detailing what was compacted
   * @throws Error if the tree doesn't exist
   *
   * @example
   * ```typescript
   * const report = await manager.compactHistory('sess-123', 80000);
   * console.log(`Compacted ${report.nodesCompacted} nodes, saved ${report.tokensSaved} tokens`);
   * ```
   */
  async compactHistory(
    sessionId: string,
    threshold: number = DEFAULT_COMPACTION_THRESHOLD
  ): Promise<CompactionReport> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    const tokensBefore = tree.metadata.totalTokens;

    // Check if compaction needed
    if (tokensBefore < threshold) {
      return {
        sessionId,
        nodesCompacted: 0,
        tokensBefore,
        tokensAfter: tokensBefore,
        tokensSaved: 0,
        compactedNodeIds: [],
        timestamp: new Date(),
      };
    }

    // Find nodes to compact (oldest non-critical nodes)
    const currentPath = this.getPathToRoot(tree, tree.currentNodeId);
    const nodesToCompact: MessageNode[] = [];

    // Compact first 50% of the path, keeping recent context
    const compactCount = Math.floor(currentPath.length * 0.5);
    for (let i = 0; i < compactCount && i < currentPath.length - 2; i++) {
      const node = currentPath[i];
      if (!node.isCompacted && node.role !== 'system') {
        nodesToCompact.push(node);
      }
    }

    // Mark nodes as compacted with summary
    let tokensSaved = 0;
    const compactedNodeIds: string[] = [];

    for (const node of nodesToCompact) {
      node.isCompacted = true;
      node.summary = `[${node.role}]: ${node.content.slice(0, 100)}...`;
      tokensSaved += node.tokenCount;
      compactedNodeIds.push(node.id);
    }

    // Update metadata
    tree.metadata.compactionCount += 1;
    tree.metadata.totalTokens -= tokensSaved;

    await this.saveTree(tree);

    return {
      sessionId,
      nodesCompacted: nodesToCompact.length,
      tokensBefore,
      tokensAfter: tokensBefore - tokensSaved,
      tokensSaved,
      compactedNodeIds,
      summary: `Compacted ${nodesToCompact.length} nodes from conversation history`,
      timestamp: new Date(),
    };
  }

  /**
   * Build message array for LLM context from a tree.
   *
   * Traverses from root to the specified node, building a context array
   * suitable for LLM consumption. Handles compacted nodes by using summaries.
   *
   * @param tree - Conversation tree
   * @param nodeId - Target node ID (end of context)
   * @param maxTokens - Maximum tokens to include (default: 128000)
   * @returns Array of messages formatted for LLM
   *
   * @example
   * ```typescript
   * const messages = manager.getMessagesForContext(tree, 'node-abc123', 4000);
   * // Returns: [{ role: 'system', content: '...' }, { role: 'user', content: '...' }, ...]
   * ```
   */
  getMessagesForContext(
    tree: ConversationTree,
    nodeId: string,
    maxTokens: number = DEFAULT_MAX_TOKENS
  ): MessageForLLM[] {
    const path = this.getPathToRoot(tree, nodeId);
    const messages: MessageForLLM[] = [];
    let totalTokens = 0;

    for (const node of path) {
      // Skip empty root system node unless it has content
      if (node === tree.root && !node.content) continue;

      // Use summary if compacted, otherwise use content
      let content = node.isCompacted ? node.summary || '[Compacted]' : node.content;
      let tokenCount = node.isCompacted ? calculateTokenCount(content) : node.tokenCount;

      // Check token limit
      if (totalTokens + tokenCount > maxTokens) {
        break;
      }

      totalTokens += tokenCount;

      // Build message based on role
      if (node.role === 'tool' && node.toolResults) {
        for (const result of node.toolResults) {
          messages.push({
            role: 'tool',
            content: result.content,
            tool_call_id: result.toolCallId,
            name: result.name,
          });
        }
      } else if (node.role === 'assistant' && node.toolCalls) {
        messages.push({
          role: 'assistant',
          content: content,
          tool_calls: node.toolCalls,
        });
      } else {
        messages.push({
          role: node.role,
          content: content,
        });
      }
    }

    return messages;
  }

  /**
   * Get context messages for the current position in a session.
   *
   * Convenience method that loads the tree and builds context.
   *
   * @param sessionId - Session identifier
   * @param maxTokens - Maximum tokens to include
   * @returns Array of messages or empty array if tree not found
   */
  async getCurrentContext(
    sessionId: string,
    maxTokens: number = DEFAULT_MAX_TOKENS
  ): Promise<MessageForLLM[]> {
    const tree = await this.getTree(sessionId);
    if (!tree) return [];

    return this.getMessagesForContext(tree, tree.currentNodeId, maxTokens);
  }

  // ============================================================================
  // Tree Visualization
  // ============================================================================

  /**
   * Generate tree visualization data for UI rendering.
   *
   * Creates a visual representation of the tree with node positions,
   * branch colors, and connection data suitable for rendering in a UI.
   *
   * @param sessionId - Session identifier
   * @returns Tree visualization data
   * @throws Error if the tree doesn't exist
   *
   * @example
   * ```typescript
   * const viz = manager.getTreeVisualization('sess-123');
   * // Render using viz.nodes, viz.connections, viz.branches
   * ```
   */
  getTreeVisualization(sessionId: string): TreeVisualization {
    const tree = this.trees.get(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    const nodes: VisualNode[] = [];
    const connections: VisualConnection[] = [];
    const branchColorMap = new Map<string, string>();

    // Assign colors to branches
    tree.branches.forEach((branch, index) => {
      branchColorMap.set(branch.id, BRANCH_COLORS[index % BRANCH_COLORS.length]);
    });

    // Calculate node positions using depth-first traversal
    const positionMap = new Map<string, { x: number; y: number; depth: number }>();
    const visited = new Set<string>();

    const calculatePositions = (
      nodeId: string,
      depth: number,
      xOffset: number
    ): number => {
      if (visited.has(nodeId)) return xOffset;
      visited.add(nodeId);

      const node = tree.nodes.get(nodeId);
      if (!node) return xOffset;

      // Calculate x position based on children
      let childX = xOffset;
      const childPositions: number[] = [];

      for (const childId of node.children) {
        const newX = calculatePositions(childId, depth + 1, childX);
        childPositions.push(newX);
        childX = newX + 1;
      }

      // This node's x position is average of children or xOffset if leaf
      const x =
        childPositions.length > 0
          ? childPositions.reduce((a, b) => a + b, 0) / childPositions.length
          : xOffset;

      positionMap.set(nodeId, { x, y: depth * 80, depth });

      return xOffset + (childPositions.length > 0 ? childX - xOffset : 1);
    };

    calculatePositions(tree.root.id, 0, 0);

    // Create visual nodes
    for (const [nodeId, pos] of Array.from(positionMap.entries())) {
      const node = tree.nodes.get(nodeId);
      if (!node) continue;

      nodes.push({
        id: nodeId,
        role: node.role,
        branchId: node.branchId,
        depth: pos.depth,
        x: pos.x * 150,
        y: pos.y,
        isCompacted: node.isCompacted,
        hasChildren: node.children.length > 0,
        timestamp: node.timestamp,
      });

      // Create connections to children
      for (const childId of node.children) {
        connections.push({
          from: nodeId,
          to: childId,
          branchId: node.branchId,
          isActive:
            nodeId === tree.currentNodeId ||
            childId === tree.currentNodeId ||
            this.isOnPathToNode(tree, childId, tree.currentNodeId),
        });
      }
    }

    // Create visual branches
    const visualBranches: VisualBranch[] = tree.branches.map((branch, index) => ({
      id: branch.id,
      name: branch.name,
      color: BRANCH_COLORS[index % BRANCH_COLORS.length],
      baseNodeId: branch.baseNodeId,
      headNodeId: branch.headNodeId,
      isActive: branch.id === tree.currentBranchId,
      nodeCount: this.countBranchNodes(tree, branch.id),
    }));

    return {
      treeId: tree.id,
      sessionId: tree.sessionId,
      nodes,
      connections,
      branches: visualBranches,
      currentNodeId: tree.currentNodeId,
    };
  }

  /**
   * Generate branch visualization data for a specific branch.
   *
   * Returns detailed information about a single branch including
   * all its nodes in order.
   *
   * @param tree - Conversation tree
   * @param branchId - Branch identifier
   * @returns Branch visualization or null if not found
   *
   * @example
   * ```typescript
   * const branchViz = manager.getBranchVisualization(tree, 'branch-abc123');
   * console.log(`Branch has ${branchViz.nodes.length} nodes`);
   * ```
   */
  getBranchVisualization(tree: ConversationTree, branchId: string): BranchVisualization | null {
    const branch = tree.branches.find((b) => b.id === branchId);
    if (!branch) return null;

    // Get all nodes in this branch
    const branchNodes: MessageNode[] = [];
    const visited = new Set<string>();

    const collectNodes = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = tree.nodes.get(nodeId);
      if (!node) return;

      if (node.branchId === branchId) {
        branchNodes.push(node);
      }

      // Continue to children
      for (const childId of node.children) {
        collectNodes(childId);
      }
    };

    collectNodes(branch.baseNodeId);

    // Sort by timestamp
    branchNodes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Calculate depth
    const maxDepth = branchNodes.reduce((max, node) => {
      const path = this.getPathToRoot(tree, node.id);
      return Math.max(max, path.length);
    }, 0);

    // Calculate total tokens
    const totalTokens = branchNodes.reduce((sum, node) => sum + node.tokenCount, 0);

    return {
      branchId: branch.id,
      name: branch.name,
      nodes: branchNodes,
      totalTokens,
      depth: maxDepth,
      status: branch.status,
    };
  }

  /**
   * Check if a node is on the path to another node.
   *
   * @param tree - Conversation tree
   * @param nodeId - Node to check
   * @param targetNodeId - Target node to find path to
   * @returns True if node is on the path
   */
  private isOnPathToNode(tree: ConversationTree, nodeId: string, targetNodeId: string): boolean {
    const path = this.getPathToRoot(tree, targetNodeId);
    return path.some((n) => n.id === nodeId);
  }

  /**
   * Count nodes belonging to a specific branch.
   *
   * @param tree - Conversation tree
   * @param branchId - Branch identifier
   * @returns Number of nodes in the branch
   */
  private countBranchNodes(tree: ConversationTree, branchId: string): number {
    let count = 0;
    for (const node of Array.from(tree.nodes.values())) {
      if (node.branchId === branchId) {
        count++;
      }
    }
    return count;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Calculate token count for text content.
   *
   * Uses a conservative character-based estimate suitable for
   * most language models.
   *
   * @param content - Text content to count
   * @returns Approximate token count
   *
   * @example
   * ```typescript
   * const tokens = manager.calculateTokenCount('Hello, world!');
   * console.log(`Approximate tokens: ${tokens}`);
   * ```
   */
  calculateTokenCount(content: string): number {
    return calculateTokenCount(content);
  }

  /**
   * Calculate total tokens in a conversation tree.
   *
   * @param tree - Conversation tree
   * @returns Total token count across all nodes
   *
   * @example
   * ```typescript
   * const totalTokens = manager.calculateTreeTokens(tree);
   * console.log(`Tree uses ${totalTokens} tokens`);
   * ```
   */
  calculateTreeTokens(tree: ConversationTree): number {
    let total = 0;
    for (const node of Array.from(tree.nodes.values())) {
      total += node.tokenCount;
    }
    return total;
  }

  /**
   * Get tree statistics.
   *
   * Returns detailed statistics about the tree structure.
   *
   * @param sessionId - Session identifier
   * @returns Statistics object or null if tree not found
   */
  async getTreeStats(
    sessionId: string
  ): Promise<{
    totalNodes: number;
    totalBranches: number;
    activeBranches: number;
    mergedBranches: number;
    abandonedBranches: number;
    totalTokens: number;
    compactedNodes: number;
    maxDepth: number;
  } | null> {
    const tree = await this.getTree(sessionId);
    if (!tree) return null;

    let compactedNodes = 0;
    let maxDepth = 0;

    for (const node of Array.from(tree.nodes.values())) {
      if (node.isCompacted) compactedNodes++;
      const depth = this.getPathToRoot(tree, node.id).length;
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      totalNodes: tree.metadata.totalNodes,
      totalBranches: tree.metadata.totalBranches,
      activeBranches: tree.branches.filter((b) => b.status === 'active').length,
      mergedBranches: tree.branches.filter((b) => b.status === 'merged').length,
      abandonedBranches: tree.branches.filter((b) => b.status === 'abandoned').length,
      totalTokens: tree.metadata.totalTokens,
      compactedNodes,
      maxDepth,
    };
  }

  /**
   * Clear the in-memory cache for a session.
   *
   * Forces the tree to be reloaded from storage on next access.
   *
   * @param sessionId - Session identifier to clear from cache
   */
  clearCache(sessionId: string): void {
    this.trees.delete(sessionId);
  }

  /**
   * Clear all cached trees from memory.
   */
  clearAllCache(): void {
    this.trees.clear();
  }

  /**
   * Update node content.
   *
   * Allows modifying a node's content and recalculates token counts.
   *
   * @param sessionId - Session identifier
   * @param nodeId - Node to update
   * @param content - New content
   * @throws Error if tree or node not found
   */
  async updateNodeContent(sessionId: string, nodeId: string, content: string): Promise<void> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    const node = tree.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // Update token counts
    const newTokenCount = calculateTokenCount(content);
    const tokenDiff = newTokenCount - node.tokenCount;

    node.content = content;
    node.tokenCount = newTokenCount;
    tree.metadata.totalTokens += tokenDiff;

    // Recalculate cumulative tokens for this node and all descendants
    if (node.parentId) {
      const parent = tree.nodes.get(node.parentId);
      if (parent) {
        node.cumulativeTokens = parent.cumulativeTokens + newTokenCount;
      }
    }

    const updateDescendants = (parentId: string) => {
      const parent = tree.nodes.get(parentId);
      if (!parent) return;

      for (const childId of parent.children) {
        const child = tree.nodes.get(childId);
        if (child) {
          child.cumulativeTokens = parent.cumulativeTokens + child.tokenCount;
          updateDescendants(childId);
        }
      }
    };

    updateDescendants(nodeId);

    await this.saveTree(tree);
  }

  /**
   * Delete a node and all its descendants.
   *
   * Use with caution - this permanently removes conversation history.
   *
   * @param sessionId - Session identifier
   * @param nodeId - Node to delete
   * @throws Error if tree or node not found, or if trying to delete root
   */
  async deleteNode(sessionId: string, nodeId: string): Promise<void> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    const node = tree.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    if (node === tree.root) {
      throw new Error('Cannot delete root node');
    }

    // Get all descendants
    const descendants = this.getDescendants(tree, nodeId);
    const nodesToDelete = [node, ...descendants];

    // Remove from parent's children
    if (node.parentId) {
      const parent = tree.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((id) => id !== nodeId);
      }
    }

    // Delete nodes and update counts
    let tokensRemoved = 0;
    for (const n of nodesToDelete) {
      tokensRemoved += n.tokenCount;
      tree.nodes.delete(n.id);
    }

    tree.metadata.totalNodes -= nodesToDelete.length;
    tree.metadata.totalTokens -= tokensRemoved;

    // Update current node if needed
    if (tree.currentNodeId === nodeId || this.isDescendant(tree, tree.currentNodeId, nodeId)) {
      tree.currentNodeId = node.parentId || tree.root.id;
    }

    await this.saveTree(tree);
  }

  /**
   * Check if a node is a descendant of another node.
   *
   * @param tree - Conversation tree
   * @param nodeId - Node to check
   * @param potentialAncestorId - Potential ancestor
   * @returns True if nodeId is a descendant of potentialAncestorId
   */
  private isDescendant(tree: ConversationTree, nodeId: string, potentialAncestorId: string): boolean {
    const path = this.getPathToRoot(tree, nodeId);
    return path.some((n) => n.id === potentialAncestorId);
  }

  /**
   * Rename a branch.
   *
   * @param sessionId - Session identifier
   * @param branchId - Branch to rename
   * @param newName - New branch name
   * @throws Error if tree or branch not found, or if name already exists
   */
  async renameBranch(sessionId: string, branchId: string, newName: string): Promise<void> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    const branch = tree.branches.find((b) => b.id === branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    // Check for duplicate name
    if (tree.branches.some((b) => b.id !== branchId && b.name === newName)) {
      throw new Error(`Branch with name '${newName}' already exists`);
    }

    branch.name = newName;
    await this.saveTree(tree);
  }

  /**
   * Get the conversation path to the current node.
   *
   * @param sessionId - Session identifier
   * @returns Array of nodes from root to current, or null if tree not found
   */
  async getCurrentPath(sessionId: string): Promise<MessageNode[] | null> {
    const tree = await this.getTree(sessionId);
    if (!tree) return null;

    return this.getPathToRoot(tree, tree.currentNodeId);
  }

  /**
   * Navigate to a specific node in the conversation.
   *
   * Updates the current node to the specified node.
   *
   * @param sessionId - Session identifier
   * @param nodeId - Target node ID
   * @throws Error if tree or node not found
   */
  async navigateToNode(sessionId: string, nodeId: string): Promise<void> {
    const tree = await this.getTree(sessionId);
    if (!tree) {
      throw new Error(`Tree not found for session ${sessionId}`);
    }

    const node = tree.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    tree.currentNodeId = nodeId;

    // Update current branch if needed
    const branch = tree.branches.find((b) => b.id === node.branchId);
    if (branch) {
      tree.currentBranchId = branch.id;
    }

    await this.saveTree(tree);
  }

  /**
   * Search for nodes by content.
   *
   * @param sessionId - Session identifier
   * @param query - Search query string
   * @param options - Search options
   * @returns Array of matching nodes
   */
  async searchNodes(
    sessionId: string,
    query: string,
    options: {
      caseSensitive?: boolean;
      exactMatch?: boolean;
      role?: MessageRole;
    } = {}
  ): Promise<MessageNode[]> {
    const tree = await this.getTree(sessionId);
    if (!tree) return [];

    const matches: MessageNode[] = [];
    const searchQuery = options.caseSensitive ? query : query.toLowerCase();

    for (const node of Array.from(tree.nodes.values())) {
      let content = options.caseSensitive ? node.content : node.content.toLowerCase();

      // Role filter
      if (options.role && node.role !== options.role) continue;

      // Match logic
      const isMatch = options.exactMatch
        ? content === searchQuery
        : content.includes(searchQuery);

      if (isMatch) {
        matches.push(node);
      }
    }

    return matches.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default SessionTreeManager;
