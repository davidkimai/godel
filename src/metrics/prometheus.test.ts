/**
 * Tests for Prometheus Metrics Module
 */

import { PrometheusMetrics, getGlobalPrometheusMetrics, resetGlobalPrometheusMetrics, register } from './prometheus';
import { AgentEventBus } from '../core/event-bus';
import { TeamOrchestrator } from '../core/team-orchestrator';

// Mock dependencies
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('PrometheusMetrics', () => {
  let metrics: PrometheusMetrics;
  let mockEventBus: jest.Mocked<AgentEventBus>;
  let mockOrchestrator: jest.Mocked<TeamOrchestrator>;

  beforeEach(() => {
    // Clear the registry before each test
    register.clear();
    resetGlobalPrometheusMetrics();
    metrics = new PrometheusMetrics();
    
    mockEventBus = {
      subscribeAll: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({
        eventsEmitted: 100,
        eventsDelivered: 95,
        subscriptionsCreated: 10,
        subscriptionsRemoved: 2,
      }),
    } as unknown as jest.Mocked<AgentEventBus>;

    mockOrchestrator = {
      listActiveTeams: jest.fn().mockReturnValue([]),
      getTeamAgents: jest.fn().mockReturnValue([]),
      getStatus: jest.fn(),
    } as unknown as jest.Mocked<TeamOrchestrator>;
  });

  afterEach(() => {
    metrics.stop();
    resetGlobalPrometheusMetrics();
  });

  describe('initialization', () => {
    it('should initialize with event bus and orchestrator', () => {
      metrics.initialize(mockEventBus, mockOrchestrator);
      expect(mockEventBus.subscribeAll).toHaveBeenCalled();
    });

    it('should start periodic collection', () => {
      jest.useFakeTimers();
      metrics.initialize(mockEventBus, mockOrchestrator);
      
      // Fast-forward past first collection
      jest.advanceTimersByTime(20000);
      
      expect(mockOrchestrator.listActiveTeams).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('agent metrics', () => {
    it('should set active agents gauge without error', () => {
      expect(() => metrics.agentActiveGauge.set({ team_id: 'test-team' }, 5)).not.toThrow();
    });

    it('should increment agent failure counter without error', () => {
      expect(() => metrics.recordAgentFailure('test-team', 'timeout')).not.toThrow();
    });
  });

  describe('team metrics', () => {
    it('should set team cost gauge without error', () => {
      expect(() => metrics.swarmCostGauge.set({ team_id: 'test-team', currency: 'usd' }, 25.50)).not.toThrow();
    });

    it('should increment team success counter without error', () => {
      expect(() => metrics.swarmSuccessCounter.inc({ strategy: 'parallel' })).not.toThrow();
    });

    it('should record team failure without error', () => {
      expect(() => metrics.recordTeamFailure('test-team', 'pipeline', 'error')).not.toThrow();
    });
  });

  describe('event metrics', () => {
    it('should record dropped event without error', () => {
      expect(() => metrics.recordDroppedEvent('buffer_full')).not.toThrow();
    });
  });

  describe('API metrics', () => {
    it('should record API request without error', () => {
      expect(() => metrics.recordApiRequest('GET', '/api/teams', 200, 150)).not.toThrow();
      expect(() => metrics.recordApiRequest('POST', '/api/teams', 500, 5000)).not.toThrow();
    });
  });

  describe('system metrics', () => {
    it('should set WebSocket connections without error', () => {
      expect(() => metrics.setWebSocketConnections(10)).not.toThrow();
    });

    it('should set event bus subscriptions without error', () => {
      expect(() => metrics.setEventBusSubscriptions(5)).not.toThrow();
    });
  });

  describe('metrics export', () => {
    it('should return metrics in Prometheus format', async () => {
      const output = await metrics.getMetrics();
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should return correct content type', () => {
      expect(metrics.getContentType()).toBe('text/plain; version=0.0.4; charset=utf-8');
    });
  });

  describe('singleton', () => {
    it('should return same instance from getGlobalPrometheusMetrics', () => {
      register.clear();
      resetGlobalPrometheusMetrics();
      const instance1 = getGlobalPrometheusMetrics();
      const instance2 = getGlobalPrometheusMetrics();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      register.clear();
      resetGlobalPrometheusMetrics();
      const instance1 = getGlobalPrometheusMetrics();
      register.clear();
      resetGlobalPrometheusMetrics();
      const instance2 = getGlobalPrometheusMetrics();
      expect(instance1).not.toBe(instance2);
    });
  });
});
