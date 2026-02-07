/**
 * useWebSocket Hook
 * 
 * Enhanced WebSocket hook for real-time dashboard data
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getWebSocketService, WebSocketService } from '../services/websocket';
import { WebSocketMessage, WebSocketMessageType, Agent, Swarm, AgentEvent, CostMetrics } from '../types';

type MessageHandler = (message: WebSocketMessage) => void;

interface UseWebSocketReturn {
  connected: boolean;
  reconnecting: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  send: (message: Partial<WebSocketMessage>) => void;
  subscribe: (type: WebSocketMessageType | string, handler: MessageHandler) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const serviceRef = useRef<WebSocketService>(getWebSocketService());

  useEffect(() => {
    const service = serviceRef.current;
    
    const unsubscribeConnect = service.onConnect(() => {
      setConnected(true);
      setReconnecting(false);
      setError(null);
    });
    
    const unsubscribeDisconnect = service.onDisconnect(() => {
      setConnected(false);
    });
    
    const unsubscribeError = service.onError((err) => {
      setError(err);
    });
    
    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, []);

  const connect = useCallback(() => {
    serviceRef.current.connect();
  }, []);

  const disconnect = useCallback(() => {
    serviceRef.current.disconnect();
  }, []);

  const send = useCallback((message: Partial<WebSocketMessage>) => {
    serviceRef.current.send(message);
  }, []);

  const subscribe = useCallback((type: WebSocketMessageType | string, handler: MessageHandler) => {
    return serviceRef.current.subscribe(type, handler);
  }, []);

  return {
    connected,
    reconnecting,
    error,
    connect,
    disconnect,
    send,
    subscribe
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

export function useAgentsRealtime(): { agents: Agent[]; isLoading: boolean } {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    if (!connected) return;

    const unsubscribe = subscribe(WebSocketMessageType.AGENT_UPDATE, (message) => {
      if (message.agent) {
        setAgents(prev => {
          const index = prev.findIndex(a => a.id === message.agent!.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = message.agent!;
            return updated;
          }
          return [...prev, message.agent!];
        });
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, [subscribe, connected]);

  return { agents, isLoading };
}

export function useSwarmsRealtime(): { swarms: Swarm[]; isLoading: boolean } {
  const [swarms, setSwarms] = useState<Swarm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    if (!connected) return;

    const unsubscribe = subscribe(WebSocketMessageType.SWARM_UPDATE, (message) => {
      if (message.swarm) {
        setSwarms(prev => {
          const index = prev.findIndex(s => s.id === message.swarm!.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = message.swarm!;
            return updated;
          }
          return [...prev, message.swarm!];
        });
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, [subscribe, connected]);

  return { swarms, isLoading };
}

export function useEventsRealtime(maxEvents = 100): { 
  events: AgentEvent[]; 
  isPaused: boolean; 
  togglePause: () => void;
  clearEvents: () => void;
} {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    if (!connected || isPaused) return;

    const unsubscribe = subscribe(WebSocketMessageType.EVENT, (message) => {
      if (message.event) {
        setEvents(prev => [message.event!, ...prev].slice(0, maxEvents));
      }
    });

    return unsubscribe;
  }, [subscribe, connected, isPaused, maxEvents]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isPaused, togglePause, clearEvents };
}

export function useMetricsRealtime(): { 
  metrics: CostMetrics | null;
  isLoading: boolean;
} {
  const [metrics, setMetrics] = useState<CostMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    if (!connected) return;

    const unsubscribe = subscribe(WebSocketMessageType.BUDGET_UPDATE, (message) => {
      if (message.budget) {
        setMetrics(message.budget);
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, [subscribe, connected]);

  return { metrics, isLoading };
}

export function useConnectionStatus(): {
  connected: boolean;
  latency: number;
  reconnectAttempts: number;
} {
  const [connected, setConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribeConnect = subscribe(WebSocketMessageType.CONNECTED, () => {
      setConnected(true);
      setReconnectAttempts(0);
    });

    const unsubscribeDisconnect = subscribe(WebSocketMessageType.DISCONNECTED, () => {
      setConnected(false);
    });

    const unsubscribeHeartbeat = subscribe(WebSocketMessageType.HEARTBEAT, () => {
      setLatency(Date.now());
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeHeartbeat();
    };
  }, [subscribe]);

  return { connected, latency, reconnectAttempts };
}
