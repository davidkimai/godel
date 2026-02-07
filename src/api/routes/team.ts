import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest, validateParams, NotFoundError } from '../../validation';
import {
  createTeamSchema,
  updateTeamSchema,
  teamActionSchema,
  idSchema,
  type CreateTeamInput,
  type UpdateTeamInput,
  type TeamActionInput,
} from '../../validation/schemas';
import { TeamRepository } from '../../storage/repositories/TeamRepository';
import { AgentRepository } from '../../storage/repositories/AgentRepository';

const router = Router();

// GET /api/team - List teams
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = new TeamRepository();
    const teams = await repo.list();
    res.json({ teams });
  } catch (error) {
    next(error);
  }
});

// GET /api/team/:id - Get team by ID
router.get('/:id', validateParams(z.object({ id: idSchema })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const repo = new TeamRepository();
    const team = await repo.findById(id as string);
    
    if (!team) {
      throw new NotFoundError('Team', id as string);
    }
    
    // Get agent count
    const agentRepo = new AgentRepository();
    const agents = await agentRepo.findByTeamId(id as string);
    
    res.json({
      ...team,
      agentCount: agents.length,
      agents: agents.map(a => ({ id: a.id, status: a.status })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/team - Create new team
router.post('/', validateRequest(createTeamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body as CreateTeamInput;
    const repo = new TeamRepository();
    
    const team = await repo.create({
      name: data.name,
      status: 'active',
      config: {
        strategy: data.strategy,
        agentCount: data.agents,
        ...data.config,
      },
    });
    
    res.status(201).json(team);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/team/:id - Update team
router.patch('/:id', validateParams(z.object({ id: idSchema })), validateRequest(updateTeamSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = req.body as UpdateTeamInput;
    const repo = new TeamRepository();
    
    const existing = await repo.findById(id as string);
    if (!existing) {
      throw new NotFoundError('Team', id as string);
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

// DELETE /api/team/:id - Destroy team
router.delete('/:id', validateParams(z.object({ id: idSchema })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const repo = new TeamRepository();
    const agentRepo = new AgentRepository();
    
    const existing = await repo.findById(id as string);
    if (!existing) {
      throw new NotFoundError('Team', id as string);
    }
    
    // Kill all agents in team first
    const agents = await agentRepo.findByTeamId(id as string);
    for (const agent of agents) {
      await agentRepo.updateStatus(agent.id, 'killed');
    }
    
    // Delete team
    await repo.delete(id as string);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// POST /api/team/:id/scale - Scale team
router.post('/:id/scale', validateParams(z.object({ id: idSchema })), validateRequest(teamActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { targetAgents } = req.body as TeamActionInput & { targetAgents: number };
    
    const repo = new TeamRepository();
    const agentRepo = new AgentRepository();
    
    const team = await repo.findById(id as string);
    if (!team) {
      throw new NotFoundError('Team', id as string);
    }
    
    const currentAgents = await agentRepo.findByTeamId(id as string);
    const currentCount = currentAgents.length;
    
    const targetCount = targetAgents as number;
    
    if (targetCount > currentCount) {
      // Scale up - spawn new agents
      for (let i = currentCount; i < targetCount; i++) {
        await agentRepo.create({
          team_id: id as string,
          status: 'pending',
          model: 'gpt-4',
          task: 'Auto-scaled agent',
        });
      }
    } else if (targetCount < currentCount) {
      // Scale down - kill excess agents
      const excess = currentAgents.slice(targetCount);
      for (const agent of excess) {
        await agentRepo.updateStatus(agent.id, 'killed');
      }
    }
    
    const updatedAgents = await agentRepo.findByTeamId(id as string);
    res.json({
      teamId: id as string,
      previousCount: currentCount,
      newCount: updatedAgents.length,
      agents: updatedAgents,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
