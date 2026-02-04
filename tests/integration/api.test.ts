/**
 * API Integration Tests
 * 
 * Tests the Dash API endpoints with real database connections.
 * Requires PostgreSQL and Redis to be running.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Pool } from 'pg';
import Redis from 'ioredis';

// Test configuration
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://dash_user:dash_password@localhost:5432/dash_test';
const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

describe('Dash API Integration', () => {
  let db: Pool;
  let redis: Redis;
  let apiUrl: string;

  beforeAll(async () => {
    // Initialize test database connection
    db = new Pool({ connectionString: TEST_DB_URL });
    
    // Initialize test Redis connection
    redis = new Redis(TEST_REDIS_URL);
    
    // Set API URL (adjust for your test setup)
    apiUrl = process.env.TEST_API_URL || 'http://localhost:3001';
  });

  afterAll(async () => {
    await db.end();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.query('DELETE FROM events WHERE type LIKE \'test_%\'');
    await redis.flushdb();
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await fetch(`${apiUrl}/health`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data).toHaveProperty('timestamp');
    });

    it('should return readiness status', async () => {
      const response = await fetch(`${apiUrl}/ready`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.ready).toBe(true);
      expect(data).toHaveProperty('checks');
    });
  });

  describe('Swarm API', () => {
    it('should create a new swarm', async () => {
      const swarmConfig = {
        name: 'test_swarm',
        config: { model: 'test-model', maxAgents: 5 },
      };

      const response = await fetch(`${apiUrl}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swarmConfig),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.name).toBe(swarmConfig.name);
    });

    it('should list swarms', async () => {
      const response = await fetch(`${apiUrl}/api/swarms`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(Array.isArray(data.swarms)).toBe(true);
      expect(data).toHaveProperty('total');
    });

    it('should get swarm by id', async () => {
      // Create a swarm first
      const createRes = await fetch(`${apiUrl}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test_get_swarm' }),
      });
      const created = await createRes.json();

      // Get the swarm
      const response = await fetch(`${apiUrl}/api/swarms/${created.id}`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.id).toBe(created.id);
    });
  });

  describe('Agent API', () => {
    let testSwarmId: string;

    beforeEach(async () => {
      // Create a test swarm for agent tests
      const response = await fetch(`${apiUrl}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test_agent_swarm' }),
      });
      const data = await response.json();
      testSwarmId = data.id;
    });

    it('should spawn an agent', async () => {
      const agentConfig = {
        swarmId: testSwarmId,
        model: 'test-model',
        task: 'Test task',
      };

      const response = await fetch(`${apiUrl}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentConfig),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.status).toBe('pending');
    });

    it('should list agents for a swarm', async () => {
      const response = await fetch(`${apiUrl}/api/swarms/${testSwarmId}/agents`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(Array.isArray(data.agents)).toBe(true);
    });

    it('should update agent status', async () => {
      // Create an agent first
      const createRes = await fetch(`${apiUrl}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swarmId: testSwarmId,
          model: 'test-model',
          task: 'Test task',
        }),
      });
      const agent = await createRes.json();

      // Update status
      const response = await fetch(`${apiUrl}/api/agents/${agent.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('running');
    });
  });

  describe('Events API', () => {
    it('should emit an event', async () => {
      const eventData = {
        type: 'test_event',
        payload: { message: 'test' },
        severity: 'info',
      };

      const response = await fetch(`${apiUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBeDefined();
    });

    it('should query events', async () => {
      const response = await fetch(`${apiUrl}/api/events?type=test_event&limit=10`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(Array.isArray(data.events)).toBe(true);
      expect(data).toHaveProperty('total');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent swarm', async () => {
      const response = await fetch(`${apiUrl}/api/swarms/00000000-0000-0000-0000-000000000000`);
      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid request body', async () => {
      const response = await fetch(`${apiUrl}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      expect(response.status).toBe(400);
    });

    it('should return 422 for validation errors', async () => {
      const response = await fetch(`${apiUrl}/api/swarms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Missing required 'name'
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return Prometheus metrics', async () => {
      const response = await fetch(`${apiUrl}/metrics`);
      expect(response.status).toBe(200);
      
      const data = await response.text();
      expect(data).toContain('# HELP');
      expect(data).toContain('# TYPE');
    });
  });
});
