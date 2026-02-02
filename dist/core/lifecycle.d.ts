/**
 * Agent Lifecycle Manager - SPEC_v2.md Section 2.2
 *
 * Manages agent lifecycle states, auto-recovery, and transitions.
 * States: IDLE → SPAWNING → RUNNING → COMPLETED
 *                    ↓
 *              PAUSED ↔ RETRYING
 *                    ↓
 *                 FAILED
 *                    ↓
 *               ESCALATED
 *
 * RACE CONDITION FIXES v3:
 * - Mutex protection for state transitions (one mutex per agent)
 * - Prevents concurrent state changes (e.g., IDLE → RUNNING and IDLE → PAUSED)
 * - Ensures atomic state changes
 * - Uses async-mutex library for exclusive access
 */
import { EventEmitter } from 'events';
import { AgentStatus, type Agent, type CreateAgentOptions } from '../models/agent';
import { AgentStorage } from '../storage/memory';
import { MessageBus } from '../bus/index';
import { OpenClawIntegration } from './openclaw';
export type LifecycleState = 'idle' | 'spawning' | 'running' | 'paused' | 'retrying' | 'completed' | 'failed' | 'escalated' | 'killed';
export interface AgentState {
    id: string;
    status: AgentStatus;
    lifecycleState: LifecycleState;
    agent: Agent;
    sessionId?: string;
    retryCount: number;
    maxRetries: number;
    lastError?: string;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    pausedAt?: Date;
    resumedAt?: Date;
}
export interface RetryOptions {
    delay?: number;
    maxRetries?: number;
    useAlternateModel?: boolean;
    alternateModel?: string;
}
export interface SpawnOptions extends CreateAgentOptions {
    autoStart?: boolean;
}
export interface LifecycleMetrics {
    totalSpawned: number;
    totalCompleted: number;
    totalFailed: number;
    totalKilled: number;
    activeAgents: number;
    pausedAgents: number;
}
export declare class AgentLifecycle extends EventEmitter {
    private states;
    private storage;
    private messageBus;
    private openclaw?;
    private active;
    private retryDelays;
    private readonly DEFAULT_MAX_RETRIES;
    private readonly BASE_RETRY_DELAY;
    private mutexes;
    private creationMutex;
    constructor(storage: AgentStorage, messageBus: MessageBus, openclaw?: OpenClawIntegration);
    /**
     * RACE CONDITION FIX: Get or create a mutex for a specific agent
     */
    private getMutex;
    /**
     * RACE CONDITION FIX: Clean up mutex for terminated agent
     */
    private cleanupMutex;
    /**
     * RACE CONDITION FIX: Execute state transition with exclusive lock
     * Ensures atomic state changes and prevents race conditions
     */
    private withAgentLock;
    /**
     * Set the OpenClaw integration (for late binding)
     */
    setOpenClawIntegration(openclaw: OpenClawIntegration): void;
    /**
     * Start the lifecycle manager
     */
    start(): void;
    /**
     * Stop the lifecycle manager
     */
    stop(): void;
    /**
     * Spawn a new agent
     * RACE CONDITION FIX: Protected by creationMutex to prevent ID collisions
     */
    spawn(options: SpawnOptions): Promise<Agent>;
    /**
     * Start an agent (transition from pending to running)
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    startAgent(agentId: string): Promise<void>;
    /**
     * Pause an agent
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    pause(agentId: string): Promise<void>;
    /**
     * Resume a paused agent
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    resume(agentId: string): Promise<void>;
    /**
     * Kill an agent
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    kill(agentId: string, force?: boolean): Promise<void>;
    /**
     * Mark an agent as completed
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    complete(agentId: string, output?: string): Promise<void>;
    /**
     * Mark an agent as failed with auto-retry logic
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    fail(agentId: string, error: string, options?: RetryOptions): Promise<void>;
    /**
     * Retry a failed agent
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    retry(agentId: string, options?: RetryOptions): Promise<void>;
    /**
     * Internal retry logic (must be called inside agent lock)
     */
    private retryInternal;
    /**
     * Retry with an alternate model (escalation)
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    retryWithAlternateModel(agentId: string, alternateModel: string): Promise<void>;
    /**
     * Internal retry with alternate model logic (must be called inside agent lock)
     */
    private retryWithAlternateModelInternal;
    /**
     * Get agent state
     */
    getState(agentId: string): AgentState | null;
    /**
     * Get all agent states
     */
    getAllStates(): AgentState[];
    /**
     * Get agents by status
     */
    getAgentsByStatus(status: AgentStatus): AgentState[];
    /**
     * Get agents by swarm
     */
    getAgentsBySwarm(swarmId: string): AgentState[];
    /**
     * Get lifecycle metrics
     */
    getMetrics(): LifecycleMetrics;
    /**
     * Clean up completed/failed agents older than a threshold
     */
    cleanup(maxAgeMs?: number): number;
    /**
     * Mark an agent as failed (public method with mutex protection)
     */
    markFailed(agentId: string, error: string): Promise<void>;
    /**
     * Internal mark failed logic (must be called inside agent lock)
     */
    private markFailedInternal;
    private calculateRetryDelay;
    private delay;
    private publishAgentEvent;
}
export declare function getGlobalLifecycle(storage?: AgentStorage, messageBus?: MessageBus, openclaw?: OpenClawIntegration): AgentLifecycle;
export declare function resetGlobalLifecycle(): void;
export default AgentLifecycle;
//# sourceMappingURL=lifecycle.d.ts.map