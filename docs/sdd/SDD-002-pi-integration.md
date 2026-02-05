# SDD-002: Pi Core Primitives Technical Specification

**Version:** 1.0.0
**Status:** DRAFT
**Created:** 2026-02-04
**Based on:** PRD-002
**Owner:** Dash v2.0 - Core Integration

## 1. Overview

This document provides detailed technical specifications for integrating `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent` as core primitives of Dash.

## 2. Data Types

### 2.1 Core Types

```typescript
// src/llm/types.ts

/**
 * Unified LLM Model representation
 */
export interface UnifiedModel {
  /** Provider identifier (e.g., 'openai', 'anthropic') */
  provider: string;
  
  /** Model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-20250514') */
  modelId: string;
  
  /** Model capabilities */
  capabilities: ModelCapabilities;
  
  /** Cost per 1M tokens */
  pricing: ModelPricing;
}

/**
 * Model capabilities
 */
export interface ModelCapabilities {
  /** Supports image input */
  vision: boolean;
  
  /** Supports reasoning/thinking */
  reasoning: boolean;
  
  /** Supports tool calling */
  tools: boolean;
  
  /** Maximum output tokens */
  maxTokens: number;
  
  /** Context window size in tokens */
  contextWindow: number;
}

/**
 * Model pricing (USD per 1M tokens)
 */
export interface ModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Stream event types from pi-ai
 */
export type StreamEvent =
  | { type: 'start'; partial: AssistantMessage }
  | { type: 'text_start'; contentIndex: number }
  | { type: 'text_delta'; delta: string; contentIndex: number }
  | { type: 'text_end'; content: string; contentIndex: number }
  | { type: 'thinking_start'; contentIndex: number }
  | { type: 'thinking_delta'; delta: string; contentIndex: number }
  | { type: 'thinking_end'; thinking: string; contentIndex: number }
  | { type: 'toolcall_start'; contentIndex: number }
  | { type: 'toolcall_delta'; delta: string; contentIndex: number }
  | { type: 'toolcall_end'; toolCall: ToolCall; contentIndex: number }
  | { type: 'done'; reason: StopReason; message: AssistantMessage }
  | { type: 'error'; reason: 'error' | 'aborted'; error: AssistantMessage };

/**
 * Assistant message with content blocks
 */
export interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
  stopReason: StopReason;
  usage: Usage;
  errorMessage?: string;
}

/**
 * Content block types
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'toolResult'; toolCallId: string; result: unknown };

/**
 * Stop reasons
 */
export type StopReason =
  | 'stop'           // Normal completion
  | 'length'         // Token limit reached
  | 'toolUse'        // Model wants to call tools
  | 'error'          // Generation error
  | 'aborted';       // Request cancelled

/**
 * Token usage and cost
 */
export interface Usage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

/**
 * Tool call representation
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

### 2.2 Context Types

```typescript
// src/context/types.ts

/**
 * Extended context with Dash metadata
 */
export interface DashContext {
  /** System prompt */
  systemPrompt?: string;
  
  /** Conversation messages */
  messages: Message[];
  
  /** Available tools */
  tools: Tool[];
  
  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Message with role and content
 */
export interface Message {
  role: 'user' | 'assistant' | 'toolResult' | 'system';
  content: ContentBlock[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  timestamp: number;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  sessionId: string;
  branchId?: string;
  parentSessionId?: string;
  createdAt: number;
  lastActiveAt: number;
  totalTokens: number;
  totalCost: number;
  modelId: string;
  provider: string;
  displayName?: string;
}

/**
 * Tool definition (from pi-ai)
 */
export interface Tool {
  name: string;
  description: string;
  parameters: unknown; // TypeBox schema
}

/**
 * Session tree node
 */
export interface SessionNode {
  id: string;
  parentId: string | null;
  branchName?: string;
  messages: Message[];
  children: string[];
  createdAt: number;
}
```

### 2.3 Provider Types

```typescript
// src/providers/types.ts

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Provider name */
  name: string;
  
  /** Provider display name */
  displayName: string;
  
  /** Environment variable for API key */
  apiKeyEnv: string;
  
  /** OAuth support */
  oauth?: {
    provider: OAuthProvider;
    scopes?: string[];
  };
  
  /** Available models */
  models: ModelConfig[];
  
  /** Default model */
  defaultModel: string;
}

/**
 * OAuth provider types
 */
export type OAuthProvider =
  | 'anthropic'
  | 'openai-codex'
  | 'github-copilot'
  | 'google-gemini-cli'
  | 'google-antigravity';

/**
 * Model configuration
 */
export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  capabilities: ModelCapabilities;
  pricing: ModelPricing;
}

/**
 * API authentication
 */
export type AuthMethod =
  | { type: 'env'; variable: string }
  | { type: 'apiKey'; key: string }
  | { type: 'oauth'; credentials: OAuthCredentials };

/**
 * OAuth credentials
 */
export interface OAuthCredentials {
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
  provider: OAuthProvider;
}
```

## 3. Component Specifications

### 3.1 UnifiedModel Class

```typescript
// src/llm/unified-model.ts

import { getModel, stream, complete, Context, Tool } from '@mariozechner/pi-ai';
import { EventEmitter } from 'events';
import { DashContext } from '../context/types.js';
import { ModelCapabilities, ModelPricing, StopReason } from './types.js';
import { StreamEvent, AssistantMessage, Usage } from './types.js';
import { ToolExecutor } from './tool-executor.js';

export class UnifiedModel extends EventEmitter {
  private model: ReturnType<typeof getModel>;
  private toolExecutor: ToolExecutor;
  
  constructor(
    provider: string,
    modelId: string,
    toolExecutor?: ToolExecutor
  ) {
    super();
    this.model = getModel(provider, modelId);
    this.toolExecutor = toolExecutor || new ToolExecutor();
  }
  
  /**
   * Get model capabilities
   */
  get capabilities(): ModelCapabilities {
    return {
      vision: this.model.input.includes('image'),
      reasoning: !!this.model.reasoning,
      tools: true, // All pi-ai models support tools
      maxTokens: this.model.maxTokens,
      contextWindow: this.model.contextWindow
    };
  }
  
  /**
   * Get model pricing
   */
  get pricing(): ModelPricing {
    return {
      input: this.model.cost.input,
      output: this.model.cost.output,
      cacheRead: this.model.cost.cacheRead,
      cacheWrite: this.model.cost.cacheWrite
    };
  }
  
  /**
   * Get model info
   */
  get modelInfo() {
    return {
      provider: this.model.provider,
      modelId: this.model.id,
      name: this.model.name,
      api: this.model.api,
      ...this.capabilities,
      ...this.pricing
    };
  }
  
  /**
   * Stream completion
   */
  async *stream(context: DashContext): AsyncGenerator<StreamEvent> {
    const piContext = this.toPiContext(context);
    const events = stream(this.model, piContext);
    
    for await (const event of events) {
      // Handle tool calls
      if (event.type === 'toolcall_end') {
        const result = await this.executeTool(event.toolCall);
        context.messages.push(this.toToolResultMessage(event.toolCall, result));
        
        // Emit tool execution event
        this.emit('toolCall', {
          toolCall: event.toolCall,
          result
        });
      }
      
      yield this.mapEvent(event, context);
    }
  }
  
  /**
   * Complete without streaming
   */
  async complete(context: DashContext): Promise<AssistantMessage> {
    const piContext = this.toPiContext(context);
    
    const response = await complete(this.model, piContext);
    
    // Execute any tool calls
    const toolCalls = response.content.filter(
      (b): b is Extract<ContentBlock, { type: 'toolCall' }> =>
        b.type === 'toolCall'
    );
    
    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall);
      context.messages.push(this.toToolResultMessage(toolCall, result));
    }
    
    return response;
  }
  
  /**
   * Convert Dash context to pi-ai context
   */
  private toPiContext(context: DashContext): Context {
    return {
      systemPrompt: context.systemPrompt,
      messages: context.messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'tool-result',
        content: m.content.map(c => {
          if (c.type === 'text') return { type: 'text' as const, text: c.text };
          if (c.type === 'thinking') return { type: 'text' as const, text: `<thinking>${c.thinking}</thinking>` };
          if (c.type === 'toolCall') return { type: 'tool-call' as const, id: c.id, name: c.name, arguments: c.arguments };
          return c;
        })
      })),
      tools: context.tools as Tool[]
    };
  }
  
  /**
   * Map pi-ai events to Dash events
   */
  private mapEvent(event: any, context: DashContext): StreamEvent {
    return event;
  }
  
  /**
   * Execute a tool call
   */
  private async executeTool(toolCall: ToolCall): Promise<unknown> {
    return this.toolExecutor.execute(toolCall.name, toolCall.arguments);
  }
  
  /**
   * Convert tool call to tool result message
   */
  private toToolResultMessage(
    toolCall: ToolCall,
    result: unknown
  ): Message {
    return {
      role: 'toolResult',
      content: [{
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result)
      }],
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      isError: result instanceof Error,
      timestamp: Date.now()
    };
  }
}
```

### 3.2 ToolExecutor Class

```typescript
// src/llm/tool-executor.ts

import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ToolExecutor {
  private tools: Map<string, ToolHandler> = new Map();
  
  constructor() {
    this.registerDefaultTools();
  }
  
  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    this.register('read', this.readFile.bind(this));
    this.register('write', this.writeFile.bind(this));
    this.register('edit', this.editFile.bind(this));
    this.register('bash', this.runBash.bind(this));
  }
  
  /**
   * Register a tool handler
   */
  register(name: string, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }
  
  /**
   * Execute a tool by name
   */
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const handler = this.tools.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args);
  }
  
  /**
   * Read file tool
   */
  private async readFile(args: { path: string; offset?: number; limit?: number }): Promise<string> {
    const { path, offset, limit } = args;
    const content = await fs.readFile(path, 'utf-8');
    
    if (offset !== undefined || limit !== undefined) {
      const start = offset || 0;
      const end = limit ? start + limit : undefined;
      return content.substring(start, end);
    }
    
    return content;
  }
  
  /**
   * Write file tool
   */
  private async writeFile(args: { path: string; content: string }): Promise<string> {
    await fs.writeFile(args.path, args.content, 'utf-8');
    return `File written: ${args.path}`;
  }
  
  /**
   * Edit file tool
   */
  private async editFile(args: { path: string; oldText: string; newText: string }): Promise<string> {
    const content = await fs.readFile(args.path, 'utf-8');
    const newContent = content.replace(args.oldText, args.newText);
    await fs.writeFile(args.path, newContent, 'utf-8');
    return `File edited: ${args.path}`;
  }
  
  /**
   * Bash command tool
   */
  private async runBash(args: { command: string; timeout?: number }): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(args.command, {
        timeout: args.timeout || 30000
      });
      return stdout || stderr;
    } catch (error) {
      if (error instanceof Error && 'stdout' in error) {
        return (error as any).stdout || String(error);
      }
      throw error;
    }
  }
}

/**
 * Tool handler function type
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
```

### 3.3 ProviderRegistry Class

```typescript
// src/providers/registry.ts

import { getProviders, getModels, getModel, Model } from '@mariozechner/pi-ai';
import { ProviderConfig, ModelConfig, AuthMethod } from './types.js';

export class ProviderRegistry {
  private providers: Map<string, ProviderConfig> = new Map();
  private models: Map<string, Model> = new Map();
  
  constructor() {
    this.initializeProviders();
  }
  
  /**
   * Initialize all available providers
   */
  private initializeProviders(): void {
    const piProviders = getProviders();
    
    for (const providerId of piProviders) {
      const piModels = getModels(providerId as any);
      
      const models: ModelConfig[] = piModels.map(m => ({
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        capabilities: {
          vision: m.input.includes('image'),
          reasoning: !!m.reasoning,
          tools: true,
          maxTokens: m.maxTokens,
          contextWindow: m.contextWindow
        },
        pricing: {
          input: m.cost.input,
          output: m.cost.output,
          cacheRead: m.cost.cacheRead,
          cacheWrite: m.cost.cacheWrite
        }
      }));
      
      this.providers.set(providerId, {
        name: providerId,
        displayName: this.formatProviderName(providerId),
        apiKeyEnv: this.getEnvForProvider(providerId),
        models,
        defaultModel: models[0]?.id || ''
      });
      
      for (const model of models) {
        this.models.set(`${providerId}/${model.id}`, getModel(providerId as any, model.id));
      }
    }
  }
  
  /**
   * Get provider configuration
   */
  getProvider(providerId: string): ProviderConfig | undefined {
    return this.providers.get(providerId);
  }
  
  /**
   * Get all providers
   */
  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Get model configuration
   */
  getModel(providerId: string, modelId: string): ModelConfig | undefined {
    return this.providers.get(providerId)?.models.find(m => m.id === modelId);
  }
  
  /**
   * Get all models for a provider
   */
  getProviderModels(providerId: string): ModelConfig[] {
    return this.providers.get(providerId)?.models || [];
  }
  
  /**
   * Format provider name for display
   */
  private formatProviderName(providerId: string): string {
    const names: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      google_vertex: 'Google Vertex AI',
      mistral: 'Mistral',
      groq: 'Groq',
      cerebras: 'Cerebras',
      xai: 'xAI',
      openrouter: 'OpenRouter',
      bedrock: 'Amazon Bedrock'
    };
    return names[providerId] || providerId;
  }
  
  /**
   * Get environment variable for provider
   */
  private getEnvForProvider(providerId: string): string {
    const envs: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GEMINI_API_KEY',
      google_vertex: 'GOOGLE_CLOUD_PROJECT',
      mistral: 'MISTRAL_API_KEY',
      groq: 'GROQ_API_KEY',
      cerebras: 'CEREBRAS_API_KEY',
      xai: 'XAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY'
    };
    return envs[providerId] || `${providerId.toUpperCase()}_API_KEY`;
  }
}
```

### 3.4 CostTracker Class

```typescript
// src/cost/tracker.ts

import { Usage } from '../llm/types.js';

export interface CostMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  totalTokens: number;
}

export interface SessionCost {
  sessionId: string;
  provider: string;
  modelId: string;
  metrics: CostMetrics;
  timestamp: number;
}

export class CostTracker {
  private sessionCosts: Map<string, SessionCost> = new Map();
  private totalMetrics: CostMetrics = this.emptyMetrics();
  
  /**
   * Empty metrics template
   */
  private emptyMetrics(): CostMetrics {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      inputCost: 0,
      outputCost: 0,
      cacheReadCost: 0,
      cacheWriteCost: 0,
      totalCost: 0,
      totalTokens: 0
    };
  }
  
  /**
   * Record usage for a session
   */
  recordUsage(
    sessionId: string,
    provider: string,
    modelId: string,
    usage: Usage
  ): void {
    const existing = this.sessionCosts.get(sessionId);
    const metrics = this.calculateMetrics(usage);
    
    if (existing) {
      existing.metrics = this.addMetrics(existing.metrics, metrics);
      existing.timestamp = Date.now();
    } else {
      this.sessionCosts.set(sessionId, {
        sessionId,
        provider,
        modelId,
        metrics,
        timestamp: Date.now()
      });
    }
    
    this.totalMetrics = this.addMetrics(this.totalMetrics, metrics);
  }
  
  /**
   * Calculate cost metrics from usage
   */
  private calculateMetrics(usage: Usage): CostMetrics {
    return {
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead || 0,
      cacheWriteTokens: usage.cacheWrite || 0,
      inputCost: usage.cost.input,
      outputCost: usage.cost.output,
      cacheReadCost: usage.cost.cacheRead || 0,
      cacheWriteCost: usage.cost.cacheWrite || 0,
      totalCost: usage.cost.total,
      totalTokens: usage.input + usage.output
    };
  }
  
  /**
   * Add two metric sets
   */
  private addMetrics(a: CostMetrics, b: CostMetrics): CostMetrics {
    return {
      inputTokens: a.inputTokens + b.inputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
      cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
      cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
      inputCost: a.inputCost + b.inputCost,
      outputCost: a.outputCost + b.outputCost,
      cacheReadCost: a.cacheReadCost + b.cacheReadCost,
      cacheWriteCost: a.cacheWriteCost + b.cacheWriteCost,
      totalCost: a.totalCost + b.totalCost,
      totalTokens: a.totalTokens + b.totalTokens
    };
  }
  
  /**
   * Get cost for a specific session
   */
  getSessionCost(sessionId: string): CostMetrics | undefined {
    return this.sessionCosts.get(sessionId)?.metrics;
  }
  
  /**
   * Get all session costs
   */
  getAllSessionCosts(): SessionCost[] {
    return Array.from(this.sessionCosts.values());
  }
  
  /**
   * Get total cost across all sessions
   */
  getTotalCost(): CostMetrics {
    return { ...this.totalMetrics };
  }
  
  /**
   * Get cost by provider
   */
  getCostByProvider(): Map<string, CostMetrics> {
    const byProvider = new Map<string, CostMetrics>();
    
    for (const session of this.sessionCosts.values()) {
      const existing = byProvider.get(session.provider) || this.emptyMetrics();
      byProvider.set(session.provider, this.addMetrics(existing, session.metrics));
    }
    
    return byProvider;
  }
  
  /**
   * Reset tracker
   */
  reset(): void {
    this.sessionCosts.clear();
    this.totalMetrics = this.emptyMetrics();
  }
}
```

### 3.5 SessionManager Class

```typescript
// src/agent/session-manager.ts

import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager as PiSessionManager
} from '@mariozechner/pi-coding-agent';
import { DashContext, SessionNode, Message } from '../context/types.js';

export interface SessionOptions {
  modelProvider?: string;
  modelId?: string;
  systemPrompt?: string;
  displayName?: string;
}

export interface SessionResult {
  sessionId: string;
  session: any;
  context: DashContext;
}

export class DashSessionManager {
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private sessions: Map<string, SessionResult> = new Map();
  private sessionNodes: Map<string, SessionNode> = new Map();
  
  constructor() {
    this.authStorage = new AuthStorage();
    this.modelRegistry = new ModelRegistry(this.authStorage);
  }
  
  /**
   * Create a new session
   */
  async create(options: SessionOptions = {}): Promise<SessionResult> {
    const provider = options.modelProvider || 'anthropic';
    const modelId = options.modelId || 'claude-sonnet-4-20250514';
    
    const piResult = await createAgentSession({
      sessionManager: PiSessionManager.inMemory(),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
    });
    
    const sessionId = crypto.randomUUID();
    const context: DashContext = {
      systemPrompt: options.systemPrompt,
      messages: [],
      tools: [],
      metadata: {
        sessionId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        totalTokens: 0,
        totalCost: 0,
        modelId,
        provider,
        displayName: options.displayName
      }
    };
    
    const node: SessionNode = {
      id: sessionId,
      parentId: null,
      messages: [],
      children: [],
      createdAt: Date.now()
    };
    
    this.sessions.set(sessionId, {
      sessionId,
      session: piResult.session,
      context
    });
    
    this.sessionNodes.set(sessionId, node);
    
    return this.sessions.get(sessionId)!;
  }
  
  /**
   * Send a prompt to a session
   */
  async prompt(sessionId: string, message: string): Promise<string> {
    const result = this.sessions.get(sessionId);
    if (!result) throw new Error(`Session not found: ${sessionId}`);
    
    // Add user message
    result.context.messages.push({
      role: 'user',
      content: [{ type: 'text', text: message }],
      timestamp: Date.now()
    });
    
    // Send to pi session
    const response = await result.session.prompt(message);
    
    // Add assistant response
    result.context.messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: response }],
      timestamp: Date.now()
    });
    
    // Update metadata
    result.context.metadata.lastActiveAt = Date.now();
    
    return response;
  }
  
  /**
   * Continue from last point
   */
  async continue(sessionId: string): Promise<string> {
    const result = this.sessions.get(sessionId);
    if (!result) throw new Error(`Session not found: ${sessionId}`);
    
    return result.session.continue();
  }
  
  /**
   * Create a branch from current session
   */
  async branch(
    parentId: string,
    name?: string
  ): Promise<SessionResult> {
    const parent = this.sessions.get(parentId);
    if (!parent) throw new Error(`Parent session not found: ${parentId}`);
    
    // Create new session with copied context
    const branch = await this.create({
      modelProvider: parent.context.metadata.provider,
      modelId: parent.context.metadata.modelId,
      systemPrompt: parent.context.systemPrompt,
      displayName: name
    });
    
    // Copy messages to new context
    branch.context.messages = [...parent.context.messages];
    
    // Link nodes
    const parentNode = this.sessionNodes.get(parentId)!;
    const branchNode = this.sessionNodes.get(branch.sessionId)!;
    
    branchNode.parentId = parentId;
    branchNode.messages = [...parentNode.messages];
    parentNode.children.push(branch.sessionId);
    
    return branch;
  }
  
  /**
   * Get session tree
   */
  getTree(rootId?: string): SessionNode | null {
    const allNodes = Array.from(this.sessionNodes.values());
    
    if (rootId) {
      return this.sessionNodes.get(rootId) || null;
    }
    
    // Return root nodes (no parent)
    return allNodes.find(n => n.parentId === null) || null;
  }
  
  /**
   * Get full history for a session
   */
  getHistory(sessionId: string): Message[] {
    const result = this.sessions.get(sessionId);
    return result?.context.messages || [];
  }
  
  /**
   * Get session metadata
   */
  getMetadata(sessionId: string) {
    return this.sessions.get(sessionId)?.context.metadata;
  }
}
```

## 4. Sequence Diagrams

### 4.1 Model Completion Flow

```
User           UnifiedModel       ToolExecutor      pi-ai
  │                │                   │               │
  │ complete()     │                   │               │
  │───────────────>│                   │               │
  │                │ complete()        │               │
  │                │───────────────────>               │
  │                │                   │               │
  │                │                   │  complete()   │
  │                │                   │───────────────>
  │                │                   │               │
  │                │                   │  response     │
  │                │                   │<───────────────
  │                │                   │               │
  │                │  toolCall?        │               │
  │                │<───────────────────               │
  │                │                   │               │
  │                │  execute(tool)    │               │
  │                │───────────────────>               │
  │                │                   │               │
  │                │  result           │               │
  │                │<───────────────────               │
  │                │                   │               │
  │                │  continue()       │               │
  │                │───────────────────>               │
  │                │                   │               │
  │                │  final response   │               │
  │                │<───────────────                        │
  │<───────────────│                   │               │
  response         │                   │               │
```

### 4.2 Session Branching Flow

```
User           SessionManager    pi-coding-agent
  │                │                   │
  │ branch()       │                   │
  │───────────────>│                   │
  │                │  create()          │
  │                │───────────────────>
  │                │                   │
  │                │  session          │
  │                │<───────────────────
  │                │                   │
  │                │  copy messages     │
  │                │                   │
  │                │  link nodes       │
  │                │                   │
  │<───────────────│                   │
  new session      │                   │
```

## 5. Error Handling

### 5.1 Error Types

```typescript
// src/errors.ts

export class DashError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'DashError';
  }
}

export const ERROR_CODES = {
  // Provider errors
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  AUTH_FAILED: 'AUTH_FAILED',
  
  // Session errors
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CLOSED: 'SESSION_CLOSED',
  
  // Tool errors
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  TOOL_VALIDATION_FAILED: 'TOOL_VALIDATION_FAILED',
  
  // Context errors
  CONTEXT_TOO_LARGE: 'CONTEXT_TOO_LARGE',
  SERIALIZATION_FAILED: 'SERIALIZATION_FAILED',
  
  // Cost errors
  COST_LIMIT_EXCEEDED: 'COST_LIMIT_EXCEEDED',
} as const;
```

### 5.2 Error Handler

```typescript
// src/errors/handler.ts

import { DashError, ERROR_CODES } from './types.js';

export function handleError(error: unknown): never {
  if (error instanceof DashError) {
    throw error;
  }
  
  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes('API key')) {
      throw new DashError(
        'Authentication failed. Check your API key.',
        ERROR_CODES.AUTH_FAILED,
        { originalError: error.message }
      );
    }
    
    if (error.message.includes('rate limit')) {
      throw new DashError(
        'Rate limit exceeded. Please retry later.',
        'RATE_LIMIT_EXCEEDED',
        { originalError: error.message }
      );
    }
    
    if (error.message.includes('context length')) {
      throw new DashError(
        'Context too large. Consider compacting the session.',
        ERROR_CODES.CONTEXT_TOO_LARGE,
        { originalError: error.message }
      );
    }
  }
  
  // Generic error
  throw new DashError(
    'An unexpected error occurred',
    'UNKNOWN_ERROR',
    { originalError: error }
  );
}
```

## 6. Testing Specifications

### 6.1 Unit Test Structure

```typescript
// tests/llm/unified-model.test.ts

import { UnifiedModel } from '../../src/llm/unified-model.js';
import { MockToolExecutor } from '../mocks/tool-executor.js';

describe('UnifiedModel', () => {
  let model: UnifiedModel;
  let toolExecutor: MockToolExecutor;
  
  beforeEach(() => {
    toolExecutor = new MockToolExecutor();
    model = new UnifiedModel('anthropic', 'claude-sonnet-4-20250514', toolExecutor);
  });
  
  describe('capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = model.capabilities;
      expect(caps.tools).toBe(true);
      expect(caps.vision).toBeDefined();
      expect(caps.reasoning).toBeDefined();
    });
    
    it('should have correct context window', () => {
      const caps = model.capabilities;
      expect(caps.contextWindow).toBeGreaterThan(0);
    });
  });
  
  describe('complete', () => {
    it('should return assistant message', async () => {
      const context = createTestContext();
      const response = await model.complete(context);
      
      expect(response.role).toBe('assistant');
      expect(response.content).toBeDefined();
      expect(response.usage).toBeDefined();
    });
    
    it('should execute tools when called', async () => {
      const context = createContextWithToolCall();
      const response = await model.complete(context);
      
      expect(toolExecutor.executedTools).toContain('read');
    });
    
    it('should track usage and cost', async () => {
      const context = createTestContext();
      const response = await model.complete(context);
      
      expect(response.usage.input).toBeGreaterThan(0);
      expect(response.usage.output).toBeGreaterThan(0);
      expect(response.usage.cost.total).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('stream', () => {
    it('should yield stream events', async () => {
      const context = createTestContext();
      const events: any[] = [];
      
      for await (const event of model.stream(context)) {
        events.push(event);
      }
      
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('start');
      expect(events[events.length - 1].type).toBe('done');
    });
    
    it('should emit toolCall events', async () => {
      const context = createContextWithToolCall();
      const toolEvents: any[] = [];
      
      for await (const event of model.stream(context)) {
        if (event.type === 'toolcall_end') {
          toolEvents.push(event);
        }
      }
      
      expect(toolEvents.length).toBeGreaterThan(0);
    });
  });
});
```

## 7. Performance Requirements

### 7.1 Latency Targets

| Operation | Target P50 | Target P95 |
|-----------|------------|------------|
| Model complete (cached) | < 500ms | < 2s |
| Model complete (first) | < 5s | < 15s |
| Model stream start | < 100ms | < 500ms |
| Tool execution | < 50ms | < 500ms |
| Session create | < 100ms | < 500ms |
| Context serialization | < 10ms | < 100ms |

### 7.2 Throughput Targets

- Concurrent sessions: 100+
- Requests per second: 50+
- Tool executions per second: 200+

### 7.3 Resource Limits

- Memory per session: < 10MB
- Context size: < 2MB
- Max concurrent streams: 50

## 8. Security Considerations

### 8.1 API Key Handling

- Keys loaded from environment variables only
- No keys in code, config files, or logs
- OAuth tokens stored encrypted

### 8.2 Tool Execution

- Tools run with minimal privileges
- Command timeouts enforced
- File access within project bounds
- Shell injection prevention

### 8.3 Session Isolation

- Sessions isolated by ID
- No cross-session data access
- Context encrypted at rest

## 9. Migration Strategy

### Phase 1: Dual Support

Keep existing LLM integration alongside pi-ai for gradual migration.

### Phase 2: Shadow Mode

Run pi-ai alongside existing integration, compare outputs.

### Phase 3: Switch Over

Migrate to pi-ai with feature flag for rollback capability.

### Phase 4: Deprecate

Remove old integration after pi-ai proven stable.
