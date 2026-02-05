/**
 * Task Service
 * Minimal in-memory implementation used by tests and lightweight usage.
 */

export interface CreateTaskInput {
  title: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  status: 'pending' | 'assigned' | 'completed';
  assignedAgentId?: string;
}

export class TaskService {
  private tasks = new Map<string, TaskRecord>();

  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    const id = `task-${this.tasks.size + 1}`;
    const task: TaskRecord = {
      id,
      title: input.title,
      status: 'pending',
    };
    this.tasks.set(id, task);
    return task;
  }

  async assignTask(taskId: string, agentId: string): Promise<{ taskId: string; agentId: string }> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'assigned';
      task.assignedAgentId = agentId;
      this.tasks.set(taskId, task);
    }
    return { taskId, agentId };
  }

  async completeTask(taskId: string): Promise<{ taskId: string; status: 'completed' }> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      this.tasks.set(taskId, task);
    }
    return { taskId, status: 'completed' };
  }
}
