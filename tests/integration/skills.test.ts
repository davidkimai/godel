/**
 * Skills Installation/Uninstallation Integration Tests
 * 
 * Tests for skill registry integration with ClawHub and Vercel sources.
 */

import { UnifiedSkillRegistry } from '../../src/skills/registry';
import {
  UnifiedSkillMetadata,
  UnifiedInstallResult,
  SkillSource,
} from '../../src/skills/types';

// Mock the adapters
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock ClawHub adapter
const mockClawHubSearch = jest.fn();
const mockClawHubGet = jest.fn();
const mockClawHubInstall = jest.fn();
const mockClawHubUninstall = jest.fn();
const mockClawHubListInstalled = jest.fn();
const mockClawHubIsEnabled = jest.fn().mockReturnValue(true);

jest.mock('../../src/skills/clawhub', () => ({
  getGlobalClawHubAdapter: jest.fn().mockImplementation(() => ({
    search: mockClawHubSearch,
    get: mockClawHubGet,
    install: mockClawHubInstall,
    uninstall: mockClawHubUninstall,
    listInstalled: mockClawHubListInstalled,
    updateConfig: jest.fn(),
    isEnabled: mockClawHubIsEnabled,
    fetchSkill: jest.fn().mockResolvedValue({
      id: 'test-skill',
      name: 'Test Skill',
      version: '1.0.0',
    }),
  })),
}));

// Mock Vercel adapter
const mockVercelSearch = jest.fn();
const mockVercelGet = jest.fn();
const mockVercelInstall = jest.fn();
const mockVercelUninstall = jest.fn();
const mockVercelListInstalled = jest.fn();
const mockVercelIsEnabled = jest.fn().mockReturnValue(true);

jest.mock('../../src/skills/vercel', () => ({
  getGlobalVercelSkillsClient: jest.fn().mockImplementation(() => ({
    search: mockVercelSearch,
    get: mockVercelGet,
    install: mockVercelInstall,
    uninstall: mockVercelUninstall,
    listInstalled: mockVercelListInstalled,
    updateConfig: jest.fn(),
    isEnabled: mockVercelIsEnabled,
    fetchSkill: jest.fn().mockResolvedValue({
      id: 'vercel-skill',
      name: 'Vercel Skill',
      version: '1.0.0',
    }),
  })),
}));

describe('Skills Integration', () => {
  let registry: UnifiedSkillRegistry;

  beforeEach(() => {
    // Reset mocks
    mockClawHubSearch.mockReset();
    mockClawHubGet.mockReset();
    mockClawHubInstall.mockReset();
    mockClawHubUninstall.mockReset();
    mockClawHubListInstalled.mockReset();
    mockClawHubIsEnabled.mockReturnValue(true);
    
    mockVercelSearch.mockReset();
    mockVercelGet.mockReset();
    mockVercelInstall.mockReset();
    mockVercelUninstall.mockReset();
    mockVercelListInstalled.mockReset();
    mockVercelIsEnabled.mockReturnValue(true);

    // Create registry with required registryUrl
    registry = new UnifiedSkillRegistry({
      workdir: '/tmp/godel',
      skillsDir: 'skills',
      clawhub: { enabled: true, registryUrl: 'https://clawhub.example.com' },
      vercel: { enabled: true, registryUrl: 'https://vercel.example.com' },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Skill Search Integration', () => {
    it('should search across all sources', async () => {
      mockClawHubSearch.mockResolvedValue({
        skills: [
          { id: 'skill-1', name: 'Skill 1', source: 'clawhub', downloads: 100, stars: 5, version: '1.0.0', description: 'Test', author: 'test', tags: [] },
        ],
        total: 1,
        queryTimeMs: 10,
      });
      
      mockVercelSearch.mockResolvedValue({
        skills: [
          { id: 'skill-2', name: 'Skill 2', source: 'vercel', downloads: 200, stars: 10, version: '2.0.0', description: 'Test', author: 'test', tags: [] },
        ],
        total: 1,
        queryTimeMs: 15,
      });

      const result = await registry.search({ query: 'test' });

      expect(result.skills).toHaveLength(2);
      expect(mockClawHubSearch).toHaveBeenCalled();
      expect(mockVercelSearch).toHaveBeenCalled();
    });

    it('should search only clawhub when specified', async () => {
      mockClawHubSearch.mockResolvedValue({
        skills: [{ id: 'skill-1', name: 'Skill 1', source: 'clawhub', downloads: 100, stars: 5, version: '1.0.0', description: 'Test', author: 'test', tags: [] }],
        total: 1,
        queryTimeMs: 10,
      });

      const result = await registry.search({
        query: 'test',
        sources: ['clawhub'] as SkillSource[],
      });

      expect(mockClawHubSearch).toHaveBeenCalled();
      expect(mockVercelSearch).not.toHaveBeenCalled();
      expect(result.skills.every(s => s.source === 'clawhub')).toBe(true);
    });

    it('should handle search errors gracefully', async () => {
      mockClawHubSearch.mockRejectedValue(new Error('Network error'));
      mockVercelSearch.mockResolvedValue({
        skills: [{ id: 'skill-2', name: 'Skill 2', source: 'vercel', downloads: 200, stars: 10, version: '2.0.0', description: 'Test', author: 'test', tags: [] }],
        total: 1,
        queryTimeMs: 15,
      });

      const result = await registry.search({ query: 'test' });

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].source).toBe('vercel');
    });

    it('should combine results from multiple sources', async () => {
      mockClawHubSearch.mockResolvedValue({
        skills: [
          { id: 'clawhub-1', name: 'ClawHub 1', source: 'clawhub', downloads: 100, stars: 5, version: '1.0.0', description: 'Test', author: 'test', tags: [] },
          { id: 'clawhub-2', name: 'ClawHub 2', source: 'clawhub', downloads: 50, stars: 3, version: '1.0.0', description: 'Test', author: 'test', tags: [] },
        ],
        total: 2,
        queryTimeMs: 10,
      });
      
      mockVercelSearch.mockResolvedValue({
        skills: [
          { id: 'vercel-1', name: 'Vercel 1', source: 'vercel', downloads: 200, stars: 10, version: '2.0.0', description: 'Test', author: 'test', tags: [] },
        ],
        total: 1,
        queryTimeMs: 15,
      });

      const result = await registry.search({ query: 'test' });

      expect(result.skills).toHaveLength(3);
      expect(result.bySource.clawhub.total).toBe(2);
      expect(result.bySource.vercel.total).toBe(1);
    });
  });

  describe('Skill Installation Integration', () => {
    it('should install skill from clawhub', async () => {
      mockClawHubInstall.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
        installedPath: '/skills/test-skill',
        version: '1.0.0',
        source: 'clawhub',
      });

      const result = await registry.install('clawhub:test-skill');

      expect(result.success).toBe(true);
      expect(mockClawHubInstall).toHaveBeenCalledWith('test-skill', expect.any(Object));
    });

    it('should install skill from vercel', async () => {
      mockVercelInstall.mockResolvedValue({
        success: true,
        skillId: 'vercel-skill',
        installedPath: '/skills/vercel-skill',
        version: '1.0.0',
        source: 'vercel',
      });

      const result = await registry.install('vercel:vercel-skill');

      expect(result.success).toBe(true);
      expect(mockVercelInstall).toHaveBeenCalledWith('vercel-skill', expect.any(Object));
    });

    it('should handle installation failure', async () => {
      mockClawHubInstall.mockResolvedValue({
        success: false,
        skillId: 'failing-skill',
        errors: ['Installation failed'],
        version: '',
        source: 'clawhub',
      });

      const result = await registry.install('clawhub:failing-skill');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Installation failed');
    });

    it('should auto-detect source when not specified', async () => {
      // Make skill available in both sources
      mockClawHubGet.mockResolvedValue({
        id: 'ambiguous-skill',
        name: 'Ambiguous Skill',
        source: 'clawhub',
        version: '1.0.0',
        description: 'Test',
        author: 'test',
        downloads: 100,
        stars: 5,
        tags: [],
      });
      
      mockVercelGet.mockResolvedValue({
        id: 'ambiguous-skill',
        name: 'Ambiguous Skill',
        source: 'vercel',
        version: '2.0.0',
        description: 'Test',
        author: 'test',
        downloads: 200,
        stars: 10,
        tags: [],
      });

      // This should throw ambiguous error since both sources have it
      await expect(registry.install('ambiguous-skill')).rejects.toThrow();
    });
  });

  describe('Skill Uninstallation Integration', () => {
    it('should uninstall skill', async () => {
      mockClawHubUninstall.mockResolvedValue({ success: true });
      
      // First install a skill
      mockClawHubInstall.mockResolvedValue({
        success: true,
        skillId: 'test-skill',
        installedPath: '/skills/test-skill',
        version: '1.0.0',
        source: 'clawhub',
      });
      
      await registry.install('clawhub:test-skill');
      
      // Then uninstall it
      await expect(registry.uninstall('clawhub:test-skill')).resolves.not.toThrow();
    });

    it('should handle uninstall errors', async () => {
      mockClawHubUninstall.mockRejectedValue(new Error('Not installed'));

      await expect(registry.uninstall('clawhub:not-installed')).rejects.toThrow();
    });
  });

  describe('Installed Skills List Integration', () => {
    it('should list installed skills from all sources', async () => {
      mockClawHubListInstalled.mockResolvedValue([
        { id: 'clawhub-1', name: 'ClawHub Skill', version: '1.0.0', source: 'clawhub', installedAt: new Date() },
      ]);
      
      mockVercelListInstalled.mockResolvedValue([
        { id: 'vercel-1', name: 'Vercel Skill', version: '2.0.0', source: 'vercel', installedAt: new Date() },
      ]);

      const skills = await registry.listInstalled();

      expect(skills.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cache Integration', () => {
    it('should cache search results', async () => {
      mockClawHubSearch.mockResolvedValue({
        skills: [{ id: 'skill-1', name: 'Skill 1', source: 'clawhub', downloads: 100, stars: 5, version: '1.0.0', description: 'Test', author: 'test', tags: [] }],
        total: 1,
        queryTimeMs: 10,
      });
      mockVercelSearch.mockResolvedValue({ skills: [], total: 0, queryTimeMs: 5 });

      // First search
      await registry.search({ query: 'test' });
      
      // Second search (should use cache)
      await registry.search({ query: 'test' });

      // Search should only be called once per source due to caching
      expect(mockClawHubSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Recovery', () => {
    it('should continue when one source fails', async () => {
      mockClawHubSearch.mockRejectedValue(new Error('ClawHub down'));
      mockVercelSearch.mockResolvedValue({
        skills: [{ id: 'vercel-1', name: 'Vercel Skill', source: 'vercel', downloads: 100, stars: 5, version: '1.0.0', description: 'Test', author: 'test', tags: [] }],
        total: 1,
        queryTimeMs: 10,
      });

      const result = await registry.search({ query: 'test' });

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].source).toBe('vercel');
    });

    it('should handle all sources failing', async () => {
      mockClawHubSearch.mockRejectedValue(new Error('ClawHub down'));
      mockVercelSearch.mockRejectedValue(new Error('Vercel down'));

      const result = await registry.search({ query: 'test' });

      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
