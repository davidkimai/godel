/**
 * Workflow Engine - DAG-based execution engine with complex orchestration
 * 
 * Features:
 * - 6 node types: task, condition, parallel, merge, delay, sub-workflow
 * - Full DAG support with cycle detection
 * - Variable substitution with ${var} syntax
 * - Expression evaluation for conditions
 * - Error handling with retries and backoff
 * - Event publishing throughout execution lifecycle
 * - Progress tracking and status reporting
 */

import { randomUUID } from 'crypto';
import {
  Workflow,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowNodeStatus,
  WorkflowInstance,
  WorkflowInstanceStatus,
  NodeState,
  WorkflowStatus,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowEdge,
  NodeConfig,
  TaskNodeConfig,
  ConditionNodeConfig,
  ParallelNodeConfig,
  MergeNodeConfig,
  DelayNodeConfig,
  SubWorkflowNodeConfig,
  AgentSelectionCriteria,
  TaskExecutor,
  AgentSelector,
  EventBus,
  WorkflowValidationResult,
  DAGValidationResult,
  WorkflowEngineOptions,
  DefaultWorkflowEngineOptions,
} from './types';

// ============================================================================
// Workflow Engine
// ============================================================================

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private instances: Map<string, WorkflowInstance> = new Map();
  private options: WorkflowEngineOptions;

  constructor(
    private taskExecutor: TaskExecutor,
    private agentSelector: AgentSelector,
    private eventBus: EventBus,
    options: Partial<WorkflowEngineOptions> = {}
  ) {
    this.options = { ...DefaultWorkflowEngineOptions, ...options };
  }

  // ============================================================================
  // Workflow Registration
  // ============================================================================

  register(workflow: Workflow): void {
    const validation = this.validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }
    this.workflows.set(workflow.id, workflow);
  }

  unregister(workflowId: string): boolean {
    return this.workflows.delete(workflowId);
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  // ============================================================================
  // Workflow Execution
  // ============================================================================

  async start(
    workflowId: string, 
    inputs: Record<string, unknown> = {},
    parentInstanceId?: string
  ): Promise<string> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const instanceId = this.generateInstanceId();
    
    // Initialize variables with defaults and inputs
    const variables = this.initializeVariables(workflow.variables || [], inputs);

    // Initialize node states
    const nodeStates = new Map<string, NodeState>();
    for (const node of workflow.nodes) {
      nodeStates.set(node.id, {
        nodeId: node.id,
        status: WorkflowNodeStatus.PENDING,
        attempts: 0,
        maxAttempts: this.getMaxAttempts(node.config),
      });
    }

    // Find start nodes (no incoming edges and not referenced as parallel branches)
    const incomingEdges = this.buildIncomingEdgeMap(workflow.edges);
    const parallelBranches = this.getParallelBranchNodes(workflow);
    const startNodes = workflow.nodes
      .filter(n => !incomingEdges.has(n.id) && !parallelBranches.has(n.id))
      .map(n => n.id);

    if (startNodes.length === 0 && workflow.nodes.length > 0) {
      throw new Error('Workflow has no start nodes (all nodes have incoming edges)');
    }

    const instance: WorkflowInstance = {
      id: instanceId,
      workflowId,
      status: WorkflowInstanceStatus.RUNNING,
      variables,
      nodeStates,
      currentNodes: startNodes,
      completedNodes: new Set(),
      failedNodes: new Set(),
      startedAt: Date.now(),
      results: new Map(),
      parentInstanceId,
      rootInstanceId: parentInstanceId 
        ? this.instances.get(parentInstanceId)?.rootInstanceId || parentInstanceId
        : instanceId,
    };

    this.instances.set(instanceId, instance);

    // Publish start event
    this.publishEvent('workflow:started', instanceId, workflowId, undefined, {
      startNodes,
      variables: Object.keys(variables),
    });

    // Start execution
    if (startNodes.length > 0) {
      this.executeNodes(instanceId, startNodes);
    } else {
      // No nodes to execute, mark as completed
      await this.completeWorkflow(instanceId);
    }

    return instanceId;
  }

  // ============================================================================
  // Node Execution
  // ============================================================================

  private async executeNodes(instanceId: string, nodeIds: string[]): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== WorkflowInstanceStatus.RUNNING) return;

    // Update current nodes
    instance.currentNodes = Array.from(new Set([...instance.currentNodes, ...nodeIds]));

    // Execute nodes with concurrency limit
    const executingNodes = new Set<string>();
    const queue = [...nodeIds];

    while (queue.length > 0 || executingNodes.size > 0) {
      // Start new executions up to the limit
      while (queue.length > 0 && executingNodes.size < this.options.maxConcurrentNodes) {
        const nodeId = queue.shift()!;
        executingNodes.add(nodeId);
        
        // Execute node asynchronously
        this.executeNode(instanceId, nodeId)
          .finally(() => {
            executingNodes.delete(nodeId);
          });
      }

      // Small delay to prevent tight loop
      if (queue.length > 0 || executingNodes.size > 0) {
        await this.delay(10);
      }
    }
  }

  private async executeNode(instanceId: string, nodeId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    const workflow = this.workflows.get(instance.workflowId)!;
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in workflow ${instance.workflowId}`);
    }

    const state = instance.nodeStates.get(nodeId)!;

    // Check if already completed or failed
    if (state.status === WorkflowNodeStatus.COMPLETED || 
        state.status === WorkflowNodeStatus.FAILED) {
      return;
    }

    state.status = WorkflowNodeStatus.RUNNING;
    state.startedAt = Date.now();
    state.attempts++;

    this.publishEvent('node:started', instanceId, instance.workflowId, nodeId, {
      attempt: state.attempts,
      nodeType: node.type,
    });

    try {
      const result = await this.executeNodeByType(instance, node, workflow);
      
      state.status = WorkflowNodeStatus.COMPLETED;
      state.completedAt = Date.now();
      state.result = result;
      instance.results.set(nodeId, result);
      instance.completedNodes.add(nodeId);

      // Remove from current nodes
      instance.currentNodes = instance.currentNodes.filter(id => id !== nodeId);

      this.publishEvent('node:completed', instanceId, instance.workflowId, nodeId, {
        result: this.serializableResult(result),
        duration: state.completedAt - state.startedAt,
      });

      // Find and execute next nodes
      const nextNodes = this.getNextNodes(workflow, nodeId, result, instance);
      if (nextNodes.length > 0) {
        await this.executeNodes(instanceId, nextNodes);
      } else {
        // Check if workflow is complete
        await this.checkCompletion(instanceId);
      }
    } catch (error) {
      await this.handleNodeError(instanceId, node, state, error as Error);
    }
  }

  private async executeNodeByType(
    instance: WorkflowInstance,
    node: WorkflowNode,
    workflow: Workflow
  ): Promise<unknown> {
    const config = node.config;

    switch (config.type) {
      case 'task':
        return this.executeTaskNode(instance, config);
        
      case 'condition': {
        // Get the result from the parent node (the one that triggered this condition)
        const parentResult = this.findParentResult(instance, workflow, node.id);
        return this.evaluateCondition(instance, config, parentResult);
      }
        
      case 'parallel':
        return this.executeParallelNode(instance, config, workflow);
        
      case 'merge':
        return this.executeMergeNode(instance, config, workflow);
        
      case 'delay':
        return this.executeDelayNode(instance, config);
        
      case 'sub-workflow':
        return this.executeSubWorkflow(instance, config);
        
      default:
        throw new Error(`Unknown node type: ${(config as NodeConfig).type}`);
    }
  }

  // ============================================================================
  // Task Node Execution
  // ============================================================================

  private async executeTaskNode(
    instance: WorkflowInstance,
    config: TaskNodeConfig
  ): Promise<unknown> {
    // Substitute variables in parameters
    const parameters = this.substituteVariables(config.parameters, instance.variables);
    
    // Select agent
    const agent = await this.agentSelector.selectAgent(
      config.agentSelector || { strategy: 'balanced' }
    );

    try {
      // Execute task
      const result = await this.taskExecutor.execute(agent.id, {
        type: config.taskType,
        parameters,
        timeout: config.timeout || this.options.defaultTaskTimeout,
      });

      return result;
    } finally {
      // Release agent
      await this.agentSelector.releaseAgent(agent.id);
    }
  }

  // ============================================================================
  // Condition Node Evaluation
  // ============================================================================

  private evaluateCondition(
    instance: WorkflowInstance,
    config: ConditionNodeConfig,
    parentResult?: unknown
  ): { branch: string; result: boolean; evaluatedCondition: string } {
    // Create context with instance variables and parent result
    const context = {
      ...instance.variables,
      result: parentResult,
    };
    const substituted = this.substituteExpression(config.condition, context);
    const result = this.evaluateExpression(substituted);
    
    return {
      branch: result ? config.trueBranch : config.falseBranch,
      result,
      evaluatedCondition: substituted,
    };
  }

  private findParentResult(
    instance: WorkflowInstance,
    workflow: Workflow,
    nodeId: string
  ): unknown {
    // Find edges that point to this node
    const parentEdges = workflow.edges.filter(e => e.to === nodeId);
    if (parentEdges.length === 0) return undefined;
    
    // Get the result from the first parent (for now)
    const parentId = parentEdges[0].from;
    return instance.results.get(parentId);
  }

  // ============================================================================
  // Parallel Node Execution
  // ============================================================================

  private async executeParallelNode(
    instance: WorkflowInstance,
    config: ParallelNodeConfig,
    workflow: Workflow
  ): Promise<unknown> {
    // Execute branches directly and return results
    // The branches will also be executed via normal flow since they're start nodes
    const promises = config.branches.map(async (branchId) => {
      const node = workflow.nodes.find(n => n.id === branchId);
      if (!node) {
        throw new Error(`Parallel branch node ${branchId} not found`);
      }
      // Execute through full node lifecycle
      await this.executeNodeInternal(instance.id, branchId, instance, workflow);
      return instance.results.get(branchId);
    });

    if (config.waitFor === 'all') {
      return Promise.all(promises);
    } else if (config.waitFor === 'any') {
      const result = await Promise.race(promises);
      // Wait for remaining branches in background
      return [result];
    } else if (typeof config.waitFor === 'number') {
      // Wait for N results
      const results: unknown[] = [];
      let completed = 0;
      
      return new Promise((resolve) => {
        promises.forEach(p => {
          p.then((r) => {
            results.push(r);
            completed++;
            if (completed === config.waitFor) {
              resolve(results.slice(0, config.waitFor as number));
            }
          }).catch(() => {
            completed++;
          });
        });
      });
    }

    return Promise.all(promises);
  }

  private async executeNodeInternal(
    instanceId: string,
    nodeId: string,
    instance: WorkflowInstance,
    workflow: Workflow
  ): Promise<void> {
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const state = instance.nodeStates.get(nodeId)!;

    // Skip if already processed
    if (state.status === WorkflowNodeStatus.COMPLETED || 
        state.status === WorkflowNodeStatus.FAILED ||
        state.status === WorkflowNodeStatus.SKIPPED) {
      return;
    }

    state.status = WorkflowNodeStatus.RUNNING;
    state.startedAt = Date.now();
    state.attempts++;

    try {
      const result = await this.executeNodeByType(instance, node, workflow);
      
      state.status = WorkflowNodeStatus.COMPLETED;
      state.completedAt = Date.now();
      state.result = result;
      instance.results.set(nodeId, result);
      instance.completedNodes.add(nodeId);
    } catch (error) {
      state.status = WorkflowNodeStatus.FAILED;
      state.error = {
        message: (error as Error).message,
      };
      instance.failedNodes.add(nodeId);
      throw error;
    }
  }

  // ============================================================================
  // Merge Node Execution
  // ============================================================================

  private executeMergeNode(
    instance: WorkflowInstance,
    config: MergeNodeConfig,
    workflow: Workflow
  ): unknown {
    // Find all completed parent nodes
    const parentResults: unknown[] = [];
    for (const edge of workflow.edges) {
      if (edge.to === instance.currentNodes[0]) {
        const parentState = instance.nodeStates.get(edge.from);
        if (parentState?.status === WorkflowNodeStatus.COMPLETED) {
          parentResults.push(parentState.result);
        }
      }
    }

    switch (config.strategy) {
      case 'collect':
        return parentResults;
      case 'first':
        return parentResults[0];
      case 'last':
        return parentResults[parentResults.length - 1];
      case 'concat':
        return parentResults.reduce((acc, val) => {
          if (Array.isArray(val)) {
            return [...(acc as unknown[]), ...val];
          }
          return [...(acc as unknown[]), val];
        }, []);
      case 'reduce':
        if (config.reduceFunction) {
          // Custom reduce function - simplified to sum for numbers
          return parentResults.reduce((a: unknown, b: unknown) => {
            if (typeof a === 'number' && typeof b === 'number') {
              return a + b;
            }
            return b;
          }, parentResults[0]);
        }
        return parentResults[0];
      default:
        return parentResults;
    }
  }

  // ============================================================================
  // Delay Node Execution
  // ============================================================================

  private async executeDelayNode(
    instance: WorkflowInstance,
    config: DelayNodeConfig
  ): Promise<unknown> {
    let duration: number;

    if (config.until) {
      const untilTime = new Date(config.until).getTime();
      duration = Math.max(0, untilTime - Date.now());
    } else {
      duration = config.duration;
    }

    await this.delay(duration);

    return { 
      delayed: duration,
      resumedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Sub-Workflow Execution
  // ============================================================================

  private async executeSubWorkflow(
    instance: WorkflowInstance,
    config: SubWorkflowNodeConfig
  ): Promise<unknown> {
    // Map inputs from parent variables
    const inputs: Record<string, unknown> = {};
    for (const [key, varPath] of Object.entries(config.inputs)) {
      inputs[key] = this.getVariableByPath(instance.variables, varPath);
    }

    // Start sub-workflow
    const subInstanceId = await this.start(
      config.workflowId, 
      inputs,
      instance.id
    );

    if (config.waitForCompletion !== false) {
      // Wait for sub-workflow completion (polling-based for now)
      return this.waitForSubWorkflow(subInstanceId, config);
    }

    return { subInstanceId };
  }

  private async waitForSubWorkflow(
    subInstanceId: string,
    config: SubWorkflowNodeConfig
  ): Promise<unknown> {
    const timeout = config.timeout || this.options.subWorkflowTimeout;
    const startTime = Date.now();
    const pollInterval = 100; // 100ms polling

    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        const subInstance = this.instances.get(subInstanceId);
        
        if (!subInstance) {
          reject(new Error(`Sub-workflow instance ${subInstanceId} not found`));
          return;
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Sub-workflow ${subInstanceId} timed out`));
          return;
        }

        // Check status
        if (subInstance.status === WorkflowInstanceStatus.COMPLETED) {
          resolve({
            subInstanceId,
            results: Object.fromEntries(subInstance.results),
            completedAt: subInstance.completedAt,
          });
        } else if (subInstance.status === WorkflowInstanceStatus.FAILED) {
          if (config.propagateErrors !== false) {
            reject(new Error(`Sub-workflow ${subInstanceId} failed`));
          } else {
            resolve({
              subInstanceId,
              error: 'Sub-workflow failed (errors not propagated)',
              status: 'failed',
            });
          }
        } else if (subInstance.status === WorkflowInstanceStatus.CANCELLED) {
          reject(new Error(`Sub-workflow ${subInstanceId} was cancelled`));
        } else {
          // Still running, poll again
          setTimeout(checkStatus, pollInterval);
        }
      };

      checkStatus();
    });
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  private async handleNodeError(
    instanceId: string,
    node: WorkflowNode,
    state: NodeState,
    error: Error
  ): Promise<void> {
    const instance = this.instances.get(instanceId)!;
    
    state.status = WorkflowNodeStatus.FAILED;
    state.error = {
      message: error.message,
      code: (error as { code?: string }).code,
      stack: error.stack,
    };

    instance.currentNodes = instance.currentNodes.filter(id => id !== node.id);

    this.publishEvent('node:failed', instanceId, instance.workflowId, node.id, {
      error: error.message,
      attempt: state.attempts,
    });

    // Check if we should retry
    const maxAttempts = state.maxAttempts;
    if (state.attempts < maxAttempts) {
      const retryDelay = this.calculateRetryDelay(node.config, state.attempts);
      
      this.publishEvent('node:retrying', instanceId, instance.workflowId, node.id, {
        attempt: state.attempts + 1,
        maxAttempts,
        delay: retryDelay,
      });

      await this.delay(retryDelay);
      
      // Retry
      if (instance.status === WorkflowInstanceStatus.RUNNING) {
        // Reset status to pending for retry
        state.status = WorkflowNodeStatus.PENDING;
        await this.executeNode(instanceId, node.id);
        return;
      }
    }

    // No more retries - add to failed nodes
    instance.failedNodes.add(node.id);

    // Handle workflow failure
    const workflow = this.workflows.get(instance.workflowId)!;
    const onFailure = workflow.onFailure || 'stop';

    if (onFailure === 'stop') {
      await this.failWorkflow(instanceId, error.message, node.id);
    } else {
      // Continue - mark this node as skipped for completion purposes
      state.status = WorkflowNodeStatus.SKIPPED;
      state.completedAt = Date.now();
      instance.completedNodes.add(node.id);
      this.publishEvent('node:skipped', instanceId, instance.workflowId, node.id, {
        reason: 'Failed but continuing (onFailure=continue)',
      });
      
      // Continue to next nodes even though this one failed
      const nextNodes = this.getNextNodes(workflow, node.id, { error: error.message }, instance);
      if (nextNodes.length > 0) {
        await this.executeNodes(instanceId, nextNodes);
      } else {
        await this.checkCompletion(instanceId);
      }
    }
  }

  private calculateRetryDelay(config: NodeConfig, attempt: number): number {
    const taskConfig = config as TaskNodeConfig;
    const baseDelay = taskConfig.retryDelay || this.options.defaultRetryDelay;
    const backoff = taskConfig.retryBackoff || this.options.defaultRetryBackoff;

    switch (backoff) {
      case 'fixed':
        return baseDelay;
      case 'linear':
        return baseDelay * attempt;
      case 'exponential':
        return baseDelay * Math.pow(2, attempt - 1);
      default:
        return baseDelay;
    }
  }

  // ============================================================================
  // Workflow Completion
  // ============================================================================

  private async checkCompletion(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== WorkflowInstanceStatus.RUNNING) return;

    // First, check if there are any nodes still running
    if (instance.currentNodes.length > 0) {
      return;
    }

    const workflow = this.workflows.get(instance.workflowId)!;
    
    // Find all reached nodes (have been run or have incoming edges from completed nodes)
    const reachedNodes = this.findReachedNodes(workflow, instance);
    
    // Check if all reached terminal nodes are completed
    const outgoingEdges = this.buildOutgoingEdgeMap(workflow.edges);
    const terminalNodes = workflow.nodes.filter(n => !outgoingEdges.has(n.id));
    const reachedTerminalNodes = terminalNodes.filter(n => reachedNodes.has(n.id));

    const allReachedTerminalsCompleted = reachedTerminalNodes.every(n => {
      const state = instance.nodeStates.get(n.id);
      return state?.status === WorkflowNodeStatus.COMPLETED || 
             state?.status === WorkflowNodeStatus.FAILED ||
             state?.status === WorkflowNodeStatus.SKIPPED;
    });

    // If no nodes are running and all reached terminals are done, complete the workflow
    if (allReachedTerminalsCompleted && reachedTerminalNodes.length > 0) {
      await this.completeWorkflow(instanceId);
    } else if (reachedTerminalNodes.length === 0 && instance.completedNodes.size > 0) {
      // No terminal nodes reached yet but some work was done, check if we're stuck
      const hasUnprocessedNodes = workflow.nodes.some(n => {
        const state = instance.nodeStates.get(n.id);
        return state?.status === WorkflowNodeStatus.PENDING && reachedNodes.has(n.id);
      });
      if (!hasUnprocessedNodes) {
        await this.completeWorkflow(instanceId);
      }
    }
  }

  private findReachedNodes(workflow: Workflow, instance: WorkflowInstance): Set<string> {
    const reached = new Set<string>();
    
    // Start from completed nodes and traverse backwards to find all reached nodes
    for (const completedId of Array.from(instance.completedNodes)) {
      reached.add(completedId);
      this.traverseBackwards(workflow, completedId, reached);
    }
    
    // Also add start nodes as reached
    const incomingEdges = this.buildIncomingEdgeMap(workflow.edges);
    const parallelBranches = this.getParallelBranchNodes(workflow);
    for (const node of workflow.nodes) {
      if (!incomingEdges.has(node.id) && !parallelBranches.has(node.id)) {
        reached.add(node.id);
      }
    }
    
    return reached;
  }

  private traverseBackwards(workflow: Workflow, nodeId: string, reached: Set<string>): void {
    // Find all nodes that have edges to this node
    for (const edge of workflow.edges) {
      if (edge.to === nodeId && !reached.has(edge.from)) {
        reached.add(edge.from);
        this.traverseBackwards(workflow, edge.from, reached);
      }
    }
  }

  private async completeWorkflow(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.status = WorkflowInstanceStatus.COMPLETED;
    instance.completedAt = Date.now();

    this.publishEvent('workflow:completed', instanceId, instance.workflowId, undefined, {
      duration: instance.completedAt - instance.startedAt,
      completedNodes: instance.completedNodes.size,
      failedNodes: instance.failedNodes.size,
    });
  }

  private async failWorkflow(instanceId: string, error: string, failedNodeId?: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.status = WorkflowInstanceStatus.FAILED;
    instance.completedAt = Date.now();

    this.publishEvent('workflow:failed', instanceId, instance.workflowId, failedNodeId, {
      error,
      failedNode: failedNodeId,
    });
  }

  // ============================================================================
  // Execution Control
  // ============================================================================

  pause(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== WorkflowInstanceStatus.RUNNING) return false;
    
    instance.status = WorkflowInstanceStatus.PAUSED;
    this.publishEvent('workflow:paused', instanceId, instance.workflowId);
    return true;
  }

  resume(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== WorkflowInstanceStatus.PAUSED) return false;
    
    instance.status = WorkflowInstanceStatus.RUNNING;
    this.publishEvent('workflow:resumed', instanceId, instance.workflowId);
    
    // Resume execution
    if (instance.currentNodes.length > 0) {
      this.executeNodes(instanceId, instance.currentNodes);
    } else {
      this.checkCompletion(instanceId);
    }
    return true;
  }

  cancel(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;
    
    instance.status = WorkflowInstanceStatus.CANCELLED;
    instance.completedAt = Date.now();
    
    this.publishEvent('workflow:cancelled', instanceId, instance.workflowId);
    return true;
  }

  // ============================================================================
  // Status and Queries
  // ============================================================================

  getInstance(instanceId: string): WorkflowInstance | undefined {
    return this.instances.get(instanceId);
  }

  getInstanceStatus(instanceId: string): WorkflowStatus | undefined {
    const instance = this.instances.get(instanceId);
    if (!instance) return undefined;

    return {
      id: instanceId,
      status: instance.status,
      progress: this.calculateProgress(instance),
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      currentNodes: instance.currentNodes,
      completedNodes: instance.completedNodes.size,
      totalNodes: instance.nodeStates.size,
      failedNodes: instance.failedNodes.size,
    };
  }

  getActiveInstances(): string[] {
    return Array.from(this.instances.entries())
      .filter(([_, instance]) => instance.status === WorkflowInstanceStatus.RUNNING)
      .map(([id, _]) => id);
  }

  private calculateProgress(instance: WorkflowInstance): number {
    const total = instance.nodeStates.size;
    if (total === 0) return 1;
    
    const completed = Array.from(instance.nodeStates.values())
      .filter(s => s.status === WorkflowNodeStatus.COMPLETED || 
                   s.status === WorkflowNodeStatus.FAILED ||
                   s.status === WorkflowNodeStatus.SKIPPED)
      .length;
    return completed / total;
  }

  // ============================================================================
  // Variable and Expression Handling
  // ============================================================================

  private initializeVariables(
    variables: { name: string; default?: unknown; required?: boolean }[],
    inputs: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const v of variables) {
      if (inputs[v.name] !== undefined) {
        result[v.name] = inputs[v.name];
      } else if (v.default !== undefined) {
        result[v.name] = v.default;
      } else if (v.required) {
        throw new Error(`Required variable ${v.name} not provided`);
      }
    }

    // Add any extra inputs
    for (const [key, value] of Object.entries(inputs)) {
      if (!(key in result)) {
        result[key] = value;
      }
    }

    return result;
  }

  private substituteVariables(
    obj: Record<string, unknown>,
    variables: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.substituteValue(value, variables);
    }
    
    return result;
  }

  private substituteValue(value: unknown, variables: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      // Replace ${variable} syntax
      return value.replace(/\$\{([^}]+)\}/g, (match, path) => {
        const varValue = this.getVariableByPath(variables, path);
        return varValue !== undefined ? String(varValue) : match;
      });
    } else if (Array.isArray(value)) {
      return value.map(v => this.substituteValue(v, variables));
    } else if (value && typeof value === 'object') {
      return this.substituteVariables(value as Record<string, unknown>, variables);
    }
    return value;
  }

  private substituteExpression(expression: string, variables: Record<string, unknown>): string {
    return expression.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const value = this.getVariableByPath(variables, path);
      return JSON.stringify(value);
    });
  }

  private getVariableByPath(variables: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let value: unknown = variables;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  private evaluateExpression(expression: string): boolean {
    try {
      // eslint-disable-next-line no-eval
      return eval(expression);
    } catch {
      return false;
    }
  }

  // ============================================================================
  // DAG Traversal
  // ============================================================================

  private getNextNodes(
    workflow: Workflow, 
    nodeId: string, 
    result: unknown,
    instance: WorkflowInstance
  ): string[] {
    const next: string[] = [];
    const node = workflow.nodes.find(n => n.id === nodeId);
    
    // Handle condition nodes specially - only follow the selected branch
    if (node?.config.type === 'condition') {
      const conditionResult = result as { branch: string; result: boolean; evaluatedCondition: string };
      if (conditionResult.branch) {
        // Find the edge that goes to the selected branch
        const targetEdge = workflow.edges.find(e => e.from === nodeId && e.to === conditionResult.branch);
        if (targetEdge) {
          next.push(conditionResult.branch);
        }
      }
      return next;
    }
    
    for (const edge of workflow.edges) {
      if (edge.from === nodeId) {
        // Check edge condition
        if (edge.condition) {
          const context = { ...instance.variables, result };
          const substituted = this.substituteExpression(edge.condition, context);
          const conditionMet = this.evaluateExpression(substituted);
          if (!conditionMet) continue;
        }
        next.push(edge.to);
      }
    }

    return next;
  }

  private buildIncomingEdgeMap(edges: WorkflowEdge[]): Map<string, number> {
    const incoming = new Map<string, number>();
    for (const edge of edges) {
      incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    }
    return incoming;
  }

  private buildOutgoingEdgeMap(edges: WorkflowEdge[]): Map<string, number> {
    const outgoing = new Map<string, number>();
    for (const edge of edges) {
      outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
    }
    return outgoing;
  }

  private getParallelBranchNodes(workflow: Workflow): Set<string> {
    const branches = new Set<string>();
    for (const node of workflow.nodes) {
      if (node.config.type === 'parallel') {
        const config = node.config as ParallelNodeConfig;
        for (const branchId of config.branches) {
          branches.add(branchId);
        }
      }
    }
    return branches;
  }

  // ============================================================================
  // Validation
  // ============================================================================

  validateWorkflow(workflow: Workflow): WorkflowValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!workflow.id) errors.push('Workflow ID is required');
    if (!workflow.name) errors.push('Workflow name is required');
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }

    // Check for duplicate node IDs
    const nodeIds = new Set<string>();
    for (const node of workflow.nodes || []) {
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // Validate edges reference valid nodes
    for (const edge of workflow.edges || []) {
      if (!nodeIds.has(edge.from)) {
        errors.push(`Edge references non-existent node: ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge references non-existent node: ${edge.to}`);
      }
    }

    // Check for cycles
    const dagValidation = this.validateDAG(workflow);
    if (dagValidation.hasCycle) {
      errors.push(`Workflow contains a cycle: ${dagValidation.cycle?.join(' -> ')}`);
    }

    // Validate condition nodes reference valid branches
    for (const node of workflow.nodes || []) {
      if (node.config.type === 'condition') {
        const config = node.config as ConditionNodeConfig;
        if (!nodeIds.has(config.trueBranch)) {
          errors.push(`Condition node ${node.id} references non-existent trueBranch: ${config.trueBranch}`);
        }
        if (!nodeIds.has(config.falseBranch)) {
          errors.push(`Condition node ${node.id} references non-existent falseBranch: ${config.falseBranch}`);
        }
      }
      if (node.config.type === 'parallel') {
        const config = node.config as ParallelNodeConfig;
        for (const branchId of config.branches) {
          if (!nodeIds.has(branchId)) {
            errors.push(`Parallel node ${node.id} references non-existent branch: ${branchId}`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateDAG(workflow: Workflow): DAGValidationResult {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycle: string[] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const edges = workflow.edges.filter(e => e.from === nodeId);
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          if (dfs(edge.to, path)) {
            return true;
          }
        } else if (recursionStack.has(edge.to)) {
          // Found cycle
          const cycleStart = path.indexOf(edge.to);
          cycle.push(...path.slice(cycleStart), edge.to);
          return true;
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return false;
    };

    let hasCycle = false;
    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id, [])) {
          hasCycle = true;
          break;
        }
      }
    }

    return {
      valid: !hasCycle,
      hasCycle,
      cycle: hasCycle ? cycle : undefined,
      disconnectedNodes: [],
      orphanedNodes: [],
      topologicalOrder: [],
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private generateInstanceId(): string {
    return `wf-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private getMaxAttempts(config: NodeConfig): number {
    if (config.type === 'task') {
      return (config as TaskNodeConfig).retries || this.options.defaultRetries;
    }
    return 1;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private serializableResult(result: unknown): unknown {
    if (result === null || result === undefined) return result;
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return result;
    }
    if (Array.isArray(result)) {
      return result.map(r => this.serializableResult(r));
    }
    if (typeof result === 'object') {
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
        obj[key] = this.serializableResult(value);
      }
      return obj;
    }
    return String(result);
  }

  private publishEvent(
    type: WorkflowEventType,
    instanceId: string,
    workflowId: string,
    nodeId?: string,
    data?: Record<string, unknown>
  ): void {
    if (!this.options.enableEventPublishing) return;

    const event: WorkflowEvent = {
      type,
      timestamp: Date.now(),
      instanceId,
      workflowId,
      nodeId,
      data,
    };

    this.eventBus.publish(type, event as unknown as Record<string, unknown>);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWorkflowEngine(
  taskExecutor: TaskExecutor,
  agentSelector: AgentSelector,
  eventBus: EventBus,
  options?: Partial<WorkflowEngineOptions>
): WorkflowEngine {
  return new WorkflowEngine(taskExecutor, agentSelector, eventBus, options);
}
