"use strict";
/**
 * In-Memory Storage
 *
 * CRUD operations for agents, tasks, and events with indexing by ID and status.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryStore = exports.MemoryStore = exports.EventStorage = exports.TaskStorage = exports.AgentStorage = void 0;
const models_1 = require("../models");
/**
 * Agent storage with status indexing
 */
class AgentStorage {
    constructor() {
        this.agents = new Map();
        this.byStatus = new Map();
        this.bySwarm = new Map();
        this.byParent = new Map();
    }
    /**
     * Set the agent repository for persistence
     */
    setAgentRepository(repo) {
        this.repository = repo;
    }
    /**
     * Get the agent repository
     */
    getAgentRepository() {
        return this.repository;
    }
    /**
     * Creates a new agent and indexes it
     */
    create(agent) {
        this.agents.set(agent.id, agent);
        // Index by status
        if (!this.byStatus.has(agent.status)) {
            this.byStatus.set(agent.status, new Set());
        }
        this.byStatus.get(agent.status).add(agent.id);
        // Index by swarm
        if (agent.swarmId) {
            if (!this.bySwarm.has(agent.swarmId)) {
                this.bySwarm.set(agent.swarmId, new Set());
            }
            this.bySwarm.get(agent.swarmId).add(agent.id);
        }
        // Index by parent
        if (agent.parentId) {
            if (!this.byParent.has(agent.parentId)) {
                this.byParent.set(agent.parentId, new Set());
            }
            this.byParent.get(agent.parentId).add(agent.id);
        }
        return agent;
    }
    /**
     * Gets an agent by ID
     */
    get(id) {
        return this.agents.get(id);
    }
    /**
     * Updates an agent
     */
    update(id, data) {
        const agent = this.agents.get(id);
        if (!agent)
            return undefined;
        const oldStatus = agent.status;
        const oldSwarmId = agent.swarmId;
        const oldParentId = agent.parentId;
        const updated = { ...agent, ...data };
        this.agents.set(id, updated);
        // Update status index if changed
        if (data.status && data.status !== oldStatus) {
            this.byStatus.get(oldStatus)?.delete(id);
            if (!this.byStatus.has(data.status)) {
                this.byStatus.set(data.status, new Set());
            }
            this.byStatus.get(data.status).add(id);
        }
        // Update swarm index if changed
        if (data.swarmId !== oldSwarmId) {
            if (oldSwarmId) {
                this.bySwarm.get(oldSwarmId)?.delete(id);
            }
            if (data.swarmId) {
                if (!this.bySwarm.has(data.swarmId)) {
                    this.bySwarm.set(data.swarmId, new Set());
                }
                this.bySwarm.get(data.swarmId).add(id);
            }
        }
        // Update parent index if changed
        if (data.parentId !== oldParentId) {
            if (oldParentId) {
                this.byParent.get(oldParentId)?.delete(id);
            }
            if (data.parentId) {
                if (!this.byParent.has(data.parentId)) {
                    this.byParent.set(data.parentId, new Set());
                }
                this.byParent.get(data.parentId).add(id);
            }
        }
        return updated;
    }
    /**
     * Deletes an agent
     */
    delete(id) {
        const agent = this.agents.get(id);
        if (!agent)
            return false;
        this.agents.delete(id);
        this.byStatus.get(agent.status)?.delete(id);
        if (agent.swarmId) {
            this.bySwarm.get(agent.swarmId)?.delete(id);
        }
        if (agent.parentId) {
            this.byParent.get(agent.parentId)?.delete(id);
        }
        return true;
    }
    /**
     * Lists all agents
     */
    list() {
        return Array.from(this.agents.values());
    }
    /**
     * Returns agent count
     */
    count() {
        return this.agents.size;
    }
    /**
     * Finds agents by status
     */
    findByStatus(status) {
        const ids = this.byStatus.get(status);
        if (!ids)
            return [];
        return Array.from(ids).map(id => this.agents.get(id)).filter(Boolean);
    }
    /**
     * Finds agents by swarm
     */
    findBySwarm(swarmId) {
        const ids = this.bySwarm.get(swarmId);
        if (!ids)
            return [];
        return Array.from(ids).map(id => this.agents.get(id)).filter(Boolean);
    }
    /**
     * Finds child agents of a parent
     */
    findChildren(parentId) {
        const ids = this.byParent.get(parentId);
        if (!ids)
            return [];
        return Array.from(ids).map(id => this.agents.get(id)).filter(Boolean);
    }
    /**
     * Clears all agents
     */
    clear() {
        this.agents.clear();
        this.byStatus.clear();
        this.bySwarm.clear();
        this.byParent.clear();
    }
}
exports.AgentStorage = AgentStorage;
/**
 * Task storage with status and dependency indexing
 */
class TaskStorage {
    constructor() {
        this.tasks = new Map();
        this.byStatus = new Map();
        this.byAssignee = new Map();
        this.byPriority = new Map();
    }
    /**
     * Creates a new task and indexes it
     */
    create(task) {
        this.tasks.set(task.id, task);
        // Index by status
        if (!this.byStatus.has(task.status)) {
            this.byStatus.set(task.status, new Set());
        }
        this.byStatus.get(task.status).add(task.id);
        // Index by assignee
        if (task.assigneeId) {
            if (!this.byAssignee.has(task.assigneeId)) {
                this.byAssignee.set(task.assigneeId, new Set());
            }
            this.byAssignee.get(task.assigneeId).add(task.id);
        }
        // Index by priority
        if (!this.byPriority.has(task.priority)) {
            this.byPriority.set(task.priority, new Set());
        }
        this.byPriority.get(task.priority).add(task.id);
        return task;
    }
    /**
     * Gets a task by ID
     */
    get(id) {
        return this.tasks.get(id);
    }
    /**
     * Updates a task
     */
    update(id, data) {
        const task = this.tasks.get(id);
        if (!task)
            return undefined;
        const oldStatus = task.status;
        const oldAssignee = task.assigneeId;
        const oldPriority = task.priority;
        const updated = { ...task, ...data, updatedAt: new Date() };
        this.tasks.set(id, updated);
        // Update status index if changed
        if (data.status && data.status !== oldStatus) {
            this.byStatus.get(oldStatus)?.delete(id);
            if (!this.byStatus.has(data.status)) {
                this.byStatus.set(data.status, new Set());
            }
            this.byStatus.get(data.status).add(id);
        }
        // Update assignee index if changed
        if (data.assigneeId !== oldAssignee) {
            if (oldAssignee) {
                this.byAssignee.get(oldAssignee)?.delete(id);
            }
            if (data.assigneeId) {
                if (!this.byAssignee.has(data.assigneeId)) {
                    this.byAssignee.set(data.assigneeId, new Set());
                }
                this.byAssignee.get(data.assigneeId).add(id);
            }
        }
        // Update priority index if changed
        if (data.priority && data.priority !== oldPriority) {
            this.byPriority.get(oldPriority)?.delete(id);
            if (!this.byPriority.has(data.priority)) {
                this.byPriority.set(data.priority, new Set());
            }
            this.byPriority.get(data.priority).add(id);
        }
        return updated;
    }
    /**
     * Deletes a task
     */
    delete(id) {
        const task = this.tasks.get(id);
        if (!task)
            return false;
        this.tasks.delete(id);
        this.byStatus.get(task.status)?.delete(id);
        if (task.assigneeId) {
            this.byAssignee.get(task.assigneeId)?.delete(id);
        }
        this.byPriority.get(task.priority)?.delete(id);
        return true;
    }
    /**
     * Lists all tasks
     */
    list() {
        return Array.from(this.tasks.values());
    }
    /**
     * Returns task count
     */
    count() {
        return this.tasks.size;
    }
    /**
     * Finds tasks by status
     */
    findByStatus(status) {
        const ids = this.byStatus.get(status);
        if (!ids)
            return [];
        return Array.from(ids).map(id => this.tasks.get(id)).filter(Boolean);
    }
    /**
     * Finds tasks by assignee
     */
    findByAssignee(assigneeId) {
        const ids = this.byAssignee.get(assigneeId);
        if (!ids)
            return [];
        return Array.from(ids).map(id => this.tasks.get(id)).filter(Boolean);
    }
    /**
     * Finds tasks by priority
     */
    findByPriority(priority) {
        const ids = this.byPriority.get(priority);
        if (!ids)
            return [];
        return Array.from(ids).map(id => this.tasks.get(id)).filter(Boolean);
    }
    /**
     * Finds tasks that depend on a given task
     */
    findDependents(taskId) {
        return this.list().filter(task => task.dependsOn.includes(taskId));
    }
    /**
     * Finds tasks that are blocked (have incomplete dependencies)
     */
    findBlocked() {
        return this.list().filter(task => {
            if (task.status !== models_1.TaskStatus.BLOCKED)
                return false;
            return task.dependsOn.some(depId => {
                const dep = this.tasks.get(depId);
                return dep && dep.status !== models_1.TaskStatus.COMPLETED;
            });
        });
    }
    /**
     * Clears all tasks
     */
    clear() {
        this.tasks.clear();
        this.byStatus.clear();
        this.byAssignee.clear();
        this.byPriority.clear();
    }
}
exports.TaskStorage = TaskStorage;
/**
 * Event storage with type and entity indexing
 */
class EventStorage {
    constructor() {
        this.events = new Map();
        this.byType = new Map();
        this.byEntity = new Map();
        this.byCorrelation = new Map();
        this.chronological = [];
    }
    /**
     * Creates a new event and indexes it
     */
    create(event) {
        this.events.set(event.id, event);
        // Index by type
        if (!this.byType.has(event.type)) {
            this.byType.set(event.type, new Set());
        }
        this.byType.get(event.type).add(event.id);
        // Index by entity
        const entityKey = `${event.entityType}:${event.entityId}`;
        if (!this.byEntity.has(entityKey)) {
            this.byEntity.set(entityKey, new Set());
        }
        this.byEntity.get(entityKey).add(event.id);
        // Index by correlation
        if (event.correlationId) {
            if (!this.byCorrelation.has(event.correlationId)) {
                this.byCorrelation.set(event.correlationId, new Set());
            }
            this.byCorrelation.get(event.correlationId).add(event.id);
        }
        // Maintain chronological order
        const timestamp = event.timestamp.getTime();
        const insertIndex = this.chronological.findIndex(id => this.events.get(id).timestamp.getTime() > timestamp);
        if (insertIndex === -1) {
            this.chronological.push(event.id);
        }
        else {
            this.chronological.splice(insertIndex, 0, event.id);
        }
        return event;
    }
    /**
     * Gets an event by ID
     */
    get(id) {
        return this.events.get(id);
    }
    /**
     * Updates an event (rarely needed)
     */
    update(id, data) {
        const event = this.events.get(id);
        if (!event)
            return undefined;
        const updated = { ...event, ...data };
        this.events.set(id, updated);
        return updated;
    }
    /**
     * Deletes an event
     */
    delete(id) {
        const event = this.events.get(id);
        if (!event)
            return false;
        this.events.delete(id);
        this.byType.get(event.type)?.delete(id);
        const entityKey = `${event.entityType}:${event.entityId}`;
        this.byEntity.get(entityKey)?.delete(id);
        if (event.correlationId) {
            this.byCorrelation.get(event.correlationId)?.delete(id);
        }
        const idx = this.chronological.indexOf(id);
        if (idx !== -1) {
            this.chronological.splice(idx, 1);
        }
        return true;
    }
    /**
     * Lists all events
     */
    list() {
        return this.chronological.map(id => this.events.get(id)).filter(Boolean);
    }
    /**
     * Returns event count
     */
    count() {
        return this.events.size;
    }
    /**
     * Finds events by type
     */
    findByType(type) {
        const ids = this.byType.get(type);
        if (!ids)
            return [];
        return Array.from(ids)
            .map(id => this.events.get(id))
            .filter(Boolean)
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    /**
     * Finds events for an entity
     */
    findByEntity(entityType, entityId) {
        const entityKey = `${entityType}:${entityId}`;
        const ids = this.byEntity.get(entityKey);
        if (!ids)
            return [];
        return Array.from(ids)
            .map(id => this.events.get(id))
            .filter(Boolean)
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    /**
     * Finds events by correlation ID
     */
    findByCorrelation(correlationId) {
        const ids = this.byCorrelation.get(correlationId);
        if (!ids)
            return [];
        return Array.from(ids)
            .map(id => this.events.get(id))
            .filter(Boolean)
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    /**
     * Gets recent events (within time window)
     */
    getRecent(since) {
        const sinceTime = since.getTime();
        return this.chronological
            .map(id => this.events.get(id))
            .filter(event => event.timestamp.getTime() >= sinceTime);
    }
    /**
     * Clears all events
     */
    clear() {
        this.events.clear();
        this.byType.clear();
        this.byEntity.clear();
        this.byCorrelation.clear();
        this.chronological = [];
    }
}
exports.EventStorage = EventStorage;
/**
 * Memory Store - Main in-memory storage class
 * Combines agent, task, and event storage
 */
class MemoryStore {
    constructor() {
        this.agents = new AgentStorage();
        this.tasks = new TaskStorage();
        this.events = new EventStorage();
        this.metadata = new Map();
    }
    /**
     * Clears all storage
     */
    clear() {
        this.agents.clear();
        this.tasks.clear();
        this.events.clear();
        this.metadata.clear();
    }
    /**
     * Gets storage statistics
     */
    getStats() {
        return {
            agents: this.agents.count(),
            tasks: this.tasks.count(),
            events: this.events.count()
        };
    }
}
exports.MemoryStore = MemoryStore;
/**
 * Default memory store instance
 */
exports.memoryStore = new MemoryStore();
//# sourceMappingURL=memory.js.map