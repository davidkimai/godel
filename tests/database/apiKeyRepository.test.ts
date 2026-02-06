/**
 * API Key Repository Integration Test
 * 
 * Tests the PostgreSQL-backed API key repository.
 */

import { Pool } from 'pg';
import { ApiKeyRepository } from '../../src/storage/repositories/ApiKeyRepository';

// Direct pool for testing
let pool: Pool;

describe('ApiKeyRepository', () => {
  let repository: ApiKeyRepository;

  beforeAll(async () => {
    // Create pool directly
    pool = new Pool({
      host: 'localhost',
      port: 5433,
      user: 'godel',
      password: 'godel',
      database: 'godel',
    });

    // Create repository with direct pool injection
    repository = new ApiKeyRepository({
      host: 'localhost',
      port: 5433,
      user: 'godel',
      password: 'godel',
      database: 'godel',
    } as any);
    
    // Initialize with the pool
    await repository.initialize();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM api_keys WHERE name LIKE \'Test Key%\'');
  });

  describe('create', () => {
    it('should create a new API key', async () => {
      const key = await repository.create({
        key_hash: 'test_hash_123',
        name: 'Test Key 1',
        scopes: ['read', 'write'],
        rate_limit: 1000,
      });

      expect(key).toBeDefined();
      expect(key.id).toBeDefined();
      expect(key.name).toBe('Test Key 1');
      expect(key.scopes).toEqual(['read', 'write']);
      expect(key.rate_limit).toBe(1000);
      expect(key.is_active).toBe(true);
      expect(key.is_revoked).toBe(false);
    });

    it('should create key with default values', async () => {
      const key = await repository.create({
        key_hash: 'test_hash_456',
        name: 'Test Key 2',
      });

      expect(key.scopes).toEqual(['read']);
      expect(key.rate_limit).toBe(100);
      expect(key.is_active).toBe(true);
    });
  });

  describe('findById', () => {
    it('should find key by id', async () => {
      const created = await repository.create({
        key_hash: 'test_hash_find',
        name: 'Test Key Find',
      });

      const found = await repository.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Test Key Find');
    });

    it('should return null for non-existent key', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByKeyHash', () => {
    it('should find key by hash', async () => {
      await repository.create({
        key_hash: 'unique_hash_123',
        name: 'Test Key Hash',
      });

      const found = await repository.findByKeyHash('unique_hash_123');
      expect(found).toBeDefined();
      expect(found?.key_hash).toBe('unique_hash_123');
    });
  });

  describe('revoke', () => {
    it('should revoke a key', async () => {
      const created = await repository.create({
        key_hash: 'test_hash_revoke',
        name: 'Test Key Revoke',
      });

      const revoked = await repository.revoke(created.id);
      expect(revoked).toBeDefined();
      expect(revoked?.is_revoked).toBe(true);
      expect(revoked?.revoked_at).toBeDefined();
    });
  });

  describe('list', () => {
    it('should list keys with filtering', async () => {
      // Create test keys
      await repository.create({
        key_hash: 'list_hash_1',
        name: 'Test Key List 1',
      });
      await repository.create({
        key_hash: 'list_hash_2',
        name: 'Test Key List 2',
      });

      const keys = await repository.list({ includeRevoked: true });
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('updateLastUsed', () => {
    it('should update last used timestamp', async () => {
      const created = await repository.create({
        key_hash: 'test_hash_used',
        name: 'Test Key Used',
      });

      await repository.updateLastUsed(created.id);
      
      const updated = await repository.findById(created.id);
      expect(updated?.last_used_at).toBeDefined();
    });
  });
});
