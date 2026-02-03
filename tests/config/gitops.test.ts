/**
 * GitOps Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { GitOpsManager, diffConfigs, formatDiff } from '../../src/config/gitops';
import type { SwarmYamlConfig, ConfigDiffResult } from '../../src/config/types';

describe('GitOps', () => {
  describe('diffConfigs', () => {
    it('should return identical for same configs', () => {
      const config: SwarmYamlConfig = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: {
          task: 'Test',
          strategy: 'parallel',
          initialAgents: 5,
          maxAgents: 10,
        },
      };
      
      const diff = diffConfigs(config, config);
      expect(diff.identical).toBe(true);
      expect(diff.differences).toHaveLength(0);
    });

    it('should detect added fields', () => {
      const oldConfig: SwarmYamlConfig = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: {
          task: 'Test',
          strategy: 'parallel',
          initialAgents: 5,
          maxAgents: 10,
        },
      };
      
      const newConfig: SwarmYamlConfig = {
        ...oldConfig,
        spec: {
          ...oldConfig.spec,
          model: 'new-model',
        },
      };
      
      const diff = diffConfigs(oldConfig, newConfig);
      expect(diff.identical).toBe(false);
      expect(diff.summary.added).toBe(1);
      expect(diff.differences[0].type).toBe('added');
      expect(diff.differences[0].path).toContain('model');
    });

    it('should detect removed fields', () => {
      const oldConfig: SwarmYamlConfig = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: {
          task: 'Test',
          strategy: 'parallel',
          initialAgents: 5,
          maxAgents: 10,
          model: 'old-model',
        },
      };
      
      const newConfig: SwarmYamlConfig = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: {
          task: 'Test',
          strategy: 'parallel',
          initialAgents: 5,
          maxAgents: 10,
        },
      };
      
      const diff = diffConfigs(oldConfig, newConfig);
      expect(diff.identical).toBe(false);
      expect(diff.summary.removed).toBe(1);
      expect(diff.differences[0].type).toBe('removed');
    });

    it('should detect modified fields', () => {
      const oldConfig: SwarmYamlConfig = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: {
          task: 'Old task',
          strategy: 'parallel',
          initialAgents: 5,
          maxAgents: 10,
        },
      };
      
      const newConfig: SwarmYamlConfig = {
        ...oldConfig,
        spec: {
          ...oldConfig.spec,
          task: 'New task',
          initialAgents: 10,
        },
      };
      
      const diff = diffConfigs(oldConfig, newConfig);
      expect(diff.identical).toBe(false);
      expect(diff.summary.modified).toBe(2);
    });

    it('should detect nested changes', () => {
      const oldConfig: SwarmYamlConfig = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: {
          task: 'Test',
          strategy: 'parallel',
          initialAgents: 5,
          maxAgents: 10,
          budget: {
            amount: 100,
            currency: 'USD',
          },
        },
      };
      
      const newConfig: SwarmYamlConfig = {
        ...oldConfig,
        spec: {
          ...oldConfig.spec,
          budget: {
            amount: 200,
            currency: 'USD',
          },
        },
      };
      
      const diff = diffConfigs(oldConfig, newConfig);
      expect(diff.identical).toBe(false);
      expect(diff.differences.some(d => d.path.includes('budget.amount'))).toBe(true);
    });
  });

  describe('formatDiff', () => {
    it('should format identical configs', () => {
      const diff: ConfigDiffResult = {
        identical: true,
        differences: [],
        summary: { added: 0, removed: 0, modified: 0 },
      };
      
      const output = formatDiff(diff);
      expect(output).toBe('No changes detected');
    });

    it('should format added changes', () => {
      const diff: ConfigDiffResult = {
        identical: false,
        differences: [{
          path: 'spec.model',
          oldValue: undefined,
          newValue: 'kimi-k2.5',
          type: 'added',
        }],
        summary: { added: 1, removed: 0, modified: 0 },
      };
      
      const output = formatDiff(diff);
      expect(output).toContain('+1');
      expect(output).toContain('spec.model');
      expect(output).toContain('kimi-k2.5');
    });

    it('should format modified changes', () => {
      const diff: ConfigDiffResult = {
        identical: false,
        differences: [{
          path: 'spec.initialAgents',
          oldValue: 5,
          newValue: 10,
          type: 'modified',
        }],
        summary: { added: 0, removed: 0, modified: 1 },
      };
      
      const output = formatDiff(diff);
      expect(output).toContain('~1');
      expect(output).toContain('spec.initialAgents');
      expect(output).toContain('5');
      expect(output).toContain('10');
    });
  });

  describe('GitOpsManager', () => {
    let manager: GitOpsManager;
    let tempDir: string;

    beforeEach(async () => {
      manager = new GitOpsManager();
      tempDir = resolve(tmpdir(), `dash-gitops-test-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      await manager.stop();
      if (existsSync(tempDir)) {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should be created with no tracked configs', () => {
      expect(manager.getTrackedConfigs()).toHaveLength(0);
    });

    it('should emit events', (done) => {
      manager.onGitOpsEvent((event) => {
        expect(event.type).toBe('config.loaded');
        expect(event.filePath).toBe('/test/path.yaml');
        done();
      });

      // Access private method through any cast for testing
      (manager as unknown as { emitEvent: (event: unknown) => void }).emitEvent({
        type: 'config.loaded',
        timestamp: new Date(),
        filePath: '/test/path.yaml',
      });
    });
  });
});
