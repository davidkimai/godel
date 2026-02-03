/**
 * Core Skills Module - Agent Skills System
 * 
 * Implements the Agent Skills standard (https://agentskills.io) for Dash.
 * 
 * @example
 * ```typescript
 * import { SkillRegistry, loadAllSkills } from '@dash/core/skills';
 * 
 * const registry = new SkillRegistry();
 * await registry.loadAll();
 * 
 * // Find relevant skills
 * const matches = registry.findRelevant('deploy to production');
 * 
 * // Auto-load based on context
 * await registry.autoLoad('Need to run tests');
 * ```
 */

// Core types
export {
  // Interfaces
  Skill,
  SkillFrontmatter,
  SkillSource,
  SkillSection,
  SkillExample,
  SkillTool,
  LoadedSkill,
  SkillMatch,
  LoadSkillsResult,
  SkillDiagnostic,
  SkillCollision,
  SkillEvent,
  SkillEventType,
  SkillRegistryConfig,
  ISkillRegistry,
  SwarmSkillContext,
  SwarmSkillConfig,
  SkillAgentRole,
  
  // Constants
  MAX_SKILL_NAME_LENGTH,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_COMPATIBILITY_LENGTH,
  ALLOWED_FRONTMATTER_FIELDS,
  DEFAULT_SKILL_DIRS,
} from './types';

// Skill loader
export {
  loadAllSkills,
  loadSkillsFromDir,
  loadSkillFromFile,
  formatSkillsForPrompt,
  parseFrontmatter,
  validateSkillName,
  validateDescription,
  validateCompatibility,
  validateFrontmatterFields,
  parseSections,
  extractWhenToUse,
  extractSteps,
  extractExamples,
  extractTools,
  normalizePath,
  resolveSkillPath,
  type LoadAllSkillsOptions,
  type LoadSkillsFromDirOptions,
} from './loader';

// Registry
export {
  SkillRegistry,
  getGlobalSkillRegistry,
  resetGlobalSkillRegistry,
  DEFAULT_REGISTRY_CONFIG,
} from './registry';

// Swarm integration
export {
  SwarmSkillManager,
  getGlobalSwarmSkillManager,
  resetGlobalSwarmSkillManager,
  type SkillEnabledAgent,
  type SkillShareEvent,
  type SkillAwareSwarmConfig,
} from './swarm';
