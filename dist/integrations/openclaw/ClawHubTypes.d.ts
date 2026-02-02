/**
 * ClawHub Integration Types
 *
 * Type definitions for ClawHub skill registry integration
 * Based on OpenClaw documentation and OPENCLAW_INTEGRATION_SPEC.md section F4.1
 */
/**
 * Skill metadata as returned by ClawHub API
 */
export interface SkillMetadata {
    /** Unique skill slug (e.g., "postgres-backup") */
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
    /** Download count */
    downloads: number;
    /** Star count */
    stars: number;
    /** Skill status */
    status: 'active' | 'hidden' | 'deprecated' | 'deleted';
    /** Moderation status */
    moderationStatus?: 'approved' | 'pending' | 'reported';
    /** Content hash for integrity verification */
    contentHash?: string;
    /** Download URL for the skill bundle */
    downloadUrl?: string;
    /** Size of the skill bundle in bytes */
    size?: number;
    /** Additional metadata from SKILL.md frontmatter */
    metadata?: Record<string, unknown>;
}
/**
 * Parsed SKILL.md content
 */
export interface ParsedSkill {
    /** Frontmatter metadata */
    frontmatter: {
        name?: string;
        description?: string;
        version?: string;
        author?: string;
        tags?: string[];
        metadata?: Record<string, unknown>;
        [key: string]: unknown;
    };
    /** Main skill content (markdown) */
    content: string;
    /** Skill slug derived from file path or frontmatter */
    slug: string;
    /** List of files in the skill bundle */
    files: string[];
    /** Dependencies on other skills */
    dependencies?: SkillDependency[];
    /** Required tools for this skill */
    requiredTools?: string[];
    /** Configuration schema */
    configSchema?: ConfigSchema;
}
/**
 * Skill dependency declaration
 */
export interface SkillDependency {
    /** Slug of the dependent skill */
    slug: string;
    /** Version constraint (semver range) */
    version: string;
    /** Whether this is optional */
    optional?: boolean;
    /** Reason for dependency */
    reason?: string;
}
/**
 * Configuration schema for skill configuration
 */
export interface ConfigSchema {
    /** JSON Schema for validation */
    schema: Record<string, unknown>;
    /** Default values */
    defaults?: Record<string, unknown>;
    /** Required environment variables */
    requiredEnv?: string[];
    /** Required state directories */
    stateDirs?: string[];
    /** Example configuration */
    example?: string;
}
/**
 * Search parameters for ClawHub
 */
export interface SkillSearchParams {
    /** Search query (supports vector/semantic search) */
    query: string;
    /** Maximum results to return */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
    /** Filter by tags */
    tags?: string[];
    /** Filter by author */
    author?: string;
    /** Sort order */
    sort?: 'relevance' | 'downloads' | 'stars' | 'recent';
    /** Include hidden/deprecated skills */
    includeHidden?: boolean;
}
/**
 * Search result from ClawHub
 */
export interface SkillSearchResult {
    /** Matching skills */
    skills: SkillMetadata[];
    /** Total matches */
    total: number;
    /** Current offset */
    offset: number;
    /** Limit used */
    limit: number;
    /** Query time in milliseconds */
    queryTimeMs: number;
    /** Whether results are from cache */
    fromCache?: boolean;
}
/**
 * Installation options for skills
 */
export interface SkillInstallOptions {
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
}
/**
 * Installation result
 */
export interface SkillInstallResult {
    /** Whether installation succeeded */
    success: boolean;
    /** Installed skill metadata */
    skill?: SkillMetadata;
    /** Path where skill was installed */
    installPath?: string;
    /** Installed version */
    version: string;
    /** Installed dependencies */
    installedDependencies?: string[];
    /** Errors during installation */
    errors?: string[];
    /** Warnings during installation */
    warnings?: string[];
}
/**
 * Lockfile entry for installed skill
 */
export interface LockfileEntry {
    /** Skill slug */
    slug: string;
    /** Installed version */
    version: string;
    /** Content hash for integrity */
    contentHash: string;
    /** Installation timestamp */
    installedAt: string;
    /** Source registry URL */
    registry: string;
    /** Installation path */
    path: string;
    /** Dependencies installed */
    dependencies: string[];
    /** Custom configuration applied */
    config?: Record<string, unknown>;
}
/**
 * ClawHub lockfile structure
 */
export interface ClawhubLockfile {
    /** Lockfile version */
    version: string;
    /** Registry URL */
    registry: string;
    /** Last sync timestamp */
    lastSync?: string;
    /** Installed skills */
    skills: LockfileEntry[];
    /** Installation metadata */
    metadata?: {
        workdir: string;
        skillsDir: string;
    };
}
/**
 * Skill activation state
 */
export type SkillActivationState = 'inactive' | 'activating' | 'active' | 'deactivating' | 'error';
/**
 * Skill activation result
 */
export interface SkillActivationResult {
    /** Skill slug */
    slug: string;
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
export interface InstalledSkill extends SkillMetadata {
    /** Installation path */
    installPath: string;
    /** Activation state */
    activationState: SkillActivationState;
    /** Parsed SKILL.md content */
    parsedSkill?: ParsedSkill;
    /** Current configuration */
    config?: Record<string, unknown>;
    /** Dependencies that are installed */
    resolvedDependencies?: string[];
    /** Missing dependencies */
    missingDependencies?: string[];
}
/**
 * ClawHub API client configuration
 */
export interface ClawhubClientConfig {
    /** Registry API base URL */
    registryUrl: string;
    /** Site URL for browser operations */
    siteUrl?: string;
    /** Authentication token */
    token?: string;
    /** Working directory */
    workdir: string;
    /** Skills directory (relative to workdir) */
    skillsDir: string;
    /** Request timeout in milliseconds */
    timeout: number;
}
/**
 * Default ClawHub configuration
 * Registry URL can be discovered from /.well-known/clawdhub.json on the site
 * Per https://www.npmjs.com/package/clawdhub docs
 */
export declare const DEFAULT_CLAWHUB_CONFIG: ClawhubClientConfig;
/**
 * ClawHub-specific error codes
 */
export type ClawhubErrorCode = 'SKILL_NOT_FOUND' | 'SKILL_ALREADY_INSTALLED' | 'VERSION_NOT_FOUND' | 'DOWNLOAD_FAILED' | 'PARSE_ERROR' | 'DEPENDENCY_ERROR' | 'CONFIG_ERROR' | 'NETWORK_ERROR' | 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'ACTIVATION_ERROR';
/**
 * ClawHub error class
 */
export declare class ClawhubError extends Error {
    code: ClawhubErrorCode;
    details?: unknown;
    constructor(code: ClawhubErrorCode, message: string, details?: unknown);
}
/**
 * Skill not found error
 */
export declare class SkillNotFoundError extends ClawhubError {
    slug: string;
    constructor(slug: string);
}
/**
 * Skill already installed error
 */
export declare class SkillAlreadyInstalledError extends ClawhubError {
    slug: string;
    installedVersion: string;
    constructor(slug: string, installedVersion: string);
}
/**
 * Version not found error
 */
export declare class VersionNotFoundError extends ClawhubError {
    slug: string;
    version: string;
    availableVersions?: string[];
    constructor(slug: string, version: string, availableVersions?: string[]);
}
/**
 * Dependency resolution error
 */
export declare class DependencyError extends ClawhubError {
    skill: string;
    dependency: string;
    reason: string;
    constructor(skill: string, dependency: string, reason: string);
}
//# sourceMappingURL=ClawHubTypes.d.ts.map