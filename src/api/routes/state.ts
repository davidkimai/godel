/**
 * State API Routes
 * 
 * RESTful API endpoints for agent state management and monitoring.
 * Provides real-time state information and transition capabilities.
 * 
 * @module api/routes/state
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { memoryStore } from '../../storage/memory';
import { AGENT_STATES, type AgentState } from '../../loop/state-machine';
import { logger } from '../../utils/logger';
import { sendSuccess, sendError, sendValidationError, asyncHandler, ErrorCodes } from '../lib/express-response';
import { z } from 'zod';

const router = Router();

// Validation schemas
const AgentIdParamSchema = z.object({
  id: z.string().min(1, 'Agent ID is required'),
});

const StateTransitionSchema = z.object({
  to: z.enum(AGENT_STATES as [string, ...string[]]),
  metadata: z.record(z.unknown()).optional(),
});

const StateHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
});

const TransitionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
});

/**
 * @openapi
 * /api/v1/agents/states:
 *   get:
 *     summary: Get all agent states
 *     description: Get current state of all agents with counts
 *     tags: [states]
 *     responses:
 *       200:
 *         description: Agent states
 *       500:
 *         description: Server error
 */
router.get('/agents/states', asyncHandler(async (_req: Request, res: Response) => {
  const agents = Object.values(memoryStore.agents || {});
  
  const states = agents.map((agent: any) => ({
    id: agent.id,
    name: agent.label || agent.name,
    state: agent.lifecycleState || agent.status,
    status: agent.status,
    load: agent.currentLoad || 0,
    model: agent.model,
    lastActivity: agent.lastActivity || agent.spawnedAt
  }));

  // Count by state
  const counts: Record<string, number> = {
    created: 0,
    initializing: 0,
    idle: 0,
    busy: 0,
    paused: 0,
    error: 0,
    stopping: 0,
    stopped: 0
  };

  for (const agent of states) {
    if (agent.state) {
      counts[agent.state] = (counts[agent.state] || 0) + 1;
    }
  }

  sendSuccess(res, {
    agents: states,
    counts,
    total: agents.length
  });
}));

/**
 * @openapi
 * /api/v1/agents/{id}/state:
 *   get:
 *     summary: Get agent state
 *     description: Get detailed state information for a specific agent
 *     tags: [states]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent state
 *       404:
 *         description: Agent not found
 *       500:
 *         description: Server error
 */
router.get('/agents/:id/state', asyncHandler(async (req: Request, res: Response) => {
  const parsed = AgentIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }

  const { id } = parsed.data;
  const agent = (memoryStore.agents || {})[id];
  
  if (!agent) {
    sendError(res, ErrorCodes.AGENT_NOT_FOUND, `Agent ${id} not found`, { statusCode: 404 });
    return;
  }

  const agentAny = agent as any;

  sendSuccess(res, {
    agent: {
      id: agentAny.id,
      name: agentAny.label || agentAny.name,
      model: agentAny.model,
      status: agentAny.status,
      load: agentAny.currentLoad || 0,
      createdAt: agentAny.spawnedAt || agentAny.createdAt,
      lastActivity: agentAny.lastActivity || agentAny.spawnedAt
    },
    state: {
      current: agentAny.lifecycleState || agentAny.status,
      allowedTransitions: getAllowedTransitions(agentAny.lifecycleState || agentAny.status),
      timeInState: agentAny.stateEntryTime 
        ? Date.now() - agentAny.stateEntryTime 
        : 0
    }
  });
}));

/**
 * @openapi
 * /api/v1/agents/{id}/state/history:
 *   get:
 *     summary: Get state history
 *     description: Get state transition history for an agent
 *     tags: [states]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: State history
 *       404:
 *         description: Agent not found
 *       500:
 *         description: Server error
 */
router.get('/agents/:id/state/history', asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = AgentIdParamSchema.safeParse(req.params);
  const queryParsed = StateHistoryQuerySchema.safeParse(req.query);
  
  if (!paramsParsed.success) {
    sendValidationError(res, paramsParsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }
  
  if (!queryParsed.success) {
    sendValidationError(res, queryParsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }

  const { id } = paramsParsed.data;
  const { limit } = queryParsed.data;
  const agent = (memoryStore.agents || {})[id];
  
  if (!agent) {
    sendError(res, ErrorCodes.AGENT_NOT_FOUND, `Agent ${id} not found`, { statusCode: 404 });
    return;
  }

  const agentAny = agent as any;

  sendSuccess(res, {
    agentId: id,
    currentState: agentAny.lifecycleState || agentAny.status,
    history: agentAny.stateHistory?.slice(-limit) || []
  });
}));

/**
 * @openapi
 * /api/v1/agents/{id}/state/transition:
 *   post:
 *     summary: Transition state
 *     description: Transition an agent to a new state
 *     tags: [states]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to]
 *             properties:
 *               to:
 *                 type: string
 *                 enum: [created, initializing, idle, busy, paused, error, stopping, stopped]
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: State transitioned
 *       400:
 *         description: Invalid transition
 *       404:
 *         description: Agent not found
 *       500:
 *         description: Server error
 */
router.post('/agents/:id/state/transition', asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = AgentIdParamSchema.safeParse(req.params);
  const bodyParsed = StateTransitionSchema.safeParse(req.body);
  
  if (!paramsParsed.success) {
    sendValidationError(res, paramsParsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }
  
  if (!bodyParsed.success) {
    sendValidationError(res, bodyParsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }

  const { id } = paramsParsed.data;
  const { to, metadata } = bodyParsed.data;
  const agent = (memoryStore.agents || {})[id];
  
  if (!agent) {
    sendError(res, ErrorCodes.AGENT_NOT_FOUND, `Agent ${id} not found`, { statusCode: 404 });
    return;
  }

  const agentAny = agent as any;
  const currentState = agentAny.lifecycleState || agentAny.status;

  // Check if transition is allowed
  if (!isValidTransition(currentState, to)) {
    sendError(res, ErrorCodes.STATE_CONFLICT, 'Transition not allowed', {
      statusCode: 409,
      details: {
        currentState,
        requestedState: to,
        allowedTransitions: getAllowedTransitions(currentState)
      }
    });
    return;
  }

  try {
    // Record transition
    const historyEntry = {
      from: currentState,
      to,
      timestamp: Date.now(),
      metadata
    };
    
    if (!agentAny.stateHistory) {
      agentAny.stateHistory = [];
    }
    agentAny.stateHistory.push(historyEntry);

    // Update state
    agentAny.lifecycleState = to;
    agentAny.stateEntryTime = Date.now();

    sendSuccess(res, {
      success: true,
      agentId: id,
      previousState: currentState,
      currentState: to,
      timestamp: Date.now()
    });
  } catch (error) {
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Transition failed', {
      statusCode: 500,
      details: { message: error instanceof Error ? error.message : String(error) }
    });
  }
}));

/**
 * @openapi
 * /api/v1/agents/{id}/state/pause:
 *   post:
 *     summary: Pause agent
 *     description: Pause an agent
 *     tags: [states]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent paused
 *       400:
 *         description: Cannot pause in current state
 *       404:
 *         description: Agent not found
 *       500:
 *         description: Server error
 */
router.post('/agents/:id/state/pause', asyncHandler(async (req: Request, res: Response) => {
  const parsed = AgentIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }

  const { id } = parsed.data;
  const agent = (memoryStore.agents || {})[id];
  
  if (!agent) {
    sendError(res, ErrorCodes.AGENT_NOT_FOUND, `Agent ${id} not found`, { statusCode: 404 });
    return;
  }

  const agentAny = agent as any;
  const currentState = agentAny.lifecycleState || agentAny.status;

  if (currentState !== 'idle' && currentState !== 'busy') {
    sendError(res, ErrorCodes.STATE_CONFLICT, 'Cannot pause agent in current state', {
      statusCode: 400,
      details: { currentState }
    });
    return;
  }

  // Record transition
  if (!agentAny.stateHistory) {
    agentAny.stateHistory = [];
  }
  agentAny.stateHistory.push({
    from: currentState,
    to: 'paused',
    timestamp: Date.now()
  });

  agentAny.lifecycleState = 'paused';
  agentAny.stateEntryTime = Date.now();

  sendSuccess(res, { success: true, agentId: id, action: 'paused' });
}));

/**
 * @openapi
 * /api/v1/agents/{id}/state/resume:
 *   post:
 *     summary: Resume agent
 *     description: Resume a paused agent
 *     tags: [states]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent resumed
 *       400:
 *         description: Cannot resume - not in paused state
 *       404:
 *         description: Agent not found
 *       500:
 *         description: Server error
 */
router.post('/agents/:id/state/resume', asyncHandler(async (req: Request, res: Response) => {
  const parsed = AgentIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }

  const { id } = parsed.data;
  const agent = (memoryStore.agents || {})[id];
  
  if (!agent) {
    sendError(res, ErrorCodes.AGENT_NOT_FOUND, `Agent ${id} not found`, { statusCode: 404 });
    return;
  }

  const agentAny = agent as any;
  const currentState = agentAny.lifecycleState || agentAny.status;

  if (currentState !== 'paused') {
    sendError(res, ErrorCodes.STATE_CONFLICT, 'Cannot resume agent - not in paused state', {
      statusCode: 400,
      details: { currentState }
    });
    return;
  }

  // Record transition
  if (!agentAny.stateHistory) {
    agentAny.stateHistory = [];
  }
  agentAny.stateHistory.push({
    from: 'paused',
    to: 'idle',
    timestamp: Date.now()
  });

  agentAny.lifecycleState = 'idle';
  agentAny.stateEntryTime = Date.now();

  sendSuccess(res, { success: true, agentId: id, action: 'resumed' });
}));

/**
 * @openapi
 * /api/v1/states/stats:
 *   get:
 *     summary: Get state statistics
 *     description: Get statistics about agent states across the system
 *     tags: [states]
 *     responses:
 *       200:
 *         description: State statistics
 *       500:
 *         description: Server error
 */
router.get('/states/stats', asyncHandler(async (_req: Request, res: Response) => {
  const agents = Object.values(memoryStore.agents || {});
  
  const counts: Record<string, number> = {};
  for (const state of AGENT_STATES) {
    counts[state] = 0;
  }
  
  for (const agent of agents) {
    const agentAny = agent as any;
    const state = agentAny.lifecycleState || agentAny.status;
    if (state && counts[state] !== undefined) {
      counts[state]++;
    }
  }

  sendSuccess(res, {
    totalAgents: agents.length,
    agentsByState: counts
  });
}));

/**
 * @openapi
 * /api/v1/states/transitions:
 *   get:
 *     summary: Get recent transitions
 *     description: Get recent state transitions across all agents
 *     tags: [states]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Recent transitions
 *       500:
 *         description: Server error
 */
router.get('/states/transitions', asyncHandler(async (req: Request, res: Response) => {
  const parsed = TransitionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })));
    return;
  }

  const { limit } = parsed.data;
  const agents = Object.values(memoryStore.agents || {});
  
  // Collect all transitions from all agents
  const allTransitions: Array<{
    agentId: string;
    from: string;
    to: string;
    timestamp: number;
  }> = [];

  for (const agent of agents) {
    const agentAny = agent as any;
    if (agentAny.stateHistory) {
      for (const entry of agentAny.stateHistory) {
        allTransitions.push({
          agentId: agentAny.id,
          from: entry.from,
          to: entry.to,
          timestamp: entry.timestamp
        });
      }
    }
  }

  // Sort by timestamp (newest first)
  allTransitions.sort((a, b) => b.timestamp - a.timestamp);

  sendSuccess(res, {
    transitions: allTransitions.slice(0, limit),
    count: allTransitions.length
  });
}));

/**
 * @openapi
 * /api/v1/states/diagram:
 *   get:
 *     summary: Get state diagram
 *     description: Get state machine diagram data
 *     tags: [states]
 *     responses:
 *       200:
 *         description: Diagram data
 *       500:
 *         description: Server error
 */
router.get('/states/diagram', asyncHandler(async (_req: Request, res: Response) => {
  const diagramData = {
    states: AGENT_STATES,
    transitions: [
      { from: 'created', to: 'initializing', action: 'setup' },
      { from: 'initializing', to: 'idle', action: 'ready' },
      { from: 'initializing', to: 'error', action: 'fail' },
      { from: 'idle', to: 'busy', action: 'assign' },
      { from: 'busy', to: 'idle', action: 'complete' },
      { from: 'busy', to: 'error', action: 'error' },
      { from: 'idle', to: 'paused', action: 'pause' },
      { from: 'busy', to: 'paused', action: 'pause' },
      { from: 'paused', to: 'idle', action: 'resume' },
      { from: 'paused', to: 'busy', action: 'resume work' },
      { from: 'idle', to: 'stopping', action: 'stop' },
      { from: 'busy', to: 'stopping', action: 'stop' },
      { from: 'paused', to: 'stopping', action: 'stop' },
      { from: 'stopping', to: 'stopped', action: 'done' },
      { from: 'error', to: 'stopping', action: 'cleanup' },
      { from: 'error', to: 'initializing', action: 'retry' }
    ],
    positions: {
      created: { x: 1, y: 1 },
      initializing: { x: 20, y: 1 },
      idle: { x: 40, y: 1 },
      busy: { x: 40, y: 6 },
      paused: { x: 60, y: 3 },
      error: { x: 20, y: 6 },
      stopping: { x: 40, y: 11 },
      stopped: { x: 60, y: 11 }
    }
  };

  sendSuccess(res, diagramData);
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAllowedTransitions(currentState: string): string[] {
  const transitions: Record<string, string[]> = {
    created: ['initializing'],
    initializing: ['idle', 'error'],
    idle: ['busy', 'paused', 'stopping'],
    busy: ['idle', 'paused', 'error', 'stopping'],
    paused: ['idle', 'busy', 'stopping'],
    error: ['stopping', 'initializing'],
    stopping: ['stopped'],
    stopped: []
  };
  
  return transitions[currentState] || [];
}

function isValidTransition(from: string, to: string): boolean {
  return getAllowedTransitions(from).includes(to);
}

export default router;
