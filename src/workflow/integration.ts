/**
 * Workflow Event Bus Integration
 * 
 * Integrates the workflow engine with the Godel event bus for:
 * - Publishing workflow events
 * - Subscribing to workflow events
 * - Tracking workflow metrics
 */

import { AgentEventBus } from '../core/event-bus';
import { WorkflowEngine, WorkflowEvent, WorkflowEventType } from './types';

export interface WorkflowEventBusIntegration {
  start(): void;
  stop(): void;
}

export function createWorkflowEventBusIntegration(
  engine: WorkflowEngine,
  eventBus: AgentEventBus
): WorkflowEventBusIntegration {
  let isRunning = false;

  function mapWorkflowEventToAgentEvent(event: WorkflowEvent): Record<string, unknown> {
    const base = {
      timestamp: event.timestamp,
      executionId: event.executionId,
      workflowId: event.workflowId,
      stepId: event.stepId,
    };

    switch (event.type) {
      case 'workflow:start':
        return { type: 'workflow_start', ...base, ...event.data };
      case 'workflow:complete':
        return { type: 'workflow_complete', ...base, ...event.data };
      case 'workflow:fail':
        return { type: 'workflow_fail', ...base, ...event.data };
      case 'workflow:pause':
        return { type: 'workflow_pause', ...base, ...event.data };
      case 'workflow:resume':
        return { type: 'workflow_resume', ...base, ...event.data };
      case 'workflow:cancel':
        return { type: 'workflow_cancel', ...base, ...event.data };
      case 'step:start':
        return { type: 'step_start', ...base, ...event.data };
      case 'step:complete':
        return { type: 'step_complete', ...base, ...event.data };
      case 'step:fail':
        return { type: 'step_fail', ...base, ...event.data };
      case 'step:retry':
        return { type: 'step_retry', ...base, ...event.data };
      case 'step:skip':
        return { type: 'step_skip', ...base, ...event.data };
      case 'step:cancel':
        return { type: 'step_cancel', ...base, ...event.data };
      default:
        return { type: 'workflow_event', ...base, ...event.data };
    }
  }

  function handleWorkflowEvent(event: WorkflowEvent): void {
    if (!isRunning) return;

    const agentEvent = mapWorkflowEventToAgentEvent(event);
    
    // Emit to event bus
    eventBus.emitEvent({
      id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'tool_call_end', // Reuse existing type for compatibility
      timestamp: Date.now(),
      agentId: 'workflow-engine',
      teamId: event.workflowId,
      correlationId: event.executionId,
      tool: 'workflow_event',
      result: agentEvent,
      duration: 0,
      success: true,
    } as any);
  }

  return {
    start(): void {
      if (isRunning) return;
      isRunning = true;

      // Subscribe to all workflow events
      engine.on('workflow:event', handleWorkflowEvent);
      
      // Subscribe to specific events for detailed tracking
      const eventTypes: WorkflowEventType[] = [
        'workflow:start',
        'workflow:complete',
        'workflow:fail',
        'workflow:pause',
        'workflow:resume',
        'workflow:cancel',
        'step:start',
        'step:complete',
        'step:fail',
        'step:retry',
        'step:skip',
        'step:cancel',
      ];

      for (const eventType of eventTypes) {
        engine.on(eventType, handleWorkflowEvent);
      }
    },

    stop(): void {
      isRunning = false;
      engine.removeAllListeners('workflow:event');
      
      const eventTypes: WorkflowEventType[] = [
        'workflow:start',
        'workflow:complete',
        'workflow:fail',
        'workflow:pause',
        'workflow:resume',
        'workflow:cancel',
        'step:start',
        'step:complete',
        'step:fail',
        'step:retry',
        'step:skip',
        'step:cancel',
      ];

      for (const eventType of eventTypes) {
        engine.removeAllListeners(eventType);
      }
    },
  };
}

export default createWorkflowEventBusIntegration;
