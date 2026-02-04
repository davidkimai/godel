# API Design Recommendations

**Purpose:** Complete API design guide for Dash REST API  
**Target:** Fastify-based implementation with OpenAPI generation

---

## API Architecture

### Technology Stack
- **Framework:** Fastify (performance-focused)
- **Validation:** Zod (runtime validation + type inference)
- **Authentication:** Bearer tokens + API keys
- **Documentation:** OpenAPI 3.0 with Swagger UI
- **WebSocket:** ws library for real-time events

### Directory Structure
```
src/api/
├── server.ts              # Fastify server setup
├── routes/                # Route definitions
│   ├── index.ts
│   ├── agents.ts
│   ├── swarms.ts
│   ├── tasks.ts
│   ├── events.ts
│   ├── bus.ts
│   ├── metrics.ts
│   └── health.ts
├── middleware/            # Auth, validation, error handling
│   ├── auth.ts
│   ├── validation.ts
│   └── error-handler.ts
├── schemas/               # Zod schemas
│   ├── agent.ts
│   ├── swarm.ts
│   ├── common.ts
│   └── index.ts
└── types.ts               # TypeScript types
```

---

## Response Wrapper Standard

All API responses must follow this wrapper format:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
  links?: ResponseLinks;
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  help?: string;
}

interface ResponseMeta {
  timestamp: string;
  requestId: string;
  pagination?: PaginationMeta;
}

interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface ResponseLinks {
  self: string;
  next?: string;
  prev?: string;
}
```

### Example Success Response
```json
{
  "success": true,
  "data": {
    "id": "agent-xyz789",
    "status": "running",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:00:00Z",
    "requestId": "req-abc123"
  },
  "links": {
    "self": "/api/agents/agent-xyz789",
    "swarm": "/api/swarms/swarm-abc123"
  }
}
```

### Example Error Response
```json
{
  "success": false,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent agent-xyz789 not found",
    "details": { "agentId": "agent-xyz789" },
    "help": "https://docs.dash.dev/errors/AGENT_NOT_FOUND"
  },
  "meta": {
    "timestamp": "2024-01-15T10:00:00Z",
    "requestId": "req-abc123"
  }
}
```

---

## Error Handling

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request body or params |
| `VALIDATION_ERROR` | 400 | Schema validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Permission denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

### Error Handler Implementation
```typescript
// src/api/middleware/error-handler.ts
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = request.id;
  
  // Log error
  request.log.error({ err: error, requestId }, 'API Error');
  
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      },
      meta: { timestamp: new Date().toISOString(), requestId }
    });
  }
  
  // Handle known errors
  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message
      },
      meta: { timestamp: new Date().toISOString(), requestId }
    });
  }
  
  // Unknown error
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    },
    meta: { timestamp: new Date().toISOString(), requestId }
  });
}
```

---

## Authentication Middleware

```typescript
// src/api/middleware/auth.ts
import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
) {
  // Skip auth for health endpoint
  if (request.url === '/api/health') {
    return done();
  }
  
  const apiKey = request.headers['x-api-key'] as string;
  const authHeader = request.headers['authorization'] as string;
  
  let token: string | undefined;
  
  if (apiKey) {
    token = apiKey;
  } else if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  
  if (!token) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide X-API-Key header or Bearer token.'
      }
    });
  }
  
  // Validate token
  const isValid = await validateToken(token);
  if (!isValid) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication token'
      }
    });
  }
  
  // Attach user/agent info to request
  request.user = await getUserFromToken(token);
  
  done();
}
```

---

## Pagination Implementation

### Cursor-Based Pagination (Recommended)
```typescript
// src/api/lib/pagination.ts
interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

interface CursorPaginationResult<T> {
  data: T[];
  pagination: {
    nextCursor?: string;
    hasMore: boolean;
  };
}

export function encodeCursor(data: any): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): any {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString());
}
```

### Route Implementation
```typescript
// List agents with pagination
fastify.get('/agents', async (request, reply) => {
  const { cursor, limit = 50 } = request.query as CursorPaginationParams;
  
  const result = await agentService.listAgents({
    cursor: cursor ? decodeCursor(cursor) : undefined,
    limit: Math.min(limit, 100)
  });
  
  return {
    success: true,
    data: result.data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: request.id,
      pagination: {
        total: result.total,
        limit,
        hasMore: result.hasMore
      }
    },
    links: {
      self: request.url,
      next: result.hasMore 
        ? `/api/agents?cursor=${encodeCursor(result.nextCursor)}&limit=${limit}`
        : undefined
    }
  };
});
```

---

## OpenAPI Generation

### Fastify Swagger Setup
```typescript
// src/api/server.ts
import fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const app = fastify({ logger: true });

// Register swagger
await app.register(swagger, {
  openapi: {
    info: {
      title: 'Dash API',
      description: 'Agent orchestration platform API',
      version: '3.0.0'
    },
    servers: [
      { url: 'http://localhost:7373/api' }
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer'
        }
      }
    }
  }
});

await app.register(swaggerUi, {
  routePrefix: '/api/docs',
  uiConfig: {
    docExpansion: 'list'
  }
});

// Routes will be auto-documented
app.get('/api/agents', {
  schema: {
    description: 'List all agents',
    tags: ['agents'],
    querystring: {
      type: 'object',
      properties: {
        cursor: { type: 'string' },
        limit: { type: 'number', default: 50 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: { $ref: 'Agent#' }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  // Handler
});
```

---

## WebSocket Integration

```typescript
// src/api/websocket.ts
import { FastifyInstance } from 'fastify';
import WebSocket from 'ws';

export function setupWebSocket(app: FastifyInstance) {
  const wss = new WebSocket.Server({ server: app.server });
  
  wss.on('connection', (ws, req) => {
    // Authenticate connection
    const token = new URL(req.url!, 'http://localhost').searchParams.get('token');
    
    if (!validateToken(token)) {
      ws.close(1008, 'Invalid authentication');
      return;
    }
    
    // Subscribe to events
    ws.on('message', (message) => {
      const { action, topics } = JSON.parse(message.toString());
      
      if (action === 'subscribe') {
        subscribeToTopics(ws, topics);
      }
    });
    
    // Send initial connection success
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString()
    }));
  });
  
  // Broadcast events to subscribed clients
  eventBus.on('**', (event) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(event));
      }
    });
  });
}
```

---

## Zod Schemas

```typescript
// src/api/schemas/agent.ts
import { z } from 'zod';

export const AgentStatus = z.enum(['spawning', 'running', 'paused', 'failed', 'terminated']);

export const Agent = z.object({
  id: z.string(),
  swarmId: z.string(),
  status: AgentStatus,
  config: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const CreateAgentRequest = z.object({
  swarmId: z.string(),
  config: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional()
});

export const UpdateAgentRequest = z.object({
  status: AgentStatus.optional(),
  config: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional()
});

// Common schemas
export const PaginationParams = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50)
});

export const ApiResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.any()).optional()
    }).optional(),
    meta: z.object({
      timestamp: z.string().datetime(),
      requestId: z.string()
    }).optional()
  });
```

---

## Rate Limiting

```typescript
// src/api/middleware/rate-limit.ts
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  max: 1000,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.user?.id || req.ip,
  errorResponseBuilder: (req, context) => ({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: `Rate limit exceeded. Try again in ${context.after}`,
      details: {
        limit: context.max,
        window: context.timeWindow,
        retryAfter: context.after
      }
    }
  })
});
```

---

## Complete Server Setup

```typescript
// src/api/server.ts
import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { setupRoutes } from './routes';
import { setupWebSocket } from './websocket';

export async function createServer() {
  const app = fastify({
    logger: true,
    genReqId: () => `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  });
  
  // Security middleware
  await app.register(helmet);
  await app.register(cors, {
    origin: process.env.DASH_CORS_ORIGIN || '*',
    credentials: true
  });
  
  // Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Dash API',
        version: '3.0.0',
        description: 'Agent orchestration platform'
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });
  
  // Auth middleware
  app.addHook('onRequest', authMiddleware);
  
  // Error handler
  app.setErrorHandler(errorHandler);
  
  // Routes
  await setupRoutes(app);
  
  // WebSocket
  setupWebSocket(app);
  
  return app;
}

// Start server
async function main() {
  const app = await createServer();
  
  await app.listen({
    port: parseInt(process.env.DASH_PORT || '7373'),
    host: '0.0.0.0'
  });
  
  console.log(`Dash API running on http://localhost:7373`);
  console.log(`API docs available at http://localhost:7373/api/docs`);
}

main().catch(console.error);
```

---

## Testing

```typescript
// tests/api/agents.test.ts
import { test } from 'tap';
import { build } from '../helper';

test('POST /api/agents', async (t) => {
  const app = await build(t);
  
  const response = await app.inject({
    method: 'POST',
    url: '/api/agents',
    headers: { 'X-API-Key': 'test-key' },
    payload: {
      swarmId: 'swarm-test',
      config: { strategy: 'round-robin' }
    }
  });
  
  t.equal(response.statusCode, 201);
  
  const body = JSON.parse(response.payload);
  t.equal(body.success, true);
  t.has(body.data, { swarmId: 'swarm-test', status: 'spawning' });
  t.has(body.links, { self: /\/api\/agents\/agent-/ });
});
```
