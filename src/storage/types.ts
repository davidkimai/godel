export interface AgentStorageInterface {
  // Core operations
  create(table: string, data: Record<string, unknown>): Promise<string>;
  read(table: string, id: string): Promise<Record<string, unknown> | null>;
  update(table: string, id: string, data: Record<string, unknown>): Promise<void>;
  delete(table: string, id: string): Promise<void>;
  list(table: string): Promise<Record<string, unknown>[]>;
  
  // Agent-specific
  createAgent(data: AgentData): Promise<string>;
  getAgent(id: string): Promise<AgentData | null>;
  updateAgent(id: string, data: Partial<AgentData>): Promise<void>;
  deleteAgent(id: string): Promise<void>;
  listAgents(): Promise<AgentData[]>;
  
  // Team-specific
  createTeam(data: TeamData): Promise<string>;
  getTeam(id: string): Promise<TeamData | null>;
  updateTeam(id: string, data: Partial<TeamData>): Promise<void>;
  deleteTeam(id: string): Promise<void>;
  listTeams(): Promise<TeamData[]>;
}

export interface AgentData {
  id: string;
  name: string;
  provider: string;
  model: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface TeamData {
  id: string;
  name: string;
  agentIds: string[];
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}
