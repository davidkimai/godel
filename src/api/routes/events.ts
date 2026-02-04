import { Router, type Request, type Response } from 'express';
import type { Server as WebSocketServer } from 'ws';
import { EventRepository, type EventFilter } from '../../storage/repositories/EventRepository';
import { logger } from '../../utils';

const router = Router();

// GET /api/events - List events
router.get('/', async (req: Request, res: Response) => {
  try {
    const repo = new EventRepository();
    
    const { 
      agentId, 
      swarmId, 
      type, 
      severity,
      since,
      limit = '100',
    } = req.query;
    
    const filters: EventFilter = {};
    if (agentId) filters.agentId = agentId as string;
    if (swarmId) filters.swarmId = swarmId as string;
    if (type) filters.types = [type as string];
    if (severity) filters.severity = severity as EventFilter['severity'];
    if (since) filters.since = new Date(since as string);
    filters.limit = parseInt(limit as string, 10);
    
    const events = await repo.findByFilter(filters);
    
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/events - Create a new event
router.post('/', async (req: Request, res: Response) => {
  try {
    const repo = new EventRepository();
    const { eventType, payload, timestamp } = req.body;
    
    const event = await repo.create({
      type: eventType,
      source: 'api',
      payload: (payload || {}) as Record<string, unknown>,
      agent_id: payload?.agentId,
      swarm_id: payload?.swarmId
    });
    
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// GET /api/events/stream - SSE endpoint
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial connection message
  res.write('data: {"type":"connected"}\n\n');
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);
  
  // Clean up on close
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// WebSocket handler setup
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
          // Client wants to subscribe to specific events
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
