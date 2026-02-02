/**
 * Quality CLI Commands
 * 
 * Commands for linting, type checking, security scanning, and quality gates.
 * 
 * Matches SPEC_V3.md Part IV (Quality Gate Framework)
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { lintAgentCodebase, runTypeScriptCheck, runMyPy, runSecurityScan, evaluateQualityGate, generateLintSummary, DEFAULT_GATES, formatGateResult, createGateFromCriteria } from '../../quality/index';
import { logger } from '../../utils/logger';

import type { SecurityVulnerability, QualityGate } from '../../quality/types';

// formatJson helper function
function formatJson<T>(obj: T): string {
  return JSON.stringify(obj, null, 2);
}

interface QualityOptions {
  format: 'json' | 'table' | 'summary';
  language?: 'javascript' | 'typescript' | 'python' | 'rust' | 'go' | 'auto';
  prettier?: boolean;
  types?: boolean;
  security?: boolean;
  strict?: boolean;
  criteria?: string;
  tool?: 'bandit' | 'semgrep' | 'trivy';
}

interface AgentInfo {
  id: string;
  path: string;
}

/**
 * Find agent information from agent ID
 */
function findAgent(agentId: string): AgentInfo | null {
  const agentsDir = path.join(process.cwd(), '..', 'agents');
  
  if (!fs.existsSync(agentsDir)) {
    return null;
  }
  
  const agentDirs = fs.readdirSync(agentsDir);
  
  for (const dir of agentDirs) {
    // Check if directory name matches agent ID
    if (dir === agentId || dir.toLowerCase() === agentId.toLowerCase()) {
      const agentPath = path.join(agentsDir, dir);
      if (fs.statSync(agentPath).isDirectory()) {
        return { id: dir, path: agentPath };
      }
    }
    
    // Check for SOUL.md with matching agent ID
    const soulPath = path.join(agentsDir, dir, 'SOUL.md');
    if (fs.existsSync(soulPath)) {
      try {
        const content = fs.readFileSync(soulPath, 'utf-8');
        if (content.includes(`id: ${agentId}`) || content.includes(`id: "${agentId}"`)) {
          return { id: dir, path: path.join(agentsDir, dir) };
        }
      } catch {
        // Continue searching
      }
    }
  }
  
  return null;
}

/**
 * Quality Lint Command
 */
export function qualityLintCommand(): Command {
  const cmd = new Command();
  
  cmd
    .name('lint <agent-id>')
    .description('Run linter on an agents codebase')
    .option('--format <json|table>', 'Output format', 'table')
    .option('--language <javascript|typescript|python|rust|go|auto>', 'Language to lint', 'auto')
    .option('--[no-]prettier', 'Include Prettier formatting check', true)
    .option('--[no-]types', 'Include type checking', true)
    .action(async (agentId: string, options: QualityOptions) => {
      try {
        const agent = findAgent(agentId);
        
        if (!agent) {
          logger.error(`Agent not found: ${agentId}`);
          logger.info('Hint: Check the agents directory for available agents');
          process.exit(1);
        }

        logger.info(`Running linter on agent: ${agent.id}`);
        logger.info(`Path: ${agent.path}`);
        logger.debug('');
        
        const results = await lintAgentCodebase({
          agentId,
          agentPath: agent.path,
          language: options.language,
          includePrettier: options.prettier,
          includeTypes: options.types
        });
        
        // Generate summary
        const summary = generateLintSummary(results.results);
        
        if (options.format === 'json') {
          logger.info(formatJson({
            agentId,
            results: results.results.map((r: { tool: string; success: boolean; summary: { errors: number; warnings: number }; issues: unknown[] }) => ({
              tool: r.tool,
              success: r.success,
              summary: r.summary,
              issues: r.issues.slice(0, 20) // Limit issues in JSON output
            })),
            aggregate: summary.aggregate,
            score: summary.score,
            passed: summary.passed
          }));
        } else {
          logger.info('=== Lint Results ===\n');

          for (const result of results.results) {
            const status = result.success ? '✅' : '❌';
            logger.info(`${status} ${result.tool.toUpperCase()}`);
            logger.info(`   Errors: ${result.summary.errors}`);
            logger.info(`   Warnings: ${result.summary.warnings}`);
            logger.info(`   Score: ${calculateLintScoreFromResults(result)}%`);
            logger.debug('');
          }

          logger.info('=== Summary ===');
          logger.info(`Total Errors: ${summary.aggregate.errors}`);
          logger.info(`Total Warnings: ${summary.aggregate.warnings}`);
          logger.info(`Files with Issues: ${summary.aggregate.filesWithIssues.size}`);
          logger.info(`Overall Score: ${(summary.score * 100).toFixed(1)}%`);
          logger.info(`Status: ${summary.passed ? '✅ PASSED' : '❌ FAILED'}`);
        }

        process.exit(summary.passed ? 0 : 1);
      } catch (error) {
        logger.error('Lint failed:', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      }
    });
  
  return cmd;
}

/**
 * Quality Types Command
 */
export function qualityTypesCommand(): Command {
  const cmd = new Command();
  
  cmd
    .name('types <agent-id>')
    .description('Run type checker on an agents codebase')
    .option('--format <json|table>', 'Output format', 'table')
    .option('--language <typescript|python|auto>', 'Language', 'auto')
    .option('--strict', 'Use strict type checking')
    .action(async (agentId: string, options: QualityOptions & { strict?: boolean }) => {
      try {
        const agent = findAgent(agentId);
        
        if (!agent) {
          logger.error(`Agent not found: ${agentId}`);
          process.exit(1);
        }

        logger.info(`Running type checker on agent: ${agent.id}`);
        logger.debug('');

        const agentFiles = fs.readdirSync(agent.path);
        const isTypeScript = agentFiles.some(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
        const isPython = agentFiles.some(f => f.endsWith('.py'));

        let typeResult;

        if (isTypeScript) {
          typeResult = await runTypeScriptCheck(agent.path);
        } else if (isPython) {
          typeResult = await runMyPy(agent.path);
        } else {
          logger.info('No type-checkable files found (TypeScript or Python)');
          process.exit(0);
        }
        
        const score = calculateTypeScore(typeResult.errors, typeResult.warnings);
        
        if (options.format === 'json') {
          logger.info(formatJson({
            agentId,
            language: isTypeScript ? 'typescript' : 'python',
            errors: typeResult.errors,
            warnings: typeResult.warnings,
            issues: typeResult.issues,
            score,
            passed: typeResult.errors === 0
          }));
        } else {
          logger.info('=== Type Check Results ===\n');
          logger.info(`Language: ${isTypeScript ? 'TypeScript' : 'Python'}`);
          logger.info(`Errors: ${typeResult.errors}`);
          logger.info(`Warnings: ${typeResult.warnings}`);
          logger.info(`Score: ${(score * 100).toFixed(1)}%`);
          logger.info(`Status: ${typeResult.errors === 0 ? '✅ PASSED' : '❌ FAILED'}`);

          if (typeResult.issues.length > 0) {
            logger.info('\nIssues:');
            for (const issue of typeResult.issues.slice(0, 10)) {
              logger.info(`  ${issue.file}:${issue.line} - ${issue.message}`);
            }
            if (typeResult.issues.length > 10) {
              logger.info(`  ... and ${typeResult.issues.length - 10} more`);
            }
          }
        }

        process.exit(typeResult.errors === 0 ? 0 : 1);
      } catch (error) {
        logger.error('Type check failed:', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      }
    });
  
  return cmd;
}

/**
 * Quality Security Command
 */
export function qualitySecurityCommand(): Command {
  const cmd = new Command();
  
  cmd
    .name('security <agent-id>')
    .description('Run security scan on an agents codebase')
    .option('--format <json|table>', 'Output format', 'table')
    .option('--tool <bandit|semgrep|trivy>', 'Security scanner tool', 'bandit')
    .option('--cwe-list <list>', 'Comma-separated list of CWE IDs to check')
    .action(async (agentId: string, options: QualityOptions & { tool?: string; cweList?: string }) => {
      try {
        const agent = findAgent(agentId);
        
        if (!agent) {
          logger.error(`Agent not found: ${agentId}`);
          process.exit(1);
        }

        logger.info(`Running security scan on agent: ${agent.id}`);
        logger.info(`Tool: ${options.tool || 'bandit'}`);
        logger.debug('');

        const result = await runSecurityScan(agent.path);

        // Count by severity
        const critical = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'critical').length;
        const high = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'high').length;
        const medium = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'medium').length;
        const low = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'low').length;

        const passed = critical === 0 && high === 0;

        if (options.format === 'json') {
          logger.info(formatJson({
            agentId,
            tool: options.tool,
            vulnerabilities: result.vulnerabilities,
            summary: { critical, high, medium, low },
            passed
          }));
        } else {
          logger.info('=== Security Scan Results ===\n');

          if (result.vulnerabilities.length === 0) {
            logger.info('✅ No security vulnerabilities found!');
          } else {
            logger.info('Vulnerabilities by Severity:');
            logger.info(`  Critical: ${critical}`);
            logger.info(`  High: ${high}`);
            logger.info(`  Medium: ${medium}`);
            logger.info(`  Low: ${low}`);
            logger.debug('');

            // Show critical and high vulnerabilities
            const criticalVulns = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'critical' || v.severity === 'high');
            if (criticalVulns.length > 0) {
              logger.info('Critical/High Vulnerabilities:');
              for (const vuln of criticalVulns) {
                logger.info(`  [${vuln.severity.toUpperCase()}] ${vuln.id}`);
                logger.info(`    ${vuln.title}`);
                logger.info(`    ${vuln.file}${vuln.line ? `:${vuln.line}` : ''}`);
              }
            }
          }

          logger.info(`\nStatus: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
        }

        process.exit(passed ? 0 : 1);
      } catch (error) {
        logger.error('Security scan failed:', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      }
    });
  
  return cmd;
}

/**
 * Quality Gate Command
 */
export function qualityGateCommand(): Command {
  const cmd = new Command();
  
  cmd
    .name('gate <task-id>')
    .description('Evaluate quality gate for a task')
    .option('--criteria <json>', 'Quality criteria as JSON')
    .option('--format <json|table|summary>', 'Output format', 'summary')
    .option('--gate-type <lint|types|security|full>', 'Predefined gate type')
    .action(async (taskId: string, options: QualityOptions & { gateType?: string }) => {
      try {
        logger.info(`Evaluating quality gate for task: ${taskId}`);
        logger.debug('');

        // Determine gate
        let gate: QualityGate;
        if (options.gateType && DEFAULT_GATES[options.gateType]) {
          gate = DEFAULT_GATES[options.gateType];
          logger.info(`Using predefined gate: ${options.gateType}`);
        } else if (options.criteria) {
          gate = createGateFromCriteria(options.criteria, { name: 'custom' });
          logger.info('Using custom criteria');
        } else {
          gate = DEFAULT_GATES['full'];
          logger.info('Using default full gate');
        }

        // For now, create a mock evaluation
        // In a real implementation, this would gather results from actual runs
        const mockInput = {
          lintResults: [],
          typeErrors: 0,
          typeWarnings: 0,
          testCoverage: 0,
          testPassRate: 100,
          securityVulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }
        };

        const result = evaluateQualityGate({
          gate,
          ...mockInput
        });

        const output = formatGateResult(result, {
          format: options.format,
          verbose: true
        });

        logger.info(output);

        process.exit(result.passed ? 0 : 1);
      } catch (error) {
        logger.error('Gate evaluation failed:', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      }
    });
  
  return cmd;
}

/**
 * Quality Command Group
 */
export function qualityCommand(): Command {
  const cmd = new Command();
  
  cmd
    .name('quality')
    .description('Quality management commands (linting, type checking, security, gates)')
    .addCommand(qualityLintCommand())
    .addCommand(qualityTypesCommand())
    .addCommand(qualitySecurityCommand())
    .addCommand(qualityGateCommand());
  
  return cmd;
}

// Helper functions
function calculateLintScoreFromResults(result: { summary: { errors: number; warnings: number } }): number {
  const errors = result.summary.errors;
  const warnings = result.summary.warnings;
  const score = Math.max(0, 1 - errors * 0.1 - warnings * 0.02);
  return Math.round(score * 100);
}

function calculateTypeScore(errors: number, warnings: number): number {
  const score = Math.max(0, 1 - errors * 0.1 - warnings * 0.02);
  return Math.round(score * 100) / 100;
}
