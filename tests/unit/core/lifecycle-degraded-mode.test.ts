import { AgentLifecycle } from '../../../src/core/lifecycle';
import { AgentStorage } from '../../../src/storage/memory';
import { MessageBus } from '../../../src/bus';
import { OpenClawCore } from '../../../src/core/openclaw';

describe('AgentLifecycle degraded OpenClaw mode', () => {
  const storage = {
    create: jest.fn(),
    update: jest.fn(),
    get: jest.fn(),
  } as unknown as AgentStorage;

  const bus = {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as MessageBus;

  afterEach(() => {
    delete process.env['GODEL_OPENCLAW_REQUIRED'];
    delete process.env['OPENCLAW_REQUIRED'];
    jest.clearAllMocks();
  });

  it('continues startup and spawns agents without session IDs when gateway is unavailable', async () => {
    const openclaw = {
      initialize: jest.fn().mockRejectedValue(new Error('gateway unavailable')),
      connect: jest.fn().mockRejectedValue(new Error('gateway unavailable')),
      spawnSession: jest.fn().mockResolvedValue('session-should-not-be-used'),
    } as unknown as OpenClawCore;

    const lifecycle = new AgentLifecycle(storage, bus, openclaw);
    await expect(lifecycle.start()).resolves.toBeUndefined();

    const agent = await lifecycle.spawn({
      label: 'Degraded Agent',
      model: 'kimi-k2.5',
      task: 'Continue without gateway',
      autoStart: true,
    });

    const state = lifecycle.getState(agent.id);
    expect(state).not.toBeNull();
    expect(state?.sessionId).toBeUndefined();
    expect((openclaw as any).spawnSession).not.toHaveBeenCalled();

    lifecycle.stop();
  });

  it('fails startup when strict OpenClaw mode is enabled', async () => {
    process.env['GODEL_OPENCLAW_REQUIRED'] = 'true';
    const openclaw = {
      initialize: jest.fn().mockRejectedValue(new Error('gateway unavailable')),
      connect: jest.fn(),
      spawnSession: jest.fn(),
    } as unknown as OpenClawCore;

    const lifecycle = new AgentLifecycle(storage, bus, openclaw);
    await expect(lifecycle.start()).rejects.toThrow();
    lifecycle.stop();
  });
});
