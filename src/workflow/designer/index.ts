/**
 * Workflow Designer - JSON-based workflow editor
 * 
 * A programmatic API for building and editing workflows.
 * Can be used to create visual editors or CLI tools.
 */

import { randomUUID } from 'crypto';
import {
  Workflow,
  WorkflowStep,
  WorkflowValidationResult,
  DependencyGraph,
} from '../types';
import { validateWorkflow, workflowToYaml, workflowToJson } from '../parser';
import { buildDependencyGraph, topologicalSort } from '../dag';

// ============================================================================
// Designer Types
// ============================================================================

export interface DesignerNode {
  id: string;
  stepId: string;
  name: string;
  x: number;
  y: number;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface DesignerEdge {
  id: string;
  from: string;
  to: string;
  type: 'dependency' | 'next';
}

export interface DesignerState {
  workflow: Workflow;
  nodes: DesignerNode[];
  edges: DesignerEdge[];
  selectedNodeId?: string;
  validation: WorkflowValidationResult;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  startX: number;
  startY: number;
}

export const DefaultLayoutOptions: LayoutOptions = {
  nodeWidth: 150,
  nodeHeight: 60,
  horizontalSpacing: 50,
  verticalSpacing: 80,
  startX: 50,
  startY: 50,
};

// ============================================================================
// Workflow Designer Class
// ============================================================================

export class WorkflowDesigner {
  private state: DesignerState;
  private layoutOptions: LayoutOptions;

  constructor(workflow?: Partial<Workflow>, layoutOptions?: Partial<LayoutOptions>) {
    this.layoutOptions = { ...DefaultLayoutOptions, ...layoutOptions };
    
    const workflowWithDefaults: Workflow = {
      name: workflow?.name || 'new-workflow',
      description: workflow?.description,
      version: workflow?.version || '1.0.0',
      steps: workflow?.steps || [],
      onFailure: workflow?.onFailure || 'stop',
      variables: workflow?.variables,
      timeout: workflow?.timeout,
      metadata: workflow?.metadata,
    };

    this.state = {
      workflow: workflowWithDefaults,
      nodes: [],
      edges: [],
      validation: { valid: true, errors: [], warnings: [] },
    };

    this.rebuildGraph();
  }

  // ============================================================================
  // Graph Building
  // ============================================================================

  private rebuildGraph(): void {
    const graph = buildDependencyGraph(this.state.workflow);
    const validation = validateWorkflow(this.state.workflow);
    
    // Build nodes with layout
    const nodes: DesignerNode[] = graph.nodes.map(node => ({
      id: `node_${node.id}`,
      stepId: node.id,
      name: node.name,
      x: this.layoutOptions.startX + node.layer * (this.layoutOptions.nodeWidth + this.layoutOptions.horizontalSpacing),
      y: this.layoutOptions.startY + this.calculateYPosition(node.id, graph.layers),
      status: node.status as any,
    }));

    // Build edges
    const edges: DesignerEdge[] = graph.edges.map((edge, index) => ({
      id: `edge_${index}`,
      from: edge.from,
      to: edge.to,
      type: edge.type,
    }));

    this.state = {
      ...this.state,
      nodes,
      edges,
      validation,
    };
  }

  private calculateYPosition(stepId: string, layers: string[][]): number {
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const stepIndex = layers[layerIndex].indexOf(stepId);
      if (stepIndex >= 0) {
        return stepIndex * (this.layoutOptions.nodeHeight + this.layoutOptions.verticalSpacing);
      }
    }
    return 0;
  }

  // ============================================================================
  // Step Management
  // ============================================================================

  addStep(step: Partial<WorkflowStep> & { name: string; agent: string; task: string }): string {
    const id = step.id || `step_${randomUUID().slice(0, 8)}`;
    
    const newStep: WorkflowStep = {
      id,
      name: step.name,
      description: step.description,
      agent: step.agent,
      task: step.task,
      dependsOn: step.dependsOn || [],
      next: step.next || [],
      condition: step.condition,
      retry: step.retry,
      timeout: step.timeout,
      inputs: step.inputs,
      outputs: step.outputs,
      parallel: step.parallel || false,
      metadata: step.metadata,
    };

    this.state.workflow.steps.push(newStep);
    this.rebuildGraph();
    
    return id;
  }

  updateStep(stepId: string, updates: Partial<WorkflowStep>): boolean {
    const index = this.state.workflow.steps.findIndex(s => s.id === stepId);
    if (index === -1) return false;

    this.state.workflow.steps[index] = {
      ...this.state.workflow.steps[index],
      ...updates,
    };

    this.rebuildGraph();
    return true;
  }

  removeStep(stepId: string): boolean {
    const index = this.state.workflow.steps.findIndex(s => s.id === stepId);
    if (index === -1) return false;

    // Remove step
    this.state.workflow.steps.splice(index, 1);

    // Update references in other steps
    for (const step of this.state.workflow.steps) {
      step.dependsOn = step.dependsOn.filter(id => id !== stepId);
      step.next = step.next.filter(id => id !== stepId);
    }

    this.rebuildGraph();
    return true;
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  connectSteps(fromId: string, toId: string, type: 'dependency' | 'next' = 'next'): boolean {
    const fromStep = this.state.workflow.steps.find(s => s.id === fromId);
    const toStep = this.state.workflow.steps.find(s => s.id === toId);

    if (!fromStep || !toStep) return false;

    if (type === 'next') {
      if (!fromStep.next.includes(toId)) {
        fromStep.next.push(toId);
      }
    } else {
      if (!toStep.dependsOn.includes(fromId)) {
        toStep.dependsOn.push(fromId);
      }
    }

    this.rebuildGraph();
    return true;
  }

  disconnectSteps(fromId: string, toId: string, type: 'dependency' | 'next' = 'next'): boolean {
    const fromStep = this.state.workflow.steps.find(s => s.id === fromId);
    const toStep = this.state.workflow.steps.find(s => s.id === toId);

    if (!fromStep || !toStep) return false;

    if (type === 'next') {
      fromStep.next = fromStep.next.filter(id => id !== toId);
    } else {
      toStep.dependsOn = toStep.dependsOn.filter(id => id !== fromId);
    }

    this.rebuildGraph();
    return true;
  }

  // ============================================================================
  // Workflow Properties
  // ============================================================================

  setName(name: string): void {
    this.state.workflow.name = name;
    this.rebuildGraph();
  }

  setDescription(description: string): void {
    this.state.workflow.description = description;
    this.rebuildGraph();
  }

  setVariable(name: string, value: unknown): void {
    if (!this.state.workflow.variables) {
      this.state.workflow.variables = {};
    }
    this.state.workflow.variables[name] = value;
    this.rebuildGraph();
  }

  removeVariable(name: string): void {
    if (this.state.workflow.variables) {
      delete this.state.workflow.variables[name];
    }
    this.rebuildGraph();
  }

  // ============================================================================
  // Validation
  // ============================================================================

  validate(): WorkflowValidationResult {
    this.rebuildGraph();
    return this.state.validation;
  }

  isValid(): boolean {
    return this.validate().valid;
  }

  // ============================================================================
  // Execution Preview
  // ============================================================================

  getExecutionOrder(): string[][] {
    const result = topologicalSort(this.state.workflow);
    if (result.hasCycle) return [];
    return result.ordered;
  }

  getCriticalPath(): string[] {
    const { getCriticalPath } = require('../dag');
    return getCriticalPath(this.state.workflow);
  }

  // ============================================================================
  // Export
  // ============================================================================

  toWorkflow(): Workflow {
    return { ...this.state.workflow };
  }

  toYaml(): string {
    return workflowToYaml(this.state.workflow);
  }

  toJson(pretty = true): string {
    return workflowToJson(this.state.workflow, pretty);
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getState(): DesignerState {
    return { ...this.state };
  }

  getNodes(): DesignerNode[] {
    return [...this.state.nodes];
  }

  getEdges(): DesignerEdge[] {
    return [...this.state.edges];
  }

  getStep(stepId: string): WorkflowStep | undefined {
    return this.state.workflow.steps.find(s => s.id === stepId);
  }

  getSelectedNode(): DesignerNode | undefined {
    if (!this.state.selectedNodeId) return undefined;
    return this.state.nodes.find(n => n.id === this.state.selectedNodeId);
  }

  // ============================================================================
  // Selection
  // ============================================================================

  selectNode(nodeId: string | undefined): void {
    this.state.selectedNodeId = nodeId;
  }

  selectStep(stepId: string | undefined): void {
    if (!stepId) {
      this.state.selectedNodeId = undefined;
      return;
    }
    const node = this.state.nodes.find(n => n.stepId === stepId);
    this.state.selectedNodeId = node?.id;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWorkflowDesigner(
  workflow?: Partial<Workflow>,
  layoutOptions?: Partial<LayoutOptions>
): WorkflowDesigner {
  return new WorkflowDesigner(workflow, layoutOptions);
}

export default WorkflowDesigner;
