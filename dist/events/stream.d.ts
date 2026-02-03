/**
 * Event Stream - WebSocket server for real-time event streaming
 * Handles client connections, filtering, and event broadcasting
 */
import { EventEmitter } from './emitter';
import type { MissionEvent, EventFilter as StreamFilter } from './types';
import type { Server as HttpServer } from 'http';
export declare class EventStream {
    private wss;
    private connections;
    private emitter;
    private unsubscribeCallback;
    private server;
    constructor(emitter?: EventEmitter);
    /**
     * Start WebSocket server
     */
    start(server: HttpServer): Promise<void>;
    /**
     * Stop WebSocket server
     */
    stop(): Promise<void>;
    /**
     * Handle new WebSocket connection
     */
    private handleConnection;
    /**
     * Handle message from client
     */
    private handleMessage;
    /**
     * Handle subscribe request
     */
    private handleSubscribe;
    /**
     * Handle unsubscribe request
     */
    private handleUnsubscribe;
    /**
     * Handle set filter request
     */
    private handleSetFilter;
    /**
     * Handle clear filter request
     */
    private handleClearFilter;
    /**
     * Subscribe to events from emitter
     */
    private subscribeToEvents;
    /**
     * Broadcast event to all matching connections
     */
    private broadcastEvent;
    /**
     * Check if event matches connection filters
     */
    private matchesFilters;
    /**
     * Send message to connection
     */
    private sendToConnection;
    /**
     * Close connection
     */
    private closeConnection;
    /**
     * Generate unique connection ID
     */
    private generateConnectionId;
    /**
     * Compare filters for equality
     */
    private filtersEqual;
    /**
     * Get connection statistics
     */
    getStats(): {
        totalConnections: number;
        connections: {
            id: string;
            filters: number;
            connectedAt: Date;
        }[];
    };
    /**
     * Broadcast to all connections (for system messages)
     */
    broadcast(data: unknown): void;
}
export declare function stream(emitter: EventEmitter, filter?: StreamFilter, onEvent?: (_event: MissionEvent) => void): Promise<{
    unsubscribe: () => void;
    events: MissionEvent[];
}>;
//# sourceMappingURL=stream.d.ts.map