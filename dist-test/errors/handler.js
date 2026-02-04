"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorMetrics = getErrorMetrics;
exports.resetErrorMetrics = resetErrorMetrics;
exports.errorHandler = errorHandler;
exports.handleCLIError = handleCLIError;
exports.handleBackgroundError = handleBackgroundError;
exports.shouldReportError = shouldReportError;
exports.withRetry = withRetry;
exports.createCircuitBreaker = createCircuitBreaker;
const custom_1 = require("./custom");
const metrics = {
    total: 0,
    byCode: {},
    byStatus: {},
    operational: 0,
    programming: 0,
};
function getErrorMetrics() {
    return { ...metrics };
}
function resetErrorMetrics() {
    metrics.total = 0;
    metrics.byCode = {};
    metrics.byStatus = {};
    metrics.operational = 0;
    metrics.programming = 0;
}
function recordMetric(error) {
    metrics.total++;
    metrics.byCode[error.code] = (metrics.byCode[error.code] || 0) + 1;
    metrics.byStatus[error.statusCode] = (metrics.byStatus[error.statusCode] || 0) + 1;
    if (error.isOperational) {
        metrics.operational++;
    }
    else {
        metrics.programming++;
    }
}
// =============================================================================
// EXPRESS ERROR HANDLER
// =============================================================================
function errorHandler(options = {}) {
    const { includeStackTrace = process.env['NODE_ENV'] !== 'production', logErrors = true, logger = console.error, onError, } = options;
    return async (error, req, res, _next) => {
        // Handle ApplicationErrors
        if (error instanceof custom_1.ApplicationError) {
            // Record metrics
            recordMetric(error);
            // Log error
            if (logErrors) {
                logger(error.toLogEntry(), {
                    path: req.path,
                    method: req.method,
                    query: req.query,
                    body: sanitizeBody(req.body),
                });
            }
            // Callback for alerts/metrics
            if (onError) {
                try {
                    await onError(error, req);
                }
                catch (callbackError) {
                    logger('Error in error callback:', callbackError);
                }
            }
            // Send response
            const response = {
                error: error.code,
                message: error.message,
            };
            if (includeStackTrace && error['stack']) {
                response['stack'] = error['stack'].split('\n');
            }
            if (error['context']) {
                response['context'] = error['context'];
            }
            res.status(error.statusCode).json(response);
            return;
        }
        // Handle validation errors from zod
        if (error instanceof custom_1.ValidationError) {
            if (logErrors) {
                logger('Validation error:', error.message);
            }
            res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: error.message,
                issues: error.issues || [],
            });
            return;
        }
        // Handle unknown errors
        const message = error instanceof Error ? error['message'] : 'Unknown error';
        const stack = error instanceof Error ? error['stack'] : undefined;
        if (logErrors) {
            logger('Unhandled error:', error);
        }
        const response = {
            error: 'INTERNAL_ERROR',
            message: includeStackTrace ? message : 'Internal server error',
        };
        if (includeStackTrace && stack) {
            response['stack'] = stack.split('\n');
        }
        res.status(500).json(response);
    };
}
function handleCLIError(error, options = {}) {
    const { exitOnError = true, verbose = false, exitCode = 1 } = options;
    if (error instanceof custom_1.ApplicationError) {
        console.error(`\n❌  ${error.toCLI()}`);
        if (verbose && error.context) {
            console.error('\nContext:');
            for (const [key, value] of Object.entries(error.context)) {
                console.error(`  ${key}: ${JSON.stringify(value)}`);
            }
        }
        if (verbose && error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
    }
    else if (error instanceof Error) {
        console.error(`\n❌  Error: ${error.message}`);
        if (verbose && error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
    }
    else {
        console.error(`\n❌  Unknown error: ${String(error)}`);
    }
    if (exitOnError) {
        process.exit(exitCode);
    }
}
async function handleBackgroundError(error, context, options = {}) {
    const { logger = console.error } = options;
    const { jobId, jobType, attempt, maxRetries = 3 } = context;
    logger(`Background job error:`, {
        jobId,
        jobType,
        attempt,
        error: error instanceof Error ? error.message : String(error),
    });
    // Determine if we should retry
    if (error instanceof custom_1.ApplicationError) {
        // Don't retry operational errors (client's fault)
        if (error.isOperational) {
            return { retry: false };
        }
        // Retry programming errors with exponential backoff
        if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
            return { retry: true, delay };
        }
    }
    // Unknown errors - retry once
    if (attempt === 1) {
        return { retry: true, delay: 5000 };
    }
    return { retry: false };
}
// =============================================================================
// UTILITIES
// =============================================================================
function sanitizeBody(body) {
    if (!body || typeof body !== 'object')
        return body;
    const sanitized = {};
    for (const [key, value] of Object.entries(body)) {
        // Redact sensitive fields
        if (['password', 'secret', 'token', 'apiKey', 'key'].some(s => key.toLowerCase().includes(s.toLowerCase()))) {
            sanitized[key] = '[REDACTED]';
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
function shouldReportError(error) {
    // Don't report operational errors (expected client errors)
    if ((0, custom_1.isOperationalError)(error)) {
        return false;
    }
    // Report all programming errors
    if ((0, custom_1.isApplicationError)(error)) {
        return true;
    }
    // Report unknown errors
    return true;
}
async function withRetry(fn, options = {}) {
    const { maxRetries = 3, initialDelay = 1000, maxDelay = 30000, backoffMultiplier = 2, retryableErrors, onRetry, } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Check if we should retry
            if (attempt === maxRetries)
                break;
            // Check error code if specified
            if (retryableErrors && error instanceof custom_1.ApplicationError) {
                if (!retryableErrors.includes(error.code)) {
                    throw error;
                }
            }
            // Calculate delay
            const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
            if (onRetry) {
                onRetry(lastError, attempt + 1);
            }
            await sleep(delay);
        }
    }
    throw lastError;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const circuitBreakers = new Map();
function createCircuitBreaker(name, options = {}) {
    const { failureThreshold = 5, resetTimeout = 30000, halfOpenMaxCalls = 3, } = options;
    return {
        async execute(fn) {
            const state = circuitBreakers.get(name) || {
                failures: 0,
                lastFailure: 0,
                state: 'closed',
            };
            // Check if circuit is open
            if (state.state === 'open') {
                const timeSinceLastFailure = Date.now() - state.lastFailure;
                if (timeSinceLastFailure < resetTimeout) {
                    throw new custom_1.ApplicationError(`Circuit breaker open for ${name}`, 'CIRCUIT_OPEN', 503, { service: name, retryAfter: Math.ceil((resetTimeout - timeSinceLastFailure) / 1000) });
                }
                // Transition to half-open
                state.state = 'half-open';
            }
            try {
                const result = await fn();
                // Success - reset if in half-open
                if (state.state === 'half-open') {
                    state.failures = 0;
                    state.state = 'closed';
                }
                circuitBreakers.set(name, state);
                return result;
            }
            catch (error) {
                state.failures++;
                state.lastFailure = Date.now();
                if (state.failures >= failureThreshold) {
                    state.state = 'open';
                }
                circuitBreakers.set(name, state);
                throw error;
            }
        },
        getState() {
            return circuitBreakers.get(name);
        },
        reset() {
            circuitBreakers.delete(name);
        },
    };
}
// =============================================================================
// RE-EXPORTS
// =============================================================================
__exportStar(require("./custom"), exports);
