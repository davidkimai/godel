/**
 * WebSocket Server for Dash v3
 * 
 * Real-time event streaming with authentication and topic subscriptions.
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

// Event bus for internal communication
export const wsEventBus = new EventEmitter();

interface Client {
  ws: WebSocket;
  topics: Set<string>;
  authenticated: boolean;
  lastPing: number;
}

const clients = new Map<WebSocket, Client>();
let wss: WebSocketServer | null = null;

export function startWebSocketServer(server: Server, apiKey: string): WebSocketServer {
  wss = new WebSocketServer({ 
    server,
    path: '/events'
  });

  wss.on('connection', (ws: WebSocket, req) => {
    // Extract token from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    const client: Client = {
      ws,
      topics: new Set(),
      authenticated: token === apiKey,
      lastPing: Date.now()
    };

    clients.set(ws, client);

    if (!client.authenticated) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication required. Provide ?token=API_KEY'
      }));
      ws.close(1008, 'Authentication required');
      return;
    }

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to Dash event stream'
    }));

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid JSON'
        }));
      }
    });

    ws.on('pong', () => {
      const c = clients.get(ws);
      if (c) {
        c.lastPing = Date.now();
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  // Heartbeat to detect disconnected clients
  const heartbeat = setInterval(() => {
    const now = Date.now();
    clients.forEach((client, ws) => {
      if (now - client.lastPing > 60000) {
        ws.terminate();
        clients.delete(ws);
        return;
      }
      ws.ping();
    });
  }, 30000);

  // Listen for internal events and broadcast
  wsEventBus.on('event', (event: unknown) => {
    broadcast(event);
  });

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  return wss;
}

function handleMessage(
  ws: WebSocket,
  message: { action?: string; topics?: string[]; type?: string; topic?: string }
) {
  const client = clients.get(ws);
  if (!client) return;

  const action = message.action || message.type;
  const topics = Array.isArray(message.topics)
    ? message.topics
    : (typeof message.topic === 'string' ? [message.topic] : undefined);

  switch (action) {
    case 'subscribe':
      if (topics) {
        topics.forEach(topic => client.topics.add(topic));
        ws.send(JSON.stringify({
          type: 'subscribed',
          topics: Array.from(client.topics)
        }));
      }
      break;

    case 'unsubscribe':
      if (topics) {
        topics.forEach(topic => client.topics.delete(topic));
      }
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown action: ${action}`
      }));
  }
}

function broadcast(event: any) {
  const message = JSON.stringify(event);
  
  clients.forEach((client) => {
    if (!client.authenticated) return;
    
    // Check if client is subscribed to this event's topic
    const topic = event.topic || '*';
    const isSubscribed = Array.from(client.topics).some(subscribedTopic => {
      return matchesTopic(topic, subscribedTopic);
    });

    if (isSubscribed || client.topics.has('*')) {
      client.ws.send(message);
    }
  });
}

function matchesTopic(eventTopic: string, subscribedTopic: string): boolean {
  // Wildcard matching: * matches single segment, # matches any depth
  const eventParts = eventTopic.split('.');
  const subscribedParts = subscribedTopic.split('.');

  for (let i = 0; i < subscribedParts.length; i++) {
    const part = subscribedParts[i];
    
    if (part === '#') return true; // Multi-level wildcard
    if (part === '*') continue; // Single-level wildcard
    if (part !== eventParts[i]) return false;
  }

  return eventParts.length === subscribedParts.length;
}

export function publishEvent(event: {
  id: string;
  timestamp: string;
  type: string;
  topic: string;
  payload?: unknown;
}) {
  wsEventBus.emit('event', event);
}

export function getConnectedClients(): number {
  return clients.size;
}
