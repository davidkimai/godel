/**
 * CostChart Component
 * 
 * Cost analytics chart with multiple visualization modes.
 */

import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  Activity,
  Calendar,
  Filter
} from 'lucide-react';
import { Card, Badge } from './Layout';
import { cn, formatCurrency, formatNumber } from '../types/index';
import type { Agent, Team } from '../types/index';

// ============================================================================
// Types
// ============================================================================

type ChartType = 'area' | 'bar' | 'pie' | 'line';
type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

interface CostChartProps {
  agents: Agent[];
  teams: Team[];
  className?: string;
  showControls?: boolean;
  defaultChartType?: ChartType;
  defaultTimeRange?: TimeRange;
}

interface CostMetrics {
  totalSpent: number;
  hourlyRate: number;
  dailyEstimate: number;
  weeklyEstimate: number;
  monthlyEstimate: number;
  byModel: Record<string, number>;
  byTeam: Record<string, number>;
  byAgent: Record<string, number>;
  overTime: Array<{
    time: string;
    cost: number;
    cumulative: number;
    agentCount: number;
  }>;
}

// ============================================================================
// Cost Chart Component
// ============================================================================

export function CostChart({
  agents,
  teams,
  className,
  showControls = true,
  defaultChartType = 'area',
  defaultTimeRange = '24h'
}: CostChartProps): React.ReactElement {
  const [chartType, setChartType] = useState<ChartType>(defaultChartType);
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange);

  const metrics = useMemo(() => calculateMetrics(agents, teams, timeRange), [agents, teams, timeRange]);

  const chartColors = {
    primary: '#10b981', // emerald-500
    secondary: '#3b82f6', // blue-500
    accent: '#8b5cf6', // violet-500
    warning: '#f59e0b', // amber-500
    danger: '#ef4444', // red-500
    slate: '#64748b', // slate-500
  };

  const pieColors = [
    '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
  ];

  const renderChart = () => {
    switch (chartType) {
      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.overTime}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="time" 
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 12 }}
              />
              <YAxis 
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickFormatter={(value) => `$${value.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #334155',
                  borderRadius: '8px'
                }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => [formatCurrency(value), 'Cost']}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="cumulative"
                name="Cumulative Cost"
                stroke={chartColors.primary}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#costGradient)"
              />
              <Area
                type="monotone"
                dataKey="cost"
                name="Period Cost"
                stroke={chartColors.secondary}
                strokeWidth={1}
                strokeDasharray="5 5"
                fillOpacity={0}
                fill="transparent"
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metrics.overTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="time" 
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 12 }}
              />
              <YAxis 
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickFormatter={(value) => `$${value.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #334155',
                  borderRadius: '8px'
                }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => [formatCurrency(value), 'Cost']}
              />
              <Legend />
              <Bar dataKey="cost" name="Cost" fill={chartColors.primary} />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        const pieData = Object.entries(metrics.byTeam)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8);
        
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #334155',
                  borderRadius: '8px'
                }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics.overTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="time" 
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 12 }}
              />
              <YAxis 
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickFormatter={(value) => `$${value.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #334155',
                  borderRadius: '8px'
                }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => [formatCurrency(value), 'Cost']}
              />
              <Legend />
              <ReferenceLine y={metrics.dailyEstimate} label="Daily Est." stroke={chartColors.warning} strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="cumulative"
                name="Cumulative Cost"
                stroke={chartColors.primary}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="cost"
                name="Period Cost"
                stroke={chartColors.secondary}
                strokeWidth={1}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Card 
      className={cn("overflow-hidden", className)}
      title={
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-400" />
          Cost Analytics
        </div>
      }
      action={
        showControls && (
          <div className="flex items-center gap-2">
            {/* Time Range Selector */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="1h">1 Hour</option>
              <option value="24h">24 Hours</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="all">All Time</option>
            </select>

            {/* Chart Type Toggle */}
            <div className="flex items-center gap-1 bg-slate-800 rounded p-0.5">
              <ChartTypeButton 
                active={chartType === 'area'} 
                onClick={() => setChartType('area')}
                icon={<Activity className="w-3.5 h-3.5" />}
                label="Area"
              />
              <ChartTypeButton 
                active={chartType === 'bar'} 
                onClick={() => setChartType('bar')}
                icon={<BarChart3 className="w-3.5 h-3.5" />}
                label="Bar"
              />
              <ChartTypeButton 
                active={chartType === 'pie'} 
                onClick={() => setChartType('pie')}
                icon={<PieChartIcon className="w-3.5 h-3.5" />}
                label="Pie"
              />
              <ChartTypeButton 
                active={chartType === 'line'} 
                onClick={() => setChartType('line')}
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                label="Line"
              />
            </div>
          </div>
        )
      }
    >
      {/* Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-slate-800">
        <MetricCard 
          label="Total Spent" 
          value={formatCurrency(metrics.totalSpent)}
          trend={metrics.hourlyRate > 0 ? { value: metrics.hourlyRate, label: '/hour' } : undefined}
          color="emerald"
        />
        <MetricCard 
          label="Daily Estimate" 
          value={formatCurrency(metrics.dailyEstimate)}
          color="blue"
        />
        <MetricCard 
          label="Weekly Estimate" 
          value={formatCurrency(metrics.weeklyEstimate)}
          color="purple"
        />
        <MetricCard 
          label="Monthly Estimate" 
          value={formatCurrency(metrics.monthlyEstimate)}
          color="amber"
        />
      </div>

      {/* Chart */}
      <div className="p-4">
        <div className="h-64">
          {renderChart()}
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t border-slate-800">
        {/* By Model */}
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-3">By Model</h4>
          <div className="space-y-2">
            {Object.entries(metrics.byModel)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([model, cost], index) => (
                <div key={model} className="flex items-center gap-3">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: pieColors[index % pieColors.length] }}
                  />
                  <span className="flex-1 text-sm text-slate-300 truncate">{model}</span>
                  <span className="text-sm font-medium text-white">{formatCurrency(cost)}</span>
                  <span className="text-xs text-slate-500 w-12 text-right">
                    {metrics.totalSpent > 0 ? ((cost / metrics.totalSpent) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* By Team */}
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-3">By Team</h4>
          <div className="space-y-2">
            {Object.entries(metrics.byTeam)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([team, cost], index) => (
                <div key={team} className="flex items-center gap-3">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: pieColors[index % pieColors.length] }}
                  />
                  <span className="flex-1 text-sm text-slate-300 truncate">{team}</span>
                  <span className="text-sm font-medium text-white">{formatCurrency(cost)}</span>
                  <span className="text-xs text-slate-500 w-12 text-right">
                    {metrics.totalSpent > 0 ? ((cost / metrics.totalSpent) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface ChartTypeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ChartTypeButton({ active, onClick, icon, label }: ChartTypeButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors",
        active 
          ? "bg-emerald-500 text-white" 
          : "text-slate-400 hover:text-white hover:bg-slate-700"
      )}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  trend?: { value: number; label: string };
  color: 'emerald' | 'blue' | 'purple' | 'amber' | 'red';
}

function MetricCard({ label, value, trend, color }: MetricCardProps): React.ReactElement {
  const colorClasses = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  return (
    <div className={cn("p-3 rounded-lg border", colorClasses[color])}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {trend && (
        <p className="text-xs opacity-60">
          {trend.value > 0 ? '+' : ''}{formatCurrency(trend.value)}{trend.label}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateMetrics(agents: Agent[], teams: Team[], timeRange: TimeRange): CostMetrics {
  // Calculate total spent
  const totalSpent = agents.reduce((sum, a) => sum + (a.cost || 0), 0);

  // Calculate costs by model
  const byModel = agents.reduce((acc, a) => {
    const model = a.model || 'unknown';
    acc[model] = (acc[model] || 0) + (a.cost || 0);
    return acc;
  }, {} as Record<string, number>);

  // Calculate costs by team
  const byTeam = teams.reduce((acc, s) => {
    const teamAgents = agents.filter(a => a.teamId === s.id);
    const cost = teamAgents.reduce((sum, a) => sum + (a.cost || 0), 0);
    acc[s.name] = cost;
    return acc;
  }, {} as Record<string, number>);

  // Calculate costs by agent
  const byAgent = agents.reduce((acc, a) => {
    acc[a.id] = a.cost || 0;
    return acc;
  }, {} as Record<string, number>);

  // Calculate hourly rate
  const totalRuntime = agents.reduce((sum, a) => sum + (a.runtime || 0), 0);
  const hourlyRate = totalRuntime > 0 ? totalSpent / (totalRuntime / 3600) : 0;

  // Generate time series data
  const now = Date.now();
  const timeRangeMs = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'all': Infinity
  }[timeRange];

  const dataPoints = timeRange === '1h' ? 12 : timeRange === '24h' ? 24 : 30;
  const intervalMs = timeRangeMs === Infinity ? 24 * 60 * 60 * 1000 : timeRangeMs / dataPoints;

  const overTime: CostMetrics['overTime'] = [];
  let cumulative = 0;

  for (let i = dataPoints - 1; i >= 0; i--) {
    const pointTime = now - i * intervalMs;
    const prevTime = pointTime - intervalMs;

    const pointAgents = agents.filter(a => {
      const spawnTime = new Date(a.spawnedAt).getTime();
      return spawnTime <= pointTime && (timeRangeMs === Infinity || spawnTime >= now - timeRangeMs);
    });

    // Calculate cost for this period (simplified estimation)
    const periodCost = pointAgents.reduce((sum, a) => {
      const spawnTime = new Date(a.spawnedAt).getTime();
      if (spawnTime >= prevTime && spawnTime <= pointTime) {
        return sum + (a.cost || 0) * 0.1; // Assume 10% cost per period for active agents
      }
      return sum;
    }, 0);

    cumulative += periodCost;

    overTime.push({
      time: formatTimeLabel(pointTime, timeRange),
      cost: periodCost,
      cumulative,
      agentCount: pointAgents.length
    });
  }

  return {
    totalSpent,
    hourlyRate,
    dailyEstimate: hourlyRate * 24,
    weeklyEstimate: hourlyRate * 24 * 7,
    monthlyEstimate: hourlyRate * 24 * 30,
    byModel,
    byTeam,
    byAgent,
    overTime
  };
}

function formatTimeLabel(timestamp: number, timeRange: TimeRange): string {
  const date = new Date(timestamp);
  
  switch (timeRange) {
    case '1h':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case '24h':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case '7d':
    case '30d':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'all':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleString();
  }
}

export default CostChart;
