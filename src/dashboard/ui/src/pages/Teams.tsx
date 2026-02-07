/**
 * Teams Page
 * 
 * Team management with hierarchical views and operational controls
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Hexagon,
  Play,
  Pause,
  Square,
  Plus,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Settings,
  Activity
} from 'lucide-react';
import { Card, Button, Badge, LoadingSpinner, EmptyState } from '../components/Layout';
import { useDashboardStore, useUIStore, useAuthStore } from '../contexts/store';
import { api } from '../services/api';
import { useSwarmUpdates } from '../services/websocket';
import {
  SwarmState,
  formatCurrency,
  formatNumber,
  formatRelativeTime,
  getStatusColor,
  cn
} from '../types/index';
import type { Team, Agent, SwarmConfig } from '../types/index';

// ============================================================================
// Teams Page
// ============================================================================

export function SwarmsPage(): React.ReactElement {
  const { teams, agents, isLoadingSwarms, setSwarms, updateSwarm } = useDashboardStore();
  const { view, toggleSwarmExpanded, setSelectedSwarm, filters, setFilter } = useUIStore();
  const { isAdmin } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [scalingSwarm, setScalingSwarm] = useState<string | null>(null);
  const { addNotification } = useUIStore();

  // Subscribe to real-time updates
  const { teams: updatedSwarms } = useSwarmUpdates();

  // Merge real-time updates
  useEffect(() => {
    updatedSwarms.forEach(team => {
      updateSwarm(team);
    });
  }, [updatedSwarms, updateSwarm]);

  // Fetch teams on mount
  useEffect(() => {
    const fetchSwarms = async () => {
      try {
        const data = await api.teams.list();
        setSwarms(data);
      } catch (error) {
        addNotification({
          type: 'error',
          message: 'Failed to load teams',
          dismissible: true
        });
      }
    };

    fetchSwarms();
  }, [setSwarms, addNotification]);

  // Filter teams
  const filteredSwarms = useMemo(() => {
    return teams.filter(team => {
      if (filters.status !== 'all' && team.status !== (filters.status as unknown as SwarmState)) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          team.name.toLowerCase().includes(search) ||
          team.id.toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [teams, filters]);

  // Group agents by team
  const agentsBySwarm = useMemo(() => {
    return agents.reduce((acc, agent) => {
      if (!acc[agent.teamId]) acc[agent.teamId] = [];
      acc[agent.teamId].push(agent);
      return acc;
    }, {} as Record<string, Agent[]>);
  }, [agents]);

  const handleStartSwarm = async (teamId: string) => {
    try {
      await api.teams.start(teamId);
      addNotification({ type: 'success', message: 'Team started', dismissible: true });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to start team', dismissible: true });
    }
  };

  const handleStopSwarm = async (teamId: string) => {
    try {
      await api.teams.stop(teamId);
      addNotification({ type: 'success', message: 'Team stopped', dismissible: true });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to stop team', dismissible: true });
    }
  };

  const handleScaleSwarm = async (teamId: string, delta: number) => {
    const team = teams.find(s => s.id === teamId);
    if (!team) return;

    const newSize = team.agents.length + delta;
    if (newSize < 1 || newSize > team.config.maxAgents) return;

    setScalingSwarm(teamId);
    try {
      await api.teams.scale(teamId, newSize);
      addNotification({ 
        type: 'success', 
        message: `Team scaled to ${newSize} agents`, 
        dismissible: true 
      });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to scale team', dismissible: true });
    } finally {
      setScalingSwarm(null);
    }
  };

  const handleDestroySwarm = async (teamId: string) => {
    if (!confirm('Are you sure you want to destroy this team? This action cannot be undone.')) {
      return;
    }

    try {
      await api.teams.destroy(teamId);
      addNotification({ type: 'success', message: 'Team destroyed', dismissible: true });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to destroy team', dismissible: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="text-slate-400 mt-1">Manage and monitor your agent teams</p>
        </div>
        
        {isAdmin() && (
          <Button onClick={() => setShowCreateModal(true)} icon={<Plus className="w-4 h-4" />}>
            New Team
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search teams..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value as SwarmState | 'all')}
          className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Statuses</option>
          {Object.values(SwarmState).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {/* Teams List */}
      <div className="space-y-4">
        {isLoadingSwarms ? (
          <LoadingSpinner className="py-12" />
        ) : filteredSwarms.length === 0 ? (
          <Card>
            <EmptyState
              title="No teams found"
              description={filters.search ? 'Try adjusting your filters' : 'Create your first team to get started'}
              icon={<Hexagon className="w-12 h-12" />}
              action={isAdmin() && (
                <Button onClick={() => setShowCreateModal(true)}>Create Team</Button>
              )}
            />
          </Card>
        ) : (
          filteredSwarms.map(team => (
            <SwarmCard
              key={team.id}
              team={team}
              agents={agentsBySwarm[team.id] || []}
              isExpanded={view.expandedSwarms.has(team.id)}
              onToggleExpand={() => toggleSwarmExpanded(team.id)}
              onStart={() => handleStartSwarm(team.id)}
              onStop={() => handleStopSwarm(team.id)}
              onScale={(delta) => handleScaleSwarm(team.id, delta)}
              onDestroy={() => handleDestroySwarm(team.id)}
              isScaling={scalingSwarm === team.id}
              isAdmin={isAdmin()}
            />
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateSwarmModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

// ============================================================================
// Team Card
// ============================================================================

interface SwarmCardProps {
  team: Team;
  agents: Agent[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStart: () => void;
  onStop: () => void;
  onScale: (delta: number) => void;
  onDestroy: () => void;
  isScaling: boolean;
  isAdmin: boolean;
}

function SwarmCard({
  team,
  agents,
  isExpanded,
  onToggleExpand,
  onStart,
  onStop,
  onScale,
  onDestroy,
  isScaling,
  isAdmin
}: SwarmCardProps): React.ReactElement {
  const progress = team.metrics.totalAgents > 0
    ? (team.metrics.completedAgents + team.metrics.failedAgents) / team.metrics.totalAgents
    : 0;

  const isActive = team.status === SwarmState.ACTIVE || team.status === SwarmState.SCALING;

  return (
    <Card className={cn('overflow-hidden', isExpanded && 'ring-1 ring-emerald-500/30')}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button onClick={onToggleExpand} className="p-1 hover:bg-slate-800 rounded">
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            )}
          </button>
          
          <div className={cn('w-3 h-3 rounded-full', getStatusColor(team.status))} />
          
          <div>
            <h3 className="font-semibold text-white">{team.name}</h3>
            <p className="text-sm text-slate-500">ID: {team.id.slice(0, 8)}...</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Quick stats */}
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="text-right">
              <p className="text-slate-400">Agents</p>
              <p className="font-medium text-white">{agents.length} / {team.config.maxAgents}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400">Budget</p>
              <p className="font-medium text-white">{formatCurrency(team.budget.remaining)}</p>
            </div>
          </div>

          {/* Actions */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              {isActive ? (
                <>
                  <button
                    onClick={() => onScale(1)}
                    disabled={agents.length >= team.config.maxAgents || isScaling}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-emerald-400 disabled:opacity-50"
                    title="Scale up"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onScale(-1)}
                    disabled={agents.length <= 1 || isScaling}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-amber-400 disabled:opacity-50"
                    title="Scale down"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onStop}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-yellow-400"
                    title="Pause team"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                </>
              ) : team.status === SwarmState.PAUSED ? (
                <button
                  onClick={onStart}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-emerald-400"
                  title="Resume team"
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : null}
              
              <button
                onClick={onDestroy}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400"
                title="Destroy team"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-slate-400">Progress</span>
          <span className="text-slate-300">{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-800">
          <div className="p-4">
            <h4 className="font-medium text-white mb-3">Agents ({agents.length})</h4>
            
            {agents.length === 0 ? (
              <p className="text-slate-500 text-sm">No agents in this team</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map(agent => (
                  <AgentListItem key={agent.id} agent={agent} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Agent List Item
// ============================================================================

function AgentListItem({ agent }: { agent: Agent }): React.ReactElement {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
      <div className={cn('w-2 h-2 rounded-full', getStatusColor(agent.status))} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{agent.label || agent.id.slice(0, 8)}</p>
        <p className="text-xs text-slate-500 truncate">{agent.model}</p>
      </div>
      <Badge variant="default" className="text-xs">
        {formatCurrency(agent.cost || 0)}
      </Badge>
    </div>
  );
}

// ============================================================================
// Create Team Modal
// ============================================================================

function CreateSwarmModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [name, setName] = useState('');
  const [task, setTask] = useState('');
  const [initialAgents, setInitialAgents] = useState(5);
  const [maxAgents, setMaxAgents] = useState(50);
  const [strategy, setStrategy] = useState<SwarmConfig['strategy']>('parallel');
  const [isCreating, setIsCreating] = useState(false);
  const { addNotification } = useUIStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const team = await api.teams.create(name, {
        task,
        initialAgents,
        maxAgents,
        strategy,
        name
      });
      addNotification({ type: 'success', message: 'Team created successfully', dismissible: true });
      onClose();
      navigate(`/teams/${team.id}`);
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to create team', dismissible: true });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md bg-slate-900 rounded-lg border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Create New Team</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Team"
              required
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Task</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe the task for this team..."
              required
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Initial Agents</label>
              <input
                type="number"
                value={initialAgents}
                onChange={(e) => setInitialAgents(parseInt(e.target.value))}
                min={1}
                max={maxAgents}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Max Agents</label>
              <input
                type="number"
                value={maxAgents}
                onChange={(e) => setMaxAgents(parseInt(e.target.value))}
                min={initialAgents}
                max={100}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as SwarmConfig['strategy'])}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="parallel">Parallel</option>
              <option value="pipeline">Pipeline</option>
              <option value="map-reduce">Map-Reduce</option>
              <option value="tree">Tree</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isCreating}>Create Team</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Fix missing import
import { X } from 'lucide-react';

export default SwarmsPage;
