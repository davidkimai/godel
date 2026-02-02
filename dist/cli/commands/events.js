"use strict";
/**
 * Events Command v2 - Event streaming and listing with Message Bus integration
 *
 * Commands:
 * - dash events stream [--agent <id>] [--type <type>] [--severity <level>]
 * - dash events list [--since <duration>] [--agent <id>] [--limit <n>]
 * - dash events show <event-id>
 * - dash events replay <session-id> [--speed <n>x]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEventsCommand = registerEventsCommand;
const index_1 = require("../../bus/index");
const lifecycle_1 = require("../../core/lifecycle");
const swarm_1 = require("../../core/swarm");
const memory_1 = require("../../storage/memory");
// In-memory event store for the v2 implementation
class EventStore {
    constructor() {
        this.events = [];
        this.maxSize = 10000;
    }
    add(event) {
        this.events.push(event);
        if (this.events.length > this.maxSize) {
            this.events.shift();
        }
    }
    list(options) {
        let filtered = [...this.events];
        if (options?.since) {
            filtered = filtered.filter(e => e.timestamp >= options.since);
        }
        if (options?.agentId) {
            filtered = filtered.filter(e => e.agentId === options.agentId);
        }
        if (options?.type) {
            filtered = filtered.filter(e => e.type === options.type);
        }
        if (options?.severity) {
            filtered = filtered.filter(e => e.severity === options.severity);
        }
        // Sort by timestamp descending (newest first)
        filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        if (options?.limit) {
            filtered = filtered.slice(0, options.limit);
        }
        return filtered;
    }
    getById(id) {
        return this.events.find(e => e.id === id);
    }
    clear() {
        this.events = [];
    }
    count() {
        return this.events.length;
    }
}
const eventStore = new EventStore();
function registerEventsCommand(program) {
    const events = program
        .command('events')
        .description('Event streaming and replay');
    // ============================================================================
    // events stream
    // ============================================================================
    events
        .command('stream')
        .description('Stream events in real-time from the message bus')
        .option('-a, --agent <id>', 'Filter by agent ID')
        .option('-s, --swarm <id>', 'Filter by swarm ID')
        .option('-t, --type <type>', 'Filter by event type (e.g., agent.spawned)')
        .option('--severity <level>', 'Filter by severity (debug|info|warning|error|critical)', 'info')
        .option('--raw', 'Output raw JSON instead of formatted lines')
        .option('--no-color', 'Disable colored output')
        .action(async (options) => {
        try {
            // Initialize components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            lifecycle.start();
            const swarmManager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            console.log('📡 Streaming events...\n');
            // Build filter
            const filter = {
                minPriority: options.severity,
            };
            if (options.type) {
                filter.eventTypes = [options.type];
            }
            // Determine topics to subscribe to
            const topics = [];
            if (options.agent) {
                topics.push(`agent.${options.agent}.events`);
                topics.push(`agent.${options.agent}.logs`);
            }
            else {
                topics.push('agent.*.events');
                topics.push('agent.*.logs');
            }
            if (options.swarm) {
                topics.push(`swarm.${options.swarm}.broadcast`);
            }
            else {
                topics.push('swarm.*.broadcast');
            }
            topics.push('system.alerts');
            // Subscribe to events
            const subscriptions = topics.map(topic => messageBus.subscribe(topic, (message) => {
                const event = messageToEventRecord(message);
                // Apply agent filter
                if (options.agent && event.agentId !== options.agent)
                    return;
                // Apply type filter
                if (options.type && event.type !== options.type)
                    return;
                // Apply severity filter
                const severityOrder = { debug: 0, info: 1, warning: 2, error: 3, critical: 4 };
                if (severityOrder[event.severity] < severityOrder[options.severity])
                    return;
                // Store event
                eventStore.add(event);
                // Output
                if (options.raw) {
                    console.log(JSON.stringify(event));
                }
                else {
                    console.log(formatEvent(event, !options.noColor));
                }
            }, filter));
            console.log(`Subscribed to ${subscriptions.length} topics`);
            console.log(`Filters: ${options.agent ? `agent=${options.agent} ` : ''}${options.swarm ? `swarm=${options.swarm} ` : ''}${options.type ? `type=${options.type} ` : ''}severity>=${options.severity}`);
            console.log('\n(Press Ctrl+C to stop)\n');
            // Keep alive
            await new Promise(() => {
                process.on('SIGINT', () => {
                    console.log('\n\n👋 Stopping event stream...');
                    messageBus.unsubscribeAll(subscriptions);
                    process.exit(0);
                });
            });
        }
        catch (error) {
            console.error('❌ Stream error:', error instanceof Error ? error.message : String(error));
            process.exit(3);
        }
    });
    // ============================================================================
    // events list
    // ============================================================================
    events
        .command('list')
        .description('List historical events from the message bus')
        .option('-a, --agent <id>', 'Filter by agent ID')
        .option('-s, --swarm <id>', 'Filter by swarm ID')
        .option('-t, --type <type>', 'Filter by event type')
        .option('--severity <level>', 'Filter by severity (debug|info|warning|error|critical)')
        .option('--since <duration>', 'Time window (e.g., 1h, 1d, 30m)')
        .option('-l, --limit <n>', 'Maximum events to show', '50')
        .option('-f, --format <format>', 'Output format (table|json)', 'table')
        .action(async (options) => {
        try {
            // Initialize components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            lifecycle.start();
            const swarmManager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            // Calculate since date
            let since;
            if (options.since) {
                const match = options.since.match(/^(\d+)([mhd])$/);
                if (match) {
                    const [, num, unit] = match;
                    const multiplier = unit === 'm' ? 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
                    since = new Date(Date.now() - parseInt(num) * multiplier);
                }
            }
            // Fetch from message bus if persistence is enabled
            const busMessages = messageBus.getAllMessages(parseInt(options.limit, 10));
            // Convert and filter
            let events = busMessages.map(messageToEventRecord);
            // Apply filters
            if (since) {
                events = events.filter(e => e.timestamp >= since);
            }
            if (options.agent) {
                events = events.filter(e => e.agentId === options.agent);
            }
            if (options.swarm) {
                events = events.filter(e => e.swarmId === options.swarm);
            }
            if (options.type) {
                events = events.filter(e => e.type === options.type);
            }
            if (options.severity) {
                events = events.filter(e => e.severity === options.severity);
            }
            // Sort by timestamp descending
            events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            // Limit
            events = events.slice(0, parseInt(options.limit, 10));
            // Also merge with local event store
            const storedEvents = eventStore.list({
                since,
                agentId: options.agent,
                type: options.type,
                severity: options.severity,
                limit: parseInt(options.limit, 10),
            });
            // Merge and deduplicate by ID
            const eventMap = new Map();
            for (const e of [...storedEvents, ...events]) {
                eventMap.set(e.id, e);
            }
            events = Array.from(eventMap.values())
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .slice(0, parseInt(options.limit, 10));
            if (events.length === 0) {
                console.log('📭 No events found');
                console.log('💡 Use "dash events stream" to capture real-time events');
                return;
            }
            if (options.format === 'json') {
                console.log(JSON.stringify(events, null, 2));
                return;
            }
            // Table format
            console.log('📋 Events:\n');
            console.log('Timestamp            Severity   Type                          Source');
            console.log('───────────────────  ─────────  ────────────────────────────  ──────────────');
            for (const event of events) {
                const timestamp = event.timestamp.toISOString().slice(0, 19).replace('T', ' ');
                const severity = getSeverityEmoji(event.severity) + ' ' + event.severity.padEnd(8);
                const type = event.type.slice(0, 28).padEnd(28);
                const source = (event.agentId?.slice(0, 14) || event.source?.slice(0, 14) || 'system').padEnd(14);
                console.log(`${timestamp}  ${severity}  ${type}  ${source}`);
            }
            console.log(`\n📊 Showing ${events.length} events`);
        }
        catch (error) {
            console.error('❌ Failed to list events:', error instanceof Error ? error.message : String(error));
            process.exit(3);
        }
    });
    // ============================================================================
    // events show
    // ============================================================================
    events
        .command('show')
        .description('Show event details')
        .argument('<event-id>', 'Event ID')
        .action(async (eventId) => {
        try {
            // Try to find in local store first
            let event = eventStore.getById(eventId);
            // Try message bus if not found
            if (!event) {
                const messageBus = (0, index_1.getGlobalBus)();
                const messages = messageBus.getAllMessages(1000);
                const message = messages.find((m) => {
                    const payload = m.payload;
                    return payload?.id === eventId || m.id === eventId;
                });
                if (message) {
                    event = messageToEventRecord(message);
                }
            }
            if (!event) {
                console.error(`❌ Event ${eventId} not found`);
                process.exit(2);
            }
            console.log(`📄 Event: ${event.id}\n`);
            console.log(`   Timestamp: ${event.timestamp.toISOString()}`);
            console.log(`   Type:      ${event.type}`);
            console.log(`   Severity:  ${getSeverityEmoji(event.severity)} ${event.severity}`);
            console.log(`   Source:    ${event.source}`);
            if (event.agentId) {
                console.log(`   Agent ID:  ${event.agentId}`);
            }
            if (event.swarmId) {
                console.log(`   Swarm ID:  ${event.swarmId}`);
            }
            if (event.message) {
                console.log(`\n   Message:   ${event.message}`);
            }
            if (event.metadata) {
                console.log(`\n   Metadata:`);
                console.log(JSON.stringify(event.metadata, null, 4).replace(/^/gm, '     '));
            }
        }
        catch (error) {
            console.error('❌ Failed to show event:', error instanceof Error ? error.message : String(error));
            process.exit(3);
        }
    });
    // ============================================================================
    // events replay
    // ============================================================================
    events
        .command('replay')
        .description('Replay historical events (simulated)')
        .argument('<session-id>', 'Session or swarm ID to replay')
        .option('-s, --speed <speed>', 'Playback speed multiplier', '1')
        .option('--from <time>', 'Start time (ISO format)')
        .option('--to <time>', 'End time (ISO format)')
        .action(async (sessionId, options) => {
        try {
            const speed = parseFloat(options.speed);
            if (isNaN(speed) || speed <= 0) {
                console.error('❌ Invalid speed');
                process.exit(2);
            }
            // Initialize components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            lifecycle.start();
            const swarmManager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            // Check if session exists
            const swarm = swarmManager.getSwarm(sessionId);
            if (!swarm) {
                console.error(`❌ Session/Swarm ${sessionId} not found`);
                process.exit(2);
            }
            console.log(`▶️  Replaying events for swarm: ${swarm.name}`);
            console.log(`   Speed: ${speed}x`);
            console.log(`   From: ${options.from || swarm.createdAt.toISOString()}`);
            console.log(`   To: ${options.to || new Date().toISOString()}`);
            console.log('\n   (Replay functionality would show events with simulated timing)');
            console.log('   (Press Ctrl+C to stop)\n');
            // In a full implementation, this would:
            // 1. Load events from persistent storage
            // 2. Replay them with timing adjusted by speed multiplier
            // 3. Allow interactive controls (pause, skip, etc.)
            // For now, just show the agents in the swarm
            const agentStates = swarmManager.getSwarmAgents(sessionId);
            console.log(`   Swarm had ${agentStates.length} agents:`);
            for (const state of agentStates) {
                console.log(`     • ${state.id} - ${state.status}`);
            }
        }
        catch (error) {
            console.error('❌ Replay error:', error instanceof Error ? error.message : String(error));
            process.exit(3);
        }
    });
    // ============================================================================
    // events clear
    // ============================================================================
    events
        .command('clear')
        .description('Clear local event cache')
        .option('--yes', 'Skip confirmation')
        .action(async (options) => {
        try {
            const count = eventStore.count();
            if (count === 0) {
                console.log('📭 Event cache is already empty');
                return;
            }
            console.log(`⚠️  This will clear ${count} events from local cache`);
            if (!options.yes) {
                console.log('🛑 Use --yes to confirm');
                return;
            }
            eventStore.clear();
            console.log('✅ Event cache cleared');
        }
        catch (error) {
            console.error('❌ Failed to clear events:', error instanceof Error ? error.message : String(error));
            process.exit(3);
        }
    });
}
// ============================================================================
// Helper Functions
// ============================================================================
function messageToEventRecord(message) {
    const payload = message.payload;
    const eventType = payload?.eventType || 'unknown';
    const source = message.metadata?.source || payload?.source?.agentId || 'system';
    const agentId = payload?.source?.agentId;
    const swarmId = payload?.source?.swarmId;
    // Determine severity based on event type
    let severity = 'info';
    if (eventType.includes('failed') || eventType.includes('error')) {
        severity = 'error';
    }
    else if (eventType.includes('critical') || eventType.includes('emergency')) {
        severity = 'critical';
    }
    else if (eventType.includes('warning')) {
        severity = 'warning';
    }
    else if (eventType.includes('completed') || eventType.includes('success')) {
        severity = 'info';
    }
    else if (eventType.includes('debug')) {
        severity = 'debug';
    }
    return {
        id: message.id,
        timestamp: message.timestamp,
        type: eventType,
        source,
        severity,
        message: getEventDescription(eventType, payload?.payload),
        agentId,
        swarmId,
        metadata: payload?.payload,
    };
}
function getEventDescription(eventType, payload) {
    const descriptions = {
        'agent.spawned': `Agent spawned: ${payload?.['model'] || 'unknown model'}`,
        'agent.completed': `Agent completed in ${payload?.['runtime'] || '?'}ms`,
        'agent.failed': `Agent failed: ${payload?.['error'] || 'unknown error'}`,
        'agent.killed': `Agent killed${payload?.['force'] ? ' (forced)' : ''}`,
        'agent.paused': 'Agent paused',
        'agent.resumed': 'Agent resumed',
        'agent.status_changed': `Status: ${payload?.['previousStatus']} → ${payload?.['newStatus']}`,
        'swarm.created': `Swarm created: ${payload?.['name']}`,
        'swarm.scaled': `Swarm scaled: ${payload?.['previousSize']} → ${payload?.['newSize']}`,
        'system.emergency_stop': `Emergency stop: ${payload?.['reason']}`,
    };
    return descriptions[eventType] || eventType;
}
function formatEvent(event, useColor) {
    const timestamp = event.timestamp.toISOString().slice(0, 19);
    const severity = getSeverityEmoji(event.severity);
    const type = event.type.padEnd(25);
    const source = (event.agentId?.slice(0, 12) || event.source?.slice(0, 12) || 'system').padEnd(12);
    return `[${timestamp}] ${severity} ${type} ${source} ${event.message}`;
}
function getSeverityEmoji(severity) {
    const emojiMap = {
        debug: '🔍',
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌',
        critical: '🚨',
    };
    return emojiMap[severity] || '•';
}
//# sourceMappingURL=events.js.map