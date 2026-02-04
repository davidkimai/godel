/**
 * WebSocket Service
 * 
 * Real-time WebSocket connection management for the Dash Dashboard
 * Uses httpOnly cookies for authentication (no localStorage).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Agent, Swarm, AgentEvent, CostMetrics, WebSocketMessage, WebSocketMessageType } from '../types';

type MessageHandler = (message: WebSocketMessage) => void;
type ConnectionHandler = () => void;
type ErrorHandler = (error: Error) => void;

interface WebSocketOptions {
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:7373/ws';

class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<WebSocketMessageType | string, Set<MessageHandler>> = new Map();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private disconnectionHandlers: Set<ConnectionHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat = Date.now();
  
  private options: Required<WebSocketOptions>;
  private isIntentionallyClosed = false;

  constructor(options: WebSocketOptions = {}) {
    this.options = {
      autoReconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      ...options
    };
  }

  // ========================================================================
  // Connection Management
  // ========================================================================

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    this.isIntentionallyClosed = false;
    
    try {
      // Use WebSocket with credentials (cookies are sent automatically)
      // The server validates the session cookie for authentication
      this.ws = new WebSocket(WS_URL);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      
      console.log('[WebSocket] Connecting...');
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.handleError(error as Error);
    }
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
    
    this.reconnectAttempts = 0;
  }

  reconnect(): void {
    this.disconnect();
    this.connect();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ========================================================================
  // Message Handling
  // ========================================================================

  private handleOpen(): void {
    console.log('[WebSocket] Connected');
    this.reconnectAttempts = 0;
    this.connectionHandlers.forEach(handler => handler());
    this.startHeartbeat();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.lastHeartbeat = Date.now();
      
      // Handle heartbeat
      if (message.type === WebSocketMessageType.HEARTBEAT) {
        return;
      }

      // Handle authentication errors
      if (message.type === 'error' && message.payload?.code === 'UNAUTHORIZED') {
        console.error('[WebSocket] Authentication failed');
        // Redirect to login on auth failure
        window.location.href = '/login';
        return;
      }
      
      // Notify type-specific handlers
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (err) {
            console.error('[WebSocket] Handler error:', err);
          }
        });
      }
      
      // Notify wildcard handlers
      const wildcardHandlers = this.messageHandlers.get('*');
      if (wildcardHandlers) {
        wildcardHandlers.forEach(handler => {
          try {
            handler(message);
          } catch (err) {
            console.error('[WebSocket] Wildcard handler error:', err);
          }
        });
      }
    } catch (error) {
      console.error('[WebSocket] Message parse error:', error);
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log(`[WebSocket] Closed: ${event.code} ${event.reason}`);
    
    this.stopHeartbeat();
    this.disconnectionHandlers.forEach(handler => handler());
    
    // Handle authentication failure (1008 = policy violation)
    if (event.code === 1008) {
      console.error('[WebSocket] Authentication failed, not reconnecting');
      window.location.href = '/login';
      return;
    }
    
    if (!this.isIntentionallyClosed && this.options.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error): void {
    console.error('[WebSocket] Error:', error);
    this.errorHandlers.forEach(handler => handler(error));
  }

  // ========================================================================
  // Reconnection Logic
  // ========================================================================

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.options.reconnectInterval * Math.min(this.reconnectAttempts, 5);
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // ========================================================================
  // Heartbeat
  // ========================================================================

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) return;
      
      // Check if we've received a message recently
      const timeSinceLastMessage = Date.now() - this.lastHeartbeat;
      if (timeSinceLastMessage > this.options.heartbeatInterval * 2) {
        console.warn('[WebSocket] Connection stale, reconnecting...');
        this.reconnect();
        return;
      }
      
      this.send({ type: WebSocketMessageType.HEARTBEAT });
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ========================================================================
  // Public API
  // ========================================================================

  send(message: Partial<WebSocketMessage>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send, not connected');
    }
  }

  subscribe(type: WebSocketMessageType | string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
    
    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(type);
        }
      }
    };
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  // Subscription helpers
  subscribeToSwarm(swarmId: string): void {
    this.send({
      type: WebSocketMessageType.SUBSCRIBE,
      payload: { swarmId }
    });
  }

  unsubscribeFromSwarm(swarmId: string): void {
    this.send({
      type: WebSocketMessageType.UNSUBSCRIBE,
      payload: { swarmId }
    });
  }

  subscribeToAgent(agentId: string): void {
    this.send({
      type: WebSocketMessageType.SUBSCRIBE,
      payload: { agentId }
    });
  }

  unsubscribeFromAgent(agentId: string): void {
    this.send({
      type: WebSocketMessageType.UNSUBSCRIBE,
      payload: { agentId }
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let wsService: WebSocketService | null = null;

export function getWebSocketService(options?: WebSocketOptions): WebSocketService {
  if (!wsService) {
    wsService = new WebSocketService(options);
  }
  return wsService;
}

export function resetWebSocketService(): void {
  if (wsService) {
    wsService.disconnect();
    wsService = null;
  }
}

// ============================================================================
// React Hook
// ============================================================================

interface UseWebSocketReturn {
  connected: boolean;
  reconnecting: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  send: (message: Partial<WebSocketMessage>) => void;
  subscribe: (type: WebSocketMessageType | string, handler: MessageHandler) => () => void;
}

export function useWebSocket(options?: WebSocketOptions): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const serviceRef = useRef<WebSocketService>(getWebSocketService(options));
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    const service = serviceRef.current;
    
    const unsubscribeConnect = service.onConnect(() => {
      setConnected(true);
      setReconnecting(false);
      setError(null);
      reconnectAttemptsRef.current = 0;
    });
    
    const unsubscribeDisconnect = service.onDisconnect(() => {
      setConnected(false);
    });
    
    const unsubscribeError = service.onError((err) => {
      setError(err);
    });
    
    // Auto-connect on mount
    if (!service.isConnected()) {
      service.connect();
    }
    
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

export function useAgentUpdates(): { agents: Agent[]; updateAgent: (agent: Agent) => void } {
  const [agents, setAgents] = useState<Agent[]>([]);
  const { subscribe } = useWebSocket();

  const updateAgent = useCallback((agent: Agent) => {
    setAgents(prev => {
      const index = prev.findIndex(a => a.id === agent.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = agent;
        return updated;
      }
      return [...prev, agent];
    });
  }, []);

  useEffect(() => {
    return subscribe(WebSocketMessageType.AGENT_UPDATE, (message) => {
      if (message.agent) {
        updateAgent(message.agent);
      }
    });
  }, [subscribe, updateAgent]);

  return { agents, updateAgent };
}

export function useSwarmUpdates(): { swarms: Swarm[]; updateSwarm: (swarm: Swarm) => void } {
  const [swarms, setSwarms] = useState<Swarm[]>([]);
  const { subscribe } = useWebSocket();

  const updateSwarm = useCallback((swarm: Swarm) => {
    setSwarms(prev => {
      const index = prev.findIndex(s => s.id === swarm.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = swarm;
        return updated;
      }
      return [...prev, swarm];
    });
  }, []);

  useEffect(() => {
    return subscribe(WebSocketMessageType.SWARM_UPDATE, (message) => {
      if (message.swarm) {
        updateSwarm(message.swarm);
      }
    });
  }, [subscribe, updateSwarm]);

  return { swarms, updateSwarm };
}

export function useCostUpdates(): CostMetrics | null {
  const [cost, setCost] = useState<CostMetrics | null>(null);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    return subscribe(WebSocketMessageType.BUDGET_UPDATE, (message) => {
      if (message.budget) {
        setCost(message.budget);
      }
    });
  }, [subscribe]);

  return cost;
}

export function useEventStream(maxEvents = 100): AgentEvent[] {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    return subscribe(WebSocketMessageType.EVENT, (message) => {
      if (message.event) {
        setEvents(prev => [message.event!, ...prev].slice(0, maxEvents));
      }
    });
  }, [subscribe, maxEvents]);

  return events;
}

export { WebSocketService };
export default WebSocketService;
