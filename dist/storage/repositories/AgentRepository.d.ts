/**
 * Agent Repository with Caching
 *
 * CRUD operations for agents in SQLite with LRU caching.
 */
export interface Agent {
    id: string;
    label?: string;
    status: 'idle' | 'spawning' | 'running' | 'paused' | 'completed' | 'failed' | 'killing';
    model: string;
    task: string;
    spawned_at: string;
    completed_at?: string;
    runtime?: number;
    pause_time?: string;
    paused_by?: string;
    swarm_id?: string;
    parent_id?: string;
    child_ids?: string[];
    context?: Record<string, unknown>;
    code?: Record<string, unknown>;
    reasoning?: Record<string, unknown>;
    retry_count: number;
    max_retries: number;
    last_error?: string;
    budget_limit?: number;
    safety_boundaries?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
export declare class AgentRepository {
    private cache;
    private swarmCache;
    create(data: Partial<Agent>): Promise<Agent>;
    findById(id: string): Promise<Agent | undefined>;
    findBySwarmId(swarmId: string): Promise<Agent[]>;
    list(): Promise<Agent[]>;
    updateStatus(id: string, status: Agent['status']): Promise<void>;
    /**
     * Update an agent with partial data
     */
    update(id: string, data: Partial<Agent>): Promise<void>;
    /**
     * Invalidate cache entries for an agent
     */
    private invalidateAgent;
    /**
     * Clear all caches
     */
    clearCache(): void;
    private mapRow;
}
export default AgentRepository;
//# sourceMappingURL=AgentRepository.d.ts.map