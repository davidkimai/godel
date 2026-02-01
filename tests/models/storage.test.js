"use strict";
/**
 * Memory Storage Tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const memory_1 = require("../../src/storage/memory");
const models_1 = require("../../src/models");
describe('AgentStorage', () => {
    let storage;
    beforeEach(() => {
        storage = new memory_1.AgentStorage();
    });
    describe('CRUD Operations', () => {
        it('should create an agent', () => {
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test task' });
            const created = storage.create(agent);
            expect(created).toEqual(agent);
            expect(storage.get(agent.id)).toEqual(agent);
        });
        it('should get an agent by id', () => {
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test task' });
            storage.create(agent);
            const found = storage.get(agent.id);
            expect(found).toEqual(agent);
        });
        it('should return undefined for non-existent agent', () => {
            const found = storage.get('non-existent');
            expect(found).toBeUndefined();
        });
        it('should update an agent', () => {
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test task' });
            storage.create(agent);
            const updated = storage.update(agent.id, {
                status: models_1.AgentStatus.RUNNING
            });
            expect(updated?.status).toBe(models_1.AgentStatus.RUNNING);
            expect(storage.get(agent.id)?.status).toBe(models_1.AgentStatus.RUNNING);
        });
        it('should delete an agent', () => {
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test task' });
            storage.create(agent);
            const deleted = storage.delete(agent.id);
            expect(deleted).toBe(true);
            expect(storage.get(agent.id)).toBeUndefined();
        });
        it('should return false when deleting non-existent agent', () => {
            const deleted = storage.delete('non-existent');
            expect(deleted).toBe(false);
        });
        it('should list all agents', () => {
            const agent1 = (0, models_1.createAgent)({ model: 'test1', task: 'Task 1' });
            const agent2 = (0, models_1.createAgent)({ model: 'test2', task: 'Task 2' });
            storage.create(agent1);
            storage.create(agent2);
            const list = storage.list();
            expect(list).toHaveLength(2);
        });
        it('should return count of agents', () => {
            expect(storage.count()).toBe(0);
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test task' });
            storage.create(agent);
            expect(storage.count()).toBe(1);
        });
    });
    describe('Status Indexing', () => {
        it('should find agents by status', () => {
            const agent1 = (0, models_1.createAgent)({ model: 'test', task: 'Task 1' });
            const agent2 = (0, models_1.createAgent)({ model: 'test', task: 'Task 2' });
            storage.create(agent1);
            storage.create(agent2);
            storage.update(agent1.id, { status: models_1.AgentStatus.RUNNING });
            storage.update(agent2.id, { status: models_1.AgentStatus.COMPLETED });
            const running = storage.findByStatus(models_1.AgentStatus.RUNNING);
            const completed = storage.findByStatus(models_1.AgentStatus.COMPLETED);
            expect(running).toHaveLength(1);
            expect(running[0].id).toBe(agent1.id);
            expect(completed).toHaveLength(1);
            expect(completed[0].id).toBe(agent2.id);
        });
    });
    describe('Swarm Indexing', () => {
        it('should find agents by swarm', () => {
            const agent1 = (0, models_1.createAgent)({ model: 'test', task: 'Task 1', swarmId: 'swarm-1' });
            const agent2 = (0, models_1.createAgent)({ model: 'test', task: 'Task 2', swarmId: 'swarm-1' });
            const agent3 = (0, models_1.createAgent)({ model: 'test', task: 'Task 3', swarmId: 'swarm-2' });
            storage.create(agent1);
            storage.create(agent2);
            storage.create(agent3);
            const swarm1Agents = storage.findBySwarm('swarm-1');
            const swarm2Agents = storage.findBySwarm('swarm-2');
            expect(swarm1Agents).toHaveLength(2);
            expect(swarm2Agents).toHaveLength(1);
        });
    });
    describe('Parent/Child Indexing', () => {
        it('should find child agents of a parent', () => {
            const parent = (0, models_1.createAgent)({ model: 'test', task: 'Parent' });
            const child1 = (0, models_1.createAgent)({ model: 'test', task: 'Child 1', parentId: parent.id });
            const child2 = (0, models_1.createAgent)({ model: 'test', task: 'Child 2', parentId: parent.id });
            storage.create(parent);
            storage.create(child1);
            storage.create(child2);
            const children = storage.findChildren(parent.id);
            expect(children).toHaveLength(2);
        });
    });
    describe('Clear', () => {
        it('should clear all agents', () => {
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test task' });
            storage.create(agent);
            storage.clear();
            expect(storage.count()).toBe(0);
            expect(storage.list()).toHaveLength(0);
        });
    });
});
describe('TaskStorage', () => {
    let storage;
    beforeEach(() => {
        storage = new memory_1.TaskStorage();
    });
    describe('CRUD Operations', () => {
        it('should create a task', () => {
            const task = (0, models_1.createTask)({ title: 'Test', description: 'Test task' });
            const created = storage.create(task);
            expect(created).toEqual(task);
            expect(storage.get(task.id)).toEqual(task);
        });
        it('should get a task by id', () => {
            const task = (0, models_1.createTask)({ title: 'Test', description: 'Test task' });
            storage.create(task);
            const found = storage.get(task.id);
            expect(found).toEqual(task);
        });
        it('should update a task', () => {
            const task = (0, models_1.createTask)({ title: 'Test', description: 'Test task' });
            storage.create(task);
            const updated = storage.update(task.id, {
                status: models_1.TaskStatus.IN_PROGRESS
            });
            expect(updated?.status).toBe(models_1.TaskStatus.IN_PROGRESS);
        });
        it('should delete a task', () => {
            const task = (0, models_1.createTask)({ title: 'Test', description: 'Test task' });
            storage.create(task);
            const deleted = storage.delete(task.id);
            expect(deleted).toBe(true);
            expect(storage.get(task.id)).toBeUndefined();
        });
    });
    describe('Status Indexing', () => {
        it('should find tasks by status', () => {
            const task1 = (0, models_1.createTask)({ title: 'Task 1', description: 'Desc' });
            const task2 = (0, models_1.createTask)({ title: 'Task 2', description: 'Desc' });
            storage.create(task1);
            storage.create(task2);
            storage.update(task1.id, { status: models_1.TaskStatus.IN_PROGRESS });
            const inProgress = storage.findByStatus(models_1.TaskStatus.IN_PROGRESS);
            const pending = storage.findByStatus(models_1.TaskStatus.PENDING);
            expect(inProgress).toHaveLength(1);
            expect(pending).toHaveLength(1);
        });
    });
    describe('Assignee Indexing', () => {
        it('should find tasks by assignee', () => {
            const task1 = (0, models_1.createTask)({ title: 'Task 1', description: 'Desc', assigneeId: 'agent-1' });
            const task2 = (0, models_1.createTask)({ title: 'Task 2', description: 'Desc', assigneeId: 'agent-1' });
            const task3 = (0, models_1.createTask)({ title: 'Task 3', description: 'Desc', assigneeId: 'agent-2' });
            storage.create(task1);
            storage.create(task2);
            storage.create(task3);
            const agent1Tasks = storage.findByAssignee('agent-1');
            const agent2Tasks = storage.findByAssignee('agent-2');
            expect(agent1Tasks).toHaveLength(2);
            expect(agent2Tasks).toHaveLength(1);
        });
    });
    describe('Dependency Queries', () => {
        it('should find tasks that depend on a given task', () => {
            const task1 = (0, models_1.createTask)({ title: 'Task 1', description: 'Desc' });
            const task2 = (0, models_1.createTask)({ title: 'Task 2', description: 'Desc', dependsOn: [task1.id] });
            const task3 = (0, models_1.createTask)({ title: 'Task 3', description: 'Desc', dependsOn: [task1.id] });
            storage.create(task1);
            storage.create(task2);
            storage.create(task3);
            const dependents = storage.findDependents(task1.id);
            expect(dependents).toHaveLength(2);
        });
    });
});
describe('EventStorage', () => {
    let storage;
    beforeEach(() => {
        storage = new memory_1.EventStorage();
    });
    describe('CRUD Operations', () => {
        it('should create an event', () => {
            const event = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-1',
                entityType: 'agent'
            });
            const created = storage.create(event);
            expect(created).toEqual(event);
            expect(storage.get(event.id)).toEqual(event);
        });
        it('should get an event by id', () => {
            const event = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-1',
                entityType: 'agent'
            });
            storage.create(event);
            const found = storage.get(event.id);
            expect(found).toEqual(event);
        });
        it('should list events in chronological order', () => {
            const event1 = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-1',
                entityType: 'agent',
                timestamp: new Date('2024-01-02')
            });
            const event2 = (0, models_1.createEvent)({
                type: 'agent.completed',
                entityId: 'agent-1',
                entityType: 'agent',
                timestamp: new Date('2024-01-03')
            });
            const event3 = (0, models_1.createEvent)({
                type: 'agent.status_changed',
                entityId: 'agent-1',
                entityType: 'agent',
                timestamp: new Date('2024-01-01')
            });
            storage.create(event1);
            storage.create(event2);
            storage.create(event3);
            const list = storage.list();
            expect(list).toHaveLength(3);
            expect(list[0].id).toBe(event3.id);
            expect(list[1].id).toBe(event1.id);
            expect(list[2].id).toBe(event2.id);
        });
    });
    describe('Type Indexing', () => {
        it('should find events by type', () => {
            const event1 = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-1',
                entityType: 'agent'
            });
            const event2 = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-2',
                entityType: 'agent'
            });
            const event3 = (0, models_1.createEvent)({
                type: 'agent.completed',
                entityId: 'agent-1',
                entityType: 'agent'
            });
            storage.create(event1);
            storage.create(event2);
            storage.create(event3);
            const spawnedEvents = storage.findByType('agent.spawned');
            const completedEvents = storage.findByType('agent.completed');
            expect(spawnedEvents).toHaveLength(2);
            expect(completedEvents).toHaveLength(1);
        });
    });
    describe('Entity Indexing', () => {
        it('should find events for an entity', () => {
            const event1 = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-1',
                entityType: 'agent'
            });
            const event2 = (0, models_1.createEvent)({
                type: 'agent.completed',
                entityId: 'agent-1',
                entityType: 'agent'
            });
            const event3 = (0, models_1.createEvent)({
                type: 'task.created',
                entityId: 'task-1',
                entityType: 'task'
            });
            storage.create(event1);
            storage.create(event2);
            storage.create(event3);
            const agent1Events = storage.findByEntity('agent', 'agent-1');
            const task1Events = storage.findByEntity('task', 'task-1');
            expect(agent1Events).toHaveLength(2);
            expect(task1Events).toHaveLength(1);
        });
    });
    describe('Correlation Indexing', () => {
        it('should find events by correlation id', () => {
            const event1 = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-1',
                entityType: 'agent',
                correlationId: 'corr-1'
            });
            const event2 = (0, models_1.createEvent)({
                type: 'agent.completed',
                entityId: 'agent-1',
                entityType: 'agent',
                correlationId: 'corr-1'
            });
            const event3 = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-2',
                entityType: 'agent',
                correlationId: 'corr-2'
            });
            storage.create(event1);
            storage.create(event2);
            storage.create(event3);
            const corr1Events = storage.findByCorrelation('corr-1');
            expect(corr1Events).toHaveLength(2);
        });
    });
    describe('Recent Events', () => {
        it('should get recent events since a given date', () => {
            const event1 = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-1',
                entityType: 'agent',
                timestamp: new Date('2024-01-01')
            });
            const event2 = (0, models_1.createEvent)({
                type: 'agent.completed',
                entityId: 'agent-1',
                entityType: 'agent',
                timestamp: new Date('2024-01-03')
            });
            const event3 = (0, models_1.createEvent)({
                type: 'agent.status_changed',
                entityId: 'agent-1',
                entityType: 'agent',
                timestamp: new Date('2024-01-05')
            });
            storage.create(event1);
            storage.create(event2);
            storage.create(event3);
            const recent = storage.getRecent(new Date('2024-01-02'));
            expect(recent).toHaveLength(2);
            expect(recent[0].id).toBe(event2.id);
            expect(recent[1].id).toBe(event3.id);
        });
    });
});
describe('MemoryStore', () => {
    let store;
    beforeEach(() => {
        store = new memory_1.MemoryStore();
    });
    describe('Combined Storage', () => {
        it('should store agents, tasks, and events', () => {
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test' });
            const task = (0, models_1.createTask)({ title: 'Test', description: 'Desc' });
            const event = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: agent.id,
                entityType: 'agent'
            });
            store.agents.create(agent);
            store.tasks.create(task);
            store.events.create(event);
            expect(store.agents.count()).toBe(1);
            expect(store.tasks.count()).toBe(1);
            expect(store.events.count()).toBe(1);
        });
    });
    describe('Stats', () => {
        it('should return storage statistics', () => {
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test' });
            const task = (0, models_1.createTask)({ title: 'Test', description: 'Desc' });
            store.agents.create(agent);
            store.tasks.create(task);
            const stats = store.getStats();
            expect(stats.agents).toBe(1);
            expect(stats.tasks).toBe(1);
            expect(stats.events).toBe(0);
        });
    });
    describe('Clear', () => {
        it('should clear all storage', () => {
            const agent = (0, models_1.createAgent)({ model: 'test', task: 'Test' });
            const task = (0, models_1.createTask)({ title: 'Test', description: 'Desc' });
            const event = (0, models_1.createEvent)({
                type: 'agent.spawned',
                entityId: 'agent-1',
                entityType: 'agent'
            });
            store.agents.create(agent);
            store.tasks.create(task);
            store.events.create(event);
            store.clear();
            expect(store.getStats()).toEqual({ agents: 0, tasks: 0, events: 0 });
        });
    });
});
//# sourceMappingURL=storage.test.js.map