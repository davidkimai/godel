/**
 * Team Juliet - WebSocket Tests: websocket.ts
 * 
 * Tests for WebSocket connection handling:
 * - WebSocket connection establishment
 * - Authentication
 * - Message routing
 * - Topic subscriptions
 * - Error recovery
 * 
 * Note: These tests verify the module exports and basic functionality.
 * Full WebSocket integration tests require running server.
 * 
 * @coverage Module structure and exports
 */

import { jest, describe, it, expect } from '@jest/globals';
import {
  startWebSocketServer,
  publishEvent,
  getConnectedClients,
  wsEventBus,
} from '../../src/api/websocket';

describe('Team Juliet - WebSocket Module', () => {
  it('should export startWebSocketServer function', () => {
    expect(typeof startWebSocketServer).toBe('function');
  });

  it('should export publishEvent function', () => {
    expect(typeof publishEvent).toBe('function');
  });

  it('should export getConnectedClients function', () => {
    expect(typeof getConnectedClients).toBe('function');
  });

  it('should export wsEventBus', () => {
    expect(wsEventBus).toBeDefined();
    expect(typeof wsEventBus.on).toBe('function');
    expect(typeof wsEventBus.emit).toBe('function');
  });

  it('should return 0 connected clients initially', () => {
    expect(getConnectedClients()).toBe(0);
  });

  it('should emit event through wsEventBus', (done) => {
    const testEvent = {
      id: 'test-1',
      timestamp: new Date().toISOString(),
      type: 'test',
      topic: 'test.topic',
    };

    wsEventBus.once('event', (event: any) => {
      expect(event.id).toBe('test-1');
      done();
    });

    publishEvent(testEvent);
  });
});
