/**
 * Team Manager - SPEC_v2.md Section 2.1
 * 
 * Manages teams of agents including creation, destruction, scaling,
 * and lifecycle management of teams.
 * 
 * RACE CONDITION FIXES v3:
 * - Mutex protection for all team operations (create, scale, destroy)
 * - One mutex per team to prevent concurrent modifications
 * - Uses async-mutex library for exclusive access
 */

import { EventEmitter } from 'events';
import { Mutex } from 'async-mutex';
import { AgentStatus, type Agent, type CreateAgentOptions } from '../models/agent';
import { AgentLifecycle, type AgentState } from './lifecycle';
import { MessageBus } from '../bus/index';
import { AgentStorage } from '../storage/memory';
import { TeamRepository } from '../storage';
import {
  TeamNotFoundError,
  ApplicationError,
  DashErrorCode,
  assertExists,
  safeExecute,
} from '../errors';
import { logger } from '../utils/logger';

// ============================================================================
// Team Types
// ============================================================================

export type TeamStrategy = 'parallel' | 'map-reduce' | 'pipeline' | 'tree';

export interface BudgetConfig {
  amount: number;
  currency: string;
  warningThreshold?: number; // Percentage (0-1)
  criticalThreshold?: number; // Percentage (0-1)
}

export interface SafetyConfig {
  fileSandbox: boolean;
  networkAllowlist?: string[];
  commandBlacklist?: string[];
  maxExecutionTime?: number; // milliseconds
}

export interface TeamConfig {
  name: string;
  task: string;
  initialAgents: number;
  maxAgents: number;
  strategy: TeamStrategy;
  model?: string;
  budget?: BudgetConfig;
  safety?: SafetyConfig;
  metadata?: Record<string, unknown>;
}

export type TeamState = 'creating' | 'active' | 'scaling' | 'paused' | 'completed' | 'failed' | 'destroyed';

export interface Team {
  id: string;
  name: string;
  status: TeamState;
  config: TeamConfig;
  agents: string[];
  createdAt: Date;
  completedAt?: Date;
  budget: {
    allocated: number;
    consumed: number;
    remaining: number;
  };
  metrics: {
    totalAgents: number;
    completedAgents: number;
    failedAgents: number;
  };
}

export interface TeamStatusInfo {
  id: string;
  name: string;
  status: TeamState;
  agentCount: number;
  budgetRemaining: number;
  progress: number; // 0-1
  estimatedCompletion?: Date;
}

export type TeamEvent =
  | 'team.created'
  | 'team.scaled'
  | 'team.completed'
  | 'team.failed'
  | 'team.destroyed'
  | 'team.budget.warning'
  | 'team.budget.critical';

// ============================================================================
// Team Manager
// ============================================================================

export class TeamManager extends EventEmitter {
  private teams: Map<string, Team> = new Map();
  private agentLifecycle: AgentLifecycle;
  private messageBus: MessageBus;
  private storage: AgentStorage;
  private teamRepository?: TeamRepository;
  private active: boolean = false;
  
  // RACE CONDITION FIX: One mutex per team for exclusive access
  private mutexes: Map<string, Mutex> = new Map();
  // Global mutex for team creation (to prevent ID collisions)
  private creationMutex: Mutex = new Mutex();

  constructor(
    agentLifecycle: AgentLifecycle,
    messageBus: MessageBus,
    storage: AgentStorage,
    teamRepository?: TeamRepository
  ) {
    super();
    this.agentLifecycle = agentLifecycle;
    this.messageBus = messageBus;
    this.storage = storage;
    this.teamRepository = teamRepository;
  }
  
  /**
   * Set the team repository for persistence
   */
  setTeamRepository(repo: TeamRepository): void {
    this.teamRepository = repo;
  }
  
  /**
   * RACE CONDITION FIX: Get or create a mutex for a specific team
   */
  private getMutex(teamId: string): Mutex {
    if (!this.mutexes.has(teamId)) {
      this.mutexes.set(teamId, new Mutex());
    }
    return this.mutexes.get(teamId)!;
  }
  
  /**
   * RACE CONDITION FIX: Clean up mutex for destroyed team
   */
  private cleanupMutex(teamId: string): void {
    this.mutexes.delete(teamId);
  }

  /**
   * Start the team manager
   */
  start(): void {
    this.active = true;
    this.emit('manager.started');
  }

  /**
   * Stop the team manager
   */
  stop(): void {
    this.active = false;
    this.emit('manager.stopped');
  }

  /**
   * Create a new team
   * RACE CONDITION FIX: Protected by creationMutex to prevent ID collisions
   */
  async create(config: TeamConfig): Promise<Team> {
    return this.creationMutex.runExclusive(async () => {
      const id = `team-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();

      const team: Team = {
        id,
        name: config.name,
        status: 'creating',
        config,
        agents: [],
        createdAt: now,
        budget: {
          allocated: config.budget?.amount || 0,
          consumed: 0,
          remaining: config.budget?.amount || 0,
        },
        metrics: {
          totalAgents: 0,
          completedAgents: 0,
          failedAgents: 0,
        },
      };

      this.teams.set(id, team);
      
      // Create the mutex for this team immediately
      this.getMutex(id);

      // Subscribe to team broadcast topic
      this.messageBus.subscribe(
        MessageBus.teamBroadcast(id),
        (message) => this.handleTeamMessage(id, message)
      );

      // Create initial agents
      await this.initializeAgents(team);

      team.status = 'active';
      
      // Persist to repository if available
      if (this.teamRepository) {
        await this.teamRepository.create({
          id: team.id,
          name: team.name,
          status: team.status as unknown as 'creating' | 'active' | 'scaling' | 'paused' | 'completed' | 'failed' | 'destroyed',
          config: team.config as unknown as Record<string, unknown>,
          agents: team.agents,
        });
      }
      
      this.emit('team.created', team);
      this.messageBus.publish(
        MessageBus.teamBroadcast(id),
        {
          eventType: 'team.created',
          source: { orchestrator: 'team-manager' },
          payload: { teamId: id, name: config.name },
        },
        { priority: 'high' }
      );

      return team;
    });
  }

  /**
   * Destroy a team and all its agents
   * RACE CONDITION FIX: Protected by per-team mutex
   */
  async destroy(teamId: string, force: boolean = false): Promise<void> {
    const mutex = this.getMutex(teamId);
    await mutex.runExclusive(async () => {
      const team = assertExists(
        this.teams.get(teamId),
        'Team',
        teamId,
        { code: DashErrorCode.TEAM_NOT_FOUND }
      );

      team.status = 'destroyed';

      // Kill all agents in the team
      for (const agentId of team.agents) {
        await safeExecute(
          async () => {
            await this.agentLifecycle.kill(agentId, force);
          },
          undefined,
          { 
            logError: true, 
            context: `TeamManager.destroy.${teamId}.killAgent` 
          }
        );
      }

      team.agents = [];
      team.completedAt = new Date();

      this.emit('team.destroyed', team);
      this.messageBus.publish(
        MessageBus.teamBroadcast(teamId),
        {
          eventType: 'system.emergency_stop',
          source: { orchestrator: 'team-manager' },
          payload: { teamId, reason: 'team_destroyed' },
        },
        { priority: 'critical' }
      );

      // Keep the team record but mark as destroyed
      this.teams.set(teamId, team);
      
      // Clean up the mutex
      this.cleanupMutex(teamId);
    });
  }

  /**
   * Scale a team to a target number of agents
   * RACE CONDITION FIX: Protected by per-team mutex
   */
  async scale(teamId: string, targetSize: number): Promise<void> {
    const mutex = this.getMutex(teamId);
    await mutex.runExclusive(async () => {
      const team = assertExists(
        this.teams.get(teamId),
        'Team',
        teamId,
        { code: DashErrorCode.TEAM_NOT_FOUND }
      );

      if (team.status === 'destroyed') {
        throw new ApplicationError(
          `Cannot scale destroyed team ${teamId}`,
          DashErrorCode.INVALID_TEAM_STATE,
          400,
          { teamId, currentStatus: team.status },
          true
        );
      }

      const currentSize = team.agents.length;
      const maxAgents = team.config.maxAgents;

      if (targetSize > maxAgents) {
        throw new ApplicationError(
          `Target size ${targetSize} exceeds max agents ${maxAgents}`,
          DashErrorCode.MAX_AGENTS_EXCEEDED,
          400,
          { teamId, targetSize, maxAgents },
          true
        );
      }

      team.status = 'scaling';

      if (targetSize > currentSize) {
        // Scale up - spawn new agents
        const toAdd = targetSize - currentSize;
        for (let i = 0; i < toAdd; i++) {
          await this.spawnAgentForTeam(team);
        }
      } else if (targetSize < currentSize) {
        // Scale down - kill excess agents
        const toRemove = currentSize - targetSize;
        const agentsToRemove = team.agents.slice(-toRemove);
        for (const agentId of agentsToRemove) {
          await safeExecute(
            async () => {
              await this.agentLifecycle.kill(agentId);
              team.agents = team.agents.filter(id => id !== agentId);
            },
            undefined,
            { 
              logError: true, 
              context: `TeamManager.scale.${teamId}.killAgent` 
            }
          );
        }
      }

      team.status = 'active';
      team.metrics.totalAgents = team.agents.length;

      this.emit('team.scaled', { teamId, previousSize: currentSize, newSize: targetSize });
      this.messageBus.publish(
        MessageBus.teamBroadcast(teamId),
        {
          eventType: 'team.scaled',
          source: { orchestrator: 'team-manager' },
          payload: { teamId, previousSize: currentSize, newSize: targetSize },
        },
        { priority: 'medium' }
      );
    });
  }

  /**
   * Get team status
   */
  getStatus(teamId: string): TeamStatusInfo {
    const team = assertExists(
      this.teams.get(teamId),
      'Team',
      teamId,
      { code: DashErrorCode.TEAM_NOT_FOUND }
    );

    const activeAgents = team.agents.filter(id => {
      const state = this.agentLifecycle.getState(id);
      return state && state.status === AgentStatus.RUNNING;
    }).length;

    const progress = team.metrics.totalAgents > 0
      ? team.metrics.completedAgents / team.metrics.totalAgents
      : 0;

    return {
      id: team.id,
      name: team.name,
      status: team.status,
      agentCount: activeAgents,
      budgetRemaining: team.budget.remaining,
      progress,
    };
  }

  /**
   * Get full team details
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /**
   * List all teams
   */
  listTeams(): Array<Team> {
    return Array.from(this.teams.values());
  }

  /**
   * List active (non-destroyed) teams
   */
  listActiveTeams(): Array<Team> {
    return this.listTeams().filter(s => s.status !== 'destroyed');
  }

  /**
   * Get agents in a team
   */
  getTeamAgents(teamId: string): AgentState[] {
    const team = this.teams.get(teamId);
    if (!team) return [];

    return team.agents
      .map(id => this.agentLifecycle.getState(id))
      .filter((state): state is AgentState => state !== null);
  }

  /**
   * Consume budget for an agent
   * RACE CONDITION FIX: Protected by per-team mutex
   */
  async consumeBudget(teamId: string, agentId: string, tokens: number, cost: number): Promise<void> {
    const mutex = this.getMutex(teamId);
    await mutex.runExclusive(async () => {
      const team = this.teams.get(teamId);
      if (!team) return;

      team.budget.consumed += cost;
      team.budget.remaining = Math.max(0, team.budget.allocated - team.budget.consumed);

      // Check budget thresholds
      const warningThreshold = team.config.budget?.warningThreshold || 0.75;
      const criticalThreshold = team.config.budget?.criticalThreshold || 0.90;
      const consumedRatio = team.budget.consumed / team.budget.allocated;

      if (consumedRatio >= criticalThreshold && consumedRatio < 1) {
        this.emit('team.budget.critical', { teamId, remaining: team.budget.remaining });
        this.messageBus.publish(
          MessageBus.teamBroadcast(teamId),
          {
            eventType: 'system.emergency_stop',
            source: { orchestrator: 'team-manager', agentId },
            payload: { teamId, reason: 'budget_critical', remaining: team.budget.remaining },
          },
          { priority: 'critical' }
        );
      } else if (consumedRatio >= warningThreshold) {
        this.emit('team.budget.warning', { teamId, remaining: team.budget.remaining });
      }

      // Hard stop at 100%
      if (team.budget.remaining <= 0) {
        await this.pauseTeamInternal(team, 'budget_exhausted');
      }
    });
  }
  
  /**
   * Internal method to pause team (must be called inside mutex)
   */
  private async pauseTeamInternal(team: Team, reason?: string): Promise<void> {
    team.status = 'paused';

    for (const agentId of team.agents) {
      await safeExecute(
        async () => {
          await this.agentLifecycle.pause(agentId);
        },
        undefined,
        { 
          logError: true, 
          context: `TeamManager.pauseTeam.${team.id}` 
        }
      );
    }

    this.emit('team.paused', { teamId: team.id, reason });
  }

  /**
   * Pause a team
   * RACE CONDITION FIX: Protected by per-team mutex
   */
  async pauseTeam(teamId: string, reason?: string): Promise<void> {
    const mutex = this.getMutex(teamId);
    await mutex.runExclusive(async () => {
      const team = assertExists(
        this.teams.get(teamId),
        'Team',
        teamId,
        { code: DashErrorCode.TEAM_NOT_FOUND }
      );

      await this.pauseTeamInternal(team, reason);
    });
  }

  /**
   * Resume a paused team
   * RACE CONDITION FIX: Protected by per-team mutex
   */
  async resumeTeam(teamId: string): Promise<void> {
    const mutex = this.getMutex(teamId);
    await mutex.runExclusive(async () => {
      const team = assertExists(
        this.teams.get(teamId),
        'Team',
        teamId,
        { code: DashErrorCode.TEAM_NOT_FOUND }
      );

      team.status = 'active';

      for (const agentId of team.agents) {
        await safeExecute(
          async () => {
            await this.agentLifecycle.resume(agentId);
          },
          undefined,
          { 
            logError: true, 
            context: `TeamManager.resumeTeam.${teamId}` 
          }
        );
      }

      this.emit('team.resumed', { teamId });
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async initializeAgents(team: Team): Promise<void> {
    const { initialAgents, strategy, task } = team.config;

    // Create initial agents based on strategy
    if (strategy === 'pipeline') {
      // Pipeline: Each agent gets a stage of the task
      const stages = this.splitTaskIntoStages(task, initialAgents);
      for (let i = 0; i < initialAgents; i++) {
        await this.spawnAgentForTeam(team, {
          task: stages[i] || `${task} (stage ${i + 1})`,
          stage: i,
        });
      }
    } else if (strategy === 'map-reduce') {
      // Map-reduce: One mapper per chunk, one reducer
      for (let i = 0; i < initialAgents - 1; i++) {
        await this.spawnAgentForTeam(team, { role: 'mapper', index: i });
      }
      await this.spawnAgentForTeam(team, { role: 'reducer' });
    } else {
      // Parallel or tree: All agents work on the same task
      for (let i = 0; i < initialAgents; i++) {
        await this.spawnAgentForTeam(team, { index: i });
      }
    }
  }

  private async spawnAgentForTeam(
    team: Team,
    metadata?: Record<string, unknown>
  ): Promise<Agent> {
    const agentConfig: CreateAgentOptions = {
      model: team.config.model || 'kimi-k2.5',
      task: team.config.task,
      teamId: team.id,
      maxRetries: 3,
      budgetLimit: team.config.budget
        ? team.config.budget.amount / team.config.maxAgents
        : undefined,
    };

    const agent = await this.agentLifecycle.spawn(agentConfig);
    
    if (metadata) {
      Object.assign(agent.metadata, metadata);
    }

    team.agents.push(agent.id);
    team.metrics.totalAgents = team.agents.length;

    // Subscribe to agent events
    this.messageBus.subscribe(
      MessageBus.agentEvents(agent.id),
      (message) => this.handleAgentMessage(team.id, agent.id, message)
    );

    return agent;
  }

  private handleAgentMessage(teamId: string, agentId: string, message: unknown): void {
    const msg = message as { payload?: { eventType?: string } };
    const eventType = msg.payload?.eventType;

    if (!eventType) return;

    const team = this.teams.get(teamId);
    if (!team) return;

    switch (eventType) {
      case 'agent.completed':
        team.metrics.completedAgents++;
        this.checkTeamCompletion(team);
        break;
      case 'agent.failed':
        team.metrics.failedAgents++;
        break;
    }
  }

  private handleTeamMessage(teamId: string, message: unknown): void {
    // Handle broadcast messages to the team
    const msg = message as { payload?: { eventType?: string; cost?: number; tokens?: number } };
    const payload = msg.payload;

    if (payload?.cost && payload?.tokens) {
      // Budget consumption message from an agent
      // Find the agent that sent this (would need to track sender in message)
    }
  }

  private checkTeamCompletion(team: Team): void {
    const totalFinished = team.metrics.completedAgents + team.metrics.failedAgents;
    
    if (totalFinished >= team.metrics.totalAgents) {
      team.status = 'completed';
      team.completedAt = new Date();
      this.emit('team.completed', team);
    }
  }

  private splitTaskIntoStages(task: string, numStages: number): string[] {
    // Simple stage splitting - in production this would use NLP or structured task breakdown
    const stages: string[] = [];
    for (let i = 0; i < numStages; i++) {
      stages.push(`${task} (stage ${i + 1}/${numStages})`);
    }
    return stages;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalTeamManager: TeamManager | null = null;

export function getGlobalTeamManager(
  agentLifecycle?: AgentLifecycle,
  messageBus?: MessageBus,
  storage?: AgentStorage,
  teamRepository?: TeamRepository
): TeamManager {
  if (!globalTeamManager) {
    if (!agentLifecycle || !messageBus || !storage) {
      throw new ApplicationError(
        'TeamManager requires dependencies on first initialization',
        DashErrorCode.INITIALIZATION_FAILED,
        500,
        { 
          missingDeps: { 
            agentLifecycle: !agentLifecycle, 
            messageBus: !messageBus, 
            storage: !storage 
          } 
        },
        false
      );
    }
    globalTeamManager = new TeamManager(agentLifecycle, messageBus, storage, teamRepository);
  } else if (teamRepository) {
    // Update repository if provided
    globalTeamManager.setTeamRepository(teamRepository);
  }
  return globalTeamManager;
}

export function resetGlobalTeamManager(): void {
  globalTeamManager = null;
}

export default TeamManager;
