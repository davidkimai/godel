/**
 * ClawHub Client
 *
 * Client for interacting with the ClawHub skill registry.
 * Provides search, fetch metadata, download and install functionality.
 *
 * Updated to match ClawHub API v1 specification.
 * API Base: https://clawhub.ai/api/v1
 */
import { ClawhubClientConfig, SkillMetadata, SkillSearchParams, SkillSearchResult, SkillInstallOptions, SkillInstallResult, ClawhubLockfile, InstalledSkill } from './ClawHubTypes';
export declare class ClawHubClient {
    private config;
    private cache;
    private cacheTtl;
    private apiBase;
    constructor(config?: Partial<ClawhubClientConfig>);
    /**
     * Get current configuration
     */
    getConfig(): ClawhubClientConfig;
    /**
     * Update configuration
     */
    updateConfig(updates: Partial<ClawhubClientConfig>): void;
    /**
     * Get the full path to the skills directory
     */
    getSkillsDirectory(): string;
    /**
     * Get the full path to the lockfile
     */
    getLockfilePath(): string;
    /**
     * Search for skills in ClawHub
     *
     * Note: ClawHub API doesn't have a direct search endpoint, so we fetch
     * all skills and filter client-side. Results are cached for performance.
     */
    search(params: SkillSearchParams): Promise<SkillSearchResult>;
    /**
     * Fetch all skills from the API (handles pagination)
     */
    private fetchAllSkills;
    /**
     * Map ClawHub API skill to internal SkillMetadata format
     */
    private mapApiSkillToMetadata;
    /**
     * Return mock search results when API is unavailable
     */
    private getMockSearchResults;
    /**
     * Quick search with defaults
     */
    quickSearch(query: string, limit?: number): Promise<SkillMetadata[]>;
    /**
     * Fetch skill metadata by slug
     */
    fetchSkill(slug: string): Promise<SkillMetadata>;
    /**
     * Map ClawHub API skill detail to internal SkillMetadata format
     */
    private mapApiSkillDetailToMetadata;
    /**
     * Fetch skill versions
     */
    fetchVersions(slug: string): Promise<string[]>;
    /**
     * Fetch specific version of a skill
     */
    fetchSkillVersion(slug: string, version: string): Promise<SkillMetadata>;
    /**
     * Download skill bundle
     */
    downloadSkill(slug: string, version?: string): Promise<Buffer>;
    /**
     * Install a skill from ClawHub
     *
     * Requirements from SPEC F4.1:
     * - Install completes in < 10s
     * - Records installation in lockfile
     */
    install(slug: string, options?: SkillInstallOptions): Promise<SkillInstallResult>;
    /**
     * Install skill by fetching individual files
     * (Fallback when download bundle endpoint is not available)
     */
    private installFromFiles;
    /**
     * Uninstall a skill
     */
    uninstall(slug: string): Promise<void>;
    /**
     * List installed skills
     */
    listInstalled(): Promise<InstalledSkill[]>;
    /**
     * Check if a skill is installed
     */
    isInstalled(slug: string): Promise<{
        installed: boolean;
        version?: string;
    }>;
    /**
     * Read the lockfile
     */
    readLockfile(): Promise<ClawhubLockfile>;
    /**
     * Write the lockfile
     */
    writeLockfile(lockfile: ClawhubLockfile): Promise<void>;
    private getAuthHeaders;
    private fetchWithTimeout;
    private extractBundle;
}
export declare function getGlobalClawHubClient(config?: Partial<ClawhubClientConfig>): ClawHubClient;
export declare function resetGlobalClawHubClient(): void;
export default ClawHubClient;
//# sourceMappingURL=ClawHubClient.d.ts.map