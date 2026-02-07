/**
 * Team Orchestrator Module
 *
 * Provides team coordination and orchestration capabilities.
 * Extended implementation that matches StateAwareOrchestrator requirements.
 */

import { EventEmitter } from 'events';
import { Mutex } from 'async-mutex';
import { AgentStatus, type Agent, type CreateAgentOptions } from '../models/agent';
import { AgentLifecycle, type AgentState } from './lifecycle';
import { MessageBus } from '../bus/index';
import { AgentStorage } from '../storage/memory';
import { TeamRepository } from '../storage';
import { AgentEventBus } from './event-bus';
import { SessionTree } from './session-tree';
import {
  TeamNotFoundError,
  ApplicationError,
  DashErrorCode,
  assertExists,
  safeExecute,
} from '../errors';
import { logger } from '../utils/logger';

// ============================================================================
// Team Types (Exported for StateAwareOrchestrator)
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
  sessionTreeId?: string;
  currentBranch?: string;
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

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  teamId: string;
  assignedAt: Date;
}

// ============================================================================
// Team Orchestrator Configuration
// ============================================================================

export interface TeamOrchestratorConfig {
  agentLifecycle: AgentLifecycle;
  messageBus: MessageBus;
  storage: AgentStorage;
  eventBus?: AgentEventBus;
  sessionTree?: SessionTree;
  swarmRepository?: TeamRepository;
}

// ============================================================================
// TeamOrchestrator - Manages team coordination with full state support
// ============================================================================

export class TeamOrchestrator extends EventEmitter {
  protected teams: Map<string, Team> = new Map();
  protected assignments: Map<string, TaskAssignment> = new Map();
  protected agentLifecycle: AgentLifecycle;
  protected messageBus: MessageBus;
  protected storage: AgentStorage;
  protected swarmRepository?: TeamRepository;
  protected eventBus?: AgentEventBus;
  protected sessionTree?: SessionTree;
  protected active: boolean = false;

  // RACE CONDITION FIX: One mutex per team for exclusive access
  protected mutexes: Map<string, Mutex> = new Map();
  // Global mutex for team creation (to prevent ID collisions)
  protected creationMutex: Mutex = new Mutex();

  constructor(config: TeamOrchestratorConfig) {
    super();
    this.agentLifecycle = config.agentLifecycle;
    this.messageBus = config.messageBus;
    this.storage = config.storage;
    this.swarmRepository = config.swarmRepository;
    this.eventBus = config.eventBus;
    this.sessionTree = config.sessionTree;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the orchestrator
   */
  start(): void {
    this.active = true;
    this.emit('orchestrator.started');
    logger.info('[TeamOrchestrator] Started');
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    this.active = false;
    this.emit('orchestrator.stopped');
    logger.info('[TeamOrchestrator] Stopped');
  }

  // ============================================================================
  // Mutex Management
  // ============================================================================

  /**
   * Get or create a mutex for a specific team
   */
  protected getMutex(teamId: string): Mutex {
    if (!this.mutexes.has(teamId)) {
      this.mutexes.set(teamId, new Mutex());
    }
    return this.mutexes.get(teamId)!;
  }

  /**
   * Clean up mutex for destroyed team
   */
  protected cleanupMutex(teamId: string): void {
    this.mutexes.delete(teamId);
  }

  // ============================================================================
  // Team Operations
  // ============================================================================

  /**
   * Create a new team
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
      if (this.swarmRepository) {
        await this.swarmRepository.create({
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
          source: { orchestrator: 'team-orchestrator' },
          payload: { teamId: id, name: config.name },
        },
        { priority: 'high' }
      );

      return team;
    });
  }

  /**
   * Destroy a team and all its agents
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
            context: `TeamOrchestrator.destroy.${teamId}.killAgent`
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
          source: { orchestrator: 'team-orchestrator' },
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
              context: `TeamOrchestrator.scale.${teamId}.killAgent`
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
          source: { orchestrator: 'team-orchestrator' },
          payload: { teamId, previousSize: currentSize, newSize: targetSize },
        },
        { priority: 'medium' }
      );
    });
  }

  /**
   * Get a team by ID
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /**
   * Get all teams
   */
  getAllTeams(): Team[] {
    return Array.from(this.teams.values());
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

  // ============================================================================
  // Task Assignment (Legacy API)
  // ============================================================================

  /**
   * Assign a task to an agent
   */
  assignTask(taskId: string, agentId: string, teamId: string): TaskAssignment {
    const assignment: TaskAssignment = {
      taskId,
      agentId,
      teamId,
      assignedAt: new Date(),
    };

    this.assignments.set(taskId, assignment);
    this.emit('task:assigned', assignment);

    return assignment;
  }

  /**
   * Get task assignment
   */
  getAssignment(taskId: string): TaskAssignment | undefined {
    return this.assignments.get(taskId);
  }

  /**
   * Release a task assignment
   */
  releaseTask(taskId: string): boolean {
    const assignment = this.assignments.get(taskId);
    if (assignment) {
      this.assignments.delete(taskId);
      this.emit('task:released', assignment);
      return true;
    }

    return false;
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

let globalTeamOrchestrator: TeamOrchestrator | null = null;

export function getGlobalTeamOrchestrator(config?: TeamOrchestratorConfig): TeamOrchestrator {
  if (!globalTeamOrchestrator) {
    if (!config) {
      throw new ApplicationError(
        'TeamOrchestrator requires configuration on first initialization',
        DashErrorCode.INITIALIZATION_FAILED,
        500,
        {},
        false
      );
    }
    globalTeamOrchestrator = new TeamOrchestrator(config);
  }
  return globalTeamOrchestrator;
}

export function resetGlobalTeamOrchestrator(): void {
  globalTeamOrchestrator = null;
}

export default TeamOrchestrator;
