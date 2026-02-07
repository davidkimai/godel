/**
 * Metrics Page
 * 
 * Comprehensive metrics and analytics dashboard
 */

import React, { useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useMetricsRealtime } from '../hooks/useWebSocket';
import { Calendar, Download, RefreshCw, TrendingUp, DollarSign, Activity, Users } from 'lucide-react';

const timeRanges = [
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' }
];

// Mock data for demonstration
const mockTaskRateData = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  completed: Math.floor(Math.random() * 50) + 20,
  failed: Math.floor(Math.random() * 10)
}));

const mockCostByModel = [
  { name: 'GPT-4', value: 45, color: '#3b82f6' },
  { name: 'Claude', value: 30, color: '#8b5cf6' },
  { name: 'Kimi', value: 15, color: '#10b981' },
  { name: 'Gemini', value: 10, color: '#f59e0b' }
];

const mockAgentUtilization = Array.from({ length: 10 }, (_, i) => ({
  agent: `Agent ${i + 1}`,
  cpu: Math.floor(Math.random() * 100),
  memory: Math.floor(Math.random() * 100)
}));

const mockQueueData = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  depth: Math.floor(Math.random() * 100),
  processed: Math.floor(Math.random() * 200) + 50
}));

const Metrics: React.FC = () => {
  const [timeRange, setTimeRange] = useState('24h');
  const { metrics } = useMetricsRealtime();

  const exportMetrics = () => {
    console.log('Exporting metrics...');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Metrics & Analytics</h2>
          <p className="text-gray-400 mt-1">
            Comprehensive performance analytics and insights
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex items-center bg-gray-800 rounded-lg p-1">
            {timeRanges.map(range => (
              <button
                key={range.value}
                onClick={() => setTimeRange(range.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  timeRange === range.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          
          <button
            onClick={exportMetrics}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          
          <button className="p-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <span className="text-xs text-green-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +12%
            </span>
          </div>
          <p className="text-sm text-gray-400">Tasks Completed</p>
          <p className="text-2xl font-bold text-gray-100">
            {mockTaskRateData.reduce((sum, d) => sum + d.completed, 0)}
          </p>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
            <span className="text-xs text-green-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +5%
            </span>
          </div>
          <p className="text-sm text-gray-400">Active Agents</p>
          <p className="text-2xl font-bold text-gray-100">24</p>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <DollarSign className="w-6 h-6 text-yellow-400" />
            </div>
            <span className="text-xs text-red-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +8%
            </span>
          </div>
          <p className="text-sm text-gray-400">Total Cost</p>
          <p className="text-2xl font-bold text-gray-100">
            ${metrics?.totalSpent?.toFixed(2) || '0.00'}
          </p>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <Activity className="w-6 h-6 text-green-400" />
            </div>
            <span className="text-xs text-green-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +2%
            </span>
          </div>
          <p className="text-sm text-gray-400">Success Rate</p>
          <p className="text-2xl font-bold text-gray-100">94.2%</p>
        </div>
      </div>

      {/* Task Completion Chart */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-6">Task Completion Rate</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockTaskRateData}>
              <defs>
                <linearGradient id="completedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="completed"
                name="Completed"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#completedGradient)"
              />
              <Area
                type="monotone"
                dataKey="failed"
                name="Failed"
                stroke="#ef4444"
                fillOpacity={1}
                fill="url(#failedGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two Column Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by Model */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-6">Cost by Model</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mockCostByModel}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {mockCostByModel.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '6px'
                  }}
                  formatter={(value: number) => [`${value}%`, 'Share']}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Agent Utilization */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-6">Agent Utilization</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockAgentUtilization}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="agent" stroke="#6b7280" fontSize={10} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Bar dataKey="cpu" name="CPU %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="memory" name="Memory %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Queue Performance */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-6">Queue Performance</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockQueueData}>
              <defs>
                <linearGradient id="depthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="processedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="depth"
                name="Queue Depth"
                stroke="#a855f7"
                fillOpacity={1}
                fill="url(#depthGradient)"
              />
              <Area
                type="monotone"
                dataKey="processed"
                name="Processed"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#processedGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Metrics;
