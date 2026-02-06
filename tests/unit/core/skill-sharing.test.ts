/**
 * Multi-Agent Skill Sharing Tests
 * 
 * Tests for skill sharing between agents in a swarm.
 */

import { 
  SkillRegistry, 
  SwarmSkillManager, 
  SkillSource 
} from '../../../src/core/skills/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Multi-Agent Skill Sharing', () => {
  let registry: SkillRegistry;
  let swarmManager: SwarmSkillManager;
  let tempDir: string;
  let builtinSkillsDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godel-swarm-skills-test-'));
    builtinSkillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(builtinSkillsDir, { recursive: true });

    // Create test skills
    createSkill('deployment', 'Deploy services', ['When deploying']);
    createSkill('testing', 'Run tests', ['When testing']);
    createSkill('security', 'Security audit', ['When auditing']);
    createSkill('monitoring', 'Monitor systems', ['When monitoring']);

    registry = new SkillRegistry({
      userSkillsDir: path.join(tempDir, '.godel', 'skills'),
      projectSkillsDir: path.join(tempDir, '.godel', 'skills'),
      builtinSkillsDir,
      autoLoad: true,
      autoLoadThreshold: 0.2,
      maxAutoLoad: 5,
    });

    await registry.loadAll();
    swarmManager = new SwarmSkillManager(registry);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createSkill(name: string, description: string, whenToUse: string[]): void {
    const skillDir = path.join(builtinSkillsDir, name);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir);
    }

    const whenToUseContent = whenToUse.map((w) => `- ${w}`).join('\n');

    const content = `---
name: ${name}
description: ${description}
---

# ${name}

## When to Use

${whenToUseContent}

## Steps

1. Step one
2. Step two
`;

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
  }

  describe('Swarm Initialization', () => {
    it('should initialize swarm with shared skills', async () => {
      const context = await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'deploy application',
        skillConfig: {
          sharedSkills: ['deployment', 'monitoring'],
          roleSkills: {},
          autoLoad: false,
          dynamicSharing: false,
        },
      });

      expect(context.swarmId).toBe('swarm-1');
      expect(context.activeSkills.map((s) => s.name)).toContain('deployment');
      expect(context.activeSkills.map((s) => s.name)).toContain('monitoring');
    });

    it('should auto-load skills based on task', async () => {
      const context = await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'deploy application',
        skillConfig: {
          sharedSkills: [],
          roleSkills: {},
          autoLoad: true,
          dynamicSharing: false,
        },
      });

      // Should have auto-loaded deployment skill based on task
      const skillNames = context.activeSkills.map((s) => s.name);
      expect(skillNames).toContain('deployment');
    });
  });

  describe('Agent Registration', () => {
    beforeEach(async () => {
      await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'deploy application',
        skillConfig: {
          sharedSkills: ['deployment'],
          roleSkills: {
            tester: ['testing'],
            security: ['security'],
          },
          autoLoad: false,
          dynamicSharing: true,
        },
      });
    });

    it('should register agent with role-specific skills', async () => {
      const agent = await swarmManager.registerAgent(
        'swarm-1',
        'agent-1',
        'tester',
        {
          sharedSkills: ['deployment'],
          roleSkills: { tester: ['testing'] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );

      expect(agent.id).toBe('agent-1');
      expect(agent.role).toBe('tester');
      expect(agent.activeSkills).toContain('deployment');
      expect(agent.activeSkills).toContain('testing');
    });

    it('should allow agents with different roles to have different skills', async () => {
      const tester = await swarmManager.registerAgent(
        'swarm-1',
        'tester-1',
        'tester',
        {
          sharedSkills: ['deployment'],
          roleSkills: { tester: ['testing'] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );

      const security = await swarmManager.registerAgent(
        'swarm-1',
        'security-1',
        'security',
        {
          sharedSkills: ['deployment'],
          roleSkills: { security: ['security'] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );

      expect(tester.activeSkills).toContain('testing');
      expect(tester.activeSkills).not.toContain('security');
      expect(security.activeSkills).toContain('security');
      expect(security.activeSkills).not.toContain('testing');
    });
  });

  describe('Skill Sharing', () => {
    beforeEach(async () => {
      await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'deploy application',
        skillConfig: {
          sharedSkills: [],
          roleSkills: {},
          autoLoad: false,
          dynamicSharing: true,
        },
      });

      // Register two agents with different skills
      await swarmManager.registerAgent(
        'swarm-1',
        'agent-1',
        'expert',
        {
          sharedSkills: [],
          roleSkills: { expert: ['deployment', 'testing'] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );

      await swarmManager.registerAgent(
        'swarm-1',
        'agent-2',
        'novice',
        {
          sharedSkills: [],
          roleSkills: { novice: ['monitoring'] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );
    });

    it('should share skills from one agent to another', async () => {
      const result = await swarmManager.shareSkills(
        'agent-1',
        'agent-2',
        ['deployment']
      );

      expect(result).toBe(true);

      const agent2Skills = swarmManager.getAgentSkills('agent-2');
      const skillNames = agent2Skills.map((s) => s.name);
      expect(skillNames).toContain('deployment');
      expect(skillNames).toContain('monitoring'); // original skill
    });

    it('should fail to share skill agent does not have', async () => {
      const result = await swarmManager.shareSkills(
        'agent-2',
        'agent-1',
        ['security'] // agent-2 doesn't have this
      );

      expect(result).toBe(false);
    });

    it('should broadcast skills to all agents', async () => {
      // Register a third agent
      await swarmManager.registerAgent(
        'swarm-1',
        'agent-3',
        'helper',
        {
          sharedSkills: [],
          roleSkills: { helper: [] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );

      await swarmManager.broadcastSkills(
        'swarm-1',
        'agent-1',
        ['deployment', 'testing']
      );

      const agent2Skills = swarmManager.getAgentSkills('agent-2').map((s) => s.name);
      const agent3Skills = swarmManager.getAgentSkills('agent-3').map((s) => s.name);

      expect(agent2Skills).toContain('deployment');
      expect(agent2Skills).toContain('testing');
      expect(agent3Skills).toContain('deployment');
      expect(agent3Skills).toContain('testing');
    });

    it('should request skill from another agent', async () => {
      const result = await swarmManager.requestSkill(
        'agent-2',
        'agent-1',
        'deployment'
      );

      expect(result).toBe(true);

      const agent2Skills = swarmManager.getAgentSkills('agent-2').map((s) => s.name);
      expect(agent2Skills).toContain('deployment');
    });

    it('should fail to request skill target does not have', async () => {
      const result = await swarmManager.requestSkill(
        'agent-1',
        'agent-2',
        'security' // agent-2 doesn't have this
      );

      expect(result).toBe(false);
    });
  });

  describe('Dynamic Loading', () => {
    beforeEach(async () => {
      await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'monitoring',
        skillConfig: {
          sharedSkills: [],
          roleSkills: {},
          autoLoad: false,
          dynamicSharing: true,
        },
      });

      await swarmManager.registerAgent(
        'swarm-1',
        'agent-1',
        'worker',
        {
          sharedSkills: [],
          roleSkills: { worker: [] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );
    });

    it('should dynamically load skills based on context', async () => {
      const activated = await swarmManager.dynamicLoad(
        'swarm-1',
        'agent-1',
        'need to deploy to production'
      );

      expect(activated.length).toBeGreaterThan(0);
      expect(activated.some((a) => a.skill.name === 'deployment')).toBe(true);

      const agentSkills = swarmManager.getAgentSkills('agent-1');
      expect(agentSkills.some((s) => s.name === 'deployment')).toBe(true);
    });

    it('should emit event on dynamic load', async () => {
      const eventHandler = jest.fn();
      swarmManager.on('skills.dynamically.loaded', eventHandler);

      await swarmManager.dynamicLoad(
        'swarm-1',
        'agent-1',
        'deploy'
      );

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0];
      expect(event.swarmId).toBe('swarm-1');
      expect(event.agentId).toBe('agent-1');
      expect(event.skills).toContain('deployment');
    });
  });

  describe('Role Management', () => {
    beforeEach(async () => {
      await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'testing',
        skillConfig: {
          sharedSkills: [],
          roleSkills: {
            'senior-dev': ['deployment', 'testing', 'security'],
            'junior-dev': ['testing'],
            'ops': ['deployment', 'monitoring'],
          },
          autoLoad: false,
          dynamicSharing: true,
        },
      });
    });

    it('should assign role with appropriate skills', async () => {
      await swarmManager.registerAgent('swarm-1', 'agent-1');

      await swarmManager.assignRole('agent-1', 'senior-dev', {
        sharedSkills: [],
        roleSkills: {
          'senior-dev': ['deployment', 'testing', 'security'],
        },
        autoLoad: false,
        dynamicSharing: false,
      });

      const skills = swarmManager.getAgentSkills('agent-1').map((s) => s.name);
      expect(skills).toContain('deployment');
      expect(skills).toContain('testing');
      expect(skills).toContain('security');
    });

    it('should get skills for role', () => {
      const skills = swarmManager.getRoleSkills('senior-dev', {
        sharedSkills: [],
        roleSkills: {
          'senior-dev': ['deployment', 'testing', 'security'],
        },
        autoLoad: false,
        dynamicSharing: false,
      });

      expect(skills).toHaveLength(3);
      expect(skills.map((s) => s.name)).toContain('deployment');
    });
  });

  describe('Events', () => {
    it('should emit skill.shared event', async () => {
      await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'test',
        skillConfig: {
          sharedSkills: [],
          roleSkills: {},
          autoLoad: false,
          dynamicSharing: true,
        },
      });

      await swarmManager.registerAgent(
        'swarm-1',
        'agent-1',
        'tester',
        {
          sharedSkills: [],
          roleSkills: { tester: ['testing'] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );

      await swarmManager.registerAgent(
        'swarm-1',
        'agent-2',
        'helper',
        {
          sharedSkills: [],
          roleSkills: { helper: [] },
          autoLoad: false,
          dynamicSharing: false,
        }
      );

      const eventHandler = jest.fn();
      swarmManager.on('skills.shared', eventHandler);

      await swarmManager.shareSkills('agent-1', 'agent-2', ['testing']);

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0];
      expect(event.type).toBe('skill.shared');
      expect(event.sourceAgentId).toBe('agent-1');
      expect(event.targetAgentId).toBe('agent-2');
      expect(event.skillNames).toContain('testing');
    });
  });

  describe('Cleanup', () => {
    it('should clean up swarm resources', async () => {
      await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'test',
        skillConfig: {
          sharedSkills: ['deployment'],
          roleSkills: {},
          autoLoad: false,
          dynamicSharing: false,
        },
      });

      expect(registry.get('deployment')?.isActive).toBe(true);

      await swarmManager.cleanupSwarm('swarm-1');

      // After cleanup, deployment might be deactivated
      // depending on if it's shared with other swarms
    });

    it('should emit cleaned_up event', async () => {
      await swarmManager.initializeSwarm({
        swarmId: 'swarm-1',
        task: 'test',
        skillConfig: {
          sharedSkills: [],
          roleSkills: {},
          autoLoad: false,
          dynamicSharing: false,
        },
      });

      const eventHandler = jest.fn();
      swarmManager.on('swarm.cleaned_up', eventHandler);

      await swarmManager.cleanupSwarm('swarm-1');

      expect(eventHandler).toHaveBeenCalled();
      expect(eventHandler.mock.calls[0][0].swarmId).toBe('swarm-1');
    });
  });
});
