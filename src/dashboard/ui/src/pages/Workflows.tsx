/**
 * Workflows Page
 * 
 * Workflow visualizer and management
 */

import React, { useState } from 'react';
import { WorkflowGraph } from '../components/WorkflowVisualizer/WorkflowGraph';
import { useTeamsRealtime } from '../hooks/useWebSocket';
import { Play, Pause, Square, Plus, Filter, Search } from 'lucide-react';

const Workflows: React.FC = () => {
  const { teams } = useTeamsRealtime();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTeams = teams.filter(team => 
    team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    team.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Workflows</h2>
          <p className="text-gray-400 mt-1">
            Visualize and manage agent workflows
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors">
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
        </div>
      </div>

      {/* Team Selector */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto">
          {filteredTeams.map(team => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                selectedTeam === team.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
      </div>

      {/* Workflow Graph */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <WorkflowGraph 
          workflowId={selectedTeam || undefined} 
          height={600}
        />
      </div>

      {/* Workflow Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Active Workflows</h3>
          <div className="space-y-3">
            {teams.slice(0, 5).map(team => (
              <div key={team.id} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-200">{team.name}</p>
                  <p className="text-sm text-gray-400">{team.agents.length} agents</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    team.status === 'active' ? 'bg-green-500' :
                    team.status === 'paused' ? 'bg-yellow-500' :
                    'bg-gray-500'
                  }`} />
                  <span className="text-sm text-gray-400 capitalize">{team.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {[
              { action: 'Workflow started', time: '2 min ago', status: 'success' },
              { action: 'Agent spawned', time: '5 min ago', status: 'success' },
              { action: 'Task completed', time: '10 min ago', status: 'success' },
              { action: 'Error occurred', time: '15 min ago', status: 'error' },
              { action: 'Workflow paused', time: '20 min ago', status: 'warning' }
            ].map((activity, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <span className="text-gray-300">{activity.action}</span>
                <span className="text-sm text-gray-500">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button className="w-full flex items-center gap-3 px-4 py-3 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 transition-colors">
              <Play className="w-4 h-4" />
              Resume All
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 bg-yellow-600/20 text-yellow-400 rounded-lg hover:bg-yellow-600/30 transition-colors">
              <Pause className="w-4 h-4" />
              Pause All
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors">
              <Square className="w-4 h-4" />
              Stop All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Workflows;
