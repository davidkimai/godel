/**
 * Federation API Routes
 */

import { FastifyInstance } from 'fastify';

export async function federationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get federation registry from app context
  const registry = (fastify as any).federationRegistry;
  const router = (fastify as any).federationRouter;

  // List instances
  fastify.get('/federation/instances', async () => {
    const instances = registry ? registry.getAllInstances() : [];
    return { instances };
  });

  // Register instance
  fastify.post('/federation/instances', async (request) => {
    if (!registry) {
      return { error: 'Federation not initialized' };
    }
    const instance = await registry.register(request.body as any);
    return { instance };
  });

  // Get instance
  fastify.get('/federation/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const instance = registry?.getInstance(id);
    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }
    return { instance };
  });

  // Unregister instance
  fastify.delete('/federation/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await registry?.unregister(id);
    return { success: true };
  });

  // Get capacity report
  fastify.get('/federation/capacity', async () => {
    const report = registry ? registry.getCapacityReport() : null;
    return { report };
  });

  // Test routing
  fastify.post('/federation/route', async (request) => {
    const context = request.body as any;
    const selection = router ? router.selectInstance(context) : null;
    return { selection };
  });
}
