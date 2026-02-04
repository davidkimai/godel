/**
 * Workflow Repository - PostgreSQL storage for workflows and executions
 * 
 * Stores workflow definitions and execution state in PostgreSQL,
 * integrating with the existing repository pattern.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  Workflow,
  WorkflowState,
  WorkflowStatus,
  StepStatus,
  WorkflowStepState,
} from '../../workflow/types';

// ============================================================================
// Database Row Types
// ============================================================================

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  version: string;
  definition: string;
  variables: string | null;
  on_failure: string;
  timeout: number | null;
  metadata: string | null;
  created_at: Date;
  updated_at: Date;
}

interface WorkflowExecutionRow {
  id: string;
  workflow_id: string;
  status: string;
  state: string;
  started_at: Date | null;
  completed_at: Date | null;
  duration_ms: number | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Repository
// ============================================================================

export class WorkflowRepository {
  constructor(private pool: Pool) {}

  // ============================================================================
  // Schema Management
  // ============================================================================

  async createSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          version TEXT NOT NULL DEFAULT '1.0.0',
          definition TEXT NOT NULL,
          variables TEXT,
          on_failure TEXT NOT NULL DEFAULT 'stop',
          timeout INTEGER,
          metadata TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS workflow_executions (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          state TEXT NOT NULL,
          started_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          duration_ms INTEGER,
          error TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id 
        ON workflow_executions(workflow_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_workflow_executions_status 
        ON workflow_executions(status)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at 
        ON workflow_executions(created_at DESC)
      `);
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Workflow CRUD
  // ============================================================================

  async createWorkflow(workflow: Workflow): Promise<Workflow> {
    const id = workflow.id || `wf_${randomUUID().slice(0, 8)}`;
    const workflowWithId = { ...workflow, id };

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO workflows (id, name, description, version, definition, variables, on_failure, timeout, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          workflow.name,
          workflow.description || null,
          workflow.version,
          JSON.stringify(workflow.steps),
          workflow.variables ? JSON.stringify(workflow.variables) : null,
          workflow.onFailure,
          workflow.timeout || null,
          workflow.metadata ? JSON.stringify(workflow.metadata) : null,
        ]
      );
      return workflowWithId;
    } finally {
      client.release();
    }
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<WorkflowRow>(
        'SELECT * FROM workflows WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToWorkflow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getWorkflowByName(name: string): Promise<Workflow | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<WorkflowRow>(
        'SELECT * FROM workflows WHERE name = $1 ORDER BY created_at DESC LIMIT 1',
        [name]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToWorkflow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async listWorkflows(limit = 100, offset = 0): Promise<Workflow[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<WorkflowRow>(
        'SELECT * FROM workflows ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      return result.rows.map(row => this.rowToWorkflow(row));
    } finally {
      client.release();
    }
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow | null> {
    const client = await this.pool.connect();
    try {
      const sets: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        sets.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        sets.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.version !== undefined) {
        sets.push(`version = $${paramIndex++}`);
        values.push(updates.version);
      }
      if (updates.steps !== undefined) {
        sets.push(`definition = $${paramIndex++}`);
        values.push(JSON.stringify(updates.steps));
      }
      if (updates.variables !== undefined) {
        sets.push(`variables = $${paramIndex++}`);
        values.push(JSON.stringify(updates.variables));
      }
      if (updates.onFailure !== undefined) {
        sets.push(`on_failure = $${paramIndex++}`);
        values.push(updates.onFailure);
      }
      if (updates.timeout !== undefined) {
        sets.push(`timeout = $${paramIndex++}`);
        values.push(updates.timeout);
      }
      if (updates.metadata !== undefined) {
        sets.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(updates.metadata));
      }

      if (sets.length === 0) {
        return this.getWorkflow(id);
      }

      sets.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query<WorkflowRow>(
        `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToWorkflow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM workflows WHERE id = $1',
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Execution CRUD
  // ============================================================================

  async createExecution(
    workflowId: string,
    state: WorkflowState
  ): Promise<{ id: string; workflowId: string; state: WorkflowState }> {
    const id = `exec_${randomUUID().slice(0, 8)}`;

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO workflow_executions (id, workflow_id, status, state, started_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          workflowId,
          state.status,
          this.serializeState(state),
          state.startedAt || new Date(),
        ]
      );

      return { id, workflowId, state };
    } finally {
      client.release();
    }
  }

  async getExecution(id: string): Promise<{ id: string; workflowId: string; state: WorkflowState } | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<WorkflowExecutionRow>(
        'SELECT * FROM workflow_executions WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        workflowId: row.workflow_id,
        state: this.deserializeState(row.state),
      };
    } finally {
      client.release();
    }
  }

  async updateExecution(id: string, state: WorkflowState): Promise<void> {
    const client = await this.pool.connect();
    try {
      const updates: string[] = ['status = $2', 'state = $3', 'updated_at = CURRENT_TIMESTAMP'];
      const values: unknown[] = [id, state.status, this.serializeState(state)];
      let paramIndex = 4;

      if (state.completedAt) {
        updates.push(`completed_at = $${paramIndex++}`);
        values.push(state.completedAt);
      }

      if (state.error) {
        updates.push(`error = $${paramIndex++}`);
        values.push(JSON.stringify(state.error));
      }

      if (state.startedAt && state.completedAt) {
        updates.push(`duration_ms = $${paramIndex++}`);
        values.push(state.completedAt.getTime() - state.startedAt.getTime());
      }

      await client.query(
        `UPDATE workflow_executions SET ${updates.join(', ')} WHERE id = $1`,
        values
      );
    } finally {
      client.release();
    }
  }

  async listExecutions(
    workflowId?: string,
    status?: WorkflowStatus,
    limit = 100,
    offset = 0
  ): Promise<Array<{ id: string; workflowId: string; state: WorkflowState }>> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM workflow_executions';
      const conditions: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (workflowId) {
        conditions.push(`workflow_id = $${paramIndex++}`);
        values.push(workflowId);
      }

      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(status);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      values.push(limit, offset);

      const result = await client.query<WorkflowExecutionRow>(query, values);

      return result.rows.map(row => ({
        id: row.id,
        workflowId: row.workflow_id,
        state: this.deserializeState(row.state),
      }));
    } finally {
      client.release();
    }
  }

  async deleteExecution(id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM workflow_executions WHERE id = $1',
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async getActiveExecutions(): Promise<Array<{ id: string; workflowId: string; state: WorkflowState }>> {
    return this.listExecutions(undefined, WorkflowStatus.RUNNING, 1000);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getWorkflowStats(workflowId: string): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDurationMs: number;
  }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        total_executions: string;
        successful_executions: string;
        failed_executions: string;
        average_duration_ms: string;
      }>(
        `SELECT 
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE status = 'completed') as successful_executions,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_executions,
          COALESCE(AVG(duration_ms), 0) as average_duration_ms
         FROM workflow_executions
         WHERE workflow_id = $1`,
        [workflowId]
      );

      const row = result.rows[0];
      return {
        totalExecutions: parseInt(row.total_executions, 10),
        successfulExecutions: parseInt(row.successful_executions, 10),
        failedExecutions: parseInt(row.failed_executions, 10),
        averageDurationMs: parseFloat(row.average_duration_ms),
      };
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Serialization Helpers
  // ============================================================================

  private rowToWorkflow(row: WorkflowRow): Workflow {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      version: row.version,
      steps: JSON.parse(row.definition),
      variables: row.variables ? JSON.parse(row.variables) : undefined,
      onFailure: row.on_failure as 'stop' | 'continue' | 'retry_all',
      timeout: row.timeout || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private serializeState(state: WorkflowState): string {
    // Convert Map to object for serialization
    const serialized = {
      ...state,
      stepStates: Object.fromEntries(state.stepStates),
    };
    return JSON.stringify(serialized);
  }

  private deserializeState(json: string): WorkflowState {
    const parsed = JSON.parse(json);
    
    // Convert stepStates back to Map
    const stepStates = new Map<string, WorkflowStepState>();
    if (parsed.stepStates) {
      for (const [key, value] of Object.entries(parsed.stepStates)) {
        stepStates.set(key, value as WorkflowStepState);
      }
    }

    return {
      ...parsed,
      stepStates,
      startedAt: parsed.startedAt ? new Date(parsed.startedAt) : undefined,
      completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalWorkflowRepository: WorkflowRepository | null = null;

export function getWorkflowRepository(pool: Pool): WorkflowRepository {
  if (!globalWorkflowRepository) {
    globalWorkflowRepository = new WorkflowRepository(pool);
  }
  return globalWorkflowRepository;
}

export function resetWorkflowRepository(): void {
  globalWorkflowRepository = null;
}

export default WorkflowRepository;
