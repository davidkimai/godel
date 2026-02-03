"use strict";
/**
 * Unified Skill Types
 *
 * Type definitions for the unified skill registry supporting both
 * ClawHub and Vercel skills sources.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmbiguousSkillError = exports.SourceNotAvailableError = exports.SkillAlreadyInstalledError = exports.SkillNotFoundError = exports.UnifiedSkillError = exports.DEFAULT_UNIFIED_REGISTRY_CONFIG = void 0;
/**
 * Default unified registry configuration
 */
exports.DEFAULT_UNIFIED_REGISTRY_CONFIG = {
    workdir: process.env['DASH_WORKDIR'] || process.cwd(),
    skillsDir: 'skills',
    timeout: 30000,
    cacheTtl: 5 * 60 * 1000, // 5 minutes
    clawhub: {
        registryUrl: process.env['CLAWHUB_REGISTRY'] || 'https://clawhub.ai',
        siteUrl: process.env['CLAWHUB_SITE'] || 'https://clawhub.ai',
        token: process.env['CLAWHUB_TOKEN'],
        enabled: true,
    },
    vercel: {
        registryUrl: process.env['VERCEL_SKILLS_REGISTRY'] || 'https://skills.sh',
        npmRegistry: process.env['NPM_REGISTRY'] || 'https://registry.npmjs.org',
        enabled: true,
    },
};
/**
 * Unified skill error class
 */
class UnifiedSkillError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'UnifiedSkillError';
    }
}
exports.UnifiedSkillError = UnifiedSkillError;
/**
 * Skill not found error
 */
class SkillNotFoundError extends UnifiedSkillError {
    constructor(slug, source) {
        const sourceMsg = source ? ` in ${source}` : '';
        super('SKILL_NOT_FOUND', `Skill not found${sourceMsg}: ${slug}`, { slug, source });
        this.slug = slug;
        this.source = source;
        this.name = 'SkillNotFoundError';
    }
}
exports.SkillNotFoundError = SkillNotFoundError;
/**
 * Skill already installed error
 */
class SkillAlreadyInstalledError extends UnifiedSkillError {
    constructor(id, installedVersion) {
        super('SKILL_ALREADY_INSTALLED', `Skill ${id}@${installedVersion} is already installed. Use --force to reinstall.`, { id, installedVersion });
        this.id = id;
        this.installedVersion = installedVersion;
        this.name = 'SkillAlreadyInstalledError';
    }
}
exports.SkillAlreadyInstalledError = SkillAlreadyInstalledError;
/**
 * Source not available error
 */
class SourceNotAvailableError extends UnifiedSkillError {
    constructor(source) {
        super('SOURCE_NOT_AVAILABLE', `Skill source '${source}' is not available or enabled`);
        this.source = source;
        this.name = 'SourceNotAvailableError';
    }
}
exports.SourceNotAvailableError = SourceNotAvailableError;
/**
 * Ambiguous skill error - when multiple sources have the same slug
 */
class AmbiguousSkillError extends UnifiedSkillError {
    constructor(slug, sources) {
        super('AMBIGUOUS_SKILL', `Multiple sources have skill '${slug}'. Specify source with 'source:slug' format: ${sources.map(s => `${s}:${slug}`).join(', ')}`, { slug, sources });
        this.slug = slug;
        this.sources = sources;
        this.name = 'AmbiguousSkillError';
    }
}
exports.AmbiguousSkillError = AmbiguousSkillError;
//# sourceMappingURL=types.js.map