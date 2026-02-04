/**
 * Affinity Engine Tests
 */

import { AffinityEngine } from '../affinity-engine';
import {
  NodeAllocation,
  AgentAffinity,
  AffinityRule,
  LabelSelector,
} from '../types';

describe('AffinityEngine', () => {
  let engine: AffinityEngine;

  beforeEach(() => {
    engine = new AffinityEngine({ verbose: false });
  });

  describe('Label Selector Matching', () => {
    it('should match exact labels', () => {
      const labels = { app: 'web', tier: 'frontend' };
      const selector: LabelSelector = {
        matchLabels: { app: 'web' },
      };

      const result = engine.matchesLabelSelector(labels, selector);

      expect(result).toBe(true);
    });

    it('should not match incorrect labels', () => {
      const labels = { app: 'api', tier: 'backend' };
      const selector: LabelSelector = {
        matchLabels: { app: 'web' },
      };

      const result = engine.matchesLabelSelector(labels, selector);

      expect(result).toBe(false);
    });

    it('should match In operator', () => {
      const labels = { env: 'production' };
      const selector: LabelSelector = {
        matchExpressions: [
          { key: 'env', operator: 'In', values: ['staging', 'production'] },
        ],
      };

      const result = engine.matchesLabelSelector(labels, selector);

      expect(result).toBe(true);
    });

    it('should match NotIn operator', () => {
      const labels = { env: 'development' };
      const selector: LabelSelector = {
        matchExpressions: [
          { key: 'env', operator: 'NotIn', values: ['production'] },
        ],
      };

      const result = engine.matchesLabelSelector(labels, selector);

      expect(result).toBe(true);
    });

    it('should match Exists operator', () => {
      const labels = { feature: 'enabled' };
      const selector: LabelSelector = {
        matchExpressions: [
          { key: 'feature', operator: 'Exists' },
        ],
      };

      const result = engine.matchesLabelSelector(labels, selector);

      expect(result).toBe(true);
    });

    it('should match DoesNotExist operator', () => {
      const labels = { other: 'value' };
      const selector: LabelSelector = {
        matchExpressions: [
          { key: 'missing', operator: 'DoesNotExist' },
        ],
      };

      const result = engine.matchesLabelSelector(labels, selector);

      expect(result).toBe(true);
    });
  });

  describe('Node Affinity', () => {
    const createNode = (id: string, labels: Record<string, string>): NodeAllocation => ({
      capacity: {
        nodeId: id,
        labels,
        cpu: 8,
        memory: 32768,
      },
      allocated: { cpu: 0, memory: 0 },
      agents: [],
      lastHeartbeat: new Date(),
      healthy: true,
    });

    it('should satisfy hard node affinity', () => {
      const node = createNode('node-1', { zone: 'us-east-1a' });
      const nodes = [node];

      const affinity: AgentAffinity = {
        nodeAffinity: [{
          type: 'affinity',
          weight: 'hard',
          nodeSelector: {
            matchLabels: { zone: 'us-east-1a' },
          },
        }],
      };

      const score = engine.evaluateAffinity({}, node, nodes, affinity);

      expect(score.hardConstraintsSatisfied).toBe(true);
      expect(score.totalScore).toBeGreaterThan(0);
    });

    it('should fail hard node affinity when not matching', () => {
      const node = createNode('node-1', { zone: 'us-east-1b' });
      const nodes = [node];

      const affinity: AgentAffinity = {
        nodeAffinity: [{
          type: 'affinity',
          weight: 'hard',
          nodeSelector: {
            matchLabels: { zone: 'us-east-1a' },
          },
        }],
      };

      const score = engine.evaluateAffinity({}, node, nodes, affinity);

      expect(score.hardConstraintsSatisfied).toBe(false);
    });

    it('should score soft node affinity', () => {
      const node = createNode('node-1', { type: 'gpu' });
      const nodes = [node];

      const affinity: AgentAffinity = {
        nodeAffinity: [{
          type: 'affinity',
          weight: 'soft',
          weightValue: 25,
          nodeSelector: {
            matchLabels: { type: 'gpu' },
          },
        }],
      };

      const score = engine.evaluateAffinity({}, node, nodes, affinity);

      expect(score.totalScore).toBeGreaterThan(50); // Base 50 + bonus
      expect(score.ruleScores[0].matched).toBe(true);
    });
  });

  describe('Agent Anti-Affinity', () => {
    const createNode = (
      id: string,
      agents: string[],
      labels: Record<string, string> = {}
    ): NodeAllocation => ({
      capacity: {
        nodeId: id,
        labels,
        cpu: 8,
        memory: 32768,
      },
      allocated: { cpu: 0, memory: 0 },
      agents,
      lastHeartbeat: new Date(),
      healthy: true,
    });

    it('should satisfy anti-affinity when no conflicting agents', () => {
      const node = createNode('node-1', ['agent-1']);
      const nodes = [node];

      const affinity: AgentAffinity = {
        agentAntiAffinity: [{
          type: 'antiAffinity',
          weight: 'hard',
          agentSelector: {
            matchLabels: { app: 'database' },
          },
        }],
      };

      const score = engine.evaluateAffinity({ app: 'web' }, node, nodes, affinity);

      expect(score.hardConstraintsSatisfied).toBe(true);
    });
  });

  describe('Node Ranking', () => {
    const createNode = (id: string, labels: Record<string, string>): NodeAllocation => ({
      capacity: {
        nodeId: id,
        labels,
        cpu: 8,
        memory: 32768,
      },
      allocated: { cpu: 0, memory: 0 },
      agents: [],
      lastHeartbeat: new Date(),
      healthy: true,
    });

    it('should rank nodes by affinity score', () => {
      const nodes = [
        createNode('node-1', { zone: 'us-east-1a', type: 'compute' }),
        createNode('node-2', { zone: 'us-east-1b', type: 'gpu' }),
        createNode('node-3', { zone: 'us-east-1a', type: 'compute' }),
      ];

      const affinity: AgentAffinity = {
        nodeAffinity: [{
          type: 'affinity',
          weight: 'soft',
          nodeSelector: {
            matchLabels: { zone: 'us-east-1a' },
          },
        }],
      };

      const ranked = engine.rankNodes({}, nodes, affinity);

      expect(ranked.length).toBe(3);
      // Nodes in us-east-1a should be ranked higher
      expect(['node-1', 'node-3']).toContain(ranked[0].node.capacity.nodeId);
      expect(['node-1', 'node-3']).toContain(ranked[1].node.capacity.nodeId);
    });

    it('should filter out nodes failing hard constraints', () => {
      const nodes = [
        createNode('node-1', { zone: 'us-east-1a' }),
        createNode('node-2', { zone: 'us-east-1b' }),
      ];

      const affinity: AgentAffinity = {
        nodeAffinity: [{
          type: 'affinity',
          weight: 'hard',
          nodeSelector: {
            matchLabels: { zone: 'us-east-1a' },
          },
        }],
      };

      const ranked = engine.rankNodes({}, nodes, affinity);

      expect(ranked.length).toBe(1);
      expect(ranked[0].node.capacity.nodeId).toBe('node-1');
    });
  });

  describe('Validation', () => {
    it('should validate affinity configuration', () => {
      const affinity: AgentAffinity = {
        nodeAffinity: [{
          type: 'affinity',
          weight: 'soft',
          weightValue: 150, // Invalid: > 100
          nodeSelector: {
            matchLabels: { zone: 'us-east-1a' },
          },
        }],
      };

      const errors = engine.validateAffinity(affinity);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('weightValue must be between 1 and 100');
    });
  });

  describe('Factory Methods', () => {
    it('should create label selector', () => {
      const selector = AffinityEngine.createLabelSelector({ app: 'web', tier: 'frontend' });

      expect(selector.matchLabels).toEqual({ app: 'web', tier: 'frontend' });
    });

    it('should create co-location rule', () => {
      const rule = AffinityEngine.createCoLocationRule(
        { app: 'cache' },
        'hard'
      );

      expect(rule.type).toBe('affinity');
      expect(rule.weight).toBe('hard');
      expect(rule.agentSelector?.matchLabels).toEqual({ app: 'cache' });
    });

    it('should create spreading rule', () => {
      const rule = AffinityEngine.createSpreadingRule(
        { app: 'database' },
        'zone',
        'soft',
        50
      );

      expect(rule.type).toBe('antiAffinity');
      expect(rule.weight).toBe('soft');
      expect(rule.topologyKey).toBe('zone');
      expect(rule.weightValue).toBe(50);
    });
  });
});
