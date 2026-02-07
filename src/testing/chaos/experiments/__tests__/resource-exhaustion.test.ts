/**
 * Resource Exhaustion Chaos Experiment Tests
 */

import { ResourceExhaustionExperiment, exhaustCPU, exhaustMemory } from '../resource-exhaustion';
import { createDefaultContext } from '../../runner';

describe('ResourceExhaustionExperiment', () => {
  const mockContext = createDefaultContext(
    async () => ({ 
      healthy: true, 
      services: {} 
    }),
    async () => ({ consistent: true })
  );

  describe('validation', () => {
    it('should require target service', () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'cpu',
        target: '',
        consumptionPercent: 80,
        duration: 60,
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Target service is required');
    });

    it('should validate consumption percentage', () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'cpu',
        target: 'test-service',
        consumptionPercent: 150,
        duration: 60,
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Consumption percentage must be between 0 and 100');
    });

    it('should validate duration > 0', () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'cpu',
        target: 'test-service',
        consumptionPercent: 80,
        duration: 0,
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Duration must be at least 1 second');
    });

    it('should pass validation with valid config', () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'memory',
        target: 'test-service',
        consumptionPercent: 75,
        duration: 60,
        method: 'gradual',
      });
      
      const errors = exp.validate();
      expect(errors).toHaveLength(0);
    });
  });

  describe('execution', () => {
    it('should track OOM events', async () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'memory',
        target: 'test-service',
        consumptionPercent: 50,
        duration: 1,
      });

      const result = await exp.run(mockContext);
      
      expect(result.data.metrics).toHaveProperty('oomEvents');
      expect(result.data.metrics).toHaveProperty('throttleEvents');
      expect(result.data.metrics).toHaveProperty('evictedPods');
    });

    it('should assess system behavior', async () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'cpu',
        target: 'test-service',
        consumptionPercent: 80,
        duration: 1,
      });

      const result = await exp.run(mockContext);
      
      expect(result.data.systemBehavior).toHaveProperty('remainedStable');
      expect(result.data.systemBehavior).toHaveProperty('gracefulDegradation');
      expect(result.data.systemBehavior).toHaveProperty('recoveryTimeMs');
    });

    it('should cleanup after experiment', async () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'memory',
        target: 'test-service',
        consumptionPercent: 50,
        duration: 1,
        cleanup: true,
      });

      const cleanupSpy = jest.fn();
      exp.on('cleanup', cleanupSpy);

      await exp.run(mockContext);

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('resource types', () => {
    it('should support CPU exhaustion', async () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'cpu',
        target: 'test-service',
        consumptionPercent: 80,
        duration: 1,
      });

      const result = await exp.run(mockContext);
      expect(result.success).toBeDefined();
    });

    it('should support memory exhaustion', async () => {
      const exp = new ResourceExhaustionExperiment({
        resourceType: 'memory',
        target: 'test-service',
        consumptionPercent: 80,
        duration: 1,
      });

      const result = await exp.run(mockContext);
      expect(result.success).toBeDefined();
    });
  });

  describe('helper functions', () => {
    it('exhaustCPU should create and run experiment', async () => {
      const result = await exhaustCPU('test-service', 80, 1);
      
      expect(result).toHaveProperty('success');
      expect(result.data.config.resourceType).toBe('cpu');
    });

    it('exhaustMemory should create and run experiment', async () => {
      const result = await exhaustMemory('test-service', 80, 1);
      
      expect(result).toHaveProperty('success');
      expect(result.data.config.resourceType).toBe('memory');
    });
  });
});
