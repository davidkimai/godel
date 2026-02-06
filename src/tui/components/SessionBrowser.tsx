/**
 * Session Browser Component
 * 
 * Interactive tree navigation for viewing session hierarchy
 * and agent conversation history.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useSessionData } from '../hooks/useWebSocket';

export interface SessionBrowserProps {
  width: number;
  height: number;
}

interface SessionNode {
  id: string;
  name: string;
  type: 'root' | 'branch' | 'leaf';
  children: string[];
  parentId?: string;
  agentId?: string;
  messages: MessageNode[];
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'completed' | 'failed';
}

interface MessageNode {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export function SessionBrowser({ width, height }: SessionBrowserProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { sessions, loading, error, refresh } = useSessionData();

  // Flatten tree for display
  const displayItems = useMemo(() => {
    const items: Array<{ node: SessionNode; depth: number }> = [];
    const visited = new Set<string>();

    const addNode = (node: SessionNode, depth: number) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);

      items.push({ node, depth });

      if (expandedNodes.has(node.id)) {
        for (const childId of node.children) {
          const child = sessions.find(s => s.id === childId);
          if (child) {
            addNode(child, depth + 1);
          }
        }
      }
    };

    // Add root nodes first
    const rootNodes = sessions.filter(s => !s.parentId);
    for (const root of rootNodes) {
      addNode(root, 0);
    }

    // Add orphaned nodes
    for (const session of sessions) {
      if (!visited.has(session.id)) {
        addNode(session, 0);
      }
    }

    return items;
  }, [sessions, expandedNodes]);

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
      if (item) {
        const nodeId = item.node.id;
        setSelectedNodeId(nodeId);
        
        if (item.node.children.length > 0) {
          setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
              next.delete(nodeId);
            } else {
              next.add(nodeId);
            }
            return next;
          });
        }
      }
    }

    if (key.rightArrow) {
      const item = displayItems[selectedIndex];
      if (item && item.node.children.length > 0) {
        setExpandedNodes(prev => new Set([...prev, item.node.id]));
      }
    }

    if (key.leftArrow) {
      const item = displayItems[selectedIndex];
      if (item) {
        setExpandedNodes(prev => {
          const next = new Set(prev);
          next.delete(item.node.id);
          return next;
        });
      }
    }

    if (input === 'r' || input === 'R') {
      refresh();
    }

    if (input === 'a') {
      // Expand all
      setExpandedNodes(new Set(sessions.map(s => s.id)));
    }

    if (input === 'c') {
      // Collapse all
      setExpandedNodes(new Set());
    }
  });

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      active: '●',
      completed: '✓',
      failed: '✗'
    };
    return icons[status] || '○';
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      active: 'green',
      completed: 'cyan',
      failed: 'red'
    };
    return colors[status] || 'gray';
  };

  const getTypeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      root: '🏠',
      branch: '📁',
      leaf: '📄'
    };
    return icons[type] || '📄';
  };

  const renderTreeItem = (item: { node: SessionNode; depth: number }, index: number) => {
    const { node, depth } = item;
    const isSelected = index === selectedIndex;
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    
    const indent = '  '.repeat(depth);
    const expandIcon = hasChildren ? (isExpanded ? '▼' : '▶') : ' ';
    const maxNameWidth = Math.max(20, width - 50 - depth * 2);

    return (
      <Box key={node.id}>
        <Text 
          color={isSelected ? 'cyan' : 'white'} 
          backgroundColor={isSelected ? 'gray' : undefined}
        >
          {indent}{expandIcon} {' '}
          {getTypeIcon(node.type)} {' '}
          <Text color={getStatusColor(node.status)}>
            {getStatusIcon(node.status)}
          </Text>
          {' '}
          {node.name.slice(0, maxNameWidth).padEnd(maxNameWidth)} {' '}
          <Text color="gray">
            {node.messages.length} msgs | {new Date(node.updatedAt).toLocaleTimeString()}
          </Text>
        </Text>
      </Box>
    );
  };

  const renderSelectedSession = () => {
    if (!selectedNodeId) return null;
    
    const session = sessions.find(s => s.id === selectedNodeId);
    if (!session) return null;

    const previewHeight = Math.floor(height * 0.4);

    return (
      <Box 
        flexDirection="column" 
        borderStyle="round" 
        borderColor="cyan"
        padding={1}
        height={previewHeight}
      >
        <Text bold color="cyan">Session: {session.name}</Text>
        <Text color="gray">ID: {session.id}</Text>
        <Box paddingY={1}>
          <Text color="gray">{'─'.repeat(width - 4)}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {session.messages.slice(-5).map((msg, idx) => (
            <Box key={idx} marginBottom={1}>
              <Text color={msg.role === 'user' ? 'yellow' : msg.role === 'assistant' ? 'green' : 'gray'}>
                {msg.role}: 
              </Text>
              <Text> {msg.content.slice(0, width - 15)}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Spinner type="dots" /> Loading sessions...
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

  // Calculate visible range for tree
  const previewHeight = selectedNodeId ? Math.floor(height * 0.4) + 2 : 0;
  const treeHeight = height - previewHeight - 4; // Header + controls
  const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(treeHeight / 2), displayItems.length - treeHeight));
  const endIndex = Math.min(displayItems.length, startIndex + treeHeight);
  const visibleItems = displayItems.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column">
      {/* Stats */}
      <Box paddingY={1}>
        <Text color="gray">
          Sessions: {sessions.length} | Active: {sessions.filter(s => s.status === 'active').length} | {' '}
          Expanded: {expandedNodes.size}
        </Text>
      </Box>

      {/* Tree View */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleItems.length === 0 ? (
          <Box paddingY={2}>
            <Text color="gray">No sessions found.</Text>
          </Box>
        ) : (
          visibleItems.map((item, idx) => {
            const actualIndex = startIndex + idx;
            return renderTreeItem(item, actualIndex);
          })
        )}
      </Box>

      {/* Selected Session Preview */}
      {renderSelectedSession()}

      {/* Controls */}
      <Box paddingTop={1}>
        <Text color="gray">
          ↑↓:Navigate | →:Expand | ←:Collapse | Enter:Select | a:Expand all | c:Collapse all | r:Refresh
        </Text>
      </Box>
    </Box>
  );
}
