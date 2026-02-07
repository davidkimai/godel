import { logger } from '../utils/logger';
import { promises as fs } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================
const CHECKPOINTS_DIR = '~/.config/godel/checkpoints';
const KEEP_HOURS = 24; // Keep checkpoints for 24 hours

// ============================================================================
// INTERFACES
// ============================================================================

export interface SystemState {
  version: string;
  lastCheckpoint: Date;

  // Operational state
  agents: AgentState[];
  teams: TeamState[];
  budgets: BudgetState;
  budgetsConfig: Record<string, unknown>;

  // Learnings
  metrics: MetricSnapshot[];
  patterns: Pattern[];
  improvements: Improvement[];

  // Recovery
  pendingActions: PendingAction[];
  lastInterview?: InterviewResult;
}

export interface AgentState {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'failed' | 'completed';
  model: string;
  createdAt: Date;
  lastActivity: Date;
  task?: string;
  budget?: number;
}

export interface TeamState {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  createdAt: Date;
  completedAt?: Date;
  spend: number;
  model: string;
  task: string;
  result?: unknown;
  error?: string;
}

export interface BudgetState {
  totalSpend: number;
  agentCount: number;
  teamCount: number;
  history: BudgetSnapshot[];
}

export interface BudgetSnapshot {
  timestamp: Date;
  totalSpend: number;
  agentCount: number;
  teamCount: number;
}

export interface MetricSnapshot {
  timestamp: Date;
  testPassRate: number;
  buildDuration: number;
  errorCount: number;
  agentCount: number;
  activeTeams: number;
  spend: number;
}

export interface Pattern {
  name: string;
  description: string;
  frequency: number;
  evidence: string[];
  firstSeen: Date;
  lastSeen: Date;
  severity: 'low' | 'medium' | 'high';
}

export interface Improvement {
  id: string;
  description: string;
  category: 'fix' | 'feature' | 'refactor' | 'optimization';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  createdAt: Date;
  completedAt?: Date;
  impact?: string;
}

export interface PendingAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  retries: number;
}

export interface InterviewResult {
  timestamp: Date;
  findings: string[];
  recommendations: string[];
  priorities: string[];
}

// ============================================================================
// STATE MANAGER
// ============================================================================
export class StateManager {
  private checkpointsDir: string;

  constructor() {
    this.checkpointsDir = CHECKPOINTS_DIR.replace('~', process.env['HOME'] || '');
  }

  // --------------------------------------------------------------------------
  // CHECKPOINT OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Capture current system state
   */
  async captureCurrentState(
    agents: AgentState[],
    teams: TeamState[],
    budgets: BudgetState,
    budgetsConfig: Record<string, unknown>,
    metrics: MetricSnapshot[],
    patterns: Pattern[],
    improvements: Improvement[],
    pendingActions: PendingAction[],
    lastInterview?: InterviewResult
  ): Promise<SystemState> {
    const state: SystemState = {
      version: '3.0.0',
      lastCheckpoint: new Date(),
      agents,
      teams,
      budgets,
      budgetsConfig,
      metrics,
      patterns,
      improvements,
      pendingActions,
      lastInterview,
    };

    return state;
  }

  /**
   * Save checkpoint to disk
   */
  async saveCheckpoint(state: SystemState): Promise<string> {
    // Ensure directory exists
    await this.ensureDirectory(this.checkpointsDir);

    // Generate filename with timestamp
    const timestamp = Date.now();
    const filename = `state_${timestamp}.json`;
    const filepath = join(this.checkpointsDir, filename);

    // Write checkpoint
    await fs.writeFile(filepath, JSON.stringify(state, null, 2));

    logger.info('state-manager', 'Checkpoint saved', {
      filepath,
      agentCount: state.agents.length,
      swarmCount: state.teams.length,
      totalSpend: state.budgets.totalSpend,
    });

    // Prune old checkpoints
    await this.pruneOldCheckpoints();

    return filepath;
  }

  /**
   * Load latest checkpoint
   */
  async loadLatestCheckpoint(): Promise<SystemState | null> {
    const checkpoints = await this.listCheckpoints();

    if (checkpoints.length === 0) {
      logger.warn('state-manager', 'No checkpoints found');
      return null;
    }

    // Load latest
    const latest = checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
    return this.loadCheckpoint(latest.filepath);
  }

  /**
   * Load specific checkpoint
   */
  async loadCheckpoint(filepath: string): Promise<SystemState | null> {
    try {
      const content = await fs.readFile(filepath, 'utf8');
      const state = JSON.parse(content, this.dateReviver);

      logger.info('state-manager', 'Checkpoint loaded', {
        filepath,
        timestamp: state.lastCheckpoint,
        agentCount: state.agents.length,
      });

      return state;
    } catch (error) {
      logger.error('state-manager', 'Failed to load checkpoint', { filepath, error });
      return null;
    }
  }

  /**
   * List all checkpoints
   */
  async listCheckpoints(): Promise<{ filepath: string; timestamp: number; size: number }[]> {
    try {
      await this.ensureDirectory(this.checkpointsDir);
      const files = await fs.readdir(this.checkpointsDir);

      const checkpoints = await Promise.all(
        files
          .filter(f => f.startsWith('state_') && f.endsWith('.json'))
          .map(async f => {
            const filepath = join(this.checkpointsDir, f);
            const stats = await fs.stat(filepath);
            const timestamp = parseInt(f.replace('state_', '').replace('.json', ''), 10);
            return { filepath, timestamp, size: stats.size };
          })
      );

      return checkpoints;
    } catch (error) {
      logger.error('state-manager', 'Failed to list checkpoints', { error });
      return [];
    }
  }

  /**
   * Prune checkpoints older than KEEP_HOURS
   */
  async pruneOldCheckpoints(): Promise<number> {
    const cutoff = Date.now() - KEEP_HOURS * 60 * 60 * 1000;
    const checkpoints = await this.listCheckpoints();

    let deleted = 0;
    for (const checkpoint of checkpoints) {
      if (checkpoint.timestamp < cutoff) {
        try {
          await fs.unlink(checkpoint.filepath);
          deleted++;
        } catch (error) {
          logger.error('state-manager', 'Failed to delete checkpoint', { checkpoint, error });
        }
      }
    }

    if (deleted > 0) {
      logger.info('state-manager', 'Pruned old checkpoints', { deleted, remaining: checkpoints.length - deleted });
    }

    return deleted;
  }

  /**
   * Get checkpoint age in hours
   */
  async getLatestCheckpointAge(): Promise<number | null> {
    const checkpoints = await this.listCheckpoints();
    if (checkpoints.length === 0) return null;

    const latest = checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
    return (Date.now() - latest.timestamp) / (1000 * 60 * 60);
  }

  // --------------------------------------------------------------------------
  // RECOVERY OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Recover from checkpoint
   */
  async recoverFromCheckpoint(
    state: SystemState,
    options: {
      restartAgents?: boolean;
      resumeTeams?: boolean;
      restoreBudgets?: boolean;
      replayActions?: boolean;
    } = {}
  ): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      success: true,
      agentsRestored: 0,
      teamsResumed: 0,
      budgetsRestored: false,
      actionsReplayed: 0,
      errors: [],
    };

    // Restore agents
    if (options.restartAgents !== false) {
      for (const agent of state.agents) {
        if (agent.status === 'running') {
          try {
            // In real implementation, call agent lifecycle to restart
            result.agentsRestored++;
          } catch (error) {
            result.errors.push(`Failed to restore agent ${agent.id}: ${error}`);
          }
        }
      }
    }

    // Resume teams
    if (options.resumeTeams !== false) {
      for (const team of state.teams) {
        if (team.status === 'running') {
          try {
            // In real implementation, resume team
            result.teamsResumed++;
          } catch (error) {
            result.errors.push(`Failed to resume team ${team.id}: ${error}`);
          }
        }
      }
    }

    // Restore budgets
    if (options.restoreBudgets !== false) {
      try {
        // In real implementation, restore budgets from state.budgetsConfig
        result.budgetsRestored = true;
      } catch (error) {
        result.errors.push(`Failed to restore budgets: ${error}`);
      }
    }

    // Replay pending actions
    if (options.replayActions !== false) {
      for (const action of state.pendingActions) {
        try {
          // In real implementation, replay action
          result.actionsReplayed++;
        } catch (error) {
          result.errors.push(`Failed to replay action ${action.id}: ${error}`);
        }
      }
    }

    result.success = result.errors.length === 0;

    logger.info('state-manager', 'Recovery complete', {
      success: result.success,
      agentsRestored: result.agentsRestored,
      teamsResumed: result.teamsResumed,
      budgetsRestored: result.budgetsRestored,
      actionsReplayed: result.actionsReplayed,
      errors: result.errors.length,
    });

    return result;
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private dateReviver(key: string, value: unknown): unknown {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime()) && key.toLowerCase().includes('at')) {
        return date;
      }
    }
    return value;
  }
}

// ============================================================================
// RECOVERY RESULT
// ============================================================================
export interface RecoveryResult {
  success: boolean;
  agentsRestored: number;
  teamsResumed: number;
  budgetsRestored: boolean;
  actionsReplayed: number;
  errors: string[];
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const stateManager = new StateManager();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick save of current state
 */
export async function saveState(
  agents: AgentState[],
  teams: TeamState[],
  budgets: BudgetState,
  budgetsConfig: Record<string, unknown>
): Promise<string> {
  return stateManager.saveCheckpoint(
    await stateManager.captureCurrentState(
      agents,
      teams,
      budgets,
      budgetsConfig,
      [],
      [],
      [],
      []
    )
  );
}

/**
 * Quick load of latest state
 */
export async function loadState(): Promise<SystemState | null> {
  return stateManager.loadLatestCheckpoint();
}

/**
 * Get checkpoint status
 */
export async function getCheckpointStatus(): Promise<{
  count: number;
  latestAge: number | null;
  totalSize: number;
}> {
  const checkpoints = await stateManager.listCheckpoints();
  const latestAge = await stateManager.getLatestCheckpointAge();
  const totalSize = checkpoints.reduce((sum, c) => sum + c.size, 0);

  return {
    count: checkpoints.length,
    latestAge,
    totalSize,
  };
}
