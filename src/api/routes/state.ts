/**
 * State API Routes
 * 
 * REST API endpoints for agent state management and monitoring.
 * Provides real-time state information and transition capabilities.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { memoryStore } from '../../storage/memory';
import { AGENT_STATES, type AgentState } from '../../loop/state-machine';
import { logger } from '../../utils/logger';

const router = Router();

// ============================================================================
// GET /api/agents/states - Get all agent states
// ============================================================================
router.get('/agents/states', async (_req: Request, res: Response, next: NextFunction) => {
  try {
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

    res.json({
      agents: states,
      counts,
      total: agents.length
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/agents/:id/state - Get specific agent state
// ============================================================================
router.get('/agents/:id/state', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params['id'] as string;
    const agent = (memoryStore.agents || {})[agentId as string];
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agentAny = agent as any;

    res.json({
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
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/agents/:id/state/history - Get agent state history
// ============================================================================
router.get('/agents/:id/state/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params['id'] as string;
    const agent = (memoryStore.agents || {})[agentId as string];
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const limit = parseInt(req.query['limit'] as string) || 50;
    const agentAny = agent as any;

    res.json({
      agentId,
      currentState: agentAny.lifecycleState || agentAny.status,
      history: agentAny.stateHistory?.slice(-limit) || []
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/agents/:id/state/transition - Transition agent state
// ============================================================================
router.post('/agents/:id/state/transition', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params['id'] as string;
    const agent = (memoryStore.agents || {})[agentId as string];
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const { to, metadata } = req.body;

    // Validate state
    if (!AGENT_STATES.includes(to as AgentState)) {
      return res.status(400).json({ 
        error: 'Invalid state',
        validStates: AGENT_STATES
      });
    }

    const agentAny = agent as any;
    const currentState = agentAny.lifecycleState || agentAny.status;

    // Check if transition is allowed
    if (!isValidTransition(currentState, to)) {
      return res.status(400).json({
        error: 'Transition not allowed',
        currentState,
        requestedState: to,
        allowedTransitions: getAllowedTransitions(currentState)
      });
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

      res.json({
        success: true,
        agentId,
        previousState: currentState,
        currentState: to,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(400).json({
        error: 'Transition failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/agents/:id/state/pause - Pause an agent
// ============================================================================
router.post('/agents/:id/state/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params['id'] as string;
    const agent = (memoryStore.agents || {})[agentId as string];
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agentAny = agent as any;
    const currentState = agentAny.lifecycleState || agentAny.status;

    if (currentState !== 'idle' && currentState !== 'busy') {
      return res.status(400).json({ 
        error: 'Cannot pause agent in current state',
        currentState 
      });
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

    res.json({ success: true, agentId, action: 'paused' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/agents/:id/state/resume - Resume an agent
// ============================================================================
router.post('/agents/:id/state/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params['id'] as string;
    const agent = (memoryStore.agents || {})[agentId as string];
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agentAny = agent as any;
    const currentState = agentAny.lifecycleState || agentAny.status;

    if (currentState !== 'paused') {
      return res.status(400).json({ 
        error: 'Cannot resume agent - not in paused state',
        currentState 
      });
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

    res.json({ success: true, agentId, action: 'resumed' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/states/stats - Get state statistics
// ============================================================================
router.get('/states/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
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

    res.json({
      totalAgents: agents.length,
      agentsByState: counts
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/states/transitions - Get recent state transitions
// ============================================================================
router.get('/states/transitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 50;
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

    res.json({
      transitions: allTransitions.slice(0, limit),
      count: allTransitions.length
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/states/diagram - Get state machine diagram data
// ============================================================================
router.get('/states/diagram', async (_req: Request, res: Response, next: NextFunction) => {
  try {
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

    res.json(diagramData);
  } catch (error) {
    next(error);
  }
});

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
