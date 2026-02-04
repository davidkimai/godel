import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// Request ID middleware
export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get request ID from header or generate new
  const requestId = (request.headers['x-request-id'] as string) || uuidv4();
  
  // Attach to request
  (request as any).requestId = requestId;
  
  // Add to response headers
  reply.header('x-request-id', requestId);
  
  // Log with request ID
  logger.debug('Request started', { 
    requestId,
    method: request.method,
    url: request.url,
    ip: request.ip
  });
}

// Get request ID from request
export function getRequestId(request: FastifyRequest): string {
  return (request as any).requestId || 'unknown';
}

// Propagate request ID to downstream services
export function propagateRequestId(headers: Record<string, string>, request: FastifyRequest): Record<string, string> {
  const requestId = getRequestId(request);
  return {
    ...headers,
    'x-request-id': requestId
  };
}
