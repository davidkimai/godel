/**
 * Swarm Repository
 * 
 * CRUD operations for swarms in SQLite.
 */

import { getDb } from '../sqlite';

export interface Swarm {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  config: Record<string, unknown>;
  budget_id?: string;
  created_at: string;
  updated_at: string;
}

export class SwarmRepository {
  async create(data: Partial<Swarm>): Promise<Swarm> {
    const db = await getDb();
    const id = `swarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const swarm: Swarm = {
      id,
      name: data.name || 'Unnamed Swarm',
      status: data.status || 'running',
      config: data.config || {},
      budget_id: data.budget_id,
      created_at: now,
      updated_at: now
    };

    await db.run(
      `INSERT INTO swarms (id, name, status, config, budget_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [swarm.id, swarm.name, swarm.status, JSON.stringify(swarm.config), 
       swarm.budget_id, swarm.created_at, swarm.updated_at]
    );

    return swarm;
  }

  async findById(id: string): Promise<Swarm | undefined> {
    const db = await getDb();
    const row = await db.get('SELECT * FROM swarms WHERE id = ?', [id]);
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async findByStatus(status: Swarm['status']): Promise<Swarm[]> {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM swarms WHERE status = ?', [status]);
    return rows.map(row => this.mapRow(row));
  }

  async update(id: string, data: Partial<Swarm>): Promise<Swarm | undefined> {
    const db = await getDb();
    const existing = await this.findById(id);
    if (!existing) return undefined;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.config !== undefined) {
      updates.push('config = ?');
      values.push(JSON.stringify(data.config));
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await db.run(
      `UPDATE swarms SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.run('DELETE FROM swarms WHERE id = ?', [id]);
    return (result.changes || 0) > 0;
  }

  async list(options: { limit?: number; offset?: number } = {}): Promise<Swarm[]> {
    const db = await getDb();
    let query = 'SELECT * FROM swarms ORDER BY created_at DESC';
    const params: unknown[] = [];

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = await db.all(query, params);
    return rows.map(row => this.mapRow(row));
  }

  private mapRow(row: any): Swarm {
    return {
      ...row,
      config: JSON.parse(row.config || '{}')
    };
  }
}
