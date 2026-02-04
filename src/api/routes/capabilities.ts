/**
 * Capabilities Routes
 * 
 * Fastify routes for API discovery:
 * - GET /api/capabilities - Discovery
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse } from '../lib/response';
import { CapabilitySchema } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function capabilitiesRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // GET /api/capabilities - Discovery
  // ============================================================================
  fastify.get(
    '/',
    {
      schema: {
        summary: 'Get API capabilities',
        description: 'Discover available API capabilities and endpoints',
        tags: ['capabilities'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  version: { type: 'string' },
                  capabilities: {
                    type: 'array',
                    items: zodToJsonSchema(CapabilitySchema) as Record<string, unknown>,
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const capabilities = [
        {
          name: 'agents',
          description: 'Agent lifecycle management',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/api/agents', description: 'List all agents' },
            { method: 'POST', path: '/api/agents', description: 'Spawn a new agent' },
            { method: 'GET', path: '/api/agents/:id', description: 'Get agent details' },
            { method: 'POST', path: '/api/agents/:id/kill', description: 'Kill an agent' },
            { method: 'POST', path: '/api/agents/:id/restart', description: 'Restart an agent' },
            { method: 'GET', path: '/api/agents/:id/logs', description: 'Get agent logs' },
            { method: 'DELETE', path: '/api/agents/:id', description: 'Delete an agent' },
          ],
        },
        {
          name: 'swarms',
          description: 'Swarm orchestration management',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/api/swarms', description: 'List all swarms' },
            { method: 'POST', path: '/api/swarms', description: 'Create a new swarm' },
            { method: 'GET', path: '/api/swarms/:id', description: 'Get swarm details' },
            { method: 'PUT', path: '/api/swarms/:id', description: 'Update swarm' },
            { method: 'DELETE', path: '/api/swarms/:id', description: 'Delete swarm' },
            { method: 'POST', path: '/api/swarms/:id/start', description: 'Start swarm' },
            { method: 'POST', path: '/api/swarms/:id/stop', description: 'Stop swarm' },
            { method: 'POST', path: '/api/swarms/:id/pause', description: 'Pause swarm' },
            { method: 'POST', path: '/api/swarms/:id/resume', description: 'Resume swarm' },
            { method: 'POST', path: '/api/swarms/:id/scale', description: 'Scale swarm' },
            { method: 'GET', path: '/api/swarms/:id/events', description: 'Get swarm events' },
            { method: 'GET', path: '/api/swarms/:id/branches', description: 'List branches' },
            { method: 'POST', path: '/api/swarms/:id/branches', description: 'Create branch' },
            { method: 'POST', path: '/api/swarms/:id/switch-branch', description: 'Switch branch' },
          ],
        },
        {
          name: 'tasks',
          description: 'Task management',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/api/tasks', description: 'List all tasks' },
            { method: 'POST', path: '/api/tasks', description: 'Create a new task' },
            { method: 'GET', path: '/api/tasks/:id', description: 'Get task details' },
            { method: 'PUT', path: '/api/tasks/:id', description: 'Update task' },
            { method: 'DELETE', path: '/api/tasks/:id', description: 'Delete task' },
            { method: 'POST', path: '/api/tasks/:id/assign', description: 'Assign task to agent' },
          ],
        },
        {
          name: 'bus',
          description: 'Event bus operations',
          version: '1.0.0',
          endpoints: [
            { method: 'POST', path: '/api/bus/publish', description: 'Publish an event' },
            { method: 'GET', path: '/api/bus/subscribe', description: 'Subscribe to events (SSE)' },
            { method: 'GET', path: '/api/bus/events', description: 'Get recent events' },
          ],
        },
        {
          name: 'metrics',
          description: 'System metrics',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/api/metrics/json', description: 'Get JSON metrics' },
            { method: 'GET', path: '/api/metrics/dashboard', description: 'Get dashboard stats' },
            { method: 'GET', path: '/api/metrics/cost', description: 'Get cost metrics' },
            { method: 'GET', path: '/api/metrics/cost/breakdown', description: 'Get cost breakdown' },
          ],
        },
        {
          name: 'logs',
          description: 'Log querying',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/api/logs', description: 'Query logs' },
            { method: 'GET', path: '/api/logs/agents', description: 'Get agent log summaries' },
          ],
        },
        {
          name: 'health',
          description: 'Health checks',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/health', description: 'Basic health check' },
            { method: 'GET', path: '/api/health/detailed', description: 'Detailed health check' },
            { method: 'GET', path: '/api/health/ready', description: 'Readiness check' },
            { method: 'GET', path: '/api/health/live', description: 'Liveness check' },
          ],
        },
        {
          name: 'docs',
          description: 'API documentation',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/api/openapi.json', description: 'OpenAPI specification' },
            { method: 'GET', path: '/api/docs', description: 'Swagger UI documentation' },
          ],
        },
      ];
      
      return reply.send(
        createSuccessResponse({
          version: '2.0.0',
          capabilities,
        }, { requestId: _request.id })
      );
    }
  );
}

export default capabilitiesRoutes;
