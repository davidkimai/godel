import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Client as PgClient } from 'pg';
import Redis from 'ioredis';
import WebSocket from 'ws';
import { getDb } from '../storage/sqlite';

type DependencyStatus = 'up' | 'down' | 'unknown';

interface DependencyCheck {
  name: 'database' | 'redis' | 'openclaw';
  status: DependencyStatus;
  latency?: number;
  error?: string;
  required: boolean;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  dependencies: DependencyCheck[];
  checks: Record<string, { status: DependencyStatus; latencyMs?: number; error?: string; required: boolean }>;
}

const DEFAULT_TIMEOUT_MS = Number(process.env['DASH_HEALTH_TIMEOUT_MS'] || 2000);
const DEFAULT_HEALTH_CACHE_TTL_MS = Number(process.env['DASH_HEALTH_CACHE_TTL_MS'] || 5000);
let healthCache: { value: DependencyCheck[]; expiresAt: number } | null = null;
let healthCheckInFlight: Promise<DependencyCheck[]> | null = null;

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function resolveDatabaseUrl(): string | undefined {
  const explicit = process.env['DATABASE_URL'] || process.env['TEST_DATABASE_URL'];
  if (explicit && explicit.trim().length > 0) return explicit;

  const host = process.env['POSTGRES_HOST'];
  const port = process.env['POSTGRES_PORT'] || '5432';
  const db = process.env['POSTGRES_DB'] || 'godel';
  const user = process.env['POSTGRES_USER'] || 'godel';
  const password = process.env['POSTGRES_PASSWORD'] || 'godel';

  if (host && host.trim().length > 0) {
    return `postgresql://${user}:${password}@${host}:${port}/${db}`;
  }

  return undefined;
}

async function checkDatabase(): Promise<DependencyCheck> {
  const start = Date.now();
  const databaseUrl = resolveDatabaseUrl();
  const latency = () => Date.now() - start;

  if (databaseUrl && databaseUrl.startsWith('postgres')) {
    const client = new PgClient({
      connectionString: databaseUrl,
      connectionTimeoutMillis: DEFAULT_TIMEOUT_MS,
    });

    try {
      await withTimeout(client.connect(), DEFAULT_TIMEOUT_MS, 'postgres connect timeout');
      await withTimeout(client.query('SELECT 1 AS ok'), DEFAULT_TIMEOUT_MS, 'postgres query timeout');
      return { name: 'database', status: 'up', latency: latency(), required: true };
    } catch (error) {
      return {
        name: 'database',
        status: 'down',
        latency: latency(),
        error: error instanceof Error ? error.message : String(error),
        required: true,
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  // SQLite fallback for local/dev environments.
  try {
    const dbPath = process.env['DASH_SQLITE_PATH'] || './godel.db';
    const db = await withTimeout(getDb({ dbPath }), DEFAULT_TIMEOUT_MS, 'sqlite init timeout');
    const result = await withTimeout(db.get('SELECT 1 as ok'), DEFAULT_TIMEOUT_MS, 'sqlite query timeout');
    if (result?.ok === 1) {
      return { name: 'database', status: 'up', latency: latency(), required: true };
    }
    return {
      name: 'database',
      status: 'degraded' as unknown as DependencyStatus,
      latency: latency(),
      error: 'Unexpected sqlite health response',
      required: true,
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'down',
      latency: latency(),
      error: error instanceof Error ? error.message : String(error),
      required: true,
    };
  }
}

function resolveRedisUrl(): string {
  if (process.env['REDIS_URL']) return process.env['REDIS_URL'];
  if (process.env['TEST_REDIS_URL']) return process.env['TEST_REDIS_URL'];
  const host = process.env['REDIS_HOST'] || '127.0.0.1';
  const port = process.env['REDIS_PORT'] || '6379';
  const db = process.env['REDIS_DB'] || '0';
  return `redis://${host}:${port}/${db}`;
}

async function checkRedis(): Promise<DependencyCheck> {
  const start = Date.now();
  const required = parseBoolean(process.env['DASH_HEALTH_REQUIRE_REDIS'], false);
  const client = new Redis(resolveRedisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: DEFAULT_TIMEOUT_MS,
  });

  try {
    await withTimeout(client.connect(), DEFAULT_TIMEOUT_MS, 'redis connect timeout');
    const pong = await withTimeout(client.ping(), DEFAULT_TIMEOUT_MS, 'redis ping timeout');
    if (pong === 'PONG') {
      return { name: 'redis', status: 'up', latency: Date.now() - start, required };
    }

    return {
      name: 'redis',
      status: 'down',
      latency: Date.now() - start,
      error: `Unexpected ping response: ${pong}`,
      required,
    };
  } catch (error) {
    return {
      name: 'redis',
      status: required ? 'down' : 'unknown',
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      required,
    };
  } finally {
    client.disconnect();
  }
}

function resolveOpenClawGatewayUrl(): string {
  const fromList = process.env['OPENCLAW_GATEWAY_URLS']
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)[0];
  return process.env['OPENCLAW_GATEWAY_URL'] || fromList || 'ws://127.0.0.1:18789';
}

async function checkOpenClaw(): Promise<DependencyCheck> {
  const start = Date.now();
  const required = parseBoolean(process.env['DASH_OPENCLAW_REQUIRED'] || process.env['OPENCLAW_REQUIRED'], false);
  const gatewayUrl = resolveOpenClawGatewayUrl();

  const status = await new Promise<DependencyCheck>((resolve) => {
    const ws = new WebSocket(gatewayUrl);
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve({
        name: 'openclaw',
        status: required ? 'down' : 'unknown',
        latency: Date.now() - start,
        error: `Gateway probe timeout (${gatewayUrl})`,
        required,
      });
    }, DEFAULT_TIMEOUT_MS);

    ws.once('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({
        name: 'openclaw',
        status: 'up',
        latency: Date.now() - start,
        required,
      });
    });

    ws.once('error', (error) => {
      clearTimeout(timeout);
      resolve({
        name: 'openclaw',
        status: required ? 'down' : 'unknown',
        latency: Date.now() - start,
        error: error.message,
        required,
      });
    });
  });

  return status;
}

function buildHealthResult(dependencies: DependencyCheck[]): HealthCheckResult {
  const requiredDown = dependencies.some((dependency) => dependency.required && dependency.status === 'down');
  const anyNonUp = dependencies.some((dependency) => dependency.status !== 'up');

  const status: HealthCheckResult['status'] = requiredDown
    ? 'unhealthy'
    : anyNonUp
      ? 'degraded'
      : 'healthy';

  const checks = dependencies.reduce<HealthCheckResult['checks']>((acc, dependency) => {
    acc[dependency.name] = {
      status: dependency.status,
      latencyMs: dependency.latency,
      error: dependency.error,
      required: dependency.required,
    };
    return acc;
  }, {});

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies,
    checks,
  };
}

async function getDependencyChecks(): Promise<DependencyCheck[]> {
  const now = Date.now();
  if (healthCache && healthCache.expiresAt > now) {
    return healthCache.value;
  }

  if (!healthCheckInFlight) {
    healthCheckInFlight = Promise.all([
      checkDatabase(),
      checkRedis(),
      checkOpenClaw(),
    ])
      .then((value) => {
        healthCache = {
          value,
          expiresAt: Date.now() + DEFAULT_HEALTH_CACHE_TTL_MS,
        };
        return value;
      })
      .finally(() => {
        healthCheckInFlight = null;
      });
  }

  return healthCheckInFlight;
}

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    const dependencies = await getDependencyChecks();
    const result = buildHealthResult(dependencies);
    const statusCode = result.status === 'unhealthy' ? 503 : 200;
    reply.status(statusCode).send(result);
  });

  // Compatibility alias for legacy health consumers.
  fastify.get('/detailed', async (_request: FastifyRequest, reply: FastifyReply) => {
    const dependencies = await getDependencyChecks();
    const result = buildHealthResult(dependencies);
    const statusCode = result.status === 'unhealthy' ? 503 : 200;
    reply.status(statusCode).send(result);
  });

  fastify.get('/live', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'alive', timestamp: new Date().toISOString() });
  });

  fastify.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    const dependencies = await getDependencyChecks();
    const blocking = dependencies.find((dependency) => dependency.required && dependency.status !== 'up');
    if (!blocking) {
      reply.send({ status: 'ready' });
      return;
    }

    reply.status(503).send({
      status: 'not ready',
      reason: `${blocking.name} unavailable`,
      checks: dependencies,
    });
  });
}
