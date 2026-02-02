# Dash Orchestrator v3 - Technical Implementation Guide

**Version:** 3.0  
**Last Updated:** 2026-02-02  
**Status:** Specification Ready for Implementation  

---

## 1. Architecture Overview

### 1.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DASH ORCHESTRATOR v3                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Terminal   │    │   Terminal   │    │   Terminal   │                   │
│  │   (User 1)   │    │   (User 2)   │    │   (User N)   │                   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                    ┌────────▼────────┐                                      │
│                    │  OpenTUI Layer  │  ← Terminal UI (React Ink-based)    │
│                    │   Dashboard     │                                      │
│                    └────────┬────────┘                                      │
│                             │                                               │
│  ┌──────────────────────────┼──────────────────────────────────┐           │
│  │                         │                                  │           │
│  │  ┌──────────────────────▼──────────────────────┐           │           │
│  │  │           Express API Layer                  │           │           │
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────┐  │           │           │
│  │  │  │   REST     │  │ WebSocket  │  │  Auth  │  │           │           │
│  │  │  │   Routes   │  │  /events   │  │Midware │  │           │           │
│  │  │  └────────────┘  └────────────┘  └────────┘  │           │           │
│  │  └──────────────────────┬──────────────────────┘           │           │
│  │                         │                                  │           │
│  │  ┌──────────────────────▼──────────────────────┐           │           │
│  │  │          Business Logic Layer                │           │           │
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────┐  │           │           │
│  │  │  │   Swarm    │  │   Agent    │  │ Event  │  │           │           │
│  │  │  │  Service   │  │  Service   │  │ Bus    │  │           │           │
│  │  │  └────────────┘  └────────────┘  └────────┘  │           │           │
│  │  └──────────────────────┬──────────────────────┘           │           │
│  │                         │                                  │           │
│  │  ┌──────────────────────▼──────────────────────┐           │           │
│  │  │           Data Access Layer                  │           │           │
│  │  │  ┌────────────┐  ┌──────────────────────┐   │           │           │
│  │  │  │   SQLite   │  │   Repository         │   │           │           │
│  │  │  │   Driver   │  │   Pattern            │   │           │           │
│  │  │  └────────────┘  └──────────────────────┘   │           │           │
│  │  └──────────────────────┬──────────────────────┘           │           │
│  │                         │                                  │           │
│  └─────────────────────────┼──────────────────────────────────┘           │
│                            │                                               │
│  ┌─────────────────────────▼──────────────────────────────────┐           │
│  │                     SQLite Database                         │           │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │           │
│  │  │  swarms  │  │  agents  │  │  events  │  │ metrics  │    │           │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │           │
│  └──────────────────────────────┬─────────────────────────────┘           │
│                                 │                                           │
│                                 ▼                                           │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │                        OpenClaw Gateway                       │          │
│  │     (Spawns agents, manages lifecycle, executes commands)     │          │
│  └──────────────────────────────────────────────────────────────┘          │
│                                 │                                           │
│                                 ▼                                           │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │                     Agent Swarms (External)                   │          │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │          │
│  │  │ Agent 1│ │ Agent 2│ │ Agent 3│ │ Agent 4│ │ Agent N│      │          │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘      │          │
│  └──────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow

#### 1.2.1 Swarm Creation Flow
```
User Input (CLI/UI)
       │
       ▼
┌───────────────┐
│  OpenTUI      │ ──Renders form, validates input
│  Dashboard    │
└───────┬───────┘
        │ HTTP POST /api/swarm
        ▼
┌───────────────┐
│  Express      │ ──Route handler, auth middleware
│  API Layer    │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  SwarmService │ ──Business logic, validation
│  (.create)    │
└───────┬───────┘
        │ Acquire mutex lock
        ▼
┌───────────────┐
│  Repository   │ ──Persist to SQLite
│  (SwarmRepo)  │
└───────┬───────┘
        │ INSERT INTO swarms...
        ▼
┌───────────────┐
│   SQLite      │ ──Atomic transaction
│  Database     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  EventBus     │ ──Emit 'swarm:created'
│  (publish)    │
└───────┬───────┘
        │
        ├───► WebSocket broadcasts to clients
        │
        ▼
┌───────────────┐
│  OpenClaw     │ ──Spawn subagent processes
│  Gateway      │
└───────────────┘
```

#### 1.2.2 Agent Kill Flow
```
User Action (Kill Button)
       │
       ▼
┌───────────────┐
│  OpenTUI      │ ──Confirmation dialog
│  Dashboard    │
└───────┬───────┘
        │ HTTP DELETE /api/agents/:id
        ▼
┌───────────────┐
│  Express      │ ──Route handler
│  API Layer    │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  AgentService │ ──Check permissions, state
│  (.terminate) │
└───────┬───────┘
        │ Acquire swarm mutex
        ▼
┌───────────────┐
│  Repository   │ ──Update status to 'killing'
│  (AgentRepo)  │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  OpenClaw     │ ──Execute kill command
│  Gateway      │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  EventBus     │ ──Emit 'agent:killed'
│  (publish)    │
└───────┬───────┘
        │
        ├───► WebSocket broadcast
        │
        ▼
┌───────────────┐
│  OpenTUI      │ ──Update grid, show notification
│  Dashboard    │
└───────────────┘
```

### 1.3 Component Interactions

| Component | Communicates With | Protocol | Purpose |
|-----------|-------------------|----------|---------|
| OpenTUI Dashboard | Express API | HTTP/WebSocket | User interface, real-time updates |
| Express API | SQLite | SQL/TypedSQL | Data persistence |
| Express API | EventBus | In-memory | Internal event propagation |
| Express API | OpenClaw Gateway | HTTP/Exec | Agent lifecycle management |
| EventBus | WebSocket Manager | In-memory | Push updates to clients |
| SwarmService | Repository Layer | Method calls | Data access abstraction |
| Repository | SQLite | SQL | CRUD operations |

### 1.4 Technology Stack Summary

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| UI | OpenTUI (React Ink) | ^0.1.0 | Terminal-based dashboard |
| API Server | Express.js | ^4.18.0 | REST API & WebSocket upgrade |
| Database | SQLite3 | ^5.1.0 | Embedded relational database |
| Concurrency | async-mutex | ^0.4.0 | Per-swarm mutex locks |
| Validation | Zod | ^3.22.0 | Schema validation |
| WebSocket | ws | ^8.14.0 | Real-time bidirectional comms |
| Process Mgmt | OpenClaw Gateway | Latest | Subagent orchestration |

---

## 2. OpenTUI Implementation Details

### 2.1 Component Architecture

OpenTUI is a React-based terminal UI framework (built on Ink). Components are functional React components that render to terminal output.

### 2.2 AgentGrid Component

```typescript
// src/dashboard/components/AgentGrid.tsx

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error' | 'killing';
  swarmId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
  cpuUsage?: number;
  memoryUsage?: number;
  taskProgress?: number;
}

export interface AgentGridProps {
  /** Array of agents to display */
  agents: Agent[];
  /** Currently selected agent ID (controlled) */
  selectedId?: string;
  /** Callback when agent is selected */
  onSelect: (id: string) => void;
  /** Callback when kill action triggered */
  onKill: (id: string) => Promise<void>;
  /** Optional: filter by status */
  statusFilter?: Agent['status'][];
  /** Maximum items to display before scrolling */
  maxDisplay?: number;
  /** Enable keyboard shortcuts */
  enableKeyboardNav?: boolean;
}

// =============================================================================
// STATUS CONFIGURATION
// =============================================================================

const STATUS_CONFIG: Record<Agent['status'], { color: string; symbol: string }> = {
  idle: { color: 'gray', symbol: '○' },
  running: { color: 'green', symbol: '●' },
  completed: { color: 'blue', symbol: '✓' },
  error: { color: 'red', symbol: '✗' },
  killing: { color: 'yellow', symbol: '◐' },
};

// =============================================================================
// COMPONENT IMPLEMENTATION
// =============================================================================

export const AgentGrid: React.FC<AgentGridProps> = ({
  agents,
  selectedId,
  onSelect,
  onKill,
  statusFilter,
  maxDisplay = 20,
  enableKeyboardNav = true,
}) => {
  const [internalSelection, setInternalSelection] = useState<string>('');
  const [killConfirmId, setKillConfirmId] = useState<string | null>(null);
  
  // Use controlled or uncontrolled selection
  const currentSelection = selectedId ?? internalSelection;
  
  // Filter agents if status filter provided
  const filteredAgents = statusFilter
    ? agents.filter(a => statusFilter.includes(a.status))
    : agents;
  
  // Sort: running first, then by creation date
  const sortedAgents = [...filteredAgents].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (a.status !== 'running' && b.status === 'running') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  
  // Keyboard navigation
  useInput((input, key) => {
    if (!enableKeyboardNav) return;
    
    const currentIndex = sortedAgents.findIndex(a => a.id === currentSelection);
    
    if (key.upArrow && currentIndex > 0) {
      const newId = sortedAgents[currentIndex - 1].id;
      setInternalSelection(newId);
      onSelect(newId);
    }
    
    if (key.downArrow && currentIndex < sortedAgents.length - 1) {
      const newId = sortedAgents[currentIndex + 1].id;
      setInternalSelection(newId);
      onSelect(newId);
    }
    
    // Kill shortcut: 'k' key
    if (input === 'k' && currentSelection) {
      setKillConfirmId(currentSelection);
    }
    
    // Confirm kill: 'y' when in confirm mode
    if (input === 'y' && killConfirmId) {
      handleKill(killConfirmId);
    }
    
    // Cancel kill: 'n' or Escape
    if ((input === 'n' || key.escape) && killConfirmId) {
      setKillConfirmId(null);
    }
  });
  
  const handleKill = async (agentId: string) => {
    setKillConfirmId(null);
    await onKill(agentId);
  };
  
  // Render agent row
  const renderAgentRow = (agent: Agent, isSelected: boolean) => {
    const status = STATUS_CONFIG[agent.status];
    const bgColor = isSelected ? 'blue' : undefined;
    
    return (
      <Box key={agent.id} flexDirection="row" bgColor={bgColor}>
        <Box width={3}>
          <Text color={status.color}>{status.symbol}</Text>
        </Box>
        <Box width={20}>
          <Text wrap="truncate">{agent.name}</Text>
        </Box>
        <Box width={12}>
          <Text color={status.color}>{agent.status}</Text>
        </Box>
        <Box width={16}>
          <Text>{formatDuration(agent.createdAt)}</Text>
        </Box>
        {agent.cpuUsage !== undefined && (
          <Box width={10}>
            <Text>{agent.cpuUsage.toFixed(1)}% CPU</Text>
          </Box>
        )}
        {agent.taskProgress !== undefined && (
          <Box width={12}>
            <Text>{renderProgressBar(agent.taskProgress)}</Text>
          </Box>
        )}
      </Box>
    );
  };
  
  if (sortedAgents.length === 0) {
    return (
      <Box padding={1}>
        <Text color="gray">No agents to display</Text>
      </Box>
    );
  }
  
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box flexDirection="row" borderStyle="single" paddingBottom={1}>
        <Box width={3}><Text bold>St</Text></Box>
        <Box width={20}><Text bold>Name</Text></Box>
        <Box width={12}><Text bold>Status</Text></Box>
        <Box width={16}><Text bold>Runtime</Text></Box>
        <Box width={10}><Text bold>CPU</Text></Box>
        <Box width={12}><Text bold>Progress</Text></Box>
      </Box>
      
      {/* Agent List */}
      <Box flexDirection="column" height={Math.min(sortedAgents.length, maxDisplay)}>
        {sortedAgents.map(agent => 
          renderAgentRow(agent, agent.id === currentSelection)
        )}
      </Box>
      
      {/* Kill Confirmation Modal */}
      {killConfirmId && (
        <Box marginTop={1} borderStyle="double" borderColor="red" padding={1}>
          <Text color="red">
            ⚠️  Kill agent {killConfirmId}? [y/n]
          </Text>
        </Box>
      )}
      
      {/* Footer instructions */}
      <Box marginTop={1}>
        <Text color="gray">
          ↑↓ Navigate | k Kill | Enter Select | q Quit
        </Text>
      </Box>
    </Box>
  );
};

// =============================================================================
// UTILITIES
// =============================================================================

function formatDuration(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function renderProgressBar(progress: number, width: number = 10): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${progress}%`;
}

export default AgentGrid;
```

### 2.3 EventStream Component

```typescript
// src/dashboard/components/EventStream.tsx

import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useStdout } from 'ink';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type EventLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type EventCategory = 'agent' | 'swarm' | 'system' | 'task' | 'api';

export interface Event {
  id: string;
  timestamp: Date;
  level: EventLevel;
  category: EventCategory;
  source: string;          // e.g., agent ID or "system"
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;  // For tracing related events
}

export interface EventFilter {
  levels?: EventLevel[];
  categories?: EventCategory[];
  sources?: string[];
  since?: Date;
  until?: Date;
  searchTerm?: string;
}

export interface EventStreamProps {
  /** Events to display */
  events: Event[];
  /** Optional filter configuration */
  filter?: EventFilter;
  /** Maximum lines to display (scroll buffer) */
  maxLines: number;
  /** Auto-scroll to bottom on new events */
  autoScroll?: boolean;
  /** Show timestamp */
  showTimestamp?: boolean;
  /** Show source column */
  showSource?: boolean;
  /** Compact mode (single line per event) */
  compact?: boolean;
  /** Enable search/filter input */
  enableFiltering?: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const LEVEL_COLORS: Record<EventLevel, string> = {
  debug: 'gray',
  info: 'cyan',
  warn: 'yellow',
  error: 'red',
  fatal: 'magenta',
};

const CATEGORY_COLORS: Record<EventCategory, string> = {
  agent: 'green',
  swarm: 'blue',
  system: 'gray',
  task: 'yellow',
  api: 'cyan',
};

const LEVEL_SYMBOLS: Record<EventLevel, string> = {
  debug: '◆',
  info: '●',
  warn: '▲',
  error: '■',
  fatal: '◉',
};

// =============================================================================
// COMPONENT IMPLEMENTATION
// =============================================================================

export const EventStream: React.FC<EventStreamProps> = ({
  events,
  filter,
  maxLines,
  autoScroll = true,
  showTimestamp = true,
  showSource = true,
  compact = false,
  enableFiltering = false,
}) => {
  const [filterInput, setFilterInput] = useState('');
  const scrollRef = useRef<number>(0);
  const { stdout } = useStdout();
  
  // Apply filters
  const filteredEvents = events.filter(event => {
    if (!filter) return true;
    
    if (filter.levels && !filter.levels.includes(event.level)) return false;
    if (filter.categories && !filter.categories.includes(event.category)) return false;
    if (filter.sources && !filter.sources.includes(event.source)) return false;
    if (filter.since && new Date(event.timestamp) < filter.since) return false;
    if (filter.until && new Date(event.timestamp) > filter.until) return false;
    if (filter.searchTerm && !event.message.toLowerCase().includes(filter.searchTerm.toLowerCase())) return false;
    
    return true;
  });
  
  // Sort by timestamp (newest first for display, but we reverse for scrolling)
  const sortedEvents = [...filteredEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  // Limit to maxLines
  const displayEvents = sortedEvents.slice(-maxLines);
  
  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && displayEvents.length > 0) {
      scrollRef.current = displayEvents.length;
    }
  }, [displayEvents.length, autoScroll]);
  
  const renderEvent = (event: Event, index: number) => {
    const levelColor = LEVEL_COLORS[event.level];
    const categoryColor = CATEGORY_COLORS[event.category];
    const symbol = LEVEL_SYMBOLS[event.level];
    
    if (compact) {
      return (
        <Box key={event.id} flexDirection="row">
          {showTimestamp && (
            <Box width={12}>
              <Text color="gray">{formatTime(event.timestamp)}</Text>
            </Box>
          )}
          <Box width={2}>
            <Text color={levelColor}>{symbol}</Text>
          </Box>
          <Box width={8}>
            <Text color={categoryColor}>{event.category}</Text>
          </Box>
          {showSource && (
            <Box width={20}>
              <Text wrap="truncate" color="gray">{event.source}</Text>
            </Box>
          )}
          <Box flexGrow={1}>
            <Text>{event.message}</Text>
          </Box>
        </Box>
      );
    }
    
    // Expanded view
    return (
      <Box 
        key={event.id} 
        flexDirection="column" 
        borderStyle="single" 
        padding={1}
        marginBottom={1}
      >
        <Box flexDirection="row">
          <Text color={levelColor}>{symbol} </Text>
          <Text bold>{event.message}</Text>
        </Box>
        <Box flexDirection="row" marginTop={1}>
          <Text color="gray">Time: </Text>
          <Text>{formatDateTime(event.timestamp)}</Text>
          <Text color="gray"> | Level: </Text>
          <Text color={levelColor}>{event.level}</Text>
          <Text color="gray"> | Category: </Text>
          <Text color={categoryColor}>{event.category}</Text>
          <Text color="gray"> | Source: </Text>
          <Text>{event.source}</Text>
        </Box>
        {event.correlationId && (
          <Box>
            <Text color="gray">Trace: {event.correlationId}</Text>
          </Box>
        )}
        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <Box marginTop={1}>
            <Text color="gray">Metadata: {JSON.stringify(event.metadata)}</Text>
          </Box>
        )}
      </Box>
    );
  };
  
  return (
    <Box flexDirection="column" height={maxLines + 2}>
      {/* Header */}
      <Box flexDirection="row" borderStyle="single" paddingBottom={1}>
        {showTimestamp && <Box width={12}><Text bold>Time</Text></Box>}
        <Box width={2}><Text bold> </Text></Box>
        <Box width={8}><Text bold>Type</Text></Box>
        {showSource && <Box width={20}><Text bold>Source</Text></Box>}
        <Box flexGrow={1}><Text bold>Message</Text></Box>
      </Box>
      
      {/* Event List */}
      <Box flexDirection="column" flexGrow={1}>
        {displayEvents.length === 0 ? (
          <Text color="gray" italic>No events to display</Text>
        ) : (
          displayEvents.map((event, idx) => renderEvent(event, idx))
        )}
      </Box>
      
      {/* Status Bar */}
      <Box flexDirection="row" borderStyle="single" marginTop={1}>
        <Text color="gray">
          {filteredEvents.length} events | Showing {displayEvents.length} | 
          {autoScroll ? ' Auto-scroll ON' : ' Auto-scroll OFF'}
        </Text>
      </Box>
    </Box>
  );
};

// =============================================================================
// UTILITIES
// =============================================================================

function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDateTime(date: Date): string {
  const d = new Date(date);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export default EventStream;
```

### 2.4 BudgetPanel Component

```typescript
// src/dashboard/components/BudgetPanel.tsx

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { BarChart, BarItem } from 'ink-bar-chart';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface BudgetMetrics {
  // Token usage
  tokensInput: number;
  tokensOutput: number;
  tokensTotal: number;
  tokensLimit: number;
  
  // Cost tracking
  costSession: number;      // Current session cost
  costTotal: number;        // Total cost (all time)
  costLimit: number;        // Budget limit
  currency: string;         // USD, EUR, etc.
  
  // API calls
  apiCallsTotal: number;
  apiCallsLimit: number;
  
  // Time tracking
  sessionDuration: number;  // Seconds
}

export interface BudgetPanelProps {
  metrics: BudgetMetrics;
  showDetails?: boolean;
  alertThreshold?: number;  // Percentage (0-100) to show warnings
}

// =============================================================================
// COMPONENT IMPLEMENTATION
// =============================================================================

export const BudgetPanel: React.FC<BudgetPanelProps> = ({
  metrics,
  showDetails = true,
  alertThreshold = 80,
}) => {
  const tokenPercent = (metrics.tokensTotal / metrics.tokensLimit) * 100;
  const costPercent = (metrics.costTotal / metrics.costLimit) * 100;
  const apiPercent = (metrics.apiCallsTotal / metrics.apiCallsLimit) * 100;
  
  const isTokenWarning = tokenPercent >= alertThreshold;
  const isCostWarning = costPercent >= alertThreshold;
  const isApiWarning = apiPercent >= alertThreshold;
  
  const formatCurrency = (amount: number, currency: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };
  
  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };
  
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${mins}m ${secs}s`;
  };
  
  const renderProgressBar = (percent: number, width: number = 20): string => {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };
  
  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold underline>Budget & Usage</Text>
      
      {/* Token Usage */}
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text>Tokens: </Text>
          <Text color={isTokenWarning ? 'red' : 'green'}>
            {formatNumber(metrics.tokensTotal)} / {formatNumber(metrics.tokensLimit)}
          </Text>
          <Text> ({tokenPercent.toFixed(1)}%)</Text>
        </Box>
        <Text color={isTokenWarning ? 'red' : 'cyan'}>
          {renderProgressBar(tokenPercent)}
        </Text>
        {showDetails && (
          <Box flexDirection="row" marginLeft={2}>
            <Text color="gray">
              In: {formatNumber(metrics.tokensInput)} | 
              Out: {formatNumber(metrics.tokensOutput)}
            </Text>
          </Box>
        )}
      </Box>
      
      {/* Cost Tracking */}
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text>Cost: </Text>
          <Text color={isCostWarning ? 'red' : 'green'}>
            {formatCurrency(metrics.costTotal, metrics.currency)} / 
            {formatCurrency(metrics.costLimit, metrics.currency)}
          </Text>
          <Text> ({costPercent.toFixed(1)}%)</Text>
        </Box>
        <Text color={isCostWarning ? 'red' : 'cyan'}>
          {renderProgressBar(costPercent)}
        </Text>
        {showDetails && (
          <Box flexDirection="row" marginLeft={2}>
            <Text color="gray">
              Session: {formatCurrency(metrics.costSession, metrics.currency)}
            </Text>
          </Box>
        )}
      </Box>
      
      {/* API Calls */}
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text>API Calls: </Text>
          <Text color={isApiWarning ? 'red' : 'green'}>
            {formatNumber(metrics.apiCallsTotal)} / {formatNumber(metrics.apiCallsLimit)}
          </Text>
          <Text> ({apiPercent.toFixed(1)}%)</Text>
        </Box>
        <Text color={isApiWarning ? 'red' : 'cyan'}>
          {renderProgressBar(apiPercent)}
        </Text>
      </Box>
      
      {/* Session Duration */}
      <Box marginTop={1}>
        <Text color="gray">
          Session Duration: {formatDuration(metrics.sessionDuration)}
        </Text>
      </Box>
      
      {/* Alerts */}
      {(isTokenWarning || isCostWarning || isApiWarning) && (
        <Box marginTop={1} borderStyle="single" borderColor="red" padding={1}>
          <Text color="red" bold>⚠️ BUDGET WARNING</Text>
          {isTokenWarning && <Text color="red">  • Token usage at {tokenPercent.toFixed(0)}%</Text>}
          {isCostWarning && <Text color="red">  • Cost at {costPercent.toFixed(0)}%</Text>}
          {isApiWarning && <Text color="red">  • API calls at {apiPercent.toFixed(0)}%</Text>}
        </Box>
      )}
    </Box>
  );
};

export default BudgetPanel;
```

### 2.5 useAgents Hook

```typescript
// src/dashboard/hooks/useAgents.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Agent } from '../components/AgentGrid';
import type { Event } from '../components/EventStream';

// =============================================================================
// TYPES
// =============================================================================

interface UseAgentsOptions {
  refreshInterval?: number;
  webSocketUrl?: string;
  autoConnect?: boolean;
}

interface UseAgentsReturn {
  agents: Agent[];
  events: Event[];
  selectedAgent: Agent | null;
  isConnected: boolean;
  error: Error | null;
  selectAgent: (id: string) => void;
  killAgent: (id: string) => Promise<void>;
  killSwarm: (swarmId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export const useAgents = (options: UseAgentsOptions = {}): UseAgentsReturn => {
  const {
    refreshInterval = 1000,
    webSocketUrl = 'ws://localhost:7373/events',
    autoConnect = true,
  } = options;
  
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventBufferRef = useRef<Event[]>([]);
  
  // =============================================================================
  // DATA FETCHING
  // =============================================================================
  
  const fetchAgents = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:7373/api/agents');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setAgents(data.agents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch agents'));
    }
  }, []);
  
  const fetchEvents = useCallback(async (limit = 100) => {
    try {
      const response = await fetch(`http://localhost:7373/api/events?limit=${limit}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setEvents(data.events);
    } catch (err) {
      // Non-critical, don't set error state
      console.error('Failed to fetch events:', err);
    }
  }, []);
  
  // =============================================================================
  // WEBSOCKET CONNECTION
  // =============================================================================
  
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    const ws = new WebSocket(webSocketUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'agent:updated':
          case 'agent:created':
            setAgents(prev => {
              const exists = prev.find(a => a.id === data.agent.id);
              if (exists) {
                return prev.map(a => a.id === data.agent.id ? data.agent : a);
              }
              return [...prev, data.agent];
            });
            break;
            
          case 'agent:killed':
          case 'agent:completed':
            setAgents(prev => prev.filter(a => a.id !== data.agentId));
            break;
            
          case 'event:new':
            eventBufferRef.current.push(data.event);
            // Batch event updates
            if (eventBufferRef.current.length >= 10) {
              flushEventBuffer();
            }
            break;
            
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };
    
    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect with exponential backoff
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };
    
    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError(new Error('WebSocket connection failed'));
    };
  }, [webSocketUrl]);
  
  const flushEventBuffer = useCallback(() => {
    if (eventBufferRef.current.length === 0) return;
    
    setEvents(prev => {
      const combined = [...prev, ...eventBufferRef.current];
      // Keep only last 1000 events
      return combined.slice(-1000);
    });
    eventBufferRef.current = [];
  }, []);
  
  // =============================================================================
  // ACTIONS
  // =============================================================================
  
  const selectAgent = useCallback((id: string) => {
    setSelectedAgentId(id);
  }, []);
  
  const killAgent = useCallback(async (id: string) => {
    try {
      const response = await fetch(`http://localhost:7373/api/agents/${id}/kill`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to kill agent');
      }
      
      // Optimistic update
      setAgents(prev => prev.map(a => 
        a.id === id ? { ...a, status: 'killing' } : a
      ));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Kill failed');
    }
  }, []);
  
  const killSwarm = useCallback(async (swarmId: string) => {
    try {
      const response = await fetch(`http://localhost:7373/api/swarms/${swarmId}/kill`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to kill swarm');
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('Swarm kill failed');
    }
  }, []);
  
  const refresh = useCallback(async () => {
    await Promise.all([fetchAgents(), fetchEvents()]);
  }, [fetchAgents, fetchEvents]);
  
  // =============================================================================
  // EFFECTS
  // =============================================================================
  
  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  // Polling fallback (if WebSocket fails)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected) {
        fetchAgents();
      }
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [isConnected, refreshInterval, fetchAgents]);
  
  // WebSocket connection
  useEffect(() => {
    if (autoConnect) {
      connectWebSocket();
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [autoConnect, connectWebSocket]);
  
  // Periodic event buffer flush
  useEffect(() => {
    const interval = setInterval(flushEventBuffer, 100);
    return () => clearInterval(interval);
  }, [flushEventBuffer]);
  
  // =============================================================================
  // DERIVED STATE
  // =============================================================================
  
  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null;
  
  return {
    agents,
    events,
    selectedAgent,
    isConnected,
    error,
    selectAgent,
    killAgent,
    killSwarm,
    refresh,
  };
};

export default useAgents;
```

---

## 3. Express API Implementation

### 3.1 Server Setup

```typescript
// src/api/server.ts

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '../config';
import { setupRoutes } from './routes';
import { setupWebSocket } from './websocket';
import { authMiddleware, rateLimitMiddleware, errorHandler } from './middleware';
import { logger } from '../utils/logger';
import { eventBus } from '../utils/eventBus';

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/events' });

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API server
}));

// CORS
app.use(cors({
  origin: config.api.cors.origins,
  credentials: true,
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// =============================================================================
// ROUTES
// =============================================================================

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (with auth & rate limiting)
app.use('/api', rateLimitMiddleware);
app.use('/api', authMiddleware);
setupRoutes(app);

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.use(errorHandler);

// =============================================================================
// WEBSOCKET SETUP
// =============================================================================

setupWebSocket(wss);

// Forward events to WebSocket clients
eventBus.on('*', (event) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  });
});

// =============================================================================
// SERVER START
// =============================================================================

export function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server.listen(config.api.port, config.api.host, () => {
      logger.info(`Dash API server running on http://${config.api.host}:${config.api.port}`);
      resolve();
    });
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    wss.close(() => {
      server.close(() => {
        logger.info('Server stopped');
        resolve();
      });
    });
  });
}

export { app, server, wss };
```

### 3.2 Route Handlers

```typescript
// src/api/routes/swarm.ts

import { Router } from 'express';
import { z } from 'zod';
import { SwarmService } from '../../services/SwarmService';
import { validateRequest } from '../middleware/validation';
import { ApiError } from '../../errors/ApiError';

const router = Router();
const swarmService = new SwarmService();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const CreateSwarmSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  agentCount: z.number().int().min(1).max(100).default(1),
  config: z.record(z.unknown()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  timeout: z.number().int().min(1000).max(3600000).optional(), // ms
});

const UpdateSwarmSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['running', 'paused']).optional(),
});

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * POST /api/swarm
 * Create a new swarm with specified agents
 */
router.post('/', validateRequest(CreateSwarmSchema), async (req, res, next) => {
  try {
    const swarm = await swarmService.create(req.body);
    res.status(201).json({
      success: true,
      data: swarm,
      message: `Swarm "${swarm.name}" created with ${swarm.agentCount} agents`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/swarm
 * List all swarms with optional filtering
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    
    const swarms = await swarmService.list({
      status: status as string,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
    
    res.json({
      success: true,
      data: swarms,
      meta: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        total: await swarmService.count({ status: status as string }),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/swarm/:id
 * Get detailed information about a specific swarm
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const swarm = await swarmService.getById(id);
    
    if (!swarm) {
      throw new ApiError(404, 'Swarm not found', { swarmId: id });
    }
    
    res.json({
      success: true,
      data: swarm,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/swarm/:id
 * Update swarm properties
 */
router.patch('/:id', validateRequest(UpdateSwarmSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const swarm = await swarmService.update(id, req.body);
    
    res.json({
      success: true,
      data: swarm,
      message: 'Swarm updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/swarm/:id
 * Terminate and delete a swarm
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force = 'false' } = req.query;
    
    await swarmService.delete(id, { force: force === 'true' });
    
    res.json({
      success: true,
      message: 'Swarm terminated and deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/swarm/:id/kill
 * Kill all agents in a swarm
 */
router.post('/:id/kill', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { signal = 'SIGTERM', timeout = '5000' } = req.body;
    
    const result = await swarmService.killAll(id, {
      signal,
      timeout: parseInt(timeout, 10),
    });
    
    res.json({
      success: true,
      data: result,
      message: `Killed ${result.killed} agents in swarm`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/swarm/:id/agents
 * Get all agents belonging to a swarm
 */
router.get('/:id/agents', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agents = await swarmService.getAgents(id);
    
    res.json({
      success: true,
      data: agents,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/swarm/:id/stats
 * Get swarm statistics and metrics
 */
router.get('/:id/stats', async (req, res, next) => {
  try {
    const { id } = req.params;
    const stats = await swarmService.getStats(id);
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
```

```typescript
// src/api/routes/agents.ts

import { Router } from 'express';
import { z } from 'zod';
import { AgentService } from '../../services/AgentService';
import { validateRequest } from '../middleware/validation';
import { ApiError } from '../../errors/ApiError';

const router = Router();
const agentService = new AgentService();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const UpdateAgentSchema = z.object({
  status: z.enum(['idle', 'running', 'paused']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * GET /api/agents
 * List all agents with optional filtering
 */
router.get('/', async (req, res, next) => {
  try {
    const { 
      status, 
      swarmId, 
      limit = '50', 
      offset = '0',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;
    
    const agents = await agentService.list({
      status: status as string,
      swarmId: swarmId as string,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    });
    
    res.json({
      success: true,
      data: agents,
      meta: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        total: await agentService.count({ status: status as string, swarmId: swarmId as string }),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agents/:id
 * Get detailed information about a specific agent
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await agentService.getById(id);
    
    if (!agent) {
      throw new ApiError(404, 'Agent not found', { agentId: id });
    }
    
    res.json({
      success: true,
      data: agent,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/agents/:id
 * Update agent properties
 */
router.patch('/:id', validateRequest(UpdateAgentSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await agentService.update(id, req.body);
    
    res.json({
      success: true,
      data: agent,
      message: 'Agent updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agents/:id/kill
 * Kill a specific agent
 */
router.post('/:id/kill', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { signal = 'SIGTERM', timeout = 5000 } = req.body;
    
    const result = await agentService.kill(id, { signal, timeout });
    
    res.json({
      success: true,
      data: result,
      message: 'Agent killed successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agents/:id/logs
 * Get agent logs
 */
router.get('/:id/logs', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { lines = '100', since } = req.query;
    
    const logs = await agentService.getLogs(id, {
      lines: parseInt(lines as string, 10),
      since: since ? new Date(since as string) : undefined,
    });
    
    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agents/:id/metrics
 * Get agent performance metrics
 */
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const { id } = req.params;
    const metrics = await agentService.getMetrics(id);
    
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
```

### 3.3 Middleware

```typescript
// src/api/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { logger } from '../../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'admin' | 'user';
      };
    }
  }
}

/**
 * Authentication middleware
 * Validates API tokens or session cookies
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip auth for health endpoint
    if (req.path === '/health') {
      return next();
    }
    
    // Development mode: bypass auth
    if (config.env === 'development' && config.api.bypassAuth) {
      req.user = { id: 'dev-user', role: 'admin' };
      return next();
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authorization header',
        },
      });
      return;
    }
    
    const [scheme, token] = authHeader.split(' ');
    
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid authorization format. Use: Bearer <token>',
        },
      });
      return;
    }
    
    // Validate token (implement your token validation logic)
    const user = await validateToken(token);
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
      });
      return;
    }
    
    req.user = user;
    logger.debug('Authenticated request', { userId: user.id, path: req.path });
    
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication check failed',
      },
    });
  }
}

async function validateToken(token: string): Promise<{ id: string; role: string } | null> {
  // Implement your token validation (JWT, database lookup, etc.)
  // This is a placeholder implementation
  if (token === config.api.adminToken) {
    return { id: 'admin', role: 'admin' };
  }
  
  // TODO: Implement proper token validation
  return { id: 'anonymous', role: 'user' };
}
```

```typescript
// src/api/middleware/rateLimit.ts

import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { logger } from '../../utils/logger';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiting middleware
 * Tracks requests per IP/key and enforces limits
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = config.api.rateLimit;
  
  // Use user ID if authenticated, otherwise IP
  const key = req.user?.id || req.ip || 'anonymous';
  const now = Date.now();
  
  const entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return next();
  }
  
  if (entry.count >= maxRequests) {
    logger.warn('Rate limit exceeded', { key, count: entry.count });
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      },
    });
    return;
  }
  
  entry.count++;
  
  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
  
  next();
}
```

```typescript
// src/api/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../errors/ApiError';
import { logger } from '../../utils/logger';

/**
 * Global error handler middleware
 * Catches all errors and formats consistent responses
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  });
  
  // Handle known API errors
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }
  
  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: (err as any).errors,
      },
    });
    return;
  }
  
  // Handle SQLite errors
  if (err.message?.includes('SQLITE_CONSTRAINT')) {
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Resource conflict - possible duplicate',
      },
    });
    return;
  }
  
  // Default: internal server error
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.env === 'production' 
        ? 'An unexpected error occurred' 
        : err.message,
    },
  });
}
```

---

## 4. SQLite Schema (SQL DDL)

### 4.1 Full Database Schema

```sql
-- src/storage/migrations/001_initial.sql

-- =============================================================================
-- DASH ORCHESTRATOR v3 - SQLite Schema
-- =============================================================================

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- =============================================================================
-- SWARMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS swarms (
    id TEXT PRIMARY KEY,                                    -- UUID v4
    name TEXT NOT NULL,                                     -- Human-readable name
    description TEXT,                                       -- Optional description
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'paused', 'completed', 'failed', 'killing')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
    
    -- Configuration
    config_json TEXT,                                       -- JSON blob of swarm config
    
    -- Lifecycle timestamps
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,                                    -- When first agent started
    completed_at DATETIME,                                  -- When all agents done/failed
    
    -- Resource tracking
    agent_count INTEGER NOT NULL DEFAULT 0,                 -- Target number of agents
    completed_count INTEGER NOT NULL DEFAULT 0,             -- How many completed
    failed_count INTEGER NOT NULL DEFAULT 0,                -- How many failed
    
    -- Budget tracking
    token_input INTEGER NOT NULL DEFAULT 0,                 -- Input tokens consumed
    token_output INTEGER NOT NULL DEFAULT 0,                -- Output tokens consumed
    cost_total REAL NOT NULL DEFAULT 0.0,                   -- Total cost in USD
    
    -- Metadata
    created_by TEXT,                                        -- User/API key that created
    metadata_json TEXT,                                     -- Additional JSON metadata
    
    -- Indexes will be created separately below
    CHECK (agent_count >= 0),
    CHECK (completed_count >= 0),
    CHECK (failed_count >= 0)
);

-- =============================================================================
-- AGENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,                                    -- UUID v4
    swarm_id TEXT NOT NULL,
    name TEXT NOT NULL,                                     -- Auto-generated or custom
    
    -- Status tracking
    status TEXT NOT NULL CHECK(status IN ('pending', 'idle', 'running', 'paused', 'completed', 'failed', 'killing', 'killed')),
    exit_code INTEGER,                                      -- Process exit code if completed
    
    -- OpenClaw integration
    subagent_session_id TEXT,                               -- OpenClaw session ID
    pid INTEGER,                                            -- Process ID
    
    -- Task information
    task_description TEXT,                                  -- What this agent is working on
    current_action TEXT,                                    -- Current action/phase
    progress_percent INTEGER CHECK(progress_percent BETWEEN 0 AND 100),
    
    -- Lifecycle timestamps
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,                                    -- When agent process started
    completed_at DATETIME,                                  -- When finished
    last_heartbeat_at DATETIME,                             -- Last health check
    
    -- Resource tracking
    token_input INTEGER NOT NULL DEFAULT 0,
    token_output INTEGER NOT NULL DEFAULT 0,
    cost_total REAL NOT NULL DEFAULT 0.0,
    api_calls INTEGER NOT NULL DEFAULT 0,                   -- Number of API calls made
    
    -- Performance metrics
    cpu_percent REAL,                                       -- Current CPU usage
    memory_mb REAL,                                         -- Current memory usage
    
    -- Results
    result_json TEXT,                                       -- JSON result data
    error_message TEXT,                                     -- Error if failed
    
    -- Metadata
    metadata_json TEXT,
    
    FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE CASCADE
);

-- =============================================================================
-- EVENTS TABLE (Event Log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,                          -- UUID for idempotency
    
    -- Event classification
    level TEXT NOT NULL CHECK(level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    category TEXT NOT NULL CHECK(category IN ('agent', 'swarm', 'system', 'task', 'api')),
    
    -- Source
    source_type TEXT NOT NULL CHECK(source_type IN ('swarm', 'agent', 'system')),
    source_id TEXT,                                         -- ID of the source entity
    
    -- Content
    message TEXT NOT NULL,
    metadata_json TEXT,                                     -- Additional event data
    
    -- Correlation
    correlation_id TEXT,                                    -- For tracing related events
    parent_event_id TEXT,                                   -- Hierarchical events
    
    -- Timestamp
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints (optional - events kept for audit)
    FOREIGN KEY (source_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- =============================================================================
-- METRICS TABLE (Time-series metrics)
-- =============================================================================

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('swarm', 'agent', 'system')),
    entity_id TEXT,                                         -- NULL for system metrics
    
    -- Metric data
    metric_name TEXT NOT NULL,                              -- e.g., 'cpu_percent', 'tokens_per_minute'
    metric_value REAL NOT NULL,
    metric_unit TEXT,                                       -- e.g., 'percent', 'count', 'usd'
    
    -- Timestamp (with millisecond precision)
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    labels_json TEXT                                        -- Additional labels/dimensions
);

-- =============================================================================
-- AGENT_LOGS TABLE (Agent stdout/stderr)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    
    -- Log data
    stream TEXT NOT NULL CHECK(stream IN ('stdout', 'stderr', 'system')),
    content TEXT NOT NULL,
    
    -- Timestamp
    logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Line number for ordering
    line_number INTEGER NOT NULL,
    
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Swarm indexes
CREATE INDEX IF NOT EXISTS idx_swarm_status ON swarms(status);
CREATE INDEX IF NOT EXISTS idx_swarm_priority ON swarms(priority);
CREATE INDEX IF NOT EXISTS idx_swarm_created_at ON swarms(created_at);
CREATE INDEX IF NOT EXISTS idx_swarm_status_created ON swarms(status, created_at);

-- Agent indexes
CREATE INDEX IF NOT EXISTS idx_agent_swarm_id ON agents(swarm_id);
CREATE INDEX IF NOT EXISTS idx_agent_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_created_at ON agents(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_swarm_status ON agents(swarm_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeat ON agents(last_heartbeat_at);

-- Event indexes
CREATE INDEX IF NOT EXISTS idx_event_level ON events(level);
CREATE INDEX IF NOT EXISTS idx_event_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_event_source ON events(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_event_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_event_correlation ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_event_category_created ON events(category, created_at);

-- Metrics indexes (for time-series queries)
CREATE INDEX IF NOT EXISTS idx_metrics_entity ON metrics(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_metrics_entity_recorded ON metrics(entity_type, entity_id, recorded_at);

-- Agent logs indexes
CREATE INDEX IF NOT EXISTS idx_logs_agent_id ON agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_logs_logged_at ON agent_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_logs_agent_stream ON agent_logs(agent_id, stream);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active swarms view
CREATE VIEW IF NOT EXISTS active_swarms AS
SELECT 
    s.*,
    (SELECT COUNT(*) FROM agents WHERE swarm_id = s.id AND status = 'running') as running_agents,
    (SELECT COUNT(*) FROM agents WHERE swarm_id = s.id) as total_agents
FROM swarms s
WHERE s.status IN ('running', 'paused', 'pending');

-- Agent summary view
CREATE VIEW IF NOT EXISTS agent_summary AS
SELECT 
    a.*,
    s.name as swarm_name,
    s.status as swarm_status,
    CASE 
        WHEN a.completed_at IS NOT NULL 
        THEN ROUND((julianday(a.completed_at) - julianday(a.started_at)) * 86400, 2)
        ELSE NULL 
    END as duration_seconds
FROM agents a
JOIN swarms s ON a.swarm_id = s.id;

-- Recent errors view
CREATE VIEW IF NOT EXISTS recent_errors AS
SELECT 
    e.*,
    a.name as agent_name,
    s.name as swarm_name
FROM events e
LEFT JOIN agents a ON e.source_id = a.id AND e.source_type = 'agent'
LEFT JOIN swarms s ON a.swarm_id = s.id
WHERE e.level IN ('error', 'fatal')
ORDER BY e.created_at DESC;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update swarm counts when agent status changes
CREATE TRIGGER IF NOT EXISTS update_swarm_counts_on_agent_complete
AFTER UPDATE OF status ON agents
WHEN NEW.status = 'completed' AND OLD.status != 'completed'
BEGIN
    UPDATE swarms 
    SET completed_count = completed_count + 1
    WHERE id = NEW.swarm_id;
END;

CREATE TRIGGER IF NOT EXISTS update_swarm_counts_on_agent_fail
AFTER UPDATE OF status ON agents
WHEN NEW.status = 'failed' AND OLD.status != 'failed'
BEGIN
    UPDATE swarms 
    SET failed_count = failed_count + 1
    WHERE id = NEW.swarm_id;
END;

-- Auto-complete swarm when all agents done
CREATE TRIGGER IF NOT EXISTS auto_complete_swarm
AFTER UPDATE OF completed_count, failed_count ON swarms
WHEN (NEW.completed_count + NEW.failed_count) >= NEW.agent_count
  AND NEW.status IN ('running', 'paused')
BEGIN
    UPDATE swarms 
    SET 
        status = CASE WHEN NEW.failed_count > 0 THEN 'failed' ELSE 'completed' END,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- =============================================================================
-- FULL-TEXT SEARCH (for logs)
-- =============================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS agent_logs_fts USING fts5(
    content,
    agent_id UNINDEXED,
    logged_at UNINDEXED,
    content_rowid=rowid
);

-- Sync triggers for FTS
CREATE TRIGGER IF NOT EXISTS logs_fts_insert AFTER INSERT ON agent_logs BEGIN
    INSERT INTO agent_logs_fts(rowid, content, agent_id, logged_at)
    VALUES (NEW.id, NEW.content, NEW.agent_id, NEW.logged_at);
END;

CREATE TRIGGER IF NOT EXISTS logs_fts_delete AFTER DELETE ON agent_logs BEGIN
    INSERT INTO agent_logs_fts(agent_logs_fts, rowid, content, agent_id, logged_at)
    VALUES ('delete', OLD.id, OLD.content, OLD.agent_id, OLD.logged_at);
END;
```

### 4.2 Repository Layer

```typescript
// src/storage/repositories/SwarmRepository.ts

import { Database } from 'sqlite3';
import { promisify } from 'util';
import { Swarm, CreateSwarmInput, UpdateSwarmInput, SwarmListFilters } from '../../types';
import { generateUUID } from '../../utils/uuid';

export class SwarmRepository {
  private db: Database;
  private run: (sql: string, params?: unknown[]) => Promise<unknown>;
  private get: (sql: string, params?: unknown[]) => Promise<unknown>;
  private all: (sql: string, params?: unknown[]) => Promise<unknown[]>;

  constructor(db: Database) {
    this.db = db;
    this.run = promisify(db.run.bind(db));
    this.get = promisify(db.get.bind(db));
    this.all = promisify(db.all.bind(db));
  }

  async create(input: CreateSwarmInput): Promise<Swarm> {
    const id = generateUUID();
    const now = new Date().toISOString();
    
    await this.run(
      `INSERT INTO swarms (id, name, description, status, priority, config_json, agent_count, created_at, created_by, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.description || null,
        'pending',
        input.priority || 'normal',
        input.config ? JSON.stringify(input.config) : null,
        input.agentCount,
        now,
        input.createdBy || null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    
    return this.getById(id) as Promise<Swarm>;
  }

  async getById(id: string): Promise<Swarm | null> {
    const row = await this.get(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM agents WHERE swarm_id = s.id AND status = 'running') as running_agents,
        (SELECT COUNT(*) FROM agents WHERE swarm_id = s.id) as total_agents
       FROM swarms s WHERE s.id = ?`,
      [id]
    );
    
    if (!row) return null;
    return this.mapRowToSwarm(row);
  }

  async list(filters: SwarmListFilters = {}): Promise<Swarm[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    if (filters.priority) {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    
    const rows = await this.all(
      `SELECT s.*,
        (SELECT COUNT(*) FROM agents WHERE swarm_id = s.id AND status = 'running') as running_agents,
        (SELECT COUNT(*) FROM agents WHERE swarm_id = s.id) as total_agents
       FROM swarms s
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    return rows.map(row => this.mapRowToSwarm(row));
  }

  async update(id: string, input: UpdateSwarmInput): Promise<Swarm> {
    const updates: string[] = [];
    const params: unknown[] = [];
    
    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name);
    }
    
    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description);
    }
    
    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    
    if (updates.length === 0) {
      return this.getById(id) as Promise<Swarm>;
    }
    
    params.push(id);
    
    await this.run(
      `UPDATE swarms SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    return this.getById(id) as Promise<Swarm>;
  }

  async delete(id: string): Promise<void> {
    await this.run('DELETE FROM swarms WHERE id = ?', [id]);
  }

  async count(filters: { status?: string } = {}): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const result = await this.get(
      `SELECT COUNT(*) as count FROM swarms ${whereClause}`,
      params
    );
    
    return (result as { count: number }).count;
  }

  private mapRowToSwarm(row: Record<string, unknown>): Swarm {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      status: row.status as Swarm['status'],
      priority: row.priority as Swarm['priority'],
      config: row.config_json ? JSON.parse(row.config_json as string) : undefined,
      createdAt: new Date(row.created_at as string),
      startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      agentCount: row.agent_count as number,
      completedCount: row.completed_count as number,
      failedCount: row.failed_count as number,
      runningAgents: row.running_agents as number,
      totalAgents: row.total_agents as number,
      tokenInput: row.token_input as number,
      tokenOutput: row.token_output as number,
      costTotal: row.cost_total as number,
      createdBy: row.created_by as string | undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : undefined,
    };
  }
}
```

```typescript
// src/storage/repositories/AgentRepository.ts

import { Database } from 'sqlite3';
import { promisify } from 'util';
import { Agent, CreateAgentInput, UpdateAgentInput, AgentListFilters } from '../../types';
import { generateUUID } from '../../utils/uuid';

export class AgentRepository {
  private db: Database;
  private run: (sql: string, params?: unknown[]) => Promise<unknown>;
  private get: (sql: string, params?: unknown[]) => Promise<unknown>;
  private all: (sql: string, params?: unknown[]) => Promise<unknown[]>;

  constructor(db: Database) {
    this.db = db;
    this.run = promisify(db.run.bind(db));
    this.get = promisify(db.get.bind(db));
    this.all = promisify(db.all.bind(db));
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const id = generateUUID();
    const now = new Date().toISOString();
    
    await this.run(
      `INSERT INTO agents (id, swarm_id, name, status, task_description, created_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.swarmId,
        input.name,
        'pending',
        input.taskDescription || null,
        now,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    
    return this.getById(id) as Promise<Agent>;
  }

  async createMany(inputs: CreateAgentInput[]): Promise<Agent[]> {
    // Use transaction for batch insert
    const agents: Agent[] = [];
    
    await this.run('BEGIN TRANSACTION');
    
    try {
      for (const input of inputs) {
        const agent = await this.create(input);
        agents.push(agent);
      }
      await this.run('COMMIT');
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
    
    return agents;
  }

  async getById(id: string): Promise<Agent | null> {
    const row = await this.get(
      `SELECT a.*, s.name as swarm_name, s.status as swarm_status
       FROM agents a
       JOIN swarms s ON a.swarm_id = s.id
       WHERE a.id = ?`,
      [id]
    );
    
    if (!row) return null;
    return this.mapRowToAgent(row);
  }

  async list(filters: AgentListFilters = {}): Promise<Agent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    
    if (filters.swarmId) {
      conditions.push('a.swarm_id = ?');
      params.push(filters.swarmId);
    }
    
    if (filters.status) {
      conditions.push('a.status = ?');
      params.push(filters.status);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    const rows = await this.all(
      `SELECT a.*, s.name as swarm_name, s.status as swarm_status
       FROM agents a
       JOIN swarms s ON a.swarm_id = s.id
       ${whereClause}
       ORDER BY a.${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    return rows.map(row => this.mapRowToAgent(row));
  }

  async update(id: string, input: UpdateAgentInput): Promise<Agent> {
    const updates: string[] = [];
    const params: unknown[] = [];
    
    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
      
      // Auto-set timestamps based on status
      if (input.status === 'running' && updates.length === 1) {
        updates.push('started_at = COALESCE(started_at, CURRENT_TIMESTAMP)');
      }
      if (['completed', 'failed', 'killed'].includes(input.status)) {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      }
    }
    
    if (input.progressPercent !== undefined) {
      updates.push('progress_percent = ?');
      params.push(input.progressPercent);
    }
    
    if (input.currentAction !== undefined) {
      updates.push('current_action = ?');
      params.push(input.currentAction);
    }
    
    if (input.pid !== undefined) {
      updates.push('pid = ?');
      params.push(input.pid);
    }
    
    if (input.subagentSessionId !== undefined) {
      updates.push('subagent_session_id = ?');
      params.push(input.subagentSessionId);
    }
    
    if (updates.length === 0) {
      return this.getById(id) as Promise<Agent>;
    }
    
    params.push(id);
    
    await this.run(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    return this.getById(id) as Promise<Agent>;
  }

  async updateHeartbeat(id: string): Promise<void> {
    await this.run(
      'UPDATE agents SET last_heartbeat_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  async incrementMetrics(id: string, metrics: { tokensIn?: number; tokensOut?: number; cost?: number; apiCalls?: number }): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];
    
    if (metrics.tokensIn) {
      updates.push('token_input = token_input + ?');
      params.push(metrics.tokensIn);
    }
    if (metrics.tokensOut) {
      updates.push('token_output = token_output + ?');
      params.push(metrics.tokensOut);
    }
    if (metrics.cost) {
      updates.push('cost_total = cost_total + ?');
      params.push(metrics.cost);
    }
    if (metrics.apiCalls) {
      updates.push('api_calls = api_calls + ?');
      params.push(metrics.apiCalls);
    }
    
    if (updates.length === 0) return;
    
    params.push(id);
    
    await this.run(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  async delete(id: string): Promise<void> {
    await this.run('DELETE FROM agents WHERE id = ?', [id]);
  }

  async count(filters: { swarmId?: string; status?: string } = {}): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    
    if (filters.swarmId) {
      conditions.push('swarm_id = ?');
      params.push(filters.swarmId);
    }
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const result = await this.get(
      `SELECT COUNT(*) as count FROM agents ${whereClause}`,
      params
    );
    
    return (result as { count: number }).count;
  }

  async getStaleAgents(thresholdMinutes: number = 5): Promise<Agent[]> {
    const rows = await this.all(
      `SELECT a.*, s.name as swarm_name, s.status as swarm_status
       FROM agents a
       JOIN swarms s ON a.swarm_id = s.id
       WHERE a.status = 'running'
       AND (a.last_heartbeat_at IS NULL 
            OR datetime(a.last_heartbeat_at) < datetime('now', '-${thresholdMinutes} minutes'))`,
    );
    
    return rows.map(row => this.mapRowToAgent(row));
  }

  private mapRowToAgent(row: Record<string, unknown>): Agent {
    return {
      id: row.id as string,
      swarmId: row.swarm_id as string,
      name: row.name as string,
      status: row.status as Agent['status'],
      exitCode: row.exit_code as number | undefined,
      subagentSessionId: row.subagent_session_id as string | undefined,
      pid: row.pid as number | undefined,
      taskDescription: row.task_description as string | undefined,
      currentAction: row.current_action as string | undefined,
      progressPercent: row.progress_percent as number | undefined,
      createdAt: new Date(row.created_at as string),
      startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at as string) : undefined,
      tokenInput: row.token_input as number,
      tokenOutput: row.token_output as number,
      costTotal: row.cost_total as number,
      apiCalls: row.api_calls as number,
      cpuPercent: row.cpu_percent as number | undefined,
      memoryMb: row.memory_mb as number | undefined,
      result: row.result_json ? JSON.parse(row.result_json as string) : undefined,
      errorMessage: row.error_message as string | undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : undefined,
      swarmName: row.swarm_name as string,
      swarmStatus: row.swarm_status as string,
    };
  }
}
```

---

## 5. Race Condition Fixes

### 5.1 Problem Analysis

Race conditions can occur in Dash Orchestrator when:

1. **Concurrent swarm operations**: Two requests try to modify the same swarm simultaneously
2. **Agent kill during spawn**: Killing agents while new ones are being created
3. **Status updates**: Database status getting out of sync with actual process state
4. **Budget tracking**: Multiple agents updating cost/token counts simultaneously

### 5.2 Solution: Per-Swarm Mutex with async-mutex

```typescript
// src/utils/mutex.ts

import { Mutex } from 'async-mutex';

/**
 * Per-swarm mutex manager
 * Ensures only one operation per swarm at a time
 */
export class SwarmMutexManager {
  private mutexes = new Map<string, Mutex>();
  
  /**
   * Get or create a mutex for a swarm
   */
  getMutex(swarmId: string): Mutex {
    if (!this.mutexes.has(swarmId)) {
      this.mutexes.set(swarmId, new Mutex());
    }
    return this.mutexes.get(swarmId)!;
  }
  
  /**
   * Execute a function with exclusive access to a swarm
   */
  async withLock<T>(swarmId: string, fn: () => Promise<T>): Promise<T> {
    const mutex = this.getMutex(swarmId);
    return mutex.runExclusive(fn);
  }
  
  /**
   * Check if a swarm is currently locked
   */
  isLocked(swarmId: string): boolean {
    const mutex = this.mutexes.get(swarmId);
    return mutex ? mutex.isLocked() : false;
  }
  
  /**
   * Clean up mutex for completed swarms (memory management)
   */
  cleanup(swarmId: string): void {
    const mutex = this.mutexes.get(swarmId);
    if (mutex && !mutex.isLocked()) {
      this.mutexes.delete(swarmId);
    }
  }
}

// Global singleton
export const swarmMutex = new SwarmMutexManager();
```

### 5.3 Implementation in Services

```typescript
// src/services/SwarmService.ts

import { SwarmRepository } from '../storage/repositories/SwarmRepository';
import { AgentRepository } from '../storage/repositories/AgentRepository';
import { swarmMutex } from '../utils/mutex';
import { eventBus } from '../utils/eventBus';
import { openClawGateway } from '../utils/openclaw';
import { ApiError } from '../errors/ApiError';
import type { Swarm, CreateSwarmInput, UpdateSwarmInput } from '../types';

export class SwarmService {
  private swarmRepo: SwarmRepository;
  private agentRepo: AgentRepository;
  
  constructor() {
    this.swarmRepo = new SwarmRepository(db);
    this.agentRepo = new AgentRepository(db);
  }
  
  /**
   * Create a new swarm with agents
   * Uses mutex to prevent concurrent creation conflicts
   */
  async create(input: CreateSwarmInput): Promise<Swarm> {
    // Generate a temporary ID for mutex (will be replaced with actual ID)
    const tempId = `temp-${Date.now()}`;
    
    return swarmMutex.withLock(tempId, async () => {
      // Create swarm record
      const swarm = await this.swarmRepo.create(input);
      
      // Create agents within the same transaction context
      const agentInputs = Array.from({ length: input.agentCount }, (_, i) => ({
        swarmId: swarm.id,
        name: `${input.name}-agent-${i + 1}`,
        taskDescription: input.config?.taskDescription,
        metadata: { index: i + 1 },
      }));
      
      await this.agentRepo.createMany(agentInputs);
      
      // Emit event
      eventBus.emit('swarm:created', { swarm });
      
      // Start agents asynchronously (don't block response)
      this.startSwarmAgents(swarm.id).catch(err => {
        logger.error('Failed to start swarm agents', { swarmId: swarm.id, error: err });
      });
      
      return swarm;
    });
  }
  
  /**
   * Kill all agents in a swarm
   * Critical: Must use mutex to prevent race with agent spawning
   */
  async killAll(swarmId: string, options: { signal?: string; timeout?: number } = {}): Promise<{ killed: number; failed: number }> {
    return swarmMutex.withLock(swarmId, async () => {
      const swarm = await this.swarmRepo.getById(swarmId);
      
      if (!swarm) {
        throw new ApiError(404, 'Swarm not found');
      }
      
      if (swarm.status === 'killing') {
        throw new ApiError(409, 'Swarm is already being killed');
      }
      
      // Update status to killing (prevents new agents from starting)
      await this.swarmRepo.update(swarmId, { status: 'killing' });
      
      // Get all running agents
      const agents = await this.agentRepo.list({ 
        swarmId, 
        status: 'running',
        limit: 1000,
      });
      
      let killed = 0;
      let failed = 0;
      
      // Kill all agents in parallel
      const killPromises = agents.map(async (agent) => {
        try {
          await openClawGateway.killAgent(agent.id, {
            signal: options.signal || 'SIGTERM',
            timeout: options.timeout || 5000,
          });
          
          await this.agentRepo.update(agent.id, { status: 'killed' });
          killed++;
          
          eventBus.emit('agent:killed', { agentId: agent.id, swarmId });
        } catch (error) {
          logger.error('Failed to kill agent', { agentId: agent.id, error });
          failed++;
        }
      });
      
      await Promise.all(killPromises);
      
      // Update final status
      await this.swarmRepo.update(swarmId, { 
        status: failed > 0 ? 'failed' : 'completed',
      });
      
      eventBus.emit('swarm:killed', { swarmId, killed, failed });
      
      return { killed, failed };
    });
  }
  
  /**
   * Start all pending agents for a swarm
   * Private method - should only be called within mutex
   */
  private async startSwarmAgents(swarmId: string): Promise<void> {
    return swarmMutex.withLock(swarmId, async () => {
      const swarm = await this.swarmRepo.getById(swarmId);
      
      if (!swarm || swarm.status !== 'pending') {
        return; // Swarm was deleted or already started
      }
      
      // Update swarm to running
      await this.swarmRepo.update(swarmId, { status: 'running' });
      
      // Get pending agents
      const agents = await this.agentRepo.list({ 
        swarmId, 
        status: 'pending',
        limit: 1000,
      });
      
      // Start agents with concurrency limit
      const CONCURRENCY = 5;
      for (let i = 0; i < agents.length; i += CONCURRENCY) {
        const batch = agents.slice(i, i + CONCURRENCY);
        
        await Promise.all(batch.map(async (agent) => {
          try {
            // Check if swarm is still running (might have been killed)
            const currentSwarm = await this.swarmRepo.getById(swarmId);
            if (currentSwarm?.status !== 'running') {
              return; // Don't start if swarm not running
            }
            
            await this.agentRepo.update(agent.id, { status: 'running' });
            
            const sessionId = await openClawGateway.spawnAgent({
              agentId: agent.id,
              swarmId,
              task: agent.taskDescription,
              config: swarm.config,
            });
            
            await this.agentRepo.update(agent.id, { 
              subagentSessionId: sessionId,
              status: 'running',
            });
            
            eventBus.emit('agent:started', { agentId: agent.id, swarmId });
          } catch (error) {
            logger.error('Failed to start agent', { agentId: agent.id, error });
            await this.agentRepo.update(agent.id, { 
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }));
      }
    });
  }
  
  /**
   * Update swarm with optimistic locking
   */
  async update(swarmId: string, input: UpdateSwarmInput): Promise<Swarm> {
    return swarmMutex.withLock(swarmId, async () => {
      const swarm = await this.swarmRepo.getById(swarmId);
      
      if (!swarm) {
        throw new ApiError(404, 'Swarm not found');
      }
      
      // Validate state transitions
      if (input.status) {
        const validTransitions: Record<string, string[]> = {
          pending: ['running', 'killing'],
          running: ['paused', 'killing'],
          paused: ['running', 'killing'],
          killing: [],
          completed: [],
          failed: [],
        };
        
        if (!validTransitions[swarm.status].includes(input.status)) {
          throw new ApiError(400, `Cannot transition from ${swarm.status} to ${input.status}`);
        }
      }
      
      const updated = await this.swarmRepo.update(swarmId, input);
      eventBus.emit('swarm:updated', { swarm: updated });
      
      return updated;
    });
  }
}
```

### 5.4 Database-Level Protection

```typescript
// src/storage/transaction.ts

import { Database } from 'sqlite3';

/**
 * Execute database operations within a transaction
 * Provides rollback on error
 */
export async function withTransaction<T>(
  db: Database,
  operations: (db: Database) => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      operations(db)
        .then(result => {
          db.run('COMMIT', (err) => {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
            } else {
              resolve(result);
            }
          });
        })
        .catch(error => {
          db.run('ROLLBACK');
          reject(error);
        });
    });
  });
}
```

---

## 6. Real-Time Updates

### 6.1 WebSocket Server Setup

```typescript
// src/api/websocket.ts

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { config } from '../config';

// =============================================================================
// TYPES
// =============================================================================

interface ClientState {
  id: string;
  subscriptions: Set<string>;  // Subscribed event types
  connectedAt: Date;
  lastPingAt: Date;
}

type WebSocketMessage = 
  | { type: 'subscribe'; events: string[] }
  | { type: 'unsubscribe'; events: string[] }
  | { type: 'ping' }
  | { type: 'pong' };

// =============================================================================
// WEBSOCKET MANAGER
// =============================================================================

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientState>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.setupHandlers();
    this.startHeartbeat();
  }
  
  private setupHandlers(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const clientIp = req.socket.remoteAddress;
      
      logger.info('WebSocket client connected', { clientId, clientIp });
      
      // Initialize client state
      this.clients.set(ws, {
        id: clientId,
        subscriptions: new Set(['*']),  // Subscribe to all by default
        connectedAt: new Date(),
        lastPingAt: new Date(),
      });
      
      // Send welcome message
      this.send(ws, {
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString(),
      });
      
      // Handle messages
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });
      
      // Handle close
      ws.on('close', (code, reason) => {
        logger.info('WebSocket client disconnected', { clientId, code, reason });
        this.clients.delete(ws);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket client error', { clientId, error });
      });
    });
  }
  
  private handleMessage(ws: WebSocket, data: Buffer | ArrayBuffer | Buffer[]): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      const client = this.clients.get(ws);
      
      if (!client) return;
      
      switch (message.type) {
        case 'subscribe':
          message.events.forEach(event => client.subscriptions.add(event));
          this.send(ws, { type: 'subscribed', events: Array.from(client.subscriptions) });
          break;
          
        case 'unsubscribe':
          message.events.forEach(event => client.subscriptions.delete(event));
          this.send(ws, { type: 'unsubscribed', events: Array.from(client.subscriptions) });
          break;
          
        case 'ping':
          client.lastPingAt = new Date();
          this.send(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;
          
        case 'pong':
          client.lastPingAt = new Date();
          break;
      }
    } catch (error) {
      this.send(ws, { 
        type: 'error', 
        message: 'Invalid message format',
      });
    }
  }
  
  /**
   * Broadcast event to all connected clients
   */
  broadcast(eventType: string, payload: unknown): void {
    const message = JSON.stringify({
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    });
    
    this.clients.forEach((state, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        // Check if client is subscribed to this event
        if (state.subscriptions.has('*') || state.subscriptions.has(eventType)) {
          ws.send(message);
        }
      }
    });
  }
  
  /**
   * Send message to specific client
   */
  private send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
  
  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = config.websocket.pingTimeout || 30000;
      
      this.clients.forEach((state, ws) => {
        const lastPing = now.getTime() - state.lastPingAt.getTime();
        
        if (lastPing > timeout) {
          logger.warn('Client heartbeat timeout', { clientId: state.id });
          ws.terminate();
          this.clients.delete(ws);
        } else {
          this.send(ws, { type: 'ping' });
        }
      });
    }, config.websocket.pingInterval || 15000);
  }
  
  private generateClientId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getStats(): { connectedClients: number; subscriptions: Record<string, number> } {
    const subscriptions: Record<string, number> = {};
    
    this.clients.forEach((state) => {
      state.subscriptions.forEach((sub) => {
        subscriptions[sub] = (subscriptions[sub] || 0) + 1;
      });
    });
    
    return {
      connectedClients: this.clients.size,
      subscriptions,
    };
  }
  
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function setupWebSocket(wss: WebSocketServer): WebSocketManager {
  wsManager = new WebSocketManager(wss);
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager | null {
  return wsManager;
}

export function broadcast(eventType: string, payload: unknown): void {
  wsManager?.broadcast(eventType, payload);
}
```

### 6.2 Event Bus Integration

```typescript
// src/utils/eventBus.ts

import { EventEmitter } from 'events';
import { broadcast } from '../api/websocket';
import { logger } from './logger';

// =============================================================================
// EVENT DEFINITIONS
// =============================================================================

export interface EventMap {
  'swarm:created': { swarm: unknown };
  'swarm:updated': { swarm: unknown };
  'swarm:killed': { swarmId: string; killed: number; failed: number };
  'swarm:completed': { swarmId: string };
  'swarm:failed': { swarmId: string; error: string };
  
  'agent:created': { agent: unknown };
  'agent:started': { agentId: string; swarmId: string };
  'agent:updated': { agent: unknown };
  'agent:completed': { agentId: string; result: unknown };
  'agent:killed': { agentId: string; swarmId: string };
  'agent:failed': { agentId: string; error: string };
  
  'event:new': { event: unknown };
  
  'budget:threshold': { type: string; current: number; limit: number };
}

type EventName = keyof EventMap;

// =============================================================================
// TYPED EVENT BUS
// =============================================================================

class TypedEventBus {
  private emitter = new EventEmitter();
  
  // Increase max listeners for high-throughput scenarios
  constructor() {
    this.emitter.setMaxListeners(100);
  }
  
  on<K extends EventName>(
    event: K,
    listener: (payload: EventMap[K]) => void
  ): () => void {
    this.emitter.on(event, listener);
    return () => this.off(event, listener);
  }
  
  once<K extends EventName>(
    event: K,
    listener: (payload: EventMap[K]) => void
  ): void {
    this.emitter.once(event, listener);
  }
  
  off<K extends EventName>(
    event: K,
    listener: (payload: EventMap[K]) => void
  ): void {
    this.emitter.off(event, listener);
  }
  
  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    // Log event
    logger.debug(`Event emitted: ${event}`, { payload });
    
    // Emit to local listeners
    this.emitter.emit(event, payload);
    
    // Broadcast to WebSocket clients
    broadcast(event, payload);
    
    // Also emit a catch-all for monitoring
    this.emitter.emit('*', { type: event, payload, timestamp: new Date().toISOString() });
  }
  
  /**
   * Wait for an event with timeout
   */
  waitFor<K extends EventName>(
    event: K,
    timeoutMs: number = 5000,
    filter?: (payload: EventMap[K]) => boolean
  ): Promise<EventMap[K]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off(event, handler);
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeoutMs);
      
      const handler = (payload: EventMap[K]) => {
        if (filter && !filter(payload)) return;
        
        clearTimeout(timeout);
        this.off(event, handler);
        resolve(payload);
      };
      
      this.on(event, handler);
    });
  }
}

export const eventBus = new TypedEventBus();
```

### 6.3 Client Reconnection Handling

```typescript
// src/dashboard/hooks/useWebSocket.ts

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  send: (data: unknown) => void;
  subscribe: (events: string[]) => void;
  unsubscribe: (events: string[]) => void;
  reconnect: () => void;
}

export const useWebSocket = (options: UseWebSocketOptions): UseWebSocketReturn => {
  const {
    url,
    onMessage,
    onConnect,
    onDisconnect,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;
  
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Resubscribe to previous subscriptions
        if (subscriptionsRef.current.size > 0) {
          ws.send(JSON.stringify({
            type: 'subscribe',
            events: Array.from(subscriptionsRef.current),
          }));
        }
        
        onConnect?.();
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        onDisconnect?.();
        
        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = reconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, Math.min(delay, 30000)); // Cap at 30s
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
    }
  }, [url, onMessage, onConnect, onDisconnect, reconnectInterval, maxReconnectAttempts]);
  
  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);
  
  const subscribe = useCallback((events: string[]) => {
    events.forEach(e => subscriptionsRef.current.add(e));
    send({ type: 'subscribe', events });
  }, [send]);
  
  const unsubscribe = useCallback((events: string[]) => {
    events.forEach(e => subscriptionsRef.current.delete(e));
    send({ type: 'unsubscribe', events });
  }, [send]);
  
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    wsRef.current?.close();
    connect();
  }, [connect]);
  
  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);
  
  return {
    isConnected,
    send,
    subscribe,
    unsubscribe,
    reconnect,
  };
};
```

---

## 7. File Structure

```
src/
├── dashboard/
│   ├── components/
│   │   ├── AgentGrid.tsx          # Agent list/grid display
│   │   ├── EventStream.tsx        # Real-time event log
│   │   ├── BudgetPanel.tsx        # Cost/usage metrics
│   │   ├── SwarmList.tsx          # Swarm selector/list
│   │   ├── StatusBar.tsx          # Footer status bar
│   │   ├── KillConfirmModal.tsx   # Kill confirmation dialog
│   │   └── index.ts               # Component exports
│   ├── hooks/
│   │   ├── useAgents.ts           # Agent data management
│   │   ├── useWebSocket.ts        # WebSocket connection
│   │   ├── useSwarm.ts            # Swarm operations
│   │   ├── useEvents.ts           # Event filtering/management
│   │   └── index.ts
│   ├── contexts/
│   │   └── DashboardContext.tsx   # Global dashboard state
│   ├── utils/
│   │   ├── formatters.ts          # Time, currency formatters
│   │   └── keybindings.ts         # Keyboard shortcuts
│   └── Dashboard.tsx              # Main dashboard component
│
├── api/
│   ├── server.ts                  # Express server setup
│   ├── websocket.ts               # WebSocket management
│   ├── routes/
│   │   ├── index.ts               # Route registration
│   │   ├── swarm.ts               # Swarm CRUD endpoints
│   │   ├── agents.ts              # Agent operations endpoints
│   │   ├── events.ts              # Event log endpoints
│   │   └── metrics.ts             # Metrics/stats endpoints
│   └── middleware/
│       ├── auth.ts                # Authentication middleware
│       ├── rateLimit.ts           # Rate limiting
│       ├── errorHandler.ts        # Global error handler
│       ├── validation.ts          # Request validation
│       └── index.ts
│
├── services/
│   ├── SwarmService.ts            # Swarm business logic
│   ├── AgentService.ts            # Agent business logic
│   ├── EventService.ts            # Event processing
│   └── OpenClawService.ts         # OpenClaw integration
│
├── storage/
│   ├── sqlite.ts                  # Database connection
│   ├── migrations/
│   │   ├── 001_initial.sql        # Initial schema
│   │   ├── 002_add_metrics.sql    # Metrics table
│   │   └── migrate.ts             # Migration runner
│   └── repositories/
│       ├── SwarmRepository.ts     # Swarm data access
│       ├── AgentRepository.ts     # Agent data access
│       ├── EventRepository.ts     # Event data access
│       └── index.ts
│
├── utils/
│   ├── mutex.ts                   # Swarm mutex manager
│   ├── eventBus.ts                # Typed event bus
│   ├── logger.ts                  # Structured logging
│   ├── openclaw.ts                # OpenClaw API client
│   ├── uuid.ts                    # UUID generation
│   └── config.ts                  # Configuration loader
│
├── errors/
│   ├── ApiError.ts                # Custom error class
│   └── index.ts
│
├── types/
│   ├── swarm.ts                   # Swarm type definitions
│   ├── agent.ts                   # Agent type definitions
│   ├── event.ts                   # Event type definitions
│   └── index.ts
│
├── cli/
│   ├── commands/
│   │   ├── start.ts               # Start dashboard command
│   │   ├── swarm.ts               # Swarm management commands
│   │   └── agent.ts               # Agent management commands
│   └── index.ts                   # CLI entry point
│
├── config/
│   └── default.yaml               # Default configuration
│
tests/
├── unit/
│   ├── services/
│   ├── repositories/
│   └── utils/
├── integration/
│   ├── api.test.ts
│   └── websocket.test.ts
└── e2e/
    └── dashboard.test.ts

scripts/
├── migrate.sh                     # Database migration script
├── seed.sh                        # Seed test data
└── build.sh                       # Build script

docs/
├── ARCHITECTURE.md
├── API.md
└── DEPLOYMENT.md

package.json
tsconfig.json
docker-compose.yml
README.md
```

---

## 8. Dependencies

### 8.1 package.json

```json
{
  "name": "@openclaw/dash",
  "version": "3.0.0",
  "description": "Dash Orchestrator - Multi-agent swarm management dashboard",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "dev": "tsx watch src/cli/index.ts",
    "build": "tsc",
    "start": "node dist/cli/index.js",
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "db:migrate": "tsx src/storage/migrations/migrate.ts",
    "db:seed": "tsx scripts/seed.ts",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opentui/core": "^0.1.0",
    "@opentui/react": "^0.1.0",
    "async-mutex": "^0.4.0",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "ink": "^4.4.1",
    "ink-bar-chart": "^0.1.0",
    "ink-select-input": "^5.0.0",
    "ink-spinner": "^5.0.0",
    "js-yaml": "^4.1.0",
    "pino": "^8.17.0",
    "pino-pretty": "^10.3.0",
    "react": "^18.2.0",
    "sqlite3": "^5.1.6",
    "ws": "^8.14.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/compression": "^1.7.5",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.43",
    "@types/ws": "^8.5.10",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "eslint": "^8.55.0",
    "supertest": "^6.3.3",
    "tsx": "^4.6.2",
    "typescript": "^5.3.3",
    "vitest": "^1.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 8.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react",
    "types": ["node", "react"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 9. Configuration Schema

### 9.1 config.yaml

```yaml
# Dash Orchestrator v3 Configuration
# Place at ~/.dash/config.yaml or set DASH_CONFIG_PATH

# =============================================================================
# API Server Configuration
# =============================================================================
api:
  # Server bind address
  host: localhost
  port: 7373
  
  # CORS settings
  cors:
    origins:
      - "http://localhost:3000"
      - "http://127.0.0.1:3000"
    credentials: true
  
  # Rate limiting (requests per minute per client)
  rateLimit: 100
  
  # Request timeout (milliseconds)
  timeout: 30000
  
  # Maximum request body size
  maxBodySize: "10mb"
  
  # Development mode settings
  bypassAuth: false  # Set to true to disable auth in development
  adminToken: "dev-token-change-in-production"  # Change this!

# =============================================================================
# WebSocket Configuration
# =============================================================================
websocket:
  # Heartbeat ping interval (milliseconds)
  pingInterval: 15000
  
  # Connection timeout if no pong received (milliseconds)
  pingTimeout: 30000
  
  # Maximum message size (bytes)
  maxMessageSize: 1048576  # 1MB
  
  # Maximum number of connections per IP
  maxConnectionsPerIp: 10

# =============================================================================
# Dashboard Configuration
# =============================================================================
dashboard:
  # Auto-refresh interval for polling fallback (milliseconds)
  refreshRate: 1000
  
  # Maximum agents to display in grid
  maxAgentsDisplay: 100
  
  # Maximum events in stream buffer
  maxEventsBuffer: 1000
  
  # Default event filter
  defaultEventFilter:
    levels:
      - info
      - warn
      - error
      - fatal
  
  # Keyboard shortcuts
  keybindings:
    quit: "q"
    refresh: "r"
    kill: "k"
    select: "enter"
    up: "up"
    down: "down"
    filter: "/"

# =============================================================================
# Storage Configuration
# =============================================================================
storage:
  type: sqlite
  
  # Database file path
  path: ~/.dash/db.sqlite
  
  # Connection pool size (SQLite uses single connection, but good for future)
  poolSize: 1
  
  # Enable WAL mode for better concurrency
  walMode: true
  
  # Backup settings
  backup:
    enabled: true
    interval: "24h"  # Backup interval
    retention: 7     # Keep 7 backups
    path: ~/.dash/backups/

# =============================================================================
# OpenClaw Integration
# =============================================================================
openclaw:
  # Gateway URL
  gatewayUrl: "http://localhost:7372"
  
  # API key for gateway authentication
  apiKey: null  # Set via DASH_OPENCLAW_API_KEY env var
  
  # Default agent configuration
  defaultAgentConfig:
    timeout: 300000  # 5 minutes
    maxRetries: 3
    
  # Resource limits per agent
  resourceLimits:
    maxTokensPerRequest: 100000
    maxCostPerAgent: 10.00  # USD

# =============================================================================
# Logging Configuration
# =============================================================================
logging:
  # Log level: debug, info, warn, error, fatal
  level: info
  
  # Log format: json, pretty
  format: pretty
  
  # Log to file
  file:
    enabled: true
    path: ~/.dash/logs/dash.log
    maxSize: "10mb"
    maxFiles: 5
  
  # Log to console
  console: true

# =============================================================================
# Budget & Alerts
# =============================================================================
budget:
  # Global budget limit (USD)
  globalLimit: 100.00
  
  # Alert thresholds (percentage of budget)
  alertThresholds:
    warning: 80
    critical: 95
  
  # Notification channels
  notifications:
    - type: console
    # - type: webhook
    #   url: https://hooks.slack.com/...

# =============================================================================
# Security
# =============================================================================
security:
  # Session timeout (milliseconds)
  sessionTimeout: 3600000  # 1 hour
  
  # Require HTTPS in production
  requireHttps: true
  
  # Allowed hosts
  allowedHosts:
    - localhost
    - 127.0.0.1
```

### 9.2 Configuration Loader

```typescript
// src/utils/config.ts

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import YAML from 'js-yaml';
import { z } from 'zod';

// =============================================================================
# Configuration Schema (Zod)
# =============================================================================

const ConfigSchema = z.object({
  api: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().min(1).max(65535).default(7373),
    cors: z.object({
      origins: z.array(z.string()).default(['http://localhost:3000']),
      credentials: z.boolean().default(true),
    }).default({}),
    rateLimit: z.number().int().positive().default(100),
    timeout: z.number().int().positive().default(30000),
    maxBodySize: z.string().default('10mb'),
    bypassAuth: z.boolean().default(false),
    adminToken: z.string().optional(),
  }).default({}),
  
  websocket: z.object({
    pingInterval: z.number().int().positive().default(15000),
    pingTimeout: z.number().int().positive().default(30000),
    maxMessageSize: z.number().int().positive().default(1048576),
    maxConnectionsPerIp: z.number().int().positive().default(10),
  }).default({}),
  
  dashboard: z.object({
    refreshRate: z.number().int().positive().default(1000),
    maxAgentsDisplay: z.number().int().positive().default(100),
    maxEventsBuffer: z.number().int().positive().default(1000),
  }).default({}),
  
  storage: z.object({
    type: z.literal('sqlite').default('sqlite'),
    path: z.string().default(resolve(homedir(), '.dash', 'db.sqlite')),
    walMode: z.boolean().default(true),
  }).default({}),
  
  openclaw: z.object({
    gatewayUrl: z.string().url().default('http://localhost:7372'),
    apiKey: z.string().optional(),
  }).default({}),
  
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    format: z.enum(['json', 'pretty']).default('pretty'),
    console: z.boolean().default(true),
  }).default({}),
  
  budget: z.object({
    globalLimit: z.number().positive().default(100),
    alertThresholds: z.object({
      warning: z.number().min(0).max(100).default(80),
      critical: z.number().min(0).max(100).default(95),
    }).default({}),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

// =============================================================================
// CONFIG LOADING
// =============================================================================

const CONFIG_PATHS = [
  process.env.DASH_CONFIG_PATH,
  resolve(process.cwd(), 'config.yaml'),
  resolve(homedir(), '.dash', 'config.yaml'),
  '/etc/dash/config.yaml',
].filter(Boolean) as string[];

function loadConfigFile(): unknown {
  for (const path of CONFIG_PATHS) {
    try {
      const content = readFileSync(path, 'utf-8');
      return YAML.load(content);
    } catch {
      continue;  // File doesn't exist or can't be read
    }
  }
  return {};  // Return empty object if no config found
}

function applyEnvOverrides(config: Config): Config {
  // Allow environment variables to override config
  if (process.env.DASH_API_PORT) {
    config.api.port = parseInt(process.env.DASH_API_PORT, 10);
  }
  if (process.env.DASH_STORAGE_PATH) {
    config.storage.path = process.env.DASH_STORAGE_PATH;
  }
  if (process.env.DASH_OPENCLAW_API_KEY) {
    config.openclaw.apiKey = process.env.DASH_OPENCLAW_API_KEY;
  }
  if (process.env.DASH_LOG_LEVEL) {
    config.logging.level = process.env.DASH_LOG_LEVEL as Config['logging']['level'];
  }
  
  return config;
}

// Load and validate config
const rawConfig = loadConfigFile();
const parsedConfig = ConfigSchema.parse(rawConfig);
export const config = applyEnvOverrides(parsedConfig);
export const env = process.env.NODE_ENV || 'development';
```

---

## 10. Error Handling Strategy

### 10.1 Custom Error Classes

```typescript
// src/errors/ApiError.ts

/**
 * Base API Error class
 * Provides structured error information for API responses
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;
  
  constructor(
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
    isOperational = true
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = this.getErrorCode(statusCode);
    this.details = details;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
  
  private getErrorCode(statusCode: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[statusCode] || 'UNKNOWN_ERROR';
  }
  
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
    };
  }
}

/**
 * Validation Error - invalid input data
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, message, details);
    this.name =