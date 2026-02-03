"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCK_SCOPES = void 0;
exports.getConcurrencyManager = getConcurrencyManager;
exports.createConcurrencyManager = createConcurrencyManager;
const events_1 = require("events");
exports.LOCK_SCOPES = {
    GLOBAL: 'global',
    SWARM: 'swarm',
    AGENT: 'agent',
    RESOURCE: 'resource'
};
class ConcurrencyManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.locks = new Map();
        this.pendingRequests = new Map();
        this.lockWaitTimes = [];
        this.deadlockCount = 0;
        this.releasedCount = 0;
        this.deadlockCheckInterval = null;
        this.cleanupInterval = null;
        this.config = {
            defaultTimeout: config.defaultTimeout || 30000,
            maxTimeout: config.maxTimeout || 300000,
            retryInterval: config.retryInterval || 100,
            maxRetries: config.maxRetries || 50,
            deadlockCheckInterval: config.deadlockCheckInterval || 10000,
            maxLocksPerAgent: config.maxLocksPerAgent || 10
        };
        this.startCleanup();
    }
    /**
     * Start lock cleanup and deadlock detection
     */
    startCleanup() {
        // Deadlock detection
        this.deadlockCheckInterval = setInterval(() => {
            this.detectDeadlocks();
        }, this.config.deadlockCheckInterval);
        // Expired lock cleanup
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredLocks();
        }, this.config.defaultTimeout);
    }
    /**
     * Acquire a lock
     */
    async acquireLock(request) {
        const startTime = Date.now();
        const lockId = this.generateLockId(request.scope, request.resourceId);
        // Check if lock already exists
        const existingLock = this.locks.get(lockId);
        if (existingLock) {
            // Check if lock is still valid
            if (existingLock.expiresAt.getTime() > Date.now()) {
                // Try to acquire with retry
                const acquiredLock = await this.retryAcquire(request, startTime);
                if (acquiredLock) {
                    this.lockWaitTimes.push(Date.now() - startTime);
                    return acquiredLock;
                }
                return null;
            }
        }
        // Check agent lock limit
        const agentLocks = this.getLocksByAgent(request.agentId);
        if (agentLocks.length >= this.config.maxLocksPerAgent) {
            this.emit('lock_limit_exceeded', {
                agentId: request.agentId,
                currentLocks: agentLocks.length,
                maxLocks: this.config.maxLocksPerAgent
            });
            return null;
        }
        // Create lock
        const lock = this.createLock(request);
        this.locks.set(lockId, lock);
        this.emit('lock_acquired', {
            lockId,
            scope: lock.scope,
            resourceId: lock.resourceId,
            agentId: lock.agentId
        });
        this.lockWaitTimes.push(Date.now() - startTime);
        return lock;
    }
    /**
     * Release a lock
     */
    releaseLock(lockId, agentId) {
        const lock = this.locks.get(lockId);
        if (!lock) {
            return false;
        }
        // Verify agent owns the lock
        if (lock.agentId !== agentId) {
            this.emit('lock_release_denied', {
                lockId,
                requestingAgent: agentId,
                owningAgent: lock.agentId
            });
            return false;
        }
        this.locks.delete(lockId);
        this.releasedCount++;
        this.emit('lock_released', {
            lockId,
            scope: lock.scope,
            resourceId: lock.resourceId,
            agentId: lock.agentId,
            duration: Date.now() - lock.acquiredAt.getTime()
        });
        // Check pending requests for this resource
        this.processPendingRequests(lock.scope, lock.resourceId);
        return true;
    }
    /**
     * Release all locks for an agent
     */
    releaseAgentLocks(agentId) {
        const agentLocks = this.getLocksByAgent(agentId);
        let released = 0;
        agentLocks.forEach((lock) => {
            if (this.releaseLock(this.getLockId(lock.scope, lock.resourceId), agentId)) {
                released++;
            }
        });
        return released;
    }
    /**
     * Check if resource is locked
     */
    isLocked(scope, resourceId) {
        const lockId = this.generateLockId(scope, resourceId);
        const lock = this.locks.get(lockId);
        return lock !== undefined && lock.expiresAt.getTime() > Date.now();
    }
    /**
     * Check if agent owns the lock
     */
    ownsLock(lockId, agentId) {
        const lock = this.locks.get(lockId);
        return lock !== undefined && lock.agentId === agentId;
    }
    /**
     * Get all active locks
     */
    getActiveLocks() {
        const now = Date.now();
        return Array.from(this.locks.values()).filter((lock) => lock.expiresAt.getTime() > now);
    }
    /**
     * Get locks by agent
     */
    getLocksByAgent(agentId) {
        return this.getActiveLocks().filter((lock) => lock.agentId === agentId);
    }
    /**
     * Get concurrency metrics
     */
    getMetrics() {
        const activeLocks = this.getActiveLocks();
        const scopeCounts = {};
        activeLocks.forEach((lock) => {
            scopeCounts[lock.scope] = (scopeCounts[lock.scope] || 0) + 1;
        });
        // Find contention hotspots (>3 locks on same scope:resource)
        const contentionHotspots = [];
        const scopeResourceCounts = {};
        activeLocks.forEach((lock) => {
            const key = `${lock.scope}:${lock.resourceId}`;
            scopeResourceCounts[key] = (scopeResourceCounts[key] || 0) + 1;
        });
        Object.entries(scopeResourceCounts).forEach(([key, count]) => {
            if (count > 3) {
                contentionHotspots.push(key);
            }
        });
        const avgWaitTime = this.lockWaitTimes.length > 0
            ? this.lockWaitTimes.reduce((a, b) => a + b, 0) / this.lockWaitTimes.length
            : 0;
        return {
            activeLocks: activeLocks.length,
            pendingRequests: this.getPendingRequestCount(),
            deadlocksDetected: this.deadlockCount,
            locksReleased: this.releasedCount,
            averageWaitTime: avgWaitTime,
            contentionHotspots
        };
    }
    /**
     * Detect deadlocks
     */
    detectDeadlocks() {
        const activeLocks = this.getActiveLocks();
        if (activeLocks.length < 2)
            return null;
        // Build wait-for graph
        const waitFor = new Map();
        activeLocks.forEach((lock) => {
            waitFor.set(lock.id, []);
        });
        // Check for circular dependencies
        const visited = new Set();
        const recursionStack = new Set();
        const detectCycle = (node, path) => {
            if (recursionStack.has(node)) {
                const cycleStart = path.indexOf(node);
                return path.slice(cycleStart);
            }
            if (visited.has(node)) {
                return null;
            }
            visited.add(node);
            recursionStack.add(node);
            path.push(node);
            const neighbors = waitFor.get(node) || [];
            for (const neighbor of neighbors) {
                const cycle = detectCycle(neighbor, [...path]);
                if (cycle) {
                    return cycle;
                }
            }
            recursionStack.delete(node);
            return null;
        };
        for (const lock of activeLocks) {
            const cycle = detectCycle(lock.id, []);
            if (cycle) {
                this.deadlockCount++;
                // Resolve by timing out oldest lock
                const oldestLock = activeLocks
                    .filter((l) => cycle.includes(l.id))
                    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime())[0];
                if (oldestLock) {
                    const resolved = this.forceRelease(oldestLock.id);
                    if (resolved) {
                        this.emit('deadlock_resolved', {
                            cycle,
                            resolvedLock: oldestLock.id,
                            resolution: 'timeout'
                        });
                    }
                }
                return {
                    detected: true,
                    involvedLocks: cycle,
                    cycle,
                    resolution: 'timeout',
                    timestamp: new Date()
                };
            }
        }
        return null;
    }
    /**
     * Force release a lock (for deadlock resolution)
     */
    forceRelease(lockId) {
        const lock = this.locks.get(lockId);
        if (!lock)
            return false;
        this.locks.delete(lockId);
        this.releasedCount++;
        this.emit('lock_force_released', {
            lockId,
            reason: 'deadlock_resolution',
            scope: lock.scope,
            resourceId: lock.resourceId,
            agentId: lock.agentId
        });
        return true;
    }
    /**
     * Cleanup expired locks
     */
    cleanupExpiredLocks() {
        const now = Date.now();
        const expiredIds = [];
        this.locks.forEach((lock, lockId) => {
            if (lock.expiresAt.getTime() < now) {
                expiredIds.push(lockId);
            }
        });
        expiredIds.forEach((lockId) => {
            const lock = this.locks.get(lockId);
            if (lock) {
                this.emit('lock_expired', {
                    lockId,
                    scope: lock.scope,
                    resourceId: lock.resourceId,
                    agentId: lock.agentId
                });
                this.locks.delete(lockId);
                this.releasedCount++;
            }
        });
    }
    /**
     * Process pending requests for a resource
     */
    processPendingRequests(scope, resourceId) {
        const key = `${scope}:${resourceId}`;
        const pending = this.pendingRequests.get(key) || [];
        this.pendingRequests.delete(key);
        pending.forEach((request) => {
            this.emit('pending_request_processed', request);
        });
    }
    /**
     * Retry lock acquisition
     */
    async retryAcquire(request, startTime) {
        let attempts = 0;
        while (attempts < this.config.maxRetries) {
            // Wait before retry
            await this.delay(this.config.retryInterval);
            // Check if lock is still held
            const lockId = this.generateLockId(request.scope, request.resourceId);
            const existingLock = this.locks.get(lockId);
            if (!existingLock || existingLock.expiresAt.getTime() < Date.now()) {
                // Lock available, acquire it
                const lock = this.createLock(request);
                this.locks.set(lockId, lock);
                return lock;
            }
            attempts++;
            // Check timeout
            if (Date.now() - startTime > this.config.maxTimeout) {
                this.emit('lock_acquisition_timeout', {
                    scope: request.scope,
                    resourceId: request.resourceId,
                    agentId: request.agentId,
                    attempts
                });
                return null;
            }
        }
        this.emit('lock_acquisition_max_retries', {
            scope: request.scope,
            resourceId: request.resourceId,
            agentId: request.agentId,
            attempts
        });
        return null;
    }
    /**
     * Create lock from request
     */
    createLock(request) {
        const timeout = Math.min(request.timeout || this.config.defaultTimeout, this.config.maxTimeout);
        return {
            id: this.generateLockId(request.scope, request.resourceId),
            scope: request.scope,
            resourceId: request.resourceId,
            agentId: request.agentId,
            acquiredAt: new Date(),
            expiresAt: new Date(Date.now() + timeout),
            metadata: request.metadata
        };
    }
    /**
     * Generate lock ID
     */
    generateLockId(scope, resourceId) {
        return `${scope}:${resourceId}`;
    }
    /**
     * Get lock ID
     */
    getLockId(scope, resourceId) {
        return `${scope}:${resourceId}`;
    }
    /**
     * Get pending request count
     */
    getPendingRequestCount() {
        let count = 0;
        this.pendingRequests.forEach((requests) => {
            count += requests.length;
        });
        return count;
    }
    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        if (this.deadlockCheckInterval) {
            clearInterval(this.deadlockCheckInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // Release all locks
        this.locks.clear();
        this.pendingRequests.clear();
        this.lockWaitTimes = [];
        this.emit('shutdown');
    }
}
/**
 * Singleton instance
 */
let instance = null;
function getConcurrencyManager() {
    if (!instance) {
        instance = new ConcurrencyManager();
    }
    return instance;
}
function createConcurrencyManager(config) {
    return new ConcurrencyManager(config);
}
//# sourceMappingURL=index.js.map