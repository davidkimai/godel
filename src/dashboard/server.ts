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
import { SwarmOrchestrator } from '../core/swarm-orchestrator';
import { logger } from '../utils/logger';
import { PrometheusMetrics, createHealthRouter, HealthCheckConfig } from '../metrics';

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
}

export interface DashboardClient {
  id: string;
  ws: WebSocket;
  subscribedSwarms: Set<string>;
  subscribedSessions: Set<string>;
  lastHeartbeat: number;
  eventBuffer: AgentEvent[];
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

// ============================================================================
// Dashboard Server
// ============================================================================

export class DashboardServer extends EventEmitter {
  private config: DashboardConfig;
  private eventBus: AgentEventBus;
  private orchestrator: SwarmOrchestrator;
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
    orchestrator: SwarmOrchestrator,
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

    // Get all swarms
    this.app.get('/api/swarms', (_req: Request, res: Response) => {
      const swarms = this.orchestrator.listActiveSwarms().map((swarm) => ({
        id: swarm.id,
        name: swarm.name,
        status: swarm.status,
        agentCount: swarm.agents.length,
        metrics: swarm.metrics,
        budget: swarm.budget,
        currentBranch: swarm.currentBranch,
        hasBranching: swarm.config.enableBranching,
        hasEventStreaming: swarm.config.enableEventStreaming,
      }));
      res.json({ swarms });
    });

    // Get specific swarm
    this.app.get('/api/swarms/:id', (req: Request, res: Response) => {
      const swarm = this.orchestrator.getSwarm(req.params['id'] as string);
      if (!swarm) {
        res.status(404).json({ error: 'Swarm not found' });
        return;
      }

      const status = this.orchestrator.getStatus(swarm.id);
      const agents = this.orchestrator.getSwarmAgents(swarm.id);

      res.json({
        ...swarm,
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

    // Get swarm events
    this.app.get('/api/swarms/:id/events', (req: Request, res: Response) => {
      const id = req.params['id'] as string;
      const limit = parseInt(req.query['limit'] as string) || 100;
      
      const events = this.eventBus.getEvents({ swarmId: id }).slice(0, limit);
      res.json({ events });
    });

    // Get session tree
    this.app.get('/api/swarms/:id/tree', (req: Request, res: Response) => {
      const swarm = this.orchestrator.getSwarm(req.params['id'] as string);
      if (!swarm || !swarm.config.enableBranching) {
        res.status(404).json({ error: 'Swarm tree not found or branching not enabled' });
        return;
      }

      const visualization = this.buildTreeVisualization(swarm.sessionTreeId || '');
      res.json(visualization);
    });

    // Get branches
    this.app.get('/api/swarms/:id/branches', (req: Request, res: Response) => {
      const swarm = this.orchestrator.getSwarm(req.params['id'] as string);
      if (!swarm || !swarm.config.enableBranching) {
        res.status(404).json({ error: 'Swarm branches not found or branching not enabled' });
        return;
      }

      try {
        // We need to access the session tree for this swarm
        const tree = (this.orchestrator as any).getSessionTreeForSwarm?.(swarm);
        if (!tree) {
          res.status(404).json({ error: 'Session tree not found' });
          return;
        }

        const branches = tree.listBranches();
        res.json({ branches, currentBranch: swarm.currentBranch });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get branches' });
      }
    });

    // Compare branches
    this.app.post('/api/swarms/:id/compare', (req: Request, res: Response) => {
      const { id } = req.params;
      const { branchIds } = req.body;

      if (!Array.isArray(branchIds) || branchIds.length < 2) {
        res.status(400).json({ error: 'At least 2 branch IDs required for comparison' });
        return;
      }

      try {
        const comparison = this.orchestrator.compareBranches(id as string, branchIds);
        res.json(comparison);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Comparison failed'
        });
      }
    });

    // Create branch
    this.app.post('/api/swarms/:id/branches', async (req: Request, res: Response) => {
      const { id } = req.params;
      const { name, description, fromEntryId } = req.body;

      if (!name) {
        res.status(400).json({ error: 'Branch name required' });
        return;
      }

      try {
        let entryId: string;
        if (fromEntryId) {
          entryId = await this.orchestrator.createBranchAt(id as string, fromEntryId, name, description);
        } else {
          entryId = await this.orchestrator.createBranch(id as string, name, description);
        }
        res.json({ entryId, name, description });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to create branch'
        });
      }
    });

    // Switch branch
    this.app.post('/api/swarms/:id/switch-branch', async (req: Request, res: Response) => {
      const { id } = req.params;
      const { branchName } = req.body;

      if (!branchName) {
        res.status(400).json({ error: 'Branch name required' });
        return;
      }

      try {
        await this.orchestrator.switchBranch(id as string, branchName);
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

    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const client: DashboardClient = {
        id: clientId,
        ws,
        subscribedSwarms: new Set(),
        subscribedSessions: new Set(),
        lastHeartbeat: Date.now(),
        eventBuffer: [],
      };

      this.clients.set(clientId, client);
      logger.info(`[DashboardServer] WebSocket client connected: ${clientId}`);

      // Send welcome message
      this.sendToClient(client, {
        type: 'connected',
        clientId,
        timestamp: Date.now(),
      });

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

  private handleClientMessage(client: DashboardClient, message: any): void {
    switch (message.type) {
      case 'subscribe':
        if (message.swarmId) {
          client.subscribedSwarms.add(message.swarmId);
          this.sendToClient(client, {
            type: 'subscribed',
            swarmId: message.swarmId,
          });
        }
        if (message.sessionId) {
          client.subscribedSessions.add(message.sessionId);
        }
        break;

      case 'unsubscribe':
        if (message.swarmId) {
          client.subscribedSwarms.delete(message.swarmId);
        }
        if (message.sessionId) {
          client.subscribedSessions.delete(message.sessionId);
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
        if (message.swarmId) {
          const swarm = this.orchestrator.getSwarm(message.swarmId);
          if (swarm?.config.enableBranching) {
            try {
              const tree = (this.orchestrator as any).getSessionTreeForSwarm?.(swarm);
              if (tree) {
                this.sendToClient(client, {
                  type: 'branches_data',
                  swarmId: message.swarmId,
                  branches: tree.listBranches(),
                  currentBranch: swarm.currentBranch,
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
        if (message.swarmId && message.branchName) {
          this.orchestrator.switchBranch(message.swarmId, message.branchName)
            .then(() => {
              this.sendToClient(client, {
                type: 'branch_switched',
                swarmId: message.swarmId,
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

  private broadcast(data: any): void {
    const message = JSON.stringify(data);
    for (const client of this.clients.values()) {
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
      // Broadcast to all subscribed clients
      for (const client of this.clients.values()) {
        // Check if client is subscribed to this swarm
        if (event.swarmId && !client.subscribedSwarms.has(event.swarmId)) {
          continue;
        }

        // Buffer event if client is lagging
        if (client.eventBuffer.length >= this.config.maxEventBuffer) {
          client.eventBuffer.shift(); // Remove oldest
        }

        this.sendToClient(client, {
          type: 'event',
          event,
        });
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
  orchestrator?: SwarmOrchestrator,
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