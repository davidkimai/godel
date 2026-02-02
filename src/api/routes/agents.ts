import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest, validateParams, NotFoundError } from '../../validation';
import {
  spawnAgentSchema,
  updateAgentSchema,
  agentActionSchema,
  idSchema,
  type SpawnAgentInput,
  type UpdateAgentInput,
  type AgentActionInput,
} from '../../validation/schemas';
import { AgentRepository, type Agent } from '../../storage/repositories/AgentRepository';
import { SwarmRepository } from '../../storage/repositories/SwarmRepository';

const router = Router();

// GET /api/agents - List agents
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = new AgentRepository();
    
    const { swarmId, status } = req.query;
    
    let agents;
    if (swarmId) {
      agents = await repo.findBySwarmId(swarmId as string);
    } else {
      agents = await repo.list();
    }
    
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

// GET /api/agents/:id - Get agent by ID
router.get('/:id', validateParams(z.object({ id: idSchema })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const repo = new AgentRepository();
    const agent = await repo.findById(id as string);
    
    if (!agent) {
      throw new NotFoundError('Agent', id as string);
    }
    
    res.json(agent);
  } catch (error) {
    next(error);
  }
});

// POST /api/agents - Spawn new agent
router.post('/', validateRequest(spawnAgentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body as SpawnAgentInput;
    const repo = new AgentRepository();
    
    // Validate swarm exists if provided
    if (data.swarmId) {
      const swarmRepo = new SwarmRepository();
      const swarm = await swarmRepo.findById(data.swarmId);
      if (!swarm) {
        throw new NotFoundError('Swarm', data.swarmId);
      }
    }
    
    const agent = await repo.create({
      swarm_id: data.swarmId,
      parent_id: data.parentId,
      status: 'spawning',
      task: data.task,
      model: data.model,
    });
    
    res.status(201).json(agent);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/agents/:id - Update agent
router.patch('/:id', validateParams(z.object({ id: idSchema })), validateRequest(updateAgentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = req.body as UpdateAgentInput;
    const repo = new AgentRepository();
    
    const existing = await repo.findById(id as string);
    if (!existing) {
      throw new NotFoundError('Agent', id as string);
    }
    
    // AgentRepository only supports status updates
    if (data.status) {
      await repo.updateStatus(id as string, data.status as Agent['status']);
    }
    
    const updated = await repo.findById(id as string);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/agents/:id - Kill agent
router.delete('/:id', validateParams(z.object({ id: idSchema })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const repo = new AgentRepository();
    
    const existing = await repo.findById(id as string);
    if (!existing) {
      throw new NotFoundError('Agent', id as string);
    }
    
    await repo.updateStatus(id as string, 'killing');
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// POST /api/agents/:id/action - Agent actions (kill, pause, resume, retry)
router.post('/:id/action', validateParams(z.object({ id: idSchema })), validateRequest(agentActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { action, reason, force } = req.body as AgentActionInput;
    const repo = new AgentRepository();
    
    const agent = await repo.findById(id as string);
    if (!agent) {
      throw new NotFoundError('Agent', id as string);
    }
    
    const statusMap: Record<string, string> = {
      kill: 'killing',
      pause: 'paused',
      resume: 'running',
      retry: 'spawning',
    };
    
    const newStatus = statusMap[action];
    if (!newStatus) {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }
    
    await repo.updateStatus(id as string, newStatus as Agent['status']);
    
    res.json({ id, action, status: newStatus });
  } catch (error) {
    next(error);
  }
});

// POST /api/agents/:id/pause - Pause agent
router.post('/:id/pause', validateParams(z.object({ id: idSchema })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const repo = new AgentRepository();
    
    const agent = await repo.findById(id as string);
    if (!agent) {
      throw new NotFoundError('Agent', id as string);
    }
    
    await repo.updateStatus(id as string, 'paused');
    res.json({ id, status: 'paused' });
  } catch (error) {
    next(error);
  }
});

// POST /api/agents/:id/resume - Resume agent
router.post('/:id/resume', validateParams(z.object({ id: idSchema })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const repo = new AgentRepository();
    
    const agent = await repo.findById(id as string);
    if (!agent) {
      throw new NotFoundError('Agent', id as string);
    }
    
    await repo.updateStatus(id as string, 'running');
    res.json({ id, status: 'running' });
  } catch (error) {
    next(error);
  }
});

export default router;
