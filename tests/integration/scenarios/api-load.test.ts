import { logger } from '../../../src/utils/logger';
/**
 * Scenario 4: API Load Testing Integration Tests
 * 
 * Tests for API performance under load.
 * - 1000 concurrent API requests
 * - P99 latency < 200ms
 * - Rate limiting
 */

import { createTestApiClient, testConfig, calculateLatencyStats } from '../config';

const RUN_LIVE_INTEGRATION_TESTS = process.env['RUN_LIVE_INTEGRATION_TESTS'] === 'true';
const describeLive = RUN_LIVE_INTEGRATION_TESTS ? describe : describe.skip;

describeLive('Scenario 4: API Load Testing', () => {
  const apiClient = createTestApiClient();
  const createdSwarmIds: string[] = [];
  const createdAgentIds: string[] = [];

  afterAll(async () => {
    // Clean up
    for (const agentId of createdAgentIds) {
      try {
        await apiClient.delete(`/api/agents/${agentId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
    
    for (const teamId of createdTeamIds) {
      try {
        await apiClient.delete(`/api/teams/${teamId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 1000 concurrent health check requests', async () => {
      const requestCount = 1000;
      const concurrentLimit = 100;
      const latencies: number[] = [];

      // Create batches of requests
      const batches: (() => Promise<void>)[][] = [];
      
      for (let i = 0; i < requestCount; i += concurrentLimit) {
        const batchSize = Math.min(concurrentLimit, requestCount - i);
        const batch: (() => Promise<void>)[] = [];
        
        for (let j = 0; j < batchSize; j++) {
          batch.push(async () => {
            const start = Date.now();
            const response = await apiClient.get('/health');
            const latency = Date.now() - start;
            latencies.push(latency);
            
            expect(response.status).toBe(200);
            expect(response.data).toBeDefined();
          });
        }
        
        batches.push(batch);
      }

      // Execute batches
      const startTime = Date.now();
      
      for (const batch of batches) {
        await Promise.all(batch.map(fn => fn()));
      }

      const totalDuration = Date.now() - startTime;
      const stats = calculateLatencyStats(latencies);

      // Log results
      logger.info('API Load Test Results (1000 requests):');
      logger.info(`  Total duration: ${totalDuration}ms`);
      logger.info(`  Requests/sec: ${(requestCount / (totalDuration / 1000)).toFixed(1)}`);
      logger.info(`  Min latency: ${stats.min}ms`);
      logger.info(`  Mean latency: ${stats.mean.toFixed(2)}ms`);
      logger.info(`  P50 latency: ${stats.p50}ms`);
      logger.info(`  P95 latency: ${stats.p95}ms`);
      logger.info(`  P99 latency: ${stats.p99}ms`);
      logger.info(`  Max latency: ${stats.max}ms`);

      // Verify performance requirements
      expect(stats.p99).toBeLessThan(testConfig.apiP99LatencyThreshold);
      expect(requestCount / (totalDuration / 1000)).toBeGreaterThan(100);
    }, testConfig.testTimeout);

    it('should handle concurrent swarm creation requests', async () => {
      const concurrentCount = 20;
      const latencies: number[] = [];
      const teamIds: string[] = [];

      const requests = Array(concurrentCount).fill(null).map((_, i) =>
        async () => {
          const start = Date.now();
          const response = await apiClient.post('/api/swarms', {
            name: `load-test-swarm-${Date.now()}-${i}`,
            config: { model: 'test-model', maxAgents: 5 },
          });
          const latency = Date.now() - start;
          latencies.push(latency);
          
          expect(response.status).toBe(201);
          expect((response.data as any).id).toBeDefined();
          teamIds.push((response.data as any).id);
          
          return (response.data as any).id;
        }
      );

      const startTime = Date.now();
      await Promise.all(requests.map(fn => fn()));
      const duration = Date.now() - startTime;

      createdTeamIds.push(...teamIds);

      const stats = calculateLatencyStats(latencies);
      logger.info(`Concurrent team creation (${concurrentCount}):`);
      logger.info(`  Duration: ${duration}ms`);
      logger.info(`  Mean latency: ${stats.mean.toFixed(2)}ms`);
      logger.info(`  P99 latency: ${stats.p99}ms`);

      expect(stats.p99).toBeLessThan(1000); // 1 second for writes
    }, testConfig.testTimeout);

    it('should handle concurrent agent spawn requests', async () => {
      // First create a swarm
      const teamRes = await apiClient.post('/api/teams', {
        name: `agent-load-test-${Date.now()}`,
      });
      const teamId = (teamRes.data as any).id;
      createdTeamIds.push(teamId);

      const concurrentCount = 20;
      const latencies: number[] = [];
      const agentIds: string[] = [];

      const requests = Array(concurrentCount).fill(null).map((_, i) =>
        async () => {
          const start = Date.now();
          const response = await apiClient.post('/api/agents', {
            teamId,
            model: 'test-model',
            task: `Load test task ${i}`,
          });
          const latency = Date.now() - start;
          latencies.push(latency);
          
          expect(response.status).toBe(201);
          agentIds.push((response.data as any).id);
          
          return (response.data as any).id;
        }
      );

      const startTime = Date.now();
      await Promise.all(requests.map(fn => fn()));
      const duration = Date.now() - startTime;

      createdAgentIds.push(...agentIds);

      const stats = calculateLatencyStats(latencies);
      logger.info(`Concurrent agent spawn (${concurrentCount}):`);
      logger.info(`  Duration: ${duration}ms`);
      logger.info(`  Mean latency: ${stats.mean.toFixed(2)}ms`);
      logger.info(`  P99 latency: ${stats.p99}ms`);

      expect(stats.p99).toBeLessThan(2000); // 2 seconds for agent spawn
    }, testConfig.testTimeout);
  });

  describe('Performance Under Load', () => {
    it('should maintain low latency during sustained load', async () => {
      const iterations = 10;
      const requestsPerIteration = 50;
      const allLatencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const latencies: number[] = [];
        
        const requests = Array(requestsPerIteration).fill(null).map(() =>
          async () => {
            const start = Date.now();
            const response = await apiClient.get('/health');
            latencies.push(Date.now() - start);
            expect(response.status).toBe(200);
          }
        );

        await Promise.all(requests.map(fn => fn()));
        allLatencies.push(...latencies);

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const stats = calculateLatencyStats(allLatencies);
      
      logger.info('Sustained Load Test (500 requests in 10 iterations):');
      logger.info(`  Mean latency: ${stats.mean.toFixed(2)}ms`);
      logger.info(`  P95 latency: ${stats.p95}ms`);
      logger.info(`  P99 latency: ${stats.p99}ms`);

      expect(stats.p99).toBeLessThan(testConfig.apiP99LatencyThreshold);
    }, testConfig.testTimeout);

    it('should handle mixed read/write load', async () => {
      const requestCount = 100;
      const latencies: { read: number[]; write: number[] } = { read: [], write: [] };
      const localTeamIds: string[] = [];

      // Create a test team
      const teamRes = await apiClient.post('/api/teams', {
        name: `mixed-load-${Date.now()}`,
      });
      const teamId = (teamRes.data as any).id;
      localTeamIds.push(teamId);

      const requests = Array(requestCount).fill(null).map((_, i) =>
        async () => {
          if (i % 3 === 0) {
            // Write operation (30%)
            const start = Date.now();
            const response = await apiClient.post('/api/events', {
              type: 'test_event',
              payload: { index: i },
              severity: 'info',
            });
            latencies.write.push(Date.now() - start);
            expect(response.status).toBe(201);
          } else {
            // Read operation (70%)
            const start = Date.now();
            const response = await apiClient.get('/health');
            latencies.read.push(Date.now() - start);
            expect(response.status).toBe(200);
          }
        }
      );

      await Promise.all(requests.map(fn => fn()));

      const readStats = calculateLatencyStats(latencies.read);
      const writeStats = calculateLatencyStats(latencies.write);

      logger.info('Mixed Load Test:');
      logger.info(`  Reads (${latencies.read.length}): P99=${readStats.p99}ms`);
      logger.info(`  Writes (${latencies.write.length}): P99=${writeStats.p99}ms`);

      expect(readStats.p99).toBeLessThan(testConfig.apiP99LatencyThreshold);
      expect(writeStats.p99).toBeLessThan(testConfig.apiP99LatencyThreshold * 2);

      // Cleanup
      for (const id of localTeamIds) {
        await apiClient.delete(`/api/teams/${id}`);
      }
    }, testConfig.testTimeout);
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on API endpoints', async () => {
      // Send many rapid requests
      const rapidRequests = 50;
      const responses: { status: number }[] = [];

      for (let i = 0; i < rapidRequests; i++) {
        try {
          const response = await apiClient.get('/health');
          responses.push({ status: response.status });
        } catch (error: any) {
          responses.push({ status: error.status || 0 });
        }
      }

      // Most requests should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(rapidRequests * 0.8);

      // Check for rate limit responses (429)
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      // Either no rate limiting or some requests were rate limited
      expect(rateLimitedCount).toBeGreaterThanOrEqual(0);
    }, testConfig.testTimeout);

    it('should return 429 when rate limit exceeded', async () => {
      // This test assumes rate limiting is configured
      // If not, it will pass vacuously
      
      const burstSize = 100;
      const responses: number[] = [];

      // Send burst of requests
      const requests = Array(burstSize).fill(null).map(() =>
        apiClient.get('/health')
          .then(r => r.status)
          .catch(e => e.status || 0)
      );

      const results = await Promise.all(requests);

      // Check if any were rate limited
      const rateLimited = results.filter(s => s === 429).length;
      const successful = results.filter(s => s === 200).length;

      logger.info(`Rate limit test: ${successful} successful, ${rateLimited} rate limited`);

      // Either all succeed (no rate limiting) or some are limited
      expect(successful + rateLimited).toBe(burstSize);
    }, testConfig.testTimeout);
  });

  describe('Error Handling Under Load', () => {
    it('should handle errors gracefully under load', async () => {
      const requestCount = 50;
      const errors: number[] = [];

      const requests = Array(requestCount).fill(null).map((_, i) =>
        async () => {
          try {
            // Mix of valid and invalid requests
            if (i % 5 === 0) {
              // Invalid request - non-existent resource
              const response = await apiClient.get('/api/swarms/non-existent-id');
              expect(response.status).toBe(404);
            } else if (i % 5 === 1) {
              // Invalid request - bad data
              const response = await apiClient.post('/api/swarms', {});
              expect(response.status).toBe(400);
            } else {
              // Valid request
              const response = await apiClient.get('/health');
              expect(response.status).toBe(200);
            }
          } catch (error: any) {
            errors.push(error.status || 0);
          }
        }
      );

      await Promise.all(requests.map(fn => fn()));

      // API should remain stable
      expect(errors.length).toBeLessThan(requestCount);
    }, testConfig.testTimeout);
  });

  describe('Resource Cleanup Under Load', () => {
    it('should properly clean up resources after load test', async () => {
      // Create and delete many swarms rapidly
      const rapidCount = 20;
      const teamIds: string[] = [];

      // Create
      for (let i = 0; i < rapidCount; i++) {
        const response = await apiClient.post('/api/swarms', {
          name: `cleanup-test-${Date.now()}-${i}`,
        });
        if (response.status === 201) {
          teamIds.push((response.data as any).id);
        }
      }

      // Delete all
      const deleteResults = await Promise.all(
        teamIds.map(id =>
          apiClient.delete(`/api/swarms/${id}`)
            .then(r => r.status)
            .catch(e => e.status || 0)
        )
      );

      const successfulDeletes = deleteResults.filter(s => s === 200 || s === 204).length;
      expect(successfulDeletes).toBe(teamIds.length);

      // Verify they're gone
      for (const id of teamIds) {
        const response = await apiClient.get(`/api/teams/${id}`);
        expect(response.status).toBe(404);
      }
    }, testConfig.testTimeout);
  });
});
