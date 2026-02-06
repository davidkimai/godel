/**
 * Task Queue Component
 * 
 * Visualizes the task queue with pending, running, and completed tasks.
 * Shows queue depth, processing rate, and task details.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useTaskData } from '../hooks/useWebSocket';

export interface TaskQueueProps {
  width: number;
  height: number;
}

interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  queue: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  retries: number;
  maxRetries: number;
  agentId?: string;
  error?: string;
}

interface QueueStats {
  name: string;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  throughput: number; // tasks per minute
  avgDuration: number;
}

export function TaskQueue({ width, height }: TaskQueueProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState<'all' | 'pending' | 'running' | 'completed' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'priority' | 'status'>('time');

  const { tasks, queues, stats, loading, error, refresh } = useTaskData();

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Apply status filter
    if (filter !== 'all') {
      result = result.filter(t => t.status === filter);
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return b.priority - a.priority;
        case 'status':
          return a.status.localeCompare(b.status);
        case 'time':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [tasks, filter, sortBy]);

  // Keyboard navigation
  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    }
    
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(filteredTasks.length - 1, prev + 1));
    }

    if (input === '1') setFilter('all');
    if (input === '2') setFilter('pending');
    if (input === '3') setFilter('running');
    if (input === '4') setFilter('completed');
    if (input === '5') setFilter('failed');

    if (input === 's') {
      setSortBy(prev => {
        const options: Array<'time' | 'priority' | 'status'> = ['time', 'priority', 'status'];
        const currentIndex = options.indexOf(prev);
        return options[(currentIndex + 1) % options.length];
      });
    }

    if (input === 'r' || input === 'R') {
      refresh();
    }

    if (input === 'c') {
      // Cancel selected task
      const task = filteredTasks[selectedIndex];
      if (task && (task.status === 'pending' || task.status === 'running')) {
        console.log('Cancel task:', task.id);
      }
    }

    if (input === 'p') {
      // Pause/unpause queue
      console.log('Toggle queue pause');
    }
  });

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      pending: 'yellow',
      running: 'blue',
      completed: 'green',
      failed: 'red',
      cancelled: 'gray'
    };
    return colors[status] || 'white';
  };

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      pending: '⏳',
      running: '●',
      completed: '✓',
      failed: '✗',
      cancelled: '⊘'
    };
    return icons[status] || '?';
  };

  const getPriorityColor = (priority: number): string => {
    if (priority >= 8) return 'red';
    if (priority >= 5) return 'yellow';
    return 'gray';
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

  const renderQueueStats = () => {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text bold color="cyan">Queue Statistics</Text>
        <Box paddingY={1}>
          {queues.map((queue, idx) => (
            <Box key={queue.name} marginRight={4}>
              <Text color="gray">{queue.name}:</Text>
              <Text> </Text>
              <Text color="yellow">{queue.pending}</Text>
              <Text color="gray">/</Text>
              <Text color="blue">{queue.running}</Text>
              <Text color="gray">/</Text>
              <Text color="green">{queue.completed}</Text>
              <Text color="gray">/</Text>
              <Text color="red">{queue.failed}</Text>
            </Box>
          ))}
        </Box>
        {stats && (
          <Box>
            <Text color="gray">
              Throughput: {stats.throughput.toFixed(1)}/min | {' '}
              Avg Duration: {formatDuration(stats.avgDuration)}
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderFilterBar = () => {
    const filters: Array<{ key: string; label: string; value: typeof filter }> = [
      { key: '1', label: 'All', value: 'all' },
      { key: '2', label: 'Pending', value: 'pending' },
      { key: '3', label: 'Running', value: 'running' },
      { key: '4', label: 'Completed', value: 'completed' },
      { key: '5', label: 'Failed', value: 'failed' }
    ];

    return (
      <Box paddingY={1}>
        {filters.map(f => (
          <Box key={f.value} marginRight={2}>
            <Text color={filter === f.value ? 'cyan' : 'gray'} bold={filter === f.value}>
              {filter === f.value ? '[ ' : '  '}
              {f.key}:{f.label}
              {filter === f.value ? ' ]' : '  '}
            </Text>
          </Box>
        ))}
        <Box marginLeft={4}>
          <Text color="gray">Sort: </Text>
          <Text color="cyan">{sortBy}</Text>
        </Box>
      </Box>
    );
  };

  const renderTaskRow = (task: Task, index: number, isSelected: boolean) => {
    const maxNameWidth = 30;
    const maxQueueWidth = 15;

    return (
      <Box key={task.id}>
        <Text 
          color={isSelected ? 'cyan' : 'white'} 
          backgroundColor={isSelected ? 'gray' : undefined}
        >
          {task.status === 'running' ? '▶' : getStatusIcon(task.status)} {' '}
          <Text color={getPriorityColor(task.priority)}>
            P{task.priority.toString().padStart(2)}
          </Text>
          {' '}
          {task.id.slice(0, 8).padEnd(9)} {' '}
          {task.name.slice(0, maxNameWidth).padEnd(maxNameWidth + 1)} {' '}
          <Text color={getStatusColor(task.status)}>{task.status.padEnd(10)}</Text> {' '}
          {task.queue.slice(0, maxQueueWidth).padEnd(maxQueueWidth + 1)} {' '}
          {formatDuration(task.duration).padStart(8)} {' '}
          {task.retries > 0 ? `R${task.retries}` : '  '}
        </Text>
      </Box>
    );
  };

  const renderTaskDetail = () => {
    const task = filteredTasks[selectedIndex];
    if (!task) return null;

    const detailHeight = 8;

    return (
      <Box 
        flexDirection="column" 
        borderStyle="round" 
        borderColor="cyan"
        padding={1}
        height={detailHeight}
        marginTop={1}
      >
        <Text bold color="cyan">Task Details</Text>
        <Box paddingY={1} flexDirection="column">
          <Text>ID: {task.id}</Text>
          <Text>Name: {task.name}</Text>
          <Text>Queue: {task.queue}</Text>
          <Text>Created: {new Date(task.createdAt).toLocaleString()}</Text>
          {task.agentId && <Text>Agent: {task.agentId}</Text>}
          {task.error && <Text color="red">Error: {task.error.slice(0, width - 20)}</Text>}
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Spinner type="dots" /> Loading task queue...
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
  const statsHeight = queues.length > 0 ? 5 : 0;
  const filterHeight = 2;
  const detailHeight = 10;
  const controlsHeight = 2;
  const contentHeight = height - statsHeight - filterHeight - detailHeight - controlsHeight;
  
  const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(contentHeight / 2), filteredTasks.length - contentHeight));
  const endIndex = Math.min(filteredTasks.length, startIndex + contentHeight);
  const visibleItems = filteredTasks.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column">
      {/* Queue Statistics */}
      {renderQueueStats()}

      {/* Filter Bar */}
      {renderFilterBar()}

      {/* Header */}
      <Box>
        <Text bold color="gray">
          {'   '}
          {'Pr'}
          {'ID'.padEnd(10)}
          {'Name'.padEnd(31)}
          {'Status'.padEnd(11)}
          {'Queue'.padEnd(16)}
          {'Duration'.padEnd(9)}
          {'Retry'}
        </Text>
      </Box>

      {/* Separator */}
      <Box>
        <Text color="gray">{'─'.repeat(width - 1)}</Text>
      </Box>

      {/* Task List */}
      <Box flexDirection="column">
        {visibleItems.length === 0 ? (
          <Box paddingY={2}>
            <Text color="gray">
              {filter === 'all' ? 'No tasks in queue.' : `No ${filter} tasks.`}
            </Text>
          </Box>
        ) : (
          visibleItems.map((task, idx) => {
            const actualIndex = startIndex + idx;
            return renderTaskRow(task, actualIndex, actualIndex === selectedIndex);
          })
        )}
      </Box>

      {/* Task Detail */}
      {renderTaskDetail()}

      {/* Controls */}
      <Box paddingTop={1}>
        <Text color="gray">
          ↑↓:Navigate | 1-5:Filter | s:Sort | c:Cancel | p:Pause | r:Refresh
        </Text>
      </Box>
    </Box>
  );
}
