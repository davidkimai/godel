/**
 * Agent Service
 * Minimal in-memory implementation used by tests and lightweight usage.
 */

export interface CreateAgentInput {
  name: string;
}

export interface AgentRecord {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'completed' | 'failed';
  tasksCompleted: number;
}

export interface AgentStatus {
  status: AgentRecord['status'];
  tasksCompleted: number;
}

export class AgentService {
  private agents = new Map<string, AgentRecord>();

  async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
    const id = `agent-${this.agents.size + 1}`;
    const agent: AgentRecord = {
      id,
      name: input.name,
      status: 'active',
      tasksCompleted: 0,
    };
    this.agents.set(id, agent);
    return agent;
  }

  async getAgentStatus(agentId: string): Promise<AgentStatus> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { status: 'inactive', tasksCompleted: 0 };
    }
    return { status: agent.status, tasksCompleted: agent.tasksCompleted };
  }
}
