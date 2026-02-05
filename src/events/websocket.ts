/**
 * Dash WebSocket Server
 * Real-time event streaming for dashboard updates
 * 
 * Port: 7374 (W-E-B-S-O-C-K-E-T on T9)
 */

import { logger } from '../utils/logger';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
// EventBus import will be added when EventBus module is implemented
// import { getEventBus } from '../events/EventBus';

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

export class WebSocketManager extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private eventBus: EventEmitter | null = null;
  private serverPort: number;
  private maxClients: number = 50;

  constructor(options: {
    port?: number;
    maxClients?: number;
  } = {}) {
    super();
    this.serverPort = options.port || 7374;
    this.maxClients = options.maxClients || 50;
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    if (this.wss) {
      throw new Error('WebSocket server already started');
    }

    // Initialize WebSocket server
    this.wss = new WebSocketServer({ 
      port: this.serverPort,
      maxPayload: 1048576 // 1MB max message
    });

    // Setup connection handlers
    if (this.wss) {
      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', (error) => {
        logger.error('events/websocket', 'WebSocket server error', { error: String(error) });
        this.emit('error', error);
      });
    }

    // Start heartbeat check
    this.startHeartbeat();

    // Connect to event bus for broadcasting
    this.connectToEventBus();

    logger.info('events/websocket', 'WebSocket server started', { port: this.serverPort });
    this.emit('started', { port: this.serverPort });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: { url?: string }): void {
    if (this.clients.size >= this.maxClients) {
      ws.close(1013, 'Server at capacity');
      return;
    }

    // Generate client ID
    const clientId = this.generateClientId();
    
    // Parse subscriptions from URL query params
    const subscriptions = new Set<string>();
    if (req.url) {
      const url = new URL(req.url, `http://localhost:${this.serverPort}`);
      const subs = url.searchParams.get('subscriptions');
      if (subs) {
        subs.split(',').forEach((sub) => subscriptions.add(sub.trim()));
      }
    }

    // Create client info
    const clientInfo: ClientInfo = {
      id: clientId,
      ws,
      connectedAt: new Date(),
      subscriptions,
      isAlive: true
    };

    this.clients.set(clientId, clientInfo);

    // Send welcome message
    this.sendToClient(clientId, 'connected', {
      clientId,
      subscriptions: Array.from(subscriptions),
      serverTime: Date.now()
    });

    // Setup client event handlers
    ws.on('pong', () => this.handlePong(clientId));
    ws.on('message', (data: Buffer) => this.handleMessage(clientId, data));
    ws.on('close', () => this.handleDisconnect(clientId));
    ws.on('error', (error) => {
      logger.error('events/websocket', 'WebSocket client error', { clientId, error: String(error) });
    });

    // Emit connection event
    this.emit('client_connected', { 
      clientId, 
      clientCount: this.clients.size 
    });

    logger.info('events/websocket', 'Client connected', { clientId, totalClients: this.clients.size });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(clientId: string, data: Buffer | ArrayBuffer): void {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);
      
      if (!client) return;

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message.topics);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message.topics);
          break;
        case 'ping':
          this.sendToClient(clientId, 'pong', { timestamp: Date.now() });
          break;
        default:
          logger.warn('events/websocket', 'Unknown message type', { clientId, type: message.type });
      }
    } catch (error) {
      logger.error('events/websocket', 'Error handling message', { clientId, error: String(error) });
    }
  }

  /**
   * Handle client subscription
   */
  private handleSubscribe(clientId: string, topics: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    topics.forEach((topic) => client.subscriptions.add(topic));
    this.sendToClient(clientId, 'subscribed', { topics });
  }

  /**
   * Handle client unsubscription
   */
  private handleUnsubscribe(clientId: string, topics: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    topics.forEach((topic) => client.subscriptions.delete(topic));
    this.sendToClient(clientId, 'unsubscribed', { topics });
  }

  /**
   * Handle pong response (heartbeat)
   */
  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.isAlive = true;
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      this.emit('client_disconnected', { 
        clientId, 
        clientCount: this.clients.size,
        duration: Date.now() - client.connectedAt.getTime()
      });
      logger.info('events/websocket', 'Client disconnected', { clientId, remainingClients: this.clients.size });
    }
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(clientId);
          this.emit('client_timed_out', { clientId });
          logger.warn('events/websocket', 'Client timed out', { clientId });
        } else {
          client.isAlive = false;
          client.ws.ping();
        }
      });
    }, 30000); // 30 second heartbeat
  }

  /**
   * Connect to event bus for automatic broadcasting
   */
  private connectToEventBus(): void {
    // EventBus integration - will be implemented when EventBus module is ready
    // try {
    //   this.eventBus = getEventBus();
    //   this.eventBus.on('*', (event: string, data: any) => {
    //     this.broadcast({ event, data });
    //   });
    //   logger.info('Connected to event bus for automatic broadcasting');
    // } catch (error) {
    //   logger.warn('events/websocket', 'Could not connect to event bus', { error: String(error) });
    // }
    logger.info('events/websocket', 'Event bus integration pending module implementation');
  }

  /**
   * Broadcast event to connected clients
   */
  broadcast(options: BroadcastOptions): void {
    const { event, data, filter } = options;
    const message = JSON.stringify({
      event,
      data,
      timestamp: Date.now()
    });

    let targetClients = Array.from(this.clients.values());

    // Apply subscription filter if specified
    if (filter) {
      targetClients = targetClients.filter(filter);
    }

    // Send to target clients
    let sentCount = 0;
    targetClients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    this.emit('broadcast', { event, clientCount: sentCount });
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, event: string, data: any): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = JSON.stringify({ event, data, timestamp: Date.now() });
    client.ws.send(message);
    return true;
  }

  /**
   * Broadcast to specific topic subscribers
   */
  broadcastToTopic(topic: string, data: any): void {
    const message = JSON.stringify({
      event: topic,
      data,
      timestamp: Date.now()
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (
        client.ws.readyState === WebSocket.OPEN &&
        client.subscriptions.has(topic)
      ) {
        client.ws.send(message);
        sentCount++;
      }
    });

    this.emit('broadcast_to_topic', { topic, clientCount: sentCount });
  }

  /**
   * Get current client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get client info
   */
  getClientInfo(clientId: string): ClientInfo | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all clients
   */
  getAllClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    this.clients.forEach((client, clientId) => {
      client.ws.close(1001, 'Server shutting down');
    });
    this.clients.clear();

    // Close server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    logger.info('events/websocket', 'WebSocket server stopped');
    this.emit('stopped');
  }
}

/**
 * Singleton instance
 */
let instance: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!instance) {
    instance = new WebSocketManager();
  }
  return instance;
}

export function startWebSocketServer(port?: number): Promise<WebSocketManager> {
  const manager = new WebSocketManager({ port });
  return manager.start().then(() => manager);
}
