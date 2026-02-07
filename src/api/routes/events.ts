/**
 * Events API Routes
 * 
 * RESTful API endpoints for event management:
 * - GET /api/events - List events with filtering
 * - POST /api/events - Create a new event
 * - GET /api/events/stream - SSE endpoint for real-time events
 * 
 * @module api/routes/events
 */

import { logger } from '../../utils/logger';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Server as WebSocketServer } from 'ws';
import { EventRepository, type EventFilter } from '../../storage/repositories/EventRepository';
import { z } from 'zod';
import { sendSuccess, sendError, sendValidationError, asyncHandler, ErrorCodes } from '../lib/express-response';

const router = Router();

// Validation schemas
const ListEventsQuerySchema = z.object({
  agentId: z.string().optional(),
  teamId: z.string().optional(),
  type: z.string().optional(),
  severity: z.enum(['info', 'warn', 'error', 'critical']).optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

const CreateEventSchema = z.object({
  eventType: z.string().min(1, 'eventType is required'),
  payload: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime().optional(),
});

/**
 * @openapi
 * /api/v1/events:
 *   get:
 *     summary: List events
 *     description: List events with optional filtering
 *     tags: [events]
 *     parameters:
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *         description: Filter by agent ID
 *       - in: query
 *         name: teamId
 *         schema:
 *           type: string
 *         description: Filter by team ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by event type
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [info, warn, error, critical]
 *         description: Filter by severity
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter events since this timestamp
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 1000
 *         description: Maximum number of events to return
 *     responses:
 *       200:
 *         description: List of events
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const parsed = ListEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }

  const { agentId, teamId, type, severity, since, limit } = parsed.data;
  
  const repo = new EventRepository();
  
  const filters: EventFilter = {
    limit,
  };
  
  if (agentId) filters.agentId = agentId;
  if (teamId) filters.teamId = teamId;
  if (type) filters.types = [type];
  if (severity) filters.severity = severity === 'warn' ? 'warning' : severity;
  if (since) filters.since = new Date(since);
  
  const events = await repo.findByFilter(filters);
  
  sendSuccess(res, { events }, {
    meta: {
      total: events.length,
      pageSize: limit,
    },
  });
}));

/**
 * @openapi
 * /api/v1/events:
 *   post:
 *     summary: Create event
 *     description: Create a new event
 *     tags: [events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventType]
 *             properties:
 *               eventType:
 *                 type: string
 *               payload:
 *                 type: object
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Event created
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const parsed = CreateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }

  const { eventType, payload } = parsed.data;
  const repo = new EventRepository();
  
  const event = await repo.create({
    type: eventType,
    source: 'api',
    payload: payload as Record<string, unknown>,
    agent_id: (payload as any)?.agentId,
    team_id: (payload as any)?.teamId,
  });
  
  sendSuccess(res, event, { statusCode: 201 });
}));

/**
 * @openapi
 * /api/v1/events/stream:
 *   get:
 *     summary: Event stream (SSE)
 *     description: Subscribe to real-time events via Server-Sent Events
 *     tags: [events]
 *     responses:
 *       200:
 *         description: SSE stream
 */
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}

`);
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);
  
  // Clean up on close
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

/**
 * WebSocket handler setup for events
 */
export function setupWebSocketEvents(wss: WebSocketServer): void {
  wss.on('connection', (ws, req) => {
    logger.info('api/routes/events', 'WebSocket client connected for events');
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString(),
    }));
    
    // Handle subscriptions
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.action === 'subscribe') {
          logger.info('api/routes/events', 'Client subscribed to events', { events: message.events });
        }
      } catch {
        // Invalid message, ignore
      }
    });
    
    ws.on('close', () => {
      logger.info('api/routes/events', 'WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
      logger.error('api/routes/events', 'WebSocket error', { error: String(error) });
    });
  });
}

export default router;
