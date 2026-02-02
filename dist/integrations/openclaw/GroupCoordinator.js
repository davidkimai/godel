"use strict";
/**
 * Group Coordinator
 *
 * Coordinates multiple agents in group chats.
 * Handles group creation, agent participation management,
 * thread-based conversation isolation, and @mention routing.
 *
 * @module GroupCoordinator
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupCoordinator = void 0;
exports.getGlobalGroupCoordinator = getGlobalGroupCoordinator;
exports.resetGlobalGroupCoordinator = resetGlobalGroupCoordinator;
const events_1 = require("events");
const ThreadManager_1 = require("./ThreadManager");
const logger_1 = require("../utils/logger");
// ============================================================================
// Default Configurations
// ============================================================================
const DEFAULT_GROUP_CONFIG = {
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
const DEFAULT_AGENT_PREFERENCES = {
    notifyAll: true,
    mentionsOnly: false,
};
// ============================================================================
// Group Coordinator
// ============================================================================
class GroupCoordinator extends events_1.EventEmitter {
    constructor(threadManager) {
        super();
        this.groups = new Map();
        this.agentGroups = new Map(); // agentId -> groupIds
        this.tasks = new Map();
        this.groupCounter = 0;
        this.taskCounter = 0;
        this.threadManager = threadManager || new ThreadManager_1.ThreadManager();
    }
    // ============================================================================
    // Group Lifecycle
    // ============================================================================
    /**
     * Create a new agent group
     */
    createGroup(options) {
        this.groupCounter++;
        const groupId = `group:${Date.now()}:${this.groupCounter}`;
        const group = {
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
        logger_1.logger.info(`[GroupCoordinator] Created group ${groupId} with ${group.agents.size} agents`);
        this.emit('group.created', {
            type: 'group.created',
            groupId,
        });
        return group;
    }
    /**
     * Get a group by ID
     */
    getGroup(groupId) {
        return this.groups.get(groupId);
    }
    /**
     * Archive a group (preserves history)
     */
    archiveGroup(groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            return false;
        }
        group.status = 'archived';
        // Archive all threads
        for (const threadId of group.threads) {
            this.threadManager.archiveThread(threadId);
        }
        logger_1.logger.info(`[GroupCoordinator] Archived group ${groupId}`);
        this.emit('group.archived', {
            type: 'group.archived',
            groupId,
        });
        return true;
    }
    /**
     * Pause a group (temporarily inactive)
     */
    pauseGroup(groupId) {
        const group = this.groups.get(groupId);
        if (!group || group.status !== 'active') {
            return false;
        }
        group.status = 'paused';
        logger_1.logger.info(`[GroupCoordinator] Paused group ${groupId}`);
        this.emit('group.paused', {
            type: 'group.paused',
            groupId,
        });
        return true;
    }
    /**
     * Resume a paused group
     */
    resumeGroup(groupId) {
        const group = this.groups.get(groupId);
        if (!group || group.status !== 'paused') {
            return false;
        }
        group.status = 'active';
        logger_1.logger.info(`[GroupCoordinator] Resumed group ${groupId}`);
        this.emit('group.resumed', {
            type: 'group.resumed',
            groupId,
        });
        return true;
    }
    /**
     * Delete a group and all its data
     */
    deleteGroup(groupId, preserveHistory = true) {
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
            }
            else {
                this.threadManager.deleteThread(threadId);
            }
        }
        this.groups.delete(groupId);
        logger_1.logger.info(`[GroupCoordinator] Deleted group ${groupId}`);
        return true;
    }
    // ============================================================================
    // Agent Participation Management
    // ============================================================================
    /**
     * Add an agent to a group
     */
    addAgentToGroup(groupId, agentId, role = 'contributor', preferences) {
        const group = this.groups.get(groupId);
        if (!group) {
            logger_1.logger.warn(`[GroupCoordinator] Group ${groupId} not found`);
            return false;
        }
        if (group.agents.has(agentId)) {
            logger_1.logger.warn(`[GroupCoordinator] Agent ${agentId} already in group ${groupId}`);
            return true; // Already in group
        }
        if (group.agents.size >= group.config.maxAgents) {
            logger_1.logger.warn(`[GroupCoordinator] Group ${groupId} is at capacity`);
            return false;
        }
        const groupAgent = {
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
        logger_1.logger.info(`[GroupCoordinator] Agent ${agentId} joined group ${groupId} as ${role}`);
        this.emit('agent.joined', {
            type: 'agent.joined',
            groupId,
            agentId,
            role,
        });
        // Send welcome message
        if (group.defaultThreadId) {
            this.threadManager.sendMessage(group.defaultThreadId, 'system', `Welcome @${agentId}! You joined as ${role}.`, { type: 'system', mentions: [agentId] });
        }
        return true;
    }
    /**
     * Remove an agent from a group
     */
    removeAgentFromGroup(groupId, agentId) {
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
        logger_1.logger.info(`[GroupCoordinator] Agent ${agentId} left group ${groupId}`);
        this.emit('agent.left', {
            type: 'agent.left',
            groupId,
            agentId,
        });
        return true;
    }
    /**
     * Update an agent's role in a group
     */
    updateAgentRole(groupId, agentId, newRole) {
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
            this.threadManager.sendMessage(group.defaultThreadId, 'system', `@${agentId} is now a ${newRole}.`, { type: 'system', mentions: [agentId] });
        }
        return true;
    }
    /**
     * Set agent status (active, inactive, away)
     */
    setAgentStatus(groupId, agentId, status) {
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
    getGroupAgents(groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            return [];
        }
        return Array.from(group.agents.values());
    }
    /**
     * Get all groups an agent belongs to
     */
    getAgentGroups(agentId) {
        const groupIds = this.agentGroups.get(agentId);
        if (!groupIds) {
            return [];
        }
        return Array.from(groupIds)
            .map((id) => this.groups.get(id))
            .filter((g) => g !== undefined);
    }
    /**
     * Check if an agent is in a group
     */
    isAgentInGroup(groupId, agentId) {
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
    createGroupThread(groupId, name, options) {
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
            this.threadManager.sendMessage(group.defaultThreadId, 'system', `New thread "${name}" created for ${participantList}.`, { type: 'system' });
        }
        return thread;
    }
    /**
     * Assign an agent to a specific thread
     */
    assignAgentToThread(groupId, agentId, threadId) {
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
            });
        }
        return success;
    }
    /**
     * Remove an agent from a specific thread
     */
    removeAgentFromThread(groupId, agentId, threadId) {
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
            });
        }
        return success;
    }
    /**
     * Get threads assigned to a specific agent in a group
     */
    getAgentThreads(groupId, agentId) {
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
            .filter((t) => t !== undefined);
    }
    /**
     * Get all threads in a group
     */
    getGroupThreads(groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            return [];
        }
        return Array.from(group.threads)
            .map((id) => this.threadManager.getThread(id))
            .filter((t) => t !== undefined);
    }
    // ============================================================================
    // @Mention Coordination
    // ============================================================================
    /**
     * Route a message with @mentions to appropriate agents
     */
    routeMentions(groupId, threadId, fromAgentId, content) {
        const group = this.groups.get(groupId);
        if (!group) {
            return [];
        }
        const mentions = this.threadManager.parseMentions(content);
        const results = [];
        for (const mention of mentions) {
            const result = this.routeSingleMention(group, threadId, fromAgentId, mention);
            results.push(result);
        }
        return results;
    }
    /**
     * Route a single @mention
     */
    routeSingleMention(group, threadId, fromAgentId, mention) {
        const result = {
            mention,
            routed: false,
            notifiedThreads: [],
        };
        // Resolve mention to agent ID
        // Try exact match first, then partial match
        let targetAgentId;
        // Direct match
        if (group.agents.has(mention)) {
            targetAgentId = mention;
        }
        else {
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
            }
            else {
                // Notify in their other threads
                for (const assignedThreadId of targetAgent.assignedThreads) {
                    this.threadManager.sendMessage(assignedThreadId, 'system', `@${targetAgentId}: You were mentioned by @${fromAgentId} in another thread.`, { type: 'system', mentions: [targetAgentId] });
                    result.notifiedThreads.push(assignedThreadId);
                }
            }
        }
        else {
            result.notifiedThreads.push(threadId);
        }
        result.routed = true;
        this.emit('mention.routed', {
            type: 'mention.routed',
            groupId: group.id,
            fromAgentId,
            toAgentId: targetAgentId,
            threadId,
        });
        return result;
    }
    /**
     * Send a message with @mention routing
     */
    sendMessageWithRouting(groupId, threadId, fromAgentId, content, options) {
        // First route any mentions
        const routingResults = this.routeMentions(groupId, threadId, fromAgentId, content);
        // Then send the message
        const message = this.threadManager.sendMessageWithMentions(threadId, fromAgentId, content, options);
        return { message, routingResults };
    }
    /**
     * Broadcast a message to all threads in a group
     */
    broadcastToGroup(groupId, fromAgentId, content, options) {
        const group = this.groups.get(groupId);
        if (!group) {
            return [];
        }
        const results = [];
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
            const message = this.threadManager.sendMessage(threadId, fromAgentId, content, { type: 'text' });
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
    createTask(groupId, description, options) {
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
        const task = {
            id: taskId,
            description,
            threadId: thread.id,
            assignedAgents: options?.assignTo || [],
            status: 'pending',
            dependencies: options?.dependencies || [],
            createdAt: new Date(),
        };
        this.tasks.set(taskId, task);
        logger_1.logger.info(`[GroupCoordinator] Created task ${taskId} in group ${groupId}`);
        this.emit('task.created', {
            type: 'task.created',
            groupId,
            taskId,
            threadId: thread.id,
        });
        // Notify assigned agents
        for (const agentId of task.assignedAgents) {
            this.emit('task.assigned', {
                type: 'task.assigned',
                groupId,
                taskId,
                agentId,
            });
        }
        // Send initial task message
        this.threadManager.sendMessage(thread.id, 'system', `Task created: ${description}\nAssigned to: ${task.assignedAgents.map((id) => `@${id}`).join(', ') || 'Unassigned'}`, { type: 'system', mentions: task.assignedAgents });
        return task;
    }
    /**
     * Get a task by ID
     */
    getTask(taskId) {
        return this.tasks.get(taskId);
    }
    /**
     * Update task status
     */
    updateTaskStatus(taskId, status) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return false;
        }
        task.status = status;
        if (status === 'completed') {
            task.completedAt = new Date();
            const group = Array.from(this.groups.values()).find((g) => g.threads.has(task.threadId));
            if (group) {
                this.emit('task.completed', {
                    type: 'task.completed',
                    groupId: group.id,
                    taskId,
                });
            }
            // Send completion message
            this.threadManager.sendMessage(task.threadId, 'system', `Task completed: ${task.description}`, { type: 'system' });
        }
        return true;
    }
    /**
     * Get all tasks for a group
     */
    getGroupTasks(groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            return [];
        }
        return Array.from(this.tasks.values()).filter((t) => group.threads.has(t.threadId));
    }
    /**
     * Get tasks assigned to a specific agent
     */
    getAgentTasks(agentId) {
        return Array.from(this.tasks.values()).filter((t) => t.assignedAgents.includes(agentId));
    }
    // ============================================================================
    // Query Methods
    // ============================================================================
    /**
     * Get all active groups
     */
    getActiveGroups() {
        return Array.from(this.groups.values()).filter((g) => g.status === 'active');
    }
    /**
     * Get group statistics
     */
    getGroupStats(groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            return null;
        }
        const activeAgents = Array.from(group.agents.values()).filter((a) => a.status === 'active').length;
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
    searchGroups(query) {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.groups.values()).filter((g) => g.name.toLowerCase().includes(lowerQuery) ||
            g.topic.toLowerCase().includes(lowerQuery));
    }
    /**
     * Get thread manager instance
     */
    getThreadManager() {
        return this.threadManager;
    }
    /**
     * Reset all data (for testing)
     */
    reset() {
        this.groups.clear();
        this.agentGroups.clear();
        this.tasks.clear();
        this.threadManager.reset();
        this.groupCounter = 0;
        this.taskCounter = 0;
        logger_1.logger.info('[GroupCoordinator] Reset all data');
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    addAgentToGroupMapping(agentId, groupId) {
        if (!this.agentGroups.has(agentId)) {
            this.agentGroups.set(agentId, new Set());
        }
        this.agentGroups.get(agentId).add(groupId);
    }
    removeAgentFromGroupMapping(agentId, groupId) {
        const groups = this.agentGroups.get(agentId);
        if (groups) {
            groups.delete(groupId);
            if (groups.size === 0) {
                this.agentGroups.delete(agentId);
            }
        }
    }
}
exports.GroupCoordinator = GroupCoordinator;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalGroupCoordinator = null;
function getGlobalGroupCoordinator(threadManager) {
    if (!globalGroupCoordinator) {
        globalGroupCoordinator = new GroupCoordinator(threadManager);
    }
    return globalGroupCoordinator;
}
function resetGlobalGroupCoordinator() {
    globalGroupCoordinator = null;
}
exports.default = GroupCoordinator;
//# sourceMappingURL=GroupCoordinator.js.map