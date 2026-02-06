import { FastifyInstance } from 'fastify';
import { createFastifyServer } from '../../../src/api/fastify-server';

jest.setTimeout(30000);
const describeFastify = process.env['RUN_FASTIFY_CONTRACT_TESTS'] === 'true' ? describe : describe.skip;

describeFastify('Fastify API compatibility contract', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    process.env['GODEL_HEALTH_TIMEOUT_MS'] = '100';
    process.env['GODEL_HEALTH_REQUIRE_REDIS'] = 'false';
    process.env['GODEL_OPENCLAW_REQUIRED'] = 'false';
    process.env['DATABASE_URL'] = 'postgresql://godel:godel@localhost:5432/godel';
    server = await createFastifyServer({
      enableAuth: false,
      enableSwagger: true,
    });
    await server.ready();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    delete process.env['GODEL_HEALTH_TIMEOUT_MS'];
    delete process.env['GODEL_HEALTH_REQUIRE_REDIS'];
    delete process.env['GODEL_OPENCLAW_REQUIRED'];
    delete process.env['DATABASE_URL'];
  });

  it('serves OpenAPI JSON on versioned and compatibility endpoints', async () => {
    const versioned = await server.inject({
      method: 'GET',
      url: '/api/v1/openapi.json',
    });
    const compatibility = await server.inject({
      method: 'GET',
      url: '/api/openapi.json',
    });

    expect(versioned.statusCode).toBe(200);
    expect(compatibility.statusCode).toBe(200);
    expect(versioned.json().openapi).toBe('3.1.0');
    expect(compatibility.json().openapi).toBe('3.1.0');
  });

  it('applies deprecation headers to /api/* compatibility routes', async () => {
    const compatibility = await server.inject({
      method: 'GET',
      url: '/api/capabilities',
    });
    const versioned = await server.inject({
      method: 'GET',
      url: '/api/v1/capabilities',
    });

    expect(compatibility.statusCode).toBe(200);
    expect(compatibility.headers['deprecation']).toBe('true');
    expect(compatibility.headers['sunset']).toBeDefined();
    expect(versioned.statusCode).toBe(200);
    expect(versioned.headers['deprecation']).toBeUndefined();
  });

  it('exposes health endpoints at root and compatibility aliases', async () => {
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
      const response = await server.inject({ method: 'GET', url: path });
      expect(response.statusCode).not.toBe(404);
    }
  });

  it('keeps collector and API metrics routes non-conflicting', async () => {
    const collector = await server.inject({ method: 'GET', url: '/metrics' });
    const versioned = await server.inject({ method: 'GET', url: '/api/v1/metrics' });
    const compatibility = await server.inject({ method: 'GET', url: '/api/metrics' });

    expect(collector.statusCode).toBe(200);
    expect(versioned.statusCode).toBe(200);
    expect(compatibility.statusCode).toBe(200);
  });
});
