/**
 * WebSocket Hook for Dashboard Real-time Updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketManager } from '../../events/websocket';

export interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  clientCount: number;
}

export interface UseWebSocketReturn extends WebSocketState {
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  send: (event: string, data: any) => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5
  } = options;

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    reconnecting: false,
    error: null,
    clientCount: 0
  });

  const subscriptionsRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<any>(null);

  // Connect to WebSocket
  const connect = useCallback(() => {
    try {
      wsRef.current = getWebSocketManager();

      wsRef.current.on('client_connected', (data: any) => {
        setState((prev) => ({
          ...prev,
          connected: true,
          reconnecting: false,
          clientCount: data.clientCount,
          error: null
        }));
        reconnectAttemptsRef.current = 0;
      });

      wsRef.current.on('client_disconnected', (data: any) => {
        setState((prev) => ({
          ...prev,
          clientCount: data.clientCount
        }));
      });

      wsRef.current.on('error', (error: any) => {
        setState((prev) => ({
          ...prev,
          error: error.message || 'Connection error'
        }));
      });

      // Start the WebSocket server if not already running
      wsRef.current.start().catch((error: any) => {
        setState((prev) => ({
          ...prev,
          error: error.message || 'Failed to start WebSocket'
        }));
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setState((prev) => ({
        ...prev,
        error: errorMessage
      }));
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.stop();
    }
    setState((prev) => ({
      ...prev,
      connected: false,
      reconnecting: false
    }));
  }, []);

  // Reconnect
  const reconnect = useCallback(() => {
    if (reconnectAttemptsRef.current < maxReconnectAttempts) {
      setState((prev) => ({ ...prev, reconnecting: true }));
      reconnectAttemptsRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectInterval);
    } else {
      setState((prev) => ({
        ...prev,
        error: 'Max reconnection attempts reached',
        reconnecting: false
      }));
    }
  }, [connect, reconnectInterval, maxReconnectAttempts]);

  // Subscribe to events
  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    const eventSubs = subscriptionsRef.current.get(event) || new Set();
    eventSubs.add(callback);
    subscriptionsRef.current.set(event, eventSubs);

    // Return unsubscribe function
    return () => {
      const subs = subscriptionsRef.current.get(event);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          subscriptionsRef.current.delete(event);
        }
      }
    };
  }, []);

  // Send message
  const send = useCallback((event: string, data: any) => {
    if (wsRef.current && state.connected) {
      wsRef.current.broadcast({ event, data });
    }
  }, [state.connected]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    ...state,
    subscribe,
    send,
    disconnect,
    reconnect
  };
}

/**
 * Hook for real-time agent status updates
 */
export function useAgentStatus(initialAgents: any[] = []) {
  const [agents, setAgents] = useState<any[]>(initialAgents);
  const { connected, subscribe } = useWebSocket();

  useEffect(() => {
    if (!connected) return undefined;

    const unsubscribe = subscribe('agent_update', (data: any) => {
      setAgents((prev) => {
        const index = prev.findIndex((a) => a.id === data.agent?.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = data.agent;
          return updated;
        }
        return [...prev, data.agent];
      });
    });

    return unsubscribe;
  }, [connected, subscribe]);

  return { agents, setAgents };
}

/**
 * Hook for real-time budget updates
 */
export function useBudget(initialBudget: any = null) {
  const [budget, setBudget] = useState(initialBudget);
  const { connected, subscribe } = useWebSocket();

  useEffect(() => {
    if (!connected) return undefined;

    const unsubscribe = subscribe('budget_update', (data: any) => {
      setBudget(data.budget);
    });

    return unsubscribe;
  }, [connected, subscribe]);

  return { budget, setBudget };
}

/**
 * Hook for real-time event stream
 */
export function useEventStream(maxEvents: number = 100) {
  const [events, setEvents] = useState<any[]>([]);
  const { connected, subscribe } = useWebSocket();

  useEffect(() => {
    if (!connected) return undefined;

    const unsubscribe = subscribe('*', (data: any) => {
      setEvents((prev) => {
        const newEvents = [
          {
            id: data.event + '_' + Date.now(),
            event: data.event,
            data: data.data,
            timestamp: new Date(data.timestamp)
          },
          ...prev
        ].slice(0, maxEvents);
        return newEvents;
      });
    });

    return unsubscribe;
  }, [connected, subscribe, maxEvents]);

  return { events, setEvents };
}

/**
 * Hook for team status
 */
export function useTeamStatus(initialTeam: any = null) {
  const [team, setTeam] = useState(initialTeam);
  const { connected, subscribe } = useWebSocket();

  useEffect(() => {
    if (!connected) return undefined;

    const unsubscribe = subscribe('swarm_status', (data: any) => {
      setTeam(data.team);
    });

    return unsubscribe;
  }, [connected, subscribe]);

  return { team, setTeam };
}
