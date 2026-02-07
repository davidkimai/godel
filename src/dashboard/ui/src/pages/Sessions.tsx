/**
 * Sessions Page
 * 
 * Full session tree visualization page
 */

import React, { useState } from 'react';
import { SessionTree, SessionNode } from '../components/SessionTree/SessionTree';
import { SessionNodeCard } from '../components/SessionTree/SessionNodeCard';
import { useAgentsRealtime } from '../hooks/useWebSocket';
import { Search, Filter, Download, Maximize2 } from 'lucide-react';

const Sessions: React.FC = () => {
  const { agents } = useAgentsRealtime();
  const [selectedNode, setSelectedNode] = useState<SessionNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [fullscreen, setFullscreen] = useState(false);

  const handleNodeClick = (node: SessionNode) => {
    setSelectedNode(node);
  };

  const exportTree = () => {
    const data = {
      agents,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-tree-${Date.now()}.json`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Session Tree</h2>
          <p className="text-gray-400 mt-1">
            Visualize parent-child relationships between agent sessions
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={exportTree}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
            {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Tree Visualization */}
      <div className={`bg-gray-800 rounded-xl border border-gray-700 overflow-hidden ${fullscreen ? 'fixed inset-0 z-50' : ''}`}>
        {fullscreen && (
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-100">Session Tree</h3>
            <button
              onClick={() => setFullscreen(false)}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        )}
        
        <div className="relative">
          <SessionTree 
            onNodeClick={handleNodeClick}
            height={fullscreen ? window.innerHeight - 100 : 600}
            width={fullscreen ? window.innerWidth : undefined}
          />
          
          {selectedNode && !fullscreen && (
            <div className="absolute top-4 right-4 w-80">
              <SessionNodeCard 
                node={selectedNode} 
                onClose={() => setSelectedNode(null)} 
              />
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Sessions</p>
          <p className="text-2xl font-bold text-gray-100">{agents.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Max Depth</p>
          <p className="text-2xl font-bold text-gray-100">
            {Math.max(...agents.map(a => {
              let depth = 0;
              let parent = a.parentId;
              while (parent) {
                depth++;
                const p = agents.find(agent => agent.id === parent);
                parent = p?.parentId;
              }
              return depth;
            }), 0) + 1}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Root Agents</p>
          <p className="text-2xl font-bold text-gray-100">
            {agents.filter(a => !a.parentId).length}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Child Agents</p>
          <p className="text-2xl font-bold text-gray-100">
            {agents.filter(a => a.parentId).length}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Sessions;
