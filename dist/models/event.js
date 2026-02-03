"use strict";
/**
 * Event Model
 *
 * Core data model representing events in the Mission Control system.
 * Includes event types for agent lifecycle, task lifecycle, context, quality, and safety.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvent = createEvent;
exports.createAgentStatusEvent = createAgentStatusEvent;
exports.createTaskStatusEvent = createTaskStatusEvent;
exports.createQualityGateEvent = createQualityGateEvent;
exports.createTestResultEvent = createTestResultEvent;
exports.createSafetyEvent = createSafetyEvent;
/**
 * Creates a new Event instance
 *
 * @param options - Event creation options
 * @returns A new Event instance
 *
 * @example
 * ```typescript
 * const event = createEvent({
 *   type: 'agent.spawned',
 *   entityId: 'agent-123',
 *   entityType: 'agent',
 *   payload: { model: 'kimi-k2.5', task: 'Build API' }
 * });
 * ```
 */
function createEvent(options) {
    const id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
        id,
        type: options.type,
        timestamp: options.timestamp || new Date(),
        entityId: options.entityId,
        entityType: options.entityType,
        payload: options.payload || {},
        correlationId: options.correlationId,
        parentEventId: options.parentEventId
    };
}
/**
 * Creates an agent status change event
 *
 * @param agentId - Agent ID
 * @param previousStatus - Previous status
 * @param newStatus - New status
 * @param reason - Optional reason
 * @returns A new Event instance
 */
function createAgentStatusEvent(agentId, previousStatus, newStatus, reason) {
    return createEvent({
        type: 'agent.status_changed',
        entityId: agentId,
        entityType: 'agent',
        payload: {
            agentId,
            previousStatus,
            newStatus,
            reason
        }
    });
}
/**
 * Creates a task status change event
 *
 * @param taskId - Task ID
 * @param previousStatus - Previous status
 * @param newStatus - New status
 * @param agentId - Optional agent ID
 * @returns A new Event instance
 */
function createTaskStatusEvent(taskId, previousStatus, newStatus, agentId) {
    return createEvent({
        type: 'task.status_changed',
        entityId: taskId,
        entityType: 'task',
        payload: {
            taskId,
            previousStatus,
            newStatus,
            agentId
        }
    });
}
/**
 * Creates a quality gate result event
 *
 * @param taskId - Task ID
 * @param agentId - Agent ID
 * @param gateType - Quality gate type
 * @param score - Overall score
 * @param passed - Whether it passed
 * @param dimensions - Dimension scores
 * @returns A new Event instance
 */
function createQualityGateEvent(taskId, agentId, gateType, score, passed, dimensions) {
    return createEvent({
        type: passed ? 'quality.gate_passed' : 'quality.gate_failed',
        entityId: taskId,
        entityType: 'task',
        payload: {
            taskId,
            agentId,
            gateType,
            score,
            passed,
            dimensions
        }
    });
}
/**
 * Creates a test result event
 *
 * @param agentId - Agent ID
 * @param total - Total tests
 * @param passed - Passed tests
 * @param failed - Failed tests
 * @param coverage - Optional coverage
 * @returns A new Event instance
 */
function createTestResultEvent(agentId, total, passed, failed, coverage) {
    return createEvent({
        type: failed > 0 ? 'test.failed' : 'test.completed',
        entityId: agentId,
        entityType: 'agent',
        payload: {
            agentId,
            total,
            passed,
            failed,
            coverage
        }
    });
}
/**
 * Creates a safety event
 *
 * @param agentId - Agent ID
 * @param action - Action that triggered event
 * @param boundary - Safety boundary affected
 * @param severity - Severity level
 * @param description - Description
 * @returns A new Event instance
 */
function createSafetyEvent(agentId, action, boundary, severity, description) {
    const eventType = severity === 'critical'
        ? 'safety.escalation_required'
        : 'safety.boundary_crossed';
    return createEvent({
        type: eventType,
        entityId: agentId,
        entityType: 'agent',
        payload: {
            agentId,
            action,
            boundary,
            severity,
            description
        }
    });
}
//# sourceMappingURL=event.js.map