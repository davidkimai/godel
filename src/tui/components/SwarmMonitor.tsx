/**
 * Swarm Monitor Component
 * 
 * Displays a live table of active swarms and their agents
 * with real-time status updates.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useSwarmData } from '../hooks/useWebSocket';

export interface SwarmMonitorProps {
  width: number;
  height: number;
}

interface SwarmInfo {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed' | 'idle';
  agents: AgentInfo[];
  createdAt: Date;
  progress: number;
}

interface AgentInfo {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'killed';
  task: string;
  swarmId: string;
  startTime?: Date;
  duration?: number;
}

export function SwarmMonitor({ width, height }: SwarmMonitorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedSwarms, setExpandedSwarms] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'swarms' | 'agents'>('swarms');

  const { swarms, agents, loading, error, refresh } = useSwarmData();

  // Calculate display items
  const displayItems = useMemo(() => {
    const items: Array<{ type: 'swarm' | 'agent'; data: SwarmInfo | AgentInfo }> = [];
    
    for (const swarm of (swarms as unknown as SwarmInfo[])) {
      items.push({ type: 'swarm', data: swarm });
      
      if (expandedSwarms.has(swarm.id)) {
        const swarmAgents = agents.filter(a => a.swarmId === swarm.id);
        for (const agent of swarmAgents) {
          items.push({ type: 'agent', data: agent });
        }
      }
    }
    
    return items;
  }, [swarms, agents, expandedSwarms]);

  // Keyboard navigation
  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    }
    
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(displayItems.length - 1, prev + 1));
    }

    if (key.return) {
      const item = displayItems[selectedIndex];
      if (item?.type === 'swarm') {
        const swarmId = (item.data as SwarmInfo).id;
        setExpandedSwarms(prev => {
          const next = new Set(prev);
          if (next.has(swarmId)) {
            next.delete(swarmId);
          } else {
            next.add(swarmId);
          }
          return next;
        });
      }
    }

    if (input === ' ') {
      // Pause/resume selected item
      const item = displayItems[selectedIndex];
      if (item) {
        // Toggle pause/resume
        console.log('Toggle pause/resume:', item.data.id);
      }
    }

    if (input === 'r' || input === 'R') {
      refresh();
    }

    if (input === 'v') {
      setViewMode(prev => prev === 'swarms' ? 'agents' : 'swarms');
    }
  });

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      active: 'green',
      running: 'green',
      pending: 'yellow',
      paused: 'blue',
      completed: 'cyan',
      failed: 'red',
      killed: 'red',
      idle: 'gray'
    };
    return colors[status] || 'white';
  };

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      active: '●',
      running: '▶',
      pending: '⏳',
      paused: '⏸',
      completed: '✓',
      failed: '✗',
      killed: '☠',
      idle: '○'
    };
    return icons[status] || '?';
  };

  const formatDuration = (ms?: number): string => {
    if (!ms) return '--';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m${seconds % 60}s`;
    return `${seconds}s`;
  };

  const renderSwarmRow = (swarm: SwarmInfo, index: number, isSelected: boolean) => {
    const isExpanded = expandedSwarms.has(swarm.id);
    const agentCount = agents.filter(a => a.swarmId === swarm.id).length;
    const maxIdWidth = 20;
    const maxNameWidth = 25;
    
    return (
      <Box key={swarm.id}>
        <Text 
          color={isSelected ? 'cyan' : 'white'} 
          backgroundColor={isSelected ? 'gray' : undefined}
          bold={isSelected}
        >
          {isExpanded ? '▼ ' : '▶ '}
          {getStatusIcon(swarm.status)} {' '}
          {swarm.id.slice(0, maxIdWidth).padEnd(maxIdWidth)} {' '}
          {swarm.name.slice(0, maxNameWidth).padEnd(maxNameWidth)} {' '}
          <Text color={getStatusColor(swarm.status)}>{swarm.status.padEnd(10)}</Text> {' '}
          {agentCount.toString().padStart(3)} agents {' '}
          {Math.round(swarm.progress)}%
        </Text>
      </Box>
    );
  };

  const renderAgentRow = (agent: AgentInfo, index: number, isSelected: boolean) => {
    const maxTaskWidth = width - 50;
    const indent = '    ';
    
    return (
      <Box key={agent.id}>
        <Text 
          color={isSelected ? 'cyan' : 'gray'} 
          backgroundColor={isSelected ? 'gray' : undefined}
        >
          {indent}
          {getStatusIcon(agent.status)} {' '}
          {agent.id.slice(0, 16).padEnd(16)} {' '}
          <Text color={getStatusColor(agent.status)}>{agent.status.padEnd(10)}</Text> {' '}
          {agent.task.slice(0, maxTaskWidth)}
        </Text>
      </Box>
    );
  };

  const renderHeader = () => {
    const maxIdWidth = 20;
    const maxNameWidth = 25;
    
    return (
      <Box>
        <Text bold color="gray">
          {'   '}
          {'Status'.padEnd(6)}
          {'ID'.padEnd(maxIdWidth + 1)}
          {'Name'.padEnd(maxNameWidth + 1)}
          {'State'.padEnd(11)}
          {'Agents'.padEnd(7)}
          {'Progress'}
        </Text>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Spinner type="dots" /> Loading swarm data...
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text color="gray">Press 'r' to retry</Text>
      </Box>
    );
  }

  // Calculate visible range
  const headerHeight = 3; // Title + separator + column headers
  const footerHeight = 2; // Stats + controls
  const contentHeight = height - headerHeight - footerHeight;
  const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(contentHeight / 2), displayItems.length - contentHeight));
  const endIndex = Math.min(displayItems.length, startIndex + contentHeight);
  const visibleItems = displayItems.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column">
      {/* Stats Summary */}
      <Box paddingY={1}>
        <Text color="gray">
          Total: {swarms.length} swarms | {agents.length} agents | {' '}
          Running: {agents.filter(a => a.status === 'running').length} | {' '}
          Pending: {agents.filter(a => a.status === 'pending').length} | {' '}
          Failed: {agents.filter(a => a.status === 'failed').length}
        </Text>
      </Box>

      {/* Column Headers */}
      {renderHeader()}

      {/* Separator */}
      <Box>
        <Text color="gray">{'─'.repeat(width - 1)}</Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column">
        {visibleItems.length === 0 ? (
          <Box paddingY={2}>
            <Text color="gray">No swarms active. Use &quot;godel swarm create&quot; to start a swarm.</Text>
          </Box>
        ) : (
          visibleItems.map((item, idx) => {
            const actualIndex = startIndex + idx;
            const isSelected = actualIndex === selectedIndex;
            
            if (item.type === 'swarm') {
              return renderSwarmRow(item.data as SwarmInfo, actualIndex, isSelected);
            } else {
              return renderAgentRow(item.data as AgentInfo, actualIndex, isSelected);
            }
          })
        )}
      </Box>

      {/* Controls */}
      <Box paddingTop={1}>
        <Text color="gray">
          ↑↓:Navigate | Enter:Expand | Space:Pause | r:Refresh | v:Toggle view
        </Text>
      </Box>
    </Box>
  );
}
