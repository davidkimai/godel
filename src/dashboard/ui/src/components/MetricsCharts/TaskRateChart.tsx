/**
 * TaskRateChart Component
 * 
 * Real-time task completion rate visualization
 */

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart
} from 'recharts';
import { useTaskCompletionRate, useAgentUtilization, useQueueDepth, useErrorRate, useCostMetrics } from '../../hooks/useMetrics';
import { Activity, Users, Layers, AlertTriangle, DollarSign } from 'lucide-react';

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const TaskRateChart: React.FC = () => {
  const { data, targetRate, isLoading } = useTaskCompletionRate();

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const chartData = data.map(point => ({
    ...point,
    formattedTime: formatTime(point.timestamp)
  }));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-gray-100">Task Completion Rate</h3>
        </div>
        <div className="text-sm text-gray-400">
          Target: <span className="text-blue-400 font-medium">{targetRate}/hr</span>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="formattedTime" 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px'
              }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ color: '#60a5fa' }}
            />
            <ReferenceLine 
              y={targetRate} 
              stroke="#ef4444" 
              strokeDasharray="3 3"
              label={{ value: 'Target', fill: '#ef4444', fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const AgentUtilizationChart: React.FC = () => {
  const { data, isLoading } = useAgentUtilization();

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const chartData = data.map(agent => ({
    name: agent.agentId.slice(0, 8) + '...',
    load: Math.round(agent.load * 100),
    tasks: agent.tasksCompleted,
    errors: agent.tasksFailed
  }));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-green-400" />
        <h3 className="text-lg font-semibold text-gray-100">Agent Utilization</h3>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="name" 
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              label={{ value: 'Load %', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px'
              }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Line
              type="monotone"
              dataKey="load"
              stroke="#10b981"
              strokeWidth={2}
              fill="#10b981"
              fillOpacity={0.3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const QueueDepthChart: React.FC = () => {
  const { data, currentDepth, maxDepth, isLoading } = useQueueDepth();

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const chartData = data.map(point => ({
    ...point,
    formattedTime: formatTime(point.timestamp)
  }));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-gray-100">Queue Depth</h3>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">
            Current: <span className="text-purple-400 font-medium">{currentDepth}</span>
          </span>
          <span className="text-gray-400">
            Max: <span className="text-red-400 font-medium">{maxDepth}</span>
          </span>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="queueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="formattedTime" 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px'
              }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ color: '#a855f7' }}
            />
            <ReferenceLine 
              y={maxDepth * 0.8} 
              stroke="#f59e0b" 
              strokeDasharray="3 3"
              label={{ value: 'Warning', fill: '#f59e0b', fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#a855f7"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#queueGradient)"
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const ErrorRateChart: React.FC = () => {
  const { data, threshold, currentRate, isLoading } = useErrorRate();

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const chartData = data.map(point => ({
    ...point,
    formattedTime: formatTime(point.timestamp)
  }));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h3 className="text-lg font-semibold text-gray-100">Error Rate</h3>
        </div>
        <div className="text-sm">
          <span className="text-gray-400">Current: </span>
          <span className={`font-medium ${currentRate > threshold ? 'text-red-400' : 'text-green-400'}`}>
            {currentRate.toFixed(2)}%
          </span>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="formattedTime" 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              label={{ value: 'Error %', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px'
              }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ color: '#f87171' }}
              formatter={(value: number) => [`${value.toFixed(2)}%`, 'Error Rate']}
            />
            <ReferenceLine 
              y={threshold} 
              stroke="#ef4444" 
              strokeDasharray="3 3"
              label={{ value: 'Threshold', fill: '#ef4444', fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const CostChart: React.FC = () => {
  const { hourlyCost, dailyEstimate, monthlyEstimate, byModel, isLoading } = useCostMetrics();

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const modelData = Object.entries(byModel).map(([model, cost]) => ({
    name: model.split('-')[0] + '...',
    cost: cost,
    fullName: model
  }));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-yellow-400" />
          <h3 className="text-lg font-semibold text-gray-100">Cost Metrics</h3>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-400 uppercase">Hourly</p>
          <p className="text-lg font-semibold text-yellow-400">${hourlyCost.toFixed(2)}</p>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-400 uppercase">Daily Est.</p>
          <p className="text-lg font-semibold text-yellow-400">${dailyEstimate.toFixed(2)}</p>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-400 uppercase">Monthly Est.</p>
          <p className="text-lg font-semibold text-yellow-400">${monthlyEstimate.toFixed(2)}</p>
        </div>
      </div>

      {/* Model Breakdown */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={modelData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="name" 
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px'
              }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
              labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
            />
            <Line
              type="monotone"
              dataKey="cost"
              stroke="#fbbf24"
              strokeWidth={2}
              fill="#fbbf24"
              fillOpacity={0.3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Combined Dashboard Metrics
export const MetricsDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaskRateChart />
        <AgentUtilizationChart />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QueueDepthChart />
        <ErrorRateChart />
      </div>
      <CostChart />
    </div>
  );
};
