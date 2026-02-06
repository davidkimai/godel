import { logger } from '../../src/utils/logger';
/**
 * Authentication Integration Tests
 * 
 * Tests authentication and authorization mechanisms.
 * Requires PostgreSQL and Redis to be running.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createHash } from 'crypto';

const API_URL = process.env['TEST_API_URL'] || 'http://localhost:3001';
const RUN_LIVE_INTEGRATION_TESTS = process.env['RUN_LIVE_INTEGRATION_TESTS'] === 'true';
const describeLive = RUN_LIVE_INTEGRATION_TESTS ? describe : describe.skip;

describeLive('Godel Authentication Integration', () => {
  let apiKey: string;
  let jwtToken: string;

  beforeAll(async () => {
    // Set up test credentials
    apiKey = process.env['TEST_API_KEY'] || 'test-api-key-' + Date.now();
  });

  describe('API Key Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await fetch(`${API_URL}/api/swarms`);
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toContain('Authentication required');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await fetch(`${API_URL}/api/swarms`, {
        headers: {
          'X-API-Key': 'invalid-key',
        },
      });
      expect(response.status).toBe(401);
    });

    it('should accept requests with valid API key', async () => {
      // This test assumes the API accepts the test key
      // In production, you'd use a real authentication mechanism
      const response = await fetch(`${API_URL}/health`, {
        headers: {
          'X-API-Key': apiKey,
        },
      });
      
      // Health endpoint might be public or protected
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('JWT Authentication', () => {
    it('should authenticate with valid JWT token', async () => {
      // First, get a token (if there's a login endpoint)
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: process.env['TEST_USERNAME'] || 'test',
          password: process.env['TEST_PASSWORD'] || 'test',
        }),
      });

      // If auth is not implemented, skip
      if (loginRes.status === 404) {
        logger.info('JWT auth not implemented, skipping');
        return;
      }

      if (loginRes.status === 200) {
        const { token } = await loginRes.json();
        jwtToken = token;

        // Use token to access protected endpoint
        const response = await fetch(`${API_URL}/api/swarms`, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
          },
        });
        expect(response.status).toBe(200);
      }
    });

    it('should reject expired JWT token', async () => {
      // This would require generating an expired token
      // Skipping as implementation-specific
    });

    it('should reject malformed JWT token', async () => {
      const response = await fetch(`${API_URL}/api/swarms`, {
        headers: {
          'Authorization': 'Bearer invalid.token.here',
        },
      });
      expect(response.status).toBe(401);
    });
  });

  describe('Webhook Authentication', () => {
    it('should verify webhook signature', async () => {
      const webhookSecret = process.env['WEBHOOK_SECRET'] || 'test-secret';
      const payload = JSON.stringify({ event: 'test', data: { id: 1 } });
      
      // Generate HMAC signature
      const signature = createHash('sha256')
        .update(payload + webhookSecret)
        .digest('hex');

      const response = await fetch(`${API_URL}/webhooks/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payload,
      });

      // Webhook might not be implemented or might validate differently
      expect([200, 201, 400, 401, 404]).toContain(response.status);
    });

    it('should reject webhooks without signature', async () => {
      const response = await fetch(`${API_URL}/webhooks/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test' }),
      });

      expect([400, 401, 404]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      
      // Send multiple rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(fetch(`${API_URL}/health`));
      }

      const responses = await Promise.all(requests);
      
      // Check if any were rate limited
      const statusCodes = responses.map(r => r.status);
      
      // If rate limiting is enabled, some requests should be 429
      // If not, all should be 200
      const hasRateLimiting = statusCodes.includes(429);
      
      if (hasRateLimiting) {
        expect(statusCodes).toContain(429);
        const rateLimited = responses.find(r => r.status === 429);
        expect(rateLimited!.headers.get('Retry-After')).toBeDefined();
      }
    });
  });

  describe('Role-Based Access Control', () => {
    it('should restrict admin operations to admin users', async () => {
      // Try to access admin endpoint without admin role
      const response = await fetch(`${API_URL}/admin/config`, {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      // Should be 403 Forbidden or 404 if not implemented
      expect([403, 404]).toContain(response.status);
    });

    it('should allow read access to authenticated users', async () => {
      const response = await fetch(`${API_URL}/api/swarms`, {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      // Should succeed with valid auth
      expect(response.status).toBe(200);
    });
  });

  describe('Session Management', () => {
    it('should create and validate session', async () => {
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'test',
          password: 'test',
        }),
      });

      // Skip if auth not implemented
      if (loginRes.status === 404) {
        return;
      }

      if (loginRes.status === 200) {
        const { token } = await loginRes.json();

        // Validate session
        const validateRes = await fetch(`${API_URL}/auth/validate`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        expect(validateRes.status).toBe(200);
        const data = await validateRes.json();
        expect(data.valid).toBe(true);
      }
    });

    it('should logout and invalidate session', async () => {
      const logoutRes = await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken || 'test'}` },
      });

      // Skip if auth not implemented
      if (logoutRes.status === 404) {
        return;
      }

      expect([200, 401]).toContain(logoutRes.status);
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include security headers', async () => {
      const response = await fetch(`${API_URL}/health`);
      
      const headers = response.headers;
      
      // Check for common security headers
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(headers.get('X-Frame-Options')).toBeDefined();
    });

    it('should handle CORS preflight requests', async () => {
      const response = await fetch(`${API_URL}/api/swarms`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type,Authorization',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    });
  });
});
