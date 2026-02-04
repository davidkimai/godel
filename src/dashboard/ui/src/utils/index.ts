/**
 * Utility Functions
 * 
 * Helper functions for the Dash Dashboard UI
 */

import { AgentStatus, SwarmState, type Agent, type Swarm } from '../types';

// ============================================================================
// Formatting Utilities
// ============================================================================

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(value);
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString();
}

export function formatTimestamp(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// ============================================================================
// Status Utilities
// ============================================================================

export function getStatusColor(status: AgentStatus | SwarmState | string): string {
  const colors: Record<string, string> = {
    // Agent statuses
    [AgentStatus.PENDING]: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    [AgentStatus.RUNNING]: 'text-green-500 bg-green-500/10 border-green-500/20',
    [AgentStatus.PAUSED]: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    [AgentStatus.COMPLETED]: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    [AgentStatus.FAILED]: 'text-red-500 bg-red-500/10 border-red-500/20',
    [AgentStatus.BLOCKED]: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    [AgentStatus.KILLED]: 'text-gray-500 bg-gray-500/10 border-gray-500/20',
    [AgentStatus.OFFLINE]: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
    [AgentStatus.BUSY]: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    // Swarm states
    [SwarmState.CREATING]: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    [SwarmState.ACTIVE]: 'text-green-500 bg-green-500/10 border-green-500/20',
    [SwarmState.SCALING]: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    [SwarmState.PAUSED]: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    [SwarmState.COMPLETED]: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    [SwarmState.FAILED]: 'text-red-500 bg-red-500/10 border-red-500/20',
    [SwarmState.DESTROYED]: 'text-gray-500 bg-gray-500/10 border-gray-500/20',
    // Health
    healthy: 'text-green-500 bg-green-500/10 border-green-500/20',
    degraded: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    critical: 'text-red-500 bg-red-500/10 border-red-500/20'
  };

  return colors[status] || 'text-gray-500 bg-gray-500/10 border-gray-500/20';
}

export function getStatusIcon(status: AgentStatus | SwarmState | string): string {
  const icons: Record<string, string> = {
    [AgentStatus.PENDING]: '⏳',
    [AgentStatus.RUNNING]: '▶️',
    [AgentStatus.PAUSED]: '⏸️',
    [AgentStatus.COMPLETED]: '✅',
    [AgentStatus.FAILED]: '❌',
    [AgentStatus.BLOCKED]: '🚫',
    [AgentStatus.KILLED]: '💀',
    [AgentStatus.OFFLINE]: '⚫',
    [AgentStatus.BUSY]: '🔥',
    [SwarmState.CREATING]: '🔄',
    [SwarmState.ACTIVE]: '🟢',
    [SwarmState.SCALING]: '📊',
    [SwarmState.PAUSED]: '⏸️',
    [SwarmState.COMPLETED]: '✅',
    [SwarmState.FAILED]: '❌',
    [SwarmState.DESTROYED]: '🗑️',
    healthy: '💚',
    degraded: '💛',
    critical: '❤️'
  };

  return icons[status] || '⚪';
}

export function isActiveStatus(status: AgentStatus | SwarmState): boolean {
  return status === AgentStatus.RUNNING || 
         status === AgentStatus.BUSY ||
         status === SwarmState.ACTIVE ||
         status === SwarmState.SCALING;
}

export function isTerminalStatus(status: AgentStatus | SwarmState): boolean {
  return status === AgentStatus.COMPLETED || 
         status === AgentStatus.FAILED ||
         status === AgentStatus.KILLED ||
         status === SwarmState.COMPLETED ||
         status === SwarmState.FAILED ||
         status === SwarmState.DESTROYED;
}

// ============================================================================
// Data Utilities
// ============================================================================

export function groupAgentsBySwarm(agents: Agent[]): Record<string, Agent[]> {
  return agents.reduce((groups, agent) => {
    const swarmId = agent.swarmId || 'unassigned';
    if (!groups[swarmId]) {
      groups[swarmId] = [];
    }
    groups[swarmId].push(agent);
    return groups;
  }, {} as Record<string, Agent[]>);
}

export function groupAgentsByStatus(agents: Agent[]): Record<AgentStatus, number> {
  return agents.reduce((counts, agent) => {
    counts[agent.status] = (counts[agent.status] || 0) + 1;
    return counts;
  }, {} as Record<AgentStatus, number>);
}

export function calculateAgentMetrics(agents: Agent[]) {
  const total = agents.length;
  const online = agents.filter(a => 
    a.status === AgentStatus.RUNNING || 
    a.status === AgentStatus.BUSY ||
    a.status === AgentStatus.PAUSED
  ).length;
  const offline = agents.filter(a => 
    a.status === AgentStatus.OFFLINE || 
    a.status === AgentStatus.PENDING
  ).length;
  const busy = agents.filter(a => a.status === AgentStatus.BUSY).length;
  const idle = agents.filter(a => a.status === AgentStatus.RUNNING).length;
  const error = agents.filter(a => 
    a.status === AgentStatus.FAILED || 
    a.status === AgentStatus.KILLED
  ).length;

  return { total, online, offline, busy, idle, error };
}

export function calculateSwarmProgress(swarm: Swarm): number {
  if (swarm.metrics.totalAgents === 0) return 0;
  const completed = swarm.metrics.completedAgents + swarm.metrics.failedAgents;
  return completed / swarm.metrics.totalAgents;
}

export function filterAgents(
  agents: Agent[],
  filters: {
    status?: AgentStatus | 'all';
    swarmId?: string | 'all';
    search?: string;
  }
): Agent[] {
  return agents.filter(agent => {
    if (filters.status && filters.status !== 'all' && agent.status !== filters.status) {
      return false;
    }
    if (filters.swarmId && filters.swarmId !== 'all' && agent.swarmId !== filters.swarmId) {
      return false;
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matches = 
        agent.id.toLowerCase().includes(searchLower) ||
        agent.label?.toLowerCase().includes(searchLower) ||
        agent.task.toLowerCase().includes(searchLower) ||
        agent.model.toLowerCase().includes(searchLower);
      if (!matches) return false;
    }
    return true;
  });
}

// ============================================================================
// Chart Utilities
// ============================================================================

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export function aggregateTimeSeries(
  data: TimeSeriesPoint[],
  intervalMinutes: number
): TimeSeriesPoint[] {
  const buckets = new Map<string, number[]>();
  
  data.forEach(point => {
    const date = new Date(point.timestamp);
    const bucketTime = new Date(
      Math.floor(date.getTime() / (intervalMinutes * 60000)) * (intervalMinutes * 60000)
    );
    const key = bucketTime.toISOString();
    
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(point.value);
  });

  return Array.from(buckets.entries())
    .map(([timestamp, values]) => ({
      timestamp,
      value: values.reduce((a, b) => a + b, 0) / values.length
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function calculateBurnRate(costHistory: Array<{ timestamp: string; cost: number }>): number {
  if (costHistory.length < 2) return 0;
  
  const sorted = [...costHistory].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const costDiff = last.cost - first.cost;
  const timeDiffMs = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
  const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
  
  return timeDiffHours > 0 ? costDiff / timeDiffHours : 0;
}

// ============================================================================
// Validation Utilities
// ============================================================================

export function isValidToken(token: string): boolean {
  return typeof token === 'string' && token.length >= 32;
}

export function isValidSwarmId(id: string): boolean {
  return /^swarm-[0-9]+-[a-z0-9]{9}$/.test(id);
}

export function isValidAgentId(id: string): boolean {
  return /^agent-[0-9]+-[a-z0-9]{9}$/.test(id);
}

// ============================================================================
// Local Storage Utilities
// ============================================================================

export function saveToLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

export function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
    return defaultValue;
  }
}

// ============================================================================
// Class Name Utilities
// ============================================================================

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
