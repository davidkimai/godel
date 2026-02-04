# Error Code Reference

Complete reference for all error codes in the Dash API, including causes and recovery steps.

## Overview

All API errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-abc123",
    "version": "3.0.0"
  }
}
```

## Error Codes by Category

### Validation Errors (400)

| Code | HTTP Status | Message | Cause | Recovery |
|------|-------------|---------|-------|----------|
| `VALIDATION_ERROR` | 400 | Validation failed | Request body failed schema validation | Fix the validation errors in your request body |
| `INVALID_INPUT` | 400 | Invalid input provided | Input data is malformed or invalid | Check the input format and try again |
| `MISSING_FIELD` | 400 | Required field is missing | A required field was not provided | Add the missing required field |
| `INVALID_FORMAT` | 400 | Invalid format | Field value doesn't match expected format | Correct the format of the field |

**Example Validation Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "errors": [
        { "field": "model", "message": "Invalid model identifier" },
        { "field": "task", "message": "Task cannot be empty" }
      ]
    }
  }
}
```

### Authentication Errors (401)

| Code | HTTP Status | Message | Cause | Recovery |
|------|-------------|---------|-------|----------|
| `UNAUTHORIZED` | 401 | Authentication required | No or invalid API key provided | Add a valid `X-API-Key` header |
| `INVALID_TOKEN` | 401 | Invalid authentication token | Token is malformed or tampered | Generate a new valid token |
| `EXPIRED_TOKEN` | 401 | Authentication token expired | Token has exceeded its validity period | Refresh or generate a new token |

**Example Unauthorized Response:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

### Authorization Errors (403)

| Code | HTTP Status | Message | Cause | Recovery |
|------|-------------|---------|-------|----------|
| `FORBIDDEN` | 403 | Access denied | Insufficient permissions for this resource | Request elevated permissions |
| `INSUFFICIENT_PERMISSIONS` | 403 | Insufficient permissions | User lacks required role or scope | Contact administrator for access |

### Not Found Errors (404)

| Code | HTTP Status | Message | Cause | Recovery |
|------|-------------|---------|-------|----------|
| `NOT_FOUND` | 404 | Resource not found | The requested resource doesn't exist | Verify the resource ID |
| `AGENT_NOT_FOUND` | 404 | Agent not found | Specified agent ID doesn't exist | Check the agent ID and try again |
| `SWARM_NOT_FOUND` | 404 | Swarm not found | Specified swarm ID doesn't exist | Verify the swarm ID exists |
| `TASK_NOT_FOUND` | 404 | Task not found | Specified task ID doesn't exist | Check the task ID and try again |

### Conflict Errors (409)

| Code | HTTP Status | Message | Cause | Recovery |
|------|-------------|---------|-------|----------|
| `ALREADY_EXISTS` | 409 | Resource already exists | Attempted to create a duplicate | Use existing resource or create unique one |
| `DUPLICATE` | 409 | Duplicate entry | Data already exists in the system | Remove or update existing entry |
| `STATE_CONFLICT` | 409 | State conflict | Current resource state doesn't allow operation | Check resource state before retrying |

**Example State Conflict Response:**
```json
{
  "success": false,
  "error": {
    "code": "STATE_CONFLICT",
    "message": "Cannot pause an agent that is not running",
    "details": {
      "currentState": "completed",
      "requiredState": "running"
    }
  }
}
```

### Rate Limit Errors (429)

| Code | HTTP Status | Message | Cause | Recovery |
|------|-------------|---------|-------|----------|
| `RATE_LIMITED` | 429 | Too many requests | Rate limit exceeded | Wait before retrying |

**Example Rate Limited Response:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Retry after 60 seconds"
  },
  "meta": {
    "retryAfter": 60
  }
}
```

### Server Errors (500+)

| Code | HTTP Status | Message | Cause | Recovery |
|------|-------------|---------|-------|----------|
| `INTERNAL_ERROR` | 500 | Internal server error | Unexpected server-side error | Retry later; contact support if persists |
| `DATABASE_ERROR` | 500 | Database operation failed | Database query or connection error | Check database connectivity |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | Service is overloaded or down | Retry after a delay |

## Common Error Scenarios

### Agent Operations

#### Agent Not Found
```bash
curl -X GET http://localhost:7373/api/v1/agents/agent-123 \
  -H "X-API-Key: your-api-key"
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent agent-123 not found"
  }
}
```

**Recovery:** Verify the agent ID using `GET /api/v1/agents` to list all agents.

#### Invalid Agent State Transition
```bash
curl -X POST http://localhost:7373/api/v1/agents/agent-123/kill \
  -H "X-API-Key: your-api-key"
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "STATE_CONFLICT",
    "message": "Cannot kill agent in completed state",
    "details": {
      "currentState": "completed"
    }
  }
}
```

**Recovery:** Only running or pending agents can be killed.

### Swarm Operations

#### Swarm Not Found
```bash
curl -X GET http://localhost:7373/api/v1/swarms/swarm-456 \
  -H "X-API-Key: your-api-key"
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "SWARM_NOT_FOUND",
    "message": "Swarm swarm-456 not found"
  }
}
```

**Recovery:** List active swarms with `GET /api/v1/swarms` to find valid IDs.

#### Invalid Swarm Scale
```bash
curl -X POST http://localhost:7373/api/v1/swarms/swarm-456/scale \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"targetSize": -5}'
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "errors": [
        { "field": "targetSize", "message": "Must be greater than 0" }
      ]
    }
  }
}
```

**Recovery:** Provide a valid positive integer for `targetSize`.

## Rate Limiting

| Endpoint Type | Requests | Time Window |
|--------------|----------|------------|
| General API | 1000 | per minute |
| Auth endpoints | 10 | per minute |
| Read operations | 10000 | per minute |

### Handling Rate Limits

```typescript
async function makeRequestWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
      console.log(`Rate limited. Waiting ${retryAfter}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    
    return response;
  }
  throw new Error('Max retries exceeded');
}
```

## Debugging Tips

1. **Check request ID**: Include the `requestId` from the error response when contacting support
2. **Enable debug mode**: Set `NODE_ENV=development` to see stack traces
3. **Validate requests**: Use the OpenAPI schema to validate before sending
4. **Check logs**: Server logs contain additional context for server errors

## Getting Help

If you encounter persistent errors:

1. Check the [Troubleshooting Guide](TROUBLESHOOTING.md)
2. Review [API Documentation](API_ENDPOINT_REFERENCE.md)
3. Search existing [GitHub Issues](https://github.com/davidkimai/dash/issues)
4. Open a new issue with:
   - Request ID
   - Error code and message
   - Request payload (sanitized)
   - Environment details
