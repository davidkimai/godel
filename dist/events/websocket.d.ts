/**
 * Dash WebSocket Server
 * Real-time event streaming for dashboard updates
 *
 * Port: 7374 (W-E-B-S-O-C-K-E-T on T9)
 */
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
interface ClientInfo {
    id: string;
    ws: WebSocket;
    connectedAt: Date;
    subscriptions: Set<string>;
    isAlive: boolean;
}
interface BroadcastOptions {
    event: string;
    data: any;
    filter?: (client: ClientInfo) => boolean;
}
export declare class WebSocketManager extends EventEmitter {
    private wss;
    private clients;
    private heartbeatInterval;
    private eventBus;
    private serverPort;
    private maxClients;
    constructor(options?: {
        port?: number;
        maxClients?: number;
    });
    /**
     * Start the WebSocket server
     */
    start(): Promise<void>;
    /**
     * Handle new WebSocket connection
     */
    private handleConnection;
    /**
     * Handle incoming message from client
     */
    private handleMessage;
    /**
     * Handle client subscription
     */
    private handleSubscribe;
    /**
     * Handle client unsubscription
     */
    private handleUnsubscribe;
    /**
     * Handle pong response (heartbeat)
     */
    private handlePong;
    /**
     * Handle client disconnect
     */
    private handleDisconnect;
    /**
     * Start heartbeat interval
     */
    private startHeartbeat;
    /**
     * Connect to event bus for automatic broadcasting
     */
    private connectToEventBus;
    /**
     * Broadcast event to connected clients
     */
    broadcast(options: BroadcastOptions): void;
    /**
     * Send message to specific client
     */
    sendToClient(clientId: string, event: string, data: any): boolean;
    /**
     * Broadcast to specific topic subscribers
     */
    broadcastToTopic(topic: string, data: any): void;
    /**
     * Get current client count
     */
    getClientCount(): number;
    /**
     * Get client info
     */
    getClientInfo(clientId: string): ClientInfo | undefined;
    /**
     * Get all clients
     */
    getAllClients(): ClientInfo[];
    /**
     * Generate unique client ID
     */
    private generateClientId;
    /**
     * Stop the WebSocket server
     */
    stop(): Promise<void>;
}
export declare function getWebSocketManager(): WebSocketManager;
export declare function startWebSocketServer(port?: number): Promise<WebSocketManager>;
export {};
//# sourceMappingURL=websocket.d.ts.map