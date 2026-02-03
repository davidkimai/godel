/**
 * ClawHub Adapter
 *
 * Adapter that wraps the existing ClawHubClient to conform to the unified
 * skill registry interface.
 */
import { UnifiedSkillMetadata, UnifiedSearchParams, UnifiedSearchResult, UnifiedInstallOptions, UnifiedInstallResult, UnifiedInstalledSkill } from './types';
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
export declare const DEFAULT_CLAWHUB_ADAPTER_CONFIG: ClawHubAdapterConfig;
export declare class ClawHubAdapter {
    private client;
    private config;
    constructor(config?: Partial<ClawHubAdapterConfig>);
    /**
     * Get current configuration
     */
    getConfig(): ClawHubAdapterConfig;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<ClawHubAdapterConfig>): void;
    /**
     * Check if this source is enabled
     */
    isEnabled(): boolean;
    /**
     * Get skills directory path
     */
    getSkillsDirectory(): string;
    /**
     * Search for skills in ClawHub
     */
    search(params: UnifiedSearchParams): Promise<UnifiedSearchResult>;
    /**
     * Fetch skill metadata from ClawHub
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
     * Install a skill from ClawHub
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
    /**
     * Convert ClawHub metadata to unified format
     */
    private toUnifiedMetadata;
    /**
     * Convert ClawHub installed skill to unified format
     */
    private toUnifiedInstalledSkill;
}
export declare function getGlobalClawHubAdapter(config?: Partial<ClawHubAdapterConfig>): ClawHubAdapter;
export declare function resetGlobalClawHubAdapter(): void;
export default ClawHubAdapter;
//# sourceMappingURL=clawhub.d.ts.map