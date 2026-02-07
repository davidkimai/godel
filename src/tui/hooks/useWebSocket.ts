/**
 * WebSocket Hook for TUI Real-time Updates
 * 
 * Provides real-time data streaming for TUI components.
 * Handles connection management, reconnection, and data caching.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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

/**
 * Main WebSocket hook for TUI
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = 'ws://localhost:7373',
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

  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionsRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectingRef = useRef(false);

  // Connect to WebSocket
  const connect = useCallback(() => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setState(prev => ({
          ...prev,
          connected: true,
          reconnecting: false,
          error: null
        }));
        reconnectAttemptsRef.current = 0;
        reconnectingRef.current = false;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Update client count if provided
          if (message.clientCount !== undefined) {
            setState(prev => ({ ...prev, clientCount: message.clientCount }));
          }

          // Notify subscribers
          const eventType = message.event || message.type;
          if (eventType) {
            const callbacks = subscriptionsRef.current.get(eventType);
            if (callbacks) {
              callbacks.forEach(callback => {
                try {
                  callback(message.data);
                } catch (err) {
                  // Ignore subscriber errors
                }
              });
            }

            // Also notify wildcard subscribers
            const wildcards = subscriptionsRef.current.get('*');
            if (wildcards) {
              wildcards.forEach(callback => {
                try {
                  callback(message);
                } catch (err) {
                  // Ignore subscriber errors
                }
              });
            }
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      ws.onerror = (error) => {
        setState(prev => ({
          ...prev,
          error: 'Connection error'
        }));
      };

      ws.onclose = () => {
        setState(prev => ({
          ...prev,
          connected: false
        }));

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts && !reconnectingRef.current) {
          reconnectingRef.current = true;
          setState(prev => ({ ...prev, reconnecting: true }));
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectingRef.current = false;
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setState(prev => ({
            ...prev,
            error: 'Max reconnection attempts reached',
            reconnecting: false
          }));
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setState(prev => ({
        ...prev,
        error: errorMessage
      }));
    }
  }, [url, reconnectInterval, maxReconnectAttempts]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    setState(prev => ({
      ...prev,
      connected: false,
      reconnecting: false
    }));
  }, []);

  // Reconnect
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    reconnectingRef.current = false;
    disconnect();
    connect();
  }, [connect, disconnect]);

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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
  }, []);

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

// ============================================================================
// Specialized Hooks for Different Data Types
// ============================================================================

interface Team {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed' | 'idle';
  agents: string[];
  createdAt: Date;
  progress: number;
}

interface Agent {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'killed';
  task: string;
  teamId: string;
  startTime?: Date;
  duration?: number;
}

export interface UseTeamDataReturn {
  teams: Team[];
  agents: Agent[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook for team monitoring data
 */
export function useTeamData(): UseTeamDataReturn {
  const [teams, setTeams] = useState<Team[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { connected, subscribe } = useWebSocket({ autoConnect: true });

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      setError('Not connected');
      return undefined;
    }

    setLoading(true);
    setError(null);

    // Subscribe to team updates
    const unsubscribeTeams = subscribe('team_update', (data) => {
      setTeams(prev => {
        const index = prev.findIndex(s => s.id === data.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
      setLoading(false);
    });

    // Subscribe to agent updates
    const unsubscribeAgents = subscribe('agent_update', (data) => {
      setAgents(prev => {
        const index = prev.findIndex(a => a.id === data.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
    });

    // Subscribe to initial data
    const unsubscribeInit = subscribe('teams_init', (data) => {
      setTeams(data.teams || []);
      setAgents(data.agents || []);
      setLoading(false);
    });

    return () => {
      unsubscribeTeams();
      unsubscribeAgents();
      unsubscribeInit();
    };
  }, [connected, subscribe, refreshTrigger]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return { teams, agents, loading, error, refresh };
}

interface Session {
  id: string;
  name: string;
  type: 'root' | 'branch' | 'leaf';
  children: string[];
  parentId?: string;
  agentId?: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'completed' | 'failed';
}

export interface UseSessionDataReturn {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook for session tree data
 */
export function useSessionData(): UseSessionDataReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { connected, subscribe } = useWebSocket({ autoConnect: true });

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      setError('Not connected');
      return undefined;
    }

    setLoading(true);
    setError(null);

    const unsubscribeSessions = subscribe('session_update', (data) => {
      setSessions(prev => {
        const index = prev.findIndex(s => s.id === data.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
      setLoading(false);
    });

    const unsubscribeInit = subscribe('sessions_init', (data) => {
      setSessions(data.sessions || []);
      setLoading(false);
    });

    return () => {
      unsubscribeSessions();
      unsubscribeInit();
    };
  }, [connected, subscribe, refreshTrigger]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return { sessions, loading, error, refresh };
}

interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  queue: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  retries: number;
  maxRetries: number;
  agentId?: string;
  error?: string;
}

interface QueueInfo {
  name: string;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  throughput: number;
  avgDuration: number;
}

interface TaskStats {
  throughput: number;
  avgDuration: number;
}

export interface UseTaskDataReturn {
  tasks: Task[];
  queues: QueueInfo[];
  stats: TaskStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook for task queue data
 */
export function useTaskData(): UseTaskDataReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queues, setQueues] = useState<QueueInfo[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { connected, subscribe } = useWebSocket({ autoConnect: true });

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      setError('Not connected');
      return undefined;
    }

    setLoading(true);
    setError(null);

    const unsubscribeTasks = subscribe('task_update', (data) => {
      setTasks(prev => {
        const index = prev.findIndex(t => t.id === data.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
    });

    const unsubscribeQueues = subscribe('queue_update', (data) => {
      setQueues(data.queues || []);
      setStats(data.stats || null);
      setLoading(false);
    });

    const unsubscribeInit = subscribe('tasks_init', (data) => {
      setTasks(data.tasks || []);
      setQueues(data.queues || []);
      setStats(data.stats || null);
      setLoading(false);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeQueues();
      unsubscribeInit();
    };
  }, [connected, subscribe, refreshTrigger]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return { tasks, queues, stats, loading, error, refresh };
}

export interface EventData {
  id: string;
  event: string;
  data: any;
  timestamp: string;
}

export interface UseEventStreamReturn {
  events: EventData[];
  connected: boolean;
  error: string | null;
  clear: () => void;
}

/**
 * Hook for real-time event streaming
 */
export function useEventStream(maxEvents: number = 1000): UseEventStreamReturn {
  const [events, setEvents] = useState<EventData[]>([]);
  const { connected, error, subscribe } = useWebSocket({ autoConnect: true });

  useEffect(() => {
    if (!connected) return undefined;

    const unsubscribe = subscribe('*', (data) => {
      setEvents(prev => {
        const newEvents = [
          {
            id: data.id || `${Date.now()}_${Math.random()}`,
            event: data.event || data.type || 'unknown',
            data: data.data || data,
            timestamp: data.timestamp || new Date().toISOString()
          },
          ...prev
        ].slice(0, maxEvents);
        return newEvents;
      });
    });

    return unsubscribe;
  }, [connected, subscribe, maxEvents]);

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, connected, error, clear };
}
