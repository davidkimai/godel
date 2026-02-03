/**
 * Skill Registry - Agent Skills Management
 * 
 * Manages the lifecycle of skills including loading, activation,
 * auto-loading based on context, and integration with the swarm.
 */

import { EventEmitter } from 'events';
import { join } from 'path';
import { homedir } from 'os';
import {
  Skill,
  LoadedSkill,
  SkillSource,
  SkillRegistryConfig,
  SkillMatch,
  LoadSkillsResult,
  SkillDiagnostic,
  SkillEvent,
  SkillEventType,
  ISkillRegistry,
  SwarmSkillContext,
  SwarmSkillConfig,
} from './types';
import {
  loadAllSkills,
  loadSkillFromFile,
  loadSkillsFromDir,
  formatSkillsForPrompt,
  LoadAllSkillsOptions,
} from './loader';
import { logger } from '../../utils/logger';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_REGISTRY_CONFIG: SkillRegistryConfig = {
  userSkillsDir: join(homedir(), '.dash', 'skills'),
  projectSkillsDir: join(process.cwd(), '.dash', 'skills'),
  builtinSkillsDir: join(process.cwd(), 'skills'),
  skillPaths: [],
  autoLoad: true,
  autoLoadThreshold: 0.3,
  maxAutoLoad: 5,
};

// ============================================================================
// Skill Registry Implementation
// ============================================================================

export class SkillRegistry extends EventEmitter implements ISkillRegistry {
  private config: SkillRegistryConfig;
  private skills: Map<string, LoadedSkill> = new Map();
  private activeSkills: Set<string> = new Set();
  private eventEmitter: EventEmitter = new EventEmitter();

  constructor(config?: Partial<SkillRegistryConfig>) {
    super();
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
  }

  // ============================================================================
  // Loading
  // ============================================================================

  /**
   * Load skills from all configured directories
   */
  async loadAll(): Promise<LoadSkillsResult> {
    const options: LoadAllSkillsOptions = {
      userSkillsDir: this.config.userSkillsDir,
      projectSkillsDir: this.config.projectSkillsDir,
      builtinSkillsDir: this.config.builtinSkillsDir,
      skillPaths: this.config.skillPaths,
    };

    const result = loadAllSkills(options);

    // Convert to loaded skills
    for (const skill of result.skills) {
      await this.addSkill(skill);
    }

    logger.info(`Loaded ${this.skills.size} skills from all sources`);
    return result;
  }

  /**
   * Load skills from a specific directory
   */
  loadFromDir(dir: string, source: SkillSource): LoadSkillsResult {
    const result = loadSkillsFromDir({ dir, source });

    for (const skill of result.skills) {
      this.addSkill(skill);
    }

    return result;
  }

  /**
   * Load a single skill from file
   */
  loadFromFile(
    filePath: string,
    source: SkillSource
  ): { skill: Skill | null; diagnostics: SkillDiagnostic[] } {
    const result = loadSkillFromFile(filePath, source);

    if (result.skill) {
      this.addSkill(result.skill);
    }

    return result;
  }

  /**
   * Add a skill to the registry
   */
  private async addSkill(skill: Skill): Promise<void> {
    const id = `${skill.source}:${skill.name}`;

    const loadedSkill: LoadedSkill = {
      ...skill,
      id,
      isActive: false,
      loadedAt: new Date(),
      useCount: 0,
    };

    this.skills.set(skill.name, loadedSkill);

    this.emitEvent('skill.loaded', {
      type: 'skill.loaded',
      skillId: id,
      skillName: skill.name,
      timestamp: new Date(),
      data: { source: skill.source },
    });

    logger.debug(`Loaded skill: ${skill.name} (${skill.source})`);
  }

  // ============================================================================
  // Retrieval
  // ============================================================================

  /**
   * Get a loaded skill by name
   */
  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all loaded skills
   */
  getAll(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skills by source
   */
  getBySource(source: SkillSource): LoadedSkill[] {
    return this.getAll().filter((s) => s.source === source);
  }

  /**
   * Get active skills
   */
  getActiveSkills(): LoadedSkill[] {
    return this.getAll().filter((s) => this.activeSkills.has(s.name));
  }

  // ============================================================================
  // Relevance / Auto-Loading
  // ============================================================================

  /**
   * Find relevant skills for a query/context
   */
  findRelevant(query: string, limit: number = 5): SkillMatch[] {
    const queryTerms = this.extractTerms(query.toLowerCase());
    const matches: SkillMatch[] = [];

    for (const skill of this.skills.values()) {
      const score = this.calculateRelevanceScore(skill, queryTerms);

      if (score >= this.config.autoLoadThreshold) {
        matches.push({
          skill,
          score,
          matchedTerms: this.getMatchedTerms(skill, queryTerms),
          reason: this.generateMatchReason(skill, queryTerms),
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return matches.slice(0, limit);
  }

  /**
   * Auto-load skills based on context
   */
  async autoLoad(context: string): Promise<SkillMatch[]> {
    if (!this.config.autoLoad) {
      return [];
    }

    const matches = this.findRelevant(context, this.config.maxAutoLoad);
    const activated: SkillMatch[] = [];

    for (const match of matches) {
      if (!match.skill.isActive) {
        const success = await this.activate(match.skill.name);
        if (success) {
          activated.push(match);
          this.emitEvent('skill.auto-loaded', {
            type: 'skill.auto-loaded',
            skillId: match.skill.id,
            skillName: match.skill.name,
            timestamp: new Date(),
            data: { score: match.score, context },
          });
        }
      }
    }

    logger.info(`Auto-loaded ${activated.length} skills based on context`);
    return activated;
  }

  /**
   * Extract searchable terms from text
   */
  private extractTerms(text: string): string[] {
    // Remove punctuation and split into words
    const words = text
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // Add phrases from whenToUse
    return [...new Set(words)];
  }

  /**
   * Calculate relevance score for a skill
   */
  private calculateRelevanceScore(skill: LoadedSkill, queryTerms: string[]): number {
    let score = 0;
    const textToSearch = [
      skill.name.toLowerCase(),
      skill.description.toLowerCase(),
      ...skill.whenToUse.map((w) => w.toLowerCase()),
      ...skill.sections.map((s) => s.title.toLowerCase()),
    ].join(' ');

    // Check name match (high weight)
    for (const term of queryTerms) {
      if (skill.name.toLowerCase().includes(term)) {
        score += 0.5;
      }
    }

    // Check description and content matches
    for (const term of queryTerms) {
      if (textToSearch.includes(term)) {
        score += 0.2;
      }
      // Word boundary match
      const wordRegex = new RegExp(`\\b${term}\\b`, 'i');
      if (wordRegex.test(textToSearch)) {
        score += 0.1;
      }
    }

    // Boost for whenToUse matches
    for (const when of skill.whenToUse) {
      for (const term of queryTerms) {
        if (when.toLowerCase().includes(term)) {
          score += 0.3;
        }
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get matched terms for a skill
   */
  private getMatchedTerms(skill: LoadedSkill, queryTerms: string[]): string[] {
    const textToSearch = [
      skill.name.toLowerCase(),
      skill.description.toLowerCase(),
      ...skill.whenToUse.map((w) => w.toLowerCase()),
    ].join(' ');

    return queryTerms.filter((term) => textToSearch.includes(term));
  }

  /**
   * Generate match reason
   */
  private generateMatchReason(skill: LoadedSkill, queryTerms: string[]): string {
    const nameMatch = queryTerms.some((t) => skill.name.toLowerCase().includes(t));
    const whenMatch = skill.whenToUse.some((w) =>
      queryTerms.some((t) => w.toLowerCase().includes(t))
    );

    if (nameMatch) return 'Name match';
    if (whenMatch) return 'When-to-use match';
    return 'Content match';
  }

  // ============================================================================
  // Activation
  // ============================================================================

  /**
   * Activate a skill for use
   */
  async activate(name: string): Promise<boolean> {
    const skill = this.skills.get(name);
    if (!skill) {
      logger.warn(`Cannot activate unknown skill: ${name}`);
      return false;
    }

    if (skill.isActive) {
      return true; // Already active
    }

    skill.isActive = true;
    this.activeSkills.add(name);

    this.emitEvent('skill.activated', {
      type: 'skill.activated',
      skillId: skill.id,
      skillName: skill.name,
      timestamp: new Date(),
    });

    logger.debug(`Activated skill: ${name}`);
    return true;
  }

  /**
   * Deactivate a skill
   */
  async deactivate(name: string): Promise<boolean> {
    const skill = this.skills.get(name);
    if (!skill) {
      return false;
    }

    if (!skill.isActive) {
      return true; // Already inactive
    }

    skill.isActive = false;
    this.activeSkills.delete(name);

    this.emitEvent('skill.deactivated', {
      type: 'skill.deactivated',
      skillId: skill.id,
      skillName: skill.name,
      timestamp: new Date(),
    });

    logger.debug(`Deactivated skill: ${name}`);
    return true;
  }

  /**
   * Invoke a skill (mark as used)
   */
  async invoke(name: string): Promise<void> {
    const skill = this.skills.get(name);
    if (skill) {
      skill.useCount++;
      this.emitEvent('skill.invoked', {
        type: 'skill.invoked',
        skillId: skill.id,
        skillName: skill.name,
        timestamp: new Date(),
        data: { useCount: skill.useCount },
      });
    }
  }

  // ============================================================================
  // Formatting
  // ============================================================================

  /**
   * Format skills for inclusion in prompt
   */
  formatForPrompt(skills?: LoadedSkill[]): string {
    const skillsToFormat = skills || this.getActiveSkills();
    return formatSkillsForPrompt(skillsToFormat);
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private emitEvent(type: SkillEventType, event: SkillEvent): void {
    this.eventEmitter.emit(type, event);
    this.eventEmitter.emit('*', event);
  }

  on(event: SkillEventType, listener: (event: SkillEvent) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  off(event: SkillEventType, listener: (event: SkillEvent) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Update registry configuration
   */
  updateConfig(config: Partial<SkillRegistryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SkillRegistryConfig {
    return { ...this.config };
  }

  // ============================================================================
  // Swarm Integration
  // ============================================================================

  /**
   * Create skill context for a swarm agent
   */
  createSwarmContext(
    swarmId: string,
    agentId: string,
    task: string,
    config?: SwarmSkillConfig
  ): SwarmSkillContext {
    // Auto-load if enabled
    if (config?.autoLoad ?? this.config.autoLoad) {
      this.autoLoad(task);
    }

    // Get shared skills
    let availableSkills = this.getAll();
    if (config?.sharedSkills) {
      availableSkills = availableSkills.filter((s) =>
        config.sharedSkills.includes(s.name)
      );
    }

    // Activate shared skills
    for (const skillName of config?.sharedSkills || []) {
      this.activate(skillName);
    }

    return {
      swarmId,
      agentId,
      task,
      availableSkills,
      activeSkills: this.getActiveSkills(),
    };
  }

  /**
   * Share skills between agents
   */
  async shareSkills(
    sourceAgentId: string,
    targetAgentId: string,
    skillNames: string[]
  ): Promise<boolean> {
    for (const name of skillNames) {
      const skill = this.skills.get(name);
      if (skill) {
        // Both agents now have access to this skill
        logger.debug(`Shared skill ${name} from ${sourceAgentId} to ${targetAgentId}`);
      }
    }
    return true;
  }

  /**
   * Get skills for a specific agent role
   */
  getSkillsForRole(
    role: string,
    roleSkills: Record<string, string[]>
  ): LoadedSkill[] {
    const skillNames = roleSkills[role] || [];
    return skillNames
      .map((name) => this.skills.get(name))
      .filter((s): s is LoadedSkill => s !== undefined);
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Clear all loaded skills
   */
  clear(): void {
    this.skills.clear();
    this.activeSkills.clear();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    active: number;
    bySource: Record<SkillSource, number>;
  } {
    const bySource: Record<SkillSource, number> = {
      user: 0,
      project: 0,
      builtin: 0,
      path: 0,
    };

    for (const skill of this.skills.values()) {
      bySource[skill.source]++;
    }

    return {
      total: this.skills.size,
      active: this.activeSkills.size,
      bySource,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRegistry: SkillRegistry | null = null;

/**
 * Get the global skill registry instance
 */
export function getGlobalSkillRegistry(
  config?: Partial<SkillRegistryConfig>
): SkillRegistry {
  if (!globalRegistry) {
    globalRegistry = new SkillRegistry(config);
  } else if (config) {
    globalRegistry.updateConfig(config);
  }
  return globalRegistry;
}

/**
 * Reset the global registry (mainly for testing)
 */
export function resetGlobalSkillRegistry(): void {
  globalRegistry = null;
}

export default SkillRegistry;
