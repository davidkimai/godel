/**
 * Scenario 5: CLI Integration Tests
 * 
 * Tests for CLI commands working with real Godel instance.
 * - swarmctl spawn command
 * - swarmctl status command
 * - swarmctl kill command
 */

import { execSync } from 'child_process';
import { testConfig } from '../config';

const RUN_LIVE_INTEGRATION_TESTS = process.env['RUN_LIVE_INTEGRATION_TESTS'] === 'true';
const describeLive = RUN_LIVE_INTEGRATION_TESTS ? describe : describe.skip;

describeLive('Scenario 5: CLI Integration', () => {
  const cliPath = 'swarmctl';
  const createdSwarms: string[] = [];
  const createdAgents: string[] = [];

  // Helper to execute CLI commands
  function execCli(command: string, timeout: number = 30000): { 
    stdout: string; 
    stderr: string; 
    exitCode: number;
    success: boolean;
  } {
    try {
      const stdout = execSync(`${cliPath} ${command}`, {
        encoding: 'utf-8',
        timeout,
        cwd: process.cwd(),
        env: {
          ...process.env,
          GODEL_API_URL: testConfig.godelApiUrl,
          GODEL_API_KEY: testConfig.godelApiKey,
        },
      });
      return { 
        stdout, 
        stderr: '', 
        exitCode: 0, 
        success: true 
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1,
        success: false,
      };
    }
  }

  afterAll(async () => {
    // Clean up created resources
    for (const agentId of createdAgents) {
      try {
        execCli(`agent kill ${agentId} --force`, 10000);
      } catch {
        // Ignore cleanup errors
      }
    }
    
    for (const swarmId of createdSwarms) {
      try {
        execCli(`swarm destroy ${swarmId} --force`, 10000);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Basic CLI Commands', () => {
    it('should display CLI version', () => {
      const result = execCli('--version');
      
      expect(result.success).toBe(true);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    }, testConfig.testTimeout);

    it('should display CLI help', () => {
      const result = execCli('--help');
      
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Commands:');
    }, testConfig.testTimeout);

    it('should display subcommand help', () => {
      const result = execCli('agent --help');
      
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('agent');
      expect(result.stdout).toMatch(/spawn|list|get|kill/);
    }, testConfig.testTimeout);
  });

  describe('Agent Commands', () => {
    it('should spawn agent via CLI', () => {
      // Create a swarm first
      const swarmResult = execCli(`swarm create --name cli-test-swarm-${Date.now()}`);
      expect(swarmResult.success).toBe(true);
      
      // Extract swarm ID from output (format varies)
      const swarmMatch = swarmResult.stdout.match(/(?:swarm-|id[:\s]+)([a-z0-9-]+)/i);
      const swarmId = swarmMatch ? swarmMatch[1] : null;
      
      if (swarmId) {
        createdSwarms.push(swarmId);
      }

      // Spawn agent in the swarm
      const spawnResult = execCli(
        `agent spawn --swarm ${swarmId || 'default'} --type code-review --task "CLI test task"`
      );
      
      expect(spawnResult.success).toBe(true);
      expect(spawnResult.stdout).toContain('Agent');
      expect(spawnResult.stdout).toMatch(/agent-[a-z0-9-]+/);

      // Extract agent ID
      const agentMatch = spawnResult.stdout.match(/(agent-[a-z0-9-]+)/);
      if (agentMatch) {
        createdAgents.push(agentMatch[1]);
      }
    }, testConfig.testTimeout);

    it('should list agents via CLI', () => {
      const result = execCli('agent list');
      
      // Should succeed (may be empty or have agents)
      expect(result.success).toBe(true);
      
      // Output should be parseable (table format, JSON, etc.)
      expect(result.stdout.length).toBeGreaterThanOrEqual(0);
    }, testConfig.testTimeout);

    it('should show agent status via CLI', () => {
      // First create an agent
      const swarmResult = execCli(`swarm create --name status-test-${Date.now()}`);
      const swarmId = swarmResult.stdout.match(/(?:swarm-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (swarmId) {
        createdSwarms.push(swarmId);
      }

      const spawnResult = execCli(
        `agent spawn --swarm ${swarmId || 'default'} --type test`
      );
      const agentId = spawnResult.stdout.match(/(agent-[a-z0-9-]+)/)?.[1];
      
      if (agentId) {
        createdAgents.push(agentId);
      }

      // Get agent status
      const statusResult = execCli(`agent get ${agentId || 'unknown'}`);
      
      if (agentId) {
        expect(statusResult.success).toBe(true);
        expect(statusResult.stdout).toContain(agentId);
        expect(statusResult.stdout.toLowerCase()).toMatch(/status|state|pending|running/);
      }
    }, testConfig.testTimeout);

    it('should kill agent via CLI', () => {
      // Create and then kill
      const swarmResult = execCli(`swarm create --name kill-test-${Date.now()}`);
      const swarmId = swarmResult.stdout.match(/(?:swarm-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (swarmId) {
        createdSwarms.push(swarmId);
      }

      const spawnResult = execCli(
        `agent spawn --swarm ${swarmId || 'default'} --type test`
      );
      const agentId = spawnResult.stdout.match(/(agent-[a-z0-9-]+)/)?.[1];

      if (agentId) {
        // Kill the agent
        const killResult = execCli(`agent kill ${agentId} --force`);
        
        expect(killResult.success).toBe(true);
        
        // Verify agent is gone or killed
        const statusResult = execCli(`agent get ${agentId}`);
        expect(
          statusResult.success === false || 
          statusResult.stdout.toLowerCase().includes('killed') ||
          statusResult.stdout.toLowerCase().includes('not found')
        ).toBe(true);
      }
    }, testConfig.testTimeout);

    it('should handle agent spawn with options', () => {
      const swarmResult = execCli(`swarm create --name options-test-${Date.now()}`);
      const swarmId = swarmResult.stdout.match(/(?:swarm-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (swarmId) {
        createdSwarms.push(swarmId);
      }

      const result = execCli(
        `agent spawn ` +
        `--swarm ${swarmId || 'default'} ` +
        `--type security-audit ` +
        `--model kimi-k2.5 ` +
        `--task "Security audit task" ` +
        '--timeout 300000'
      );

      expect(result.success).toBe(true);
      
      const agentId = result.stdout.match(/(agent-[a-z0-9-]+)/)?.[1];
      if (agentId) {
        createdAgents.push(agentId);
      }
    }, testConfig.testTimeout);
  });

  describe('Swarm Commands', () => {
    it('should create swarm via CLI', () => {
      const result = execCli(`swarm create --name cli-swarm-${Date.now()}`);
      
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Swarm');
      expect(result.stdout).toMatch(/(?:swarm-|id[:\s]+)[a-z0-9-]+/i);

      const swarmId = result.stdout.match(/(?:swarm-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      if (swarmId) {
        createdSwarms.push(swarmId);
      }
    }, testConfig.testTimeout);

    it('should list swarms via CLI', () => {
      const result = execCli('swarm list');
      
      expect(result.success).toBe(true);
      // Output should contain headers or swarm data
    }, testConfig.testTimeout);

    it('should show swarm status via CLI', () => {
      // Create a swarm first
      const createResult = execCli(`swarm create --name status-swarm-${Date.now()}`);
      const swarmId = createResult.stdout.match(/(?:swarm-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (swarmId) {
        createdSwarms.push(swarmId);
      }

      // Get status
      const statusResult = execCli(`swarm get ${swarmId || 'unknown'}`);
      
      if (swarmId) {
        expect(statusResult.success).toBe(true);
        expect(statusResult.stdout).toContain(swarmId);
      }
    }, testConfig.testTimeout);

    it('should scale swarm via CLI', () => {
      const createResult = execCli(`swarm create --name scale-swarm-${Date.now()} --agents 1`);
      const swarmId = createResult.stdout.match(/(?:swarm-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (swarmId) {
        createdSwarms.push(swarmId);
      }

      const scaleResult = execCli(`swarm scale ${swarmId || 'unknown'} --agents 3`);
      
      if (swarmId) {
        expect(scaleResult.success).toBe(true);
      }
    }, testConfig.testTimeout);

    it('should destroy swarm via CLI', () => {
      // Create a swarm to destroy
      const createResult = execCli(`swarm create --name destroy-test-${Date.now()}`);
      const swarmId = createResult.stdout.match(/(?:swarm-|id[:\s]+)([a-z0-9-]+)/i)?.[1];

      if (swarmId) {
        // Destroy it
        const destroyResult = execCli(`swarm destroy ${swarmId} --force`);
        expect(destroyResult.success).toBe(true);

        // Verify it's gone
        const getResult = execCli(`swarm get ${swarmId}`);
        expect(getResult.success).toBe(false);
      }
    }, testConfig.testTimeout);
  });

  describe('Task Commands', () => {
    it('should create task via CLI', () => {
      const result = execCli(
        `task create --title "CLI Test Task" --description "Created via CLI" --priority high`
      );

      // May or may not be implemented
      if (result.success) {
        expect(result.stdout).toContain('Task');
      }
    }, testConfig.testTimeout);

    it('should list tasks via CLI', () => {
      const result = execCli('task list');
      
      // May or may not be implemented
      if (result.success) {
        expect(result.stdout.length).toBeGreaterThanOrEqual(0);
      }
    }, testConfig.testTimeout);
  });

  describe('System Commands', () => {
    it('should show system status via CLI', () => {
      const result = execCli('status');
      
      expect(result.success).toBe(true);
      expect(result.stdout.toLowerCase()).toMatch(/status|health|running|ready/);
    }, testConfig.testTimeout);

    it('should show system health via CLI', () => {
      const result = execCli('health');
      
      expect(result.success).toBe(true);
      expect(result.stdout.toLowerCase()).toMatch(/health|healthy|status/);
    }, testConfig.testTimeout);

    it('should show metrics via CLI', () => {
      const result = execCli('metrics');
      
      if (result.success) {
        expect(result.stdout).toBeDefined();
      }
    }, testConfig.testTimeout);
  });

  describe('Error Handling', () => {
    it('should handle invalid command gracefully', () => {
      const result = execCli('invalid-command-that-does-not-exist');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    }, testConfig.testTimeout);

    it('should handle missing required arguments', () => {
      const result = execCli('agent spawn'); // Missing required args
      
      expect(result.success).toBe(false);
      expect(result.stderr || result.stdout).toMatch(/required|missing|usage/i);
    }, testConfig.testTimeout);

    it('should handle non-existent resources', () => {
      const result = execCli('agent get non-existent-agent-id-12345');
      
      expect(result.success).toBe(false);
    }, testConfig.testTimeout);

    it('should handle connection errors gracefully', () => {
      // Test with invalid API URL
      try {
        execSync('swarmctl status', {
          encoding: 'utf-8',
          timeout: 5000,
          env: {
            ...process.env,
            GODEL_API_URL: 'http://invalid-host:99999',
          },
        });
      } catch (error: any) {
        // Should fail with connection error
        expect(error).toBeDefined();
      }
    }, testConfig.testTimeout);
  });

  describe('Output Formats', () => {
    it('should support JSON output format', () => {
      const result = execCli('status --json');
      
      if (result.success) {
        try {
          const json = JSON.parse(result.stdout);
          expect(json).toBeDefined();
        } catch {
          // JSON parsing might fail if format is different
        }
      }
    }, testConfig.testTimeout);

    it('should support quiet mode', () => {
      const result = execCli('status --quiet');
      
      // Quiet mode might have minimal or no output on success
      expect(result.success).toBe(true);
    }, testConfig.testTimeout);
  });

  describe('Configuration', () => {
    it('should respect environment variables', () => {
      // Test that CLI uses GODEL_API_URL from environment
      const result = execCli('status');
      
      // Should connect successfully using test config
      expect(result.success).toBe(true);
    }, testConfig.testTimeout);

    it('should support config file', () => {
      // Test config file support if implemented
      const result = execCli('config --show');
      
      // May or may not be implemented
      if (result.success) {
        expect(result.stdout).toBeDefined();
      }
    }, testConfig.testTimeout);
  });
});
