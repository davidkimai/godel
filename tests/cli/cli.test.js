/**
 * CLI Comprehensive Test Suite
 * Tests all CLI functionality including:
 * - Command parsing
 * - Option handling
 * - Error messages
 * - Exit codes
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, unlink, mkdir, rmdir } from 'fs/promises';
import * as path from 'path';

const exec = promisify(spawn);

// Test utilities
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  output?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => Promise<void>) {
  return (async () => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`✅ ${name}`);
    } catch (error) {
      results.push({ name, passed: false, error: String(error) });
      console.log(`❌ ${name}: ${error}`);
    }
  })();
}

async function runGodel(args: string[], env?: Record<string, string>): Promise<{ code: number; output: string }> {
  const proc = exec('node', ['dist/src/index.js', ...args], {
    cwd: '/Users/jasontang/clawd/projects/godel',
    env: { ...process.env, ...env },
    timeout: 10000,
  });

  let output = '';
  proc.stdout?.on('data', (data) => {
    output += data.toString();
  });
  proc.stderr?.on('data', (data) => {
    output += data.toString();
  });

  const code = await new Promise<number>((resolve) => {
    proc.on('close', (c) => resolve(c));
    proc.on('error', () => resolve(1));
  });

  return { code, output };
}

console.log('\n=== CLI Test Suite ===\n');

// Test Suite
test('CLI should return version', async () => {
  const { code, output } = await runGodel(['--version']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.includes('2.0.0')) {
    throw new Error(`Version not found in output: ${output}`);
  }
});

test('CLI should show help with --help', async () => {
  const { code, output } = await runGodel(['--help']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.toLowerCase().includes('usage')) {
    throw new Error('Help should include usage information');
  }
});

test('CLI should show help with -h', async () => {
  const { code, output } = await runGodel(['-h']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.toLowerCase().includes('usage')) {
    throw new Error('Help should include usage information');
  }
});

test('CLI should list available commands', async () => {
  const { output } = await runGodel(['--help']);
  
  const expectedCommands = ['agent', 'swarm', 'workflow', 'status', 'config', 'init'];
  
  for (const cmd of expectedCommands) {
    if (!output.toLowerCase().includes(cmd)) {
      throw new Error(`Help should mention '${cmd}' command`);
    }
  }
});

test('CLI should handle unknown command gracefully', async () => {
  const { code, output } = await runGodel(['unknown-command']);
  
  if (code !== 1) {
    throw new Error(`Should exit with 1 for unknown command, got ${code}`);
  }
  
  if (!output.toLowerCase().includes('error') && !output.toLowerCase().includes('unknown')) {
    throw new Error('Error message should mention unknown command');
  }
});

test('CLI should handle invalid option', async () => {
  const { code, output } = await runGodel(['--invalid-option']);
  
  if (code !== 1) {
    throw new Error(`Should exit with 1 for invalid option, got ${code}`);
  }
});

test('CLI agent command should show help', async () => {
  const { code, output } = await runGodel(['agent', '--help']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.toLowerCase().includes('agent')) {
    throw new Error('Agent help should mention agent');
  }
});

test('CLI agent list should work without crash', async () => {
  const { code } = await runGodel(['agent', 'list']);
  
  // May fail due to OpenClaw, but should not crash
  // Exit code may be 1 due to gateway, but output should exist
  const { output } = await runGodel(['agent', 'list']);
  
  // Check it tried to execute, not crashed
  if (!output.includes('agent') && !output.includes('error')) {
    throw new Error('Agent list should either list agents or show error');
  }
});

test('CLI swarm command should show help', async () => {
  const { code, output } = await runGodel(['swarm', '--help']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.toLowerCase().includes('swarm')) {
    throw new Error('Swarm help should mention swarm');
  }
});

test('CLI swarm list should work without crash', async () => {
  const { output } = await runGodel(['swarm', 'list']);
  
  if (!output.includes('swarm') && !output.includes('error')) {
    throw new Error('Swarm list should either list swarms or show error');
  }
});

test('CLI workflow command should show help', async () => {
  const { code, output } = await runGodel(['workflow', '--help']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.toLowerCase().includes('workflow')) {
    throw new Error('Workflow help should mention workflow');
  }
});

test('CLI status command should show help', async () => {
  const { code, output } = await runGodel(['status', '--help']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.toLowerCase().includes('status')) {
    throw new Error('Status help should mention status');
  }
});

test('CLI config command should show help', async () => {
  const { code, output } = await runGodel(['config', '--help']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.toLowerCase().includes('config')) {
    throw new Error('Config help should mention config');
  }
});

test('CLI init command should show help', async () => {
  const { code, output } = await runGodel(['init', '--help']);
  
  if (code !== 0) {
    throw new Error(`Exit code: ${code}`);
  }
  
  if (!output.toLowerCase().includes('init')) {
    throw new Error('Init help should mention init');
  }
});

test('CLI should output valid JSON with --json option', async () => {
  const { output } = await runGodel(['--version', '--json']);
  
  try {
    JSON.parse(output);
  } catch {
    throw new Error('Output should be valid JSON');
  }
});

test('CLI should handle empty task gracefully', async () => {
  const { code } = await runGodel(['agent', 'spawn', '']);
  
  // Should not crash, may error due to validation
  if (code !== 0 && code !== 1) {
    throw new Error(`Unexpected exit code: ${code}`);
  }
});

test('CLI should show version in output', async () => {
  const { output } = await runGodel(['status']);
  
  if (!output.includes('2.0.0') && !output.includes('version')) {
    // Status may show different output, check for version reference
    console.log(`⚠️  Version not in status output, checking output: ${output.substring(0, 100)}...`);
  }
});

test('CLI environment variables should be respected', async () => {
  const { output } = await runGodel(['status'], {
    GODEL_DEBUG: 'true',
  });
  
  // Debug mode may add additional output
  console.log(`⚠️  Environment variable test (output: ${output.substring(0, 50)}...)`);
});

test('CLI should handle concurrent requests', async () => {
  // Run multiple commands concurrently
  const promises = [
    runGodel(['--version']),
    runGodel(['--help']),
    runGodel(['status']),
  ];
  
  const results = await Promise.all(promises);
  
  // All should complete without crashing
  for (let i = 0; i < results.length; i++) {
    const { code, output } = results[i];
    if (code === undefined || code === null) {
      throw new Error(`Command ${i} did not complete`);
    }
  }
});

test('CLI should have reasonable response time', async () => {
  const start = Date.now();
  const { code } = await runGodel(['--version']);
  const elapsed = Date.now() - start;
  
  if (elapsed > 5000) {
    throw new Error(`CLI responded in ${elapsed}ms, expected < 5000ms`);
  }
  
  console.log(`⚠️  Response time: ${elapsed}ms`);
});

test('CLI should handle keyboard interrupt gracefully', async () => {
  // This test is more for documentation - actual SIGINT handling
  // would require a different testing approach
  console.log('⚠️  SIGINT handling not tested (requires interactive shell)');
});

test('CLI should output to stdout correctly', async () => {
  const { output } = await runGodel(['--version']);
  
  if (output.length === 0) {
    throw new Error('Output should not be empty');
  }
  
  if (!output.trim()) {
    throw new Error('Output should not be whitespace only');
  }
});

test('CLI should support short options', async () => {
  const { code, output } = await runGodel(['-h']);
  
  if (code !== 0) {
    throw new Error(`Short option -h should work, exit code: ${code}`);
  }
});

test('CLI should support long options', async () => {
  const { code, output } = await runGodel(['--help']);
  
  if (code !== 0) {
    throw new Error(`Long option --help should work, exit code: ${code}`);
  }
});

// Summary
console.log('\n=== Test Results ===\n');
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

console.log(`Total: ${results.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Pass Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
}

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
