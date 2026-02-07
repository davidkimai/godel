/**
 * Maintenance Team Orchestrator Tests
 */

import { MaintenanceTeamOrchestrator } from '../orchestrator';
import { AgentEventBus } from '../../core/event-bus';
import {
  ErrorEvent,
  ErrorListenerService,
  TestWriterAgent,
  PatchAgent,
  PRAgent,
  TestResult,
  PatchResult,
  PRResult,
} from '../types';

// Mock services
const mockErrorListener: jest.Mocked<ErrorListenerService> = {
  eventBus: {} as AgentEventBus,
  getUnprocessedErrors: jest.fn().mockReturnValue([]),
  getProcessingErrors: jest.fn().mockReturnValue([]),
  getResolvedErrors: jest.fn().mockReturnValue([]),
  isAutoFixable: jest.fn().mockReturnValue(false),
  markAsProcessing: jest.fn().mockResolvedValue(undefined),
  markAsResolved: jest.fn().mockResolvedValue(undefined),
  markAsFailed: jest.fn().mockResolvedValue(undefined),
  dispose: jest.fn(),
};

const mockTestWriter: jest.Mocked<TestWriterAgent> = {
  generateReproductionTest: jest.fn(),
};

const mockPatchAgent: jest.Mocked<PatchAgent> = {
  generateFix: jest.fn(),
};

const mockPRAgent: jest.Mocked<PRAgent> = {
  submitFix: jest.fn(),
};

describe('MaintenanceTeamOrchestrator', () => {
  let eventBus: AgentEventBus;
  let orchestrator: MaintenanceTeamOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = new AgentEventBus();
    
    orchestrator = new MaintenanceTeamOrchestrator({
      eventBus,
      errorListener: mockErrorListener,
      testWriter: mockTestWriter,
      patchAgent: mockPatchAgent,
      prAgent: mockPRAgent,
    });
  });

  afterEach(() => {
    orchestrator.stop();
  });

  describe('Lifecycle', () => {
    it('should start the orchestrator', async () => {
      mockErrorListener.getUnprocessedErrors.mockReturnValue([]);
      
      await orchestrator.start();
      
      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should stop the orchestrator', async () => {
      mockErrorListener.getUnprocessedErrors.mockReturnValue([]);
      
      await orchestrator.start();
      orchestrator.stop();
      
      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should pause the orchestrator', async () => {
      mockErrorListener.getUnprocessedErrors.mockReturnValue([]);
      
      await orchestrator.start();
      orchestrator.pause();
      
      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should resume the orchestrator', async () => {
      mockErrorListener.getUnprocessedErrors.mockReturnValue([]);
      
      await orchestrator.start();
      orchestrator.pause();
      orchestrator.resume();
      
      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('Status Reporting', () => {
    it('should report error counts', () => {
      mockErrorListener.getUnprocessedErrors.mockReturnValue([
        { id: '1' },
        { id: '2' },
      ] as ErrorEvent[]);
      mockErrorListener.getProcessingErrors.mockReturnValue([
        { id: '3' },
      ] as ErrorEvent[]);
      mockErrorListener.getResolvedErrors.mockReturnValue([
        { id: '4' },
        { id: '5' },
        { id: '6' },
      ] as ErrorEvent[]);
      mockErrorListener.isAutoFixable.mockReturnValue(true);

      const status = orchestrator.getStatus();

      expect(status.unprocessedErrors).toBe(2);
      expect(status.processingErrors).toBe(1);
      expect(status.resolvedErrors).toBe(3);
      expect(status.autoFixableErrors).toBe(2);
    });
  });

  describe('Error Processing', () => {
    const mockError: ErrorEvent = {
      id: 'err-123',
      timestamp: Date.now(),
      source: 'test.ts',
      errorType: 'TypeError',
      message: 'Cannot read property of undefined',
      stackTrace: 'at test (test.ts:1:1)',
      context: {},
      severity: 'medium',
      reproducible: true,
    };

    const mockTestResult: TestResult = {
      testCode: 'test code',
      testFile: 'test.test.ts',
      reproducesError: true,
    };

    const mockPatchResult: PatchResult = {
      id: 'patch-1',
      errorId: 'err-123',
      fileChanges: [],
      description: 'Fixed bug',
      testPasses: true,
    };

    const mockPRResult: PRResult = {
      prNumber: 1,
      prUrl: 'https://github.com/test/pr/1',
      branch: 'autonomic/fix-err-123',
    };

    beforeEach(() => {
      mockErrorListener.getUnprocessedErrors.mockReturnValue([mockError]);
      mockErrorListener.isAutoFixable.mockReturnValue(true);
      mockTestWriter.generateReproductionTest.mockResolvedValue(mockTestResult);
      mockPatchAgent.generateFix.mockResolvedValue(mockPatchResult);
      mockPRAgent.submitFix.mockResolvedValue(mockPRResult);
    });

    it('should process an error through the full pipeline', async () => {
      await orchestrator.processError('err-123');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockErrorListener.markAsProcessing).toHaveBeenCalledWith('err-123');
      expect(mockTestWriter.generateReproductionTest).toHaveBeenCalled();
      expect(mockPatchAgent.generateFix).toHaveBeenCalled();
      expect(mockPRAgent.submitFix).toHaveBeenCalled();
      expect(mockErrorListener.markAsResolved).toHaveBeenCalled();
    });

    it('should not process non-auto-fixable errors', async () => {
      mockErrorListener.isAutoFixable.mockReturnValue(false);

      const result = await orchestrator.processError('err-123');

      expect(result).toBeUndefined();
      expect(mockTestWriter.generateReproductionTest).not.toHaveBeenCalled();
    });

    it('should track job status', async () => {
      const jobPromise = orchestrator.processError('err-123');
      
      // Job should be created immediately
      const jobs = orchestrator.getJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].errorId).toBe('err-123');

      await jobPromise;
    });

    it('should handle pipeline failures', async () => {
      mockTestWriter.generateReproductionTest.mockRejectedValue(new Error('Test generation failed'));

      await orchestrator.processError('err-123');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockErrorListener.markAsFailed).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      orchestrator.configure({
        pollIntervalMs: 10000,
        maxConcurrentJobs: 5,
      });

      const config = orchestrator.getConfig();
      expect(config.pollIntervalMs).toBe(10000);
      expect(config.maxConcurrentJobs).toBe(5);
    });
  });
});
