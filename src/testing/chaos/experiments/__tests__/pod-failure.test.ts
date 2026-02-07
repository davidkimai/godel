/**
 * Pod Failure Chaos Experiment Tests
 */

import { PodFailureExperiment, terminatePods, cascadingFailure } from '../pod-failure';
import { createDefaultContext } from '../../runner';

describe('PodFailureExperiment', () => {
  const mockContext = createDefaultContext(
    async () => ({ 
      healthy: true, 
      services: {} 
    }),
    async () => ({ consistent: true })
  );

  describe('validation', () => {
    it('should validate pod count > 0', () => {
      const exp = new PodFailureExperiment({
        podCount: 0,
        serviceSelector: 'app=test',
        selectionPattern: 'random',
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Pod count must be at least 1');
    });

    it('should require service selector', () => {
      const exp = new PodFailureExperiment({
        podCount: 1,
        serviceSelector: '',
        selectionPattern: 'random',
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Service selector is required');
    });

    it('should validate grace period >= 0', () => {
      const exp = new PodFailureExperiment({
        podCount: 1,
        serviceSelector: 'app=test',
        gracePeriodSeconds: -1,
        selectionPattern: 'random',
      });
      
      const errors = exp.validate();
      expect(errors).toContain('Grace period must be non-negative');
    });

    it('should pass validation with valid config', () => {
      const exp = new PodFailureExperiment({
        podCount: 3,
        serviceSelector: 'app=test',
        gracePeriodSeconds: 30,
        selectionPattern: 'random',
      });
      
      const errors = exp.validate();
      expect(errors).toHaveLength(0);
    });
  });

  describe('execution', () => {
    it('should track terminated pods', async () => {
      const exp = new PodFailureExperiment({
        podCount: 2,
        serviceSelector: 'app=agent-service',
        selectionPattern: 'random',
      });

      const result = await exp.run(mockContext);
      
      expect(result.data.terminatedPods).toHaveLength(2);
      expect(result.data.terminatedPods[0].status).toBeDefined();
    });

    it('should calculate recovery metrics', async () => {
      const exp = new PodFailureExperiment({
        podCount: 1,
        serviceSelector: 'app=test',
        selectionPattern: 'random',
        autoRestart: true,
      });

      const result = await exp.run(mockContext);
      
      expect(result.data.metrics).toHaveProperty('recoveryTimeAvgMs');
      expect(result.data.metrics).toHaveProperty('recoveryTimeMaxMs');
    });

    it('should assess recovery status', async () => {
      const exp = new PodFailureExperiment({
        podCount: 1,
        serviceSelector: 'app=test',
        selectionPattern: 'random',
      });

      const result = await exp.run(mockContext);
      
      expect(result.data.recovery).toHaveProperty('allPodsRecovered');
      expect(result.data.recovery).toHaveProperty('recoveryTimeMs');
    });
  });

  describe('helper functions', () => {
    it('terminatePods should create and run experiment', async () => {
      const result = await terminatePods('app=test', 1, 'default');
      
      expect(result).toHaveProperty('success');
      expect(result.data).toHaveProperty('metrics');
    });

    it('cascadingFailure should run multiple experiments', async () => {
      const results = await cascadingFailure(['service-a', 'service-b'], 0);
      
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
      });
    });
  });
});
