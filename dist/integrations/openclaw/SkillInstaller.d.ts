/**
 * Skill Installer
 *
 * Handles SKILL.md parsing, dependency resolution, skill activation/deactivation,
 * and workspace integration.
 *
 * Based on OPENCLAW_INTEGRATION_SPEC.md section F4.1
 */
import { ClawHubClient } from './ClawHubClient';
import { ParsedSkill, SkillDependency, SkillActivationResult, SkillActivationState, InstalledSkill } from './ClawHubTypes';
/**
 * Install context for dependency resolution
 */
interface InstallContext {
    /** Currently installing (to detect cycles) */
    installing: Set<string>;
    /** Already installed in this session */
    installed: Map<string, string>;
    /** Errors encountered */
    errors: string[];
    /** Warnings encountered */
    warnings: string[];
}
/**
 * Dependency resolution result
 */
interface DependencyResolution {
    /** Resolved dependency tree */
    tree: DependencyNode[];
    /** Missing dependencies */
    missing: string[];
    /** Conflicts detected */
    conflicts: DependencyConflict[];
}
/**
 * Dependency tree node
 */
interface DependencyNode {
    slug: string;
    version: string;
    optional: boolean;
    children: DependencyNode[];
}
/**
 * Dependency conflict
 */
interface DependencyConflict {
    slug: string;
    requiredBy: string[];
    versions: string[];
}
/**
 * Skill activation options
 */
interface ActivationOptions {
    /** Custom configuration values */
    config?: Record<string, unknown>;
    /** Skip validation */
    skipValidation?: boolean;
    /** Skip dependency activation */
    skipDependencies?: boolean;
}
export declare class SkillInstaller {
    private client;
    private skillsDir;
    private activeSkills;
    private skillStates;
    constructor(client: ClawHubClient, skillsDir?: string);
    /**
     * Parse a SKILL.md file
     */
    parseSkillFile(filePath: string): Promise<ParsedSkill>;
    /**
     * Find and parse all skills in a directory
     */
    findSkills(directory: string): Promise<ParsedSkill[]>;
    /**
     * Resolve dependencies for a skill
     */
    resolveDependencies(skill: ParsedSkill, context?: InstallContext): Promise<DependencyResolution>;
    /**
     * Resolve a single dependency
     */
    private resolveDependency;
    /**
     * Install missing dependencies
     */
    installDependencies(dependencies: SkillDependency[], context: InstallContext): Promise<string[]>;
    /**
     * Activate a skill
     */
    activate(slug: string, options?: ActivationOptions): Promise<SkillActivationResult>;
    /**
     * Deactivate a skill
     */
    deactivate(slug: string): Promise<SkillActivationResult>;
    /**
     * Get activation state of a skill
     */
    getActivationState(slug: string): SkillActivationState;
    /**
     * Check if a skill is active
     */
    isActive(slug: string): boolean;
    /**
     * Get all active skills
     */
    getActiveSkills(): InstalledSkill[];
    /**
     * Integrate skill into workspace
     */
    integrate(slug: string): Promise<void>;
    /**
     * Remove skill from workspace
     */
    unintegrate(slug: string): Promise<void>;
    /**
     * Load all skills from the skills directory and activate them
     */
    loadAllSkills(): Promise<InstalledSkill[]>;
    /**
     * Validate configuration against schema
     */
    private validateConfig;
    /**
     * Validate a skill before installation
     */
    validateSkill(slug: string): Promise<{
        valid: boolean;
        errors: string[];
    }>;
}
export declare function getGlobalSkillInstaller(client?: ClawHubClient): SkillInstaller;
export declare function resetGlobalSkillInstaller(): void;
export default SkillInstaller;
//# sourceMappingURL=SkillInstaller.d.ts.map