/**
 * Test Runner
 * 
 * Test discovery, execution, and result parsing for multiple frameworks
 * Supports Jest, Vitest, pytest, unittest, cargo test, and go test
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import {
  TestFramework,
  TestConfig,
  TestDiscoveryResult,
  TestFile,
  TestResult,
  TestSuite,
  TestExecutionResult,
  TestSummary,
  TestError,
  SpawnOptions,
  PatternMatchOptions,
  ChangedFile,
  IncrementalResult
} from './types';

/**
 * Detect the test framework based on project files
 */
export function detectFramework(cwd: string): TestFramework | null {
  const packageJson = path.join(cwd, 'package.json');
  const pyprojectToml = path.join(cwd, 'pyproject.toml');
  const setupPy = path.join(cwd, 'setup.py');
  const cargoToml = path.join(cwd, 'Cargo.toml');
  const goMod = path.join(cwd, 'go.mod');
  const vitestConfig = path.join(cwd, 'vitest.config.ts');
  const jestConfig = path.join(cwd, 'jest.config.js');
  const jestConfigTs = path.join(cwd, 'jest.config.ts');

  // Check for JavaScript/TypeScript frameworks
  if (fs.existsSync(vitestConfig) || fs.existsSync(path.join(cwd, 'vitest.config.js'))) {
    return 'vitest';
  }
  if (fs.existsSync(jestConfig) || fs.existsSync(jestConfigTs)) {
    return 'jest';
  }

  // Check for Python
  if (fs.existsSync(pyprojectToml) || fs.existsSync(setupPy)) {
    const content = fs.readFileSync(pyprojectToml || setupPy, 'utf-8');
    if (content.includes('pytest') || content.includes('unittest')) {
      return fs.existsSync(path.join(cwd, 'pytest.ini')) ? 'pytest' : 'unittest';
    }
  }

  // Check for Rust
  if (fs.existsSync(cargoToml)) {
    return 'cargo';
  }

  // Check for Go
  if (fs.existsSync(goMod)) {
    return 'go';
  }

  // Check package.json for test script
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
      const testScript = pkg.scripts?.test;
      if (testScript) {
        if (testScript.includes('vitest')) return 'vitest';
        if (testScript.includes('jest')) return 'jest';
        if (testScript.includes('pytest')) return 'pytest';
        if (testScript.includes('unittest')) return 'unittest';
        if (testScript.includes('cargo')) return 'cargo';
        if (testScript.includes('go test')) return 'go';
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Discover test files using glob patterns
 */
export async function discoverTests(
  cwd: string,
  pattern: string = '**/*.test.{ts,js,py,go,rs}',
  ignorePatterns: string[] = []
): Promise<TestDiscoveryResult> {
  const framework = detectFramework(cwd);
  
  // Build framework-specific patterns
  const frameworkPatterns = getFrameworkPatterns(framework);
  
  const globPattern = pattern || frameworkPatterns.default;
  const patterns = Array.isArray(globPattern) ? globPattern : [globPattern];
  
  const files: TestFile[] = [];
  
  for (const p of patterns) {
    const matches = await glob(p, {
      cwd,
      ignore: ignorePatterns,
      absolute: true
    });
    
    for (const filePath of matches) {
      files.push({
        path: filePath,
        framework: framework || detectFrameworkByFile(filePath),
        testCount: await estimateTestCount(filePath)
      });
    }
  }

  // Deduplicate files
  const uniqueFiles = Array.from(new Map(files.map(f => [f.path, f])).values());

  return {
    files: uniqueFiles,
    totalCount: uniqueFiles.length
  };
}

/**
 * Get framework-specific test patterns
 */
function getFrameworkPatterns(framework: TestFramework | null): { default: string | string[] } {
  const patterns: Record<TestFramework, string | string[]> = {
    jest: ['**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}'],
    vitest: ['**/*.test.{ts,js,tsx,jsx}', '**/*.spec.{ts,js,tsx,jsx}'],
    pytest: ['**/test_*.py', '**/*_test.py'],
    unittest: ['**/test_*.py', '**/*_test.py'],
    cargo: ['**/tests/**/*.rs'],
    go: ['**/*_test.go']
  };

  return {
    default: framework ? patterns[framework] : ['**/*.test.{ts,js,py,go,rs}']
  };
}

/**
 * Detect framework by file extension
 */
function detectFrameworkByFile(filePath: string): TestFramework {
  const ext = path.extname(filePath);
  const name = path.basename(filePath);
  
  if (ext === '.ts' || ext === '.js' || ext === '.tsx' || ext === '.jsx') {
    return name.includes('.spec.') || name.includes('.test.') ? 'jest' : 'vitest';
  }
  if (ext === '.py') {
    return name.startsWith('test_') || name.endsWith('_test.py') ? 'pytest' : 'unittest';
  }
  if (ext === '.rs') return 'cargo';
  if (ext === '.go') return 'go';
  
  return 'jest'; // Default
}

/**
 * Estimate test count in a file
 */
async function estimateTestCount(filePath: string): Promise<number> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    
    // Simple heuristics for different frameworks
    const testCountPatterns: Record<TestFramework, RegExp[]> = {
      jest: [/test\s*\(/g, /it\s*\(/g, /describe\s*\(/g],
      vitest: [/test\s*\(/g, /it\s*\(/g, /describe\s*\(/g],
      pytest: [/def test_/g, /class Test/g],
      unittest: [/def test_/g, /class Test/g],
      cargo: [/fn test_/g, /#\[test\]/g],
      go: [/func Test/g, /func Benchmark/g]
    };

    const framework = detectFrameworkByFile(filePath);
    const patterns = testCountPatterns[framework];
    
    let count = 0;
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
  } catch {
    return 0;
  }
}

/**
 * Build the test command based on framework
 */
function buildTestCommand(
  config: TestConfig,
  files?: string[]
): { command: string; args: string[]; options: SpawnOptions } {
  const options: SpawnOptions = {
    cwd: config.pattern,
    stdio: 'pipe',
    timeout: 120000 // 2 minutes
  };

  const cmd = config.framework;
  const args: string[] = [];

  switch (config.framework) {
    case 'jest':
      args.push('--testPathPattern', files?.join('|') || '.');
      if (config.coverage) args.push('--coverage');
      if (config.incremental) args.push('--onlyChanged');
      return { command: 'npx', args: ['jest', ...args], options };

    case 'vitest':
      args.push('run');
      if (files) args.push(...files);
      if (config.coverage) args.push('--coverage');
      return { command: 'npx', args: ['vitest', ...args], options };

    case 'pytest':
      if (files) args.push(...files);
      if (config.coverage) args.push('--cov');
      args.push('-v', '--tb=short');
      return { command: 'python', args: ['-m', 'pytest', ...args], options };

    case 'unittest':
      if (files) args.push(...files);
      args.push('-v');
      return { command: 'python', args: ['-m', 'unittest', ...args], options };

    case 'cargo':
      args.push('test');
      if (files) args.push('--test', files[0].replace('.rs', ''));
      if (config.coverage) args.push('--coverage');
      return { command: 'cargo', args, options };

    case 'go':
      args.push('test', '-v', '-coverprofile=coverage.out');
      if (files) args.push(...files);
      return { command: 'go', args, options };

    default:
      throw new Error(`Unsupported test framework: ${config.framework}`);
  }
}

/**
 * Execute tests and return results
 */
export async function runTests(
  config: TestConfig,
  eventEmitter?: NodeJS.EventEmitter
): Promise<TestExecutionResult> {
  const startTime = Date.now();
  const { command, args, options } = buildTestCommand(config);

  // Emit test.started event
  if (eventEmitter) {
    eventEmitter.emit('test:started', { name: command, file: config.pattern });
  }

  const result = await spawnProcess(command, args, options, eventEmitter);

  // Parse results based on framework
  const framework = config.framework || detectFramework(config.pattern) || 'jest';
  const suites = await parseTestOutput(result.stdout + result.stderr, framework);

  const summary = calculateSummary(suites);

  const executionResult: TestExecutionResult = {
    success: result.exitCode === 0 && summary.failed === 0,
    summary,
    suites,
    duration: Date.now() - startTime,
    exitCode: result.exitCode
  };

  if (eventEmitter) {
    eventEmitter.emit('execution:complete', executionResult);
  }

  return executionResult;
}

/**
 * Spawn a process and capture output
 */
async function spawnProcess(
  command: string,
  args: string[],
  options: SpawnOptions,
  eventEmitter?: NodeJS.EventEmitter
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let exitCode = 0;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: options.stdio || 'pipe'
    });

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout.push(text);
      process.stdout.write(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr.push(text);
      process.stderr.write(text);
    });

    child.on('error', (error: Error) => {
      reject(error);
    });

    child.on('close', (code: number) => {
      exitCode = code || 0;
      resolve({
        stdout: stdout.join(''),
        stderr: stderr.join(''),
        exitCode
      });
    });

    // Timeout handling
    if (options.timeout) {
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Test execution timed out after ${options.timeout}ms`));
      }, options.timeout);
    }
  });
}

/**
 * Parse test output based on framework
 */
async function parseTestOutput(
  output: string,
  framework: TestFramework
): Promise<TestSuite[]> {
  const suites: TestSuite[] = [];

  switch (framework) {
    case 'jest':
    case 'vitest':
      suites.push(...parseJestOutput(output));
      break;
    case 'pytest':
    case 'unittest':
      suites.push(...parsePythonOutput(output));
      break;
    case 'cargo':
      suites.push(...parseCargoOutput(output));
      break;
    case 'go':
      suites.push(...parseGoOutput(output));
      break;
  }

  return suites;
}

/**
 * Parse Jest/Vitest output
 */
function parseJestOutput(output: string): TestSuite[] {
  const suites: TestSuite[] = [];
  const lines = output.split('\n');
  
  let currentSuite: TestSuite | null = null;
  let currentTest: TestResult | null = null;

  for (const line of lines) {
    // Suite header
    const suiteMatch = line.match(/PASS|FAIL\s+(.+)/);
    if (suiteMatch) {
      if (currentSuite) {
        suites.push(currentSuite);
      }
      currentSuite = {
        name: suiteMatch[1] || 'Test Suite',
        file: suiteMatch[1] || '',
        tests: [],
        duration: 0,
        timestamp: new Date()
      };
      continue;
    }

    // Test result
    const testMatch = line.match(/✓|✕|PASS|FAIL\s+(.+)/);
    if (testMatch) {
      const passed = testMatch[0].includes('✓') || testMatch[0].includes('PASS');
      const testLine = line.replace(/✓|✕|\s+/g, '').trim();
      
      if (currentSuite && testLine) {
        currentSuite.tests.push({
          name: testLine,
          status: passed ? 'passed' : 'failed',
          duration: 0,
          file: currentSuite.file
        });
      }
    }

    // Duration
    const durationMatch = line.match(/(\d+)ms/);
    if (currentSuite && durationMatch) {
      currentSuite.duration = parseInt(durationMatch[1], 10);
    }
  }

  if (currentSuite) {
    suites.push(currentSuite);
  }

  return suites;
}

/**
 * Parse Python (pytest/unittest) output
 */
function parsePythonOutput(output: string): TestSuite[] {
  const suites: TestSuite[] = [];
  const lines = output.split('\n');
  
  let currentSuite: TestSuite | null = null;

  for (const line of lines) {
    // Test class/suite
    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) {
      if (currentSuite) {
        suites.push(currentSuite);
      }
      currentSuite = {
        name: classMatch[1],
        file: '',
        tests: [],
        duration: 0,
        timestamp: new Date()
      };
      continue;
    }

    // Test result
    const testMatch = line.match(/^(test_|\w+)\s+(PASSED|FAILED|ERROR)\s+\((\d+\.\d+)s\)/);
    if (testMatch && currentSuite) {
      currentSuite.tests.push({
        name: testMatch[1],
        status: testMatch[2] === 'PASSED' ? 'passed' : 'failed',
        duration: parseFloat(testMatch[3]),
        file: currentSuite.file
      });
    }
  }

  if (currentSuite) {
    suites.push(currentSuite);
  }

  return suites;
}

/**
 * Parse Cargo test output
 */
function parseCargoOutput(output: string): TestSuite[] {
  const suites: TestSuite[] = [];
  const lines = output.split('\n');
  
  let currentSuite: TestSuite | null = null;

  for (const line of lines) {
    // Running tests
    const runningMatch = line.match(/running\s+(\d+)\s+test/);
    if (runningMatch) {
      currentSuite = {
        name: 'Cargo Tests',
        file: '',
        tests: [],
        duration: 0,
        timestamp: new Date()
      };
      continue;
    }

    // Test result
    const testMatch = line.match(/test\s+(\w+)\s+\.\.\.\s+(ok|FAILED|ignored)/);
    if (testMatch && currentSuite) {
      currentSuite.tests.push({
        name: testMatch[1],
        status: testMatch[2] === 'ok' ? 'passed' : testMatch[2] === 'ignored' ? 'skipped' : 'failed',
        duration: 0,
        file: ''
      });
    }
  }

  if (currentSuite && currentSuite.tests.length > 0) {
    suites.push(currentSuite);
  }

  return suites;
}

/**
 * Parse Go test output
 */
function parseGoOutput(output: string): TestSuite[] {
  const suites: TestSuite[] = [];
  const lines = output.split('\n');
  
  let currentSuite: TestSuite | null = null;

  for (const line of lines) {
    // Test function
    const testMatch = line.match(/=== RUN\s+(\w+)/);
    if (testMatch) {
      currentSuite = {
        name: testMatch[1],
        file: '',
        tests: [],
        duration: 0,
        timestamp: new Date()
      };
      continue;
    }

    // Test result
    const resultMatch = line.match(/--- (PASS|FAIL|SKIP):\s+(\w+)/);
    if (resultMatch && currentSuite) {
      currentSuite.tests.push({
        name: resultMatch[2],
        status: resultMatch[1] === 'PASS' ? 'passed' : resultMatch[1] === 'SKIP' ? 'skipped' : 'failed',
        duration: 0,
        file: ''
      });
    }
  }

  if (currentSuite && currentSuite.tests.length > 0) {
    suites.push(currentSuite);
  }

  return suites;
}

/**
 * Calculate test summary from suites
 */
function calculateSummary(suites: TestSuite[]): TestSummary {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  let duration = 0;

  for (const suite of suites) {
    for (const test of suite.tests) {
      total++;
      switch (test.status) {
        case 'passed': passed++; break;
        case 'failed': failed++; break;
        case 'skipped': skipped++; break;
        case 'pending': pending++; break;
      }
    }
    duration += suite.duration;
  }

  return {
    total,
    passed,
    failed,
    skipped,
    pending,
    duration
  };
}

/**
 * Get changed files since a given time
 */
export async function getChangedFiles(
  cwd: string,
  since: Date
): Promise<ChangedFile[]> {
  // Use git to get changed files
  const changedFiles: ChangedFile[] = [];
  
  try {
    const gitCmd = spawn('git', ['diff', '--name-only', `--since=${since.toISOString()}`], {
      cwd,
      stdio: 'pipe'
    });

    const stdout: string[] = [];
    gitCmd.stdout?.on('data', (data: Buffer) => {
      stdout.push(data.toString());
    });

    await new Promise<void>((resolve) => {
      gitCmd.on('close', () => resolve());
    });

    const files = stdout.join('').split('\n').filter(f => f.trim());
    
    for (const file of files) {
      const stats = await fs.promises.stat(path.join(cwd, file));
      changedFiles.push({
        path: file,
        changedAt: stats.mtime,
        type: 'modified'
      });
    }
  } catch {
    // Git not available or error - return empty
  }

  return changedFiles;
}

/**
 * Find tests affected by changed files
 */
export async function findAffectedTests(
  cwd: string,
  changedFiles: ChangedFile[]
): Promise<TestFile[]> {
  const affectedTests: TestFile[] = [];
  
  for (const changedFile of changedFiles) {
    // Look for test files that might test this file
    const testFileName = path.basename(changedFile.path).replace(
      /\.(ts|js|py|go|rs)$/,
      ''
    );
    
    const possibleTestPatterns = [
      `**/*${testFileName}*.test.*`,
      `**/test_${testFileName}.*`,
      `**/${testFileName}_test.*`,
      `**/tests/**/${testFileName}.*`
    ];

    for (const pattern of possibleTestPatterns) {
      const matches = await glob(pattern, { cwd, absolute: true });
      for (const match of matches) {
        if (!affectedTests.find(t => t.path === match)) {
          affectedTests.push({
            path: match,
            framework: detectFrameworkByFile(match)
          });
        }
      }
    }
  }

  return affectedTests;
}

/**
 * Run incremental tests (only changed/affected tests)
 */
export async function runIncrementalTests(
  config: TestConfig,
  since: Date,
  eventEmitter?: NodeJS.EventEmitter
): Promise<TestExecutionResult> {
  const changedFiles = await getChangedFiles(config.pattern, since);
  const affectedTests = await findAffectedTests(config.pattern, changedFiles);
  
  const testFiles = affectedTests.map(t => t.path);
  
  // If no affected tests found, run all tests
  const effectiveFiles = testFiles.length > 0 ? testFiles : undefined;
  
  return runTests({ ...config, incremental: true }, eventEmitter);
}
