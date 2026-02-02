import type { Request, Response, NextFunction } from 'express';
import { ApplicationError } from './custom';
export interface ErrorHandlerOptions {
    /** Include stack traces in responses (default: false in production) */
    includeStackTrace?: boolean;
    /** Log errors to console (default: true) */
    logErrors?: boolean;
    /** Custom logger function */
    logger?: (error: unknown, context?: Record<string, unknown>) => void;
    /** Callback for error metrics/alerts */
    onError?: (error: ApplicationError, req: Request) => void | Promise<void>;
}
interface ErrorMetrics {
    total: number;
    byCode: Record<string, number>;
    byStatus: Record<number, number>;
    operational: number;
    programming: number;
}
export declare function getErrorMetrics(): ErrorMetrics;
export declare function resetErrorMetrics(): void;
export declare function errorHandler(options?: ErrorHandlerOptions): (error: unknown, req: Request, res: Response, _next: NextFunction) => Promise<void>;
export interface CLIOptions {
    /** Exit process on error (default: true) */
    exitOnError?: boolean;
    /** Show verbose output (default: false) */
    verbose?: boolean;
    /** Custom exit code (default: 1) */
    exitCode?: number;
}
export declare function handleCLIError(error: unknown, options?: CLIOptions): void;
export interface BackgroundJobContext {
    jobId: string;
    jobType: string;
    attempt: number;
    maxRetries?: number;
}
export declare function handleBackgroundError(error: unknown, context: BackgroundJobContext, options?: {
    logger?: (msg: string, meta?: unknown) => void;
}): Promise<{
    retry: boolean;
    delay?: number;
}>;
export declare function shouldReportError(error: unknown): boolean;
export interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    retryableErrors?: string[];
    onRetry?: (error: Error, attempt: number) => void;
}
export declare function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
interface CircuitBreakerState {
    failures: number;
    lastFailure: number;
    state: 'closed' | 'open' | 'half-open';
}
export interface CircuitBreakerOptions {
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenMaxCalls?: number;
}
export declare function createCircuitBreaker(name: string, options?: CircuitBreakerOptions): {
    execute<T>(fn: () => Promise<T>): Promise<T>;
    getState(): CircuitBreakerState | undefined;
    reset(): void;
};
export * from './custom';
//# sourceMappingURL=handler.d.ts.map