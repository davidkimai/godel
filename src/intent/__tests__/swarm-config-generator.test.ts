/**
 * @fileoverview Swarm Config Generator Tests
 */

import { SwarmConfigGenerator, generateSwarmConfig } from '../swarm-config-generator';
import { ParsedIntent, SwarmComplexity } from '../types';

describe('SwarmConfigGenerator', () => {
  let generator: SwarmConfigGenerator;

  beforeEach(() => {
    generator = new SwarmConfigGenerator();
  });

  const createMockIntent = (taskType: ParsedIntent['taskType']): ParsedIntent => ({
    taskType,
    target: 'test-target',
    targetType: 'module',
    raw: `Test ${taskType}`,
  });

  const createMockComplexity = (level: SwarmComplexity['level']): SwarmComplexity => ({
    level,
    score: level === 'low' ? 20 : level === 'medium' ? 45 : level === 'high' ? 70 : 85,
    metrics: {
      linesOfCode: 500,
      cyclomaticComplexity: 30,
      cognitiveComplexity: 25,
      dependencies: 10,
      testCoverage: 60,
      changeFrequency: 2,
      fileCount: 5,
      estimatedHours: 4,
    },
  });

  describe('refactor swarm', () => {
    it('should generate refactor swarm with architect', async () => {
      const intent = createMockIntent('refactor');
      const complexity = createMockComplexity('medium');
      
      const config = await generator.generate(intent, complexity);
      
      expect(config.agents.some(a => a.type === 'architect')).toBe(true);
      expect(config.agents.some(a => a.type === 'implementer')).toBe(true);
      expect(config.agents.some(a => a.type === 'reviewer')).toBe(true);
      expect(config.workflow).toBe('refactor');
    });

    it('should scale workers based on complexity', async () => {
      const intent = createMockIntent('refactor');
      const lowComplexity = createMockComplexity('low');
      const highComplexity = createMockComplexity('high');
      
      const lowConfig = await generator.generate(intent, lowComplexity);
      const highConfig = await generator.generate(intent, highComplexity);
      
      const lowWorkers = lowConfig.agents.find(a => a.type === 'implementer')?.count || 0;
      const highWorkers = highConfig.agents.find(a => a.type === 'implementer')?.count || 0;
      
      expect(highWorkers).toBeGreaterThanOrEqual(lowWorkers);
    });
  });

  describe('implement swarm', () => {
    it('should generate implementation swarm', async () => {
      const intent = createMockIntent('implement');
      const complexity = createMockComplexity('medium');
      
      const config = await generator.generate(intent, complexity);
      
      expect(config.agents.some(a => a.type === 'architect')).toBe(true);
      expect(config.agents.some(a => a.type === 'implementer')).toBe(true);
      expect(config.agents.some(a => a.type === 'reviewer')).toBe(true);
      expect(config.workflow).toBe('implement');
    });
  });

  describe('fix swarm', () => {
    it('should generate bug fix swarm with specialist', async () => {
      const intent = createMockIntent('fix');
      const complexity = createMockComplexity('medium');
      
      const config = await generator.generate(intent, complexity);
      
      expect(config.agents.some(a => a.type === 'specialist')).toBe(true);
      expect(config.agents.some(a => a.type === 'tester')).toBe(true);
      expect(config.agents.some(a => a.type === 'implementer')).toBe(true);
      expect(config.workflow).toBe('fix');
    });
  });

  describe('test swarm', () => {
    it('should generate test swarm', async () => {
      const intent = createMockIntent('test');
      const complexity = createMockComplexity('medium');
      
      const config = await generator.generate(intent, complexity);
      
      expect(config.agents.some(a => a.type === 'architect')).toBe(true);
      expect(config.agents.some(a => a.type === 'tester')).toBe(true);
      expect(config.workflow).toBe('test');
    });
  });

  describe('estimation', () => {
    it('should estimate cost based on agent count', async () => {
      const intent = createMockIntent('refactor');
      const complexity = createMockComplexity('medium');
      
      const config = await generator.generate(intent, complexity);
      
      expect(config.estimatedCost).toBeGreaterThan(0);
      expect(config.estimatedTime).toBeGreaterThan(0);
    });

    it('should generate name from intent', async () => {
      const intent = createMockIntent('refactor');
      intent.target = 'auth module';
      const complexity = createMockComplexity('medium');
      
      const config = await generator.generate(intent, complexity);
      
      expect(config.name).toContain('Refactoring');
      expect(config.name).toContain('auth module');
    });
  });
});

describe('generateSwarmConfig', () => {
  it('should be exported and work', async () => {
    const intent: ParsedIntent = {
      taskType: 'test',
      target: 'utils',
      targetType: 'module',
      raw: 'Test the utils',
    };
    
    const complexity: SwarmComplexity = {
      level: 'low',
      score: 20,
      metrics: {
        linesOfCode: 100,
        cyclomaticComplexity: 10,
        cognitiveComplexity: 8,
        dependencies: 5,
        testCoverage: 80,
        changeFrequency: 1,
        fileCount: 2,
        estimatedHours: 1,
      },
    };
    
    const config = await generateSwarmConfig(intent, complexity);
    
    expect(config.agents.length).toBeGreaterThan(0);
    expect(config.estimatedCost).toBeGreaterThan(0);
  });
});
