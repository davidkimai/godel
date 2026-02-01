"use strict";
/**
 * Task Model Tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const task_1 = require("../../src/models/task");
describe('Task Model', () => {
    describe('TaskStatus Enum', () => {
        it('should have all expected statuses', () => {
            expect(task_1.TaskStatus.PENDING).toBe('pending');
            expect(task_1.TaskStatus.IN_PROGRESS).toBe('in_progress');
            expect(task_1.TaskStatus.BLOCKED).toBe('blocked');
            expect(task_1.TaskStatus.PAUSED).toBe('paused');
            expect(task_1.TaskStatus.AWAITING_APPROVAL).toBe('awaiting_approval');
            expect(task_1.TaskStatus.CANCELLED).toBe('cancelled');
            expect(task_1.TaskStatus.FAILED).toBe('failed');
            expect(task_1.TaskStatus.COMPLETED).toBe('completed');
        });
    });
    describe('createTask Factory', () => {
        it('should create a task with default options', () => {
            const task = (0, task_1.createTask)({
                title: 'Test Task',
                description: 'A test task description'
            });
            expect(task.id).toMatch(/^task-\d+-[a-z0-9]+$/);
            expect(task.title).toBe('Test Task');
            expect(task.description).toBe('A test task description');
            expect(task.status).toBe(task_1.TaskStatus.PENDING);
            expect(task.dependsOn).toEqual([]);
            expect(task.blocks).toEqual([]);
            expect(task.checkpoints).toEqual([]);
            expect(task.priority).toBe('medium');
            expect(task.metadata).toEqual({});
            expect(task.createdAt).toBeInstanceOf(Date);
            expect(task.updatedAt).toBeInstanceOf(Date);
        });
        it('should create a task with custom id', () => {
            const task = (0, task_1.createTask)({
                id: 'custom-task-id',
                title: 'Custom Task',
                description: 'Custom description'
            });
            expect(task.id).toBe('custom-task-id');
        });
        it('should create a task with assignee', () => {
            const task = (0, task_1.createTask)({
                title: 'Assigned Task',
                description: 'Task with assignee',
                assigneeId: 'agent-123'
            });
            expect(task.assigneeId).toBe('agent-123');
        });
        it('should create a task with dependencies', () => {
            const task = (0, task_1.createTask)({
                title: 'Dependent Task',
                description: 'Task with dependencies',
                dependsOn: ['task-1', 'task-2', 'task-3']
            });
            expect(task.dependsOn).toEqual(['task-1', 'task-2', 'task-3']);
        });
        it('should create a task with custom priority', () => {
            const task = (0, task_1.createTask)({
                title: 'High Priority Task',
                description: 'Task with high priority',
                priority: 'high'
            });
            expect(task.priority).toBe('high');
        });
        it('should create a task with quality gate', () => {
            const qualityGate = {
                type: 'critique',
                criteria: [
                    { dimension: 'correctness', weight: 0.5, threshold: 0.8 },
                    { dimension: 'test_coverage', weight: 0.5, threshold: 0.7 }
                ],
                passingThreshold: 0.75,
                maxIterations: 3,
                autoRetry: true
            };
            const task = (0, task_1.createTask)({
                title: 'Quality Task',
                description: 'Task with quality gate',
                qualityGate
            });
            expect(task.qualityGate).toEqual(qualityGate);
        });
        it('should create a task with reasoning data', () => {
            const reasoning = {
                hypothesis: 'Using Redis will improve performance',
                alternatives: ['In-memory cache', 'Database optimization'],
                criteria: ['Response time < 100ms', 'Memory usage < 500MB'],
                confidence: 0.8
            };
            const task = (0, task_1.createTask)({
                title: 'Reasoning Task',
                description: 'Task with reasoning',
                reasoning
            });
            expect(task.reasoning).toEqual(reasoning);
        });
    });
    describe('createQualityCriterion Factory', () => {
        it('should create a quality criterion with defaults', () => {
            const criterion = (0, task_1.createQualityCriterion)('correctness', 0.5);
            expect(criterion.dimension).toBe('correctness');
            expect(criterion.weight).toBe(0.5);
            expect(criterion.threshold).toBe(0.7);
        });
        it('should create a quality criterion with custom threshold', () => {
            const criterion = (0, task_1.createQualityCriterion)('security', 0.3, 0.9);
            expect(criterion.weight).toBe(0.3);
            expect(criterion.threshold).toBe(0.9);
        });
    });
    describe('createQualityGate Factory', () => {
        it('should create a quality gate with default values', () => {
            const criteria = [
                { dimension: 'correctness', weight: 0.6, threshold: 0.8 },
                { dimension: 'test_coverage', weight: 0.4, threshold: 0.7 }
            ];
            const gate = (0, task_1.createQualityGate)(criteria);
            expect(gate.type).toBe('critique');
            expect(gate.criteria).toEqual(criteria);
            expect(gate.passingThreshold).toBe(0.8);
            expect(gate.maxIterations).toBe(3);
            expect(gate.autoRetry).toBe(true);
        });
        it('should create a quality gate with custom passing threshold', () => {
            const criteria = [];
            const gate = (0, task_1.createQualityGate)(criteria, 0.9);
            expect(gate.passingThreshold).toBe(0.9);
        });
    });
});
//# sourceMappingURL=task.test.js.map