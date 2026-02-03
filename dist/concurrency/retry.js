"use strict";
/**
 * Dash Retry Mechanisms - Exponential Backoff & Circuit Breaker
 *
 * PRD Section 2.7: Race Condition Handling
 *
 * Features:
 * - Exponential backoff with jitter
 * - Max retry attempts
 * - Retryable error detection
 * - Circuit breaker pattern
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bulkhead = exports.CircuitBreaker = exports.DEFAULT_CIRCUIT_BREAKER_CONFIG = exports.DEFAULT_RETRY_CONFIG = void 0;
exports.retry = retry;
exports.getDefaultCircuitBreaker = getDefaultCircuitBreaker;
const events_1 = require("events");
exports.DEFAULT_RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    jitterFactor: 0.3,
    backoffMultiplier: 2,
    retryableStatuses: [429, 500, 502, 503, 504],
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND']
};
exports.DEFAULT_CIRCUIT_BREAKER_CONFIG = {
    failureThreshold: 5,
    successThreshold: 3,
    timeWindow: 60000,
    halfOpenMaxRequests: 3
};
/**
 * Retry with exponential backoff
 */
async function retry(operation, config) {
    const cfg = { ...exports.DEFAULT_RETRY_CONFIG, ...config };
    const startTime = Date.now();
    let attempts = 0;
    let lastError;
    while (attempts < cfg.maxAttempts) {
        attempts++;
        try {
            const data = await operation();
            return {
                success: true,
                data,
                attempts,
                totalTime: Date.now() - startTime,
                finalAttempt: attempts === cfg.maxAttempts
            };
        }
        catch (error) {
            lastError = error;
            // Check if error is retryable
            if (!isRetryable(error, cfg)) {
                return {
                    success: false,
                    error,
                    attempts,
                    totalTime: Date.now() - startTime,
                    finalAttempt: true
                };
            }
            // Check if last attempt
            if (attempts >= cfg.maxAttempts) {
                return {
                    success: false,
                    error,
                    attempts,
                    totalTime: Date.now() - startTime,
                    finalAttempt: true
                };
            }
            // Calculate delay with jitter
            const delay = calculateDelay(attempts, cfg);
            await sleep(delay);
        }
    }
    return {
        success: false,
        error: lastError,
        attempts,
        totalTime: Date.now() - startTime,
        finalAttempt: true
    };
}
/**
 * Circuit Breaker implementation
 */
class CircuitBreaker extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.requests = [];
        this.config = { ...exports.DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
        this.state = {
            state: 'closed',
            failureCount: 0,
            successCount: 0,
            lastFailureTime: null,
            nextAttempt: null
        };
    }
    /**
     * Execute operation with circuit breaker protection
     */
    async execute(operation) {
        // Check if circuit is open
        if (this.state.state === 'open') {
            if (this.state.nextAttempt && Date.now() < this.state.nextAttempt.getTime()) {
                return {
                    success: false,
                    error: new Error('Circuit breaker is open'),
                    circuitState: this.getState(),
                    fromCache: false
                };
            }
            // Try half-open
            this.state.state = 'half-open';
            this.state.successCount = 0;
            this.emit('state_change', { from: 'open', to: 'half-open' });
        }
        // Check half-open request limit
        if (this.state.state === 'half-open') {
            const recentRequests = this.getRecentRequests();
            if (recentRequests.length >= this.config.halfOpenMaxRequests) {
                return {
                    success: false,
                    error: new Error('Circuit breaker half-open request limit reached'),
                    circuitState: this.getState(),
                    fromCache: false
                };
            }
        }
        try {
            const data = await operation();
            this.recordSuccess();
            return {
                success: true,
                data,
                circuitState: this.getState(),
                fromCache: false
            };
        }
        catch (error) {
            this.recordFailure();
            return {
                success: false,
                error,
                circuitState: this.getState(),
                fromCache: false
            };
        }
    }
    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Force circuit open
     */
    forceOpen() {
        this.state.state = 'open';
        this.state.nextAttempt = new Date(Date.now() + this.config.timeWindow);
        this.emit('state_change', { to: 'open', reason: 'forced' });
    }
    /**
     * Force circuit closed
     */
    forceClose() {
        this.state.state = 'closed';
        this.state.failureCount = 0;
        this.state.successCount = 0;
        this.state.nextAttempt = null;
        this.emit('state_change', { to: 'closed', reason: 'forced' });
    }
    /**
     * Reset circuit breaker
     */
    reset() {
        this.state = {
            state: 'closed',
            failureCount: 0,
            successCount: 0,
            lastFailureTime: null,
            nextAttempt: null
        };
        this.requests = [];
        this.emit('reset');
    }
    /**
     * Record success
     */
    recordSuccess() {
        this.requests.push({ timestamp: new Date(), success: true });
        this.state.successCount++;
        if (this.state.state === 'half-open') {
            if (this.state.successCount >= this.config.successThreshold) {
                this.state.state = 'closed';
                this.state.failureCount = 0;
                this.state.nextAttempt = null;
                this.emit('state_change', { from: 'half-open', to: 'closed' });
            }
        }
        this.cleanupOldRequests();
    }
    /**
     * Record failure
     */
    recordFailure() {
        this.requests.push({ timestamp: new Date(), success: false });
        this.state.failureCount++;
        this.state.lastFailureTime = new Date();
        if (this.state.state === 'closed') {
            if (this.state.failureCount >= this.config.failureThreshold) {
                this.state.state = 'open';
                this.state.nextAttempt = new Date(Date.now() + this.config.timeWindow);
                this.emit('state_change', { from: 'closed', to: 'open' });
            }
        }
        else if (this.state.state === 'half-open') {
            this.state.state = 'open';
            this.state.nextAttempt = new Date(Date.now() + this.config.timeWindow);
            this.emit('state_change', { from: 'half-open', to: 'open' });
        }
        this.cleanupOldRequests();
    }
    /**
     * Get recent requests within time window
     */
    getRecentRequests() {
        const cutoff = new Date(Date.now() - this.config.timeWindow);
        return this.requests.filter((r) => r.timestamp > cutoff);
    }
    /**
     * Cleanup old requests
     */
    cleanupOldRequests() {
        const cutoff = new Date(Date.now() - this.config.timeWindow);
        this.requests = this.requests.filter((r) => r.timestamp > cutoff);
    }
}
exports.CircuitBreaker = CircuitBreaker;
/**
 * Bulkhead pattern - limit concurrent operations
 */
class Bulkhead extends events_1.EventEmitter {
    constructor(maxConcurrent = 10) {
        super();
        this.currentConcurrent = 0;
        this.queue = [];
        this.processing = 0;
        this.maxConcurrent = maxConcurrent;
    }
    /**
     * Execute with bulkhead protection
     */
    async execute(operation) {
        if (this.currentConcurrent < this.maxConcurrent) {
            return this.runOperation(operation);
        }
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await this.runOperation(operation);
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
        });
    }
    /**
     * Run the actual operation
     */
    async runOperation(operation) {
        this.currentConcurrent++;
        this.processing++;
        try {
            return await operation();
        }
        finally {
            this.currentConcurrent--;
            this.processing--;
            this.processQueue();
        }
    }
    /**
     * Process queued operations
     */
    processQueue() {
        if (this.queue.length > 0 && this.currentConcurrent < this.maxConcurrent) {
            const next = this.queue.shift();
            if (next) {
                this.runOperation(next);
            }
        }
    }
    /**
     * Get metrics
     */
    getMetrics() {
        return {
            maxConcurrent: this.maxConcurrent,
            currentConcurrent: this.currentConcurrent,
            queued: this.queue.length,
            utilization: this.currentConcurrent / this.maxConcurrent
        };
    }
}
exports.Bulkhead = Bulkhead;
/**
 * Check if error is retryable
 */
function isRetryable(error, config) {
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const err = error;
    // Check status code
    const status = err['status'];
    if (typeof status === 'number' && config.retryableStatuses.includes(status)) {
        return true;
    }
    // Check error code
    const code = err['code'];
    if (typeof code === 'string' && config.retryableErrors.includes(code)) {
        return true;
    }
    // Check error message
    const message = typeof err['message'] === 'string' ? err['message'] : '';
    if (message.includes('timeout') || message.includes('ECONN')) {
        return true;
    }
    return false;
}
/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt, config) {
    const baseDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const jitter = baseDelay * config.jitterFactor * Math.random();
    return Math.min(baseDelay + jitter, config.maxDelay);
}
/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Singleton circuit breaker for common use
 */
let defaultCircuitBreaker = null;
function getDefaultCircuitBreaker() {
    if (!defaultCircuitBreaker) {
        defaultCircuitBreaker = new CircuitBreaker();
    }
    return defaultCircuitBreaker;
}
//# sourceMappingURL=retry.js.map