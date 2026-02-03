/**
 * Unified Skill Registry
 *
 * Combines ClawHub and Vercel skills sources into a single interface.
 * Provides cross-registry skill discovery and management.
 */
import { UnifiedSkillMetadata, UnifiedSearchParams, UnifiedSearchResult, UnifiedInstallOptions, UnifiedInstallResult, UnifiedInstalledSkill, SkillSource, SkillSourceInfo, UnifiedRegistryConfig } from './types';
export declare class UnifiedSkillRegistry {
    private config;
    private clawhub;
    private vercel;
    private cache;
    constructor(config?: Partial<UnifiedRegistryConfig>);
    /**
     * Get current configuration
     */
    getConfig(): UnifiedRegistryConfig;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<UnifiedRegistryConfig>): void;
    /**
     * Get available skill sources
     */
    getSources(): SkillSourceInfo[];
    /**
     * Get skills directory path
     */
    getSkillsDirectory(): string;
    /**
     * Search across all enabled skill sources
     */
    search(params: UnifiedSearchParams): Promise<UnifiedSearchResult>;
    /**
     * Fetch skill metadata from any source
     * Supports 'source:slug' format for disambiguation
     */
    fetchSkill(skillId: string): Promise<UnifiedSkillMetadata>;
    /**
     * Install a skill from any source
     * Supports 'source:slug' format for disambiguation
     */
    install(skillId: string, options?: UnifiedInstallOptions): Promise<UnifiedInstallResult>;
    /**
     * Install from a specific source
     */
    private installFromSource;
    /**
     * Uninstall a skill
     * Supports 'source:slug' format
     */
    uninstall(skillId: string): Promise<void>;
    /**
     * Update a skill
     * Supports 'source:slug' format
     */
    update(skillId: string, options?: UnifiedInstallOptions): Promise<UnifiedInstallResult>;
    /**
     * Check if a skill is installed
     */
    isInstalled(skillId: string): Promise<{
        installed: boolean;
        version?: string;
        source?: SkillSource;
    }>;
    /**
     * List all installed skills across all sources
     */
    listInstalled(): Promise<UnifiedInstalledSkill[]>;
    private getUnifiedLockfilePath;
    private loadUnifiedLockfile;
    private saveUnifiedLockfile;
    private addToUnifiedLockfile;
    private removeFromUnifiedLockfile;
    /**
     * Parse a skill ID that may include source prefix
     * Formats: "clawhub:postgres-backup" or just "postgres-backup"
     */
    private parseSkillId;
    /**
     * Check if a source is enabled
     */
    private isSourceEnabled;
    /**
     * Get list of enabled sources
     */
    private getEnabledSources;
    /**
     * Find which sources have a particular skill
     */
    private findSkillInSources;
    /**
     * Clear search cache
     */
    clearCache(): void;
}
export declare function getGlobalSkillRegistry(config?: Partial<UnifiedRegistryConfig>): UnifiedSkillRegistry;
export declare function resetGlobalSkillRegistry(): void;
export default UnifiedSkillRegistry;
//# sourceMappingURL=registry.d.ts.map