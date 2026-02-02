"use strict";
/**
 * OpenClaw Integration Service
 *
 * Provides integration between Dash agents and OpenClaw sessions.
 * Maps Dash agent IDs to OpenClaw session keys and manages lifecycle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawIntegration = exports.MockOpenClawClient = void 0;
exports.getGlobalOpenClawIntegration = getGlobalOpenClawIntegration;
exports.resetGlobalOpenClawIntegration = resetGlobalOpenClawIntegration;
const events_1 = require("events");
const index_1 = require("../bus/index");
const logger_1 = require("../utils/logger");
// ============================================================================
// Mock OpenClaw Client (for testing)
// ============================================================================
class MockOpenClawClient extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.sessions = new Map();
        this.tokenUsage = new Map();
        this.sessionCounter = 0;
    }
    async sessionsSpawn(options) {
        this.sessionCounter++;
        const sessionId = `openclaw-session-${Date.now()}-${this.sessionCounter}`;
        const session = {
            sessionId,
            agentId: options.agentId,
            status: 'pending',
            createdAt: new Date(),
            metadata: {
                model: options.model || 'kimi-k2.5',
                task: options.task,
                maxTokens: options.maxTokens,
                timeout: options.timeout,
                ...options.context,
            },
        };
        this.sessions.set(sessionId, session);
        this.tokenUsage.set(sessionId, { prompt: 0, completion: 0, cost: 0 });
        logger_1.logger.info(`[OpenClaw] Session spawned: ${sessionId} for agent ${options.agentId}`);
        this.emit('session.created', { type: 'session.created', sessionId, agentId: options.agentId });
        // Auto-start for testing
        setTimeout(() => this.simulateSessionStart(sessionId), 10);
        return { sessionId };
    }
    async sessionPause(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (session.status !== 'running') {
            throw new Error(`Cannot pause session in ${session.status} state`);
        }
        session.status = 'paused';
        session.pausedAt = new Date();
        logger_1.logger.info(`[OpenClaw] Session paused: ${sessionId}`);
        this.emit('session.paused', { type: 'session.paused', sessionId, agentId: session.agentId });
    }
    async sessionResume(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (session.status !== 'paused') {
            throw new Error(`Cannot resume session in ${session.status} state`);
        }
        session.status = 'running';
        session.resumedAt = new Date();
        logger_1.logger.info(`[OpenClaw] Session resumed: ${sessionId}`);
        this.emit('session.resumed', { type: 'session.resumed', sessionId, agentId: session.agentId });
    }
    async sessionKill(sessionId, force = false) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (session.status === 'completed' || session.status === 'killed') {
            return; // Already terminated
        }
        session.status = 'killed';
        session.completedAt = new Date();
        logger_1.logger.info(`[OpenClaw] Session killed: ${sessionId} (force=${force})`);
        this.emit('session.killed', { type: 'session.killed', sessionId, agentId: session.agentId, force });
    }
    async sessionStatus(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const usage = this.tokenUsage.get(sessionId) || { prompt: 0, completion: 0, cost: 0 };
        const runtime = session.startedAt
            ? Date.now() - session.startedAt.getTime()
            : 0;
        return {
            sessionId,
            agentId: session.agentId,
            status: session.status,
            runtime,
            tokenUsage: {
                prompt: usage.prompt,
                completion: usage.completion,
                total: usage.prompt + usage.completion,
            },
            cost: usage.cost,
        };
    }
    async sessionLogs(sessionId, limit = 100) {
        // Return mock logs
        return [`[${sessionId}] Log entry 1`, `[${sessionId}] Log entry 2`].slice(0, limit);
    }
    // ============================================================================
    // Simulation Methods (for testing)
    // ============================================================================
    simulateSessionStart(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.status = 'running';
        session.startedAt = new Date();
        this.emit('session.started', { type: 'session.started', sessionId, agentId: session.agentId });
        // Simulate token usage over time
        this.simulateTokenUsage(sessionId);
    }
    simulateTokenUsage(sessionId) {
        const interval = setInterval(() => {
            const session = this.sessions.get(sessionId);
            if (!session || session.status === 'completed' || session.status === 'killed') {
                clearInterval(interval);
                return;
            }
            if (session.status === 'running') {
                const usage = this.tokenUsage.get(sessionId);
                const tokens = Math.floor(Math.random() * 100) + 50;
                const cost = (tokens / 1000) * 0.015; // $0.015 per 1K tokens
                usage.prompt += Math.floor(tokens / 2);
                usage.completion += Math.ceil(tokens / 2);
                usage.cost += cost;
                this.emit('token.usage', {
                    type: 'token.usage',
                    sessionId,
                    agentId: session.agentId,
                    tokens,
                    cost,
                });
            }
        }, 1000);
    }
    simulateSessionComplete(sessionId, output) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.status = 'completed';
        session.completedAt = new Date();
        this.emit('session.completed', { type: 'session.completed', sessionId, agentId: session.agentId, output });
    }
    simulateSessionFailure(sessionId, error) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.status = 'failed';
        session.lastError = error;
        session.completedAt = new Date();
        this.emit('session.failed', { type: 'session.failed', sessionId, agentId: session.agentId, error });
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    getSessionByAgentId(agentId) {
        return Array.from(this.sessions.values()).find(s => s.agentId === agentId);
    }
    getAllSessions() {
        return Array.from(this.sessions.values());
    }
    reset() {
        this.sessions.clear();
        this.tokenUsage.clear();
        this.sessionCounter = 0;
    }
}
exports.MockOpenClawClient = MockOpenClawClient;
// ============================================================================
// OpenClaw Integration Service
// ============================================================================
class OpenClawIntegration extends events_1.EventEmitter {
    constructor(client, messageBus) {
        super();
        this.agentSessionMap = new Map(); // agentId -> sessionId
        this.sessionAgentMap = new Map(); // sessionId -> agentId
        this.client = client;
        this.messageBus = messageBus;
        // Listen for OpenClaw events if client is EventEmitter
        if (client instanceof events_1.EventEmitter) {
            client.on('session.created', (event) => this.handleSessionEvent(event));
            client.on('session.started', (event) => this.handleSessionEvent(event));
            client.on('session.paused', (event) => this.handleSessionEvent(event));
            client.on('session.resumed', (event) => this.handleSessionEvent(event));
            client.on('session.completed', (event) => this.handleSessionEvent(event));
            client.on('session.failed', (event) => this.handleSessionEvent(event));
            client.on('session.killed', (event) => this.handleSessionEvent(event));
            client.on('token.usage', (event) => this.handleTokenUsage(event));
        }
    }
    /**
     * Spawn an OpenClaw session for a Dash agent
     */
    async spawnSession(options) {
        const { sessionId } = await this.client.sessionsSpawn(options);
        this.agentSessionMap.set(options.agentId, sessionId);
        this.sessionAgentMap.set(sessionId, options.agentId);
        logger_1.logger.info(`[OpenClawIntegration] Mapped agent ${options.agentId} to session ${sessionId}`);
        this.emit('session.spawned', {
            agentId: options.agentId,
            sessionId,
            model: options.model,
            task: options.task,
        });
        return sessionId;
    }
    /**
     * Pause a session by agent ID
     */
    async pauseSession(agentId) {
        const sessionId = this.agentSessionMap.get(agentId);
        if (!sessionId) {
            throw new Error(`No OpenClaw session found for agent ${agentId}`);
        }
        await this.client.sessionPause(sessionId);
    }
    /**
     * Resume a session by agent ID
     */
    async resumeSession(agentId) {
        const sessionId = this.agentSessionMap.get(agentId);
        if (!sessionId) {
            throw new Error(`No OpenClaw session found for agent ${agentId}`);
        }
        await this.client.sessionResume(sessionId);
    }
    /**
     * Kill a session by agent ID
     */
    async killSession(agentId, force = false) {
        const sessionId = this.agentSessionMap.get(agentId);
        if (!sessionId) {
            logger_1.logger.warn(`[OpenClawIntegration] No session to kill for agent ${agentId}`);
            return;
        }
        await this.client.sessionKill(sessionId, force);
    }
    /**
     * Get session status by agent ID
     */
    async getSessionStatus(agentId) {
        const sessionId = this.agentSessionMap.get(agentId);
        if (!sessionId) {
            return null;
        }
        return this.client.sessionStatus(sessionId);
    }
    /**
     * Get session ID for an agent
     */
    getSessionId(agentId) {
        return this.agentSessionMap.get(agentId);
    }
    /**
     * Get agent ID for a session
     */
    getAgentId(sessionId) {
        return this.sessionAgentMap.get(sessionId);
    }
    /**
     * Check if an agent has an active session
     */
    hasSession(agentId) {
        return this.agentSessionMap.has(agentId);
    }
    /**
     * Get all active sessions
     */
    getActiveSessions() {
        return Array.from(this.agentSessionMap.entries()).map(([agentId, sessionId]) => ({
            agentId,
            sessionId,
        }));
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    handleSessionEvent(event) {
        const agentId = this.sessionAgentMap.get(event.sessionId);
        if (!agentId) {
            logger_1.logger.warn(`[OpenClawIntegration] Received event for unknown session: ${event.sessionId}`);
            return;
        }
        // Map to Dash event types and publish to message bus
        const dashEventType = this.mapToDashEventType(event.type);
        this.messageBus.publish(index_1.MessageBus.agentEvents(agentId), {
            eventType: dashEventType,
            source: { agentId, sessionId: event.sessionId },
            payload: event,
            timestamp: new Date(),
        }, { source: 'openclaw', priority: 'high' });
        this.emit('agent.event', { agentId, sessionId: event.sessionId, event });
    }
    handleTokenUsage(event) {
        const agentId = this.sessionAgentMap.get(event.sessionId);
        if (!agentId)
            return;
        // Publish token usage to message bus for budget tracking
        this.messageBus.publish(index_1.MessageBus.agentEvents(agentId), {
            eventType: 'token.usage',
            source: { agentId, sessionId: event.sessionId },
            payload: {
                agentId,
                sessionId: event.sessionId,
                tokens: event.tokens,
                cost: event.cost,
            },
            timestamp: new Date(),
        }, { source: 'openclaw', priority: 'medium' });
        this.emit('token.usage', { agentId, sessionId: event.sessionId, tokens: event.tokens, cost: event.cost });
    }
    mapToDashEventType(openClawType) {
        const mapping = {
            'session.created': 'agent.spawned',
            'session.started': 'agent.started',
            'session.paused': 'agent.paused',
            'session.resumed': 'agent.resumed',
            'session.completed': 'agent.completed',
            'session.failed': 'agent.failed',
            'session.killed': 'agent.killed',
        };
        return mapping[openClawType] || openClawType;
    }
}
exports.OpenClawIntegration = OpenClawIntegration;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalIntegration = null;
function getGlobalOpenClawIntegration(client, messageBus) {
    if (!globalIntegration) {
        if (!client || !messageBus) {
            throw new Error('OpenClawIntegration requires dependencies on first initialization');
        }
        globalIntegration = new OpenClawIntegration(client, messageBus);
    }
    return globalIntegration;
}
function resetGlobalOpenClawIntegration() {
    globalIntegration = null;
}
exports.default = OpenClawIntegration;
//# sourceMappingURL=openclaw.js.map