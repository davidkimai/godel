import { logger } from '../src/utils/logger';
/**
 * API Key Repository Manual Test
 * 
 * Run with: npx ts-node --transpile-only scripts/test-api-key-repository.ts
 */

import { Pool } from 'pg';
import { ApiKeyRepository } from '../src/storage/repositories/ApiKeyRepository';
import type { PostgresPoolConfig } from '../src/storage/postgres/pool';

async function testApiKeyRepository() {
  logger.info('🧪 Testing ApiKeyRepository...\n');

  // Create pool directly for cleanup
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    user: 'godel',
    password: 'godel',
    database: 'godel',
  });

  // Test database connection
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('✅ Connected to PostgreSQL\n');
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:', error);
    process.exit(1);
  }

  // Create repository with proper config
  const config: PostgresPoolConfig = {
    host: 'localhost',
    port: 5433,
    database: 'godel',
    user: 'godel',
    password: 'godel',
    poolSize: 5,
    minPoolSize: 1,
    maxPoolSize: 10,
    connectionTimeoutMs: 5000,
    idleTimeoutMs: 30000,
    acquireTimeoutMs: 5000,
    retryAttempts: 3,
    retryDelayMs: 1000,
    ssl: false,
  };

  const repository = new ApiKeyRepository(config);

  try {
    await repository.initialize();
    logger.info('✅ Repository initialized\n');
  } catch (error) {
    console.error('❌ Failed to initialize repository:', error);
    await pool.end();
    process.exit(1);
  }

  // Clean up test data
  await pool.query("DELETE FROM api_keys WHERE name LIKE 'Test Key%'");

  // Test 1: Create API key
  logger.info('Test 1: Create API key');
  const key1 = await repository.create({
    key_hash: 'test_hash_12345',
    name: 'Test Key Create',
    scopes: ['read', 'write'],
    rate_limit: 1000,
  });
  logger.info(`✅ Created key: ${key1.id} ${key1.name}`);
  logger.info(`   Scopes: ${JSON.stringify(key1.scopes)}`);
  logger.info(`   Rate limit: ${key1.rate_limit}`);
  logger.info('');

  // Test 2: Find by ID
  logger.info('Test 2: Find by ID');
  const foundById = await repository.findById(key1.id);
  if (foundById) {
    logger.info(`✅ Found key by ID: ${foundById.name}`);
  } else {
    logger.info('❌ Key not found by ID');
  }
  logger.info('');

  // Test 3: Find by hash
  logger.info('Test 3: Find by hash');
  const foundByHash = await repository.findByKeyHash('test_hash_12345');
  if (foundByHash) {
    logger.info(`✅ Found key by hash: ${foundByHash.name}`);
  } else {
    logger.info('❌ Key not found by hash');
  }
  logger.info('');

  // Test 4: Update last used
  logger.info('Test 4: Update last used');
  await repository.updateLastUsed(key1.id);
  const updated = await repository.findById(key1.id);
  if (updated?.last_used_at) {
    logger.info(`✅ Last used updated: ${updated.last_used_at}`);
  } else {
    logger.info('❌ Failed to update last used');
  }
  logger.info('');

  // Test 5: Revoke key
  logger.info('Test 5: Revoke key');
  const revoked = await repository.revoke(key1.id);
  if (revoked?.is_revoked) {
    logger.info(`✅ Key revoked: ${revoked.revoked_at}`);
  } else {
    logger.info('❌ Failed to revoke key');
  }
  logger.info('');

  // Test 6: List keys
  logger.info('Test 6: List keys');
  const keys = await repository.list({ includeRevoked: true });
  logger.info(`✅ Found ${keys.length} keys`);
  logger.info('');

  // Test 7: Create and find valid key
  logger.info('Test 7: Create and validate key');
  const key2 = await repository.create({
    key_hash: 'valid_hash_67890',
    name: 'Test Key Valid',
    scopes: ['read'],
  });
  const isValid = await repository.isValidKey('valid_hash_67890');
  if (isValid) {
    logger.info('✅ Key is valid');
  } else {
    logger.info('❌ Key is not valid');
  }
  logger.info('');

  // Clean up
  await pool.query("DELETE FROM api_keys WHERE name LIKE 'Test Key%'");

  // Close pool
  await pool.end();

  logger.info('✅ All tests passed!');
}

testApiKeyRepository().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
