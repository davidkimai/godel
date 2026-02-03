"use strict";
/**
 * Unified Skills Module
 *
 * Single interface for managing skills from both ClawHub and Vercel sources.
 *
 * @example
 * ```typescript
 * import { skills } from './skills';
 *
 * // Search across both sources
 * const results = await skills.search({ query: 'postgres' });
 *
 * // Install a skill (auto-detects source)
 * await skills.install('postgres-backup');
 *
 * // Install from specific source
 * await skills.install('vercel:some-npm-package');
 *
 * // List installed skills
 * const installed = await skills.list();
 *
 * // Remove a skill
 * await skills.remove('postgres-backup');
 * ```
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.skills = exports.resetGlobalVercelSkillsClient = exports.getGlobalVercelSkillsClient = exports.VercelSkillsClient = exports.resetGlobalClawHubAdapter = exports.getGlobalClawHubAdapter = exports.ClawHubAdapter = exports.resetGlobalSkillRegistry = exports.getGlobalSkillRegistry = exports.UnifiedSkillRegistry = void 0;
// ============================================================================
// Exports
// ============================================================================
// Types
__exportStar(require("./types"), exports);
// Registry
var registry_1 = require("./registry");
Object.defineProperty(exports, "UnifiedSkillRegistry", { enumerable: true, get: function () { return registry_1.UnifiedSkillRegistry; } });
Object.defineProperty(exports, "getGlobalSkillRegistry", { enumerable: true, get: function () { return registry_1.getGlobalSkillRegistry; } });
Object.defineProperty(exports, "resetGlobalSkillRegistry", { enumerable: true, get: function () { return registry_1.resetGlobalSkillRegistry; } });
// Source Adapters
var clawhub_1 = require("./clawhub");
Object.defineProperty(exports, "ClawHubAdapter", { enumerable: true, get: function () { return clawhub_1.ClawHubAdapter; } });
Object.defineProperty(exports, "getGlobalClawHubAdapter", { enumerable: true, get: function () { return clawhub_1.getGlobalClawHubAdapter; } });
Object.defineProperty(exports, "resetGlobalClawHubAdapter", { enumerable: true, get: function () { return clawhub_1.resetGlobalClawHubAdapter; } });
var vercel_1 = require("./vercel");
Object.defineProperty(exports, "VercelSkillsClient", { enumerable: true, get: function () { return vercel_1.VercelSkillsClient; } });
Object.defineProperty(exports, "getGlobalVercelSkillsClient", { enumerable: true, get: function () { return vercel_1.getGlobalVercelSkillsClient; } });
Object.defineProperty(exports, "resetGlobalVercelSkillsClient", { enumerable: true, get: function () { return vercel_1.resetGlobalVercelSkillsClient; } });
// ============================================================================
// Convenience API
// ============================================================================
const registry_2 = require("./registry");
/**
 * Unified Skills API
 *
 * Convenience interface for common skill operations.
 * Uses the global registry instance.
 */
exports.skills = {
    /**
     * Get the underlying registry instance
     */
    get registry() {
        return (0, registry_2.getGlobalSkillRegistry)();
    },
    /**
     * Get available skill sources
     */
    getSources() {
        return this.registry.getSources();
    },
    /**
     * Search for skills across all enabled sources
     *
     * @param params Search parameters
     * @returns Search results from all sources
     *
     * @example
     * ```typescript
     * const results = await skills.search({ query: 'postgres', limit: 10 });
     * console.log(`Found ${results.total} skills`);
     * for (const skill of results.skills) {
     *   console.log(`${skill.source}: ${skill.name}`);
     * }
     * ```
     */
    async search(params) {
        return this.registry.search(params);
    },
    /**
     * Fetch metadata for a specific skill
     *
     * @param skillId Skill ID (can include source prefix like 'clawhub:postgres-backup')
     * @returns Skill metadata
     *
     * @example
     * ```typescript
     * const skill = await skills.info('postgres-backup');
     * console.log(`${skill.name} v${skill.version}`);
     * ```
     */
    async info(skillId) {
        return this.registry.fetchSkill(skillId);
    },
    /**
     * Install a skill
     *
     * @param skillId Skill ID (can include source prefix)
     * @param options Installation options
     * @returns Installation result
     *
     * @example
     * ```typescript
     * // Install from any source (auto-detect)
     * await skills.install('postgres-backup');
     *
     * // Install from specific source
     * await skills.install('clawhub:postgres-backup');
     *
     * // Install specific version
     * await skills.install('postgres-backup', { version: '1.2.0' });
     *
     * // Force reinstall
     * await skills.install('postgres-backup', { force: true });
     * ```
     */
    async install(skillId, options) {
        return this.registry.install(skillId, options);
    },
    /**
     * Remove/uninstall a skill
     *
     * @param skillId Skill ID (can include source prefix)
     *
     * @example
     * ```typescript
     * await skills.remove('postgres-backup');
     * ```
     */
    async remove(skillId) {
        return this.registry.uninstall(skillId);
    },
    /**
     * Update a skill to the latest version
     *
     * @param skillId Skill ID (can include source prefix)
     * @param options Update options
     * @returns Installation result
     *
     * @example
     * ```typescript
     * await skills.update('postgres-backup');
     * ```
     */
    async update(skillId, options) {
        return this.registry.update(skillId, options);
    },
    /**
     * List all installed skills
     *
     * @returns Array of installed skills with their states
     *
     * @example
     * ```typescript
     * const installed = await skills.list();
     * for (const skill of installed) {
     *   console.log(`${skill.name} v${skill.version} [${skill.activationState}]`);
     * }
     * ```
     */
    async list() {
        return this.registry.listInstalled();
    },
    /**
     * Check if a skill is installed
     *
     * @param skillId Skill ID (can include source prefix)
     * @returns Installation status
     *
     * @example
     * ```typescript
     * const status = await skills.isInstalled('postgres-backup');
     * if (status.installed) {
     *   console.log(`Version ${status.version} from ${status.source}`);
     * }
     * ```
     */
    async isInstalled(skillId) {
        return this.registry.isInstalled(skillId);
    },
};
// Default export
exports.default = exports.skills;
//# sourceMappingURL=index.js.map