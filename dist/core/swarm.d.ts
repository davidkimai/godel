/**
 * Swarm Manager - SPEC_v2.md Section 2.1
 *
 * Manages swarms of agents including creation, destruction, scaling,
 * and lifecycle management of swarms.
 *
 * RACE CONDITION FIXES v3:
 * - Mutex protection for all swarm operations (create, scale, destroy)
 * - One mutex per swarm to prevent concurrent modifications
 * - Uses async-mutex library for exclusive access
 */
import { EventEmitter } from 'events';
import { AgentLifecycle, type AgentState } from './lifecycle';
import { MessageBus } from '../bus/index';
import { AgentStorage } from '../storage/memory';
import { SwarmRepository } from '../storage';
export type SwarmStrategy = 'parallel' | 'map-reduce' | 'pipeline' | 'tree';
export interface BudgetConfig {
    amount: number;
    currency: string;
    warningThreshold?: number;
    criticalThreshold?: number;
}
export interface SafetyConfig {
    fileSandbox: boolean;
    networkAllowlist?: string[];
    commandBlacklist?: string[];
    maxExecutionTime?: number;
}
export interface SwarmConfig {
    name: string;
    task: string;
    initialAgents: number;
    maxAgents: number;
    strategy: SwarmStrategy;
    model?: string;
    budget?: BudgetConfig;
    safety?: SafetyConfig;
    metadata?: Record<string, unknown>;
}
export type SwarmState = 'creating' | 'active' | 'scaling' | 'paused' | 'completed' | 'failed' | 'destroyed';
export interface Swarm {
    id: string;
    name: string;
    status: SwarmState;
    config: SwarmConfig;
    agents: string[];
    createdAt: Date;
    completedAt?: Date;
    budget: {
        allocated: number;
        consumed: number;
        remaining: number;
    };
    metrics: {
        totalAgents: number;
        completedAgents: number;
        failedAgents: number;
    };
}
export interface SwarmStatusInfo {
    id: string;
    name: string;
    status: SwarmState;
    agentCount: number;
    budgetRemaining: number;
    progress: number;
    estimatedCompletion?: Date;
}
export type SwarmEvent = 'swarm.created' | 'swarm.scaled' | 'swarm.completed' | 'swarm.failed' | 'swarm.destroyed' | 'swarm.budget.warning' | 'swarm.budget.critical';
export declare class SwarmManager extends EventEmitter {
    private swarms;
    private agentLifecycle;
    private messageBus;
    private storage;
    private swarmRepository?;
    private active;
    private mutexes;
    private creationMutex;
    constructor(agentLifecycle: AgentLifecycle, messageBus: MessageBus, storage: AgentStorage, swarmRepository?: SwarmRepository);
    /**
     * Set the swarm repository for persistence
     */
    setSwarmRepository(repo: SwarmRepository): void;
    /**
     * RACE CONDITION FIX: Get or create a mutex for a specific swarm
     */
    private getMutex;
    /**
     * RACE CONDITION FIX: Clean up mutex for destroyed swarm
     */
    private cleanupMutex;
    /**
     * Start the swarm manager
     */
    start(): void;
    /**
     * Stop the swarm manager
     */
    stop(): void;
    /**
     * Create a new swarm
     * RACE CONDITION FIX: Protected by creationMutex to prevent ID collisions
     */
    create(config: SwarmConfig): Promise<Swarm>;
    /**
     * Destroy a swarm and all its agents
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    destroy(swarmId: string, force?: boolean): Promise<void>;
    /**
     * Scale a swarm to a target number of agents
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    scale(swarmId: string, targetSize: number): Promise<void>;
    /**
     * Get swarm status
     */
    getStatus(swarmId: string): SwarmStatusInfo;
    /**
     * Get full swarm details
     */
    getSwarm(swarmId: string): Swarm | undefined;
    /**
     * List all swarms
     */
    listSwarms(): Array<Swarm>;
    /**
     * List active (non-destroyed) swarms
     */
    listActiveSwarms(): Array<Swarm>;
    /**
     * Get agents in a swarm
     */
    getSwarmAgents(swarmId: string): AgentState[];
    /**
     * Consume budget for an agent
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    consumeBudget(swarmId: string, agentId: string, tokens: number, cost: number): Promise<void>;
    /**
     * Internal method to pause swarm (must be called inside mutex)
     */
    private pauseSwarmInternal;
    /**
     * Pause a swarm
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    pauseSwarm(swarmId: string, reason?: string): Promise<void>;
    /**
     * Resume a paused swarm
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    resumeSwarm(swarmId: string): Promise<void>;
    private initializeAgents;
    private spawnAgentForSwarm;
    private handleAgentMessage;
    private handleSwarmMessage;
    private checkSwarmCompletion;
    private splitTaskIntoStages;
}
export declare function getGlobalSwarmManager(agentLifecycle?: AgentLifecycle, messageBus?: MessageBus, storage?: AgentStorage, swarmRepository?: SwarmRepository): SwarmManager;
export declare function resetGlobalSwarmManager(): void;
export default SwarmManager;
//# sourceMappingURL=swarm.d.ts.map