/**
 * WebSocket Server for Dash v3
 *
 * Real-time event streaming with authentication and topic subscriptions.
 */
import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
export declare const wsEventBus: EventEmitter<[never]>;
export declare function startWebSocketServer(server: Server, apiKey: string): WebSocketServer;
export declare function publishEvent(event: {
    id: string;
    timestamp: string;
    type: string;
    topic: string;
    payload?: unknown;
}): void;
export declare function getConnectedClients(): number;
//# sourceMappingURL=websocket.d.ts.map