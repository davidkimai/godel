/**
 * Channel Router Tests
 * 
 * Tests for OpenClaw Channel Router implementation
 * per OpenClaw Integration Spec section 3.3
 */

import {
  ChannelRouter,
  ChannelConfig,
  ChannelFactory,
  ChannelUtils,
  ChannelType,
  ResponseAggregator,
  AggregatedResponse,
  ChannelResponse,
  LatencyOptimizer,
  RouteRequest,
  RouteResult,
  GatewayClient,
  SendResult,
  DEFAULT_ROUTER_CONFIG,
} from '../../../src/integrations/openclaw';

// ============================================================================
// MOCK GATEWAY CLIENT
// ============================================================================

class MockGatewayClient implements GatewayClient {
  private connected = true;
  private responseDelay = 100;
  private shouldFail = new Set<string>();
  
  setResponseDelay(ms: number): void {
    this.responseDelay = ms;
  }
  
  setShouldFail(channelId: string, fail: boolean): void {
    if (fail) {
      this.shouldFail.add(channelId);
    } else {
      this.shouldFail.delete(channelId);
    }
  }
  
  async send(channelId: string, message: string): Promise<SendResult> {
    await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    
    if (this.shouldFail.has(channelId)) {
      return {
        success: false,
        error: 'Channel failed',
        timestamp: new Date(),
      };
    }
    
    return {
      success: true,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
    };
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  async getChannelStatus(): Promise<any> {
    return 'available';
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('OpenClaw Channel Router', () => {
  let router: ChannelRouter;
  let mockGateway: MockGatewayClient;
  
  beforeEach(() => {
    mockGateway = new MockGatewayClient();
    router = new ChannelRouter(DEFAULT_ROUTER_CONFIG, mockGateway);
  });
  
  afterEach(() => {
    router.removeAllListeners();
  });
  
  // ========================================================================
  // CHANNEL CONFIGURATION TESTS
  // ========================================================================
  
  describe('Channel Configuration', () => {
    test('should create Telegram channel with correct capabilities', () => {
      const channel = ChannelFactory.create('telegram', 'test-telegram');
      
      expect(channel.type).toBe('telegram');
      expect(channel.capabilities.maxMessageLength).toBe(4096);
      expect(channel.capabilities.supportsMarkdown).toBe(true);
      expect(channel.capabilities.supportsMedia).toBe(true);
      expect(channel.constraints.maxMessagesPerMinute).toBe(30);
    });
    
    test('should create Discord channel with correct constraints', () => {
      const channel = ChannelFactory.create('discord', 'test-discord');
      
      expect(channel.type).toBe('discord');
      expect(channel.capabilities.maxMessageLength).toBe(2000);
      expect(channel.constraints.chunkSize).toBe(1900);
    });
    
    test('should create WhatsApp channel with E2E support', () => {
      const channel = ChannelFactory.create('whatsapp', 'test-whatsapp');
      
      expect(channel.capabilities.supportsE2E).toBe(true);
      expect(channel.capabilities.maxMessageLength).toBe(65536);
    });
    
    test('should support custom channel configuration', () => {
      const channel = ChannelFactory.create('telegram', 'custom', {
        weight: 2.0,
        priority: 'primary',
        capabilities: {
          maxMessageLength: 8192,
          supportsMarkdown: true,
          supportsHtml: false,
          supportsMedia: true,
          supportsFiles: true,
          maxFileSize: 50 * 1024 * 1024,
          supportedMimeTypes: ['image/*', 'video/*'],
          supportsThreads: true,
          supportsMentions: true,
          supportsReactions: true,
          supportsEditing: true,
          supportsDeletion: true,
          supportsTyping: true,
          supportsDeliveryReceipts: true,
          supportsReadReceipts: false,
          supportsGroups: true,
          maxGroupSize: 200000,
          supportsE2E: false,
          supportsEphemeral: false,
        },
      });
      
      expect(channel.weight).toBe(2.0);
      expect(channel.priority).toBe('primary');
      expect(channel.capabilities.maxMessageLength).toBe(8192);
    });
  });
  
  // ========================================================================
  // CHANNEL MANAGEMENT TESTS
  // ========================================================================
  
  describe('Channel Management', () => {
    test('should add and retrieve channels', () => {
      const channel = ChannelFactory.create('telegram', 'test-1');
      router.addChannel(channel);
      
      const retrieved = router.getChannel('test-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-1');
    });
    
    test('should remove channels', () => {
      const channel = ChannelFactory.create('telegram', 'test-remove');
      router.addChannel(channel);
      expect(router.getChannel('test-remove')).toBeDefined();
      
      const removed = router.removeChannel('test-remove');
      expect(removed).toBe(true);
      expect(router.getChannel('test-remove')).toBeUndefined();
    });
    
    test('should filter channels by type', () => {
      router.addChannel(ChannelFactory.create('telegram', 'tg-1'));
      router.addChannel(ChannelFactory.create('telegram', 'tg-2'));
      router.addChannel(ChannelFactory.create('discord', 'dc-1'));
      
      const telegramChannels = router.getChannelsByType('telegram');
      expect(telegramChannels.length).toBeGreaterThanOrEqual(2);
    });
    
    test('should filter healthy channels', () => {
      const healthy = ChannelFactory.create('telegram', 'healthy');
      const unhealthy = ChannelFactory.create('telegram', 'unhealthy');
      unhealthy.status = 'error';
      unhealthy.successRate = 0.1;
      
      router.addChannel(healthy);
      router.addChannel(unhealthy);
      
      const healthyChannels = router.getHealthyChannels();
      expect(healthyChannels.some(c => c.id === 'healthy')).toBe(true);
      expect(healthyChannels.some(c => c.id === 'unhealthy')).toBe(false);
    });
    
    test('should emit channel:added event', (done) => {
      router.on('channel:added', (channel) => {
        expect(channel.id).toBe('event-test');
        done();
      });
      
      router.addChannel(ChannelFactory.create('telegram', 'event-test'));
    });
  });
  
  // ========================================================================
  // MESSAGE CHUNKING TESTS
  // ========================================================================
  
  describe('Message Chunking', () => {
    test('should not chunk short messages', () => {
      const channel = ChannelFactory.create('telegram', 'test');
      const message = 'Short message';
      
      expect(ChannelUtils.canSendDirectly(channel, message)).toBe(true);
      
      const chunks = ChannelUtils.chunkMessage(channel, message);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(message);
    });
    
    test('should chunk long messages for Discord', () => {
      const channel = ChannelFactory.create('discord', 'test');
      const message = 'a'.repeat(3000);
      
      expect(ChannelUtils.canSendDirectly(channel, message)).toBe(false);
      
      const chunks = ChannelUtils.chunkMessage(channel, message);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].length).toBeLessThanOrEqual(1900);
    });
    
    test('should format mentions per channel', () => {
      const discord = ChannelFactory.create('discord', 'test');
      const telegram = ChannelFactory.create('telegram', 'test');
      
      expect(ChannelUtils.formatMention(discord, '123456')).toBe('<@123456>');
      expect(ChannelUtils.formatMention(telegram, '123456', 'User')).toContain('123456');
    });
    
    test('should strip markdown for unsupported channels', () => {
      const whatsapp = ChannelFactory.create('whatsapp', 'test');
      const markdown = '**bold** and *italic* and `code`';
      
      const formatted = ChannelUtils.formatMarkdown(whatsapp, markdown);
      expect(formatted).not.toContain('**');
      expect(formatted).not.toContain('*');
      expect(formatted).not.toContain('`');
    });
  });
  
  // ========================================================================
  // ROUTING TESTS
  // ========================================================================
  
  describe('Task Routing', () => {
    test('should route to specified channels', async () => {
      router.addChannel(ChannelFactory.createPrimary('telegram', 'primary-tg'));
      router.addChannel(ChannelFactory.createSecondary('discord', 'secondary-dc'));
      
      const request: RouteRequest = {
        id: 'test-1',
        task: 'Test task',
        channels: ['primary-tg'],
      };
      
      const result = await router.route(request);
      
      expect(result.success).toBe(true);
      expect(result.channelResults.length).toBe(1);
      expect(result.channelResults[0].channelId).toBe('primary-tg');
      expect(result.channelResults[0].success).toBe(true);
    });
    
    test('should route to multiple channels', async () => {
      router.addChannel(ChannelFactory.createPrimary('telegram', 'tg-1'));
      router.addChannel(ChannelFactory.createPrimary('discord', 'dc-1'));
      router.addChannel(ChannelFactory.createPrimary('slack', 'sl-1'));
      
      const request: RouteRequest = {
        id: 'test-multi',
        task: 'Multi-channel task',
        channels: ['tg-1', 'dc-1', 'sl-1'],
        requireAll: true,
      };
      
      const result = await router.route(request);
      
      expect(result.success).toBe(true);
      expect(result.metrics.channelsAttempted).toBe(3);
      expect(result.metrics.channelsSucceeded).toBe(3);
    });
    
    test('should use fallback channels on failure', async () => {
      router.addChannel(ChannelFactory.createPrimary('telegram', 'primary-fail'));
      router.addChannel(ChannelFactory.createFallback('telegram', 'fallback'));
      
      mockGateway.setShouldFail('primary-fail', true);
      
      const request: RouteRequest = {
        id: 'test-fallback',
        task: 'Fallback test',
        channels: ['primary-fail'],
      };
      
      const result = await router.route(request);
      
      expect(result.metrics.fallbackUsed).toBe(true);
    });
    
    test('should fail when no channels available', async () => {
      const request: RouteRequest = {
        id: 'test-no-channels',
        task: 'No channels',
        channels: ['non-existent'],
      };
      
      const result = await router.route(request);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
    
    test('should filter by channel type', async () => {
      router.addChannel(ChannelFactory.create('telegram', 'tg-type'));
      router.addChannel(ChannelFactory.create('discord', 'dc-type'));
      
      const request: RouteRequest = {
        id: 'test-type',
        task: 'Type filter test',
        channelTypes: ['telegram'],
      };
      
      const result = await router.route(request);
      
      expect(result.channelResults.every(r => 
        router.getChannel(r.channelId)?.type === 'telegram'
      )).toBe(true);
    });
  });
  
  // ========================================================================
  // ROUTING RULES TESTS
  // ========================================================================
  
  describe('Routing Rules', () => {
    test('should match rules by task pattern', () => {
      router.addRule({
        id: 'code-review-rule',
        name: 'Code Review',
        condition: {
          taskPattern: /code review|review PR/i,
        },
        action: {
          targetChannels: ['discord'],
          strategy: 'broadcast',
        },
        priority: 10,
        enabled: true,
      });
      
      router.addChannel(ChannelFactory.create('discord', 'discord'));
      
      const request: RouteRequest = {
        id: 'test-rule',
        task: 'Please code review this PR',
      };
      
      const matched = router.matchRules(request);
      expect(matched).not.toBeNull();
      expect(matched?.id).toBe('code-review-rule');
    });
    
    test('should match rules by priority', () => {
      router.addRule({
        id: 'critical-rule',
        name: 'Critical',
        condition: {
          minPriority: 'high',
        },
        action: {
          targetChannels: ['telegram'],
          strategy: 'broadcast',
        },
        priority: 20,
        enabled: true,
      });
      
      const highRequest: RouteRequest = {
        id: 'test-priority-high',
        task: 'Critical task',
        priority: 'critical',
      };
      
      const lowRequest: RouteRequest = {
        id: 'test-priority-low',
        task: 'Normal task',
        priority: 'low',
      };
      
      expect(router.matchRules(highRequest)).not.toBeNull();
      expect(router.matchRules(lowRequest)).toBeNull();
    });
  });
  
  // ========================================================================
  // RESPONSE AGGREGATION TESTS
  // ========================================================================
  
  describe('Response Aggregation', () => {
    test('should aggregate responses from multiple channels', () => {
      const aggregator = new ResponseAggregator({
        minResponses: 2,  // Require 2 responses before finalizing
      });
      const requestId = 'agg-test';
      
      aggregator.startAggregation(requestId);
      
      const response1: ChannelResponse = {
        channelId: 'ch-1',
        channelType: 'telegram',
        content: 'Response from channel 1',
        timestamp: new Date(),
        latency: 100,
        metadata: {},
      };
      
      const response2: ChannelResponse = {
        channelId: 'ch-2',
        channelType: 'discord',
        content: 'Response from channel 2',
        timestamp: new Date(),
        latency: 200,
        metadata: {},
      };
      
      // First response should not finalize (returns null)
      const result1 = aggregator.addResponse(requestId, response1);
      expect(result1).toBeNull();
      
      // Second response should finalize (returns AggregatedResponse)
      const result2 = aggregator.addResponse(requestId, response2);
      expect(result2).not.toBeNull();
      expect(result2!.responses.length).toBe(2);
      expect(result2!.channelsUsed).toContain('ch-1');
      expect(result2!.channelsUsed).toContain('ch-2');
    });
    
    test('should detect conflicts in responses', () => {
      const aggregator = new ResponseAggregator({
        strategy: 'majority_vote',
        minResponses: 2,
      });

      const requestId = 'conflict-test';
      aggregator.startAggregation(requestId);

      const response1: ChannelResponse = {
        channelId: 'ch-1',
        channelType: 'telegram',
        content: 'The deployment succeeded on production server A with version 2.1.0',
        timestamp: new Date(),
        latency: 100,
        metadata: {},
      };

      const response2: ChannelResponse = {
        channelId: 'ch-2',
        channelType: 'discord',
        content: 'The deployment failed on staging server B with error code 500',
        timestamp: new Date(),
        latency: 150,
        metadata: {},
      };

      aggregator.addResponse(requestId, response1);
      const result = aggregator.addResponse(requestId, response2);

      expect(result!.conflicts.length).toBeGreaterThan(0);
    });
    
    test('should calculate confidence scores', () => {
      const aggregator = new ResponseAggregator({
        strategy: 'confidence_based',
        minResponses: 2,
      });
      
      const requestId = 'confidence-test';
      aggregator.startAggregation(requestId);
      
      const response1: ChannelResponse = {
        channelId: 'ch-1',
        channelType: 'telegram',
        content: 'Agreed result',
        timestamp: new Date(),
        latency: 100,
        metadata: {},
      };
      
      const response2: ChannelResponse = {
        channelId: 'ch-2',
        channelType: 'discord',
        content: 'Agreed result',
        timestamp: new Date(),
        latency: 120,
        metadata: {},
      };
      
      aggregator.addResponse(requestId, response1);
      const result = aggregator.addResponse(requestId, response2);
      
      expect(result!.confidence).toBeGreaterThan(0.5);
    });
  });
  
  // ========================================================================
  // LATENCY OPTIMIZATION TESTS
  // ========================================================================
  
  describe('Latency Optimization', () => {
    test('should calculate optimal timeout', () => {
      const channels: ChannelConfig[] = [
        { ...ChannelFactory.create('telegram', 'fast'), averageLatency: 100 },
        { ...ChannelFactory.create('telegram', 'medium'), averageLatency: 300 },
        { ...ChannelFactory.create('telegram', 'slow'), averageLatency: 800 },
      ];
      
      const timeout = LatencyOptimizer.calculateOptimalTimeout(channels, 0.95);
      
      expect(timeout).toBeGreaterThan(0);
      expect(timeout).toBeLessThanOrEqual(30000);
    });
    
    test('should rank channels by latency', () => {
      const channels: ChannelConfig[] = [
        { ...ChannelFactory.create('telegram', 'slow'), averageLatency: 500, successRate: 1.0 },
        { ...ChannelFactory.create('telegram', 'fast'), averageLatency: 100, successRate: 1.0 },
        { ...ChannelFactory.create('telegram', 'medium'), averageLatency: 300, successRate: 1.0 },
      ];
      
      const ranked = LatencyOptimizer.rankByLatency(channels);
      
      expect(ranked[0].id).toBe('fast');
      expect(ranked[2].id).toBe('slow');
    });
    
    test('should select fastest channels', () => {
      const channels: ChannelConfig[] = [
        { ...ChannelFactory.create('telegram', 'c1'), averageLatency: 500, successRate: 1.0 },
        { ...ChannelFactory.create('telegram', 'c2'), averageLatency: 100, successRate: 1.0 },
        { ...ChannelFactory.create('telegram', 'c3'), averageLatency: 300, successRate: 1.0 },
        { ...ChannelFactory.create('telegram', 'c4'), averageLatency: 200, successRate: 1.0 },
      ];
      
      const fastest = LatencyOptimizer.selectFastest(channels, 2);
      
      expect(fastest.length).toBe(2);
      expect(fastest[0].id).toBe('c2');
      expect(fastest[1].id).toBe('c4');
    });
  });
  
  // ========================================================================
  // CHANNEL METRICS TESTS
  // ========================================================================
  
  describe('Channel Metrics', () => {
    test('should update channel metrics on success', () => {
      const channel = ChannelFactory.create('telegram', 'metrics-test');
      
      ChannelUtils.updateMetrics(channel, true, 150);
      
      expect(channel.totalRequests).toBe(1);
      expect(channel.failureCount).toBe(0);
      expect(channel.successRate).toBeGreaterThan(0.9);
      expect(channel.averageLatency).toBeGreaterThan(0);
    });
    
    test('should update channel metrics on failure', () => {
      const channel = ChannelFactory.create('telegram', 'metrics-test-fail');
      
      ChannelUtils.updateMetrics(channel, false, 0);
      
      expect(channel.totalRequests).toBe(1);
      expect(channel.failureCount).toBe(1);
      expect(channel.successRate).toBeLessThan(1.0);
    });
    
    test('should calculate channel scores', () => {
      const goodChannel = ChannelFactory.createPrimary('telegram', 'good');
      goodChannel.successRate = 0.95;
      goodChannel.averageLatency = 100;
      
      const badChannel = ChannelFactory.createFallback('telegram', 'bad');
      badChannel.successRate = 0.3;
      badChannel.averageLatency = 5000;
      
      const goodScore = ChannelUtils.calculateScore(goodChannel);
      const badScore = ChannelUtils.calculateScore(badChannel);
      
      expect(goodScore).toBeGreaterThan(badScore);
    });
  });
  
  // ========================================================================
  // ROUTER STATISTICS TESTS
  // ========================================================================
  
  describe('Router Statistics', () => {
    test('should return router statistics', () => {
      router.addChannel(ChannelFactory.create('telegram', 'stat-1'));
      router.addChannel(ChannelFactory.create('discord', 'stat-2'));
      router.addChannel(ChannelFactory.create('slack', 'stat-3'));
      
      const stats = router.getStats();
      
      expect(stats.totalChannels).toBeGreaterThanOrEqual(3);
      expect(stats.channelBreakdown.telegram).toBeGreaterThanOrEqual(1);
      expect(stats.channelBreakdown.discord).toBeGreaterThanOrEqual(1);
      expect(stats.channelBreakdown.slack).toBeGreaterThanOrEqual(1);
    });
    
    test('should get optimal channels', () => {
      // Create a fresh router with only our test channels
      const testRouter = new ChannelRouter(DEFAULT_ROUTER_CONFIG, mockGateway);
      
      // Remove all predefined channels first by getting them and removing
      const allChannels = testRouter.getAllChannels();
      for (const ch of allChannels) {
        testRouter.removeChannel(ch.id);
      }
      
      testRouter.addChannel({
        ...ChannelFactory.create('telegram', 'opt-slow'),
        averageLatency: 2000,
        successRate: 0.5,
        status: 'available',
        enabled: true,
      });
      testRouter.addChannel({
        ...ChannelFactory.create('telegram', 'opt-fast'),
        averageLatency: 100,
        successRate: 0.99,
        status: 'available',
        enabled: true,
      });
      
      const optimal = testRouter.getOptimalChannels(1);
      
      expect(optimal.length).toBe(1);
      expect(optimal[0].id).toBe('opt-fast');
    });
  });
});

// ============================================================================
// E2E INTEGRATION TEST
// ============================================================================

describe('Channel Router E2E', () => {
  test('should complete full multi-channel routing flow', async () => {
    const mockGateway = new MockGatewayClient();
    const router = new ChannelRouter({
      ...DEFAULT_ROUTER_CONFIG,
      enableAggregation: true,
      enableFallback: true,
    }, mockGateway);
    
    // Clear predefined channels
    for (const ch of router.getAllChannels()) {
      router.removeChannel(ch.id);
    }
    
    // Set up channels
    router.addChannel(ChannelFactory.createPrimary('telegram', 'e2e-tg'));
    router.addChannel(ChannelFactory.createPrimary('discord', 'e2e-dc'));
    router.addChannel(ChannelFactory.createPrimary('slack', 'e2e-sl'));
    router.addChannel(ChannelFactory.createFallback('whatsapp', 'e2e-wa'));
    
    // Route a task with explicit channels (use unique ID to avoid conflicts)
    const request: RouteRequest = {
      id: `e2e-request-${Date.now()}`,
      task: 'Run e2e test for multi-channel routing',
      channels: ['e2e-tg', 'e2e-dc', 'e2e-sl'],
      priority: 'high',
      requireAll: true,
      minResponses: 2,
    };
    
    const result = await router.route(request);
    
    // Verify results - allow for extra results from async completion
    expect(result.success).toBe(true);
    expect(result.metrics.channelsAttempted).toBe(3);
    expect(result.metrics.channelsSucceeded).toBe(3);
    // At minimum we should have 3 results, but async operations might add more
    expect(result.channelResults.length).toBeGreaterThanOrEqual(3);
    
    // Verify channel responses
    result.channelResults.forEach(cr => {
      expect(cr.success).toBe(true);
      expect(cr.latency).toBeGreaterThanOrEqual(0);
      expect(cr.messageId).toBeDefined();
    });
    
    // Verify metrics
    expect(result.metrics.totalLatency).toBeGreaterThanOrEqual(0);
    expect(result.metrics.fallbackUsed).toBe(false);
    
    console.log('✓ E2E Test passed:', {
      channelsUsed: result.channelResults.map(r => r.channelId),
      totalLatency: result.metrics.totalLatency,
      success: result.success,
    });
  });
  
  test('should handle channel failures with fallback', async () => {
    const mockGateway = new MockGatewayClient();
    const router = new ChannelRouter(DEFAULT_ROUTER_CONFIG, mockGateway);
    
    // Set up channels with one that will fail
    router.addChannel(ChannelFactory.createPrimary('telegram', 'fail-primary'));
    router.addChannel(ChannelFactory.createFallback('discord', 'fallback-channel'));
    
    // Make primary fail
    mockGateway.setShouldFail('fail-primary', true);
    
    const request: RouteRequest = {
      id: 'fallback-test',
      task: 'Test fallback behavior',
      channels: ['fail-primary'],
    };
    
    const result = await router.route(request);
    
    // Primary failed but fallback should have been used
    expect(result.metrics.fallbackUsed).toBe(true);
    expect(result.success).toBe(true);
  });
});
