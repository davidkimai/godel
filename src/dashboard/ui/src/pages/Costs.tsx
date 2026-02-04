/**
 * Costs Page
 * 
 * Cost tracking and budget management dashboard
 */

import React, { useEffect, useState, useMemo } from 'react';
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
  Legend
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CreditCard,
  Wallet,
  PieChart,
  Pie
} from 'lucide-react';
import { Card, StatsCard, LoadingSpinner, Button } from '../components/Layout';
import { useDashboardStore } from '../contexts/store';
import { api } from '../services/api';
import { useCostUpdates } from '../services/websocket';
import { formatCurrency, formatNumber, formatDuration, cn } from '../utils/index';
import type { CostMetrics, CostBreakdown } from '../types/index';

// ============================================================================
// Costs Page
// ============================================================================

export function CostsPage(): React.ReactElement {
  const { agents, swarms } = useDashboardStore();
  const [costMetrics, setLocalCostMetrics] = useState<CostMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const realtimeCost = useCostUpdates();

  // Use real-time or fetched cost data
  const currentCost = realtimeCost || costMetrics;

  // Calculate costs from agents
  const agentCosts = useMemo(() => {
    return agents.reduce((acc, agent) => {
      const cost = agent.cost || 0;
      acc.total += cost;
      acc.byModel[agent.model] = (acc.byModel[agent.model] || 0) + cost;
      acc.bySwarm[agent.swarmId] = (acc.bySwarm[agent.swarmId] || 0) + cost;
      return acc;
    }, {
      total: 0,
      byModel: {} as Record<string, number>,
      bySwarm: {} as Record<string, number>
    });
  }, [agents]);

  useEffect(() => {
    const fetchCosts = async () => {
      try {
        const [metrics, breakdown] = await Promise.all([
          api.metrics.getCostMetrics(),
          api.metrics.getCostBreakdown()
        ]);
        setLocalCostMetrics(metrics);
        setCostBreakdown(breakdown);
      } catch (error) {
        console.error('Failed to fetch cost data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCosts();
  }, []);

  // Mock cost history for charts
  const costHistory = useMemo(() => {
    const points = [];
    const now = Date.now();
    for (let i = 23; i >= 0; i--) {
      const time = now - i * 3600000;
      points.push({
        time: new Date(time).toLocaleTimeString('en-US', { hour: '2-digit' }),
        cost: Math.random() * 10 + (23 - i) * 0.5,
        cumulative: Math.random() * 20 + (23 - i) * 0.8
      });
    }
    return points;
  }, []);

  const modelBreakdown = useMemo(() => {
    return Object.entries(agentCosts.byModel).map(([model, cost]) => ({
      name: model,
      value: cost
    }));
  }, [agentCosts.byModel]);

  const COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#f97316'];

  const budgetPercentage = currentCost 
    ? (currentCost.totalSpent / currentCost.budgetAllocated) * 100 
    : 0;

  const isBudgetWarning = budgetPercentage >= 75;
  const isBudgetCritical = budgetPercentage >= 90;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Costs</h1>
          <p className="text-slate-400 mt-1">Track spending and manage budgets</p>
        </div>

        <Button variant="secondary" icon={<CreditCard className="w-4 h-4" />}>
          Configure Budgets
        </Button>
      </div>

      {/* Budget Alert */}
      {isBudgetWarning && (
        <div className={cn(
          'p-4 rounded-lg border flex items-center gap-3',
          isBudgetCritical 
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        )}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium">
              {isBudgetCritical ? 'Budget critical - immediate action required' : 'Budget warning - approaching limit'}
            </p>
            <p className="text-sm opacity-80">
              {budgetPercentage.toFixed(1)}% of budget consumed (${formatNumber(currentCost?.totalSpent || 0)} / ${formatNumber(currentCost?.budgetAllocated || 0)})
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Spent"
          value={isLoading ? '-' : formatCurrency(agentCosts.total)}
          subtitle="This period"
          icon={<Wallet className="w-6 h-6" />}
          color="purple"
        />
        <StatsCard
          title="Hourly Rate"
          value={isLoading ? '-' : formatCurrency(currentCost?.hourlyRate || 0)}
          subtitle="Current burn rate"
          icon={<TrendingUp className="w-6 h-6" />}
          color="blue"
        />
        <StatsCard
          title="Burn Rate"
          value={isLoading ? '-' : formatCurrency((currentCost?.burnRate || 0) * 60)}
          subtitle="Per minute"
          icon={<Clock className="w-6 h-6" />}
          color="amber"
        />
        <StatsCard
          title="Budget Remaining"
          value={isLoading ? '-' : formatCurrency(currentCost?.budgetRemaining || 0)}
          subtitle={`${(100 - budgetPercentage).toFixed(1)}% available`}
          icon={<DollarSign className="w-6 h-6" />}
          color={isBudgetWarning ? 'red' : 'emerald'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Over Time */}
        <Card title="Cost Over Time" className="lg:col-span-2">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={costHistory}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#costGradient)"
                  name="Cumulative"
                />
                <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={false} name="Hourly" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Cost by Model */}
        <Card title="Cost by Model">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={modelBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {modelBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number) => [formatCurrency(value), 'Cost']}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Cost by Swarm */}
      <Card title="Cost by Swarm">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={swarms.slice(0, 10).map(swarm => ({
                name: swarm.name.slice(0, 15),
                cost: agentCosts.bySwarm[swarm.id] || 0
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => [formatCurrency(value), 'Cost']}
              />
              <Bar dataKey="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Predictions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Cost Predictions">
          <div className="space-y-4">
            <PredictionRow
              label="Daily Estimate"
              value={formatCurrency(currentCost?.dailyEstimate || 0)}
              icon={<Clock className="w-5 h-5 text-blue-400" />}
            />
            <PredictionRow
              label="Monthly Estimate"
              value={formatCurrency(currentCost?.monthlyEstimate || 0)}
              icon={<Wallet className="w-5 h-5 text-purple-400" />}
            />
            <PredictionRow
              label="Time Until Budget Exhausted"
              value={currentCost ? formatDuration(currentCost.timeRemaining * 60000) : '-'}
              icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
            />
          </div>
        </Card>

        <Card title="Cost Optimization Tips">
          <div className="space-y-3">
            <Tip>
              <strong>Agent Optimization:</strong> 3 agents have been idle for over 1 hour. Consider pausing them.
            </Tip>
            <Tip>
              <strong>Model Selection:</strong> Using k2.5 for simple tasks. Consider using a smaller model for cost savings.
            </Tip>
            <Tip>
              <strong>Batch Processing:</strong> Grouping similar tasks could reduce costs by ~15%.
            </Tip>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Prediction Row
// ============================================================================

function PredictionRow({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-slate-300">{label}</span>
      </div>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

// ============================================================================
// Tip Component
// ============================================================================

function Tip({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-start gap-3 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
      <div className="p-1 bg-emerald-500/10 rounded text-emerald-400 mt-0.5">
        <TrendingDown className="w-4 h-4" />
      </div>
      <p className="text-sm text-slate-300">{children}</p>
    </div>
  );
}

export default CostsPage;
