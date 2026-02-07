/**
 * Structured Logger Tests
 *
 * Tests for correlation ID-aware structured logging.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  createLogger,
  Logger,
  logger as defaultLogger,
} from '../../../src/core/reliability/logger';
import { runWithNewContext } from '../../../src/core/reliability/correlation-context';

describe('Core Reliability: Logger', () => {
  let mockOutput: jest.Mock;
  let logger: Logger;

  beforeEach(() => {
    mockOutput = jest.fn();
    logger = createLogger({
      minLevel: 'debug',
      jsonFormat: true,
      output: mockOutput,
    });
  });

  describe('Log Level Filtering', () => {
    it('should log at debug level', () => {
      logger.debug('debug message');
      expect(mockOutput).toHaveBeenCalled();
    });

    it('should filter below min level', () => {
      const filteredLogger = createLogger({
        minLevel: 'error',
        output: mockOutput,
      });

      filteredLogger.info('info message');
      filteredLogger.warn('warn message');
      expect(mockOutput).not.toHaveBeenCalled();

      filteredLogger.error('error message');
      expect(mockOutput).toHaveBeenCalled();
    });
  });

  describe('Log Levels', () => {
    it('should log debug messages', () => {
      logger.debug('test debug');
      expect(mockOutput.mock.calls[0][0]).toMatchObject({
        level: 'debug',
        message: 'test debug',
      });
    });

    it('should log info messages', () => {
      logger.info('test info');
      expect(mockOutput.mock.calls[0][0]).toMatchObject({
        level: 'info',
        message: 'test info',
      });
    });

    it('should log warn messages', () => {
      logger.warn('test warn');
      expect(mockOutput.mock.calls[0][0]).toMatchObject({
        level: 'warn',
        message: 'test warn',
      });
    });

    it('should log error messages with error object', () => {
      const error = new Error('Test error');
      logger.error('test error', error);

      expect(mockOutput.mock.calls[0][0]).toMatchObject({
        level: 'error',
        message: 'test error',
      });
      expect(mockOutput.mock.calls[0][0].meta?.error).toMatchObject({
        message: 'Test error',
        name: 'Error',
      });
    });

    it('should log fatal messages', () => {
      logger.fatal('test fatal');
      expect(mockOutput.mock.calls[0][0]).toMatchObject({
        level: 'fatal',
        message: 'test fatal',
      });
    });
  });

  describe('Correlation ID Integration', () => {
    it('should include correlation ID from context', async () => {
      const testLogger = createLogger({
        output: mockOutput,
      });

      await runWithNewContext(async () => {
        testLogger.info('with correlation');
      });

      expect(mockOutput.mock.calls[0][0].correlationId).toMatch(/^corr-/);
    });

    it('should include trace ID from context', async () => {
      const testLogger = createLogger({
        output: mockOutput,
      });

      await runWithNewContext(async () => {
        testLogger.info('with trace');
      });

      expect(mockOutput.mock.calls[0][0].traceId).toMatch(/^trace-/);
    });

    it('should not include correlation ID when disabled', async () => {
      const testLogger = createLogger({
        includeCorrelationId: false,
        output: mockOutput,
      });

      await runWithNewContext(async () => {
        testLogger.info('no correlation');
      });

      expect(mockOutput.mock.calls[0][0].correlationId).toBeUndefined();
    });
  });

  describe('Metadata', () => {
    it('should include metadata in logs', () => {
      logger.info('with metadata', { key: 'value', number: 123 });

      expect(mockOutput.mock.calls[0][0].meta).toMatchObject({
        key: 'value',
        number: 123,
      });
    });

    it('should merge default metadata', () => {
      const loggerWithDefaults = createLogger({
        defaultMeta: { service: 'test-service' },
        output: mockOutput,
      });

      loggerWithDefaults.info('test', { extra: 'data' });

      expect(mockOutput.mock.calls[0][0].meta).toMatchObject({
        service: 'test-service',
        extra: 'data',
      });
    });

    it('should allow metadata override in log call', () => {
      const loggerWithDefaults = createLogger({
        defaultMeta: { key: 'default' },
        output: mockOutput,
      });

      loggerWithDefaults.info('test', { key: 'override' });

      expect(mockOutput.mock.calls[0][0].meta?.key).toBe('override');
    });
  });

  describe('Redaction', () => {
    it('should redact sensitive fields', () => {
      logger.info('with secrets', {
        password: 'secret123',
        apiKey: 'key-abc',
        safeField: 'visible',
      });

      expect(mockOutput.mock.calls[0][0].meta).toMatchObject({
        password: '[REDACTED]',
        apiKey: '[REDACTED]',
        safeField: 'visible',
      });
    });

    it('should redact nested sensitive fields', () => {
      logger.info('with nested secrets', {
        user: {
          password: 'secret123',
          name: 'John',
        },
      });

      expect(mockOutput.mock.calls[0][0].meta?.user).toMatchObject({
        password: '[REDACTED]',
        name: 'John',
      });
    });

    it('should allow custom redact fields', () => {
      const customLogger = createLogger({
        redact: ['customField'],
        output: mockOutput,
      });

      customLogger.info('test', {
        customField: 'secret',
        password: 'also-secret',
      });

      expect(mockOutput.mock.calls[0][0].meta?.customField).toBe('[REDACTED]');
      expect(mockOutput.mock.calls[0][0].meta?.password).toBe('[REDACTED]');
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with additional metadata', () => {
      const parent = createLogger({
        defaultMeta: { service: 'api' },
        output: mockOutput,
      });

      const child = parent.child({ component: 'auth' });
      child.info('test');

      expect(mockOutput.mock.calls[0][0].meta).toMatchObject({
        service: 'api',
        component: 'auth',
      });
    });

    it('should create component logger', () => {
      const logger = createLogger({
        output: mockOutput,
      });

      const componentLogger = logger.component('database');
      componentLogger.info('test');

      expect(mockOutput.mock.calls[0][0].meta).toMatchObject({
        component: 'database',
      });
    });
  });

  describe('Error Logging', () => {
    it('should handle Error objects', () => {
      const error = new Error('Test error');
      logger.error('something failed', error);

      const logged = mockOutput.mock.calls[0][0];
      expect(logged.meta?.error).toMatchObject({
        message: 'Test error',
        name: 'Error',
        stack: expect.any(String),
      });
    });

    it('should handle non-Error errors', () => {
      logger.error('something failed', 'string error');

      expect(mockOutput.mock.calls[0][0].meta?.error).toBe('string error');
    });

    it('should handle error with metadata', () => {
      const error = new Error('Test error');
      logger.error('something failed', error, { context: 'extra info' });

      expect(mockOutput.mock.calls[0][0].meta).toMatchObject({
        context: 'extra info',
        error: expect.any(Object),
      });
    });
  });

  describe('Timestamp', () => {
    it('should include timestamp by default', () => {
      logger.info('test');

      const logged = mockOutput.mock.calls[0][0];
      expect(logged.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should not include timestamp when disabled', () => {
      const noTimestampLogger = createLogger({
        includeTimestamp: false,
        output: mockOutput,
      });

      noTimestampLogger.info('test');

      expect(mockOutput.mock.calls[0][0].timestamp).toBe('');
    });
  });

  describe('Default Logger', () => {
    it('should have default logger instance', () => {
      expect(defaultLogger).toBeInstanceOf(Logger);
    });
  });
});
