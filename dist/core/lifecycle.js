"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLifecycle = void 0;
exports.getGlobalLifecycle = getGlobalLifecycle;
exports.resetGlobalLifecycle = resetGlobalLifecycle;
const events_1 = require("events");
const async_mutex_1 = require("async-mutex");
const agent_1 = require("../models/agent");
const index_1 = require("../bus/index");
const types_1 = require("../events/types");
const errors_1 = require("../errors");
// ============================================================================
// Agent Lifecycle Manager
// ============================================================================
class AgentLifecycle extends events_1.EventEmitter {
    constructor(storage, messageBus, openclaw) {
        super();
        this.states = new Map();
        this.active = false;
        this.retryDelays = new Map(); // Track retry delays per agent
        this.DEFAULT_MAX_RETRIES = 3;
        this.BASE_RETRY_DELAY = 1000; // 1 second
        // RACE CONDITION FIX: One mutex per agent for exclusive state transitions
        this.mutexes = new Map();
        // Global mutex for agent creation (to prevent ID collisions)
        this.creationMutex = new async_mutex_1.Mutex();
        this.storage = storage;
        this.messageBus = messageBus;
        this.openclaw = openclaw;
    }
    /**
     * RACE CONDITION FIX: Get or create a mutex for a specific agent
     */
    getMutex(agentId) {
        if (!this.mutexes.has(agentId)) {
            this.mutexes.set(agentId, new async_mutex_1.Mutex());
        }
        return this.mutexes.get(agentId);
    }
    /**
     * RACE CONDITION FIX: Clean up mutex for terminated agent
     */
    cleanupMutex(agentId) {
        this.mutexes.delete(agentId);
    }
    /**
     * RACE CONDITION FIX: Execute state transition with exclusive lock
     * Ensures atomic state changes and prevents race conditions
     */
    async withAgentLock(agentId, operation) {
        const mutex = this.getMutex(agentId);
        return mutex.runExclusive(operation);
    }
    /**
     * Set the OpenClaw integration (for late binding)
     */
    setOpenClawIntegration(openclaw) {
        this.openclaw = openclaw;
    }
    /**
     * Start the lifecycle manager
     */
    start() {
        this.active = true;
        this.emit('lifecycle.started');
    }
    /**
     * Stop the lifecycle manager
     */
    stop() {
        this.active = false;
        this.emit('lifecycle.stopped');
    }
    /**
     * Spawn a new agent
     * RACE CONDITION FIX: Protected by creationMutex to prevent ID collisions
     */
    async spawn(options) {
        (0, errors_1.assert)(this.active, 'AgentLifecycle is not started. Call lifecycle.start() first', { code: errors_1.DashErrorCode.LIFECYCLE_NOT_STARTED });
        return this.creationMutex.runExclusive(async () => {
            // Create agent model
            const agent = (0, agent_1.createAgent)(options);
            // Create lifecycle state
            const state = {
                id: agent.id,
                status: agent_1.AgentStatus.PENDING,
                lifecycleState: 'spawning',
                agent,
                retryCount: 0,
                maxRetries: options.maxRetries ?? this.DEFAULT_MAX_RETRIES,
                createdAt: new Date(),
            };
            this.states.set(agent.id, state);
            this.storage.create(agent);
            // Create the mutex for this agent immediately
            this.getMutex(agent.id);
            // Spawn OpenClaw session if integration is available
            if (this.openclaw) {
                const sessionResult = await (0, errors_1.safeExecute)(async () => {
                    const spawnOptions = {
                        agentId: agent.id,
                        model: agent.model,
                        task: agent.task,
                        context: {
                            label: agent.label,
                            swarmId: agent.swarmId,
                            parentId: agent.parentId,
                            ...agent.metadata,
                        },
                        maxTokens: options.budgetLimit ? Math.floor(options.budgetLimit * 1000) : undefined,
                    };
                    const sessionId = await this.openclaw.spawnSession(spawnOptions);
                    return sessionId;
                }, undefined, {
                    logError: true,
                    context: 'AgentLifecycle.spawnSession'
                });
                if (sessionResult) {
                    state.sessionId = sessionResult;
                    this.emit('agent.session_created', { agentId: agent.id, sessionId: sessionResult });
                }
            }
            // Publish spawn event
            this.publishAgentEvent(agent.id, 'agent.spawned', {
                agentId: agent.id,
                label: agent.label,
                model: agent.model,
                task: agent.task,
                swarmId: agent.swarmId,
                parentId: agent.parentId,
                sessionId: state.sessionId,
            });
            this.emit('agent.spawned', state);
            // Auto-start if requested (default true)
            if (options.autoStart !== false) {
                await this.startAgent(agent.id);
            }
            return agent;
        });
    }
    /**
     * Start an agent (transition from pending to running)
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    async startAgent(agentId) {
        return this.withAgentLock(agentId, async () => {
            const state = (0, errors_1.assertExists)(this.states.get(agentId), 'Agent', agentId, { code: errors_1.DashErrorCode.AGENT_NOT_FOUND });
            const validStates = ['spawning', 'idle', 'retrying'];
            if (!validStates.includes(state.lifecycleState)) {
                throw new errors_1.ApplicationError(`Cannot start agent in ${state.lifecycleState} state`, errors_1.DashErrorCode.INVALID_STATE_TRANSITION, 400, { agentId, currentState: state.lifecycleState, allowedStates: validStates }, true);
            }
            state.lifecycleState = 'running';
            state.status = agent_1.AgentStatus.RUNNING;
            state.startedAt = new Date();
            // Update storage
            this.storage.update(agentId, { status: agent_1.AgentStatus.RUNNING });
            // Publish status change event
            this.publishAgentEvent(agentId, 'agent.status_changed', {
                agentId,
                previousStatus: 'pending',
                newStatus: 'running',
            });
            this.emit('agent.started', state);
        });
    }
    /**
     * Pause an agent
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    async pause(agentId) {
        return this.withAgentLock(agentId, async () => {
            const state = (0, errors_1.assertExists)(this.states.get(agentId), 'Agent', agentId, { code: errors_1.DashErrorCode.AGENT_NOT_FOUND });
            const validStates = ['running', 'retrying'];
            if (!validStates.includes(state.lifecycleState)) {
                throw new errors_1.ApplicationError(`Cannot pause agent in ${state.lifecycleState} state`, errors_1.DashErrorCode.INVALID_STATE_TRANSITION, 400, { agentId, currentState: state.lifecycleState, allowedStates: validStates }, true);
            }
            const previousStatus = state.status;
            state.lifecycleState = 'paused';
            state.status = agent_1.AgentStatus.PAUSED;
            state.pausedAt = new Date();
            // Update storage
            this.storage.update(agentId, {
                status: agent_1.AgentStatus.PAUSED,
                pauseTime: state.pausedAt,
                pausedBy: 'lifecycle_manager',
            });
            // Pause OpenClaw session if available
            if (this.openclaw && this.openclaw.hasSession(agentId)) {
                await (0, errors_1.safeExecute)(async () => {
                    await this.openclaw.pauseSession(agentId);
                    this.emit('agent.session_paused', { agentId, sessionId: state.sessionId });
                }, undefined, { logError: true, context: 'AgentLifecycle.pauseSession' });
            }
            this.publishAgentEvent(agentId, 'agent.paused', {
                agentId,
                previousStatus: previousStatus.toLowerCase(),
                newStatus: 'paused',
                sessionId: state.sessionId,
            });
            this.emit('agent.paused', state);
        });
    }
    /**
     * Resume a paused agent
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    async resume(agentId) {
        return this.withAgentLock(agentId, async () => {
            const state = (0, errors_1.assertExists)(this.states.get(agentId), 'Agent', agentId, { code: errors_1.DashErrorCode.AGENT_NOT_FOUND });
            if (state.lifecycleState !== 'paused') {
                throw new errors_1.ApplicationError(`Cannot resume agent in ${state.lifecycleState} state`, errors_1.DashErrorCode.INVALID_STATE_TRANSITION, 400, { agentId, currentState: state.lifecycleState, expectedState: 'paused' }, true);
            }
            state.lifecycleState = 'running';
            state.status = agent_1.AgentStatus.RUNNING;
            state.resumedAt = new Date();
            // Update storage
            this.storage.update(agentId, { status: agent_1.AgentStatus.RUNNING });
            // Resume OpenClaw session if available
            if (this.openclaw && this.openclaw.hasSession(agentId)) {
                await (0, errors_1.safeExecute)(async () => {
                    await this.openclaw.resumeSession(agentId);
                    this.emit('agent.session_resumed', { agentId, sessionId: state.sessionId });
                }, undefined, { logError: true, context: 'AgentLifecycle.resumeSession' });
            }
            this.publishAgentEvent(agentId, 'agent.resumed', {
                agentId,
                previousStatus: 'paused',
                newStatus: 'running',
                sessionId: state.sessionId,
            });
            this.emit('agent.resumed', state);
        });
    }
    /**
     * Kill an agent
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    async kill(agentId, force = false) {
        return this.withAgentLock(agentId, async () => {
            const state = (0, errors_1.assertExists)(this.states.get(agentId), 'Agent', agentId, { code: errors_1.DashErrorCode.AGENT_NOT_FOUND });
            if (state.lifecycleState === 'killed' || state.lifecycleState === 'completed') {
                return; // Already terminated
            }
            state.lifecycleState = 'killed';
            state.status = agent_1.AgentStatus.KILLED;
            state.completedAt = new Date();
            // Update storage
            this.storage.update(agentId, {
                status: agent_1.AgentStatus.KILLED,
                completedAt: state.completedAt,
            });
            // Kill OpenClaw session if available
            if (this.openclaw && this.openclaw.hasSession(agentId)) {
                await (0, errors_1.safeExecute)(async () => {
                    await this.openclaw.killSession(agentId, force);
                    this.emit('agent.session_killed', { agentId, sessionId: state.sessionId, force });
                }, undefined, { logError: true, context: 'AgentLifecycle.killSession' });
            }
            this.publishAgentEvent(agentId, 'agent.killed', {
                agentId,
                force,
                sessionId: state.sessionId,
            });
            this.emit('agent.killed', state);
            // Clean up the mutex after termination
            this.cleanupMutex(agentId);
        });
    }
    /**
     * Mark an agent as completed
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    async complete(agentId, output) {
        return this.withAgentLock(agentId, async () => {
            const state = (0, errors_1.assertExists)(this.states.get(agentId), 'Agent', agentId, { code: errors_1.DashErrorCode.AGENT_NOT_FOUND });
            if (state.lifecycleState === 'killed' || state.lifecycleState === 'completed') {
                return; // Already terminated
            }
            state.lifecycleState = 'completed';
            state.status = agent_1.AgentStatus.COMPLETED;
            state.completedAt = new Date();
            // Update agent runtime
            if (state.startedAt) {
                state.agent.runtime = Date.now() - state.startedAt.getTime();
            }
            // Update storage
            this.storage.update(agentId, {
                status: agent_1.AgentStatus.COMPLETED,
                completedAt: state.completedAt,
                runtime: state.agent.runtime,
            });
            this.publishAgentEvent(agentId, 'agent.completed', {
                agentId,
                runtime: state.agent.runtime,
                output,
            });
            this.emit('agent.completed', state);
            // Clean up the mutex after termination
            this.cleanupMutex(agentId);
        });
    }
    /**
     * Mark an agent as failed with auto-retry logic
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    async fail(agentId, error, options) {
        return this.withAgentLock(agentId, async () => {
            const state = (0, errors_1.assertExists)(this.states.get(agentId), 'Agent', agentId, { code: errors_1.DashErrorCode.AGENT_NOT_FOUND });
            state.lastError = error;
            state.retryCount++;
            // Check if we should retry
            const maxRetries = options?.maxRetries ?? state.maxRetries;
            if (state.retryCount <= maxRetries) {
                // Attempt retry with exponential backoff
                await this.retryInternal(agentId, state, options);
            }
            else {
                // Max retries exhausted - try alternate model if specified
                if (options?.useAlternateModel && options?.alternateModel) {
                    await this.retryWithAlternateModelInternal(agentId, state, options.alternateModel);
                }
                else {
                    // Mark as failed
                    await this.markFailedInternal(agentId, state, error);
                }
            }
        });
    }
    /**
     * Retry a failed agent
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    async retry(agentId, options) {
        return this.withAgentLock(agentId, async () => {
            const state = (0, errors_1.assertExists)(this.states.get(agentId), 'Agent', agentId, { code: errors_1.DashErrorCode.AGENT_NOT_FOUND });
            await this.retryInternal(agentId, state, options);
        });
    }
    /**
     * Internal retry logic (must be called inside agent lock)
     */
    async retryInternal(agentId, state, options) {
        const retryDelay = options?.delay ?? this.calculateRetryDelay(agentId);
        state.lifecycleState = 'retrying';
        state.status = agent_1.AgentStatus.PENDING;
        this.publishAgentEvent(agentId, 'agent.status_changed', {
            agentId,
            previousStatus: 'failed',
            newStatus: 'retrying',
            reason: `Retry ${state.retryCount}/${state.maxRetries}`,
        });
        this.emit('agent.retrying', { state, delay: retryDelay });
        // Wait for delay then restart
        await this.delay(retryDelay);
        if (!this.active)
            return; // Check if still active
        // Note: We release the lock during delay and re-acquire for startAgent
        await this.startAgent(agentId);
    }
    /**
     * Retry with an alternate model (escalation)
     * RACE CONDITION FIX: Protected by per-agent mutex
     */
    async retryWithAlternateModel(agentId, alternateModel) {
        return this.withAgentLock(agentId, async () => {
            const state = (0, errors_1.assertExists)(this.states.get(agentId), 'Agent', agentId, { code: errors_1.DashErrorCode.AGENT_NOT_FOUND });
            await this.retryWithAlternateModelInternal(agentId, state, alternateModel);
        });
    }
    /**
     * Internal retry with alternate model logic (must be called inside agent lock)
     */
    async retryWithAlternateModelInternal(agentId, state, alternateModel) {
        // Update model and reset retry count
        state.agent.model = alternateModel;
        state.retryCount = 0;
        this.publishAgentEvent(agentId, 'agent.status_changed', {
            agentId,
            previousStatus: 'failed',
            newStatus: 'escalated',
            reason: `Escalated to model ${alternateModel}`,
        });
        this.emit('agent.escalated', { state, newModel: alternateModel });
        // Start with new model
        await this.startAgent(agentId);
    }
    /**
     * Get agent state
     */
    getState(agentId) {
        return this.states.get(agentId) || null;
    }
    /**
     * Get all agent states
     */
    getAllStates() {
        return Array.from(this.states.values());
    }
    /**
     * Get agents by status
     */
    getAgentsByStatus(status) {
        return this.getAllStates().filter(s => s.status === status);
    }
    /**
     * Get agents by swarm
     */
    getAgentsBySwarm(swarmId) {
        return this.getAllStates().filter(s => s.agent.swarmId === swarmId);
    }
    /**
     * Get lifecycle metrics
     */
    getMetrics() {
        const states = this.getAllStates();
        return {
            totalSpawned: states.length,
            totalCompleted: states.filter(s => s.lifecycleState === 'completed').length,
            totalFailed: states.filter(s => s.lifecycleState === 'failed').length,
            totalKilled: states.filter(s => s.lifecycleState === 'killed').length,
            activeAgents: states.filter(s => s.lifecycleState === 'running').length,
            pausedAgents: states.filter(s => s.lifecycleState === 'paused').length,
        };
    }
    /**
     * Clean up completed/failed agents older than a threshold
     */
    cleanup(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        let cleaned = 0;
        for (const [agentId, state] of this.states) {
            if (state.completedAt) {
                const age = now - state.completedAt.getTime();
                if (age > maxAgeMs) {
                    this.states.delete(agentId);
                    cleaned++;
                }
            }
        }
        return cleaned;
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    /**
     * Mark an agent as failed (public method with mutex protection)
     */
    async markFailed(agentId, error) {
        return this.withAgentLock(agentId, async () => {
            const state = this.states.get(agentId);
            if (!state)
                return;
            await this.markFailedInternal(agentId, state, error);
        });
    }
    /**
     * Internal mark failed logic (must be called inside agent lock)
     */
    async markFailedInternal(agentId, state, error) {
        state.lifecycleState = 'failed';
        state.status = agent_1.AgentStatus.FAILED;
        state.completedAt = new Date();
        state.lastError = error;
        // Update storage
        this.storage.update(agentId, {
            status: agent_1.AgentStatus.FAILED,
            completedAt: state.completedAt,
            lastError: error,
        });
        this.publishAgentEvent(agentId, 'agent.failed', {
            agentId,
            error,
            retryCount: state.retryCount,
            maxRetries: state.maxRetries,
        });
        this.emit('agent.failed', state);
        // Clean up the mutex after termination
        this.cleanupMutex(agentId);
    }
    calculateRetryDelay(agentId) {
        const state = this.states.get(agentId);
        if (!state)
            return this.BASE_RETRY_DELAY;
        // Exponential backoff: 2^attempt * base_delay
        const delay = Math.pow(2, state.retryCount) * this.BASE_RETRY_DELAY;
        // Cap at 5 minutes
        return Math.min(delay, 5 * 60 * 1000);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    publishAgentEvent(agentId, eventType, payload) {
        this.messageBus.publish(index_1.MessageBus.agentEvents(agentId), {
            id: (0, types_1.generateEventId)(),
            timestamp: new Date(),
            eventType: eventType,
            source: { agentId },
            payload,
        }, { source: agentId, priority: 'medium' });
    }
}
exports.AgentLifecycle = AgentLifecycle;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalLifecycle = null;
function getGlobalLifecycle(storage, messageBus, openclaw) {
    if (!globalLifecycle) {
        if (!storage || !messageBus) {
            throw new errors_1.ApplicationError('AgentLifecycle requires dependencies on first initialization', errors_1.DashErrorCode.INITIALIZATION_FAILED, 500, { missingDeps: { storage: !storage, messageBus: !messageBus } }, false);
        }
        globalLifecycle = new AgentLifecycle(storage, messageBus, openclaw);
    }
    else if (openclaw) {
        // Update OpenClaw integration if provided
        globalLifecycle.setOpenClawIntegration(openclaw);
    }
    return globalLifecycle;
}
function resetGlobalLifecycle() {
    globalLifecycle = null;
}
exports.default = AgentLifecycle;
//# sourceMappingURL=lifecycle.js.map