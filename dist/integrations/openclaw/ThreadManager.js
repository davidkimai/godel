"use strict";
/**
 * Thread Manager
 *
 * Manages conversation threads for group chat coordination.
 * Provides thread creation, lifecycle management, message threading,
 * and history preservation per thread.
 *
 * @module ThreadManager
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreadManager = void 0;
exports.getGlobalThreadManager = getGlobalThreadManager;
exports.resetGlobalThreadManager = resetGlobalThreadManager;
const events_1 = require("events");
const logger_1 = require("../utils/logger");
// ============================================================================
// Thread Manager
// ============================================================================
class ThreadManager extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.threads = new Map();
        this.messages = new Map(); // threadId -> messages
        this.groupThreads = new Map(); // groupId -> threadIds
        this.agentThreads = new Map(); // agentId -> threadIds
        this.messageCounter = 0;
        this.threadCounter = 0;
    }
    // ============================================================================
    // Thread Lifecycle
    // ============================================================================
    /**
     * Create a new thread
     */
    createThread(options) {
        this.threadCounter++;
        const threadId = `thread:${Date.now()}:${this.threadCounter}`;
        const thread = {
            id: threadId,
            name: options.name,
            groupId: options.groupId,
            participants: new Set(options.participants || []),
            createdAt: new Date(),
            lastActivityAt: new Date(),
            status: 'active',
            topic: options.topic || options.name,
            metadata: options.metadata || {},
            parentThreadId: options.parentThreadId,
            childThreadIds: new Set(),
        };
        this.threads.set(threadId, thread);
        this.messages.set(threadId, []);
        // Update group -> threads mapping
        if (!this.groupThreads.has(options.groupId)) {
            this.groupThreads.set(options.groupId, new Set());
        }
        this.groupThreads.get(options.groupId).add(threadId);
        // Update agent -> threads mapping
        for (const agentId of thread.participants) {
            this.addAgentToThreadMapping(agentId, threadId);
        }
        // Update parent thread's child list if nested
        if (options.parentThreadId) {
            const parent = this.threads.get(options.parentThreadId);
            if (parent) {
                parent.childThreadIds.add(threadId);
            }
        }
        logger_1.logger.info(`[ThreadManager] Created thread ${threadId} in group ${options.groupId}`);
        this.emit('thread.created', {
            type: 'thread.created',
            threadId,
            groupId: options.groupId,
        });
        return thread;
    }
    /**
     * Get a thread by ID
     */
    getThread(threadId) {
        return this.threads.get(threadId);
    }
    /**
     * Archive a thread (preserves history but no new messages)
     */
    archiveThread(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return false;
        }
        thread.status = 'archived';
        logger_1.logger.info(`[ThreadManager] Archived thread ${threadId}`);
        this.emit('thread.archived', {
            type: 'thread.archived',
            threadId,
            groupId: thread.groupId,
        });
        return true;
    }
    /**
     * Lock a thread (prevents new messages but preserves access)
     */
    lockThread(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return false;
        }
        thread.status = 'locked';
        logger_1.logger.info(`[ThreadManager] Locked thread ${threadId}`);
        this.emit('thread.locked', {
            type: 'thread.locked',
            threadId,
            groupId: thread.groupId,
        });
        return true;
    }
    /**
     * Unlock a thread
     */
    unlockThread(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread || thread.status !== 'locked') {
            return false;
        }
        thread.status = 'active';
        logger_1.logger.info(`[ThreadManager] Unlocked thread ${threadId}`);
        this.emit('thread.unlocked', {
            type: 'thread.unlocked',
            threadId,
            groupId: thread.groupId,
        });
        return true;
    }
    /**
     * Delete a thread and all its messages
     */
    deleteThread(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return false;
        }
        // Remove from group mapping
        const groupThreads = this.groupThreads.get(thread.groupId);
        if (groupThreads) {
            groupThreads.delete(threadId);
        }
        // Remove from agent mappings
        for (const agentId of thread.participants) {
            this.removeAgentFromThreadMapping(agentId, threadId);
        }
        // Remove from parent thread's children
        if (thread.parentThreadId) {
            const parent = this.threads.get(thread.parentThreadId);
            if (parent) {
                parent.childThreadIds.delete(threadId);
            }
        }
        // Delete messages
        this.messages.delete(threadId);
        // Delete thread
        this.threads.delete(threadId);
        logger_1.logger.info(`[ThreadManager] Deleted thread ${threadId}`);
        return true;
    }
    // ============================================================================
    // Participant Management
    // ============================================================================
    /**
     * Add an agent to a thread
     */
    addParticipant(threadId, agentId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return false;
        }
        if (thread.participants.has(agentId)) {
            return true; // Already a participant
        }
        thread.participants.add(agentId);
        this.addAgentToThreadMapping(agentId, threadId);
        // Add system message
        this.addSystemMessage(threadId, `${agentId} joined the thread`);
        logger_1.logger.info(`[ThreadManager] Agent ${agentId} joined thread ${threadId}`);
        this.emit('thread.joined', {
            type: 'thread.joined',
            threadId,
            agentId,
        });
        return true;
    }
    /**
     * Remove an agent from a thread
     */
    removeParticipant(threadId, agentId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return false;
        }
        if (!thread.participants.has(agentId)) {
            return false;
        }
        thread.participants.delete(agentId);
        this.removeAgentFromThreadMapping(agentId, threadId);
        // Add system message
        this.addSystemMessage(threadId, `${agentId} left the thread`);
        logger_1.logger.info(`[ThreadManager] Agent ${agentId} left thread ${threadId}`);
        this.emit('thread.left', {
            type: 'thread.left',
            threadId,
            agentId,
        });
        return true;
    }
    /**
     * Get all participants in a thread
     */
    getParticipants(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return [];
        }
        return Array.from(thread.participants);
    }
    /**
     * Check if an agent is a participant in a thread
     */
    isParticipant(threadId, agentId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return false;
        }
        return thread.participants.has(agentId);
    }
    // ============================================================================
    // Message Management
    // ============================================================================
    /**
     * Send a message to a thread
     */
    sendMessage(threadId, agentId, content, options) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            logger_1.logger.warn(`[ThreadManager] Cannot send message: thread ${threadId} not found`);
            return null;
        }
        // Check if thread is active
        if (thread.status !== 'active') {
            logger_1.logger.warn(`[ThreadManager] Cannot send message: thread ${threadId} is ${thread.status}`);
            return null;
        }
        // Check if agent is a participant (unless it's a system message)
        if (options?.type !== 'system' && !thread.participants.has(agentId)) {
            logger_1.logger.warn(`[ThreadManager] Agent ${agentId} is not a participant in thread ${threadId}`);
            return null;
        }
        this.messageCounter++;
        const message = {
            id: `msg:${Date.now()}:${this.messageCounter}`,
            threadId,
            agentId,
            content,
            timestamp: new Date(),
            type: options?.type || 'text',
            mentions: options?.mentions,
            replyTo: options?.replyTo,
            metadata: options?.metadata,
        };
        const threadMessages = this.messages.get(threadId);
        if (threadMessages) {
            threadMessages.push(message);
        }
        // Update last activity
        thread.lastActivityAt = new Date();
        logger_1.logger.debug(`[ThreadManager] Message ${message.id} sent to thread ${threadId}`);
        this.emit('message.sent', {
            type: 'message.sent',
            threadId,
            messageId: message.id,
            agentId,
        });
        // Emit mention events
        if (message.mentions && message.mentions.length > 0) {
            for (const mentionedAgentId of message.mentions) {
                this.emit('message.mentioned', {
                    type: 'message.mentioned',
                    threadId,
                    messageId: message.id,
                    mentionedAgentId,
                });
            }
        }
        return message;
    }
    /**
     * Send a message with @mentions parsed from content
     */
    sendMessageWithMentions(threadId, agentId, content, options) {
        // Parse @mentions from content
        const mentions = this.parseMentions(content);
        return this.sendMessage(threadId, agentId, content, {
            type: mentions.length > 0 ? 'mention' : 'text',
            mentions,
            replyTo: options?.replyTo,
            metadata: options?.metadata,
        });
    }
    /**
     * Get message history for a thread
     */
    getHistory(options) {
        const threadMessages = this.messages.get(options.threadId);
        if (!threadMessages) {
            return [];
        }
        let messages = [...threadMessages];
        // Filter by agent
        if (options.agentId) {
            messages = messages.filter((m) => m.agentId === options.agentId);
        }
        // Filter by type
        if (options.type) {
            messages = messages.filter((m) => m.type === options.type);
        }
        // Sort by timestamp (newest first for pagination)
        messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        // Apply offset
        if (options.offset) {
            messages = messages.slice(options.offset);
        }
        // Apply limit
        if (options.limit) {
            messages = messages.slice(0, options.limit);
        }
        // Return in chronological order
        return messages.reverse();
    }
    /**
     * Get a specific message
     */
    getMessage(messageId) {
        for (const messages of this.messages.values()) {
            const message = messages.find((m) => m.id === messageId);
            if (message) {
                return message;
            }
        }
        return undefined;
    }
    /**
     * Get the last N messages from a thread
     */
    getRecentMessages(threadId, limit = 10) {
        return this.getHistory({ threadId, limit });
    }
    // ============================================================================
    // Thread Queries
    // ============================================================================
    /**
     * Get all threads in a group
     */
    getGroupThreads(groupId) {
        const threadIds = this.groupThreads.get(groupId);
        if (!threadIds) {
            return [];
        }
        return Array.from(threadIds)
            .map((id) => this.threads.get(id))
            .filter((t) => t !== undefined);
    }
    /**
     * Get all threads an agent participates in
     */
    getAgentThreads(agentId) {
        const threadIds = this.agentThreads.get(agentId);
        if (!threadIds) {
            return [];
        }
        return Array.from(threadIds)
            .map((id) => this.threads.get(id))
            .filter((t) => t !== undefined);
    }
    /**
     * Get child threads of a thread
     */
    getChildThreads(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return [];
        }
        return Array.from(thread.childThreadIds)
            .map((id) => this.threads.get(id))
            .filter((t) => t !== undefined);
    }
    /**
     * Get thread statistics
     */
    getThreadStats(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread) {
            return null;
        }
        const messages = this.messages.get(threadId) || [];
        const agentMessageCounts = {};
        for (const message of messages) {
            agentMessageCounts[message.agentId] = (agentMessageCounts[message.agentId] || 0) + 1;
        }
        return {
            threadId,
            messageCount: messages.length,
            participantCount: thread.participants.size,
            lastMessageAt: messages.length > 0 ? messages[messages.length - 1].timestamp : undefined,
            agentMessageCounts,
        };
    }
    /**
     * Get all active threads
     */
    getActiveThreads() {
        return Array.from(this.threads.values()).filter((t) => t.status === 'active');
    }
    /**
     * Search threads by name or topic
     */
    searchThreads(query, groupId) {
        const threads = groupId
            ? this.getGroupThreads(groupId)
            : Array.from(this.threads.values());
        const lowerQuery = query.toLowerCase();
        return threads.filter((t) => t.name.toLowerCase().includes(lowerQuery) ||
            t.topic.toLowerCase().includes(lowerQuery));
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Parse @mentions from message content
     * Supports formats: @agentId, @agent-name, @"agent name with spaces"
     */
    parseMentions(content) {
        const mentions = [];
        // Match @agentId, @agent-name, or @"agent name"
        const mentionRegex = /@([a-zA-Z0-9_-]+|"[^"]+")/g;
        let match;
        while ((match = mentionRegex.exec(content)) !== null) {
            let mention = match[1];
            // Remove quotes if present
            if (mention.startsWith('"') && mention.endsWith('"')) {
                mention = mention.slice(1, -1);
            }
            mentions.push(mention);
        }
        return mentions;
    }
    /**
     * Format message content with mention highlighting
     */
    formatMentions(content, highlightFormat) {
        return content.replace(/@([a-zA-Z0-9_-]+|"[^"]+")/g, (match, mention) => {
            let cleanMention = mention;
            if (cleanMention.startsWith('"') && cleanMention.endsWith('"')) {
                cleanMention = cleanMention.slice(1, -1);
            }
            return highlightFormat(cleanMention);
        });
    }
    /**
     * Get thread count for a group
     */
    getThreadCount(groupId) {
        return this.groupThreads.get(groupId)?.size || 0;
    }
    /**
     * Get total message count for a group
     */
    getGroupMessageCount(groupId) {
        const threadIds = this.groupThreads.get(groupId);
        if (!threadIds) {
            return 0;
        }
        let count = 0;
        for (const threadId of threadIds) {
            count += this.messages.get(threadId)?.length || 0;
        }
        return count;
    }
    /**
     * Reset all data (for testing)
     */
    reset() {
        this.threads.clear();
        this.messages.clear();
        this.groupThreads.clear();
        this.agentThreads.clear();
        this.messageCounter = 0;
        this.threadCounter = 0;
        logger_1.logger.info('[ThreadManager] Reset all data');
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    addAgentToThreadMapping(agentId, threadId) {
        if (!this.agentThreads.has(agentId)) {
            this.agentThreads.set(agentId, new Set());
        }
        this.agentThreads.get(agentId).add(threadId);
    }
    removeAgentFromThreadMapping(agentId, threadId) {
        const threads = this.agentThreads.get(agentId);
        if (threads) {
            threads.delete(threadId);
            if (threads.size === 0) {
                this.agentThreads.delete(agentId);
            }
        }
    }
    addSystemMessage(threadId, content) {
        this.sendMessage(threadId, 'system', content, { type: 'system' });
    }
}
exports.ThreadManager = ThreadManager;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalThreadManager = null;
function getGlobalThreadManager() {
    if (!globalThreadManager) {
        globalThreadManager = new ThreadManager();
    }
    return globalThreadManager;
}
function resetGlobalThreadManager() {
    globalThreadManager = null;
}
exports.default = ThreadManager;
//# sourceMappingURL=ThreadManager.js.map