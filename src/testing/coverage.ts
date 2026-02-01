/**
 * Coverage Analyzer
 * 
 * Parse coverage reports and calculate coverage metrics
 * Supports Istanbul, coverage.py, gcov, and Jacoco formats
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  CoverageReport,
  CoverageMetrics,
  CoverageMetric,
  FileCoverage,
  TestFramework
} from './types';

/**
 * Detect coverage format based on files
 */
export function detectCoverageFormat(cwd: string): 'istanbul' | 'coverage.py' | 'gcov' | 'jacoco' | null {
  const files = fs.readdirSync(cwd);
  
  // Istanbul/LCOV
  if (files.some(f => f.includes('lcov.info') || f.endsWith('.lcov'))) {
    return 'istanbul';
  }
  if (files.some(f => f.includes('coverage.json'))) {
    return 'istanbul';
  }

  // coverage.py
  if (files.some(f => f === '.coverage' || f === 'coverage.xml')) {
    return 'coverage.py';
  }

  // gcov
  if (files.some(f => f.endsWith('.gcov') || f.endsWith('.gcda') || f.endsWith('.gcno'))) {
    return 'gcov';
  }

  // Jacoco
  if (files.some(f => f.includes('jacoco') || f.endsWith('.xml') && files.some(x => x.includes('report')))) {
    return 'jacoco';
  }

  // Default to Istanbul if coverage directory exists
  if (fs.existsSync(path.join(cwd, 'coverage'))) {
    return 'istanbul';
  }

  return null;
}

/**
 * Parse coverage report based on format
 */
export async function parseCoverage(
  cwd: string,
  framework: TestFramework
): Promise<CoverageReport> {
  const format = detectCoverageFormat(cwd);
  
  if (!format) {
    return {
      path: cwd,
      framework,
      metrics: createEmptyMetrics(),
      files: [],
      timestamp: new Date()
    };
  }

  switch (format) {
    case 'istanbul':
      return parseIstanbulCoverage(cwd, framework);
    case 'coverage.py':
      return parseCoveragePy(cwd, framework);
    case 'gcov':
      return parseGcovCoverage(cwd, framework);
    case 'jacoco':
      return parseJacocoCoverage(cwd, framework);
    default:
      return {
        path: cwd,
        framework,
        metrics: createEmptyMetrics(),
        files: [],
        timestamp: new Date()
      };
  }
}

/**
 * Parse Istanbul/LCOV coverage report
 */
async function parseIstanbulCoverage(
  cwd: string,
  framework: TestFramework
): Promise<CoverageReport> {
  const files: FileCoverage[] = [];
  const coverageDir = path.join(cwd, 'coverage');
  
  // Look for various Istanbul output formats
  const lcovFile = path.join(coverageDir, 'lcov.info');
  const jsonFile = path.join(coverageDir, 'coverage-final.json');
  const htmlDir = path.join(coverageDir, 'lcov-report');

  if (fs.existsSync(jsonFile)) {
    try {
      const content = await fs.promises.readFile(jsonFile, 'utf-8');
      const data = JSON.parse(content);
      
      for (const [filePath, coverage] of Object.entries(data as Record<string, any>)) {
        const absolutePath = path.isAbsolute(filePath) 
          ? filePath 
          : path.join(cwd, filePath);
        
        files.push(parseIstanbulFileCoverage(coverage, absolutePath));
      }
    } catch {
      // Failed to parse JSON
    }
  } else if (fs.existsSync(lcovFile)) {
    const content = await fs.promises.readFile(lcovFile, 'utf-8');
    files.push(...parseLcovContent(content, cwd));
  } else if (fs.existsSync(htmlDir)) {
    // Parse HTML report directory
    const htmlFiles = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));
    for (const htmlFile of htmlFiles) {
      // Basic HTML parsing could be added here
      files.push({
        path: path.join(htmlDir, htmlFile),
        statements: { covered: 0, total: 0, percentage: 0 },
        branches: { covered: 0, total: 0, percentage: 0 },
        functions: { covered: 0, total: 0, percentage: 0 },
        lines: { covered: 0, total: 0, percentage: 0 }
      });
    }
  }

  const metrics = calculateAggregateMetrics(files);

  return {
    path: cwd,
    framework,
    metrics,
    files,
    timestamp: new Date()
  };
}

/**
 * Parse a single Istanbul coverage entry
 */
function parseIstanbulFileCoverage(
  coverage: any,
  filePath: string
): FileCoverage {
  const s = coverage.s || coverage.statements || {};
  const b = coverage.b || coverage.branches || {};
  const f = coverage.f || coverage.functions || {};
  const l = coverage.l || coverage.lines || {};

  return {
    path: filePath,
    statements: calculateMetric(s),
    branches: calculateMetric(b),
    functions: calculateMetric(f),
    lines: calculateMetric(l)
  };
}

/**
 * Parse LCOV format content
 */
function parseLcovContent(content: string, baseDir: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  const lines = content.split('\n');
  
  let currentFile: FileCoverage | null = null;
  
  for (const line of lines) {
    if (line.startsWith('SF:')) {
      if (currentFile) {
        files.push(currentFile);
      }
      const filePath = line.substring(3);
      currentFile = {
        path: path.isAbsolute(filePath) ? filePath : path.join(baseDir, filePath),
        statements: { covered: 0, total: 0, percentage: 0 },
        branches: { covered: 0, total: 0, percentage: 0 },
        functions: { covered: 0, total: 0, percentage: 0 },
        lines: { covered: 0, total: 0, percentage: 0 }
      };
    }
    
    if (currentFile) {
      if (line.startsWith('DA:')) {
        const parts = line.substring(3).split(',');
        if (parts.length === 2) {
          currentFile.lines.total++;
          if (parseInt(parts[1], 10) > 0) {
            currentFile.lines.covered++;
          }
        }
      } else if (line.startsWith('FN:')) {
        currentFile.functions.total++;
      } else if (line.startsWith('FNDA:') && parseInt(line.substring(5).split(',')[1], 10) > 0) {
        currentFile.functions.covered++;
      } else if (line.startsWith('BRDA:')) {
        currentFile.branches.total++;
        const parts = line.substring(5).split(',');
        if (parts.length >= 4 && parseInt(parts[3], 10) > 0) {
          currentFile.branches.covered++;
        }
      }
    }
  }
  
  if (currentFile) {
    files.push(currentFile);
  }
  
  // Calculate percentages
  for (const file of files) {
    file.lines.percentage = file.lines.total > 0 
      ? (file.lines.covered / file.lines.total) * 100 
      : 0;
    file.functions.percentage = file.functions.total > 0 
      ? (file.functions.covered / file.functions.total) * 100 
      : 0;
    file.branches.percentage = file.branches.total > 0 
      ? (file.branches.covered / file.branches.total) * 100 
      : 0;
    file.statements.percentage = file.statements.total > 0 
      ? (file.statements.covered / file.statements.total) * 100 
      : 0;
  }
  
  return files;
}

/**
 * Parse coverage.py output
 */
async function parseCoveragePy(
  cwd: string,
  framework: TestFramework
): Promise<CoverageReport> {
  const files: FileCoverage[] = [];
  
  const coverageXml = path.join(cwd, 'coverage.xml');
  const coverageDb = path.join(cwd, '.coverage');
  
  if (fs.existsSync(coverageXml)) {
    const content = await fs.promises.readFile(coverageXml, 'utf-8');
    files.push(...parseCoverageXml(content, cwd));
  } else if (fs.existsSync(coverageDb)) {
    // Could use coverage.py API directly for more accurate parsing
    // For now, return empty with detected format
    files.push({
      path: coverageDb,
      statements: { covered: 0, total: 0, percentage: 0 },
      branches: { covered: 0, total: 0, percentage: 0 },
      functions: { covered: 0, total: 0, percentage: 0 },
      lines: { covered: 0, total: 0, percentage: 0 }
    });
  }

  const metrics = calculateAggregateMetrics(files);

  return {
    path: cwd,
    framework,
    metrics,
    files,
    timestamp: new Date()
  };
}

/**
 * Parse coverage.xml format
 */
function parseCoverageXml(content: string, baseDir: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  
  // Simple XML parsing for coverage data
  const packageRegex = /<package[^>]*name="([^"]*)"[^>]*>/g;
  const classRegex = /<class[^>]*name="([^"]*)"[^>]*>/g;
  const lineRegex = /<line[^>]*number="(\d+)"[^>]*hits="(\d+)"[^>]*branch="(true|false)"[^>]*\/>/g;
  
  let match;
  const packages = new Map<string, FileCoverage>();
  
  while ((match = packageRegex.exec(content)) !== null) {
    const packageName = match[1];
    packages.set(packageName, {
      path: path.join(baseDir, packageName),
      statements: { covered: 0, total: 0, percentage: 0 },
      branches: { covered: 0, total: 0, percentage: 0 },
      functions: { covered: 0, total: 0, percentage: 0 },
      lines: { covered: 0, total: 0, percentage: 0 }
    });
  }
  
  // Reset regex
  packageRegex.lastIndex = 0;
  
  for (const [packageName, fileCoverage] of packages) {
    // Find lines in this package
    const classStart = content.indexOf(`name="${packageName}"`);
    if (classStart === -1) continue;
    
    const packageSection = content.substring(classStart);
    const packageEnd = packageSection.indexOf('</package>');
    const relevantSection = packageSection.substring(0, packageEnd > 0 ? packageEnd : packageSection.length);
    
    let lineMatch;
    while ((lineMatch = lineRegex.exec(relevantSection)) !== null) {
      fileCoverage.lines.total++;
      if (parseInt(lineMatch[2], 10) > 0) {
        fileCoverage.lines.covered++;
      }
      if (lineMatch[3] === 'true') {
        fileCoverage.branches.total++;
      }
    }
    
    if (fileCoverage.lines.total > 0) {
      fileCoverage.lines.percentage = (fileCoverage.lines.covered / fileCoverage.lines.total) * 100;
    }
    
    files.push(fileCoverage);
  }

  return files;
}

/**
 * Parse gcov output
 */
async function parseGcovCoverage(
  cwd: string,
  framework: TestFramework
): Promise<CoverageReport> {
  const files: FileCoverage[] = [];
  
  const gcovFiles = fs.readdirSync(cwd).filter(f => f.endsWith('.gcov'));
  
  for (const gcovFile of gcovFiles) {
    const content = await fs.promises.readFile(path.join(cwd, gcovFile), 'utf-8');
    const lines = content.split('\n');
    
    const fileCoverage: FileCoverage = {
      path: gcovFile.replace('.gcov', ''),
      statements: { covered: 0, total: 0, percentage: 0 },
      branches: { covered: 0, total: 0, percentage: 0 },
      functions: { covered: 0, total: 0, percentage: 0 },
      lines: { covered: 0, total: 0, percentage: 0 }
    };
    
    for (const line of lines) {
      // gcov format: line:count
      const lineMatch = line.match(/^\s*(\d+):\s*(\d+):/);
      if (lineMatch) {
        fileCoverage.lines.total++;
        if (parseInt(lineMatch[2], 10) > 0) {
          fileCoverage.lines.covered++;
        }
      }
      
      // Branch lines
      const branchMatch = line.match(/branch\s+\d+\s+(taken|not taken)/);
      if (branchMatch) {
        fileCoverage.branches.total++;
        if (branchMatch[1] === 'taken') {
          fileCoverage.branches.covered++;
        }
      }
    }
    
    fileCoverage.lines.percentage = fileCoverage.lines.total > 0
      ? (fileCoverage.lines.covered / fileCoverage.lines.total) * 100
      : 0;
    
    files.push(fileCoverage);
  }

  const metrics = calculateAggregateMetrics(files);

  return {
    path: cwd,
    framework,
    metrics,
    files,
    timestamp: new Date()
  };
}

/**
 * Parse Jacoco coverage report
 */
async function parseJacocoCoverage(
  cwd: string,
  framework: TestFramework
): Promise<CoverageReport> {
  const files: FileCoverage[] = [];
  
  const jacocoReports = fs.readdirSync(cwd).filter(
    f => f.includes('jacoco') && f.endsWith('.xml')
  );
  
  for (const reportFile of jacocoReports) {
    const content = await fs.promises.readFile(path.join(cwd, reportFile), 'utf-8');
    files.push(...parseJacocoXml(content, cwd));
  }

  const metrics = calculateAggregateMetrics(files);

  return {
    path: cwd,
    framework,
    metrics,
    files,
    timestamp: new Date()
  };
}

/**
 * Parse Jacoco XML format
 */
function parseJacocoXml(content: string, baseDir: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  
  // Parse package elements
  const packageRegex = /<package[^>]*name="([^"]*)"[^>]*>[\s\S]*?<\/package>/g;
  const sourceRegex = /<sourcefile[^>]*name="([^"]*)"[^>]*>[\s\S]*?<\/sourcefile>/g;
  const counterRegex = /<counter[^>]*type="(\w+)"[^>]*missed="(\d+)"[^>]*covered="(\d+)"[^>]*\/>/g;
  
  let packageMatch;
  while ((packageMatch = packageRegex.exec(content)) !== null) {
    const packageSection = packageMatch[0];
    const packageName = packageMatch[1];
    
    let sourceMatch;
    while ((sourceMatch = sourceRegex.exec(packageSection)) !== null) {
      const sourceName = sourceMatch[1];
      const sourceSection = sourceMatch[0];
      
      const fileCoverage: FileCoverage = {
        path: path.join(baseDir, packageName, sourceName),
        statements: { covered: 0, total: 0, percentage: 0 },
        branches: { covered: 0, total: 0, percentage: 0 },
        functions: { covered: 0, total: 0, percentage: 0 },
        lines: { covered: 0, total: 0, percentage: 0 }
      };
      
      let counterMatch;
      while ((counterMatch = counterRegex.exec(sourceSection)) !== null) {
        const type = counterMatch[1];
        const missed = parseInt(counterMatch[2], 10);
        const covered = parseInt(counterMatch[3], 10);
        const total = missed + covered;
        
        const metric: CoverageMetric = { covered, total, percentage: 0 };
        if (total > 0) {
          metric.percentage = (covered / total) * 100;
        }
        
        switch (type) {
          case 'INSTRUCTION':
            fileCoverage.statements = metric;
            break;
          case 'BRANCH':
            fileCoverage.branches = metric;
            break;
          case 'METHOD':
            fileCoverage.functions = metric;
            break;
          case 'LINE':
            fileCoverage.lines = metric;
            break;
        }
      }
      
      files.push(fileCoverage);
    }
  }

  return files;
}

/**
 * Calculate aggregate metrics from file coverages
 */
function calculateAggregateMetrics(files: FileCoverage[]): CoverageMetrics {
  const aggregate: CoverageMetrics = createEmptyMetrics();
  
  for (const file of files) {
    aggregate.statements.covered += file.statements.covered;
    aggregate.statements.total += file.statements.total;
    
    aggregate.branches.covered += file.branches.covered;
    aggregate.branches.total += file.branches.total;
    
    aggregate.functions.covered += file.functions.covered;
    aggregate.functions.total += file.functions.total;
    
    aggregate.lines.covered += file.lines.covered;
    aggregate.lines.total += file.lines.total;
  }
  
  // Calculate percentages
  aggregate.statements.percentage = aggregate.statements.total > 0
    ? (aggregate.statements.covered / aggregate.statements.total) * 100
    : 0;
  aggregate.branches.percentage = aggregate.branches.total > 0
    ? (aggregate.branches.covered / aggregate.branches.total) * 100
    : 0;
  aggregate.functions.percentage = aggregate.functions.total > 0
    ? (aggregate.functions.covered / aggregate.functions.total) * 100
    : 0;
  aggregate.lines.percentage = aggregate.lines.total > 0
    ? (aggregate.lines.covered / aggregate.lines.total) * 100
    : 0;
  
  return aggregate;
}

/**
 * Create empty metrics object
 */
function createEmptyMetrics(): CoverageMetrics {
  return {
    statements: { covered: 0, total: 0, percentage: 0 },
    branches: { covered: 0, total: 0, percentage: 0 },
    functions: { covered: 0, total: 0, percentage: 0 },
    lines: { covered: 0, total: 0, percentage: 0 }
  };
}

/**
 * Calculate metric from raw data
 */
function calculateMetric(data: Record<string, number>): CoverageMetric {
  const entries = Object.entries(data);
  const covered = entries.filter(([, count]) => count > 0).length;
  const total = entries.length;
  
  return {
    covered,
    total,
    percentage: total > 0 ? (covered / total) * 100 : 0
  };
}

/**
 * Check coverage against thresholds
 */
export function checkCoverageThresholds(
  metrics: CoverageMetrics,
  thresholds: { statements?: number; branches?: number; functions?: number; lines?: number }
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  
  if (thresholds.statements && metrics.statements.percentage < thresholds.statements) {
    failures.push(`Statements: ${metrics.statements.percentage.toFixed(1)}% < ${thresholds.statements}%`);
  }
  if (thresholds.branches && metrics.branches.percentage < thresholds.branches) {
    failures.push(`Branches: ${metrics.branches.percentage.toFixed(1)}% < ${thresholds.branches}%`);
  }
  if (thresholds.functions && metrics.functions.percentage < thresholds.functions) {
    failures.push(`Functions: ${metrics.functions.percentage.toFixed(1)}% < ${thresholds.functions}%`);
  }
  if (thresholds.lines && metrics.lines.percentage < thresholds.lines) {
    failures.push(`Lines: ${metrics.lines.percentage.toFixed(1)}% < ${thresholds.lines}%`);
  }
  
  return {
    passed: failures.length === 0,
    failures
  };
}

/**
 * Generate coverage summary report
 */
export function formatCoverageSummary(metrics: CoverageMetrics): string {
  const lines: string[] = [];
  
  lines.push('Coverage Summary:');
  lines.push('================');
  lines.push(`Statements: ${metrics.statements.covered}/${metrics.statements.total} (${metrics.statements.percentage.toFixed(1)}%)`);
  lines.push(`Branches:   ${metrics.branches.covered}/${metrics.branches.total} (${metrics.branches.percentage.toFixed(1)}%)`);
  lines.push(`Functions:  ${metrics.functions.covered}/${metrics.functions.total} (${metrics.functions.percentage.toFixed(1)}%)`);
  lines.push(`Lines:      ${metrics.lines.covered}/${metrics.lines.total} (${metrics.lines.percentage.toFixed(1)}%)`);
  
  return lines.join('\n');
}

/**
 * Generate coverage badge URL (for shields.io style badges)
 */
export function generateCoverageBadge(
  metrics: CoverageMetrics,
  type: 'statements' | 'branches' | 'functions' | 'lines' = 'statements'
): string {
  const percentage = Math.round(metrics[type].percentage);
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  
  // Color based on coverage
  let color = 'red';
  if (percentage >= 80) color = 'green';
  else if (percentage >= 60) color = 'yellow';
  else if (percentage >= 40) color = 'orange';
  
  return `https://img.shields.io/badge/${label}-${percentage}%25-${color}`;
}
