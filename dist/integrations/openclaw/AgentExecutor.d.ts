/**
 * OpenClaw Agent Executor
 *
 * Manages agent lifecycle (spawning → idle → running → completed)
 * Handles task dispatch, result capture, timeout, and auto-retry
 *
 * @module integrations/openclaw/AgentExecutor
 */
import { EventEmitter } from 'events';
import { SessionManager, SessionsSpawnParams } from './SessionManager';
export interface AgentExecution {
    sessionKey: string;
    sessionId: string;
    status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed' | 'killed';
    runId?: string;
    model: string;
    task: string;
    startedAt: Date;
    completedAt?: Date;
    results: AgentResult[];
    error?: string;
    retryCount: number;
}
export interface AgentResult {
    tool: string;
    input: unknown;
    output: unknown;
    duration: number;
    success: boolean;
    error?: string;
    timestamp: Date;
}
export interface TaskDispatchOptions {
    task: string;
    model?: string;
    timeout?: number;
    maxRetries?: number;
    systemPrompt?: string;
    skills?: string[];
    sandbox?: SessionsSpawnParams['sandbox'];
    thinking?: SessionsSpawnParams['thinking'];
    onProgress?: (execution: AgentExecution) => void;
    onResult?: (result: AgentResult) => void;
}
export interface ExecutorConfig {
    defaultTimeout: number;
    maxRetries: number;
    retryDelayMs: number;
    pollIntervalMs: number;
    autoCleanup: boolean;
    cleanupAfterMs: number;
}
export declare class AgentExecutor extends EventEmitter {
    private sessionManager;
    private config;
    private executions;
    private executionTimeouts;
    constructor(sessionManager: SessionManager, config?: Partial<ExecutorConfig>);
    /**
     * Spawn a new agent and return execution handle
     * Lifecycle: spawning → idle
     */
    spawnAgent(options: TaskDispatchOptions): Promise<AgentExecution>;
    /**
     * Dispatch a task to an existing agent
     * Lifecycle: idle → running → completed/failed
     */
    dispatchTask(sessionKey: string, task: string, options?: Partial<TaskDispatchOptions>): Promise<AgentExecution>;
    /**
     * Spawn and execute in one call
     * Full lifecycle: spawning → idle → running → completed/failed
     */
    execute(options: TaskDispatchOptions): Promise<AgentExecution>;
    /**
     * Kill an agent
     */
    killAgent(sessionKey: string): Promise<void>;
    /**
     * Get execution status
     */
    getExecution(sessionKey: string): AgentExecution | undefined;
    /**
     * Get all executions
     */
    getAllExecutions(): AgentExecution[];
    /**
     * Get executions by status
     */
    getExecutionsByStatus(status: AgentExecution['status']): AgentExecution[];
    /**
     * Capture results from session history
     */
    captureResults(sessionKey: string): Promise<AgentResult[]>;
    /**
     * Extract tool results from session history
     */
    private extractResultsFromHistory;
    /**
     * Get the final response from an agent
     */
    getFinalResponse(sessionKey: string): Promise<string | undefined>;
    private setupTimeout;
    private handleTimeout;
    private handleSessionSpawned;
    private handleSessionSent;
    private handleSessionKilled;
    private handleSessionEvent;
    private clearTimeout;
    private waitForStatus;
    private waitForCompletion;
    private cleanupExecutions;
    private sleep;
}
export declare function createAgentExecutor(sessionManager: SessionManager, config?: Partial<ExecutorConfig>): AgentExecutor;
export default AgentExecutor;
//# sourceMappingURL=AgentExecutor.d.ts.map