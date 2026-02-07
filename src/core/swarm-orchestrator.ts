/**
 * Team Orchestrator Module
 * 
 * Coordinates team operations and manages team lifecycle across the system.
 */

import { EventEmitter } from 'events';
import type { TeamManager } from './team';
import type { TeamExecutor } from './team-executor';

export interface TeamOrchestratorConfig {
  maxConcurrentTeams?: number;
  defaultTimeout?: number;
  autoCleanup?: boolean;
}

export interface OrchestratedTeam {
  id: string;
  teamId: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * TeamOrchestrator - Manages multiple teams and their execution
 */
export class TeamOrchestrator extends EventEmitter {
  private teams: Map<string, OrchestratedTeam> = new Map();
  private config: TeamOrchestratorConfig;
  private teamManager?: TeamManager;
  private teamExecutor?: TeamExecutor;

  constructor(config: TeamOrchestratorConfig = {}) {
    super();
    this.config = {
      maxConcurrentTeams: 10,
      defaultTimeout: 300000,
      autoCleanup: true,
      ...config,
    };
  }

  /**
   * Initialize the orchestrator with dependencies
   */
  initialize(teamManager: TeamManager, teamExecutor: TeamExecutor): void {
    this.teamManager = teamManager;
    this.teamExecutor = teamExecutor;
    this.emit('initialized');
  }

  /**
   * Start the orchestrator
   */
  start(): void {
    this.emit('started');
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    this.emit('stopped');
  }

  /**
   * Register a team for orchestration
   */
  registerTeam(teamId: string): OrchestratedTeam {
    const orchestrated: OrchestratedTeam = {
      id: `orch-${Date.now()}`,
      teamId,
      status: 'pending',
      startedAt: new Date(),
    };

    this.teams.set(orchestrated.id, orchestrated);
    this.emit('team:registered', orchestrated);

    return orchestrated;
  }

  /**
   * Execute a registered team
   */
  async executeTeam(orchestratedId: string, agentIds: string[]): Promise<OrchestratedTeam> {
    const orchestrated = this.teams.get(orchestratedId);
    if (!orchestrated) {
      throw new Error(`Orchestrated team not found: ${orchestratedId}`);
    }

    orchestrated.status = 'active';
    this.emit('team:started', orchestrated);

    try {
      // In a real implementation, this would use teamExecutor
      if (this.teamExecutor) {
        await this.teamExecutor.executeTeam(orchestrated.teamId, agentIds);
      }

      orchestrated.status = 'completed';
      orchestrated.completedAt = new Date();
      this.emit('team:completed', orchestrated);
    } catch (error) {
      orchestrated.status = 'failed';
      orchestrated.error = error instanceof Error ? error.message : String(error);
      orchestrated.completedAt = new Date();
      this.emit('team:failed', orchestrated);
    }

    return orchestrated;
  }

  /**
   * Get an orchestrated team by ID
   */
  getTeam(orchestratedId: string): OrchestratedTeam | undefined {
    return this.teams.get(orchestratedId);
  }

  /**
   * Get all orchestrated teams
   */
  getAllTeams(): OrchestratedTeam[] {
    return Array.from(this.teams.values());
  }

  /**
   * Get active teams
   */
  getActiveTeams(): OrchestratedTeam[] {
    return this.getAllTeams().filter(s => s.status === 'active');
  }

  /**
   * Cancel a running team
   */
  async cancelTeam(orchestratedId: string): Promise<boolean> {
    const orchestrated = this.teams.get(orchestratedId);
    if (!orchestrated) {
      return false;
    }

    if (orchestrated.status === 'active') {
      orchestrated.status = 'failed';
      orchestrated.error = 'Cancelled by user';
      orchestrated.completedAt = new Date();
      this.emit('team:cancelled', orchestrated);
    }

    return true;
  }

  /**
   * Clean up completed teams
   */
  cleanup(): void {
    for (const [id, team] of this.teams) {
      if (team.status === 'completed' || team.status === 'failed') {
        this.teams.delete(id);
      }
    }
    this.emit('cleanup');
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    total: number;
    pending: number;
    active: number;
    completed: number;
    failed: number;
    teams: number;
    agents: number;
  } {
    const teams = this.getAllTeams();
    return {
      total: teams.length,
      pending: teams.filter(s => s.status === 'pending').length,
      active: teams.filter(s => s.status === 'active').length,
      completed: teams.filter(s => s.status === 'completed').length,
      failed: teams.filter(s => s.status === 'failed').length,
      teams: teams.length,
      agents: 0, // Would be populated from actual agent data
    };
  }

  /**
   * Reset the orchestrator (clear all teams)
   */
  reset(): void {
    this.teams.clear();
    this.emit('reset');
  }
}

// Singleton instance
let globalTeamOrchestrator: TeamOrchestrator | null = null;

export function getGlobalTeamOrchestrator(): TeamOrchestrator {
  if (!globalTeamOrchestrator) {
    globalTeamOrchestrator = new TeamOrchestrator();
  }
  return globalTeamOrchestrator;
}

export function resetGlobalTeamOrchestrator(): void {
  if (globalTeamOrchestrator) {
    globalTeamOrchestrator.reset();
  }
  globalTeamOrchestrator = null;
}
