import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getApiKeyStore } from '../store/apiKeyStore';
import { logger } from '../../utils/logger';

// Validate API key from request
export async function validateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string;
  
  if (!apiKey) {
    reply.status(401).send({ error: 'API key required' });
    return;
  }

  const store = await getApiKeyStore();
  const result = await store.validateKey(apiKey);

  if (!result.valid) {
    logger.warn('Invalid API key attempt', { 
      ip: request.ip,
      error: result.error 
    });
    reply.status(401).send({ error: result.error || 'Invalid API key' });
    return;
  }

  // Attach key info to request
  (request as any).apiKey = result.key;
}

// Optional API key validation (allows anonymous)
export async function validateApiKeyOptional(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string;
  
  if (apiKey) {
    const store = await getApiKeyStore();
    const result = await store.validateKey(apiKey);
    
    if (result.valid) {
      (request as any).apiKey = result.key;
    }
  }
}

// Check if request has specific scope
export function requireScope(scope: string) {
  return async function scopeMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const key = (request as any).apiKey;
    
    if (!key) {
      reply.status(403).send({ error: 'Authentication required' });
      return;
    }

    if (!key.scopes.includes(scope) && !key.scopes.includes('admin')) {
      reply.status(403).send({ error: `Required scope: ${scope}` });
      return;
    }
  };
}
