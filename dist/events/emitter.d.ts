/**
 * Event Emitter - Core event emission system
 * Handles event publishing, filtering, and subscription management
 */
import type { EventType, MissionEvent, BaseEvent, EventFilter, AgentStatus, TaskStatus } from './types';
type EventListener = (_event: MissionEvent) => void;
export declare class EventEmitter {
    private listeners;
    private allListeners;
    private filteredListeners;
    private eventHistory;
    private readonly maxHistorySize;
    /**
     * Emit an event to all subscribers
     */
    emit(eventType: EventType, payload: unknown, source: BaseEvent['source'], correlationId?: string): MissionEvent;
    /**
     * Subscribe to a specific event type
     */
    subscribe(eventType: EventType, listener: EventListener): () => void;
    /**
     * Subscribe to all events
     */
    subscribeAll(listener: EventListener): () => void;
    /**
     * Subscribe to events matching a filter
     */
    subscribeFiltered(filter: EventFilter, listener: EventListener): () => void;
    /**
     * Unsubscribe from a specific event type
     */
    unsubscribe(eventType: EventType, listener?: EventListener): void;
    /**
     * Unsubscribe from all events
     */
    unsubscribeAll(): void;
    /**
     * Check if an event matches a filter
     */
    private matchesFilter;
    /**
     * Add event to history (for replay)
     */
    private addToHistory;
    /**
     * Get event history
     */
    getHistory(filter?: EventFilter): MissionEvent[];
    /**
     * Clear event history
     */
    clearHistory(): void;
    /**
     * Emit agent status change event
     */
    emitAgentStatusChange(agentId: string, previousStatus: AgentStatus, newStatus: AgentStatus, reason?: string, correlationId?: string): MissionEvent;
    /**
     * Emit agent paused event
     */
    emitAgentPaused(agentId: string, reason?: string, correlationId?: string): MissionEvent;
    /**
     * Emit agent resumed event
     */
    emitAgentResumed(agentId: string, reason?: string, correlationId?: string): MissionEvent;
    /**
     * Emit task status change event
     */
    emitTaskStatusChange(taskId: string, previousStatus: TaskStatus, newStatus: TaskStatus, assigneeId?: string, correlationId?: string): MissionEvent;
    /**
     * Get listener count for debugging
     */
    getListenerCount(): {
        [key: string]: number;
    };
}
export declare function getGlobalEmitter(): EventEmitter;
export declare function resetGlobalEmitter(): void;
export {};
//# sourceMappingURL=emitter.d.ts.map