/**
 * @fileoverview Intent Templates - Template loading and management for intent execution
 * 
 * This module provides YAML template loading for intent execution patterns.
 * Templates define execution strategies for different types of tasks.
 * 
 * @module @godel/cli/intent/templates
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import * as YAML from 'yaml';
import { logger } from '../../utils/logger';

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

/**
 * Phase definition within a template
 */
export interface TemplatePhase {
  /** Phase name */
  name: string;
  /** Phase description */
  description: string;
  /** Number of agents for this phase */
  agentCount: number;
  /** Task template string with placeholders */
  taskTemplate: string;
}

/**
 * Intent template definition
 */
export interface IntentTemplate {
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** Natural language patterns that match this template */
  patterns: string[];
  /** Execution strategy */
  strategy: 'parallel' | 'sequential' | 'careful';
  /** Default number of agents */
  defaultAgents: number;
  /** Execution phases */
  phases: TemplatePhase[];
}

// ============================================================================
// TEMPLATE LOADER
// ============================================================================

const TEMPLATES_DIR = resolve(__dirname, '../../../templates');

/**
 * Load a template by name
 * 
 * @param templateName - Name of the template file (without .yaml extension)
 * @returns The loaded template or null if not found
 */
export function loadTemplate(templateName: string): IntentTemplate | null {
  const templatePath = resolve(TEMPLATES_DIR, `${templateName}.yaml`);
  
  if (!existsSync(templatePath)) {
    logger.debug(`Template not found: ${templatePath}`);
    return null;
  }
  
  try {
    const content = readFileSync(templatePath, 'utf-8');
    const template = YAML.parse(content) as IntentTemplate;
    
    // Validate template structure
    if (!validateTemplate(template)) {
      logger.warn(`Invalid template structure: ${templateName}`);
      return null;
    }
    
    return template;
  } catch (error) {
    logger.warn(`Failed to load template ${templateName}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Load all available templates
 * 
 * @returns Array of loaded templates
 */
export function loadAllTemplates(): IntentTemplate[] {
  if (!existsSync(TEMPLATES_DIR)) {
    logger.warn(`Templates directory not found: ${TEMPLATES_DIR}`);
    return [];
  }
  
  const templates: IntentTemplate[] = [];
  
  try {
    const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.yaml'));
    
    for (const file of files) {
      const templateName = file.replace('.yaml', '');
      const template = loadTemplate(templateName);
      if (template) {
        templates.push(template);
      }
    }
  } catch (error) {
    logger.warn('Failed to load templates:', error instanceof Error ? error.message : String(error));
  }
  
  return templates;
}

/**
 * Get the appropriate template for an intent type
 * 
 * @param intentType - Type of intent
 * @returns Matching template or null
 */
export function getTemplateForIntentType(intentType: string): IntentTemplate | null {
  const templateMap: Record<string, string> = {
    'implement': 'feature-implementation',
    'refactor': 'refactoring',
    'test': 'testing',
    'review': 'security-audit',
    'analyze': 'security-audit',
    'deploy': 'feature-implementation',
    'fix': 'feature-implementation',
  };
  
  const templateName = templateMap[intentType.toLowerCase()];
  return templateName ? loadTemplate(templateName) : null;
}

/**
 * Interpolate template variables into a task string
 * 
 * @param template - The template string with placeholders
 * @param variables - Object containing variable values
 * @returns Interpolated string
 */
export function interpolateTemplate(
  template: string, 
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

/**
 * Generate execution phases from a template
 * 
 * @param template - The intent template
 * @param description - Task description
 * @param target - Target/subject of the task
 * @returns Array of phase definitions with interpolated tasks
 */
export function generatePhasesFromTemplate(
  template: IntentTemplate,
  description: string,
  target?: string
): Array<{
  name: string;
  description: string;
  agents: number;
  tasks: string[];
}> {
  return template.phases.map(phase => ({
    name: phase.name,
    description: phase.description,
    agents: phase.agentCount,
    tasks: [
      interpolateTemplate(phase.taskTemplate, {
        description,
        target: target || description,
        type: template.name,
      }),
    ],
  }));
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate template structure
 * 
 * @param template - Template to validate
 * @returns True if valid
 */
function validateTemplate(template: unknown): template is IntentTemplate {
  if (!template || typeof template !== 'object') {
    return false;
  }
  
  const t = template as Partial<IntentTemplate>;
  
  // Check required fields
  if (!t.name || typeof t.name !== 'string') {
    return false;
  }
  
  if (!t.description || typeof t.description !== 'string') {
    return false;
  }
  
  if (!Array.isArray(t.patterns)) {
    return false;
  }
  
  if (!t.strategy || !['parallel', 'sequential', 'careful'].includes(t.strategy)) {
    return false;
  }
  
  if (typeof t.defaultAgents !== 'number' || t.defaultAgents < 1) {
    return false;
  }
  
  if (!Array.isArray(t.phases) || t.phases.length === 0) {
    return false;
  }
  
  // Validate phases
  for (const phase of t.phases) {
    if (!phase.name || typeof phase.name !== 'string') {
      return false;
    }
    if (!phase.taskTemplate || typeof phase.taskTemplate !== 'string') {
      return false;
    }
    if (typeof phase.agentCount !== 'number' || phase.agentCount < 1) {
      return false;
    }
  }
  
  return true;
}

// ============================================================================
// TEMPLATE UTILITIES
// ============================================================================

/**
 * List available template names
 * 
 * @returns Array of template names
 */
export function listTemplates(): string[] {
  if (!existsSync(TEMPLATES_DIR)) {
    return [];
  }
  
  try {
    return readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.yaml'))
      .map(f => f.replace('.yaml', ''));
  } catch {
    return [];
  }
}

/**
 * Check if a template exists
 * 
 * @param templateName - Name of the template
 * @returns True if exists
 */
export function templateExists(templateName: string): boolean {
  return existsSync(resolve(TEMPLATES_DIR, `${templateName}.yaml`));
}

/**
 * Get template info for display
 * 
 * @param templateName - Name of the template
 * @returns Formatted template info or null
 */
export function getTemplateInfo(templateName: string): {
  name: string;
  description: string;
  strategy: string;
  phases: number;
} | null {
  const template = loadTemplate(templateName);
  if (!template) {
    return null;
  }
  
  return {
    name: template.name,
    description: template.description,
    strategy: template.strategy,
    phases: template.phases.length,
  };
}
