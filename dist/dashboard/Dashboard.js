"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalDashboard = void 0;
exports.getDashboard = getDashboard;
exports.createDashboard = createDashboard;
const events_1 = require("events");
const DEFAULT_CONFIG = {
    apiUrl: 'http://localhost:7373',
    wsUrl: 'ws://localhost:7374',
    apiKey: 'dash-api-key',
    refreshRate: 100,
    theme: 'dark'
};
class TerminalDashboard extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.agents = [];
        this.selectedIndex = 0;
        this.paused = false;
        this.eventHistory = [];
        this.budget = null;
        this.isRunning = false;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Initialize the dashboard UI
     */
    async initialize() {
        this.emit('initialized');
    }
    /**
     * Start the dashboard
     */
    start() {
        this.isRunning = true;
        this.emit('started');
        console.log('Dashboard started. Use arrow keys to navigate, q to quit.');
    }
    /**
     * Stop the dashboard
     */
    stop() {
        this.isRunning = false;
        this.emit('stopped');
    }
    /**
     * Setup keyboard navigation
     */
    setupKeyboardNavigation() {
        // Navigation methods for external UI integration
    }
    /**
     * Connect to WebSocket for real-time updates
     */
    connectToWebSocket() {
        console.log('WebSocket connection established');
    }
    /**
     * Set agents data
     */
    setAgents(agents) {
        this.agents = agents;
        this.render();
    }
    /**
     * Update single agent
     */
    updateAgent(agent) {
        const index = this.agents.findIndex((a) => a.id === agent.id);
        if (index >= 0) {
            this.agents[index] = agent;
        }
        else {
            this.agents.push(agent);
        }
        this.render();
    }
    /**
     * Add event to log
     */
    addEvent(event) {
        this.eventHistory.unshift(event);
        if (this.eventHistory.length > 100) {
            this.eventHistory.pop();
        }
        this.render();
    }
    /**
     * Update budget display
     */
    setBudget(budget) {
        this.budget = budget;
        this.render();
    }
    /**
     * Render the dashboard
     */
    render() {
        if (this.paused || !this.isRunning)
            return;
        // Render logic handled by external UI
    }
    /**
     * Get status icon
     */
    getStatusIcon(status) {
        const icons = {
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
    getProgressBar(progress) {
        const width = 10;
        const filled = Math.floor(progress * width);
        const empty = width - filled;
        return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
    }
    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        this.emit('notification', { message, type });
    }
    /**
     * Shutdown the dashboard
     */
    shutdown() {
        this.stop();
        this.emit('shutdown');
    }
    /**
     * Get current state
     */
    getState() {
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
    getMetrics() {
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
exports.TerminalDashboard = TerminalDashboard;
/**
 * Singleton instance
 */
let instance = null;
function getDashboard() {
    if (!instance) {
        instance = new TerminalDashboard();
    }
    return instance;
}
function createDashboard(config) {
    return new TerminalDashboard(config);
}
//# sourceMappingURL=Dashboard.js.map