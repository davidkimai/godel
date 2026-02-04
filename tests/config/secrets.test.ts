/**
 * Secret Manager Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  SecretManager, 
  SecretResolutionError,
  type SecretReference 
} from '../../src/config/secrets';

describe('SecretManager', () => {
  let manager: SecretManager;

  beforeEach(() => {
    manager = new SecretManager({ defaultTtl: 60000 }); // 1 minute for tests
  });

  describe('parseReference', () => {
    it('should parse valid secret references', () => {
      const ref = manager.parseReference('{{ op://vault/item/field }}');
      
      expect(ref).toMatchObject({
        full: '{{ op://vault/item/field }}',
        vault: 'vault',
        item: 'item',
        field: 'field',
      });
    });

    it('should handle references without spaces', () => {
      const ref = manager.parseReference('{{op://vault/item/field}}');
      
      expect(ref).toMatchObject({
        vault: 'vault',
        item: 'item',
        field: 'field',
      });
    });

    it('should return null for invalid references', () => {
      expect(manager.parseReference('not-a-secret')).toBeNull();
      expect(manager.parseReference('{{ op://incomplete }}')).toBeNull();
      expect(manager.parseReference('{{ other://vault/item/field }}')).toBeNull();
    });

    it('should parse references with special characters in paths', () => {
      const ref = manager.parseReference('{{ op://Production Vault/API Keys/token }}');
      
      expect(ref?.vault).toBe('Production Vault');
      expect(ref?.item).toBe('API Keys');
      expect(ref?.field).toBe('token');
    });
  });

  describe('extractReferences', () => {
    it('should extract single reference', () => {
      const refs = manager.extractReferences('{{ op://vault/item/field }}');
      expect(refs).toHaveLength(1);
    });

    it('should extract multiple references', () => {
      const text = 'Key: {{ op://prod/key/public }}, Secret: {{op://prod/secret/private}}';
      const refs = manager.extractReferences(text);
      
      expect(refs).toHaveLength(2);
      expect(refs[0].vault).toBe('prod');
      expect(refs[1].vault).toBe('prod');
    });

    it('should return empty array for no references', () => {
      const refs = manager.extractReferences('no secrets here');
      expect(refs).toHaveLength(0);
    });
  });

  describe('hasReferences', () => {
    it('should detect secret references', () => {
      expect(manager.hasReferences('{{ op://vault/item/field }}')).toBe(true);
      expect(manager.hasReferences('{{op://vault/item/field}}')).toBe(true);
      expect(manager.hasReferences('Key: {{ op://vault/item/key }} and more')).toBe(true);
    });

    it('should not detect non-references', () => {
      expect(manager.hasReferences('normal text')).toBe(false);
      expect(manager.hasReferences('{{ other://vault/item/field }}')).toBe(false);
      expect(manager.hasReferences('$ENV_VAR')).toBe(false);
    });
  });

  describe('cache', () => {
    it('should start with empty cache', () => {
      const stats = manager.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should clear cache', () => {
      manager.clearCache();
      const stats = manager.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('audit log', () => {
    it('should start with empty audit log', () => {
      const log = manager.getAuditLog();
      expect(log).toHaveLength(0);
    });

    it('should clear audit log', () => {
      manager.clearAuditLog();
      const log = manager.getAuditLog();
      expect(log).toHaveLength(0);
    });
  });

  describe('isOpAvailable', () => {
    it('should check for op CLI', async () => {
      // This will depend on the test environment
      // In CI, op is likely not available
      const available = await manager.isOpAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('resolveTemplate', () => {
    it('should return unchanged text without references', async () => {
      const text = 'no secrets here';
      const { result, resolved } = await manager.resolveTemplate(text);
      
      expect(result).toBe(text);
      expect(resolved).toHaveLength(0);
    });
  });

  describe('resolveInObject', () => {
    it('should process objects without references', async () => {
      const obj = {
        name: 'test',
        nested: {
          value: 123,
        },
      };
      
      const { result, resolved } = await manager.resolveInObject(obj);
      
      expect(result).toEqual(obj);
      expect(resolved).toHaveLength(0);
    });

    it('should process arrays without references', async () => {
      const obj = {
        items: ['a', 'b', 'c'],
      };
      
      const { result, resolved } = await manager.resolveInObject(obj);
      
      expect(result).toEqual(obj);
      expect(resolved).toHaveLength(0);
    });
  });
});

describe('SecretResolutionError', () => {
  it('should create error with message', () => {
    const error = new SecretResolutionError('test error');
    
    expect(error.message).toBe('test error');
    expect(error.name).toBe('SecretResolutionError');
    expect(error.code).toBe('UNKNOWN');
  });

  it('should create error with code and cause', () => {
    const cause = new Error('original error');
    const error = new SecretResolutionError('test error', 'NOT_FOUND', cause);
    
    expect(error.message).toBe('test error');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.cause).toBe(cause);
  });
});
