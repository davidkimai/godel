/**
 * Bus Routes
 * 
 * Fastify routes for event bus operations:
 * - POST /api/bus/publish - Publish event
 * - GET /api/bus/subscribe - WebSocket subscribe
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { EventPublishSchema, EventSchema, type EventPublish } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { EventEmitter } from 'events';

// Event bus for in-memory pub/sub
const eventBus = new EventEmitter();
eventBus.setMaxListeners(1000);

// In-memory event store
const events: Array<{
  id: string;
  type: string;
  payload: Record<string, unknown>;
  source: string;
  target?: string;
  timestamp: string;
}> = [];

export async function busRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // POST /api/bus/publish - Publish event
  // ============================================================================
  fastify.post(
    '/publish',
    {
      schema: {
        summary: 'Publish event',
        description: 'Publish an event to the event bus',
        tags: ['bus'],
        body: zodToJsonSchema(EventPublishSchema) as Record<string, unknown>,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: EventPublish }>, reply: FastifyReply) => {
      try {
        const validated = EventPublishSchema.parse(request.body);
        
        const event = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: validated.type,
          payload: validated.payload,
          source: validated.source || 'api',
          target: validated.target,
          timestamp: new Date().toISOString(),
        };
        
        // Store event
        events.push(event);
        
        // Keep only last 10000 events
        if (events.length > 10000) {
          events.shift();
        }
        
        // Emit to subscribers
        eventBus.emit('event', event);
        eventBus.emit(`event:${validated.type}`, event);
        if (validated.target) {
          eventBus.emit(`event:target:${validated.target}`, event);
        }
        
        return reply.status(201).send(
          createSuccessResponse({
            id: event.id,
            type: event.type,
            timestamp: event.timestamp,
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors,
            })
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to publish event');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to publish event')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/bus/subscribe - WebSocket subscribe (SSE)
  // ============================================================================
  fastify.get(
    '/subscribe',
    {
      schema: {
        summary: 'Subscribe to events',
        description: 'Subscribe to events via Server-Sent Events (SSE)',
        tags: ['bus'],
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Filter by event type' },
            target: { type: 'string', description: 'Filter by target' },
          },
        },
        response: {
          200: {
            description: 'SSE stream of events',
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { type?: string; target?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const eventType = request.query.type;
        const target = request.query.target;
        
        // Set SSE headers
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        
        // Send initial connection event
        reply.raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}

`);
        
        // Create event handler
        const handler = (event: typeof events[0]) => {
          // Filter by type if specified
          if (eventType && event.type !== eventType) {
            return;
          }
          
          // Filter by target if specified
          if (target && event.target !== target) {
            return;
          }
          
          try {
            reply.raw.write(`data: ${JSON.stringify(event)}

`);
          } catch (err) {
            // Client disconnected
          }
        };
        
        // Subscribe to events
        eventBus.on('event', handler);
        
        // Send heartbeat every 30 seconds
        const heartbeat = setInterval(() => {
          try {
            reply.raw.write(`:heartbeat

`);
          } catch (err) {
            clearInterval(heartbeat);
          }
        }, 30000);
        
        // Handle disconnect
        request.raw.on('close', () => {
          clearInterval(heartbeat);
          eventBus.off('event', handler);
        });
        
        request.raw.on('error', () => {
          clearInterval(heartbeat);
          eventBus.off('event', handler);
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to subscribe to events');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to subscribe to events')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/bus/events - Get recent events
  // ============================================================================
  fastify.get(
    '/events',
    {
      schema: {
        summary: 'Get recent events',
        description: 'Get recent events from the event bus',
        tags: ['bus'],
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Filter by event type' },
            limit: { type: 'number', default: 100 },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  events: {
                    type: 'array',
                    items: zodToJsonSchema(EventSchema) as Record<string, unknown>,
                  },
                  hasMore: { type: 'boolean' },
                  nextCursor: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { type?: string; limit?: number; cursor?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const limit = Math.min(request.query.limit || 100, 500);
        const eventType = request.query.type;
        
        let filteredEvents = [...events];
        
        // Filter by type
        if (eventType) {
          filteredEvents = filteredEvents.filter(e => e.type === eventType);
        }
        
        // Get last N events
        const recentEvents = filteredEvents.slice(-limit).reverse();
        
        return reply.send(
          createSuccessResponse({
            events: recentEvents,
            hasMore: filteredEvents.length > limit,
          }, { requestId: request.id })
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get events');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get events')
        );
      }
    }
  );
}

export default busRoutes;
