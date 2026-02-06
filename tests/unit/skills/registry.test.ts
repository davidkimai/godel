/**
 * Skills Registry Unit Tests
 * 
 * Tests for skill discovery, installation, and management.
 */

import { UnifiedSkillRegistry } from '../../../src/skills/registry';
import {
  UnifiedSearchParams,
  UnifiedInstallOptions,
  SkillSource,
} from '../../../src/skills/types';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/skills/clawhub', () => ({
  ClawHubAdapter: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      skills: [],
      total: 0,
      queryTimeMs: 10,
    }),
    get: jest.fn(),
    install: jest.fn().mockResolvedValue({ success: true }),
    uninstall: jest.fn().mockResolvedValue({ success: true }),
    listInstalled: jest.fn().mockResolvedValue([]),
    updateConfig: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(true),
    fetchSkill: jest.fn(),
  })),
  getGlobalClawHubAdapter: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      skills: [
        {
          id: 'clawhub-skill-1',
          name: 'ClawHub Skill 1',
          version: '1.0.0',
          source: 'clawhub',
          description: 'A test skill from ClawHub',
          author: 'test-author',
          downloads: 100,
          stars: 5,
          tags: ['test', 'clawhub'],
        },
      ],
      total: 1,
      queryTimeMs: 10,
    }),
    get: jest.fn().mockResolvedValue({
      id: 'clawhub-skill-1',
      name: 'ClawHub Skill 1',
      version: '1.0.0',
      source: 'clawhub',
    }),
    install: jest.fn().mockResolvedValue({
      success: true,
      skillId: 'clawhub-skill-1',
      installedPath: '/skills/clawhub-skill-1',
      version: '1.0.0',
      source: 'clawhub',
    }),
    uninstall: jest.fn().mockResolvedValue({ success: true }),
    listInstalled: jest.fn().mockResolvedValue([
      { id: 'installed-1', name: 'Installed 1', version: '1.0.0', source: 'clawhub' },
    ]),
    updateConfig: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(true),
    fetchSkill: jest.fn().mockResolvedValue({
      id: 'clawhub-skill-1',
      name: 'ClawHub Skill 1',
      version: '1.0.0',
      source: 'clawhub',
    }),
  })),
}));

jest.mock('../../../src/skills/vercel', () => ({
  VercelSkillsClient: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      skills: [],
      total: 0,
      queryTimeMs: 10,
    }),
    get: jest.fn(),
    install: jest.fn().mockResolvedValue({ success: true }),
    uninstall: jest.fn().mockResolvedValue({ success: true }),
    listInstalled: jest.fn().mockResolvedValue([]),
    updateConfig: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(true),
    fetchSkill: jest.fn(),
  })),
  getGlobalVercelSkillsClient: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      skills: [
        {
          id: 'vercel-skill-1',
          name: 'Vercel Skill 1',
          version: '2.0.0',
          source: 'vercel',
          description: 'A test skill from Vercel',
          author: 'vercel-author',
          downloads: 200,
          stars: 10,
          tags: ['test', 'vercel'],
        },
      ],
      total: 1,
      queryTimeMs: 15,
    }),
    get: jest.fn().mockResolvedValue({
      id: 'vercel-skill-1',
      name: 'Vercel Skill 1',
      version: '2.0.0',
      source: 'vercel',
    }),
    install: jest.fn().mockResolvedValue({
      success: true,
      skillId: 'vercel-skill-1',
      installedPath: '/skills/vercel-skill-1',
      version: '2.0.0',
      source: 'vercel',
    }),
    uninstall: jest.fn().mockResolvedValue({ success: true }),
    listInstalled: jest.fn().mockResolvedValue([]),
    updateConfig: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(true),
    fetchSkill: jest.fn().mockResolvedValue({
      id: 'vercel-skill-1',
      name: 'Vercel Skill 1',
      version: '2.0.0',
      source: 'vercel',
    }),
  })),
}));

describe('UnifiedSkillRegistry', () => {
  let registry: UnifiedSkillRegistry;

  beforeEach(() => {
    registry = new UnifiedSkillRegistry({
      workdir: '/tmp/godel',
      skillsDir: 'skills',
      cacheTtl: 300000,
      clawhub: { enabled: true, registryUrl: 'https://clawhub.example.com' },
      vercel: { enabled: true, registryUrl: 'https://vercel.example.com' },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create registry with default config', () => {
      const defaultRegistry = new UnifiedSkillRegistry();
      expect(defaultRegistry).toBeDefined();
    });

    it('should create registry with custom config', () => {
      const customRegistry = new UnifiedSkillRegistry({
        workdir: '/custom/workdir',
        skillsDir: 'custom-skills',
        cacheTtl: 60000,
      });
      expect(customRegistry).toBeDefined();
    });
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      const config = registry.getConfig();
      
      expect(config).toBeDefined();
      expect(config.workdir).toBe('/tmp/godel');
      expect(config.skillsDir).toBe('skills');
    });
  });

  describe('updateConfig', () => {
    it('should update config values', () => {
      registry.updateConfig({
        workdir: '/new/workdir',
      });
      
      const config = registry.getConfig();
      expect(config.workdir).toBe('/new/workdir');
    });
  });

  describe('getSources', () => {
    it('should return all available sources', () => {
      const sources = registry.getSources();
      
      expect(sources).toHaveLength(2);
      expect(sources[0].id).toBe('clawhub');
      expect(sources[1].id).toBe('vercel');
    });

    it('should include source metadata', () => {
      const sources = registry.getSources();
      
      sources.forEach(source => {
        expect(source.id).toBeDefined();
        expect(source.name).toBeDefined();
        expect(source.description).toBeDefined();
        expect(source.url).toBeDefined();
      });
    });
  });

  describe('getSkillsDirectory', () => {
    it('should return skills directory path', () => {
      const dir = registry.getSkillsDirectory();
      
      expect(dir).toContain('skills');
      expect(dir).toContain('/tmp/godel');
    });
  });

  describe('search', () => {
    it('should search across all enabled sources', async () => {
      const params: UnifiedSearchParams = {
        query: 'test',
      };
      
      const result = await registry.search(params);
      
      expect(result).toBeDefined();
      expect(result.skills).toBeDefined();
    });

    it('should filter by source', async () => {
      const params: UnifiedSearchParams = {
        query: 'test',
        sources: ['clawhub'] as SkillSource[],
      };
      
      const result = await registry.search(params);
      
      // Should only have clawhub results
      expect(result.skills.every(s => s.source === 'clawhub')).toBe(true);
    });

    it('should sort by downloads', async () => {
      const params: UnifiedSearchParams = {
        query: 'test',
        sort: 'downloads',
      };
      
      const result = await registry.search(params);
      
      expect(result).toBeDefined();
    });

    it('should sort by stars', async () => {
      const params: UnifiedSearchParams = {
        query: 'test',
        sort: 'stars',
      };
      
      const result = await registry.search(params);
      
      expect(result).toBeDefined();
    });

    it('should filter by tags', async () => {
      const params: UnifiedSearchParams = {
        query: 'test',
        tags: ['test'],
      };
      
      const result = await registry.search(params);
      
      expect(result).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const params: UnifiedSearchParams = {
        query: 'test',
        limit: 5,
      };
      
      const result = await registry.search(params);
      
      expect(result.skills.length).toBeLessThanOrEqual(5);
    });
  });

  describe('install', () => {
    it('should install skill from clawhub', async () => {
      const result = await registry.install('clawhub:clawhub-skill-1');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should install skill from vercel', async () => {
      const result = await registry.install('vercel:vercel-skill-1');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle installation errors', async () => {
      // Mock will handle the error gracefully
      const result = await registry.install('clawhub:error-skill');
      
      expect(result).toBeDefined();
    });
  });

  describe('uninstall', () => {
    it('should uninstall skill', async () => {
      // First install the skill
      await registry.install('clawhub:clawhub-skill-1');
      
      // Then uninstall it - should not throw
      await expect(registry.uninstall('clawhub:clawhub-skill-1')).resolves.not.toThrow();
    });

    it('should handle uninstall errors', async () => {
      // Should throw for non-existent skills
      await expect(registry.uninstall('clawhub:non-existent')).rejects.toThrow();
    });
  });

  describe('listInstalled', () => {
    it('should list all installed skills', async () => {
      const skills = await registry.listInstalled();
      
      expect(skills).toBeDefined();
      expect(Array.isArray(skills)).toBe(true);
    });
  });

  describe('getEnabledSources', () => {
    it('should return enabled sources', () => {
      const sources = (registry as any).getEnabledSources();
      
      expect(sources).toContain('clawhub');
      expect(sources).toContain('vercel');
    });
  });

  describe('isSourceEnabled', () => {
    it('should return true for enabled sources', () => {
      expect((registry as any).isSourceEnabled('clawhub')).toBe(true);
      expect((registry as any).isSourceEnabled('vercel')).toBe(true);
    });

    it('should return false for unknown sources', () => {
      expect((registry as any).isSourceEnabled('unknown' as SkillSource)).toBe(false);
    });
  });
});
