/**
 * Team Service
 * Minimal in-memory implementation used by tests and lightweight usage.
 */

export interface TeamAgentRecord {
  id: string;
  name: string;
}

export interface TeamTaskRecord {
  id: string;
  title: string;
  status: 'distributed' | 'completed';
}

export class TeamService {
  private agents = new Map<string, TeamAgentRecord>();
  private tasks = new Map<string, TeamTaskRecord>();
  private initialized = false;

  async initialize(): Promise<boolean> {
    this.initialized = true;
    return this.initialized;
  }

  async registerAgent(agentId: string, name: string): Promise<TeamAgentRecord> {
    const agent: TeamAgentRecord = { id: agentId, name };
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

  async getTeamStatus(): Promise<{ agents: number; activeTasks: number }> {
    const activeTasks = [...this.tasks.values()].filter(task => task.status !== 'completed').length;
    return { agents: this.agents.size, activeTasks };
  }
}
