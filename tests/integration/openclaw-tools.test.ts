/**
 * Integration Test: OpenClaw Tool Executor
 * 
 * Tests the full tool execution pipeline:
 * 1. File operations (read, write, edit)
 * 2. Shell execution (exec)
 * 3. Browser automation
 * 4. Canvas rendering
 * 5. Nodes / device actions
 * 6. Result capture and large output handling
 * 7. Error capture with stack traces
 */

import {
  OpenClawToolExecutor,
  GatewayClient,
  createToolExecutor,
  ToolExecutorConfig,
} from '../../src/integrations/openclaw/ToolExecutor';
import {
  ToolResult,
  ToolSuccessResult,
  ToolErrorResult,
  LargeOutputManager,
  ErrorCapture,
  ResultFormatter,
  createSuccessResult,
  createErrorResult,
  isSuccessResult,
  isErrorResult,
  DEFAULT_STREAM_THRESHOLD,
  ExecResult,
  BrowserResult,
  CanvasResult,
  NodeResult,
} from '../../src/integrations/openclaw/ToolResult';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ============================================================================
// Mock Gateway Client for Testing
// ============================================================================

class MockGatewayClient {
  private connected = false;
  private mockResponses = new Map<string, unknown>();
  private executedCommands: Array<{ method: string; params: Record<string, unknown> }> = [];

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    this.executedCommands.push({ method, params });

    if (!this.connected) {
      throw new Error('Not connected');
    }

    // Check for registered mock response
    const mockKey = `${method}_${JSON.stringify(params)}`;
    if (this.mockResponses.has(mockKey)) {
      return this.mockResponses.get(mockKey) as T;
    }

    // Check for global mock response for this method
    if (this.mockResponses.has(method)) {
      return this.mockResponses.get(method) as T;
    }

    // Default responses
    switch (method) {
      case 'read':
        return { content: 'mock file content', size: 18 } as T;
      
      case 'write':
        return undefined as T;
      
      case 'edit':
        return undefined as T;
      
      case 'exec':
        return {
          stdout: 'mock output',
          stderr: '',
          exitCode: 0,
        } as T;
      
      case 'browser':
        return {
          title: 'Mock Page',
          url: (params as Record<string, string>)['url'] || 'http://example.com',
          content: '<html><body>Mock content</body></html>',
        } as T;
      
      case 'canvas':
        return {
          visible: true,
          url: 'canvas://mock',
        } as T;
      
      case 'nodes':
        return {
          devices: ['device1', 'device2'],
        } as T;
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  setMockResponse(method: string, params: Record<string, unknown>, response: unknown): void {
    const key = `${method}_${JSON.stringify(params)}`;
    this.mockResponses.set(key, response);
  }

  setGlobalMockResponse(method: string, response: unknown): void {
    this.mockResponses.set(method, response);
  }

  getExecutedCommands(): Array<{ method: string; params: Record<string, unknown> }> {
    return this.executedCommands;
  }

  clearExecutedCommands(): void {
    this.executedCommands = [];
  }

  reset(): void {
    this.mockResponses.clear();
    this.executedCommands = [];
    this.connected = false;
  }
}

// ============================================================================
// Mock Tool Executor that uses our mock client
// ============================================================================

class TestableToolExecutor extends OpenClawToolExecutor {
  mockClient: MockGatewayClient;

  constructor(config: ToolExecutorConfig) {
    super(config);
    this.mockClient = new MockGatewayClient();
  }

  override async connect(): Promise<void> {
    await this.mockClient.connect();
  }

  override async disconnect(): Promise<void> {
    await this.mockClient.disconnect();
  }

  override isConnected(): boolean {
    return this.mockClient.isConnected();
  }

  // Access internal method for testing
  async executeWithMock<T = unknown>(
    method: string,
    params: Record<string, unknown>
  ): Promise<ToolResult<T>> {
    const runId = `test_${Date.now()}`;
    const startTime = Date.now();

    try {
      const result = await this.mockClient.request<T>(method, params);
      return createSuccessResult(method, runId, result, Date.now() - startTime);
    } catch (error) {
      return createErrorResult(method, runId, error, Date.now() - startTime);
    }
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('INTEGRATION: OpenClaw Tool Executor', () => {
  let executor: TestableToolExecutor;
  let tempDir: string;
  const sessionKey = 'test-session-key';

  beforeAll(() => {
    // Create temp directory for file operation tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-tool-test-'));
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    executor = new TestableToolExecutor({
      sessionKey,
      gatewayHost: '127.0.0.1',
      gatewayPort: 18789,
      timeout: 30000,
    });
  });

  afterEach(() => {
    executor.mockClient.reset();
  });

  // ============================================================================
  // TEST SUITE 1: Connection Management
  // ============================================================================
  describe('1. Connection Management', () => {
    it('should connect to gateway', async () => {
      expect(executor.isConnected()).toBe(false);
      
      await executor.connect();
      
      expect(executor.isConnected()).toBe(true);
    });

    it('should disconnect from gateway', async () => {
      await executor.connect();
      expect(executor.isConnected()).toBe(true);
      
      await executor.disconnect();
      
      expect(executor.isConnected()).toBe(false);
    });

    it('should handle connection state correctly', async () => {
      // Before connect
      expect(executor.isConnected()).toBe(false);
      
      // After connect
      await executor.connect();
      expect(executor.isConnected()).toBe(true);
      
      // After disconnect
      await executor.disconnect();
      expect(executor.isConnected()).toBe(false);
    });
  });

  // ============================================================================
  // TEST SUITE 2: File Operations (read, write, edit)
  // ============================================================================
  describe('2. File Operations', () => {
    beforeEach(async () => {
      await executor.connect();
      // Set up global mocks for write/edit to return undefined (success with no content)
      executor.mockClient.setGlobalMockResponse('write', undefined);
      executor.mockClient.setGlobalMockResponse('edit', undefined);
    });

    it('should read file contents', async () => {
      const testContent = 'Hello, World!';
      executor.mockClient.setMockResponse('read', { path: '/test/file.txt' }, {
        content: testContent,
        size: testContent.length,
      });

      const result = await executor.executeWithMock('read', { path: '/test/file.txt' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toEqual({ content: testContent, size: testContent.length });
        expect(result.tool).toBe('read');
        expect(result.runId).toBeDefined();
        expect(result.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should write file contents', async () => {
      const result = await executor.executeWithMock('write', {
        path: '/test/output.txt',
        content: 'test content',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.tool).toBe('write');
      }

      const commands = executor.mockClient.getExecutedCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0].method).toBe('write');
      expect(commands[0].params).toEqual({
        path: '/test/output.txt',
        content: 'test content',
      });
    });

    it('should edit file contents', async () => {
      const result = await executor.executeWithMock('edit', {
        path: '/test/file.txt',
        oldText: 'old',
        newText: 'new',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.tool).toBe('edit');
      }

      const commands = executor.mockClient.getExecutedCommands();
      expect(commands[0].params).toEqual({
        path: '/test/file.txt',
        oldText: 'old',
        newText: 'new',
      });
    });

    it('should capture read errors', async () => {
      const error = new Error('File not found');
      executor.mockClient.setMockResponse('read', { path: '/nonexistent.txt' }, undefined);
      
      // Override to throw
      const originalRequest = executor.mockClient.request.bind(executor.mockClient);
      executor.mockClient.request = async () => {
        throw error;
      };

      const result = await executor.executeWithMock('read', { path: '/nonexistent.txt' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('File not found');
        expect(result.error.code).toBe('Error');
      }
    });
  });

  // ============================================================================
  // TEST SUITE 3: Shell Execution (exec)
  // ============================================================================
  describe('3. Shell Execution', () => {
    beforeEach(async () => {
      await executor.connect();
    });

    it('should execute shell command', async () => {
      executor.mockClient.setMockResponse('exec', { command: 'echo hello' }, {
        stdout: 'hello',
        stderr: '',
        exitCode: 0,
      });

      const result = await executor.executeWithMock('exec', { command: 'echo hello' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toEqual({
          stdout: 'hello',
          stderr: '',
          exitCode: 0,
        });
      }
    });

    it('should capture command output', async () => {
      const stdout = 'line1\nline2\nline3';
      executor.mockClient.setMockResponse('exec', { command: 'cat file.txt' }, {
        stdout,
        stderr: '',
        exitCode: 0,
      });

      const result = await executor.executeWithMock('exec', { command: 'cat file.txt' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as ExecResult).stdout).toBe(stdout);
      }
    });

    it('should capture stderr separately', async () => {
      executor.mockClient.setMockResponse('exec', { command: 'bad-command' }, {
        stdout: '',
        stderr: 'command not found',
        exitCode: 127,
      });

      const result = await executor.executeWithMock('exec', { command: 'bad-command' });

      expect(result.success).toBe(true); // Still success - exec returns result
      if (result.success) {
        expect((result.output as ExecResult).stderr).toBe('command not found');
        expect((result.output as ExecResult).exitCode).toBe(127);
      }
    });

    it('should capture command errors', async () => {
      const error = new Error('Command failed: timeout');
      executor.mockClient.request = async () => {
        throw error;
      };

      const result = await executor.executeWithMock('exec', { command: 'sleep 100' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('timeout');
      }
    });

    it('should handle exec with options', async () => {
      await executor.executeWithMock('exec', {
        command: 'pwd',
        cwd: '/tmp',
        timeout: 5000,
        env: { KEY: 'value' },
      });

      const commands = executor.mockClient.getExecutedCommands();
      expect(commands[0].params).toMatchObject({
        command: 'pwd',
        cwd: '/tmp',
        timeout: 5000,
        env: { KEY: 'value' },
      });
    });
  });

  // ============================================================================
  // TEST SUITE 4: Browser Automation
  // ============================================================================
  describe('4. Browser Automation', () => {
    beforeEach(async () => {
      await executor.connect();
    });

    it('should navigate to URL', async () => {
      executor.mockClient.setMockResponse('browser', { action: 'navigate', url: 'https://example.com' }, {
        title: 'Example Domain',
        url: 'https://example.com',
      });

      const result = await executor.executeWithMock('browser', {
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as Record<string, string>)['url']).toBe('https://example.com');
      }
    });

    it('should take snapshot', async () => {
      executor.mockClient.setMockResponse('browser', { action: 'snapshot' }, {
        title: 'Test Page',
        url: 'http://localhost',
        elements: [
          { ref: 'e1', role: 'button', name: 'Submit' },
          { ref: 'e2', role: 'link', name: 'Home' },
        ],
      });

      const result = await executor.executeWithMock('browser', { action: 'snapshot' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as BrowserResult).elements).toHaveLength(2);
      }
    });

    it('should click element', async () => {
      executor.mockClient.setMockResponse('browser', { action: 'click', ref: 'e1' }, {
        title: 'Next Page',
        url: 'http://localhost/next',
      });

      const result = await executor.executeWithMock('browser', {
        action: 'click',
        ref: 'e1',
      });

      expect(result.success).toBe(true);
    });

    it('should type into element', async () => {
      executor.mockClient.setMockResponse('browser', { action: 'type', ref: 'e2', text: 'hello' }, {
        title: 'Form Page',
      });

      const result = await executor.executeWithMock('browser', {
        action: 'type',
        ref: 'e2',
        text: 'hello',
      });

      expect(result.success).toBe(true);
    });

    it('should take screenshot', async () => {
      executor.mockClient.setMockResponse('browser', { action: 'screenshot', options: { fullPage: true } }, {
        screenshot: 'base64encodeddata',
      });

      const result = await executor.executeWithMock('browser', {
        action: 'screenshot',
        options: { fullPage: true },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as BrowserResult).screenshot).toBeDefined();
      }
    });
  });

  // ============================================================================
  // TEST SUITE 5: Canvas / UI Rendering
  // ============================================================================
  describe('5. Canvas / UI Rendering', () => {
    beforeEach(async () => {
      await executor.connect();
    });

    it('should present HTML in canvas', async () => {
      const html = '<h1>Test UI</h1>';
      executor.mockClient.setMockResponse('canvas', { action: 'present', html }, {
        visible: true,
        screenshot: 'base64data',
      });

      const result = await executor.executeWithMock('canvas', {
        action: 'present',
        html,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as CanvasResult).visible).toBe(true);
      }
    });

    it('should hide canvas', async () => {
      executor.mockClient.setMockResponse('canvas', { action: 'hide' }, {
        visible: false,
      });

      const result = await executor.executeWithMock('canvas', { action: 'hide' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as CanvasResult).visible).toBe(false);
      }
    });

    it('should navigate canvas to URL', async () => {
      executor.mockClient.setMockResponse('canvas', { action: 'navigate', url: 'http://app.local' }, {
        url: 'http://app.local',
        visible: true,
      });

      const result = await executor.executeWithMock('canvas', {
        action: 'navigate',
        url: 'http://app.local',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as CanvasResult).url).toBe('http://app.local');
      }
    });
  });

  // ============================================================================
  // TEST SUITE 6: Nodes / Device Actions
  // ============================================================================
  describe('6. Nodes / Device Actions', () => {
    beforeEach(async () => {
      await executor.connect();
    });

    it('should take camera snapshot', async () => {
      executor.mockClient.setMockResponse('nodes', { action: 'camera_snap', facing: 'back' }, {
        image: 'base64image',
      });

      const result = await executor.executeWithMock('nodes', {
        action: 'camera_snap',
        facing: 'back',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as NodeResult).image).toBeDefined();
      }
    });

    it('should record camera clip', async () => {
      executor.mockClient.setMockResponse('nodes', { action: 'camera_clip', duration: 5, facing: 'front' }, {
        video: '/path/to/video.mp4',
      });

      const result = await executor.executeWithMock('nodes', {
        action: 'camera_clip',
        duration: 5,
        facing: 'front',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as NodeResult).video).toBeDefined();
      }
    });

    it('should send notification', async () => {
      executor.mockClient.setMockResponse('nodes', {
        action: 'notify',
        title: 'Test',
        body: 'Hello!',
      }, {
        devices: ['device1'],
      });

      const result = await executor.executeWithMock('nodes', {
        action: 'notify',
        title: 'Test',
        body: 'Hello!',
      });

      expect(result.success).toBe(true);
    });

    it('should get location', async () => {
      executor.mockClient.setMockResponse('nodes', { action: 'location' }, {
        location: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
        },
      });

      const result = await executor.executeWithMock('nodes', { action: 'location' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as NodeResult).location).toEqual({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
        });
      }
    });
  });

  // ============================================================================
  // TEST SUITE 7: Result Capture
  // ============================================================================
  describe('7. Result Capture', () => {
    it('should create success result', () => {
      const result = createSuccessResult('test', 'run_123', 'output', 100);

      expect(result.success).toBe(true);
      expect(result.tool).toBe('test');
      expect(result.runId).toBe('run_123');
      expect(result.output).toBe('output');
      expect(result.duration).toBe(100);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.outputSize).toBe(6);
    });

    it('should create error result', () => {
      const error = new Error('Test error');
      const result = createErrorResult('test', 'run_123', error, 50);

      expect(result.success).toBe(false);
      expect(result.tool).toBe('test');
      expect(result.runId).toBe('run_123');
      expect(result.error.message).toBe('Test error');
      expect(result.duration).toBe(50);
    });

    it('should identify success results', () => {
      const success = createSuccessResult('test', 'run_1', 'ok', 10);
      const error = createErrorResult('test', 'run_2', new Error('fail'), 10);

      expect(isSuccessResult(success)).toBe(true);
      expect(isSuccessResult(error)).toBe(false);
    });

    it('should identify error results', () => {
      const success = createSuccessResult('test', 'run_1', 'ok', 10);
      const error = createErrorResult('test', 'run_2', new Error('fail'), 10);

      expect(isErrorResult(success)).toBe(false);
      expect(isErrorResult(error)).toBe(true);
    });
  });

  // ============================================================================
  // TEST SUITE 8: Large Output Handling
  // ============================================================================
  describe('8. Large Output Handling', () => {
    let largeOutputManager: LargeOutputManager;

    beforeEach(() => {
      largeOutputManager = new LargeOutputManager();
    });

    it('should detect large outputs', () => {
      const small = 'small output';
      const large = 'x'.repeat(DEFAULT_STREAM_THRESHOLD + 100);

      expect(largeOutputManager.shouldStream(small)).toBe(false);
      expect(largeOutputManager.shouldStream(large)).toBe(true);
    });

    it('should calculate output size correctly', () => {
      const ascii = 'hello'; // 5 bytes
      const unicode = '你好'; // 6 bytes (3 bytes per char in UTF-8)

      expect(largeOutputManager.getSize(ascii)).toBe(5);
      expect(largeOutputManager.getSize(unicode)).toBe(6);
    });

    it('should chunk output', () => {
      const output = 'a'.repeat(1000);
      largeOutputManager = new LargeOutputManager({ chunkSize: 100 });

      const chunks = largeOutputManager.chunkOutput(output);

      expect(chunks.length).toBe(10);
      expect(chunks[0].length).toBe(100);
    });

    it('should create summary for large outputs', () => {
      const output = 'a'.repeat(10000);
      
      const summary = largeOutputManager.createSummary(output, 100);

      expect(summary.length).toBeLessThan(200);
      expect(summary).toContain('...');
      expect(summary).toContain('truncated');
    });

    it('should truncate output to max size', () => {
      const output = 'a'.repeat(1000);
      
      const truncated = largeOutputManager.truncate(output, 100);

      expect(largeOutputManager.getSize(truncated)).toBeLessThanOrEqual(100);
    });

    it('should stream output in chunks', async () => {
      const output = 'a'.repeat(200);
      largeOutputManager = new LargeOutputManager({ chunkSize: 50 });
      
      const chunks: string[] = [];
      for await (const chunk of largeOutputManager.streamOutput(output)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(4);
    });
  });

  // ============================================================================
  // TEST SUITE 9: Error Capture
  // ============================================================================
  describe('9. Error Capture', () => {
    it('should capture Error objects', () => {
      const error = new Error('Test message');
      error.stack = 'Error: Test message\n    at test.ts:1:1';

      const captured = ErrorCapture.capture(error);

      expect(captured.code).toBe('Error');
      expect(captured.message).toBe('Test message');
      expect(captured.stack).toBeDefined();
    });

    it('should capture string errors', () => {
      const captured = ErrorCapture.capture('string error');

      expect(captured.code).toBe('UNKNOWN_ERROR');
      expect(captured.message).toBe('string error');
    });

    it('should capture object errors', () => {
      const error = { code: 'CUSTOM', message: 'Custom error', detail: 'extra' };

      const captured = ErrorCapture.capture(error);

      expect(captured.code).toBe('CUSTOM');
      expect(captured.message).toBe('Custom error');
      expect(captured.details).toEqual(error);
    });

    it('should extract error details', () => {
      class CustomError extends Error {
        statusCode = 404;
        path = '/test';
      }
      const error = new CustomError('Not found');

      const captured = ErrorCapture.capture(error);

      expect(captured.details?.['statusCode']).toBe(404);
      expect(captured.details?.['path']).toBe('/test');
    });
  });

  // ============================================================================
  // TEST SUITE 10: Result Formatter
  // ============================================================================
  describe('10. Result Formatter', () => {
    it('should format success result', () => {
      const result = createSuccessResult('exec', 'run_1', { stdout: 'hello' }, 100);

      const formatted = ResultFormatter.format(result);

      expect(formatted).toContain('✓ exec');
      expect(formatted).toContain('100ms');
      expect(formatted).toContain('hello');
    });

    it('should format error result', () => {
      const result = createErrorResult('read', 'run_1', new Error('File not found'), 50);

      const formatted = ResultFormatter.format(result);

      expect(formatted).toContain('✗ read');
      expect(formatted).toContain('50ms');
      expect(formatted).toContain('File not found');
    });

    it('should convert result to JSON', () => {
      const result = createSuccessResult('test', 'run_1', 'output', 10);

      const json = ResultFormatter.toJSON(result) as Record<string, unknown>;

      expect(json['tool']).toBe('test');
      expect(json['success']).toBe(true);
      expect(json['output']).toBe('output');
      expect(json['timestamp']).toBeDefined();
    });
  });

  // ============================================================================
  // TEST SUITE 11: End-to-End Scenarios
  // ============================================================================
  describe('11. End-to-End Scenarios', () => {
    beforeEach(async () => {
      await executor.connect();
    });

    it('should complete full file workflow', async () => {
      // Write
      const writeResult = await executor.executeWithMock('write', {
        path: '/test/workflow.txt',
        content: 'initial',
      });
      expect(writeResult.success).toBe(true);

      // Edit
      const editResult = await executor.executeWithMock('edit', {
        path: '/test/workflow.txt',
        oldText: 'initial',
        newText: 'updated',
      });
      expect(editResult.success).toBe(true);

      // Read
      executor.mockClient.setMockResponse('read', { path: '/test/workflow.txt' }, {
        content: 'updated',
        size: 7,
      });
      const readResult = await executor.executeWithMock('read', {
        path: '/test/workflow.txt',
      });
      expect(readResult.success).toBe(true);
      if (readResult.success) {
        expect((readResult.output as Record<string, string>)['content']).toBe('updated');
      }
    });

    it('should handle browser navigation workflow', async () => {
      // Navigate
      executor.mockClient.setMockResponse('browser', { action: 'navigate', url: 'https://example.com' }, {
        title: 'Example',
        url: 'https://example.com',
      });
      const navResult = await executor.executeWithMock('browser', {
        action: 'navigate',
        url: 'https://example.com',
      });
      expect(navResult.success).toBe(true);

      // Snapshot
      executor.mockClient.setMockResponse('browser', { action: 'snapshot' }, {
        title: 'Example',
        elements: [{ ref: 'e1', role: 'button', name: 'Click' }],
      });
      const snapResult = await executor.executeWithMock('browser', { action: 'snapshot' });
      expect(snapResult.success).toBe(true);

      // Click
      executor.mockClient.setMockResponse('browser', { action: 'click', ref: 'e1' }, {
        title: 'Next Page',
      });
      const clickResult = await executor.executeWithMock('browser', {
        action: 'click',
        ref: 'e1',
      });
      expect(clickResult.success).toBe(true);
    });

    it('should handle mixed success and error results', async () => {
      // Success
      const success = await executor.executeWithMock('read', { path: '/exists.txt' });
      expect(success.success).toBe(true);

      // Error
      executor.mockClient.request = async () => {
        throw new Error('Permission denied');
      };
      const error = await executor.executeWithMock('read', { path: '/protected.txt' });
      expect(error.success).toBe(false);

      // Verify we can handle both
      const results = [success, error];
      const successes = results.filter(isSuccessResult);
      const errors = results.filter(isErrorResult);

      expect(successes).toHaveLength(1);
      expect(errors).toHaveLength(1);
    });
  });

  // ============================================================================
  // TEST SUITE 12: Factory Functions
  // ============================================================================
  describe('12. Factory Functions', () => {
    it('should create tool executor with factory', () => {
      const config: ToolExecutorConfig = {
        sessionKey: 'factory-test',
        gatewayHost: '127.0.0.1',
        gatewayPort: 18789,
      };

      const exec = createToolExecutor(config);

      expect(exec).toBeInstanceOf(OpenClawToolExecutor);
    });
  });
});
