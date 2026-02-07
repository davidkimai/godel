/**
 * Components Index
 * 
 * Export all dashboard components
 */

// Layout
export { DashboardLayout } from './Layout/DashboardLayout';

// Session Tree
export { SessionTree } from './SessionTree/SessionTree';
export { SessionNodeCard } from './SessionTree/SessionNodeCard';

// Federation Health
export { AgentGrid } from './FederationHealth/AgentGrid';

// Metrics Charts
export {
  TaskRateChart,
  AgentUtilizationChart,
  QueueDepthChart,
  ErrorRateChart,
  CostChart,
  MetricsDashboard
} from './MetricsCharts/TaskRateChart';

// Event Stream
export { EventStream } from './EventStream/EventStream';

// Workflow Visualizer
export { WorkflowGraph } from './WorkflowVisualizer/WorkflowGraph';

// Alert Panel
export { AlertPanel } from './AlertPanel/AlertPanel';

// Legacy Components (for compatibility)
export { default as AgentStatus } from './AgentStatus';
export { default as LegacyCostChart } from './CostChart';
export { default as EventFeed } from './EventFeed';
export { Sidebar as Layout } from './Layout';
export { default as LegacySessionTree } from './SessionTree';
export { default as TeamCard } from './TeamCard';
