/**
 * useMetrics Hook
 * 
 * Real-time metrics streaming with historical data
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { metricsApi } from '../services/api';
import { WebSocketMessageType } from '../types';

export interface MetricDataPoint {
  timestamp: number;
  value: number;
  label: string;
}

export interface MetricsSeries {
  name: string;
  data: MetricDataPoint[];
  color: string;
  unit?: string;
}

export interface AgentUtilization {
  agentId: string;
  load: number;
  tasksCompleted: number;
  tasksFailed: number;
  avgResponseTime: number;
}

export interface QueueMetrics {
  depth: number;
  maxDepth: number;
  avgWaitTime: number;
  throughput: number;
}

export function useMetricsHistory(
  metricName: string,
  duration: string = '1h'
): { data: MetricDataPoint[]; isLoading: boolean; error: Error | null } {
  const [data, setData] = useState<MetricDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        // Fetch historical data from API
        const response = await metricsApi.getJsonMetrics();
        const history = (response as Record<string, unknown>)[metricName + '_history'] as MetricDataPoint[] || [];
        setData(history);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [metricName, duration]);

  return { data, isLoading, error };
}

export function useTaskCompletionRate(): { 
  data: MetricDataPoint[]; 
  targetRate: number;
  isLoading: boolean;
} {
  const [data, setData] = useState<MetricDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const targetRate = 100; // tasks per hour target
  const { subscribe, connected } = useWebSocket();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Fetch initial data
    const fetchData = async () => {
      try {
        const response = await metricsApi.getJsonMetrics();
        const metrics = response as Record<string, unknown>;
        const taskRate = metrics.task_completion_rate as MetricDataPoint[] || [];
        setData(taskRate);
      } catch (error) {
        console.error('Failed to fetch task completion rate:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Subscribe to real-time updates
    if (connected) {
      const unsubscribe = subscribe(WebSocketMessageType.EVENT, (message) => {
        if (message.event?.type === 'agent.completed') {
          setData(prev => {
            const now = Date.now();
            const newPoint: MetricDataPoint = {
              timestamp: now,
              value: 1,
              label: new Date(now).toLocaleTimeString()
            };
            return [...prev.slice(-59), newPoint];
          });
        }
      });

      return unsubscribe;
    }
  }, [subscribe, connected]);

  return { data, targetRate, isLoading };
}

export function useAgentUtilization(): { 
  data: AgentUtilization[]; 
  isLoading: boolean;
} {
  const [data, setData] = useState<AgentUtilization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await metricsApi.getJsonMetrics();
        const metrics = response as Record<string, unknown>;
        const utilization = metrics.agent_utilization as AgentUtilization[] || [];
        setData(utilization);
      } catch (error) {
        console.error('Failed to fetch agent utilization:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    if (connected) {
      const unsubscribe = subscribe(WebSocketMessageType.AGENT_UPDATE, () => {
        fetchData();
      });

      return unsubscribe;
    }
  }, [subscribe, connected]);

  return { data, isLoading };
}

export function useQueueDepth(): { 
  data: MetricDataPoint[]; 
  currentDepth: number;
  maxDepth: number;
  isLoading: boolean;
} {
  const [data, setData] = useState<MetricDataPoint[]>([]);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [maxDepth, setMaxDepth] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await metricsApi.getJsonMetrics();
        const metrics = response as Record<string, unknown>;
        const queueData = metrics.queue_depth as MetricDataPoint[] || [];
        setData(queueData);
        setCurrentDepth(metrics.current_queue_depth as number || 0);
        setMaxDepth(metrics.max_queue_depth as number || 100);
      } catch (error) {
        console.error('Failed to fetch queue depth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    if (connected) {
      const unsubscribe = subscribe(WebSocketMessageType.EVENT, (message) => {
        if (message.event?.type?.includes('task')) {
          fetchData();
        }
      });

      return unsubscribe;
    }
  }, [subscribe, connected]);

  return { data, currentDepth, maxDepth, isLoading };
}

export function useErrorRate(): { 
  data: MetricDataPoint[]; 
  threshold: number;
  currentRate: number;
  isLoading: boolean;
} {
  const [data, setData] = useState<MetricDataPoint[]>([]);
  const [currentRate, setCurrentRate] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const threshold = 5; // 5% error rate threshold
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await metricsApi.getJsonMetrics();
        const metrics = response as Record<string, unknown>;
        const errorData = metrics.error_rate as MetricDataPoint[] || [];
        setData(errorData);
        setCurrentRate(metrics.current_error_rate as number || 0);
      } catch (error) {
        console.error('Failed to fetch error rate:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    if (connected) {
      const unsubscribe = subscribe(WebSocketMessageType.EVENT, (message) => {
        if (message.event?.type?.includes('failed') || message.event?.type?.includes('error')) {
          fetchData();
        }
      });

      return unsubscribe;
    }
  }, [subscribe, connected]);

  return { data, threshold, currentRate, isLoading };
}

export function useCostMetrics(): {
  hourlyCost: number;
  dailyEstimate: number;
  monthlyEstimate: number;
  byModel: Record<string, number>;
  isLoading: boolean;
} {
  const [hourlyCost, setHourlyCost] = useState(0);
  const [dailyEstimate, setDailyEstimate] = useState(0);
  const [monthlyEstimate, setMonthlyEstimate] = useState(0);
  const [byModel, setByModel] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const metrics = await metricsApi.getCostMetrics();
        setHourlyCost(metrics.hourlyRate);
        setDailyEstimate(metrics.dailyEstimate);
        setMonthlyEstimate(metrics.monthlyEstimate);
        
        const breakdown = await metricsApi.getCostBreakdown();
        setByModel(breakdown.byModel);
      } catch (error) {
        console.error('Failed to fetch cost metrics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    if (connected) {
      const unsubscribe = subscribe(WebSocketMessageType.BUDGET_UPDATE, (message) => {
        if (message.budget) {
          setHourlyCost(message.budget.hourlyRate);
          setDailyEstimate(message.budget.dailyEstimate);
          setMonthlyEstimate(message.budget.monthlyEstimate);
        }
      });

      return unsubscribe;
    }
  }, [subscribe, connected]);

  return { hourlyCost, dailyEstimate, monthlyEstimate, byModel, isLoading };
}
