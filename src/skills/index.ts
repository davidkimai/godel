/**
 * Unified Skills Module
 * 
 * Single interface for managing skills from both ClawHub and Vercel sources.
 * 
 * @example
 * ```typescript
 * import { skills } from './skills';
 * 
 * // Search across both sources
 * const results = await skills.search({ query: 'postgres' });
 * 
 * // Install a skill (auto-detects source)
 * await skills.install('postgres-backup');
 * 
 * // Install from specific source
 * await skills.install('vercel:some-npm-package');
 * 
 * // List installed skills
 * const installed = await skills.list();
 * 
 * // Remove a skill
 * await skills.remove('postgres-backup');
 * ```
 */

// ============================================================================
// Exports
// ============================================================================

// Types
export * from './types';

// Registry
export { 
  UnifiedSkillRegistry,
  getGlobalSkillRegistry,
  resetGlobalSkillRegistry,
} from './registry';

// Source Adapters
export {
  ClawHubAdapter,
  getGlobalClawHubAdapter,
  resetGlobalClawHubAdapter,
} from './clawhub';

export {
  VercelSkillsClient,
  getGlobalVercelSkillsClient,
  resetGlobalVercelSkillsClient,
} from './vercel';

// ============================================================================
// Convenience API
// ============================================================================

import { UnifiedSkillRegistry, getGlobalSkillRegistry } from './registry';
import {
  UnifiedSkillMetadata,
  UnifiedSearchParams,
  UnifiedSearchResult,
  UnifiedInstallOptions,
  UnifiedInstallResult,
  UnifiedInstalledSkill,
  SkillSource,
  SkillSourceInfo,
} from './types';

/**
 * Unified Skills API
 * 
 * Convenience interface for common skill operations.
 * Uses the global registry instance.
 */
export const skills = {
  /**
   * Get the underlying registry instance
   */
  get registry(): UnifiedSkillRegistry {
    return getGlobalSkillRegistry();
  },

  /**
   * Get available skill sources
   */
  getSources(): SkillSourceInfo[] {
    return this.registry.getSources();
  },

  /**
   * Search for skills across all enabled sources
   * 
   * @param params Search parameters
   * @returns Search results from all sources
   * 
   * @example
   * ```typescript
   * const results = await skills.search({ query: 'postgres', limit: 10 });
   * logger.info(`Found ${results.total} skills`);
   * for (const skill of results.skills) {
   *   logger.info(`${skill.source}: ${skill.name}`);
   * }
   * ```
   */
  async search(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    return this.registry.search(params);
  },

  /**
   * Fetch metadata for a specific skill
   * 
   * @param skillId Skill ID (can include source prefix like 'clawhub:postgres-backup')
   * @returns Skill metadata
   * 
   * @example
   * ```typescript
   * const skill = await skills.info('postgres-backup');
   * logger.info(`${skill.name} v${skill.version}`);
   * ```
   */
  async info(skillId: string): Promise<UnifiedSkillMetadata> {
    return this.registry.fetchSkill(skillId);
  },

  /**
   * Install a skill
   * 
   * @param skillId Skill ID (can include source prefix)
   * @param options Installation options
   * @returns Installation result
   * 
   * @example
   * ```typescript
   * // Install from any source (auto-detect)
   * await skills.install('postgres-backup');
   * 
   * // Install from specific source
   * await skills.install('clawhub:postgres-backup');
   * 
   * // Install specific version
   * await skills.install('postgres-backup', { version: '1.2.0' });
   * 
   * // Force reinstall
   * await skills.install('postgres-backup', { force: true });
   * ```
   */
  async install(skillId: string, options?: UnifiedInstallOptions): Promise<UnifiedInstallResult> {
    return this.registry.install(skillId, options);
  },

  /**
   * Remove/uninstall a skill
   * 
   * @param skillId Skill ID (can include source prefix)
   * 
   * @example
   * ```typescript
   * await skills.remove('postgres-backup');
   * ```
   */
  async remove(skillId: string): Promise<void> {
    return this.registry.uninstall(skillId);
  },

  /**
   * Update a skill to the latest version
   * 
   * @param skillId Skill ID (can include source prefix)
   * @param options Update options
   * @returns Installation result
   * 
   * @example
   * ```typescript
   * await skills.update('postgres-backup');
   * ```
   */
  async update(skillId: string, options?: UnifiedInstallOptions): Promise<UnifiedInstallResult> {
    return this.registry.update(skillId, options);
  },

  /**
   * List all installed skills
   * 
   * @returns Array of installed skills with their states
   * 
   * @example
   * ```typescript
   * const installed = await skills.list();
   * for (const skill of installed) {
   *   logger.info(`${skill.name} v${skill.version} [${skill.activationState}]`);
   * }
   * ```
   */
  async list(): Promise<UnifiedInstalledSkill[]> {
    return this.registry.listInstalled();
  },

  /**
   * Check if a skill is installed
   * 
   * @param skillId Skill ID (can include source prefix)
   * @returns Installation status
   * 
   * @example
   * ```typescript
   * const status = await skills.isInstalled('postgres-backup');
   * if (status.installed) {
   *   logger.info(`Version ${status.version} from ${status.source}`);
   * }
   * ```
   */
  async isInstalled(skillId: string): Promise<{ 
    installed: boolean; 
    version?: string; 
    source?: SkillSource 
  }> {
    return this.registry.isInstalled(skillId);
  },
};

// Default export
export default skills;
