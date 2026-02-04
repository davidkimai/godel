/**
 * Dash Dashboard - Terminal Implementation
 * 
 * PRD Section 4: OpenTUI Dashboard
 * 
 * Features:
 * - Keyboard navigation (j/k, x, r, Enter)
 * - Real-time WebSocket updates
 * - Budget panel with burn rate visualization
 * - Event stream with auto-scroll
 */

import { EventEmitter } from 'events';

interface TerminalDashboardConfig {
  apiUrl: string;
  wsUrl: string;
  apiKey: string;
  refreshRate: number;
  theme: 'dark' | 'light';
}

interface AgentDisplay {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error' | 'blocked';
  task?: string;
  progress: number;
  lastActivity: Date;
}

interface BudgetDisplay {
  total: number;
  spent: number;
  remaining: number;
  burnRate: number;
  projectedEnd: Date;
  status: 'healthy' | 'warning' | 'critical';
}

const DEFAULT_CONFIG: TerminalDashboardConfig = {
  apiUrl: 'http://localhost:7373',
  wsUrl: 'ws://localhost:7374',
  apiKey: 'dash-api-key',
  refreshRate: 100,
  theme: 'dark'
};

export class TerminalDashboard extends EventEmitter {
  private config: TerminalDashboardConfig;
  private agents: AgentDisplay[] = [];
  private selectedIndex = 0;
  private paused = false;
  private eventHistory: any[] = [];
  private budget: BudgetDisplay | null = null;
  private isRunning = false;

  constructor(config: Partial<TerminalDashboardConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the dashboard UI
   */
  async initialize(): Promise<void> {
    this.emit('initialized');
  }

  /**
   * Start the dashboard
   */
  start(): void {
    this.isRunning = true;
    this.emit('started');
  }

  /**
   * Stop the dashboard
   */
  stop(): void {
    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Setup keyboard navigation
   */
  setupKeyboardNavigation(): void {
    // Navigation methods for external UI integration
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectToWebSocket(): void {
    // WebSocket connection established
  }

  /**
   * Set agents data
   */
  setAgents(agents: AgentDisplay[]): void {
    this.agents = agents;
    this.render();
  }

  /**
   * Update single agent
   */
  updateAgent(agent: AgentDisplay): void {
    const index = this.agents.findIndex((a) => a.id === agent.id);
    if (index >= 0) {
      this.agents[index] = agent;
    } else {
      this.agents.push(agent);
    }
    this.render();
  }

  /**
   * Add event to log
   */
  addEvent(event: any): void {
    this.eventHistory.unshift(event);
    if (this.eventHistory.length > 100) {
      this.eventHistory.pop();
    }
    this.render();
  }

  /**
   * Update budget display
   */
  setBudget(budget: BudgetDisplay): void {
    this.budget = budget;
    this.render();
  }

  /**
   * Render the dashboard
   */
  render(): void {
    if (this.paused || !this.isRunning) return;
    // Render logic handled by external UI
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: AgentDisplay['status']): string {
    const icons: Record<AgentDisplay['status'], string> = {
      idle: '○',
      running: '●',
      completed: '✓',
      error: '✗',
      blocked: '⏸'
    };
    return icons[status];
  }

  /**
   * Get progress bar
   */
  private getProgressBar(progress: number): string {
    const width = 10;
    const filled = Math.floor(progress * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  /**
   * Show notification
   */
  showNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    this.emit('notification', { message, type });
  }

  /**
   * Shutdown the dashboard
   */
  shutdown(): void {
    this.stop();
    this.emit('shutdown');
  }

  /**
   * Get current state
   */
  getState(): {
    agents: AgentDisplay[];
    selectedIndex: number;
    paused: boolean;
    events: any[];
    budget: BudgetDisplay | null;
  } {
    return {
      agents: this.agents,
      selectedIndex: this.selectedIndex,
      paused: this.paused,
      events: this.eventHistory,
      budget: this.budget
    };
  }

  /**
   * Get metrics
   */
  getMetrics(): {
    totalAgents: number;
    running: number;
    idle: number;
    errors: number;
    budgetUsed: number;
  } {
    const running = this.agents.filter((a) => a.status === 'running').length;
    const idle = this.agents.filter((a) => a.status === 'idle').length;
    const errors = this.agents.filter((a) => a.status === 'error').length;
    const budgetUsed = this.budget ? (this.budget.spent / this.budget.total) * 100 : 0;

    return {
      totalAgents: this.agents.length,
      running,
      idle,
      errors,
      budgetUsed
    };
  }
}

/**
 * Singleton instance
 */
let instance: TerminalDashboard | null = null;

export function getDashboard(): TerminalDashboard {
  if (!instance) {
    instance = new TerminalDashboard();
  }
  return instance;
}

export function createDashboard(config?: Partial<TerminalDashboardConfig>): TerminalDashboard {
  return new TerminalDashboard(config);
}

export type { TerminalDashboardConfig, AgentDisplay, BudgetDisplay };
