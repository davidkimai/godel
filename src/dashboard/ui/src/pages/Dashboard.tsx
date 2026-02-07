/**
 * Dashboard Page
 * 
 * Main dashboard overview with all key metrics and visualizations
 */

import React from 'react';
import { SessionTree } from '../components/SessionTree/SessionTree';
import { AgentGrid } from '../components/FederationHealth/AgentGrid';
import { 
  TaskRateChart, 
  AgentUtilizationChart, 
  QueueDepthChart, 
  ErrorRateChart,
  CostChart 
} from '../components/MetricsCharts/TaskRateChart';
import { EventStream } from '../components/EventStream/EventStream';
import { AlertPanel } from '../components/AlertPanel/AlertPanel';
import { useAgentsRealtime, useSwarmsRealtime, useMetricsRealtime } from '../hooks/useWebSocket';
import { 
  Activity, 
  Users, 
  Zap, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Clock
} from 'lucide-react';

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: number; positive: boolean };
  color: string;
}> = ({ title, value, icon, trend, color }) => {
  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-100">{value}</p>
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${trend.positive ? 'text-green-400' : 'text-red-400'}`}>
              {trend.positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{trend.value}%</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { agents } = useAgentsRealtime();
  const { teams } = useSwarmsRealtime();
  const { metrics } = useMetricsRealtime();

  // Calculate stats
  const activeAgents = agents.filter(a => a.status === 'running' || a.status === 'busy').length;
  const completedAgents = agents.filter(a => a.status === 'completed').length;
  const failedAgents = agents.filter(a => a.status === 'failed').length;
  const totalCost = agents.reduce((sum, a) => sum + (a.cost || 0), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Dashboard Overview</h2>
          <p className="text-gray-400 mt-1">Real-time team monitoring and visualization</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Clock className="w-4 h-4" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Agents"
          value={activeAgents}
          icon={<Activity className="w-6 h-6 text-blue-400" />}
          trend={{ value: 12, positive: true }}
          color="bg-blue-500/10"
        />
        <StatCard
          title="Active Teams"
          value={teams.length}
          icon={<Zap className="w-6 h-6 text-purple-400" />}
          trend={{ value: 5, positive: true }}
          color="bg-purple-500/10"
        />
        <StatCard
          title="Total Cost"
          value={`$${totalCost.toFixed(2)}`}
          icon={<DollarSign className="w-6 h-6 text-yellow-400" />}
          color="bg-yellow-500/10"
        />
        <StatCard
          title="Success Rate"
          value={`${agents.length > 0 ? Math.round((completedAgents / agents.length) * 100) : 0}%`}
          icon={<Users className="w-6 h-6 text-green-400" />}
          trend={{ value: 3, positive: true }}
          color="bg-green-500/10"
        />
      </div>

      {/* Session Tree */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-100">Session Tree</h3>
          <button className="text-sm text-blue-400 hover:text-blue-300">
            View Full Tree →
          </button>
        </div>
        <SessionTree height={400} />
      </section>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Federation Health */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-100">Federation Health</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-400">{activeAgents} online</span>
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <AgentGrid />
          </div>
        </section>

        {/* Alerts */}
        <section>
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Active Alerts</h3>
          <AlertPanel maxAlerts={10} />
        </section>
      </div>

      {/* Metrics Charts */}
      <section>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TaskRateChart />
          <AgentUtilizationChart />
          <QueueDepthChart />
          <ErrorRateChart />
        </div>
      </section>

      {/* Event Stream */}
      <section>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Live Events</h3>
        <EventStream height={400} />
      </section>

      {/* Cost Metrics */}
      <section>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Cost Analysis</h3>
        <CostChart />
      </section>
    </div>
  );
};

export default Dashboard;
