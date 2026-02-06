/**
 * Worktree API Routes
 */

import { FastifyInstance } from 'fastify';
import { getGlobalWorktreeManager } from '../../core/worktree';

export async function worktreeRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = getGlobalWorktreeManager();

  // List worktrees
  fastify.get('/worktrees', async (request) => {
    const { repository } = request.query as { repository?: string };
    const worktrees = await manager.listWorktrees(repository);
    return { worktrees };
  });

  // Create worktree
  fastify.post('/worktrees', async (request) => {
    const config = request.body as any;
    const worktree = await manager.createWorktree(config);
    return { worktree };
  });

  // Get worktree
  fastify.get('/worktrees/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const worktree = await manager.getWorktree(id);
    if (!worktree) {
      return reply.status(404).send({ error: 'Worktree not found' });
    }
    return { worktree };
  });

  // Remove worktree
  fastify.delete('/worktrees/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const worktree = await manager.getWorktree(id);
    if (!worktree) {
      return reply.status(404).send({ error: 'Worktree not found' });
    }
    await manager.removeWorktree(worktree);
    return { success: true };
  });

  // Cleanup worktree
  fastify.post('/worktrees/:id/cleanup', async (request, reply) => {
    const { id } = request.params as { id: string };
    const options = request.body as any;
    const worktree = await manager.getWorktree(id);
    if (!worktree) {
      return reply.status(404).send({ error: 'Worktree not found' });
    }
    await manager.removeWorktree(worktree, options);
    return { success: true };
  });
}
