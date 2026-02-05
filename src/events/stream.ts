/**
 * Event Stream - WebSocket server for real-time event streaming
 * Handles client connections, filtering, and event broadcasting
 */


import { logger } from '../utils/logger';
import { Server as WebSocketServer, WebSocket } from 'ws';

import { EventEmitter } from './emitter';

import type {
  EventType,
  MissionEvent,
  EventFilter as StreamFilter} from './types';
import type { Server as HttpServer } from 'http';

interface StreamConnection {
  id: string;
  ws: WebSocket;
  filters: StreamFilter[];
  lastEventId?: string;
  connectedAt: Date;
}

export class EventStream {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, StreamConnection> = new Map();
  private emitter: EventEmitter;
  private unsubscribeCallback: (() => void) | null = null;
  private server: HttpServer | null = null;

  constructor(emitter?: EventEmitter) {
    this.emitter = emitter || new EventEmitter();
  }

  /**
   * Start WebSocket server
   */
  start(server: HttpServer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = server;

      this.wss = new WebSocketServer({ server, path: '/events/stream' });

      this.wss.on('listening', () => {
        logger.info(`Event stream server started on /events/stream`);
        this.subscribeToEvents();
        resolve();
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error:', { error });
        reject(error);
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });
    });
  }

  /**
   * Stop WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all connections
      for (const connection of this.connections.values()) {
        this.closeConnection(connection.id, 1000, 'Server shutting down');
      }

      // Unsubscribe from emitter
      if (this.unsubscribeCallback) {
        this.unsubscribeCallback();
        this.unsubscribeCallback = null;
      }

      // Close WebSocket server
      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: { url?: string }): void {
    const connectionId = this.generateConnectionId();
    const connection: StreamConnection = {
      id: connectionId,
      ws,
      filters: [],
      connectedAt: new Date(),
    };

    // Parse query parameters for initial filter
    const url = new URL(req.url || '/', 'http://localhost');
    const eventTypes = url.searchParams.get('types');
    const agentIds = url.searchParams.get('agents');
    const taskIds = url.searchParams.get('tasks');

    if (eventTypes) {
      connection.filters.push({
        eventTypes: eventTypes.split(',') as EventType[],
      });
    }
    if (agentIds) {
      connection.filters.push({ agentIds: agentIds.split(',') });
    }
    if (taskIds) {
      connection.filters.push({ taskIds: taskIds.split(',') });
    }

    this.connections.set(connectionId, connection);

    // Send connection acknowledgment
    this.sendToConnection(connection, {
      type: 'connected',
      connectionId,
      timestamp: new Date(),
    });

    // Handle messages from client
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(connectionId, message);
      } catch (error) {
        logger.error('Error parsing WebSocket message:', { error });
        this.sendToConnection(connection, {
          type: 'error',
          message: 'Invalid JSON',
        });
      }
    });

    // Handle connection close
    ws.on('close', () => {
      this.connections.delete(connectionId);
      logger.info(`Connection ${connectionId} closed. Active connections: ${this.connections.size}`);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for connection ${connectionId}:`, { error });
    });

    logger.info(`New connection: ${connectionId}. Active connections: ${this.connections.size}`);
  }

  /**
   * Handle message from client
   */
  private handleMessage(connectionId: string, message: Record<string, unknown>): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    switch (message['type']) {
      case 'subscribe':
        this.handleSubscribe(connection, message as { filter?: StreamFilter });
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(connection, message as { filter?: StreamFilter });
        break;
      case 'ping':
        this.sendToConnection(connection, { type: 'pong', timestamp: new Date() });
        break;
      case 'setFilter':
        this.handleSetFilter(connection, message as { filter?: StreamFilter });
        break;
      case 'clearFilter':
        this.handleClearFilter(connection);
        break;
      default:
        this.sendToConnection(connection, {
          type: 'error',
          message: `Unknown message type: ${message['type']}`,
        });
    }
  }

  /**
   * Handle subscribe request
   */
  private handleSubscribe(connection: StreamConnection, message: { filter?: StreamFilter }): void {
    try {
      const filter = message.filter as StreamFilter;
      connection.filters.push(filter);
      this.sendToConnection(connection, {
        type: 'subscribed',
        filter,
        timestamp: new Date(),
      });
    } catch (error) {
      this.sendToConnection(connection, {
        type: 'error',
        message: 'Invalid filter format',
      });
    }
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(connection: StreamConnection, message: { filter?: StreamFilter }): void {
    const filter = message.filter as StreamFilter;
    const index = connection.filters.findIndex((f) =>
      this.filtersEqual(f, filter)
    );
    if (index !== -1) {
      connection.filters.splice(index, 1);
      this.sendToConnection(connection, {
        type: 'unsubscribed',
        filter,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle set filter request
   */
  private handleSetFilter(connection: StreamConnection, message: { filter?: StreamFilter }): void {
    try {
      connection.filters = [message.filter as StreamFilter];
      this.sendToConnection(connection, {
        type: 'filterSet',
        filter: message.filter,
        timestamp: new Date(),
      });
    } catch (error) {
      this.sendToConnection(connection, {
        type: 'error',
        message: 'Invalid filter format',
      });
    }
  }

  /**
   * Handle clear filter request
   */
  private handleClearFilter(connection: StreamConnection): void {
    connection.filters = [];
    this.sendToConnection(connection, {
      type: 'filterCleared',
      timestamp: new Date(),
    });
  }

  /**
   * Subscribe to events from emitter
   */
  private subscribeToEvents(): void {
    this.unsubscribeCallback = this.emitter.subscribeAll((event) => {
      this.broadcastEvent(event);
    });
  }

  /**
   * Broadcast event to all matching connections
   */
  private broadcastEvent(event: MissionEvent): void {
    for (const connection of this.connections.values()) {
      if (this.matchesFilters(event, connection.filters)) {
        this.sendToConnection(connection, {
          type: 'event',
          event,
        });
      }
    }
  }

  /**
   * Check if event matches connection filters
   */
  private matchesFilters(event: MissionEvent, filters: StreamFilter[]): boolean {
    if (filters.length === 0) {
      return true; // No filters means receive all
    }

    return filters.some((filter) => {
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

      return true;
    });
  }

  /**
   * Send message to connection
   */
  private sendToConnection(connection: StreamConnection, data: unknown): void {
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Close connection
   */
  private closeConnection(connectionId: string, code: number, reason: string): void {
    const connection = this.connections.get(connectionId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close(code, reason);
    }
    this.connections.delete(connectionId);
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Compare filters for equality
   */
  private filtersEqual(a: StreamFilter, b: StreamFilter): boolean {
    return (
      JSON.stringify(a.eventTypes) === JSON.stringify(b.eventTypes) &&
      JSON.stringify(a.agentIds) === JSON.stringify(b.agentIds) &&
      JSON.stringify(a.taskIds) === JSON.stringify(b.taskIds) &&
      a.since?.getTime() === b.since?.getTime() &&
      a.until?.getTime() === b.until?.getTime()
    );
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    connections: { id: string; filters: number; connectedAt: Date }[];
  } {
    return {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.values()).map((c) => ({
        id: c.id,
        filters: c.filters.length,
        connectedAt: c.connectedAt,
      })),
    };
  }

  /**
   * Broadcast to all connections (for system messages)
   */
  broadcast(data: unknown): void {
    for (const connection of this.connections.values()) {
      this.sendToConnection(connection, data);
    }
  }
}

// Streaming function for CLI/API use
export async function stream(
  emitter: EventEmitter,
  filter?: StreamFilter,
  onEvent?: (_event: MissionEvent) => void
): Promise<{ unsubscribe: () => void; events: MissionEvent[] }> {
  const events: MissionEvent[] = [];

  const unsubscribe = emitter.subscribeFiltered(filter || {}, (event) => {
    events.push(event);
    if (onEvent) {
      onEvent(event);
    }
  });

  return {
    unsubscribe,
    events,
  };
}
