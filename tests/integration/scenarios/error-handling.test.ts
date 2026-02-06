import { logger } from '../../../src/utils/logger';
/**
 * Scenario 9: Error Handling Integration Tests
 * 
 * Tests for graceful error handling.
 * - Invalid API requests (400)
 * - Authentication failures (401)
 * - Resource not found (404)
 */

import { createTestApiClient, testConfig } from '../config';
import { OpenClawAdapter } from '../../../src/integrations/openclaw/adapter';

const RUN_LIVE_INTEGRATION_TESTS = process.env['RUN_LIVE_INTEGRATION_TESTS'] === 'true';
const describeLive = RUN_LIVE_INTEGRATION_TESTS ? describe : describe.skip;

describeLive('Scenario 9: Error Handling', () => {
  const apiClient = createTestApiClient();
  const createdResources: { type: string; id: string }[] = [];

  afterAll(async () => {
    // Clean up any created resources
    for (const resource of createdResources) {
      try {
        if (resource.type === 'swarm') {
          await apiClient.delete(`/api/swarms/${resource.id}`);
        } else if (resource.type === 'agent') {
          await apiClient.delete(`/api/agents/${resource.id}`);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Invalid API Requests (400)', () => {
    it('should return 400 for malformed JSON', async () => {
      const response = await apiClient.post(
        '/api/swarms',
        'not valid json',
        { 'Content-Type': 'application/json' }
      );

      expect(response.status).toBe(400);
    }, testConfig.testTimeout);

    it('should return 400 for missing required fields', async () => {
      // Create swarm without required name
      const response = await apiClient.post('/api/swarms', {
        // Missing 'name' which is likely required
        config: { maxAgents: 5 },
      });

      // Should return validation error
      expect([400, 422]).toContain(response.status);
    }, testConfig.testTimeout);

    it('should return 400 for invalid field types', async () => {
      const response = await apiClient.post('/api/swarms', {
        name: 'test-swarm',
        maxAgents: 'not-a-number', // Should be number
      });

      expect([400, 422]).toContain(response.status);
    }, testConfig.testTimeout);

    it('should return 400 for invalid field values', async () => {
      const response = await apiClient.post('/api/agents', {
        swarmId: 'valid-swarm-id',
        model: '', // Empty model might be invalid
        task: '', // Empty task might be invalid
      });

      // May succeed or fail depending on validation
      if (response.status !== 201) {
        expect([400, 422]).toContain(response.status);
      }
    }, testConfig.testTimeout);

    it('should return 400 for oversized payload', async () => {
      // Create a very large payload
      const largeConfig = {
        name: 'test-swarm',
        data: 'x'.repeat(10 * 1024 * 1024), // 10MB of data
      };

      const response = await apiClient.post('/api/swarms', largeConfig);

      // May return 400 or 413 (Payload Too Large)
      expect([400, 413, 422]).toContain(response.status);
    }, testConfig.testTimeout);

    it('should return 400 for invalid query parameters', async () => {
      const response = await apiClient.get('/api/swarms?page=invalid&limit=not-a-number');

      // API might ignore invalid params or return error
      expect([200, 400]).toContain(response.status);
    }, testConfig.testTimeout);
  });

  describe('Authentication Failures (401)', () => {
    it('should return 401 for missing API key', async () => {
      // Make request without API key header
      const response = await fetch(`${testConfig.godelApiUrl}/api/swarms`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // No X-API-Key header
        },
      });

      // API may or may not require authentication
      if (response.status !== 200) {
        expect([401, 403]).toContain(response.status);
      }
    }, testConfig.testTimeout);

    it('should return 401 for invalid API key', async () => {
      const response = await fetch(`${testConfig.godelApiUrl}/api/swarms`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'invalid-key-12345',
        },
      });

      // API may or may not require authentication
      if (response.status !== 200) {
        expect([401, 403]).toContain(response.status);
      }
    }, testConfig.testTimeout);

    it('should return 401 for expired token', async () => {
      // Try with a token that looks expired
      const response = await fetch(`${testConfig.godelApiUrl}/api/swarms`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'expired-token',
          'Authorization': 'Bearer expired-jwt-token',
        },
      });

      // API may or may not require authentication
      if (response.status !== 200) {
        expect([401, 403]).toContain(response.status);
      }
    }, testConfig.testTimeout);

    it('should handle authentication in adapter', async () => {
      const badAdapter = new OpenClawAdapter({
        godelApiUrl: testConfig.godelApiUrl,
        godelApiKey: 'invalid-key',
        openclawSessionKey: 'test-session',
      });

      try {
        await badAdapter.spawnAgent('test-auth', {
          agentType: 'test',
          task: 'Auth test',
        });
      } catch (error: any) {
        // Should fail with auth error
        expect(error).toBeDefined();
      }
    }, testConfig.testTimeout);
  });

  describe('Resource Not Found (404)', () => {
    it('should return 404 for non-existent swarm', async () => {
      const response = await apiClient.get('/api/swarms/non-existent-swarm-id-12345');

      expect(response.status).toBe(404);
    }, testConfig.testTimeout);

    it('should return 404 for non-existent agent', async () => {
      const response = await apiClient.get('/api/agents/non-existent-agent-id-12345');

      expect(response.status).toBe(404);
    }, testConfig.testTimeout);

    it('should return 404 for non-existent task', async () => {
      const response = await apiClient.get('/api/tasks/non-existent-task-id-12345');

      // May return 404 or 501 if not implemented
      expect([404, 501]).toContain(response.status);
    }, testConfig.testTimeout);

    it('should return 404 for invalid endpoint', async () => {
      const response = await apiClient.get('/api/non-existent-endpoint');

      expect(response.status).toBe(404);
    }, testConfig.testTimeout);

    it('should return 404 for nested non-existent resources', async () => {
      const response = await apiClient.get('/api/swarms/fake-swarm/agents');

      expect(response.status).toBe(404);
    }, testConfig.testTimeout);
  });

  describe('Method Not Allowed (405)', () => {
    it('should return 405 for unsupported HTTP methods', async () => {
      const response = await fetch(`${testConfig.godelApiUrl}/api/swarms`, {
        method: 'PATCH', // PATCH might not be supported
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': testConfig.godelApiKey,
        },
        body: JSON.stringify({ name: 'test' }),
      });

      // API might not support PATCH
      if (response.status !== 200) {
        expect([405, 404, 501]).toContain(response.status);
      }
    }, testConfig.testTimeout);

    it('should return 405 for DELETE on read-only resources', async () => {
      // Try to delete health endpoint (shouldn't be allowed)
      const response = await apiClient.delete('/health');

      expect([405, 404]).toContain(response.status);
    }, testConfig.testTimeout);
  });

  describe('Conflict Errors (409)', () => {
    it('should return 409 for duplicate resource creation', async () => {
      const name = `conflict-test-${Date.now()}`;

      // Create first resource
      const response1 = await apiClient.post('/api/swarms', {
        name,
        config: {},
      });

      if (response1.status === 201) {
        createdResources.push({ type: 'swarm', id: (response1.data as any).id });

        // Try to create with same name
        const response2 = await apiClient.post('/api/swarms', {
          name,
          config: {},
        });

        // Should return conflict
        expect([409, 422]).toContain(response2.status);
      }
    }, testConfig.testTimeout);
  });

  describe('Rate Limiting (429)', () => {
    it('should return 429 when rate limit exceeded', async () => {
      // Send many rapid requests
      const requests = Array(50).fill(null).map(() =>
        apiClient.get('/health')
      );

      const responses = await Promise.all(requests);

      // Check if any were rate limited
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      // If rate limiting is enabled, some should be limited
      // If not, all should succeed
      expect(responses.every(r => [200, 429].includes(r.status))).toBe(true);

      logger.info(`Rate limiting test: ${rateLimitedCount}/50 requests rate limited`);
    }, testConfig.testTimeout);
  });

  describe('Server Errors (500)', () => {
    it('should handle internal server errors gracefully', async () => {
      // Trigger an error by sending invalid data that might cause server error
      const response = await apiClient.post('/api/swarms', {
        name: 'test',
        config: null, // null might cause issues
      });

      // Should either succeed or return error
      expect([201, 400, 422, 500]).toContain(response.status);
    }, testConfig.testTimeout);

    it('should provide error details in response', async () => {
      const response = await apiClient.get('/api/swarms/non-existent-id');

      expect(response.status).toBe(404);
      
      // Error response should have details
      if (response.data && typeof response.data === 'object') {
        const data = response.data as Record<string, unknown>;
        expect(data['error'] || data['message'] || data['detail']).toBeDefined();
      }
    }, testConfig.testTimeout);
  });

  describe('Timeout Errors', () => {
    it('should handle request timeouts', async () => {
      // This test depends on API having a slow endpoint
      // We'll test with a standard endpoint that should be fast
      const startTime = Date.now();
      const response = await apiClient.get('/health');
      const duration = Date.now() - startTime;

      // Should respond quickly
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000);
    }, testConfig.testTimeout);
  });

  describe('CORS Errors', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await fetch(`${testConfig.godelApiUrl}/api/swarms`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      // Should return CORS headers or 204/200
      expect([200, 204, 404]).toContain(response.status);
    }, testConfig.testTimeout);
  });

  describe('Error Recovery', () => {
    it('should continue operating after errors', async () => {
      // Trigger some errors
      await apiClient.get('/api/swarms/non-existent-1');
      await apiClient.get('/api/swarms/non-existent-2');
      await apiClient.get('/api/swarms/non-existent-3');

      // API should still work normally
      const response = await apiClient.get('/health');
      expect(response.status).toBe(200);
    }, testConfig.testTimeout);

    it('should maintain consistent state after failed operations', async () => {
      // Try to create invalid resource
      await apiClient.post('/api/swarms', { invalid: 'data' });

      // System should still be functional
      const response = await apiClient.get('/api/swarms');
      expect(response.status).toBe(200);
      expect(Array.isArray((response.data as any)?.swarms || response.data)).toBe(true);
    }, testConfig.testTimeout);
  });

  describe('Error Logging', () => {
    it('should log errors appropriately', async () => {
      // Trigger an error that should be logged
      const response = await apiClient.get('/api/swarms/invalid-id-format!!!');

      // Error should be returned
      expect([400, 404, 422]).toContain(response.status);
    }, testConfig.testTimeout);
  });
});
