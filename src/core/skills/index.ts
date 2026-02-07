/**
 * Skills Module - Consolidated Implementation
 * 
 * Provides skill management and sharing capabilities for agents.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

// Re-export from the loader module
export {
  parseFrontmatter,
  parseSections,
  extractWhenToUse,
  extractSteps,
  extractExamples,
  extractTools,
  validateSkillName,
  validateDescription,
  validateFrontmatterFields,
  loadSkillFromFile,
  formatSkillsForPrompt,
} from './loader';

export type { Skill, SkillSource, SkillSection } from './types';

// ============================================================================
// Skill Registry
// ============================================================================

export interface RegisteredSkill {
  name: string;
  description: string;
  filePath: string;
  source: SkillSource;
  content: string;
  metadata?: Record<string, unknown>;
}

export type SkillSource = 'builtin' | 'custom' | 'shared';

/**
 * SkillRegistry - Manages skill registration and lookup
 */
export class SkillRegistry {
  private skills: Map<string, RegisteredSkill> = new Map();

  /**
   * Register a skill
   */
  register(skill: RegisteredSkill): void {
    this.skills.set(skill.name, skill);
    logger.info(`Skill registered: ${skill.name}`);
  }

  /**
   * Get a skill by name
   */
  get(name: string): RegisteredSkill | undefined {
    return this.skills.get(name);
  }

  /**
   * Check if a skill exists
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Get all registered skills
   */
  getAll(): RegisteredSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Unregister a skill
   */
  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Load all skills from configured directories
   */
  async loadAll(): Promise<void> {
    // Load from default skill directories
    const defaultDirs = [
      './skills',
      './src/skills',
      './.godel/skills',
    ];

    for (const dir of defaultDirs) {
      if (fs.existsSync(dir)) {
        this.loadFromDirectory(dir, 'builtin');
      }
    }

    logger.info(`Loaded ${this.skills.size} skills`);
  }

  /**
   * Load skills from a directory
   */
  loadFromDirectory(dir: string, source: SkillSource = 'custom'): void {
    if (!fs.existsSync(dir)) {
      logger.warn(`Skills directory does not exist: ${dir}`);
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = path.join(dir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          try {
            const content = fs.readFileSync(skillFile, 'utf-8');
            // Simple frontmatter parsing
            const nameMatch = content.match(/^name:\s*(.+)$/m);
            const descMatch = content.match(/^description:\s*(.+)$/m);
            
            if (nameMatch && descMatch) {
              this.register({
                name: nameMatch[1].trim(),
                description: descMatch[1].trim(),
                filePath: skillFile,
                source,
                content,
              });
            }
          } catch (error) {
            logger.error(`Failed to load skill from ${skillFile}:`, error);
          }
        }
      }
    }
  }
}

// ============================================================================
// Team Skill Manager
// ============================================================================

export interface SkillShare {
  skillName: string;
  sourceAgentId: string;
  targetAgentIds: string[];
  sharedAt: Date;
}

/**
 * SwarmSkillManager - Manages skill sharing within a swarm
 */
export class SwarmSkillManager {
  private registry: SkillRegistry;
  private shares: Map<string, SkillShare> = new Map();

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * Share a skill from one agent to others
   */
  shareSkill(skillName: string, sourceAgentId: string, targetAgentIds: string[]): SkillShare {
    const skill = this.registry.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const share: SkillShare = {
      skillName,
      sourceAgentId,
      targetAgentIds,
      sharedAt: new Date(),
    };

    const shareId = `${skillName}:${sourceAgentId}:${Date.now()}`;
    this.shares.set(shareId, share);

    logger.info(`Skill ${skillName} shared from ${sourceAgentId} to ${targetAgentIds.length} agents`);
    
    return share;
  }

  /**
   * Get all shares for an agent
   */
  getSharesForAgent(agentId: string): SkillShare[] {
    return Array.from(this.shares.values()).filter(
      share => share.sourceAgentId === agentId || share.targetAgentIds.includes(agentId)
    );
  }

  /**
   * Get skills available to an agent (via sharing)
   */
  getAvailableSkills(agentId: string): string[] {
    const shares = this.getSharesForAgent(agentId);
    const skillNames = new Set<string>();

    for (const share of shares) {
      if (share.targetAgentIds.includes(agentId)) {
        skillNames.add(share.skillName);
      }
    }

    return Array.from(skillNames);
  }

  /**
   * Check if an agent has access to a skill
   */
  hasSkillAccess(agentId: string, skillName: string): boolean {
    // Direct access
    if (this.registry.has(skillName)) {
      return true;
    }

    // Check shared access
    const available = this.getAvailableSkills(agentId);
    return available.includes(skillName);
  }

  /**
   * Sync skills across all agents in a swarm
   */
  syncSwarmSkills(swarmAgentIds: string[]): void {
    const allSkills = this.registry.getAll();
    
    for (const skill of allSkills) {
      // Share each skill to all agents in the swarm
      const targetIds = swarmAgentIds.filter(id => id !== 'system');
      if (targetIds.length > 0) {
        this.shareSkill(skill.name, 'system', targetIds);
      }
    }

    logger.info(`Synced ${allSkills.length} skills to ${swarmAgentIds.length} agents`);
  }

  /**
   * Get all active shares
   */
  getAllShares(): SkillShare[] {
    return Array.from(this.shares.values());
  }

  /**
   * Revoke a skill share
   */
  revokeShare(shareId: string): boolean {
    return this.shares.delete(shareId);
  }
}

/**
 * TeamSkillManager - Alias for SwarmSkillManager (for backward compatibility)
 * @deprecated Use SwarmSkillManager instead
 */
export const TeamSkillManager = SwarmSkillManager;

// ============================================================================
// Singleton Exports
// ============================================================================

let globalSkillRegistry: SkillRegistry | null = null;

export function getGlobalSkillRegistry(): SkillRegistry {
  if (!globalSkillRegistry) {
    globalSkillRegistry = new SkillRegistry();
  }
  return globalSkillRegistry;
}

export function resetGlobalSkillRegistry(): void {
  globalSkillRegistry = null;
}
