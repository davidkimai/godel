/**
 * Event Bus Tracing Instrumentation
 * 
 * Instruments the event bus for distributed tracing.
 * Tracks event publish and subscribe operations with proper
 * trace context propagation.
 */

import { SpanKind, type Context } from '@opentelemetry/api';
import { 
  withSpan, 
  setBaggage, 
  getBaggage,
  serializeContext,
  deserializeContext,
  getCurrentTraceId,
  injectContext,
  extractContext,
  type EventContext 
} from './opentelemetry';
import { logger } from '../utils/logger';
import type { AgentEvent, AgentEventType } from '../core/event-bus';

// ============================================================================
// Types
// ============================================================================

export interface EventTraceContext {
  eventId: string;
  eventType: AgentEventType;
  agentId: string;
  traceContext: EventContext;
}

// ============================================================================
// Span Names
// ============================================================================

const SPAN_NAMES = {
  EVENT_PUBLISH: 'event.publish',
  EVENT_SUBSCRIBE: 'event.subscribe',
  EVENT_PROCESS: 'event.process',
  EVENT_DELIVER: 'event.deliver',
  EVENT_BUS_EMIT: 'event_bus.emit',
  EVENT_BUS_RECEIVE: 'event_bus.receive',
} as const;

// ============================================================================
// Event Bus Instrumentation
// ============================================================================

/**
 * Instrument event publish operation
 */
export async function instrumentEventPublish<T>(
  eventType: AgentEventType,
  agentId: string,
  fn: () => Promise<T>,
  options?: {
    swarmId?: string;
    sessionId?: string;
    correlationId?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }
): Promise<T> {
  const attributes = {
    'event.type': eventType,
    'event.agent_id': agentId,
    'event.swarm_id': options?.swarmId || '',
    'event.session_id': options?.sessionId || '',
    'event.correlation_id': options?.correlationId || '',
    'event.priority': options?.priority || 'medium',
  };

  // Set baggage for context propagation
  setBaggage('event.type', eventType);
  setBaggage('event.agent_id', agentId);
  if (options?.correlationId) {
    setBaggage('event.correlation_id', options.correlationId);
  }

  return withSpan(SPAN_NAMES.EVENT_PUBLISH, async (span) => {
    span.setAttributes(attributes);

    try {
      // Inject trace context into carrier for propagation
      const carrier: Record<string, string> = {};
      injectContext(carrier);
      
      const result = await fn();
      
      span.setAttributes({
        'event.publish_success': true,
        'event.traceparent': carrier['traceparent'] || '',
      });
      
      return result;
    } catch (error) {
      span.setAttributes({
        'event.publish_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  }, {
    kind: SpanKind.PRODUCER,
    attributes,
  });
}

/**
 * Instrument event subscription
 */
export function instrumentEventSubscription(
  eventTypes: AgentEventType[],
  handlerId: string,
  fn: () => void
): void {
  const { trace } = require('@opentelemetry/api');
  const tracer = trace.getTracer('dash-event-bus');
  
  const span = tracer.startSpan(SPAN_NAMES.EVENT_SUBSCRIBE, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'subscription.handler_id': handlerId,
      'subscription.event_types': eventTypes.join(','),
      'subscription.event_count': eventTypes.length,
    },
  });
  
  try {
    fn();
    span.setAttribute('subscription.success', true);
  } catch (error) {
    span.setAttributes({
      'subscription.success': false,
      'error.type': error instanceof Error ? error.name : 'Unknown',
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Instrument event processing (handler execution)
 */
export async function instrumentEventProcessing<T>(
  event: AgentEvent,
  handlerId: string,
  fn: () => Promise<T>,
  parentContext?: Context
): Promise<T> {
  const attributes = {
    'event.id': event.id,
    'event.type': event.type,
    'event.agent_id': event.agentId,
    'event.swarm_id': event['swarmId'] || '',
    'event.session_id': event['sessionId'] || '',
    'event.correlation_id': event['correlationId'] || '',
    'event.timestamp': event.timestamp,
    'handler.id': handlerId,
  };

  // Set baggage from event
  setBaggage('event.type', event.type);
  setBaggage('event.agent_id', event.agentId);
  if (event['correlationId']) {
    setBaggage('event.correlation_id', event['correlationId']);
  }

  return withSpan(SPAN_NAMES.EVENT_PROCESS, async (span) => {
    span.setAttributes(attributes);

    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'event.processing_duration_ms': duration,
        'event.processing_success': true,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'event.processing_duration_ms': duration,
        'event.processing_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      
      throw error;
    }
  }, {
    kind: SpanKind.CONSUMER,
    parentContext,
    attributes,
  });
}

/**
 * Instrument event delivery to subscribers
 */
export async function instrumentEventDelivery<T>(
  eventId: string,
  eventType: string,
  subscriberCount: number,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.EVENT_DELIVER, async (span) => {
    span.setAttributes({
      'event.id': eventId,
      'event.type': eventType,
      'delivery.subscriber_count': subscriberCount,
    });

    try {
      const result = await fn();
      span.setAttribute('delivery.success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'delivery.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

// ============================================================================
// Redis Event Bus Instrumentation
// ============================================================================

/**
 * Instrument Redis event bus emit
 */
export async function instrumentRedisEventEmit<T>(
  event: AgentEvent,
  nodeId: string,
  fn: () => Promise<T>
): Promise<T> {
  const attributes = {
    'event.id': event.id,
    'event.type': event.type,
    'event.agent_id': event.agentId,
    'event.node_id': nodeId,
    'event.compressed': false, // Would be set based on actual compression
  };

  return withSpan(SPAN_NAMES.EVENT_BUS_EMIT, async (span) => {
    span.setAttributes(attributes);

    try {
      const result = await fn();
      span.setAttribute('emit.success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'emit.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument Redis event bus receive
 */
export async function instrumentRedisEventReceive<T>(
  eventId: string,
  eventType: string,
  sourceNodeId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.EVENT_BUS_RECEIVE, async (span) => {
    span.setAttributes({
      'event.id': eventId,
      'event.type': eventType,
      'event.source_node_id': sourceNodeId,
      'receive.node_id': '', // Would be set from RedisEventBus
    });

    try {
      const result = await fn();
      span.setAttribute('receive.success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'receive.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

// ============================================================================
// Trace Context for Events
// ============================================================================

/**
 * Create trace context for event
 */
export function createEventTraceContext(
  event: AgentEvent
): EventTraceContext {
  return {
    eventId: event.id,
    eventType: event.type,
    agentId: event.agentId,
    traceContext: serializeContext(),
  };
}

/**
 * Restore trace context from event
 */
export function restoreEventTraceContext(ctx: EventTraceContext): Context {
  const restoredContext = deserializeContext(ctx.traceContext);
  
  // Set event baggage
  setBaggage('event.type', ctx.eventType);
  setBaggage('event.agent_id', ctx.agentId);
  
  return restoredContext;
}

/**
 * Extract trace context from event metadata
 */
export function extractTraceContextFromEvent(
  event: AgentEvent & { traceContext?: EventContext }
): Context | undefined {
  if (event.traceContext) {
    return deserializeContext(event.traceContext);
  }
  return undefined;
}

/**
 * Inject trace context into event
 */
export function injectTraceContextIntoEvent<T extends AgentEvent>(
  event: T
): T & { traceContext: EventContext } {
  return {
    ...event,
    traceContext: serializeContext(),
  };
}

// ============================================================================
// Message Bus Integration
// ============================================================================

/**
 * Create traced message bus publish
 * Wraps the MessageBus.publish method with tracing
 */
export function createTracedMessageBusPublish<T extends (...args: unknown[]) => unknown>(
  originalPublish: T
): T {
  return (async (topic: string, message: unknown, metadata?: Record<string, unknown>) => {
    const eventType = (message as { eventType?: string })?.eventType || 'unknown';
    const agentId = (message as { source?: { agentId?: string } })?.source?.agentId || 'unknown';
    
    return instrumentEventPublish(
      eventType as AgentEventType,
      agentId,
      async () => {
        // Inject trace context into message
        const tracedMessage = {
          ...message as Record<string, unknown>,
          _traceContext: serializeContext(),
        };
        
        return (originalPublish as Function)(topic, tracedMessage, metadata);
      },
      {
        priority: metadata?.["priority"] as 'low' | 'medium' | 'high' | 'critical',
      }
    );
  }) as T;
}

/**
 * Create traced message bus subscribe
 * Wraps the MessageBus.subscribe method with tracing
 */
export function createTracedMessageBusSubscribe<T extends (...args: unknown[]) => unknown>(
  originalSubscribe: T
): T {
  return ((topic: string, handler: (message: unknown) => void | Promise<void>) => {
    const tracedHandler = async (message: unknown) => {
      const msg = message as { 
        eventType?: string; 
        source?: { agentId?: string };
        _traceContext?: EventContext;
      };
      
      const eventType = msg?.eventType as AgentEventType || 'unknown';
      const agentId = msg?.source?.agentId || 'unknown';
      
      // Restore trace context if present
      let parentContext: Context | undefined;
      if (msg?._traceContext) {
        parentContext = deserializeContext(msg._traceContext);
      }
      
      return instrumentEventProcessing(
        {
          id: 'msg_' + Date.now(),
          type: eventType,
          agentId,
          timestamp: Date.now(),
        } as AgentEvent,
        'message_bus_handler',
        async () => {
          // Remove trace context from message before passing to handler
          const { _traceContext, ...cleanMessage } = message as Record<string, unknown>;
          return handler(cleanMessage as unknown);
        },
        parentContext
      );
    };
    
    return (originalSubscribe as Function)(topic, tracedHandler);
  }) as T;
}

// ============================================================================
// Logging with Trace Correlation
// ============================================================================

/**
 * Log event with trace correlation
 */
export function logEvent(
  eventType: string,
  eventId: string,
  agentId: string,
  data?: Record<string, unknown>
): void {
  const traceId = getCurrentTraceId();
  const correlationId = getBaggage('event.correlation_id');
  
  logger.info(`[EventTracing] ${eventType}`, {
    event: eventType,
    event_id: eventId,
    agent_id: agentId,
    trace_id: traceId,
    correlation_id: correlationId,
    ...data,
  });
}

// ============================================================================
// Exports
// ============================================================================

export { SPAN_NAMES };
