/**
 * Pi Integration API Routes
 */

import { FastifyInstance } from 'fastify';
import { getGlobalPiRegistry, getGlobalPiSessionManager } from '../../integrations/pi';

export async function piRoutes(fastify: FastifyInstance): Promise<void> {
  // Get registry and session manager
  const registry = getGlobalPiRegistry();
  const sessionManager = getGlobalPiSessionManager();

  // List Pi instances
  fastify.get('/pi/instances', async () => {
    return { instances: registry.getAllInstances() };
  });

  // Register new instance
  fastify.post('/pi/instances', async (request) => {
    const instance = await registry.register(request.body as any);
    return { instance };
  });

  // Get instance details
  fastify.get('/pi/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const instance = registry.getInstance(id);
    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }
    return { instance };
  });

  // Deregister instance
  fastify.delete('/pi/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    registry.unregister(id);
    return { success: true };
  });

  // Get instance health
  fastify.get('/pi/instances/:id/health', async (request, reply) => {
    const { id } = request.params as { id: string };
    const health = await registry.checkHealth(id);
    return { health };
  });

  // List sessions
  fastify.get('/pi/sessions', async () => {
    return { sessions: sessionManager.listSessions() };
  });

  // Create session
  fastify.post('/pi/sessions', async (request) => {
    const config = request.body as any;
    const session = await sessionManager.create(config);
    return { session };
  });

  // Get session
  fastify.get('/pi/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return { session };
  });

  // Pause session
  fastify.post('/pi/sessions/:id/pause', async (request, reply) => {
    const { id } = request.params as { id: string };
    await sessionManager.pause(id);
    return { success: true };
  });

  // Resume session
  fastify.post('/pi/sessions/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await sessionManager.resume(id);
    return { session };
  });

  // Terminate session
  fastify.delete('/pi/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await sessionManager.terminate(id);
    return { success: true };
  });

  // Create checkpoint
  fastify.post('/pi/sessions/:id/checkpoint', async (request, reply) => {
    const { id } = request.params as { id: string };
    const checkpoint = await sessionManager.checkpoint(id);
    return { checkpoint };
  });

  // Get conversation tree
  fastify.get('/pi/sessions/:id/tree', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Would get tree from SessionTreeManager
    return { tree: { sessionId: id, nodes: [] } };
  });

  // Execute task
  fastify.post('/pi/execute', async (request) => {
    const { prompt, config } = request.body as any;
    // Would create session and execute
    return { taskId: 'task_' + Date.now(), status: 'started' };
  });
}
