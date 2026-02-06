import { AddressInfo } from 'net';
import { Server } from 'http';
import { createExpressApp, UnifiedServerConfig } from '../../../src/api/server-factory';

// Mock storage repositories to avoid PostgreSQL dependency
jest.mock('../../../src/storage/repositories/SwarmRepository', () => ({
  SwarmRepository: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue({ id: 'test-swarm-id', name: 'Test Swarm', config: {}, status: 'active' }),
    list: jest.fn().mockResolvedValue([{ id: 'test-swarm-id', name: 'Test Swarm', config: {}, status: 'active' }]),
    create: jest.fn().mockResolvedValue({ id: 'test-swarm-id', name: 'Test Swarm', config: {}, status: 'active' }),
    delete: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../src/storage/repositories/AgentRepository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue({ id: 'test-agent-id', name: 'Test Agent', status: 'active' }),
    list: jest.fn().mockResolvedValue([{ id: 'test-agent-id', name: 'Test Agent', status: 'active' }]),
    create: jest.fn().mockResolvedValue({ id: 'test-agent-id', name: 'Test Agent', status: 'active' }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../src/storage/repositories/EventRepository', () => ({
  EventRepository: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([{ id: 'test-event-id', type: 'test', payload: {} }]),
    create: jest.fn().mockResolvedValue({ id: 'test-event-id', type: 'test', payload: {} }),
  })),
}));

jest.setTimeout(30000);

describe('Express server-factory compatibility contract', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env['PORT'] = '0'; // Use random available port
    delete process.env['DATABASE_URL']; // Force SQLite usage
    process.env['GODEL_SQLITE_PATH'] = ':memory:';
    process.env['GODEL_HEALTH_TIMEOUT_MS'] = '100';
    process.env['GODEL_HEALTH_REQUIRE_REDIS'] = 'false';
    process.env['GODEL_OPENCLAW_REQUIRED'] = 'false';
    process.env['GODEL_ENABLE_AUTH'] = 'false'; // Disable auth for contract tests

    const config: UnifiedServerConfig = {
      framework: 'express',
      port: 7373,
      host: '127.0.0.1',
      apiKey: 'test-key',
      corsOrigins: ['http://localhost:3000'],
      rateLimit: 1000,
      sessionSecret: 'test-secret',
      enableSwagger: true,
      enableAuth: false,
    };

    const app = await createExpressApp(config);
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    delete process.env['PORT'];
    delete process.env['DATABASE_URL'];
    delete process.env['POSTGRES_DB'];
    delete process.env['GODEL_SQLITE_PATH'];
    delete process.env['GODEL_HEALTH_TIMEOUT_MS'];
    delete process.env['GODEL_HEALTH_REQUIRE_REDIS'];
    delete process.env['GODEL_OPENCLAW_REQUIRED'];
    delete process.env['GODEL_ENABLE_AUTH'];
  });

  it('serves OpenAPI JSON on both /api/v1/openapi.json and /api/openapi.json', async () => {
    const versioned = await fetch(`${baseUrl}/api/v1/openapi.json`);
    const compatibility = await fetch(`${baseUrl}/api/openapi.json`);

    expect(versioned.status).toBe(200);
    expect(compatibility.status).toBe(200);

    const versionedDoc = await versioned.json() as Record<string, unknown>;
    const compatibilityDoc = await compatibility.json() as Record<string, unknown>;
    expect(versionedDoc['openapi']).toBe('3.1.0');
    expect(compatibilityDoc['openapi']).toBe('3.1.0');
  });

  it('adds deprecation headers for compatibility /api/* routes', async () => {
    const compatibility = await fetch(`${baseUrl}/api/capabilities`);
    const versioned = await fetch(`${baseUrl}/api/v1/capabilities`);

    expect(compatibility.status).toBe(200);
    expect(compatibility.headers.get('Deprecation')).toBe('true');
    expect(compatibility.headers.get('Sunset')).toBeTruthy();

    expect(versioned.status).toBe(200);
    expect(versioned.headers.get('Deprecation')).toBeNull();
  });

  it('exposes health routes on root and API-prefixed aliases', async () => {
    const paths = [
      '/health',
      '/health/live',
      '/health/ready',
      '/api/v1/health',
      '/api/v1/health/live',
      '/api/v1/health/ready',
      '/api/health',
      '/api/health/live',
      '/api/health/ready',
    ];

    for (const path of paths) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).not.toBe(404);
    }
  });
});
