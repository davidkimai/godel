import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

export interface GodelConfig {
  serverUrl: string;
  apiKey: string;
}

export interface Agent {
  id: string;
  role: string;
  status: string;
  model: string;
  label?: string;
}

export interface Team {
  id: string;
  name: string;
  status: string;
  agentCount: number;
}

export class GodelClient {
  private client: AxiosInstance;
  private config: GodelConfig;

  constructor(config: GodelConfig) {
    this.config = config;
    this.client = this.createClient();
  }

  private createClient(): AxiosInstance {
    return axios.create({
      baseURL: this.config.serverUrl,
      headers: this.config.apiKey
        ? { Authorization: `Bearer ${this.config.apiKey}` }
        : {},
      timeout: 30000
    });
  }

  updateConfig(config: Partial<GodelConfig>) {
    this.config = { ...this.config, ...config };
    this.client = this.createClient();
  }

  async health(): Promise<any> {
    const response = await this.client.get('/health');
    return response.data;
  }

  async listAgents(): Promise<Agent[]> {
    const response = await this.client.get('/api/v1/agents');
    return response.data.agents || [];
  }

  async listTeams(): Promise<Team[]> {
    const response = await this.client.get('/api/v1/teams');
    return response.data.teams || [];
  }

  async spawnAgent(params: {
    model: string;
    role: string;
    label?: string;
  }): Promise<Agent> {
    const response = await this.client.post('/api/v1/agents', {
      runtime: 'pi',
      pi_config: { model: params.model },
      role: params.role,
      label: params.label
    });
    return response.data;
  }

  async createTeam(params: {
    name: string;
    strategy: string;
    workers: number;
  }): Promise<Team> {
    const response = await this.client.post('/api/v1/teams', {
      name: params.name,
      strategy: params.strategy,
      composition: {
        coordinator: { role: 'coordinator', model: 'claude-opus-4' },
        workers: [
          { role: 'worker', model: 'claude-sonnet-4-5', count: params.workers }
        ]
      }
    });
    return response.data;
  }

  async executeIntent(params: {
    description: string;
    onProgress?: (update: any) => void;
  }): Promise<{ id: string; status: string }> {
    const response = await this.client.post('/api/v1/intent', {
      description: params.description
    });
    return response.data;
  }

  async cancelIntent(intentId: string): Promise<void> {
    await this.client.post(`/api/v1/intent/${intentId}/cancel`);
  }

  async getAgentLogs(agentId: string, lines: number = 50): Promise<string> {
    const response = await this.client.get(`/api/v1/agents/${agentId}/logs`, {
      params: { lines }
    });
    return response.data.logs || '';
  }

  streamAgentLogs(agentId: string): EventEmitter {
    const emitter = new EventEmitter();
    // In a real implementation, this would use WebSocket
    // For now, we'll poll
    const interval = setInterval(async () => {
      try {
        const logs = await this.getAgentLogs(agentId, 5);
        emitter.emit('log', logs);
      } catch {
        clearInterval(interval);
      }
    }, 2000);

    return emitter;
  }

  async killAgent(agentId: string): Promise<void> {
    await this.client.delete(`/api/v1/agents/${agentId}`);
  }
}
