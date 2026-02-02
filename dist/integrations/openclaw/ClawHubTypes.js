"use strict";
/**
 * ClawHub Integration Types
 *
 * Type definitions for ClawHub skill registry integration
 * Based on OpenClaw documentation and OPENCLAW_INTEGRATION_SPEC.md section F4.1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyError = exports.VersionNotFoundError = exports.SkillAlreadyInstalledError = exports.SkillNotFoundError = exports.ClawhubError = exports.DEFAULT_CLAWHUB_CONFIG = void 0;
/**
 * Default ClawHub configuration
 * Registry URL can be discovered from /.well-known/clawdhub.json on the site
 * Per https://www.npmjs.com/package/clawdhub docs
 */
exports.DEFAULT_CLAWHUB_CONFIG = {
    registryUrl: process.env['CLAWHUB_REGISTRY'] || 'https://clawhub.ai',
    siteUrl: process.env['CLAWHUB_SITE'] || 'https://clawhub.ai',
    workdir: process.env['CLAWHUB_WORKDIR'] || process.cwd(),
    skillsDir: 'skills',
    timeout: 30000,
};
/**
 * ClawHub error class
 */
class ClawhubError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'ClawhubError';
    }
}
exports.ClawhubError = ClawhubError;
/**
 * Skill not found error
 */
class SkillNotFoundError extends ClawhubError {
    constructor(slug) {
        super('SKILL_NOT_FOUND', `Skill not found: ${slug}`, { slug });
        this.slug = slug;
        this.name = 'SkillNotFoundError';
    }
}
exports.SkillNotFoundError = SkillNotFoundError;
/**
 * Skill already installed error
 */
class SkillAlreadyInstalledError extends ClawhubError {
    constructor(slug, installedVersion) {
        super('SKILL_ALREADY_INSTALLED', `Skill ${slug}@${installedVersion} is already installed. Use --force to reinstall.`, { slug, installedVersion });
        this.slug = slug;
        this.installedVersion = installedVersion;
        this.name = 'SkillAlreadyInstalledError';
    }
}
exports.SkillAlreadyInstalledError = SkillAlreadyInstalledError;
/**
 * Version not found error
 */
class VersionNotFoundError extends ClawhubError {
    constructor(slug, version, availableVersions) {
        super('VERSION_NOT_FOUND', `Version ${version} not found for skill ${slug}`, { slug, version, availableVersions });
        this.slug = slug;
        this.version = version;
        this.availableVersions = availableVersions;
        this.name = 'VersionNotFoundError';
    }
}
exports.VersionNotFoundError = VersionNotFoundError;
/**
 * Dependency resolution error
 */
class DependencyError extends ClawhubError {
    constructor(skill, dependency, reason) {
        super('DEPENDENCY_ERROR', `Dependency error for ${skill}: ${dependency} - ${reason}`, { skill, dependency, reason });
        this.skill = skill;
        this.dependency = dependency;
        this.reason = reason;
        this.name = 'DependencyError';
    }
}
exports.DependencyError = DependencyError;
//# sourceMappingURL=ClawHubTypes.js.map