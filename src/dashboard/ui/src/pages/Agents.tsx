/**
 * Agents Page
 * 
 * Federation Health - Full agent grid view
 */

import React, { useState } from 'react';
import { AgentGrid } from '../components/FederationHealth/AgentGrid';
import { useAgentsRealtime } from '../hooks/useWebSocket';
import { Agent, AgentStatus } from '../types';
import { Search, Filter, Grid3X3, List, RefreshCw, Power, PauseCircle, PlayCircle } from 'lucide-react';

const Agents: React.FC = () => {
  const { agents, isLoading } = useAgentsRealtime();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<AgentStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = !searchQuery || 
      agent.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.task?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.model?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || agent.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: agents.length,
    running: agents.filter(a => a.status === AgentStatus.RUNNING).length,
    completed: agents.filter(a => a.status === AgentStatus.COMPLETED).length,
    failed: agents.filter(a => a.status === AgentStatus.FAILED).length,
    pending: agents.filter(a => a.status === AgentStatus.PENDING).length,
    paused: agents.filter(a => a.status === AgentStatus.PAUSED).length,
  };

  const handleAgentAction = async (action: 'pause' | 'resume' | 'kill', agentId: string) => {
    // This would call the API in production
    console.log(`${action} agent ${agentId}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Federation Health</h2>
          <p className="text-gray-400 mt-1">
            Monitor all agents in the swarm federation
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
          >
            <Power className="w-4 h-4" />
            Spawn Agent
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-gray-500">
          <p className="text-xs text-gray-400 uppercase">Total</p>
          <p className="text-2xl font-bold text-gray-100">{stats.total}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-blue-500">
          <p className="text-xs text-blue-400 uppercase">Running</p>
          <p className="text-2xl font-bold text-blue-400">{stats.running}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-green-500">
          <p className="text-xs text-green-400 uppercase">Completed</p>
          <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-red-500">
          <p className="text-xs text-red-400 uppercase">Failed</p>
          <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-yellow-400 uppercase">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-amber-500">
          <p className="text-xs text-amber-400 uppercase">Paused</p>
          <p className="text-2xl font-bold text-amber-400">{stats.paused}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as AgentStatus | 'all')}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            {(Object.values(AgentStatus) as string[]).map(status => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded ${viewMode === 'grid' ? 'bg-gray-700 text-gray-200' : 'text-gray-400'}`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded ${viewMode === 'list' ? 'bg-gray-700 text-gray-200' : 'text-gray-400'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <button className="p-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Agent Grid */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <AgentGrid 
          filter={filterStatus} 
          searchQuery={searchQuery}
          onAgentClick={setSelectedAgent}
        />
      </div>

      {/* Selected Agent Details */}
      {selectedAgent && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-100">Agent Details</h3>
            <button 
              onClick={() => setSelectedAgent(null)}
              className="text-gray-400 hover:text-gray-200"
            >
              Close
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-400 mb-1">Agent ID</p>
              <p className="font-mono text-gray-200">{selectedAgent.id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Status</p>
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                selectedAgent.status === AgentStatus.RUNNING ? 'bg-blue-500/20 text-blue-400' :
                selectedAgent.status === AgentStatus.COMPLETED ? 'bg-green-500/20 text-green-400' :
                selectedAgent.status === AgentStatus.FAILED ? 'bg-red-500/20 text-red-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {selectedAgent.status}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Model</p>
              <p className="text-gray-200">{selectedAgent.model || 'N/A'}</p>
            </div>
            <div className="lg:col-span-3">
              <p className="text-sm text-gray-400 mb-1">Task</p>
              <p className="text-gray-200">{selectedAgent.task || 'No task assigned'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Progress</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${selectedAgent.progress || 0}%` }}
                  />
                </div>
                <span className="text-sm text-gray-300">{selectedAgent.progress || 0}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Cost</p>
              <p className="text-gray-200">${(selectedAgent.cost || 0).toFixed(4)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Runtime</p>
              <p className="text-gray-200">{Math.floor((Date.now() - new Date(selectedAgent.spawnedAt).getTime()) / 1000)}s</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-700">
            {selectedAgent.status === AgentStatus.RUNNING && (
              <button
                onClick={() => handleAgentAction('pause', selectedAgent.id)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500"
              >
                <PauseCircle className="w-4 h-4" />
                Pause
              </button>
            )}
            {selectedAgent.status === AgentStatus.PAUSED && (
              <button
                onClick={() => handleAgentAction('resume', selectedAgent.id)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
              >
                <PlayCircle className="w-4 h-4" />
                Resume
              </button>
            )}
            <button
              onClick={() => handleAgentAction('kill', selectedAgent.id)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
            >
              <Power className="w-4 h-4" />
              Kill
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Agents;
