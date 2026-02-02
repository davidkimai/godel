/**
 * OpenClaw Integration Service
 * 
 * Provides integration between Dash agents and OpenClaw sessions.
 * Maps Dash agent IDs to OpenClaw session keys and manages lifecycle.
 */

import { EventEmitter } from 'events';
import { AgentStatus } from '../models/agent';
import { MessageBus } from '../bus/index';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface OpenClawSession {
  sessionId: string;
  agentId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'killed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  pausedAt?: Date;
  resumedAt?: Date;
  lastError?: string;
  metadata: Record<string, unknown>;
}

export interface SessionSpawnOptions {
  agentId: string;
  model?: string;
  task: string;
  context?: Record<string, unknown>;
  maxTokens?: number;
  timeout?: number;
}

export interface SessionStatus {
  sessionId: string;
  agentId: string;
  status: OpenClawSession['status'];
  runtime: number;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: number;
}

export type SessionEvent = 
  | { type: 'session.created'; sessionId: string; agentId: string }
  | { type: 'session.started'; sessionId: string; agentId: string }
  | { type: 'session.paused'; sessionId: string; agentId: string }
  | { type: 'session.resumed'; sessionId: string; agentId: string }
  | { type: 'session.completed'; sessionId: string; agentId: string; output?: string }
  | { type: 'session.failed'; sessionId: string; agentId: string; error: string }
  | { type: 'session.killed'; sessionId: string; agentId: string; force: boolean }
  | { type: 'token.usage'; sessionId: string; agentId: string; tokens: number; cost: number };

// ============================================================================
// OpenClaw Client Interface
// ============================================================================

/**
 * Interface for OpenClaw API client
 * In production, this would make actual HTTP/gRPC calls to OpenClaw
 */
export interface OpenClawClient {
  sessionsSpawn(options: SessionSpawnOptions): Promise<{ sessionId: string }>;
  sessionPause(sessionId: string): Promise<void>;
  sessionResume(sessionId: string): Promise<void>;
  sessionKill(sessionId: string, force?: boolean): Promise<void>;
  sessionStatus(sessionId: string): Promise<SessionStatus>;
  sessionLogs(sessionId: string, limit?: number): Promise<string[]>;
}

// ============================================================================
// Mock OpenClaw Client (for testing)
// ============================================================================

export class MockOpenClawClient extends EventEmitter implements OpenClawClient {
  private sessions: Map<string, OpenClawSession> = new Map();
  private tokenUsage: Map<string, { prompt: number; completion: number; cost: number }> = new Map();
  private sessionCounter = 0;

  async sessionsSpawn(options: SessionSpawnOptions): Promise<{ sessionId: string }> {
    this.sessionCounter++;
    const sessionId = `openclaw-session-${Date.now()}-${this.sessionCounter}`;
    
    const session: OpenClawSession = {
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

    logger.info(`[OpenClaw] Session spawned: ${sessionId} for agent ${options.agentId}`);
    
    this.emit('session.created', { type: 'session.created', sessionId, agentId: options.agentId });

    // Auto-start for testing
    setTimeout(() => this.simulateSessionStart(sessionId), 10);

    return { sessionId };
  }

  async sessionPause(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot pause session in ${session.status} state`);
    }

    session.status = 'paused';
    session.pausedAt = new Date();

    logger.info(`[OpenClaw] Session paused: ${sessionId}`);
    this.emit('session.paused', { type: 'session.paused', sessionId, agentId: session.agentId });
  }

  async sessionResume(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'paused') {
      throw new Error(`Cannot resume session in ${session.status} state`);
    }

    session.status = 'running';
    session.resumedAt = new Date();

    logger.info(`[OpenClaw] Session resumed: ${sessionId}`);
    this.emit('session.resumed', { type: 'session.resumed', sessionId, agentId: session.agentId });
  }

  async sessionKill(sessionId: string, force = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'completed' || session.status === 'killed') {
      return; // Already terminated
    }

    session.status = 'killed';
    session.completedAt = new Date();

    logger.info(`[OpenClaw] Session killed: ${sessionId} (force=${force})`);
    this.emit('session.killed', { type: 'session.killed', sessionId, agentId: session.agentId, force });
  }

  async sessionStatus(sessionId: string): Promise<SessionStatus> {
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

  async sessionLogs(sessionId: string, limit = 100): Promise<string[]> {
    // Return mock logs
    return [`[${sessionId}] Log entry 1`, `[${sessionId}] Log entry 2`].slice(0, limit);
  }

  // ============================================================================
  // Simulation Methods (for testing)
  // ============================================================================

  private simulateSessionStart(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'running';
    session.startedAt = new Date();

    this.emit('session.started', { type: 'session.started', sessionId, agentId: session.agentId });

    // Simulate token usage over time
    this.simulateTokenUsage(sessionId);
  }

  private simulateTokenUsage(sessionId: string): void {
    const interval = setInterval(() => {
      const session = this.sessions.get(sessionId);
      if (!session || session.status === 'completed' || session.status === 'killed') {
        clearInterval(interval);
        return;
      }

      if (session.status === 'running') {
        const usage = this.tokenUsage.get(sessionId)!;
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

  simulateSessionComplete(sessionId: string, output?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'completed';
    session.completedAt = new Date();

    this.emit('session.completed', { type: 'session.completed', sessionId, agentId: session.agentId, output });
  }

  simulateSessionFailure(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'failed';
    session.lastError = error;
    session.completedAt = new Date();

    this.emit('session.failed', { type: 'session.failed', sessionId, agentId: session.agentId, error });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  getSession(sessionId: string): OpenClawSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByAgentId(agentId: string): OpenClawSession | undefined {
    return Array.from(this.sessions.values()).find(s => s.agentId === agentId);
  }

  getAllSessions(): OpenClawSession[] {
    return Array.from(this.sessions.values());
  }

  reset(): void {
    this.sessions.clear();
    this.tokenUsage.clear();
    this.sessionCounter = 0;
  }
}

// ============================================================================
// OpenClaw Integration Service
// ============================================================================

export class OpenClawIntegration extends EventEmitter {
  private client: OpenClawClient;
  private messageBus: MessageBus;
  private agentSessionMap: Map<string, string> = new Map(); // agentId -> sessionId
  private sessionAgentMap: Map<string, string> = new Map(); // sessionId -> agentId

  constructor(client: OpenClawClient, messageBus: MessageBus) {
    super();
    this.client = client;
    this.messageBus = messageBus;

    // Listen for OpenClaw events if client is EventEmitter
    if (client instanceof EventEmitter) {
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
  async spawnSession(options: SessionSpawnOptions): Promise<string> {
    const { sessionId } = await this.client.sessionsSpawn(options);
    
    this.agentSessionMap.set(options.agentId, sessionId);
    this.sessionAgentMap.set(sessionId, options.agentId);

    logger.info(`[OpenClawIntegration] Mapped agent ${options.agentId} to session ${sessionId}`);

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
  async pauseSession(agentId: string): Promise<void> {
    const sessionId = this.agentSessionMap.get(agentId);
    if (!sessionId) {
      throw new Error(`No OpenClaw session found for agent ${agentId}`);
    }

    await this.client.sessionPause(sessionId);
  }

  /**
   * Resume a session by agent ID
   */
  async resumeSession(agentId: string): Promise<void> {
    const sessionId = this.agentSessionMap.get(agentId);
    if (!sessionId) {
      throw new Error(`No OpenClaw session found for agent ${agentId}`);
    }

    await this.client.sessionResume(sessionId);
  }

  /**
   * Kill a session by agent ID
   */
  async killSession(agentId: string, force = false): Promise<void> {
    const sessionId = this.agentSessionMap.get(agentId);
    if (!sessionId) {
      logger.warn(`[OpenClawIntegration] No session to kill for agent ${agentId}`);
      return;
    }

    await this.client.sessionKill(sessionId, force);
  }

  /**
   * Get session status by agent ID
   */
  async getSessionStatus(agentId: string): Promise<SessionStatus | null> {
    const sessionId = this.agentSessionMap.get(agentId);
    if (!sessionId) {
      return null;
    }

    return this.client.sessionStatus(sessionId);
  }

  /**
   * Get session ID for an agent
   */
  getSessionId(agentId: string): string | undefined {
    return this.agentSessionMap.get(agentId);
  }

  /**
   * Get agent ID for a session
   */
  getAgentId(sessionId: string): string | undefined {
    return this.sessionAgentMap.get(sessionId);
  }

  /**
   * Check if an agent has an active session
   */
  hasSession(agentId: string): boolean {
    return this.agentSessionMap.has(agentId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Array<{ agentId: string; sessionId: string }> {
    return Array.from(this.agentSessionMap.entries()).map(([agentId, sessionId]) => ({
      agentId,
      sessionId,
    }));
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleSessionEvent(event: SessionEvent): void {
    const agentId = this.sessionAgentMap.get(event.sessionId);
    if (!agentId) {
      logger.warn(`[OpenClawIntegration] Received event for unknown session: ${event.sessionId}`);
      return;
    }

    // Map to Dash event types and publish to message bus
    const dashEventType = this.mapToDashEventType(event.type);
    
    this.messageBus.publish(
      MessageBus.agentEvents(agentId),
      {
        eventType: dashEventType,
        source: { agentId, sessionId: event.sessionId },
        payload: event,
        timestamp: new Date(),
      },
      { source: 'openclaw', priority: 'high' }
    );

    this.emit('agent.event', { agentId, sessionId: event.sessionId, event });
  }

  private handleTokenUsage(event: Extract<SessionEvent, { type: 'token.usage' }>): void {
    const agentId = this.sessionAgentMap.get(event.sessionId);
    if (!agentId) return;

    // Publish token usage to message bus for budget tracking
    this.messageBus.publish(
      MessageBus.agentEvents(agentId),
      {
        eventType: 'token.usage',
        source: { agentId, sessionId: event.sessionId },
        payload: {
          agentId,
          sessionId: event.sessionId,
          tokens: event.tokens,
          cost: event.cost,
        },
        timestamp: new Date(),
      },
      { source: 'openclaw', priority: 'medium' }
    );

    this.emit('token.usage', { agentId, sessionId: event.sessionId, tokens: event.tokens, cost: event.cost });
  }

  private mapToDashEventType(openClawType: string): string {
    const mapping: Record<string, string> = {
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

// ============================================================================
// Singleton Instance
// ============================================================================

let globalIntegration: OpenClawIntegration | null = null;

export function getGlobalOpenClawIntegration(
  client?: OpenClawClient,
  messageBus?: MessageBus
): OpenClawIntegration {
  if (!globalIntegration) {
    if (!client || !messageBus) {
      throw new Error('OpenClawIntegration requires dependencies on first initialization');
    }
    globalIntegration = new OpenClawIntegration(client, messageBus);
  }
  return globalIntegration;
}

export function resetGlobalOpenClawIntegration(): void {
  globalIntegration = null;
}

export default OpenClawIntegration;
