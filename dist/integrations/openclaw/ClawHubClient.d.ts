/**
 * ClawHub Client
 *
 * Client for interacting with the ClawHub skill registry.
 * Provides search, fetch metadata, download and install functionality.
 *
 * Based on OPENCLAW_INTEGRATION_SPEC.md section F4.1
 */
import { ClawhubClientConfig, SkillMetadata, SkillSearchParams, SkillSearchResult, SkillInstallOptions, SkillInstallResult, ClawhubLockfile, InstalledSkill } from './ClawHubTypes';
export declare class ClawHubClient {
    private config;
    private cache;
    private cacheTtl;
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
     * Requirements from SPEC F4.1:
     * - Search returns 100+ skills in < 2s
     * - Supports vector/semantic search
     * - Includes metadata for each skill
     */
    search(params: SkillSearchParams): Promise<SkillSearchResult>;
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