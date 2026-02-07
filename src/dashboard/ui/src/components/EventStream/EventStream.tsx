/**
 * EventStream Component
 * 
 * Live scrolling feed of system events
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEventsRealtime } from '../../hooks/useWebSocket';
import { AgentEvent, EventType } from '../../types';
import { 
  Pause, 
  Play, 
  Trash2, 
  Filter, 
  Search,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  X
} from 'lucide-react';

interface EventRowProps {
  event: AgentEvent;
  style: React.CSSProperties;
}

const eventTypeConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  [EventType.AGENT_CREATED]: {
    icon: <Info className="w-4 h-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10'
  },
  [EventType.AGENT_STARTED]: {
    icon: <Info className="w-4 h-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10'
  },
  [EventType.AGENT_COMPLETED]: {
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-green-400',
    bg: 'bg-green-400/10'
  },
  [EventType.AGENT_FAILED]: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-400',
    bg: 'bg-red-400/10'
  },
  [EventType.AGENT_KILLED]: {
    icon: <X className="w-4 h-4" />,
    color: 'text-gray-400',
    bg: 'bg-gray-400/10'
  },
  [EventType.AGENT_PAUSED]: {
    icon: <Pause className="w-4 h-4" />,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10'
  },
  [EventType.AGENT_RESUMED]: {
    icon: <Play className="w-4 h-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10'
  },
  [EventType.SWARM_CREATED]: {
    icon: <Info className="w-4 h-4" />,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10'
  },
  [EventType.SWARM_COMPLETED]: {
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-green-400',
    bg: 'bg-green-400/10'
  },
  [EventType.SWARM_FAILED]: {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-red-400',
    bg: 'bg-red-400/10'
  },
  [EventType.SWARM_BUDGET_WARNING]: {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10'
  },
  [EventType.SWARM_BUDGET_CRITICAL]: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-400',
    bg: 'bg-red-400/10'
  },
  [EventType.TASK_CREATED]: {
    icon: <Info className="w-4 h-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10'
  },
  [EventType.TASK_COMPLETED]: {
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-green-400',
    bg: 'bg-green-400/10'
  },
  [EventType.TASK_FAILED]: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-400',
    bg: 'bg-red-400/10'
  },
  [EventType.SYSTEM_ERROR]: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-400',
    bg: 'bg-red-400/10'
  }
};

const getEventConfig = (type: string) => {
  return eventTypeConfig[type] || {
    icon: <Info className="w-4 h-4" />,
    color: 'text-gray-400',
    bg: 'bg-gray-400/10'
  };
};

const EventRow: React.FC<EventRowProps> = ({ event, style }) => {
  const config = getEventConfig(event.type);
  const timestamp = new Date(event.timestamp).toLocaleTimeString();
  
  return (
    <div
      style={style}
      className="flex items-start gap-3 p-3 hover:bg-gray-800/50 transition-colors border-b border-gray-800/50"
    >
      <div className={`flex-shrink-0 p-2 rounded-lg ${config.bg} ${config.color}`}>
        {config.icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm font-medium ${config.color}`}>
            {event.type}
          </span>
          <span className="text-xs text-gray-500">{timestamp}</span>
        </div>
        
        {event.agentId && (
          <p className="text-xs text-gray-400 mb-1">
            Agent: <span className="font-mono text-gray-300">{event.agentId.slice(0, 8)}...</span>
          </p>
        )}
        
        {event.swarmId && (
          <p className="text-xs text-gray-400 mb-1">
            Swarm: <span className="font-mono text-gray-300">{event.swarmId.slice(0, 8)}...</span>
          </p>
        )}
        
        {event.payload && Object.keys(event.payload).length > 0 && (
          <p className="text-xs text-gray-500 truncate">
            {JSON.stringify(event.payload).slice(0, 100)}...
          </p>
        )}
      </div>
    </div>
  );
};

interface EventStreamProps {
  maxEvents?: number;
  height?: number;
}

export const EventStream: React.FC<EventStreamProps> = ({ 
  maxEvents = 100,
  height = 500 
}) => {
  const { events, isPaused, togglePause, clearEvents } = useEventsRealtime(maxEvents);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredEvents = React.useMemo(() => {
    let result = events;
    
    if (filter !== 'all') {
      result = result.filter(e => {
        if (filter === 'agent') return e.type.startsWith('agent.');
        if (filter === 'swarm') return e.type.startsWith('swarm.');
        if (filter === 'task') return e.type.startsWith('task.');
        if (filter === 'error') return e.type.includes('error') || e.type.includes('failed');
        return true;
      });
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(e => 
        e.type.toLowerCase().includes(query) ||
        e.agentId?.toLowerCase().includes(query) ||
        e.swarmId?.toLowerCase().includes(query) ||
        JSON.stringify(e.payload).toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [events, filter, searchQuery]);

  const rowVirtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5
  });

  // Auto-scroll to bottom when new events arrive (if not paused)
  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, isPaused]);

  const eventCounts = React.useMemo(() => {
    return {
      all: events.length,
      agent: events.filter(e => e.type.startsWith('agent.')).length,
      swarm: events.filter(e => e.type.startsWith('swarm.')).length,
      task: events.filter(e => e.type.startsWith('task.')).length,
      error: events.filter(e => e.type.includes('error') || e.type.includes('failed')).length
    };
  }, [events]);

  return (
    <div className="event-stream bg-gray-900 rounded-lg overflow-hidden">
      {/* Header Controls */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-100">Event Stream</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={togglePause}
              className={`p-2 rounded-lg transition-colors ${
                isPaused 
                  ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              title={isPaused ? 'Resume stream' : 'Pause stream'}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                showFilters ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              title="Toggle filters"
            >
              <Filter className="w-4 h-4" />
            </button>
            <button
              onClick={clearEvents}
              className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
              title="Clear events"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2">
            {(['all', 'agent', 'swarm', 'task', 'error'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  filter === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {type} ({eventCounts[type]})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Event List */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height }}
      >
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Info className="w-12 h-12 mb-4 opacity-50" />
            <p>No events to display</p>
            {searchQuery && <p className="text-sm mt-2">Try adjusting your search</p>}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative'
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => (
              <EventRow
                key={virtualItem.key}
                event={filteredEvents[virtualItem.index]}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800 flex items-center justify-between text-sm text-gray-500">
        <span>
          {filteredEvents.length} events
          {isPaused && <span className="ml-2 text-yellow-400">(paused)</span>}
        </span>
        <span>Auto-scroll {isPaused ? 'disabled' : 'enabled'}</span>
      </div>
    </div>
  );
};
