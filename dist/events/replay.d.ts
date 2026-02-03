/**
 * Event Replay - Historical event replay system
 * Provides replay functionality for debugging and auditing
 */
import { EventEmitter } from './emitter';
import type { MissionEvent, EventFilter, EventType } from './types';
interface ReplaySession {
    id: string;
    since: Date;
    until?: Date;
    agentId?: string;
    eventTypes?: EventType[];
    events: MissionEvent[];
    replaySpeed: number;
    startedAt: Date;
    completedAt?: Date;
}
export declare class EventReplay {
    private emitter;
    private replayHistory;
    private activeSessions;
    private readonly maxHistorySize;
    constructor(emitter?: EventEmitter);
    /**
     * Replay historical events since a given time
     */
    replay(since: Date, options?: {
        until?: Date;
        agentId?: string;
        taskId?: string;
        eventTypes?: EventType[];
        filter?: EventFilter;
        speed?: number;
    }): ReplaySession;
    /**
     * Replay events with real-time delivery to callback
     */
    replayWithCallback(since: Date, callback: (_event: MissionEvent) => void | Promise<void>, options?: {
        until?: Date;
        agentId?: string;
        eventTypes?: EventType[];
        speed?: number;
        interval?: number;
    }): Promise<ReplaySession>;
    /**
     * Get replay session by ID
     */
    getSession(sessionId: string): ReplaySession | undefined;
    /**
     * Get all active replay sessions
     */
    getActiveSessions(): ReplaySession[];
    /**
     * Cancel a replay session
     */
    cancelSession(sessionId: string): boolean;
    /**
     * Cancel all active sessions
     */
    cancelAllSessions(): void;
    /**
     * Store event in replay history
     */
    store(event: MissionEvent): void;
    /**
     * Get events from replay history
     */
    getHistory(options?: {
        since?: Date;
        until?: Date;
        agentId?: string;
        eventTypes?: EventType[];
        limit?: number;
    }): MissionEvent[];
    /**
     * Export events for external use
     */
    export(options?: {
        since?: Date;
        format?: 'json' | 'csv';
        fields?: string[];
    }): string;
    /**
     * Export events to CSV format
     */
    private exportToCsv;
    /**
     * Get statistics about replay history
     */
    getStats(): {
        totalEvents: number;
        byType: {
            [key: string]: number;
        };
        byAgent: {
            [key: string]: number;
        };
        timeRange: {
            oldest: Date | null;
            newest: Date | null;
        };
        activeSessions: number;
    };
    /**
     * Clear replay history
     */
    clearHistory(): void;
    /**
     * Generate unique session ID
     */
    private generateSessionId;
    /**
     * Delay helper
     */
    private delay;
}
export declare function createReplay(emitter?: EventEmitter, options?: {
    maxHistorySize?: number;
}): EventReplay;
export {};
//# sourceMappingURL=replay.d.ts.map