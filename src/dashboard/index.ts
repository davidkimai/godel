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