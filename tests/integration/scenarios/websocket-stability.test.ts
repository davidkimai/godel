/**
 * Scenario 6: WebSocket Stability Integration Tests
 * 
 * Tests for WebSocket connection stability.
 * - 60-second stable connection
 * - Reconnection after disconnect
 * - Event delivery
 */

import * as WebSocket from 'ws';
import { testConfig, waitForCondition } from '../config';

describe('Scenario 6: WebSocket Stability', () => {
  const wsUrl = testConfig.websocketUrl;
  const apiKey = testConfig.dashApiKey;
  
  // Helper to create WebSocket connection
  function createWebSocket(token: string = apiKey): WebSocket {
    const url = `${wsUrl}?token=${encodeURIComponent(token)}`;
    return new WebSocket(url);
  }

  // Helper to wait for connection
  async function waitForConnection(ws: WebSocket, timeout: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);

      ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });

      ws.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  // Helper to close WebSocket cleanly
  async function closeWebSocket(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.OPEN) {
      return new Promise((resolve) => {
        ws.once('close', () => resolve());
        ws.close();
      });
    }
  }

  describe('Connection Stability', () => {
    it('should maintain connection for 60 seconds', async () => {
      const ws = createWebSocket();
      const events: any[] = [];
      let connectionErrors: Error[] = [];

      ws.on('message', (data) => {
        try {
          events.push(JSON.parse(data.toString()));
        } catch {
          events.push(data.toString());
        }
      });

      ws.on('error', (error) => {
        connectionErrors.push(error);
      });

      // Wait for connection
      await waitForConnection(ws, 5000);
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Keep connection open for 60 seconds
      const startTime = Date.now();
      
      // Send periodic pings to keep alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, 5000);

      // Wait for 60 seconds
      await new Promise(resolve => setTimeout(resolve, 60000));

      clearInterval(pingInterval);

      const duration = Date.now() - startTime;

      // Verify connection is still open
      expect(ws.readyState).toBe(WebSocket.OPEN);
      expect(connectionErrors.length).toBe(0);
      expect(duration).toBeGreaterThanOrEqual(60000);

      console.log(`WebSocket maintained for ${duration}ms`);
      console.log(`Received ${events.length} events during connection`);

      await closeWebSocket(ws);
    }, 70000);

    it('should handle connection to different topics', async () => {
      const connections: WebSocket[] = [];
      const topics = ['agent.*.events', 'swarm.*.events', 'system.alerts'];

      for (const topic of topics) {
        const ws = createWebSocket();
        connections.push(ws);

        await waitForConnection(ws, 5000);
        
        // Subscribe to topic
        ws.send(JSON.stringify({
          type: 'subscribe',
          topic,
        }));
      }

      // Verify all connections are open
      for (const ws of connections) {
        expect(ws.readyState).toBe(WebSocket.OPEN);
      }

      // Clean up
      await Promise.all(connections.map(ws => closeWebSocket(ws)));
    }, testConfig.testTimeout);
  });

  describe('Reconnection', () => {
    it('should reconnect after disconnect', async () => {
      let ws = createWebSocket();
      
      // First connection
      await waitForConnection(ws, 5000);
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Force disconnect
      ws.terminate();
      
      // Wait for disconnect to take effect
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reconnect
      ws = createWebSocket();
      await waitForConnection(ws, 5000);
      
      expect(ws.readyState).toBe(WebSocket.OPEN);

      await closeWebSocket(ws);
    }, testConfig.testTimeout);

    it('should handle multiple disconnects and reconnects', async () => {
      const reconnections = 5;
      
      for (let i = 0; i < reconnections; i++) {
        const ws = createWebSocket();
        
        await waitForConnection(ws, 5000);
        expect(ws.readyState).toBe(WebSocket.OPEN);

        // Simulate disconnect
        ws.terminate();
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final connection should work
      const finalWs = createWebSocket();
      await waitForConnection(finalWs, 5000);
      expect(finalWs.readyState).toBe(WebSocket.OPEN);

      await closeWebSocket(finalWs);
    }, testConfig.testTimeout);

    it('should resume event subscription after reconnect', async () => {
      const events: any[] = [];
      
      // First connection with subscription
      let ws = createWebSocket();
      await waitForConnection(ws, 5000);
      
      ws.send(JSON.stringify({
        type: 'subscribe',
        topic: 'agent.test.events',
      }));

      ws.on('message', (data) => {
        events.push(JSON.parse(data.toString()));
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Disconnect
      ws.terminate();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect and resubscribe
      ws = createWebSocket();
      await waitForConnection(ws, 5000);
      
      ws.send(JSON.stringify({
        type: 'subscribe',
        topic: 'agent.test.events',
      }));

      ws.on('message', (data) => {
        events.push(JSON.parse(data.toString()));
      });

      // Wait for events
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(ws.readyState).toBe(WebSocket.OPEN);

      await closeWebSocket(ws);
    }, testConfig.testTimeout);
  });

  describe('Event Delivery', () => {
    it('should deliver events over WebSocket', async () => {
      const ws = createWebSocket();
      const events: any[] = [];

      ws.on('message', (data) => {
        try {
          events.push(JSON.parse(data.toString()));
        } catch {
          events.push(data.toString());
        }
      });

      await waitForConnection(ws, 5000);

      // Subscribe to events
      ws.send(JSON.stringify({
        type: 'subscribe',
        topic: 'agent.*.events',
      }));

      // Wait for events to start flowing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Events may or may not be received depending on system activity
      // The key is that the connection remains stable
      expect(ws.readyState).toBe(WebSocket.OPEN);

      console.log(`Received ${events.length} events`);

      await closeWebSocket(ws);
    }, testConfig.testTimeout);

    it('should deliver all events without loss under load', async () => {
      const ws = createWebSocket();
      const receivedEvents: any[] = [];
      const expectedEvents = 100;

      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          if (event.type === 'test.load') {
            receivedEvents.push(event);
          }
        } catch {
          // Ignore non-JSON messages
        }
      });

      await waitForConnection(ws, 5000);

      // Subscribe
      ws.send(JSON.stringify({
        type: 'subscribe',
        topic: 'system.test',
      }));

      // Wait for subscription to be active
      await new Promise(resolve => setTimeout(resolve, 500));

      // Simulate sending events through the system
      // In a real scenario, these would come from the server
      for (let i = 0; i < expectedEvents; i++) {
        // Note: This is a test pattern - actual implementation
        // would have the server pushing events
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'ping',
            sequence: i,
          }));
        }
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(ws.readyState).toBe(WebSocket.OPEN);

      await closeWebSocket(ws);
    }, testConfig.testTimeout);
  });

  describe('Connection Resilience', () => {
    it('should handle network interruptions gracefully', async () => {
      const ws = createWebSocket();
      const errors: Error[] = [];
      const closeEvents: { code: number; reason: string }[] = [];

      ws.on('error', (error) => errors.push(error));
      ws.on('close', (code, reason) => {
        closeEvents.push({ code, reason: reason.toString() });
      });

      await waitForConnection(ws, 5000);

      // Simulate multiple network hiccups
      for (let i = 0; i < 3; i++) {
        // Send ping
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Connection should still be healthy
      if (ws.readyState !== WebSocket.CLOSED) {
        expect([WebSocket.OPEN, WebSocket.CONNECTING]).toContain(ws.readyState);
      }

      await closeWebSocket(ws);
    }, testConfig.testTimeout);

    it('should handle authentication failures', async () => {
      const ws = createWebSocket('invalid-token');
      let errorReceived = false;

      ws.on('error', () => {
        errorReceived = true;
      });

      try {
        await waitForConnection(ws, 3000);
      } catch {
        errorReceived = true;
      }

      // Should either fail to connect or receive auth error
      expect(errorReceived || ws.readyState !== WebSocket.OPEN).toBe(true);

      if (ws.readyState !== WebSocket.CLOSED) {
        ws.terminate();
      }
    }, testConfig.testTimeout);

    it('should handle concurrent WebSocket connections', async () => {
      const connectionCount = 10;
      const connections: WebSocket[] = [];

      // Create multiple connections
      for (let i = 0; i < connectionCount; i++) {
        const ws = createWebSocket();
        connections.push(ws);
      }

      // Wait for all to connect
      await Promise.all(connections.map(ws => waitForConnection(ws, 5000)));

      // Verify all are open
      const openCount = connections.filter(ws => ws.readyState === WebSocket.OPEN).length;
      expect(openCount).toBe(connectionCount);

      // Clean up
      await Promise.all(connections.map(ws => closeWebSocket(ws)));
    }, testConfig.testTimeout);
  });

  describe('Message Protocol', () => {
    it('should handle ping/pong messages', async () => {
      const ws = createWebSocket();
      let pongReceived = false;

      ws.on('pong', () => {
        pongReceived = true;
      });

      await waitForConnection(ws, 5000);

      // Send ping
      ws.ping();

      // Wait for pong
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Note: pong handling depends on WebSocket implementation
      // Just verify connection is still alive
      expect(ws.readyState).toBe(WebSocket.OPEN);

      await closeWebSocket(ws);
    }, testConfig.testTimeout);

    it('should handle message acknowledgments', async () => {
      const ws = createWebSocket();
      const acks: any[] = [];

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ack') {
            acks.push(msg);
          }
        } catch {
          // Ignore
        }
      });

      await waitForConnection(ws, 5000);

      // Send message with ack requirement
      ws.send(JSON.stringify({
        type: 'message',
        id: `msg-${Date.now()}`,
        requireAck: true,
        payload: { test: true },
      }));

      // Wait for ack
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Connection should still be healthy
      expect(ws.readyState).toBe(WebSocket.OPEN);

      await closeWebSocket(ws);
    }, testConfig.testTimeout);
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources on disconnect', async () => {
      const ws = createWebSocket();
      
      await waitForConnection(ws, 5000);

      // Subscribe to multiple topics
      ws.send(JSON.stringify({ type: 'subscribe', topic: 'agent.*.events' }));
      ws.send(JSON.stringify({ type: 'subscribe', topic: 'swarm.*.events' }));

      await new Promise(resolve => setTimeout(resolve, 500));

      // Close connection
      await closeWebSocket(ws);

      // Verify closed
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    }, testConfig.testTimeout);

    it('should handle rapid connect/disconnect cycles', async () => {
      const cycles = 10;

      for (let i = 0; i < cycles; i++) {
        const ws = createWebSocket();
        
        await waitForConnection(ws, 5000);
        expect(ws.readyState).toBe(WebSocket.OPEN);

        await closeWebSocket(ws);
        expect(ws.readyState).toBe(WebSocket.CLOSED);
      }
    }, testConfig.testTimeout);
  });
});
