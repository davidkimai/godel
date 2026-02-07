/**
 * AlertPanel Component
 * 
 * Active alerts and notifications panel
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  X, 
  CheckCircle,
  Bell,
  Clock,
  Trash2,
  Filter
} from 'lucide-react';
import { useEventsRealtime } from '../../hooks/useWebSocket';
import { AgentEvent, EventType } from '../../types';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: number;
  source: string;
  acknowledged: boolean;
  eventId?: string;
}

interface AlertCardProps {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  onDismiss: (id: string) => void;
}

const severityConfig: Record<AlertSeverity, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  info: {
    icon: <Info className="w-5 h-5" />,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/30'
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    border: 'border-yellow-400/30'
  },
  error: {
    icon: <AlertCircle className="w-5 h-5" />,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/30'
  },
  critical: {
    icon: <AlertCircle className="w-5 h-5" />,
    color: 'text-red-500',
    bg: 'bg-red-500/20',
    border: 'border-red-500/50'
  }
};

const AlertCard: React.FC<AlertCardProps> = ({ alert, onAcknowledge, onDismiss }) => {
  const config = severityConfig[alert.severity];
  const timeAgo = getTimeAgo(alert.timestamp);

  function getTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className={`
      p-4 rounded-lg border ${config.border} ${config.bg}
      transition-all duration-200
      ${alert.acknowledged ? 'opacity-60' : ''}
    `}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${config.color}`}>
          {config.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`font-medium ${config.color}`}>
              {alert.title}
            </h4>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
          </div>
          
          <p className="text-sm text-gray-300 mb-2">{alert.message}</p>
          
          <p className="text-xs text-gray-500">
            Source: <span className="text-gray-400">{alert.source}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-1">
          {!alert.acknowledged && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-green-400/10 transition-colors"
              title="Acknowledge"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDismiss(alert.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface AlertPanelProps {
  maxAlerts?: number;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({ maxAlerts = 50 }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<AlertSeverity | 'all'>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const { events } = useEventsRealtime(maxAlerts * 2);

  // Convert events to alerts
  useEffect(() => {
    const newAlerts: Alert[] = events
      .filter(event => isAlertEvent(event))
      .map(event => eventToAlert(event))
      .slice(0, maxAlerts);

    setAlerts(prev => {
      const existingIds = new Set(prev.map(a => a.id));
      const uniqueNewAlerts = newAlerts.filter(a => !existingIds.has(a.id));
      return [...uniqueNewAlerts, ...prev].slice(0, maxAlerts);
    });
  }, [events, maxAlerts]);

  function isAlertEvent(event: AgentEvent): boolean {
    const alertTypes = [
      EventType.AGENT_FAILED,
      EventType.SWARM_FAILED,
      EventType.SWARM_BUDGET_WARNING,
      EventType.SWARM_BUDGET_CRITICAL,
      EventType.SYSTEM_ERROR,
      EventType.TASK_FAILED
    ];
    return alertTypes.includes(event.type as EventType) || event.type.includes('error');
  }

  function eventToAlert(event: AgentEvent): Alert {
    let severity: AlertSeverity = 'info';
    let title = 'Notification';
    let message = event.type;

    switch (event.type) {
      case EventType.AGENT_FAILED:
        severity = 'error';
        title = 'Agent Failed';
        message = `Agent ${event.agentId?.slice(0, 8)}... has failed`;
        break;
      case EventType.SWARM_FAILED:
        severity = 'error';
        title = 'Swarm Failed';
        message = `Swarm ${event.swarmId?.slice(0, 8)}... has failed`;
        break;
      case EventType.SWARM_BUDGET_WARNING:
        severity = 'warning';
        title = 'Budget Warning';
        message = 'Swarm approaching budget limit';
        break;
      case EventType.SWARM_BUDGET_CRITICAL:
        severity = 'critical';
        title = 'Budget Critical';
        message = 'Swarm has exceeded critical budget threshold';
        break;
      case EventType.SYSTEM_ERROR:
        severity = 'critical';
        title = 'System Error';
        message = event.payload?.message as string || 'System error occurred';
        break;
      case EventType.TASK_FAILED:
        severity = 'error';
        title = 'Task Failed';
        message = `Task failed for agent ${event.agentId?.slice(0, 8)}...`;
        break;
      default:
        if (event.type.includes('error')) {
          severity = 'error';
          title = 'Error';
        } else if (event.type.includes('warning')) {
          severity = 'warning';
          title = 'Warning';
        }
    }

    return {
      id: event.id,
      severity,
      title,
      message,
      timestamp: new Date(event.timestamp).getTime(),
      source: event.swarmId || event.agentId || 'system',
      acknowledged: false,
      eventId: event.id
    };
  }

  const handleAcknowledge = useCallback((id: string) => {
    setAlerts(prev => 
      prev.map(a => a.id === id ? { ...a, acknowledged: true } : a)
    );
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleAcknowledgeAll = useCallback(() => {
    setAlerts(prev => 
      prev.map(a => ({ ...a, acknowledged: true }))
    );
  }, []);

  const handleClearAll = useCallback(() => {
    setAlerts([]);
  }, []);

  const filteredAlerts = alerts.filter(alert => {
    if (filter !== 'all' && alert.severity !== filter) return false;
    if (!showAcknowledged && alert.acknowledged) return false;
    return true;
  });

  const stats = {
    total: alerts.length,
    unacknowledged: alerts.filter(a => !a.acknowledged).length,
    critical: alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length,
    error: alerts.filter(a => a.severity === 'error' && !a.acknowledged).length,
    warning: alerts.filter(a => a.severity === 'warning' && !a.acknowledged).length
  };

  return (
    <div className="alert-panel bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="w-5 h-5 text-gray-400" />
              {stats.unacknowledged > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-medium">
                  {stats.unacknowledged}
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-100">Alerts</h3>
          </div>
          <div className="flex items-center gap-2">
            {stats.unacknowledged > 0 && (
              <button
                onClick={handleAcknowledgeAll}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
              >
                Acknowledge All
              </button>
            )}
            <button
              onClick={handleClearAll}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              title="Clear all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-400 uppercase">Total</p>
            <p className="text-lg font-semibold text-gray-100">{stats.total}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <p className="text-xs text-red-400 uppercase">Critical</p>
            <p className="text-lg font-semibold text-red-400">{stats.critical}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <p className="text-xs text-orange-400 uppercase">Errors</p>
            <p className="text-lg font-semibold text-orange-400">{stats.error}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <p className="text-xs text-yellow-400 uppercase">Warnings</p>
            <p className="text-lg font-semibold text-yellow-400">{stats.warning}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          {(['all', 'critical', 'error', 'warning', 'info'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilter(sev)}
              className={`px-3 py-1 rounded-lg text-sm capitalize transition-colors ${
                filter === sev
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {sev}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showAcknowledged}
                onChange={(e) => setShowAcknowledged(e.target.checked)}
                className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
              />
              Show acknowledged
            </label>
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div className="max-h-[500px] overflow-auto">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Bell className="w-12 h-12 mb-4 opacity-50" />
            <p>No alerts</p>
            <p className="text-sm mt-1">All systems operational</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredAlerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={handleAcknowledge}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800 text-sm text-gray-500 flex items-center justify-between">
        <span>Showing {filteredAlerts.length} of {alerts.length} alerts</span>
        <span>{stats.unacknowledged} unacknowledged</span>
      </div>
    </div>
  );
};
