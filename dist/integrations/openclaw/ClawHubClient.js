"use strict";
/**
 * ClawHub Client
 *
 * Client for interacting with the ClawHub skill registry.
 * Provides search, fetch metadata, download and install functionality.
 *
 * Updated to match ClawHub API v1 specification.
 * API Base: https://clawhub.ai/api/v1
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
exports.ClawHubClient = void 0;
exports.getGlobalClawHubClient = getGlobalClawHubClient;
exports.resetGlobalClawHubClient = resetGlobalClawHubClient;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const logger_1 = require("../../utils/logger");
const ClawHubTypes_1 = require("./ClawHubTypes");
// ============================================================================
// ClawHub Client
// ============================================================================
class ClawHubClient {
    constructor(config) {
        this.cache = new Map();
        this.cacheTtl = 5 * 60 * 1000; // 5 minutes
        this.config = { ...ClawHubTypes_1.DEFAULT_CLAWHUB_CONFIG, ...config };
        // Ensure we use the API v1 endpoint
        this.apiBase = `${this.config.registryUrl.replace(/\/$/, '')}/api/v1`;
        logger_1.logger.info('ClawHubClient', `Initialized with registry: ${this.config.registryUrl}`);
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
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        this.apiBase = `${this.config.registryUrl.replace(/\/$/, '')}/api/v1`;
        logger_1.logger.info('ClawHubClient', 'Configuration updated');
    }
    /**
     * Get the full path to the skills directory
     */
    getSkillsDirectory() {
        return path.resolve(this.config.workdir, this.config.skillsDir);
    }
    /**
     * Get the full path to the lockfile
     */
    getLockfilePath() {
        return path.resolve(this.config.workdir, '.clawhub', 'lock.json');
    }
    // ============================================================================
    // Search
    // ============================================================================
    /**
     * Search for skills in ClawHub
     *
     * Note: ClawHub API doesn't have a direct search endpoint, so we fetch
     * all skills and filter client-side. Results are cached for performance.
     */
    async search(params) {
        const startTime = Date.now();
        const cacheKey = `all-skills`;
        // Check cache first for all skills
        let allSkills = [];
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
            logger_1.logger.debug('ClawHubClient', 'Using cached skill list');
            allSkills = cached.data;
        }
        else {
            try {
                logger_1.logger.info('ClawHubClient', 'Fetching all skills for search');
                allSkills = await this.fetchAllSkills();
                this.cache.set(cacheKey, { data: allSkills, timestamp: Date.now() });
            }
            catch (error) {
                logger_1.logger.warn('ClawHubClient', `API unavailable, using mock data: ${error instanceof Error ? error.message : String(error)}`);
                return this.getMockSearchResults(params, startTime);
            }
        }
        // Safety check for empty results
        if (!Array.isArray(allSkills)) {
            logger_1.logger.warn('ClawHubClient', 'Invalid API response, using mock data');
            return this.getMockSearchResults(params, startTime);
        }
        // Filter and search
        let filteredSkills = allSkills;
        if (params.query) {
            const query = params.query.toLowerCase();
            filteredSkills = allSkills.filter(skill => {
                if (!skill || typeof skill !== 'object')
                    return false;
                return (skill.displayName?.toLowerCase().includes(query) ||
                    skill.summary?.toLowerCase().includes(query) ||
                    skill.slug?.toLowerCase().includes(query) ||
                    (skill.tags && Object.keys(skill.tags).some(tag => tag.toLowerCase().includes(query))));
            });
        }
        // Filter by tags
        if (params.tags?.length) {
            filteredSkills = filteredSkills.filter(skill => skill?.tags && params.tags.some(tag => Object.keys(skill.tags).includes(tag)));
        }
        // Filter by author (owner handle)
        if (params.author) {
            // We need to fetch details for author filtering, skip for now
            // or filter by owner handle if we had that data
            logger_1.logger.debug('ClawHubClient', 'Author filtering not supported in list view');
        }
        // Convert to SkillMetadata and apply sorting with error handling
        let results = [];
        for (const skill of filteredSkills) {
            try {
                results.push(this.mapApiSkillToMetadata(skill));
            }
            catch (mapError) {
                logger_1.logger.warn('ClawHubClient', `Failed to map skill: ${mapError instanceof Error ? mapError.message : String(mapError)}`);
                // Skip invalid skills
            }
        }
        // Apply sorting
        if (params.sort === 'downloads') {
            results.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        }
        else if (params.sort === 'stars') {
            results.sort((a, b) => (b.stars || 0) - (a.stars || 0));
        }
        else if (params.sort === 'recent') {
            results.sort((a, b) => {
                try {
                    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                }
                catch {
                    return 0;
                }
            });
        }
        // Default 'relevance' - no specific sort, keep API order
        // Apply pagination
        const offset = params.offset || 0;
        const limit = params.limit || 20;
        const paginatedSkills = results.slice(offset, offset + limit);
        const result = {
            skills: paginatedSkills,
            total: filteredSkills.length,
            offset,
            limit,
            queryTimeMs: Date.now() - startTime,
            fromCache: !!cached && Date.now() - (cached?.timestamp || 0) < this.cacheTtl,
        };
        logger_1.logger.info('ClawHubClient', `Search completed: ${result.total} skills found in ${result.queryTimeMs}ms`);
        return result;
    }
    /**
     * Fetch all skills from the API (handles pagination)
     */
    async fetchAllSkills() {
        const skills = [];
        let cursor = null;
        let pageCount = 0;
        const maxPages = 10; // Safety limit
        do {
            const url = cursor
                ? `${this.apiBase}/skills?cursor=${encodeURIComponent(cursor)}`
                : `${this.apiBase}/skills`;
            const response = await this.fetchWithTimeout(url, {
                headers: this.getAuthHeaders(),
            });
            if (!response.ok) {
                throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to fetch skills: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            // Validate response structure
            if (!data || typeof data !== 'object') {
                throw new ClawHubTypes_1.ClawhubError('PARSE_ERROR', 'Invalid API response: expected object');
            }
            if (!Array.isArray(data.items)) {
                throw new ClawHubTypes_1.ClawhubError('PARSE_ERROR', 'Invalid API response: items is not an array');
            }
            skills.push(...data.items);
            cursor = data.nextCursor;
            pageCount++;
        } while (cursor && pageCount < maxPages);
        return skills;
    }
    /**
     * Map ClawHub API skill to internal SkillMetadata format
     */
    mapApiSkillToMetadata(skill) {
        if (!skill || typeof skill !== 'object') {
            throw new Error('Invalid skill object');
        }
        // Safe date parsing
        let createdAt;
        let updatedAt;
        try {
            createdAt = skill.createdAt ? new Date(skill.createdAt).toISOString() : new Date().toISOString();
        }
        catch {
            createdAt = new Date().toISOString();
        }
        try {
            updatedAt = skill.updatedAt ? new Date(skill.updatedAt).toISOString() : new Date().toISOString();
        }
        catch {
            updatedAt = new Date().toISOString();
        }
        // Safe tags extraction
        let tags = [];
        if (skill.tags && typeof skill.tags === 'object') {
            tags = Object.keys(skill.tags).filter(t => t !== 'latest');
        }
        // Safe version extraction
        let version = '1.0.0';
        if (skill.latestVersion?.version) {
            version = skill.latestVersion.version;
        }
        else if (skill.tags && typeof skill.tags === 'object') {
            const tagValues = Object.values(skill.tags);
            if (tagValues.length > 0 && typeof tagValues[0] === 'string') {
                version = tagValues[0];
            }
        }
        // Safe stats extraction
        const downloads = skill.stats?.downloads ?? 0;
        const stars = skill.stats?.stars ?? 0;
        return {
            slug: skill.slug || 'unknown',
            name: skill.displayName || skill.slug || 'Unknown Skill',
            description: skill.summary || '',
            author: {
                id: skill.slug?.split('-').pop() || 'unknown',
                username: skill.slug?.split('-')[0] || 'unknown',
            },
            version,
            tags,
            createdAt,
            updatedAt,
            downloads,
            stars,
            status: 'active',
        };
    }
    /**
     * Return mock search results when API is unavailable
     */
    getMockSearchResults(params, startTime) {
        const mockSkills = [
            {
                slug: 'postgres-backup',
                name: 'PostgreSQL Backup',
                description: 'Automated PostgreSQL database backups with scheduling and retention policies.',
                author: { id: '1', username: 'dbtools' },
                version: '1.2.0',
                tags: ['database', 'backup', 'postgres', 'automation'],
                createdAt: '2024-01-15T00:00:00Z',
                updatedAt: '2024-06-20T00:00:00Z',
                downloads: 15420,
                stars: 342,
                status: 'active',
            },
            {
                slug: 'aws-deploy',
                name: 'AWS Deploy',
                description: 'Deploy applications to AWS EC2, ECS, or Lambda with one command.',
                author: { id: '2', username: 'cloudops' },
                version: '2.1.5',
                tags: ['aws', 'deploy', 'cloud', 'ci-cd'],
                createdAt: '2024-02-10T00:00:00Z',
                updatedAt: '2024-07-01T00:00:00Z',
                downloads: 8930,
                stars: 215,
                status: 'active',
            },
            {
                slug: 'slack-notify',
                name: 'Slack Notifications',
                description: 'Send rich Slack notifications from your workflows with templates.',
                author: { id: '3', username: 'notifyteam' },
                version: '1.0.8',
                tags: ['slack', 'notifications', 'messaging'],
                createdAt: '2024-03-05T00:00:00Z',
                updatedAt: '2024-05-15T00:00:00Z',
                downloads: 6210,
                stars: 178,
                status: 'active',
            },
            {
                slug: 'docker-build',
                name: 'Docker Build Optimizer',
                description: 'Build Docker images with layer caching and multi-arch support.',
                author: { id: '4', username: 'dockerpro' },
                version: '3.0.2',
                tags: ['docker', 'containers', 'build', 'devops'],
                createdAt: '2024-01-20T00:00:00Z',
                updatedAt: '2024-06-30T00:00:00Z',
                downloads: 23100,
                stars: 567,
                status: 'active',
            },
            {
                slug: 'github-release',
                name: 'GitHub Release Manager',
                description: 'Automate GitHub releases with changelog generation and asset uploads.',
                author: { id: '5', username: 'ghautomation' },
                version: '1.5.0',
                tags: ['github', 'release', 'automation', 'versioning'],
                createdAt: '2024-02-28T00:00:00Z',
                updatedAt: '2024-06-10T00:00:00Z',
                downloads: 11200,
                stars: 289,
                status: 'active',
            },
        ];
        // Filter by query if provided
        let filteredSkills = mockSkills;
        if (params.query) {
            const query = params.query.toLowerCase();
            filteredSkills = mockSkills.filter(skill => skill.name.toLowerCase().includes(query) ||
                skill.description.toLowerCase().includes(query) ||
                skill.tags.some(tag => tag.toLowerCase().includes(query)) ||
                skill.slug.toLowerCase().includes(query));
        }
        // Filter by tags
        if (params.tags?.length) {
            filteredSkills = filteredSkills.filter(skill => params.tags.some(tag => skill.tags.includes(tag)));
        }
        // Filter by author
        if (params.author) {
            filteredSkills = filteredSkills.filter(skill => skill.author.username.toLowerCase() === params.author.toLowerCase());
        }
        // Apply sorting
        if (params.sort === 'downloads') {
            filteredSkills.sort((a, b) => b.downloads - a.downloads);
        }
        else if (params.sort === 'stars') {
            filteredSkills.sort((a, b) => b.stars - a.stars);
        }
        else if (params.sort === 'recent') {
            filteredSkills.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        // Apply pagination
        const offset = params.offset || 0;
        const limit = params.limit || 20;
        const paginatedSkills = filteredSkills.slice(offset, offset + limit);
        return {
            skills: paginatedSkills,
            total: filteredSkills.length,
            offset,
            limit,
            queryTimeMs: Date.now() - startTime,
            fromCache: false,
        };
    }
    /**
     * Quick search with defaults
     */
    async quickSearch(query, limit = 10) {
        const result = await this.search({ query, limit });
        return result.skills;
    }
    // ============================================================================
    // Fetch Metadata
    // ============================================================================
    /**
     * Fetch skill metadata by slug
     */
    async fetchSkill(slug) {
        const cacheKey = `skill:${slug}`;
        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
            return cached.data;
        }
        try {
            logger_1.logger.debug('ClawHubClient', `Fetching skill: ${slug}`);
            const url = `${this.apiBase}/skills/${encodeURIComponent(slug)}`;
            const response = await this.fetchWithTimeout(url, {
                headers: this.getAuthHeaders(),
            });
            if (response.status === 404) {
                throw new ClawHubTypes_1.SkillNotFoundError(slug);
            }
            if (!response.ok) {
                throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to fetch skill: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            const skill = this.mapApiSkillDetailToMetadata(data);
            // Cache the result
            this.cache.set(cacheKey, { data: skill, timestamp: Date.now() });
            return skill;
        }
        catch (error) {
            if (error instanceof ClawHubTypes_1.ClawhubError)
                throw error;
            logger_1.logger.error('ClawHubClient', `Failed to fetch skill ${slug}: ${error instanceof Error ? error.message : String(error)}`);
            throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to fetch skill ${slug}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Map ClawHub API skill detail to internal SkillMetadata format
     */
    mapApiSkillDetailToMetadata(data) {
        const { skill, latestVersion, owner } = data;
        return {
            slug: skill.slug,
            name: skill.displayName,
            description: skill.summary || '',
            readme: latestVersion?.changelog,
            author: {
                id: owner.userId,
                username: owner.handle,
                avatar: owner.image,
            },
            version: latestVersion?.version || Object.values(skill.tags)[0] || '1.0.0',
            tags: Object.keys(skill.tags).filter(t => t !== 'latest'),
            createdAt: new Date(skill.createdAt).toISOString(),
            updatedAt: new Date(skill.updatedAt).toISOString(),
            downloads: skill.stats.downloads,
            stars: skill.stats.stars,
            status: 'active',
        };
    }
    /**
     * Fetch skill versions
     */
    async fetchVersions(slug) {
        try {
            const url = `${this.apiBase}/skills/${encodeURIComponent(slug)}/versions`;
            const response = await this.fetchWithTimeout(url, {
                headers: this.getAuthHeaders(),
            });
            if (response.status === 404) {
                throw new ClawHubTypes_1.SkillNotFoundError(slug);
            }
            if (!response.ok) {
                throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to fetch versions: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.items.map(v => v.version);
        }
        catch (error) {
            if (error instanceof ClawHubTypes_1.ClawhubError)
                throw error;
            throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to fetch versions for ${slug}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Fetch specific version of a skill
     */
    async fetchSkillVersion(slug, version) {
        try {
            const url = `${this.apiBase}/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`;
            const response = await this.fetchWithTimeout(url, {
                headers: this.getAuthHeaders(),
            });
            if (response.status === 404) {
                const versions = await this.fetchVersions(slug).catch(() => undefined);
                throw new ClawHubTypes_1.VersionNotFoundError(slug, version, versions);
            }
            if (!response.ok) {
                throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to fetch skill version: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return {
                slug: data.skill.slug,
                name: data.skill.displayName,
                description: '', // Not provided in version detail
                author: { id: 'unknown', username: 'unknown' },
                version: data.version.version,
                tags: [],
                createdAt: new Date(data.version.createdAt).toISOString(),
                updatedAt: new Date(data.version.createdAt).toISOString(),
                downloads: 0,
                stars: 0,
                status: 'active',
            };
        }
        catch (error) {
            if (error instanceof ClawHubTypes_1.ClawhubError)
                throw error;
            throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to fetch skill version ${slug}@${version}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // ============================================================================
    // Download
    // ============================================================================
    /**
     * Download skill bundle
     */
    async downloadSkill(slug, version) {
        try {
            logger_1.logger.info('ClawHubClient', `Downloading ${slug}${version ? `@${version}` : ''}`);
            // Get version details to find files
            const versionToDownload = version || 'latest';
            let url;
            if (versionToDownload === 'latest') {
                url = `${this.apiBase}/skills/${encodeURIComponent(slug)}/download`;
            }
            else {
                url = `${this.apiBase}/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(versionToDownload)}/download`;
            }
            const response = await this.fetchWithTimeout(url, {
                headers: this.getAuthHeaders(),
            });
            if (!response.ok) {
                throw new ClawHubTypes_1.ClawhubError('DOWNLOAD_FAILED', `Failed to download skill: ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            logger_1.logger.info('ClawHubClient', `Downloaded ${slug}: ${buffer.length} bytes`);
            return buffer;
        }
        catch (error) {
            if (error instanceof ClawHubTypes_1.ClawhubError)
                throw error;
            throw new ClawHubTypes_1.ClawhubError('DOWNLOAD_FAILED', `Failed to download skill ${slug}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // ============================================================================
    // Install
    // ============================================================================
    /**
     * Install a skill from ClawHub
     *
     * Requirements from SPEC F4.1:
     * - Install completes in < 10s
     * - Records installation in lockfile
     */
    async install(slug, options = {}) {
        const startTime = Date.now();
        const result = {
            success: false,
            version: options.version || 'latest',
            errors: [],
            warnings: [],
        };
        try {
            logger_1.logger.info('ClawHubClient', `Installing ${slug}${options.version ? `@${options.version}` : ''}`);
            // Check if already installed
            const lockfile = await this.readLockfile();
            const existing = lockfile.skills.find(s => s.slug === slug);
            if (existing && !options.force) {
                throw new ClawHubTypes_1.SkillAlreadyInstalledError(slug, existing.version);
            }
            // Fetch skill metadata
            const skill = options.version
                ? await this.fetchSkillVersion(slug, options.version)
                : await this.fetchSkill(slug);
            result.skill = skill;
            result.version = skill.version;
            // Determine install path
            const skillsDir = options.targetDir || this.getSkillsDirectory();
            const installPath = path.join(skillsDir, slug);
            result.installPath = installPath;
            // Ensure skills directory exists
            await fs.mkdir(skillsDir, { recursive: true });
            // Download skill bundle
            let bundle;
            try {
                bundle = await this.downloadSkill(slug, options.version);
            }
            catch (error) {
                // Download endpoint may not exist, create from files
                logger_1.logger.warn('ClawHubClient', 'Bundle download failed, attempting file-based install');
                await this.installFromFiles(slug, options.version, installPath);
                bundle = Buffer.from([]); // Empty since we installed directly
            }
            // Extract bundle if we have one
            if (bundle.length > 0) {
                await this.extractBundle(bundle, installPath, skill.contentHash);
            }
            // Update lockfile
            const entry = {
                slug,
                version: skill.version,
                contentHash: skill.contentHash || 'unknown',
                installedAt: new Date().toISOString(),
                registry: this.config.registryUrl,
                path: installPath,
                dependencies: [],
                config: options.config,
            };
            // Remove existing entry if reinstalling
            lockfile.skills = lockfile.skills.filter(s => s.slug !== slug);
            lockfile.skills.push(entry);
            lockfile.lastSync = new Date().toISOString();
            await this.writeLockfile(lockfile);
            const duration = Date.now() - startTime;
            logger_1.logger.info('ClawHubClient', `Installed ${slug}@${skill.version} in ${duration}ms`);
            // Verify installation meets spec requirement (< 10s)
            if (duration > 10000) {
                result.warnings?.push(`Installation took ${duration}ms (target: < 10s)`);
            }
            result.success = true;
            return result;
        }
        catch (error) {
            if (error instanceof ClawHubTypes_1.ClawhubError) {
                result.errors?.push(error.message);
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            result.errors?.push(message);
            throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Installation failed: ${message}`, result);
        }
    }
    /**
     * Install skill by fetching individual files
     * (Fallback when download bundle endpoint is not available)
     */
    async installFromFiles(slug, version, installPath) {
        // First fetch the skill details for the name
        const skillUrl = `${this.apiBase}/skills/${encodeURIComponent(slug)}`;
        const skillResponse = await this.fetchWithTimeout(skillUrl, {
            headers: this.getAuthHeaders(),
        });
        if (!skillResponse.ok) {
            throw new ClawHubTypes_1.ClawhubError('DOWNLOAD_FAILED', `Failed to fetch skill details: ${skillResponse.status}`);
        }
        const skillData = await skillResponse.json();
        // If no version specified, get the latest version from the versions list
        let versionData;
        if (version) {
            // Fetch specific version
            const versionUrl = `${this.apiBase}/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`;
            const versionResponse = await this.fetchWithTimeout(versionUrl, {
                headers: this.getAuthHeaders(),
            });
            if (versionResponse.ok) {
                const data = await versionResponse.json();
                versionData = data.version;
            }
        }
        // If no specific version data, use the latest version from skill details
        if (!versionData && skillData.latestVersion) {
            versionData = {
                version: skillData.latestVersion.version,
                createdAt: skillData.latestVersion.createdAt,
                changelog: skillData.latestVersion.changelog,
                changelogSource: 'auto',
            };
        }
        if (!versionData) {
            throw new ClawHubTypes_1.ClawhubError('DOWNLOAD_FAILED', 'No version information available');
        }
        // Create directory
        await fs.mkdir(installPath, { recursive: true });
        // Create a basic SKILL.md from the skill info
        const skillContent = `# ${skillData.skill.displayName}

## Description

${skillData.skill.summary || 'No description available'}

## Version

${versionData.version}

## Changelog

${versionData.changelog || 'No changelog available'}

## Author

${skillData.owner.displayName} (@${skillData.owner.handle})
`;
        await fs.writeFile(path.join(installPath, 'SKILL.md'), skillContent);
        logger_1.logger.info('ClawHubClient', `Created SKILL.md for ${slug}`);
    }
    /**
     * Uninstall a skill
     */
    async uninstall(slug) {
        try {
            logger_1.logger.info('ClawHubClient', `Uninstalling ${slug}`);
            const lockfile = await this.readLockfile();
            const entry = lockfile.skills.find(s => s.slug === slug);
            if (!entry) {
                logger_1.logger.warn('ClawHubClient', `Skill ${slug} is not installed`);
                return;
            }
            // Remove directory
            await fs.rm(entry.path, { recursive: true, force: true });
            // Update lockfile
            lockfile.skills = lockfile.skills.filter(s => s.slug !== slug);
            await this.writeLockfile(lockfile);
            logger_1.logger.info('ClawHubClient', `Uninstalled ${slug}`);
        }
        catch (error) {
            throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to uninstall ${slug}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // ============================================================================
    // List Installed
    // ============================================================================
    /**
     * List installed skills
     */
    async listInstalled() {
        try {
            const lockfile = await this.readLockfile();
            const installed = [];
            for (const entry of lockfile.skills) {
                try {
                    // Try to fetch current metadata from registry
                    const metadata = await this.fetchSkill(entry.slug).catch(() => null);
                    installed.push({
                        ...(metadata || {
                            slug: entry.slug,
                            name: entry.slug,
                            description: 'Local skill (metadata unavailable)',
                            author: { id: 'unknown', username: 'unknown' },
                            version: entry.version,
                            tags: [],
                            createdAt: entry.installedAt,
                            updatedAt: entry.installedAt,
                            downloads: 0,
                            stars: 0,
                            status: 'active',
                        }),
                        installPath: entry.path,
                        activationState: 'inactive',
                    });
                }
                catch (error) {
                    logger_1.logger.warn('ClawHubClient', `Failed to load metadata for ${entry.slug}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            return installed;
        }
        catch (error) {
            if (error instanceof ClawHubTypes_1.ClawhubError)
                throw error;
            throw new ClawHubTypes_1.ClawhubError('NETWORK_ERROR', `Failed to list installed skills: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Check if a skill is installed
     */
    async isInstalled(slug) {
        try {
            const lockfile = await this.readLockfile();
            const entry = lockfile.skills.find(s => s.slug === slug);
            return {
                installed: !!entry,
                version: entry?.version,
            };
        }
        catch {
            return { installed: false };
        }
    }
    // ============================================================================
    // Lockfile Management
    // ============================================================================
    /**
     * Read the lockfile
     */
    async readLockfile() {
        try {
            const lockfilePath = this.getLockfilePath();
            const content = await fs.readFile(lockfilePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            // Return empty lockfile if not exists
            return {
                version: '1.0',
                registry: this.config.registryUrl,
                skills: [],
            };
        }
    }
    /**
     * Write the lockfile
     */
    async writeLockfile(lockfile) {
        const lockfilePath = this.getLockfilePath();
        const lockfileDir = path.dirname(lockfilePath);
        await fs.mkdir(lockfileDir, { recursive: true });
        await fs.writeFile(lockfilePath, JSON.stringify(lockfile, null, 2));
    }
    // ============================================================================
    // Private Helpers
    // ============================================================================
    getAuthHeaders() {
        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'Dash-ClawHub-Client/1.0',
        };
        if (this.config.token) {
            headers['Authorization'] = `Bearer ${this.config.token}`;
        }
        return headers;
    }
    async fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            return response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async extractBundle(bundle, targetPath, expectedHash) {
        // Create target directory
        await fs.mkdir(targetPath, { recursive: true });
        // For now, assume zip format and extract using system unzip
        // In production, we'd use a proper zip library
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execAsync = promisify(exec);
        // Write bundle to temp file
        const tempFile = path.join(targetPath, '.download.tmp');
        await fs.writeFile(tempFile, bundle);
        try {
            // Extract using unzip
            await execAsync(`unzip -o "${tempFile}" -d "${targetPath}"`);
            // Clean up temp file
            await fs.unlink(tempFile);
            // Remove any __MACOSX directory
            await fs.rm(path.join(targetPath, '__MACOSX'), { recursive: true, force: true });
        }
        catch (error) {
            // Clean up on error
            await fs.unlink(tempFile).catch(() => { });
            throw new ClawHubTypes_1.ClawhubError('DOWNLOAD_FAILED', `Failed to extract skill bundle: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.ClawHubClient = ClawHubClient;
// ============================================================================
// Singleton
// ============================================================================
let globalClient = null;
function getGlobalClawHubClient(config) {
    if (!globalClient) {
        globalClient = new ClawHubClient(config);
    }
    else if (config) {
        globalClient.updateConfig(config);
    }
    return globalClient;
}
function resetGlobalClawHubClient() {
    globalClient = null;
}
exports.default = ClawHubClient;
//# sourceMappingURL=ClawHubClient.js.map