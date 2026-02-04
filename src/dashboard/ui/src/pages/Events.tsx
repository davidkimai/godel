/**
 * Events Page
 * 
 * Real-time event stream with filtering and search
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Info,
  XCircle
} from 'lucide-react';
import { Card, Button, LoadingSpinner, EmptyState } from '../components/Layout';
import { useDashboardStore, useUIStore } from '../contexts/store';
import { api } from '../services/api';
import { useEventStream } from '../services/websocket';
import { EventType, AgentEvent } from '../types/index';
import { formatTimestamp, formatRelativeTime, cn } from '../utils/index';

// ============================================================================
// Events Page
// ============================================================================

export function EventsPage(): React.ReactElement {
  const { events, setEvents } = useDashboardStore();
  const { filters, setFilter } = useUIStore();
  const realtimeEvents = useEventStream(200);
  
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Merge real-time and fetched events
  useEffect(() => {
    const mergedEvents = Array.from(new Map([
      ...realtimeEvents.map(e => [e.id, e]),
      ...events.map(e => [e.id, e])
    ].slice(0, 200)).values());
    
    if (mergedEvents.length !== events.length) {
      setEvents(mergedEvents);
    }
  }, [realtimeEvents, events, setEvents]);

  // Fetch historical events
  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const result = await api.events.list({ limit: 200 });
      setEvents(result.items);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          event.type.toLowerCase().includes(search) ||
          event.id.toLowerCase().includes(search)
        );
      }
      if (filters.swarmId && filters.swarmId !== 'all') {
        if (event.swarmId !== filters.swarmId) return false;
      }
      return true;
    });
  }, [events, filters]);

  // Group events by type for stats
  const eventStats = useMemo(() => {
    return events.reduce((acc, event) => {
      const type = event.type.split('.')[0];
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [events]);

  const getEventIcon = (type: string) => {
    if (type.includes('error') || type.includes('failed')) return <XCircle className="w-4 h-4 text-red-400" />;
    if (type.includes('completed') || type.includes('success')) return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (type.includes('warning') || type.includes('budget')) return <AlertCircle className="w-4 h-4 text-amber-400" />;
    if (type.includes('created') || type.includes('started')) return <Activity className="w-4 h-4 text-blue-400" />;
    return <Info className="w-4 h-4 text-slate-400" />;
  };

  const getEventColor = (type: string) => {
    if (type.includes('error') || type.includes('failed')) return 'bg-red-500/10 border-red-500/20 text-red-400';
    if (type.includes('completed') || type.includes('success')) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
    if (type.includes('warning') || type.includes('budget')) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    if (type.includes('created') || type.includes('started')) return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
    return 'bg-slate-500/10 border-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-slate-400 mt-1">Real-time event stream from all agents and swarms</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setAutoRefresh(!autoRefresh)}
            icon={autoRefresh ? <RefreshCw className="w-4 h-4 animate-spin-slow" /> : <RefreshCw className="w-4 h-4" />}
          >
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>
          <Button variant="secondary" icon={<Download className="w-4 h-4" />}>
            Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Events" value={events.length} color="blue" />
        <StatCard title="Agent Events" value={eventStats['agent'] || 0} color="emerald" />
        <StatCard title="Swarm Events" value={eventStats['swarm'] || 0} color="purple" />
        <StatCard title="Errors" value={eventStats['error'] || 0} color="red" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search events..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        
        <select
          value={filters.swarmId || 'all'}
          onChange={(e) => setFilter('swarmId', e.target.value)}
          className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Sources</option>
          <option value="swarm">Swarm Events</option>
          <option value="agent">Agent Events</option>
          <option value="system">System Events</option>
        </select>
      </div>

      {/* Event Stream */}
      <Card>
        {isLoading ? (
          <LoadingSpinner className="py-12" />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            title="No events"
            description="Events will appear here as agents and swarms run"
            icon={<Activity className="w-12 h-12" />}
          />
        ) : (
          <div className="space-y-1">
            {filteredEvents.slice(0, 100).map((event, index) => (
              <EventRow
                key={event.id}
                event={event}
                getIcon={getEventIcon}
                getColor={getEventColor}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// Stat Card
// ============================================================================

function StatCard({ title, value, color }: { title: string; value: number; color: string }): React.ReactElement {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  return (
    <div className={cn('p-4 rounded-lg border', colors[color])}>
      <p className="text-sm text-slate-400">{title}</p>
      <p className="text-2xl font-bold text-white mt-1">{value.toLocaleString()}</p>
    </div>
  );
}

// ============================================================================
// Event Row
// ============================================================================

interface EventRowProps {
  event: AgentEvent;
  getIcon: (type: string) => React.ReactNode;
  getColor: (type: string) => string;
}

function EventRow({ event, getIcon, getColor }: EventRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'border-l-2 transition-colors',
        getColor(event.type),
        expanded && 'bg-slate-800/30'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        {getIcon(event.type)}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-300">{event.type}</span>
            <span className="text-xs text-slate-500">{event.id.slice(0, 8)}...</span>
          </div>
          
          {event.swarmId && (
            <span className="text-xs text-slate-500">Swarm: {event.swarmId.slice(0, 8)}...</span>
          )}
        </div>

        <span className="text-xs text-slate-500 whitespace-nowrap">
          {formatRelativeTime(event.timestamp)}
        </span>
      </button>

      {expanded && (
        <div className="px-11 pb-3">
          <pre className="p-3 bg-slate-950 rounded text-xs text-slate-300 overflow-x-auto">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Helper for slow spin
function animateSpinSlow() {
  return { animation: 'spin 3s linear infinite' };
}

export default EventsPage;
