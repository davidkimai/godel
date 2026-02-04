/**
 * YAML Loader Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import {
  substituteEnvVars,
  substituteEnvVarsInObject,
  parseYaml,
  stringifyYaml,
  validateConfig,
  toSwarmConfig,
  containsSecretReferences,
  extractSecretReferences,
} from '../../src/config/yaml-loader';
import type { SwarmYamlConfig } from '../../src/config/types';

describe('YAML Loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = resolve(tmpdir(), `dash-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Environment Variable Substitution', () => {
    it('should substitute simple $VAR syntax', () => {
      const env = { NAME: 'World', GREETING: 'Hello' };
      const { result } = substituteEnvVars('$GREETING $NAME!', env);
      expect(result).toBe('Hello World!');
    });

    it('should substitute braced ${VAR} syntax', () => {
      const env = { PATH: '/usr/bin', HOME: '/home/user' };
      const { result } = substituteEnvVars('${HOME}/bin:${PATH}', env);
      expect(result).toBe('/home/user/bin:/usr/bin');
    });

    it('should substitute with default values', () => {
      const env = { SET_VAR: 'value' };
      
      const { result: result1 } = substituteEnvVars('${SET_VAR:-default}', env);
      expect(result1).toBe('value');
      
      const { result: result2 } = substituteEnvVars('${UNSET_VAR:-default}', env);
      expect(result2).toBe('default');
      
      const { result: result3 } = substituteEnvVars('${UNSET_VAR:-default with spaces}', env);
      expect(result3).toBe('default with spaces');
    });

    it('should keep original if env var not found and no default', () => {
      const env = { EXISTING: 'value' };
      const { result } = substituteEnvVars('$NONEXISTENT', env);
      expect(result).toBe('$NONEXISTENT');
    });

    it('should track substituted variables', () => {
      const env = { VAR1: 'a', VAR2: 'b' };
      const { substituted } = substituteEnvVars('$VAR1 $VAR2 $VAR3', env);
      expect(substituted).toContain('VAR1');
      expect(substituted).toContain('VAR2');
      expect(substituted).not.toContain('VAR3');
    });
  });

  describe('Object Environment Substitution', () => {
    it('should substitute in nested objects', () => {
      const env = { NAME: 'test', VALUE: '123' };
      const obj = {
        name: '$NAME',
        nested: {
          value: '${VALUE}',
          array: ['$NAME', 'static'],
        },
      };
      
      const { result, substituted } = substituteEnvVarsInObject(obj, env);
      
      expect(result.name).toBe('test');
      expect(result.nested.value).toBe('123');
      expect(result.nested.array).toEqual(['test', 'static']);
      expect(substituted).toContain('NAME');
      expect(substituted).toContain('VALUE');
    });
  });

  describe('YAML Parsing', () => {
    it('should parse basic YAML', async () => {
      const yaml = `
apiVersion: dash.io/v1
kind: Swarm
metadata:
  name: test-swarm
spec:
  task: Test task
  strategy: parallel
`;
      const parsed = await parseYaml(yaml);
      
      expect(parsed['apiVersion']).toBe('dash.io/v1');
      expect(parsed['kind']).toBe('Swarm');
      expect(parsed['metadata']).toEqual({ name: 'test-swarm' });
      expect((parsed['spec'] as Record<string, unknown>)?.['task']).toBe('Test task');
    });

    it('should stringify YAML', async () => {
      const obj = {
        name: 'test',
        nested: { value: 123 },
        array: [1, 2, 3],
      };
      
      const yaml = await stringifyYaml(obj);
      
      expect(yaml).toContain('name: test');
      expect(yaml).toContain('nested:');
      expect(yaml).toContain('value: 123');
    });
  });

  describe('Config Validation', () => {
    it('should validate a valid config', () => {
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
      
      const { valid, errors } = validateConfig(config as Record<string, unknown>);
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid apiVersion', () => {
      const config = {
        apiVersion: 'invalid',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: { task: 'Test' },
      };
      
      const { valid, errors } = validateConfig(config);
      expect(valid).toBe(false);
      expect(errors.some(e => e.path.includes('apiVersion'))).toBe(true);
    });

    it('should reject initialAgents > maxAgents', () => {
      const config: SwarmYamlConfig = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: {
          task: 'Test',
          strategy: 'parallel',
          initialAgents: 20,
          maxAgents: 10,
        },
      };
      
      const { valid, errors } = validateConfig(config as Record<string, unknown>);
      expect(valid).toBe(false);
      expect(errors.some(e => e.message.includes('initialAgents') && e.message.includes('maxAgents'))).toBe(true);
    });

    it('should reject invalid strategy', () => {
      const config = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { name: 'test' },
        spec: {
          task: 'Test',
          strategy: 'invalid-strategy',
        },
      };
      
      const { valid, errors } = validateConfig(config);
      expect(valid).toBe(false);
    });
  });

  describe('toSwarmConfig', () => {
    it('should convert YAML config to SwarmConfig', () => {
      const yamlConfig: SwarmYamlConfig = {
        apiVersion: 'dash.io/v1',
        kind: 'Swarm',
        metadata: { 
          name: 'test-swarm',
          description: 'Test description',
          labels: { env: 'test' },
        },
        spec: {
          task: 'Test task',
          strategy: 'parallel',
          initialAgents: 5,
          maxAgents: 20,
          model: 'kimi-k2.5',
          budget: {
            amount: 100,
            currency: 'USD',
            warningThreshold: 0.75,
            criticalThreshold: 0.90,
          },
          safety: {
            fileSandbox: true,
          },
        },
      };
      
      const swarmConfig = toSwarmConfig(yamlConfig);
      
      expect(swarmConfig.name).toBe('test-swarm');
      expect(swarmConfig.task).toBe('Test task');
      expect(swarmConfig.strategy).toBe('parallel');
      expect(swarmConfig.initialAgents).toBe(5);
      expect(swarmConfig.maxAgents).toBe(20);
      expect(swarmConfig.model).toBe('kimi-k2.5');
      expect(swarmConfig.budget).toBeDefined();
      expect(swarmConfig.budget?.amount).toBe(100);
      expect(swarmConfig.safety?.fileSandbox).toBe(true);
    });
  });

  describe('Secret References', () => {
    it('should detect secret references', () => {
      expect(containsSecretReferences('{{ op://vault/item/field }}')).toBe(true);
      expect(containsSecretReferences('{{op://vault/item/field}}')).toBe(true);
      expect(containsSecretReferences('no secrets here')).toBe(false);
    });

    it('should extract secret references', () => {
      const text = 'Key: {{ op://vault/item/key }}, Secret: {{op://prod/db/password}}';
      const refs = extractSecretReferences(text);
      
      expect(refs).toHaveLength(2);
      expect(refs[0]).toMatchObject({
        vault: 'vault',
        item: 'item',
        field: 'key',
      });
      expect(refs[1]).toMatchObject({
        vault: 'prod',
        item: 'db',
        field: 'password',
      });
    });
  });
});
