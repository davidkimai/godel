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
export { useWebSocket, useAgentUpdates, useSwarmUpdates, useCostUpdates, useEventStream } from './hooks/useWebSocket';
export type { UseWebSocketOptions, UseWebSocketReturn } from './hooks/useWebSocket';

// Legacy components (for terminal UI)
export { TerminalDashboard, getDashboard, createDashboard } from './Dashboard';
export type { DashboardConfig, AgentDisplay, BudgetDisplay } from './Dashboard';

// Component types
export { AgentGrid } from './components/AgentGrid';
export { BudgetPanel } from './components/BudgetPanel';
export { EventStream } from './components/EventStream';
export { StatusBar } from './components/StatusBar';
