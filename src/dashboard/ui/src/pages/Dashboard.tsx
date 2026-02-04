/**
 * Dashboard Page
 * 
 * Main dashboard view with real-time metrics and visualizations
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
  Activity
} from 'lucide-react';
import { Card, StatsCard, Badge, LoadingSpinner } from '../components/Layout';
import { useDashboardStore, useUIStore } from '../contexts/store';
import { api } from '../services/api';
import { useEventStream } from '../services/websocket';
import {
  AgentStatus,
  SwarmState,
  formatCurrency,
  formatNumber,
  getStatusColor,
  calculateAgentMetrics
} from '../types/index';
import type { Agent, Swarm, AgentEvent } from '../types/index';

// ============================================================================
// Dashboard Page
// ============================================================================

export function DashboardPage(): React.ReactElement {
  const { agents, swarms, stats, isLoadingAgents, isLoadingSwarms, setAgents, setSwarms, setStats } = useDashboardStore();
  const { addNotification } = useUIStore();
  const events = useEventStream(50);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agentsData, swarmsData, statsData] = await Promise.all([
          api.agents.list(),
          api.swarms.list(),
          api.metrics.getDashboardStats()
        ]);
        setAgents(agentsData);
        setSwarms(swarmsData);
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
  }, [setAgents, setSwarms, setStats, addNotification]);

  // Calculate metrics
  const agentMetrics = useMemo(() => calculateAgentMetrics(agents), [agents]);
  const activeSwarms = useMemo(() => swarms.filter(s => 
    s.status === SwarmState.ACTIVE || s.status === SwarmState.SCALING
  ).length, [swarms]);
  const totalCost = useMemo(() => 
    agents.reduce((sum, a) => sum + (a.cost || 0), 0),
    [agents]
  );

  const isLoading = isLoadingAgents || isLoadingSwarms;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-1">Real-time overview of your agent swarms</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={stats?.systemHealth === 'healthy' ? 'success' : stats?.systemHealth === 'degraded' ? 'warning' : 'error'}>
            {stats?.systemHealth || 'unknown'}
          </Badge>
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
          title="Active Swarms"
          value={isLoading ? '-' : activeSwarms}
          subtitle={`of ${swarms.length} total swarms`}
          icon={<Hexagon className="w-6 h-6" />}
          color="emerald"
        />
        <StatsCard
          title="Total Cost"
          value={isLoading ? '-' : formatCurrency(totalCost)}
          subtitle="This billing period"
          icon={<DollarSign className="w-6 h-6" />}
          color="purple"
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
        <Card 
          title="Live Event Stream" 
          className="lg:col-span-2"
          action={
            <Badge variant="success">{events.length} events</Badge>
          }
        >
          <EventStream events={events} />
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Cost Over Time">
          <CostChart agents={agents} isLoading={isLoading} />
        </Card>

        <Card title="Swarm Activity">
          <SwarmActivityChart swarms={swarms} isLoading={isLoading} />
        </Card>
      </div>

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickActionButton
            icon={<Hexagon className="w-5 h-5" />}
            label="New Swarm"
            href="/swarms/new"
          />
          <QuickActionButton
            icon={<Users className="w-5 h-5" />}
            label="View Agents"
            href="/agents"
          />
          <QuickActionButton
            icon={<TrendingUp className="w-5 h-5" />}
            label="Metrics"
            href="/costs"
          />
          <QuickActionButton
            icon={<Zap className="w-5 h-5" />}
            label="Live Events"
            href="/events"
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
    name: status,
    value: count,
    color: getStatusColor(status as AgentStatus).split(' ')[0].replace('text-', '')
  }));

  const COLORS = {
    'green-500': '#22c55e',
    'yellow-500': '#eab308',
    'red-500': '#ef4444',
    'blue-500': '#3b82f6',
    'gray-500': '#6b7280',
    'purple-500': '#a855f7',
    'orange-500': '#f97316'
  };

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
              <Cell 
                key={`cell-${index}`} 
                fill={COLORS[entry.color as keyof typeof COLORS] || '#6b7280'} 
              />
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
// Event Stream
// ============================================================================

function EventStream({ events }: { events: AgentEvent[] }): React.ReactElement {
  const getEventIcon = (type: string) => {
    if (type.includes('error') || type.includes('failed')) return '❌';
    if (type.includes('completed')) return '✅';
    if (type.includes('started')) return '▶️';
    if (type.includes('created')) return '➕';
    if (type.includes('killed')) return '💀';
    return '📌';
  };

  const getEventColor = (type: string) => {
    if (type.includes('error') || type.includes('failed')) return 'text-red-400';
    if (type.includes('completed')) return 'text-emerald-400';
    if (type.includes('started')) return 'text-blue-400';
    if (type.includes('created')) return 'text-purple-400';
    return 'text-slate-400';
  };

  return (
    <div className="h-64 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
      {events.length === 0 ? (
        <p className="text-center text-slate-500 py-8">No events yet...</p>
      ) : (
        events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 p-2 rounded bg-slate-800/50 text-sm"
          >
            <span className="text-lg">{getEventIcon(event.type)}</span>
            <div className="flex-1 min-w-0">
              <p className={getEventColor(event.type)}>
                {event.type}
              </p>
              {event.swarmId && (
                <p className="text-slate-500 text-xs truncate">
                  Swarm: {event.swarmId.slice(0, 8)}...
                </p>
              )}
            </div>
            <time className="text-xs text-slate-500 whitespace-nowrap">
              {new Date(event.timestamp).toLocaleTimeString()}
            </time>
          </div>
        ))
      )}
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

  // Generate mock cost data based on agents
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
        cost: cost * (1 - i / hours * 0.5) // Simulate increasing cost over time
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
// Swarm Activity Chart
// ============================================================================

function SwarmActivityChart({ swarms, isLoading }: { swarms: Swarm[]; isLoading: boolean }): React.ReactElement {
  if (isLoading) {
    return <LoadingSpinner className="py-8" />;
  }

  const data = swarms.map(swarm => ({
    name: swarm.name.slice(0, 15),
    agents: swarm.agents.length,
    completed: swarm.metrics.completedAgents,
    failed: swarm.metrics.failedAgents
  }));

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
  href
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}): React.ReactElement {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-center"
    >
      <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-400">{icon}</div>
      <span className="text-sm text-slate-300">{label}</span>
    </a>
  );
}

export default DashboardPage;
