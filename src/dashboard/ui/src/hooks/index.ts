/**
 * Hooks Index
 * 
 * Export all dashboard hooks
 */

export {
  useWebSocket,
  useAgentsRealtime,
  useSwarmsRealtime,
  useEventsRealtime,
  useMetricsRealtime,
  useConnectionStatus
} from './useWebSocket';

export {
  useMetricsHistory,
  useTaskCompletionRate,
  useAgentUtilization,
  useQueueDepth,
  useErrorRate,
  useCostMetrics
} from './useMetrics';
