/**
 * Skill Installer
 * 
 * Handles SKILL.md parsing, dependency resolution, skill activation/deactivation,
 * and workspace integration.
 * 
 * Based on OPENCLAW_INTEGRATION_SPEC.md section F4.1
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { ClawHubClient } from './ClawHubClient';
import {
  ParsedSkill,
  SkillDependency,
  ConfigSchema,
  SkillActivationResult,
  SkillActivationState,
  InstalledSkill,
  DependencyError,
  ClawhubError,
} from './ClawHubTypes';

// ============================================================================
// Types
// ============================================================================

/**
 * Install context for dependency resolution
 */
interface InstallContext {
  /** Currently installing (to detect cycles) */
  installing: Set<string>;
  /** Already installed in this session */
  installed: Map<string, string>; // slug -> version
  /** Errors encountered */
  errors: string[];
  /** Warnings encountered */
  warnings: string[];
}

/**
 * Dependency resolution result
 */
interface DependencyResolution {
  /** Resolved dependency tree */
  tree: DependencyNode[];
  /** Missing dependencies */
  missing: string[];
  /** Conflicts detected */
  conflicts: DependencyConflict[];
}

/**
 * Dependency tree node
 */
interface DependencyNode {
  slug: string;
  version: string;
  optional: boolean;
  children: DependencyNode[];
}

/**
 * Dependency conflict
 */
interface DependencyConflict {
  slug: string;
  requiredBy: string[];
  versions: string[];
}

/**
 * Skill activation options
 */
interface ActivationOptions {
  /** Custom configuration values */
  config?: Record<string, unknown>;
  /** Skip validation */
  skipValidation?: boolean;
  /** Skip dependency activation */
  skipDependencies?: boolean;
}

// ============================================================================
// Frontmatter Parser
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];

  // Simple YAML parser for basic types
  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();

    // Try to parse as JSON (handles arrays, objects, numbers, booleans)
    if ((value as string).startsWith('[') || (value as string).startsWith('{')) {
      try {
        value = JSON.parse(value as string);
      } catch {
        // Keep as string
      }
    } else if ((value as string) === 'true') {
      value = true;
    } else if ((value as string) === 'false') {
      value = false;
    } else if ((value as string) === 'null') {
      value = null;
    } else if (!isNaN(Number(value)) && (value as string) !== '') {
      value = Number(value);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// ============================================================================
// Skill Installer
// ============================================================================

export class SkillInstaller {
  private client: ClawHubClient;
  private skillsDir: string;
  private activeSkills: Map<string, InstalledSkill> = new Map();
  private skillStates: Map<string, SkillActivationState> = new Map();

  constructor(client: ClawHubClient, skillsDir?: string) {
    this.client = client;
    this.skillsDir = skillsDir || client.getSkillsDirectory();
  }

  // ============================================================================
  // SKILL.md Parsing
  // ============================================================================

  /**
   * Parse a SKILL.md file
   */
  async parseSkillFile(filePath: string): Promise<ParsedSkill> {
    try {
      logger.debug(`[SkillInstaller] Parsing SKILL.md: ${filePath}`);

      const content = await fs.readFile(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);

      // Get directory to list files
      const dir = path.dirname(filePath);
      const files = await fs.readdir(dir, { recursive: true });

      // Extract dependencies from frontmatter
      const dependencies: SkillDependency[] = [];
      if (frontmatter['dependencies']) {
        const deps = frontmatter['dependencies'] as Array<string | Record<string, string>>;
        for (const dep of deps) {
          if (typeof dep === 'string') {
            // Simple format: "slug" or "slug@version"
            const [slug, version = '*'] = dep.split('@');
            dependencies.push({ slug, version });
          } else {
            // Object format: { slug: "name", version: "1.0.0", optional: true }
            const optionalValue = dep['optional'];
            const isOptional = typeof optionalValue === 'string' 
              ? optionalValue === 'true' 
              : optionalValue === true;
            dependencies.push({
              slug: dep['slug'] || dep['name'] || 'unknown',
              version: dep['version'] || '*',
              optional: isOptional,
              reason: dep['reason'],
            });
          }
        }
      }

      // Extract required tools
      const requiredTools: string[] = [];
      if (frontmatter['tools']) {
        requiredTools.push(...(frontmatter['tools'] as string[]));
      }
      if (frontmatter['requiredTools']) {
        requiredTools.push(...(frontmatter['requiredTools'] as string[]));
      }

      // Extract config schema
      let configSchema: ConfigSchema | undefined;
      if (frontmatter['config']) {
        const config = frontmatter['config'] as Record<string, unknown>;
        configSchema = {
          schema: (config['schema'] as Record<string, unknown>) || {},
          defaults: (config['defaults'] as Record<string, unknown>) || {},
          requiredEnv: (config['requiredEnv'] as string[]) || [],
          stateDirs: (config['stateDirs'] as string[]) || [],
          example: config['example'] as string,
        };
      }

      // Derive slug from file path or frontmatter
      const slug = (frontmatter['slug'] as string) || 
        path.basename(dir);

      return {
        frontmatter: {
          name: frontmatter['name'] as string | undefined,
          description: frontmatter['description'] as string | undefined,
          version: frontmatter['version'] as string | undefined,
          author: frontmatter['author'] as string | undefined,
          tags: frontmatter['tags'] as string[] | undefined,
          metadata: frontmatter['metadata'] as Record<string, unknown> | undefined,
          ...frontmatter,
        },
        content: body,
        slug,
        files: files.filter(f => !f.startsWith('.')),
        dependencies,
        requiredTools,
        configSchema,
      };
    } catch (error) {
      throw new ClawhubError(
        'PARSE_ERROR',
        `Failed to parse SKILL.md at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find and parse all skills in a directory
   */
  async findSkills(directory: string): Promise<ParsedSkill[]> {
    const skills: ParsedSkill[] = [];

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = path.join(directory, entry.name);
        const skillFile = path.join(skillDir, 'SKILL.md');

        try {
          const skill = await this.parseSkillFile(skillFile);
          skills.push(skill);
        } catch {
          // Not a skill directory, skip
          logger.debug(`[SkillInstaller] No SKILL.md found in ${skillDir}`);
        }
      }
    } catch (error) {
      logger.warn(`[SkillInstaller] Failed to scan directory ${directory}:`, { error: String(error) });
    }

    return skills;
  }

  // ============================================================================
  // Dependency Resolution
  // ============================================================================

  /**
   * Resolve dependencies for a skill
   */
  async resolveDependencies(
    skill: ParsedSkill,
    context: InstallContext = {
      installing: new Set(),
      installed: new Map(),
      errors: [],
      warnings: [],
    }
  ): Promise<DependencyResolution> {
    logger.info(`[SkillInstaller] Resolving dependencies for ${skill.slug}`);

    const tree: DependencyNode[] = [];
    const missing: string[] = [];
    const conflicts: DependencyConflict[] = [];

    // Check for circular dependencies
    if (context.installing.has(skill.slug)) {
      throw new DependencyError(skill.slug, skill.slug, 'Circular dependency detected');
    }

    context.installing.add(skill.slug);

    try {
      for (const dep of skill.dependencies || []) {
        const resolution = await this.resolveDependency(dep, context);

        if (resolution.found) {
          tree.push({
            slug: dep.slug,
            version: resolution.version!,
            optional: dep.optional || false,
            children: resolution.children,
          });
        } else {
          if (!dep.optional) {
            missing.push(dep.slug);
            context.errors.push(`Missing required dependency: ${dep.slug}`);
          } else {
            context.warnings.push(`Optional dependency not found: ${dep.slug}`);
          }
        }
      }
    } finally {
      context.installing.delete(skill.slug);
    }

    return { tree, missing, conflicts };
  }

  /**
   * Resolve a single dependency
   */
  private async resolveDependency(
    dependency: SkillDependency,
    context: InstallContext
  ): Promise<{
    found: boolean;
    version?: string;
    children: DependencyNode[];
  }> {
    // Check if already being installed (cycle detection)
    if (context.installing.has(dependency.slug)) {
      logger.warn(`[SkillInstaller] Circular dependency detected: ${dependency.slug}`);
      return { found: true, version: dependency.version, children: [] };
    }

    // Check if already installed in this session
    if (context.installed.has(dependency.slug)) {
      return {
        found: true,
        version: context.installed.get(dependency.slug),
        children: [],
      };
    }

    // Check if already installed locally
    const localCheck = await this.client.isInstalled(dependency.slug);
    if (localCheck.installed) {
      context.installed.set(dependency.slug, localCheck.version!);
      
      // Recursively resolve its dependencies
      const skillDir = path.join(this.skillsDir, dependency.slug);
      const skillFile = path.join(skillDir, 'SKILL.md');
      
      try {
        const depSkill = await this.parseSkillFile(skillFile);
        const subResolution = await this.resolveDependencies(depSkill, context);
        return {
          found: true,
          version: localCheck.version,
          children: subResolution.tree,
        };
      } catch {
        return { found: true, version: localCheck.version, children: [] };
      }
    }

    // Try to fetch from registry
    try {
      const metadata = await this.client.fetchSkill(dependency.slug);
      
      // Check version compatibility
      // For now, accept any version (implement semver matching later)
      context.installed.set(dependency.slug, metadata.version);

      return {
        found: true,
        version: metadata.version,
        children: [],
      };
    } catch (error) {
      if (error instanceof ClawhubError && error.code === 'SKILL_NOT_FOUND') {
        return { found: false, children: [] };
      }
      throw error;
    }
  }

  /**
   * Install missing dependencies
   */
  async installDependencies(
    dependencies: SkillDependency[],
    context: InstallContext
  ): Promise<string[]> {
    const installed: string[] = [];

    for (const dep of dependencies) {
      if (context.installed.has(dep.slug)) {
        installed.push(`${dep.slug}@${context.installed.get(dep.slug)}`);
        continue;
      }

      if (context.installing.has(dep.slug)) {
        continue; // Already being installed
      }

      try {
        const result = await this.client.install(dep.slug, {
          version: dep.version !== '*' ? dep.version : undefined,
          installDependencies: true,
        });

        if (result.success) {
          installed.push(`${dep.slug}@${result.version}`);
          context.installed.set(dep.slug, result.version);
        } else if (!dep.optional) {
          throw new DependencyError(dep.slug, dep.slug, 'Installation failed');
        }
      } catch (error) {
        if (!dep.optional) {
          throw error;
        }
        context.warnings.push(`Optional dependency ${dep.slug} failed to install`);
      }
    }

    return installed;
  }

  // ============================================================================
  // Skill Activation/Deactivation
  // ============================================================================

  /**
   * Activate a skill
   */
  async activate(
    slug: string,
    options: ActivationOptions = {}
  ): Promise<SkillActivationResult> {
    logger.info(`[SkillInstaller] Activating skill: ${slug}`);

    // Check current state
    const currentState = this.skillStates.get(slug);
    if (currentState === 'active' || currentState === 'activating') {
      return {
        slug,
        state: currentState,
        success: true,
      };
    }

    this.skillStates.set(slug, 'activating');

    try {
      // Find skill directory
      const skillDir = path.join(this.skillsDir, slug);
      const skillFile = path.join(skillDir, 'SKILL.md');

      // Parse SKILL.md
      const parsedSkill = await this.parseSkillFile(skillFile);

      // Validate configuration
      if (!options.skipValidation && parsedSkill.configSchema) {
        const config = (options.config || {}) as Record<string, unknown>;
        this.validateConfig(parsedSkill.configSchema, config);
      }

      // Check required tools
      if (parsedSkill.requiredTools?.length) {
        for (const tool of parsedSkill.requiredTools) {
          // In production, check if tool is available in OpenClaw
          logger.debug(`[SkillInstaller] Skill ${slug} requires tool: ${tool}`);
        }
      }

      // Activate dependencies first
      if (!options.skipDependencies && parsedSkill.dependencies?.length) {
        for (const dep of parsedSkill.dependencies) {
          if (!dep.optional) {
            await this.activate(dep.slug, { ...options, skipDependencies: true });
          }
        }
      }

      // Load configuration
      const config = {
        ...parsedSkill.configSchema?.defaults,
        ...options.config,
      };

      // Mark as active
      this.skillStates.set(slug, 'active');

      const installedSkill: InstalledSkill = {
        slug,
        name: parsedSkill.frontmatter.name || slug,
        description: parsedSkill.frontmatter.description || '',
        author: { id: 'local', username: parsedSkill.frontmatter.author || 'unknown' },
        version: parsedSkill.frontmatter.version || '0.0.0',
        tags: parsedSkill.frontmatter.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        downloads: 0,
        stars: 0,
        status: 'active',
        installPath: skillDir,
        activationState: 'active',
        parsedSkill,
        config,
      };

      this.activeSkills.set(slug, installedSkill);

      logger.info(`[SkillInstaller] Skill ${slug} activated successfully`);

      return {
        slug,
        state: 'active',
        success: true,
        config,
        tools: parsedSkill.requiredTools,
      };
    } catch (error) {
      this.skillStates.set(slug, 'error');
      
      return {
        slug,
        state: 'error',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Deactivate a skill
   */
  async deactivate(slug: string): Promise<SkillActivationResult> {
    logger.info(`[SkillInstaller] Deactivating skill: ${slug}`);

    const currentState = this.skillStates.get(slug);
    if (currentState === 'inactive' || currentState === 'deactivating') {
      return {
        slug,
        state: currentState || 'inactive',
        success: true,
      };
    }

    this.skillStates.set(slug, 'deactivating');

    try {
      // Remove from active skills
      this.activeSkills.delete(slug);
      this.skillStates.set(slug, 'inactive');

      logger.info(`[SkillInstaller] Skill ${slug} deactivated`);

      return {
        slug,
        state: 'inactive',
        success: true,
      };
    } catch (error) {
      this.skillStates.set(slug, 'error');
      
      return {
        slug,
        state: 'error',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get activation state of a skill
   */
  getActivationState(slug: string): SkillActivationState {
    return this.skillStates.get(slug) || 'inactive';
  }

  /**
   * Check if a skill is active
   */
  isActive(slug: string): boolean {
    return this.skillStates.get(slug) === 'active';
  }

  /**
   * Get all active skills
   */
  getActiveSkills(): InstalledSkill[] {
    return Array.from(this.activeSkills.values());
  }

  // ============================================================================
  // Workspace Integration
  // ============================================================================

  /**
   * Integrate skill into workspace
   */
  async integrate(slug: string): Promise<void> {
    logger.info(`[SkillInstaller] Integrating skill ${slug} into workspace`);

    const skillDir = path.join(this.skillsDir, slug);
    
    // Ensure skill is activated
    if (!this.isActive(slug)) {
      await this.activate(slug);
    }

    // Create workspace integration files if needed
    // This could include:
    // - Symlinks for easy access
    // - Environment variable setup
    // - Configuration file updates

    logger.info(`[SkillInstaller] Skill ${slug} integrated into workspace`);
  }

  /**
   * Remove skill from workspace
   */
  async unintegrate(slug: string): Promise<void> {
    logger.info(`[SkillInstaller] Removing skill ${slug} from workspace`);

    // Deactivate first
    if (this.isActive(slug)) {
      await this.deactivate(slug);
    }

    logger.info(`[SkillInstaller] Skill ${slug} removed from workspace`);
  }

  /**
   * Load all skills from the skills directory and activate them
   */
  async loadAllSkills(): Promise<InstalledSkill[]> {
    logger.info(`[SkillInstaller] Loading all skills from ${this.skillsDir}`);

    const skills = await this.findSkills(this.skillsDir);
    const activated: InstalledSkill[] = [];

    for (const skill of skills) {
      try {
        const result = await this.activate(skill.slug);
        if (result.success) {
          const installed = this.activeSkills.get(skill.slug);
          if (installed) {
            activated.push(installed);
          }
        }
      } catch (error) {
        logger.error(`[SkillInstaller] Failed to activate ${skill.slug}:`, { error: String(error) });
      }
    }

    logger.info(`[SkillInstaller] Loaded ${activated.length}/${skills.length} skills`);
    return activated;
  }

  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Validate configuration against schema
   */
  private validateConfig(schema: ConfigSchema, config: Record<string, unknown>): void {
    // Check required environment variables
    for (const envVar of schema.requiredEnv || []) {
      if (!process.env[envVar]) {
        throw new ClawhubError(
          'CONFIG_ERROR',
          `Required environment variable not set: ${envVar}`
        );
      }
    }

    // Check required state directories exist
    for (const dir of schema.stateDirs || []) {
      // In production, verify these directories exist
      logger.debug(`[SkillInstaller] Skill requires state directory: ${dir}`);
    }

    // TODO: Implement full JSON Schema validation
  }

  /**
   * Validate a skill before installation
   */
  async validateSkill(slug: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const metadata = await this.client.fetchSkill(slug);

      // Basic validation
      if (!metadata.name) {
        errors.push('Skill is missing name');
      }

      if (!metadata.description) {
        errors.push('Skill is missing description');
      }

      if (metadata.status === 'deleted' || metadata.status === 'hidden') {
        errors.push(`Skill status is ${metadata.status}`);
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(`Failed to fetch skill: ${error instanceof Error ? error.message : String(error)}`);
      return { valid: false, errors };
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalInstaller: SkillInstaller | null = null;

export function getGlobalSkillInstaller(client?: ClawHubClient): SkillInstaller {
  if (!globalInstaller) {
    if (!client) {
      throw new Error('SkillInstaller requires ClawHubClient on first initialization');
    }
    globalInstaller = new SkillInstaller(client);
  }
  return globalInstaller;
}

export function resetGlobalSkillInstaller(): void {
  globalInstaller = null;
}

export default SkillInstaller;
