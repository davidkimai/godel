/**
 * Provider Adapters for LLM Proxy
 */

import {
  CompletionRequest, CompletionResponse, StreamChunk,
  ProviderRequest, ProviderResponse, Message, Tool, ToolCall, TokenUsage, ProviderAdapter
} from './types';

export { ProviderAdapter };

export class AnthropicAdapter implements ProviderAdapter {
  name = 'anthropic';
  private apiKey: string;
  private baseUrl: string;
  private pricing: { inputPer1k: number; outputPer1k: number };

  constructor(apiKey: string, baseUrl: string = 'https://api.anthropic.com', pricing = { inputPer1k: 0.015, outputPer1k: 0.075 }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.pricing = pricing;
  }

  transformRequest(req: CompletionRequest): ProviderRequest {
    return {
      model: this.mapModel(req.model),
      messages: this.mapMessages(req.messages),
      max_tokens: req.max_tokens || 4096,
      temperature: req.temperature,
      tools: req.tools ? this.mapTools(req.tools) : undefined,
      stream: req.stream
    };
  }

  transformResponse(res: ProviderResponse): CompletionResponse {
    const content = res.content.find(c => c.type === 'text');
    const toolCalls = res.content.find(c => c.type === 'tool_calls')?.tool_calls;
    
    return {
      id: res.id,
      model: res.model,
      provider: 'anthropic',
      content: content?.text || '',
      toolCalls: toolCalls?.map(this.mapToolCall),
      usage: {
        prompt_tokens: res.usage.input_tokens,
        completion_tokens: res.usage.output_tokens,
        total_tokens: res.usage.input_tokens + res.usage.output_tokens
      },
      cost: this.calculateCost({
        prompt_tokens: res.usage.input_tokens,
        completion_tokens: res.usage.output_tokens,
        total_tokens: res.usage.input_tokens + res.usage.output_tokens
      }),
      finishReason: res.stop_reason
    };
  }

  transformStreamChunk(chunk: any): StreamChunk | null {
    if (chunk.type === 'content_block_delta') {
      return {
        id: chunk.message?.id || 'unknown',
        model: chunk.message?.model || 'unknown',
        provider: 'anthropic',
        delta: chunk.delta?.text || ''
      };
    }
    if (chunk.type === 'message_stop') {
      return {
        id: chunk.message?.id || 'unknown',
        model: chunk.message?.model || 'unknown',
        provider: 'anthropic',
        delta: '',
        finishReason: chunk.stop_reason
      };
    }
    return null;
  }

  async checkHealth(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/v1/health`, {
        headers: { 'x-api-key': this.apiKey }
      });
      return { healthy: response.ok, latency: Date.now() - start };
    } catch {
      return { healthy: false, latency: Date.now() - start };
    }
  }

  calculateCost(usage: TokenUsage): number {
    return (usage.prompt_tokens / 1000) * this.pricing.inputPer1k +
           (usage.completion_tokens / 1000) * this.pricing.outputPer1k;
  }

  private mapModel(model: string): string {
    const modelMap: Record<string, string> = {
      'smart': 'claude-opus-4-5-20251101',
      'fast': 'claude-sonnet-4-5-20251101',
      'cheap': 'claude-haiku-3-5-20251101'
    };
    return modelMap[model] || model;
  }

  private mapMessages(messages: Message[]): any[] {
    return messages.map(m => ({
      role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));
  }

  private mapTools(tools: Tool[]): any[] {
    return tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters
    }));
  }

  private mapToolCall(tc: any): ToolCall {
    return {
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.input) }
    };
  }
}

export class OpenAIAdapter implements ProviderAdapter {
  name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private pricing: { inputPer1k: number; outputPer1k: number };

  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com', pricing = { inputPer1k: 0.005, outputPer1k: 0.015 }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.pricing = pricing;
  }

  transformRequest(req: CompletionRequest): ProviderRequest {
    return {
      model: this.mapModel(req.model),
      messages: req.messages,
      max_tokens: req.max_tokens,
      temperature: req.temperature,
      tools: req.tools,
      stream: req.stream
    };
  }

  transformResponse(res: any): CompletionResponse {
    return {
      id: res.id,
      model: res.model,
      provider: 'openai',
      content: res.choices[0]?.message?.content || '',
      toolCalls: res.choices[0]?.message?.tool_calls,
      usage: res.usage,
      cost: this.calculateCost(res.usage),
      finishReason: res.choices[0]?.finish_reason
    };
  }

  transformStreamChunk(chunk: any): StreamChunk | null {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return null;
    return {
      id: chunk.id,
      model: chunk.model,
      provider: 'openai',
      delta: delta.content || '',
      toolCalls: delta.tool_calls,
      finishReason: chunk.choices?.[0]?.finish_reason
    };
  }

  async checkHealth(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return { healthy: response.ok, latency: Date.now() - start };
    } catch {
      return { healthy: false, latency: Date.now() - start };
    }
  }

  calculateCost(usage: TokenUsage): number {
    return (usage.prompt_tokens / 1000) * this.pricing.inputPer1k +
           (usage.completion_tokens / 1000) * this.pricing.outputPer1k;
  }

  private mapModel(model: string): string {
    const modelMap: Record<string, string> = { 'gpt4': 'gpt-4o', 'gpt4-turbo': 'gpt-4-turbo-preview' };
    return modelMap[model] || model;
  }
}

export function createAdapter(provider: string, apiKey: string, baseUrl?: string, pricing?: any): ProviderAdapter {
  switch (provider) {
    case 'anthropic': return new AnthropicAdapter(apiKey, baseUrl, pricing);
    case 'openai': return new OpenAIAdapter(apiKey, baseUrl, pricing);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}
