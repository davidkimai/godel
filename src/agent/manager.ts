import { getAgentStorage, AgentStorageInterface, AgentData } from '../storage/index.js';

export class AgentManager {
  private storage: AgentStorageInterface;
  
  constructor(storage?: AgentStorageInterface) {
    this.storage = storage || getAgentStorage();
  }
  
  async createAgent(name: string, provider: string, model: string): Promise<string> {
    const data: AgentData = {
      id: '',
      name,
      provider,
      model,
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    return this.storage.createAgent(data);
  }
  
  async getAgent(id: string): Promise<AgentData | null> {
    return this.storage.getAgent(id);
  }
  
  async listAgents(): Promise<AgentData[]> {
    return this.storage.listAgents();
  }
  
  async updateAgent(id: string, data: Partial<AgentData>): Promise<void> {
    return this.storage.updateAgent(id, data);
  }
  
  async deleteAgent(id: string): Promise<void> {
    return this.storage.deleteAgent(id);
  }
}
