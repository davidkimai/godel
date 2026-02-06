/**
 * SwarmCard Component
 * 
 * Displays a swarm status card with real-time updates and controls.
 */

import React, { useState } from 'react';
import {
  Hexagon,
  Play,
  Pause,
  Square,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Users,
  DollarSign,
  GitBranch,
  Activity
} from 'lucide-react';
import { Card, Badge, Button } from './Layout';
import { cn, formatCurrency, formatNumber, getStatusColor } from '../types/index';
import type { Swarm, Agent } from '../types/index';
import { SwarmState } from '../types/index';

// ============================================================================
// Types
// ============================================================================

interface SwarmCardProps {
  swarm: Swarm;
  agents: Agent[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onScale?: (delta: number) => void;
  onDestroy?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  isScaling?: boolean;
  isAdmin?: boolean;
  className?: string;
}

interface SwarmStatusBadgeProps {
  status: SwarmState;
}

interface AgentMiniListProps {
  agents: Agent[];
  maxDisplay?: number;
}

// ============================================================================
// Swarm Card Component
// ============================================================================

export function SwarmCard({
  swarm,
  agents,
  isExpanded = false,
  onToggleExpand,
  onStart,
  onStop,
  onScale,
  onDestroy,
  onPause,
  onResume,
  isScaling = false,
  isAdmin = false,
  className
}: SwarmCardProps): React.ReactElement {
  const [showConfirmDestroy, setShowConfirmDestroy] = useState(false);

  const progress = swarm.metrics.totalAgents > 0
    ? (swarm.metrics.completedAgents + swarm.metrics.failedAgents) / swarm.metrics.totalAgents
    : 0;

  const isActive = swarm.status === SwarmState.ACTIVE || swarm.status === SwarmState.SCALING;
  const isPaused = swarm.status === SwarmState.PAUSED;

  const runningAgents = agents.filter(a => a.status === 'running').length;
  const failedAgents = agents.filter(a => a.status === 'failed').length;
  const completedAgents = agents.filter(a => a.status === 'completed').length;

  const handleDestroy = () => {
    if (showConfirmDestroy) {
      onDestroy?.();
      setShowConfirmDestroy(false);
    } else {
      setShowConfirmDestroy(true);
      setTimeout(() => setShowConfirmDestroy(false), 3000);
    }
  };

  return (
    <Card className={cn('overflow-hidden transition-all', isExpanded && 'ring-1 ring-emerald-500/30', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {onToggleExpand && (
            <button 
              onClick={onToggleExpand}
              className="p-1 hover:bg-slate-800 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </button>
          )}
          
          <div className={cn('w-3 h-3 rounded-full animate-pulse', getStatusColor(swarm.status))} />
          
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{swarm.name}</h3>
              <SwarmStatusBadge status={swarm.status} />
            </div>
            <p className="text-sm text-slate-500 font-mono">{swarm.id.slice(0, 8)}...</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Quick Stats */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Users className="w-4 h-4" />
              <span>{agents.length} / {swarm.config.maxAgents}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <DollarSign className="w-4 h-4" />
              <span>{formatCurrency(swarm.budget.consumed)}</span>
            </div>
            {swarm.currentBranch && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <GitBranch className="w-4 h-4" />
                <span className="text-xs">{swarm.currentBranch}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          {isAdmin && (
            <div className="flex items-center gap-1">
              {isActive ? (
                <>
                  <button
                    onClick={() => onScale?.(1)}
                    disabled={agents.length >= swarm.config.maxAgents || isScaling}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-emerald-400 disabled:opacity-50 transition-colors"
                    title="Scale up"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onScale?.(-1)}
                    disabled={agents.length <= 1 || isScaling}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-amber-400 disabled:opacity-50 transition-colors"
                    title="Scale down"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onPause}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-yellow-400 transition-colors"
                    title="Pause swarm"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onStop}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                    title="Stop swarm"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                </>
              ) : isPaused ? (
                <button
                  onClick={onResume}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors"
                  title="Resume swarm"
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={onStart}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors"
                  title="Start swarm"
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              
              <button
                onClick={handleDestroy}
                className={cn(
                  "p-2 hover:bg-slate-800 rounded-lg transition-colors",
                  showConfirmDestroy ? "text-red-400 bg-red-500/10" : "text-slate-400 hover:text-red-400"
                )}
                title={showConfirmDestroy ? "Click again to confirm" : "Destroy swarm"}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">Progress</span>
            <span className="text-slate-500">
              {completedAgents} done · {runningAgents} running · {failedAgents} failed
            </span>
          </div>
          <span className="text-slate-300 font-medium">{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500",
              swarm.status === SwarmState.FAILED ? "bg-red-500" : "bg-emerald-500"
            )}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-800">
          <div className="p-4 space-y-4">
            {/* Agent Distribution */}
            <AgentMiniList agents={agents} />

            {/* Budget & Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-800">
              <StatItem label="Budget Allocated" value={formatCurrency(swarm.budget.allocated)} />
              <StatItem label="Budget Remaining" value={formatCurrency(swarm.budget.remaining)} />
              <StatItem label="Strategy" value={swarm.config.strategy} />
              <StatItem 
                label="Created" 
                value={new Date(swarm.createdAt).toLocaleDateString()} 
              />
            </div>

            {/* Event Streaming Status */}
            {(swarm.config.enableEventStreaming || swarm.config.enableBranching) && (
              <div className="flex items-center gap-2 pt-2">
                {swarm.config.enableEventStreaming && (
                  <Badge variant="info" className="text-xs">
                    <Activity className="w-3 h-3 mr-1" />
                    Event Streaming
                  </Badge>
                )}
                {swarm.config.enableBranching && (
                  <Badge variant="info" className="text-xs">
                    <GitBranch className="w-3 h-3 mr-1" />
                    Branching Enabled
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Swarm Status Badge
// ============================================================================

function SwarmStatusBadge({ status }: SwarmStatusBadgeProps): React.ReactElement {
  const variants: Record<SwarmState, { variant: 'default' | 'success' | 'warning' | 'error' | 'info'; label: string }> = {
    [SwarmState.CREATING]: { variant: 'info', label: 'Creating' },
    [SwarmState.ACTIVE]: { variant: 'success', label: 'Active' },
    [SwarmState.SCALING]: { variant: 'info', label: 'Scaling' },
    [SwarmState.PAUSED]: { variant: 'warning', label: 'Paused' },
    [SwarmState.COMPLETED]: { variant: 'success', label: 'Completed' },
    [SwarmState.FAILED]: { variant: 'error', label: 'Failed' },
    [SwarmState.DESTROYED]: { variant: 'default', label: 'Destroyed' },
  };

  const { variant, label } = variants[status] || { variant: 'default', label: status };

  return <Badge variant={variant}>{label}</Badge>;
}

// ============================================================================
// Agent Mini List
// ============================================================================

function AgentMiniList({ agents, maxDisplay = 6 }: AgentMiniListProps): React.ReactElement {
  const displayed = agents.slice(0, maxDisplay);
  const remaining = agents.length - maxDisplay;

  const getAgentIcon = (status: string) => {
    switch (status) {
      case 'running': return '●';
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'paused': return '⏸';
      default: return '○';
    }
  };

  const getAgentColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-emerald-400';
      case 'completed': return 'text-blue-400';
      case 'failed': return 'text-red-400';
      case 'paused': return 'text-amber-400';
      default: return 'text-slate-500';
    }
  };

  return (
    <div>
      <h4 className="text-sm font-medium text-slate-400 mb-3">
        Agents ({agents.length})
      </h4>
      
      {agents.length === 0 ? (
        <p className="text-slate-500 text-sm">No agents in this swarm</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {displayed.map(agent => (
            <div
              key={agent.id}
              className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg"
              title={`${agent.label || agent.id.slice(0, 8)} - ${agent.status}`}
            >
              <span className={cn('text-xs', getAgentColor(agent.status))}>
                {getAgentIcon(agent.status)}
              </span>
              <span className="text-xs text-slate-300 truncate">
                {agent.label || agent.id.slice(0, 8)}
              </span>
            </div>
          ))}
          {remaining > 0 && (
            <div className="flex items-center justify-center p-2 bg-slate-800/30 rounded-lg">
              <span className="text-xs text-slate-500">+{remaining} more</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Stat Item
// ============================================================================

function StatItem({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-300">{value}</p>
    </div>
  );
}

export default SwarmCard;
