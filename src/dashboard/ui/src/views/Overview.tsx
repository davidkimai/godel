/**
 * Overview View
 * 
 * Main dashboard view with real-time metrics and visualizations.
 */

import React, { useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import {
  Users,
  Hexagon,
  DollarSign,
  TrendingUp,
  Zap,
  Activity,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Card, StatsCard, Badge, LoadingSpinner } from '../components/Layout';
import { EventFeed } from '../components/EventFeed';
import { useDashboardStore, useUIStore } from '../contexts/store';
import { api } from '../services/api';
import { useEventStream, useAgentUpdates, useTeamUpdates } from '../services/websocket';
import {
  AgentStatus,
  TeamState,
  formatCurrency,
  formatNumber,
  getStatusColor,
  calculateAgentMetrics,
  cn
} from '../types/index';
import type { Agent, Team, AgentEvent } from '../types/index';

// ============================================================================
// Overview View
// ============================================================================

export function Overview(): React.ReactElement {
  const { agents, teams, stats, isLoadingAgents, isLoadingTeams, setAgents, setTeams, setStats, updateAgent, updateTeam } = useDashboardStore();
  const { addNotification } = useUIStore();
  const events = useEventStream(50);

  // Subscribe to real-time updates
  const { agents: updatedAgents } = useAgentUpdates();
  const { teams: updatedTeams } = useTeamUpdates();

  // Merge real-time updates
  useEffect(() => {
    updatedAgents.forEach(agent => updateAgent(agent));
  }, [updatedAgents, updateAgent]);

  useEffect(() => {
    updatedTeams.forEach(team => updateTeam(team));
  }, [updatedTeams, updateTeam]);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agentsData, teamsData, statsData] = await Promise.all([
          api.agents.list(),
          api.teams.list(),
          api.metrics.getDashboardStats()
        ]);
        setAgents(agentsData);
        setTeams(teamsData);
        setStats(statsData);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        addNotification({
          type: 'error',
          message: 'Failed to load dashboard data',
          dismissible: true
        });
      }
    };

    fetchData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [setAgents, setTeams, setStats, addNotification]);

  // Calculate metrics
  const agentMetrics = useMemo(() => calculateAgentMetrics(agents), [agents]);
  const activeSwarms = useMemo(() => teams.filter(s => 
    s.status === SwarmState.ACTIVE || s.status === SwarmState.SCALING
  ).length, [teams]);
  const totalCost = useMemo(() => 
    agents.reduce((sum, a) => sum + (a.cost || 0), 0),
    [agents]
  );

  const isLoading = isLoadingAgents || isLoadingTeams;

  // Calculate cost trend
  const costTrend = useMemo(() => {
    const lastHourCost = agents
      .filter(a => {
        const spawnTime = new Date(a.spawnedAt).getTime();
        return spawnTime > Date.now() - 3600000;
      })
      .reduce((sum, a) => sum + (a.cost || 0), 0);
    
    const previousHourCost = agents
      .filter(a => {
        const spawnTime = new Date(a.spawnedAt).getTime();
        return spawnTime > Date.now() - 7200000 && spawnTime < Date.now() - 3600000;
      })
      .reduce((sum, a) => sum + (a.cost || 0), 0);

    if (previousHourCost === 0) return null;
    const change = ((lastHourCost - previousHourCost) / previousHourCost) * 100;
    return { value: Math.abs(change), positive: change >= 0 };
  }, [agents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-1">Real-time overview of your agent teams</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={stats?.systemHealth === 'healthy' ? 'success' : stats?.systemHealth === 'degraded' ? 'warning' : 'error'}>
            <Activity className="w-3 h-3 mr-1" />
            {stats?.systemHealth || 'unknown'}
          </Badge>
          <a 
            href="/teams/new" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
          >
            <Hexagon className="w-4 h-4" />
            New Team
          </a>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Agents"
          value={isLoading ? '-' : agentMetrics.total}
          subtitle={`${agentMetrics.online} online, ${agentMetrics.offline} offline`}
          icon={<Users className="w-6 h-6" />}
          color="blue"
        />
        <StatsCard
          title="Active Teams"
          value={isLoading ? '-' : activeTeams}
          subtitle={`of ${teams.length} total teams`}
          icon={<Hexagon className="w-6 h-6" />}
          color="emerald"
        />
        <StatsCard
          title="Total Cost"
          value={isLoading ? '-' : formatCurrency(totalCost)}
          subtitle="This billing period"
          icon={<DollarSign className="w-6 h-6" />}
          color="purple"
          trend={costTrend || undefined}
        />
        <StatsCard
          title="Events/sec"
          value={isLoading ? '-' : formatNumber(stats?.eventsPerSecond || 0, 1)}
          subtitle="Real-time event rate"
          icon={<Activity className="w-6 h-6" />}
          color="amber"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Status Chart */}
        <Card title="Agent Status Distribution" className="lg:col-span-1">
          <AgentStatusChart agents={agents} isLoading={isLoading} />
        </Card>

        {/* Event Stream */}
        <EventFeed 
          events={events}
          maxHeight="320px"
          className="lg:col-span-2"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Cost Over Time">
          <CostChart agents={agents} isLoading={isLoading} />
        </Card>

        <Card title="Team Activity">
          <TeamActivityChart teams={teams} isLoading={isLoading} />
        </Card>
      </div>

      {/* Active Teams Preview */}
      {activeTeams > 0 && (
        <Card title="Active Teams">
          <div className="space-y-3">
            {teams
              .filter(s => s.status === TeamState.ACTIVE || s.status === TeamState.SCALING)
              .slice(0, 3)
              .map(team => (
                <div 
                  key={team.id}
                  className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('w-2 h-2 rounded-full', getStatusColor(team.status))} />
                    <div>
                      <p className="font-medium text-white">{team.name}</p>
                      <p className="text-xs text-slate-500">
                        {team.agents.length} agents · {team.config.strategy}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-400">
                      {team.metrics.completedAgents} / {team.metrics.totalAgents} done
                    </span>
                    <a 
                      href={`/teams/${team.id}`}
                      className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
          </div>
          {activeTeams > 3 && (
            <div className="mt-4 text-center">
              <a 
                href="/teams" 
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                View all {activeTeams} active teams →
              </a>
            </div>
          )}
        </Card>
      )}

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickActionButton
            icon={<Hexagon className="w-5 h-5" />}
            label="New Team"
            href="/teams/new"
            color="emerald"
          />
          <QuickActionButton
            icon={<Users className="w-5 h-5" />}
            label="View Agents"
            href="/agents"
            color="blue"
          />
          <QuickActionButton
            icon={<TrendingUp className="w-5 h-5" />}
            label="Metrics"
            href="/costs"
            color="purple"
          />
          <QuickActionButton
            icon={<Zap className="w-5 h-5" />}
            label="Live Events"
            href="/events"
            color="amber"
          />
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// Agent Status Chart
// ============================================================================

function AgentStatusChart({ agents, isLoading }: { agents: Agent[]; isLoading: boolean }): React.ReactElement {
  if (isLoading) {
    return <LoadingSpinner className="py-8" />;
  }

  const statusCounts = agents.reduce((acc, agent) => {
    acc[agent.status] = (acc[agent.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const data = Object.entries(statusCounts).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: count,
    color: getStatusColorForChart(status as AgentStatus)
  }));

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="w-12 h-12 text-slate-700 mb-3" />
        <p className="text-slate-500">No agents to display</p>
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1e293b', 
              border: '1px solid #334155',
              borderRadius: '8px'
            }}
            itemStyle={{ color: '#e2e8f0' }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Cost Chart
// ============================================================================

function CostChart({ agents, isLoading }: { agents: Agent[]; isLoading: boolean }): React.ReactElement {
  if (isLoading) {
    return <LoadingSpinner className="py-8" />;
  }

  const data = useMemo(() => {
    const hours = 24;
    const now = Date.now();
    const points = [];
    
    for (let i = hours; i >= 0; i--) {
      const time = now - i * 3600000;
      const hourAgents = agents.filter(a => 
        new Date(a.spawnedAt).getTime() <= time
      );
      const cost = hourAgents.reduce((sum, a) => sum + (a.cost || 0), 0);
      points.push({
        time: new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        cost: cost * (1 - i / hours * 0.5)
      });
    }
    
    return points;
  }, [agents]);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
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
            formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
          />
          <Area
            type="monotone"
            dataKey="cost"
            stroke="#8b5cf6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#costGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Team Activity Chart
// ============================================================================

function TeamActivityChart({ teams, isLoading }: { teams: Team[]; isLoading: boolean }): React.ReactElement {
  if (isLoading) {
    return <LoadingSpinner className="py-8" />;
  }

  const data = teams.slice(0, 6).map(team => ({
    name: team.name.slice(0, 15),
    agents: team.agents.length,
    completed: team.metrics.completedAgents,
    failed: team.metrics.failedAgents
  }));

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Hexagon className="w-12 h-12 text-slate-700 mb-3" />
        <p className="text-slate-500">No teams to display</p>
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="name" 
            stroke="#64748b"
            tick={{ fill: '#64748b', fontSize: 12 }}
          />
          <YAxis 
            stroke="#64748b"
            tick={{ fill: '#64748b', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: '#1e293b', 
              border: '1px solid #334155',
              borderRadius: '8px'
            }}
            itemStyle={{ color: '#e2e8f0' }}
          />
          <Legend />
          <Bar dataKey="agents" name="Total Agents" fill="#3b82f6" />
          <Bar dataKey="completed" name="Completed" fill="#22c55e" />
          <Bar dataKey="failed" name="Failed" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Quick Action Button
// ============================================================================

function QuickActionButton({
  icon,
  label,
  href,
  color = 'emerald'
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  color?: 'emerald' | 'blue' | 'purple' | 'amber';
}): React.ReactElement {
  const colorClasses = {
    emerald: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
  };

  return (
    <a
      href={href}
      className={cn(
        "flex flex-col items-center gap-2 p-4 rounded-lg transition-colors text-center",
        colorClasses[color]
      )}
    >
      <div className="p-2 rounded-full bg-slate-900/50">{icon}</div>
      <span className="text-sm font-medium text-slate-200">{label}</span>
    </a>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusColorForChart(status: AgentStatus): string {
  const colors: Record<AgentStatus, string> = {
    [AgentStatus.PENDING]: '#64748b',
    [AgentStatus.RUNNING]: '#22c55e',
    [AgentStatus.PAUSED]: '#eab308',
    [AgentStatus.COMPLETED]: '#3b82f6',
    [AgentStatus.FAILED]: '#ef4444',
    [AgentStatus.BLOCKED]: '#f97316',
    [AgentStatus.KILLED]: '#dc2626',
    [AgentStatus.OFFLINE]: '#6b7280',
    [AgentStatus.BUSY]: '#06b6d4'
  };
  return colors[status] || '#6b7280';
}

export default Overview;
