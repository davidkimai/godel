/**
 * Group Coordinator
 * 
 * Coordinates multiple agents in group chats.
 * Handles group creation, agent participation management,
 * thread-based conversation isolation, and @mention routing.
 * 
 * @module GroupCoordinator
 */

import { EventEmitter } from 'events';
import { ThreadManager, Thread, ThreadMessage } from './ThreadManager';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface AgentGroup {
  /** Unique group ID */
  id: string;
  /** Group name */
  name: string;
  /** Group description/topic */
  topic: string;
  /** Agents in the group */
  agents: Map<string, GroupAgent>;
  /** Thread IDs associated with this group */
  threads: Set<string>;
  /** Default thread for general discussion */
  defaultThreadId?: string;
  /** Group status */
  status: 'active' | 'paused' | 'archived';
  /** Group creation timestamp */
  createdAt: Date;
  /** Group configuration */
  config: GroupConfig;
  /** Group metadata */
  metadata: Record<string, unknown>;
}

export interface GroupAgent {
  /** Agent ID */
  agentId: string;
  /** Agent role in the group */
  role: GroupRole;
  /** When the agent joined */
  joinedAt: Date;
  /** Agent status in the group */
  status: 'active' | 'inactive' | 'away';
  /** Threads this agent is assigned to */
  assignedThreads: Set<string>;
  /** Agent preferences */
  preferences: AgentPreferences;
}

export type GroupRole = 'leader' | 'coordinator' | 'contributor' | 'observer';

export interface AgentPreferences {
  /** Whether agent should be notified of all messages */
  notifyAll: boolean;
  /** Thread IDs to auto-subscribe to */
  autoSubscribeThreads?: string[];
  /** Quiet hours (if any) */
  quietHours?: { start: number; end: number };
  /** Mentions only mode */
  mentionsOnly: boolean;
}

export interface GroupConfig {
  /** Maximum agents in the group */
  maxAgents: number;
  /** Whether new agents need approval to join */
  requireApproval: boolean;
  /** Whether to auto-create threads for sub-tasks */
  autoCreateThreads: boolean;
  /** Default thread permissions */
  defaultPermissions: ThreadPermissions;
  /** Whether to preserve history when archiving */
  preserveHistory: boolean;
}

export interface ThreadPermissions {
  /** Who can create threads */
  canCreate: GroupRole[];
  /** Who can archive threads */
  canArchive: GroupRole[];
  /** Who can invite agents */
  canInvite: GroupRole[];
  /** Who can remove agents */
  canRemove: GroupRole[];
}

export interface GroupCreateOptions {
  /** Group name */
  name: string;
  /** Group topic/description */
  topic?: string;
  /** Initial agents to add */
  agents?: Array<{ agentId: string; role?: GroupRole }>;
  /** Group configuration */
  config?: Partial<GroupConfig>;
  /** Initial metadata */
  metadata?: Record<string, unknown>;
}

export interface MentionRoutingResult {
  /** The mention that was parsed */
  mention: string;
  /** Target agent ID (if resolved) */
  targetAgentId?: string;
  /** Whether the mention was successfully routed */
  routed: boolean;
  /** Thread IDs where the target was notified */
  notifiedThreads: string[];
  /** Error message if routing failed */
  error?: string;
}

export interface CoordinationTask {
  /** Task ID */
  id: string;
  /** Task description */
  description: string;
  /** Thread assigned to this task */
  threadId: string;
  /** Assigned agents */
  assignedAgents: string[];
  /** Task status */
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  /** Dependencies on other tasks */
  dependencies: string[];
  /** Created timestamp */
  createdAt: Date;
  /** Completed timestamp */
  completedAt?: Date;
}

export type GroupEvent =
  | { type: 'group.created'; groupId: string }
  | { type: 'group.archived'; groupId: string }
  | { type: 'group.paused'; groupId: string }
  | { type: 'group.resumed'; groupId: string }
  | { type: 'agent.joined'; groupId: string; agentId: string; role: GroupRole }
  | { type: 'agent.left'; groupId: string; agentId: string }
  | { type: 'agent.assigned'; groupId: string; agentId: string; threadId: string }
  | { type: 'agent.removed'; groupId: string; agentId: string; threadId: string }
  | { type: 'mention.routed'; groupId: string; fromAgentId: string; toAgentId: string; threadId: string }
  | { type: 'task.created'; groupId: string; taskId: string; threadId: string }
  | { type: 'task.assigned'; groupId: string; taskId: string; agentId: string }
  | { type: 'task.completed'; groupId: string; taskId: string };

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_GROUP_CONFIG: GroupConfig = {
  maxAgents: 50,
  requireApproval: false,
  autoCreateThreads: true,
  defaultPermissions: {
    canCreate: ['leader', 'coordinator'],
    canArchive: ['leader', 'coordinator'],
    canInvite: ['leader', 'coordinator', 'contributor'],
    canRemove: ['leader'],
  },
  preserveHistory: true,
};

const DEFAULT_AGENT_PREFERENCES: AgentPreferences = {
  notifyAll: true,
  mentionsOnly: false,
};

// ============================================================================
// Group Coordinator
// ============================================================================

export class GroupCoordinator extends EventEmitter {
  private groups: Map<string, AgentGroup> = new Map();
  private agentGroups: Map<string, Set<string>> = new Map(); // agentId -> groupIds
  private tasks: Map<string, CoordinationTask> = new Map();
  private threadManager: ThreadManager;
  private groupCounter = 0;
  private taskCounter = 0;

  constructor(threadManager?: ThreadManager) {
    super();
    this.threadManager = threadManager || new ThreadManager();
  }

  // ============================================================================
  // Group Lifecycle
  // ============================================================================

  /**
   * Create a new agent group
   */
  createGroup(options: GroupCreateOptions): AgentGroup {
    this.groupCounter++;
    const groupId = `group:${Date.now()}:${this.groupCounter}`;

    const group: AgentGroup = {
      id: groupId,
      name: options.name,
      topic: options.topic || options.name,
      agents: new Map(),
      threads: new Set(),
      status: 'active',
      createdAt: new Date(),
      config: { ...DEFAULT_GROUP_CONFIG, ...options.config },
      metadata: options.metadata || {},
    };

    this.groups.set(groupId, group);

    // Create default thread for general discussion
    const defaultThread = this.threadManager.createThread({
      name: 'General',
      groupId,
      topic: 'General discussion',
    });
    group.defaultThreadId = defaultThread.id;
    group.threads.add(defaultThread.id);

    // Add initial agents
    if (options.agents) {
      for (const { agentId, role } of options.agents) {
        this.addAgentToGroup(groupId, agentId, role || 'contributor');
      }
    }

    logger.info(`[GroupCoordinator] Created group ${groupId} with ${group.agents.size} agents`);

    this.emit('group.created', {
      type: 'group.created',
      groupId,
    } as GroupEvent);

    return group;
  }

  /**
   * Get a group by ID
   */
  getGroup(groupId: string): AgentGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Archive a group (preserves history)
   */
  archiveGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    group.status = 'archived';

    // Archive all threads
    for (const threadId of group.threads) {
      this.threadManager.archiveThread(threadId);
    }

    logger.info(`[GroupCoordinator] Archived group ${groupId}`);

    this.emit('group.archived', {
      type: 'group.archived',
      groupId,
    } as GroupEvent);

    return true;
  }

  /**
   * Pause a group (temporarily inactive)
   */
  pauseGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group || group.status !== 'active') {
      return false;
    }

    group.status = 'paused';
    logger.info(`[GroupCoordinator] Paused group ${groupId}`);

    this.emit('group.paused', {
      type: 'group.paused',
      groupId,
    } as GroupEvent);

    return true;
  }

  /**
   * Resume a paused group
   */
  resumeGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group || group.status !== 'paused') {
      return false;
    }

    group.status = 'active';
    logger.info(`[GroupCoordinator] Resumed group ${groupId}`);

    this.emit('group.resumed', {
      type: 'group.resumed',
      groupId,
    } as GroupEvent);

    return true;
  }

  /**
   * Delete a group and all its data
   */
  deleteGroup(groupId: string, preserveHistory = true): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    // Remove agents from group mapping
    for (const agentId of group.agents.keys()) {
      this.removeAgentFromGroupMapping(agentId, groupId);
    }

    // Delete or archive threads
    for (const threadId of group.threads) {
      if (preserveHistory) {
        this.threadManager.archiveThread(threadId);
      } else {
        this.threadManager.deleteThread(threadId);
      }
    }

    this.groups.delete(groupId);
    logger.info(`[GroupCoordinator] Deleted group ${groupId}`);

    return true;
  }

  // ============================================================================
  // Agent Participation Management
  // ============================================================================

  /**
   * Add an agent to a group
   */
  addAgentToGroup(
    groupId: string,
    agentId: string,
    role: GroupRole = 'contributor',
    preferences?: Partial<AgentPreferences>
  ): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      logger.warn(`[GroupCoordinator] Group ${groupId} not found`);
      return false;
    }

    if (group.agents.has(agentId)) {
      logger.warn(`[GroupCoordinator] Agent ${agentId} already in group ${groupId}`);
      return true; // Already in group
    }

    if (group.agents.size >= group.config.maxAgents) {
      logger.warn(`[GroupCoordinator] Group ${groupId} is at capacity`);
      return false;
    }

    const groupAgent: GroupAgent = {
      agentId,
      role,
      joinedAt: new Date(),
      status: 'active',
      assignedThreads: new Set(),
      preferences: { ...DEFAULT_AGENT_PREFERENCES, ...preferences },
    };

    group.agents.set(agentId, groupAgent);
    this.addAgentToGroupMapping(agentId, groupId);

    // Add agent to default thread
    if (group.defaultThreadId) {
      this.threadManager.addParticipant(group.defaultThreadId, agentId);
      groupAgent.assignedThreads.add(group.defaultThreadId);
    }

    logger.info(`[GroupCoordinator] Agent ${agentId} joined group ${groupId} as ${role}`);

    this.emit('agent.joined', {
      type: 'agent.joined',
      groupId,
      agentId,
      role,
    } as GroupEvent);

    // Send welcome message
    if (group.defaultThreadId) {
      this.threadManager.sendMessage(
        group.defaultThreadId,
        'system',
        `Welcome @${agentId}! You joined as ${role}.`,
        { type: 'system', mentions: [agentId] }
      );
    }

    return true;
  }

  /**
   * Remove an agent from a group
   */
  removeAgentFromGroup(groupId: string, agentId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    const agent = group.agents.get(agentId);
    if (!agent) {
      return false;
    }

    // Remove from all threads
    for (const threadId of agent.assignedThreads) {
      this.threadManager.removeParticipant(threadId, agentId);
    }

    group.agents.delete(agentId);
    this.removeAgentFromGroupMapping(agentId, groupId);

    logger.info(`[GroupCoordinator] Agent ${agentId} left group ${groupId}`);

    this.emit('agent.left', {
      type: 'agent.left',
      groupId,
      agentId,
    } as GroupEvent);

    return true;
  }

  /**
   * Update an agent's role in a group
   */
  updateAgentRole(groupId: string, agentId: string, newRole: GroupRole): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    const agent = group.agents.get(agentId);
    if (!agent) {
      return false;
    }

    agent.role = newRole;

    // Send notification
    if (group.defaultThreadId) {
      this.threadManager.sendMessage(
        group.defaultThreadId,
        'system',
        `@${agentId} is now a ${newRole}.`,
        { type: 'system', mentions: [agentId] }
      );
    }

    return true;
  }

  /**
   * Set agent status (active, inactive, away)
   */
  setAgentStatus(
    groupId: string,
    agentId: string,
    status: GroupAgent['status']
  ): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    const agent = group.agents.get(agentId);
    if (!agent) {
      return false;
    }

    agent.status = status;
    return true;
  }

  /**
   * Get all agents in a group
   */
  getGroupAgents(groupId: string): GroupAgent[] {
    const group = this.groups.get(groupId);
    if (!group) {
      return [];
    }
    return Array.from(group.agents.values());
  }

  /**
   * Get all groups an agent belongs to
   */
  getAgentGroups(agentId: string): AgentGroup[] {
    const groupIds = this.agentGroups.get(agentId);
    if (!groupIds) {
      return [];
    }
    return Array.from(groupIds)
      .map((id) => this.groups.get(id))
      .filter((g): g is AgentGroup => g !== undefined);
  }

  /**
   * Check if an agent is in a group
   */
  isAgentInGroup(groupId: string, agentId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }
    return group.agents.has(agentId);
  }

  // ============================================================================
  // Thread Assignment and Isolation
  // ============================================================================

  /**
   * Create a new thread in a group and assign agents to it
   */
  createGroupThread(
    groupId: string,
    name: string,
    options?: {
      topic?: string;
      agentIds?: string[];
      parentThreadId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Thread | null {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    // Check permissions
    // (In real implementation, would check requesting agent's role)

    const thread = this.threadManager.createThread({
      name,
      groupId,
      topic: options?.topic || name,
      participants: options?.agentIds,
      parentThreadId: options?.parentThreadId,
      metadata: options?.metadata,
    });

    group.threads.add(thread.id);

    // Update agent assignments
    if (options?.agentIds) {
      for (const agentId of options.agentIds) {
        const agent = group.agents.get(agentId);
        if (agent) {
          agent.assignedThreads.add(thread.id);
        }
      }
    }

    // Send notification to default thread
    if (group.defaultThreadId) {
      const participantList = options?.agentIds?.map((id) => `@${id}`).join(', ') || 'all agents';
      this.threadManager.sendMessage(
        group.defaultThreadId,
        'system',
        `New thread "${name}" created for ${participantList}.`,
        { type: 'system' }
      );
    }

    return thread;
  }

  /**
   * Assign an agent to a specific thread
   */
  assignAgentToThread(
    groupId: string,
    agentId: string,
    threadId: string
  ): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    const agent = group.agents.get(agentId);
    if (!agent) {
      return false;
    }

    if (!group.threads.has(threadId)) {
      return false;
    }

    const success = this.threadManager.addParticipant(threadId, agentId);
    if (success) {
      agent.assignedThreads.add(threadId);

      this.emit('agent.assigned', {
        type: 'agent.assigned',
        groupId,
        agentId,
        threadId,
      } as GroupEvent);
    }

    return success;
  }

  /**
   * Remove an agent from a specific thread
   */
  removeAgentFromThread(
    groupId: string,
    agentId: string,
    threadId: string
  ): boolean {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    const agent = group.agents.get(agentId);
    if (!agent) {
      return false;
    }

    const success = this.threadManager.removeParticipant(threadId, agentId);
    if (success) {
      agent.assignedThreads.delete(threadId);

      this.emit('agent.removed', {
        type: 'agent.removed',
        groupId,
        agentId,
        threadId,
      } as GroupEvent);
    }

    return success;
  }

  /**
   * Get threads assigned to a specific agent in a group
   */
  getAgentThreads(groupId: string, agentId: string): Thread[] {
    const group = this.groups.get(groupId);
    if (!group) {
      return [];
    }

    const agent = group.agents.get(agentId);
    if (!agent) {
      return [];
    }

    return Array.from(agent.assignedThreads)
      .map((id) => this.threadManager.getThread(id))
      .filter((t): t is Thread => t !== undefined);
  }

  /**
   * Get all threads in a group
   */
  getGroupThreads(groupId: string): Thread[] {
    const group = this.groups.get(groupId);
    if (!group) {
      return [];
    }
    return Array.from(group.threads)
      .map((id) => this.threadManager.getThread(id))
      .filter((t): t is Thread => t !== undefined);
  }

  // ============================================================================
  // @Mention Coordination
  // ============================================================================

  /**
   * Route a message with @mentions to appropriate agents
   */
  routeMentions(
    groupId: string,
    threadId: string,
    fromAgentId: string,
    content: string
  ): MentionRoutingResult[] {
    const group = this.groups.get(groupId);
    if (!group) {
      return [];
    }

    const mentions = this.threadManager.parseMentions(content);
    const results: MentionRoutingResult[] = [];

    for (const mention of mentions) {
      const result = this.routeSingleMention(
        group,
        threadId,
        fromAgentId,
        mention
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Route a single @mention
   */
  private routeSingleMention(
    group: AgentGroup,
    threadId: string,
    fromAgentId: string,
    mention: string
  ): MentionRoutingResult {
    const result: MentionRoutingResult = {
      mention,
      routed: false,
      notifiedThreads: [],
    };

    // Resolve mention to agent ID
    // Try exact match first, then partial match
    let targetAgentId: string | undefined;

    // Direct match
    if (group.agents.has(mention)) {
      targetAgentId = mention;
    } else {
      // Try case-insensitive match
      for (const [agentId] of group.agents) {
        if (agentId.toLowerCase() === mention.toLowerCase()) {
          targetAgentId = agentId;
          break;
        }
      }
    }

    if (!targetAgentId) {
      result.error = `Agent "${mention}" not found in group`;
      return result;
    }

    result.targetAgentId = targetAgentId;
    const targetAgent = group.agents.get(targetAgentId);

    if (!targetAgent) {
      result.error = `Agent "${targetAgentId}" not found`;
      return result;
    }

    // Check if target agent is in the thread
    const isInThread = this.threadManager.isParticipant(threadId, targetAgentId);

    if (!isInThread) {
      // Auto-add to thread if agent allows it
      if (!targetAgent.preferences.mentionsOnly) {
        this.threadManager.addParticipant(threadId, targetAgentId);
        targetAgent.assignedThreads.add(threadId);
        result.notifiedThreads.push(threadId);
      } else {
        // Notify in their other threads
        for (const assignedThreadId of targetAgent.assignedThreads) {
          this.threadManager.sendMessage(
            assignedThreadId,
            'system',
            `@${targetAgentId}: You were mentioned by @${fromAgentId} in another thread.`,
            { type: 'system', mentions: [targetAgentId] }
          );
          result.notifiedThreads.push(assignedThreadId);
        }
      }
    } else {
      result.notifiedThreads.push(threadId);
    }

    result.routed = true;

    this.emit('mention.routed', {
      type: 'mention.routed',
      groupId: group.id,
      fromAgentId,
      toAgentId: targetAgentId,
      threadId,
    } as GroupEvent);

    return result;
  }

  /**
   * Send a message with @mention routing
   */
  sendMessageWithRouting(
    groupId: string,
    threadId: string,
    fromAgentId: string,
    content: string,
    options?: {
      replyTo?: string;
      metadata?: Record<string, unknown>;
    }
  ): { message: ThreadMessage | null; routingResults: MentionRoutingResult[] } {
    // First route any mentions
    const routingResults = this.routeMentions(
      groupId,
      threadId,
      fromAgentId,
      content
    );

    // Then send the message
    const message = this.threadManager.sendMessageWithMentions(
      threadId,
      fromAgentId,
      content,
      options
    );

    return { message, routingResults };
  }

  /**
   * Broadcast a message to all threads in a group
   */
  broadcastToGroup(
    groupId: string,
    fromAgentId: string,
    content: string,
    options?: {
      excludeThreadIds?: string[];
      requireRole?: GroupRole[];
    }
  ): { threadId: string; message: ThreadMessage | null }[] {
    const group = this.groups.get(groupId);
    if (!group) {
      return [];
    }

    const results: { threadId: string; message: ThreadMessage | null }[] = [];

    for (const threadId of group.threads) {
      if (options?.excludeThreadIds?.includes(threadId)) {
        continue;
      }

      // Check role requirements
      if (options?.requireRole) {
        const agent = group.agents.get(fromAgentId);
        if (!agent || !options.requireRole.includes(agent.role)) {
          continue;
        }
      }

      const message = this.threadManager.sendMessage(
        threadId,
        fromAgentId,
        content,
        { type: 'text' }
      );

      results.push({ threadId, message });
    }

    return results;
  }

  // ============================================================================
  // Task Coordination
  // ============================================================================

  /**
   * Create a coordination task with its own thread
   */
  createTask(
    groupId: string,
    description: string,
    options?: {
      assignTo?: string[];
      dependencies?: string[];
      threadName?: string;
    }
  ): CoordinationTask | null {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    this.taskCounter++;
    const taskId = `task:${Date.now()}:${this.taskCounter}`;

    // Create a dedicated thread for this task
    const thread = this.createGroupThread(groupId, options?.threadName || `Task: ${description}`, {
      topic: description,
      agentIds: options?.assignTo,
    });

    if (!thread) {
      return null;
    }

    const task: CoordinationTask = {
      id: taskId,
      description,
      threadId: thread.id,
      assignedAgents: options?.assignTo || [],
      status: 'pending',
      dependencies: options?.dependencies || [],
      createdAt: new Date(),
    };

    this.tasks.set(taskId, task);

    logger.info(`[GroupCoordinator] Created task ${taskId} in group ${groupId}`);

    this.emit('task.created', {
      type: 'task.created',
      groupId,
      taskId,
      threadId: thread.id,
    } as GroupEvent);

    // Notify assigned agents
    for (const agentId of task.assignedAgents) {
      this.emit('task.assigned', {
        type: 'task.assigned',
        groupId,
        taskId,
        agentId,
      } as GroupEvent);
    }

    // Send initial task message
    this.threadManager.sendMessage(
      thread.id,
      'system',
      `Task created: ${description}\nAssigned to: ${task.assignedAgents.map((id) => `@${id}`).join(', ') || 'Unassigned'}`,
      { type: 'system', mentions: task.assignedAgents }
    );

    return task;
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): CoordinationTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Update task status
   */
  updateTaskStatus(
    taskId: string,
    status: CoordinationTask['status']
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.status = status;

    if (status === 'completed') {
      task.completedAt = new Date();

      const group = Array.from(this.groups.values()).find((g) =>
        g.threads.has(task.threadId)
      );

      if (group) {
        this.emit('task.completed', {
          type: 'task.completed',
          groupId: group.id,
          taskId,
        } as GroupEvent);
      }

      // Send completion message
      this.threadManager.sendMessage(
        task.threadId,
        'system',
        `Task completed: ${task.description}`,
        { type: 'system' }
      );
    }

    return true;
  }

  /**
   * Get all tasks for a group
   */
  getGroupTasks(groupId: string): CoordinationTask[] {
    const group = this.groups.get(groupId);
    if (!group) {
      return [];
    }

    return Array.from(this.tasks.values()).filter((t) =>
      group.threads.has(t.threadId)
    );
  }

  /**
   * Get tasks assigned to a specific agent
   */
  getAgentTasks(agentId: string): CoordinationTask[] {
    return Array.from(this.tasks.values()).filter((t) =>
      t.assignedAgents.includes(agentId)
    );
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get all active groups
   */
  getActiveGroups(): AgentGroup[] {
    return Array.from(this.groups.values()).filter((g) => g.status === 'active');
  }

  /**
   * Get group statistics
   */
  getGroupStats(groupId: string): {
    agentCount: number;
    threadCount: number;
    totalMessages: number;
    activeAgents: number;
    taskCount: number;
  } | null {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    const activeAgents = Array.from(group.agents.values()).filter(
      (a) => a.status === 'active'
    ).length;

    let totalMessages = 0;
    for (const threadId of group.threads) {
      const stats = this.threadManager.getThreadStats(threadId);
      if (stats) {
        totalMessages += stats.messageCount;
      }
    }

    const tasks = this.getGroupTasks(groupId);

    return {
      agentCount: group.agents.size,
      threadCount: group.threads.size,
      totalMessages,
      activeAgents,
      taskCount: tasks.length,
    };
  }

  /**
   * Search groups by name or topic
   */
  searchGroups(query: string): AgentGroup[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.groups.values()).filter(
      (g) =>
        g.name.toLowerCase().includes(lowerQuery) ||
        g.topic.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get thread manager instance
   */
  getThreadManager(): ThreadManager {
    return this.threadManager;
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.groups.clear();
    this.agentGroups.clear();
    this.tasks.clear();
    this.threadManager.reset();
    this.groupCounter = 0;
    this.taskCounter = 0;
    logger.info('[GroupCoordinator] Reset all data');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private addAgentToGroupMapping(agentId: string, groupId: string): void {
    if (!this.agentGroups.has(agentId)) {
      this.agentGroups.set(agentId, new Set());
    }
    this.agentGroups.get(agentId)!.add(groupId);
  }

  private removeAgentFromGroupMapping(agentId: string, groupId: string): void {
    const groups = this.agentGroups.get(agentId);
    if (groups) {
      groups.delete(groupId);
      if (groups.size === 0) {
        this.agentGroups.delete(agentId);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalGroupCoordinator: GroupCoordinator | null = null;

export function getGlobalGroupCoordinator(threadManager?: ThreadManager): GroupCoordinator {
  if (!globalGroupCoordinator) {
    globalGroupCoordinator = new GroupCoordinator(threadManager);
  }
  return globalGroupCoordinator;
}

export function resetGlobalGroupCoordinator(): void {
  globalGroupCoordinator = null;
}

export default GroupCoordinator;
