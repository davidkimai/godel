/**
 * Agents Page
 * 
 * Agent management with detailed views and operational controls
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Trash2,
  ExternalLink,
  Bug
} from 'lucide-react';
import { Card, Button, Badge, LoadingSpinner, EmptyState } from '../components/Layout';
import { useDashboardStore, useUIStore, useAuthStore } from '../contexts/store';
import { api } from '../services/api';
import { useAgentUpdates } from '../services/websocket.ts';
import {
  AgentStatus,
} from '../types/index.ts';
import {
  formatCurrency,
  formatNumber,
  formatDuration,
  formatRelativeTime,
  getStatusColor,
  cn,
  filterAgents
} from '../utils/index.ts';
import type { Agent, LogEntry, Trace } from '../types/index.ts';

// ============================================================================
// Agents Page
// ============================================================================

export function AgentsPage(): React.ReactElement {
  const { agents, swarms, isLoadingAgents, setAgents, updateAgent } = useDashboardStore();
  const { filters, setFilter } = useUIStore();
  const { isAdmin } = useAuthStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const { addNotification } = useUIStore();

  // Subscribe to real-time updates
  const { agents: updatedAgents } = useAgentUpdates();

  // Merge real-time updates
  useEffect(() => {
    updatedAgents.forEach(agent => {
      updateAgent(agent);
    });
  }, [updatedAgents, updateAgent]);

  // Fetch agents on mount
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const data = await api.agents.list();
        setAgents(data);
      } catch (error) {
        addNotification({
          type: 'error',
          message: 'Failed to load agents',
          dismissible: true
        });
      }
    };

    fetchAgents();
  }, [setAgents, addNotification]);

  // Filter agents
  const filteredAgents = useMemo(() => {
    return filterAgents(agents, {
      status: filters.status as AgentStatus | 'all',
      swarmId: filters.swarmId,
      search: filters.search
    });
  }, [agents, filters]);

  // Get swarm name
  const getSwarmName = (swarmId: string) => {
    const swarm = swarms.find(s => s.id === swarmId);
    return swarm?.name || 'Unknown';
  };

  const handleKillAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to kill this agent?')) return;

    try {
      await api.agents.kill(agentId);
      addNotification({ type: 'success', message: 'Agent killed', dismissible: true });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to kill agent', dismissible: true });
    }
  };

  const handleRestartAgent = async (agentId: string) => {
    try {
      await api.agents.restart(agentId);
      addNotification({ type: 'success', message: 'Agent restarted', dismissible: true });
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to restart agent', dismissible: true });
    }
  };

  const selectedAgent = selectedAgentId 
    ? agents.find(a => a.id === selectedAgentId) 
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-slate-400 mt-1">Monitor and control individual agents</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="default">{agents.length} total</Badge>
          <Badge variant="success">{agents.filter(a => a.status === AgentStatus.RUNNING).length} running</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search agents..."
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
          {Object.values(AgentStatus).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>

        <select
          value={filters.swarmId}
          onChange={(e) => setFilter('swarmId', e.target.value)}
          className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Swarms</option>
          {swarms.map(swarm => (
            <option key={swarm.id} value={swarm.id}>{swarm.name}</option>
          ))}
        </select>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="lg:col-span-2">
          <Card>
            {isLoadingAgents ? (
              <LoadingSpinner className="py-12" />
            ) : filteredAgents.length === 0 ? (
              <EmptyState
                title="No agents found"
                description={filters.search ? 'Try adjusting your filters' : 'No agents match the current criteria'}
                icon={<Users className="w-12 h-12" />}
              />
            ) : (
              <div className="divide-y divide-slate-800">
                {filteredAgents.map(agent => (
                  <AgentListRow
                    key={agent.id}
                    agent={agent}
                    swarmName={getSwarmName(agent.swarmId)}
                    isSelected={selectedAgentId === agent.id}
                    onSelect={() => setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id)}
                    onKill={() => handleKillAgent(agent.id)}
                    onRestart={() => handleRestartAgent(agent.id)}
                    isAdmin={isAdmin()}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Agent Detail Panel */}
        <div className="lg:col-span-1">
          {selectedAgent ? (
            <AgentDetailPanel agent={selectedAgent} swarmName={getSwarmName(selectedAgent.swarmId)} />
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center">
                <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">Select an agent to view details</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Agent List Row
// ============================================================================

interface AgentListRowProps {
  agent: Agent;
  swarmName: string;
  isSelected: boolean;
  onSelect: () => void;
  onKill: () => void;
  onRestart: () => void;
  isAdmin: boolean;
}

function AgentListRow({
  agent,
  swarmName,
  isSelected,
  onSelect,
  onKill,
  onRestart,
  isAdmin
}: AgentListRowProps): React.ReactElement {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center justify-between p-4 cursor-pointer transition-colors',
        isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('w-3 h-3 rounded-full', getStatusColor(agent.status))} />
        
        <div>
          <p className="font-medium text-white">{agent.label || agent.id.slice(0, 12)}...</p>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>{swarmName}</span>
            <span>•</span>
            <span>{agent.model}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:block text-right">
          <p className="text-sm text-white">{formatCurrency(agent.cost || 0)}</p>
          <p className="text-xs text-slate-500">{formatNumber(agent.tokensInput + agent.tokensOutput)} tokens</p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1">
            {(agent.status === AgentStatus.RUNNING || agent.status === AgentStatus.BUSY) && (
              <button
                onClick={(e) => { e.stopPropagation(); onKill(); }}
                className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400"
                title="Kill agent"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onRestart(); }}
              className="p-2 hover:bg-emerald-500/10 rounded-lg text-slate-400 hover:text-emerald-400"
              title="Restart agent"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Agent Detail Panel
// ============================================================================

function AgentDetailPanel({ agent, swarmName }: { agent: Agent; swarmName: string }): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'trace'>('overview');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        if (activeTab === 'logs') {
          const logsData = await api.agents.getLogs(agent.id, 50);
          setLogs(logsData);
        } else if (activeTab === 'trace') {
          const traceData = await api.agents.getTrace(agent.id);
          setTrace(traceData);
        }
      } catch (error) {
        console.error('Failed to fetch agent details:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (activeTab !== 'overview') {
      fetchDetails();
    }
  }, [agent.id, activeTab]);

  return (
    <Card className="h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={cn('w-4 h-4 rounded-full', getStatusColor(agent.status))} />
        <div>
          <h3 className="font-semibold text-white">{agent.label || 'Unnamed Agent'}</h3>
          <p className="text-sm text-slate-500">{agent.id}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-800">
        {(['overview', 'logs', 'trace'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-2 text-sm font-medium capitalize transition-colors',
              activeTab === tab
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-slate-400 hover:text-white'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        {activeTab === 'overview' && (
          <AgentOverview agent={agent} swarmName={swarmName} />
        )}
        
        {activeTab === 'logs' && (
          isLoading ? <LoadingSpinner /> : <AgentLogs logs={logs} />
        )}
        
        {activeTab === 'trace' && (
          isLoading ? <LoadingSpinner /> : <AgentTrace trace={trace} />
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Agent Overview
// ============================================================================

function AgentOverview({ agent, swarmName }: { agent: Agent; swarmName: string }): React.ReactElement {
  const details = [
    { label: 'Status', value: agent.status, type: 'status' },
    { label: 'Model', value: agent.model },
    { label: 'Swarm', value: swarmName },
    { label: 'Task', value: agent.task },
    { label: 'Runtime', value: formatDuration(agent.runtime) },
    { label: 'Created', value: formatRelativeTime(agent.spawnedAt) },
    { label: 'Retries', value: `${agent.retryCount} / ${agent.maxRetries}` },
    { label: 'Cost', value: formatCurrency(agent.cost || 0) },
    { label: 'Input Tokens', value: formatNumber(agent.tokensInput) },
    { label: 'Output Tokens', value: formatNumber(agent.tokensOutput) },
  ];

  return (
    <div className="space-y-3">
      {details.map(({ label, value, type }) => (
        <div key={label} className="flex justify-between py-2 border-b border-slate-800 last:border-b-0">
          <span className="text-slate-400">{label}</span>
          {type === 'status' ? (
            <Badge variant={agent.status === AgentStatus.RUNNING ? 'success' : 'default'}>
              {value}
            </Badge>
          ) : (
            <span className="text-white truncate max-w-[150px]">{value}</span>
          )}
        </div>
      ))}

      {agent.lastError && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">Last Error</span>
          </div>
          <p className="text-sm text-red-300">{agent.lastError}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Agent Logs
// ============================================================================

function AgentLogs({ logs }: { logs: LogEntry[] }): React.ReactElement {
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="h-96 overflow-y-auto space-y-2 pr-2">
      {logs.length === 0 ? (
        <p className="text-center text-slate-500 py-8">No logs available</p>
      ) : (
        logs.map((log, i) => (
          <div key={i} className="text-sm font-mono">
            <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
            <span className={getLevelColor(log.level)}>[{log.level.toUpperCase()}]</span>{' '}
            <span className="text-slate-300">{log.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================================
// Agent Trace
// ============================================================================

function AgentTrace({ trace }: { trace: Trace | null }): React.ReactElement {
  if (!trace) {
    return (
      <div className="text-center py-8">
        <Bug className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">No trace available for this agent</p>
        <a
          href="http://localhost:16686" // Jaeger URL
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-4 text-emerald-400 hover:text-emerald-300"
        >
          Open Jaeger <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-white">{trace.name}</p>
          <p className="text-sm text-slate-500">Duration: {formatDuration(trace.duration)}</p>
        </div>
        <Badge variant={trace.status === 'ok' ? 'success' : 'error'}>
          {trace.status}
        </Badge>
      </div>

      <div className="space-y-2">
        {trace.spans.map((span, i) => (
          <div
            key={span.id}
            className="p-3 bg-slate-800/50 rounded-lg"
            style={{ marginLeft: `${span.parentId ? 20 : 0}px` }}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-white">{span.name}</span>
              <span className="text-sm text-slate-500">{formatDuration(span.duration)}</span>
            </div>
            {Object.entries(span.attributes).map(([key, value]) => (
              <p key={key} className="text-xs text-slate-500">
                {key}: {String(value)}
              </p>
            ))}
          </div>
        ))}
      </div>

      <a
        href={`http://localhost:16686/trace/${trace.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300"
      >
        View in Jaeger <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}

// Fix missing imports
import { AlertCircle } from 'lucide-react';

export default AgentsPage;
