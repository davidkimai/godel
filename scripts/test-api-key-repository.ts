/**
 * API Key Repository Manual Test
 * 
 * Run with: npx ts-node --transpile-only scripts/test-api-key-repository.ts
 */

import { Pool } from 'pg';
import { ApiKeyRepository } from '../src/storage/repositories/ApiKeyRepository';
import type { PostgresPoolConfig } from '../src/storage/postgres/pool';

async function testApiKeyRepository() {
  console.log('🧪 Testing ApiKeyRepository...\n');

  // Create pool directly for cleanup
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    user: 'dash',
    password: 'dash',
    database: 'dash',
  });

  // Test database connection
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Connected to PostgreSQL\n');
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:', error);
    process.exit(1);
  }

  // Create repository with proper config
  const config: PostgresPoolConfig = {
    host: 'localhost',
    port: 5433,
    database: 'dash',
    user: 'dash',
    password: 'dash',
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
    console.log('✅ Repository initialized\n');
  } catch (error) {
    console.error('❌ Failed to initialize repository:', error);
    await pool.end();
    process.exit(1);
  }

  // Clean up test data
  await pool.query("DELETE FROM api_keys WHERE name LIKE 'Test Key%'");

  // Test 1: Create API key
  console.log('Test 1: Create API key');
  const key1 = await repository.create({
    key_hash: 'test_hash_12345',
    name: 'Test Key Create',
    scopes: ['read', 'write'],
    rate_limit: 1000,
  });
  console.log('✅ Created key:', key1.id, key1.name);
  console.log('   Scopes:', key1.scopes);
  console.log('   Rate limit:', key1.rate_limit);
  console.log();

  // Test 2: Find by ID
  console.log('Test 2: Find by ID');
  const foundById = await repository.findById(key1.id);
  if (foundById) {
    console.log('✅ Found key by ID:', foundById.name);
  } else {
    console.log('❌ Key not found by ID');
  }
  console.log();

  // Test 3: Find by hash
  console.log('Test 3: Find by hash');
  const foundByHash = await repository.findByKeyHash('test_hash_12345');
  if (foundByHash) {
    console.log('✅ Found key by hash:', foundByHash.name);
  } else {
    console.log('❌ Key not found by hash');
  }
  console.log();

  // Test 4: Update last used
  console.log('Test 4: Update last used');
  await repository.updateLastUsed(key1.id);
  const updated = await repository.findById(key1.id);
  if (updated?.last_used_at) {
    console.log('✅ Last used updated:', updated.last_used_at);
  } else {
    console.log('❌ Failed to update last used');
  }
  console.log();

  // Test 5: Revoke key
  console.log('Test 5: Revoke key');
  const revoked = await repository.revoke(key1.id);
  if (revoked?.is_revoked) {
    console.log('✅ Key revoked:', revoked.revoked_at);
  } else {
    console.log('❌ Failed to revoke key');
  }
  console.log();

  // Test 6: List keys
  console.log('Test 6: List keys');
  const keys = await repository.list({ includeRevoked: true });
  console.log(`✅ Found ${keys.length} keys`);
  console.log();

  // Test 7: Create and find valid key
  console.log('Test 7: Create and validate key');
  const key2 = await repository.create({
    key_hash: 'valid_hash_67890',
    name: 'Test Key Valid',
    scopes: ['read'],
  });
  const isValid = await repository.isValidKey('valid_hash_67890');
  if (isValid) {
    console.log('✅ Key is valid');
  } else {
    console.log('❌ Key is not valid');
  }
  console.log();

  // Clean up
  await pool.query("DELETE FROM api_keys WHERE name LIKE 'Test Key%'");

  // Close pool
  await pool.end();

  console.log('✅ All tests passed!');
}

testApiKeyRepository().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
