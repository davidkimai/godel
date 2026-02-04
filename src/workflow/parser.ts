/**
 * Workflow Parser - YAML and JSON workflow definition parsing
 * 
 * Parse workflow definitions from YAML/JSON and validate them
 * against the workflow schema.
 */

import * as YAML from 'yaml';
import { readFileSync } from 'fs';
import { Workflow, WorkflowSchema, WorkflowValidationResult } from './types';

// ============================================================================
// Parse Workflow from YAML
// ============================================================================

export function parseWorkflowYaml(yamlContent: string): Workflow {
  const parsed = YAML.parse(yamlContent);
  return validateAndTransform(parsed);
}

export function parseWorkflowYamlFile(filePath: string): Workflow {
  const content = readFileSync(filePath, 'utf-8');
  return parseWorkflowYaml(content);
}

// ============================================================================
// Parse Workflow from JSON
// ============================================================================

export function parseWorkflowJson(jsonContent: string): Workflow {
  const parsed = JSON.parse(jsonContent);
  return validateAndTransform(parsed);
}

export function parseWorkflowJsonFile(filePath: string): Workflow {
  const content = readFileSync(filePath, 'utf-8');
  return parseWorkflowJson(content);
}

// ============================================================================
// Parse Workflow (auto-detect format)
// ============================================================================

export function parseWorkflow(content: string, format: 'yaml' | 'json' | 'auto' = 'auto'): Workflow {
  if (format === 'yaml') {
    return parseWorkflowYaml(content);
  }
  if (format === 'json') {
    return parseWorkflowJson(content);
  }

  // Auto-detect format
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseWorkflowJson(content);
  }
  return parseWorkflowYaml(content);
}

export function parseWorkflowFile(filePath: string): Workflow {
  if (filePath.endsWith('.json')) {
    return parseWorkflowJsonFile(filePath);
  }
  // Default to YAML for .yaml, .yml, or any other extension
  return parseWorkflowYamlFile(filePath);
}

// ============================================================================
// Validation
// ============================================================================

export function validateWorkflow(workflow: unknown): WorkflowValidationResult {
  const result: WorkflowValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Schema validation
  const schemaResult = WorkflowSchema.safeParse(workflow);
  if (!schemaResult.success) {
    result.valid = false;
    for (const issue of schemaResult.error.issues) {
      result.errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return result;
  }

  const validatedWorkflow = schemaResult.data;

  // Validate step references
  const stepIds = new Set(validatedWorkflow.steps.map(s => s.id));
  const stepNames = new Map<string, string>(); // name -> id mapping for duplicates

  for (const step of validatedWorkflow.steps) {
    // Check for duplicate step IDs
    if (stepNames.has(step.name)) {
      result.errors.push(`Duplicate step name: ${step.name}`);
    }
    stepNames.set(step.name, step.id);

    // Validate dependsOn references
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        result.errors.push(`Step '${step.id}' depends on non-existent step: ${dep}`);
      }
    }

    // Validate next references
    for (const next of step.next) {
      if (!stepIds.has(next)) {
        result.errors.push(`Step '${step.id}' references non-existent next step: ${next}`);
      }
    }

    // Validate condition if present
    if (step.condition) {
      if (step.condition.expression && !isValidExpression(step.condition.expression)) {
        result.warnings.push(`Step '${step.id}' has potentially invalid condition expression`);
      }
      if (step.condition.variable && !step.condition.equals !== undefined) {
        result.warnings.push(`Step '${step.id}' has condition variable without equals value`);
      }
    }

    // Warn about disconnected steps
    if (step.dependsOn.length === 0 && !isEntryStep(validatedWorkflow, step.id)) {
      result.warnings.push(`Step '${step.id}' has no dependencies and is not an entry point`);
    }
  }

  // Check for cycles
  const cycle = detectCycle(validatedWorkflow);
  if (cycle) {
    result.errors.push(`Workflow contains a cycle: ${cycle.join(' -> ')}`);
  }

  // Check for unreachable steps
  const reachableSteps = findReachableSteps(validatedWorkflow);
  for (const step of validatedWorkflow.steps) {
    if (!reachableSteps.has(step.id)) {
      result.warnings.push(`Step '${step.id}' is unreachable from any entry point`);
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

function validateAndTransform(parsed: unknown): Workflow {
  const result = validateWorkflow(parsed);
  if (!result.valid) {
    throw new Error(`Invalid workflow: ${result.errors.join(', ')}`);
  }
  return parsed as Workflow;
}

function isEntryStep(workflow: Workflow, stepId: string): boolean {
  // A step is an entry point if no other step points to it via next
  for (const step of workflow.steps) {
    if (step.next.includes(stepId)) {
      return false;
    }
  }
  return true;
}

function detectCycle(workflow: Workflow): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const stepMap = new Map(workflow.steps.map(s => [s.id, s]));

  function dfs(stepId: string, path: string[]): string[] | null {
    if (recursionStack.has(stepId)) {
      // Found cycle - return the cycle path
      const cycleStart = path.indexOf(stepId);
      return path.slice(cycleStart).concat(stepId);
    }

    if (visited.has(stepId)) {
      return null;
    }

    visited.add(stepId);
    recursionStack.add(stepId);
    path.push(stepId);

    const step = stepMap.get(stepId);
    if (step) {
      // Check both next and dependencies (they form the graph)
      const connections = [...step.next, ...step.dependsOn];
      for (const nextId of connections) {
        const cycle = dfs(nextId, path);
        if (cycle) return cycle;
      }
    }

    path.pop();
    recursionStack.delete(stepId);
    return null;
  }

  for (const step of workflow.steps) {
    const cycle = dfs(step.id, []);
    if (cycle) return cycle;
  }

  return null;
}

function findReachableSteps(workflow: Workflow): Set<string> {
  const reachable = new Set<string>();
  const stepMap = new Map(workflow.steps.map(s => [s.id, s]));

  // Find entry points (steps with no dependencies)
  const entryPoints = workflow.steps.filter(s => s.dependsOn.length === 0);

  function dfs(stepId: string): void {
    if (reachable.has(stepId)) return;
    reachable.add(stepId);

    const step = stepMap.get(stepId);
    if (step) {
      for (const nextId of step.next) {
        dfs(nextId);
      }
    }
  }

  for (const entry of entryPoints) {
    dfs(entry.id);
  }

  return reachable;
}

function isValidExpression(expression: string): boolean {
  // Basic validation for condition expressions
  // Supports: variable comparisons, logical operators, context access
  const allowedPattern = /^[\w.\[\]\s()_\-<>!=&|+\-*/'"0-9]+$/;
  return allowedPattern.test(expression);
}

// ============================================================================
// Export Utilities
// ============================================================================

export function workflowToYaml(workflow: Workflow): string {
  return YAML.stringify(workflow);
}

export function workflowToJson(workflow: Workflow, pretty = true): string {
  return JSON.stringify(workflow, null, pretty ? 2 : undefined);
}
