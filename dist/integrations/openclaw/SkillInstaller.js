"use strict";
/**
 * Skill Installer
 *
 * Handles SKILL.md parsing, dependency resolution, skill activation/deactivation,
 * and workspace integration.
 *
 * Based on OPENCLAW_INTEGRATION_SPEC.md section F4.1
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
exports.SkillInstaller = void 0;
exports.getGlobalSkillInstaller = getGlobalSkillInstaller;
exports.resetGlobalSkillInstaller = resetGlobalSkillInstaller;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const logger_1 = require("../../utils/logger");
const ClawHubTypes_1 = require("./ClawHubTypes");
// ============================================================================
// Frontmatter Parser
// ============================================================================
/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    if (!match) {
        return { frontmatter: {}, body: content };
    }
    const frontmatterText = match[1];
    const body = match[2];
    // Simple YAML parser for basic types
    const frontmatter = {};
    const lines = frontmatterText.split('\n');
    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1)
            continue;
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();
        // Try to parse as JSON (handles arrays, objects, numbers, booleans)
        if (value.startsWith('[') || value.startsWith('{')) {
            try {
                value = JSON.parse(value);
            }
            catch {
                // Keep as string
            }
        }
        else if (value === 'true') {
            value = true;
        }
        else if (value === 'false') {
            value = false;
        }
        else if (value === 'null') {
            value = null;
        }
        else if (!isNaN(Number(value)) && value !== '') {
            value = Number(value);
        }
        frontmatter[key] = value;
    }
    return { frontmatter, body };
}
// ============================================================================
// Skill Installer
// ============================================================================
class SkillInstaller {
    constructor(client, skillsDir) {
        this.activeSkills = new Map();
        this.skillStates = new Map();
        this.client = client;
        this.skillsDir = skillsDir || client.getSkillsDirectory();
    }
    // ============================================================================
    // SKILL.md Parsing
    // ============================================================================
    /**
     * Parse a SKILL.md file
     */
    async parseSkillFile(filePath) {
        try {
            logger_1.logger.debug(`[SkillInstaller] Parsing SKILL.md: ${filePath}`);
            const content = await fs.readFile(filePath, 'utf-8');
            const { frontmatter, body } = parseFrontmatter(content);
            // Get directory to list files
            const dir = path.dirname(filePath);
            const files = await fs.readdir(dir, { recursive: true });
            // Extract dependencies from frontmatter
            const dependencies = [];
            if (frontmatter['dependencies']) {
                const deps = frontmatter['dependencies'];
                for (const dep of deps) {
                    if (typeof dep === 'string') {
                        // Simple format: "slug" or "slug@version"
                        const [slug, version = '*'] = dep.split('@');
                        dependencies.push({ slug, version });
                    }
                    else {
                        // Object format: { slug: "name", version: "1.0.0", optional: true }
                        const optionalValue = dep['optional'];
                        const isOptional = typeof optionalValue === 'string'
                            ? optionalValue === 'true'
                            : optionalValue === true;
                        dependencies.push({
                            slug: dep['slug'] || dep['name'] || 'unknown',
                            version: dep['version'] || '*',
                            optional: isOptional,
                            reason: dep['reason'],
                        });
                    }
                }
            }
            // Extract required tools
            const requiredTools = [];
            if (frontmatter['tools']) {
                requiredTools.push(...frontmatter['tools']);
            }
            if (frontmatter['requiredTools']) {
                requiredTools.push(...frontmatter['requiredTools']);
            }
            // Extract config schema
            let configSchema;
            if (frontmatter['config']) {
                const config = frontmatter['config'];
                configSchema = {
                    schema: config['schema'] || {},
                    defaults: config['defaults'] || {},
                    requiredEnv: config['requiredEnv'] || [],
                    stateDirs: config['stateDirs'] || [],
                    example: config['example'],
                };
            }
            // Derive slug from file path or frontmatter
            const slug = frontmatter['slug'] ||
                path.basename(dir);
            return {
                frontmatter: {
                    name: frontmatter['name'],
                    description: frontmatter['description'],
                    version: frontmatter['version'],
                    author: frontmatter['author'],
                    tags: frontmatter['tags'],
                    metadata: frontmatter['metadata'],
                    ...frontmatter,
                },
                content: body,
                slug,
                files: files.filter(f => !f.startsWith('.')),
                dependencies,
                requiredTools,
                configSchema,
            };
        }
        catch (error) {
            throw new ClawHubTypes_1.ClawhubError('PARSE_ERROR', `Failed to parse SKILL.md at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Find and parse all skills in a directory
     */
    async findSkills(directory) {
        const skills = [];
        try {
            const entries = await fs.readdir(directory, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const skillDir = path.join(directory, entry.name);
                const skillFile = path.join(skillDir, 'SKILL.md');
                try {
                    const skill = await this.parseSkillFile(skillFile);
                    skills.push(skill);
                }
                catch {
                    // Not a skill directory, skip
                    logger_1.logger.debug(`[SkillInstaller] No SKILL.md found in ${skillDir}`);
                }
            }
        }
        catch (error) {
            logger_1.logger.warn(`[SkillInstaller] Failed to scan directory ${directory}:`, { error: String(error) });
        }
        return skills;
    }
    // ============================================================================
    // Dependency Resolution
    // ============================================================================
    /**
     * Resolve dependencies for a skill
     */
    async resolveDependencies(skill, context = {
        installing: new Set(),
        installed: new Map(),
        errors: [],
        warnings: [],
    }) {
        logger_1.logger.info(`[SkillInstaller] Resolving dependencies for ${skill.slug}`);
        const tree = [];
        const missing = [];
        const conflicts = [];
        // Check for circular dependencies
        if (context.installing.has(skill.slug)) {
            throw new ClawHubTypes_1.DependencyError(skill.slug, skill.slug, 'Circular dependency detected');
        }
        context.installing.add(skill.slug);
        try {
            for (const dep of skill.dependencies || []) {
                const resolution = await this.resolveDependency(dep, context);
                if (resolution.found) {
                    tree.push({
                        slug: dep.slug,
                        version: resolution.version,
                        optional: dep.optional || false,
                        children: resolution.children,
                    });
                }
                else {
                    if (!dep.optional) {
                        missing.push(dep.slug);
                        context.errors.push(`Missing required dependency: ${dep.slug}`);
                    }
                    else {
                        context.warnings.push(`Optional dependency not found: ${dep.slug}`);
                    }
                }
            }
        }
        finally {
            context.installing.delete(skill.slug);
        }
        return { tree, missing, conflicts };
    }
    /**
     * Resolve a single dependency
     */
    async resolveDependency(dependency, context) {
        // Check if already being installed (cycle detection)
        if (context.installing.has(dependency.slug)) {
            logger_1.logger.warn(`[SkillInstaller] Circular dependency detected: ${dependency.slug}`);
            return { found: true, version: dependency.version, children: [] };
        }
        // Check if already installed in this session
        if (context.installed.has(dependency.slug)) {
            return {
                found: true,
                version: context.installed.get(dependency.slug),
                children: [],
            };
        }
        // Check if already installed locally
        const localCheck = await this.client.isInstalled(dependency.slug);
        if (localCheck.installed) {
            context.installed.set(dependency.slug, localCheck.version);
            // Recursively resolve its dependencies
            const skillDir = path.join(this.skillsDir, dependency.slug);
            const skillFile = path.join(skillDir, 'SKILL.md');
            try {
                const depSkill = await this.parseSkillFile(skillFile);
                const subResolution = await this.resolveDependencies(depSkill, context);
                return {
                    found: true,
                    version: localCheck.version,
                    children: subResolution.tree,
                };
            }
            catch {
                return { found: true, version: localCheck.version, children: [] };
            }
        }
        // Try to fetch from registry
        try {
            const metadata = await this.client.fetchSkill(dependency.slug);
            // Check version compatibility
            // For now, accept any version (implement semver matching later)
            context.installed.set(dependency.slug, metadata.version);
            return {
                found: true,
                version: metadata.version,
                children: [],
            };
        }
        catch (error) {
            if (error instanceof ClawHubTypes_1.ClawhubError && error.code === 'SKILL_NOT_FOUND') {
                return { found: false, children: [] };
            }
            throw error;
        }
    }
    /**
     * Install missing dependencies
     */
    async installDependencies(dependencies, context) {
        const installed = [];
        for (const dep of dependencies) {
            if (context.installed.has(dep.slug)) {
                installed.push(`${dep.slug}@${context.installed.get(dep.slug)}`);
                continue;
            }
            if (context.installing.has(dep.slug)) {
                continue; // Already being installed
            }
            try {
                const result = await this.client.install(dep.slug, {
                    version: dep.version !== '*' ? dep.version : undefined,
                    installDependencies: true,
                });
                if (result.success) {
                    installed.push(`${dep.slug}@${result.version}`);
                    context.installed.set(dep.slug, result.version);
                }
                else if (!dep.optional) {
                    throw new ClawHubTypes_1.DependencyError(dep.slug, dep.slug, 'Installation failed');
                }
            }
            catch (error) {
                if (!dep.optional) {
                    throw error;
                }
                context.warnings.push(`Optional dependency ${dep.slug} failed to install`);
            }
        }
        return installed;
    }
    // ============================================================================
    // Skill Activation/Deactivation
    // ============================================================================
    /**
     * Activate a skill
     */
    async activate(slug, options = {}) {
        logger_1.logger.info(`[SkillInstaller] Activating skill: ${slug}`);
        // Check current state
        const currentState = this.skillStates.get(slug);
        if (currentState === 'active' || currentState === 'activating') {
            return {
                slug,
                state: currentState,
                success: true,
            };
        }
        this.skillStates.set(slug, 'activating');
        try {
            // Find skill directory
            const skillDir = path.join(this.skillsDir, slug);
            const skillFile = path.join(skillDir, 'SKILL.md');
            // Parse SKILL.md
            const parsedSkill = await this.parseSkillFile(skillFile);
            // Validate configuration
            if (!options.skipValidation && parsedSkill.configSchema) {
                const config = (options.config || {});
                this.validateConfig(parsedSkill.configSchema, config);
            }
            // Check required tools
            if (parsedSkill.requiredTools?.length) {
                for (const tool of parsedSkill.requiredTools) {
                    // In production, check if tool is available in OpenClaw
                    logger_1.logger.debug(`[SkillInstaller] Skill ${slug} requires tool: ${tool}`);
                }
            }
            // Activate dependencies first
            if (!options.skipDependencies && parsedSkill.dependencies?.length) {
                for (const dep of parsedSkill.dependencies) {
                    if (!dep.optional) {
                        await this.activate(dep.slug, { ...options, skipDependencies: true });
                    }
                }
            }
            // Load configuration
            const config = {
                ...parsedSkill.configSchema?.defaults,
                ...options.config,
            };
            // Mark as active
            this.skillStates.set(slug, 'active');
            const installedSkill = {
                slug,
                name: parsedSkill.frontmatter.name || slug,
                description: parsedSkill.frontmatter.description || '',
                author: { id: 'local', username: parsedSkill.frontmatter.author || 'unknown' },
                version: parsedSkill.frontmatter.version || '0.0.0',
                tags: parsedSkill.frontmatter.tags || [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                downloads: 0,
                stars: 0,
                status: 'active',
                installPath: skillDir,
                activationState: 'active',
                parsedSkill,
                config,
            };
            this.activeSkills.set(slug, installedSkill);
            logger_1.logger.info(`[SkillInstaller] Skill ${slug} activated successfully`);
            return {
                slug,
                state: 'active',
                success: true,
                config,
                tools: parsedSkill.requiredTools,
            };
        }
        catch (error) {
            this.skillStates.set(slug, 'error');
            return {
                slug,
                state: 'error',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Deactivate a skill
     */
    async deactivate(slug) {
        logger_1.logger.info(`[SkillInstaller] Deactivating skill: ${slug}`);
        const currentState = this.skillStates.get(slug);
        if (currentState === 'inactive' || currentState === 'deactivating') {
            return {
                slug,
                state: currentState || 'inactive',
                success: true,
            };
        }
        this.skillStates.set(slug, 'deactivating');
        try {
            // Remove from active skills
            this.activeSkills.delete(slug);
            this.skillStates.set(slug, 'inactive');
            logger_1.logger.info(`[SkillInstaller] Skill ${slug} deactivated`);
            return {
                slug,
                state: 'inactive',
                success: true,
            };
        }
        catch (error) {
            this.skillStates.set(slug, 'error');
            return {
                slug,
                state: 'error',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Get activation state of a skill
     */
    getActivationState(slug) {
        return this.skillStates.get(slug) || 'inactive';
    }
    /**
     * Check if a skill is active
     */
    isActive(slug) {
        return this.skillStates.get(slug) === 'active';
    }
    /**
     * Get all active skills
     */
    getActiveSkills() {
        return Array.from(this.activeSkills.values());
    }
    // ============================================================================
    // Workspace Integration
    // ============================================================================
    /**
     * Integrate skill into workspace
     */
    async integrate(slug) {
        logger_1.logger.info(`[SkillInstaller] Integrating skill ${slug} into workspace`);
        const skillDir = path.join(this.skillsDir, slug);
        // Ensure skill is activated
        if (!this.isActive(slug)) {
            await this.activate(slug);
        }
        // Create workspace integration files if needed
        // This could include:
        // - Symlinks for easy access
        // - Environment variable setup
        // - Configuration file updates
        logger_1.logger.info(`[SkillInstaller] Skill ${slug} integrated into workspace`);
    }
    /**
     * Remove skill from workspace
     */
    async unintegrate(slug) {
        logger_1.logger.info(`[SkillInstaller] Removing skill ${slug} from workspace`);
        // Deactivate first
        if (this.isActive(slug)) {
            await this.deactivate(slug);
        }
        logger_1.logger.info(`[SkillInstaller] Skill ${slug} removed from workspace`);
    }
    /**
     * Load all skills from the skills directory and activate them
     */
    async loadAllSkills() {
        logger_1.logger.info(`[SkillInstaller] Loading all skills from ${this.skillsDir}`);
        const skills = await this.findSkills(this.skillsDir);
        const activated = [];
        for (const skill of skills) {
            try {
                const result = await this.activate(skill.slug);
                if (result.success) {
                    const installed = this.activeSkills.get(skill.slug);
                    if (installed) {
                        activated.push(installed);
                    }
                }
            }
            catch (error) {
                logger_1.logger.error(`[SkillInstaller] Failed to activate ${skill.slug}:`, { error: String(error) });
            }
        }
        logger_1.logger.info(`[SkillInstaller] Loaded ${activated.length}/${skills.length} skills`);
        return activated;
    }
    // ============================================================================
    // Validation
    // ============================================================================
    /**
     * Validate configuration against schema
     */
    validateConfig(schema, config) {
        // Check required environment variables
        for (const envVar of schema.requiredEnv || []) {
            if (!process.env[envVar]) {
                throw new ClawHubTypes_1.ClawhubError('CONFIG_ERROR', `Required environment variable not set: ${envVar}`);
            }
        }
        // Check required state directories exist
        for (const dir of schema.stateDirs || []) {
            // In production, verify these directories exist
            logger_1.logger.debug(`[SkillInstaller] Skill requires state directory: ${dir}`);
        }
        // TODO: Implement full JSON Schema validation
    }
    /**
     * Validate a skill before installation
     */
    async validateSkill(slug) {
        const errors = [];
        try {
            const metadata = await this.client.fetchSkill(slug);
            // Basic validation
            if (!metadata.name) {
                errors.push('Skill is missing name');
            }
            if (!metadata.description) {
                errors.push('Skill is missing description');
            }
            if (metadata.status === 'deleted' || metadata.status === 'hidden') {
                errors.push(`Skill status is ${metadata.status}`);
            }
            return { valid: errors.length === 0, errors };
        }
        catch (error) {
            errors.push(`Failed to fetch skill: ${error instanceof Error ? error.message : String(error)}`);
            return { valid: false, errors };
        }
    }
}
exports.SkillInstaller = SkillInstaller;
// ============================================================================
// Singleton
// ============================================================================
let globalInstaller = null;
function getGlobalSkillInstaller(client) {
    if (!globalInstaller) {
        if (!client) {
            throw new Error('SkillInstaller requires ClawHubClient on first initialization');
        }
        globalInstaller = new SkillInstaller(client);
    }
    return globalInstaller;
}
function resetGlobalSkillInstaller() {
    globalInstaller = null;
}
exports.default = SkillInstaller;
//# sourceMappingURL=SkillInstaller.js.map