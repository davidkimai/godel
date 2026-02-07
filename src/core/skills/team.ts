/**
 * Team Skill Integration
 * 
 * Integrates the Agent Skills system with Godel teams, enabling:
 * - Skills shared across team agents
 * - Skill-specific agent roles
 * - Dynamic skill loading during team execution
 */

import { logger } from '../../utils/logger';
import { EventEmitter } from 'events';
import { SkillRegistry } from './registry';
import {
  LoadedSkill,
  TeamSkillContext,
  TeamSkillConfig,
  SkillAgentRole,
  SkillMatch,
  SkillEvent,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent with skill context
 */
export interface SkillEnabledAgent {
  id: string;
  role?: string;
  activeSkills: string[];
  context: TeamSkillContext;
}

/**
 * Skill sharing event
 */
export interface SkillShareEvent {
  type: 'skill.shared' | 'skill.requested' | 'skill.broadcast';
  sourceAgentId: string;
  targetAgentId?: string;
  skillNames: string[];
  timestamp: Date;
}

/**
 * Skill-aware team configuration
 */
export interface SkillAwareTeamConfig {
  /** Base team configuration */
  teamId: string;
  task: string;
  /** Skill configuration for this team */
  skillConfig: TeamSkillConfig;
  /** Agent role definitions */
  roles?: SkillAgentRole[];
  /** Enable dynamic skill discovery */
  dynamicDiscovery?: boolean;
}

// ============================================================================
// Team Skill Manager
// ============================================================================

export class TeamSkillManager extends EventEmitter {
  private registry: SkillRegistry;
  private teamContexts: Map<string, TeamSkillContext> = new Map();
  private agentSkills: Map<string, Set<string>> = new Map();
  private agentTeams: Map<string, string> = new Map(); // agentId -> teamId
  private eventEmitter: EventEmitter = new EventEmitter();

  constructor(registry: SkillRegistry) {
    super();
    this.registry = registry;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize skills for a new team
   */
  async initializeTeam(config: SkillAwareTeamConfig): Promise<TeamSkillContext> {
    const { teamId, task, skillConfig } = config;

    logger.info(`Initializing skills for team ${teamId}`);

    // Auto-load skills based on task
    let autoLoadedSkills: SkillMatch[] = [];
    if (skillConfig.autoLoad) {
      autoLoadedSkills = await this.registry.autoLoad(task);
      logger.info(`Auto-loaded ${autoLoadedSkills.length} skills for task`);
    }

    // Activate shared skills
    for (const skillName of skillConfig.sharedSkills) {
      await this.registry.activate(skillName);
    }

    // Create team context
    const context: TeamSkillContext = {
      teamId,
      agentId: 'team-coordinator',
      task,
      availableSkills: this.registry.getAll(),
      activeSkills: this.registry.getActiveSkills(),
    };

    this.teamContexts.set(teamId, context);

    this.emit('team.initialized', {
      teamId,
      autoLoaded: autoLoadedSkills.map((m) => m.skill.name),
      sharedSkills: skillConfig.sharedSkills,
    });

    return context;
  }

  /**
   * Register an agent with the team
   */
  async registerAgent(
    teamId: string,
    agentId: string,
    role?: string,
    config?: TeamSkillConfig
  ): Promise<SkillEnabledAgent> {
    const teamContext = this.teamContexts.get(teamId);
    if (!teamContext) {
      throw new Error(`Team ${teamId} not initialized`);
    }

    // Get skills for this agent's role
    const roleSkills = config?.roleSkills?.[role || 'default'] || [];

    // Activate role-specific skills
    for (const skillName of roleSkills) {
      await this.registry.activate(skillName);
    }

    // Track agent's skills and team
    const agentSkillSet = new Set<string>([
      ...(config?.sharedSkills || []),
      ...roleSkills,
    ]);
    this.agentSkills.set(agentId, agentSkillSet);
    this.agentTeams.set(agentId, teamId);

    // Create agent context
    const agentContext: TeamSkillContext = {
      ...teamContext,
      agentId,
      activeSkills: this.registry.getActiveSkills().filter((s) =>
        agentSkillSet.has(s.name)
      ),
    };

    const agent: SkillEnabledAgent = {
      id: agentId,
      role,
      activeSkills: Array.from(agentSkillSet),
      context: agentContext,
    };

    this.emit('agent.registered', {
      teamId,
      agentId,
      role,
      skills: Array.from(agentSkillSet),
    });

    logger.debug(`Registered agent ${agentId} with ${agentSkillSet.size} skills`);

    return agent;
  }

  // ============================================================================
  // Skill Sharing
  // ============================================================================

  /**
   * Share skills from one agent to another
   */
  async shareSkills(
    sourceAgentId: string,
    targetAgentId: string,
    skillNames: string[]
  ): Promise<boolean> {
    const sourceSkills = this.agentSkills.get(sourceAgentId);
    const targetSkills = this.agentSkills.get(targetAgentId);

    if (!sourceSkills || !targetSkills) {
      logger.warn(`Cannot share skills - agent not found`);
      return false;
    }

    // Verify source has these skills
    for (const name of skillNames) {
      if (!sourceSkills.has(name)) {
        logger.warn(`Agent ${sourceAgentId} doesn't have skill ${name}`);
        return false;
      }

      // Activate for target
      await this.registry.activate(name);
      targetSkills.add(name);
    }

    this.emit('skills.shared', {
      type: 'skill.shared',
      sourceAgentId,
      targetAgentId,
      skillNames,
      timestamp: new Date(),
    });

    logger.info(`Shared skills ${skillNames.join(', ')} from ${sourceAgentId} to ${targetAgentId}`);

    return true;
  }

  /**
   * Broadcast skills to all agents in a team
   */
  async broadcastSkills(
    teamId: string,
    sourceAgentId: string,
    skillNames: string[]
  ): Promise<void> {
    const sourceSkills = this.agentSkills.get(sourceAgentId);
    if (!sourceSkills) {
      return;
    }

    // Get all agents in team
    const teamAgents = this.getTeamAgents(teamId);

    for (const agentId of teamAgents) {
      if (agentId !== sourceAgentId) {
        await this.shareSkills(sourceAgentId, agentId, skillNames);
      }
    }

    this.emit('skills.broadcast', {
      type: 'skill.broadcast',
      sourceAgentId,
      skillNames,
      timestamp: new Date(),
    });
  }

  /**
   * Request a skill from another agent
   */
  async requestSkill(
    requesterAgentId: string,
    targetAgentId: string,
    skillName: string
  ): Promise<boolean> {
    const targetSkills = this.agentSkills.get(targetAgentId);

    if (!targetSkills?.has(skillName)) {
      logger.warn(`Agent ${targetAgentId} doesn't have skill ${skillName}`);
      return false;
    }

    // Share the skill
    return this.shareSkills(targetAgentId, requesterAgentId, [skillName]);
  }

  // ============================================================================
  // Dynamic Loading
  // ============================================================================

  /**
   * Dynamically load skills during team execution
   */
  async dynamicLoad(
    teamId: string,
    agentId: string,
    context: string
  ): Promise<SkillMatch[]> {
    const teamConfig = this.teamContexts.get(teamId);
    if (!teamConfig) {
      return [];
    }

    // Find relevant skills
    const matches = this.registry.findRelevant(context, 3);

    // Activate relevant skills for this agent
    const activated: SkillMatch[] = [];
    for (const match of matches) {
      const success = await this.registry.activate(match.skill.name);
      if (success) {
        const agentSkills = this.agentSkills.get(agentId);
        if (agentSkills) {
          agentSkills.add(match.skill.name);
        }
        activated.push(match);
      }
    }

    if (activated.length > 0) {
      this.emit('skills.dynamically.loaded', {
        teamId,
        agentId,
        skills: activated.map((m) => m.skill.name),
        context,
      });
    }

    return activated;
  }

  // ============================================================================
  // Role Management
  // ============================================================================

  /**
   * Define a skill-specific agent role
   */
  defineRole(role: SkillAgentRole): void {
    // Activate required skills
    for (const skillName of role.requiredSkills) {
      this.registry.activate(skillName);
    }

    logger.debug(`Defined role ${role.name} with ${role.requiredSkills.length} required skills`);
  }

  /**
   * Get skills for an agent's role
   */
  getRoleSkills(role: string, config: TeamSkillConfig): LoadedSkill[] {
    const skillNames = config.roleSkills[role] || [];
    return skillNames
      .map((name) => this.registry.get(name))
      .filter((s): s is LoadedSkill => s !== undefined);
  }

  /**
   * Assign a role to an agent
   */
  async assignRole(
    agentId: string,
    role: string,
    config: TeamSkillConfig
  ): Promise<void> {
    const skillNames = config.roleSkills[role] || [];
    const agentSkills = this.agentSkills.get(agentId);

    if (agentSkills) {
      for (const name of skillNames) {
        await this.registry.activate(name);
        agentSkills.add(name);
      }
    }

    this.emit('role.assigned', { agentId, role, skills: skillNames });
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get all agents in a team
   */
  private getTeamAgents(teamId: string): string[] {
    const agents: string[] = [];
    for (const [agentId, agentTeamId] of this.agentTeams) {
      if (agentTeamId === teamId) {
        agents.push(agentId);
      }
    }
    return agents;
  }

  /**
   * Get skills available to an agent
   */
  getAgentSkills(agentId: string): LoadedSkill[] {
    const skillNames = this.agentSkills.get(agentId);
    if (!skillNames) return [];

    return Array.from(skillNames)
      .map((name) => this.registry.get(name))
      .filter((s): s is LoadedSkill => s !== undefined);
  }

  /**
   * Get active skills for a team
   */
  getTeamActiveSkills(teamId: string): LoadedSkill[] {
    const context = this.teamContexts.get(teamId);
    if (!context) return [];

    return context.activeSkills;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up a team's skill resources
   */
  async cleanupTeam(teamId: string): Promise<void> {
    // Deactivate all team-specific skills
    const context = this.teamContexts.get(teamId);
    if (context) {
      for (const skill of context.activeSkills) {
        await this.registry.deactivate(skill.name);
      }
    }

    // Remove agent registrations for this team
    const agentsToRemove: string[] = [];
    for (const [agentId, agentTeamId] of this.agentTeams) {
      if (agentTeamId === teamId) {
        agentsToRemove.push(agentId);
      }
    }
    for (const agentId of agentsToRemove) {
      this.agentSkills.delete(agentId);
      this.agentTeams.delete(agentId);
    }

    this.teamContexts.delete(teamId);

    this.emit('team.cleaned_up', { teamId });
    logger.info(`Cleaned up skills for team ${teamId}`);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalTeamSkillManager: TeamSkillManager | null = null;

export function getGlobalTeamSkillManager(registry?: SkillRegistry): TeamSkillManager {
  if (!globalTeamSkillManager) {
    if (!registry) {
      throw new Error('TeamSkillManager requires registry on first initialization');
    }
    globalTeamSkillManager = new TeamSkillManager(registry);
  }
  return globalTeamSkillManager;
}

export function resetGlobalTeamSkillManager(): void {
  globalTeamSkillManager = null;
}

export default TeamSkillManager;
