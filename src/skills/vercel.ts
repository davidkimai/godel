/**
 * Vercel Skills Client
 * 
 * Client for interacting with the Vercel skills ecosystem (skills.sh).
 * Provides search, fetch metadata, download and install functionality.
 * 
 * Vercel skills are npm packages with AGENTS.md or SKILL.md files.
 */

import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
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
// Vercel Skills Types
// ============================================================================

interface VercelSkillPackage {
  name: string;
  version: string;
  description?: string;
  author?: string | { name?: string; email?: string; url?: string };
  repository?: { type: string; url: string } | string;
  homepage?: string;
  keywords?: string[];
  license?: string;
  dist?: {
    tarball: string;
    shasum: string;
    integrity?: string;
    fileCount?: number;
    unpackedSize?: number;
  };
  time?: {
    created: string;
    modified: string;
    [version: string]: string;
  };
  versions?: Record<string, unknown>;
  readme?: string;
}

interface VercelSkillsShSkill {
  name: string;
  owner: string;
  repo: string;
  installs: number;
  category?: string;
  description?: string;
}

interface NpmSearchResult {
  objects: Array<{
    package: VercelSkillPackage;
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
    searchScore: number;
  }>;
  total: number;
  time: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface VercelSkillsConfig {
  /** skills.sh API URL */
  registryUrl: string;
  /** NPM registry URL */
  npmRegistry: string;
  /** Working directory */
  workdir: string;
  /** Skills directory */
  skillsDir: string;
  /** Request timeout */
  timeout: number;
  /** Enable this source */
  enabled: boolean;
}

export const DEFAULT_VERCEL_SKILLS_CONFIG: VercelSkillsConfig = {
  registryUrl: 'https://skills.sh',
  npmRegistry: 'https://registry.npmjs.org',
  workdir: process.cwd(),
  skillsDir: 'skills',
  timeout: 30000,
  enabled: true,
};

// ============================================================================
// Vercel Skills Client
// ============================================================================

export class VercelSkillsClient {
  private config: VercelSkillsConfig;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTtl: number;

  constructor(config?: Partial<VercelSkillsConfig>) {
    this.config = { ...DEFAULT_VERCEL_SKILLS_CONFIG, ...config };
    this.cacheTtl = 5 * 60 * 1000; // 5 minutes
    logger.info(`[VercelSkillsClient] Initialized`);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get current configuration
   */
  getConfig(): VercelSkillsConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VercelSkillsConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('[VercelSkillsClient] Configuration updated');
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
    return path.resolve(this.config.workdir, this.config.skillsDir, 'vercel');
  }

  // ============================================================================
  // Search
  // ============================================================================

  /**
   * Search for skills on npm/skills.sh
   */
  async search(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    const cacheKey = `search:${JSON.stringify(params)}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      logger.debug('[VercelSkillsClient] Returning cached search results');
      const result = cached.data as UnifiedSearchResult;
      return { ...result, queryTimeMs: Date.now() - startTime };
    }

    logger.debug(`[VercelSkillsClient] Searching for: ${params.query}`);

    try {
      // Search npm registry for packages with 'skill' or 'agents' keywords
      const npmResults = await this.searchNpm(params);
      
      // Also try skills.sh API if available
      const skillsShResults = await this.searchSkillsSh(params);

      // Combine and deduplicate results
      const combinedSkills = this.mergeSearchResults(npmResults, skillsShResults, params);
      
      // Apply pagination
      const offset = params.offset || 0;
      const limit = params.limit || 20;
      const paginatedSkills = combinedSkills.slice(offset, offset + limit);

      const result: UnifiedSearchResult = {
        skills: paginatedSkills,
        total: combinedSkills.length,
        offset,
        limit,
        queryTimeMs: Date.now() - startTime,
        bySource: {
          vercel: {
            skills: paginatedSkills,
            total: combinedSkills.length,
          },
          clawhub: {
            skills: [],
            total: 0,
          },
        },
      };

      // Cache results
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

      return result;
    } catch (error) {
      logger.error('[VercelSkillsClient] Search failed:', error as string | Record<string, unknown>);
      throw new UnifiedSkillError(
        'NETWORK_ERROR',
        `Failed to search Vercel skills: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Search npm registry
   */
  private async searchNpm(params: UnifiedSearchParams): Promise<UnifiedSkillMetadata[]> {
    const searchQuery = params.query 
      ? `${params.query}+keywords:skill,agents,agent-skills`
      : 'keywords:skill,agents,agent-skills';
    
    const url = new URL(`${this.config.npmRegistry}/-/v1/search`);
    url.searchParams.set('text', searchQuery);
    url.searchParams.set('size', String(Math.min(params.limit || 20, 250)));
    if (params.offset) {
      url.searchParams.set('from', String(params.offset));
    }

    const response = await this.fetchWithTimeout(url.toString());
    if (!response.ok) {
      throw new Error(`NPM registry returned ${response.status}`);
    }

    const data = await response.json() as NpmSearchResult;
    
    return data.objects.map(obj => this.npmPackageToUnifiedMetadata(obj.package));
  }

  /**
   * Search skills.sh directory
   */
  private async searchSkillsSh(params: UnifiedSearchParams): Promise<UnifiedSkillMetadata[]> {
    try {
      // skills.sh may have an API - try to fetch skills list
      const url = `${this.config.registryUrl}/api/skills`;
      const response = await this.fetchWithTimeout(url);
      
      if (!response.ok) {
        // skills.sh might not have a public API yet
        logger.debug('[VercelSkillsClient] skills.sh API not available, using npm only');
        return [];
      }

      const skills = await response.json() as VercelSkillsShSkill[];
      
      // Filter by query if provided
      const filtered = params.query 
        ? skills.filter(s => 
            s.name.toLowerCase().includes(params.query.toLowerCase()) ||
            s.description?.toLowerCase().includes(params.query.toLowerCase())
          )
        : skills;

      return filtered.map(skill => this.skillsShToUnifiedMetadata(skill));
    } catch (error) {
      logger.debug('[VercelSkillsClient] skills.sh search failed:', error as string | Record<string, unknown>);
      return [];
    }
  }

  /**
   * Merge and deduplicate search results
   */
  private mergeSearchResults(
    npmResults: UnifiedSkillMetadata[],
    skillsShResults: UnifiedSkillMetadata[],
    params: UnifiedSearchParams
  ): UnifiedSkillMetadata[] {
    const seen = new Set<string>();
    const merged: UnifiedSkillMetadata[] = [];

    // Sort function based on params.sort
    const sortFn = (a: UnifiedSkillMetadata, b: UnifiedSkillMetadata): number => {
      switch (params.sort) {
        case 'downloads':
          return b.downloads - a.downloads;
        case 'stars':
          return b.stars - a.downloads; // npm doesn't have stars, use downloads
        case 'recent':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'relevance':
        default:
          return 0;
      }
    };

    // Add npm results first (more reliable)
    for (const skill of npmResults) {
      if (!seen.has(skill.slug)) {
        seen.add(skill.slug);
        merged.push(skill);
      }
    }

    // Add skills.sh results
    for (const skill of skillsShResults) {
      if (!seen.has(skill.slug)) {
        seen.add(skill.slug);
        merged.push(skill);
      }
    }

    return merged.sort(sortFn);
  }

  // ============================================================================
  // Fetch Metadata
  // ============================================================================

  /**
   * Fetch skill metadata from npm
   */
  async fetchSkill(slug: string): Promise<UnifiedSkillMetadata> {
    const cacheKey = `skill:${slug}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return cached.data as UnifiedSkillMetadata;
    }

    logger.debug(`[VercelSkillsClient] Fetching skill: ${slug}`);

    try {
      // Try to fetch from npm registry
      const url = `${this.config.npmRegistry}/${slug}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new SkillNotFoundError(slug, 'vercel');
        }
        throw new Error(`NPM registry returned ${response.status}`);
      }

      const packageData = await response.json() as VercelSkillPackage;
      const metadata = this.npmPackageToUnifiedMetadata(packageData);

      // Cache result
      this.cache.set(cacheKey, { data: metadata, timestamp: Date.now() });

      return metadata;
    } catch (error) {
      if (error instanceof SkillNotFoundError) {
        throw error;
      }
      logger.error(`[VercelSkillsClient] Failed to fetch skill ${slug}:`, error as string | Record<string, unknown>);
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
    try {
      const lockfile = await this.loadLockfile();
      const entry = lockfile.skills.find(s => s.slug === slug);
      
      if (entry) {
        // Verify directory still exists
        const skillPath = path.join(this.getSkillsDirectory(), slug);
        try {
          await fs.access(skillPath);
          return { installed: true, version: entry.version };
        } catch {
          // Directory doesn't exist, clean up lockfile
          await this.removeFromLockfile(slug);
          return { installed: false };
        }
      }
      
      return { installed: false };
    } catch (error) {
      logger.debug(`[VercelSkillsClient] Error checking installation: ${error}`);
      return { installed: false };
    }
  }

  /**
   * Install a skill from npm
   */
  async install(slug: string, options: UnifiedInstallOptions = {}): Promise<UnifiedInstallResult> {
    logger.info(`[VercelSkillsClient] Installing ${slug}`);

    try {
      // Check if already installed
      const existing = await this.isInstalled(slug);
      if (existing.installed && !options.force) {
        throw new UnifiedSkillError(
          'SKILL_ALREADY_INSTALLED',
          `Skill ${slug}@${existing.version} is already installed. Use --force to reinstall.`
        );
      }

      // Fetch metadata to get download URL
      const metadata = await this.fetchSkill(slug);
      const version = options.version || metadata.version;

      // Install via npm
      const installPath = path.join(
        options.targetDir || this.getSkillsDirectory(),
        slug
      );

      // Ensure directory exists
      await fs.mkdir(installPath, { recursive: true });

      // Use npm to install the package
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const npmCommand = `npm install ${slug}@${version} --prefix ${installPath} --save-exact`;
      
      logger.debug(`[VercelSkillsClient] Running: ${npmCommand}`);
      
      const { stdout, stderr } = await execAsync(npmCommand, {
        timeout: this.config.timeout,
        cwd: this.config.workdir,
      });

      if (stderr && !stderr.includes('WARN')) {
        logger.warn(`[VercelSkillsClient] npm install warnings: ${stderr}`);
      }

      logger.debug(`[VercelSkillsClient] npm output: ${stdout}`);

      // Update lockfile
      await this.addToLockfile({
        id: `vercel:${slug}`,
        source: 'vercel',
        slug,
        version,
        contentHash: metadata.contentHash || '',
        installedAt: new Date().toISOString(),
        path: installPath,
        dependencies: [],
        config: options.config,
      });

      return {
        success: true,
        skill: metadata,
        installPath,
        version,
        source: 'vercel',
        installedDependencies: [],
      };
    } catch (error) {
      logger.error(`[VercelSkillsClient] Installation failed for ${slug}:`, error as string | Record<string, unknown>);
      
      return {
        success: false,
        version: options.version || 'unknown',
        source: 'vercel',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Uninstall a skill
   */
  async uninstall(slug: string): Promise<void> {
    logger.info(`[VercelSkillsClient] Uninstalling ${slug}`);

    const installPath = path.join(this.getSkillsDirectory(), slug);

    try {
      // Remove directory
      await fs.rm(installPath, { recursive: true, force: true });
      
      // Update lockfile
      await this.removeFromLockfile(slug);
      
      logger.info(`[VercelSkillsClient] Uninstalled ${slug}`);
    } catch (error) {
      logger.error(`[VercelSkillsClient] Failed to uninstall ${slug}:`, error as string | Record<string, unknown>);
      throw new UnifiedSkillError(
        'DOWNLOAD_FAILED',
        `Failed to uninstall ${slug}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List installed skills
   */
  async listInstalled(): Promise<UnifiedInstalledSkill[]> {
    try {
      const lockfile = await this.loadLockfile();
      const skills: UnifiedInstalledSkill[] = [];

      for (const entry of lockfile.skills) {
        try {
          const metadata = await this.fetchSkill(entry.slug);
          skills.push({
            ...metadata,
            installPath: entry.path,
            activationState: 'inactive' as const,
            config: entry.config,
          } as UnifiedInstalledSkill);
        } catch (error) {
          logger.warn(`[VercelSkillsClient] Failed to fetch metadata for ${entry.slug}:`, error as string | Record<string, unknown>);
        }
      }

      return skills;
    } catch (error) {
      logger.debug(`[VercelSkillsClient] Error listing installed skills: ${error}`);
      return [];
    }
  }

  // ============================================================================
  // Lockfile Management
  // ============================================================================

  private getLockfilePath(): string {
    return path.join(this.getSkillsDirectory(), '.vercel-lockfile.json');
  }

  private async loadLockfile(): Promise<{ skills: Array<{
    id: string;
    source: SkillSource;
    slug: string;
    version: string;
    contentHash: string;
    installedAt: string;
    path: string;
    dependencies: string[];
    config?: Record<string, unknown>;
  }> }> {
    try {
      const content = await fs.readFile(this.getLockfilePath(), 'utf-8');
      return JSON.parse(content);
    } catch {
      return { skills: [] };
    }
  }

  private async addToLockfile(entry: {
    id: string;
    source: SkillSource;
    slug: string;
    version: string;
    contentHash: string;
    installedAt: string;
    path: string;
    dependencies: string[];
    config?: Record<string, unknown>;
  }): Promise<void> {
    const lockfile = await this.loadLockfile();
    
    // Remove existing entry if present
    const existingIndex = lockfile.skills.findIndex(s => s.slug === entry.slug);
    if (existingIndex >= 0) {
      lockfile.skills.splice(existingIndex, 1);
    }
    
    lockfile.skills.push(entry);
    
    await fs.mkdir(path.dirname(this.getLockfilePath()), { recursive: true });
    await fs.writeFile(this.getLockfilePath(), JSON.stringify(lockfile, null, 2));
  }

  private async removeFromLockfile(slug: string): Promise<void> {
    const lockfile = await this.loadLockfile();
    lockfile.skills = lockfile.skills.filter(s => s.slug !== slug);
    await fs.writeFile(this.getLockfilePath(), JSON.stringify(lockfile, null, 2));
  }

  // ============================================================================
  // Converters
  // ============================================================================

  /**
   * Convert npm package to unified metadata
   */
  private npmPackageToUnifiedMetadata(pkg: VercelSkillPackage): UnifiedSkillMetadata {
    const slug = pkg.name;
    const authorName = typeof pkg.author === 'string' 
      ? pkg.author 
      : pkg.author?.name || 'unknown';
    
    return {
      id: `vercel:${slug}`,
      source: 'vercel',
      slug,
      name: pkg.name,
      description: pkg.description || '',
      readme: pkg.readme,
      author: {
        id: authorName,
        username: authorName,
      },
      version: pkg.version,
      versions: pkg.versions ? Object.keys(pkg.versions) : [pkg.version],
      tags: pkg.keywords || [],
      createdAt: pkg.time?.created || new Date().toISOString(),
      updatedAt: pkg.time?.modified || new Date().toISOString(),
      downloads: 0, // Would need to fetch from npm stats API
      stars: 0, // npm doesn't have stars
      status: 'active',
      contentHash: pkg.dist?.integrity || pkg.dist?.shasum,
      downloadUrl: pkg.dist?.tarball,
      size: pkg.dist?.unpackedSize,
      sourceMetadata: {
        npmPackage: true,
        repository: pkg.repository,
        license: pkg.license,
        fileCount: pkg.dist?.fileCount,
      },
    };
  }

  /**
   * Convert skills.sh entry to unified metadata
   */
  private skillsShToUnifiedMetadata(skill: VercelSkillsShSkill): UnifiedSkillMetadata {
    const slug = `${skill.owner}/${skill.repo}`;
    
    return {
      id: `vercel:${slug}`,
      source: 'vercel',
      slug,
      name: skill.name,
      description: skill.description || '',
      author: {
        id: skill.owner,
        username: skill.owner,
      },
      version: 'latest',
      tags: skill.category ? [skill.category] : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      downloads: skill.installs,
      stars: 0,
      status: 'active',
      sourceMetadata: {
        skillsSh: true,
        owner: skill.owner,
        repo: skill.repo,
      },
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Godel-VercelSkills-Client/1.0',
          ...options.headers,
        },
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalClient: VercelSkillsClient | null = null;

export function getGlobalVercelSkillsClient(config?: Partial<VercelSkillsConfig>): VercelSkillsClient {
  if (!globalClient) {
    globalClient = new VercelSkillsClient(config);
  } else if (config) {
    globalClient.updateConfig(config);
  }
  return globalClient;
}

export function resetGlobalVercelSkillsClient(): void {
  globalClient = null;
}

export default VercelSkillsClient;
