/**
 * Dashboard Server
 * 
 * Real-time event streaming and session tree visualization.
 */

export {
  DashboardServer,
  getGlobalDashboardServer,
  resetGlobalDashboardServer,
} from './server';
export type {
  DashboardConfig,
  DashboardClient,
  TreeVisualizationNode,
  TreeVisualization,
} from './server';

// Re-export hooks for React UI
export { useWebSocket, useAgentStatus, useBudget, useEventStream, useSwarmStatus } from './hooks/useWebSocket';
export type { UseWebSocketOptions, UseWebSocketReturn } from './hooks/useWebSocket';

// Legacy components (for terminal UI)
export { TerminalDashboard, getDashboard, createDashboard } from './Dashboard';
export type { TerminalDashboardConfig, AgentDisplay, BudgetDisplay } from './Dashboard';

// Component types
export type { Agent } from './components/AgentGrid';
export type { Budget } from './components/BudgetPanel';
export type { Event } from './components/EventStream';
