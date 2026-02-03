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
    quietHours?: {
        start: number;
        end: number;
    };
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
    agents?: Array<{
        agentId: string;
        role?: GroupRole;
    }>;
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
export type GroupEvent = {
    type: 'group.created';
    groupId: string;
} | {
    type: 'group.archived';
    groupId: string;
} | {
    type: 'group.paused';
    groupId: string;
} | {
    type: 'group.resumed';
    groupId: string;
} | {
    type: 'agent.joined';
    groupId: string;
    agentId: string;
    role: GroupRole;
} | {
    type: 'agent.left';
    groupId: string;
    agentId: string;
} | {
    type: 'agent.assigned';
    groupId: string;
    agentId: string;
    threadId: string;
} | {
    type: 'agent.removed';
    groupId: string;
    agentId: string;
    threadId: string;
} | {
    type: 'mention.routed';
    groupId: string;
    fromAgentId: string;
    toAgentId: string;
    threadId: string;
} | {
    type: 'task.created';
    groupId: string;
    taskId: string;
    threadId: string;
} | {
    type: 'task.assigned';
    groupId: string;
    taskId: string;
    agentId: string;
} | {
    type: 'task.completed';
    groupId: string;
    taskId: string;
};
export declare class GroupCoordinator extends EventEmitter {
    private groups;
    private agentGroups;
    private tasks;
    private threadManager;
    private groupCounter;
    private taskCounter;
    constructor(threadManager?: ThreadManager);
    /**
     * Create a new agent group
     */
    createGroup(options: GroupCreateOptions): AgentGroup;
    /**
     * Get a group by ID
     */
    getGroup(groupId: string): AgentGroup | undefined;
    /**
     * Archive a group (preserves history)
     */
    archiveGroup(groupId: string): boolean;
    /**
     * Pause a group (temporarily inactive)
     */
    pauseGroup(groupId: string): boolean;
    /**
     * Resume a paused group
     */
    resumeGroup(groupId: string): boolean;
    /**
     * Delete a group and all its data
     */
    deleteGroup(groupId: string, preserveHistory?: boolean): boolean;
    /**
     * Add an agent to a group
     */
    addAgentToGroup(groupId: string, agentId: string, role?: GroupRole, preferences?: Partial<AgentPreferences>): boolean;
    /**
     * Remove an agent from a group
     */
    removeAgentFromGroup(groupId: string, agentId: string): boolean;
    /**
     * Update an agent's role in a group
     */
    updateAgentRole(groupId: string, agentId: string, newRole: GroupRole): boolean;
    /**
     * Set agent status (active, inactive, away)
     */
    setAgentStatus(groupId: string, agentId: string, status: GroupAgent['status']): boolean;
    /**
     * Get all agents in a group
     */
    getGroupAgents(groupId: string): GroupAgent[];
    /**
     * Get all groups an agent belongs to
     */
    getAgentGroups(agentId: string): AgentGroup[];
    /**
     * Check if an agent is in a group
     */
    isAgentInGroup(groupId: string, agentId: string): boolean;
    /**
     * Create a new thread in a group and assign agents to it
     */
    createGroupThread(groupId: string, name: string, options?: {
        topic?: string;
        agentIds?: string[];
        parentThreadId?: string;
        metadata?: Record<string, unknown>;
    }): Thread | null;
    /**
     * Assign an agent to a specific thread
     */
    assignAgentToThread(groupId: string, agentId: string, threadId: string): boolean;
    /**
     * Remove an agent from a specific thread
     */
    removeAgentFromThread(groupId: string, agentId: string, threadId: string): boolean;
    /**
     * Get threads assigned to a specific agent in a group
     */
    getAgentThreads(groupId: string, agentId: string): Thread[];
    /**
     * Get all threads in a group
     */
    getGroupThreads(groupId: string): Thread[];
    /**
     * Route a message with @mentions to appropriate agents
     */
    routeMentions(groupId: string, threadId: string, fromAgentId: string, content: string): MentionRoutingResult[];
    /**
     * Route a single @mention
     */
    private routeSingleMention;
    /**
     * Send a message with @mention routing
     */
    sendMessageWithRouting(groupId: string, threadId: string, fromAgentId: string, content: string, options?: {
        replyTo?: string;
        metadata?: Record<string, unknown>;
    }): {
        message: ThreadMessage | null;
        routingResults: MentionRoutingResult[];
    };
    /**
     * Broadcast a message to all threads in a group
     */
    broadcastToGroup(groupId: string, fromAgentId: string, content: string, options?: {
        excludeThreadIds?: string[];
        requireRole?: GroupRole[];
    }): {
        threadId: string;
        message: ThreadMessage | null;
    }[];
    /**
     * Create a coordination task with its own thread
     */
    createTask(groupId: string, description: string, options?: {
        assignTo?: string[];
        dependencies?: string[];
        threadName?: string;
    }): CoordinationTask | null;
    /**
     * Get a task by ID
     */
    getTask(taskId: string): CoordinationTask | undefined;
    /**
     * Update task status
     */
    updateTaskStatus(taskId: string, status: CoordinationTask['status']): boolean;
    /**
     * Get all tasks for a group
     */
    getGroupTasks(groupId: string): CoordinationTask[];
    /**
     * Get tasks assigned to a specific agent
     */
    getAgentTasks(agentId: string): CoordinationTask[];
    /**
     * Get all active groups
     */
    getActiveGroups(): AgentGroup[];
    /**
     * Get group statistics
     */
    getGroupStats(groupId: string): {
        agentCount: number;
        threadCount: number;
        totalMessages: number;
        activeAgents: number;
        taskCount: number;
    } | null;
    /**
     * Search groups by name or topic
     */
    searchGroups(query: string): AgentGroup[];
    /**
     * Get thread manager instance
     */
    getThreadManager(): ThreadManager;
    /**
     * Reset all data (for testing)
     */
    reset(): void;
    private addAgentToGroupMapping;
    private removeAgentFromGroupMapping;
}
export declare function getGlobalGroupCoordinator(threadManager?: ThreadManager): GroupCoordinator;
export declare function resetGlobalGroupCoordinator(): void;
export default GroupCoordinator;
//# sourceMappingURL=GroupCoordinator.d.ts.map