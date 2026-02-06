/**
 * EventFeed Component
 * 
 * Real-time event feed with filtering, search, and auto-scroll.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  Play,
  Plus,
  Skull,
  Pause,
  RotateCcw,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Download,
  Clock
} from 'lucide-react';
import { Card, Badge, Button } from './Layout';
import { cn, formatRelativeTime } from '../types/index';
import { EventType, AgentEvent } from '../types/index';

// ============================================================================
// Types
// ============================================================================

interface EventFeedProps {
  events: AgentEvent[];
  maxHeight?: string;
  showFilters?: boolean;
  showSearch?: boolean;
  autoScroll?: boolean;
  onEventClick?: (event: AgentEvent) => void;
  className?: string;
  title?: string;
}

interface EventItemProps {
  event: AgentEvent;
  onClick?: () => void;
  expanded?: boolean;
}

interface EventFilters {
  types: EventType[];
  search: string;
  swarmId?: string;
  agentId?: string;
}

// ============================================================================
// Event Feed Component
// ============================================================================

export function EventFeed({
  events,
  maxHeight = '400px',
  showFilters = true,
  showSearch = true,
  autoScroll = true,
  onEventClick,
  className,
  title = 'Event Feed'
}: EventFeedProps): React.ReactElement {
  const [filters, setFilters] = useState<EventFilters>({ types: [], search: '' });
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [isPaused, setIsPaused] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  // Filter events
  const filteredEvents = events.filter(event => {
    if (filters.types.length > 0 && !filters.types.includes(event.type as EventType)) {
      return false;
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const matchesSearch = 
        event.type.toLowerCase().includes(search) ||
        event.swarmId?.toLowerCase().includes(search) ||
        event.agentId?.toLowerCase().includes(search) ||
        JSON.stringify(event.payload).toLowerCase().includes(search);
      if (!matchesSearch) return false;
    }
    if (filters.swarmId && event.swarmId !== filters.swarmId) return false;
    if (filters.agentId && event.agentId !== filters.agentId) return false;
    return true;
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && !isPaused && feedRef.current && shouldScrollRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [filteredEvents, autoScroll, isPaused]);

  // Handle scroll to detect manual scroll
  const handleScroll = () => {
    if (feedRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      shouldScrollRef.current = isAtBottom;
    }
  };

  const toggleEventExpansion = (eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFilters({ types: [], search: '' });
  };

  const exportEvents = () => {
    const data = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eventTypeCounts = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card 
      className={cn("overflow-hidden", className)}
      title={title}
      action={(
        <div className="flex items-center gap-2">
          <Badge variant="success">
            <Activity className="w-3 h-3 mr-1" />
            {filteredEvents.length}
          </Badge>
          {showFilters && (
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={cn(
                "p-1.5 rounded transition-colors",
                showFilterPanel ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              )}
              title="Toggle filters"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={cn(
              "p-1.5 rounded transition-colors",
              isPaused ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-white"
            )}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={exportEvents}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
            title="Export events"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      )}
    >
      {/* Filter Panel */}
      {showFilterPanel && showFilters && (
        <div className="p-3 border-b border-slate-800 space-y-3">
          {/* Search */}
          {showSearch && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search events..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="w-full pl-8 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {/* Type Filters */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(eventTypeCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 8)
              .map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => setFilters(prev => ({
                    ...prev,
                    types: prev.types.includes(type as EventType)
                      ? prev.types.filter(t => t !== type)
                      : [...prev.types, type as EventType]
                  }))}
                  className={cn(
                    "px-2 py-1 text-xs rounded border transition-colors",
                    filters.types.includes(type as EventType)
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600"
                  )}
                >
                  {getEventTypeShortName(type)} ({count})
                </button>
              ))}
          </div>

          {/* Clear Filters */}
          {(filters.types.length > 0 || filters.search) && (
            <button
              onClick={clearFilters}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Event List */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="overflow-y-auto scrollbar-thin"
        style={{ maxHeight }}
      >
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="w-12 h-12 text-slate-700 mb-3" />
            <p className="text-slate-500">No events</p>
            {(filters.types.length > 0 || filters.search) && (
              <button
                onClick={clearFilters}
                className="mt-2 text-sm text-emerald-400 hover:text-emerald-300"
              >
                Clear filters to see all events
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredEvents.map((event, index) => (
              <EventItem
                key={`${event.id}-${index}`}
                event={event}
                onClick={() => {
                  toggleEventExpansion(event.id);
                  onEventClick?.(event);
                }}
                expanded={expandedEvents.has(event.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 text-xs text-slate-500">
        <span>Showing {filteredEvents.length} of {events.length} events</span>
        {isPaused && (
          <Badge variant="warning" className="text-xs">
            Paused
          </Badge>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Event Item Component
// ============================================================================

function EventItem({ event, onClick, expanded }: EventItemProps): React.ReactElement {
  const icon = getEventIcon(event.type);
  const colorClass = getEventColor(event.type);
  const timestamp = new Date(event.timestamp);

  return (
    <div
      className={cn(
        "p-3 hover:bg-slate-800/50 transition-colors cursor-pointer",
        expanded && "bg-slate-800/30"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn("mt-0.5", colorClass)}>
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-sm font-medium", colorClass)}>
              {formatEventType(event.type)}
            </p>
            <time className="text-xs text-slate-500 whitespace-nowrap">
              {formatRelativeTime(timestamp)}
            </time>
          </div>

          {/* Event Details */}
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
            {event.swarmId && (
              <span className="font-mono">Swarm: {event.swarmId.slice(0, 8)}</span>
            )}
            {event.agentId && (
              <span className="font-mono">Agent: {event.agentId.slice(0, 8)}</span>
            )}
          </div>

          {/* Expanded Payload */}
          {expanded && event.payload && Object.keys(event.payload).length > 0 && (
            <div className="mt-3 p-2 bg-slate-900 rounded border border-slate-800">
              <pre className="text-xs text-slate-400 overflow-x-auto">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Expand Indicator */}
        {event.payload && Object.keys(event.payload).length > 0 && (
          <div className="text-slate-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getEventIcon(type: string): React.ReactNode {
  const iconClass = "w-4 h-4";
  
  if (type.includes('error') || type.includes('failed')) 
    return <XCircle className={cn(iconClass, "text-red-400")} />;
  if (type.includes('completed')) 
    return <CheckCircle className={cn(iconClass, "text-emerald-400")} />;
  if (type.includes('started')) 
    return <Play className={cn(iconClass, "text-blue-400")} />;
  if (type.includes('created')) 
    return <Plus className={cn(iconClass, "text-purple-400")} />;
  if (type.includes('killed')) 
    return <Skull className={cn(iconClass, "text-red-500")} />;
  if (type.includes('paused')) 
    return <Pause className={cn(iconClass, "text-amber-400")} />;
  if (type.includes('heartbeat')) 
    return <Clock className={cn(iconClass, "text-slate-500")} />;
  if (type.includes('warning')) 
    return <AlertCircle className={cn(iconClass, "text-amber-400")} />;
  
  return <Activity className={cn(iconClass, "text-slate-400")} />;
}

function getEventColor(type: string): string {
  if (type.includes('error') || type.includes('failed') || type.includes('killed')) 
    return 'text-red-400';
  if (type.includes('completed')) 
    return 'text-emerald-400';
  if (type.includes('started')) 
    return 'text-blue-400';
  if (type.includes('created')) 
    return 'text-purple-400';
  if (type.includes('paused')) 
    return 'text-amber-400';
  if (type.includes('warning') || type.includes('critical')) 
    return 'text-amber-400';
  return 'text-slate-400';
}

function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function getEventTypeShortName(type: string): string {
  const parts = type.split('.');
  return parts[parts.length - 1].replace(/_/g, ' ');
}

export default EventFeed;
