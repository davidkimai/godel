/**
 * Main Dashboard Component
 * 
 * Provides tab-based navigation between different views:
 * - Teams: Monitor active teams and agents
 * - Sessions: Browse session tree
 * - Tasks: View task queue
 * - Logs: Real-time log streaming
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, Spacer } from 'ink';
import { TeamMonitor } from './TeamMonitor';
import { SessionBrowser } from './SessionBrowser';
import { TaskQueue } from './TaskQueue';
import { LogStream } from './LogStream';
import { useWebSocket } from '../hooks/useWebSocket';

export interface DashboardProps {
  port: number;
  host: string;
  refreshRate: number;
  defaultView: 'teams' | 'sessions' | 'tasks' | 'logs';
}

type Tab = 'teams' | 'sessions' | 'tasks' | 'logs';

const TABS: Tab[] = ['teams', 'sessions', 'tasks', 'logs'];

export function Dashboard({ port, host, refreshRate, defaultView }: DashboardProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>(defaultView);
  const [showHelp, setShowHelp] = useState(false);
  const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns || 120);
  const [terminalHeight, setTerminalHeight] = useState(process.stdout.rows || 30);

  const { connected, error, clientCount } = useWebSocket({
    url: `ws://${host}:${port}`,
    autoConnect: true,
    reconnectInterval: 5000,
    maxReconnectAttempts: 5
  });

  // Handle terminal resize
  useEffect(() => {
    const handleResize = () => {
      setTerminalWidth(process.stdout.columns || 120);
      setTerminalHeight(process.stdout.rows || 30);
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  // Keyboard shortcuts
  useInput((input, key) => {
    if (key.tab) {
      const currentIndex = TABS.indexOf(activeTab);
      const nextIndex = key.shift ? 
        (currentIndex - 1 + TABS.length) % TABS.length :
        (currentIndex + 1) % TABS.length;
      setActiveTab(TABS[nextIndex]);
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }

    if (input === '?') {
      setShowHelp(!showHelp);
    }

    if (input === '1') setActiveTab('teams');
    if (input === '2') setActiveTab('sessions');
    if (input === '3') setActiveTab('tasks');
    if (input === '4') setActiveTab('logs');
  });

  const renderTab = (tab: Tab) => {
    switch (tab) {
      case 'teams':
        return <TeamMonitor width={terminalWidth} height={terminalHeight - 6} />;
      case 'sessions':
        return <SessionBrowser width={terminalWidth} height={terminalHeight - 6} />;
      case 'tasks':
        return <TaskQueue width={terminalWidth} height={terminalHeight - 6} />;
      case 'logs':
        return <LogStream width={terminalWidth} height={terminalHeight - 6} />;
      default:
        return null;
    }
  };

  const getTabLabel = (tab: Tab, index: number) => {
    const isActive = activeTab === tab;
    const labels: Record<Tab, string> = {
      teams: 'Teams',
      sessions: 'Sessions',
      tasks: 'Tasks',
      logs: 'Logs'
    };

    return (
      <Text key={tab} color={isActive ? 'cyan' : 'gray'} bold={isActive}>
        {isActive ? '[ ' : '  '}
        {index + 1}:{labels[tab]}
        {isActive ? ' ]' : '  '}
      </Text>
    );
  };

  const getStatusColor = () => {
    if (error) return 'red';
    if (connected) return 'green';
    return 'yellow';
  };

  const getStatusText = () => {
    if (error) return `● Error: ${error}`;
    if (connected) return `● Connected (${clientCount} clients)`;
    return '● Connecting...';
  };

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Header */}
      <Box paddingY={1}>
        <Text bold color="cyan">🎯 Godel Dashboard</Text>
        <Spacer />
        <Text color={getStatusColor()}>{getStatusText()}</Text>
      </Box>

      {/* Tab Navigation */}
      <Box paddingBottom={1}>
        {TABS.map((tab, index) => (
          <Box key={tab} marginRight={2}>
            {getTabLabel(tab, index)}
          </Box>
        ))}
        <Spacer />
        <Text color="gray">Press ? for help</Text>
      </Box>

      {/* Separator */}
      <Box>
        <Text color="gray">{'─'.repeat(terminalWidth - 1)}</Text>
      </Box>

      {/* Main Content */}
      <Box flexDirection="column" flexGrow={1}>
        {renderTab(activeTab)}
      </Box>

      {/* Footer */}
      <Box paddingY={1}>
        <Text color="gray">
          {host}:{port} | Refresh: {refreshRate}ms | q:Quit | Tab:Switch
        </Text>
      </Box>

      {/* Help Modal */}
      {showHelp && (
        <Box 
          flexDirection="column" 
          borderStyle="round" 
          borderColor="cyan"
          padding={1}
          position="absolute"
          marginTop={4}
          marginLeft={Math.floor(terminalWidth / 2) - 25}
          width={50}
        >
          <Text bold color="cyan">Keyboard Shortcuts</Text>
          <Box paddingY={1} flexDirection="column">
            <Text color="gray">Navigation:</Text>
            <Text>  Tab/Shift+Tab  Switch tabs</Text>
            <Text>  1-4            Direct tab access</Text>
            <Text>  ↑↓←→           Navigate within view</Text>
            <Box paddingY={1} />
            <Text color="gray">Actions:</Text>
            <Text>  Enter          Select/open item</Text>
            <Text>  Space          Pause/resume</Text>
            <Text>  r              Refresh</Text>
            <Box paddingY={1} />
            <Text color="gray">General:</Text>
            <Text>  q/Ctrl+C       Quit</Text>
            <Text>  ?              Toggle help</Text>
          </Box>
          <Text color="cyan" bold>Press ? to close</Text>
        </Box>
      )}
    </Box>
  );
}
