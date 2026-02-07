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

// Import and re-export the full-featured SkillRegistry from registry.ts
import {
  SkillRegistry as FullSkillRegistry,
  getGlobalSkillRegistry,
  resetGlobalSkillRegistry,
  DEFAULT_REGISTRY_CONFIG,
} from './registry';

// Re-export from registry
export {
  SkillRegistry,
  getGlobalSkillRegistry,
  resetGlobalSkillRegistry,
  DEFAULT_REGISTRY_CONFIG,
} from './registry';

// Alias for internal use
type SkillRegistry = FullSkillRegistry;

// Re-export types
export type { Skill, SkillSource, SkillSection } from './types';
export type {
  LoadedSkill,
  SkillMatch,
  SkillRegistryConfig,
  SkillEvent,
  SkillEventType,
  ISkillRegistry,
  TeamSkillContext,
  TeamSkillConfig,
} from './types';

// Re-export all from types for convenience
export * from './types';

// Simple skill registration interface
export interface RegisteredSkill {
  name: string;
  description: string;
  filePath: string;
  source: RegisteredSkillSource;
  content: string;
  metadata?: Record<string, unknown>;
}

export type RegisteredSkillSource = 'builtin' | 'custom' | 'shared';

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
 * TeamSkillManager - Manages skill sharing within a team
 */
export class TeamSkillManager {
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
   * Sync skills across all agents in a team
   */
  syncTeamSkills(teamAgentIds: string[]): void {
    const allSkills = this.registry.getAll();
    
    for (const skill of allSkills) {
      // Share each skill to all agents in the team
      const targetIds = teamAgentIds.filter(id => id !== 'system');
      if (targetIds.length > 0) {
        this.shareSkill(skill.name, 'system', targetIds);
      }
    }

    logger.info(`Synced ${allSkills.length} skills to ${teamAgentIds.length} agents`);
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
 * SwarmSkillManager - Alias for TeamSkillManager (for backward compatibility)
 * @deprecated Use TeamSkillManager instead
 */
export const SwarmSkillManager = TeamSkillManager;

// Note: getGlobalSkillRegistry and resetGlobalSkillRegistry are re-exported from registry.ts
