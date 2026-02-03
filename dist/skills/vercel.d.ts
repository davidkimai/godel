/**
 * Vercel Skills Client
 *
 * Client for interacting with the Vercel skills ecosystem (skills.sh).
 * Provides search, fetch metadata, download and install functionality.
 *
 * Vercel skills are npm packages with AGENTS.md or SKILL.md files.
 */
import { UnifiedSkillMetadata, UnifiedSearchParams, UnifiedSearchResult, UnifiedInstallOptions, UnifiedInstallResult, UnifiedInstalledSkill } from './types';
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
export declare const DEFAULT_VERCEL_SKILLS_CONFIG: VercelSkillsConfig;
export declare class VercelSkillsClient {
    private config;
    private cache;
    private cacheTtl;
    constructor(config?: Partial<VercelSkillsConfig>);
    /**
     * Get current configuration
     */
    getConfig(): VercelSkillsConfig;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<VercelSkillsConfig>): void;
    /**
     * Check if this source is enabled
     */
    isEnabled(): boolean;
    /**
     * Get skills directory path
     */
    getSkillsDirectory(): string;
    /**
     * Search for skills on npm/skills.sh
     */
    search(params: UnifiedSearchParams): Promise<UnifiedSearchResult>;
    /**
     * Search npm registry
     */
    private searchNpm;
    /**
     * Search skills.sh directory
     */
    private searchSkillsSh;
    /**
     * Merge and deduplicate search results
     */
    private mergeSearchResults;
    /**
     * Fetch skill metadata from npm
     */
    fetchSkill(slug: string): Promise<UnifiedSkillMetadata>;
    /**
     * Check if a skill is installed
     */
    isInstalled(slug: string): Promise<{
        installed: boolean;
        version?: string;
    }>;
    /**
     * Install a skill from npm
     */
    install(slug: string, options?: UnifiedInstallOptions): Promise<UnifiedInstallResult>;
    /**
     * Uninstall a skill
     */
    uninstall(slug: string): Promise<void>;
    /**
     * List installed skills
     */
    listInstalled(): Promise<UnifiedInstalledSkill[]>;
    private getLockfilePath;
    private loadLockfile;
    private addToLockfile;
    private removeFromLockfile;
    /**
     * Convert npm package to unified metadata
     */
    private npmPackageToUnifiedMetadata;
    /**
     * Convert skills.sh entry to unified metadata
     */
    private skillsShToUnifiedMetadata;
    private fetchWithTimeout;
}
export declare function getGlobalVercelSkillsClient(config?: Partial<VercelSkillsConfig>): VercelSkillsClient;
export declare function resetGlobalVercelSkillsClient(): void;
export default VercelSkillsClient;
//# sourceMappingURL=vercel.d.ts.map