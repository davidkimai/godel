/**
 * SessionNodeCard Component
 * 
 * Detail card for session tree nodes
 */

import React from 'react';
import { X, Clock, DollarSign, Cpu, Activity } from 'lucide-react';
import { SessionNode } from './SessionTree';
import { AgentStatus } from '../../types';

interface SessionNodeCardProps {
  node: SessionNode;
  onClose: () => void;
}

const statusColors: Record<AgentStatus, string> = {
  [AgentStatus.PENDING]: 'text-yellow-400 bg-yellow-400/10',
  [AgentStatus.RUNNING]: 'text-blue-400 bg-blue-400/10',
  [AgentStatus.PAUSED]: 'text-amber-400 bg-amber-400/10',
  [AgentStatus.COMPLETED]: 'text-green-400 bg-green-400/10',
  [AgentStatus.FAILED]: 'text-red-400 bg-red-400/10',
  [AgentStatus.BLOCKED]: 'text-purple-400 bg-purple-400/10',
  [AgentStatus.KILLED]: 'text-gray-400 bg-gray-400/10',
  [AgentStatus.OFFLINE]: 'text-gray-400 bg-gray-400/10',
  [AgentStatus.BUSY]: 'text-pink-400 bg-pink-400/10'
};

export const SessionNodeCard: React.FC<SessionNodeCardProps> = ({ node, onClose }) => {
  const runtime = Date.now() - node.startedAt;
  const runtimeMinutes = Math.floor(runtime / 60000);
  const runtimeSeconds = Math.floor((runtime % 60000) / 1000);

  return (
    <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="text-lg font-semibold text-gray-100">
            {node.label || 'Agent Session'}
          </h4>
          <p className="text-xs text-gray-400 font-mono mt-1">{node.id}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-4 ${statusColors[node.status]}`}>
        <Activity className="w-4 h-4" />
        {node.status}
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Cpu className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Task</p>
            <p className="text-sm text-gray-200">{node.task}</p>
          </div>
        </div>

        {node.model && (
          <div className="flex items-start gap-3">
            <Cpu className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400">Model</p>
              <p className="text-sm text-gray-200">{node.model}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Runtime</p>
            <p className="text-sm text-gray-200">
              {runtimeMinutes}m {runtimeSeconds}s
            </p>
          </div>
        </div>

        {typeof node.cost === 'number' && (
          <div className="flex items-start gap-3">
            <DollarSign className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400">Cost</p>
              <p className="text-sm text-gray-200">${node.cost.toFixed(4)}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <Activity className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Progress</p>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${node.progress}%` }}
                />
              </div>
              <span className="text-sm text-gray-200">{node.progress}%</span>
            </div>
          </div>
        </div>

        {node.children.length > 0 && (
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-400">Children</p>
            <p className="text-sm text-gray-200">{node.children.length} sub-agents</p>
          </div>
        )}

        <div className="pt-2 border-t border-gray-700">
          <p className="text-xs text-gray-400">Depth</p>
          <p className="text-sm text-gray-200">Level {node.depth}</p>
        </div>
      </div>
    </div>
  );
};
