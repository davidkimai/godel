/**
 * WebSocket Hook for Dashboard Real-time Updates
 */
interface UseWebSocketOptions {
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
interface UseWebSocketReturn extends WebSocketState {
    subscribe: (event: string, callback: (data: any) => void) => () => void;
    send: (event: string, data: any) => void;
    disconnect: () => void;
    reconnect: () => void;
}
export declare function useWebSocket(options?: UseWebSocketOptions): UseWebSocketReturn;
/**
 * Hook for real-time agent status updates
 */
export declare function useAgentStatus(initialAgents?: any[]): {
    agents: any[];
    setAgents: import("react").Dispatch<import("react").SetStateAction<any[]>>;
};
/**
 * Hook for real-time budget updates
 */
export declare function useBudget(initialBudget?: any): {
    budget: any;
    setBudget: import("react").Dispatch<any>;
};
/**
 * Hook for real-time event stream
 */
export declare function useEventStream(maxEvents?: number): {
    events: any[];
    setEvents: import("react").Dispatch<import("react").SetStateAction<any[]>>;
};
/**
 * Hook for swarm status
 */
export declare function useSwarmStatus(initialSwarm?: any): {
    swarm: any;
    setSwarm: import("react").Dispatch<any>;
};
export {};
//# sourceMappingURL=useWebSocket.d.ts.map