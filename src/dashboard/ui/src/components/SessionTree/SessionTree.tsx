/**
 * SessionTree Component
 * 
 * D3.js-based hierarchical tree visualization for session relationships
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Agent, AgentStatus } from '../../types';
import { useAgentsRealtime } from '../../hooks/useWebSocket';
import { SessionNodeCard } from './SessionNodeCard';

export interface SessionNode {
  id: string;
  parentId?: string;
  status: AgentStatus;
  task: string;
  agentId: string;
  label?: string;
  children: SessionNode[];
  startedAt: number;
  progress: number;
  model?: string;
  cost?: number;
  depth: number;
  x?: number;
  y?: number;
}

interface SessionTreeProps {
  rootAgentId?: string;
  onNodeClick?: (node: SessionNode) => void;
  autoExpandDepth?: number;
  width?: number;
  height?: number;
}

const statusColors: Record<AgentStatus, string> = {
  [AgentStatus.PENDING]: '#fbbf24',
  [AgentStatus.RUNNING]: '#3b82f6',
  [AgentStatus.PAUSED]: '#f59e0b',
  [AgentStatus.COMPLETED]: '#10b981',
  [AgentStatus.FAILED]: '#ef4444',
  [AgentStatus.BLOCKED]: '#8b5cf6',
  [AgentStatus.KILLED]: '#6b7280',
  [AgentStatus.OFFLINE]: '#9ca3af',
  [AgentStatus.BUSY]: '#ec4899'
};

function buildHierarchy(agents: Agent[]): SessionNode {
  const nodeMap = new Map<string, SessionNode>();
  
  // Create nodes
  agents.forEach(agent => {
    nodeMap.set(agent.id, {
      id: agent.id,
      agentId: agent.id,
      parentId: agent.parentId,
      status: agent.status,
      task: agent.task || 'No task',
      label: agent.label,
      children: [],
      startedAt: new Date(agent.spawnedAt).getTime(),
      progress: agent.progress || 0,
      model: agent.model,
      cost: agent.cost,
      depth: 0
    });
  });
  
  // Build tree structure
  let root: SessionNode | null = null;
  nodeMap.forEach(node => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      root = node;
    }
  });
  
  // If no root found, create a virtual root
  if (!root && nodeMap.size > 0) {
    root = {
      id: 'virtual-root',
      agentId: 'virtual-root',
      status: AgentStatus.RUNNING,
      task: 'Session Root',
      children: Array.from(nodeMap.values()).filter(n => !n.parentId),
      startedAt: Date.now(),
      progress: 0,
      depth: 0
    };
  }
  
  return root || {
    id: 'empty',
    agentId: 'empty',
    status: AgentStatus.PENDING,
    task: 'No active sessions',
    children: [],
    startedAt: Date.now(),
    progress: 0,
    depth: 0
  };
}

export const SessionTree: React.FC<SessionTreeProps> = ({
  onNodeClick,
  autoExpandDepth = 2,
  width = 800,
  height = 600
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const { agents, isLoading } = useAgentsRealtime();
  const [selectedNode, setSelectedNode] = useState<SessionNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

  // Initialize expanded nodes
  useEffect(() => {
    const expandNodes = (node: SessionNode, depth: number) => {
      if (depth < autoExpandDepth) {
        setExpandedNodes(prev => new Set([...prev, node.id]));
        node.children.forEach(child => expandNodes(child, depth + 1));
      }
    };
    
    if (agents.length > 0) {
      const root = buildHierarchy(agents);
      expandNodes(root, 0);
    }
  }, [agents, autoExpandDepth]);

  const handleNodeClick = useCallback((node: SessionNode) => {
    setSelectedNode(node);
    if (onNodeClick) {
      onNodeClick(node);
    }
    
    // Toggle expansion
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(node.id)) {
        newSet.delete(node.id);
      } else {
        newSet.add(node.id);
      }
      return newSet;
    });
  }, [onNodeClick]);

  useEffect(() => {
    if (!svgRef.current || agents.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const root = buildHierarchy(agents);
    
    // Create tree layout
    const treeLayout = d3.tree<SessionNode>()
      .size([height - 100, width - 200])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);

    const hierarchy = d3.hierarchy(root, d => expandedNodes.has(d.id) ? d.children : []);
    treeLayout(hierarchy);

    // Center the tree
    const g = svg.append('g')
      .attr('transform', `translate(100, 50)`);

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        setZoomTransform(event.transform);
      });

    svg.call(zoom);

    // Draw links
    g.selectAll('.link')
      .data(hierarchy.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d3.linkHorizontal<d3.HierarchyPointLink<SessionNode>, d3.HierarchyPointNode<SessionNode>>()
        .x(d => d.y)
        .y(d => d.x))
      .attr('fill', 'none')
      .attr('stroke', '#4b5563')
      .attr('stroke-width', 2)
      .attr('opacity', 0.6);

    // Draw nodes
    const nodes = g.selectAll('.node')
      .data(hierarchy.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y}, ${d.x})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        handleNodeClick(d.data);
      });

    // Node circles
    nodes.append('circle')
      .attr('r', 8)
      .attr('fill', d => statusColors[d.data.status] || '#6b7280')
      .attr('stroke', d => selectedNode?.id === d.data.id ? '#fff' : 'none')
      .attr('stroke-width', 3)
      .attr('class', 'transition-all duration-300');

    // Node labels
    nodes.append('text')
      .attr('dy', '0.31em')
      .attr('x', d => d.children || d.data.children.length > 0 ? -12 : 12)
      .attr('text-anchor', d => d.children || d.data.children.length > 0 ? 'end' : 'start')
      .text(d => d.data.label || d.data.task.substring(0, 20))
      .attr('fill', '#e5e7eb')
      .attr('font-size', '12px')
      .attr('font-family', 'system-ui, sans-serif')
      .style('pointer-events', 'none');

    // Status indicators
    nodes.filter(d => d.data.children.length > 0)
      .append('circle')
      .attr('r', 4)
      .attr('cx', d => d.children ? -12 : 12)
      .attr('cy', 12)
      .attr('fill', d => expandedNodes.has(d.data.id) ? '#10b981' : '#6b7280');

    // Add progress arcs for running nodes
    nodes.filter(d => d.data.status === AgentStatus.RUNNING && d.data.progress > 0)
      .append('path')
      .attr('d', d => {
        const progress = d.data.progress / 100;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + progress * 2 * Math.PI;
        const arc = d3.arc()
          .innerRadius(10)
          .outerRadius(12)
          .startAngle(startAngle)
          .endAngle(endAngle);
        return arc({} as any) || '';
      })
      .attr('fill', '#3b82f6')
      .attr('opacity', 0.8);

  }, [agents, expandedNodes, selectedNode, handleNodeClick, width, height]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="session-tree bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-gray-800">
        <h3 className="text-lg font-semibold text-gray-100">Session Tree</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-gray-400">Running</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-xs text-gray-400">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-xs text-gray-400">Failed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-xs text-gray-400">Pending</span>
          </div>
        </div>
      </div>
      
      <div className="relative">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="bg-gray-900"
        />
        
        {selectedNode && (
          <div className="absolute top-4 right-4 w-72">
            <SessionNodeCard node={selectedNode} onClose={() => setSelectedNode(null)} />
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-gray-800 text-sm text-gray-400">
        {agents.length} agents • {expandedNodes.size} expanded nodes
        {zoomTransform && ` • Zoom: ${Math.round(zoomTransform.k * 100)}%`}
      </div>
    </div>
  );
};
