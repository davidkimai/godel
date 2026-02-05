/**
 * Unified Skill Registry
 * 
 * Combines ClawHub and Vercel skills sources into a single interface.
 * Provides cross-registry skill discovery and management.
 */

import { logger } from '../utils/logger';
import * as path from 'path';
import { ClawHubAdapter, getGlobalClawHubAdapter } from './clawhub';
import { VercelSkillsClient, getGlobalVercelSkillsClient } from './vercel';
import {
  UnifiedSkillMetadata,
  UnifiedSearchParams,
  UnifiedSearchResult,
  UnifiedInstallOptions,
  UnifiedInstallResult,
  UnifiedInstalledSkill,
  UnifiedLockfile,
  UnifiedLockfileEntry,
  SkillSource,
  SkillSourceInfo,
  UnifiedRegistryConfig,
  DEFAULT_UNIFIED_REGISTRY_CONFIG,
  SkillNotFoundError,
  SkillAlreadyInstalledError,
  SourceNotAvailableError,
  AmbiguousSkillError,
  UnifiedSkillError,
} from './types';

// ============================================================================
// Unified Skill Registry
// ============================================================================

export class UnifiedSkillRegistry {
  private config: UnifiedRegistryConfig;
  private clawhub: ClawHubAdapter;
  private vercel: VercelSkillsClient;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();

  constructor(config?: Partial<UnifiedRegistryConfig>) {
    this.config = { ...DEFAULT_UNIFIED_REGISTRY_CONFIG, ...config };
    
    // Initialize adapters
    this.clawhub = getGlobalClawHubAdapter({
      registryUrl: this.config.clawhub?.registryUrl,
      siteUrl: this.config.clawhub?.siteUrl,
      token: this.config.clawhub?.token,
      workdir: this.config.workdir,
      skillsDir: this.config.skillsDir,
      timeout: this.config.timeout,
      enabled: this.config.clawhub?.enabled ?? true,
    });

    this.vercel = getGlobalVercelSkillsClient({
      registryUrl: this.config.vercel?.registryUrl,
      npmRegistry: this.config.vercel?.npmRegistry,
      workdir: this.config.workdir,
      skillsDir: this.config.skillsDir,
      timeout: this.config.timeout,
      enabled: this.config.vercel?.enabled ?? true,
    });

    logger.info('[UnifiedSkillRegistry] Initialized');
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get current configuration
   */
  getConfig(): UnifiedRegistryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<UnifiedRegistryConfig>): void {
    this.config = { ...this.config, ...config };
    
    this.clawhub.updateConfig({
      registryUrl: this.config.clawhub?.registryUrl,
      siteUrl: this.config.clawhub?.siteUrl,
      token: this.config.clawhub?.token,
      workdir: this.config.workdir,
      skillsDir: this.config.skillsDir,
      timeout: this.config.timeout,
      enabled: this.config.clawhub?.enabled,
    });

    this.vercel.updateConfig({
      registryUrl: this.config.vercel?.registryUrl,
      npmRegistry: this.config.vercel?.npmRegistry,
      workdir: this.config.workdir,
      skillsDir: this.config.skillsDir,
      timeout: this.config.timeout,
      enabled: this.config.vercel?.enabled,
    });

    logger.debug('[UnifiedSkillRegistry] Configuration updated');
  }

  /**
   * Get available skill sources
   */
  getSources(): SkillSourceInfo[] {
    return [
      {
        id: 'clawhub',
        name: 'ClawHub',
        description: 'OpenClaw official skill registry',
        url: this.config.clawhub?.registryUrl || 'https://clawhub.ai',
        enabled: this.config.clawhub?.enabled ?? true,
      },
      {
        id: 'vercel',
        name: 'Vercel Skills',
        description: 'Vercel skills.sh ecosystem (npm-based)',
        url: this.config.vercel?.registryUrl || 'https://skills.sh',
        enabled: this.config.vercel?.enabled ?? true,
      },
    ];
  }

  /**
   * Get skills directory path
   */
  getSkillsDirectory(): string {
    return path.resolve(this.config.workdir, this.config.skillsDir);
  }

  // ============================================================================
  // Search
  // ============================================================================

  /**
   * Search across all enabled skill sources
   */
  async search(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    const cacheKey = `search:${JSON.stringify(params)}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtl) {
      logger.debug('[UnifiedSkillRegistry] Returning cached search results');
      const result = cached.data as UnifiedSearchResult;
      return { ...result, queryTimeMs: Date.now() - startTime };
    }

    logger.debug(`[UnifiedSkillRegistry] Searching for: ${params.query}`);

    // Determine which sources to search
    const sourcesToSearch = params.sources 
      ? params.sources.filter(s => this.isSourceEnabled(s))
      : this.getEnabledSources();

    // Search all enabled sources in parallel
    const searchPromises = sourcesToSearch.map(async source => {
      try {
        switch (source) {
          case 'clawhub':
            return { source, result: await this.clawhub.search(params) };
          case 'vercel':
            return { source, result: await this.vercel.search(params) };
          default:
            return null;
        }
      } catch (error) {
        logger.warn(`[UnifiedSkillRegistry] Search failed for ${source}:`, error as string | Record<string, unknown>);
        return { source, result: null };
      }
    });

    const results = (await Promise.all(searchPromises)).filter(
      (r): r is { source: SkillSource; result: UnifiedSearchResult | null } => r !== null
    );

    // Combine results
    let allSkills: UnifiedSkillMetadata[] = [];
    let totalBySource: Record<SkillSource, number> = { clawhub: 0, vercel: 0 };

    for (const { source, result } of results) {
      if (result) {
        allSkills = allSkills.concat(result.skills);
        totalBySource[source] = result.total;
      }
    }

    // Sort results
    const sortFn = (a: UnifiedSkillMetadata, b: UnifiedSkillMetadata): number => {
      switch (params.sort) {
        case 'downloads':
          return b.downloads - a.downloads;
        case 'stars':
          return b.stars - a.stars;
        case 'recent':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'relevance':
        default:
          // Default sort by source priority (clawhub first) then relevance
          if (a.source !== b.source) {
            return a.source === 'clawhub' ? -1 : 1;
          }
          return 0;
      }
    };

    allSkills.sort(sortFn);

    // Apply pagination
    const offset = params.offset || 0;
    const limit = params.limit || 20;
    const paginatedSkills = allSkills.slice(offset, offset + limit);

    // Group by source for the response
    const bySource: UnifiedSearchResult['bySource'] = {
      clawhub: { skills: [], total: totalBySource.clawhub },
      vercel: { skills: [], total: totalBySource.vercel },
    };

    for (const skill of paginatedSkills) {
      bySource[skill.source].skills.push(skill);
    }

    const unifiedResult: UnifiedSearchResult = {
      skills: paginatedSkills,
      total: allSkills.length,
      offset,
      limit,
      queryTimeMs: Date.now() - startTime,
      bySource,
    };

    // Cache results
    this.cache.set(cacheKey, { data: unifiedResult, timestamp: Date.now() });

    return unifiedResult;
  }

  // ============================================================================
  // Skill Metadata
  // ============================================================================

  /**
   * Fetch skill metadata from any source
   * Supports 'source:slug' format for disambiguation
   */
  async fetchSkill(skillId: string): Promise<UnifiedSkillMetadata> {
    const { source, slug } = this.parseSkillId(skillId);

    if (source) {
      // Explicit source specified
      if (!this.isSourceEnabled(source)) {
        throw new SourceNotAvailableError(source);
      }
      
      switch (source) {
        case 'clawhub':
          return this.clawhub.fetchSkill(slug);
        case 'vercel':
          return this.vercel.fetchSkill(slug);
      }
    }

    // No source specified - try all enabled sources
    const errors: string[] = [];

    if (this.clawhub.isEnabled()) {
      try {
        return await this.clawhub.fetchSkill(slug);
      } catch (error) {
        if (error instanceof SkillNotFoundError) {
          errors.push(`ClawHub: not found`);
        } else {
          errors.push(`ClawHub: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    if (this.vercel.isEnabled()) {
      try {
        return await this.vercel.fetchSkill(slug);
      } catch (error) {
        if (error instanceof SkillNotFoundError) {
          errors.push(`Vercel: not found`);
        } else {
          errors.push(`Vercel: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    throw new SkillNotFoundError(slug);
  }

  // ============================================================================
  // Installation
  // ============================================================================

  /**
   * Install a skill from any source
   * Supports 'source:slug' format for disambiguation
   */
  async install(skillId: string, options: UnifiedInstallOptions = {}): Promise<UnifiedInstallResult> {
    const { source, slug } = this.parseSkillId(skillId);

    if (source) {
      // Explicit source specified
      if (!this.isSourceEnabled(source)) {
        throw new SourceNotAvailableError(source);
      }

      const result = await this.installFromSource(source, slug, options);
      
      if (result.success) {
        // Update unified lockfile
        await this.addToUnifiedLockfile({
          id: `${source}:${slug}`,
          source,
          slug,
          version: result.version,
          contentHash: result.skill?.contentHash || '',
          installedAt: new Date().toISOString(),
          path: result.installPath || '',
          dependencies: result.installedDependencies || [],
          config: options.config,
        });
      }

      return result;
    }

    // No source specified - check for ambiguity and auto-resolve
    const matchingSources = await this.findSkillInSources(slug);

    if (matchingSources.length === 0) {
      throw new SkillNotFoundError(slug);
    }

    if (matchingSources.length === 1) {
      // Only one source has this skill - install from it
      const source = matchingSources[0];
      const result = await this.installFromSource(source, slug, options);
      
      if (result.success) {
        await this.addToUnifiedLockfile({
          id: `${source}:${slug}`,
          source,
          slug,
          version: result.version,
          contentHash: result.skill?.contentHash || '',
          installedAt: new Date().toISOString(),
          path: result.installPath || '',
          dependencies: result.installedDependencies || [],
          config: options.config,
        });
      }

      return result;
    }

    // Multiple sources have this skill - use preference or error
    if (options.preferredSource && matchingSources.includes(options.preferredSource)) {
      const result = await this.installFromSource(options.preferredSource, slug, options);
      
      if (result.success) {
        await this.addToUnifiedLockfile({
          id: `${options.preferredSource}:${slug}`,
          source: options.preferredSource,
          slug,
          version: result.version,
          contentHash: result.skill?.contentHash || '',
          installedAt: new Date().toISOString(),
          path: result.installPath || '',
          dependencies: result.installedDependencies || [],
          config: options.config,
        });
      }

      return result;
    }

    // Ambiguous - throw error with suggestions
    throw new AmbiguousSkillError(slug, matchingSources);
  }

  /**
   * Install from a specific source
   */
  private async installFromSource(
    source: SkillSource,
    slug: string,
    options: UnifiedInstallOptions
  ): Promise<UnifiedInstallResult> {
    switch (source) {
      case 'clawhub':
        return this.clawhub.install(slug, options);
      case 'vercel':
        return this.vercel.install(slug, options);
      default:
        throw new SourceNotAvailableError(source);
    }
  }

  /**
   * Uninstall a skill
   * Supports 'source:slug' format
   */
  async uninstall(skillId: string): Promise<void> {
    const { source, slug } = this.parseSkillId(skillId);
    const unifiedLockfile = await this.loadUnifiedLockfile();
    
    // Find in unified lockfile
    const entry = unifiedLockfile.skills.find(s => {
      if (s.id === skillId) return true;
      if (source && s.source === source && s.slug === slug) return true;
      if (!source && s.slug === slug) return true;
      return false;
    });

    if (!entry) {
      throw new UnifiedSkillError(
        'SKILL_NOT_FOUND',
        `Skill ${skillId} is not installed`
      );
    }

    // Uninstall from the appropriate source
    switch (entry.source) {
      case 'clawhub':
        await this.clawhub.uninstall(entry.slug);
        break;
      case 'vercel':
        await this.vercel.uninstall(entry.slug);
        break;
    }

    // Update unified lockfile
    await this.removeFromUnifiedLockfile(entry.id);
  }

  /**
   * Update a skill
   * Supports 'source:slug' format
   */
  async update(skillId: string, options: UnifiedInstallOptions = {}): Promise<UnifiedInstallResult> {
    // Uninstall then install (force)
    await this.uninstall(skillId);
    return this.install(skillId, { ...options, force: true });
  }

  /**
   * Check if a skill is installed
   */
  async isInstalled(skillId: string): Promise<{ installed: boolean; version?: string; source?: SkillSource }> {
    const unifiedLockfile = await this.loadUnifiedLockfile();
    const { source, slug } = this.parseSkillId(skillId);

    const entry = unifiedLockfile.skills.find(s => {
      if (s.id === skillId) return true;
      if (source && s.source === source && s.slug === slug) return true;
      if (!source && s.slug === slug) return true;
      return false;
    });

    if (entry) {
      return { installed: true, version: entry.version, source: entry.source };
    }

    return { installed: false };
  }

  // ============================================================================
  // List Installed
  // ============================================================================

  /**
   * List all installed skills across all sources
   */
  async listInstalled(): Promise<UnifiedInstalledSkill[]> {
    const unifiedLockfile = await this.loadUnifiedLockfile();
    const skills: UnifiedInstalledSkill[] = [];

    for (const entry of unifiedLockfile.skills) {
      try {
        let skill: UnifiedInstalledSkill | undefined;

        switch (entry.source) {
          case 'clawhub': {
            const clawhubSkills = await this.clawhub.listInstalled();
            const found = clawhubSkills.find(s => s['slug'] === entry['slug']);
            if (found) skill = found as UnifiedInstalledSkill;
            break;
          }
          case 'vercel': {
            const vercelSkills = await this.vercel.listInstalled();
            const found = vercelSkills.find(s => s['slug'] === entry['slug']);
            if (found) skill = found as UnifiedInstalledSkill;
            break;
          }
        }

        if (skill) {
          skills.push(skill);
        }
      } catch (error) {
        logger.warn(`[UnifiedSkillRegistry] Failed to get info for ${entry.id}:`, error as string | Record<string, unknown>);
      }
    }

    return skills;
  }

  // ============================================================================
  // Lockfile Management
  // ============================================================================

  private getUnifiedLockfilePath(): string {
    return path.join(this.getSkillsDirectory(), '.unified-lockfile.json');
  }

  private async loadUnifiedLockfile(): Promise<UnifiedLockfile> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(this.getUnifiedLockfilePath(), 'utf-8');
      return JSON.parse(content);
    } catch {
      return { version: '1.0', skills: [] };
    }
  }

  private async saveUnifiedLockfile(lockfile: UnifiedLockfile): Promise<void> {
    const fs = await import('fs/promises');
    await fs.mkdir(path.dirname(this.getUnifiedLockfilePath()), { recursive: true });
    await fs.writeFile(this.getUnifiedLockfilePath(), JSON.stringify(lockfile, null, 2));
  }

  private async addToUnifiedLockfile(entry: UnifiedLockfileEntry): Promise<void> {
    const lockfile = await this.loadUnifiedLockfile();
    
    // Remove existing entry if present
    const existingIndex = lockfile.skills.findIndex(s => s.id === entry.id || s.slug === entry.slug);
    if (existingIndex >= 0) {
      lockfile.skills.splice(existingIndex, 1);
    }
    
    lockfile.skills.push(entry);
    lockfile.lastSync = new Date().toISOString();
    
    await this.saveUnifiedLockfile(lockfile);
  }

  private async removeFromUnifiedLockfile(id: string): Promise<void> {
    const lockfile = await this.loadUnifiedLockfile();
    lockfile.skills = lockfile.skills.filter(s => s.id !== id);
    lockfile.lastSync = new Date().toISOString();
    await this.saveUnifiedLockfile(lockfile);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Parse a skill ID that may include source prefix
   * Formats: "clawhub:postgres-backup" or just "postgres-backup"
   */
  private parseSkillId(skillId: string): { source?: SkillSource; slug: string } {
    const colonIndex = skillId.indexOf(':');
    
    if (colonIndex > 0) {
      const sourcePart = skillId.substring(0, colonIndex) as SkillSource;
      const slug = skillId.substring(colonIndex + 1);
      
      if (['clawhub', 'vercel'].includes(sourcePart)) {
        return { source: sourcePart, slug };
      }
    }
    
    return { slug: skillId };
  }

  /**
   * Check if a source is enabled
   */
  private isSourceEnabled(source: SkillSource): boolean {
    switch (source) {
      case 'clawhub':
        return this.config.clawhub?.enabled ?? true;
      case 'vercel':
        return this.config.vercel?.enabled ?? true;
      default:
        return false;
    }
  }

  /**
   * Get list of enabled sources
   */
  private getEnabledSources(): SkillSource[] {
    const sources: SkillSource[] = [];
    
    if (this.config.clawhub?.enabled !== false) {
      sources.push('clawhub');
    }
    if (this.config.vercel?.enabled !== false) {
      sources.push('vercel');
    }
    
    return sources;
  }

  /**
   * Find which sources have a particular skill
   */
  private async findSkillInSources(slug: string): Promise<SkillSource[]> {
    const sources: SkillSource[] = [];
    
    if (this.clawhub.isEnabled()) {
      try {
        await this.clawhub.fetchSkill(slug);
        sources.push('clawhub');
      } catch {
        // Not found in ClawHub
      }
    }
    
    if (this.vercel.isEnabled()) {
      try {
        await this.vercel.fetchSkill(slug);
        sources.push('vercel');
      } catch {
        // Not found in Vercel
      }
    }
    
    return sources;
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('[UnifiedSkillRegistry] Cache cleared');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalRegistry: UnifiedSkillRegistry | null = null;

export function getGlobalSkillRegistry(config?: Partial<UnifiedRegistryConfig>): UnifiedSkillRegistry {
  if (!globalRegistry) {
    globalRegistry = new UnifiedSkillRegistry(config);
  } else if (config) {
    globalRegistry.updateConfig(config);
  }
  return globalRegistry;
}

export function resetGlobalSkillRegistry(): void {
  globalRegistry = null;
}

export default UnifiedSkillRegistry;
