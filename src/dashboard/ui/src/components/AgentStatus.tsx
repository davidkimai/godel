/**
 * AgentStatus Component
 * 
 * Real-time agent status indicator with detailed state visualization.
 */

import React from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  PauseCircle,
  Clock,
  AlertCircle,
  Zap,
  Power,
  Skull
} from 'lucide-react';
import { cn, formatCurrency, formatNumber, formatRelativeTime } from '../types/index';
import { AgentStatus as AgentStatusEnum } from '../types/index';
import type { Agent } from '../types/index';

// ============================================================================
// Types
// ============================================================================

interface AgentStatusProps {
  agent: Agent;
  showDetails?: boolean;
  showProgress?: boolean;
  className?: string;
  onClick?: () => void;
  compact?: boolean;
}

interface AgentStatusIndicatorProps {
  status: AgentStatusEnum;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

interface AgentStatusBadgeProps {
  status: AgentStatusEnum;
  showLabel?: boolean;
}

// ============================================================================
// Agent Status Component
// ============================================================================

export function AgentStatus({
  agent,
  showDetails = true,
  showProgress = true,
  className,
  onClick,
  compact = false
}: AgentStatusProps): React.ReactElement {
  const runtime = agent.runtime || 0;
  const runtimeFormatted = formatRuntime(runtime);

  if (compact) {
    return (
      <div 
        className={cn(
          "flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer",
          className
        )}
        onClick={onClick}
      >
        <AgentStatusIndicator status={agent.status} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {agent.label || agent.id.slice(0, 8)}
          </p>
          <p className="text-xs text-slate-500 truncate">{agent.model}</p>
        </div>
        <span className="text-xs text-slate-400">{formatCurrency(agent.cost || 0)}</span>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "p-4 rounded-lg border bg-slate-900/50 hover:bg-slate-800/50 transition-colors",
        getBorderColor(agent.status),
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <AgentStatusIndicator status={agent.status} size="md" pulse />
          <div>
            <h4 className="font-medium text-white">
              {agent.label || `Agent ${agent.id.slice(0, 8)}`}
            </h4>
            <p className="text-xs text-slate-500 font-mono">{agent.id.slice(0, 16)}...</p>
          </div>
        </div>
        <AgentStatusBadge status={agent.status} />
      </div>

      {/* Task Preview */}
      {agent.task && (
        <div className="mb-3">
          <p className="text-sm text-slate-400 line-clamp-2">{agent.task}</p>
        </div>
      )}

      {/* Progress Bar */}
      {showProgress && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500">Progress</span>
            <span className="text-slate-400">{agent.progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                agent.status === AgentStatusEnum.FAILED ? "bg-red-500" : "bg-emerald-500"
              )}
              style={{ width: `${agent.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Details */}
      {showDetails && (
        <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-800">
          <DetailItem icon={<Clock className="w-3 h-3" />} label="Runtime" value={runtimeFormatted} />
          <DetailItem 
            icon={<Activity className="w-3 h-3" />} 
            label="Cost" 
            value={formatCurrency(agent.cost || 0)} 
          />
          <DetailItem 
            icon={<Zap className="w-3 h-3" />} 
            label="Tokens" 
            value={`${formatNumber(agent.tokensInput + agent.tokensOutput)}`} 
          />
          <DetailItem 
            icon={<Power className="w-3 h-3" />} 
            label="Model" 
            value={agent.model.split('/').pop() || agent.model} 
          />
        </div>
      )}

      {/* Error Display */}
      {agent.lastError && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          <AlertCircle className="w-3 h-3 inline mr-1" />
          {agent.lastError}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Agent Status Indicator
// ============================================================================

export function AgentStatusIndicator({ 
  status, 
  size = 'md',
  pulse = false 
}: AgentStatusIndicatorProps): React.ReactElement {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  const iconSize = {
    sm: 12,
    md: 14,
    lg: 16
  };

  const getStatusConfig = (status: AgentStatusEnum) => {
    switch (status) {
      case AgentStatusEnum.RUNNING:
        return { 
          color: 'text-emerald-400', 
          bg: 'bg-emerald-400',
          icon: Activity,
          pulse: true 
        };
      case AgentStatusEnum.BUSY:
        return { 
          color: 'text-blue-400', 
          bg: 'bg-blue-400',
          icon: Zap,
          pulse: true 
        };
      case AgentStatusEnum.COMPLETED:
        return { 
          color: 'text-emerald-500', 
          bg: 'bg-emerald-500',
          icon: CheckCircle,
          pulse: false 
        };
      case AgentStatusEnum.FAILED:
        return { 
          color: 'text-red-400', 
          bg: 'bg-red-400',
          icon: XCircle,
          pulse: false 
        };
      case AgentStatusEnum.PAUSED:
        return { 
          color: 'text-amber-400', 
          bg: 'bg-amber-400',
          icon: PauseCircle,
          pulse: false 
        };
      case AgentStatusEnum.PENDING:
        return { 
          color: 'text-slate-400', 
          bg: 'bg-slate-400',
          icon: Clock,
          pulse: false 
        };
      case AgentStatusEnum.BLOCKED:
        return { 
          color: 'text-orange-400', 
          bg: 'bg-orange-400',
          icon: AlertCircle,
          pulse: true 
        };
      case AgentStatusEnum.KILLED:
        return { 
          color: 'text-red-500', 
          bg: 'bg-red-500',
          icon: Skull,
          pulse: false 
        };
      case AgentStatusEnum.OFFLINE:
      default:
        return { 
          color: 'text-slate-500', 
          bg: 'bg-slate-500',
          icon: Power,
          pulse: false 
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;
  const shouldPulse = pulse && config.pulse;

  return (
    <div className={cn("relative", shouldPulse && "animate-pulse")}>
      <Icon 
        className={cn(sizeClasses[size], config.color)} 
        size={iconSize[size]}
      />
      {shouldPulse && (
        <span className={cn(
          "absolute inset-0 rounded-full animate-ping opacity-75",
          config.bg
        )} />
      )}
    </div>
  );
}

// ============================================================================
// Agent Status Badge
// ============================================================================

export function AgentStatusBadge({ 
  status, 
  showLabel = true 
}: AgentStatusBadgeProps): React.ReactElement {
  const variants: Record<AgentStatusEnum, { className: string; label: string }> = {
    [AgentStatusEnum.PENDING]: { 
      className: 'bg-slate-500/20 text-slate-400 border-slate-500/30', 
      label: 'Pending' 
    },
    [AgentStatusEnum.RUNNING]: { 
      className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', 
      label: 'Running' 
    },
    [AgentStatusEnum.PAUSED]: { 
      className: 'bg-amber-500/20 text-amber-400 border-amber-500/30', 
      label: 'Paused' 
    },
    [AgentStatusEnum.COMPLETED]: { 
      className: 'bg-blue-500/20 text-blue-400 border-blue-500/30', 
      label: 'Completed' 
    },
    [AgentStatusEnum.FAILED]: { 
      className: 'bg-red-500/20 text-red-400 border-red-500/30', 
      label: 'Failed' 
    },
    [AgentStatusEnum.BLOCKED]: { 
      className: 'bg-orange-500/20 text-orange-400 border-orange-500/30', 
      label: 'Blocked' 
    },
    [AgentStatusEnum.KILLED]: { 
      className: 'bg-red-600/20 text-red-500 border-red-600/30', 
      label: 'Killed' 
    },
    [AgentStatusEnum.OFFLINE]: { 
      className: 'bg-gray-500/20 text-gray-400 border-gray-500/30', 
      label: 'Offline' 
    },
    [AgentStatusEnum.BUSY]: { 
      className: 'bg-blue-500/20 text-blue-400 border-blue-500/30', 
      label: 'Busy' 
    },
  };

  const { className, label } = variants[status] || variants[AgentStatusEnum.OFFLINE];

  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border",
      className
    )}>
      {showLabel ? label : <span className="w-2 h-2 rounded-full bg-current" />}
    </span>
  );
}

// ============================================================================
// Agent Status Summary
// ============================================================================

interface AgentStatusSummaryProps {
  agents: Agent[];
  className?: string;
}

export function AgentStatusSummary({ agents, className }: AgentStatusSummaryProps): React.ReactElement {
  const counts = agents.reduce((acc, agent) => {
    acc[agent.status] = (acc[agent.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statusOrder = [
    AgentStatusEnum.RUNNING,
    AgentStatusEnum.BUSY,
    AgentStatusEnum.COMPLETED,
    AgentStatusEnum.PAUSED,
    AgentStatusEnum.FAILED,
    AgentStatusEnum.PENDING
  ];

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {statusOrder.map(status => {
        const count = counts[status];
        if (!count) return null;
        
        return (
          <div 
            key={status}
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded-lg"
          >
            <AgentStatusIndicator status={status} size="sm" />
            <span className="text-xs text-slate-300">{count}</span>
          </div>
        );
      })}
      
      {agents.length === 0 && (
        <span className="text-sm text-slate-500">No agents</span>
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function DetailItem({ 
  icon, 
  label, 
  value 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string 
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-slate-400">
      {icon}
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-300 truncate">{value}</span>
    </div>
  );
}

function formatRuntime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function getBorderColor(status: AgentStatusEnum): string {
  switch (status) {
    case AgentStatusEnum.RUNNING:
    case AgentStatusEnum.COMPLETED:
      return 'border-emerald-500/20';
    case AgentStatusEnum.FAILED:
    case AgentStatusEnum.KILLED:
      return 'border-red-500/20';
    case AgentStatusEnum.PAUSED:
    case AgentStatusEnum.BLOCKED:
      return 'border-amber-500/20';
    default:
      return 'border-slate-800';
  }
}

export default AgentStatus;
