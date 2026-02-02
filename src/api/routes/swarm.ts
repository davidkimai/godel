import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest, validateParams, NotFoundError } from '../../validation';
import {
  createSwarmSchema,
  updateSwarmSchema,
  swarmActionSchema,
  idSchema,
  type CreateSwarmInput,
  type UpdateSwarmInput,
  type SwarmActionInput,
} from '../../validation/schemas';
import { SwarmRepository } from '../../storage/repositories/SwarmRepository';
import { AgentRepository } from '../../storage/repositories/AgentRepository';

const router = Router();

// GET /api/swarm - List swarms
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = new SwarmRepository();
    const swarms = await repo.list();
    res.json({ swarms });
  } catch (error) {
    next(error);
  }
});

// GET /api/swarm/:id - Get swarm by ID
router.get('/:id', validateParams(z.object({ id: idSchema })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const repo = new SwarmRepository();
    const swarm = await repo.findById(id as string);
    
    if (!swarm) {
      throw new NotFoundError('Swarm', id as string);
    }
    
    // Get agent count
    const agentRepo = new AgentRepository();
    const agents = await agentRepo.findBySwarmId(id as string);
    
    res.json({
      ...swarm,
      agentCount: agents.length,
      agents: agents.map(a => ({ id: a.id, status: a.status })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/swarm - Create new swarm
router.post('/', validateRequest(createSwarmSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body as CreateSwarmInput;
    const repo = new SwarmRepository();
    
    const swarm = await repo.create({
      name: data.name,
      status: 'running',
      config: {
        strategy: data.strategy,
        agentCount: data.agents,
        ...data.config,
      },
    });
    
    res.status(201).json(swarm);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/swarm/:id - Update swarm
router.patch('/:id', validateParams(z.object({ id: idSchema })), validateRequest(updateSwarmSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = req.body as UpdateSwarmInput;
    const repo = new SwarmRepository();
    
    const existing = await repo.findById(id as string);
    if (!existing) {
      throw new NotFoundError('Swarm', id as string);
    }
    
    const updated = await repo.update(id as string, {
      ...(data.name && { name: data.name }),
      ...(data.status && { status: data.status }),
      ...(data.config && { config: data.config }),
    });
    
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/swarm/:id - Destroy swarm
router.delete('/:id', validateParams(z.object({ id: idSchema })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const repo = new SwarmRepository();
    const agentRepo = new AgentRepository();
    
    const existing = await repo.findById(id as string);
    if (!existing) {
      throw new NotFoundError('Swarm', id as string);
    }
    
    // Kill all agents in swarm first
    const agents = await agentRepo.findBySwarmId(id as string);
    for (const agent of agents) {
      await agentRepo.updateStatus(agent.id, 'killing');
    }
    
    // Delete swarm
    await repo.delete(id as string);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// POST /api/swarm/:id/scale - Scale swarm
router.post('/:id/scale', validateParams(z.object({ id: idSchema })), validateRequest(swarmActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { targetAgents } = req.body as SwarmActionInput & { targetAgents: number };
    
    const repo = new SwarmRepository();
    const agentRepo = new AgentRepository();
    
    const swarm = await repo.findById(id as string);
    if (!swarm) {
      throw new NotFoundError('Swarm', id as string);
    }
    
    const currentAgents = await agentRepo.findBySwarmId(id as string);
    const currentCount = currentAgents.length;
    
    const targetCount = targetAgents as number;
    
    if (targetCount > currentCount) {
      // Scale up - spawn new agents
      for (let i = currentCount; i < targetCount; i++) {
        await agentRepo.create({
          swarm_id: id as string,
          status: 'spawning',
          task: 'Auto-scaled agent',
        });
      }
    } else if (targetCount < currentCount) {
      // Scale down - kill excess agents
      const excess = currentAgents.slice(targetCount);
      for (const agent of excess) {
        await agentRepo.updateStatus(agent.id, 'killing');
      }
    }
    
    const updatedAgents = await agentRepo.findBySwarmId(id as string);
    res.json({
      swarmId: id as string,
      previousCount: currentCount,
      newCount: updatedAgents.length,
      agents: updatedAgents,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
