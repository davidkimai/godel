/**
 * ClawHub Adapter
 * 
 * Adapter that wraps the existing ClawHubClient to conform to the unified
 * skill registry interface.
 */

import * as path from 'path';
import { logger } from '../utils/logger';
import { ClawHubClient, getGlobalClawHubClient } from '../integrations/openclaw/ClawHubClient';
import {
  SkillMetadata,
  SkillSearchParams,
  SkillInstallOptions,
  InstalledSkill,
} from '../integrations/openclaw/ClawHubTypes';
import {
  UnifiedSkillMetadata,
  UnifiedSearchParams,
  UnifiedSearchResult,
  UnifiedInstallOptions,
  UnifiedInstallResult,
  UnifiedInstalledSkill,
  SkillSource,
  SkillNotFoundError,
  UnifiedSkillError,
} from './types';

// ============================================================================
// Configuration
// ============================================================================

export interface ClawHubAdapterConfig {
  /** ClawHub registry URL */
  registryUrl: string;
  /** Site URL */
  siteUrl?: string;
  /** Authentication token */
  token?: string;
  /** Working directory */
  workdir: string;
  /** Skills directory */
  skillsDir: string;
  /** Request timeout */
  timeout: number;
  /** Enable this source */
  enabled: boolean;
}

export const DEFAULT_CLAWHUB_ADAPTER_CONFIG: ClawHubAdapterConfig = {
  registryUrl: process.env['CLAWHUB_REGISTRY'] || 'https://clawhub.ai',
  siteUrl: process.env['CLAWHUB_SITE'] || 'https://clawhub.ai',
  token: process.env['CLAWHUB_TOKEN'],
  workdir: process.cwd(),
  skillsDir: 'skills',
  timeout: 30000,
  enabled: true,
};

// ============================================================================
// ClawHub Adapter
// ============================================================================

export class ClawHubAdapter {
  private client: ClawHubClient;
  private config: ClawHubAdapterConfig;

  constructor(config?: Partial<ClawHubAdapterConfig>) {
    this.config = { ...DEFAULT_CLAWHUB_ADAPTER_CONFIG, ...config };
    
    // Create or get global ClawHub client
    this.client = getGlobalClawHubClient({
      registryUrl: this.config.registryUrl,
      siteUrl: this.config.siteUrl,
      token: this.config.token,
      workdir: this.config.workdir,
      skillsDir: this.config.skillsDir,
      timeout: this.config.timeout,
    });
    
    logger.info(`[ClawHubAdapter] Initialized with registry: ${this.config.registryUrl}`);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get current configuration
   */
  getConfig(): ClawHubAdapterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ClawHubAdapterConfig>): void {
    this.config = { ...this.config, ...config };
    this.client.updateConfig({
      registryUrl: this.config.registryUrl,
      siteUrl: this.config.siteUrl,
      token: this.config.token,
      workdir: this.config.workdir,
      skillsDir: this.config.skillsDir,
      timeout: this.config.timeout,
    });
    logger.debug('[ClawHubAdapter] Configuration updated');
  }

  /**
   * Check if this source is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get skills directory path
   */
  getSkillsDirectory(): string {
    return path.join(
      path.resolve(this.config.workdir, this.config.skillsDir),
      'clawhub'
    );
  }

  // ============================================================================
  // Search
  // ============================================================================

  /**
   * Search for skills in ClawHub
   */
  async search(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    
    logger.debug(`[ClawHubAdapter] Searching for: ${params.query}`);

    try {
      // Convert unified params to ClawHub params
      const clawhubParams: SkillSearchParams = {
        query: params.query,
        limit: params.limit,
        offset: params.offset,
        tags: params.tags,
        author: params.author,
        sort: params.sort,
        includeHidden: params.includeHidden,
      };

      const result = await this.client.search(clawhubParams);

      // Convert results to unified format
      const unifiedSkills = result.skills.map(skill => this.toUnifiedMetadata(skill));

      return {
        skills: unifiedSkills,
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        queryTimeMs: result.queryTimeMs || Date.now() - startTime,
        bySource: {
          clawhub: {
            skills: unifiedSkills,
            total: result.total,
          },
          vercel: {
            skills: [],
            total: 0,
          },
        },
      };
    } catch (error) {
      logger.error('[ClawHubAdapter] Search failed:', error);
      throw new UnifiedSkillError(
        'NETWORK_ERROR',
        `Failed to search ClawHub: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ============================================================================
  // Fetch Metadata
  // ============================================================================

  /**
   * Fetch skill metadata from ClawHub
   */
  async fetchSkill(slug: string): Promise<UnifiedSkillMetadata> {
    logger.debug(`[ClawHubAdapter] Fetching skill: ${slug}`);

    try {
      const metadata = await this.client.fetchSkill(slug);
      return this.toUnifiedMetadata(metadata);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new SkillNotFoundError(slug, 'clawhub');
      }
      logger.error(`[ClawHubAdapter] Failed to fetch skill ${slug}:`, error);
      throw new UnifiedSkillError(
        'NETWORK_ERROR',
        `Failed to fetch skill ${slug}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ============================================================================
  // Installation
  // ============================================================================

  /**
   * Check if a skill is installed
   */
  async isInstalled(slug: string): Promise<{ installed: boolean; version?: string }> {
    return this.client.isInstalled(slug);
  }

  /**
   * Install a skill from ClawHub
   */
  async install(slug: string, options: UnifiedInstallOptions = {}): Promise<UnifiedInstallResult> {
    logger.info(`[ClawHubAdapter] Installing ${slug}`);

    try {
      // Convert unified options to ClawHub options
      const clawhubOptions: SkillInstallOptions = {
        version: options.version,
        force: options.force,
        targetDir: options.targetDir,
        installDependencies: options.installDependencies,
        skipDependencies: options.skipDependencies,
        noInput: options.noInput,
        config: options.config,
      };

      const result = await this.client.install(slug, clawhubOptions);

      if (result.success && result.skill) {
        return {
          success: true,
          skill: this.toUnifiedMetadata(result.skill),
          installPath: result.installPath || '',
          version: result.version,
          source: 'clawhub',
          installedDependencies: result.installedDependencies,
          warnings: result.warnings,
        };
      } else {
        return {
          success: false,
          version: options.version || 'unknown',
          source: 'clawhub',
          errors: result.errors || ['Installation failed'],
          warnings: result.warnings,
        };
      }
    } catch (error) {
      logger.error(`[ClawHubAdapter] Installation failed for ${slug}:`, error);
      
      return {
        success: false,
        version: options.version || 'unknown',
        source: 'clawhub',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Uninstall a skill
   */
  async uninstall(slug: string): Promise<void> {
    logger.info(`[ClawHubAdapter] Uninstalling ${slug}`);
    await this.client.uninstall(slug);
  }

  /**
   * List installed skills
   */
  async listInstalled(): Promise<UnifiedInstalledSkill[]> {
    const installed = await this.client.listInstalled();
    return installed.map(skill => this.toUnifiedInstalledSkill(skill));
  }

  // ============================================================================
  // Converters
  // ============================================================================

  /**
   * Convert ClawHub metadata to unified format
   */
  private toUnifiedMetadata(skill: SkillMetadata): UnifiedSkillMetadata {
    return {
      id: `clawhub:${skill.slug}`,
      source: 'clawhub',
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      readme: skill.readme,
      author: skill.author,
      version: skill.version,
      versions: skill.versions,
      tags: skill.tags,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
      downloads: skill.downloads,
      stars: skill.stars,
      status: skill.status,
      contentHash: skill.contentHash,
      downloadUrl: skill.downloadUrl,
      size: skill.size,
      sourceMetadata: skill.metadata,
    };
  }

  /**
   * Convert ClawHub installed skill to unified format
   */
  private toUnifiedInstalledSkill(skill: InstalledSkill): UnifiedInstalledSkill {
    return {
      ...this.toUnifiedMetadata(skill),
      installPath: skill.installPath,
      activationState: skill.activationState,
      config: skill.config,
      resolvedDependencies: skill.resolvedDependencies,
      missingDependencies: skill.missingDependencies,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalAdapter: ClawHubAdapter | null = null;

export function getGlobalClawHubAdapter(config?: Partial<ClawHubAdapterConfig>): ClawHubAdapter {
  if (!globalAdapter) {
    globalAdapter = new ClawHubAdapter(config);
  } else if (config) {
    globalAdapter.updateConfig(config);
  }
  return globalAdapter;
}

export function resetGlobalClawHubAdapter(): void {
  globalAdapter = null;
}

export default ClawHubAdapter;
