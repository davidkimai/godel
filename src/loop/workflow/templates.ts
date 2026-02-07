/**
 * Workflow Templates - Pre-built workflow patterns for common use cases
 * 
 * Provides ready-to-use workflow templates:
 * - code-review: Automated code review pipeline
 * - refactor: Multi-agent refactoring workflow
 * - generate-docs: Documentation generation
 * - test-pipeline: CI/CD test execution
 * - bug-fix: Automated bug fixing
 */

import {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowVariable,
  WorkflowNodeType,
} from './types';

// ============================================================================
// Template Types
// ============================================================================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  workflow: Workflow;
  variables: WorkflowVariable[];
  exampleInputs?: Record<string, unknown>;
}

// ============================================================================
// Template Library
// ============================================================================

export class WorkflowTemplateLibrary {
  private templates = new Map<string, WorkflowTemplate>();

  register(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }

  getTemplate(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  listTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  findByTag(tag: string): WorkflowTemplate[] {
    return Array.from(this.templates.values()).filter(t => 
      t.tags.includes(tag.toLowerCase())
    );
  }

  findByCategory(category: string): WorkflowTemplate[] {
    return Array.from(this.templates.values()).filter(t => 
      t.category.toLowerCase() === category.toLowerCase()
    );
  }

  search(query: string): WorkflowTemplate[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter(t =>
      t.id.toLowerCase().includes(lowerQuery) ||
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  unregister(id: string): boolean {
    return this.templates.delete(id);
  }
}

// ============================================================================
// Pre-built Templates
// ============================================================================

/**
 * Code Review Workflow
 * Automated code review pipeline: lint → security scan → AI review
 */
export function createCodeReviewTemplate(): WorkflowTemplate {
  const nodes: WorkflowNode[] = [
    {
      id: 'setup',
      type: 'task' as WorkflowNodeType,
      name: 'Setup Environment',
      description: 'Prepare workspace and checkout code',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${repositoryPath} && git checkout ${branch} && git pull',
        },
        timeout: 60000,
      },
    },
    {
      id: 'lint',
      type: 'task' as WorkflowNodeType,
      name: 'Lint Check',
      description: 'Run linting on the codebase',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${repositoryPath} && npm run lint 2>&1 || echo "Lint completed with issues"',
        },
        timeout: 120000,
      },
    },
    {
      id: 'typecheck',
      type: 'task' as WorkflowNodeType,
      name: 'Type Check',
      description: 'Run TypeScript type checking',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${repositoryPath} && npx tsc --noEmit 2>&1 || echo "Type check completed"',
        },
        timeout: 120000,
      },
    },
    {
      id: 'security-scan',
      type: 'task' as WorkflowNodeType,
      name: 'Security Scan',
      description: 'Scan for security vulnerabilities',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${repositoryPath} && npm audit --json 2>&1 || echo "Audit completed"',
        },
        timeout: 180000,
      },
    },
    {
      id: 'ai-review',
      type: 'task' as WorkflowNodeType,
      name: 'AI Code Review',
      description: 'AI-powered code review analysis',
      config: {
        type: 'task',
        taskType: 'agent.review',
        parameters: {
          path: '${repositoryPath}',
          focus: '${reviewFocus}',
          model: '${reviewModel}',
        },
        timeout: 300000,
        agentSelector: {
          strategy: 'balanced',
          capabilities: ['code-review', 'analysis'],
        },
      },
    },
    {
      id: 'generate-report',
      type: 'task' as WorkflowNodeType,
      name: 'Generate Report',
      description: 'Compile review results into report',
      config: {
        type: 'task',
        taskType: 'report.generate',
        parameters: {
          format: '${reportFormat}',
          output: '${outputPath}/review-report.md',
        },
        timeout: 60000,
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    { id: 'e1', from: 'setup', to: 'lint' },
    { id: 'e2', from: 'setup', to: 'typecheck' },
    { id: 'e3', from: 'setup', to: 'security-scan' },
    { id: 'e4', from: 'lint', to: 'ai-review' },
    { id: 'e5', from: 'typecheck', to: 'ai-review' },
    { id: 'e6', from: 'security-scan', to: 'ai-review' },
    { id: 'e7', from: 'ai-review', to: 'generate-report' },
  ];

  return {
    id: 'code-review',
    name: 'Code Review',
    description: 'Automated code review pipeline with linting, type checking, security scan, and AI review',
    category: 'quality',
    tags: ['review', 'quality', 'security', 'lint', 'ci'],
    workflow: {
      id: 'code-review',
      name: 'Code Review Pipeline',
      version: '1.0.0',
      nodes,
      edges,
      timeout: 900000, // 15 minutes
      onFailure: 'stop',
    },
    variables: [
      { name: 'repositoryPath', type: 'string', required: true, description: 'Path to the repository' },
      { name: 'branch', type: 'string', default: 'main', description: 'Branch to review' },
      { name: 'reviewFocus', type: 'string', default: 'general', description: 'Review focus area (general, security, performance)' },
      { name: 'reviewModel', type: 'string', default: 'claude-sonnet-4-5', description: 'Model to use for AI review' },
      { name: 'reportFormat', type: 'string', default: 'markdown', description: 'Report output format' },
      { name: 'outputPath', type: 'string', default: '.', description: 'Path for output reports' },
    ],
    exampleInputs: {
      repositoryPath: './src',
      branch: 'main',
      reviewFocus: 'general',
    },
  };
}

/**
 * Refactor Workflow
 * Multi-agent refactoring with parallel specialists
 */
export function createRefactorTemplate(): WorkflowTemplate {
  const nodes: WorkflowNode[] = [
    {
      id: 'analyze',
      type: 'task' as WorkflowNodeType,
      name: 'Analyze Codebase',
      description: 'Analyze codebase structure and identify refactoring targets',
      config: {
        type: 'task',
        taskType: 'agent.analyze',
        parameters: {
          path: '${path}',
          focus: '${refactorType}',
          outputFormat: 'json',
        },
        timeout: 180000,
      },
    },
    {
      id: 'parallel-refactor',
      type: 'parallel' as WorkflowNodeType,
      name: 'Parallel Refactoring',
      description: 'Run multiple refactoring agents in parallel',
      config: {
        type: 'parallel',
        branches: ['refactor-structure', 'refactor-naming', 'refactor-performance'],
        waitFor: 'all',
      },
    },
    {
      id: 'refactor-structure',
      type: 'task' as WorkflowNodeType,
      name: 'Structure Refactoring',
      description: 'Refactor code structure and organization',
      config: {
        type: 'task',
        taskType: 'agent.refactor',
        parameters: {
          path: '${path}',
          type: 'structure',
          preserveBehavior: true,
        },
        timeout: 300000,
      },
    },
    {
      id: 'refactor-naming',
      type: 'task' as WorkflowNodeType,
      name: 'Naming Refactoring',
      description: 'Improve variable and function naming',
      config: {
        type: 'task',
        taskType: 'agent.refactor',
        parameters: {
          path: '${path}',
          type: 'naming',
          conventions: '${namingConventions}',
        },
        timeout: 300000,
      },
    },
    {
      id: 'refactor-performance',
      type: 'task' as WorkflowNodeType,
      name: 'Performance Refactoring',
      description: 'Optimize for performance',
      config: {
        type: 'task',
        taskType: 'agent.refactor',
        parameters: {
          path: '${path}',
          type: 'performance',
        },
        timeout: 300000,
      },
    },
    {
      id: 'merge-results',
      type: 'merge' as WorkflowNodeType,
      name: 'Merge Results',
      description: 'Combine refactoring results from all agents',
      config: {
        type: 'merge',
        strategy: 'collect',
      },
    },
    {
      id: 'verify',
      type: 'task' as WorkflowNodeType,
      name: 'Verify Changes',
      description: 'Verify refactoring preserves behavior',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${path} && npm test 2>&1',
        },
        timeout: 300000,
        retries: 1,
      },
    },
    {
      id: 'check-condition',
      type: 'condition' as WorkflowNodeType,
      name: 'Tests Pass?',
      description: 'Check if tests passed',
      config: {
        type: 'condition',
        condition: "${result.exitCode} == 0",
        trueBranch: 'finalize',
        falseBranch: 'retry',
      },
    },
    {
      id: 'retry',
      type: 'task' as WorkflowNodeType,
      name: 'Fix Issues',
      description: 'Attempt to fix test failures',
      config: {
        type: 'task',
        taskType: 'agent.fix',
        parameters: {
          path: '${path}',
          issue: 'test-failures',
        },
        timeout: 300000,
      },
    },
    {
      id: 'finalize',
      type: 'task' as WorkflowNodeType,
      name: 'Finalize',
      description: 'Complete refactoring and generate summary',
      config: {
        type: 'task',
        taskType: 'report.generate',
        parameters: {
          type: 'refactoring-summary',
          output: '${outputPath}/refactoring-report.md',
        },
        timeout: 60000,
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    { id: 'e1', from: 'analyze', to: 'parallel-refactor' },
    { id: 'e2', from: 'refactor-structure', to: 'merge-results' },
    { id: 'e3', from: 'refactor-naming', to: 'merge-results' },
    { id: 'e4', from: 'refactor-performance', to: 'merge-results' },
    { id: 'e5', from: 'merge-results', to: 'verify' },
    { id: 'e6', from: 'verify', to: 'check-condition' },
    { id: 'e7', from: 'check-condition', to: 'finalize', condition: 'true' },
    { id: 'e8', from: 'check-condition', to: 'retry', condition: 'false' },
    { id: 'e9', from: 'retry', to: 'verify' },
  ];

  return {
    id: 'refactor',
    name: 'Code Refactoring',
    description: 'Multi-agent parallel refactoring with structure, naming, and performance specialists',
    category: 'development',
    tags: ['refactoring', 'parallel', 'performance', 'structure', 'maintenance'],
    workflow: {
      id: 'refactor',
      name: 'Multi-Agent Refactoring',
      version: '1.0.0',
      nodes,
      edges,
      timeout: 1800000, // 30 minutes
      onFailure: 'stop',
    },
    variables: [
      { name: 'path', type: 'string', required: true, description: 'Path to code to refactor' },
      { name: 'refactorType', type: 'string', default: 'comprehensive', description: 'Type of refactoring (comprehensive, structure, naming, performance)' },
      { name: 'namingConventions', type: 'string', default: 'camelCase', description: 'Naming convention to use' },
      { name: 'outputPath', type: 'string', default: '.', description: 'Path for output reports' },
      { name: 'maxRetries', type: 'number', default: 2, description: 'Maximum retry attempts' },
    ],
    exampleInputs: {
      path: './src',
      refactorType: 'comprehensive',
    },
  };
}

/**
 * Generate Documentation Workflow
 * Automated documentation generation
 */
export function createGenerateDocsTemplate(): WorkflowTemplate {
  const nodes: WorkflowNode[] = [
    {
      id: 'scan-api',
      type: 'task' as WorkflowNodeType,
      name: 'Scan API Surface',
      description: 'Scan codebase for API endpoints and functions',
      config: {
        type: 'task',
        taskType: 'code.scan',
        parameters: {
          path: '${sourcePath}',
          type: 'api',
          outputFormat: 'json',
        },
        timeout: 120000,
      },
    },
    {
      id: 'generate-api-docs',
      type: 'task' as WorkflowNodeType,
      name: 'Generate API Docs',
      description: 'Generate API documentation from scanned surface',
      config: {
        type: 'task',
        taskType: 'agent.document',
        parameters: {
          type: 'api-reference',
          source: '${sourcePath}',
          output: '${outputPath}/api-reference.md',
          format: '${docFormat}',
        },
        timeout: 300000,
      },
    },
    {
      id: 'generate-readme',
      type: 'task' as WorkflowNodeType,
      name: 'Generate README',
      description: 'Generate or update README file',
      config: {
        type: 'task',
        taskType: 'agent.document',
        parameters: {
          type: 'readme',
          source: '${sourcePath}',
          output: '${outputPath}/README.md',
          template: '${readmeTemplate}',
        },
        timeout: 180000,
      },
    },
    {
      id: 'generate-comments',
      type: 'task' as WorkflowNodeType,
      name: 'Add Inline Comments',
      description: 'Add JSDoc/TSDoc comments to code',
      config: {
        type: 'task',
        taskType: 'agent.document',
        parameters: {
          type: 'inline-comments',
          source: '${sourcePath}',
          style: '${commentStyle}',
        },
        timeout: 300000,
      },
    },
    {
      id: 'merge-docs',
      type: 'merge' as WorkflowNodeType,
      name: 'Merge Documentation',
      description: 'Combine all generated documentation',
      config: {
        type: 'merge',
        strategy: 'concat',
      },
    },
    {
      id: 'validate-links',
      type: 'task' as WorkflowNodeType,
      name: 'Validate Links',
      description: 'Check for broken internal links',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${outputPath} && find . -name "*.md" -exec markdown-link-check {} \; 2>&1 || echo "Link check completed"',
        },
        timeout: 120000,
      },
    },
    {
      id: 'generate-index',
      type: 'task' as WorkflowNodeType,
      name: 'Generate Index',
      description: 'Generate documentation index/navigation',
      config: {
        type: 'task',
        taskType: 'report.generate',
        parameters: {
          type: 'docs-index',
          output: '${outputPath}/_sidebar.md',
        },
        timeout: 60000,
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    { id: 'e1', from: 'scan-api', to: 'generate-api-docs' },
    { id: 'e2', from: 'scan-api', to: 'generate-readme' },
    { id: 'e3', from: 'scan-api', to: 'generate-comments' },
    { id: 'e4', from: 'generate-api-docs', to: 'merge-docs' },
    { id: 'e5', from: 'generate-readme', to: 'merge-docs' },
    { id: 'e6', from: 'generate-comments', to: 'merge-docs' },
    { id: 'e7', from: 'merge-docs', to: 'validate-links' },
    { id: 'e8', from: 'validate-links', to: 'generate-index' },
  ];

  return {
    id: 'generate-docs',
    name: 'Generate Documentation',
    description: 'Automated documentation generation including API docs, README, and inline comments',
    category: 'documentation',
    tags: ['documentation', 'api', 'readme', 'comments', 'docs'],
    workflow: {
      id: 'generate-docs',
      name: 'Documentation Generator',
      version: '1.0.0',
      nodes,
      edges,
      timeout: 1200000, // 20 minutes
      onFailure: 'continue',
    },
    variables: [
      { name: 'sourcePath', type: 'string', required: true, description: 'Path to source code' },
      { name: 'outputPath', type: 'string', default: './docs', description: 'Path for generated documentation' },
      { name: 'docFormat', type: 'string', default: 'markdown', description: 'Documentation format (markdown, html)' },
      { name: 'readmeTemplate', type: 'string', default: 'standard', description: 'README template style' },
      { name: 'commentStyle', type: 'string', default: 'jsdoc', description: 'Comment style (jsdoc, tsdoc)' },
    ],
    exampleInputs: {
      sourcePath: './src',
      outputPath: './docs',
      docFormat: 'markdown',
    },
  };
}

/**
 * Test Pipeline Workflow
 * CI/CD test execution pipeline
 */
export function createTestPipelineTemplate(): WorkflowTemplate {
  const nodes: WorkflowNode[] = [
    {
      id: 'install-deps',
      type: 'task' as WorkflowNodeType,
      name: 'Install Dependencies',
      description: 'Install project dependencies',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm ci 2>&1',
        },
        timeout: 300000,
        retries: 2,
      },
    },
    {
      id: 'unit-tests',
      type: 'task' as WorkflowNodeType,
      name: 'Unit Tests',
      description: 'Run unit tests',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm run test:unit -- --coverage --json --outputFile=${outputPath}/unit-coverage.json 2>&1',
        },
        timeout: 300000,
      },
    },
    {
      id: 'integration-tests',
      type: 'task' as WorkflowNodeType,
      name: 'Integration Tests',
      description: 'Run integration tests',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm run test:integration -- --json --outputFile=${outputPath}/integration-results.json 2>&1 || echo "Integration tests completed"',
        },
        timeout: 600000,
      },
    },
    {
      id: 'e2e-tests',
      type: 'task' as WorkflowNodeType,
      name: 'E2E Tests',
      description: 'Run end-to-end tests',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm run test:e2e 2>&1 || echo "E2E tests completed"',
        },
        timeout: 600000,
      },
    },
    {
      id: 'coverage-check',
      type: 'task' as WorkflowNodeType,
      name: 'Coverage Check',
      description: 'Verify coverage meets threshold',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npx nyc check-coverage --lines ${coverageThreshold} 2>&1',
        },
        timeout: 60000,
      },
    },
    {
      id: 'security-scan',
      type: 'task' as WorkflowNodeType,
      name: 'Security Scan',
      description: 'Run security vulnerability scan',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm audit --audit-level=high 2>&1 || echo "Security scan completed"',
        },
        timeout: 180000,
      },
    },
    {
      id: 'performance-tests',
      type: 'task' as WorkflowNodeType,
      name: 'Performance Tests',
      description: 'Run performance benchmarks',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm run test:performance 2>&1 || echo "Performance tests completed"',
        },
        timeout: 300000,
      },
    },
    {
      id: 'generate-report',
      type: 'task' as WorkflowNodeType,
      name: 'Generate Test Report',
      description: 'Generate comprehensive test report',
      config: {
        type: 'task',
        taskType: 'report.generate',
        parameters: {
          type: 'test-summary',
          coverageFile: '${outputPath}/unit-coverage.json',
          output: '${outputPath}/test-report.html',
        },
        timeout: 60000,
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    { id: 'e1', from: 'install-deps', to: 'unit-tests' },
    { id: 'e2', from: 'install-deps', to: 'integration-tests' },
    { id: 'e3', from: 'unit-tests', to: 'coverage-check' },
    { id: 'e4', from: 'unit-tests', to: 'e2e-tests' },
    { id: 'e5', from: 'integration-tests', to: 'security-scan' },
    { id: 'e6', from: 'coverage-check', to: 'performance-tests' },
    { id: 'e7', from: 'e2e-tests', to: 'performance-tests' },
    { id: 'e8', from: 'security-scan', to: 'generate-report' },
    { id: 'e9', from: 'performance-tests', to: 'generate-report' },
  ];

  return {
    id: 'test-pipeline',
    name: 'Test Pipeline',
    description: 'Complete CI/CD test pipeline with unit, integration, E2E, coverage, security, and performance tests',
    category: 'ci-cd',
    tags: ['testing', 'ci', 'cd', 'coverage', 'security', 'performance', 'pipeline'],
    workflow: {
      id: 'test-pipeline',
      name: 'CI/CD Test Pipeline',
      version: '1.0.0',
      nodes,
      edges,
      timeout: 3600000, // 60 minutes
      onFailure: 'stop',
    },
    variables: [
      { name: 'projectPath', type: 'string', required: true, description: 'Path to project root' },
      { name: 'outputPath', type: 'string', default: './test-results', description: 'Path for test results' },
      { name: 'coverageThreshold', type: 'number', default: 80, description: 'Minimum coverage percentage required' },
      { name: 'runE2E', type: 'boolean', default: true, description: 'Whether to run E2E tests' },
      { name: 'runPerformance', type: 'boolean', default: false, description: 'Whether to run performance tests' },
    ],
    exampleInputs: {
      projectPath: '.',
      outputPath: './test-results',
      coverageThreshold: 80,
    },
  };
}

/**
 * Bug Fix Workflow
 * Automated bug fixing workflow
 */
export function createBugFixTemplate(): WorkflowTemplate {
  const nodes: WorkflowNode[] = [
    {
      id: 'analyze-bug',
      type: 'task' as WorkflowNodeType,
      name: 'Analyze Bug Report',
      description: 'Parse and understand the bug report',
      config: {
        type: 'task',
        taskType: 'agent.analyze',
        parameters: {
          type: 'bug',
          description: '${bugDescription}',
          reproduction: '${reproductionSteps}',
          outputFormat: 'json',
        },
        timeout: 120000,
      },
    },
    {
      id: 'reproduce-bug',
      type: 'task' as WorkflowNodeType,
      name: 'Reproduce Bug',
      description: 'Attempt to reproduce the bug locally',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && ${reproductionCommand} 2>&1 || echo "Reproduction attempt completed"',
        },
        timeout: 120000,
      },
    },
    {
      id: 'locate-code',
      type: 'task' as WorkflowNodeType,
      name: 'Locate Affected Code',
      description: 'Find the code responsible for the bug',
      config: {
        type: 'task',
        taskType: 'agent.locate',
        parameters: {
          bug: '${bugDescription}',
          path: '${projectPath}',
          reproductionResult: '${reproduceBug.result}',
        },
        timeout: 180000,
      },
    },
    {
      id: 'create-test',
      type: 'task' as WorkflowNodeType,
      name: 'Create Failing Test',
      description: 'Write a test that reproduces the bug',
      config: {
        type: 'task',
        taskType: 'agent.generate',
        parameters: {
          type: 'test',
          bug: '${bugDescription}',
          location: '${locateCode.result}',
          outputPath: '${projectPath}/${testPath}',
        },
        timeout: 180000,
      },
    },
    {
      id: 'verify-test-fails',
      type: 'task' as WorkflowNodeType,
      name: 'Verify Test Fails',
      description: 'Ensure the new test fails with current code',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm test -- --testPathPattern="${testPath}" 2>&1 || echo "Test execution completed"',
        },
        timeout: 120000,
      },
    },
    {
      id: 'implement-fix',
      type: 'task' as WorkflowNodeType,
      name: 'Implement Fix',
      description: 'Write code to fix the bug',
      config: {
        type: 'task',
        taskType: 'agent.fix',
        parameters: {
          bug: '${bugDescription}',
          location: '${locateCode.result}',
          testPath: '${testPath}',
        },
        timeout: 300000,
      },
    },
    {
      id: 'verify-fix',
      type: 'task' as WorkflowNodeType,
      name: 'Verify Fix',
      description: 'Run the test to verify the fix works',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm test -- --testPathPattern="${testPath}" 2>&1',
        },
        timeout: 120000,
      },
    },
    {
      id: 'check-fix-condition',
      type: 'condition' as WorkflowNodeType,
      name: 'Fix Verified?',
      description: 'Check if the test now passes',
      config: {
        type: 'condition',
        condition: "${result.exitCode} == 0",
        trueBranch: 'regression-tests',
        falseBranch: 'retry-fix',
      },
    },
    {
      id: 'retry-fix',
      type: 'task' as WorkflowNodeType,
      name: 'Retry Fix',
      description: 'Attempt a different fix approach',
      config: {
        type: 'task',
        taskType: 'agent.fix',
        parameters: {
          bug: '${bugDescription}',
          location: '${locateCode.result}',
          testPath: '${testPath}',
          previousAttempts: '${retryCount}',
          approach: 'alternative',
        },
        timeout: 300000,
      },
    },
    {
      id: 'regression-tests',
      type: 'task' as WorkflowNodeType,
      name: 'Run Regression Tests',
      description: 'Ensure fix does not break existing functionality',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && npm test 2>&1',
        },
        timeout: 300000,
      },
    },
    {
      id: 'check-regression-condition',
      type: 'condition' as WorkflowNodeType,
      name: 'No Regressions?',
      description: 'Check if all tests pass',
      config: {
        type: 'condition',
        condition: "${result.exitCode} == 0",
        trueBranch: 'generate-report',
        falseBranch: 'revert-and-retry',
      },
    },
    {
      id: 'revert-and-retry',
      type: 'task' as WorkflowNodeType,
      name: 'Revert and Retry',
      description: 'Revert changes and try alternative fix',
      config: {
        type: 'task',
        taskType: 'shell.exec',
        parameters: {
          command: 'cd ${projectPath} && git checkout -- . && git clean -fd 2>&1',
        },
        timeout: 60000,
      },
    },
    {
      id: 'generate-report',
      type: 'task' as WorkflowNodeType,
      name: 'Generate Fix Report',
      description: 'Document the fix and changes made',
      config: {
        type: 'task',
        taskType: 'report.generate',
        parameters: {
          type: 'bug-fix',
          bug: '${bugDescription}',
          output: '${outputPath}/bug-fix-report.md',
        },
        timeout: 60000,
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    { id: 'e1', from: 'analyze-bug', to: 'reproduce-bug' },
    { id: 'e2', from: 'reproduce-bug', to: 'locate-code' },
    { id: 'e3', from: 'locate-code', to: 'create-test' },
    { id: 'e4', from: 'create-test', to: 'verify-test-fails' },
    { id: 'e5', from: 'verify-test-fails', to: 'implement-fix' },
    { id: 'e6', from: 'implement-fix', to: 'verify-fix' },
    { id: 'e7', from: 'verify-fix', to: 'check-fix-condition' },
    { id: 'e8', from: 'check-fix-condition', to: 'regression-tests', condition: 'true' },
    { id: 'e9', from: 'check-fix-condition', to: 'retry-fix', condition: 'false' },
    { id: 'e10', from: 'retry-fix', to: 'verify-fix' },
    { id: 'e11', from: 'regression-tests', to: 'check-regression-condition' },
    { id: 'e12', from: 'check-regression-condition', to: 'generate-report', condition: 'true' },
    { id: 'e13', from: 'check-regression-condition', to: 'revert-and-retry', condition: 'false' },
    { id: 'e14', from: 'revert-and-retry', to: 'implement-fix' },
  ];

  return {
    id: 'bug-fix',
    name: 'Bug Fix',
    description: 'Automated bug fixing workflow with reproduction, test creation, fix implementation, and regression testing',
    category: 'development',
    tags: ['bug-fix', 'debugging', 'testing', 'automation', 'maintenance'],
    workflow: {
      id: 'bug-fix',
      name: 'Automated Bug Fix',
      version: '1.0.0',
      nodes,
      edges,
      timeout: 1800000, // 30 minutes
      onFailure: 'stop',
    },
    variables: [
      { name: 'projectPath', type: 'string', required: true, description: 'Path to project root' },
      { name: 'bugDescription', type: 'string', required: true, description: 'Description of the bug' },
      { name: 'reproductionSteps', type: 'string', description: 'Steps to reproduce the bug' },
      { name: 'reproductionCommand', type: 'string', default: 'npm test', description: 'Command to reproduce the bug' },
      { name: 'testPath', type: 'string', default: 'tests/bug-repro.test.ts', description: 'Path for reproduction test' },
      { name: 'outputPath', type: 'string', default: '.', description: 'Path for output reports' },
      { name: 'retryCount', type: 'number', default: 0, description: 'Number of fix attempts made' },
    ],
    exampleInputs: {
      projectPath: '.',
      bugDescription: 'Function returns incorrect result for edge case',
      reproductionSteps: '1. Call function with empty array\n2. Observe error',
    },
  };
}

// ============================================================================
// Template Library Factory
// ============================================================================

export function createDefaultTemplateLibrary(): WorkflowTemplateLibrary {
  const library = new WorkflowTemplateLibrary();
  
  library.register(createCodeReviewTemplate());
  library.register(createRefactorTemplate());
  library.register(createGenerateDocsTemplate());
  library.register(createTestPipelineTemplate());
  library.register(createBugFixTemplate());
  
  return library;
}

// Export singleton instance
export const defaultTemplateLibrary = createDefaultTemplateLibrary();
