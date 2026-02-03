/**
 * Mock for @mariozechner/pi-ai
 * 
 * Provides mock implementations for testing without requiring actual API keys
 */

import type { 
  Model, 
  Api, 
  Usage, 
  AssistantMessage, 
  Context,
  StreamOptions,
  AssistantMessageEventStream,
} from '@mariozechner/pi-ai';

// Mock models
export const MOCK_MODELS: Record<string, Model<Api>> = {
  'claude-3-5-haiku-20241022': {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    api: 'anthropic-messages' as Api,
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoning: false,
    input: ['text'],
    cost: {
      input: 0.8,
      output: 4.0,
      cacheRead: 0.08,
      cacheWrite: 1.0,
    },
    contextWindow: 200000,
    maxTokens: 8192,
  },
  'claude-3-opus-20240229': {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    api: 'anthropic-messages' as Api,
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: {
      input: 15.0,
      output: 75.0,
      cacheRead: 1.5,
      cacheWrite: 18.75,
    },
    contextWindow: 200000,
    maxTokens: 4096,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    api: 'openai-completions' as Api,
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: {
      input: 5.0,
      output: 15.0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 4096,
  },
};

// Mock getModel
export function getModel<TProvider extends string, TModelId extends string>(
  provider: TProvider,
  modelId: TModelId
): Model<Api> {
  const model = MOCK_MODELS[modelId];
  if (!model) {
    throw new Error(`Mock model not found: ${modelId}`);
  }
  return model;
}

// Mock getProviders
export function getProviders(): string[] {
  return ['anthropic', 'openai', 'google'];
}

// Mock getModels
export function getModels(provider: string): Model<Api>[] {
  return Object.values(MOCK_MODELS).filter(m => m.provider === provider);
}

// Mock calculateCost
export function calculateCost<TApi extends Api>(
  model: Model<TApi>,
  usage: Usage
): Usage['cost'] {
  const cost = {
    input: (model.cost.input / 1000000) * usage.input,
    output: (model.cost.output / 1000000) * usage.output,
    cacheRead: (model.cost.cacheRead / 1000000) * usage.cacheRead,
    cacheWrite: (model.cost.cacheWrite / 1000000) * usage.cacheWrite,
    total: 0,
  };
  cost.total = cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
  return cost;
}

// Mock supportsXhigh
export function supportsXhigh<TApi extends Api>(model: Model<TApi>): boolean {
  return model.id.includes('codex') || model.id.includes('5.2');
}

// Mock modelsAreEqual
export function modelsAreEqual<TApi extends Api>(
  a: Model<TApi> | null | undefined,
  b: Model<TApi> | null | undefined
): boolean {
  if (!a || !b) return false;
  return a.id === b.id && a.provider === b.provider;
}

// Mock stream - returns a mock event stream
export function stream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: StreamOptions
): AssistantMessageEventStream {
  // Create a mock async iterable
  const mockStream = {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'text_start',
        contentIndex: 0,
        partial: {
          role: 'assistant',
          content: [{ type: 'text', text: '' }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'stop' as const,
          timestamp: Date.now(),
        },
      };
      
      yield {
        type: 'text_delta',
        contentIndex: 0,
        delta: 'Hello from mock',
        partial: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello from mock' }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: { input: 10, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 13, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'stop' as const,
          timestamp: Date.now(),
        },
      };
      
      yield {
        type: 'done',
        reason: 'stop',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello from mock' }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: { input: 10, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 13, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'stop' as const,
          timestamp: Date.now(),
        },
      };
    },
    result: async () => ({
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'Hello from mock' }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: { input: 10, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 13, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop' as const,
      timestamp: Date.now(),
    }),
  };
  
  return mockStream as unknown as AssistantMessageEventStream;
}

// Mock complete
export async function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: StreamOptions
): Promise<AssistantMessage> {
  const s = stream(model, context, options);
  return s.result();
}

// Mock streamSimple
export function streamSimple<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: any
): AssistantMessageEventStream {
  return stream(model, context, options);
}

// Mock completeSimple
export async function completeSimple<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: any
): Promise<AssistantMessage> {
  return complete(model, context, options);
}

// Re-export types
export type {
  Api,
  KnownApi,
  Provider,
  KnownProvider,
  ThinkingLevel,
  ThinkingBudgets,
  CacheRetention,
  StreamOptions,
  ProviderStreamOptions,
  SimpleStreamOptions,
  StreamFunction,
  TextContent,
  ThinkingContent,
  ImageContent,
  ToolCall,
  Usage,
  StopReason,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,
  Tool,
  Context,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Model,
  OpenAICompletionsCompat,
  OpenAIResponsesCompat,
  OpenRouterRouting,
  VercelGatewayRouting,
  ApiProvider,
  ApiStreamFunction,
  ApiStreamSimpleFunction,
} from '@mariozechner/pi-ai';
