/**
 * WebSocket Integration Tests
 * 
 * Tests the Dash WebSocket API for real-time updates.
 * Requires PostgreSQL and Redis to be running.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import WebSocket from 'ws';

const WS_URL = process.env['TEST_WS_URL'] || 'ws://localhost:3001/ws';
const API_URL = process.env['TEST_API_URL'] || 'http://localhost:3001';

describe('Dash WebSocket Integration', () => {
  let ws: WebSocket | null = null;

  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(() => {
    if (ws) {
      ws.close();
    }
  });

  beforeEach(() => {
    if (ws) {
      ws.close();
      ws = null;
    }
  });

  function connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(WS_URL);
      
      socket.on('open', () => {
        resolve(socket);
      });

      socket.on('error', (error) => {
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
    });
  }

  function waitForMessage(socket: WebSocket, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, timeout);

      socket.once('message', (data) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(data.toString()));
        } catch (error) {
          resolve(data.toString());
        }
      });
    });
  }

  describe('Connection', () => {
    it('should establish WebSocket connection', async () => {
      ws = await connectWebSocket();
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    it('should receive welcome message on connection', async () => {
      ws = await connectWebSocket();
      const message = await waitForMessage(ws);
      
      expect(message.type).toBe('connected');
      expect(message).toHaveProperty('connectionId');
      expect(message).toHaveProperty('timestamp');
    });

    it('should handle multiple concurrent connections', async () => {
      const connections: WebSocket[] = [];
      
      try {
        // Create 5 concurrent connections
        for (let i = 0; i < 5; i++) {
          const conn = await connectWebSocket();
          connections.push(conn);
        }

        expect(connections).toHaveLength(5);
        connections.forEach(conn => {
          expect(conn.readyState).toBe(WebSocket.OPEN);
        });
      } finally {
        connections.forEach(conn => conn.close());
      }
    });
  });

  describe('Event Subscription', () => {
    it('should subscribe to events', async () => {
      ws = await connectWebSocket();
      
      // Wait for welcome message
      await waitForMessage(ws);

      // Subscribe to events
      ws.send(JSON.stringify({
        action: 'subscribe',
        events: ['agent.spawned', 'agent.completed'],
      }));

      const response = await waitForMessage(ws);
      expect(response.type).toBe('subscribed');
      expect(response.events).toContain('agent.spawned');
    });

    it('should receive agent events', async () => {
      ws = await connectWebSocket();
      await waitForMessage(ws); // Welcome

      // Subscribe to agent events
      ws.send(JSON.stringify({
        action: 'subscribe',
        events: ['agent.spawned'],
      }));
      await waitForMessage(ws); // Subscribed confirmation

      // Create a swarm and agent via API
      const swarmRes = await fetch(`${API_URL}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ws_test_swarm' }),
      });
      const swarm = await swarmRes.json();

      // Spawn an agent
      await fetch(`${API_URL}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swarmId: swarm.id,
          model: 'test-model',
          task: 'WebSocket test task',
        }),
      });

      // Wait for the event
      const event = await waitForMessage(ws, 10000);
      expect(event.type).toBe('agent.spawned');
      expect(event.data).toHaveProperty('agentId');
    }, 15000);
  });

  describe('Heartbeat', () => {
    it('should respond to ping with pong', async () => {
      ws = await connectWebSocket();
      await waitForMessage(ws); // Welcome

      const pingPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Pong timeout'));
        }, 3000);

        ws!.once('message', (data) => {
          clearTimeout(timeout);
          const message = JSON.parse(data.toString());
          if (message.type === 'pong') {
            resolve();
          } else {
            reject(new Error('Expected pong, got ' + message.type));
          }
        });
      });

      ws.send(JSON.stringify({ type: 'ping' }));
      await pingPromise;
    });

    it('should handle server heartbeat', async () => {
      ws = await connectWebSocket();
      
      // Listen for server heartbeat
      const heartbeatPromise = new Promise<void>((resolve) => {
        const checkMessage = (data: WebSocket.RawData) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'heartbeat') {
            ws!.off('message', checkMessage);
            resolve();
          }
        };
        ws!.on('message', checkMessage);
      });

      // Server should send heartbeat within 30 seconds
      await heartbeatPromise;
    }, 35000);
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON', async () => {
      ws = await connectWebSocket();
      await waitForMessage(ws); // Welcome

      ws.send('invalid json');

      const response = await waitForMessage(ws);
      expect(response.type).toBe('error');
      expect(response.message).toContain('Invalid JSON');
    });

    it('should handle unknown action', async () => {
      ws = await connectWebSocket();
      await waitForMessage(ws); // Welcome

      ws.send(JSON.stringify({ action: 'unknown_action' }));

      const response = await waitForMessage(ws);
      expect(response.type).toBe('error');
      expect(response.message).toContain('Unknown action');
    });

    it('should close connection on authentication failure', async () => {
      const socket = new WebSocket(WS_URL, {
        headers: { 'Authorization': 'InvalidToken' },
      });

      const closePromise = new Promise<void>((resolve) => {
        socket.on('close', (code) => {
          expect(code).toBe(1008); // Policy violation
          resolve();
        });
      });

      await closePromise;
    });
  });

  describe('Reconnection', () => {
    it('should handle reconnection with event replay', async () => {
      // First connection
      const ws1 = await connectWebSocket();
      const welcome1 = await waitForMessage(ws1);
      const connectionId = welcome1.connectionId;

      // Subscribe to events
      ws1.send(JSON.stringify({
        action: 'subscribe',
        events: ['agent.spawned'],
      }));
      await waitForMessage(ws1);

      // Disconnect
      ws1.close();

      // Wait and reconnect
      await new Promise((resolve) => setTimeout(resolve, 500));
      const ws2 = await connectWebSocket();

      // Request replay
      ws2.send(JSON.stringify({
        action: 'replay',
        connectionId,
        since: Date.now() - 60000,
      }));

      const replayResponse = await waitForMessage(ws2);
      expect(replayResponse.type).toBe('replay');

      ws2.close();
    });
  });
});
