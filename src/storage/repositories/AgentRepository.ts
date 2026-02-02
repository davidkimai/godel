/**
 * Agent Repository
 * 
 * CRUD operations for agents in SQLite.
 */

import { getDb } from '../sqlite';

export interface Agent {
  id: string;
  label?: string;
  status: 'idle' | 'spawning' | 'running' | 'paused' | 'completed' | 'failed' | 'killing';
  model: string;
  task: string;
  spawned_at: string;
  completed_at?: string;
  runtime?: number;
  pause_time?: string;
  paused_by?: string;
  swarm_id?: string;
  parent_id?: string;
  child_ids?: string[];  // JSON
  context?: Record<string, unknown>;  // JSON
  code?: Record<string, unknown>;  // JSON
  reasoning?: Record<string, unknown>;  // JSON
  retry_count: number;
  max_retries: number;
  last_error?: string;
  budget_limit?: number;
  safety_boundaries?: Record<string, unknown>;  // JSON
  metadata?: Record<string, unknown>;  // JSON
}

export class AgentRepository {
  async create(data: Partial<Agent>): Promise<Agent> {
    const db = await getDb();
    const id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const agent: Agent = {
      id,
      label: data.label,
      status: data.status || 'idle',
      model: data.model || 'unknown',
      task: data.task || '',
      spawned_at: now,
      retry_count: 0,
      max_retries: data.max_retries || 3
    };

    await db.run(
      `INSERT INTO agents (id, label, status, model, task, spawned_at, retry_count, max_retries, swarm_id, parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [agent.id, agent.label, agent.status, agent.model, agent.task, 
       agent.spawned_at, agent.retry_count, agent.max_retries, 
       data.swarm_id || null, data.parent_id || null]
    );

    return agent;
  }

  async findById(id: string): Promise<Agent | undefined> {
    const db = await getDb();
    const row = await db.get('SELECT * FROM agents WHERE id = ?', [id]);
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async findBySwarmId(swarmId: string): Promise<Agent[]> {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM agents WHERE swarm_id = ?', [swarmId]);
    return rows.map(row => this.mapRow(row));
  }

  async list(): Promise<Agent[]> {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM agents ORDER BY spawned_at DESC');
    return rows.map(row => this.mapRow(row));
  }

  async updateStatus(id: string, status: Agent['status']): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    
    let query = 'UPDATE agents SET status = ?';
    const params: unknown[] = [status];

    if (status === 'completed' || status === 'failed') {
      query += ', completed_at = ?';
      params.push(now);
    }

    query += ' WHERE id = ?';
    params.push(id);

    await db.run(query, params);
  }

  private mapRow(row: any): Agent {
    return {
      id: row.id,
      label: row.label,
      status: row.status,
      model: row.model,
      task: row.task,
      spawned_at: row.spawned_at,
      completed_at: row.completed_at,
      runtime: row.runtime,
      pause_time: row.pause_time,
      paused_by: row.paused_by,
      swarm_id: row.swarm_id,
      parent_id: row.parent_id,
      child_ids: row.child_ids ? JSON.parse(row.child_ids) : undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
      code: row.code ? JSON.parse(row.code) : undefined,
      reasoning: row.reasoning ? JSON.parse(row.reasoning) : undefined,
      retry_count: row.retry_count,
      max_retries: row.max_retries,
      last_error: row.last_error,
      budget_limit: row.budget_limit,
      safety_boundaries: row.safety_boundaries ? JSON.parse(row.safety_boundaries) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}
