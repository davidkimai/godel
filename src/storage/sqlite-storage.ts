import Database from 'better-sqlite3';
import * as path from 'path';
import { AgentStorageInterface, AgentData, SwarmData } from './types';

export class AgentSQLiteStorage implements AgentStorageInterface {
  private db: Database.Database;
  private initialized = false;
  
  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'dash.db');
    this.db = new Database(resolvedPath);
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      );
      
      CREATE TABLE IF NOT EXISTS swarms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        agent_ids TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_swarms_status ON swarms(status);
    `);
    
    this.initialized = true;
  }
  
  // Core operations
  async create(table: string, data: Record<string, unknown>): Promise<string> {
    await this.initialize();
    const id = crypto.randomUUID();
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO ${table} (id, ${Object.keys(data).join(', ')}, created_at, updated_at)
      VALUES (?, ${Object.keys(data).map(() => '?').join(', ')}, ?, ?)
    `);
    
    stmt.run(id, ...Object.values(data), now, now);
    return id;
  }
  
  async read(table: string, id: string): Promise<Record<string, unknown> | null> {
    await this.initialize();
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    const result = stmt.get(id);
    return result as Record<string, unknown> | null || null;
  }
  
  async update(table: string, id: string, data: Record<string, unknown>): Promise<void> {
    await this.initialize();
    const now = Date.now();
    
    const setClause = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const stmt = this.db.prepare(`
      UPDATE ${table} SET ${setClause}, updated_at = ? WHERE id = ?
    `);
    
    stmt.run(...Object.values(data), now, id);
  }
  
  async delete(table: string, id: string): Promise<void> {
    await this.initialize();
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    stmt.run(id);
  }
  
  async list(table: string): Promise<Record<string, unknown>[]> {
    await this.initialize();
    const stmt = this.db.prepare(`SELECT * FROM ${table}`);
    return stmt.all() as Record<string, unknown>[];
  }
  
  // Agent-specific operations
  async createAgent(data: AgentData): Promise<string> {
    return this.create('agents', {
      name: data.name,
      provider: data.provider,
      model: data.model,
      status: data.status,
      metadata: JSON.stringify(data.metadata || {})
    });
  }
  
  async getAgent(id: string): Promise<AgentData | null> {
    const row = await this.read('agents', id) as Record<string, unknown> | null;
    if (!row) return null;
    
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      provider: row['provider'] as string,
      model: row['model'] as string,
      status: row['status'] as AgentData['status'],
      createdAt: row['created_at'] as number,
      updatedAt: row['updated_at'] as number,
      metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : undefined
    };
  }
  
  async updateAgent(id: string, data: Partial<AgentData>): Promise<void> {
    await this.update('agents', id, data as Record<string, unknown>);
  }
  
  async deleteAgent(id: string): Promise<void> {
    await this.delete('agents', id);
  }
  
  async listAgents(): Promise<AgentData[]> {
    const rows = await this.list('agents') as Record<string, unknown>[];
    return rows.map(row => ({
      id: row['id'] as string,
      name: row['name'] as string,
      provider: row['provider'] as string,
      model: row['model'] as string,
      status: row['status'] as AgentData['status'],
      createdAt: row['created_at'] as number,
      updatedAt: row['updated_at'] as number,
      metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : undefined
    }));
  }
  
  // Swarm-specific operations
  async createSwarm(data: SwarmData): Promise<string> {
    return this.create('swarms', {
      name: data.name,
      task: data.task,
      status: data.status,
      agent_ids: JSON.stringify(data.agentIds),
      metadata: JSON.stringify(data.metadata || {})
    });
  }
  
  async getSwarm(id: string): Promise<SwarmData | null> {
    const row = await this.read('swarms', id) as Record<string, unknown> | null;
    if (!row) return null;
    
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      task: row['task'] as string,
      agentIds: JSON.parse(row['agent_ids'] as string),
      status: row['status'] as SwarmData['status'],
      createdAt: row['created_at'] as number,
      updatedAt: row['updated_at'] as number,
      metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : undefined
    };
  }
  
  async updateSwarm(id: string, data: Partial<SwarmData>): Promise<void> {
    await this.update('swarms', id, data as Record<string, unknown>);
  }
  
  async deleteSwarm(id: string): Promise<void> {
    await this.delete('swarms', id);
  }
  
  async listSwarms(): Promise<SwarmData[]> {
    const rows = await this.list('swarms') as Record<string, unknown>[];
    return rows.map(row => ({
      id: row['id'] as string,
      name: row['name'] as string,
      task: row['task'] as string,
      agentIds: JSON.parse(row['agent_ids'] as string),
      status: row['status'] as SwarmData['status'],
      createdAt: row['created_at'] as number,
      updatedAt: row['updated_at'] as number,
      metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : undefined
    }));
  }
}
