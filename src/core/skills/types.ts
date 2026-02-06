/**
 * Agent Skills System - Core Types and Interfaces
 * 
 * Implements the Agent Skills standard (https://agentskills.io) for Godel.
 * Skills are reusable capabilities defined in Markdown files with structured
 * frontmatter and body content.
 */

import { EventEmitter } from 'events';

// ============================================================================
// Core Skill Types
// ============================================================================

/**
 * Skill frontmatter as defined by Agent Skills spec
 * https://agentskills.io/specification#frontmatter-required
 */
export interface SkillFrontmatter {
  /** Skill name (lowercase, hyphens, max 64 chars) */
  name: string;
  /** Skill description (max 1024 chars) */
  description: string;
  /** Optional license identifier */
  license?: string;
  /** Optional compatibility requirements */
  compatibility?: string;
  /** Optional metadata key-value pairs */
  metadata?: Record<string, string>;
  /** Optional allowed tools list */
  'allowed-tools'?: string;
  /** Disable automatic model invocation */
  'disable-model-invocation'?: boolean;
  /** Allow additional properties */
  [key: string]: unknown;
}

/**
 * Parsed skill structure
 */
export interface Skill {
  /** Skill name (matches directory name) */
  name: string;
  /** Skill description */
  description: string;
  /** Full file path to SKILL.md */
  filePath: string;
  /** Base directory of the skill */
  baseDir: string;
  /** Source of the skill (user, project, builtin, path) */
  source: SkillSource;
  /** Full markdown content */
  content: string;
  /** Frontmatter data */
  frontmatter: SkillFrontmatter;
  /** Whether model invocation is disabled */
  disableModelInvocation: boolean;
  /** Parsed sections from body */
  sections: SkillSection[];
  /** When to use this skill */
  whenToUse: string[];
  /** Step-by-step instructions */
  steps: string[];
  /** Examples section */
  examples: SkillExample[];
  /** Available tools */
  tools: SkillTool[];
  /** Optional: references to other files */
  references?: string[];
  /** Optional: scripts available */
  scripts?: string[];
}

/** Skill source types */
export type SkillSource = 'user' | 'project' | 'builtin' | 'path';

/**
 * Skill section from parsed markdown
 */
export interface SkillSection {
  /** Section title */
  title: string;
  /** Section level (1-6) */
  level: number;
  /** Section content */
  content: string;
  /** Subsections */
  subsections?: SkillSection[];
}

/**
 * Skill example
 */
export interface SkillExample {
  /** Example title */
  title: string;
  /** Example description */
  description: string;
  /** Input/query for the example */
  input: string;
  /** Expected output/behavior */
  output?: string;
}

/**
 * Skill tool definition
 */
export interface SkillTool {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Optional: tool parameters */
  parameters?: Record<string, unknown>;
}

// ============================================================================
// Skill Registry Types
// ============================================================================

/**
 * Skill registry configuration
 */
export interface SkillRegistryConfig {
  /** User skills directory (~/.godel/skills) */
  userSkillsDir: string;
  /** Project skills directory (./.godel/skills) */
  projectSkillsDir: string;
  /** Built-in skills directory */
  builtinSkillsDir: string;
  /** Additional skill paths */
  skillPaths?: string[];
  /** Whether to auto-load skills based on context */
  autoLoad: boolean;
  /** Auto-load threshold (0-1, minimum relevance score) */
  autoLoadThreshold: number;
  /** Maximum skills to auto-load at once */
  maxAutoLoad: number;
}

/**
 * Skill with runtime state
 */
export interface LoadedSkill extends Skill {
  /** Unique ID in registry */
  id: string;
  /** Whether skill is currently active */
  isActive: boolean;
  /** When the skill was loaded */
  loadedAt: Date;
  /** Number of times used */
  useCount: number;
  /** Relevance score for current context */
  relevanceScore?: number;
}

/**
 * Skill match result for auto-loading
 */
export interface SkillMatch {
  /** Matched skill */
  skill: LoadedSkill;
  /** Relevance score (0-1) */
  score: number;
  /** Matching keywords/terms */
  matchedTerms: string[];
  /** Reason for match */
  reason: string;
}

/**
 * Skill load result
 */
export interface LoadSkillsResult {
  /** Loaded skills */
  skills: Skill[];
  /** Any diagnostics/warnings */
  diagnostics: SkillDiagnostic[];
}

/**
 * Skill diagnostic message
 */
export interface SkillDiagnostic {
  /** Diagnostic type */
  type: 'error' | 'warning' | 'info';
  /** Message */
  message: string;
  /** Associated file path */
  path: string;
  /** Optional collision info */
  collision?: SkillCollision;
}

/**
 * Skill name collision info
 */
export interface SkillCollision {
  /** Resource type */
  resourceType: 'skill';
  /** Skill name */
  name: string;
  /** Path that won (loaded first) */
  winnerPath: string;
  /** Path that lost (skipped) */
  loserPath: string;
}

// ============================================================================
// Skill Events
// ============================================================================

/** Skill event types */
export type SkillEventType =
  | 'skill.loaded'
  | 'skill.unloaded'
  | 'skill.activated'
  | 'skill.deactivated'
  | 'skill.invoked'
  | 'skill.auto-loaded'
  | 'skill.error';

/** Skill event payload */
export interface SkillEvent {
  /** Event type */
  type: SkillEventType;
  /** Skill ID */
  skillId: string;
  /** Skill name */
  skillName: string;
  /** Event timestamp */
  timestamp: Date;
  /** Additional data */
  data?: unknown;
}

// ============================================================================
// Skill Registry Interface
// ============================================================================

/**
 * Skill registry interface
 */
export interface ISkillRegistry {
  /** Load skills from all configured directories */
  loadAll(): Promise<LoadSkillsResult>;
  
  /** Load skills from a specific directory */
  loadFromDir(dir: string, source: SkillSource): LoadSkillsResult;
  
  /** Load a single skill from file */
  loadFromFile(filePath: string, source: SkillSource): { skill: Skill | null; diagnostics: SkillDiagnostic[] };
  
  /** Get a loaded skill by name */
  get(name: string): LoadedSkill | undefined;
  
  /** Get all loaded skills */
  getAll(): LoadedSkill[];
  
  /** Get skills by source */
  getBySource(source: SkillSource): LoadedSkill[];
  
  /** Find relevant skills for a query/context */
  findRelevant(query: string, limit?: number): SkillMatch[];
  
  /** Activate a skill for use */
  activate(name: string): Promise<boolean>;
  
  /** Deactivate a skill */
  deactivate(name: string): Promise<boolean>;
  
  /** Auto-load skills based on context */
  autoLoad(context: string): Promise<SkillMatch[]>;
  
  /** Format skills for inclusion in prompt */
  formatForPrompt(skills?: LoadedSkill[]): string;
  
  /** Register an event listener */
  on(event: SkillEventType, listener: (event: SkillEvent) => void): this;
  
  /** Remove an event listener */
  off(event: SkillEventType, listener: (event: SkillEvent) => void): this;
}

// ============================================================================
// Swarm Skill Integration Types
// ============================================================================

/**
 * Skill context for swarm agents
 */
export interface SwarmSkillContext {
  /** Swarm ID */
  swarmId: string;
  /** Agent ID */
  agentId: string;
  /** Current task */
  task: string;
  /** Available skills */
  availableSkills: LoadedSkill[];
  /** Active skills */
  activeSkills: LoadedSkill[];
}

/**
 * Skill-enabled agent role
 */
export interface SkillAgentRole {
  /** Role name */
  name: string;
  /** Role description */
  description: string;
  /** Required skills for this role */
  requiredSkills: string[];
  /** Optional skills for this role */
  optionalSkills: string[];
  /** Skill-specific instructions */
  skillInstructions: Record<string, string>;
}

/**
 * Skill sharing configuration for swarms
 */
export interface SwarmSkillConfig {
  /** Skills shared across all agents */
  sharedSkills: string[];
  /** Skills per agent role */
  roleSkills: Record<string, string[]>;
  /** Auto-load skills based on task */
  autoLoad: boolean;
  /** Allow agents to share skills dynamically */
  dynamicSharing: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum skill name length per spec */
export const MAX_SKILL_NAME_LENGTH = 64;

/** Maximum skill description length per spec */
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

/** Maximum compatibility field length per spec */
export const MAX_COMPATIBILITY_LENGTH = 500;

/** Default skill directories */
export const DEFAULT_SKILL_DIRS = {
  user: '.godel/skills',
  project: '.godel/skills',
  builtin: 'skills',
} as const;

/** Allowed frontmatter fields per spec */
export const ALLOWED_FRONTMATTER_FIELDS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
  'disable-model-invocation',
]);
