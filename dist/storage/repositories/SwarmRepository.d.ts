/**
 * Swarm Repository
 *
 * CRUD operations for swarms in SQLite.
 */
export interface Swarm {
    id: string;
    name: string;
    status: 'running' | 'paused' | 'completed' | 'failed';
    config: Record<string, unknown>;
    agents: string[];
    created_at: string;
    completed_at?: string;
    budget_allocated?: number;
    budget_consumed?: number;
    budget_remaining?: number;
    metrics?: Record<string, unknown>;
}
export declare class SwarmRepository {
    create(data: Partial<Swarm>): Promise<Swarm>;
    findById(id: string): Promise<Swarm | undefined>;
    findByStatus(status: Swarm['status']): Promise<Swarm[]>;
    update(id: string, data: Partial<Swarm>): Promise<Swarm | undefined>;
    delete(id: string): Promise<boolean>;
    list(options?: {
        limit?: number;
        offset?: number;
    }): Promise<Swarm[]>;
    private mapRow;
}
//# sourceMappingURL=SwarmRepository.d.ts.map