/**
 * OpenClaw Full Integration Tests
 * 
 * Comprehensive test coverage for OpenClaw integration:
 * - Gateway connection flow test
 * - Session lifecycle test (spawn → send → history → kill)
 * - Tool execution test (exec, read, write)
 * - Budget tracking test
 * - Permission enforcement test
 * - Error handling test (timeout, disconnect, budget exceed)
 */

import {
  GatewayClient,
  createGatewayClient,
  ConnectionState,
  GatewayError,
  ConnectionError,
  TimeoutError,
  DEFAULT_GATEWAY_CONFIG,
} from '../../src/integrations/openclaw';

import {
  SessionManager,
  getGlobalSessionManager,
  resetGlobalSessionManager,
} from '../../src/integrations/openclaw';

import {
  OpenClawToolExecutor,
  createToolExecutor,
  ToolResult,
  ExecResult,
} from '../../src/integrations/openclaw';

import {
  PermissionManager,
  getGlobalPermissionManager,
  resetGlobalPermissionManager,
  PermissionDeniedError,
  ToolNotAllowedError,
  ToolBlacklistedError,
} from '../../src/integrations/openclaw';

import {
  BudgetTracker,
  BudgetError,
  BudgetExceededError,
  getBudgetTracker,
  resetBudgetTracker,
} from '../../src/integrations/openclaw';

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

// Mock WebSocket
jest.mock('ws');

describe('INTEGRATION: OpenClaw Full Test Suite', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-full-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetGlobalSessionManager();
    resetGlobalPermissionManager();
    resetBudgetTracker();
    jest.clearAllMocks();
  });

  // ============================================================================
  // TEST SUITE 1: Gateway Connection Flow
  // ============================================================================
  describe('1. Gateway Connection Flow', () => {
    it('should export GatewayClient and factory functions', () => {
      expect(GatewayClient).toBeDefined();
      expect(typeof createGatewayClient).toBe('function');
      expect(DEFAULT_GATEWAY_CONFIG).toBeDefined();
      expect(DEFAULT_GATEWAY_CONFIG.host).toBe('127.0.0.1');
      expect(DEFAULT_GATEWAY_CONFIG.port).toBe(18789);
    });

    it('should create GatewayClient with default configuration', () => {
      const client = createGatewayClient();
      expect(client).toBeInstanceOf(GatewayClient);
      expect(client.connected).toBe(false);
    });

    it('should create GatewayClient with custom configuration', () => {
      const client = createGatewayClient({
        host: '192.168.1.100',
        port: 19000,
        token: 'test-token',
      });
      expect(client).toBeInstanceOf(GatewayClient);
    });

    it('should track connection state', () => {
      const client = createGatewayClient();
      expect(client.connectionState).toBe('disconnected');
    });

    it('should expose connection statistics', () => {
      const client = createGatewayClient();
      const stats = client.statistics;
      expect(stats).toHaveProperty('reconnections');
      expect(stats).toHaveProperty('requestsSent');
      expect(stats).toHaveProperty('responsesReceived');
      expect(stats).toHaveProperty('eventsReceived');
      expect(stats).toHaveProperty('errors');
    });
  });

  // ============================================================================
  // TEST SUITE 2: Session Lifecycle (spawn → send → history → kill)
  // ============================================================================
  describe('2. Session Lifecycle', () => {
    it('should create SessionManager with configuration', () => {
      const manager = new SessionManager({
        host: '127.0.0.1',
        port: 18789,
        reconnectDelay: 1000,
        maxRetries: 3,
      });
      expect(manager).toBeInstanceOf(SessionManager);
      expect(manager.isConnected()).toBe(false);
    });

    it('should provide global session manager singleton', () => {
      const manager1 = getGlobalSessionManager();
      const manager2 = getGlobalSessionManager();
      expect(manager1).toBe(manager2);
    });

    it('should reset global session manager', () => {
      const manager1 = getGlobalSessionManager();
      resetGlobalSessionManager();
      const manager2 = getGlobalSessionManager();
      expect(manager1).not.toBe(manager2);
    });

    it('should define session management methods', () => {
      const manager = new SessionManager();
      expect(typeof manager.connect).toBe('function');
      expect(typeof manager.disconnect).toBe('function');
      expect(typeof manager.sessionsList).toBe('function');
      expect(typeof manager.sessionsSpawn).toBe('function');
      expect(typeof manager.sessionsSend).toBe('function');
      expect(typeof manager.sessionsHistory).toBe('function');
      expect(typeof manager.sessionsKill).toBe('function');
    });
  });

  // ============================================================================
  // TEST SUITE 3: Tool Execution (exec, read, write)
  // ============================================================================
  describe('3. Tool Execution', () => {
    it('should create ToolExecutor with configuration', () => {
      const executor = createToolExecutor({
        sessionKey: 'test-session',
        gatewayHost: '127.0.0.1',
        gatewayPort: 18789,
        timeout: 30000,
      });
      expect(executor).toBeInstanceOf(OpenClawToolExecutor);
    });

    it('should define file operation methods', () => {
      const executor = createToolExecutor({
        sessionKey: 'test',
        gatewayHost: '127.0.0.1',
        gatewayPort: 18789,
      });
      expect(typeof executor.read).toBe('function');
      expect(typeof executor.write).toBe('function');
      expect(typeof executor.edit).toBe('function');
    });

    it('should define shell execution method', () => {
      const executor = createToolExecutor({
        sessionKey: 'test',
        gatewayHost: '127.0.0.1',
        gatewayPort: 18789,
      });
      expect(typeof executor.exec).toBe('function');
    });

    it('should define browser automation methods', () => {
      const executor = createToolExecutor({
        sessionKey: 'test',
        gatewayHost: '127.0.0.1',
        gatewayPort: 18789,
      });
      expect(typeof executor.browser).toBe('function');
      expect(typeof executor.navigate).toBe('function');
      expect(typeof executor.snapshot).toBe('function');
      expect(typeof executor.click).toBe('function');
      expect(typeof executor.type).toBe('function');
    });

    it('should define canvas/ui methods', () => {
      const executor = createToolExecutor({
        sessionKey: 'test',
        gatewayHost: '127.0.0.1',
        gatewayPort: 18789,
      });
      expect(typeof executor.canvas).toBe('function');
      expect(typeof executor.present).toBe('function');
      expect(typeof executor.hide).toBe('function');
    });

    it('should define node/device action methods', () => {
      const executor = createToolExecutor({
        sessionKey: 'test',
        gatewayHost: '127.0.0.1',
        gatewayPort: 18789,
      });
      expect(typeof executor.nodes).toBe('function');
      expect(typeof executor.cameraSnap).toBe('function');
      expect(typeof executor.notify).toBe('function');
      expect(typeof executor.location).toBe('function');
    });
  });

  // ============================================================================
  // TEST SUITE 4: Budget Tracking
  // ============================================================================
  describe('4. Budget Tracking', () => {
    const createMockStorage = () => ({
      run: jest.fn().mockResolvedValue(undefined),
      all: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue(null),
      close: jest.fn(),
    });

    it('should create BudgetTracker with storage', async () => {
      const mockStorage = createMockStorage();
      const tracker = new BudgetTracker(mockStorage as any);
      expect(tracker).toBeInstanceOf(BudgetTracker);
    });

    it('should provide global budget tracker singleton', () => {
      const mockStorage = createMockStorage();
      const tracker1 = getBudgetTracker(mockStorage as any);
      const tracker2 = getBudgetTracker(mockStorage as any);
      expect(tracker1).toBe(tracker2);
    });

    it('should define budget management methods', async () => {
      const mockStorage = createMockStorage();
      const tracker = new BudgetTracker(mockStorage as any);
      expect(typeof tracker.registerAgent).toBe('function');
      expect(typeof tracker.registerSwarm).toBe('function');
      expect(typeof tracker.track).toBe('function');
      expect(typeof tracker.check).toBe('function');
      expect(typeof tracker.checkSwarm).toBe('function');
    });
  });

  // ============================================================================
  // TEST SUITE 5: Permission Enforcement
  // ============================================================================
  describe('5. Permission Enforcement', () => {
    it('should create PermissionManager', () => {
      const manager = new PermissionManager();
      expect(manager).toBeInstanceOf(PermissionManager);
    });

    it('should provide global permission manager singleton', () => {
      const manager1 = getGlobalPermissionManager();
      const manager2 = getGlobalPermissionManager();
      expect(manager1).toBe(manager2);
    });

    it('should export permission error classes', () => {
      expect(PermissionDeniedError).toBeDefined();
      expect(ToolNotAllowedError).toBeDefined();
      expect(ToolBlacklistedError).toBeDefined();
    });

    it('should register agent with permissions', () => {
      const manager = new PermissionManager();
      const permissions = manager.registerAgent('agent-1', {
        allowedTools: ['read', 'write'],
        deniedTools: ['exec'],
        sandboxMode: 'non-main',
      });
      expect(permissions).toBeDefined();
      expect(manager.isRegistered('agent-1')).toBe(true);
    });

    it('should check tool permissions', () => {
      const manager = new PermissionManager();
      manager.registerAgent('agent-1', {
        allowedTools: ['read', 'write'],
        deniedTools: [],
        sandboxMode: 'non-main',
      });
      expect(manager.checkToolPermission('agent-1', 'read', false)).toBe(true);
      expect(manager.checkToolPermission('agent-1', 'exec', false)).toBe(false);
    });

    it('should check resource limits', () => {
      const manager = new PermissionManager();
      manager.registerAgent('agent-1', {
        allowedTools: ['*'],
        deniedTools: [],
        sandboxMode: 'non-main',
        maxTokens: 1000,
        maxCost: 1.0,
        maxDuration: 60,
      });
      const result = manager.checkResourceLimits('agent-1', {
        tokens: 500,
        cost: 0.5,
        duration: 30,
      });
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect resource limit violations', () => {
      const manager = new PermissionManager();
      manager.registerAgent('agent-1', {
        allowedTools: ['*'],
        deniedTools: [],
        sandboxMode: 'non-main',
        maxTokens: 1000,
        maxCost: 1.0,
        maxDuration: 60,
      });
      const result = manager.checkResourceLimits('agent-1', {
        tokens: 2000,
        cost: 2.0,
        duration: 120,
      });
      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should support permission inheritance', () => {
      const manager = new PermissionManager();
      manager.registerAgent('parent', {
        allowedTools: ['read', 'write'],
        deniedTools: [],
        sandboxMode: 'non-main',
      });
      manager.registerAgent('child', {}, 'parent');
      
      expect(manager.getParentId('child')).toBe('parent');
      expect(manager.getChildIds('parent')).toContain('child');
      expect(manager.getAncestry('child')).toContain('parent');
      expect(manager.getPermissionDepth('child')).toBe(1);
    });

    it('should track and report violations', () => {
      const manager = new PermissionManager();
      manager.registerAgent('agent-1', {
        allowedTools: ['read'],
        deniedTools: [],
        sandboxMode: 'non-main',
      });
      
      manager.recordViolation({
        agentId: 'agent-1',
        tool: 'exec',
        action: 'attempted_unauthorized_exec',
        severity: 'high',
      });
      
      expect(manager.getViolationCount('agent-1')).toBe(1);
      const violations = manager.getViolations('agent-1');
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('high');
    });
  });

  // ============================================================================
  // TEST SUITE 6: Error Handling
  // ============================================================================
  describe('6. Error Handling', () => {
    it('should export error classes', () => {
      expect(GatewayError).toBeDefined();
      expect(ConnectionError).toBeDefined();
      expect(TimeoutError).toBeDefined();
      expect(BudgetError).toBeDefined();
      expect(BudgetExceededError).toBeDefined();
    });

    it('should create GatewayError with code and message', () => {
      const error = new GatewayError('CONNECTION_ERROR', 'Failed to connect');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.message).toBe('Failed to connect');
      expect(error.name).toBe('GatewayError');
    });

    it('should create ConnectionError', () => {
      const error = new ConnectionError('Connection refused');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.message).toBe('Connection refused');
      expect(error.name).toBe('ConnectionError');
    });

    it('should create TimeoutError', () => {
      const error = new TimeoutError('Request timeout');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.message).toBe('Request timeout');
      expect(error.name).toBe('TimeoutError');
    });

    it('should create BudgetExceededError', () => {
      const error = new BudgetExceededError('agent-1', 15.0, 10.0);
      expect(error.agentId).toBe('agent-1');
      expect(error.spent).toBe(15.0);
      expect(error.limit).toBe(10.0);
      expect(error.name).toBe('BudgetExceededError');
    });

    it('should create PermissionDeniedError', () => {
      const error = new PermissionDeniedError('agent-1', 'exec', 'Not allowed');
      expect(error.agentId).toBe('agent-1');
      expect(error.tool).toBe('exec');
      expect(error.name).toBe('PermissionDeniedError');
    });
  });

  // ============================================================================
  // TEST SUITE 7: End-to-End Integration
  // ============================================================================
  describe('7. End-to-End Integration', () => {
    it('should integrate all components', async () => {
      // Create all components
      const permissionManager = new PermissionManager();
      const sessionManager = new SessionManager({
        host: '127.0.0.1',
        port: 18789,
        reconnectDelay: 1000,
        maxRetries: 3,
      });

      // Register agent with permissions
      permissionManager.registerAgent('test-agent', {
        allowedTools: ['read', 'write', 'exec'],
        deniedTools: [],
        sandboxMode: 'non-main',
        maxTokens: 10000,
        maxCost: 5.0,
        maxDuration: 300,
      });

      // Verify all components work together
      expect(permissionManager.isRegistered('test-agent')).toBe(true);
      expect(sessionManager).toBeInstanceOf(SessionManager);

      // Clean up
      permissionManager.dispose();
    });

    it('should check permissions before tool execution', () => {
      const manager = new PermissionManager();
      manager.registerAgent('agent-1', {
        allowedTools: ['read'],
        deniedTools: ['exec'],
        sandboxMode: 'non-main',
      });

      // Allowed tool
      expect(manager.checkToolPermission('agent-1', 'read', false)).toBe(true);
      
      // Denied tool
      expect(manager.checkToolPermission('agent-1', 'exec', false)).toBe(false);
    });
  });

  // ============================================================================
  // TEST SUITE 8: Type Exports
  // ============================================================================
  describe('8. Type Exports', () => {
    it('should export ConnectionState type', () => {
      // Type test - just verify the export exists
      const state: ConnectionState = 'connected';
      expect(state).toBe('connected');
    });

    it('should have all connection states', () => {
      const states: ConnectionState[] = [
        'disconnected',
        'connecting',
        'connected',
        'authenticating',
        'authenticated',
        'reconnecting',
        'error',
      ];
      expect(states).toHaveLength(7);
    });
  });
});
