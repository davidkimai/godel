"use strict";
/**
 * Event Emitter - Core event emission system
 * Handles event publishing, filtering, and subscription management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitter = void 0;
exports.getGlobalEmitter = getGlobalEmitter;
exports.resetGlobalEmitter = resetGlobalEmitter;
const types_1 = require("./types");
const logger_1 = require("../utils/logger");
class EventEmitter {
    constructor() {
        this.listeners = new Map();
        this.allListeners = new Set();
        this.filteredListeners = new Map();
        this.eventHistory = [];
        this.maxHistorySize = 10000;
    }
    /**
     * Emit an event to all subscribers
     */
    emit(eventType, payload, source, correlationId) {
        const event = {
            id: (0, types_1.generateEventId)(),
            timestamp: new Date(),
            eventType,
            source,
            correlationId,
            payload,
        };
        // Store in history
        this.addToHistory(event);
        // Emit to type-specific listeners
        const typeListeners = this.listeners.get(eventType);
        if (typeListeners) {
            for (const listener of typeListeners) {
                try {
                    listener(event);
                }
                catch (error) {
                    logger_1.logger.error(`Error in event listener for ${eventType}:`, { error });
                }
            }
        }
        // Emit to filtered listeners
        const filtered = this.filteredListeners.get(eventType);
        if (filtered) {
            for (const { filter, listener } of filtered) {
                if (this.matchesFilter(event, filter)) {
                    try {
                        listener(event);
                    }
                    catch (error) {
                        logger_1.logger.error(`Error in filtered event listener for ${eventType}:`, { error });
                    }
                }
            }
        }
        // Emit to "all" listeners
        for (const listener of this.allListeners) {
            try {
                listener(event);
            }
            catch (error) {
                logger_1.logger.error('Error in all-listener:', { error });
            }
        }
        return event;
    }
    /**
     * Subscribe to a specific event type
     */
    subscribe(eventType, listener) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(listener);
        // Return unsubscribe function
        return () => {
            this.listeners.get(eventType)?.delete(listener);
        };
    }
    /**
     * Subscribe to all events
     */
    subscribeAll(listener) {
        this.allListeners.add(listener);
        return () => {
            this.allListeners.delete(listener);
        };
    }
    /**
     * Subscribe to events matching a filter
     */
    subscribeFiltered(filter, listener) {
        if (filter.eventTypes) {
            for (const eventType of filter.eventTypes) {
                if (!this.filteredListeners.has(eventType)) {
                    this.filteredListeners.set(eventType, []);
                }
                this.filteredListeners.get(eventType).push({ filter, listener });
            }
        }
        else {
            // If no event types specified, subscribe to all with filter check
            return this.subscribeAll((event) => {
                if (this.matchesFilter(event, filter)) {
                    listener(event);
                }
            });
        }
        // Return unsubscribe function
        return () => {
            if (filter.eventTypes) {
                for (const eventType of filter.eventTypes) {
                    const filtered = this.filteredListeners.get(eventType);
                    if (filtered) {
                        const index = filtered.findIndex((f) => f.filter === filter && f.listener === listener);
                        if (index !== -1) {
                            filtered.splice(index, 1);
                        }
                    }
                }
            }
        };
    }
    /**
     * Unsubscribe from a specific event type
     */
    unsubscribe(eventType, listener) {
        if (listener) {
            this.listeners.get(eventType)?.delete(listener);
        }
        else {
            this.listeners.delete(eventType);
        }
    }
    /**
     * Unsubscribe from all events
     */
    unsubscribeAll() {
        this.listeners.clear();
        this.allListeners.clear();
        this.filteredListeners.clear();
    }
    /**
     * Check if an event matches a filter
     */
    matchesFilter(event, filter) {
        // Check event types
        if (filter.eventTypes && filter.eventTypes.length > 0) {
            if (!filter.eventTypes.includes(event.eventType)) {
                return false;
            }
        }
        // Check agent IDs
        if (filter.agentIds && filter.agentIds.length > 0) {
            const eventAgentId = event.source.agentId;
            if (!eventAgentId || !filter.agentIds.includes(eventAgentId)) {
                return false;
            }
        }
        // Check task IDs
        if (filter.taskIds && filter.taskIds.length > 0) {
            const eventTaskId = event.source.taskId;
            if (!eventTaskId || !filter.taskIds.includes(eventTaskId)) {
                return false;
            }
        }
        // Check time range
        if (filter.since && event.timestamp < filter.since) {
            return false;
        }
        if (filter.until && event.timestamp > filter.until) {
            return false;
        }
        // Check correlation ID
        if (filter.correlationId && event.correlationId !== filter.correlationId) {
            return false;
        }
        return true;
    }
    /**
     * Add event to history (for replay)
     */
    addToHistory(event) {
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }
    /**
     * Get event history
     */
    getHistory(filter) {
        if (!filter) {
            return [...this.eventHistory];
        }
        return this.eventHistory.filter((event) => this.matchesFilter(event, filter));
    }
    /**
     * Clear event history
     */
    clearHistory() {
        this.eventHistory = [];
    }
    // Convenience methods for common events
    /**
     * Emit agent status change event
     */
    emitAgentStatusChange(agentId, previousStatus, newStatus, reason, correlationId) {
        const payload = {
            agentId,
            previousStatus,
            newStatus,
            reason,
        };
        return this.emit('agent.status_changed', payload, { agentId }, correlationId);
    }
    /**
     * Emit agent paused event
     */
    emitAgentPaused(agentId, reason, correlationId) {
        const payload = {
            agentId,
            reason: reason || 'manual',
        };
        return this.emit('agent.paused', payload, { agentId }, correlationId);
    }
    /**
     * Emit agent resumed event
     */
    emitAgentResumed(agentId, reason, correlationId) {
        const payload = {
            agentId,
            reason: reason || 'manual',
        };
        return this.emit('agent.resumed', payload, { agentId }, correlationId);
    }
    /**
     * Emit task status change event
     */
    emitTaskStatusChange(taskId, previousStatus, newStatus, assigneeId, correlationId) {
        const payload = {
            taskId,
            previousStatus,
            newStatus,
            assigneeId,
        };
        return this.emit('task.status_changed', payload, { taskId }, correlationId);
    }
    /**
     * Get listener count for debugging
     */
    getListenerCount() {
        const counts = {};
        for (const [type, listeners] of this.listeners) {
            counts[type] = listeners.size;
        }
        counts['all'] = this.allListeners.size;
        return counts;
    }
}
exports.EventEmitter = EventEmitter;
// Singleton instance for global use
let globalEmitter = null;
function getGlobalEmitter() {
    if (!globalEmitter) {
        globalEmitter = new EventEmitter();
    }
    return globalEmitter;
}
function resetGlobalEmitter() {
    if (globalEmitter) {
        globalEmitter.unsubscribeAll();
        globalEmitter.clearHistory();
    }
    globalEmitter = new EventEmitter();
}
//# sourceMappingURL=emitter.js.map