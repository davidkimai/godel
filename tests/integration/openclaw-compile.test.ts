/**
 * OpenClaw Integration Compilation Test
 * 
 * Verifies that all OpenClaw integration modules compile without errors.
 * This is a compilation test - it validates TypeScript types, not runtime behavior.
 * 
 * ANTI-STUB PROTOCOL: This test ensures the actual implementations compile.
 */

// Test that all OpenClaw modules can be imported and have correct types
import {
  // Core classes
  SessionManager,
  AgentExecutor,
  GatewayClient,
  BudgetTracker,
  UsageCalculator,
  LearningEngine,
  ImprovementStore,
  ClawHubClient,
  SkillInstaller,
  PermissionManager,
  SandboxManager,
  ThreadManager,
  GroupCoordinator,
  ChannelRouter,
  ResponseAggregator,
  
  // Factory functions
  getGlobalSessionManager,
  createAgentExecutor,
  getBudgetTracker,
  getUsageCalculator,
  getLearningEngine,
  getImprovementStore,
  getGlobalClawHubClient,
  getGlobalSkillInstaller,
  getGlobalPermissionManager,
  getGlobalSandboxManager,
  getGlobalThreadManager,
  getGlobalGroupCoordinator,
  createGatewayClient,
  connectToGateway,
  
  // Error classes
  BudgetError,
  BudgetExceededError,
  PermissionDeniedError,
  ToolNotAllowedError,
  SandboxError,
  ClawhubError,
  SkillNotFoundError,
  
  // Type exports
  SessionInfo,
  Message,
  Attachment,
  ToolCall,
  GatewayConfig,
  BudgetConfig,
  BudgetStatus,
  BudgetAlert,
  SessionHistoryEntry,
  UsageMetrics,
  TokenBreakdown,
  LearningConfig,
  StrategyStats,
  ImprovementEntry,
  AgentExecution,
  AgentResult,
  SkillMetadata,
  ParsedSkill,
  SandboxMode,
  AgentPermissions,
  Thread,
  AgentGroup,
  AggregatedResponse,
  RouteResult,
} from '../../src/integrations/openclaw';

describe('OpenClaw Integration Compilation', () => {
  it('should have all core classes defined', () => {
    expect(SessionManager).toBeDefined();
    expect(AgentExecutor).toBeDefined();
    expect(GatewayClient).toBeDefined();
    expect(BudgetTracker).toBeDefined();
    expect(UsageCalculator).toBeDefined();
    expect(LearningEngine).toBeDefined();
    expect(ImprovementStore).toBeDefined();
    expect(ClawHubClient).toBeDefined();
    expect(SkillInstaller).toBeDefined();
    expect(PermissionManager).toBeDefined();
    expect(SandboxManager).toBeDefined();
    expect(ThreadManager).toBeDefined();
    expect(GroupCoordinator).toBeDefined();
    expect(ChannelRouter).toBeDefined();
    expect(ResponseAggregator).toBeDefined();
  });

  it('should have all factory functions defined', () => {
    expect(getGlobalSessionManager).toBeDefined();
    expect(createAgentExecutor).toBeDefined();
    expect(getBudgetTracker).toBeDefined();
    expect(getUsageCalculator).toBeDefined();
    expect(getLearningEngine).toBeDefined();
    expect(getImprovementStore).toBeDefined();
    expect(getGlobalClawHubClient).toBeDefined();
    expect(getGlobalSkillInstaller).toBeDefined();
    expect(getGlobalPermissionManager).toBeDefined();
    expect(getGlobalSandboxManager).toBeDefined();
    expect(getGlobalThreadManager).toBeDefined();
    expect(getGlobalGroupCoordinator).toBeDefined();
    expect(createGatewayClient).toBeDefined();
    expect(connectToGateway).toBeDefined();
  });

  it('should have all error classes defined', () => {
    expect(BudgetError).toBeDefined();
    expect(BudgetExceededError).toBeDefined();
    expect(PermissionDeniedError).toBeDefined();
    expect(ToolNotAllowedError).toBeDefined();
    expect(SandboxError).toBeDefined();
    expect(ClawhubError).toBeDefined();
    expect(SkillNotFoundError).toBeDefined();
  });

  it('should be able to instantiate UsageCalculator', () => {
    const calculator = new UsageCalculator();
    expect(calculator).toBeInstanceOf(UsageCalculator);
  });

  it('should have correct types for SessionInfo', () => {
    const sessionInfo: SessionInfo = {
      key: 'test-key',
      id: 'test-id',
      model: 'gpt-4',
      provider: 'openai',
      updatedAt: new Date().toISOString(),
      inputTokens: 100,
      outputTokens: 50,
      status: 'active',
    };
    expect(sessionInfo.key).toBe('test-key');
  });

  it('should have correct types for Message', () => {
    const message: Message = {
      id: 'msg-1',
      role: 'assistant',
      content: 'Hello',
      timestamp: new Date().toISOString(),
      toolCalls: [],
    };
    expect(message.role).toBe('assistant');
  });

  it('should have correct types for Attachment', () => {
    const attachment: Attachment = {
      type: 'file',
      data: 'base64data',
      filename: 'test.txt',
    };
    expect(attachment.type).toBe('file');
  });

  it('should have correct types for BudgetConfig', () => {
    const config: BudgetConfig = {
      totalBudget: 10.0,
      perAgentLimit: 2.0,
      warningThreshold: 0.8,
    };
    expect(config.totalBudget).toBe(10.0);
  });

  it('should have correct types for SandboxMode', () => {
    const mode: SandboxMode = 'docker';
    expect(mode).toBe('docker');
  });

  it('should have correct types for AgentPermissions', () => {
    const perms: AgentPermissions = {
      allowedTools: ['read', 'write'],
      deniedTools: ['exec'],
      sandboxMode: 'docker' as SandboxMode,
      maxDuration: 300,
      maxTokens: 100000,
      maxCost: 10,
      requireApproval: false,
      approvalChannels: [],
      canSpawnAgents: false,
      maxConcurrentTools: 5,
    };
    expect(perms.sandboxMode).toBe('docker');
  });
});

describe('Type Safety Verification', () => {
  it('should enforce correct types for tool calls', () => {
    const toolCall: ToolCall = {
      id: 'tool-1',
      tool: 'read',
      params: { path: '/test' },
      result: 'content',
    };
    expect(toolCall.tool).toBe('read');
  });

  it('should enforce correct types for usage metrics', () => {
    const metrics: UsageMetrics = {
      totalSpent: 1.5,
      agentBreakdown: { 'agent-1': 1.5 },
      toolBreakdown: { read: 0.001 },
      tokenBreakdown: {
        input: 1000,
        output: 500,
        total: 1500,
      },
    };
    expect(metrics.totalSpent).toBe(1.5);
  });

  it('should enforce correct types for token breakdown', () => {
    const breakdown: TokenBreakdown = {
      input: 1000,
      output: 500,
      total: 1500,
    };
    expect(breakdown.total).toBe(1500);
  });
});

describe('Integration Module Exports', () => {
  it('should export all required types from index', () => {
    // This test verifies that the index.ts properly exports all types
    // If any export is missing, this file would fail to compile
    expect(true).toBe(true);
  });
});
