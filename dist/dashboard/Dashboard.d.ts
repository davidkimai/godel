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
interface DashboardConfig {
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
export declare class TerminalDashboard extends EventEmitter {
    private config;
    private agents;
    private selectedIndex;
    private paused;
    private eventHistory;
    private budget;
    private isRunning;
    constructor(config?: Partial<DashboardConfig>);
    /**
     * Initialize the dashboard UI
     */
    initialize(): Promise<void>;
    /**
     * Start the dashboard
     */
    start(): void;
    /**
     * Stop the dashboard
     */
    stop(): void;
    /**
     * Setup keyboard navigation
     */
    setupKeyboardNavigation(): void;
    /**
     * Connect to WebSocket for real-time updates
     */
    connectToWebSocket(): void;
    /**
     * Set agents data
     */
    setAgents(agents: AgentDisplay[]): void;
    /**
     * Update single agent
     */
    updateAgent(agent: AgentDisplay): void;
    /**
     * Add event to log
     */
    addEvent(event: any): void;
    /**
     * Update budget display
     */
    setBudget(budget: BudgetDisplay): void;
    /**
     * Render the dashboard
     */
    render(): void;
    /**
     * Get status icon
     */
    private getStatusIcon;
    /**
     * Get progress bar
     */
    private getProgressBar;
    /**
     * Show notification
     */
    showNotification(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
    /**
     * Shutdown the dashboard
     */
    shutdown(): void;
    /**
     * Get current state
     */
    getState(): {
        agents: AgentDisplay[];
        selectedIndex: number;
        paused: boolean;
        events: any[];
        budget: BudgetDisplay | null;
    };
    /**
     * Get metrics
     */
    getMetrics(): {
        totalAgents: number;
        running: number;
        idle: number;
        errors: number;
        budgetUsed: number;
    };
}
export declare function getDashboard(): TerminalDashboard;
export declare function createDashboard(config?: Partial<DashboardConfig>): TerminalDashboard;
export type { DashboardConfig, AgentDisplay, BudgetDisplay };
//# sourceMappingURL=Dashboard.d.ts.map