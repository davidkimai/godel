/**
 * Correlation Context for Distributed Tracing
 *
 * Provides AsyncLocalStorage-based context propagation for correlation IDs,
 * enabling request tracing across async boundaries.
 *
 * @module core/reliability/correlation-context
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface CorrelationContext {
  /** Unique correlation ID for the request/operation */
  correlationId: string;
  /** Parent correlation ID for nested operations */
  parentCorrelationId?: string;
  /** Request ID from external systems */
  requestId?: string;
  /** User ID associated with the request */
  userId?: string;
  /** Session ID for user sessions */
  sessionId?: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Span ID for the current operation */
  spanId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp when context was created */
  timestamp: Date;
}

// AsyncLocalStorage for correlation context
const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Generate a unique correlation ID
 */
export function generateCorrelationId(): string {
  return `corr-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Generate a unique span ID
 */
export function generateSpanId(): string {
  return `span-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Generate a unique trace ID
 */
export function generateTraceId(): string {
  return `trace-${randomUUID().replace(/-/g, '')}`;
}

/**
 * Create a new correlation context
 */
export function createCorrelationContext(
  overrides: Partial<CorrelationContext> = {}
): CorrelationContext {
  const parentContext = correlationStorage.getStore();
  
  return {
    correlationId: overrides.correlationId || generateCorrelationId(),
    parentCorrelationId: overrides.parentCorrelationId || parentContext?.correlationId,
    requestId: overrides.requestId || parentContext?.requestId,
    userId: overrides.userId || parentContext?.userId,
    sessionId: overrides.sessionId || parentContext?.sessionId,
    traceId: overrides.traceId || parentContext?.traceId || generateTraceId(),
    spanId: overrides.spanId || generateSpanId(),
    metadata: {
      ...parentContext?.metadata,
      ...overrides.metadata,
    },
    timestamp: new Date(),
  };
}

/**
 * Get the current correlation context
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

/**
 * Get the current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}

/**
 * Get the current trace ID
 */
export function getTraceId(): string | undefined {
  return correlationStorage.getStore()?.traceId;
}

/**
 * Run a function within a correlation context
 */
export function runWithContext<T>(
  context: CorrelationContext,
  fn: () => T | Promise<T>
): Promise<T> {
  return correlationStorage.run(context, fn) as Promise<T>;
}

/**
 * Run a function within a new correlation context
 */
export function runWithNewContext<T>(
  fn: () => T | Promise<T>,
  overrides?: Partial<CorrelationContext>
): Promise<T> {
  const context = createCorrelationContext(overrides);
  return runWithContext(context, fn);
}

/**
 * Run a function within a child correlation context
 */
export function runWithChildContext<T>(
  fn: () => T | Promise<T>,
  overrides?: Partial<CorrelationContext>
): Promise<T> {
  const parentContext = correlationStorage.getStore();
  
  const childContext: CorrelationContext = {
    correlationId: generateCorrelationId(),
    parentCorrelationId: parentContext?.correlationId,
    requestId: overrides?.requestId || parentContext?.requestId,
    userId: overrides?.userId || parentContext?.userId,
    sessionId: overrides?.sessionId || parentContext?.sessionId,
    traceId: overrides?.traceId || parentContext?.traceId || generateTraceId(),
    spanId: generateSpanId(),
    metadata: {
      ...parentContext?.metadata,
      ...overrides?.metadata,
    },
    timestamp: new Date(),
  };
  
  return runWithContext(childContext, fn);
}

/**
 * Middleware for Express/Fastify to extract correlation IDs from headers
 */
export function correlationMiddleware(options: {
  headerName?: string;
  traceHeaderName?: string;
  requestHeaderName?: string;
} = {}) {
  const {
    headerName = 'x-correlation-id',
    traceHeaderName = 'x-trace-id',
    requestHeaderName = 'x-request-id',
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: any, res: any, next: any): Promise<void> => {
    const correlationId = req.headers[headerName] || generateCorrelationId();
    const traceId = req.headers[traceHeaderName] || generateTraceId();
    const requestId = req.headers[requestHeaderName];

    const context: CorrelationContext = {
      correlationId: String(correlationId),
      traceId: String(traceId),
      requestId: requestId ? String(requestId) : undefined,
      timestamp: new Date(),
    };

    // Set response headers for correlation
    res.setHeader(headerName, context.correlationId);
    res.setHeader(traceHeaderName, context.traceId);

    await runWithContext(context, async () => {
      if (typeof next === 'function') {
        return next();
      }
    });
  };
}

/**
 * Correlation context manager for advanced use cases
 */
export class CorrelationContextManager {
  private storage = correlationStorage;

  /**
   * Get current context
   */
  getContext(): CorrelationContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Run function with context
   */
  run<T>(context: CorrelationContext, fn: () => T | Promise<T>): Promise<T> {
    return this.storage.run(context, fn) as Promise<T>;
  }

  /**
   * Create a new context and run function
   */
  runNew<T>(fn: () => T | Promise<T>, overrides?: Partial<CorrelationContext>): Promise<T> {
    const context = createCorrelationContext(overrides);
    return this.run(context, fn);
  }

  /**
   * Create a child context and run function
   */
  runChild<T>(fn: () => T | Promise<T>, overrides?: Partial<CorrelationContext>): Promise<T> {
    return runWithChildContext(fn, overrides);
  }

  /**
   * Bind a function to the current context
   */
  bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    const context = this.storage.getStore();
    if (!context) {
      return fn;
    }

    return ((...args: unknown[]) => {
      return this.storage.run(context, () => fn(...args));
    }) as T;
  }

  /**
   * Bind an event emitter to propagate context
   */
  bindEmitter(emitter: NodeJS.EventEmitter): void {
    const context = this.storage.getStore();
    if (!context) {
      return;
    }

    const originalEmit = emitter.emit.bind(emitter);
    emitter.emit = (...args: unknown[]) => {
      return this.storage.run(context, () => originalEmit(...args));
    };
  }
}

/**
 * Create context from HTTP headers
 */
export function contextFromHeaders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  headers: Record<string, any>
): CorrelationContext {
  const normalizedHeaders: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = String(value);
  }

  return {
    correlationId: normalizedHeaders['x-correlation-id'] || generateCorrelationId(),
    traceId: normalizedHeaders['x-trace-id'] || generateTraceId(),
    requestId: normalizedHeaders['x-request-id'],
    sessionId: normalizedHeaders['x-session-id'],
    spanId: generateSpanId(),
    timestamp: new Date(),
  };
}

/**
 * Convert context to HTTP headers
 */
export function contextToHeaders(
  context: CorrelationContext
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-correlation-id': context.correlationId,
    'x-trace-id': context.traceId || '',
    'x-span-id': context.spanId || '',
  };

  if (context.requestId) {
    headers['x-request-id'] = context.requestId;
  }
  if (context.sessionId) {
    headers['x-session-id'] = context.sessionId;
  }
  if (context.parentCorrelationId) {
    headers['x-parent-correlation-id'] = context.parentCorrelationId;
  }

  return headers;
}

export default {
  correlationStorage,
  generateCorrelationId,
  generateSpanId,
  generateTraceId,
  createCorrelationContext,
  getCorrelationContext,
  getCorrelationId,
  getTraceId,
  runWithContext,
  runWithNewContext,
  runWithChildContext,
  correlationMiddleware,
  CorrelationContextManager,
  contextFromHeaders,
  contextToHeaders,
};
