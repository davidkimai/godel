/**
 * Federation Dashboard
 *
 * Simple web dashboard for monitoring federation system:
 * - Real-time agent status
 * - Execution progress
 * - Cost tracking
 * - System metrics
 *
 * Usage:
 *   import { createFederationDashboard } from './federation-dashboard';
 *   createFederationDashboard(7654);
 */

import { createServer, Server } from 'http';
import { AgentRegistry } from '../federation/agent-registry';
import { ExecutionTracker } from '../federation/execution-tracker';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

interface DashboardConfig {
  port: number;
  host: string;
  refreshInterval: number;
  title: string;
}

interface AgentStatus {
  id: string;
  status: 'idle' | 'busy' | 'offline';
  capabilities: string[];
  load: number;
  costPerHour: number;
}

interface ExecutionStatus {
  id: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// Dashboard State
// ============================================================================

class FederationDashboardState {
  private executions: Map<string, ExecutionStatus> = new Map();
  private agentRegistry: AgentRegistry;

  constructor() {
    this.agentRegistry = new AgentRegistry();
  }

  getAgents(): AgentStatus[] {
    // Try to get from registry, fallback to mock data
    try {
      const agents = (this.agentRegistry as any).getHealthyAgents?.() || [];
      return agents.map((a: any) => ({
        id: a.id,
        status: a.status || 'idle',
        capabilities: a.capabilities?.skills || [],
        load: a.currentLoad || 0,
        costPerHour: a.capabilities?.costPerHour || 0.50,
      }));
    } catch {
      return [];
    }
  }

  getExecutions(): ExecutionStatus[] {
    return Array.from(this.executions.values());
  }

  addExecution(execution: ExecutionStatus): void {
    this.executions.set(execution.id, execution);
  }

  updateExecution(id: string, updates: Partial<ExecutionStatus>): void {
    const existing = this.executions.get(id);
    if (existing) {
      Object.assign(existing, updates);
    }
  }

  getMetrics() {
    const agents = this.getAgents();
    const executions = this.getExecutions();

    const healthy = agents.filter(a => a.status !== 'offline').length;
    const busy = agents.filter(a => a.status === 'busy').length;
    const idle = agents.filter(a => a.status === 'idle').length;

    const runningExecutions = executions.filter(e => e.status === 'running').length;
    const completedExecutions = executions.filter(e => e.status === 'completed').length;
    const failedExecutions = executions.filter(e => e.status === 'failed').length;

    const hourlyCost = agents.reduce((sum, a) => sum + a.costPerHour, 0);

    return {
      agents: {
        total: agents.length,
        healthy,
        busy,
        idle,
      },
      executions: {
        total: executions.length,
        running: runningExecutions,
        completed: completedExecutions,
        failed: failedExecutions,
      },
      cost: {
        hourly: hourlyCost,
        daily: hourlyCost * 24,
        monthly: hourlyCost * 24 * 30,
      },
      utilization: agents.length > 0 ? busy / agents.length : 0,
    };
  }
}

// ============================================================================
// Dashboard Server
// ============================================================================

class FederationDashboard {
  private config: DashboardConfig;
  private state: FederationDashboardState;
  private server?: Server;

  constructor(config?: Partial<DashboardConfig>) {
    this.config = {
      port: 7654,
      host: 'localhost',
      refreshInterval: 5000,
      title: 'Godel Federation Dashboard',
      ...config,
    };
    this.state = new FederationDashboardState();
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(`🤖 Federation Dashboard running at http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Federation Dashboard stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
    const url = req.url || '/';

    // API Routes
    if (url === '/api/status') {
      this.handleApiStatus(res);
      return;
    }

    if (url === '/api/agents') {
      this.handleApiAgents(res);
      return;
    }

    if (url === '/api/metrics') {
      this.handleApiMetrics(res);
      return;
    }

    if (url === '/api/executions') {
      this.handleApiExecutions(res);
      return;
    }

    // Main Dashboard
    if (url === '/' || url === '/dashboard') {
      this.handleDashboard(res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private handleApiStatus(res: import('http').ServerResponse): void {
    const agents = this.state.getAgents();
    const metrics = this.state.getMetrics();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      timestamp: new Date().toISOString(),
      status: metrics.agents.healthy > 0 ? 'active' : 'inactive',
      agents: {
        total: agents.length,
        healthy: metrics.agents.healthy,
        busy: metrics.agents.busy,
        idle: metrics.agents.idle,
      },
      utilization: metrics.utilization,
    }));
  }

  private handleApiAgents(res: import('http').ServerResponse): void {
    const agents = this.state.getAgents();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      count: agents.length,
      agents: agents.map(a => ({
        id: a.id,
        status: a.status,
        capabilities: a.capabilities.slice(0, 5),
        load: a.load,
        costPerHour: a.costPerHour,
      })),
    }));
  }

  private handleApiMetrics(res: import('http').ServerResponse): void {
    const metrics = this.state.getMetrics();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      timestamp: new Date().toISOString(),
      agents: metrics.agents,
      executions: metrics.executions,
      cost: metrics.cost,
      utilization: metrics.utilization,
    }));
  }

  private handleApiExecutions(res: import('http').ServerResponse): void {
    const executions = this.state.getExecutions();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      count: executions.length,
      executions: executions.slice(-10).map(e => ({
        id: e.id,
        task: e.task.slice(0, 50) + (e.task.length > 50 ? '...' : ''),
        status: e.status,
        progress: e.progress,
      })),
    }));
  }

  private handleDashboard(res: import('http').ServerResponse): void {
    const agents = this.state.getAgents();
    const metrics = this.state.getMetrics();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.config.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }
    
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid #334155;
    }
    
    h1 {
      font-size: 28px;
      font-weight: 600;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
    }
    
    .status-badge.active {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }
    
    .status-badge.inactive {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }
    
    .metric-card {
      background: #1e293b;
      border-radius: 12px;
      padding: 24px;
      border: 1px solid #334155;
      transition: transform 0.2s, border-color 0.2s;
    }
    
    .metric-card:hover {
      transform: translateY(-2px);
      border-color: #475569;
    }
    
    .metric-label {
      font-size: 14px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    .metric-value {
      font-size: 36px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 4px;
    }
    
    .metric-sublabel {
      font-size: 13px;
      color: #64748b;
    }
    
    .metric-value.success { color: #4ade80; }
    .metric-value.warning { color: #fbbf24; }
    .metric-value.error { color: #f87171; }
    .metric-value.info { color: #60a5fa; }
    
    .section {
      background: #1e293b;
      border-radius: 12px;
      padding: 24px;
      border: 1px solid #334155;
      margin-bottom: 24px;
    }
    
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .refresh-indicator {
      font-size: 13px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .refresh-indicator::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      animation: pulse 2s infinite;
    }
    
    .agent-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .agent-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: #0f172a;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    
    .agent-status {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    
    .agent-status.idle { background: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.5); }
    .agent-status.busy { background: #f59e0b; box-shadow: 0 0 8px rgba(245, 158, 11, 0.5); }
    .agent-status.offline { background: #64748b; }
    
    .agent-info {
      flex: 1;
      min-width: 0;
    }
    
    .agent-id {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 14px;
      color: #e2e8f0;
      margin-bottom: 4px;
    }
    
    .agent-meta {
      font-size: 12px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .agent-capabilities {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    
    .capability-tag {
      font-size: 11px;
      padding: 2px 8px;
      background: #334155;
      border-radius: 4px;
      color: #94a3b8;
    }
    
    .agent-cost {
      text-align: right;
      font-size: 14px;
      color: #94a3b8;
    }
    
    .cost-value {
      font-weight: 600;
      color: #f8fafc;
    }
    
    .empty-state {
      text-align: center;
      padding: 48px;
      color: #64748b;
    }
    
    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    .execution-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .execution-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: #0f172a;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    
    .execution-status {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }
    
    .execution-status.pending { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .execution-status.running { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
    .execution-status.completed { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
    .execution-status.failed { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    
    .execution-info {
      flex: 1;
    }
    
    .execution-task {
      font-size: 14px;
      color: #e2e8f0;
      margin-bottom: 4px;
    }
    
    .execution-id {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      color: #64748b;
    }
    
    .progress-bar {
      width: 120px;
      height: 6px;
      background: #334155;
      border-radius: 3px;
      overflow: hidden;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #22c55e);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    
    .cost-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    
    .cost-item {
      text-align: center;
      padding: 20px;
      background: #0f172a;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    
    .cost-label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    
    .cost-amount {
      font-size: 24px;
      font-weight: 700;
      color: #f8fafc;
    }
    
    footer {
      text-align: center;
      padding: 24px;
      color: #64748b;
      font-size: 13px;
      border-top: 1px solid #334155;
      margin-top: 32px;
    }
    
    @media (max-width: 768px) {
      .metrics-grid {
        grid-template-columns: 1fr;
      }
      
      .cost-grid {
        grid-template-columns: 1fr;
      }
      
      .agent-item {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .agent-cost {
        text-align: left;
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>
        🤖 ${this.config.title}
      </h1>
      <div class="status-badge ${metrics.agents.healthy > 0 ? 'active' : 'inactive'}">
        <span class="status-dot"></span>
        ${metrics.agents.healthy > 0 ? 'Active' : 'Inactive'}
      </div>
    </header>

    <!-- Metrics Grid -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Agents</div>
        <div class="metric-value">${metrics.agents.total}</div>
        <div class="metric-sublabel">${metrics.agents.healthy} healthy</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-label">Busy Agents</div>
        <div class="metric-value ${metrics.agents.busy > 0 ? 'warning' : 'success'}">${metrics.agents.busy}</div>
        <div class="metric-sublabel">${metrics.agents.idle} idle</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-label">Utilization</div>
        <div class="metric-value info">${(metrics.utilization * 100).toFixed(0)}%</div>
        <div class="metric-sublabel">of capacity</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-label">Est. Cost/Hour</div>
        <div class="metric-value">$${metrics.cost.hourly.toFixed(2)}</div>
        <div class="metric-sublabel">$${metrics.cost.daily.toFixed(2)}/day</div>
      </div>
    </div>

    <!-- Agents Section -->
    <div class="section">
      <div class="section-header">
        <div class="section-title">
          🤖 Agents
        </div>
        <div class="refresh-indicator">Live</div>
      </div>
      
      ${agents.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">🤖</div>
          <p>No agents registered</p>
          <p style="font-size: 13px; margin-top: 8px;">Use "godel federation agents" to see registered agents</p>
        </div>
      ` : `
        <div class="agent-list">
          ${agents.map(agent => `
            <div class="agent-item">
              <div class="agent-status ${agent.status}"></div>
              <div class="agent-info">
                <div class="agent-id">${agent.id.slice(0, 16)}...</div>
                <div class="agent-meta">
                  <span>Load: ${(agent.load * 100).toFixed(0)}%</span>
                  ${agent.capabilities.length > 0 ? `
                    <span class="agent-capabilities">
                      ${agent.capabilities.slice(0, 3).map(c => `<span class="capability-tag">${c}</span>`).join('')}
                      ${agent.capabilities.length > 3 ? `<span class="capability-tag">+${agent.capabilities.length - 3}</span>` : ''}
                    </span>
                  ` : ''}
                </div>
              </div>
              <div class="agent-cost">
                <span class="cost-value">$${agent.costPerHour.toFixed(2)}</span>/hr
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Executions Section -->
    <div class="section">
      <div class="section-header">
        <div class="section-title">
          ⚡ Recent Executions
        </div>
        <div class="refresh-indicator">Live</div>
      </div>
      
      ${metrics.executions.total === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">⚡</div>
          <p>No recent executions</p>
          <p style="font-size: 13px; margin-top: 8px;">Use "godel federation execute" to run tasks</p>
        </div>
      ` : `
        <div class="execution-list">
          ${this.state.getExecutions().slice(-5).map(exec => `
            <div class="execution-item">
              <span class="execution-status ${exec.status}">${exec.status}</span>
              <div class="execution-info">
                <div class="execution-task">${exec.task.slice(0, 50)}${exec.task.length > 50 ? '...' : ''}</div>
                <div class="execution-id">${exec.id.slice(0, 16)}...</div>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${exec.progress}%"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Cost Section -->
    <div class="section">
      <div class="section-header">
        <div class="section-title">
          💰 Cost Estimates
        </div>
      </div>
      
      <div class="cost-grid">
        <div class="cost-item">
          <div class="cost-label">Hourly</div>
          <div class="cost-amount">$${metrics.cost.hourly.toFixed(2)}</div>
        </div>
        <div class="cost-item">
          <div class="cost-label">Daily</div>
          <div class="cost-amount">$${metrics.cost.daily.toFixed(2)}</div>
        </div>
        <div class="cost-item">
          <div class="cost-label">Monthly</div>
          <div class="cost-amount">$${metrics.cost.monthly.toFixed(2)}</div>
        </div>
      </div>
    </div>

    <footer>
      <p>Godel Federation Dashboard • Auto-refreshes every ${this.config.refreshInterval / 1000}s</p>
      <p style="margin-top: 8px; opacity: 0.7;">API: /api/status, /api/agents, /api/metrics, /api/executions</p>
    </footer>
  </div>

  <script>
    // Auto-refresh the page
    setInterval(() => {
      location.reload();
    }, ${this.config.refreshInterval});
    
    // Add subtle animation to progress bars
    document.querySelectorAll('.progress-fill').forEach(bar => {
      bar.style.width = '0%';
      setTimeout(() => {
        bar.style.width = bar.parentElement.dataset.progress || bar.style.width;
      }, 100);
    });
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and start a federation dashboard
 * @param port - Port number (default: 7654)
 * @returns Dashboard instance
 */
export function createFederationDashboard(port: number = 7654): FederationDashboard {
  const dashboard = new FederationDashboard({ port });
  dashboard.start();
  return dashboard;
}

export { FederationDashboard, FederationDashboardState };
export default createFederationDashboard;
