/**
 * In-Memory Storage
 *
 * CRUD operations for agents, tasks, and events with indexing by ID and status.
 */
import { TaskStatus } from '../models';
import type { Agent, AgentStatus, Task, Event, EventType } from '../models';
/**
 * Storage interface for CRUD operations
 */
export interface Storage<T> {
    create(_item: T): T;
    get(_id: string): T | undefined;
    update(_id: string, _data: Partial<T>): T | undefined;
    delete(_id: string): boolean;
    list(): T[];
    count(): number;
}
/**
 * Agent storage with status indexing
 */
export declare class AgentStorage implements Storage<Agent> {
    private agents;
    private byStatus;
    private bySwarm;
    private byParent;
    /**
     * Creates a new agent and indexes it
     */
    create(agent: Agent): Agent;
    /**
     * Gets an agent by ID
     */
    get(id: string): Agent | undefined;
    /**
     * Updates an agent
     */
    update(id: string, data: Partial<Agent>): Agent | undefined;
    /**
     * Deletes an agent
     */
    delete(id: string): boolean;
    /**
     * Lists all agents
     */
    list(): Agent[];
    /**
     * Returns agent count
     */
    count(): number;
    /**
     * Finds agents by status
     */
    findByStatus(status: AgentStatus): Agent[];
    /**
     * Finds agents by swarm
     */
    findBySwarm(swarmId: string): Agent[];
    /**
     * Finds child agents of a parent
     */
    findChildren(parentId: string): Agent[];
    /**
     * Clears all agents
     */
    clear(): void;
}
/**
 * Task storage with status and dependency indexing
 */
export declare class TaskStorage implements Storage<Task> {
    private tasks;
    private byStatus;
    private byAssignee;
    private byPriority;
    /**
     * Creates a new task and indexes it
     */
    create(task: Task): Task;
    /**
     * Gets a task by ID
     */
    get(id: string): Task | undefined;
    /**
     * Updates a task
     */
    update(id: string, data: Partial<Task>): Task | undefined;
    /**
     * Deletes a task
     */
    delete(id: string): boolean;
    /**
     * Lists all tasks
     */
    list(): Task[];
    /**
     * Returns task count
     */
    count(): number;
    /**
     * Finds tasks by status
     */
    findByStatus(status: TaskStatus): Task[];
    /**
     * Finds tasks by assignee
     */
    findByAssignee(assigneeId: string): Task[];
    /**
     * Finds tasks by priority
     */
    findByPriority(priority: string): Task[];
    /**
     * Finds tasks that depend on a given task
     */
    findDependents(taskId: string): Task[];
    /**
     * Finds tasks that are blocked (have incomplete dependencies)
     */
    findBlocked(): Task[];
    /**
     * Clears all tasks
     */
    clear(): void;
}
/**
 * Event storage with type and entity indexing
 */
export declare class EventStorage implements Storage<Event> {
    private events;
    private byType;
    private byEntity;
    private byCorrelation;
    private chronological;
    /**
     * Creates a new event and indexes it
     */
    create(event: Event): Event;
    /**
     * Gets an event by ID
     */
    get(id: string): Event | undefined;
    /**
     * Updates an event (rarely needed)
     */
    update(id: string, data: Partial<Event>): Event | undefined;
    /**
     * Deletes an event
     */
    delete(id: string): boolean;
    /**
     * Lists all events
     */
    list(): Event[];
    /**
     * Returns event count
     */
    count(): number;
    /**
     * Finds events by type
     */
    findByType(type: EventType): Event[];
    /**
     * Finds events for an entity
     */
    findByEntity(entityType: string, entityId: string): Event[];
    /**
     * Finds events by correlation ID
     */
    findByCorrelation(correlationId: string): Event[];
    /**
     * Gets recent events (within time window)
     */
    getRecent(since: Date): Event[];
    /**
     * Clears all events
     */
    clear(): void;
}
/**
 * Memory Store - Main in-memory storage class
 * Combines agent, task, and event storage
 */
export declare class MemoryStore {
    /** Agent storage */
    readonly agents: AgentStorage;
    /** Task storage */
    readonly tasks: TaskStorage;
    /** Event storage */
    readonly events: EventStorage;
    /** Metadata storage for caching and other purposes */
    readonly metadata: Map<string, unknown>;
    constructor();
    /**
     * Clears all storage
     */
    clear(): void;
    /**
     * Gets storage statistics
     */
    getStats(): {
        agents: number;
        tasks: number;
        events: number;
    };
}
/**
 * Default memory store instance
 */
export declare const memoryStore: MemoryStore;
//# sourceMappingURL=memory.d.ts.map