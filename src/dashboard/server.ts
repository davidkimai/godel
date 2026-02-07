/**
 * Dashboard Integration with Real-Time Event Streaming
 *
 * Provides WebSocket-based event streaming and REST API for session tree
 * visualization and branch comparison.
 */

import { EventEmitter } from 'events';
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { AgentEventBus, AgentEvent, Subscription } from '../core/event-bus';
import { SessionTree, BranchComparison } from '../core/session-tree';
import { TeamOrchestrator } from '../core/team-orchestrator';
import { logger } from '../utils/logger';
import { PrometheusMetrics, createHealthRouter, HealthCheckConfig } from '../metrics';
import { AgentStatus } from '../models/agent';

// ============================================================================
// Types
// ============================================================================

export interface DashboardConfig {
  port: number;
  host: string;
  enableCors: boolean;
  /** WebSocket heartbeat interval (ms) */
  heartbeatInterval: number;
  /** Maximum events to buffer per client */
  maxEventBuffer: number;
  /** Enable Prometheus metrics endpoint */
  enableMetrics: boolean;
  /** Path for metrics endpoint */
  metricsPath: string;
  /** Health check configuration */
  healthCheckConfig?: HealthCheckConfig;
  /** API key for authentication */
  apiKey?: string;
}

export interface DashboardClient {
  id: string;
  ws: WebSocket;
  subscribedTeams: Set<string>;
  subscribedSessions: Set<string>;
  subscribedAgents: Set<string>;
  lastHeartbeat: number;
  eventBuffer: AgentEvent[];
  authToken?: string;
  subscriptions: Set<string>; // Track subscription types
}

export interface TreeVisualizationNode {
  id: string;
  type: string;
  parentId: string | null;
  timestamp: string;
  label?: string;
  depth: number;
  hasChildren: boolean;
  branchName?: string;
  metadata?: Record<string, unknown>;
}

export interface TreeVisualization {
  sessionId: string;
  sessionName?: string;
  rootNodes: TreeVisualizationNode[];
  totalNodes: number;
  branches: string[];
  currentBranch: string;
}

export interface DashboardOverview {
  totalAgents: number;
  activeAgents: number;
  totalTeams: number;
  activeTeams: number;
  totalCost: number;
  eventsPerSecond: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
  agentsByStatus: Record<string, number>;
  recentEvents: number;
}

export interface TeamDashboardInfo {
  id: string;
  name: string;
  status: string;
  agentCount: number;
  budgetRemaining: number;
  budgetConsumed: number;
  progress: number;
  strategy: string;
  createdAt: string;
  currentBranch?: string;
}

export interface AgentDashboardInfo {
  id: string;
  label?: string;
  status: string;
  model: string;
  teamId: string;
  swarmName: string;
  task: string;
  runtime: number;
  cost: number;
  progress: number;
  spawnedAt: string;
}

// ============================================================================
// Dashboard Server
// ============================================================================

export class DashboardServer extends EventEmitter {
  private config: DashboardConfig;
  private eventBus: AgentEventBus;
  private orchestrator: TeamOrchestrator;
  private sessionTree: SessionTree;
  private metrics: PrometheusMetrics;

  private app: express.Application;
  private server?: HttpServer;
  private wss?: WebSocketServer;
  private clients: Map<string, DashboardClient> = new Map();

  private heartbeatTimer?: NodeJS.Timeout;
  private eventSubscription?: Subscription;
  private isRunning: boolean = false;
  private metricsInitialized: boolean = false;
  private metricsInterval?: NodeJS.Timeout;

  constructor(
    eventBus: AgentEventBus,
    orchestrator: TeamOrchestrator,
    sessionTree: SessionTree,
    config?: Partial<DashboardConfig>
  ) {
    super();

    this.eventBus = eventBus;
    this.orchestrator = orchestrator;
    this.sessionTree = sessionTree;

    this.config = {
      port: 7373,
      host: 'localhost',
      enableCors: true,
      heartbeatInterval: 30000,
      maxEventBuffer: 1000,
      enableMetrics: true,
      metricsPath: '/metrics',
      apiKey: process.env['DASHBOARD_API_KEY'],
      ...config,
    };

    this.metrics = PrometheusMetrics.getGlobalPrometheusMetrics();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  // =========================================================================
  // Setup
  // =========================================================================

  private setupMiddleware(): void {
    if (this.config.enableCors) {
      this.app.use(cors());
    }
    this.app.use(express.json());
    
    // Authentication middleware for API routes
    this.app.use('/api', this.authMiddleware.bind(this));
  }

  private authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Skip auth for health checks
    if (req.path.startsWith('/health')) {
      next();
      return;
    }

    // Check API key or Bearer token
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    if (this.config.apiKey) {
      if (apiKey === this.config.apiKey) {
        next();
        return;
      }
      if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === this.config.apiKey) {
        next();
        return;
      }
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // No API key configured, allow access
    next();
  }

  private setupRoutes(): void {
    // Request timing middleware for API metrics
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        if (this.config.enableMetrics) {
          const duration = Date.now() - start;
          this.metrics.recordApiRequest(
            req.method,
            req.route?.path || req.path,
            res.statusCode,
            duration
          );
        }
      });
      next();
    });

    // Health check endpoints
    if (this.config.healthCheckConfig) {
      const healthRouter = createHealthRouter(this.config.healthCheckConfig);
      this.app.use(healthRouter);
    }

    // Prometheus metrics endpoint
    if (this.config.enableMetrics) {
      this.app.get(this.config.metricsPath, async (_req: Request, res: Response) => {
        try {
          const metrics = await this.metrics.getMetrics();
          res.set('Content-Type', this.metrics.getContentType());
          res.end(metrics);
        } catch (error) {
          logger.error('[DashboardServer] Failed to get metrics', { error });
          res.status(500).json({ error: 'Failed to get metrics' });
        }
      });
    }

    // =========================================================================
    // Dashboard API Endpoints
    // =========================================================================

    // GET /api/dashboard/overview - Summary stats
    this.app.get('/api/dashboard/overview', (_req: Request, res: Response) => {
      try {
        const overview = this.getDashboardOverview();
        res.json({ success: true, data: overview });
      } catch (error) {
        logger.error('[DashboardServer] Failed to get overview', { error });
        res.status(500).json({ success: false, error: 'Failed to get dashboard overview' });
      }
    });

    // GET /api/dashboard/teams - Team list with dashboard info
    this.app.get('/api/dashboard/teams', (_req: Request, res: Response) => {
      try {
        const teams = this.getTeamDashboardInfo();
        res.json({ success: true, data: { teams, total: teams.length } });
      } catch (error) {
        logger.error('[DashboardServer] Failed to get teams', { error });
        res.status(500).json({ success: false, error: 'Failed to get team list' });
      }
    });

    // GET /api/dashboard/agents - Agent statuses
    this.app.get('/api/dashboard/agents', (req: Request, res: Response) => {
      try {
        const teamId = req.query['teamId'] as string | undefined;
        const agents = this.getAgentDashboardInfo(teamId);
        res.json({ success: true, data: { agents, total: agents.length } });
      } catch (error) {
        logger.error('[DashboardServer] Failed to get agents', { error });
        res.status(500).json({ success: false, error: 'Failed to get agent statuses' });
      }
    });

    // GET /api/dashboard/events - Recent events
    this.app.get('/api/dashboard/events', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query['limit'] as string) || 50;
        const teamId = req.query['teamId'] as string | undefined;
        const agentId = req.query['agentId'] as string | undefined;
        
        const events = this.getRecentEvents(limit, teamId, agentId);
        res.json({ success: true, data: { events, total: events.length } });
      } catch (error) {
        logger.error('[DashboardServer] Failed to get events', { error });
        res.status(500).json({ success: false, error: 'Failed to get recent events' });
      }
    });

    // GET /api/dashboard/metrics - Cost/usage metrics
    this.app.get('/api/dashboard/metrics', (_req: Request, res: Response) => {
      try {
        const metrics = this.getDashboardMetrics();
        res.json({ success: true, data: metrics });
      } catch (error) {
        logger.error('[DashboardServer] Failed to get metrics', { error });
        res.status(500).json({ success: false, error: 'Failed to get dashboard metrics' });
      }
    });

    // =========================================================================
    // Legacy Team API Endpoints
    // =========================================================================

    // Get all teams
    this.app.get('/api/teams', (_req: Request, res: Response) => {
      const teams = (this.orchestrator as any).listActiveTeams().map((team) => ({
        id: team.id,
        name: team.name,
        status: team.status,
        agentCount: team.agents.length,
        metrics: team.metrics,
        budget: team.budget,
        currentBranch: (team as any).currentBranch,
        hasBranching: (team as any).config.enableBranching,
        hasEventStreaming: (team as any).config.enableEventStreaming,
      }));
      res.json({ teams });
    });

    // Get specific team
    this.app.get('/api/teams/:id', (req: Request, res: Response) => {
      const team = this.orchestrator.getTeam(req.params['id'] as string);
      if (!team) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      const status = (this.orchestrator as any).getStatus(team.id);
      const agents = (this.orchestrator as any).getTeamAgents(team.id);

      res.json({
        ...team,
        statusInfo: status,
        agents: agents.map((a) => ({
          id: a.id,
          status: a.status,
          lifecycleState: a.lifecycleState,
          task: a.agent.task,
          model: a.agent.model,
          runtime: a.agent.runtime,
        })),
      });
    });

    // Create new team
    this.app.post('/api/teams', async (req: Request, res: Response) => {
      try {
        const { name, config } = req.body;
        if (!name) {
          res.status(400).json({ error: 'Team name is required' });
          return;
        }

        const teamConfig = {
          name,
          task: config?.task || '',
          initialAgents: config?.initialAgents || 1,
          maxAgents: config?.maxAgents || 10,
          strategy: config?.strategy || 'parallel',
          model: config?.model,
          budget: config?.budget,
          enableBranching: config?.enableBranching || false,
          enableEventStreaming: config?.enableEventStreaming || true,
          ...config,
        };

        const team = await (this.orchestrator as any).create(teamConfig);
        res.status(201).json({ success: true, data: team });
      } catch (error) {
        logger.error('[DashboardServer] Failed to create team', { error });
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Failed to create team' 
        });
      }
    });

    // Update team
    this.app.put('/api/teams/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const updates = req.body;
        
        const team = (this.orchestrator as any).getTeam ? (this.orchestrator as any).getTeam(id) : null;
        if (!team) {
          res.status(404).json({ error: 'Team not found' });
          return;
        }

        // Apply updates
        if (updates.name) team.name = updates.name;
        if (updates.config) {
          (team as any).config = { ...(team as any).config, ...updates.config };
        }

        res.json({ success: true, data: team });
      } catch (error) {
        logger.error('[DashboardServer] Failed to update team', { error });
        res.status(500).json({ error: 'Failed to update team' });
      }
    });

    // Start team
    this.app.post('/api/teams/:id/start', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await (this.orchestrator as any).start ? (this.orchestrator as any).start(id) : Promise.resolve();
        res.json({ success: true, message: 'Team started' });
      } catch (error) {
        logger.error('[DashboardServer] Failed to start team', { error });
        res.status(500).json({ error: 'Failed to start team' });
      }
    });

    // Stop team
    this.app.post('/api/teams/:id/stop', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await (this.orchestrator as any).stop ? (this.orchestrator as any).stop(id) : Promise.resolve();
        res.json({ success: true, message: 'Team stopped' });
      } catch (error) {
        logger.error('[DashboardServer] Failed to stop team', { error });
        res.status(500).json({ error: 'Failed to stop team' });
      }
    });

    // Scale team
    this.app.post('/api/teams/:id/scale', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { targetSize } = req.body;
        
        if (typeof targetSize !== 'number' || targetSize < 1) {
          res.status(400).json({ error: 'Invalid target size' });
          return;
        }

        await (this.orchestrator as any).scale ? (this.orchestrator as any).scale(id as string, targetSize) : Promise.resolve();
        res.json({ success: true, message: `Team scaled to ${targetSize} agents` });
      } catch (error) {
        logger.error('[DashboardServer] Failed to scale team', { error });
        res.status(500).json({ error: 'Failed to scale team' });
      }
    });

    // Pause team
    this.app.post('/api/teams/:id/pause', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await (this.orchestrator as any).pause ? (this.orchestrator as any).pause(id) : Promise.resolve();
        res.json({ success: true, message: 'Team paused' });
      } catch (error) {
        logger.error('[DashboardServer] Failed to pause team', { error });
        res.status(500).json({ error: 'Failed to pause team' });
      }
    });

    // Resume team
    this.app.post('/api/teams/:id/resume', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await (this.orchestrator as any).resume ? (this.orchestrator as any).resume(id) : Promise.resolve();
        res.json({ success: true, message: 'Team resumed' });
      } catch (error) {
        logger.error('[DashboardServer] Failed to resume team', { error });
        res.status(500).json({ error: 'Failed to resume team' });
      }
    });

    // Destroy team
    this.app.delete('/api/teams/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await (this.orchestrator as any).destroy ? (this.orchestrator as any).destroy(id) : Promise.resolve();
        res.json({ success: true, message: 'Team destroyed' });
      } catch (error) {
        logger.error('[DashboardServer] Failed to destroy team', { error });
        res.status(500).json({ error: 'Failed to destroy team' });
      }
    });

    // Get team events
    this.app.get('/api/teams/:id/events', (req: Request, res: Response) => {
      const id = req.params['id'] as string;
      const limit = parseInt(req.query['limit'] as string) || 100;
      
      const events = this.eventBus.getEvents({ teamId: id }).slice(0, limit);
      res.json({ events });
    });

    // Get session tree
    this.app.get('/api/teams/:id/tree', (req: Request, res: Response) => {
      const team = this.orchestrator.getTeam(req.params['id'] as string);
      if (!team || !(team as any).config.enableBranching) {
        res.status(404).json({ error: 'Team tree not found or branching not enabled' });
        return;
      }

      const visualization = this.buildTreeVisualization((team as any).sessionTreeId || '');
      res.json(visualization);
    });

    // Get branches
    this.app.get('/api/teams/:id/branches', (req: Request, res: Response) => {
      const team = this.orchestrator.getTeam(req.params['id'] as string);
      if (!team || !(team as any).config.enableBranching) {
        res.status(404).json({ error: 'Team branches not found or branching not enabled' });
        return;
      }

      try {
        // We need to access the session tree for this team
        const tree = (this.orchestrator as any).getSessionTreeForTeam?.(team);
        if (!tree) {
          res.status(404).json({ error: 'Session tree not found' });
          return;
        }

        const branches = tree.listBranches();
        res.json({ branches, currentBranch: (team as any).currentBranch });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get branches' });
      }
    });

    // Compare branches
    this.app.post('/api/teams/:id/compare', (req: Request, res: Response) => {
      const { id } = req.params;
      const { branchIds } = req.body;

      if (!Array.isArray(branchIds) || branchIds.length < 2) {
        res.status(400).json({ error: 'At least 2 branch IDs required for comparison' });
        return;
      }

      try {
        const comparison = (this.orchestrator as any).compareBranches(id as string, branchIds);
        res.json(comparison);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Comparison failed'
        });
      }
    });

    // Create branch
    this.app.post('/api/teams/:id/branches', async (req: Request, res: Response) => {
      const { id } = req.params;
      const { name, description, fromEntryId } = req.body;

      if (!name) {
        res.status(400).json({ error: 'Branch name required' });
        return;
      }

      try {
        let entryId: string;
        if (fromEntryId) {
          entryId = await (this.orchestrator as any).createBranchAt(id as string, fromEntryId, name, description);
        } else {
          entryId = await (this.orchestrator as any).createBranch(id as string, name, description);
        }
        res.json({ entryId, name, description });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to create branch'
        });
      }
    });

    // Switch branch
    this.app.post('/api/teams/:id/switch-branch', async (req: Request, res: Response) => {
      const { id } = req.params;
      const { branchName } = req.body;

      if (!branchName) {
        res.status(400).json({ error: 'Branch name required' });
        return;
      }

      try {
        await (this.orchestrator as any).switchBranch(id as string, branchName);
        res.json({ success: true, currentBranch: branchName });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to switch branch'
        });
      }
    });

    // Get session tree data
    this.app.get('/api/sessions/:id/tree', (req: Request, res: Response) => {
      const id = req.params['id'] as string;
      const visualization = this.buildTreeVisualization(id);
      res.json(visualization);
    });

    // Agents API
    this.app.get('/api/agents', (_req: Request, res: Response) => {
      const agents = (this.orchestrator as any).getAllAgents ? (this.orchestrator as any).getAllAgents() : [];
      res.json({ agents });
    });

    this.app.get('/api/agents/:id', (req: Request, res: Response) => {
      const orchestrator = this.orchestrator as any;
      const agent = orchestrator.getAgent ? orchestrator.getAgent(req.params['id']) : null;
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json({ agent });
    });

    this.app.post('/api/agents/:id/kill', async (req: Request, res: Response) => {
      try {
        const orchestrator = this.orchestrator as any;
        await orchestrator.killAgent ? orchestrator.killAgent(req.params['id']) : Promise.resolve();
        res.json({ success: true, message: 'Agent killed' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to kill agent' });
      }
    });

    this.app.post('/api/agents/:id/restart', async (req: Request, res: Response) => {
      try {
        const orchestrator = this.orchestrator as any;
        const agent = await orchestrator.restartAgent ? orchestrator.restartAgent(req.params['id']) : null;
        res.json({ success: true, data: agent });
      } catch (error) {
        res.status(500).json({ error: 'Failed to restart agent' });
      }
    });

    // Metrics API
    this.app.get('/api/metrics/dashboard', (_req: Request, res: Response) => {
      const stats = this.getDashboardOverview();
      res.json({ success: true, data: stats });
    });

    this.app.get('/api/metrics/cost', (_req: Request, res: Response) => {
      const metrics = this.getDashboardMetrics();
      res.json({ success: true, data: metrics });
    });

    // Health checks
    this.app.get('/api/health/detailed', (_req: Request, res: Response) => {
      const health = {
        status: 'healthy' as const,
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          eventBus: { status: 'healthy' as const, responseTime: 0 },
          orchestrator: { status: this.orchestrator ? 'healthy' as const : 'unhealthy' as const, responseTime: 0 },
          database: { status: 'healthy' as const, responseTime: 0 },
        }
      };
      res.json({ success: true, data: health });
    });

    this.app.get('/api/health/ready', (_req: Request, res: Response) => {
      res.json({ ready: this.isRunning });
    });

    this.app.get('/api/health/live', (_req: Request, res: Response) => {
      res.json({ alive: true });
    });
  }

  // =========================================================================
  // Dashboard Data Helpers
  // =========================================================================

  private getDashboardOverview(): DashboardOverview {
    const teams = (this.orchestrator as any).listActiveTeams();
    const allAgents = teams.flatMap(s => 
      (this.orchestrator as any).getTeamAgents(s.id)
    );

    const activeAgents = allAgents.filter(a => 
      a.status === (AgentStatus as any).RUNNING || a.status === (AgentStatus as any).BUSY
    );

    const activeTeams = teams.filter(s => 
      s.status === 'active' || s.status === 'scaling'
    );

    const totalCost = allAgents.reduce((sum, a) => sum + ((a as any).cost || 0), 0);

    const agentsByStatus = allAgents.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalAgents: allAgents.length,
      activeAgents: activeAgents.length,
      totalTeams: teams.length,
      activeTeams: activeTeams.length,
      totalCost,
      eventsPerSecond: this.calculateEventsPerSecond(),
      systemHealth: this.calculateSystemHealth(activeAgents.length, allAgents.length),
      agentsByStatus,
      recentEvents: (this.eventBus as any).getEvents ? (this.eventBus as any).getEvents({ limit: 100 }).length : 0,
    };
  }

  private getTeamDashboardInfo(): TeamDashboardInfo[] {
    return (this.orchestrator as any).listActiveTeams().map(team => {
      const agents = (this.orchestrator as any).getTeamAgents(team.id);
      const progress = team.metrics.totalAgents > 0
        ? (team.metrics.completedAgents + team.metrics.failedAgents) / team.metrics.totalAgents
        : 0;

      return {
        id: team.id,
        name: team.name,
        status: team.status,
        agentCount: agents.length,
        budgetRemaining: team.budget.remaining,
        budgetConsumed: team.budget.consumed,
        progress: Math.round(progress * 100),
        strategy: (team as any).config.strategy,
        createdAt: team.createdAt.toISOString(),
        currentBranch: (team as any).currentBranch,
      };
    });
  }

  private getAgentDashboardInfo(teamId?: string): AgentDashboardInfo[] {
    const teams = teamId 
      ? [this.orchestrator.getTeam(teamId)].filter(Boolean)
      : (this.orchestrator as any).listActiveTeams();

    return teams.flatMap(team => {
      const agents = (this.orchestrator as any).getTeamAgents(team.id);
      return agents.map(agent => ({
        id: agent.id,
        label: (agent as any).label || 'unnamed',
        status: agent.status,
        model: (agent as any).model || 'unknown',
        teamId: team.id,
        swarmName: team.name,
        task: (agent as any).task || '',
        runtime: (agent as any).runtime || 0,
        cost: (agent as any).cost || 0,
        progress: (agent as any).progress || 0,
        spawnedAt: ((agent as any).spawnedAt || new Date()).toISOString(),
      }));
    });
  }

  private getRecentEvents(limit: number, teamId?: string, agentId?: string): AgentEvent[] {
    const filter: any = {};
    if (limit) filter['limit'] = limit;
    if (teamId) filter.teamId = teamId;
    if (agentId) filter.agentId = agentId;
    
    return (this.eventBus as any).getEvents ? (this.eventBus as any).getEvents(filter) : [];
  }

  private getDashboardMetrics(): any {
    const teams = (this.orchestrator as any).listActiveTeams();
    const allAgents = teams.flatMap(s => (this.orchestrator as any).getTeamAgents(s.id));
    
    const totalBudget = teams.reduce((sum, s) => sum + s.budget.allocated, 0);
    const consumedBudget = teams.reduce((sum, s) => sum + s.budget.consumed, 0);
    const totalCost = allAgents.reduce((sum, a) => sum + ((a as any).cost || 0), 0);

    const byModel = allAgents.reduce((acc, a) => {
      const model = (a as any).model || 'unknown';
      acc[model] = (acc[model] || 0) + ((a as any).cost || 0);
      return acc;
    }, {} as Record<string, number>);

    const byTeam = teams.reduce((acc, s) => {
      acc[s.name] = s.budget.consumed;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalSpent: totalCost,
      budgetAllocated: totalBudget,
      budgetConsumed: consumedBudget,
      budgetRemaining: totalBudget - consumedBudget,
      hourlyRate: this.calculateHourlyRate(allAgents),
      burnRate: consumedBudget / (process.uptime() / 3600) || 0,
      byModel,
      byTeam,
      agentCount: allAgents.length,
      swarmCount: teams.length,
    };
  }

  private calculateEventsPerSecond(): number {
    // Calculate based on recent event velocity
    const events = (this.eventBus as any).getEvents ? (this.eventBus as any).getEvents({}) : [];
    if (events.length < 2) return 0;
    
    const timeSpan = events[0].timestamp - events[events.length - 1].timestamp;
    if (timeSpan === 0) return 0;
    
    return Math.round((events.length / timeSpan) * 1000 * 10) / 10;
  }

  private calculateSystemHealth(active: number, total: number): 'healthy' | 'degraded' | 'critical' {
    if (total === 0) return 'healthy';
    const ratio = active / total;
    if (ratio >= 0.7) return 'healthy';
    if (ratio >= 0.3) return 'degraded';
    return 'critical';
  }

  private calculateHourlyRate(agents: any[]): number {
    const totalRuntime = agents.reduce((sum, a) => sum + (a.agent.runtime || 0), 0);
    const totalCost = agents.reduce((sum, a) => sum + (a.agent.cost || 0), 0);
    if (totalRuntime === 0) return 0;
    return totalCost / (totalRuntime / 3600);
  }

  // =========================================================================
  // Server Lifecycle
  // =========================================================================

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[DashboardServer] Already running');
      return;
    }

    // Initialize metrics if enabled
    if (this.config.enableMetrics && !this.metricsInitialized) {
      this.metrics.initialize(this.eventBus, this.orchestrator);
      this.metricsInitialized = true;
      logger.info('[DashboardServer] Prometheus metrics initialized');
    }

    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        logger.info(`[DashboardServer] HTTP server running at http://${this.config.host}:${this.config.port}`);

        // Setup WebSocket server
        this.setupWebSocketServer();

        // Subscribe to all events
        this.subscribeToEvents();

        // Start heartbeat
        this.startHeartbeat();

        // Start metrics collection
        this.startMetricsCollection();

        this.isRunning = true;
        this.emit('started');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    // Stop metrics
    if (this.metricsInitialized) {
      this.metrics.stop();
      this.metricsInitialized = false;
    }

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    // Stop metrics collection
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    // Unsubscribe from events
    if (this.eventSubscription) {
      this.eventBus.unsubscribe(this.eventSubscription);
      this.eventSubscription = undefined;
    }

    // Close all WebSocket connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = undefined;
    }

    // Close HTTP server
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }

    this.isRunning = false;
    this.emit('stopped');
    logger.info('[DashboardServer] Stopped');
  }

  // =========================================================================
  // WebSocket
  // =========================================================================

  private setupWebSocketServer(): void {
    if (!this.server) return;

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const pathname = url.pathname;

      // Validate WebSocket path
      if (!this.isValidWebSocketPath(pathname)) {
        ws.close(1008, 'Invalid WebSocket path');
        return;
      }

      // Check authentication
      const authToken = url.searchParams.get('token');
      if (this.config.apiKey && authToken !== this.config.apiKey) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const client: DashboardClient = {
        id: clientId,
        ws,
        subscribedTeams: new Set(),
        subscribedSessions: new Set(),
        subscribedAgents: new Set(),
        lastHeartbeat: Date.now(),
        eventBuffer: [],
        authToken: authToken || undefined,
        subscriptions: new Set(),
      };

      this.clients.set(clientId, client);
      logger.info(`[DashboardServer] WebSocket client connected: ${clientId} on ${pathname}`);

      // Send welcome message with client info
      this.sendToClient(client, {
        type: 'connected',
        clientId,
        timestamp: Date.now(),
        path: pathname,
      });

      // Handle different WebSocket endpoints
      this.setupWebSocketHandlers(client, pathname);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(client, message);
        } catch (error) {
          this.sendToClient(client, {
            type: 'error',
            error: 'Invalid message format',
          });
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info(`[DashboardServer] WebSocket client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        logger.error(`[DashboardServer] WebSocket error for ${clientId}: ${error.message}`);
        this.clients.delete(clientId);
      });
    });
  }

  private isValidWebSocketPath(pathname: string): boolean {
    const validPaths = ['/events', '/ws', '/ws/events', '/ws/metrics', '/ws/teams'];
    return validPaths.includes(pathname);
  }

  private setupWebSocketHandlers(client: DashboardClient, pathname: string): void {
    // Set up subscription based on path
    switch (pathname) {
      case '/ws/events':
        client.subscriptions.add('events');
        break;
      case '/ws/metrics':
        client.subscriptions.add('metrics');
        // Send initial metrics
        this.sendToClient(client, {
          type: 'metrics',
          data: this.getDashboardMetrics(),
        });
        break;
      case '/ws/teams':
        client.subscriptions.add('teams');
        // Send initial team list
        this.sendToClient(client, {
          type: 'teams',
          data: this.getTeamDashboardInfo(),
        });
        break;
      default:
        // General event stream
        client.subscriptions.add('events');
        break;
    }
  }

  private handleClientMessage(client: DashboardClient, message: any): void {
    switch (message.type) {
      case 'subscribe':
        if (message.teamId) {
          client.subscribedTeams.add(message.teamId);
          this.sendToClient(client, {
            type: 'subscribed',
            teamId: message.teamId,
          });
        }
        if (message.sessionId) {
          client.subscribedSessions.add(message.sessionId);
        }
        if (message.agentId) {
          client.subscribedAgents.add(message.agentId);
        }
        break;

      case 'unsubscribe':
        if (message.teamId) {
          client.subscribedTeams.delete(message.teamId);
        }
        if (message.sessionId) {
          client.subscribedSessions.delete(message.sessionId);
        }
        if (message.agentId) {
          client.subscribedAgents.delete(message.agentId);
        }
        break;

      case 'heartbeat':
        client.lastHeartbeat = Date.now();
        this.sendToClient(client, {
          type: 'heartbeat',
          timestamp: Date.now(),
        });
        break;

      case 'get_tree':
        if (message.sessionId) {
          const visualization = this.buildTreeVisualization(message.sessionId);
          this.sendToClient(client, {
            type: 'tree_data',
            sessionId: message.sessionId,
            tree: visualization,
          });
        }
        break;

      case 'get_branches':
        if (message.teamId) {
          const team = this.orchestrator.getTeam(message.teamId);
          if ((team as any)?.config.enableBranching) {
            try {
              const tree = (this.orchestrator as any).getSessionTreeForTeam?.(team);
              if (tree) {
                this.sendToClient(client, {
                  type: 'branches_data',
                  teamId: message.teamId,
                  branches: tree.listBranches(),
                  currentBranch: (team as any).currentBranch,
                });
              }
            } catch (error) {
              this.sendToClient(client, {
                type: 'error',
                error: 'Failed to get branches',
              });
            }
          }
        }
        break;

      case 'switch_branch':
        if (message.teamId && message.branchName) {
          (this.orchestrator as any).switchBranch(message.teamId, message.branchName)
            .then(() => {
              this.sendToClient(client, {
                type: 'branch_switched',
                teamId: message.teamId,
                branchName: message.branchName,
              });
            })
            .catch((error) => {
              this.sendToClient(client, {
                type: 'error',
                error: error instanceof Error ? error.message : 'Failed to switch branch',
              });
            });
        }
        break;

      case 'get_overview':
        this.sendToClient(client, {
          type: 'overview',
          data: this.getDashboardOverview(),
        });
        break;

      case 'get_metrics':
        this.sendToClient(client, {
          type: 'metrics',
          data: this.getDashboardMetrics(),
        });
        break;

      case 'get_teams':
        this.sendToClient(client, {
          type: 'teams',
          data: this.getTeamDashboardInfo(),
        });
        break;

      default:
        this.sendToClient(client, {
          type: 'error',
          error: `Unknown message type: ${message.type}`,
        });
    }
  }

  private sendToClient(client: DashboardClient, data: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  private broadcast(data: any, filter?: (client: DashboardClient) => boolean): void {
    const message = JSON.stringify(data);
    for (const client of this.clients.values()) {
      if (filter && !filter(client)) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  // =========================================================================
  // Event Handling
  // =========================================================================

  private subscribeToEvents(): void {
    this.eventSubscription = this.eventBus.subscribeAll((event) => {
      // Broadcast to appropriate clients based on subscriptions
      for (const client of this.clients.values()) {
        // Check subscription filters
        if (event.teamId && !client.subscribedTeams.has(event.teamId) && client.subscribedTeams.size > 0) {
          continue;
        }
        if (event.agentId && !client.subscribedAgents.has(event.agentId) && client.subscribedAgents.size > 0) {
          continue;
        }

        // Buffer event if client is lagging
        if (client.eventBuffer.length >= this.config.maxEventBuffer) {
          client.eventBuffer.shift(); // Remove oldest
        }

        // Send based on subscription type
        if (client.subscriptions.has('events')) {
          this.sendToClient(client, {
            type: 'event',
            event,
          });
        }
      }
    });
  }

  // =========================================================================
  // Heartbeat
  // =========================================================================

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.config.heartbeatInterval * 2;

      for (const [clientId, client] of this.clients) {
        if (now - client.lastHeartbeat > timeout) {
          logger.warn(`[DashboardServer] Client ${clientId} timed out`);
          client.ws.close();
          this.clients.delete(clientId);
        } else {
          this.sendToClient(client, {
            type: 'heartbeat',
            timestamp: now,
          });
        }
      }
    }, this.config.heartbeatInterval);
  }

  // =========================================================================
  // Metrics Collection
  // =========================================================================

  private startMetricsCollection(): void {
    if (!this.config.enableMetrics) return;

    this.metricsInterval = setInterval(() => {
      // Update WebSocket connection count
      this.metrics.setWebSocketConnections(this.clients.size);

      // Update event bus metrics
      const eventMetrics = this.eventBus.getMetrics();
      this.metrics.setEventBusSubscriptions(eventMetrics.subscriptionsCreated - eventMetrics.subscriptionsRemoved);

      // Update memory metrics
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsageGauge.set({ type: 'rss' }, memUsage.rss);
      this.metrics.memoryUsageGauge.set({ type: 'heap_used' }, memUsage.heapUsed);
      this.metrics.memoryUsageGauge.set({ type: 'heap_total' }, memUsage.heapTotal);

      // Broadcast metrics to subscribed clients
      const metricsData = this.getDashboardMetrics();
      this.broadcast(
        { type: 'metrics_update', data: metricsData },
        (client) => client.subscriptions.has('metrics')
      );

      // Broadcast team updates
      const teamsData = this.getTeamDashboardInfo();
      this.broadcast(
        { type: 'teams_update', data: teamsData },
        (client) => client.subscriptions.has('teams')
      );
    }, 15000); // Every 15 seconds
  }

  // =========================================================================
  // Tree Visualization
  // =========================================================================

  private buildTreeVisualization(sessionId: string): TreeVisualization {
    // Use the current session tree
    const tree = this.sessionTree;

    const nodes: TreeVisualizationNode[] = [];
    const treeNodes = tree.getTree();

    const processNode = (node: any, depth: number) => {
      const vizNode: TreeVisualizationNode = {
        id: node.entry.id,
        type: node.entry.type,
        parentId: node.entry.parentId,
        timestamp: node.entry.timestamp,
        label: node.label,
        depth,
        hasChildren: node.children.length > 0,
      };

      if (node.entry.type === 'branch_point') {
        vizNode.branchName = node.entry.branchName;
      }

      if (node.entry.type === 'message') {
        vizNode.metadata = {
          role: node.entry.role,
          contentLength: node.entry.content?.length,
        };
      }

      if (node.entry.type === 'agent_action') {
        vizNode.metadata = {
          action: node.entry.action,
          agentId: node.entry.agentId,
        };
      }

      nodes.push(vizNode);

      for (const child of node.children) {
        processNode(child, depth + 1);
      }
    };

    for (const root of treeNodes) {
      processNode(root, 0);
    }

    return {
      sessionId: tree.getSessionId(),
      sessionName: tree.getName(),
      rootNodes: nodes.filter((n) => n.parentId === null),
      totalNodes: nodes.length,
      branches: tree.listBranches().map((b) => b.name),
      currentBranch: tree.getCurrentBranch(),
    };
  }

  // =========================================================================
  // Getters
  // =========================================================================

  getClientCount(): number {
    return this.clients.size;
  }

  getConfig(): DashboardConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalDashboardServer: DashboardServer | null = null;

export function getGlobalDashboardServer(
  eventBus?: AgentEventBus,
  orchestrator?: TeamOrchestrator,
  sessionTree?: SessionTree,
  config?: Partial<DashboardConfig>
): DashboardServer {
  if (!globalDashboardServer) {
    if (!eventBus || !orchestrator || !sessionTree) {
      throw new Error('DashboardServer requires dependencies on first initialization');
    }
    globalDashboardServer = new DashboardServer(eventBus, orchestrator, sessionTree, config);
  }
  return globalDashboardServer;
}

export function resetGlobalDashboardServer(): void {
  globalDashboardServer = null;
}

export default DashboardServer;
