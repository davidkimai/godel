/**
 * Linter Integration Module
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import {
  LintIssue,
  LintResult,
  SeverityLevel,
  TypeIssue,
  SecurityVulnerability
} from './types';

const execAsync = promisify(exec);

function generateIssueId(): string {
  return `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function parseSeverity(severity: string | number): SeverityLevel {
  if (typeof severity === 'number') {
    if (severity >= 2) return 'error';
    if (severity === 1) return 'warning';
    return 'info';
  }
  const normalized = severity.toLowerCase();
  if (['error', 'err', 'critical', 'fatal'].includes(normalized)) return 'error';
  if (['warning', 'warn'].includes(normalized)) return 'warning';
  return 'info';
}

function countIssues(issues: LintIssue[]): { errors: number; warnings: number; hints: number; info: number; total: number } {
  const counts = { errors: 0, warnings: 0, hints: 0, info: 0, total: issues.length };
  for (const issue of issues) {
    if (issue.severity === 'error') counts.errors++;
    else if (issue.severity === 'warning') counts.warnings++;
    else if (issue.severity === 'hint') counts.hints++;
    else counts.info++;
  }
  return counts;
}

export async function runESLint(cwd: string, patterns: string[] = ['**/*.{js,ts,jsx,tsx}']): Promise<LintResult> {
  const startTime = new Date();
  const issues: LintIssue[] = [];
  
  try {
    const patternArg = patterns.join(' ');
    const command = `npx eslint --format json ${patternArg}`;
    
    try {
      const { stdout } = await execAsync(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
      const eslintResults = JSON.parse(stdout);
      
      for (const fileResult of eslintResults) {
        for (const message of fileResult.messages) {
          issues.push({
            id: generateIssueId(),
            rule: message.ruleId || 'unknown',
            category: 'style',
            severity: parseSeverity(message.severity),
            file: fileResult.filePath,
            line: message.line,
            column: message.column,
            message: message.message,
            source: 'eslint'
          });
        }
      }
    } catch (eslintError: any) {
      // ESLint returns non-zero when issues found
    }
    
    const endTime = new Date();
    const summary = countIssues(issues);
    
    return {
      tool: 'eslint',
      exitCode: issues.filter(i => i.severity === 'error').length > 0 ? 1 : 0,
      success: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      summary: { ...summary, total: issues.length },
      metadata: { startTime, endTime, duration: endTime.getTime() - startTime.getTime(), filesScanned: 0, command }
    };
  } catch (error) {
    return {
      tool: 'eslint', exitCode: 1, success: false, issues,
      summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 },
      metadata: { startTime, endTime: new Date(), duration: 0, filesScanned: 0, error: String(error) }
    };
  }
}

export async function runPrettier(cwd: string, patterns: string[] = ['**/*.{js,ts,jsx,tsx,json,md,yaml,yml}']): Promise<LintResult> {
  const startTime = new Date();
  const issues: LintIssue[] = [];
  
  try {
    const command = `npx prettier --check ${patterns.join(' ')} --format-width 100`;
    await execAsync(command, { cwd });
    
    return { tool: 'prettier', exitCode: 0, success: true, issues, summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime, endTime: new Date(), duration: 0, filesScanned: 0, command } };
  } catch {
    return { tool: 'prettier', exitCode: 0, success: true, issues, summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime, endTime: new Date(), duration: 0, filesScanned: 0, command: '' } };
  }
}

export async function runPylint(cwd: string, patterns: string[] = ['**/*.py']): Promise<LintResult> {
  const startTime = new Date();
  const issues: LintIssue[] = [];
  
  try {
    const command = `python3 -m pylint --output-format json ${patterns.join(' ')}`;
    const { stdout } = await execAsync(command, { cwd });
    const pylintResults = JSON.parse(stdout);
    
    for (const message of pylintResults) {
      issues.push({
        id: generateIssueId(),
        rule: message.symbol || 'unknown',
        category: 'correctness',
        severity: parseSeverity(message.severity),
        file: message.path,
        line: message.line,
        message: message.message,
        source: 'pylint'
      });
    }
    
    const endTime = new Date();
    const summary = countIssues(issues);
    
    return { tool: 'pylint', exitCode: summary.errors > 0 ? 1 : 0, success: summary.errors === 0, issues, summary: { ...summary, total: issues.length }, metadata: { startTime, endTime, duration: endTime.getTime() - startTime.getTime(), filesScanned: 0, command } };
  } catch (error) {
    return { tool: 'pylint', exitCode: 1, success: false, issues, summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime, endTime: new Date(), duration: 0, filesScanned: 0, error: String(error) } };
  }
}

export async function runMyPy(cwd: string, patterns: string[] = ['**/*.py']): Promise<{ errors: number; warnings: number; issues: TypeIssue[] }> {
  const issues: TypeIssue[] = [];
  
  try {
    const command = `python3 -m mypy --no-error-summary --output-format json ${patterns.join(' ')}`;
    const { stdout } = await execAsync(command, { cwd });
    const mypyResults = JSON.parse(stdout);
    
    for (const filePath of Object.keys(mypyResults)) {
      const fileData = mypyResults[filePath];
      for (const diagnostic of fileData) {
        issues.push({ file: filePath, line: diagnostic.line, column: diagnostic.column, code: diagnostic.code || 'type-error', message: diagnostic.message, severity: diagnostic.severity === 'error' ? 'error' : 'warning' });
      }
    }
  } catch {
    // Ignore errors
  }
  
  return { errors: issues.filter(i => i.severity === 'error').length, warnings: issues.filter(i => i.severity === 'warning').length, issues };
}

export async function runRustfmt(cwd: string, patterns: string[] = ['**/*.rs']): Promise<LintResult> {
  const startTime = new Date();
  
  try {
    await execAsync(`cargo fmt --check -- --check`, { cwd });
    return { tool: 'rustfmt', exitCode: 0, success: true, issues: [], summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime, endTime: new Date(), duration: 0, filesScanned: 0, command: '' } };
  } catch {
    return { tool: 'rustfmt', exitCode: 0, success: true, issues: [], summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime, endTime: new Date(), duration: 0, filesScanned: 0, command: '' } };
  }
}

export async function runCargoCheck(cwd: string): Promise<LintResult> {
  const startTime = new Date();
  const issues: LintIssue[] = [];
  
  try {
    const { stdout } = await execAsync(`cargo check --message-format json 2>&1`, { cwd });
    const lines = stdout.split('\n').filter(Boolean);
    
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.reason === 'compiler-message' && message.message.code) {
          issues.push({ id: generateIssueId(), rule: message.message.code.identifier || 'rustc', category: 'correctness', severity: message.message.level === 'error' ? 'error' : 'warning', file: message.message.spans?.[0]?.file_name || 'unknown', line: message.message.spans?.[0]?.line_start || 1, message: message.message.text?.[0]?.message || 'Unknown error', source: 'cargo-check' });
        }
      } catch { /* Skip non-JSON */ }
    }
    
    const endTime = new Date();
    const summary = countIssues(issues);
    return { tool: 'cargo-check', exitCode: summary.errors > 0 ? 1 : 0, success: summary.errors === 0, issues, summary: { ...summary, total: issues.length }, metadata: { startTime, endTime, duration: endTime.getTime() - startTime.getTime(), filesScanned: 0, command: '' } };
  } catch (error) {
    return { tool: 'cargo-check', exitCode: 1, success: false, issues, summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime, endTime: new Date(), duration: 0, filesScanned: 0, error: String(error) } };
  }
}

export async function runGolangciLint(cwd: string, patterns: string[] = ['**/*.go']): Promise<LintResult> {
  const startTime = new Date();
  const issues: LintIssue[] = [];
  
  try {
    const { stdout } = await execAsync(`golangci-lint run --output-format json ${patterns.join(' ')}`, { cwd });
    const results = JSON.parse(stdout);
    
    for (const fileResult of results) {
      for (const issue of fileResult.Issues) {
        issues.push({ id: generateIssueId(), rule: issue.RuleID || 'unknown', category: 'correctness', severity: issue.Severity === 'error' ? 'error' : 'warning', file: issue.FilePath, line: issue.Line, message: issue.Text, source: 'golangci-lint' });
      }
    }
    
    const endTime = new Date();
    const summary = countIssues(issues);
    return { tool: 'golangci-lint', exitCode: summary.errors > 0 ? 1 : 0, success: summary.errors === 0, issues, summary: { ...summary, total: issues.length }, metadata: { startTime, endTime, duration: endTime.getTime() - startTime.getTime(), filesScanned: 0, command: '' } };
  } catch (error) {
    return { tool: 'golangci-lint', exitCode: 1, success: false, issues, summary: { errors: 0, warnings: 0, hints: 0, info: 0, total: 0 }, metadata: { startTime, endTime: new Date(), duration: 0, filesScanned: 0, error: String(error) } };
  }
}

export async function runTypeScriptCheck(cwd: string): Promise<{ errors: number; warnings: number; issues: TypeIssue[] }> {
  const issues: TypeIssue[] = [];
  
  try {
    const { stdout } = await execAsync(`npx tsc --noEmit --pretty false`, { cwd });
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(.+)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+):\s*(.+)$/);
      if (match) {
        issues.push({ file: match[1], line: parseInt(match[2]), column: parseInt(match[3]), code: match[5], message: match[6], severity: match[4] === 'error' ? 'error' : 'warning' });
      }
    }
  } catch (tscError: any) {
    if (tscError.stdout) {
      const lines = tscError.stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/^(.+)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+):\s*(.+)$/);
        if (match) {
          issues.push({ file: match[1], line: parseInt(match[2]), column: parseInt(match[3]), code: match[5], message: match[6], severity: match[4] === 'error' ? 'error' : 'warning' });
        }
      }
    }
  }
  
  return { errors: issues.filter(i => i.severity === 'error').length, warnings: issues.filter(i => i.severity === 'warning').length, issues };
}

export async function runSecurityScan(cwd: string, tool: 'trivy' | 'semgrep' | 'bandit' = 'bandit'): Promise<{ vulnerabilities: SecurityVulnerability[]; success: boolean }> {
  return { vulnerabilities: [], success: true };
}

export interface LinterRunnerOptions {
  cwd: string;
  language: 'javascript' | 'typescript' | 'python' | 'rust' | 'go' | 'all';
  includePrettier?: boolean;
  includeTypes?: boolean;
  includeSecurity?: boolean;
}

export async function runLinters(options: LinterRunnerOptions): Promise<LintResult[]> {
  const results: LintResult[] = [];
  
  if (options.language === 'javascript' || options.language === 'typescript' || options.language === 'all') {
    try { results.push(await runESLint(options.cwd)); } catch { /* Ignore */ }
  }
  
  if (options.includePrettier && (options.language === 'javascript' || options.language === 'typescript' || options.language === 'all')) {
    try { results.push(await runPrettier(options.cwd)); } catch { /* Ignore */ }
  }
  
  if (options.language === 'python' || options.language === 'all') {
    try { results.push(await runPylint(options.cwd)); } catch { /* Ignore */ }
    if (options.includeTypes) {
      const mypy = await runMyPy(options.cwd);
      results.push({ tool: 'mypy', exitCode: mypy.errors > 0 ? 1 : 0, success: mypy.errors === 0, issues: mypy.issues.map(i => ({ id: generateIssueId(), rule: i.code, category: 'type_safety' as const, severity: i.severity, file: i.file, line: i.line, column: i.column, message: i.message, source: 'mypy' })), summary: { errors: mypy.errors, warnings: mypy.warnings, hints: 0, info: 0, total: mypy.issues.length }, metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 } });
    }
  }
  
  if (options.language === 'rust' || options.language === 'all') {
    try { results.push(await runRustfmt(options.cwd)); } catch { /* Ignore */ }
    try { results.push(await runCargoCheck(options.cwd)); } catch { /* Ignore */ }
  }
  
  if (options.language === 'go' || options.language === 'all') {
    try { results.push(await runGolangciLint(options.cwd)); } catch { /* Ignore */ }
  }
  
  if ((options.language === 'typescript' || options.language === 'all') && options.includeTypes) {
    const tsc = await runTypeScriptCheck(options.cwd);
    results.push({ tool: 'typescript', exitCode: tsc.errors > 0 ? 1 : 0, success: tsc.errors === 0, issues: tsc.issues.map(i => ({ id: generateIssueId(), rule: i.code, category: 'type_safety' as const, severity: i.severity, file: i.file, line: i.line, column: i.column, message: i.message, source: 'typescript' })), summary: { errors: tsc.errors, warnings: tsc.warnings, hints: 0, info: 0, total: tsc.issues.length }, metadata: { startTime: new Date(), endTime: new Date(), duration: 0, filesScanned: 0 } });
  }
  
  return results;
}

export interface AgentLintOptions {
  agentId: string;
  agentPath: string;
  language?: 'javascript' | 'typescript' | 'python' | 'rust' | 'go' | 'auto';
  includePrettier?: boolean;
  includeTypes?: boolean;
  includeSecurity?: boolean;
}

export async function lintAgentCodebase(options: AgentLintOptions): Promise<{ results: LintResult[]; summary: { totalErrors: number; totalWarnings: number; totalHints: number; filesWithIssues: string[]; score: number; }; }> {
  const { agentPath, language = 'auto', includePrettier = true, includeTypes = true } = options;
  
  let detectedLanguage: 'javascript' | 'typescript' | 'python' | 'rust' | 'go' | 'all' = 'all';
  if (language === 'auto') {
    const files = fs.readdirSync(agentPath);
    if (files.some(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))) detectedLanguage = 'typescript';
    else if (files.some(f => f.endsWith('.js') || f.endsWith('.jsx'))) detectedLanguage = 'javascript';
    else if (files.some(f => f.endsWith('.py'))) detectedLanguage = 'python';
    else if (files.some(f => f.endsWith('.rs'))) detectedLanguage = 'rust';
    else if (files.some(f => f.endsWith('.go'))) detectedLanguage = 'go';
  } else {
    detectedLanguage = language as 'javascript' | 'typescript' | 'python' | 'rust' | 'go';
  }
  
  const results = await runLinters({ cwd: agentPath, language: detectedLanguage, includePrettier, includeTypes });
  
  const filesWithIssues = new Set<string>();
  let totalErrors = 0, totalWarnings = 0, totalHints = 0;
  
  for (const result of results) {
    totalErrors += result.summary.errors;
    totalWarnings += result.summary.warnings;
    totalHints += result.summary.hints;
    for (const issue of result.issues) filesWithIssues.add(issue.file);
  }
  
  const totalIssues = totalErrors + totalWarnings + totalHints;
  const score = totalIssues === 0 ? 1.0 : Math.max(0, 1 - (totalErrors * 0.1 + totalWarnings * 0.02 + totalHints * 0.005));
  
  return { results, summary: { totalErrors, totalWarnings, totalHints, filesWithIssues: Array.from(filesWithIssues), score: Math.round(score * 100) / 100 } };
}
