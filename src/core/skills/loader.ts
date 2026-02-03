/**
 * Skill Loader - Markdown Parsing for Agent Skills
 * 
 * Parses SKILL.md files according to the Agent Skills specification.
 * Extracts frontmatter, sections, steps, examples, and tools.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'path';
import {
  Skill,
  SkillFrontmatter,
  SkillSource,
  LoadSkillsResult,
  SkillDiagnostic,
  SkillSection,
  SkillExample,
  SkillTool,
  ALLOWED_FRONTMATTER_FIELDS,
  MAX_SKILL_NAME_LENGTH,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_COMPATIBILITY_LENGTH,
} from './types';

// ============================================================================
// Frontmatter Parser
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter<T extends Record<string, unknown>>(
  content: string
): { frontmatter: T; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {} as T, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];

  const frontmatter = parseYaml(frontmatterText) as T;

  return { frontmatter, body };
}

/**
 * Simple YAML parser for frontmatter
 */
function parseYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inMetadata = false;
  let metadataKey: string | null = null;
  let metadataValue: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for start of metadata block
    if (trimmed === 'metadata:') {
      // Save any pending key-value first
      if (currentKey && currentValue.length > 0) {
        result[currentKey] = currentValue.join('\n').trim();
        currentKey = null;
        currentValue = [];
      }
      result['metadata'] = {};
      inMetadata = true;
      continue;
    }

    // Handle metadata block
    if (inMetadata) {
      // Check if we've exited the metadata block (no indentation or new key at root level)
      if (trimmed === '' || (!line.startsWith(' ') && trimmed.includes(':'))) {
        // Save last metadata key
        if (metadataKey && metadataValue.length > 0) {
          const meta = result['metadata'] as Record<string, string>;
          meta[metadataKey] = metadataValue.join('\n').trim();
        }
        inMetadata = false;
        metadataKey = null;
        metadataValue = [];
        // Don't continue - process this line normally
      } else if (line.startsWith(' ')) {
        // Inside metadata block - look for key-value pairs
        const metaMatch = trimmed.match(/^([\w-]+):\s*(.*)$/);
        if (metaMatch) {
          // Save previous metadata key
          if (metadataKey && metadataValue.length > 0) {
            const meta = result['metadata'] as Record<string, string>;
            meta[metadataKey] = metadataValue.join('\n').trim();
          }
          metadataKey = metaMatch[1];
          metadataValue = [metaMatch[2]];
        } else if (metadataKey) {
          // Continuation of metadata value
          metadataValue.push(trimmed);
        }
        continue;
      } else {
        // Non-indented line in metadata - end of block
        if (metadataKey && metadataValue.length > 0) {
          const meta = result['metadata'] as Record<string, string>;
          meta[metadataKey] = metadataValue.join('\n').trim();
        }
        inMetadata = false;
        metadataKey = null;
        metadataValue = [];
      }
    }

    // Parse key-value pairs at root level
    const match = trimmed.match(/^([\w-]+):\s*(.*)$/);
    if (match) {
      // Save previous key-value
      if (currentKey && currentValue.length > 0) {
        result[currentKey] = currentValue.join('\n').trim();
      }
      currentKey = match[1];
      currentValue = [match[2]];
    } else if (currentKey && line.startsWith(' ') && !inMetadata) {
      // Continuation of multi-line value (only if not in metadata)
      currentValue.push(trimmed);
    }
  }

  // Save any pending values
  if (currentKey && currentValue.length > 0) {
    result[currentKey] = currentValue.join('\n').trim();
  }
  if (metadataKey && metadataValue.length > 0) {
    const meta = result['metadata'] as Record<string, string>;
    meta[metadataKey] = metadataValue.join('\n').trim();
  }

  return result;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate skill name per Agent Skills spec
 */
export function validateSkillName(name: string, parentDirName: string): string[] {
  const errors: string[] = [];

  if (name !== parentDirName) {
    errors.push(`name "${name}" does not match parent directory "${parentDirName}"`);
  }

  if (name.length > MAX_SKILL_NAME_LENGTH) {
    errors.push(`name exceeds ${MAX_SKILL_NAME_LENGTH} characters (${name.length})`);
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
  }

  if (name.startsWith('-') || name.endsWith('-')) {
    errors.push(`name must not start or end with a hyphen`);
  }

  if (name.includes('--')) {
    errors.push(`name must not contain consecutive hyphens`);
  }

  return errors;
}

/**
 * Validate description per spec
 */
export function validateDescription(description: string | undefined): string[] {
  const errors: string[] = [];

  if (!description || description.trim() === '') {
    errors.push('description is required');
  } else if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    errors.push(`description exceeds ${MAX_SKILL_DESCRIPTION_LENGTH} characters (${description.length})`);
  }

  return errors;
}

/**
 * Validate compatibility field
 */
export function validateCompatibility(compatibility: string | undefined): string[] {
  if (!compatibility) return [];

  const errors: string[] = [];
  if (compatibility.length > MAX_COMPATIBILITY_LENGTH) {
    errors.push(`compatibility exceeds ${MAX_COMPATIBILITY_LENGTH} characters (${compatibility.length})`);
  }
  return errors;
}

/**
 * Check for unknown frontmatter fields
 */
export function validateFrontmatterFields(keys: string[]): string[] {
  const errors: string[] = [];
  for (const key of keys) {
    if (!ALLOWED_FRONTMATTER_FIELDS.has(key)) {
      errors.push(`unknown frontmatter field "${key}"`);
    }
  }
  return errors;
}

// ============================================================================
// Markdown Body Parser
// ============================================================================

/**
 * Parse markdown sections
 */
export function parseSections(content: string): SkillSection[] {
  const sections: SkillSection[] = [];
  const lines = content.split('\n');
  let currentSection: SkillSection | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }

      // Start new section
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      currentSection = { title, level, content: '' };
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Extract "When to Use" section content
 */
export function extractWhenToUse(sections: SkillSection[]): string[] {
  const whenToUseSection = sections.find(
    s => s.title.toLowerCase().includes('when to use') || 
         s.title.toLowerCase() === 'when'
  );

  if (!whenToUseSection) return [];

  // Parse bullet points
  const lines = whenToUseSection.content.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
    } else if (line.trim() && !items.length) {
      // First non-bullet paragraph
      items.push(line.trim());
    }
  }

  return items;
}

/**
 * Extract steps from "Steps" section
 */
export function extractSteps(sections: SkillSection[]): string[] {
  const stepsSection = sections.find(
    s => s.title.toLowerCase().includes('steps') || 
         s.title.toLowerCase().includes('step-by-step') ||
         s.title.toLowerCase().includes('procedure')
  );

  if (!stepsSection) {
    // Try numbered list anywhere in content
    return [];
  }

  const lines = stepsSection.content.split('\n');
  const steps: string[] = [];

  for (const line of lines) {
    const numberedMatch = line.match(/^\d+[.\)]\s+(.+)$/);
    if (numberedMatch) {
      steps.push(numberedMatch[1].trim());
    }
  }

  return steps;
}

/**
 * Extract examples from "Examples" section
 */
export function extractExamples(sections: SkillSection[]): SkillExample[] {
  const examplesSection = sections.find(
    s => s.title.toLowerCase().includes('example') || 
         s.title.toLowerCase().includes('usage')
  );

  if (!examplesSection) return [];

  const examples: SkillExample[] = [];
  const lines = examplesSection.content.split('\n');
  let currentExample: Partial<SkillExample> | null = null;
  let inInput = false;
  let inOutput = false;
  let buffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // New example heading (### or bold)
    if (line.match(/^###\s+/) || line.match(/^\*\*Example \d+:/i)) {
      // Save previous example
      if (currentExample) {
        if (inInput) currentExample.input = buffer.join('\n').trim();
        if (inOutput) currentExample.output = buffer.join('\n').trim();
        if (currentExample.title) {
          examples.push(currentExample as SkillExample);
        }
      }

      // Start new example
      const titleMatch = line.match(/^###\s+(.+)$/) || line.match(/^\*\*(.+?)\*\*/);
      currentExample = { title: titleMatch?.[1] || 'Example' };
      buffer = [];
      inInput = false;
      inOutput = false;
      continue;
    }

    // Input section
    if (trimmed.toLowerCase().includes('input:') || trimmed.toLowerCase().includes('user:')) {
      if (inInput && buffer.length) {
        currentExample!.input = buffer.join('\n').trim();
      }
      inInput = true;
      inOutput = false;
      buffer = [];
      continue;
    }

    // Output section
    if (trimmed.toLowerCase().includes('output:') || trimmed.toLowerCase().includes('result:')) {
      if (inInput && buffer.length) {
        currentExample!.input = buffer.join('\n').trim();
      }
      inInput = false;
      inOutput = true;
      buffer = [];
      continue;
    }

    // Accumulate content
    buffer.push(line);
  }

  // Save last example
  if (currentExample) {
    if (inInput) currentExample.input = buffer.join('\n').trim();
    if (inOutput) currentExample.output = buffer.join('\n').trim();
    if (currentExample.title) {
      examples.push(currentExample as SkillExample);
    }
  }

  return examples;
}

/**
 * Extract available tools from "Tools" section
 */
export function extractTools(sections: SkillSection[]): SkillTool[] {
  const toolsSection = sections.find(
    s => s.title.toLowerCase().includes('tools') || 
         s.title.toLowerCase().includes('tool available')
  );

  if (!toolsSection) return [];

  const tools: SkillTool[] = [];
  const lines = toolsSection.content.split('\n');

  for (const line of lines) {
    // Match: - `tool-name`: description
    const toolMatch = line.match(/^[-*]\s+`?([^`:]+)`?\s*:\s*(.+)$/);
    if (toolMatch) {
      tools.push({
        name: toolMatch[1].trim(),
        description: toolMatch[2].trim(),
      });
    }
  }

  return tools;
}

// ============================================================================
// Skill File Loading
// ============================================================================

/**
 * Load a single skill from file
 */
export function loadSkillFromFile(
  filePath: string,
  source: SkillSource
): { skill: Skill | null; diagnostics: SkillDiagnostic[] } {
  const diagnostics: SkillDiagnostic[] = [];

  try {
    const rawContent = readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter<SkillFrontmatter>(rawContent);
    const allKeys = Object.keys(frontmatter);
    const skillDir = dirname(filePath);
    const parentDirName = basename(skillDir);

    // Validate frontmatter fields
    const fieldErrors = validateFrontmatterFields(allKeys);
    for (const error of fieldErrors) {
      diagnostics.push({ type: 'warning', message: error, path: filePath });
    }

    // Validate description
    const descErrors = validateDescription(frontmatter.description);
    for (const error of descErrors) {
      diagnostics.push({ type: 'warning', message: error, path: filePath });
    }

    // Use name from frontmatter, or fall back to parent directory name
    const name = frontmatter.name || parentDirName;

    // Validate name
    const nameErrors = validateSkillName(name, parentDirName);
    for (const error of nameErrors) {
      diagnostics.push({ type: 'warning', message: error, path: filePath });
    }

    // Still load the skill even with warnings (unless description is completely missing)
    if (!frontmatter.description || frontmatter.description.trim() === '') {
      diagnostics.push({ 
        type: 'error', 
        message: 'Skill requires a description in frontmatter', 
        path: filePath 
      });
      return { skill: null, diagnostics };
    }

    // Parse sections and extract structured data
    const sections = parseSections(body);
    const whenToUse = extractWhenToUse(sections);
    const steps = extractSteps(sections);
    const examples = extractExamples(sections);
    const tools = extractTools(sections);

    // Extract references to other files
    const references = extractReferences(body);
    const scripts = extractScripts(body);

    return {
      skill: {
        name,
        description: frontmatter.description,
        filePath,
        baseDir: skillDir,
        source,
        content: rawContent,
        frontmatter,
        disableModelInvocation: frontmatter['disable-model-invocation'] === true,
        sections,
        whenToUse,
        steps,
        examples,
        tools,
        references,
        scripts,
      },
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse skill file';
    diagnostics.push({ type: 'error', message, path: filePath });
    return { skill: null, diagnostics };
  }
}

/**
 * Extract references to other files in the skill
 */
function extractReferences(content: string): string[] {
  const references: string[] = [];
  const refRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = refRegex.exec(content)) !== null) {
    const path = match[2];
    if (!path.startsWith('http') && !path.startsWith('#')) {
      references.push(path);
    }
  }

  return [...new Set(references)];
}

/**
 * Extract script references
 */
function extractScripts(content: string): string[] {
  const scripts: string[] = [];
  const scriptRegex = /scripts\/([^\s\])]+)/g;
  let match;

  while ((match = scriptRegex.exec(content)) !== null) {
    scripts.push(match[1]);
  }

  return [...new Set(scripts)];
}

// ============================================================================
// Directory Loading
// ============================================================================

export interface LoadSkillsFromDirOptions {
  /** Directory to scan for skills */
  dir: string;
  /** Source identifier for these skills */
  source: SkillSource;
  /** Include root-level .md files */
  includeRootFiles?: boolean;
}

/**
 * Load skills from a directory
 * 
 * Discovery rules:
 * - Direct .md children in the root (if includeRootFiles)
 * - Recursive SKILL.md under subdirectories
 */
export function loadSkillsFromDir(options: LoadSkillsFromDirOptions): LoadSkillsResult {
  const { dir, source, includeRootFiles = true } = options;
  return loadSkillsFromDirInternal(dir, source, includeRootFiles);
}

function loadSkillsFromDirInternal(
  dir: string, 
  source: SkillSource, 
  includeRootFiles: boolean
): LoadSkillsResult {
  const skills: Skill[] = [];
  const diagnostics: SkillDiagnostic[] = [];

  if (!existsSync(dir)) {
    return { skills, diagnostics };
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      // Skip node_modules to avoid scanning dependencies
      if (entry.name === 'node_modules') {
        continue;
      }

      const fullPath = join(dir, entry.name);

      // For symlinks, check if they point to a directory and follow them
      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const stats = statSync(fullPath);
          isDirectory = stats.isDirectory();
          isFile = stats.isFile();
        } catch {
          // Broken symlink, skip it
          continue;
        }
      }

      if (isDirectory) {
        const subResult = loadSkillsFromDirInternal(fullPath, source, false);
        skills.push(...subResult.skills);
        diagnostics.push(...subResult.diagnostics);
        continue;
      }

      if (!isFile) {
        continue;
      }

      const isRootMd = includeRootFiles && entry.name.endsWith('.md');
      const isSkillMd = !includeRootFiles && entry.name === 'SKILL.md';
      if (!isRootMd && !isSkillMd) {
        continue;
      }

      const result = loadSkillFromFile(fullPath, source);
      if (result.skill) {
        skills.push(result.skill);
      }
      diagnostics.push(...result.diagnostics);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read directory';
    diagnostics.push({ type: 'error', message, path: dir });
  }

  return { skills, diagnostics };
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Normalize path with ~ expansion
 */
export function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '~') return homedir();
  if (trimmed.startsWith('~/')) return join(homedir(), trimmed.slice(2));
  if (trimmed.startsWith('~')) return join(homedir(), trimmed.slice(1));
  return trimmed;
}

/**
 * Resolve skill path relative to cwd
 */
export function resolveSkillPath(p: string, cwd: string): string {
  const normalized = normalizePath(p);
  return isAbsolute(normalized) ? normalized : resolve(cwd, normalized);
}

// ============================================================================
// Main Load Function
// ============================================================================

export interface LoadAllSkillsOptions {
  /** Working directory for project-local skills */
  cwd?: string;
  /** User skills directory (~/.dash/skills) */
  userSkillsDir?: string;
  /** Project skills directory */
  projectSkillsDir?: string;
  /** Built-in skills directory */
  builtinSkillsDir?: string;
  /** Explicit skill paths */
  skillPaths?: string[];
  /** Include default skills directories */
  includeDefaults?: boolean;
}

/**
 * Load skills from all configured locations
 */
export function loadAllSkills(options: LoadAllSkillsOptions = {}): LoadSkillsResult {
  const {
    cwd = process.cwd(),
    userSkillsDir = join(homedir(), '.dash', 'skills'),
    projectSkillsDir = resolve(cwd, '.dash', 'skills'),
    builtinSkillsDir = resolve(cwd, 'skills'),
    skillPaths = [],
    includeDefaults = true,
  } = options;

  const skillMap = new Map<string, Skill>();
  const realPathSet = new Set<string>();
  const allDiagnostics: SkillDiagnostic[] = [];
  const collisionDiagnostics: SkillDiagnostic[] = [];

  function addSkills(result: LoadSkillsResult, source: SkillSource) {
    allDiagnostics.push(...result.diagnostics);
    for (const skill of result.skills) {
      // Resolve symlinks to detect duplicate files
      let realPath: string;
      try {
        realPath = realpathSync(skill.filePath);
      } catch {
        realPath = skill.filePath;
      }

      // Skip silently if we've already loaded this exact file (via symlink)
      if (realPathSet.has(realPath)) {
        continue;
      }

      const existing = skillMap.get(skill.name);
      if (existing) {
        collisionDiagnostics.push({
          type: 'warning',
          message: `Name "${skill.name}" collision: ${skill.filePath} vs ${existing.filePath}`,
          path: skill.filePath,
          collision: {
            resourceType: 'skill',
            name: skill.name,
            winnerPath: existing.filePath,
            loserPath: skill.filePath,
          },
        });
      } else {
        skillMap.set(skill.name, skill);
        realPathSet.add(realPath);
      }
    }
  }

  // Load from default directories
  if (includeDefaults) {
    // User skills (~/.dash/skills)
    addSkills(loadSkillsFromDir({ dir: userSkillsDir, source: 'user' }), 'user');

    // Project skills (./.dash/skills)
    addSkills(loadSkillsFromDir({ dir: projectSkillsDir, source: 'project' }), 'project');

    // Built-in skills (./skills)
    addSkills(loadSkillsFromDir({ dir: builtinSkillsDir, source: 'builtin' }), 'builtin');
  }

  // Load from explicit paths
  for (const rawPath of skillPaths) {
    const resolvedPath = resolveSkillPath(rawPath, cwd);
    if (!existsSync(resolvedPath)) {
      allDiagnostics.push({ 
        type: 'warning', 
        message: 'Skill path does not exist', 
        path: resolvedPath 
      });
      continue;
    }

    try {
      const stats = statSync(resolvedPath);
      if (stats.isDirectory()) {
        addSkills(loadSkillsFromDir({ dir: resolvedPath, source: 'path' }), 'path');
      } else if (stats.isFile() && resolvedPath.endsWith('.md')) {
        const result = loadSkillFromFile(resolvedPath, 'path');
        if (result.skill) {
          addSkills({ skills: [result.skill], diagnostics: result.diagnostics }, 'path');
        } else {
          allDiagnostics.push(...result.diagnostics);
        }
      } else {
        allDiagnostics.push({ 
          type: 'warning', 
          message: 'Skill path is not a markdown file', 
          path: resolvedPath 
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read skill path';
      allDiagnostics.push({ type: 'error', message, path: resolvedPath });
    }
  }

  return {
    skills: Array.from(skillMap.values()),
    diagnostics: [...allDiagnostics, ...collisionDiagnostics],
  };
}

// ============================================================================
// Skill Formatting
// ============================================================================

/**
 * Format skills for inclusion in a system prompt
 * Uses XML format per Agent Skills standard
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  const visibleSkills = skills.filter((s) => !s.disableModelInvocation);

  if (visibleSkills.length === 0) {
    return '';
  }

  const lines = [
    '\n\nThe following skills provide specialized instructions for specific tasks.',
    'Use the read tool to load a skill\'s file when the task matches its description.',
    'When a skill file references a relative path, resolve it against the skill directory',
    '(parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.',
    '',
    '<available_skills>',
  ];

  for (const skill of visibleSkills) {
    lines.push('  <skill>');
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push('  </skill>');
  }

  lines.push('</available_skills>');

  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
