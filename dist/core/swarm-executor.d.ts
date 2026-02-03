import { EventEmitter } from 'events';
export interface SwarmExecutionConfig {
    maxConcurrentSwarms: number;
    maxAgentsPerSwarm: number;
    executionTimeout: number;
    retryFailedAgents: boolean;
    retryAttempts: number;
    parallelismStrategy: 'serial' | 'parallel' | 'hybrid';
}
export interface SwarmExecutionContext {
    swarmId: string;
    config: SwarmExecutionConfig;
    startTime: Date;
    endTime?: Date;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    agentResults: Map<string, AgentExecutionResult>;
    totalCost: number;
    progress: number;
}
export interface AgentExecutionResult {
    agentId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled';
    startTime?: Date;
    endTime?: Date;
    cost: number;
    output?: string;
    error?: string;
    retries: number;
}
export interface ExecutionMetrics {
    swarmsCompleted: number;
    swarmsFailed: number;
    totalAgentsExecuted: number;
    totalCost: number;
    averageSwarmDuration: number;
    successRate: number;
}
export declare class SwarmExecutor extends EventEmitter {
    private config;
    private activeContexts;
    private executionQueue;
    private isProcessing;
    private metrics;
    constructor();
    /**
     * Execute a swarm with the specified configuration
     */
    executeSwarm(swarmId: string, agentIds: string[], options?: Partial<SwarmExecutionConfig>): Promise<SwarmExecutionContext>;
    /**
     * Cancel a running swarm
     */
    cancelSwarm(swarmId: string): Promise<boolean>;
    /**
     * Get status of active swarms
     */
    getActiveSwarms(): SwarmExecutionContext[];
    /**
     * Get execution metrics
     */
    getMetrics(): ExecutionMetrics;
    /**
     * Get queue status
     */
    getQueueStatus(): {
        queued: number;
        processing: boolean;
    };
    /**
     * Scale a running swarm (add/remove agents)
     */
    scaleSwarm(swarmId: string, targetAgentCount: number): Promise<boolean>;
    /**
     * Get execution context for a swarm
     */
    getContext(swarmId: string): SwarmExecutionContext | undefined;
    private createExecutionContext;
    private createPendingContext;
    private executeAccordingToStrategy;
    private executeSerial;
    private executeParallel;
    private executeHybrid;
    private executeAgentAsync;
    private executeAgent;
    private handleAgentFailure;
    private processQueue;
    private getDuration;
    private updateSuccessRate;
}
export declare const swarmExecutor: SwarmExecutor;
/**
 * Quick swarm execution
 */
export declare function executeSwarm(swarmId: string, agentIds: string[]): Promise<SwarmExecutionContext>;
/**
 * Get swarm execution status
 */
export declare function getSwarmStatus(swarmId: string): SwarmExecutionContext | undefined;
/**
 * Get execution metrics
 */
export declare function getExecutionMetrics(): ExecutionMetrics;
//# sourceMappingURL=swarm-executor.d.ts.map