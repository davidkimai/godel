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
import { EventEmitter } from 'events';
export interface RetryConfig {
    /** Maximum retry attempts */
    maxAttempts: number;
    /** Base delay in milliseconds */
    baseDelay: number;
    /** Maximum delay in milliseconds */
    maxDelay: number;
    /** Jitter factor (0-1) */
    jitterFactor: number;
    /** Multiplier for exponential backoff */
    backoffMultiplier: number;
    /** Retry on these status codes */
    retryableStatuses: number[];
    /** Retry on these error types */
    retryableErrors: string[];
}
export interface CircuitBreakerConfig {
    /** Number of failures before opening circuit */
    failureThreshold: number;
    /** Success rate percentage to close circuit */
    successThreshold: number;
    /** Time window in milliseconds */
    timeWindow: number;
    /** Half-open max requests */
    halfOpenMaxRequests: number;
}
export interface CircuitState {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    successCount: number;
    lastFailureTime: Date | null;
    nextAttempt: Date | null;
}
export interface RetryResult<T> {
    success: boolean;
    data?: T;
    error?: Error;
    attempts: number;
    totalTime: number;
    finalAttempt: boolean;
}
export interface CircuitBreakerResult<T> {
    success: boolean;
    data?: T;
    error?: Error;
    circuitState: CircuitState;
    fromCache: boolean;
}
export declare const DEFAULT_RETRY_CONFIG: RetryConfig;
export declare const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig;
/**
 * Retry with exponential backoff
 */
export declare function retry<T>(operation: () => Promise<T>, config?: Partial<RetryConfig>): Promise<RetryResult<T>>;
/**
 * Circuit Breaker implementation
 */
export declare class CircuitBreaker extends EventEmitter {
    private config;
    private state;
    private requests;
    constructor(config?: Partial<CircuitBreakerConfig>);
    /**
     * Execute operation with circuit breaker protection
     */
    execute<T>(operation: () => Promise<T>): Promise<CircuitBreakerResult<T>>;
    /**
     * Get current state
     */
    getState(): CircuitState;
    /**
     * Force circuit open
     */
    forceOpen(): void;
    /**
     * Force circuit closed
     */
    forceClose(): void;
    /**
     * Reset circuit breaker
     */
    reset(): void;
    /**
     * Record success
     */
    private recordSuccess;
    /**
     * Record failure
     */
    private recordFailure;
    /**
     * Get recent requests within time window
     */
    private getRecentRequests;
    /**
     * Cleanup old requests
     */
    private cleanupOldRequests;
}
/**
 * Bulkhead pattern - limit concurrent operations
 */
export declare class Bulkhead extends EventEmitter {
    private maxConcurrent;
    private currentConcurrent;
    private queue;
    private processing;
    constructor(maxConcurrent?: number);
    /**
     * Execute with bulkhead protection
     */
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /**
     * Run the actual operation
     */
    private runOperation;
    /**
     * Process queued operations
     */
    private processQueue;
    /**
     * Get metrics
     */
    getMetrics(): {
        maxConcurrent: number;
        currentConcurrent: number;
        queued: number;
        utilization: number;
    };
}
export declare function getDefaultCircuitBreaker(): CircuitBreaker;
//# sourceMappingURL=retry.d.ts.map