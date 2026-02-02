/**
 * Thread Manager
 *
 * Manages conversation threads for group chat coordination.
 * Provides thread creation, lifecycle management, message threading,
 * and history preservation per thread.
 *
 * @module ThreadManager
 */
import { EventEmitter } from 'events';
export interface Thread {
    /** Unique thread ID */
    id: string;
    /** Thread name/title */
    name: string;
    /** Parent group ID this thread belongs to */
    groupId: string;
    /** Agents participating in this thread */
    participants: Set<string>;
    /** Thread creation timestamp */
    createdAt: Date;
    /** Last activity timestamp */
    lastActivityAt: Date;
    /** Thread status */
    status: 'active' | 'archived' | 'locked';
    /** Thread topic/task description */
    topic: string;
    /** Thread metadata */
    metadata: Record<string, unknown>;
    /** Parent thread ID for nested threads */
    parentThreadId?: string;
    /** Child thread IDs */
    childThreadIds: Set<string>;
}
export interface ThreadMessage {
    /** Unique message ID */
    id: string;
    /** Thread ID this message belongs to */
    threadId: string;
    /** Agent ID who sent the message */
    agentId: string;
    /** Message content */
    content: string;
    /** Timestamp */
    timestamp: Date;
    /** Message type */
    type: 'text' | 'mention' | 'command' | 'system';
    /** Referenced agent IDs (for @mentions) */
    mentions?: string[];
    /** Reply to message ID */
    replyTo?: string;
    /** Message metadata */
    metadata?: Record<string, unknown>;
}
export interface ThreadCreateOptions {
    /** Thread name */
    name: string;
    /** Group ID */
    groupId: string;
    /** Initial participants */
    participants?: string[];
    /** Thread topic/task */
    topic?: string;
    /** Parent thread for nested threads */
    parentThreadId?: string;
    /** Initial metadata */
    metadata?: Record<string, unknown>;
}
export interface ThreadHistoryOptions {
    /** Thread ID */
    threadId: string;
    /** Maximum messages to return */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
    /** Filter by agent ID */
    agentId?: string;
    /** Filter by message type */
    type?: ThreadMessage['type'];
    /** Include replies */
    includeReplies?: boolean;
}
export interface ThreadStats {
    threadId: string;
    messageCount: number;
    participantCount: number;
    lastMessageAt?: Date;
    agentMessageCounts: Record<string, number>;
}
export type ThreadEvent = {
    type: 'thread.created';
    threadId: string;
    groupId: string;
} | {
    type: 'thread.archived';
    threadId: string;
    groupId: string;
} | {
    type: 'thread.locked';
    threadId: string;
    groupId: string;
} | {
    type: 'thread.unlocked';
    threadId: string;
    groupId: string;
} | {
    type: 'thread.joined';
    threadId: string;
    agentId: string;
} | {
    type: 'thread.left';
    threadId: string;
    agentId: string;
} | {
    type: 'message.sent';
    threadId: string;
    messageId: string;
    agentId: string;
} | {
    type: 'message.mentioned';
    threadId: string;
    messageId: string;
    mentionedAgentId: string;
};
export declare class ThreadManager extends EventEmitter {
    private threads;
    private messages;
    private groupThreads;
    private agentThreads;
    private messageCounter;
    private threadCounter;
    /**
     * Create a new thread
     */
    createThread(options: ThreadCreateOptions): Thread;
    /**
     * Get a thread by ID
     */
    getThread(threadId: string): Thread | undefined;
    /**
     * Archive a thread (preserves history but no new messages)
     */
    archiveThread(threadId: string): boolean;
    /**
     * Lock a thread (prevents new messages but preserves access)
     */
    lockThread(threadId: string): boolean;
    /**
     * Unlock a thread
     */
    unlockThread(threadId: string): boolean;
    /**
     * Delete a thread and all its messages
     */
    deleteThread(threadId: string): boolean;
    /**
     * Add an agent to a thread
     */
    addParticipant(threadId: string, agentId: string): boolean;
    /**
     * Remove an agent from a thread
     */
    removeParticipant(threadId: string, agentId: string): boolean;
    /**
     * Get all participants in a thread
     */
    getParticipants(threadId: string): string[];
    /**
     * Check if an agent is a participant in a thread
     */
    isParticipant(threadId: string, agentId: string): boolean;
    /**
     * Send a message to a thread
     */
    sendMessage(threadId: string, agentId: string, content: string, options?: {
        type?: ThreadMessage['type'];
        mentions?: string[];
        replyTo?: string;
        metadata?: Record<string, unknown>;
    }): ThreadMessage | null;
    /**
     * Send a message with @mentions parsed from content
     */
    sendMessageWithMentions(threadId: string, agentId: string, content: string, options?: {
        replyTo?: string;
        metadata?: Record<string, unknown>;
    }): ThreadMessage | null;
    /**
     * Get message history for a thread
     */
    getHistory(options: ThreadHistoryOptions): ThreadMessage[];
    /**
     * Get a specific message
     */
    getMessage(messageId: string): ThreadMessage | undefined;
    /**
     * Get the last N messages from a thread
     */
    getRecentMessages(threadId: string, limit?: number): ThreadMessage[];
    /**
     * Get all threads in a group
     */
    getGroupThreads(groupId: string): Thread[];
    /**
     * Get all threads an agent participates in
     */
    getAgentThreads(agentId: string): Thread[];
    /**
     * Get child threads of a thread
     */
    getChildThreads(threadId: string): Thread[];
    /**
     * Get thread statistics
     */
    getThreadStats(threadId: string): ThreadStats | null;
    /**
     * Get all active threads
     */
    getActiveThreads(): Thread[];
    /**
     * Search threads by name or topic
     */
    searchThreads(query: string, groupId?: string): Thread[];
    /**
     * Parse @mentions from message content
     * Supports formats: @agentId, @agent-name, @"agent name with spaces"
     */
    parseMentions(content: string): string[];
    /**
     * Format message content with mention highlighting
     */
    formatMentions(content: string, highlightFormat: (mention: string) => string): string;
    /**
     * Get thread count for a group
     */
    getThreadCount(groupId: string): number;
    /**
     * Get total message count for a group
     */
    getGroupMessageCount(groupId: string): number;
    /**
     * Reset all data (for testing)
     */
    reset(): void;
    private addAgentToThreadMapping;
    private removeAgentFromThreadMapping;
    private addSystemMessage;
}
export declare function getGlobalThreadManager(): ThreadManager;
export declare function resetGlobalThreadManager(): void;
export default ThreadManager;
//# sourceMappingURL=ThreadManager.d.ts.map