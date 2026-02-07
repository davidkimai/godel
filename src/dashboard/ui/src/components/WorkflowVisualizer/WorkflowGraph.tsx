/**
 * WorkflowGraph Component
 * 
 * Interactive DAG visualization using React Flow
 */

import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeTypes,
  EdgeTypes,
  Panel,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Play, CheckCircle, XCircle, Pause, Loader2, GitBranch, Layers } from 'lucide-react';
import { Agent, AgentStatus } from '../../types';
import { useAgentsRealtime } from '../../hooks/useWebSocket';

// Custom node types
interface WorkflowNodeData {
  label: string;
  status: AgentStatus;
  progress: number;
  type: 'task' | 'condition' | 'parallel' | 'start' | 'end';
  agentId?: string;
  cost?: number;
  onClick?: () => void;
}

const TaskNode: React.FC<{ data: WorkflowNodeData; selected: boolean }> = ({ data, selected }) => {
  const statusColors = {
    [AgentStatus.PENDING]: 'border-yellow-500/50 bg-yellow-500/10',
    [AgentStatus.RUNNING]: 'border-blue-500 bg-blue-500/20',
    [AgentStatus.PAUSED]: 'border-amber-500 bg-amber-500/20',
    [AgentStatus.COMPLETED]: 'border-green-500 bg-green-500/20',
    [AgentStatus.FAILED]: 'border-red-500 bg-red-500/20',
    [AgentStatus.BLOCKED]: 'border-purple-500 bg-purple-500/20',
    [AgentStatus.KILLED]: 'border-gray-500 bg-gray-500/20',
    [AgentStatus.OFFLINE]: 'border-gray-600 bg-gray-600/20',
    [AgentStatus.BUSY]: 'border-pink-500 bg-pink-500/20'
  };

  const StatusIcon = {
    [AgentStatus.PENDING]: Pause,
    [AgentStatus.RUNNING]: Loader2,
    [AgentStatus.PAUSED]: Pause,
    [AgentStatus.COMPLETED]: CheckCircle,
    [AgentStatus.FAILED]: XCircle,
    [AgentStatus.BLOCKED]: XCircle,
    [AgentStatus.KILLED]: XCircle,
    [AgentStatus.OFFLINE]: XCircle,
    [AgentStatus.BUSY]: Loader2
  };

  const Icon = StatusIcon[data.status];

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 min-w-[180px] cursor-pointer
        transition-all duration-200 hover:shadow-lg
        ${statusColors[data.status]}
        ${selected ? 'ring-2 ring-white' : ''}
      `}
      onClick={data.onClick}
    >
      <div className="flex items-center gap-3">
        <div className={`${data.status === AgentStatus.RUNNING ? 'animate-spin' : ''}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200 truncate">{data.label}</p>
          <p className="text-xs text-gray-400 capitalize">{data.status}</p>
        </div>
      </div>
      
      {data.progress > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Progress</span>
            <span>{data.progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-current transition-all duration-300"
              style={{ width: `${data.progress}%` }}
            />
          </div>
        </div>
      )}

      {typeof data.cost === 'number' && data.cost > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Cost: ${data.cost.toFixed(4)}
        </p>
      )}
    </div>
  );
};

const ConditionNode: React.FC<{ data: WorkflowNodeData }> = ({ data }) => (
  <div className="px-4 py-3 rounded-full border-2 border-purple-500 bg-purple-500/10 min-w-[140px]">
    <div className="flex items-center gap-2">
      <GitBranch className="w-4 h-4 text-purple-400" />
      <span className="text-sm font-medium text-gray-200">{data.label}</span>
    </div>
  </div>
);

const ParallelNode: React.FC<{ data: WorkflowNodeData }> = ({ data }) => (
  <div className="px-4 py-3 rounded-lg border-2 border-orange-500 bg-orange-500/10 min-w-[140px]">
    <div className="flex items-center gap-2">
      <Layers className="w-4 h-4 text-orange-400" />
      <span className="text-sm font-medium text-gray-200">{data.label}</span>
    </div>
  </div>
);

const StartNode: React.FC<{ data: WorkflowNodeData }> = ({ data }) => (
  <div className="px-4 py-3 rounded-lg border-2 border-green-500 bg-green-500/20 min-w-[120px]">
    <div className="flex items-center gap-2">
      <Play className="w-4 h-4 text-green-400" />
      <span className="text-sm font-medium text-gray-200">{data.label}</span>
    </div>
  </div>
);

const EndNode: React.FC<{ data: WorkflowNodeData }> = ({ data }) => (
  <div className="px-4 py-3 rounded-lg border-2 border-red-500 bg-red-500/20 min-w-[120px]">
    <div className="flex items-center gap-2">
      <CheckCircle className="w-4 h-4 text-red-400" />
      <span className="text-sm font-medium text-gray-200">{data.label}</span>
    </div>
  </div>
);

const nodeTypes: NodeTypes = {
  task: TaskNode,
  condition: ConditionNode,
  parallel: ParallelNode,
  start: StartNode,
  end: EndNode
};

interface WorkflowGraphProps {
  workflowId?: string;
  height?: number;
}

// Transform agents to workflow nodes
function transformAgentsToWorkflow(agents: Agent[]): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  if (agents.length === 0) {
    return {
      nodes: [{
        id: 'empty',
        type: 'task',
        position: { x: 250, y: 150 },
        data: {
          label: 'No Active Workflow',
          status: AgentStatus.PENDING,
          progress: 0,
          type: 'task'
        }
      }],
      edges: []
    };
  }

  const nodes: Node<WorkflowNodeData>[] = [];
  const edges: Edge[] = [];
  const levelWidth = 250;
  const nodeHeight = 120;

  // Group agents by depth level
  const agentsByLevel = new Map<number, Agent[]>();
  
  const calculateDepth = (agent: Agent, visited = new Set<string>()): number => {
    if (visited.has(agent.id)) return 0;
    if (!agent.parentId) return 0;
    
    visited.add(agent.id);
    const parent = agents.find(a => a.id === agent.parentId);
    return parent ? calculateDepth(parent, visited) + 1 : 0;
  };

  agents.forEach(agent => {
    const depth = calculateDepth(agent);
    if (!agentsByLevel.has(depth)) {
      agentsByLevel.set(depth, []);
    }
    agentsByLevel.get(depth)!.push(agent);
  });

  // Create nodes
  agentsByLevel.forEach((levelAgents, level) => {
    levelAgents.forEach((agent, index) => {
      const yOffset = levelAgents.length > 1 
        ? (index - (levelAgents.length - 1) / 2) * nodeHeight 
        : 0;

      nodes.push({
        id: agent.id,
        type: 'task',
        position: { 
          x: level * levelWidth + 50, 
          y: 200 + yOffset 
        },
        data: {
          label: agent.label || agent.task?.slice(0, 30) || 'Agent',
          status: agent.status,
          progress: agent.progress || 0,
          type: 'task',
          agentId: agent.id,
          cost: agent.cost
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      });

      // Create edge from parent
      if (agent.parentId && agents.find(a => a.id === agent.parentId)) {
        edges.push({
          id: `${agent.parentId}-${agent.id}`,
          source: agent.parentId,
          target: agent.id,
          type: 'smoothstep',
          animated: agent.status === AgentStatus.RUNNING,
          style: { 
            stroke: agent.status === AgentStatus.FAILED ? '#ef4444' : '#3b82f6',
            strokeWidth: 2
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: agent.status === AgentStatus.FAILED ? '#ef4444' : '#3b82f6'
          }
        });
      }
    });
  });

  // Add start node if we have root agents
  const rootAgents = agents.filter(a => !a.parentId);
  if (rootAgents.length > 0) {
    nodes.unshift({
      id: 'start',
      type: 'start',
      position: { x: -150, y: 200 },
      data: {
        label: 'Start',
        status: AgentStatus.COMPLETED,
        progress: 100,
        type: 'start'
      }
    });

    rootAgents.forEach(agent => {
      edges.unshift({
        id: `start-${agent.id}`,
        source: 'start',
        target: agent.id,
        type: 'smoothstep',
        animated: agent.status === AgentStatus.RUNNING,
        style: { stroke: '#10b981', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#10b981'
        }
      });
    });
  }

  return { nodes, edges };
}

export const WorkflowGraph: React.FC<WorkflowGraphProps> = ({ 
  height = 500 
}) => {
  const { agents, isLoading } = useAgentsRealtime();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = transformAgentsToWorkflow(agents);
    
    // Add click handlers
    const nodesWithHandlers = newNodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onClick: () => setSelectedNode(node.id)
      }
    }));
    
    setNodes(nodesWithHandlers);
    setEdges(newEdges);
  }, [agents, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
  }, []);

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="workflow-graph bg-gray-900 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-100">Workflow Visualizer</h3>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>{agents.length} agents</span>
          <span>{edges.length} connections</span>
        </div>
      </div>

      <div style={{ height }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          attributionPosition="bottom-left"
        >
          <Background color="#374151" gap={16} />
          <Controls className="bg-gray-800 border-gray-700" />
          <MiniMap 
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="bg-gray-800 border-gray-700"
          />
          
          <Panel position="top-right" className="bg-gray-800/90 p-3 rounded-lg border border-gray-700">
            <h4 className="text-sm font-medium text-gray-200 mb-2">Legend</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-gray-400">Running</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-400">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-gray-400">Failed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-gray-400">Pending</span>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <div className="p-4 border-t border-gray-800 bg-gray-800/50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Selected: <span className="font-mono text-gray-200">{selectedNode}</span>
            </p>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
