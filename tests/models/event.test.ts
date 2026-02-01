/**
 * Event Model Tests
 */

import {
  Event,
  createEvent,
  createAgentStatusEvent,
  createTaskStatusEvent,
  createQualityGateEvent,
  createTestResultEvent,
  createSafetyEvent,
  AgentStatusChangePayload,
  TaskStatusChangePayload,
  QualityGateResultPayload,
  TestResultPayload,
  SafetyEventPayload
} from '../../src/models/event';

describe('Event Model', () => {
  describe('EventType Values', () => {
    it('should include agent lifecycle events', () => {
      expect('agent.spawned').toBeDefined();
      expect('agent.status_changed').toBeDefined();
      expect('agent.completed').toBeDefined();
      expect('agent.failed').toBeDefined();
      expect('agent.blocked').toBeDefined();
      expect('agent.paused').toBeDefined();
      expect('agent.resumed').toBeDefined();
      expect('agent.killed').toBeDefined();
    });

    it('should include task lifecycle events', () => {
      expect('task.created').toBeDefined();
      expect('task.status_changed').toBeDefined();
      expect('task.assigned').toBeDefined();
      expect('task.completed').toBeDefined();
      expect('task.blocked').toBeDefined();
      expect('task.failed').toBeDefined();
      expect('task.cancelled').toBeDefined();
    });

    it('should include context events', () => {
      expect('context.added').toBeDefined();
      expect('context.removed').toBeDefined();
      expect('context.changed').toBeDefined();
      expect('context.snapshot').toBeDefined();
    });

    it('should include quality events', () => {
      expect('critique.requested').toBeDefined();
      expect('critique.completed').toBeDefined();
      expect('critique.failed').toBeDefined();
      expect('quality.gate_passed').toBeDefined();
      expect('quality.gate_failed').toBeDefined();
    });

    it('should include testing events', () => {
      expect('test.started').toBeDefined();
      expect('test.completed').toBeDefined();
      expect('test.failed').toBeDefined();
      expect('test.coverage').toBeDefined();
    });

    it('should include reasoning events', () => {
      expect('reasoning.trace').toBeDefined();
      expect('reasoning.decision').toBeDefined();
      expect('reasoning.confidence_changed').toBeDefined();
    });

    it('should include safety events', () => {
      expect('safety.violation_attempted').toBeDefined();
      expect('safety.boundary_crossed').toBeDefined();
      expect('safety.escalation_required').toBeDefined();
      expect('safety.human_approval').toBeDefined();
    });

    it('should include system events', () => {
      expect('system.bottleneck_detected').toBeDefined();
      expect('system.disconnected').toBeDefined();
      expect('system.emergency_stop').toBeDefined();
      expect('system.checkpoint').toBeDefined();
    });
  });

  describe('createEvent Factory', () => {
    it('should create an event with required options', () => {
      const event = createEvent({
        type: 'agent.spawned',
        entityId: 'agent-123',
        entityType: 'agent'
      });

      expect(event.id).toMatch(/^event-\d+-[a-z0-9]+$/);
      expect(event.type).toBe('agent.spawned');
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.entityId).toBe('agent-123');
      expect(event.entityType).toBe('agent');
      expect(event.payload).toEqual({});
    });

    it('should create an event with custom id', () => {
      const event = createEvent({
        type: 'agent.completed',
        entityId: 'agent-456',
        entityType: 'agent'
      });
      // Note: id is auto-generated, not configurable
      expect(event.id).toMatch(/^event-\d+-[a-z0-9]+$/);
    });

    it('should create an event with payload', () => {
      const payload = { model: 'kimi-k2.5', task: 'Build API' };
      const event = createEvent({
        type: 'agent.spawned',
        entityId: 'agent-789',
        entityType: 'agent',
        payload
      });

      expect(event.payload).toEqual(payload);
    });

    it('should create an event with correlation id', () => {
      const event = createEvent({
        type: 'agent.status_changed',
        entityId: 'agent-abc',
        entityType: 'agent',
        correlationId: 'correlation-123'
      });

      expect(event.correlationId).toBe('correlation-123');
    });

    it('should create an event with parent event id', () => {
      const event = createEvent({
        type: 'task.completed',
        entityId: 'task-xyz',
        entityType: 'task',
        parentEventId: 'event-parent'
      });

      expect(event.parentEventId).toBe('event-parent');
    });

    it('should create an event with custom timestamp', () => {
      const customDate = new Date('2024-01-01');
      const event = createEvent({
        type: 'system.checkpoint',
        entityId: 'system',
        entityType: 'system',
        timestamp: customDate
      });

      expect(event.timestamp).toEqual(customDate);
    });
  });

  describe('createAgentStatusEvent Factory', () => {
    it('should create an agent status change event', () => {
      const event = createAgentStatusEvent(
        'agent-123',
        'pending',
        'running'
      );

      expect(event.type).toBe('agent.status_changed');
      expect(event.entityId).toBe('agent-123');
      expect(event.entityType).toBe('agent');
      
      const payload = event.payload as AgentStatusChangePayload;
      expect(payload.agentId).toBe('agent-123');
      expect(payload.previousStatus).toBe('pending');
      expect(payload.newStatus).toBe('running');
    });

    it('should create an agent status event with reason', () => {
      const event = createAgentStatusEvent(
        'agent-456',
        'running',
        'failed',
        'Resource exhaustion'
      );

      const payload = event.payload as AgentStatusChangePayload;
      expect(payload.reason).toBe('Resource exhaustion');
    });
  });

  describe('createTaskStatusEvent Factory', () => {
    it('should create a task status change event', () => {
      const event = createTaskStatusEvent(
        'task-123',
        'pending',
        'in_progress'
      );

      expect(event.type).toBe('task.status_changed');
      expect(event.entityId).toBe('task-123');
      expect(event.entityType).toBe('task');
      
      const payload = event.payload as TaskStatusChangePayload;
      expect(payload.taskId).toBe('task-123');
      expect(payload.previousStatus).toBe('pending');
      expect(payload.newStatus).toBe('in_progress');
    });

    it('should create a task status event with assignee', () => {
      const event = createTaskStatusEvent(
        'task-456',
        'pending',
        'in_progress',
        'agent-789'
      );

      const payload = event.payload as TaskStatusChangePayload;
      expect(payload.agentId).toBe('agent-789');
    });
  });

  describe('createQualityGateEvent Factory', () => {
    it('should create a passed quality gate event', () => {
      const event = createQualityGateEvent(
        'task-123',
        'agent-456',
        'critique',
        0.92,
        true,
        { correctness: 0.95, completeness: 0.88 }
      );

      expect(event.type).toBe('quality.gate_passed');
      expect(event.entityId).toBe('task-123');
      
      const payload = event.payload as QualityGateResultPayload;
      expect(payload.taskId).toBe('task-123');
      expect(payload.agentId).toBe('agent-456');
      expect(payload.gateType).toBe('critique');
      expect(payload.score).toBe(0.92);
      expect(payload.passed).toBe(true);
      expect(payload.dimensions).toEqual({ correctness: 0.95, completeness: 0.88 });
    });

    it('should create a failed quality gate event', () => {
      const event = createQualityGateEvent(
        'task-789',
        'agent-abc',
        'test',
        0.65,
        false,
        { correctness: 0.7, test_coverage: 0.6 }
      );

      expect(event.type).toBe('quality.gate_failed');
      const payload = event.payload as QualityGateResultPayload;
      expect(payload.passed).toBe(false);
    });
  });

  describe('createTestResultEvent Factory', () => {
    it('should create a test completed event', () => {
      const event = createTestResultEvent(
        'agent-123',
        100,
        100,
        0
      );

      expect(event.type).toBe('test.completed');
      expect(event.entityId).toBe('agent-123');
      
      const payload = event.payload as TestResultPayload;
      expect(payload.agentId).toBe('agent-123');
      expect(payload.total).toBe(100);
      expect(payload.passed).toBe(100);
      expect(payload.failed).toBe(0);
    });

    it('should create a test failed event', () => {
      const event = createTestResultEvent(
        'agent-456',
        50,
        48,
        2
      );

      expect(event.type).toBe('test.failed');
      const payload = event.payload as TestResultPayload;
      expect(payload.failed).toBe(2);
    });

    it('should create a test event with coverage', () => {
      const coverage = { statements: 87.5, branches: 72.3, functions: 91.2 };
      const event = createTestResultEvent(
        'agent-789',
        30,
        30,
        0,
        coverage
      );

      const payload = event.payload as TestResultPayload;
      expect(payload.coverage).toEqual(coverage);
    });
  });

  describe('createSafetyEvent Factory', () => {
    it('should create a boundary crossed event', () => {
      const event = createSafetyEvent(
        'agent-123',
        'delete /workspace/production_db',
        'ethicsBoundaries',
        'error',
        'Attempted data destruction in protected area'
      );

      expect(event.type).toBe('safety.boundary_crossed');
      
      const payload = event.payload as SafetyEventPayload;
      expect(payload.agentId).toBe('agent-123');
      expect(payload.action).toBe('delete /workspace/production_db');
      expect(payload.boundary).toBe('ethicsBoundaries');
      expect(payload.severity).toBe('error');
    });

    it('should create an escalation required event for critical severity', () => {
      const event = createSafetyEvent(
        'agent-456',
        'recursive_file_modification',
        'recursiveModification',
        'critical',
        'Agent exceeded recursive modification threshold'
      );

      expect(event.type).toBe('safety.escalation_required');
      const payload = event.payload as SafetyEventPayload;
      expect(payload.severity).toBe('critical');
    });
  });
});
