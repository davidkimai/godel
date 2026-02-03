/**
 * Unified Skill Types
 * 
 * Type definitions for the unified skill registry supporting both
 * ClawHub and Vercel skills sources.
 */

// ============================================================================
// Source Types
// ============================================================================

/** Skill source registry */
export type SkillSource = 'clawhub' | 'vercel';

/** Information about a skill source */
export interface SkillSourceInfo {
  id: SkillSource;
  name: string;
  description: string;
  url: string;
  enabled: boolean;
}

// ============================================================================
// Unified Skill Metadata
// ============================================================================

/**
 * Unified skill metadata - works across both ClawHub and Vercel
 */
export interface UnifiedSkillMetadata {
  /** Unique identifier (source:slug format) */
  id: string;
  /** Source registry */
  source: SkillSource;
  /** Skill slug */
  slug: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Full README content */
  readme?: string;
  /** Author information */
  author: {
    id: string;
    username: string;
    avatar?: string;
  };
  /** Semantic version */
  version: string;
  /** Available versions */
  versions?: string[];
  /** Tags for categorization */
  tags: string[];
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Download/install count */
  downloads: number;
  /** Star/count count */
  stars: number;
  /** Skill status */
  status: 'active' | 'hidden' | 'deprecated' | 'deleted';
  /** Content hash for integrity verification */
  contentHash?: string;
  /** Download URL for the skill bundle */
  downloadUrl?: string;
  /** Size of the skill bundle in bytes */
  size?: number;
  /** Source-specific metadata */
  sourceMetadata?: Record<string, unknown>;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Unified search parameters
 */
export interface UnifiedSearchParams {
  /** Search query */
  query: string;
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by tags */
  tags?: string[];
  /** Filter by author */
  author?: string;
  /** Filter by source(s) - if not specified, searches all */
  sources?: SkillSource[];
  /** Sort order */
  sort?: 'relevance' | 'downloads' | 'stars' | 'recent';
  /** Include hidden/deprecated skills */
  includeHidden?: boolean;
}

/**
 * Search result from unified registry
 */
export interface UnifiedSearchResult {
  /** Matching skills */
  skills: UnifiedSkillMetadata[];
  /** Total matches across all sources */
  total: number;
  /** Current offset */
  offset: number;
  /** Limit used */
  limit: number;
  /** Query time in milliseconds */
  queryTimeMs: number;
  /** Results grouped by source */
  bySource: Record<SkillSource, {
    skills: UnifiedSkillMetadata[];
    total: number;
  }>;
}

// ============================================================================
// Installation Types
// ============================================================================

/**
 * Unified installation options
 */
export interface UnifiedInstallOptions {
  /** Specific version to install (default: latest) */
  version?: string;
  /** Force reinstall if already exists */
  force?: boolean;
  /** Target directory (default: ./skills) */
  targetDir?: string;
  /** Install dependencies recursively */
  installDependencies?: boolean;
  /** Skip dependency installation */
  skipDependencies?: boolean;
  /** Skip configuration prompts */
  noInput?: boolean;
  /** Custom configuration values */
  config?: Record<string, unknown>;
  /** Preferred source (for ambiguous slugs) */
  preferredSource?: SkillSource;
}

/**
 * Unified installation result
 */
export interface UnifiedInstallResult {
  /** Whether installation succeeded */
  success: boolean;
  /** Installed skill metadata */
  skill?: UnifiedSkillMetadata;
  /** Path where skill was installed */
  installPath?: string;
  /** Installed version */
  version: string;
  /** Source of the installed skill */
  source: SkillSource;
  /** Installed dependencies */
  installedDependencies?: string[];
  /** Errors during installation */
  errors?: string[];
  /** Warnings during installation */
  warnings?: string[];
}

// ============================================================================
// Lockfile Types
// ============================================================================

/**
 * Unified lockfile entry for installed skill
 */
export interface UnifiedLockfileEntry {
  /** Skill ID (source:slug format) */
  id: string;
  /** Source registry */
  source: SkillSource;
  /** Skill slug */
  slug: string;
  /** Installed version */
  version: string;
  /** Content hash for integrity */
  contentHash: string;
  /** Installation timestamp */
  installedAt: string;
  /** Installation path */
  path: string;
  /** Dependencies installed */
  dependencies: string[];
  /** Custom configuration applied */
  config?: Record<string, unknown>;
}

/**
 * Unified lockfile structure
 */
export interface UnifiedLockfile {
  /** Lockfile version */
  version: string;
  /** Last sync timestamp */
  lastSync?: string;
  /** Installed skills */
  skills: UnifiedLockfileEntry[];
  /** Installation metadata */
  metadata?: {
    workdir: string;
    skillsDir: string;
  };
}

// ============================================================================
// Activation Types
// ============================================================================

/** Skill activation state */
export type SkillActivationState = 
  | 'inactive'
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'error';

/**
 * Skill activation result
 */
export interface UnifiedActivationResult {
  /** Skill ID */
  id: string;
  /** New activation state */
  state: SkillActivationState;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Loaded skill configuration */
  config?: Record<string, unknown>;
  /** Available tools provided by this skill */
  tools?: string[];
}

/**
 * Installed skill with runtime state
 */
export interface UnifiedInstalledSkill extends UnifiedSkillMetadata {
  /** Installation path */
  installPath: string;
  /** Activation state */
  activationState: SkillActivationState;
  /** Current configuration */
  config?: Record<string, unknown>;
  /** Dependencies that are installed */
  resolvedDependencies?: string[];
  /** Missing dependencies */
  missingDependencies?: string[];
}

// ============================================================================
// Registry Configuration
// ============================================================================

/**
 * Unified registry configuration
 */
export interface UnifiedRegistryConfig {
  /** Working directory */
  workdir: string;
  /** Skills directory (relative to workdir) */
  skillsDir: string;
  /** ClawHub configuration */
  clawhub?: {
    registryUrl: string;
    siteUrl?: string;
    token?: string;
    enabled: boolean;
  };
  /** Vercel skills configuration */
  vercel?: {
    registryUrl: string;
    npmRegistry?: string;
    enabled: boolean;
  };
  /** Request timeout in milliseconds */
  timeout: number;
  /** Cache TTL in milliseconds */
  cacheTtl: number;
}

/**
 * Default unified registry configuration
 */
export const DEFAULT_UNIFIED_REGISTRY_CONFIG: UnifiedRegistryConfig = {
  workdir: process.env['DASH_WORKDIR'] || process.cwd(),
  skillsDir: 'skills',
  timeout: 30000,
  cacheTtl: 5 * 60 * 1000, // 5 minutes
  clawhub: {
    registryUrl: process.env['CLAWHUB_REGISTRY'] || 'https://clawhub.ai',
    siteUrl: process.env['CLAWHUB_SITE'] || 'https://clawhub.ai',
    token: process.env['CLAWHUB_TOKEN'],
    enabled: true,
  },
  vercel: {
    registryUrl: process.env['VERCEL_SKILLS_REGISTRY'] || 'https://skills.sh',
    npmRegistry: process.env['NPM_REGISTRY'] || 'https://registry.npmjs.org',
    enabled: true,
  },
};

// ============================================================================
// Error Types
// ============================================================================

/** Unified skill error codes */
export type UnifiedSkillErrorCode =
  | 'SKILL_NOT_FOUND'
  | 'SKILL_ALREADY_INSTALLED'
  | 'VERSION_NOT_FOUND'
  | 'DOWNLOAD_FAILED'
  | 'PARSE_ERROR'
  | 'DEPENDENCY_ERROR'
  | 'CONFIG_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'ACTIVATION_ERROR'
  | 'SOURCE_NOT_AVAILABLE'
  | 'AMBIGUOUS_SKILL';

/**
 * Unified skill error class
 */
export class UnifiedSkillError extends Error {
  constructor(
    public code: UnifiedSkillErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'UnifiedSkillError';
  }
}

/**
 * Skill not found error
 */
export class SkillNotFoundError extends UnifiedSkillError {
  constructor(
    public slug: string,
    public source?: SkillSource
  ) {
    const sourceMsg = source ? ` in ${source}` : '';
    super('SKILL_NOT_FOUND', `Skill not found${sourceMsg}: ${slug}`, { slug, source });
    this.name = 'SkillNotFoundError';
  }
}

/**
 * Skill already installed error
 */
export class SkillAlreadyInstalledError extends UnifiedSkillError {
  constructor(
    public id: string,
    public installedVersion: string
  ) {
    super(
      'SKILL_ALREADY_INSTALLED',
      `Skill ${id}@${installedVersion} is already installed. Use --force to reinstall.`,
      { id, installedVersion }
    );
    this.name = 'SkillAlreadyInstalledError';
  }
}

/**
 * Source not available error
 */
export class SourceNotAvailableError extends UnifiedSkillError {
  constructor(public source: SkillSource) {
    super('SOURCE_NOT_AVAILABLE', `Skill source '${source}' is not available or enabled`);
    this.name = 'SourceNotAvailableError';
  }
}

/**
 * Ambiguous skill error - when multiple sources have the same slug
 */
export class AmbiguousSkillError extends UnifiedSkillError {
  constructor(
    public slug: string,
    public sources: SkillSource[]
  ) {
    super(
      'AMBIGUOUS_SKILL',
      `Multiple sources have skill '${slug}'. Specify source with 'source:slug' format: ${sources.map(s => `${s}:${slug}`).join(', ')}`,
      { slug, sources }
    );
    this.name = 'AmbiguousSkillError';
  }
}
