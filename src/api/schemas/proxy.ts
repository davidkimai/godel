/**
 * LLM Proxy Zod Schemas
 *
 * Validation schemas for OpenAI-compatible proxy endpoints:
 * - Chat completions
 * - Embeddings
 * - Model listing
 */

import { z } from 'zod';
import { MetadataSchema } from './common';

// ============================================================================
// Model Schemas
// ============================================================================

export const ProxyModelSchema = z.object({
  id: z.string().describe('Model identifier'),
  object: z.literal('model').describe('Object type'),
  created: z.number().int().describe('Creation timestamp (Unix)'),
  owned_by: z.string().describe('Organization that owns the model'),
  permission: z.array(z.object({})).describe('Model permissions'),
  root: z.string().optional().describe('Root model ID'),
  parent: z.string().nullable().optional().describe('Parent model ID'),
});

export const ProxyModelListSchema = z.object({
  object: z.literal('list').describe('Object type'),
  data: z.array(ProxyModelSchema).describe('Available models'),
});

// ============================================================================
// Message Schemas
// ============================================================================

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool', 'function'])
    .describe('Message role'),
  content: z.union([z.string(), z.array(z.object({
    type: z.enum(['text', 'image_url']),
    text: z.string().optional(),
    image_url: z.object({
      url: z.string(),
      detail: z.enum(['auto', 'low', 'high']).optional(),
    }).optional(),
  }))]).optional().describe('Message content'),
  name: z.string().optional().describe('Name (for function/tool messages)'),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional().describe('Tool calls (assistant only)'),
  tool_call_id: z.string().optional().describe('Tool call ID (tool messages)'),
});

// ============================================================================
// Chat Completion Request Schema
// ============================================================================

export const ChatCompletionRequestSchema = z.object({
  model: z.string().describe('Model identifier'),
  messages: z.array(ChatMessageSchema).min(1).describe('Conversation messages'),
  temperature: z.number().min(0).max(2).default(1).describe('Sampling temperature'),
  top_p: z.number().min(0).max(1).default(1).describe('Nucleus sampling'),
  n: z.number().int().min(1).max(128).default(1).describe('Number of completions'),
  stream: z.boolean().default(false).describe('Stream response'),
  stop: z.union([z.string(), z.array(z.string()).max(4)]).optional()
    .describe('Stop sequences'),
  max_tokens: z.number().int().min(1).optional().describe('Max tokens to generate'),
  presence_penalty: z.number().min(-2).max(2).default(0)
    .describe('Presence penalty'),
  frequency_penalty: z.number().min(-2).max(2).default(0)
    .describe('Frequency penalty'),
  logit_bias: z.record(z.number().min(-100).max(100)).optional()
    .describe('Logit bias'),
  user: z.string().optional().describe('User identifier'),
  tools: z.array(z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      description: z.string().optional(),
      parameters: z.record(z.unknown()),
    }),
  })).optional().describe('Available tools'),
  tool_choice: z.union([
    z.enum(['none', 'auto', 'required']),
    z.object({
      type: z.literal('function'),
      function: z.object({
        name: z.string(),
      }),
    }),
  ]).optional().describe('Tool choice mode'),
  response_format: z.object({
    type: z.enum(['text', 'json_object', 'json_schema']),
    json_schema: z.object({
      description: z.string().optional(),
      name: z.string(),
      schema: z.record(z.unknown()),
      strict: z.boolean().optional(),
    }).optional(),
  }).optional().describe('Response format'),
});

// ============================================================================
// Chat Completion Response Schemas
// ============================================================================

export const ChatCompletionChoiceSchema = z.object({
  index: z.number().int().describe('Choice index'),
  message: ChatMessageSchema.describe('Generated message'),
  finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'function_call'])
    .nullable()
    .describe('Finish reason'),
  logprobs: z.object({
    content: z.array(z.object({
      token: z.string(),
      logprob: z.number(),
      bytes: z.array(z.number().int()).optional(),
      top_logprobs: z.array(z.object({
        token: z.string(),
        logprob: z.number(),
        bytes: z.array(z.number().int()).optional(),
      })).optional(),
    })).optional(),
  }).optional().describe('Log probabilities'),
});

export const ChatCompletionUsageSchema = z.object({
  prompt_tokens: z.number().int().describe('Prompt tokens'),
  completion_tokens: z.number().int().describe('Completion tokens'),
  total_tokens: z.number().int().describe('Total tokens'),
  prompt_tokens_details: z.object({
    cached_tokens: z.number().int().optional(),
  }).optional(),
  completion_tokens_details: z.object({
    reasoning_tokens: z.number().int().optional(),
  }).optional(),
});

export const ChatCompletionResponseSchema = z.object({
  id: z.string().describe('Completion ID'),
  object: z.literal('chat.completion').describe('Object type'),
  created: z.number().int().describe('Creation timestamp (Unix)'),
  model: z.string().describe('Model used'),
  choices: z.array(ChatCompletionChoiceSchema).describe('Generated choices'),
  usage: ChatCompletionUsageSchema.describe('Token usage'),
  system_fingerprint: z.string().optional().describe('System fingerprint'),
});

// ============================================================================
// Streaming Schemas
// ============================================================================

export const ChatCompletionChunkSchema = z.object({
  id: z.string().describe('Chunk ID'),
  object: z.literal('chat.completion.chunk').describe('Object type'),
  created: z.number().int().describe('Creation timestamp (Unix)'),
  model: z.string().describe('Model used'),
  choices: z.array(z.object({
    index: z.number().int(),
    delta: z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']).optional(),
      content: z.string().optional(),
      tool_calls: z.array(z.object({
        index: z.number().int(),
        id: z.string().optional(),
        type: z.literal('function').optional(),
        function: z.object({
          name: z.string().optional(),
          arguments: z.string().optional(),
        }).optional(),
      })).optional(),
    }),
    finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', null]).optional(),
  })).describe('Choice deltas'),
  usage: ChatCompletionUsageSchema.optional().describe('Token usage (final chunk)'),
});

// ============================================================================
// Embeddings Schemas
// ============================================================================

export const EmbeddingRequestSchema = z.object({
  model: z.string().describe('Model identifier'),
  input: z.union([
    z.string(),
    z.array(z.string()),
    z.array(z.number().int()),
    z.array(z.array(z.number().int())),
  ]).describe('Input to embed'),
  encoding_format: z.enum(['float', 'base64']).default('float')
    .describe('Encoding format'),
  dimensions: z.number().int().min(1).optional().describe('Output dimensions'),
  user: z.string().optional().describe('User identifier'),
});

export const EmbeddingSchema = z.object({
  object: z.literal('embedding').describe('Object type'),
  embedding: z.array(z.number()).describe('Embedding vector'),
  index: z.number().int().describe('Input index'),
});

export const EmbeddingResponseSchema = z.object({
  object: z.literal('list').describe('Object type'),
  data: z.array(EmbeddingSchema).describe('Embeddings'),
  model: z.string().describe('Model used'),
  usage: z.object({
    prompt_tokens: z.number().int(),
    total_tokens: z.number().int(),
  }).describe('Token usage'),
});

// ============================================================================
// Proxy Configuration Schema
// ============================================================================

export const ProxyConfigSchema = z.object({
  targetProvider: z.enum([
    'anthropic',
    'openai',
    'google',
    'groq',
    'cerebras',
    'ollama',
    'kimi',
    'minimax',
  ]).describe('Target LLM provider'),
  targetModel: z.string().optional().describe('Target model (for mapping)'),
  apiKey: z.string().optional().describe('Provider API key'),
  baseUrl: z.string().url().optional().describe('Custom base URL'),
  timeout: z.number().int().default(60000).describe('Request timeout (ms)'),
  retries: z.number().int().default(3).describe('Retry attempts'),
  rateLimit: z.object({
    requestsPerMinute: z.number().int().optional(),
    tokensPerMinute: z.number().int().optional(),
  }).optional().describe('Rate limiting'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Proxy Metrics Schema
// ============================================================================

export const ProxyMetricsSchema = z.object({
  timestamp: z.string().datetime(),
  requests: z.object({
    total: z.number().int(),
    successful: z.number().int(),
    failed: z.number().int(),
    streaming: z.number().int(),
  }).describe('Request statistics'),
  tokens: z.object({
    prompt: z.number().int(),
    completion: z.number().int(),
    total: z.number().int(),
  }).describe('Token statistics'),
  latency: z.object({
    avg: z.number(),
    p50: z.number(),
    p95: z.number(),
    p99: z.number(),
  }).describe('Latency statistics (ms)'),
  errors: z.record(z.number().int()).describe('Error counts by type'),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ProxyModel = z.infer<typeof ProxyModelSchema>;
export type ProxyModelList = z.infer<typeof ProxyModelListSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;
export type ChatCompletionChoice = z.infer<typeof ChatCompletionChoiceSchema>;
export type ChatCompletionUsage = z.infer<typeof ChatCompletionUsageSchema>;
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;
export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;
export type Embedding = z.infer<typeof EmbeddingSchema>;
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type ProxyMetrics = z.infer<typeof ProxyMetricsSchema>;
