/**
 * OpenClaw CLI Command - Manage OpenClaw Gateway integration
 * 
 * Commands:
 * - dash openclaw connect [--host HOST] [--port PORT] [--token TOKEN]
 * - dash openclaw status
 * - dash openclaw sessions list [--active] [--kind main|group|thread]
 * - dash openclaw sessions history <session-key> [--limit N]
 * - dash openclaw spawn --task "..." [--model MODEL] [--budget AMOUNT]
 * - dash openclaw send --session SESSION "message"
 * - dash openclaw kill <session-key> [--force]
 * 
 * Per OPENCLAW_INTEGRATION_SPEC.md section 5.1
 */

import { Command } from 'commander';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { 
  GatewayClient, 
  SessionManager, 
  AgentExecutor, 
  createAgentExecutor,
  getGlobalSessionManager,
  GatewayConfig,
  SessionInfo,
  SessionsSpawnParams,
} from '../../integrations/openclaw';
import { MockOpenClawClient, type SessionSpawnOptions, type OpenClawSession } from '../../core/openclaw';
import {
  setOpenClawState,
  getOpenClawState,
  clearOpenClawState,
  isOpenClawConnected,
  isOpenClawMockMode,
  getMockSessions,
  setMockSession,
  type MockSessionData,
} from '../../utils/cli-state';

// ============================================================================
// Configuration from Environment
// ============================================================================

/**
 * Parse gateway URL from environment variable
 * Format: ws://host:port or wss://host:port
 */
function parseGatewayUrl(): { host: string; port: number; secure: boolean } | null {
  const url = process.env['OPENCLAW_GATEWAY_URL'];
  if (!url) return null;
  
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parseInt(parsed.port, 10) || (parsed.protocol === 'wss:' ? 443 : 18789);
    const secure = parsed.protocol === 'wss:';
    return { host, port, secure };
  } catch {
    // Try simple host:port format
    const parts = url.replace(/^ws:\/\//, '').replace(/^wss:\/\//, '').split(':');
    if (parts.length === 2) {
      const port = parseInt(parts[1], 10);
      if (!isNaN(port)) {
        return { host: parts[0], port, secure: false };
      }
    }
    return null;
  }
}

/**
 * Get gateway configuration from environment or defaults
 */
function getGatewayConfig(options: { host?: string; port?: string; token?: string } = {}): GatewayConfig {
  const envUrl = parseGatewayUrl();
  const envToken = process.env['OPENCLAW_GATEWAY_TOKEN'];
  
  return {
    host: options.host || envUrl?.host || '127.0.0.1',
    port: options.port ? parseInt(options.port, 10) : (envUrl?.port || 18789),
    token: options.token || envToken,
    reconnectDelay: 1000,
    maxRetries: 3, // Fewer retries for CLI to fail fast and fallback to mock
    requestTimeout: 10000,
  };
}

/**
 * Connection mode detection
 */
type ConnectionMode = 'real' | 'mock' | 'auto';

function getConnectionMode(options: { mock?: boolean }): ConnectionMode {
  if (options.mock) return 'mock';
  
  // Check if OPENCLAW_MOCK_MODE is explicitly set
  const envMock = process.env['OPENCLAW_MOCK_MODE'];
  if (envMock === 'true' || envMock === '1') return 'mock';
  if (envMock === 'false' || envMock === '0') return 'real';
  
  // Default to auto (try real first, fallback to mock)
  return 'auto';
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate a file path for attachments
 * Prevents path traversal attacks
 */
function validateAttachmentPath(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path is required' };
  }

  // Normalize the path
  const normalized = path.normalize(filePath);

  // Check for path traversal attempts
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path traversal detected' };
  }

  // Check for null bytes
  if (normalized.includes('\0')) {
    return { valid: false, error: 'Invalid characters in path' };
  }

  // Check for absolute paths that could be dangerous
  if (path.isAbsolute(normalized)) {
    const allowedPrefixes = [
      process.cwd(),
      process.env['HOME'] || '',
      process.env['USERPROFILE'] || '',
    ];
    
    const isAllowed = allowedPrefixes.some(prefix => 
      prefix && normalized.startsWith(prefix)
    );
    
    if (!isAllowed) {
      return { valid: false, error: 'Absolute path not in allowed directories' };
    }
  }

  return { valid: true };
}

// ============================================================================
// Global State (for CLI session)
// ============================================================================

let globalGatewayClient: GatewayClient | null = null;
let globalSessionManager: SessionManager | null = null;
let globalAgentExecutor: AgentExecutor | null = null;
let globalMockClient: MockOpenClawClient | null = null;

function getGatewayClient(): GatewayClient {
  if (!globalGatewayClient) {
    // Check if we have persisted state
    const state = getOpenClawState();
    if (state?.connected && !state?.mockMode) {
      // Re-create client from persisted state
      const config: Partial<GatewayConfig> = {
        host: state.host || '127.0.0.1',
        port: state.port || 18789,
      };
      globalGatewayClient = new GatewayClient(config, {
        autoReconnect: true,
        subscriptions: ['agent', 'chat', 'presence', 'tick'],
      });
      // Note: We don't auto-connect here, just return the client
      // The caller should handle connection
      return globalGatewayClient;
    }
    throw new Error('Not connected to OpenClaw Gateway. Run "dash openclaw connect" first.');
  }
  return globalGatewayClient;
}

function getSessionManager(): SessionManager {
  if (!globalSessionManager) {
    throw new Error('Not connected to OpenClaw Gateway. Run "dash openclaw connect" first.');
  }
  return globalSessionManager;
}

function getAgentExecutor(): AgentExecutor {
  if (!globalAgentExecutor) {
    const sessionManager = getSessionManager();
    globalAgentExecutor = createAgentExecutor(sessionManager);
    return globalAgentExecutor;
  }
  return globalAgentExecutor;
}

function getMockClient(): MockOpenClawClient {
  if (!globalMockClient) {
    globalMockClient = new MockOpenClawClient();
    
    // Restore persisted mock sessions
    const persistedSessions = getMockSessions();
    for (const session of persistedSessions) {
      // Re-create sessions in the mock client
      (globalMockClient as unknown as { restoreSession: (s: MockSessionData) => void }).restoreSession(session);
    }
  }
  return globalMockClient;
}

function isMockMode(): boolean {
  return isOpenClawMockMode();
}

// ============================================================================
// Command Registration
// ============================================================================

export function registerOpenClawCommand(program: Command): void {
  const openclaw = program
    .command('openclaw')
    .description('Manage OpenClaw Gateway integration');

  // ============================================================================
  // openclaw connect
  // ============================================================================
  openclaw
    .command('connect')
    .description('Connect to OpenClaw Gateway (auto-detects real/mock)')
    .option('--host <host>', 'Gateway host (or set OPENCLAW_GATEWAY_URL)')
    .option('--port <port>', 'Gateway port')
    .option('--token <token>', 'Authentication token (or set OPENCLAW_GATEWAY_TOKEN)')
    .option('--mock', 'Force mock client for testing (no real gateway required)')
    .action(async (options) => {
      const mode = getConnectionMode(options);
      
      // If explicitly mock mode
      if (mode === 'mock') {
        console.log('🔌 Connecting to OpenClaw Gateway...\n');
        console.log('ℹ️  Mock mode requested (--mock flag)\n');
        
        const config = getGatewayConfig(options);
        globalMockClient = new MockOpenClawClient();
        
        // Persist mock connection state
        setOpenClawState({
          connected: true,
          mockMode: true,
          host: config.host,
          port: config.port,
          connectedAt: new Date().toISOString(),
        });
        
        console.log('✅ Connected to MOCK OpenClaw Gateway');
        console.log('   Mode: Explicit mock (--mock flag)');
        console.log(`   Config: ${config.host}:${config.port}`);
        console.log('\n💡 Set OPENCLAW_MOCK_MODE=false to force real gateway');
        return;
      }
      
      // Try real connection first (real mode or auto mode)
      console.log('🔌 Connecting to OpenClaw Gateway...\n');
      
      if (mode === 'auto') {
        console.log('ℹ️  Auto-detect mode: Will try real gateway first, fallback to mock\n');
      }
      
      const config = getGatewayConfig(options);
      const tokenDisplay = config.token ? '***' : 'none';
      
      console.log(`📍 Gateway: ws://${config.host}:${config.port}`);
      console.log(`🔑 Token: ${tokenDisplay}\n`);

      try {
        // Attempt real connection
        globalGatewayClient = new GatewayClient(config, {
          autoReconnect: false, // Don't auto-reconnect for CLI
          subscriptions: ['agent', 'chat', 'presence', 'tick'],
        });

        await globalGatewayClient.connect();

        // Create SessionManager using the connected GatewayClient
        globalSessionManager = new SessionManager(config, globalGatewayClient);
        globalAgentExecutor = createAgentExecutor(globalSessionManager);

        // Persist connection state
        setOpenClawState({
          connected: true,
          mockMode: false,
          host: config.host,
          port: config.port,
          connectedAt: new Date().toISOString(),
        });

        console.log('✅ Connected to REAL OpenClaw Gateway');
        console.log(`   URL: ws://${config.host}:${config.port}`);
        if (config.token) {
          console.log(`   Auth: Authenticated`);
        } else {
          console.log('   Auth: No token (unauthenticated)');
        }
        console.log('   Subscriptions: agent, chat, presence, tick');
        
        // Disconnect since this is just a CLI command
        await globalGatewayClient.disconnect();
        process.exit(0);
        
      } catch (error) {
        // Real connection failed
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (mode === 'real') {
          // In real mode, fail hard
          logger.error('openclaw', '❌ Failed to connect to OpenClaw Gateway');
          console.error(`   Error: ${errorMessage}`);
          logger.error('openclaw', '\n💡 Troubleshooting:');
          logger.error('openclaw', '   - Ensure OpenClaw Gateway is running: openclaw gateway status');
          logger.error('openclaw', '   - Check OPENCLAW_GATEWAY_URL environment variable');
          logger.error('openclaw', '   - Verify OPENCLAW_GATEWAY_TOKEN is set correctly');
          logger.error('openclaw', '   - Use --mock flag to force mock mode');
          process.exit(1);
        }
        
        // In auto mode, fallback to mock
        console.log('⚠️  Real gateway unavailable, falling back to mock mode\n');
        console.log(`   Error: ${errorMessage}\n`);
        
        globalMockClient = new MockOpenClawClient();
        
        // Persist mock connection state
        setOpenClawState({
          connected: true,
          mockMode: true,
          host: config.host,
          port: config.port,
          connectedAt: new Date().toISOString(),
          fallbackReason: errorMessage,
        });
        
        console.log('✅ Connected to MOCK OpenClaw Gateway');
        console.log('   Mode: Fallback (real gateway unavailable)');
        console.log(`   Config: ${config.host}:${config.port}`);
        console.log('\n💡 To use real gateway:');
        console.log('   - Start gateway: openclaw gateway start');
        console.log('   - Or set OPENCLAW_MOCK_MODE=false to fail if real unavailable');
      }
    });

  // ============================================================================
  // openclaw status
  // ============================================================================
  openclaw
    .command('status')
    .description('Check OpenClaw Gateway status')
    .option('--mock', 'Use mock client for testing (no real gateway required)')
    .action(async (options) => {
      try {
        // Check persisted state first
        const persistedState = getOpenClawState();
        
        if (options.mock || (persistedState?.mockMode && persistedState?.connected)) {
          const mockClient = getMockClient();
          console.log('🔌 OpenClaw Gateway Status (MOCK MODE)\n');
          console.log('✓ Connected: Mock Client');
          console.log('✓ Sessions: ' + mockClient.getAllSessions().length);
          if (persistedState?.connectedAt) {
            console.log(`✓ Connected At: ${persistedState.connectedAt}`);
          }
          return;
        }

        if (!persistedState?.connected) {
          console.log('🔌 OpenClaw Gateway Status\n');
          console.log('✗ Not connected');
          console.log('\n💡 Run "dash openclaw connect" to connect');
          process.exit(1);
        }

        // Show persisted connection state (CLI doesn't maintain persistent connections)
        console.log('🔌 OpenClaw Gateway Status\n');
        console.log(`✓ Connection configured: ${persistedState.host}:${persistedState.port}`);
        console.log(`  Mode: ${persistedState.mockMode ? 'Mock' : 'Real'}`);
        if (persistedState.connectedAt) {
          console.log(`  Connected At: ${persistedState.connectedAt}`);
        }
        if (persistedState.fallbackReason) {
          console.log(`  Note: Using fallback mode (${persistedState.fallbackReason})`);
        }
        console.log('\n💡 Connection is ready for commands');
      } catch (error) {
        logger.error('openclaw', '❌ Failed to get gateway status');
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // openclaw sessions (subcommand group)
  // ============================================================================
  const sessions = openclaw
    .command('sessions')
    .description('Manage OpenClaw sessions');

  // ============================================================================
  // openclaw sessions list
  // ============================================================================
  sessions
    .command('list')
    .description('List OpenClaw sessions')
    .option('--active', 'Only show active sessions (last 60 min)')
    .option('--kind <kind>', 'Filter by session kind (main|group|thread)')
    .option('--mock', 'Use mock client for testing (no real gateway required)')
    .action(async (options) => {
      try {
        // Check persisted state first
        const persistedState = getOpenClawState();
        
        if (options.mock || (persistedState?.mockMode && persistedState?.connected)) {
          const mockClient = getMockClient();
          const sessions = mockClient.getAllSessions();
          
          // Also load from persisted state if memory is empty
          const persistedSessions = getMockSessions();
          const allSessionIds = new Set(sessions.map(s => s.sessionId));
          
          for (const persisted of persistedSessions) {
            if (!allSessionIds.has(persisted.sessionId)) {
              sessions.push({
                sessionId: persisted.sessionId,
                agentId: persisted.agentId,
                status: persisted.status,
                createdAt: new Date(persisted.createdAt),
                metadata: { model: persisted.model, task: persisted.task },
              } as OpenClawSession);
            }
          }
          
          console.log(`SESSIONS (${sessions.length} total)\n`);
          
          for (const session of sessions) {
            const status = session.status === 'running' ? 'active' : 
                          session.status === 'pending' ? 'idle' : 'stale';
            console.log(`├── ${session.sessionId} (${status}, mock session)`);
          }
          return;
        }

        if (!persistedState?.connected) {
          logger.error('openclaw', '❌ Not connected to OpenClaw Gateway. Run "dash openclaw connect" first.');
          process.exit(1);
        }

        const sessionManager = getSessionManager();
        
        const params: { activeMinutes?: number; kinds?: string[] } = {};
        if (options.active) {
          params.activeMinutes = 60;
        }
        if (options.kind) {
          params.kinds = [options.kind];
        }

        const sessions = await sessionManager.sessionsList(params);
        
        if (!sessions || sessions.length === 0) {
          console.log('📭 No sessions found');
          console.log('💡 Use "dash openclaw spawn" to create a session');
          return;
        }

        console.log(`SESSIONS (${sessions.length} total)\n`);
        
        for (const session of sessions) {
          const tokens = ((session.inputTokens || 0) + (session.outputTokens || 0));
          const tokensStr = tokens > 1000 ? `${(tokens / 1000).toFixed(1)}K` : `${tokens}`;
          const timeAgo = formatTimeAgo(new Date(session.updatedAt));
          
          console.log(`├── ${session.key} (${session.status}, ${tokensStr} tokens, ${timeAgo})`);
        }
      } catch (error) {
        logger.error('openclaw', '❌ Failed to list sessions');
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // openclaw sessions history
  // ============================================================================
  sessions
    .command('history <sessionKey>')
    .description('View session history/transcript')
    .option('-l, --limit <limit>', 'Number of messages to show', '50')
    .option('--mock', 'Use mock client for testing (no real gateway required)')
    .action(async (sessionKey: string, options) => {
      try {
        // Validate limit
        const limit = parseInt(options.limit, 10);
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          logger.error('openclaw', '❌ Invalid limit. Must be between 1 and 1000.');
          process.exit(1);
        }

        // Check persisted state for mock mode
        const persistedState = getOpenClawState();
        const useMock = options.mock || (persistedState?.mockMode && persistedState?.connected);

        if (useMock) {
          const mockClient = getMockClient();
          const session = mockClient.getSession(sessionKey);
          if (!session) {
            console.error(`❌ Session not found: ${sessionKey}`);
            process.exit(1);
          }
          
          console.log(`📜 Session History: ${sessionKey}\n`);
          console.log(`Agent: ${session.agentId}`);
          console.log(`Status: ${session.status}`);
          console.log(`Created: ${session.createdAt.toISOString()}`);
          logger.info('openclaw', '\n[Mock mode - no transcript available]');
          return;
        }

        const sessionManager = getSessionManager();
        
        const messages = await sessionManager.sessionsHistory(sessionKey, limit);

        if (!messages || messages.length === 0) {
          console.log('📭 No messages found');
          return;
        }

        console.log(`📜 Session History: ${sessionKey}\n`);
        
        for (const msg of messages) {
          const role = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '📝';
          const time = new Date(msg.timestamp).toLocaleTimeString();
          const content = msg.content.length > 200 
            ? msg.content.substring(0, 200) + '...' 
            : msg.content;
          
          console.log(`${role} [${time}] ${content}\n`);
        }
      } catch (error) {
        logger.error('openclaw', '❌ Failed to get session history');
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // openclaw spawn
  // ============================================================================
  openclaw
    .command('spawn')
    .description('Spawn an agent via OpenClaw')
    .requiredOption('-t, --task <task>', 'Task description')
    .option('-m, --model <model>', 'Model to use', 'kimi-k2.5')
    .option('-b, --budget <amount>', 'Max budget (USD)', '1.00')
    .option('--sandbox', 'Enable sandbox', true)
    .option('--skills <skills>', 'Additional skills (comma-separated)')
    .option('--system-prompt <prompt>', 'System prompt override')
    .option('--mock', 'Use mock client for testing (no real gateway required)')
    .action(async (options) => {
      try {
        console.log('🚀 Spawning agent via OpenClaw...\n');

        // Validate budget
        const budget = parseFloat(options.budget);
        if (isNaN(budget) || budget < 0 || budget > 10000) {
          logger.error('openclaw', '❌ Invalid budget. Must be between 0 and 10000 USD.');
          process.exit(1);
        }

        // Check persisted state for mock mode
        const persistedState = getOpenClawState();
        const useMock = options.mock || (persistedState?.mockMode && persistedState?.connected);

        if (useMock) {
          // Use mock client
          const mockClient = getMockClient();
          const spawnOptions: SessionSpawnOptions = {
            agentId: `dash-agent-${Date.now()}`,
            model: options.model,
            task: options.task,
            context: {
              budget: budget,
              sandbox: options.sandbox,
              skills: options.skills ? options.skills.split(',') : undefined,
              systemPrompt: options.systemPrompt,
            },
          };
          
          const { sessionId } = await mockClient.sessionsSpawn(spawnOptions);
          
          // Persist the mock session
          const session = mockClient.getSession(sessionId);
          if (session) {
            setMockSession({
              sessionId: session.sessionId,
              agentId: session.agentId,
              status: session.status,
              createdAt: session.createdAt.toISOString(),
              model: options.model,
              task: options.task,
            });
          }
          
          console.log(`✓ Spawned agent: sessionKey=${sessionId}`);
          console.log(`✓ Model: ${options.model}`);
          console.log(`✓ Budget: $${budget}`);
          console.log(`✓ Status: idle (awaiting task)`);
          console.log(`\n💡 Use "dash openclaw send --session ${sessionId} <message>" to send a task`);
          return;
        }

        const executor = getAgentExecutor();

        // Use AgentExecutor to spawn the agent
        const execution = await executor.spawnAgent({
          task: options.task,
          model: options.model,
          systemPrompt: options.systemPrompt,
          skills: options.skills ? options.skills.split(',').map((s: string) => s.trim()) : [],
          sandbox: options.sandbox ? { mode: 'non-main' } : undefined,
          thinking: 'medium',
        });

        console.log(`✓ Spawned agent: sessionKey=${execution.sessionKey}`);
        console.log(`✓ Model: ${options.model}`);
        console.log(`✓ Budget: $${budget}`);
        console.log(`✓ Status: ${execution.status} (awaiting task)`);
        console.log(`\n💡 Use "dash openclaw send --session ${execution.sessionKey} <message>" to send a task`);
      } catch (error) {
        logger.error('openclaw', '❌ Failed to spawn agent');
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // openclaw send
  // ============================================================================
  openclaw
    .command('send')
    .description('Send task to agent')
    .requiredOption('-s, --session <sessionKey>', 'Session key (required)')
    .option('-a, --attach <file>', 'File attachment')
    .option('--mock', 'Use mock client for testing (no real gateway required)')
    .argument('<message>', 'Message to send')
    .action(async (message: string, options) => {
      try {
        console.log('📤 Sending message to agent...\n');

        // Validate attachment path if provided
        if (options.attach) {
          const validation = validateAttachmentPath(options.attach);
          if (!validation.valid) {
            console.error(`❌ Invalid attachment: ${validation.error}`);
            process.exit(1);
          }
        }

        // Check persisted state for mock mode
        const persistedState = getOpenClawState();
        const useMock = options.mock || (persistedState?.mockMode && persistedState?.connected);

        if (useMock) {
          const mockClient = getMockClient();
          const result = await mockClient.sessionsSend({
            sessionKey: options.session,
            message,
            attachments: options.attach ? [{ type: 'file', data: options.attach, filename: path.basename(options.attach) }] : undefined,
          });
          
          console.log(`✓ Message sent to ${options.session}`);
          console.log(`✓ RunId: ${result.runId}`);
          console.log(`✓ Status: ${result.status} (mock mode)`);
          return;
        }

        const sessionManager = getSessionManager();

        const result = await sessionManager.sessionsSend({
          sessionKey: options.session,
          message,
          attachments: options.attach ? [{ type: 'file', data: options.attach, filename: path.basename(options.attach) }] : undefined,
        });

        console.log(`✓ Message sent to ${options.session}`);
        console.log(`✓ RunId: ${result.runId}`);
        console.log(`✓ Status: ${result.status}`);
      } catch (error) {
        logger.error('openclaw', '❌ Failed to send message');
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // openclaw kill
  // ============================================================================
  openclaw
    .command('kill <sessionKey>')
    .description('Kill an OpenClaw session')
    .option('-f, --force', 'Force kill (immediate termination)')
    .option('--mock', 'Use mock client for testing (no real gateway required)')
    .action(async (sessionKey: string, options) => {
      try {
        console.log(`💀 Killing session ${sessionKey}...\n`);

        // Check persisted state for mock mode
        const persistedState = getOpenClawState();
        const useMock = options.mock || (persistedState?.mockMode && persistedState?.connected);

        if (useMock) {
          const mockClient = getMockClient();
          await mockClient.sessionKill(sessionKey, options.force);
          console.log(`✓ Session ${sessionKey} killed`);
          if (options.force) {
            console.log('  (force mode)');
          }
          return;
        }

        const sessionManager = getSessionManager();

        await sessionManager.sessionsKill(sessionKey);

        console.log(`✓ Session ${sessionKey} killed`);
        if (options.force) {
          console.log('  (force mode)');
        }
      } catch (error) {
        logger.error('openclaw', '❌ Failed to kill session');
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // openclaw bridge
  // ============================================================================
  openclaw
    .command('bridge')
    .description('Manage the OpenClaw-Dash event bridge')
    .option('--start', 'Start the event bridge')
    .option('--stop', 'Stop the event bridge')
    .option('--status', 'Check bridge status')
    .option('--webhook-url <url>', 'Webhook URL for event forwarding', process.env['OPENCLAW_EVENT_WEBHOOK_URL'])
    .option('--filter <types>', 'Comma-separated event types to filter (e.g., agent.spawned,agent.completed)')
    .option('--batch-interval <ms>', 'Batch interval in milliseconds (0 for immediate)', '0')
    .action(async (options) => {
      try {
        // Import the event bridge
        const { getOpenClawEventBridge, OpenClawEventBridge } = await import('../../integrations/openclaw/event-bridge');

        // Handle status check
        if (options.status) {
          console.log('🌉 OpenClaw Event Bridge Status\n');
          
          // Check if bridge is initialized
          const bridge = getOpenClawEventBridge({ webhookUrl: options.webhookUrl || 'http://localhost:8080/webhook' });
          const stats = bridge.getStats();
          const health = bridge.getHealth();
          
          console.log(`Status: ${health.status}`);
          console.log(`Running: ${health.isRunning ? 'Yes' : 'No'}`);
          console.log(`Subscriptions: ${health.subscriptionCount}`);
          console.log(`Buffered Events: ${health.bufferedEvents}`);
          console.log(`\nStatistics:`);
          console.log(`  Events Received: ${stats.eventsReceived}`);
          console.log(`  Events Forwarded: ${stats.eventsForwarded}`);
          console.log(`  Events Filtered: ${stats.eventsFiltered}`);
          console.log(`  Events Failed: ${stats.eventsFailed}`);
          console.log(`  Batches Sent: ${stats.batchesSent}`);
          if (stats.lastEventTime) {
            console.log(`  Last Event: ${stats.lastEventTime.toISOString()}`);
          }
          return;
        }

        // Handle start
        if (options.start) {
          if (!options.webhookUrl) {
            logger.error('openclaw', '❌ Webhook URL required. Use --webhook-url or set OPENCLAW_EVENT_WEBHOOK_URL');
            process.exit(1);
          }

          console.log('🌉 Starting OpenClaw Event Bridge...\n');
          
          const filter = options.filter ? options.filter.split(',') : undefined;
          const batchInterval = parseInt(options.batchInterval, 10) || 0;

          const bridge = getOpenClawEventBridge({
            webhookUrl: options.webhookUrl,
            filter,
            batchInterval,
          });

          await bridge.start();

          console.log('✓ Event bridge started');
          console.log(`  Webhook URL: ${options.webhookUrl}`);
          if (filter) {
            console.log(`  Filter: ${filter.join(', ')}`);
          }
          console.log(`  Batch Interval: ${batchInterval}ms`);
          console.log('\n💡 Events will be forwarded to OpenClaw in real-time');
          console.log('   Press Ctrl+C to stop');

          // Keep process alive
          process.on('SIGINT', async () => {
            console.log('\n\n🛑 Stopping event bridge...');
            await bridge.stop();
            console.log('✓ Event bridge stopped');
            process.exit(0);
          });

          // Wait indefinitely
          await new Promise(() => {});
          return;
        }

        // Handle stop
        if (options.stop) {
          console.log('🌉 Stopping OpenClaw Event Bridge...\n');
          
          const bridge = getOpenClawEventBridge({ webhookUrl: 'http://localhost:8080/webhook' });
          await bridge.stop();
          
          console.log('✓ Event bridge stopped');
          return;
        }

        // No action specified
        console.log('🌉 OpenClaw Event Bridge\n');
        console.log('Usage: dash openclaw bridge <action> [options]');
        console.log('\nActions:');
        console.log('  --start          Start the event bridge');
        console.log('  --stop           Stop the event bridge');
        console.log('  --status         Check bridge status');
        console.log('\nOptions:');
        console.log('  --webhook-url    Webhook URL for event forwarding');
        console.log('  --filter         Comma-separated event types to filter');
        console.log('  --batch-interval Batch interval in milliseconds');
        console.log('\nExamples:');
        console.log('  dash openclaw bridge --start --webhook-url http://localhost:8080/webhook');
        console.log('  dash openclaw bridge --status');
        console.log('  dash openclaw bridge --stop');
      } catch (error) {
        logger.error('openclaw', '❌ Bridge command failed');
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Re-export for testing
export { GatewayClient, SessionManager, AgentExecutor };

/**
 * Reset global state (for testing)
 */
export function resetOpenClawState(): void {
  globalGatewayClient = null;
  globalSessionManager = null;
  globalAgentExecutor = null;
  globalMockClient = null;
}

export default registerOpenClawCommand;
