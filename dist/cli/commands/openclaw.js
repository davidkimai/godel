"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentExecutor = exports.SessionManager = exports.GatewayClient = void 0;
exports.registerOpenClawCommand = registerOpenClawCommand;
exports.resetOpenClawState = resetOpenClawState;
const path = __importStar(require("path"));
const openclaw_1 = require("../../integrations/openclaw");
Object.defineProperty(exports, "GatewayClient", { enumerable: true, get: function () { return openclaw_1.GatewayClient; } });
Object.defineProperty(exports, "SessionManager", { enumerable: true, get: function () { return openclaw_1.SessionManager; } });
Object.defineProperty(exports, "AgentExecutor", { enumerable: true, get: function () { return openclaw_1.AgentExecutor; } });
const openclaw_2 = require("../../core/openclaw");
const cli_state_1 = require("../../utils/cli-state");
// ============================================================================
// Validation Helpers
// ============================================================================
/**
 * Validate a file path for attachments
 * Prevents path traversal attacks
 */
function validateAttachmentPath(filePath) {
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
        const isAllowed = allowedPrefixes.some(prefix => prefix && normalized.startsWith(prefix));
        if (!isAllowed) {
            return { valid: false, error: 'Absolute path not in allowed directories' };
        }
    }
    return { valid: true };
}
// ============================================================================
// Global State (for CLI session)
// ============================================================================
let globalGatewayClient = null;
let globalSessionManager = null;
let globalAgentExecutor = null;
let globalMockClient = null;
function getGatewayClient() {
    if (!globalGatewayClient) {
        // Check if we have persisted state
        const state = (0, cli_state_1.getOpenClawState)();
        if (state?.connected && !state?.mockMode) {
            // Re-create client from persisted state
            const config = {
                host: state.host || '127.0.0.1',
                port: state.port || 18789,
            };
            globalGatewayClient = new openclaw_1.GatewayClient(config, {
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
function getSessionManager() {
    if (!globalSessionManager) {
        // Check if we have persisted state
        const state = (0, cli_state_1.getOpenClawState)();
        if (state?.connected && !state?.mockMode) {
            const config = {
                host: state.host || '127.0.0.1',
                port: state.port || 18789,
            };
            globalSessionManager = (0, openclaw_1.getGlobalSessionManager)(config);
            return globalSessionManager;
        }
        throw new Error('Not connected to OpenClaw Gateway. Run "dash openclaw connect" first.');
    }
    return globalSessionManager;
}
function getAgentExecutor() {
    if (!globalAgentExecutor) {
        const sessionManager = getSessionManager();
        globalAgentExecutor = (0, openclaw_1.createAgentExecutor)(sessionManager);
        return globalAgentExecutor;
    }
    return globalAgentExecutor;
}
function getMockClient() {
    if (!globalMockClient) {
        globalMockClient = new openclaw_2.MockOpenClawClient();
        // Restore persisted mock sessions
        const persistedSessions = (0, cli_state_1.getMockSessions)();
        for (const session of persistedSessions) {
            // Re-create sessions in the mock client
            globalMockClient.restoreSession(session);
        }
    }
    return globalMockClient;
}
function isMockMode() {
    return (0, cli_state_1.isOpenClawMockMode)();
}
// ============================================================================
// Command Registration
// ============================================================================
function registerOpenClawCommand(program) {
    const openclaw = program
        .command('openclaw')
        .description('Manage OpenClaw Gateway integration');
    // ============================================================================
    // openclaw connect
    // ============================================================================
    openclaw
        .command('connect')
        .description('Connect to OpenClaw Gateway')
        .option('--host <host>', 'Gateway host', '127.0.0.1')
        .option('--port <port>', 'Gateway port', '18789')
        .option('--token <token>', 'Authentication token (or set OPENCLAW_GATEWAY_TOKEN)')
        .option('--mock', 'Use mock client for testing (no real gateway required)')
        .action(async (options) => {
        try {
            console.log('🔌 Connecting to OpenClaw Gateway...\n');
            // Validate port number
            const port = parseInt(options.port, 10);
            if (isNaN(port) || port < 1 || port > 65535) {
                console.error('❌ Invalid port number. Port must be between 1 and 65535.');
                process.exit(1);
            }
            const token = options.token || process.env['OPENCLAW_GATEWAY_TOKEN'];
            if (options.mock) {
                // Use mock client for testing
                globalMockClient = new openclaw_2.MockOpenClawClient();
                // Persist mock connection state
                (0, cli_state_1.setOpenClawState)({
                    connected: true,
                    mockMode: true,
                    host: options.host,
                    port: port,
                    connectedAt: new Date().toISOString(),
                });
                console.log('✓ Using mock OpenClaw client (testing mode)');
                console.log('✓ Mock client initialized');
                return;
            }
            // Create and connect using real GatewayClient
            const config = {
                host: options.host,
                port: port,
                token,
            };
            globalGatewayClient = new openclaw_1.GatewayClient(config, {
                autoReconnect: true,
                subscriptions: ['agent', 'chat', 'presence', 'tick'],
            });
            await globalGatewayClient.connect();
            // Create SessionManager and AgentExecutor from the connected GatewayClient
            globalSessionManager = (0, openclaw_1.getGlobalSessionManager)(config);
            await globalSessionManager.connect();
            globalAgentExecutor = (0, openclaw_1.createAgentExecutor)(globalSessionManager);
            // Persist connection state
            (0, cli_state_1.setOpenClawState)({
                connected: true,
                mockMode: false,
                host: options.host,
                port: port,
                connectedAt: new Date().toISOString(),
            });
            console.log(`✓ Connected to OpenClaw Gateway at ws://${options.host}:${port}`);
            if (token) {
                console.log(`✓ Authenticated (token: ***)`);
            }
            else {
                console.log('⚠ No token provided (unauthenticated connection)');
            }
            console.log('✓ Subscribed to events: agent, chat, presence, tick');
        }
        catch (error) {
            console.error('❌ Failed to connect to OpenClaw Gateway');
            console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
            console.error('\n💡 Troubleshooting:');
            console.error('   - Ensure OpenClaw Gateway is running');
            console.error('   - Check host and port are correct');
            console.error('   - Verify authentication token');
            console.error('   - Use --mock flag for testing without gateway');
            process.exit(1);
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
            const persistedState = (0, cli_state_1.getOpenClawState)();
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
            const client = getGatewayClient();
            if (!client.connected) {
                console.log('🔌 OpenClaw Gateway Status\n');
                console.log('⚠ Persisted state shows connected, but client is not connected');
                console.log('  This may indicate a stale connection state.');
                console.log('\n💡 Run "dash openclaw connect" to reconnect');
                process.exit(1);
            }
            // Get gateway statistics
            const stats = client.statistics;
            console.log('🔌 OpenClaw Gateway Status\n');
            console.log(`✓ Connected: ${client.connectionState}`);
            console.log(`  Connection State: ${client.connectionState}`);
            if (stats.connectedAt) {
                console.log(`  Connected At: ${stats.connectedAt.toISOString()}`);
            }
            console.log(`  Requests Sent: ${stats.requestsSent}`);
            console.log(`  Responses Received: ${stats.responsesReceived}`);
            console.log(`  Events Received: ${stats.eventsReceived}`);
            console.log(`  Reconnections: ${stats.reconnections}`);
            if (stats.lastPing) {
                console.log(`  Last Ping: ${new Date(stats.lastPing).toISOString()}`);
            }
        }
        catch (error) {
            console.error('❌ Failed to get gateway status');
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
            const persistedState = (0, cli_state_1.getOpenClawState)();
            if (options.mock || (persistedState?.mockMode && persistedState?.connected)) {
                const mockClient = getMockClient();
                const sessions = mockClient.getAllSessions();
                // Also load from persisted state if memory is empty
                const persistedSessions = (0, cli_state_1.getMockSessions)();
                const allSessionIds = new Set(sessions.map(s => s.sessionId));
                for (const persisted of persistedSessions) {
                    if (!allSessionIds.has(persisted.sessionId)) {
                        sessions.push({
                            sessionId: persisted.sessionId,
                            agentId: persisted.agentId,
                            status: persisted.status,
                            createdAt: new Date(persisted.createdAt),
                            metadata: { model: persisted.model, task: persisted.task },
                        });
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
                console.error('❌ Not connected to OpenClaw Gateway. Run "dash openclaw connect" first.');
                process.exit(1);
            }
            const sessionManager = getSessionManager();
            const params = {};
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
        }
        catch (error) {
            console.error('❌ Failed to list sessions');
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
        .action(async (sessionKey, options) => {
        try {
            // Validate limit
            const limit = parseInt(options.limit, 10);
            if (isNaN(limit) || limit < 1 || limit > 1000) {
                console.error('❌ Invalid limit. Must be between 1 and 1000.');
                process.exit(1);
            }
            // Check persisted state for mock mode
            const persistedState = (0, cli_state_1.getOpenClawState)();
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
                console.log('\n[Mock mode - no transcript available]');
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
        }
        catch (error) {
            console.error('❌ Failed to get session history');
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
                console.error('❌ Invalid budget. Must be between 0 and 10000 USD.');
                process.exit(1);
            }
            // Check persisted state for mock mode
            const persistedState = (0, cli_state_1.getOpenClawState)();
            const useMock = options.mock || (persistedState?.mockMode && persistedState?.connected);
            if (useMock) {
                // Use mock client
                const mockClient = getMockClient();
                const spawnOptions = {
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
                    (0, cli_state_1.setMockSession)({
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
                skills: options.skills ? options.skills.split(',').map((s) => s.trim()) : [],
                sandbox: options.sandbox ? { mode: 'non-main' } : undefined,
                thinking: 'medium',
            });
            console.log(`✓ Spawned agent: sessionKey=${execution.sessionKey}`);
            console.log(`✓ Model: ${options.model}`);
            console.log(`✓ Budget: $${budget}`);
            console.log(`✓ Status: ${execution.status} (awaiting task)`);
            console.log(`\n💡 Use "dash openclaw send --session ${execution.sessionKey} <message>" to send a task`);
        }
        catch (error) {
            console.error('❌ Failed to spawn agent');
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
        .action(async (message, options) => {
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
            const persistedState = (0, cli_state_1.getOpenClawState)();
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
        }
        catch (error) {
            console.error('❌ Failed to send message');
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
        .action(async (sessionKey, options) => {
        try {
            console.log(`💀 Killing session ${sessionKey}...\n`);
            // Check persisted state for mock mode
            const persistedState = (0, cli_state_1.getOpenClawState)();
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
        }
        catch (error) {
            console.error('❌ Failed to kill session');
            console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    });
}
// ============================================================================
// Helper Functions
// ============================================================================
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000)
        return `${Math.floor(ms / 60000)}m`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
function formatTimeAgo(date) {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000)
        return 'now';
    if (diff < 3600000)
        return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000)
        return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}
/**
 * Reset global state (for testing)
 */
function resetOpenClawState() {
    globalGatewayClient = null;
    globalSessionManager = null;
    globalAgentExecutor = null;
    globalMockClient = null;
}
exports.default = registerOpenClawCommand;
//# sourceMappingURL=openclaw.js.map