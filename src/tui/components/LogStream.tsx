/**
 * Log Stream Component
 * 
 * Real-time log streaming with filtering and search capabilities.
 * Shows system events, agent logs, and error messages.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { useEventStream } from '../hooks/useWebSocket';

export interface LogStreamProps {
  width: number;
  height: number;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

export function LogStream({ width, height }: LogStreamProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showMetadata, setShowMetadata] = useState(false);
  const scrollPositionRef = useRef(0);

  const { events, connected, error, clear } = useEventStream();

  // Convert events to log entries
  const logs = useMemo<LogEntry[]>(() => {
    return events.map(event => ({
      id: event.id,
      timestamp: new Date(event.timestamp),
      level: event.data?.level || 'info',
      source: event.data?.source || event.event || 'system',
      message: event.data?.message || JSON.stringify(event.data),
      metadata: event.data?.metadata
    }));
  }, [events]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Level filter
      if (levelFilter !== 'all' && log.level !== levelFilter) return false;
      
      // Source filter
      if (sourceFilter !== 'all' && log.source !== sourceFilter) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          log.message.toLowerCase().includes(query) ||
          log.source.toLowerCase().includes(query)
        );
      }
      
      return true;
    });
  }, [logs, levelFilter, sourceFilter, searchQuery]);

  // Get unique sources for filter
  const sources = useMemo(() => {
    const unique = new Set(logs.map(l => l.source));
    return Array.from(unique).slice(0, 20); // Limit to 20 sources
  }, [logs]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && !isSearching) {
      setSelectedIndex(Math.max(0, filteredLogs.length - 1));
    }
  }, [filteredLogs.length, autoScroll, isSearching]);

  // Keyboard input
  useInput((input, key) => {
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery('');
      }
      return;
    }

    if (input === '/') {
      setIsSearching(true);
      return;
    }

    if (key.upArrow) {
      setAutoScroll(false);
      setSelectedIndex(prev => Math.max(0, prev - 1));
    }
    
    if (key.downArrow) {
      setSelectedIndex(prev => {
        const next = Math.min(filteredLogs.length - 1, prev + 1);
        if (next === filteredLogs.length - 1) {
          setAutoScroll(true);
        }
        return next;
      });
    }

    if (key.pageUp) {
      setAutoScroll(false);
      setSelectedIndex(prev => Math.max(0, prev - Math.floor((height - 8) / 2)));
    }

    if (key.pageDown) {
      setSelectedIndex(prev => {
        const next = Math.min(filteredLogs.length - 1, prev + Math.floor((height - 8) / 2));
        if (next === filteredLogs.length - 1) {
          setAutoScroll(true);
        }
        return next;
      });
    }

    if (input === 'g') {
      setSelectedIndex(0);
      setAutoScroll(false);
    }

    if (input === 'G') {
      setSelectedIndex(filteredLogs.length - 1);
      setAutoScroll(true);
    }

    if (input === '1') setLevelFilter('all');
    if (input === '2') setLevelFilter('debug');
    if (input === '3') setLevelFilter('info');
    if (input === '4') setLevelFilter('warn');
    if (input === '5') setLevelFilter('error');
    if (input === '6') setLevelFilter('fatal');

    if (input === 's') {
      const sourceIndex = sources.indexOf(sourceFilter);
      const nextSource = sources[(sourceIndex + 1) % sources.length] || 'all';
      setSourceFilter(nextSource === sourceFilter ? 'all' : nextSource);
    }

    if (input === 'a') {
      setAutoScroll(!autoScroll);
    }

    if (input === 'm') {
      setShowMetadata(!showMetadata);
    }

    if (input === 'c') {
      clear();
      setSelectedIndex(0);
    }

    if (input === 'r') {
      // Manual refresh - events are real-time, so this is a no-op
    }
  });

  const getLevelColor = (level: string): string => {
    const colors: Record<string, string> = {
      debug: 'gray',
      info: 'cyan',
      warn: 'yellow',
      error: 'red',
      fatal: 'redBright'
    };
    return colors[level] || 'white';
  };

  const getLevelIcon = (level: string): string => {
    const icons: Record<string, string> = {
      debug: '◦',
      info: 'ℹ',
      warn: '⚠',
      error: '✗',
      fatal: '☠'
    };
    return icons[level] || '•';
  };

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const renderFilterBar = () => {
    const levels: Array<{ key: string; label: string; value: typeof levelFilter }> = [
      { key: '1', label: 'All', value: 'all' },
      { key: '2', label: 'Debug', value: 'debug' },
      { key: '3', label: 'Info', value: 'info' },
      { key: '4', label: 'Warn', value: 'warn' },
      { key: '5', label: 'Error', value: 'error' },
      { key: '6', label: 'Fatal', value: 'fatal' }
    ];

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box>
          {levels.map(l => (
            <Box key={l.value} marginRight={2}>
              <Text color={levelFilter === l.value ? 'cyan' : 'gray'} bold={levelFilter === l.value}>
                {levelFilter === l.value ? '[ ' : '  '}
                {l.key}:{l.label}
                {levelFilter === l.value ? ' ]' : '  '}
              </Text>
            </Box>
          ))}
          <Box marginLeft={4}>
            <Text color="gray">Source: </Text>
            <Text color="cyan">{sourceFilter}</Text>
          </Box>
          <Box marginLeft={4}>
            <Text color={autoScroll ? 'green' : 'gray'}>
              {autoScroll ? '● Auto-scroll' : '○ Manual'}
            </Text>
          </Box>
        </Box>
        {isSearching && (
          <Box marginTop={1}>
            <Text color="yellow">Search: </Text>
            <TextInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={() => setIsSearching(false)}
              placeholder="Type to filter..."
            />
          </Box>
        )}
      </Box>
    );
  };

  const renderLogRow = (log: LogEntry, index: number, isSelected: boolean) => {
    const timestamp = formatTimestamp(log.timestamp);
    const maxMessageWidth = width - 40;
    const message = log.message.slice(0, maxMessageWidth);

    return (
      <Box key={log.id}>
        <Text 
          color={isSelected ? 'cyan' : 'white'} 
          backgroundColor={isSelected ? 'gray' : undefined}
        >
          <Text color="gray">{timestamp}</Text>
          {' '}
          <Text color={getLevelColor(log.level)}>
            {getLevelIcon(log.level)}{log.level.toUpperCase().padEnd(5)}
          </Text>
          {' '}
          <Text color="gray">{log.source.slice(0, 12).padEnd(13)}</Text>
          {' '}
          {message}
        </Text>
      </Box>
    );
  };

  const renderSelectedLogDetail = () => {
    const log = filteredLogs[selectedIndex];
    if (!log || !showMetadata) return null;

    return (
      <Box 
        flexDirection="column" 
        borderStyle="round" 
        borderColor="cyan"
        padding={1}
        height={8}
        marginTop={1}
      >
        <Text bold color="cyan">Log Details</Text>
        <Box paddingY={1} flexDirection="column">
          <Text color="gray">Timestamp: {log.timestamp.toISOString()}</Text>
          <Text color="gray">Level: {log.level}</Text>
          <Text color="gray">Source: {log.source}</Text>
          <Text>Message: {log.message}</Text>
          {log.metadata && (
            <Text color="gray">Metadata: {JSON.stringify(log.metadata).slice(0, width - 20)}</Text>
          )}
        </Box>
      </Box>
    );
  };

  const renderStats = () => {
    const counts = {
      debug: logs.filter(l => l.level === 'debug').length,
      info: logs.filter(l => l.level === 'info').length,
      warn: logs.filter(l => l.level === 'warn').length,
      error: logs.filter(l => l.level === 'error').length,
      fatal: logs.filter(l => l.level === 'fatal').length
    };

    return (
      <Box paddingY={1}>
        <Text color="gray">
          Total: {logs.length} | 
          <Text color="gray"> D:{counts.debug}</Text>
          <Text color="cyan"> I:{counts.info}</Text>
          <Text color="yellow"> W:{counts.warn}</Text>
          <Text color="red"> E:{counts.error}</Text>
          <Text color="redBright"> F:{counts.fatal}</Text>
          {' | '}
          Showing: {filteredLogs.length}
        </Text>
      </Box>
    );
  };

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  // Calculate visible range
  const filterHeight = isSearching ? 4 : 2;
  const statsHeight = 2;
  const detailHeight = showMetadata ? 10 : 0;
  const controlsHeight = 2;
  const contentHeight = height - filterHeight - statsHeight - detailHeight - controlsHeight;
  
  const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(contentHeight / 2), filteredLogs.length - contentHeight));
  const endIndex = Math.min(filteredLogs.length, startIndex + contentHeight);
  const visibleItems = filteredLogs.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column">
      {/* Filter Bar */}
      {renderFilterBar()}

      {/* Stats */}
      {renderStats()}

      {/* Separator */}
      <Box>
        <Text color="gray">{'─'.repeat(width - 1)}</Text>
      </Box>

      {/* Log Stream */}
      <Box flexDirection="column">
        {visibleItems.length === 0 ? (
          <Box paddingY={2}>
            <Text color="gray">
              {connected ? 'Waiting for logs...' : 'Connecting...'}
            </Text>
          </Box>
        ) : (
          visibleItems.map((log, idx) => {
            const actualIndex = startIndex + idx;
            return renderLogRow(log, actualIndex, actualIndex === selectedIndex);
          })
        )}
      </Box>

      {/* Selected Log Detail */}
      {renderSelectedLogDetail()}

      {/* Controls */}
      <Box paddingTop={1}>
        <Text color="gray">
          ↑↓:Navigate | PgUp/PgDn:Page | g/G:Jump | /:Search | 1-6:Level | s:Source | a:Auto | m:Metadata | c:Clear
        </Text>
      </Box>
    </Box>
  );
}
