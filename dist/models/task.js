"use strict";
/**
 * Task Model
 *
 * Core data model representing a task in the Mission Control system.
 * Includes status, dependencies, quality gates, and checkpoints.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStatus = void 0;
exports.createTask = createTask;
exports.createQualityGate = createQualityGate;
exports.createQualityCriterion = createQualityCriterion;
/**
 * Possible states for a task
 */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
var TaskStatus;
(function (TaskStatus) {
    /** Task has been created but not yet started */
    TaskStatus["PENDING"] = "pending";
    /** Task is actively being worked on */
    TaskStatus["IN_PROGRESS"] = "in_progress";
    /** Task is blocked by dependencies */
    TaskStatus["BLOCKED"] = "blocked";
    /** Task has been paused */
    TaskStatus["PAUSED"] = "paused";
    /** Task is awaiting quality gate approval */
    TaskStatus["AWAITING_APPROVAL"] = "awaiting_approval";
    /** Task has been cancelled */
    TaskStatus["CANCELLED"] = "cancelled";
    /** Task has failed */
    TaskStatus["FAILED"] = "failed";
    /** Task has been completed successfully */
    TaskStatus["COMPLETED"] = "completed";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
/**
 * Creates a new Task instance
 *
 * @param options - Task creation options
 * @returns A new Task instance
 *
 * @example
 * ```typescript
 * const task = createTask({
 *   title: 'Implement user auth',
 *   description: 'Add JWT-based authentication',
 *   priority: 'high',
 *   dependsOn: ['task-123']
 * });
 * ```
 */
function createTask(options) {
    const id = options.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    return {
        id,
        title: options.title,
        description: options.description,
        status: TaskStatus.PENDING,
        assigneeId: options.assigneeId,
        dependsOn: options.dependsOn || [],
        blocks: [],
        reasoning: options.reasoning,
        qualityGate: options.qualityGate,
        checkpoints: [],
        createdAt: now,
        updatedAt: now,
        completedAt: undefined,
        priority: options.priority || 'medium',
        metadata: {}
    };
}
/**
 * Creates a quality gate with default settings
 *
 * @param criteria - Quality criteria to evaluate
 * @param passingThreshold - Threshold to pass (0-1)
 * @returns Quality gate configuration
 */
function createQualityGate(criteria, passingThreshold = 0.8) {
    return {
        type: 'critique',
        criteria,
        passingThreshold,
        maxIterations: 3,
        autoRetry: true
    };
}
/**
 * Creates a quality criterion
 *
 * @param dimension - Quality dimension
 * @param weight - Weight in overall score (0-1)
 * @param threshold - Minimum threshold to pass (0-1)
 * @returns Quality criterion
 */
function createQualityCriterion(dimension, weight, threshold = 0.7) {
    return { dimension, weight, threshold };
}
//# sourceMappingURL=task.js.map