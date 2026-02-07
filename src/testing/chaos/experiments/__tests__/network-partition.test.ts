/**
 * Network Partition Chaos Experiment Tests
 */

import { NetworkPartitionExperiment, partitionServices } from '../network-partition';
import { createDefaultContext } from '../../runner';

describe('NetworkPartitionExperiment', () => {
  const mockContext = createDefaultContext(
    async () => ({ 
      healthy: true, 
      services: { 'agent-service': { healthy: true } } 
    }),
    async () => ({ consistent: true })
  );

  describe('validation', () => {
    it('should validate duration > 0', () => {
      const exp = new NetworkPartitionExperiment({
        isolatedServices: ['service-a'],
        duration: 0,
        direction: 'both',
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Duration must be at least 1 second');
    });

    it('should require at least one isolated service', () => {
      const exp = new NetworkPartitionExperiment({
        isolatedServices: [],
        duration: 30,
        direction: 'both',
      });
      
      const errors = exp.validate();
      expect(errors).toContain('At least one service must be specified for isolation');
    });

    it('should validate packet loss percentage', () => {
      const exp = new NetworkPartitionExperiment({
        isolatedServices: ['service-a'],
        duration: 30,
        direction: 'both',
        packetLossPercentage: 150,
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Packet loss percentage must be between 0 and 100');
    });

    it('should pass validation with valid config', () => {
      const exp = new NetworkPartitionExperiment({
        isolatedServices: ['service-a', 'service-b'],
        duration: 30,
        direction: 'both',
        packetLossPercentage: 50,
      });
      
      const errors = exp.validate();
      expect(errors).toHaveLength(0);
    });
  });

  describe('execution', () => {
    it('should fail validation before running', async () => {
      const exp = new NetworkPartitionExperiment({
        isolatedServices: [],
        duration: 30,
        direction: 'both',
      });

      const result = await exp.run(mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should emit start event', async () => {
      const exp = new NetworkPartitionExperiment({
        isolatedServices: ['service-a'],
        duration: 1,
        direction: 'both',
      });

      const startSpy = jest.fn();
      exp.on('start', startSpy);

      await exp.run(mockContext);

      expect(startSpy).toHaveBeenCalled();
    });

    it('should emit complete event', async () => {
      const exp = new NetworkPartitionExperiment({
        isolatedServices: ['service-a'],
        duration: 1,
        direction: 'both',
        autoHeal: true,
      });

      const completeSpy = jest.fn();
      exp.on('complete', completeSpy);

      await exp.run(mockContext);

      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('helper functions', () => {
    it('partitionServices should create and run experiment', async () => {
      const result = await partitionServices('service-a', 'service-b', 1);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
    });
  });
});
