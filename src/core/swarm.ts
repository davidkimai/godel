/**
 * Team Module - Stub Implementation
 * 
 * Minimal implementation to support existing tests.
 * This module provides team management capabilities.
 */

import { EventEmitter } from 'events';
import type { AgentLifecycle } from './lifecycle';
import type { MessageBus } from '../bus/index';
import type { AgentStorage } from '../storage/memory';
import { TeamRepository } from '../storage';
import { ApplicationError } from '../errors';

export class TeamNotFoundError extends ApplicationError {
  constructor(teamId: string) {
    super(`Team not found: ${teamId}`, 'TEAM_NOT_FOUND');
  }
}

export type TeamStrategy = 'round-robin' | 'load-balanced' | 'priority' | 'adaptive';

export interface TeamConfig {
  name: string;
  task: string;
  initialAgents?: number;
  strategy?: TeamStrategy;
  maxAgents?: number;
  minAgents?: number;
  autoScale?: boolean;
  metadata?: Record<string, unknown>;
}

export type TeamState = 'creating' | 'ready' | 'running' | 'paused' | 'destroying' | 'destroyed';

export interface Team {
  id: string;
  name: string;
  task: string;
  state: TeamState;
  agents: string[];
  strategy: TeamStrategy;
  config: TeamConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamManagerOptions {
  lifecycle: AgentLifecycle;
  messageBus: MessageBus;
  storage: AgentStorage;
  teamRepository: TeamRepository;
}

/**
 * TeamManager - Manages teams of agents
 */
export class TeamManager extends EventEmitter {
  private teams: Map<string, Team> = new Map();
  private options: TeamManagerOptions;
  private running: boolean = false;

  constructor(options: TeamManagerOptions) {
    super();
    this.options = options;
  }

  /**
   * Start the team manager
   */
  start(): void {
    this.running = true;
    this.emit('manager.started');
  }

  /**
   * Stop the team manager
   */
  stop(): void {
    this.running = false;
    this.emit('manager.stopped');
  }

  /**
   * Create a new team
   */
  async create(config: TeamConfig): Promise<Team> {
    const id = `team-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const team: Team = {
      id,
      name: config.name,
      task: config.task,
      state: 'creating',
      agents: [],
      strategy: config.strategy || 'round-robin',
      config,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.teams.set(id, team);
    
    // Initialize with initial agents
    const initialAgents = config.initialAgents || 1;
    for (let i = 0; i < initialAgents; i++) {
      // In a real implementation, this would spawn actual agents
      team.agents.push(`agent-${id}-${i}`);
    }

    team.state = 'ready';
    this.emit('team:created', team);
    
    return team;
  }

  /**
   * Get a team by ID
   */
  get(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /**
   * Get all teams
   */
  getAll(): Team[] {
    return Array.from(this.teams.values());
  }

  /**
   * Start a team (transition to running)
   */
  async startTeam(teamId: string): Promise<Team> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    team.state = "running";
    team.updatedAt = new Date();
    this.emit('team:started', team);
    
    return team;
  }

  /**
   * Pause a running team
   */
  async pause(teamId: string): Promise<Team> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    team.state = 'paused';
    team.updatedAt = new Date();
    this.emit('team:paused', team);
    
    return team;
  }

  /**
   * Resume a paused team
   */
  async resume(teamId: string): Promise<Team> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    team.state = "running";
    team.updatedAt = new Date();
    this.emit('team:resumed', team);
    
    return team;
  }

  /**
   * Scale a team to a specific agent count
   */
  async scale(teamId: string, agentCount: number): Promise<Team> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    const currentCount = team.agents.length;
    
    if (agentCount > currentCount) {
      // Add agents
      for (let i = currentCount; i < agentCount; i++) {
        team.agents.push(`agent-${teamId}-${i}`);
      }
    } else if (agentCount < currentCount) {
      // Remove agents
      team.agents = team.agents.slice(0, agentCount);
    }

    team.updatedAt = new Date();
    this.emit('team:scaled', team, agentCount);
    
    return team;
  }

  /**
   * Destroy a team and all its agents
   */
  async destroy(teamId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    team.state = 'destroying';
    this.emit('team:destroying', team);

    // Clear agents
    team.agents = [];
    team.state = 'destroyed';
    team.updatedAt = new Date();
    
    this.teams.delete(teamId);
    this.emit('team:destroyed', team);
  }

  /**
   * Add an agent to a team
   */
  async addAgent(teamId: string, agentId: string): Promise<Team> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    if (!team.agents.includes(agentId)) {
      team.agents.push(agentId);
      team.updatedAt = new Date();
    }

    return team;
  }

  /**
   * Remove an agent from a team
   */
  async removeAgent(teamId: string, agentId: string): Promise<Team> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }

    team.agents = team.agents.filter(id => id !== agentId);
    team.updatedAt = new Date();

    return team;
  }

  /**
   * Get team statistics
   */
  getStats(teamId: string): { agentCount: number; state: TeamState } | undefined {
    const team = this.teams.get(teamId);
    if (!team) {
      return undefined;
    }

    return {
      agentCount: team.agents.length,
      state: team.state,
    };
  }
}

// Export singleton factory
let globalTeamManager: TeamManager | null = null;

export function getGlobalTeamManager(): TeamManager {
  if (!globalTeamManager) {
    throw new Error('TeamManager not initialized. Call initializeTeamManager first.');
  }
  return globalTeamManager;
}

export function initializeTeamManager(options: TeamManagerOptions): TeamManager {
  globalTeamManager = new TeamManager(options);
  return globalTeamManager;
}

export function resetTeamManager(): void {
  globalTeamManager = null;
}
