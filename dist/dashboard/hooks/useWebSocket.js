"use strict";
/**
 * WebSocket Hook for Dashboard Real-time Updates
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useWebSocket = useWebSocket;
exports.useAgentStatus = useAgentStatus;
exports.useBudget = useBudget;
exports.useEventStream = useEventStream;
exports.useSwarmStatus = useSwarmStatus;
const react_1 = require("react");
const websocket_1 = require("../../events/websocket");
function useWebSocket(options = {}) {
    const { autoConnect = true, reconnectInterval = 5000, maxReconnectAttempts = 5 } = options;
    const [state, setState] = (0, react_1.useState)({
        connected: false,
        reconnecting: false,
        error: null,
        clientCount: 0
    });
    const subscriptionsRef = (0, react_1.useRef)(new Map());
    const reconnectAttemptsRef = (0, react_1.useRef)(0);
    const reconnectTimeoutRef = (0, react_1.useRef)(null);
    const wsRef = (0, react_1.useRef)(null);
    // Connect to WebSocket
    const connect = (0, react_1.useCallback)(() => {
        try {
            wsRef.current = (0, websocket_1.getWebSocketManager)();
            wsRef.current.on('client_connected', (data) => {
                setState((prev) => ({
                    ...prev,
                    connected: true,
                    reconnecting: false,
                    clientCount: data.clientCount,
                    error: null
                }));
                reconnectAttemptsRef.current = 0;
            });
            wsRef.current.on('client_disconnected', (data) => {
                setState((prev) => ({
                    ...prev,
                    clientCount: data.clientCount
                }));
            });
            wsRef.current.on('error', (error) => {
                setState((prev) => ({
                    ...prev,
                    error: error.message || 'Connection error'
                }));
            });
            // Start the WebSocket server if not already running
            wsRef.current.start().catch((error) => {
                setState((prev) => ({
                    ...prev,
                    error: error.message || 'Failed to start WebSocket'
                }));
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Connection failed';
            setState((prev) => ({
                ...prev,
                error: errorMessage
            }));
        }
    }, []);
    // Disconnect
    const disconnect = (0, react_1.useCallback)(() => {
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
    const reconnect = (0, react_1.useCallback)(() => {
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            setState((prev) => ({ ...prev, reconnecting: true }));
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, reconnectInterval);
        }
        else {
            setState((prev) => ({
                ...prev,
                error: 'Max reconnection attempts reached',
                reconnecting: false
            }));
        }
    }, [connect, reconnectInterval, maxReconnectAttempts]);
    // Subscribe to events
    const subscribe = (0, react_1.useCallback)((event, callback) => {
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
    const send = (0, react_1.useCallback)((event, data) => {
        if (wsRef.current && state.connected) {
            wsRef.current.broadcast({ event, data });
        }
    }, [state.connected]);
    // Auto-connect on mount
    (0, react_1.useEffect)(() => {
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
function useAgentStatus(initialAgents = []) {
    const [agents, setAgents] = (0, react_1.useState)(initialAgents);
    const { connected, subscribe } = useWebSocket();
    (0, react_1.useEffect)(() => {
        if (!connected)
            return undefined;
        const unsubscribe = subscribe('agent_update', (data) => {
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
function useBudget(initialBudget = null) {
    const [budget, setBudget] = (0, react_1.useState)(initialBudget);
    const { connected, subscribe } = useWebSocket();
    (0, react_1.useEffect)(() => {
        if (!connected)
            return undefined;
        const unsubscribe = subscribe('budget_update', (data) => {
            setBudget(data.budget);
        });
        return unsubscribe;
    }, [connected, subscribe]);
    return { budget, setBudget };
}
/**
 * Hook for real-time event stream
 */
function useEventStream(maxEvents = 100) {
    const [events, setEvents] = (0, react_1.useState)([]);
    const { connected, subscribe } = useWebSocket();
    (0, react_1.useEffect)(() => {
        if (!connected)
            return undefined;
        const unsubscribe = subscribe('*', (data) => {
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
 * Hook for swarm status
 */
function useSwarmStatus(initialSwarm = null) {
    const [swarm, setSwarm] = (0, react_1.useState)(initialSwarm);
    const { connected, subscribe } = useWebSocket();
    (0, react_1.useEffect)(() => {
        if (!connected)
            return undefined;
        const unsubscribe = subscribe('swarm_status', (data) => {
            setSwarm(data.swarm);
        });
        return unsubscribe;
    }, [connected, subscribe]);
    return { swarm, setSwarm };
}
//# sourceMappingURL=useWebSocket.js.map