/**
 * Provider Adapters
 * 
 * Adapters for different LLM providers that transform requests/responses
 * between the standard proxy format and provider-specific formats.
 * 
 * @module proxy/adapters
 */

import { 
  ProviderAdapter, 
  ProviderRequest, 
  ProviderResponse, 
  CompletionRequest, 
  CompletionResponse,
  StreamChunk,
  Message,
  Tool,
  ToolCall,
  TokenUsage,
  HealthStatus,
  ContentBlock
} from './types.js';

// =============================================================================
// Base Adapter with Common Functionality
// =============================================================================

/**
 * Abstract base class for provider adapters
 * Provides common functionality for all adapters
 */
export abstract class BaseAdapter implements ProviderAdapter {
  abstract readonly name: string;
  
  /** Provider configuration */
  protected config: {
    apiKey: string;
    baseUrl?: string;
    defaultModel: string;
  };
  
  /** Model pricing (input/output per 1K tokens) */
  protected pricing: Record<string, { input: number; output: number }> = {};
  
  constructor(config: { apiKey: string; baseUrl?: string; defaultModel: string }) {
    this.config = config;
  }
  
  abstract transformRequest(req: CompletionRequest): ProviderRequest;
  abstract transformResponse(res: ProviderResponse): CompletionResponse;
  abstract transformStreamChunk(chunk: unknown): StreamChunk;
  abstract mapModel(alias: string): string;
  
  /**
   * Calculate cost based on token usage and model pricing
   */
  calculateCost(usage: TokenUsage): number {
    const model = this.getModelFromUsage(usage);
    const prices = this.pricing[model] || { input: 0, output: 0 };
    
    const inputCost = (usage.prompt_tokens / 1000) * prices.input;
    const outputCost = (usage.completion_tokens / 1000) * prices.output;
    
    return Number((inputCost + outputCost).toFixed(6));
  }
  
  /**
   * Extract model from usage or return default
   */
  protected getModelFromUsage(usage: TokenUsage): string {
    return this.config.defaultModel;
  }
  
  /**
   * Generate a unique ID
   */
  protected generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Check provider health by making a minimal request
   */
  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      const baseUrl = this.config.baseUrl || this.getDefaultBaseUrl();
      const response = await fetch(`${baseUrl}/health`);
      
      return {
        healthy: response.ok,
        provider: this.name,
        responseTime: Date.now() - startTime,
        checkedAt: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.name,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        checkedAt: new Date()
      };
    }
  }
  
  /**
   * Get default base URL for the provider
   */
  protected abstract getDefaultBaseUrl(): string;
  
  /**
   * Transform standard messages to provider format
   */
  protected abstract mapMessages(messages: Message[]): unknown[];
  
  /**
   * Transform standard tools to provider format
   */
  protected abstract mapTools(tools: Tool[]): unknown[];
  
  /**
   * Transform tool call from provider format
   */
  protected abstract mapToolCall(toolCall: unknown): ToolCall;
}

// =============================================================================
// Anthropic Adapter
// =============================================================================

/**
 * Anthropic Claude API adapter
 * Supports Claude 3/3.5 models with vision, tools, and streaming
 */
export class AnthropicAdapter extends BaseAdapter {
  readonly name = 'anthropic';
  
  /** Model pricing per 1K tokens (USD) */
  protected pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4': { input: 15.0, output: 75.0 },
    'claude-opus-4-5': { input: 15.0, output: 75.0 },
    'claude-sonnet-4': { input: 3.0, output: 15.0 },
    'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
    'claude-haiku': { input: 0.25, output: 1.25 },
    'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 }
  };
  
  /** Model aliases mapping */
  private readonly modelAliases: Record<string, string> = {
    'smart': 'claude-opus-4',
    'smart-latest': 'claude-opus-4-5',
    'fast': 'claude-sonnet-4',
    'fast-latest': 'claude-sonnet-4-5',
    'cheap': 'claude-haiku',
    'opus': 'claude-opus-4',
    'sonnet': 'claude-sonnet-4',
    'haiku': 'claude-haiku'
  };
  
  constructor(config: { apiKey: string; baseUrl?: string; defaultModel?: string }) {
    super({
      ...config,
      defaultModel: config.defaultModel || 'claude-sonnet-4'
    });
  }
  
  /**
   * Map model alias to actual model ID
   */
  mapModel(alias: string): string {
    return this.modelAliases[alias] || alias;
  }
  
  /**
   * Transform request to Anthropic format
   */
  transformRequest(req: CompletionRequest): ProviderRequest {
    const mappedModel = this.mapModel(req.model);
    
    const anthropicReq: Record<string, unknown> = {
      model: mappedModel,
      messages: this.mapMessages(req.messages),
      max_tokens: req.max_tokens || 4096,
    };
    
    if (req.temperature !== undefined) {
      anthropicReq['temperature'] = req.temperature;
    }
    
    if (req.top_p !== undefined) {
      anthropicReq['top_p'] = req.top_p;
    }
    
    if (req.top_k !== undefined) {
      anthropicReq['top_k'] = req.top_k;
    }
    
    if (req.stop) {
      anthropicReq['stop_sequences'] = Array.isArray(req.stop) ? req.stop : [req.stop];
    }
    
    if (req.tools && req.tools.length > 0) {
      anthropicReq['tools'] = this.mapTools(req.tools);
    }
    
    if (req.stream) {
      anthropicReq['stream'] = true;
    }
    
    return anthropicReq;
  }
  
  /**
   * Transform Anthropic response to standard format
   */
  transformResponse(res: ProviderResponse): CompletionResponse {
    const anthropicRes = res as unknown as AnthropicResponse;
    
    const content = anthropicRes.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');
    
    const toolCalls = anthropicRes.content
      .filter(block => block.type === 'tool_use')
      .map(block => this.mapToolCall(block));
    
    const usage: TokenUsage = {
      prompt_tokens: anthropicRes.usage.input_tokens,
      completion_tokens: anthropicRes.usage.output_tokens,
      total_tokens: anthropicRes.usage.input_tokens + anthropicRes.usage.output_tokens,
      cache_read_tokens: anthropicRes.usage.cache_read_input_tokens,
      cache_write_tokens: anthropicRes.usage.cache_creation_input_tokens
    };
    
    return {
      id: anthropicRes.id,
      model: anthropicRes.model,
      provider: 'anthropic',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      cost: this.calculateCost(usage),
      finishReason: this.mapFinishReason(anthropicRes.stop_reason)
    };
  }
  
  /**
   * Transform Anthropic streaming chunk to standard format
   */
  transformStreamChunk(chunk: unknown): StreamChunk {
    const event = chunk as unknown as AnthropicStreamEvent;
    
    // Handle different event types
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        return {
          id: event.index.toString(),
          model: '',
          provider: 'anthropic',
          delta: event.delta.text || '',
          done: false
        };
      } else if (event.delta.type === 'input_json_delta') {
        // Tool call partial input
        return {
          id: event.index.toString(),
          model: '',
          provider: 'anthropic',
          delta: '',
          toolCalls: [{
            id: event.index.toString(),
            name: '',
            arguments: event.delta.partial_json || ''
          }],
          done: false
        };
      }
    }
    
    if (event.type === 'message_stop') {
      return {
        id: '',
        model: '',
        provider: 'anthropic',
        delta: '',
        done: true
      };
    }
    
    if (event.type === 'message_delta' && event.usage) {
      return {
        id: '',
        model: '',
        provider: 'anthropic',
        delta: '',
        usage: {
          prompt_tokens: 0,
          completion_tokens: event.usage.output_tokens || 0,
          total_tokens: event.usage.output_tokens || 0
        },
        done: false
      };
    }
    
    return {
      id: '',
      model: '',
      provider: 'anthropic',
      delta: '',
      done: false
    };
  }
  
  /**
   * Map messages to Anthropic format
   * Anthropic requires alternating user/assistant messages and system as a separate param
   */
  protected mapMessages(messages: Message[]): unknown[] {
    return messages
      .filter(msg => msg.role !== 'system')
      .map(msg => {
        if (typeof msg.content === 'string') {
          return {
            role: msg.role,
            content: msg.content
          };
        }
        
        // Handle content blocks (multimodal)
        return {
          role: msg.role,
          content: msg.content.map(block => this.mapContentBlock(block))
        };
      });
  }
  
  /**
   * Map content block to Anthropic format
   */
  private mapContentBlock(block: ContentBlock): unknown {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
        
      case 'image':
        return {
          type: 'image',
          source: block.source
        };
        
      case 'image_url':
        return {
          type: 'image',
          source: {
            type: 'url',
            url: block.image_url?.url
          }
        };
        
      case 'tool_use':
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input
        };
        
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: block.text
        };
        
      default:
        return { type: 'text', text: '' };
    }
  }
  
  /**
   * Map tools to Anthropic format
   */
  protected mapTools(tools: Tool[]): unknown[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }
  
  /**
   * Map tool call from Anthropic format
   */
  protected mapToolCall(toolCall: unknown): ToolCall {
    const tc = toolCall as AnthropicToolUseBlock;
    return {
      id: tc.id,
      name: tc.name,
      arguments: JSON.stringify(tc.input),
      parsedArguments: tc.input
    };
  }
  
  /**
   * Map Anthropic stop reason to standard finish reason
   */
  private mapFinishReason(reason: string | null): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      default:
        return null;
    }
  }
  
  /**
   * Get default base URL
   */
  protected getDefaultBaseUrl(): string {
    return 'https://api.anthropic.com/v1';
  }
  
  /**
   * Check health by attempting a minimal API call
   */
  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.getDefaultBaseUrl()}/models`, {
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
      
      return {
        healthy: response.ok,
        provider: this.name,
        responseTime: Date.now() - startTime,
        checkedAt: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.name,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        checkedAt: new Date()
      };
    }
  }
}

// =============================================================================
// Anthropic-specific Types
// =============================================================================

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicStreamEvent {
  type: string;
  index: number;
  delta: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  usage?: {
    output_tokens: number;
  };
}

// =============================================================================
// OpenAI Adapter
// =============================================================================

/**
 * OpenAI API adapter
 * Supports GPT-4, GPT-3.5, and compatible models
 */
export class OpenAIAdapter extends BaseAdapter {
  readonly name = 'openai';
  
  /** Model pricing per 1K tokens (USD) */
  protected pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    'gpt-4': { input: 30.0, output: 60.0 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    'gpt-4o-2024-08-06': { input: 2.5, output: 10.0 },
    'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 }
  };
  
  /** Model aliases mapping */
  private readonly modelAliases: Record<string, string> = {
    'smart': 'gpt-4o',
    'smart-latest': 'gpt-4o',
    'fast': 'gpt-4o-mini',
    'fast-latest': 'gpt-4o-mini',
    'cheap': 'gpt-4o-mini',
    'gpt4': 'gpt-4o',
    'gpt4-mini': 'gpt-4o-mini',
    'gpt3': 'gpt-3.5-turbo'
  };
  
  constructor(config: { apiKey: string; baseUrl?: string; defaultModel?: string }) {
    super({
      ...config,
      defaultModel: config.defaultModel || 'gpt-4o'
    });
  }
  
  /**
   * Map model alias to actual model ID
   */
  mapModel(alias: string): string {
    return this.modelAliases[alias] || alias;
  }
  
  /**
   * Transform request to OpenAI format
   */
  transformRequest(req: CompletionRequest): ProviderRequest {
    const mappedModel = this.mapModel(req.model);
    
    const openaiReq: Record<string, unknown> = {
      model: mappedModel,
      messages: this.mapMessages(req.messages)
    };
    
    if (req.max_tokens !== undefined) {
      openaiReq['max_tokens'] = req.max_tokens;
    }
    
    if (req.temperature !== undefined) {
      openaiReq['temperature'] = req.temperature;
    }
    
    if (req.top_p !== undefined) {
      openaiReq['top_p'] = req.top_p;
    }
    
    if (req.stop) {
      openaiReq['stop'] = req.stop;
    }
    
    if (req.presence_penalty !== undefined) {
      openaiReq['presence_penalty'] = req.presence_penalty;
    }
    
    if (req.frequency_penalty !== undefined) {
      openaiReq['frequency_penalty'] = req.frequency_penalty;
    }
    
    if (req.seed !== undefined) {
      openaiReq['seed'] = req.seed;
    }
    
    if (req.response_format) {
      openaiReq['response_format'] = req.response_format;
    }
    
    if (req.tools && req.tools.length > 0) {
      openaiReq['tools'] = this.mapTools(req.tools);
    }
    
    if (req.stream) {
      openaiReq['stream'] = true;
    }
    
    return openaiReq;
  }
  
  /**
   * Transform OpenAI response to standard format
   */
  transformResponse(res: ProviderResponse): CompletionResponse {
    const openaiRes = res as unknown as OpenAIResponse;
    const choice = openaiRes.choices[0];
    
    const toolCalls = choice.message.tool_calls?.map(tc => this.mapToolCall(tc));
    
    const usage: TokenUsage = {
      prompt_tokens: openaiRes.usage.prompt_tokens,
      completion_tokens: openaiRes.usage.completion_tokens,
      total_tokens: openaiRes.usage.total_tokens
    };
    
    return {
      id: openaiRes.id,
      model: openaiRes.model,
      provider: 'openai',
      content: choice.message.content || '',
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage,
      cost: this.calculateCost(usage),
      finishReason: choice.finish_reason as CompletionResponse['finishReason'],
      createdAt: new Date(openaiRes.created * 1000)
    };
  }
  
  /**
   * Transform OpenAI streaming chunk to standard format
   */
  transformStreamChunk(chunk: unknown): StreamChunk {
    const event = chunk as unknown as OpenAIStreamChunk;
    const choice = event.choices[0];
    
    if (!choice) {
      return {
        id: event.id,
        model: event.model,
        provider: 'openai',
        delta: '',
        done: true
      };
    }
    
    const delta = choice.delta;
    
    return {
      id: event.id,
      model: event.model,
      provider: 'openai',
      delta: delta.content || '',
      toolCalls: delta.tool_calls?.map(tc => ({
        id: tc.id || '',
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || ''
      })),
      finishReason: choice.finish_reason || undefined,
      done: !!choice.finish_reason
    };
  }
  
  /**
   * Map messages to OpenAI format
   */
  protected mapMessages(messages: Message[]): unknown[] {
    return messages.map(msg => {
      const mapped: Record<string, unknown> = {
        role: msg.role
      };
      
      if (msg.name) {
        mapped.name = msg.name;
      }
      
      if (typeof msg.content === 'string') {
        mapped.content = msg.content;
      } else {
        // Handle multimodal content
        mapped.content = msg.content.map(block => {
          if (block.type === 'text') {
            return { type: 'text', text: block.text };
          }
          if (block.type === 'image_url') {
            return {
              type: 'image_url',
              image_url: block.image_url
            };
          }
          return block;
        });
      }
      
      // Handle tool calls in assistant messages
      if (msg.tool_call_id) {
        mapped.tool_call_id = msg.tool_call_id;
      }
      
      return mapped;
    });
  }
  
  /**
   * Map tools to OpenAI format
   */
  protected mapTools(tools: Tool[]): unknown[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }
  
  /**
   * Map tool call from OpenAI format
   */
  protected mapToolCall(toolCall: unknown): ToolCall {
    const tc = toolCall as OpenAIToolCall;
    return {
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
      parsedArguments: JSON.parse(tc.function.arguments || '{}')
    };
  }
  
  /**
   * Get default base URL
   */
  protected getDefaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }
}

// =============================================================================
// OpenAI-specific Types
// =============================================================================

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: string | null;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Partial<OpenAIToolCall>[];
    };
    finish_reason: string | null;
  }[];
}

// =============================================================================
// Google/Gemini Adapter
// =============================================================================

/**
 * Google Gemini API adapter
 * Supports Gemini Pro and Flash models
 */
export class GoogleAdapter extends BaseAdapter {
  readonly name = 'google';
  
  /** Model pricing per 1K tokens (USD) */
  protected pricing: Record<string, { input: number; output: number }> = {
    'gemini-2.0-flash': { input: 0.075, output: 0.3 },
    'gemini-2.0-pro': { input: 1.25, output: 5.0 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    'gemini-1.5-pro': { input: 1.25, output: 5.0 },
    'gemini-1.0-pro': { input: 0.5, output: 1.5 }
  };
  
  /** Model aliases mapping */
  private readonly modelAliases: Record<string, string> = {
    'smart': 'gemini-2.0-pro',
    'smart-latest': 'gemini-2.0-pro',
    'fast': 'gemini-2.0-flash',
    'fast-latest': 'gemini-2.0-flash',
    'cheap': 'gemini-2.0-flash',
    'gemini-pro': 'gemini-2.0-pro',
    'gemini-flash': 'gemini-2.0-flash'
  };
  
  constructor(config: { apiKey: string; baseUrl?: string; defaultModel?: string }) {
    super({
      ...config,
      defaultModel: config.defaultModel || 'gemini-2.0-flash'
    });
  }
  
  /**
   * Map model alias to actual model ID
   */
  mapModel(alias: string): string {
    return this.modelAliases[alias] || alias;
  }
  
  /**
   * Transform request to Google Gemini format
   */
  transformRequest(req: CompletionRequest): ProviderRequest {
    const mappedModel = this.mapModel(req.model);
    
    // Extract system messages
    const systemMessages = req.messages.filter(m => m.role === 'system');
    const systemInstruction = systemMessages.length > 0
      ? systemMessages.map(m => typeof m.content === 'string' ? m.content : '').join('\n')
      : undefined;
    
    const geminiReq: Record<string, unknown> = {
      contents: this.mapMessages(req.messages)
    };
    
    if (systemInstruction) {
      geminiReq.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }
    
    const generationConfig: Record<string, unknown> = {};
    
    if (req.max_tokens !== undefined) {
      generationConfig.maxOutputTokens = req.max_tokens;
    }
    
    if (req.temperature !== undefined) {
      generationConfig.temperature = req.temperature;
    }
    
    if (req.top_p !== undefined) {
      generationConfig.topP = req.top_p;
    }
    
    if (req.top_k !== undefined) {
      generationConfig.topK = req.top_k;
    }
    
    if (req.stop) {
      generationConfig.stopSequences = Array.isArray(req.stop) ? req.stop : [req.stop];
    }
    
    if (Object.keys(generationConfig).length > 0) {
      geminiReq.generationConfig = generationConfig;
    }
    
    if (req.tools && req.tools.length > 0) {
      geminiReq.tools = this.mapTools(req.tools);
    }
    
    return geminiReq;
  }
  
  /**
   * Transform Gemini response to standard format
   */
  transformResponse(res: ProviderResponse): CompletionResponse {
    const geminiRes = res as unknown as GeminiResponse;
    const candidate = geminiRes.candidates[0];
    const content = candidate.content;
    
    const textParts = content.parts
      .filter(p => 'text' in p)
      .map(p => p.text)
      .join('');
    
    const functionCalls = content.parts
      .filter(p => 'functionCall' in p)
      .map(p => p.functionCall)
      .filter(Boolean);
    
    const toolCalls = functionCalls.map(fc => ({
      id: fc.name,
      name: fc.name,
      arguments: JSON.stringify(fc.args || {}),
      parsedArguments: fc.args
    }));
    
    const usage: TokenUsage = {
      prompt_tokens: geminiRes.usageMetadata?.promptTokenCount || 0,
      completion_tokens: geminiRes.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: (geminiRes.usageMetadata?.promptTokenCount || 0) + 
                    (geminiRes.usageMetadata?.candidatesTokenCount || 0),
      cache_read_tokens: geminiRes.usageMetadata?.cachedContentTokenCount
    };
    
    return {
      id: this.generateId('gemini'),
      model: '', // Will be filled by proxy
      provider: 'google',
      content: textParts,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      cost: this.calculateCost(usage),
      finishReason: this.mapFinishReason(candidate.finishReason)
    };
  }
  
  /**
   * Transform Gemini streaming chunk to standard format
   */
  transformStreamChunk(chunk: unknown): StreamChunk {
    const event = chunk as unknown as GeminiStreamChunk;
    const candidate = event.candidates?.[0];
    
    if (!candidate) {
      return {
        id: '',
        model: '',
        provider: 'google',
        delta: '',
        done: true
      };
    }
    
    const text = candidate.content?.parts
      ?.filter(p => 'text' in p)
      .map(p => p.text)
      .join('') || '';
    
    return {
      id: candidate.index?.toString() || '',
      model: '',
      provider: 'google',
      delta: text,
      finishReason: candidate.finishReason,
      done: !!candidate.finishReason
    };
  }
  
  /**
   * Map messages to Gemini format
   */
  protected mapMessages(messages: Message[]): unknown[] {
    // Group messages by role for Gemini's alternating user/model format
    const grouped: { role: string; parts: unknown[] }[] = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') continue; // Handled separately
      
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
      
      if (grouped.length > 0 && grouped[grouped.length - 1].role === geminiRole) {
        // Append to existing group
        const parts = this.mapMessageContent(msg);
        grouped[grouped.length - 1].parts.push(...parts);
      } else {
        // Create new group
        grouped.push({
          role: geminiRole,
          parts: this.mapMessageContent(msg)
        });
      }
    }
    
    return grouped.map(g => ({
      role: g.role,
      parts: g.parts
    }));
  }
  
  /**
   * Map message content to Gemini parts
   */
  private mapMessageContent(msg: Message): unknown[] {
    if (typeof msg.content === 'string') {
      return [{ text: msg.content }];
    }
    
    return msg.content.map(block => {
      if (block.type === 'text') {
        return { text: block.text };
      }
      
      if (block.type === 'image' && block.source?.type === 'base64') {
        return {
          inlineData: {
            mimeType: block.source.media_type,
            data: block.source.data
          }
        };
      }
      
      if (block.type === 'tool_use' || block.type === 'tool_result') {
        // Function calls are handled differently in Gemini
        return { text: `[${block.type}: ${block.name}]` };
      }
      
      return { text: '' };
    });
  }
  
  /**
   * Map tools to Gemini format
   */
  protected mapTools(tools: Tool[]): unknown[] {
    return tools.map(tool => ({
      functionDeclarations: [{
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }]
    }));
  }
  
  /**
   * Map tool call from Gemini format (handled in transformResponse)
   */
  protected mapToolCall(_toolCall: unknown): ToolCall {
    // Tool calls are handled differently in Gemini's response format
    return {
      id: '',
      name: '',
      arguments: '{}'
    };
  }
  
  /**
   * Map Gemini finish reason to standard format
   */
  private mapFinishReason(reason: string): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      default:
        return null;
    }
  }
  
  /**
   * Get default base URL
   */
  protected getDefaultBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
}

// =============================================================================
// Gemini-specific Types
// =============================================================================

interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    cachedContentTokenCount?: number;
  };
}

interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
    role: string;
  };
  finishReason: string;
  index: number;
  safetyRatings?: unknown[];
}

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
}

// =============================================================================
// Groq Adapter
// =============================================================================

/**
 * Groq API adapter
 * Fast inference for open-source models
 */
export class GroqAdapter extends BaseAdapter {
  readonly name = 'groq';
  
  /** Model pricing per 1K tokens (USD) */
  protected pricing: Record<string, { input: number; output: number }> = {
    'llama-3.1-405b-reasoning': { input: 0.59, output: 0.79 },
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
    'gemma2-9b-it': { input: 0.20, output: 0.20 },
    'llama3-70b-8192': { input: 0.59, output: 0.79 },
    'llama3-8b-8192': { input: 0.05, output: 0.08 }
  };
  
  /** Model aliases mapping */
  private readonly modelAliases: Record<string, string> = {
    'smart': 'llama-3.1-405b-reasoning',
    'fast': 'llama-3.1-8b-instant',
    'cheap': 'gemma2-9b-it',
    'llama-405b': 'llama-3.1-405b-reasoning',
    'llama-70b': 'llama-3.1-70b-versatile',
    'llama-8b': 'llama-3.1-8b-instant',
    'mixtral': 'mixtral-8x7b-32768',
    'gemma': 'gemma2-9b-it'
  };
  
  constructor(config: { apiKey: string; baseUrl?: string; defaultModel?: string }) {
    super({
      ...config,
      defaultModel: config.defaultModel || 'llama-3.1-70b-versatile'
    });
  }
  
  /**
   * Map model alias to actual model ID
   */
  mapModel(alias: string): string {
    return this.modelAliases[alias] || alias;
  }
  
  /**
   * Transform request to Groq format (OpenAI-compatible)
   */
  transformRequest(req: CompletionRequest): ProviderRequest {
    const mappedModel = this.mapModel(req.model);
    
    const groqReq: Record<string, unknown> = {
      model: mappedModel,
      messages: this.mapMessages(req.messages)
    };
    
    if (req.max_tokens !== undefined) {
      groqReq.max_tokens = req.max_tokens;
    }
    
    if (req.temperature !== undefined) {
      groqReq.temperature = req.temperature;
    }
    
    if (req.top_p !== undefined) {
      groqReq.top_p = req.top_p;
    }
    
    if (req.stop) {
      groqReq.stop = req.stop;
    }
    
    if (req.tools && req.tools.length > 0) {
      groqReq.tools = this.mapTools(req.tools);
    }
    
    if (req.stream) {
      groqReq.stream = true;
    }
    
    return groqReq;
  }
  
  /**
   * Transform Groq response to standard format (OpenAI-compatible)
   */
  transformResponse(res: ProviderResponse): CompletionResponse {
    const groqRes = res as unknown as OpenAIResponse;
    const choice = groqRes.choices[0];
    
    const toolCalls = choice.message.tool_calls?.map(tc => this.mapToolCall(tc));
    
    const usage: TokenUsage = {
      prompt_tokens: groqRes.usage.prompt_tokens,
      completion_tokens: groqRes.usage.completion_tokens,
      total_tokens: groqRes.usage.total_tokens
    };
    
    return {
      id: groqRes.id,
      model: groqRes.model,
      provider: 'groq',
      content: choice.message.content || '',
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage,
      cost: this.calculateCost(usage),
      finishReason: choice.finish_reason as CompletionResponse['finishReason'],
      createdAt: new Date(groqRes.created * 1000)
    };
  }
  
  /**
   * Transform Groq streaming chunk to standard format
   */
  transformStreamChunk(chunk: unknown): StreamChunk {
    // Groq uses OpenAI-compatible streaming
    const event = chunk as unknown as OpenAIStreamChunk;
    const choice = event.choices[0];
    
    if (!choice) {
      return {
        id: event.id,
        model: event.model,
        provider: 'groq',
        delta: '',
        done: true
      };
    }
    
    const delta = choice.delta;
    
    return {
      id: event.id,
      model: event.model,
      provider: 'groq',
      delta: delta.content || '',
      toolCalls: delta.tool_calls?.map(tc => ({
        id: tc.id || '',
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || ''
      })),
      finishReason: choice.finish_reason || undefined,
      done: !!choice.finish_reason
    };
  }
  
  /**
   * Map messages to Groq format (OpenAI-compatible)
   */
  protected mapMessages(messages: Message[]): unknown[] {
    return messages.map(msg => {
      const mapped: Record<string, unknown> = {
        role: msg.role
      };
      
      if (typeof msg.content === 'string') {
        mapped.content = msg.content;
      } else {
        mapped.content = msg.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
      }
      
      if (msg.tool_call_id) {
        mapped.tool_call_id = msg.tool_call_id;
      }
      
      return mapped;
    });
  }
  
  /**
   * Map tools to Groq format (OpenAI-compatible)
   */
  protected mapTools(tools: Tool[]): unknown[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }
  
  /**
   * Map tool call from Groq format (OpenAI-compatible)
   */
  protected mapToolCall(toolCall: unknown): ToolCall {
    const tc = toolCall as OpenAIToolCall;
    return {
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
      parsedArguments: JSON.parse(tc.function.arguments || '{}')
    };
  }
  
  /**
   * Get default base URL
   */
  protected getDefaultBaseUrl(): string {
    return 'https://api.groq.com/openai/v1';
  }
}

// =============================================================================
// Adapter Factory
// =============================================================================

/**
 * Factory function to create the appropriate adapter
 */
export function createAdapter(
  providerType: string,
  config: { apiKey: string; baseUrl?: string; defaultModel?: string }
): ProviderAdapter {
  switch (providerType) {
    case 'anthropic':
      return new AnthropicAdapter(config);
    case 'openai':
      return new OpenAIAdapter(config);
    case 'google':
      return new GoogleAdapter(config);
    case 'groq':
      return new GroqAdapter(config);
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}

/**
 * Get all available adapter types
 */
export function getAvailableAdapters(): string[] {
  return ['anthropic', 'openai', 'google', 'groq'];
}
