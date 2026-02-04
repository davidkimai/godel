/**
 * Dashboard API Routes
 * 
 * Additional API endpoints for the dashboard UI
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { SwarmRepository } from '../../storage/repositories/SwarmRepository';
import { AgentRepository } from '../../storage/repositories/AgentRepository';
import { EventRepository } from '../../storage/repositories/EventRepository';
import { logger } from '../../utils/logger';
import { AgentStatus } from '../../models/agent';

const router = Router();

// GET /api/metrics/dashboard - Dashboard overview metrics
router.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const swarmRepo = new SwarmRepository();
    const agentRepo = new AgentRepository();
    const eventRepo = new EventRepository();

    const [swarms, agents, events] = await Promise.all([
      swarmRepo.list(),
      agentRepo.list(),
      eventRepo.list({ limit: 1000 })
    ]);

    const activeSwarms = swarms.filter(s => s.status === 'active').length;
    const runningAgents = agents.filter(a => a.status === 'running').length;
    const failedAgents = agents.filter(a => a.status === 'failed').length;
    
    const totalCost = agents.reduce((sum, a) => sum + (a.cost || 0), 0);
    const eventsLastHour = events.filter(e => {
      const hourAgo = Date.now() - 3600000;
      return new Date(e.timestamp).getTime() > hourAgo;
    }).length;

    res.json({
      totalAgents: agents.length,
      activeAgents: runningAgents,
      failedAgents,
      totalSwarms: swarms.length,
      activeSwarms,
      totalCost,
      eventsLastHour,
      systemHealth: failedAgents / Math.max(agents.length, 1) > 0.1 ? 'degraded' : 'healthy'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/metrics/cost - Cost metrics
router.get('/cost', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const agentRepo = new AgentRepository();
    const swarmRepo = new SwarmRepository();

    const [agents, swarms] = await Promise.all([
      agentRepo.list(),
      swarmRepo.list()
    ]);

    const totalSpent = agents.reduce((sum, a) => sum + (a.cost || 0), 0);
    const totalBudget = swarms.reduce((sum, s) => sum + (s.budget_allocated || 0), 0);
    const budgetRemaining = totalBudget - totalSpent;
    
    // Calculate burn rate (last hour)
    const hourAgo = Date.now() - 3600000;
    const recentAgents = agents.filter(a => new Date(a.spawned_at).getTime() > hourAgo);
    const recentCost = recentAgents.reduce((sum, a) => sum + (a.cost || 0), 0);
    const hourlyRate = recentCost;

    res.json({
      totalSpent,
      hourlyRate,
      projectedHourly: hourlyRate * 1.1,
      dailyEstimate: hourlyRate * 24,
      monthlyEstimate: hourlyRate * 24 * 30,
      budgetRemaining,
      budgetAllocated: totalBudget,
      burnRate: hourlyRate / 60,
      timeRemaining: hourlyRate > 0 ? budgetRemaining / (hourlyRate / 60) : Infinity
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/metrics/cost/breakdown - Cost breakdown by model/swarm
router.get('/cost/breakdown', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const agentRepo = new AgentRepository();
    const swarmRepo = new SwarmRepository();

    const [agents, swarms] = await Promise.all([
      agentRepo.list(),
      swarmRepo.list()
    ]);

    const byModel: Record<string, number> = {};
    const bySwarm: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const byTime: Array<{ timestamp: string; cost: number; cumulative: number }> = [];

    let cumulative = 0;
    for (let i = 23; i >= 0; i--) {
      const hourStart = Date.now() - i * 3600000;
      const hourEnd = hourStart + 3600000;
      
      const hourAgents = agents.filter(a => {
        const created = new Date(a.spawned_at).getTime();
        return created >= hourStart && created < hourEnd;
      });
      
      const hourCost = hourAgents.reduce((sum, a) => sum + (a.cost || 0), 0);
      cumulative += hourCost;
      
      byTime.push({
        timestamp: new Date(hourStart).toISOString(),
        cost: hourCost,
        cumulative
      });
    }

    agents.forEach(agent => {
      byModel[agent.model] = (byModel[agent.model] || 0) + (agent.cost || 0);
      bySwarm[agent.swarm_id] = (bySwarm[agent.swarm_id] || 0) + (agent.cost || 0);
      byAgent[agent.id] = agent.cost || 0;
    });

    res.json({ byModel, bySwarm, byAgent, byTime });
  } catch (error) {
    next(error);
  }
});

// GET /api/metrics/agents - Agent-level metrics
router.get('/agents', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const agentRepo = new AgentRepository();
    const agents = await agentRepo.list();

    const metrics = {
      total: agents.length,
      online: agents.filter(a => a.status === 'running').length,
      offline: agents.filter(a => a.status === 'pending').length,
      busy: agents.filter(a => a.status === 'running').length,
      idle: agents.filter(a => a.status === AgentStatus.PENDING || !a.status).length,
      error: agents.filter(a => a.status === 'failed').length
    };

    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// GET /api/metrics/swarms - Swarm-level metrics
router.get('/swarms', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const swarmRepo = new SwarmRepository();
    const agentRepo = new AgentRepository();
    const swarms = await swarmRepo.list();

    const metrics = await Promise.all(swarms.map(async swarm => {
      const agents = await agentRepo.findBySwarmId(swarm.id);
      return {
        id: swarm.id,
        name: swarm.name,
        status: swarm.status,
        agentCount: agents.length,
        completedAgents: agents.filter(a => a.status === 'completed').length,
        failedAgents: agents.filter(a => a.status === 'failed').length,
        cost: agents.reduce((sum, a) => sum + (a.cost || 0), 0),
        budget: swarm.budget_allocated,
        budgetRemaining: swarm.budget_allocated - swarm.budget_consumed
      };
    }));

    res.json({ swarms: metrics });
  } catch (error) {
    next(error);
  }
});

// GET /api/metrics/events - Event stream metrics
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventRepo = new EventRepository();
    const limit = parseInt(req.query["limit"] as string) || 100;
    
    const events = await eventRepo.list({ limit });
    
    const hourAgo = Date.now() - 3600000;
    const eventsLastHour = events.filter(e => {
      const created = new Date(e.timestamp).getTime();
      return created > hourAgo;
    });

    const eventsPerSecond = eventsLastHour.length / 3600;
    const byType: Record<string, number> = {};
    events.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });

    res.json({
      eventsPerSecond,
      totalEvents: events.length,
      lastHourEvents: eventsLastHour.length,
      byType
    });
  } catch (error) {
    next(error);
  }
});

export default router;
