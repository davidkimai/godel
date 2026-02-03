/**
 * Unified Skill Types
 *
 * Type definitions for the unified skill registry supporting both
 * ClawHub and Vercel skills sources.
 */
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
/** Skill activation state */
export type SkillActivationState = 'inactive' | 'activating' | 'active' | 'deactivating' | 'error';
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
export declare const DEFAULT_UNIFIED_REGISTRY_CONFIG: UnifiedRegistryConfig;
/** Unified skill error codes */
export type UnifiedSkillErrorCode = 'SKILL_NOT_FOUND' | 'SKILL_ALREADY_INSTALLED' | 'VERSION_NOT_FOUND' | 'DOWNLOAD_FAILED' | 'PARSE_ERROR' | 'DEPENDENCY_ERROR' | 'CONFIG_ERROR' | 'NETWORK_ERROR' | 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'ACTIVATION_ERROR' | 'SOURCE_NOT_AVAILABLE' | 'AMBIGUOUS_SKILL';
/**
 * Unified skill error class
 */
export declare class UnifiedSkillError extends Error {
    code: UnifiedSkillErrorCode;
    details?: unknown;
    constructor(code: UnifiedSkillErrorCode, message: string, details?: unknown);
}
/**
 * Skill not found error
 */
export declare class SkillNotFoundError extends UnifiedSkillError {
    slug: string;
    source?: SkillSource;
    constructor(slug: string, source?: SkillSource);
}
/**
 * Skill already installed error
 */
export declare class SkillAlreadyInstalledError extends UnifiedSkillError {
    id: string;
    installedVersion: string;
    constructor(id: string, installedVersion: string);
}
/**
 * Source not available error
 */
export declare class SourceNotAvailableError extends UnifiedSkillError {
    source: SkillSource;
    constructor(source: SkillSource);
}
/**
 * Ambiguous skill error - when multiple sources have the same slug
 */
export declare class AmbiguousSkillError extends UnifiedSkillError {
    slug: string;
    sources: SkillSource[];
    constructor(slug: string, sources: SkillSource[]);
}
//# sourceMappingURL=types.d.ts.map