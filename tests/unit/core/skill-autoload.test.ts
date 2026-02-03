/**
 * Auto-Loading Tests
 * 
 * Tests for skill auto-loading based on context.
 */

import { SkillRegistry, SkillSource, Skill } from '../../../src/core/skills/index';
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

describe('Skill Auto-Loading', () => {
  let registry: SkillRegistry;
  let tempDir: string;
  let builtinSkillsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-autoload-test-'));
    builtinSkillsDir = path.join(tempDir, 'skills');
    fs.mkdirSync(builtinSkillsDir, { recursive: true });

    registry = new SkillRegistry({
      userSkillsDir: path.join(tempDir, '.dash', 'skills'),
      projectSkillsDir: path.join(tempDir, '.dash', 'skills'),
      builtinSkillsDir,
      autoLoad: true,
      autoLoadThreshold: 0.2,
      maxAutoLoad: 3,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createSkill(name: string, description: string, whenToUse: string[]): void {
    const skillDir = path.join(builtinSkillsDir, name);
    fs.mkdirSync(skillDir);

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

  describe('findRelevant', () => {
    it('should find relevant skills by name match', async () => {
      createSkill('deployment', 'Deploy to production', [
        'When deploying services',
        'When releasing to production',
      ]);
      createSkill('testing', 'Run tests', ['When writing tests', 'For test coverage']);

      await registry.loadAll();

      const matches = registry.findRelevant('deploy to production', 5);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].skill.name).toBe('deployment');
      expect(matches[0].score).toBeGreaterThan(0);
    });

    it('should find relevant skills by description match', async () => {
      createSkill('database', 'Database migration and schema management', [
        'When changing database schema',
      ]);
      createSkill('security', 'Security audit and hardening', [
        'When reviewing security',
      ]);

      await registry.loadAll();

      const matches = registry.findRelevant('need to migrate database schema', 5);

      expect(matches.some((m) => m.skill.name === 'database')).toBe(true);
    });

    it('should find relevant skills by whenToUse match', async () => {
      createSkill('ci-cd', 'CI/CD pipeline setup', [
        'When setting up GitHub Actions',
        'When configuring CI/CD',
        'For automated deployments',
      ]);

      await registry.loadAll();

      const matches = registry.findRelevant('help with GitHub Actions configuration', 5);

      expect(matches.some((m) => m.skill.name === 'ci-cd')).toBe(true);
    });

    it('should return empty array when no matches found', async () => {
      createSkill('deployment', 'Deploy services', ['When deploying']);

      await registry.loadAll();

      const matches = registry.findRelevant('completely unrelated query about cooking', 5);

      expect(matches).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      createSkill('skill1', 'First skill', ['When doing first thing']);
      createSkill('skill2', 'Second skill', ['When doing second thing']);
      createSkill('skill3', 'Third skill', ['When doing third thing']);
      createSkill('skill4', 'Fourth skill', ['When doing fourth thing']);

      await registry.loadAll();

      const matches = registry.findRelevant('doing thing', 2);

      expect(matches).toHaveLength(2);
    });

    it('should return skills sorted by relevance score', async () => {
      createSkill('deployment', 'Deploy services', ['When deploying']);
      createSkill('deploy-helper', 'Helper for deployment', ['When deploying things']);

      await registry.loadAll();

      const matches = registry.findRelevant('deploy', 5);

      // Exact name match should have higher score
      if (matches.length >= 2) {
        expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
      }
    });
  });

  describe('autoLoad', () => {
    it('should activate relevant skills', async () => {
      createSkill('deployment', 'Deploy to production', ['When deploying']);
      createSkill('testing', 'Run test suite', ['When testing']);

      await registry.loadAll();

      expect(registry.getActiveSkills()).toHaveLength(0);

      const activated = await registry.autoLoad('deploy to production');

      expect(activated.length).toBeGreaterThan(0);
      expect(registry.getActiveSkills().length).toBeGreaterThan(0);
      expect(registry.get('deployment')?.isActive).toBe(true);
    });

    it('should not exceed maxAutoLoad limit', async () => {
      createSkill('skill1', 'Skill one', ['When doing']);
      createSkill('skill2', 'Skill two', ['When doing']);
      createSkill('skill3', 'Skill three', ['When doing']);
      createSkill('skill4', 'Skill four', ['When doing']);
      createSkill('skill5', 'Skill five', ['When doing']);

      await registry.loadAll();

      const activated = await registry.autoLoad('doing');

      expect(activated.length).toBeLessThanOrEqual(3); // maxAutoLoad
    });

    it('should not reactivate already active skills', async () => {
      createSkill('deployment', 'Deploy services', ['When deploying']);

      await registry.loadAll();
      await registry.activate('deployment');

      const activated = await registry.autoLoad('deploy');

      // deployment is already active, shouldn't be in activated list
      expect(activated.filter((a) => a.skill.name === 'deployment')).toHaveLength(0);
    });

    it('should return empty array when autoLoad is disabled', async () => {
      createSkill('deployment', 'Deploy services', ['When deploying']);

      registry.updateConfig({ autoLoad: false });
      await registry.loadAll();

      const activated = await registry.autoLoad('deploy');

      expect(activated).toHaveLength(0);
    });

    it('should emit auto-loaded event', async () => {
      createSkill('deployment', 'Deploy services', ['When deploying']);

      await registry.loadAll();

      const eventHandler = jest.fn();
      registry.on('skill.auto-loaded', eventHandler);

      await registry.autoLoad('deploy');

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0];
      expect(event.type).toBe('skill.auto-loaded');
      expect(event.skillName).toBe('deployment');
      expect(event.data.score).toBeDefined();
    });
  });

  describe('relevance scoring', () => {
    it('should score name matches higher', async () => {
      createSkill('deployment', 'A deployment skill', ['When deploying']);
      createSkill('other', 'Another skill', ['When deploying things']);

      await registry.loadAll();

      const matches = registry.findRelevant('deployment', 5);

      const deploymentMatch = matches.find((m) => m.skill.name === 'deployment');
      const otherMatch = matches.find((m) => m.skill.name === 'other');

      if (deploymentMatch && otherMatch) {
        expect(deploymentMatch.score).toBeGreaterThan(otherMatch.score);
      }
    });

    it('should include matched terms in result', async () => {
      createSkill('deployment', 'Deploy to production', ['When deploying']);

      await registry.loadAll();

      const matches = registry.findRelevant('deploy production', 5);

      expect(matches[0].matchedTerms.length).toBeGreaterThan(0);
      expect(matches[0].matchedTerms).toContain('deploy');
    });

    it('should provide match reason', async () => {
      createSkill('deployment', 'Deploy services', ['When deploying']);

      await registry.loadAll();

      const matches = registry.findRelevant('deployment', 5);

      expect(matches[0].reason).toBeDefined();
      expect(matches[0].reason.length).toBeGreaterThan(0);
    });
  });

  describe('threshold behavior', () => {
    it('should filter by autoLoadThreshold', async () => {
      createSkill('deployment', 'Deploy services', ['When deploying']);
      createSkill('unrelated', 'Something else', ['When doing other things']);

      registry.updateConfig({ autoLoadThreshold: 0.5 });
      await registry.loadAll();

      const matches = registry.findRelevant('deploy', 5);

      // Only high relevance matches should be returned
      for (const match of matches) {
        expect(match.score).toBeGreaterThanOrEqual(0.5);
      }
    });
  });
});
