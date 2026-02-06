/**
 * SessionTree Component
 * 
 * Interactive tree visualization for session branches and agent actions.
 */

import React, { useState, useCallback } from 'react';
import {
  GitBranch,
  GitCommit,
  MessageSquare,
  Wrench,
  ChevronRight,
  ChevronDown,
  Circle,
  Plus,
  GitMerge,
  MoreVertical,
  Clock,
  User,
  Box
} from 'lucide-react';
import { Card, Badge, Button } from './Layout';
import { cn, formatRelativeTime } from '../types/index';

// ============================================================================
// Types
// ============================================================================

interface TreeNode {
  id: string;
  type: 'message' | 'agent_action' | 'branch_point' | 'root' | 'tool_call';
  parentId: string | null;
  timestamp: string;
  label?: string;
  branchName?: string;
  depth: number;
  hasChildren: boolean;
  children: TreeNode[];
  metadata?: Record<string, unknown>;
  content?: string;
  role?: 'user' | 'assistant' | 'system';
  action?: string;
  tool?: string;
  agentId?: string;
}

interface TreeVisualization {
  sessionId: string;
  sessionName?: string;
  rootNodes: TreeNode[];
  totalNodes: number;
  branches: string[];
  currentBranch: string;
}

interface SessionTreeProps {
  tree: TreeVisualization | null;
  onBranchSelect?: (branchName: string) => void;
  onNodeSelect?: (node: TreeNode) => void;
  onCreateBranch?: (nodeId: string, name: string) => void;
  className?: string;
}

interface TreeNodeProps {
  node: TreeNode;
  isLast: boolean;
  expandedNodes: Set<string>;
  selectedNode: string | null;
  onToggle: (nodeId: string) => void;
  onSelect: (node: TreeNode) => void;
}

// ============================================================================
// Session Tree Component
// ============================================================================

export function SessionTree({
  tree,
  onBranchSelect,
  onNodeSelect,
  onCreateBranch,
  className
}: SessionTreeProps): React.ReactElement {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showNewBranchModal, setShowNewBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchFromNode, setBranchFromNode] = useState<string | null>(null);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const selectNode = useCallback((node: TreeNode) => {
    setSelectedNode(node.id);
    onNodeSelect?.(node);
  }, [onNodeSelect]);

  const handleCreateBranch = () => {
    if (branchFromNode && newBranchName.trim()) {
      onCreateBranch?.(branchFromNode, newBranchName.trim());
      setShowNewBranchModal(false);
      setNewBranchName('');
      setBranchFromNode(null);
    }
  };

  if (!tree) {
    return (
      <Card className={cn("p-8", className)}>
        <div className="flex flex-col items-center justify-center text-center">
          <GitBranch className="w-12 h-12 text-slate-700 mb-3" />
          <p className="text-slate-500">No session tree available</p>
          <p className="text-sm text-slate-600 mt-1">
            Branching is not enabled for this swarm
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            {tree.sessionName || 'Session Tree'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {tree.totalNodes} nodes · {tree.branches.length} branches
          </p>
        </div>
        
        {/* Branch Selector */}
        <div className="flex items-center gap-2">
          <select
            value={tree.currentBranch}
            onChange={(e) => onBranchSelect?.(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {tree.branches.map(branch => (
              <option key={branch} value={branch}>
                {branch === tree.currentBranch ? `${branch} (current)` : branch}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tree Content */}
      <div className="p-4 overflow-auto max-h-[500px]">
        <div className="space-y-1">
          {tree.rootNodes.map((node, index) => (
            <TreeNodeComponent
              key={node.id}
              node={node}
              isLast={index === tree.rootNodes.length - 1}
              expandedNodes={expandedNodes}
              selectedNode={selectedNode}
              onToggle={toggleNode}
              onSelect={selectNode}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 text-xs text-slate-500">
        <span>Session ID: {tree.sessionId.slice(0, 16)}...</span>
        <span>Current: {tree.currentBranch}</span>
      </div>

      {/* New Branch Modal */}
      {showNewBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-slate-900 rounded-lg border border-slate-800 p-4">
            <h4 className="font-semibold text-white mb-3">Create New Branch</h4>
            <input
              type="text"
              placeholder="Branch name..."
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNewBranchModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateBranch} disabled={!newBranchName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Tree Node Component
// ============================================================================

function TreeNodeComponent({
  node,
  isLast,
  expandedNodes,
  selectedNode,
  onToggle,
  onSelect
}: TreeNodeProps): React.ReactElement {
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNode === node.id;
  const hasChildren = node.hasChildren || node.children.length > 0;

  const renderIcon = () => {
    const iconClass = "w-4 h-4";
    switch (node.type) {
      case 'message':
        return <MessageSquare className={cn(iconClass, "text-blue-400")} />;
      case 'agent_action':
        return <User className={cn(iconClass, "text-purple-400")} />;
      case 'branch_point':
        return <GitBranch className={cn(iconClass, "text-emerald-400")} />;
      case 'tool_call':
        return <Wrench className={cn(iconClass, "text-amber-400")} />;
      case 'root':
        return <Circle className={cn(iconClass, "text-slate-400")} />;
      default:
        return <GitCommit className={cn(iconClass, "text-slate-400")} />;
    }
  };

  const getNodeColor = () => {
    switch (node.type) {
      case 'message': return 'border-l-blue-400';
      case 'agent_action': return 'border-l-purple-400';
      case 'branch_point': return 'border-l-emerald-400';
      case 'tool_call': return 'border-l-amber-400';
      default: return 'border-l-slate-400';
    }
  };

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors border-l-2",
          isSelected 
            ? "bg-emerald-500/10 border-l-emerald-500" 
            : "hover:bg-slate-800/50 border-l-transparent",
          !isSelected && getNodeColor()
        )}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Expand Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          className={cn(
            "p-0.5 rounded transition-colors",
            hasChildren ? "hover:bg-slate-700 text-slate-400" : "text-transparent"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Icon */}
        {renderIcon()}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300 truncate">
              {node.label || getNodeLabel(node)}
            </span>
            {node.branchName && (
              <Badge variant="success" className="text-xs">
                {node.branchName}
              </Badge>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <time className="text-xs text-slate-500">
          {formatRelativeTime(new Date(node.timestamp))}
        </time>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="relative">
          {/* Vertical line */}
          <div 
            className="absolute left-0 top-0 bottom-0 w-px bg-slate-800"
            style={{ left: `${(node.depth + 1) * 16 + 14}px` }}
          />
          {node.children.map((child, index) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              isLast={index === node.children.length - 1}
              expandedNodes={expandedNodes}
              selectedNode={selectedNode}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Branch Comparison Component
// ============================================================================

interface BranchComparisonProps {
  branches: {
    name: string;
    nodeCount: number;
    lastActivity: string;
    metrics: {
      messages: number;
      actions: number;
      tokens: number;
    };
  }[];
  onCompare?: (branchNames: string[]) => void;
  onMerge?: (fromBranch: string, toBranch: string) => void;
  className?: string;
}

export function BranchComparison({
  branches,
  onCompare,
  onMerge,
  className
}: BranchComparisonProps): React.ReactElement {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  const toggleBranch = (name: string) => {
    setSelectedBranches(prev => {
      if (prev.includes(name)) {
        return prev.filter(b => b !== name);
      }
      if (prev.length >= 2) {
        return [prev[1], name];
      }
      return [...prev, name];
    });
  };

  return (
    <Card className={cn("overflow-hidden", className)} title="Branch Comparison">
      <div className="p-4 space-y-4">
        {/* Branch List */}
        <div className="space-y-2">
          {branches.map(branch => (
            <div
              key={branch.name}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                selectedBranches.includes(branch.name)
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-slate-800/30 border-slate-800 hover:border-slate-700"
              )}
              onClick={() => toggleBranch(branch.name)}
            >
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                selectedBranches.includes(branch.name)
                  ? "bg-emerald-500 border-emerald-500"
                  : "border-slate-600"
              )}>
                {selectedBranches.includes(branch.name) && (
                  <CheckIcon className="w-3 h-3 text-white" />
                )}
              </div>

              <GitBranch className="w-4 h-4 text-slate-400" />

              <div className="flex-1">
                <p className="font-medium text-white">{branch.name}</p>
                <p className="text-xs text-slate-500">
                  {branch.nodeCount} nodes · Last active {formatRelativeTime(new Date(branch.lastActivity))}
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{branch.metrics.messages} msgs</span>
                <span>{branch.metrics.actions} actions</span>
                <span>{branch.metrics.tokens.toLocaleString()} tokens</span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {selectedBranches.length === 2 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <p className="text-sm text-slate-400">
              Comparing <span className="text-white">{selectedBranches[0]}</span> and{' '}
              <span className="text-white">{selectedBranches[1]}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => onCompare?.(selectedBranches)}>
                <GitMerge className="w-4 h-4 mr-1" />
                Compare
              </Button>
              <Button onClick={() => onMerge?.(selectedBranches[0], selectedBranches[1])}>
                Merge
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Helper Components & Functions
// ============================================================================

function CheckIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6L5 9L10 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getNodeLabel(node: TreeNode): string {
  switch (node.type) {
    case 'message':
      return node.role ? `${node.role}: ${node.content?.slice(0, 30) || 'Empty message'}...` : 'Message';
    case 'agent_action':
      return node.action || 'Agent action';
    case 'tool_call':
      return node.tool || 'Tool call';
    case 'branch_point':
      return node.branchName || 'Branch point';
    default:
      return node.id.slice(0, 8);
  }
}

export default SessionTree;
