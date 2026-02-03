/**
 * Dash Concurrency Manager - Race Condition Handling
 *
 * PRD Section 2.7: Race Condition Handling
 *
 * Features:
 * - Optimistic locking for agent operations
 * - Lock acquisition and release
 * - Deadlock detection and prevention
 * - Lock timeout management
 */
import { EventEmitter } from 'events';
export interface LockConfig {
    /** Default lock timeout in milliseconds */
    defaultTimeout: number;
    /** Maximum lock timeout in milliseconds */
    maxTimeout: number;
    /** Retry interval in milliseconds */
    retryInterval: number;
    /** Maximum retry attempts */
    maxRetries: number;
    /** Deadlock detection interval */
    deadlockCheckInterval: number;
    /** Maximum locks per agent */
    maxLocksPerAgent: number;
}
export interface LockScope {
    /** Global lock - blocks all operations */
    GLOBAL: 'global';
    /** Swarm lock - blocks operations within swarm */
    SWARM: 'swarm';
    /** Agent lock - blocks operations on specific agent */
    AGENT: 'agent';
    /** Resource lock - blocks access to specific resource */
    RESOURCE: 'resource';
}
export interface Lock {
    id: string;
    scope: string;
    resourceId: string;
    agentId: string;
    acquiredAt: Date;
    expiresAt: Date;
    metadata?: Record<string, any>;
}
export interface LockRequest {
    scope: string;
    resourceId: string;
    agentId: string;
    timeout?: number;
    metadata?: Record<string, any>;
}
export interface DeadlockInfo {
    detected: boolean;
    involvedLocks: string[];
    cycle: string[];
    resolution: 'timeout' | 'priority' | 'abort';
    timestamp: Date;
}
export interface ConcurrencyMetrics {
    activeLocks: number;
    pendingRequests: number;
    deadlocksDetected: number;
    locksReleased: number;
    averageWaitTime: number;
    contentionHotspots: string[];
}
export declare const LOCK_SCOPES: LockScope;
export type LockScopeType = keyof typeof LOCK_SCOPES;
declare class ConcurrencyManager extends EventEmitter {
    private config;
    private locks;
    private pendingRequests;
    private lockWaitTimes;
    private deadlockCount;
    private releasedCount;
    private deadlockCheckInterval;
    private cleanupInterval;
    constructor(config?: Partial<LockConfig>);
    /**
     * Start lock cleanup and deadlock detection
     */
    private startCleanup;
    /**
     * Acquire a lock
     */
    acquireLock(request: LockRequest): Promise<Lock | null>;
    /**
     * Release a lock
     */
    releaseLock(lockId: string, agentId: string): boolean;
    /**
     * Release all locks for an agent
     */
    releaseAgentLocks(agentId: string): number;
    /**
     * Check if resource is locked
     */
    isLocked(scope: string, resourceId: string): boolean;
    /**
     * Check if agent owns the lock
     */
    ownsLock(lockId: string, agentId: string): boolean;
    /**
     * Get all active locks
     */
    getActiveLocks(): Lock[];
    /**
     * Get locks by agent
     */
    getLocksByAgent(agentId: string): Lock[];
    /**
     * Get concurrency metrics
     */
    getMetrics(): ConcurrencyMetrics;
    /**
     * Detect deadlocks
     */
    private detectDeadlocks;
    /**
     * Force release a lock (for deadlock resolution)
     */
    private forceRelease;
    /**
     * Cleanup expired locks
     */
    private cleanupExpiredLocks;
    /**
     * Process pending requests for a resource
     */
    private processPendingRequests;
    /**
     * Retry lock acquisition
     */
    private retryAcquire;
    /**
     * Create lock from request
     */
    private createLock;
    /**
     * Generate lock ID
     */
    private generateLockId;
    /**
     * Get lock ID
     */
    private getLockId;
    /**
     * Get pending request count
     */
    private getPendingRequestCount;
    /**
     * Delay helper
     */
    private delay;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
export declare function getConcurrencyManager(): ConcurrencyManager;
export declare function createConcurrencyManager(config?: Partial<LockConfig>): ConcurrencyManager;
export {};
//# sourceMappingURL=index.d.ts.map