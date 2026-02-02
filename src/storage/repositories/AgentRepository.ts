/**
 * Agent Repository
 * 
 * CRUD operations for agents in SQLite.
 */

import { getDb } from '../sqlite';

export interface Agent {
  id: string;
  swarm_id: string;
  parent_id?: string;
  status: 'idle' | 'spawning' | 'running' | 'paused' | 'completed' | 'failed' | 'killing';
  task: string;
  model?: string;
  tokens_input: number;
  tokens_output: number;
  cost: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export class AgentRepository {
  async create(data: Partial<Agent>): Promise<Agent> {
    const db = await getDb();
    const id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const agent: Agent = {
      id,
      swarm_id: data.swarm_id || '',
      parent_id: data.parent_id,
      status: data.status || 'idle',
      task: data.task || '',
      model: data.model,
      tokens_input: 0,
      tokens_output: 0,
      cost: 0,
      created_at: now
    };

    await db.run(
      `INSERT INTO agents (id, swarm_id, parent_id, status, task, model, 
        tokens_input, tokens_output, cost, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [agent.id, agent.swarm_id, agent.parent_id, agent.status, agent.task,
       agent.model, agent.tokens_input, agent.tokens_output, agent.cost, agent.created_at]
    );

    return agent;
  }

  async findById(id: string): Promise<Agent | undefined> {
    const db = await getDb();
    const row = await db.get('SELECT * FROM agents WHERE id = ?', [id]);
    return row;
  }

  async findBySwarmId(swarmId: string): Promise<Agent[]> {
    const db = await getDb();
    return db.all('SELECT * FROM agents WHERE swarm_id = ?', [swarmId]);
  }

  async updateStatus(id: string, status: Agent['status']): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    
    let query = 'UPDATE agents SET status = ?';
    const params: unknown[] = [status];

    if (status === 'running') {
      query += ', started_at = ?';
      params.push(now);
    } else if (status === 'completed' || status === 'failed') {
      query += ', completed_at = ?';
      params.push(now);
    }

    query += ' WHERE id = ?';
    params.push(id);

    await db.run(query, params);
  }

  async addTokenUsage(id: string, input: number, output: number, cost: number): Promise<void> {
    const db = await getDb();
    await db.run(
      `UPDATE agents 
       SET tokens_input = tokens_input + ?,
           tokens_output = tokens_output + ?,
           cost = cost + ?
       WHERE id = ?`,
      [input, output, cost, id]
    );
  }

  async getStatsBySwarm(swarmId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalCost: number;
    totalTokens: number;
  }> {
    const db = await getDb();
    const agents = await this.findBySwarmId(swarmId);
    
    const byStatus: Record<string, number> = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const agent of agents) {
      byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
      totalCost += agent.cost;
      totalTokens += agent.tokens_input + agent.tokens_output;
    }

    return {
      total: agents.length,
      byStatus,
      totalCost,
      totalTokens
    };
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.run('DELETE FROM agents WHERE id = ?', [id]);
    return (result.changes || 0) > 0;
  }

  async list(options: { limit?: number; offset?: number } = {}): Promise<Agent[]> {
    const db = await getDb();
    let query = 'SELECT * FROM agents ORDER BY created_at DESC';
    const params: unknown[] = [];

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    return db.all(query, params);
  }
}
