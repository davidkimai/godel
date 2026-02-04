/**
 * Swarms Page
 * 
 * Swarm management with hierarchical views and operational controls
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
import { useSwarmUpdates } from '../services/websocket.ts';
import {
  SwarmState,
  formatCurrency,
  formatNumber,
  formatRelativeTime,
  getStatusColor,
  cn
} from '../types/index.ts';
import type { Swarm, Agent, SwarmConfig } from '../types/index.ts';

// ============================================================================
// Swarms Page
// ============================================================================

export function SwarmsPage(): React.ReactElement {
  const { swarms, agents, isLoadingSwarms, setSwarms, updateSwarm } = useDashboardStore();
  const { view, toggleSwarmExpanded, setSelectedSwarm, filters, setFilter } = useUIStore();
  const { isAdmin } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [scalingSwarm, setScalingSwarm] = useState<string | null>(null);
  const { addNotification } = useUIStore();

  // Subscribe to real-time updates
  const { swarms: updatedSwarms } = useSwarmUpdates();

  // Merge real-time updates
  useEffect(() => {
    updatedSwarms.forEach(swarm => {
      updateSwarm(swarm);
    });
  }, [updatedSwarms, updateSwarm]);

  // Fetch swarms on mount
  useEffect(() => {
    const fetchSwarms = async () => {
      try {
        const data = await api.swarms.list();
        setSwarms(data);
      } catch (error) {
        addNotification({
          type: 'error',
          message: 'Failed to load swarms',
          dismissible: true
        });
      }
    };

    fetchSwarms();
  }, [setSwarms, addNotification]);

  // Filter swarms
  const filteredSwarms = useMemo(() => {
    return swarms.filter(swarm => {
      if (filters.status !== 'all' && swarm.status !== filters.status) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          swarm.name.toLowerCase().includes(search) ||
          swarm.id.toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [swarms, filters]);

  // Group agents by swarm
  const agentsBySwarm = useMemo(() => {
    return agents.reduce((acc, agent) => {
      if (!acc[agent.swarmId]) acc[agent.swarmId] = [];
      acc[agent.swarmId].push(agent);
      return acc;
    }, {} as Record<string, Agent[]>);
  }, [agents]);

  const handleStartSwarm = async (swarmId: string) => {
    try {
      await api.swarms.start(swarmId);
      addNotification({ type: 'success', message: 'Swarm started', dismissible: true });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to start swarm', dismissible: true });
    }
  };

  const handleStopSwarm = async (swarmId: string) => {
    try {
      await api.swarms.stop(swarmId);
      addNotification({ type: 'success', message: 'Swarm stopped', dismissible: true });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to stop swarm', dismissible: true });
    }
  };

  const handleScaleSwarm = async (swarmId: string, delta: number) => {
    const swarm = swarms.find(s => s.id === swarmId);
    if (!swarm) return;

    const newSize = swarm.agents.length + delta;
    if (newSize < 1 || newSize > swarm.config.maxAgents) return;

    setScalingSwarm(swarmId);
    try {
      await api.swarms.scale(swarmId, newSize);
      addNotification({ 
        type: 'success', 
        message: `Swarm scaled to ${newSize} agents`, 
        dismissible: true 
      });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to scale swarm', dismissible: true });
    } finally {
      setScalingSwarm(null);
    }
  };

  const handleDestroySwarm = async (swarmId: string) => {
    if (!confirm('Are you sure you want to destroy this swarm? This action cannot be undone.')) {
      return;
    }

    try {
      await api.swarms.destroy(swarmId);
      addNotification({ type: 'success', message: 'Swarm destroyed', dismissible: true });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to destroy swarm', dismissible: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Swarms</h1>
          <p className="text-slate-400 mt-1">Manage and monitor your agent swarms</p>
        </div>
        
        {isAdmin() && (
          <Button onClick={() => setShowCreateModal(true)} icon={<Plus className="w-4 h-4" />}>
            New Swarm
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search swarms..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Statuses</option>
          {Object.values(SwarmState).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {/* Swarms List */}
      <div className="space-y-4">
        {isLoadingSwarms ? (
          <LoadingSpinner className="py-12" />
        ) : filteredSwarms.length === 0 ? (
          <Card>
            <EmptyState
              title="No swarms found"
              description={filters.search ? 'Try adjusting your filters' : 'Create your first swarm to get started'}
              icon={<Hexagon className="w-12 h-12" />}
              action={isAdmin() && (
                <Button onClick={() => setShowCreateModal(true)}>Create Swarm</Button>
              )}
            />
          </Card>
        ) : (
          filteredSwarms.map(swarm => (
            <SwarmCard
              key={swarm.id}
              swarm={swarm}
              agents={agentsBySwarm[swarm.id] || []}
              isExpanded={view.expandedSwarms.has(swarm.id)}
              onToggleExpand={() => toggleSwarmExpanded(swarm.id)}
              onStart={() => handleStartSwarm(swarm.id)}
              onStop={() => handleStopSwarm(swarm.id)}
              onScale={(delta) => handleScaleSwarm(swarm.id, delta)}
              onDestroy={() => handleDestroySwarm(swarm.id)}
              isScaling={scalingSwarm === swarm.id}
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
// Swarm Card
// ============================================================================

interface SwarmCardProps {
  swarm: Swarm;
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
  swarm,
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
  const progress = swarm.metrics.totalAgents > 0
    ? (swarm.metrics.completedAgents + swarm.metrics.failedAgents) / swarm.metrics.totalAgents
    : 0;

  const isActive = swarm.status === SwarmState.ACTIVE || swarm.status === SwarmState.SCALING;

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
          
          <div className={cn('w-3 h-3 rounded-full', getStatusColor(swarm.status))} />
          
          <div>
            <h3 className="font-semibold text-white">{swarm.name}</h3>
            <p className="text-sm text-slate-500">ID: {swarm.id.slice(0, 8)}...</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Quick stats */}
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="text-right">
              <p className="text-slate-400">Agents</p>
              <p className="font-medium text-white">{agents.length} / {swarm.config.maxAgents}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400">Budget</p>
              <p className="font-medium text-white">{formatCurrency(swarm.budget.remaining)}</p>
            </div>
          </div>

          {/* Actions */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              {isActive ? (
                <>
                  <button
                    onClick={() => onScale(1)}
                    disabled={agents.length >= swarm.config.maxAgents || isScaling}
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
                    title="Pause swarm"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                </>
              ) : swarm.status === SwarmState.PAUSED ? (
                <button
                  onClick={onStart}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-emerald-400"
                  title="Resume swarm"
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : null}
              
              <button
                onClick={onDestroy}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400"
                title="Destroy swarm"
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
              <p className="text-slate-500 text-sm">No agents in this swarm</p>
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
// Create Swarm Modal
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
      const swarm = await api.swarms.create(name, {
        task,
        initialAgents,
        maxAgents,
        strategy,
        name
      });
      addNotification({ type: 'success', message: 'Swarm created successfully', dismissible: true });
      onClose();
      navigate(`/swarms/${swarm.id}`);
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to create swarm', dismissible: true });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md bg-slate-900 rounded-lg border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Create New Swarm</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Swarm"
              required
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Task</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe the task for this swarm..."
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
            <Button type="submit" isLoading={isCreating}>Create Swarm</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Fix missing import
import { X } from 'lucide-react';

export default SwarmsPage;
