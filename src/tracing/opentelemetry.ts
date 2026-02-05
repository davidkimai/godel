/**
 * OpenTelemetry Tracing Configuration
 * 
 * Configures and initializes OpenTelemetry for distributed tracing across
 * Dash services including agent execution, task queue, workflow engine,
 * and database operations.
 */

import { logger } from '../utils/logger';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { trace, context, SpanStatusCode, SpanKind, type Span, type Context, type Tracer } from '@opentelemetry/api';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

// ============================================================================
// Configuration Types
// ============================================================================

export interface TracingConfig {
  /** Service name for trace identification */
  serviceName: string;
  /** Service version */
  serviceVersion: string;
  /** Deployment environment */
  environment: string;
  /** Jaeger agent host */
  jaegerHost: string;
  /** Jaeger agent port */
  jaegerPort: number;
  /** Sampling ratio (0.0 - 1.0) */
  samplingRatio: number;
  /** Enable console span exporter for debugging */
  debug: boolean;
  /** Maximum queue size for batch span processor */
  maxQueueSize: number;
  /** Maximum batch size for export */
  maxExportBatchSize: number;
  /** Export interval in milliseconds */
  scheduledDelayMillis: number;
  /** Enable auto-instrumentation for HTTP */
  enableHttpInstrumentation: boolean;
  /** Enable auto-instrumentation for Redis */
  enableRedisInstrumentation: boolean;
  /** Enable auto-instrumentation for PostgreSQL */
  enablePgInstrumentation: boolean;
}

// Default configuration
const DEFAULT_CONFIG: TracingConfig = {
  serviceName: process.env['OTEL_SERVICE_NAME'] || 'dash-orchestrator',
  serviceVersion: process.env['OTEL_SERVICE_VERSION'] || '2.0.0',
  environment: process.env['NODE_ENV'] || 'development',
  jaegerHost: process.env['JAEGER_AGENT_HOST'] || 'localhost',
  jaegerPort: parseInt(process.env['JAEGER_AGENT_PORT'] || '6832', 10),
  samplingRatio: parseFloat(process.env['OTEL_SAMPLING_RATIO'] || '0.01'),
  debug: process.env['OTEL_DEBUG'] === 'true',
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 5000,
  enableHttpInstrumentation: true,
  enableRedisInstrumentation: true,
  enablePgInstrumentation: true,
};

// ============================================================================
// Global Tracing State
// ============================================================================

let sdk: NodeSDK | null = null;
let tracerProvider: NodeTracerProvider | null = null;
let isInitialized = false;
let config: TracingConfig = DEFAULT_CONFIG;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize OpenTelemetry tracing
 */
export function initializeTracing(userConfig?: Partial<TracingConfig>): void {
  if (isInitialized) {
    logger.warn('[Tracing] OpenTelemetry already initialized');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };

  try {
    // Create resource with service information
    const resource = resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment,
    });

    // Create tracer provider with parent-based sampling
    tracerProvider = new NodeTracerProvider({
      resource,
      sampler: {
        shouldSample: (context, traceId, spanName, spanKind, attributes, links) => {
          // Always sample if trace is already sampled
          const parentSpan = trace.getSpan(context);
          if (parentSpan?.spanContext().traceFlags === 1) {
            return { decision: 1 }; // RECORD_AND_SAMPLED
          }
          
          // Sample based on ratio
          const shouldSample = Math.random() < config.samplingRatio;
          return { decision: shouldSample ? 1 : 0 };
        },
        toString: () => `ParentBasedRatioSampler{ratio=${config.samplingRatio}}`,
      },
    });

    // Configure Jaeger exporter
    const jaegerExporter = new JaegerExporter({
      endpoint: `http://${config.jaegerHost}:${config.jaegerPort}/api/traces`,
    });

    // Create batch span processor for Jaeger
    const spanProcessors: import('@opentelemetry/sdk-trace-base').SpanProcessor[] = [
      new BatchSpanProcessor(jaegerExporter, {
        maxQueueSize: config.maxQueueSize,
        maxExportBatchSize: config.maxExportBatchSize,
        scheduledDelayMillis: config.scheduledDelayMillis,
      }),
    ];

    // Add console exporter for debugging if enabled
    if (config.debug) {
      const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
      spanProcessors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
    }

    // Create tracer provider with span processors
    tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors,
      sampler: {
        shouldSample: (context, traceId, spanName, spanKind, attributes, links) => {
          // Always sample if trace is already sampled
          const parentSpan = trace.getSpan(context);
          if (parentSpan?.spanContext().traceFlags === 1) {
            return { decision: 1 }; // RECORD_AND_SAMPLED
          }
          
          // Sample based on ratio
          const shouldSample = Math.random() < config.samplingRatio;
          return { decision: shouldSample ? 1 : 0 };
        },
        toString: () => `ParentBasedRatioSampler{ratio=${config.samplingRatio}}`,
      },
    });

    // Register tracer provider
    tracerProvider.register();

    // Setup auto-instrumentation
    const instrumentations = [];
    
    if (config.enableHttpInstrumentation) {
      instrumentations.push(new HttpInstrumentation({
        requestHook: (span, request) => {
          const req = request as { headers?: Record<string, string> };
          span.setAttribute('http.request.body.size', req.headers?.['content-length'] || 0);
        },
        responseHook: (span, response) => {
          const res = response as { headers?: Record<string, string> };
          span.setAttribute('http.response.body.size', res.headers?.['content-length'] || 0);
        },
      }));
    }

    if (config.enableRedisInstrumentation) {
      instrumentations.push(new RedisInstrumentation({
        dbStatementSerializer: (cmd, args) => {
          // Sanitize sensitive data in Redis commands
          const sanitizedArgs = args?.map(arg => 
            typeof arg === 'string' && arg.length > 100 ? `${arg.slice(0, 100)}...` : arg
          );
          return `${cmd} ${sanitizedArgs?.join(' ') || ''}`;
        },
      }));
    }

    if (config.enablePgInstrumentation) {
      instrumentations.push(new PgInstrumentation({
        enhancedDatabaseReporting: true,
        responseHook: (span, response) => {
          span.setAttribute('db.rows_affected', response.data.rowCount || 0);
        },
      }));
    }

    // Create SDK with instrumentations
    sdk = new NodeSDK({
      resource,
      traceExporter: jaegerExporter,
      instrumentations,
    });

    // Initialize SDK
    sdk.start();
    isInitialized = true;

    logger.info(`[Tracing] OpenTelemetry initialized (sampling: ${config.samplingRatio * 100}%)`);
    logger.info(`[Tracing] Jaeger exporter: ${config.jaegerHost}:${config.jaegerPort}`);
  } catch (error) {
    logger.error('[Tracing] Failed to initialize OpenTelemetry:', error);
    throw error;
  }
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing(): Promise<void> {
  if (!isInitialized) return;

  try {
    await sdk?.shutdown();
    await tracerProvider?.shutdown();
    isInitialized = false;
    logger.info('[Tracing] OpenTelemetry shutdown complete');
  } catch (error) {
    logger.error('[Tracing] Error during shutdown:', error);
  }
}

/**
 * Get the tracer instance
 */
export function getTracer(name: string = config.serviceName): Tracer {
  return trace.getTracer(name, config.serviceVersion);
}

/**
 * Check if tracing is initialized
 */
export function isTracingInitialized(): boolean {
  return isInitialized;
}

/**
 * Get current configuration
 */
export function getTracingConfig(): TracingConfig {
  return { ...config };
}

// ============================================================================
// Span Creation Helpers
// ============================================================================

export interface SpanOptions {
  name: string;
  kind?: SpanKind;
  parentContext?: Context;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Create a new span with proper parent context
 */
export function createSpan(options: SpanOptions): Span {
  const tracer = getTracer();
  const ctx = options.parentContext || context.active();
  
  return tracer.startSpan(options.name, {
    kind: options.kind || SpanKind.INTERNAL,
    attributes: options.attributes,
  }, ctx);
}

/**
 * Execute a function within a span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
    parentContext?: Context;
  }
): Promise<T> {
  const span = createSpan({
    name,
    kind: options?.kind,
    attributes: options?.attributes,
    parentContext: options?.parentContext,
  });

  const ctx = trace.setSpan(options?.parentContext || context.active(), span);

  try {
    const result = await context.with(ctx, () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
    span.recordException(err);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Execute a synchronous function within a span
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
    parentContext?: Context;
  }
): T {
  const span = createSpan({
    name,
    kind: options?.kind,
    attributes: options?.attributes,
    parentContext: options?.parentContext,
  });

  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
    span.recordException(err);
    throw error;
  } finally {
    span.end();
  }
}

// ============================================================================
// Context Propagation Helpers
// ============================================================================

/**
 * Extract trace context from carrier (e.g., HTTP headers, message metadata)
 */
export function extractContext(carrier: Record<string, string>): Context {
  const propagator = trace.getSpanContext(context.active());
  return context.active(); // Simplified - use W3C propagator for production
}

/**
 * Inject trace context into carrier
 */
export function injectContext(carrier: Record<string, string>): Record<string, string> {
  const span = trace.getSpan(context.active());
  if (span) {
    const spanContext = span.spanContext();
    carrier['traceparent'] = `00-${spanContext.traceId}-${spanContext.spanId}-${
      spanContext.traceFlags.toString(16).padStart(2, '0')
    }`;
  }
  return carrier;
}

/**
 * Get current trace ID for logging correlation
 */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  return span?.spanContext().traceId;
}

/**
 * Get current span ID for logging correlation
 */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getSpan(context.active());
  return span?.spanContext().spanId;
}

// ============================================================================
// Baggage Helpers
// ============================================================================

import { propagation, type Baggage } from '@opentelemetry/api';

/**
 * Set baggage value for cross-cutting concerns
 */
export function setBaggage(key: string, value: string): void {
  const currentBaggage = propagation.getBaggage(context.active()) || propagation.createBaggage();
  const newBaggage = currentBaggage.setEntry(key, { value });
  propagation.setBaggage(context.active(), newBaggage);
}

/**
 * Get baggage value
 */
export function getBaggage(key: string): string | undefined {
  const currentBaggage = propagation.getBaggage(context.active());
  return currentBaggage?.getEntry(key)?.value;
}

/**
 * Create context with baggage
 */
export function createContextWithBaggage(entries: Record<string, string>, parentContext?: Context): Context {
  const baggageEntries: Record<string, { value: string }> = {};
  Object.entries(entries).forEach(([key, value]) => {
    baggageEntries[key] = { value };
  });
  const newBaggage = propagation.createBaggage(baggageEntries);
  return propagation.setBaggage(parentContext || context.active(), newBaggage);
}

// ============================================================================
// Event Context Helpers
// ============================================================================

export interface EventContext {
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
  baggage?: Record<string, string>;
}

/**
 * Serialize current context for event propagation
 */
export function serializeContext(): EventContext {
  const span = trace.getSpan(context.active());
  const spanContext = span?.spanContext();
  const currentBaggage = propagation.getBaggage(context.active());
  
  const baggageEntries: Record<string, string> = {};
  if (currentBaggage) {
    currentBaggage.getAllEntries().forEach(([key, entry]) => {
      baggageEntries[key] = entry.value;
    });
  }

  return {
    traceId: spanContext?.traceId,
    spanId: spanContext?.spanId,
    traceFlags: spanContext?.traceFlags,
    baggage: Object.keys(baggageEntries).length > 0 ? baggageEntries : undefined,
  };
}

/**
 * Deserialize context from event
 */
export function deserializeContext(eventContext: EventContext): Context {
  let ctx = context.active();

  // Restore span context if present
  if (eventContext.traceId && eventContext.spanId) {
    const spanContext = {
      traceId: eventContext.traceId,
      spanId: eventContext.spanId,
      traceFlags: eventContext.traceFlags || 1,
      isRemote: true,
    };
    const span = trace.wrapSpanContext(spanContext);
    ctx = trace.setSpan(ctx, span);
  }

  // Restore baggage if present
  if (eventContext.baggage) {
    ctx = createContextWithBaggage(eventContext.baggage, ctx);
  }

  return ctx;
}

// ============================================================================
// Re-exports
// ============================================================================

export { trace, context, SpanStatusCode, SpanKind };
export type { Span, Context, Tracer };
