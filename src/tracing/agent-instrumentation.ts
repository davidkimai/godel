/**
 * Agent Tracing Instrumentation
 * 
 * Instruments the agent lifecycle for distributed tracing.
 * Tracks agent spawn, execution, and completion with proper
 * parent-child span relationships.
 */

import { logger } from '../utils/logger';
import { SpanKind, SpanStatusCode, type Span, type Context } from '@opentelemetry/api';
import { 
  withSpan, 
  createSpan, 
  setBaggage, 
  getBaggage, 
  serializeContext,
  deserializeContext,
  getCurrentTraceId,
  type EventContext 
} from './opentelemetry';
import type { AgentLifecycle, AgentState, LifecycleState } from '../core/lifecycle';
import type { Agent } from '../models/agent';

// ============================================================================
// Types
// ============================================================================

export interface AgentTraceContext {
  agentId: string;
  teamId?: string;
  parentAgentId?: string;
  traceContext: EventContext;
}

// ============================================================================
// Span Names
// ============================================================================

const SPAN_NAMES = {
  AGENT_SPAWN: 'agent.spawn',
  AGENT_START: 'agent.start',
  AGENT_EXECUTE: 'agent.execute',
  AGENT_COMPLETE: 'agent.complete',
  AGENT_PAUSE: 'agent.pause',
  AGENT_RESUME: 'agent.resume',
  AGENT_RETRY: 'agent.retry',
  AGENT_FAIL: 'agent.fail',
  AGENT_KILL: 'agent.kill',
  AGENT_ESCALATE: 'agent.escalate',
} as const;

// ============================================================================
// Instrumentation Decorators
// ============================================================================

/**
 * Instrument agent spawn operation
 */
export async function instrumentAgentSpawn<T>(
  agent: Agent,
  fn: () => Promise<T>
): Promise<T> {
  const attributes = {
    'agent.id': agent.id,
    'agent.model': agent.model,
    'agent.task': agent.task.slice(0, 100), // Truncate long tasks
    'agent.team_id': agent['teamId'] || '',
    'agent.parent_id': agent.parentId || '',
    'agent.label': agent.label || '',
  };

  // Set baggage for cross-cutting concerns
  setBaggage('agent.id', agent.id);
  if (agent['teamId']) {
    setBaggage('team.id', agent['teamId']);
  }

  return withSpan(SPAN_NAMES.AGENT_SPAWN, async (span) => {
    span.setAttributes(attributes);
    
    try {
      const result = await fn();
      span.setAttribute('agent.spawn_success', true);
      logger.debug(`[AgentTracing] Agent ${agent.id} spawned successfully`);
      return result;
    } catch (error) {
      span.setAttribute('agent.spawn_success', false);
      span.setAttribute('error.type', error instanceof Error ? error.name : 'Unknown');
      throw error;
    }
  }, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
}

/**
 * Instrument agent execution
 */
export async function instrumentAgentExecution<T>(
  agentId: string,
  task: string,
  fn: (span: Span) => Promise<T>,
  parentContext?: Context
): Promise<T> {
  return withSpan(SPAN_NAMES.AGENT_EXECUTE, async (span) => {
    span.setAttributes({
      'agent.id': agentId,
      'agent.task': task.slice(0, 100),
    });

    const startTime = Date.now();
    
    try {
      const result = await fn(span);
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'agent.execution_duration_ms': duration,
        'agent.execution_success': true,
      });
      
      return result;
    } catch (error) {
      span.setAttributes({
        'agent.execution_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  }, {
    kind: SpanKind.INTERNAL,
    parentContext,
  });
}

/**
 * Instrument agent state transition
 */
export async function instrumentAgentStateTransition<T>(
  agentId: string,
  fromState: LifecycleState,
  toState: LifecycleState,
  fn: () => Promise<T>
): Promise<T> {
  const spanName = SPAN_NAMES[`AGENT_${toState.toUpperCase()}` as keyof typeof SPAN_NAMES] || 'agent.state_transition';
  
  return withSpan(spanName, async (span) => {
    span.setAttributes({
      'agent.id': agentId,
      'agent.state.from': fromState,
      'agent.state.to': toState,
    });

    try {
      const result = await fn();
      span.setAttribute('agent.state_transition_success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'agent.state_transition_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

// ============================================================================
// Lifecycle Wrapper
// ============================================================================

/**
 * Wrap AgentLifecycle methods with tracing
 */
export function instrumentAgentLifecycle(lifecycle: AgentLifecycle): AgentLifecycle {
  const originalSpawn = lifecycle.spawn.bind(lifecycle);
  const originalStartAgent = lifecycle.startAgent.bind(lifecycle);
  const originalPause = lifecycle.pause.bind(lifecycle);
  const originalResume = lifecycle.resume.bind(lifecycle);
  const originalKill = lifecycle.kill.bind(lifecycle);
  const originalComplete = lifecycle.complete.bind(lifecycle);
  const originalFail = lifecycle.fail.bind(lifecycle);
  const originalRetry = lifecycle.retry.bind(lifecycle);

  // Override spawn
  lifecycle.spawn = async (options) => {
    return instrumentAgentSpawn(
      { id: 'pending', ...options } as unknown as Agent,
      () => originalSpawn(options)
    );
  };

  // Override start
  lifecycle.startAgent = async (agentId) => {
    const state = lifecycle.getState(agentId);
    return instrumentAgentStateTransition(
      agentId,
      state?.lifecycleState || 'spawning',
      'running',
      () => originalStartAgent(agentId)
    );
  };

  // Override pause
  lifecycle.pause = async (agentId) => {
    const state = lifecycle.getState(agentId);
    return instrumentAgentStateTransition(
      agentId,
      state?.lifecycleState || 'running',
      'paused',
      () => originalPause(agentId)
    );
  };

  // Override resume
  lifecycle.resume = async (agentId) => {
    const state = lifecycle.getState(agentId);
    return instrumentAgentStateTransition(
      agentId,
      state?.lifecycleState || 'paused',
      'running',
      () => originalResume(agentId)
    );
  };

  // Override kill
  lifecycle.kill = async (agentId, force) => {
    const state = lifecycle.getState(agentId);
    return instrumentAgentStateTransition(
      agentId,
      state?.lifecycleState || 'running',
      'killed',
      () => originalKill(agentId, force)
    );
  };

  // Override complete
  lifecycle.complete = async (agentId, output) => {
    const state = lifecycle.getState(agentId);
    return instrumentAgentStateTransition(
      agentId,
      state?.lifecycleState || 'running',
      'completed',
      () => originalComplete(agentId, output)
    );
  };

  // Override fail
  lifecycle.fail = async (agentId, error, options) => {
    const state = lifecycle.getState(agentId);
    return withSpan(SPAN_NAMES.AGENT_FAIL, async (span) => {
      span.setAttributes({
        'agent.id': agentId,
        'agent.error': error.slice(0, 500),
        'agent.retry_count': state?.retryCount || 0,
      });
      
      try {
        const result = await originalFail(agentId, error, options);
        span.setAttribute('agent.will_retry', state ? state.retryCount < state.maxRetries : false);
        return result;
      } catch (err) {
        span.setAttribute('agent.will_retry', false);
        throw err;
      }
    });
  };

  // Override retry
  lifecycle.retry = async (agentId, options) => {
    const state = lifecycle.getState(agentId);
    return instrumentAgentStateTransition(
      agentId,
      state?.lifecycleState || 'failed',
      'retrying',
      () => originalRetry(agentId, options)
    );
  };

  logger.info('[AgentTracing] AgentLifecycle instrumented with tracing');
  return lifecycle;
}

// ============================================================================
// Trace Context Serialization
// ============================================================================

/**
 * Create trace context for agent spawn
 * This context can be passed to child agents for trace correlation
 */
export function createAgentTraceContext(
  agentId: string,
  teamId?: string,
  parentAgentId?: string
): AgentTraceContext {
  return {
    agentId,
    teamId,
    parentAgentId,
    traceContext: serializeContext(),
  };
}

/**
 * Restore trace context from agent trace context
 */
export function restoreAgentTraceContext(ctx: AgentTraceContext): Context {
  const restoredContext = deserializeContext(ctx.traceContext);
  
  // Set additional baggage
  if (ctx['teamId']) {
    setBaggage('team.id', ctx['teamId']);
  }
  if (ctx.parentAgentId) {
    setBaggage('agent.parent_id', ctx.parentAgentId);
  }
  
  return restoredContext;
}

// ============================================================================
// Metrics and Logging
// ============================================================================

/**
 * Log agent event with trace correlation
 */
export function logAgentEvent(
  eventType: string,
  agentId: string,
  data?: Record<string, unknown>
): void {
  const traceId = getCurrentTraceId();
  const teamId = getBaggage('team.id');
  
  logger.info(`[AgentTracing] ${eventType}`, {
    event: eventType,
    agent_id: agentId,
    team_id: teamId,
    trace_id: traceId,
    ...data,
  });
}

// ============================================================================
// Exports
// ============================================================================

export { SPAN_NAMES };
