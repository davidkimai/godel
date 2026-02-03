/**
 * Event Repository with Caching
 *
 * CRUD operations for events in SQLite with LRU caching.
 */
export interface Event {
    id: string;
    timestamp: string;
    type: string;
    source?: string;
    payload?: string;
    agent_id?: string;
    swarm_id?: string;
}
export interface EventFilter {
    agentId?: string;
    swarmId?: string;
    types?: string[];
    severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
    since?: Date;
    until?: Date;
}
export declare class EventRepository {
    private cache;
    private agentCache;
    create(data: Omit<Event, 'id' | 'timestamp'>): Promise<Event>;
    findById(id: string): Promise<Event | undefined>;
    findByAgentId(agentId: string, limit?: number): Promise<Event[]>;
    findByFilter(filter: EventFilter, options?: {
        limit?: number;
    }): Promise<Event[]>;
    getStats(timeWindowHours?: number): Promise<{
        total: number;
        byType: Record<string, number>;
    }>;
    list(options?: {
        limit?: number;
        offset?: number;
    }): Promise<Event[]>;
    /**
     * Clear all caches
     */
    clearCache(): void;
    private mapRow;
}
export default EventRepository;
//# sourceMappingURL=EventRepository.d.ts.map