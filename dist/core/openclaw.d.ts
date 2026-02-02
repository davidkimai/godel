/**
 * OpenClaw Integration Service
 *
 * Provides integration between Dash agents and OpenClaw sessions.
 * Maps Dash agent IDs to OpenClaw session keys and manages lifecycle.
 */
import { EventEmitter } from 'events';
import { MessageBus } from '../bus/index';
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
export type SessionEvent = {
    type: 'session.created';
    sessionId: string;
    agentId: string;
} | {
    type: 'session.started';
    sessionId: string;
    agentId: string;
} | {
    type: 'session.paused';
    sessionId: string;
    agentId: string;
} | {
    type: 'session.resumed';
    sessionId: string;
    agentId: string;
} | {
    type: 'session.completed';
    sessionId: string;
    agentId: string;
    output?: string;
} | {
    type: 'session.failed';
    sessionId: string;
    agentId: string;
    error: string;
} | {
    type: 'session.killed';
    sessionId: string;
    agentId: string;
    force: boolean;
} | {
    type: 'token.usage';
    sessionId: string;
    agentId: string;
    tokens: number;
    cost: number;
};
/**
 * Interface for OpenClaw API client
 * In production, this would make actual HTTP/gRPC calls to OpenClaw
 */
export interface OpenClawClient {
    sessionsSpawn(options: SessionSpawnOptions): Promise<{
        sessionId: string;
    }>;
    sessionPause(sessionId: string): Promise<void>;
    sessionResume(sessionId: string): Promise<void>;
    sessionKill(sessionId: string, force?: boolean): Promise<void>;
    sessionStatus(sessionId: string): Promise<SessionStatus>;
    sessionLogs(sessionId: string, limit?: number): Promise<string[]>;
}
export declare class MockOpenClawClient extends EventEmitter implements OpenClawClient {
    private sessions;
    private tokenUsage;
    private sessionCounter;
    sessionsSpawn(options: SessionSpawnOptions): Promise<{
        sessionId: string;
    }>;
    sessionPause(sessionId: string): Promise<void>;
    sessionResume(sessionId: string): Promise<void>;
    sessionKill(sessionId: string, force?: boolean): Promise<void>;
    sessionStatus(sessionId: string): Promise<SessionStatus>;
    sessionLogs(sessionId: string, limit?: number): Promise<string[]>;
    /**
     * Send a message to a session
     * Maps to: sessions_send
     */
    sessionsSend(options: {
        sessionKey: string;
        message: string;
        attachments?: Array<{
            type: string;
            data: string;
            filename: string;
        }>;
    }): Promise<{
        runId: string;
        status: string;
    }>;
    private simulateSessionStart;
    private simulateTokenUsage;
    simulateSessionComplete(sessionId: string, output?: string): void;
    simulateSessionFailure(sessionId: string, error: string): void;
    getSession(sessionId: string): OpenClawSession | undefined;
    getSessionByAgentId(agentId: string): OpenClawSession | undefined;
    getAllSessions(): OpenClawSession[];
    reset(): void;
    /**
     * Restore a session from persisted state (for CLI mock mode)
     */
    restoreSession(sessionData: {
        sessionId: string;
        agentId: string;
        status: OpenClawSession['status'];
        createdAt: string;
        model?: string;
        task?: string;
    }): void;
}
export declare class OpenClawIntegration extends EventEmitter {
    private client;
    private messageBus;
    private agentSessionMap;
    private sessionAgentMap;
    constructor(client: OpenClawClient, messageBus: MessageBus);
    /**
     * Spawn an OpenClaw session for a Dash agent
     */
    spawnSession(options: SessionSpawnOptions): Promise<string>;
    /**
     * Pause a session by agent ID
     */
    pauseSession(agentId: string): Promise<void>;
    /**
     * Resume a session by agent ID
     */
    resumeSession(agentId: string): Promise<void>;
    /**
     * Kill a session by agent ID
     */
    killSession(agentId: string, force?: boolean): Promise<void>;
    /**
     * Get session status by agent ID
     */
    getSessionStatus(agentId: string): Promise<SessionStatus | null>;
    /**
     * Get session ID for an agent
     */
    getSessionId(agentId: string): string | undefined;
    /**
     * Get agent ID for a session
     */
    getAgentId(sessionId: string): string | undefined;
    /**
     * Check if an agent has an active session
     */
    hasSession(agentId: string): boolean;
    /**
     * Get all active sessions
     */
    getActiveSessions(): Array<{
        agentId: string;
        sessionId: string;
    }>;
    private handleSessionEvent;
    private handleTokenUsage;
    private mapToDashEventType;
}
export declare function getGlobalOpenClawIntegration(client?: OpenClawClient, messageBus?: MessageBus): OpenClawIntegration;
export declare function resetGlobalOpenClawIntegration(): void;
export default OpenClawIntegration;
//# sourceMappingURL=openclaw.d.ts.map