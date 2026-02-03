/**
 * Provider and model types for the Dash AI package
 */

export type ProviderName = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq';

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderName;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  capabilities: string[];
}

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  priority: number;
  enabled: boolean;
}

export interface AIRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AIResponse {
  id: string;
  content: string;
  provider: ProviderName;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface FailoverConfig {
  maxRetries: number;
  retryDelayMs: number;
  fallbackOrder: ProviderName[];
}

export interface SwarmContext {
  availableProviders: ProviderName[];
  currentLoad: Record<ProviderName, number>;
  lastUsed: Record<ProviderName, number>;
}
