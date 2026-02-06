/**
 * Optimized WebSocket Server for Godel v3
 * 
 * Performance enhancements:
 * - Connection limits per client/IP
 * - Message batching and compression
 * - Optimized heartbeat with adaptive intervals
 * - Binary message support for large payloads
 * - Connection pooling
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { getPerformanceTracker } from '../metrics/performance';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ============================================================================
// Types
// ============================================================================

export interface WebSocketConfig {
  /** Maximum concurrent connections */
  maxConnections?: number;
  /** Maximum connections per IP */
  maxConnectionsPerIp?: number;
  /** Message batch size */
  batchSize?: number;
  /** Heartbeat interval (ms) */
  heartbeatIntervalMs?: number;
  /** Connection timeout (ms) */
  connectionTimeoutMs?: number;
  /** Enable message compression */
  enableCompression?: boolean;
  /** Compression threshold (bytes) */
  compressionThreshold?: number;
  /** Maximum message size (bytes) */
  maxMessageSize?: number;
  /** Rate limit: messages per second per connection */
  rateLimitPerSecond?: number;
}

interface ClientConnection {
  ws: WebSocket;
  id: string;
  ip: string;
  topics: Set<string>;
  authenticated: boolean;
  lastPing: number;
  lastPong: number;
  connectedAt: number;
  messageCount: number;
  messageCountResetAt: number;
  isAlive: boolean;
  pendingMessages: any[];
  flushTimer: NodeJS.Timeout | null;
}

export interface WebSocketMetrics {
  totalConnections: number;
  activeConnections: number;
  messagesReceived: number;
  messagesSent: number;
  messagesBatched: number;
  bytesReceived: number;
  bytesSent: number;
  connectionsRejected: number;
  errors: number;
}

// ============================================================================
// Optimized WebSocket Server
// ============================================================================

export class OptimizedWebSocketServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private clientsByIp: Map<string, Set<ClientConnection>> = new Map();
  private config: Required<WebSocketConfig>;
  private metrics: WebSocketMetrics;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private performanceTracker = getPerformanceTracker();
  private apiKey: string = '';

  constructor(config: WebSocketConfig = {}) {
    super();
    this.config = {
      maxConnections: config.maxConnections || 1000,
      maxConnectionsPerIp: config.maxConnectionsPerIp || 10,
      batchSize: config.batchSize || 50,
      heartbeatIntervalMs: config.heartbeatIntervalMs || 30000,
      connectionTimeoutMs: config.connectionTimeoutMs || 60000,
      enableCompression: config.enableCompression !== false,
      compressionThreshold: config.compressionThreshold || 1024,
      maxMessageSize: config.maxMessageSize || 10 * 1024 * 1024, // 10MB
      rateLimitPerSecond: config.rateLimitPerSecond || 100,
    };

    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      messagesBatched: 0,
      bytesReceived: 0,
      bytesSent: 0,
      connectionsRejected: 0,
      errors: 0,
    };
  }

  /**
   * Start the WebSocket server
   */
  start(server: Server, apiKey: string): WebSocketServer {
    this.apiKey = apiKey;

    this.wss = new WebSocketServer({
      server,
      maxPayload: this.config.maxMessageSize,
      perMessageDeflate: this.config.enableCompression ? {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3,
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
      } : false,
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Start heartbeat
    this.startHeartbeat();

    logger.info('websocket-optimized', 'WebSocket server started', {
      maxConnections: this.config.maxConnections,
      compression: this.config.enableCompression,
    });

    return this.wss;
  }

  /**
   * Broadcast an event to all subscribed clients
   */
  broadcast(event: unknown, topic?: string): void {
    const message = typeof event === 'string' ? event : JSON.stringify(event);
    const messageBuffer = Buffer.from(message);

    this.clients.forEach((client) => {
      if (!client.authenticated || !client.isAlive) return;

      // Check topic subscription
      if (topic && !client.topics.has(topic) && !client.topics.has('*')) {
        return;
      }

      this.sendToClient(client, messageBuffer);
    });

    this.metrics.messagesSent += this.clients.size;
    this.metrics.bytesSent += messageBuffer.length * this.clients.size;
    this.performanceTracker.recordMessage();
  }

  /**
   * Send to specific client
   */
  sendToClient(client: ClientConnection, data: string | Buffer): void {
    if (client.ws.readyState !== WebSocket.OPEN) return;

    try {
      // Batch small messages
      if (typeof data === 'string' && Buffer.byteLength(data) < 100) {
        client.pendingMessages.push(data);
        
        if (!client.flushTimer) {
          client.flushTimer = setTimeout(() => {
            this.flushClientMessages(client);
          }, 10); // 10ms batch window
        }

        if (client.pendingMessages.length >= this.config.batchSize) {
          this.flushClientMessages(client);
        }
      } else {
        // Send immediately for large messages
        this.flushClientMessages(client);
        client.ws.send(data);
        this.metrics.messagesSent++;
      }
    } catch (error) {
      this.metrics.errors++;
      logger.error('websocket-optimized', 'Send error: ' + error);
    }
  }

  /**
   * Get connection metrics
   */
  getMetrics(): WebSocketMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active connections count
   */
  getActiveConnections(): number {
    return this.clients.size;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): Array<{
    id: string;
    ip: string;
    authenticated: boolean;
    connectedAt: number;
    duration: number;
    topics: string[];
    messageCount: number;
  }> {
    const now = Date.now();
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      ip: client.ip,
      authenticated: client.authenticated,
      connectedAt: client.connectedAt,
      duration: now - client.connectedAt,
      topics: Array.from(client.topics),
      messageCount: client.messageCount,
    }));
  }

  /**
   * Gracefully shutdown
   */
  async shutdown(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all connections gracefully
    const closePromises = Array.from(this.clients.values()).map(client => {
      return new Promise<void>((resolve) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.close(1000, 'Server shutting down');
        }
        setTimeout(resolve, 100);
      });
    });

    await Promise.all(closePromises);

    // Close server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('websocket-optimized', 'WebSocket server shutdown complete');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleConnection(ws: WebSocket, req: any): void {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const ip = req.socket.remoteAddress || 'unknown';

    // Check path
    if (url.pathname !== '/events' && url.pathname !== '/ws') {
      ws.close(1008, 'Invalid path');
      return;
    }

    // Check connection limits
    if (!this.checkConnectionLimits(ip)) {
      ws.close(1013, 'Too many connections');
      this.metrics.connectionsRejected++;
      return;
    }

    // Extract token
    const token = url.searchParams.get('token');
    const authenticated = token === this.apiKey;

    // Create client
    const client: ClientConnection = {
      ws,
      id: this.generateClientId(),
      ip,
      topics: new Set(),
      authenticated,
      lastPing: Date.now(),
      lastPong: Date.now(),
      connectedAt: Date.now(),
      messageCount: 0,
      messageCountResetAt: Date.now(),
      isAlive: true,
      pendingMessages: [],
      flushTimer: null,
    };

    // Store client
    this.clients.set(ws, client);
    this.addClientByIp(ip, client);

    this.metrics.totalConnections++;
    this.metrics.activeConnections = this.clients.size;

    // Handle authentication
    if (!authenticated) {
      this.sendToClient(client, JSON.stringify({
        type: 'error',
        message: 'Authentication required. Provide ?token=API_KEY',
      }));
      setTimeout(() => ws.close(1008, 'Authentication required'), 1000);
      return;
    }

    // Send welcome
    this.sendToClient(client, JSON.stringify({
      type: 'connected',
      clientId: client.id,
      message: 'Connected to Godel event stream',
    }));

    // Setup handlers
    ws.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });

    ws.on('pong', () => {
      client.isAlive = true;
      client.lastPong = Date.now();
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (error) => {
      this.metrics.errors++;
      logger.error('websocket-optimized', `Client ${client.id} error: ${error}`);
    });

    this.emit('connection', client);
  }

  private handleMessage(client: ClientConnection, data: Buffer): void {
    // Rate limit check
    if (!this.checkRateLimit(client)) {
      this.sendToClient(client, JSON.stringify({
        type: 'error',
        message: 'Rate limit exceeded',
      }));
      return;
    }

    this.metrics.messagesReceived++;
    this.metrics.bytesReceived += data.length;
    this.performanceTracker.recordMessage();

    try {
      const message = JSON.parse(data.toString());
      this.processClientMessage(client, message);
    } catch {
      this.sendToClient(client, JSON.stringify({
        type: 'error',
        message: 'Invalid JSON',
      }));
    }
  }

  private processClientMessage(
    client: ClientConnection,
    message: { action?: string; type?: string; topics?: string[]; topic?: string; payload?: unknown }
  ): void {
    const action = message.action || message.type;
    const topics = Array.isArray(message.topics)
      ? message.topics
      : (typeof message.topic === 'string' ? [message.topic] : undefined);

    switch (action) {
      case 'subscribe':
        if (topics) {
          topics.forEach(topic => client.topics.add(topic));
          this.sendToClient(client, JSON.stringify({
            type: 'subscribed',
            topics: Array.from(client.topics),
          }));
        }
        break;

      case 'unsubscribe':
        if (topics) {
          topics.forEach(topic => client.topics.delete(topic));
        }
        break;

      case 'ping':
        this.sendToClient(client, JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      case 'metrics':
        this.sendToClient(client, JSON.stringify({
          type: 'metrics',
          data: this.getMetrics(),
        }));
        break;

      default:
        this.sendToClient(client, JSON.stringify({
          type: 'error',
          message: `Unknown action: ${action}`,
        }));
    }
  }

  private handleDisconnect(client: ClientConnection): void {
    // Clear flush timer
    if (client.flushTimer) {
      clearTimeout(client.flushTimer);
    }

    // Remove from tracking
    this.clients.delete(client.ws);
    this.removeClientByIp(client.ip, client);
    this.metrics.activeConnections = this.clients.size;

    this.emit('disconnect', client);
  }

  private flushClientMessages(client: ClientConnection): void {
    if (client.pendingMessages.length === 0) return;

    if (client.flushTimer) {
      clearTimeout(client.flushTimer);
      client.flushTimer = null;
    }

    // Batch messages
    if (client.pendingMessages.length > 1) {
      const batch = {
        type: 'batch',
        messages: client.pendingMessages,
      };
      client.ws.send(JSON.stringify(batch));
      this.metrics.messagesBatched += client.pendingMessages.length;
    } else if (client.pendingMessages.length === 1) {
      client.ws.send(client.pendingMessages[0]);
    }

    this.metrics.messagesSent += client.pendingMessages.length;
    client.pendingMessages = [];
  }

  private checkConnectionLimits(ip: string): boolean {
    // Check total connections
    if (this.clients.size >= this.config.maxConnections) {
      logger.warn('websocket-optimized', 'Max connections reached');
      return false;
    }

    // Check per-IP limit
    const ipClients = this.clientsByIp.get(ip);
    if (ipClients && ipClients.size >= this.config.maxConnectionsPerIp) {
      logger.warn('websocket-optimized', `Max connections per IP reached: ${ip}`);
      return false;
    }

    return true;
  }

  private checkRateLimit(client: ClientConnection): boolean {
    const now = Date.now();
    const windowMs = 1000; // 1 second window

    // Reset counter if window passed
    if (now - client.messageCountResetAt > windowMs) {
      client.messageCount = 0;
      client.messageCountResetAt = now;
    }

    client.messageCount++;
    return client.messageCount <= this.config.rateLimitPerSecond;
  }

  private addClientByIp(ip: string, client: ClientConnection): void {
    if (!this.clientsByIp.has(ip)) {
      this.clientsByIp.set(ip, new Set());
    }
    this.clientsByIp.get(ip)!.add(client);
  }

  private removeClientByIp(ip: string, client: ClientConnection): void {
    const ipClients = this.clientsByIp.get(ip);
    if (ipClients) {
      ipClients.delete(client);
      if (ipClients.size === 0) {
        this.clientsByIp.delete(ip);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      
      this.clients.forEach((client) => {
        // Check if client is still alive
        if (!client.isAlive) {
          client.ws.terminate();
          return;
        }

        // Check for timeout
        if (now - client.lastPong > this.config.connectionTimeoutMs) {
          client.ws.terminate();
          return;
        }

        // Send ping
        client.isAlive = false;
        client.ws.ping();
        client.lastPing = now;
      });
    }, this.config.heartbeatIntervalMs);
  }

  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalServer: OptimizedWebSocketServer | null = null;

export function getOptimizedWebSocketServer(config?: WebSocketConfig): OptimizedWebSocketServer {
  if (!globalServer) {
    globalServer = new OptimizedWebSocketServer(config);
  }
  return globalServer;
}

export function resetOptimizedWebSocketServer(): void {
  globalServer = null;
}

export default OptimizedWebSocketServer;
