/**
 * Swarm Skill Integration
 * 
 * Integrates the Agent Skills system with Godel swarms, enabling:
 * - Skills shared across swarm agents
 * - Skill-specific agent roles
 * - Dynamic skill loading during swarm execution
 */

import { logger } from '../../utils/logger';
import { EventEmitter } from 'events';
import { SkillRegistry } from './registry';
import {
  LoadedSkill,
  SwarmSkillContext,
  SwarmSkillConfig,
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
  context: SwarmSkillContext;
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
 * Skill-aware swarm configuration
 */
export interface SkillAwareSwarmConfig {
  /** Base swarm configuration */
  swarmId: string;
  task: string;
  /** Skill configuration for this swarm */
  skillConfig: SwarmSkillConfig;
  /** Agent role definitions */
  roles?: SkillAgentRole[];
  /** Enable dynamic skill discovery */
  dynamicDiscovery?: boolean;
}

// ============================================================================
// Swarm Skill Manager
// ============================================================================

export class SwarmSkillManager extends EventEmitter {
  private registry: SkillRegistry;
  private swarmContexts: Map<string, SwarmSkillContext> = new Map();
  private agentSkills: Map<string, Set<string>> = new Map();
  private agentSwarms: Map<string, string> = new Map(); // agentId -> swarmId
  private eventEmitter: EventEmitter = new EventEmitter();

  constructor(registry: SkillRegistry) {
    super();
    this.registry = registry;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize skills for a new swarm
   */
  async initializeSwarm(config: SkillAwareSwarmConfig): Promise<SwarmSkillContext> {
    const { swarmId, task, skillConfig } = config;

    logger.info(`Initializing skills for swarm ${swarmId}`);

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

    // Create swarm context
    const context: SwarmSkillContext = {
      swarmId,
      agentId: 'swarm-coordinator',
      task,
      availableSkills: this.registry.getAll(),
      activeSkills: this.registry.getActiveSkills(),
    };

    this.swarmContexts.set(swarmId, context);

    this.emit('swarm.initialized', {
      swarmId,
      autoLoaded: autoLoadedSkills.map((m) => m.skill.name),
      sharedSkills: skillConfig.sharedSkills,
    });

    return context;
  }

  /**
   * Register an agent with the swarm
   */
  async registerAgent(
    swarmId: string,
    agentId: string,
    role?: string,
    config?: SwarmSkillConfig
  ): Promise<SkillEnabledAgent> {
    const swarmContext = this.swarmContexts.get(swarmId);
    if (!swarmContext) {
      throw new Error(`Swarm ${swarmId} not initialized`);
    }

    // Get skills for this agent's role
    const roleSkills = config?.roleSkills?.[role || 'default'] || [];

    // Activate role-specific skills
    for (const skillName of roleSkills) {
      await this.registry.activate(skillName);
    }

    // Track agent's skills and swarm
    const agentSkillSet = new Set<string>([
      ...(config?.sharedSkills || []),
      ...roleSkills,
    ]);
    this.agentSkills.set(agentId, agentSkillSet);
    this.agentSwarms.set(agentId, swarmId);

    // Create agent context
    const agentContext: SwarmSkillContext = {
      ...swarmContext,
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
      swarmId,
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
   * Broadcast skills to all agents in a swarm
   */
  async broadcastSkills(
    swarmId: string,
    sourceAgentId: string,
    skillNames: string[]
  ): Promise<void> {
    const sourceSkills = this.agentSkills.get(sourceAgentId);
    if (!sourceSkills) {
      return;
    }

    // Get all agents in swarm
    const swarmAgents = this.getSwarmAgents(swarmId);

    for (const agentId of swarmAgents) {
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
   * Dynamically load skills during swarm execution
   */
  async dynamicLoad(
    swarmId: string,
    agentId: string,
    context: string
  ): Promise<SkillMatch[]> {
    const swarmConfig = this.swarmContexts.get(swarmId);
    if (!swarmConfig) {
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
        swarmId,
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
  getRoleSkills(role: string, config: SwarmSkillConfig): LoadedSkill[] {
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
    config: SwarmSkillConfig
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
   * Get all agents in a swarm
   */
  private getSwarmAgents(swarmId: string): string[] {
    const agents: string[] = [];
    for (const [agentId, agentSwarmId] of this.agentSwarms) {
      if (agentSwarmId === swarmId) {
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
   * Get active skills for a swarm
   */
  getSwarmActiveSkills(swarmId: string): LoadedSkill[] {
    const context = this.swarmContexts.get(swarmId);
    if (!context) return [];

    return context.activeSkills;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up a swarm's skill resources
   */
  async cleanupSwarm(swarmId: string): Promise<void> {
    // Deactivate all swarm-specific skills
    const context = this.swarmContexts.get(swarmId);
    if (context) {
      for (const skill of context.activeSkills) {
        await this.registry.deactivate(skill.name);
      }
    }

    // Remove agent registrations for this swarm
    const agentsToRemove: string[] = [];
    for (const [agentId, agentSwarmId] of this.agentSwarms) {
      if (agentSwarmId === swarmId) {
        agentsToRemove.push(agentId);
      }
    }
    for (const agentId of agentsToRemove) {
      this.agentSkills.delete(agentId);
      this.agentSwarms.delete(agentId);
    }

    this.swarmContexts.delete(swarmId);

    this.emit('swarm.cleaned_up', { swarmId });
    logger.info(`Cleaned up skills for swarm ${swarmId}`);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalSwarmSkillManager: SwarmSkillManager | null = null;

export function getGlobalSwarmSkillManager(registry?: SkillRegistry): SwarmSkillManager {
  if (!globalSwarmSkillManager) {
    if (!registry) {
      throw new Error('SwarmSkillManager requires registry on first initialization');
    }
    globalSwarmSkillManager = new SwarmSkillManager(registry);
  }
  return globalSwarmSkillManager;
}

export function resetGlobalSwarmSkillManager(): void {
  globalSwarmSkillManager = null;
}

export default SwarmSkillManager;
