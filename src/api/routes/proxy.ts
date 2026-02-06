/**
 * LLM Proxy API Routes
 */

import { FastifyInstance } from 'fastify';
import { LlmProxy } from '../../proxy';

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  const proxy = (fastify as any).llmProxy as LlmProxy;

  // Chat completions
  fastify.post('/proxy/v1/chat/completions', async (request, reply) => {
    const body = request.body as any;
    const auth = { userId: 'user_1', tenantId: 'tenant_1', role: 'user', permissions: [] };

    if (body.stream) {
      // For streaming, we handle the raw response manually
      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of proxy.handleStreaming(body, auth)) {
              const data = JSON.stringify({
                id: chunk.id,
                object: 'chat.completion.chunk',
                model: chunk.model,
                choices: [{
                  delta: { content: chunk.delta },
                  finish_reason: chunk.finishReason
                }]
              });
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            }
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            const errData = JSON.stringify({ error: (error as Error).message });
            controller.enqueue(new TextEncoder().encode(`data: ${errData}\n\n`));
            controller.close();
          }
        }
      });
      
      return reply.send(stream);
    }
    
    // Non-streaming response
    const response = await proxy.handleCompletion(body, auth);
    return reply.send({
      id: response.id,
      object: 'chat.completion',
      model: response.model,
      choices: [{
        message: { role: 'assistant', content: response.content },
        finish_reason: response.finishReason
      }],
      usage: response.usage
    });
  });

  // List models
  fastify.get('/proxy/v1/models', async () => {
    const models = proxy.getModels();
    return {
      object: 'list',
      data: models.map(m => ({
        id: m.id,
        object: 'model',
        created: Date.now(),
        owned_by: m.provider
      }))
    };
  });

  // Health check
  fastify.get('/proxy/health', async () => {
    const health = await proxy.checkHealth();
    return {
      status: Object.values(health).every(h => h.healthy) ? 'healthy' : 'degraded',
      providers: health
    };
  });
}
