/**
 * Agent Roles API Routes
 */

import { FastifyInstance } from 'fastify';

export async function rolesRoutes(fastify: FastifyInstance): Promise<void> {
  const roleRegistry = (fastify as any).roleRegistry;

  // List roles
  fastify.get('/roles', async () => {
    const roles = roleRegistry ? roleRegistry.getAllRoles() : [];
    return { roles };
  });

  // Get role
  fastify.get('/roles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const role = roleRegistry?.getRole(id);
    if (!role) {
      return reply.status(404).send({ error: 'Role not found' });
    }
    return { role };
  });

  // Create custom role
  fastify.post('/roles', async (request, reply) => {
    if (!roleRegistry) {
      return reply.status(503).send({ error: 'Role registry not initialized' });
    }
    const role = await roleRegistry.createCustomRole(request.body as any, 'user_1');
    return { role };
  });

  // Update role
  fastify.put('/roles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const role = await roleRegistry?.updateRole(id, request.body as any);
    return { role };
  });

  // Delete role
  fastify.delete('/roles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await roleRegistry?.unregisterRole(id);
    return { success: true };
  });

  // Assign role to agent
  fastify.post('/roles/:id/assign', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { agentId } = request.body as { agentId: string };
    const assignment = await roleRegistry?.assignRole(agentId, id);
    return { assignment };
  });

  // List assignments
  fastify.get('/roles/assignments', async () => {
    // Would return all assignments
    return { assignments: [] };
  });
}
