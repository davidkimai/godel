import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId?: string;
  }
}

function generateCorrelationId(): string {
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 16; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

const CORRELATION_ID_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';

export interface TracingContext {
  correlationId: string;
  requestId: string;
  parentSpanId?: string;
  traceId?: string;
  spanId?: string;
  timestamp: number;
}

export function getTracingContext(request: FastifyRequest): TracingContext {
  const correlationId = request.headers[CORRELATION_ID_HEADER] as string ||
                         request.headers[REQUEST_ID_HEADER] as string ||
                         generateCorrelationId();

  return {
    correlationId,
    requestId: correlationId,
    timestamp: Date.now(),
  };
}

export function setupCorrelationMiddleware(fastify: FastifyInstance): void {
  fastify.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    const context = getTracingContext(request);
    request.correlationId = context.correlationId;
    (request as any).tracingContext = context;
  });

  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.correlationId;
    if (correlationId) {
      reply.header(CORRELATION_ID_HEADER, correlationId);
      reply.header(REQUEST_ID_HEADER, correlationId);
    }
    return reply;
  });
}

export function correlationIdHook(): {
  beforeHandler: (request: FastifyRequest, reply: FastifyReply, done: () => void) => void;
} {
  return {
    beforeHandler: (request: FastifyRequest, _reply: FastifyReply, done: () => void) => {
      const context = getTracingContext(request);
      request.correlationId = context.correlationId;
      (request as any).tracingContext = context;
      done();
    },
  };
}

export function propagateCorrelationId<T extends Record<string, any>>(obj: T, correlationId: string): T {
  return {
    ...obj,
    headers: {
      ...(obj.headers as Record<string, any>),
      [CORRELATION_ID_HEADER]: correlationId,
      [REQUEST_ID_HEADER]: correlationId,
    },
  };
}

export async function tracingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/trace/context', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = (request as any).tracingContext as TracingContext || getTracingContext(request);
    reply.send({
      correlationId: context.correlationId,
      requestId: context.requestId,
      traceId: context.traceId,
      spanId: context.spanId,
      timestamp: new Date(context.timestamp).toISOString(),
      headers: {
        incoming: request.headers[CORRELATION_ID_HEADER],
        outgoing: reply.getHeader(CORRELATION_ID_HEADER),
      },
    });
  });

  fastify.get('/trace/id', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.correlationId || generateCorrelationId();
    reply.header(CORRELATION_ID_HEADER, correlationId);
    reply.send({ correlationId });
  });
}
