/**
 * Latency Injection Chaos Experiment Tests
 */

import { LatencyInjectionExperiment, injectLatency, latencyRampUp } from '../latency-injection';
import { createDefaultContext } from '../../runner';

describe('LatencyInjectionExperiment', () => {
  const mockContext = createDefaultContext(
    async () => ({ 
      healthy: true, 
      services: {} 
    }),
    async () => ({ consistent: true })
  );

  describe('validation', () => {
    it('should require target service', () => {
      const exp = new LatencyInjectionExperiment({
        target: '',
        latencyMs: 1000,
        duration: 60,
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Target service is required');
    });

    it('should validate latency >= 0', () => {
      const exp = new LatencyInjectionExperiment({
        target: 'api-service',
        latencyMs: -100,
        duration: 60,
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Latency must be non-negative');
    });

    it('should validate duration > 0', () => {
      const exp = new LatencyInjectionExperiment({
        target: 'api-service',
        latencyMs: 1000,
        duration: 0,
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Duration must be at least 1 second');
    });

    it('should validate jitter percentage', () => {
      const exp = new LatencyInjectionExperiment({
        target: 'api-service',
        latencyMs: 1000,
        duration: 60,
        jitterPercent: 150,
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Jitter percentage must be between 0 and 100');
    });

    it('should pass validation with valid config', () => {
      const exp = new LatencyInjectionExperiment({
        target: 'api-service',
        latencyMs: 1000,
        duration: 60,
        jitterPercent: 10,
        coveragePercent: 50,
      });
      
      const errors = exp.validate();
      expect(errors).toHaveLength(0);
    });
  });

  describe('execution', () => {
    it('should track metrics during injection', async () => {
      const exp = new LatencyInjectionExperiment({
        target: 'api-service',
        latencyMs: 500,
        duration: 1,
      });

      const result = await exp.run(mockContext);
      
      expect(result.data.metrics).toHaveProperty('requestsAffected');
      expect(result.data.metrics).toHaveProperty('timeoutErrors');
    });

    it('should measure impact on system', async () => {
      const exp = new LatencyInjectionExperiment({
        target: 'api-service',
        latencyMs: 100,
        duration: 1,
      });

      const result = await exp.run(mockContext);
      
      expect(result.data.impact).toHaveProperty('userVisibleLatency');
      expect(result.data.impact).toHaveProperty('degradedExperiences');
      expect(result.data.impact).toHaveProperty('errorRateIncrease');
    });
  });

  describe('helper functions', () => {
    it('injectLatency should create and run experiment', async () => {
      const result = await injectLatency('api-service', 100, 1);
      
      expect(result).toHaveProperty('success');
      expect(result.data.config.latencyMs).toBe(100);
    });

    it('latencyRampUp should test multiple latency values', async () => {
      const results = await latencyRampUp('api-service', 100, 500, 100, 1);
      
      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
      });
    });
  });
});
