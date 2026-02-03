"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmManager = void 0;
exports.getGlobalSwarmManager = getGlobalSwarmManager;
exports.resetGlobalSwarmManager = resetGlobalSwarmManager;
const events_1 = require("events");
const async_mutex_1 = require("async-mutex");
const agent_1 = require("../models/agent");
const index_1 = require("../bus/index");
const errors_1 = require("../errors");
// ============================================================================
// Swarm Manager
// ============================================================================
class SwarmManager extends events_1.EventEmitter {
    constructor(agentLifecycle, messageBus, storage, swarmRepository) {
        super();
        this.swarms = new Map();
        this.active = false;
        // RACE CONDITION FIX: One mutex per swarm for exclusive access
        this.mutexes = new Map();
        // Global mutex for swarm creation (to prevent ID collisions)
        this.creationMutex = new async_mutex_1.Mutex();
        this.agentLifecycle = agentLifecycle;
        this.messageBus = messageBus;
        this.storage = storage;
        this.swarmRepository = swarmRepository;
    }
    /**
     * Set the swarm repository for persistence
     */
    setSwarmRepository(repo) {
        this.swarmRepository = repo;
    }
    /**
     * RACE CONDITION FIX: Get or create a mutex for a specific swarm
     */
    getMutex(swarmId) {
        if (!this.mutexes.has(swarmId)) {
            this.mutexes.set(swarmId, new async_mutex_1.Mutex());
        }
        return this.mutexes.get(swarmId);
    }
    /**
     * RACE CONDITION FIX: Clean up mutex for destroyed swarm
     */
    cleanupMutex(swarmId) {
        this.mutexes.delete(swarmId);
    }
    /**
     * Start the swarm manager
     */
    start() {
        this.active = true;
        this.emit('manager.started');
    }
    /**
     * Stop the swarm manager
     */
    stop() {
        this.active = false;
        this.emit('manager.stopped');
    }
    /**
     * Create a new swarm
     * RACE CONDITION FIX: Protected by creationMutex to prevent ID collisions
     */
    async create(config) {
        return this.creationMutex.runExclusive(async () => {
            const id = `swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date();
            const swarm = {
                id,
                name: config.name,
                status: 'creating',
                config,
                agents: [],
                createdAt: now,
                budget: {
                    allocated: config.budget?.amount || 0,
                    consumed: 0,
                    remaining: config.budget?.amount || 0,
                },
                metrics: {
                    totalAgents: 0,
                    completedAgents: 0,
                    failedAgents: 0,
                },
            };
            this.swarms.set(id, swarm);
            // Create the mutex for this swarm immediately
            this.getMutex(id);
            // Subscribe to swarm broadcast topic
            this.messageBus.subscribe(index_1.MessageBus.swarmBroadcast(id), (message) => this.handleSwarmMessage(id, message));
            // Create initial agents
            await this.initializeAgents(swarm);
            swarm.status = 'active';
            this.emit('swarm.created', swarm);
            this.messageBus.publish(index_1.MessageBus.swarmBroadcast(id), {
                eventType: 'swarm.created',
                source: { orchestrator: 'swarm-manager' },
                payload: { swarmId: id, name: config.name },
            }, { priority: 'high' });
            return swarm;
        });
    }
    /**
     * Destroy a swarm and all its agents
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    async destroy(swarmId, force = false) {
        const mutex = this.getMutex(swarmId);
        await mutex.runExclusive(async () => {
            const swarm = (0, errors_1.assertExists)(this.swarms.get(swarmId), 'Swarm', swarmId, { code: errors_1.DashErrorCode.SWARM_NOT_FOUND });
            swarm.status = 'destroyed';
            // Kill all agents in the swarm
            for (const agentId of swarm.agents) {
                await (0, errors_1.safeExecute)(async () => {
                    await this.agentLifecycle.kill(agentId, force);
                }, undefined, {
                    logError: true,
                    context: `SwarmManager.destroy.${swarmId}.killAgent`
                });
            }
            swarm.agents = [];
            swarm.completedAt = new Date();
            this.emit('swarm.destroyed', swarm);
            this.messageBus.publish(index_1.MessageBus.swarmBroadcast(swarmId), {
                eventType: 'system.emergency_stop',
                source: { orchestrator: 'swarm-manager' },
                payload: { swarmId, reason: 'swarm_destroyed' },
            }, { priority: 'critical' });
            // Keep the swarm record but mark as destroyed
            this.swarms.set(swarmId, swarm);
            // Clean up the mutex
            this.cleanupMutex(swarmId);
        });
    }
    /**
     * Scale a swarm to a target number of agents
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    async scale(swarmId, targetSize) {
        const mutex = this.getMutex(swarmId);
        await mutex.runExclusive(async () => {
            const swarm = (0, errors_1.assertExists)(this.swarms.get(swarmId), 'Swarm', swarmId, { code: errors_1.DashErrorCode.SWARM_NOT_FOUND });
            if (swarm.status === 'destroyed') {
                throw new errors_1.ApplicationError(`Cannot scale destroyed swarm ${swarmId}`, errors_1.DashErrorCode.INVALID_SWARM_STATE, 400, { swarmId, currentStatus: swarm.status }, true);
            }
            const currentSize = swarm.agents.length;
            const maxAgents = swarm.config.maxAgents;
            if (targetSize > maxAgents) {
                throw new errors_1.ApplicationError(`Target size ${targetSize} exceeds max agents ${maxAgents}`, errors_1.DashErrorCode.MAX_AGENTS_EXCEEDED, 400, { swarmId, targetSize, maxAgents }, true);
            }
            swarm.status = 'scaling';
            if (targetSize > currentSize) {
                // Scale up - spawn new agents
                const toAdd = targetSize - currentSize;
                for (let i = 0; i < toAdd; i++) {
                    await this.spawnAgentForSwarm(swarm);
                }
            }
            else if (targetSize < currentSize) {
                // Scale down - kill excess agents
                const toRemove = currentSize - targetSize;
                const agentsToRemove = swarm.agents.slice(-toRemove);
                for (const agentId of agentsToRemove) {
                    await (0, errors_1.safeExecute)(async () => {
                        await this.agentLifecycle.kill(agentId);
                        swarm.agents = swarm.agents.filter(id => id !== agentId);
                    }, undefined, {
                        logError: true,
                        context: `SwarmManager.scale.${swarmId}.killAgent`
                    });
                }
            }
            swarm.status = 'active';
            swarm.metrics.totalAgents = swarm.agents.length;
            this.emit('swarm.scaled', { swarmId, previousSize: currentSize, newSize: targetSize });
            this.messageBus.publish(index_1.MessageBus.swarmBroadcast(swarmId), {
                eventType: 'swarm.scaled',
                source: { orchestrator: 'swarm-manager' },
                payload: { swarmId, previousSize: currentSize, newSize: targetSize },
            }, { priority: 'medium' });
        });
    }
    /**
     * Get swarm status
     */
    getStatus(swarmId) {
        const swarm = (0, errors_1.assertExists)(this.swarms.get(swarmId), 'Swarm', swarmId, { code: errors_1.DashErrorCode.SWARM_NOT_FOUND });
        const activeAgents = swarm.agents.filter(id => {
            const state = this.agentLifecycle.getState(id);
            return state && state.status === agent_1.AgentStatus.RUNNING;
        }).length;
        const progress = swarm.metrics.totalAgents > 0
            ? swarm.metrics.completedAgents / swarm.metrics.totalAgents
            : 0;
        return {
            id: swarm.id,
            name: swarm.name,
            status: swarm.status,
            agentCount: activeAgents,
            budgetRemaining: swarm.budget.remaining,
            progress,
        };
    }
    /**
     * Get full swarm details
     */
    getSwarm(swarmId) {
        return this.swarms.get(swarmId);
    }
    /**
     * List all swarms
     */
    listSwarms() {
        return Array.from(this.swarms.values());
    }
    /**
     * List active (non-destroyed) swarms
     */
    listActiveSwarms() {
        return this.listSwarms().filter(s => s.status !== 'destroyed');
    }
    /**
     * Get agents in a swarm
     */
    getSwarmAgents(swarmId) {
        const swarm = this.swarms.get(swarmId);
        if (!swarm)
            return [];
        return swarm.agents
            .map(id => this.agentLifecycle.getState(id))
            .filter((state) => state !== null);
    }
    /**
     * Consume budget for an agent
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    async consumeBudget(swarmId, agentId, tokens, cost) {
        const mutex = this.getMutex(swarmId);
        await mutex.runExclusive(async () => {
            const swarm = this.swarms.get(swarmId);
            if (!swarm)
                return;
            swarm.budget.consumed += cost;
            swarm.budget.remaining = Math.max(0, swarm.budget.allocated - swarm.budget.consumed);
            // Check budget thresholds
            const warningThreshold = swarm.config.budget?.warningThreshold || 0.75;
            const criticalThreshold = swarm.config.budget?.criticalThreshold || 0.90;
            const consumedRatio = swarm.budget.consumed / swarm.budget.allocated;
            if (consumedRatio >= criticalThreshold && consumedRatio < 1) {
                this.emit('swarm.budget.critical', { swarmId, remaining: swarm.budget.remaining });
                this.messageBus.publish(index_1.MessageBus.swarmBroadcast(swarmId), {
                    eventType: 'system.emergency_stop',
                    source: { orchestrator: 'swarm-manager', agentId },
                    payload: { swarmId, reason: 'budget_critical', remaining: swarm.budget.remaining },
                }, { priority: 'critical' });
            }
            else if (consumedRatio >= warningThreshold) {
                this.emit('swarm.budget.warning', { swarmId, remaining: swarm.budget.remaining });
            }
            // Hard stop at 100%
            if (swarm.budget.remaining <= 0) {
                await this.pauseSwarmInternal(swarm, 'budget_exhausted');
            }
        });
    }
    /**
     * Internal method to pause swarm (must be called inside mutex)
     */
    async pauseSwarmInternal(swarm, reason) {
        swarm.status = 'paused';
        for (const agentId of swarm.agents) {
            await (0, errors_1.safeExecute)(async () => {
                await this.agentLifecycle.pause(agentId);
            }, undefined, {
                logError: true,
                context: `SwarmManager.pauseSwarm.${swarm.id}`
            });
        }
        this.emit('swarm.paused', { swarmId: swarm.id, reason });
    }
    /**
     * Pause a swarm
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    async pauseSwarm(swarmId, reason) {
        const mutex = this.getMutex(swarmId);
        await mutex.runExclusive(async () => {
            const swarm = (0, errors_1.assertExists)(this.swarms.get(swarmId), 'Swarm', swarmId, { code: errors_1.DashErrorCode.SWARM_NOT_FOUND });
            await this.pauseSwarmInternal(swarm, reason);
        });
    }
    /**
     * Resume a paused swarm
     * RACE CONDITION FIX: Protected by per-swarm mutex
     */
    async resumeSwarm(swarmId) {
        const mutex = this.getMutex(swarmId);
        await mutex.runExclusive(async () => {
            const swarm = (0, errors_1.assertExists)(this.swarms.get(swarmId), 'Swarm', swarmId, { code: errors_1.DashErrorCode.SWARM_NOT_FOUND });
            swarm.status = 'active';
            for (const agentId of swarm.agents) {
                await (0, errors_1.safeExecute)(async () => {
                    await this.agentLifecycle.resume(agentId);
                }, undefined, {
                    logError: true,
                    context: `SwarmManager.resumeSwarm.${swarmId}`
                });
            }
            this.emit('swarm.resumed', { swarmId });
        });
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    async initializeAgents(swarm) {
        const { initialAgents, strategy, task } = swarm.config;
        // Create initial agents based on strategy
        if (strategy === 'pipeline') {
            // Pipeline: Each agent gets a stage of the task
            const stages = this.splitTaskIntoStages(task, initialAgents);
            for (let i = 0; i < initialAgents; i++) {
                await this.spawnAgentForSwarm(swarm, {
                    task: stages[i] || `${task} (stage ${i + 1})`,
                    stage: i,
                });
            }
        }
        else if (strategy === 'map-reduce') {
            // Map-reduce: One mapper per chunk, one reducer
            for (let i = 0; i < initialAgents - 1; i++) {
                await this.spawnAgentForSwarm(swarm, { role: 'mapper', index: i });
            }
            await this.spawnAgentForSwarm(swarm, { role: 'reducer' });
        }
        else {
            // Parallel or tree: All agents work on the same task
            for (let i = 0; i < initialAgents; i++) {
                await this.spawnAgentForSwarm(swarm, { index: i });
            }
        }
    }
    async spawnAgentForSwarm(swarm, metadata) {
        const agentConfig = {
            model: swarm.config.model || 'kimi-k2.5',
            task: swarm.config.task,
            swarmId: swarm.id,
            maxRetries: 3,
            budgetLimit: swarm.config.budget
                ? swarm.config.budget.amount / swarm.config.maxAgents
                : undefined,
        };
        const agent = await this.agentLifecycle.spawn(agentConfig);
        if (metadata) {
            Object.assign(agent.metadata, metadata);
        }
        swarm.agents.push(agent.id);
        swarm.metrics.totalAgents = swarm.agents.length;
        // Subscribe to agent events
        this.messageBus.subscribe(index_1.MessageBus.agentEvents(agent.id), (message) => this.handleAgentMessage(swarm.id, agent.id, message));
        return agent;
    }
    handleAgentMessage(swarmId, agentId, message) {
        const msg = message;
        const eventType = msg.payload?.eventType;
        if (!eventType)
            return;
        const swarm = this.swarms.get(swarmId);
        if (!swarm)
            return;
        switch (eventType) {
            case 'agent.completed':
                swarm.metrics.completedAgents++;
                this.checkSwarmCompletion(swarm);
                break;
            case 'agent.failed':
                swarm.metrics.failedAgents++;
                break;
        }
    }
    handleSwarmMessage(swarmId, message) {
        // Handle broadcast messages to the swarm
        const msg = message;
        const payload = msg.payload;
        if (payload?.cost && payload?.tokens) {
            // Budget consumption message from an agent
            // Find the agent that sent this (would need to track sender in message)
        }
    }
    checkSwarmCompletion(swarm) {
        const totalFinished = swarm.metrics.completedAgents + swarm.metrics.failedAgents;
        if (totalFinished >= swarm.metrics.totalAgents) {
            swarm.status = 'completed';
            swarm.completedAt = new Date();
            this.emit('swarm.completed', swarm);
        }
    }
    splitTaskIntoStages(task, numStages) {
        // Simple stage splitting - in production this would use NLP or structured task breakdown
        const stages = [];
        for (let i = 0; i < numStages; i++) {
            stages.push(`${task} (stage ${i + 1}/${numStages})`);
        }
        return stages;
    }
}
exports.SwarmManager = SwarmManager;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalSwarmManager = null;
function getGlobalSwarmManager(agentLifecycle, messageBus, storage, swarmRepository) {
    if (!globalSwarmManager) {
        if (!agentLifecycle || !messageBus || !storage) {
            throw new errors_1.ApplicationError('SwarmManager requires dependencies on first initialization', errors_1.DashErrorCode.INITIALIZATION_FAILED, 500, {
                missingDeps: {
                    agentLifecycle: !agentLifecycle,
                    messageBus: !messageBus,
                    storage: !storage
                }
            }, false);
        }
        globalSwarmManager = new SwarmManager(agentLifecycle, messageBus, storage, swarmRepository);
    }
    else if (swarmRepository) {
        // Update repository if provided
        globalSwarmManager.setSwarmRepository(swarmRepository);
    }
    return globalSwarmManager;
}
function resetGlobalSwarmManager() {
    globalSwarmManager = null;
}
exports.default = SwarmManager;
//# sourceMappingURL=swarm.js.map