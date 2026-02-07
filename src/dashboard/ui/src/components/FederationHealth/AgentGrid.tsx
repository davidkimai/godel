/**
 * AgentGrid Component
 * 
 * Federation Health Grid - Visual grid showing all agents
 */

import React, { useState, useMemo } from 'react';
import { Activity, Cpu, Clock, AlertCircle, Zap } from 'lucide-react';
import { useAgentsRealtime } from '../../hooks/useWebSocket';
import { Agent, AgentStatus } from '../../types';

interface AgentCardProps {
  agent: Agent;
  onClick?: (agent: Agent) => void;
}

const statusConfig: Record<AgentStatus, { color: string; bg: string; icon: React.ReactNode }> = {
  [AgentStatus.PENDING]: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10 border-yellow-400/30',
    icon: <Clock className="w-4 h-4" />
  },
  [AgentStatus.RUNNING]: {
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/30',
    icon: <Activity className="w-4 h-4" />
  },
  [AgentStatus.PAUSED]: {
    color: 'text-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/30',
    icon: <Clock className="w-4 h-4" />
  },
  [AgentStatus.COMPLETED]: {
    color: 'text-green-400',
    bg: 'bg-green-400/10 border-green-400/30',
    icon: <Activity className="w-4 h-4" />
  },
  [AgentStatus.FAILED]: {
    color: 'text-red-400',
    bg: 'bg-red-400/10 border-red-400/30',
    icon: <AlertCircle className="w-4 h-4" />
  },
  [AgentStatus.BLOCKED]: {
    color: 'text-purple-400',
    bg: 'bg-purple-400/10 border-purple-400/30',
    icon: <AlertCircle className="w-4 h-4" />
  },
  [AgentStatus.KILLED]: {
    color: 'text-gray-400',
    bg: 'bg-gray-400/10 border-gray-400/30',
    icon: <AlertCircle className="w-4 h-4" />
  },
  [AgentStatus.OFFLINE]: {
    color: 'text-gray-500',
    bg: 'bg-gray-500/10 border-gray-500/30',
    icon: <AlertCircle className="w-4 h-4" />
  },
  [AgentStatus.BUSY]: {
    color: 'text-pink-400',
    bg: 'bg-pink-400/10 border-pink-400/30',
    icon: <Zap className="w-4 h-4" />
  }
};

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick }) => {
  const config = statusConfig[agent.status];
  const healthScore = calculateHealthScore(agent);
  const load = calculateLoad(agent);

  function calculateHealthScore(agent: Agent): number {
    if (agent.status === AgentStatus.FAILED) return 0;
    if (agent.status === AgentStatus.COMPLETED) return 100;
    if (agent.status === AgentStatus.RUNNING) return 90;
    if (agent.status === AgentStatus.PAUSED) return 70;
    if (agent.status === AgentStatus.PENDING) return 80;
    return 50;
  }

  function calculateLoad(agent: Agent): number {
    if (agent.status === AgentStatus.RUNNING || agent.status === AgentStatus.BUSY) {
      return Math.min(100, (agent.progress || 0) + 20);
    }
    return agent.progress || 0;
  }

  return (
    <div
      onClick={() => onClick?.(agent)}
      className={`
        relative p-4 rounded-lg border cursor-pointer
        transition-all duration-200 hover:scale-[1.02] hover:shadow-lg
        ${config.bg}
      `}
    >
      {/* Status Indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 ${config.color}`}>
          {config.icon}
          <span className="text-xs font-medium uppercase tracking-wider">
            {agent.status}
          </span>
        </div>
        <HealthBadge score={healthScore} />
      </div>

      {/* Agent ID */}
      <div className="mb-3">
        <p className="text-xs text-gray-400 mb-1">Agent ID</p>
        <p className="text-sm font-mono text-gray-200 truncate" title={agent.id}>
          {agent.id.slice(0, 8)}...
        </p>
      </div>

      {/* Model */}
      {agent.model && (
        <div className="mb-3">
          <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
            <Cpu className="w-3 h-3" />
            <span>Model</span>
          </div>
          <p className="text-xs text-gray-300 truncate">{agent.model}</p>
        </div>
      )}

      {/* Load Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Load</span>
          <span>{Math.round(load)}%</span>
        </div>
        <LoadBar percentage={load} />
      </div>

      {/* Current Task */}
      {agent.task && agent.status !== AgentStatus.COMPLETED && (
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-400 mb-1">Current Task</p>
          <p className="text-xs text-gray-300 line-clamp-2">{agent.task}</p>
        </div>
      )}

      {/* Cost */}
      {typeof agent.cost === 'number' && agent.cost > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <span className="text-gray-500">$</span>
          <span>{agent.cost.toFixed(4)}</span>
        </div>
      )}

      {/* Progress for running agents */}
      {agent.status === AgentStatus.RUNNING && agent.progress > 0 && (
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 rounded-full border-2 border-gray-700 flex items-center justify-center">
            <span className="text-[8px] text-gray-400">{agent.progress}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

const HealthBadge: React.FC<{ score: number }> = ({ score }) => {
  let color = 'text-green-400 bg-green-400/20';
  if (score < 50) color = 'text-red-400 bg-red-400/20';
  else if (score < 80) color = 'text-yellow-400 bg-yellow-400/20';

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score}
    </span>
  );
};

const LoadBar: React.FC<{ percentage: number }> = ({ percentage }) => {
  let color = 'bg-green-500';
  if (percentage > 80) color = 'bg-red-500';
  else if (percentage > 60) color = 'bg-yellow-500';
  else if (percentage > 40) color = 'bg-blue-500';

  return (
    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} transition-all duration-500`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

interface AgentGridProps {
  filter?: 'all' | AgentStatus;
  searchQuery?: string;
  onAgentClick?: (agent: Agent) => void;
}

export const AgentGrid: React.FC<AgentGridProps> = ({
  filter = 'all',
  searchQuery = '',
  onAgentClick
}) => {
  const { agents, isLoading } = useAgentsRealtime();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredAgents = useMemo(() => {
    let result = agents;
    
    if (filter !== 'all') {
      result = result.filter(a => a.status === filter);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.id.toLowerCase().includes(query) ||
        a.task?.toLowerCase().includes(query) ||
        a.model?.toLowerCase().includes(query) ||
        a.label?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [agents, filter, searchQuery]);

  const stats = useMemo(() => {
    const total = agents.length;
    const byStatus = agents.reduce((acc, agent) => {
      acc[agent.status] = (acc[agent.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const running = byStatus[AgentStatus.RUNNING] || 0;
    const completed = byStatus[AgentStatus.COMPLETED] || 0;
    const failed = byStatus[AgentStatus.FAILED] || 0;
    
    return { total, running, completed, failed, byStatus };
  }, [agents]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="agent-grid">
      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Total Agents</p>
          <p className="text-2xl font-bold text-gray-100">{stats.total}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Running</p>
          <p className="text-2xl font-bold text-blue-400">{stats.running}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Failed</p>
          <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={() => {}}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          All ({stats.total})
        </button>
        {Object.entries(stats.byStatus).map(([status, count]) => (
          <button
            key={status}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
          >
            {status} ({count})
          </button>
        ))}
      </div>

      {/* Grid */}
      {filteredAgents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No agents found</p>
          {searchQuery && <p className="text-sm mt-2">Try adjusting your search</p>}
        </div>
      ) : (
        <div className={`grid gap-4 ${
          viewMode === 'grid' 
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
            : 'grid-cols-1'
        }`}>
          {filteredAgents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={onAgentClick}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-800 text-sm text-gray-500">
        Showing {filteredAgents.length} of {stats.total} agents
      </div>
    </div>
  );
};
