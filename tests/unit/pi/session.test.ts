/**
 * Pi Session Manager Unit Tests
 *
 * Comprehensive tests for PiSessionManager including:
 * - Session lifecycle (create, pause, resume, terminate)
 * - Checkpoint creation and restoration
 * - Session migration
 * - State machine transitions
 * - Auto-checkpointing
 * - Error handling
 */

import { PiSessionManager } from '../../../src/integrations/pi/session';
import {
  PiSession,
  SessionState,
  SessionConfig,
  Checkpoint,
  PiInstance,
  DEFAULT_INSTANCE_CAPACITY,
  SessionManagerDeps,
  SessionNotFoundError,
  InvalidStateTransitionError,
  CheckpointError,
  MigrationError,
} from '../../../src/integrations/pi/types';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('PiSessionManager', () => {
  let sessionManager: PiSessionManager;
  let mockRegistry: any;
  let mockRouter: any;
  let mockStorage: any;
  let mockStateSync: any;

  const createMockInstance = (overrides?: Partial<PiInstance>): PiInstance => ({
    id: `instance-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    name: 'Test Instance',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    mode: 'local',
    endpoint: 'http://localhost:8080',
    health: 'healthy',
    capabilities: ['code-generation', 'typescript'],
    capacity: { ...DEFAULT_INSTANCE_CAPACITY },
    lastHeartbeat: new Date(),
    metadata: {},
    registeredAt: new Date(),
    ...overrides,
  });

  const createMockSessionConfig = (overrides?: Partial<SessionConfig>): SessionConfig => ({
    agentId: `agent-${Date.now()}`,
    piConfig: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      thinking: 'medium',
      tools: ['read', 'write'],
      systemPrompt: 'You are a helpful assistant',
    },
    routing: {
      strategy: 'least-loaded',
    },
    persistence: {
      autoCheckpoint: false,
      checkpointInterval: 10,
    },
    ...overrides,
  });

  beforeEach(() => {
    mockRegistry = {
      getInstance: jest.fn(),
      getHealthyInstances: jest.fn().mockReturnValue([]),
      selectInstance: jest.fn(),
      getAvailableCapacity: jest.fn().mockReturnValue({
        totalInstances: 1,
        healthyInstances: 1,
        availableCapacity: 5,
      }),
    };

    mockRouter = {
      selectInstance: jest.fn(),
    };

    mockStorage = {
      saveHot: jest.fn().mockResolvedValue(undefined),
      saveCold: jest.fn().mockResolvedValue('pg-id-123'),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockStateSync = {
      sync: jest.fn().mockResolvedValue(undefined),
    };

    const deps: SessionManagerDeps = {
      registry: mockRegistry,
      router: mockRouter,
      storage: mockStorage,
      stateSync: mockStateSync,
    };

    sessionManager = new PiSessionManager(deps);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(sessionManager).toBeDefined();
    });

    it('should work without optional router', () => {
      const deps: SessionManagerDeps = {
        registry: mockRegistry,
        storage: mockStorage,
      };
      const manager = new PiSessionManager(deps);
      expect(manager).toBeDefined();
    });

    it('should work without optional stateSync', () => {
      const deps: SessionManagerDeps = {
        registry: mockRegistry,
        router: mockRouter,
        storage: mockStorage,
      };
      const manager = new PiSessionManager(deps);
      expect(manager).toBeDefined();
    });
  });

  describe('session creation', () => {
    it('should create a new session', async () => {
      const mockInstance = createMockInstance({ id: 'test-instance-1' });
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.agentId).toBe(config.agentId);
      expect(session.state).toBe('active');
      expect(session.instanceId).toBe(mockInstance.id);
    });

    it('should use registry when router is not available', async () => {
      const deps: SessionManagerDeps = {
        registry: mockRegistry,
        storage: mockStorage,
      };
      const manager = new PiSessionManager(deps);

      const mockInstance = createMockInstance({ id: 'test-instance-2' });
      mockRegistry.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await manager.create(config);

      expect(session).toBeDefined();
      expect(session.state).toBe('active');
    });

    it('should throw error when no instance available', async () => {
      mockRouter.selectInstance.mockReturnValue(null);

      const config = createMockSessionConfig();

      await expect(sessionManager.create(config)).rejects.toThrow('No available Pi instance');
    });

    it('should emit session.created event', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      const config = createMockSessionConfig();

      await sessionManager.create(config);

      expect(emitSpy).toHaveBeenCalledWith('session.created', expect.any(Object));
    });

    it('should emit session.initialized event', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      const config = createMockSessionConfig();

      await sessionManager.create(config);

      expect(emitSpy).toHaveBeenCalledWith('session.initialized', expect.any(Object));
    });

    it('should initialize conversation root with system prompt', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig({
        piConfig: {
          systemPrompt: 'Custom system prompt',
        },
      });

      const session = await sessionManager.create(config);

      expect(session.conversationRoot).toBeDefined();
      expect(session.conversationRoot!.message.role).toBe('system');
      expect(session.conversationRoot!.message.content).toBe('Custom system prompt');
    });

    it('should setup auto-checkpointing when enabled', async () => {
      jest.useFakeTimers();
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig({
        persistence: {
          autoCheckpoint: true,
          checkpointInterval: 2,
        },
      });

      const session = await sessionManager.create(config);
      expect(session).toBeDefined();

      // Cleanup
      jest.useRealTimers();
    });

    it('should handle initialization failure', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      // Mock storage to fail
      mockStorage.saveHot.mockRejectedValue(new Error('Storage error'));

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      // Should still create session even if storage fails
      expect(session).toBeDefined();
    });
  });

  describe('session pause', () => {
    it('should pause an active session', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await sessionManager.pause(session.id);

      const paused = sessionManager.getSession(session.id);
      expect(paused!.state).toBe('paused');
    });

    it('should create checkpoint before pausing', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.pause(session.id);

      expect(emitSpy).toHaveBeenCalledWith('session.checkpointed', session.id, expect.any(Object));
    });

    it('should stop auto-checkpointing when pausing', async () => {
      jest.useFakeTimers();
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig({
        persistence: {
          autoCheckpoint: true,
          checkpointInterval: 2,
        },
      });

      const session = await sessionManager.create(config);
      await sessionManager.pause(session.id);

      const paused = sessionManager.getSession(session.id);
      expect(paused!.state).toBe('paused');

      jest.useRealTimers();
    });

    it('should emit session.paused event', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.pause(session.id);

      expect(emitSpy).toHaveBeenCalledWith('session.paused', session.id);
    });

    it('should throw error for non-existent session', async () => {
      await expect(sessionManager.pause('non-existent')).rejects.toThrow(SessionNotFoundError);
    });

    it('should throw error for invalid state transition', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      await sessionManager.pause(session.id);

      // Cannot pause already paused session
      await expect(sessionManager.pause(session.id)).rejects.toThrow(InvalidStateTransitionError);
    });

    it('should handle checkpoint failure gracefully', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockStorage.saveHot.mockRejectedValue(new Error('Storage error'));

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      // Should not throw even if checkpoint fails
      await expect(sessionManager.pause(session.id)).resolves.not.toThrow();
    });
  });

  describe('session resume', () => {
    it('should resume a paused session', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockRegistry.getInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      await sessionManager.pause(session.id);

      const resumed = await sessionManager.resume(session.id);

      expect(resumed.state).toBe('active');
    });

    it('should emit session.resumed event', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockRegistry.getInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      await sessionManager.pause(session.id);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.resume(session.id);

      expect(emitSpy).toHaveBeenCalledWith('session.resumed', expect.any(Object));
    });

    it('should migrate to new instance if original unavailable', async () => {
      const originalInstance = createMockInstance({ id: 'original-instance' });
      const newInstance = createMockInstance({ id: 'new-instance' });

      mockRouter.selectInstance
        .mockReturnValueOnce(originalInstance)
        .mockReturnValueOnce(newInstance);
      mockRegistry.getInstance.mockReturnValue(null); // Original unavailable

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      await sessionManager.pause(session.id);

      const resumed = await sessionManager.resume(session.id);

      expect(resumed.instanceId).toBe(newInstance.id);
    });

    it('should throw error when no instance available for resume', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance
        .mockReturnValueOnce(mockInstance)
        .mockReturnValueOnce(null);
      mockRegistry.getInstance.mockReturnValue(null);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      await sessionManager.pause(session.id);

      await expect(sessionManager.resume(session.id)).rejects.toThrow('No available instance');
    });

    it('should restart auto-checkpointing on resume', async () => {
      jest.useFakeTimers();
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockRegistry.getInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig({
        persistence: {
          autoCheckpoint: true,
          checkpointInterval: 2,
        },
      });

      const session = await sessionManager.create(config);
      await sessionManager.pause(session.id);
      await sessionManager.resume(session.id);

      const resumed = sessionManager.getSession(session.id);
      expect(resumed!.state).toBe('active');

      jest.useRealTimers();
    });

    it('should throw error for non-existent session', async () => {
      await expect(sessionManager.resume('non-existent')).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('session termination', () => {
    it('should terminate an active session', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await sessionManager.terminate(session.id);

      const terminated = sessionManager.getSession(session.id);
      expect(terminated!.state).toBe('terminated');
    });

    it('should emit session.terminated event', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.terminate(session.id);

      expect(emitSpy).toHaveBeenCalledWith('session.terminated', session.id, undefined);
    });

    it('should create final checkpoint when requested', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.terminate(session.id, { createCheckpoint: true });

      expect(emitSpy).toHaveBeenCalledWith('session.checkpointed', session.id, expect.any(Object));
    });

    it('should force terminate active session', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await sessionManager.terminate(session.id, { force: true, reason: 'Force test' });

      const terminated = sessionManager.getSession(session.id);
      expect(terminated!.state).toBe('terminated');
    });

    it('should handle terminate of non-existent session gracefully', async () => {
      await expect(sessionManager.terminate('non-existent')).resolves.not.toThrow();
    });

    it('should stop auto-checkpointing on terminate', async () => {
      jest.useFakeTimers();
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig({
        persistence: {
          autoCheckpoint: true,
          checkpointInterval: 2,
        },
      });

      const session = await sessionManager.create(config);
      await sessionManager.terminate(session.id);

      const terminated = sessionManager.getSession(session.id);
      expect(terminated!.state).toBe('terminated');

      jest.useRealTimers();
    });
  });

  describe('checkpoint management', () => {
    it('should create a checkpoint', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const checkpoint = await sessionManager.checkpoint(session.id, 'manual');

      expect(checkpoint).toBeDefined();
      expect(checkpoint.sessionId).toBe(session.id);
      expect(checkpoint.trigger).toBe('manual');
      expect(checkpoint.id).toBeDefined();
    });

    it('should emit session.checkpointed event', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.checkpoint(session.id, 'manual');

      expect(emitSpy).toHaveBeenCalledWith('session.checkpointed', session.id, expect.any(Object));
    });

    it('should increment checkpoint count', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await sessionManager.checkpoint(session.id, 'manual');
      await sessionManager.checkpoint(session.id, 'manual');

      const updated = sessionManager.getSession(session.id);
      expect(updated!.checkpointCount).toBe(2);
    });

    it('should skip auto-checkpoint if too soon', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await sessionManager.checkpoint(session.id, 'auto');

      // Second auto-checkpoint immediately should fail
      await expect(sessionManager.checkpoint(session.id, 'auto')).rejects.toThrow(CheckpointError);
    });

    it('should restore from checkpoint', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockRegistry.getInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      const checkpoint = await sessionManager.checkpoint(session.id, 'manual');

      // Store checkpoint in mock storage
      mockStorage.get.mockResolvedValue(checkpoint);

      const restored = await sessionManager.restore(checkpoint.id);

      expect(restored).toBeDefined();
      expect(restored.state).toBe('active');
    });

    it('should emit session.restored event', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockRegistry.getInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      const checkpoint = await sessionManager.checkpoint(session.id, 'manual');

      mockStorage.get.mockResolvedValue(checkpoint);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.restore(checkpoint.id);

      expect(emitSpy).toHaveBeenCalledWith('session.restored', expect.any(Object));
    });

    it('should throw error for non-existent checkpoint', async () => {
      mockStorage.get.mockResolvedValue(null);

      await expect(sessionManager.restore('non-existent-checkpoint')).rejects.toThrow('Checkpoint not found');
    });

    it('should list checkpoints for session', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await sessionManager.checkpoint(session.id, 'manual');
      await sessionManager.checkpoint(session.id, 'manual');

      const checkpoints = await sessionManager.listCheckpoints(session.id);

      expect(checkpoints).toHaveLength(2);
    });

    it('should delete checkpoint', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      const checkpoint = await sessionManager.checkpoint(session.id, 'manual');

      await sessionManager.deleteCheckpoint(checkpoint.id);

      const checkpoints = await sessionManager.listCheckpoints(session.id);
      expect(checkpoints).toHaveLength(0);
    });
  });

  describe('session migration', () => {
    it('should migrate session to new instance', async () => {
      const sourceInstance = createMockInstance({ id: 'source-instance' });
      const targetInstance = createMockInstance({ id: 'target-instance' });

      mockRouter.selectInstance.mockReturnValue(sourceInstance);
      mockRegistry.getInstance.mockImplementation((id: string) => {
        if (id === 'source-instance') return sourceInstance;
        if (id === 'target-instance') return targetInstance;
        return null;
      });

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await sessionManager.migrate(session.id, targetInstance.id);

      const migrated = sessionManager.getSession(session.id);
      expect(migrated!.instanceId).toBe(targetInstance.id);
    });

    it('should emit session.migrated event', async () => {
      const sourceInstance = createMockInstance({ id: 'source-instance' });
      const targetInstance = createMockInstance({ id: 'target-instance' });

      mockRouter.selectInstance.mockReturnValue(sourceInstance);
      mockRegistry.getInstance.mockImplementation((id: string) => {
        if (id === 'source-instance') return sourceInstance;
        if (id === 'target-instance') return targetInstance;
        return null;
      });

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.migrate(session.id, targetInstance.id);

      expect(emitSpy).toHaveBeenCalledWith('session.migrated', session.id, 'source-instance', 'target-instance');
    });

    it('should throw error for non-existent target instance', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockRegistry.getInstance.mockReturnValue(null);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await expect(sessionManager.migrate(session.id, 'non-existent')).rejects.toThrow(MigrationError);
    });

    it('should throw error for unhealthy target instance', async () => {
      const sourceInstance = createMockInstance({ id: 'source-instance' });
      const unhealthyTarget = createMockInstance({ id: 'unhealthy-target', health: 'unhealthy' });

      mockRouter.selectInstance.mockReturnValue(sourceInstance);
      mockRegistry.getInstance.mockImplementation((id: string) => {
        if (id === 'source-instance') return sourceInstance;
        if (id === 'unhealthy-target') return unhealthyTarget;
        return null;
      });

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      await expect(sessionManager.migrate(session.id, unhealthyTarget.id)).rejects.toThrow(MigrationError);
    });

    it('should create pre-migration checkpoint', async () => {
      const sourceInstance = createMockInstance({ id: 'source-instance' });
      const targetInstance = createMockInstance({ id: 'target-instance' });

      mockRouter.selectInstance.mockReturnValue(sourceInstance);
      mockRegistry.getInstance.mockImplementation((id: string) => {
        if (id === 'source-instance') return sourceInstance;
        if (id === 'target-instance') return targetInstance;
        return null;
      });

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.migrate(session.id, targetInstance.id);

      // Should have created checkpoint with pre_migration trigger
      const checkpointCalls = emitSpy.mock.calls.filter(call => call[0] === 'session.checkpointed');
      expect(checkpointCalls.length).toBeGreaterThan(0);
    });
  });

  describe('state machine transitions', () => {
    it('should allow valid transitions', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockRegistry.getInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      expect(session.state).toBe('active');

      await sessionManager.pause(session.id);
      expect(sessionManager.getSession(session.id)!.state).toBe('paused');

      await sessionManager.resume(session.id);
      expect(sessionManager.getSession(session.id)!.state).toBe('active');

      await sessionManager.terminate(session.id);
      expect(sessionManager.getSession(session.id)!.state).toBe('terminated');
    });

    it('should emit state_changed event', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const emitSpy = jest.spyOn(sessionManager, 'emit');
      await sessionManager.pause(session.id);

      expect(emitSpy).toHaveBeenCalledWith('session.state_changed', session.id, 'active', 'paused');
    });

    it('should reject invalid state transitions', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);
      await sessionManager.terminate(session.id);

      // Cannot resume terminated session
      await expect(sessionManager.resume(session.id)).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  describe('session queries', () => {
    it('should get session by ID', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const config = createMockSessionConfig();
      const session = await sessionManager.create(config);

      const retrieved = sessionManager.getSession(session.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(session.id);
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = sessionManager.getSession('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should list all sessions', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      await sessionManager.create(createMockSessionConfig({ agentId: 'agent-1' }));
      await sessionManager.create(createMockSessionConfig({ agentId: 'agent-2' }));

      const sessions = sessionManager.listSessions();

      expect(sessions).toHaveLength(2);
    });

    it('should filter sessions by agent ID', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      const session1 = await sessionManager.create(createMockSessionConfig({ agentId: 'agent-1' }));
      await sessionManager.create(createMockSessionConfig({ agentId: 'agent-2' }));

      const filtered = sessionManager.listSessions({ agentId: 'agent-1' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(session1.id);
    });

    it('should filter sessions by state', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);
      mockRegistry.getInstance.mockReturnValue(mockInstance);

      const activeSession = await sessionManager.create(createMockSessionConfig());
      const pausedSession = await sessionManager.create(createMockSessionConfig());
      await sessionManager.pause(pausedSession.id);

      const active = sessionManager.listSessions({ state: 'active' });
      const paused = sessionManager.listSessions({ state: 'paused' });

      expect(active).toHaveLength(1);
      expect(paused).toHaveLength(1);
    });

    it('should get sessions for agent', async () => {
      const mockInstance = createMockInstance();
      mockRouter.selectInstance.mockReturnValue(mockInstance);

      await sessionManager.create(createMockSessionConfig({ agentId: 'test-agent' }));

      const sessions = sessionManager.getSessionsForAgent('test-agent');

      expect(sessions).toHaveLength(1);
    });
  });
});
