"use strict";
/**
 * Event Replay - Historical event replay system
 * Provides replay functionality for debugging and auditing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventReplay = void 0;
exports.createReplay = createReplay;
const emitter_1 = require("./emitter");
const logger_1 = require("../utils/logger");
/**
 * Helper function to safely get field values from MissionEvent
 * for CSV export with dynamic field access
 */
function getEventFieldValue(event, field) {
    switch (field) {
        case 'id':
            return event.id;
        case 'timestamp':
            return event.timestamp;
        case 'eventType':
            return event.eventType;
        case 'source':
            return JSON.stringify(event.source);
        case 'correlationId':
            return event.correlationId;
        default:
            // For payload fields, check if they exist
            if ('payload' in event && typeof event.payload === 'object' && event.payload !== null) {
                return event.payload[field];
            }
            return undefined;
    }
}
class EventReplay {
    constructor(emitter) {
        this.replayHistory = [];
        this.activeSessions = new Map();
        this.maxHistorySize = 100000;
        this.emitter = emitter || new emitter_1.EventEmitter();
    }
    /**
     * Replay historical events since a given time
     */
    replay(since, options) {
        const sessionId = this.generateSessionId();
        // Build filter from options
        const filter = {
            since,
            until: options?.until,
            agentIds: options?.agentId ? [options.agentId] : undefined,
            taskIds: options?.taskId ? [options.taskId] : undefined,
            eventTypes: options?.eventTypes,
            ...options?.filter,
        };
        // Get events from history
        const events = this.emitter.getHistory(filter);
        const session = {
            id: sessionId,
            since,
            until: options?.until,
            agentId: options?.agentId,
            eventTypes: options?.eventTypes,
            events,
            replaySpeed: options?.speed || 1,
            startedAt: new Date(),
        };
        this.activeSessions.set(sessionId, session);
        return session;
    }
    /**
     * Replay events with real-time delivery to callback
     */
    async replayWithCallback(since, callback, options) {
        const session = this.replay(since, options);
        const speed = options?.speed || 1;
        const interval = options?.interval || (1000 / speed); // Default: 1 second per event at 1x speed
        for (const event of session.events) {
            await callback(event);
            // Calculate delay based on actual time difference between events
            const realDelay = options?.interval
                ? interval
                : Math.min(interval, 100); // Cap at 100ms for smooth playback
            await this.delay(realDelay);
        }
        session.completedAt = new Date();
        return session;
    }
    /**
     * Get replay session by ID
     */
    getSession(sessionId) {
        return this.activeSessions.get(sessionId);
    }
    /**
     * Get all active replay sessions
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
    /**
     * Cancel a replay session
     */
    cancelSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            this.activeSessions.delete(sessionId);
            return true;
        }
        return false;
    }
    /**
     * Cancel all active sessions
     */
    cancelAllSessions() {
        this.activeSessions.clear();
    }
    /**
     * Store event in replay history
     */
    store(event) {
        this.replayHistory.push(event);
        if (this.replayHistory.length > this.maxHistorySize) {
            this.replayHistory.shift();
        }
    }
    /**
     * Get events from replay history
     */
    getHistory(options) {
        let events = [...this.replayHistory];
        // Apply filters
        if (options?.since) {
            events = events.filter((e) => e.timestamp >= options.since);
        }
        if (options?.until) {
            events = events.filter((e) => e.timestamp <= options.until);
        }
        if (options?.agentId) {
            events = events.filter((e) => e.source.agentId === options.agentId);
        }
        if (options?.eventTypes && options.eventTypes.length > 0) {
            events = events.filter((e) => options.eventTypes.includes(e.eventType));
        }
        // Apply limit
        if (options?.limit) {
            events = events.slice(-options.limit);
        }
        return events;
    }
    /**
     * Export events for external use
     */
    export(options) {
        const events = this.getHistory({ since: options?.since });
        const fields = options?.fields || ['id', 'timestamp', 'eventType', 'source', 'payload'];
        if (options?.format === 'csv') {
            return this.exportToCsv(events, fields);
        }
        return JSON.stringify(events, null, 2);
    }
    /**
     * Export events to CSV format
     */
    exportToCsv(events, fields) {
        const headers = fields.join(',');
        const rows = events.map((event) => fields
            .map((field) => {
            // Safely access dynamic fields on MissionEvent
            const value = getEventFieldValue(event, field);
            if (value === undefined || value === null) {
                return '';
            }
            if (typeof value === 'object') {
                return JSON.stringify(value).replace(/"/g, '""');
            }
            return String(value);
        })
            .join(','));
        return [headers, ...rows].join('\n');
    }
    /**
     * Get statistics about replay history
     */
    getStats() {
        const byType = {};
        const byAgent = {};
        let oldest = null;
        let newest = null;
        for (const event of this.replayHistory) {
            // Count by type
            byType[event.eventType] = (byType[event.eventType] || 0) + 1;
            // Count by agent
            if (event.source.agentId) {
                byAgent[event.source.agentId] = (byAgent[event.source.agentId] || 0) + 1;
            }
            // Track time range
            if (!oldest || event.timestamp < oldest)
                oldest = event.timestamp;
            if (!newest || event.timestamp > newest)
                newest = event.timestamp;
        }
        return {
            totalEvents: this.replayHistory.length,
            byType,
            byAgent,
            timeRange: { oldest, newest },
            activeSessions: this.activeSessions.size,
        };
    }
    /**
     * Clear replay history
     */
    clearHistory() {
        this.replayHistory = [];
        this.cancelAllSessions();
    }
    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.EventReplay = EventReplay;
// Factory function for creating replay with options
function createReplay(emitter, options) {
    const replay = new EventReplay(emitter);
    if (options?.maxHistorySize) {
        // This would require modifying the class to accept this in constructor
        logger_1.logger.warn('maxHistorySize option not yet implemented');
    }
    return replay;
}
//# sourceMappingURL=replay.js.map