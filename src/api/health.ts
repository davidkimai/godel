import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  dependencies: {
    name: string;
    status: 'up' | 'down' | 'unknown';
    latency?: number;
    error?: string;
  }[];
}

async function checkDatabase(): Promise<{ status: string; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    // Simulated DB check - replace with actual DB ping
    await new Promise(resolve => setTimeout(resolve, 10));
    return { status: 'up', latency: Date.now() - start };
  } catch (error) {
    return { status: 'down', latency: Date.now() - start, error: String(error) };
  }
}

async function checkCache(): Promise<{ status: string; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    // Simulated cache check - replace with actual Redis/health check
    await new Promise(resolve => setTimeout(resolve, 5));
    return { status: 'up', latency: Date.now() - start };
  } catch (error) {
    return { status: 'down', latency: Date.now() - start, error: String(error) };
  }
}

async function checkExternalService(): Promise<{ status: string; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    // Simulated external service check
    await new Promise(resolve => setTimeout(resolve, 50));
    return { status: 'up', latency: Date.now() - start };
  } catch (error) {
    return { status: 'down', latency: Date.now() - start, error: String(error) };
  }
}

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    const [db, cache, external] = await Promise.all([
      checkDatabase(),
      checkCache(),
      checkExternalService(),
    ]);

    const allHealthy = [db, cache, external].every(d => d.status === 'up');
    const anyDown = [db, cache, external].some(d => d.status === 'down');

    const result: HealthCheckResult = {
      status: allHealthy ? 'healthy' : anyDown ? 'unhealthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: [
        { name: 'database', status: db.status as 'up' | 'down' | 'unknown', latency: db.latency, error: db.error },
        { name: 'cache', status: cache.status as 'up' | 'down' | 'unknown', latency: cache.latency, error: cache.error },
        { name: 'external-service', status: external.status as 'up' | 'down' | 'unknown', latency: external.latency, error: external.error },
      ],
    };

    const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
    reply.status(statusCode).send(result);
  });

  fastify.get('/live', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'alive', timestamp: new Date().toISOString() });
  });

  fastify.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    const [db] = await Promise.all([checkDatabase()]);
    if (db.status === 'up') {
      reply.send({ status: 'ready' });
    } else {
      reply.status(503).send({ status: 'not ready', reason: 'database unavailable' });
    }
  });
}
