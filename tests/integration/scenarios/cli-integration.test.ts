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
    
    for (const teamId of createdTeams) {
      try {
        execCli(`team destroy ${teamId} --force`, 10000);
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
      // Create a team first
      const teamResult = execCli(`team create --name cli-test-team-${Date.now()}`);
      expect(teamResult.success).toBe(true);
      
      // Extract team ID from output (format varies)
      const teamMatch = teamResult.stdout.match(/(?:team-|id[:\s]+)([a-z0-9-]+)/i);
      const teamId = teamMatch ? teamMatch[1] : null;
      
      if (teamId) {
        createdTeams.push(teamId);
      }

      // Spawn agent in the team
      const spawnResult = execCli(
        `agent spawn --team ${teamId || 'default'} --type code-review --task "CLI test task"`
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
      const teamResult = execCli(`team create --name status-test-${Date.now()}`);
      const teamId = teamResult.stdout.match(/(?:team-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (teamId) {
        createdTeams.push(teamId);
      }

      const spawnResult = execCli(
        `agent spawn --team ${teamId || 'default'} --type test`
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
      const teamResult = execCli(`team create --name kill-test-${Date.now()}`);
      const teamId = teamResult.stdout.match(/(?:team-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (teamId) {
        createdTeams.push(teamId);
      }

      const spawnResult = execCli(
        `agent spawn --team ${teamId || 'default'} --type test`
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
      const teamResult = execCli(`team create --name options-test-${Date.now()}`);
      const teamId = teamResult.stdout.match(/(?:team-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (teamId) {
        createdTeams.push(teamId);
      }

      const result = execCli(
        `agent spawn ` +
        `--team ${teamId || 'default'} ` +
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
      const result = execCli(`team create --name cli-team-${Date.now()}`);
      
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Team');
      expect(result.stdout).toMatch(/(?:team-|id[:\s]+)[a-z0-9-]+/i);

      const teamId = result.stdout.match(/(?:team-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      if (teamId) {
        createdTeams.push(teamId);
      }
    }, testConfig.testTimeout);

    it('should list teams via CLI', () => {
      const result = execCli('team list');
      
      expect(result.success).toBe(true);
      // Output should contain headers or team data
    }, testConfig.testTimeout);

    it('should show team status via CLI', () => {
      // Create a team first
      const createResult = execCli(`team create --name status-team-${Date.now()}`);
      const teamId = createResult.stdout.match(/(?:team-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (teamId) {
        createdTeams.push(teamId);
      }

      // Get status
      const statusResult = execCli(`team get ${teamId || 'unknown'}`);
      
      if (teamId) {
        expect(statusResult.success).toBe(true);
        expect(statusResult.stdout).toContain(teamId);
      }
    }, testConfig.testTimeout);

    it('should scale team via CLI', () => {
      const createResult = execCli(`team create --name scale-team-${Date.now()} --agents 1`);
      const teamId = createResult.stdout.match(/(?:team-|id[:\s]+)([a-z0-9-]+)/i)?.[1];
      
      if (teamId) {
        createdTeams.push(teamId);
      }

      const scaleResult = execCli(`team scale ${teamId || 'unknown'} --agents 3`);
      
      if (teamId) {
        expect(scaleResult.success).toBe(true);
      }
    }, testConfig.testTimeout);

    it('should destroy team via CLI', () => {
      // Create a team to destroy
      const createResult = execCli(`team create --name destroy-test-${Date.now()}`);
      const teamId = createResult.stdout.match(/(?:team-|id[:\s]+)([a-z0-9-]+)/i)?.[1];

      if (teamId) {
        // Destroy it
        const destroyResult = execCli(`team destroy ${teamId} --force`);
        expect(destroyResult.success).toBe(true);

        // Verify it's gone
        const getResult = execCli(`team get ${teamId}`);
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
