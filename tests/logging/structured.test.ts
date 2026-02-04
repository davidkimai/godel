/**
 * Tests for Structured Logging Module
 */

import {
  StructuredLogger,
  LogLevel,
  LogLevelNames,
  createAgentLogger,
  createRequestLogger,
  createWorkflowLogger,
  withContext,
  ErrorPatternDetector,
  DEFAULT_ERROR_PATTERNS,
  LogMetricsCollector,
  getLogger,
  setGlobalLogger
} from '../../src/logging';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let consoleSpy: jest.SpyInstance;
  
  beforeEach(() => {
    logger = new StructuredLogger({
      service: 'test-service',
      level: LogLevel.DEBUG,
      enableConsole: true,
      prettyPrint: false,
      addSource: false
    });
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });
  
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Log Levels', () => {
    it('should log debug messages', () => {
      logger.debug('Debug message', { key: 'value' });
      expect(consoleSpy).toHaveBeenCalled();
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.level).toBe('DEBUG');
      expect(output.message).toBe('Debug message');
      expect(output.metadata).toEqual({ key: 'value' });
    });
    
    it('should log info messages', () => {
      logger.info('Info message');
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.level).toBe('INFO');
      expect(output.message).toBe('Info message');
    });
    
    it('should log warn messages', () => {
      logger.warn('Warning message');
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.level).toBe('WARN');
    });
    
    it('should log error messages', () => {
      const error = new Error('Test error');
      logger.error('Error message', error);
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.level).toBe('ERROR');
      expect(output.error).toBeDefined();
      expect(output.error.message).toBe('Test error');
    });
    
    it('should log fatal messages', () => {
      const error = new Error('Fatal error');
      logger.fatal('Fatal message', error);
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.level).toBe('FATAL');
    });
  });

  describe('Log Level Filtering', () => {
    it('should filter messages below configured level', () => {
      const filteredLogger = new StructuredLogger({
        service: 'test',
        level: LogLevel.ERROR,
        enableConsole: true,
        addSource: false
      });
      
      filteredLogger.debug('Debug');
      filteredLogger.info('Info');
      filteredLogger.warn('Warn');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      filteredLogger.error('Error');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Context Management', () => {
    it('should set context fields', () => {
      logger.setContext({ agentId: 'agent-123', swarmId: 'swarm-456' });
      logger.info('Test');
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.agent_id).toBe('agent-123');
      expect(output.swarm_id).toBe('swarm-456');
    });
    
    it('should create child logger with context', () => {
      const child = logger.child({ agentId: 'child-agent' });
      child.info('Child message');
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.agent_id).toBe('child-agent');
    });
    
    it('should clear context', () => {
      logger.setContext({ agentId: 'test' });
      logger.clearContext();
      logger.info('Test');
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.agent_id).toBeUndefined();
    });
  });

  describe('Trace Context', () => {
    it('should create trace ID', () => {
      const traceId = logger.startTrace();
      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe('string');
    });
    
    it('should use custom trace ID', () => {
      const traceId = logger.startTrace('custom-trace');
      expect(traceId).toBe('custom-trace');
      
      logger.info('Test');
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.trace_id).toBe('custom-trace');
    });
    
    it('should manage spans', () => {
      logger.startTrace();
      const spanId = logger.startSpan('test-span');
      expect(spanId).toBeDefined();
      
      logger.info('In span');
      let output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.span_id).toBe(spanId);
      
      logger.endSpan();
      logger.info('After span');
      output = JSON.parse(consoleSpy.mock.calls[1][0]);
      expect(output.span_id).not.toBe(spanId);
    });
  });

  describe('Duration Logging', () => {
    it('should log with duration', () => {
      logger.logDuration(LogLevel.INFO, 'Operation', 150, { op: 'test' });
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.duration_ms).toBe(150);
      expect(output.metadata.op).toBe('test');
    });
    
    it('should time async functions', async () => {
      const result = await logger.time(
        LogLevel.INFO,
        'Async op',
        async () => {
          await new Promise(r => setTimeout(r, 10));
          return 'result';
        }
      );
      
      expect(result).toBe('result');
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.message).toBe('Async op');
      expect(output.duration_ms).toBeGreaterThanOrEqual(10);
    });
    
    it('should handle errors in timed functions', async () => {
      await expect(
        logger.time(LogLevel.INFO, 'Failing op', async () => {
          throw new Error('Failed');
        })
      ).rejects.toThrow('Failed');
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.metadata.success).toBe(false);
    });
  });

  describe('Sensitive Data Redaction', () => {
    it('should redact sensitive fields', () => {
      logger.info('Test', {
        username: 'test',
        password: 'secret123',
        api_key: 'key123',
        nested: { secret: 'value' }
      });
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.metadata.password).toBe('[REDACTED]');
      expect(output.metadata.api_key).toBe('[REDACTED]');
      expect(output.metadata.nested.secret).toBe('[REDACTED]');
      expect(output.metadata.username).toBe('test');
    });
  });

  describe('Log Format', () => {
    it('should include standard fields', () => {
      logger.info('Test message');
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.timestamp).toBeDefined();
      expect(output.level).toBe('INFO');
      expect(output.levelCode).toBe(1);
      expect(output.service).toBe('test-service');
      expect(output.message).toBe('Test message');
    });
    
    it('should include ISO timestamp', () => {
      logger.info('Test');
      
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      const date = new Date(output.timestamp);
      expect(date.toISOString()).toBe(output.timestamp);
    });
  });
});

describe('Factory Functions', () => {
  let consoleSpy: jest.SpyInstance;
  
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setGlobalLogger(new StructuredLogger({
      level: LogLevel.INFO,
      enableConsole: true,
      addSource: false
    }));
  });
  
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should create agent logger', () => {
    const agentLogger = createAgentLogger('agent-123', 'swarm-456');
    agentLogger.info('Test');
    
    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.agent_id).toBe('agent-123');
    expect(output.swarm_id).toBe('swarm-456');
  });
  
  it('should create request logger', () => {
    const requestLogger = createRequestLogger('req-abc', 'user-xyz');
    requestLogger.info('Test');
    
    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.request_id).toBe('req-abc');
    expect(output.user_id).toBe('user-xyz');
  });
  
  it('should create workflow logger', () => {
    const workflowLogger = createWorkflowLogger('wf-123', 'task-456');
    workflowLogger.info('Test');
    
    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.workflow_id).toBe('wf-123');
    expect(output.task_id).toBe('task-456');
  });
  
  it('should run with context', async () => {
    await withContext({ traceId: 'trace-123' }, async (logger) => {
      logger.info('In context');
    });
    
    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.trace_id).toBe('trace-123');
  });
});

describe('ErrorPatternDetector', () => {
  const detector = new ErrorPatternDetector();

  it('should detect connection refused errors', () => {
    const pattern = detector.detect('Connection refused: localhost:5432');
    expect(pattern).not.toBeNull();
    expect(pattern?.name).toBe('ConnectionRefused');
    expect(pattern?.severity).toBe('high');
  });
  
  it('should detect timeout errors', () => {
    const pattern = detector.detect('Request ETIMEDOUT');
    expect(pattern?.name).toBe('Timeout');
  });
  
  it('should detect memory errors', () => {
    const pattern = detector.detect('Out of memory: process killed');
    expect(pattern?.name).toBe('OutOfMemory');
    expect(pattern?.severity).toBe('critical');
  });
  
  it('should detect database errors', () => {
    const pattern = detector.detect('pg_query failed: syntax error');
    expect(pattern?.name).toBe('DatabaseError');
  });
  
  it('should return null for unknown errors', () => {
    const pattern = detector.detect('Some random error');
    expect(pattern).toBeNull();
  });
  
  it('should add custom patterns', () => {
    detector.addPattern({
      pattern: /custom.*pattern/i,
      name: 'CustomPattern',
      severity: 'medium',
      category: 'custom',
      description: 'Custom test pattern'
    });
    
    const pattern = detector.detect('Custom pattern detected');
    expect(pattern?.name).toBe('CustomPattern');
  });
  
  it('should analyze log entries', () => {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      levelCode: 3,
      service: 'test',
      message: 'Connection refused',
      error: {
        name: 'Error',
        message: 'ECONNREFUSED'
      },
      source: {}
    };
    
    const analysis = detector.analyzeLogEntry(entry);
    expect(analysis.matched).toBe(true);
    expect(analysis.pattern?.name).toBe('ConnectionRefused');
  });
});

describe('LogMetricsCollector', () => {
  it('should collect metrics', () => {
    const collector = new LogMetricsCollector(60000);
    
    collector.record({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      levelCode: 1,
      service: 'test',
      message: 'Info message',
      source: {}
    });
    
    collector.record({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      levelCode: 3,
      service: 'test',
      message: 'Error message',
      source: {}
    });
    
    const metrics = collector.getMetrics();
    expect(metrics.totalLogs).toBe(2);
    expect(metrics.logsByLevel.INFO).toBe(1);
    expect(metrics.logsByLevel.ERROR).toBe(1);
    expect(metrics.errorCount).toBe(1);
    expect(metrics.errorRate).toBe(0.5);
  });
  
  it('should alert on high error rate', () => {
    const collector = new LogMetricsCollector(60000);
    
    // Add 10 errors out of 10 logs
    for (let i = 0; i < 10; i++) {
      collector.record({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        levelCode: 3,
        service: 'test',
        message: 'Error',
        source: {}
      });
    }
    
    expect(collector.shouldAlert(0.5)).toBe(true);
    expect(collector.shouldAlert(0.9)).toBe(false);
  });
  
  it('should reset metrics after window', () => {
    jest.useFakeTimers();
    
    const collector = new LogMetricsCollector(1000);
    
    collector.record({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      levelCode: 1,
      service: 'test',
      message: 'Test',
      source: {}
    });
    
    expect(collector.getMetrics().totalLogs).toBe(1);
    
    // Advance past window
    jest.advanceTimersByTime(2000);
    
    collector.record({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      levelCode: 1,
      service: 'test',
      message: 'Test',
      source: {}
    });
    
    // Should be reset, so only 1 log
    expect(collector.getMetrics().totalLogs).toBe(1);
    
    jest.useRealTimers();
  });
});

describe('LogLevelNames', () => {
  it('should map levels to names', () => {
    expect(LogLevelNames[LogLevel.DEBUG]).toBe('DEBUG');
    expect(LogLevelNames[LogLevel.INFO]).toBe('INFO');
    expect(LogLevelNames[LogLevel.WARN]).toBe('WARN');
    expect(LogLevelNames[LogLevel.ERROR]).toBe('ERROR');
    expect(LogLevelNames[LogLevel.FATAL]).toBe('FATAL');
  });
});

describe('DEFAULT_ERROR_PATTERNS', () => {
  it('should have all expected patterns', () => {
    const names = DEFAULT_ERROR_PATTERNS.map(p => p.name);
    expect(names).toContain('ConnectionRefused');
    expect(names).toContain('Timeout');
    expect(names).toContain('OutOfMemory');
    expect(names).toContain('DatabaseError');
    expect(names).toContain('AuthError');
    expect(names).toContain('RateLimit');
    expect(names).toContain('AgentError');
    expect(names).toContain('WorkflowError');
  });
});
