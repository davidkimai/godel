"use strict";
/**
 * ClawHub Adapter
 *
 * Adapter that wraps the existing ClawHubClient to conform to the unified
 * skill registry interface.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawHubAdapter = exports.DEFAULT_CLAWHUB_ADAPTER_CONFIG = void 0;
exports.getGlobalClawHubAdapter = getGlobalClawHubAdapter;
exports.resetGlobalClawHubAdapter = resetGlobalClawHubAdapter;
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
const ClawHubClient_1 = require("../integrations/openclaw/ClawHubClient");
const types_1 = require("./types");
exports.DEFAULT_CLAWHUB_ADAPTER_CONFIG = {
    registryUrl: process.env['CLAWHUB_REGISTRY'] || 'https://clawhub.ai',
    siteUrl: process.env['CLAWHUB_SITE'] || 'https://clawhub.ai',
    token: process.env['CLAWHUB_TOKEN'],
    workdir: process.cwd(),
    skillsDir: 'skills',
    timeout: 30000,
    enabled: true,
};
// ============================================================================
// ClawHub Adapter
// ============================================================================
class ClawHubAdapter {
    constructor(config) {
        this.config = { ...exports.DEFAULT_CLAWHUB_ADAPTER_CONFIG, ...config };
        // Create or get global ClawHub client
        this.client = (0, ClawHubClient_1.getGlobalClawHubClient)({
            registryUrl: this.config.registryUrl,
            siteUrl: this.config.siteUrl,
            token: this.config.token,
            workdir: this.config.workdir,
            skillsDir: this.config.skillsDir,
            timeout: this.config.timeout,
        });
        logger_1.logger.info(`[ClawHubAdapter] Initialized with registry: ${this.config.registryUrl}`);
    }
    // ============================================================================
    // Configuration
    // ============================================================================
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        this.client.updateConfig({
            registryUrl: this.config.registryUrl,
            siteUrl: this.config.siteUrl,
            token: this.config.token,
            workdir: this.config.workdir,
            skillsDir: this.config.skillsDir,
            timeout: this.config.timeout,
        });
        logger_1.logger.debug('[ClawHubAdapter] Configuration updated');
    }
    /**
     * Check if this source is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
    /**
     * Get skills directory path
     */
    getSkillsDirectory() {
        return path.join(path.resolve(this.config.workdir, this.config.skillsDir), 'clawhub');
    }
    // ============================================================================
    // Search
    // ============================================================================
    /**
     * Search for skills in ClawHub
     */
    async search(params) {
        const startTime = Date.now();
        logger_1.logger.debug(`[ClawHubAdapter] Searching for: ${params.query}`);
        try {
            // Convert unified params to ClawHub params
            const clawhubParams = {
                query: params.query,
                limit: params.limit,
                offset: params.offset,
                tags: params.tags,
                author: params.author,
                sort: params.sort,
                includeHidden: params.includeHidden,
            };
            const result = await this.client.search(clawhubParams);
            // Convert results to unified format
            const unifiedSkills = result.skills.map(skill => this.toUnifiedMetadata(skill));
            return {
                skills: unifiedSkills,
                total: result.total,
                offset: result.offset,
                limit: result.limit,
                queryTimeMs: result.queryTimeMs || Date.now() - startTime,
                bySource: {
                    clawhub: {
                        skills: unifiedSkills,
                        total: result.total,
                    },
                    vercel: {
                        skills: [],
                        total: 0,
                    },
                },
            };
        }
        catch (error) {
            logger_1.logger.error('[ClawHubAdapter] Search failed:', error);
            throw new types_1.UnifiedSkillError('NETWORK_ERROR', `Failed to search ClawHub: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // ============================================================================
    // Fetch Metadata
    // ============================================================================
    /**
     * Fetch skill metadata from ClawHub
     */
    async fetchSkill(slug) {
        logger_1.logger.debug(`[ClawHubAdapter] Fetching skill: ${slug}`);
        try {
            const metadata = await this.client.fetchSkill(slug);
            return this.toUnifiedMetadata(metadata);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                throw new types_1.SkillNotFoundError(slug, 'clawhub');
            }
            logger_1.logger.error(`[ClawHubAdapter] Failed to fetch skill ${slug}:`, error);
            throw new types_1.UnifiedSkillError('NETWORK_ERROR', `Failed to fetch skill ${slug}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // ============================================================================
    // Installation
    // ============================================================================
    /**
     * Check if a skill is installed
     */
    async isInstalled(slug) {
        return this.client.isInstalled(slug);
    }
    /**
     * Install a skill from ClawHub
     */
    async install(slug, options = {}) {
        logger_1.logger.info(`[ClawHubAdapter] Installing ${slug}`);
        try {
            // Convert unified options to ClawHub options
            const clawhubOptions = {
                version: options.version,
                force: options.force,
                targetDir: options.targetDir,
                installDependencies: options.installDependencies,
                skipDependencies: options.skipDependencies,
                noInput: options.noInput,
                config: options.config,
            };
            const result = await this.client.install(slug, clawhubOptions);
            if (result.success && result.skill) {
                return {
                    success: true,
                    skill: this.toUnifiedMetadata(result.skill),
                    installPath: result.installPath || '',
                    version: result.version,
                    source: 'clawhub',
                    installedDependencies: result.installedDependencies,
                    warnings: result.warnings,
                };
            }
            else {
                return {
                    success: false,
                    version: options.version || 'unknown',
                    source: 'clawhub',
                    errors: result.errors || ['Installation failed'],
                    warnings: result.warnings,
                };
            }
        }
        catch (error) {
            logger_1.logger.error(`[ClawHubAdapter] Installation failed for ${slug}:`, error);
            return {
                success: false,
                version: options.version || 'unknown',
                source: 'clawhub',
                errors: [error instanceof Error ? error.message : String(error)],
            };
        }
    }
    /**
     * Uninstall a skill
     */
    async uninstall(slug) {
        logger_1.logger.info(`[ClawHubAdapter] Uninstalling ${slug}`);
        await this.client.uninstall(slug);
    }
    /**
     * List installed skills
     */
    async listInstalled() {
        const installed = await this.client.listInstalled();
        return installed.map(skill => this.toUnifiedInstalledSkill(skill));
    }
    // ============================================================================
    // Converters
    // ============================================================================
    /**
     * Convert ClawHub metadata to unified format
     */
    toUnifiedMetadata(skill) {
        return {
            id: `clawhub:${skill.slug}`,
            source: 'clawhub',
            slug: skill.slug,
            name: skill.name,
            description: skill.description,
            readme: skill.readme,
            author: skill.author,
            version: skill.version,
            versions: skill.versions,
            tags: skill.tags,
            createdAt: skill.createdAt,
            updatedAt: skill.updatedAt,
            downloads: skill.downloads,
            stars: skill.stars,
            status: skill.status,
            contentHash: skill.contentHash,
            downloadUrl: skill.downloadUrl,
            size: skill.size,
            sourceMetadata: skill.metadata,
        };
    }
    /**
     * Convert ClawHub installed skill to unified format
     */
    toUnifiedInstalledSkill(skill) {
        return {
            ...this.toUnifiedMetadata(skill),
            installPath: skill.installPath,
            activationState: skill.activationState,
            config: skill.config,
            resolvedDependencies: skill.resolvedDependencies,
            missingDependencies: skill.missingDependencies,
        };
    }
}
exports.ClawHubAdapter = ClawHubAdapter;
// ============================================================================
// Singleton
// ============================================================================
let globalAdapter = null;
function getGlobalClawHubAdapter(config) {
    if (!globalAdapter) {
        globalAdapter = new ClawHubAdapter(config);
    }
    else if (config) {
        globalAdapter.updateConfig(config);
    }
    return globalAdapter;
}
function resetGlobalClawHubAdapter() {
    globalAdapter = null;
}
exports.default = ClawHubAdapter;
//# sourceMappingURL=clawhub.js.map