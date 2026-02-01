/**
 * Quality CLI Commands
 * 
 * Commands for linting, type checking, security scanning, and quality gates.
 * 
 * Matches SPEC_V3.md Part IV (Quality Gate Framework)
 */

import { Command } from 'commander';
import { lintAgentCodebase, runLinters, runTypeScriptCheck, runMyPy, runSecurityScan, evaluateQualityGate, generateLintSummary, DEFAULT_GATES, formatGateResult, parseCriteriaJson, createGateFromCriteria } from '../quality/index.js';
import { SecurityVulnerability } from '../quality/types.js';
import { formatError, formatSuccess } from '../formatters';
import * as fs from 'fs';
import * as path from 'path';

// formatJson helper function
function formatJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

interface QualityOptions {
  format: 'json' | 'table';
  language?: string;
  prettier?: boolean;
  types?: boolean;
  security?: boolean;
  strict?: boolean;
  criteria?: string;
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
          console.error(`Agent not found: ${agentId}`);
          console.log('Hint: Check the agents directory for available agents');
          process.exit(1);
        }
        
        console.log(`Running linter on agent: ${agent.id}`);
        console.log(`Path: ${agent.path}`);
        console.log('');
        
        const results = await lintAgentCodebase({
          agentId,
          agentPath: agent.path,
          language: options.language as any,
          includePrettier: options.prettier,
          includeTypes: options.types
        });
        
        // Generate summary
        const summary = generateLintSummary(results.results);
        
        if (options.format === 'json') {
          console.log(formatJson({
            agentId,
            results: results.results.map((r: any) => ({
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
          console.log('=== Lint Results ===\n');
          
          for (const result of results.results) {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${result.tool.toUpperCase()}`);
            console.log(`   Errors: ${result.summary.errors}`);
            console.log(`   Warnings: ${result.summary.warnings}`);
            console.log(`   Score: ${calculateLintScoreFromResults(result)}%`);
            console.log('');
          }
          
          console.log('=== Summary ===');
          console.log(`Total Errors: ${summary.aggregate.errors}`);
          console.log(`Total Warnings: ${summary.aggregate.warnings}`);
          console.log(`Files with Issues: ${summary.aggregate.filesWithIssues.size}`);
          console.log(`Overall Score: ${(summary.score * 100).toFixed(1)}%`);
          console.log(`Status: ${summary.passed ? '✅ PASSED' : '❌ FAILED'}`);
        }
        
        process.exit(summary.passed ? 0 : 1);
      } catch (error) {
        console.error('Lint failed:', error instanceof Error ? error.message : String(error));
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
          console.error(`Agent not found: ${agentId}`);
          process.exit(1);
        }
        
        console.log(`Running type checker on agent: ${agent.id}`);
        console.log('');
        
        const agentFiles = fs.readdirSync(agent.path);
        const isTypeScript = agentFiles.some(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
        const isPython = agentFiles.some(f => f.endsWith('.py'));
        
        let typeResult;
        
        if (isTypeScript) {
          typeResult = await runTypeScriptCheck(agent.path);
        } else if (isPython) {
          typeResult = await runMyPy(agent.path);
        } else {
          console.log('No type-checkable files found (TypeScript or Python)');
          process.exit(0);
        }
        
        const score = calculateTypeScore(typeResult.errors, typeResult.warnings);
        
        if (options.format === 'json') {
          console.log(formatJson({
            agentId,
            language: isTypeScript ? 'typescript' : 'python',
            errors: typeResult.errors,
            warnings: typeResult.warnings,
            issues: typeResult.issues,
            score,
            passed: typeResult.errors === 0
          }));
        } else {
          console.log('=== Type Check Results ===\n');
          console.log(`Language: ${isTypeScript ? 'TypeScript' : 'Python'}`);
          console.log(`Errors: ${typeResult.errors}`);
          console.log(`Warnings: ${typeResult.warnings}`);
          console.log(`Score: ${(score * 100).toFixed(1)}%`);
          console.log(`Status: ${typeResult.errors === 0 ? '✅ PASSED' : '❌ FAILED'}`);
          
          if (typeResult.issues.length > 0) {
            console.log('\nIssues:');
            for (const issue of typeResult.issues.slice(0, 10)) {
              console.log(`  ${issue.file}:${issue.line} - ${issue.message}`);
            }
            if (typeResult.issues.length > 10) {
              console.log(`  ... and ${typeResult.issues.length - 10} more`);
            }
          }
        }
        
        process.exit(typeResult.errors === 0 ? 0 : 1);
      } catch (error) {
        console.error('Type check failed:', error instanceof Error ? error.message : String(error));
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
          console.error(`Agent not found: ${agentId}`);
          process.exit(1);
        }
        
        console.log(`Running security scan on agent: ${agent.id}`);
        console.log(`Tool: ${options.tool || 'bandit'}`);
        console.log('');
        
        const result = await runSecurityScan(agent.path, options.tool as any);
        
        // Count by severity
        const critical = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'critical').length;
        const high = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'high').length;
        const medium = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'medium').length;
        const low = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'low').length;
        
        const passed = critical === 0 && high === 0;
        
        if (options.format === 'json') {
          console.log(formatJson({
            agentId,
            tool: options.tool,
            vulnerabilities: result.vulnerabilities,
            summary: { critical, high, medium, low },
            passed
          }));
        } else {
          console.log('=== Security Scan Results ===\n');
          
          if (result.vulnerabilities.length === 0) {
            console.log('✅ No security vulnerabilities found!');
          } else {
            console.log('Vulnerabilities by Severity:');
            console.log(`  Critical: ${critical}`);
            console.log(`  High: ${high}`);
            console.log(`  Medium: ${medium}`);
            console.log(`  Low: ${low}`);
            console.log('');
            
            // Show critical and high vulnerabilities
            const criticalVulns = result.vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'critical' || v.severity === 'high');
            if (criticalVulns.length > 0) {
              console.log('Critical/High Vulnerabilities:');
              for (const vuln of criticalVulns) {
                console.log(`  [${vuln.severity.toUpperCase()}] ${vuln.id}`);
                console.log(`    ${vuln.title}`);
                console.log(`    ${vuln.file}${vuln.line ? `:${vuln.line}` : ''}`);
              }
            }
          }
          
          console.log(`\nStatus: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
        }
        
        process.exit(passed ? 0 : 1);
      } catch (error) {
        console.error('Security scan failed:', error instanceof Error ? error.message : String(error));
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
        console.log(`Evaluating quality gate for task: ${taskId}`);
        console.log('');
        
        // Determine gate
        let gate;
        if (options.gateType && DEFAULT_GATES[options.gateType]) {
          gate = DEFAULT_GATES[options.gateType];
          console.log(`Using predefined gate: ${options.gateType}`);
        } else if (options.criteria) {
          gate = createGateFromCriteria(options.criteria, { name: 'custom' });
          console.log('Using custom criteria');
        } else {
          gate = DEFAULT_GATES.full;
          console.log('Using default full gate');
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
          format: options.format as any,
          verbose: true
        });
        
        console.log(output);
        
        process.exit(result.passed ? 0 : 1);
      } catch (error) {
        console.error('Gate evaluation failed:', error instanceof Error ? error.message : String(error));
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
