/**
 * Swarm Service
 * Minimal in-memory implementation used by tests and lightweight usage.
 */

export interface SwarmAgentRecord {
  id: string;
  name: string;
}

export interface SwarmTaskRecord {
  id: string;
  title: string;
  status: 'distributed' | 'completed';
}

export class SwarmService {
  private agents = new Map<string, SwarmAgentRecord>();
  private tasks = new Map<string, SwarmTaskRecord>();
  private initialized = false;

  async initialize(): Promise<boolean> {
    this.initialized = true;
    return this.initialized;
  }

  async registerAgent(agentId: string, name: string): Promise<SwarmAgentRecord> {
    const agent: SwarmAgentRecord = { id: agentId, name };
    this.agents.set(agentId, agent);
    return agent;
  }

  async distributeTask(task: { title: string }): Promise<{ taskId: string; status: 'distributed' }> {
    const taskId = `task-${this.tasks.size + 1}`;
    this.tasks.set(taskId, {
      id: taskId,
      title: task.title,
      status: 'distributed',
    });
    return { taskId, status: 'distributed' };
  }

  async getSwarmStatus(): Promise<{ agents: number; activeTasks: number }> {
    const activeTasks = [...this.tasks.values()].filter(task => task.status !== 'completed').length;
    return { agents: this.agents.size, activeTasks };
  }
}
