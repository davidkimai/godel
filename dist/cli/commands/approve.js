"use strict";
/**
 * Approval Command - CLI Interface
 *
 * Provides CLI commands for managing approval workflows:
 * - list: List pending approvals
 * - get: Get approval details
 * - respond: Approve/Deny an approval request
 * - approve-all: Batch approve for an agent
 * - audit: Query audit trail
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApprovalCommand = createApprovalCommand;
const commander_1 = require("commander");
const utils_1 = require("../../utils");
const approval_1 = require("../../safety/approval");
const pending_1 = require("../../safety/pending");
const escalation_1 = require("../../safety/escalation");
// ============================================================================
// Utility Functions
// ============================================================================
function parseDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${dateStr}`);
    }
    return date;
}
function parseDuration(durationStr) {
    // Parse duration like "1h", "30m", "2d" into minutes
    const match = durationStr.match(/^(\d+)([mhd])$/);
    if (!match) {
        throw new Error(`Invalid duration format: ${durationStr}. Use format like "30m", "1h", "2d"`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 'm': return value;
        case 'h': return value * 60;
        case 'd': return value * 60 * 24;
        default: return value;
    }
}
// ============================================================================
// CLI Commands
// ============================================================================
function createApprovalCommand() {
    const program = new commander_1.Command('approve');
    program
        .description('Manage human-in-loop approval workflows')
        .addCommand(createListCommand())
        .addCommand(createGetCommand())
        .addCommand(createRespondCommand())
        .addCommand(createApproveAllCommand())
        .addCommand(createAuditCommand())
        .addCommand(createEscalateCommand())
        .addCommand(createEmergencyCommand())
        .addCommand(createMonitorCommand())
        .addCommand(createStatsCommand());
    return program;
}
function createListCommand() {
    return new commander_1.Command('list')
        .description('List pending approval requests')
        .addOption(new commander_1.Option('--status <status>', 'Filter by status').choices(['pending', 'approved', 'denied', 'expired', 'all']))
        .addOption(new commander_1.Option('--agent <agent-id>', 'Filter by agent ID'))
        .addOption(new commander_1.Option('--type <type>', 'Filter by operation type').choices(['file_write', 'file_delete', 'api_call', 'budget_overrun', 'agent_termination']))
        .addOption(new commander_1.Option('--risk <level>', 'Filter by risk level').choices(['low', 'medium', 'high', 'critical']))
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .addOption(new commander_1.Option('--limit <number>', 'Limit results').default('50'))
        .action(async (options) => {
        try {
            const requests = (0, pending_1.listPending)({
                status: options.status || 'pending',
                agentId: options.agent,
                operationType: options.type,
                riskLevel: options.risk,
                limit: parseInt(options.limit || '50', 10)
            });
            console.log((0, pending_1.formatListForDisplay)(requests, options.format));
            if (options.format === 'table') {
                const stats = (0, pending_1.getStats)();
                console.log(`\nStats: ${stats.pending} pending, ${stats.approved} approved, ${stats.denied} denied`);
            }
        }
        catch (error) {
            utils_1.logger.error('Failed to list approvals', { error });
            process.exit(1);
        }
    });
}
function createGetCommand() {
    return new commander_1.Command('get')
        .description('Show details of a specific approval request')
        .argument('<id>', 'Approval request ID')
        .addOption(new commander_1.Option('--include-context', 'Include full context'))
        .action(async (id, options) => {
        try {
            const request = (0, pending_1.getApprovalDetails)(id, options.includeContext);
            if (!request) {
                console.error(`Approval request not found: ${id}`);
                process.exit(1);
            }
            console.log((0, pending_1.formatDetailsForDisplay)(request));
        }
        catch (error) {
            utils_1.logger.error('Failed to get approval details', { error });
            process.exit(1);
        }
    });
}
function createRespondCommand() {
    return new commander_1.Command('respond')
        .description('Respond to an approval request')
        .argument('<id>', 'Approval request ID')
        .addOption(new commander_1.Option('--approve', 'Approve the request').implies({ deny: undefined }))
        .addOption(new commander_1.Option('--deny', 'Deny the request').conflicts('approve'))
        .addOption(new commander_1.Option('--notes <notes>', 'Add notes to the response'))
        .addOption(new commander_1.Option('--justification <justification>', 'Justification for decision (required for denial)'))
        .action(async (id, options) => {
        try {
            const request = (0, pending_1.getApprovalDetails)(id);
            if (!request) {
                console.error(`Approval request not found: ${id}`);
                process.exit(1);
            }
            if (request.status !== 'pending') {
                console.error(`Cannot respond to request with status: ${request.status}`);
                process.exit(1);
            }
            const decision = options.approve ? 'approve' : 'deny';
            // For denial, justification is required
            if (decision === 'deny' && !options.justification) {
                utils_1.logger.error('approve', 'Justification is required for denial. Use --justification flag.');
                process.exit(1);
            }
            const approver = {
                type: 'human',
                identity: 'current-user',
                displayName: 'Current User'
            };
            const response = (0, approval_1.respondToRequest)(request, decision, approver, options.justification || '', options.notes);
            console.log(`\n✅ Request ${id} ${decision}d`);
            console.log(`Decision: ${response.decision.toUpperCase()}`);
            console.log(`Responded at: ${response.respondedAt.toISOString()}`);
            if (response.justification) {
                console.log(`Justification: ${response.justification}`);
            }
            if (response.notes) {
                console.log(`Notes: ${response.notes}`);
            }
        }
        catch (error) {
            utils_1.logger.error('Failed to respond to approval', { error });
            process.exit(1);
        }
    });
}
function createApproveAllCommand() {
    return new commander_1.Command('all')
        .description('Batch approve pending requests for an agent')
        .addOption(new commander_1.Option('--agent <agent-id>', 'Filter by agent ID').makeOptionMandatory())
        .addOption(new commander_1.Option('--type <type>', 'Filter by operation type').choices(['file_write', 'file_delete', 'api_call', 'budget_overrun', 'agent_termination']))
        .addOption(new commander_1.Option('--risk <level>', 'Filter by risk level').choices(['low', 'medium', 'high', 'critical']))
        .addOption(new commander_1.Option('--dry-run', 'Show what would be approved without actually approving'))
        .addOption(new commander_1.Option('--limit <number>', 'Maximum approvals').default('100'))
        .action(async (options) => {
        try {
            const requests = (0, pending_1.listPending)({
                status: 'pending',
                agentId: options.agent,
                operationType: options.type,
                riskLevel: options.risk,
                limit: parseInt(options.limit || '100', 10)
            });
            if (requests.length === 0) {
                utils_1.logger.info('approve', 'No matching pending requests found.');
                return;
            }
            console.log(`Found ${requests.length} matching request(s):\n`);
            for (const request of requests) {
                console.log(`  - ${request.id}: ${request.operation.type} - ${request.operation.target}`);
            }
            if (options.dryRun) {
                console.log('\n🔍 Dry run - no approvals were made.');
                return;
            }
            utils_1.logger.info('approve', '\n⏳ Approving all...');
            let approved = 0;
            let skipped = 0;
            const approver = {
                type: 'human',
                identity: 'current-user',
                displayName: 'Current User'
            };
            for (const request of requests) {
                try {
                    (0, approval_1.respondToRequest)(request, 'approve', approver, 'Batch approval via CLI');
                    approved++;
                }
                catch (error) {
                    skipped++;
                    utils_1.logger.warn('Failed to approve request', { requestId: request.id, error });
                }
            }
            console.log(`\n✅ Approved: ${approved}, Skipped: ${skipped}`);
        }
        catch (error) {
            utils_1.logger.error('Failed to batch approve', { error });
            process.exit(1);
        }
    });
}
function createAuditCommand() {
    return new commander_1.Command('audit')
        .description('Query approval audit trail')
        .addOption(new commander_1.Option('--agent <agent-id>', 'Filter by agent ID'))
        .addOption(new commander_1.Option('--since <date>', 'Filter by date (e.g., "1h ago", "2026-02-01")'))
        .addOption(new commander_1.Option('--risk <level>', 'Filter by risk level').choices(['low', 'medium', 'high', 'critical']))
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .addOption(new commander_1.Option('--limit <number>', 'Limit results').default('100'))
        .action(async (options) => {
        try {
            let since;
            if (options.since) {
                if (options.since.includes('ago')) {
                    // Parse relative time like "1h ago"
                    const match = options.since.match(/^(\d+)([mhd])\s*ago$/);
                    if (match) {
                        const value = parseInt(match[1], 10);
                        const unit = match[2];
                        const multiplier = unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
                        since = new Date(Date.now() - value * multiplier * 1000);
                    }
                    else {
                        throw new Error(`Invalid relative time format: ${options.since}`);
                    }
                }
                else {
                    since = parseDate(options.since);
                }
            }
            const logs = (0, approval_1.getAuditLogs)({
                agentId: options.agent,
                since,
                riskLevel: options.risk
            }).slice(0, parseInt(options.limit || '100', 10));
            if (logs.length === 0) {
                utils_1.logger.info('approve', 'No audit logs found matching criteria.');
                return;
            }
            if (options.format === 'json') {
                console.log(JSON.stringify(logs, null, 2));
            }
            else {
                utils_1.logger.info('approve', 'APPROVAL AUDIT TRAIL');
                console.log('═'.repeat(80));
                for (const log of logs) {
                    console.log(`\nID: ${log.id}`);
                    console.log(`Request: ${log.requestId}`);
                    console.log(`Agent: ${log.requestingAgent.agentId}`);
                    console.log(`Operation: ${log.operation.type} - ${log.operation.target}`);
                    console.log(`Risk: ${log.risk.level}`);
                    console.log(`Created: ${log.createdAt.toISOString()}`);
                    if (log.respondedAt) {
                        console.log(`Responded: ${log.respondedAt.toISOString()}`);
                    }
                    if (log.decision) {
                        console.log(`Decision: ${log.decision.decision.toUpperCase()}`);
                        console.log(`Approver: ${log.decision.approver.identity}`);
                    }
                    console.log('─'.repeat(40));
                }
                console.log(`\nTotal: ${logs.length} entries`);
            }
        }
        catch (error) {
            utils_1.logger.error('Failed to query audit logs', { error });
            process.exit(1);
        }
    });
}
function createEscalateCommand() {
    return new commander_1.Command('escalate')
        .description('Manually escalate an approval request')
        .argument('<id>', 'Approval request ID')
        .addOption(new commander_1.Option('--reason <reason>', 'Reason for escalation').makeOptionMandatory())
        .action(async (id, options) => {
        try {
            const request = (0, pending_1.getApprovalDetails)(id);
            if (!request) {
                console.error(`Approval request not found: ${id}`);
                process.exit(1);
            }
            if (request.status !== 'pending' && request.status !== 'escalated') {
                console.error(`Cannot escalate request with status: ${request.status}`);
                process.exit(1);
            }
            const escalated = (0, escalation_1.escalateRequest)(request, options.reason);
            console.log(`✅ Request ${id} escalated`);
            console.log(`New status: ${escalated.status}`);
            console.log(`Escalation count: ${escalated.escalationCount}/${escalated.maxEscalations}`);
            if (escalated.expiresAt) {
                console.log(`New expiration: ${escalated.expiresAt.toISOString()}`);
            }
        }
        catch (error) {
            utils_1.logger.error('Failed to escalate request', { error });
            process.exit(1);
        }
    });
}
function createEmergencyCommand() {
    return new commander_1.Command('emergency-override')
        .description('Emergency override for critical operations')
        .argument('<id>', 'Approval request ID')
        .addOption(new commander_1.Option('--reason <reason>', 'Critical reason for override').makeOptionMandatory())
        .addOption(new commander_1.Option('--justification <justification>', 'Detailed justification').makeOptionMandatory())
        .action(async (id, options) => {
        try {
            const approver = {
                type: 'human',
                identity: 'current-user',
                displayName: 'Current User',
                sessionId: `session_${Date.now()}`
            };
            const overridden = (0, escalation_1.emergencyOverride)({
                requestId: id,
                approver,
                reason: options.reason,
                justification: options.justification
            });
            console.log(`🚨 EMERGENCY OVERRIDE EXECUTED`);
            console.log(`Request: ${id}`);
            console.log(`Operation: ${overridden.operation.type} - ${overridden.operation.target}`);
            console.log(`Override by: ${approver.identity}`);
            console.log(`Reason: ${options.reason}`);
            console.log(`Justification: ${options.justification}`);
            // Log warning
            console.log('\n⚠️  WARNING: Emergency override has been logged with enhanced audit trail.');
            utils_1.logger.info('approve', 'This action will be reviewed in the next security audit.');
        }
        catch (error) {
            utils_1.logger.error('Failed to execute emergency override', { error });
            process.exit(1);
        }
    });
}
function createMonitorCommand() {
    return new commander_1.Command('monitor')
        .description('Manage escalation monitoring')
        .addOption(new commander_1.Option('--start', 'Start monitoring'))
        .addOption(new commander_1.Option('--stop', 'Stop monitoring'))
        .addOption(new commander_1.Option('--status', 'Show monitoring status'))
        .addOption(new commander_1.Option('--interval <ms>', 'Check interval in milliseconds'))
        .action(async (options) => {
        try {
            if (options.status || (!options.start && !options.stop)) {
                const status = (0, escalation_1.isMonitoring)();
                const config = (0, escalation_1.getEscalationConfig)();
                utils_1.logger.info('approve', 'ESCALATION MONITOR STATUS');
                console.log('═'.repeat(40));
                console.log(`Monitoring: ${status ? 'RUNNING' : 'STOPPED'}`);
                if (status) {
                    console.log(`Check interval: ${config.checkInterval}ms`);
                    console.log(`Auto-deny: ${config.enableAutoDeny ? 'enabled' : 'disabled'}`);
                    console.log(`Notifications: ${config.notifyOnEscalation ? 'enabled' : 'disabled'}`);
                }
                return;
            }
            if (options.start) {
                const interval = options.interval ? parseInt(options.interval, 10) : undefined;
                (0, escalation_1.startMonitoring)({ checkInterval: interval });
                console.log('✅ Escalation monitoring started');
            }
            if (options.stop) {
                (0, escalation_1.stopMonitoring)();
                console.log('✅ Escalation monitoring stopped');
            }
        }
        catch (error) {
            utils_1.logger.error('Failed to manage monitoring', { error });
            process.exit(1);
        }
    });
}
function createStatsCommand() {
    return new commander_1.Command('stats')
        .description('Show approval statistics')
        .addOption(new commander_1.Option('--period <period>', 'Time period').choices(['day', 'week', 'month']))
        .addOption(new commander_1.Option('--agent <agent-id>', 'Filter by agent'))
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .action(async (options) => {
        try {
            const stats = (0, pending_1.getStats)();
            if (options.format === 'json') {
                console.log(JSON.stringify(stats, null, 2));
            }
            else {
                utils_1.logger.info('approve', 'APPROVAL STATISTICS');
                console.log('═'.repeat(40));
                console.log(`Total Requests:  ${stats.total}`);
                console.log(`  Pending:   ${stats.pending}`);
                console.log(`  Approved:  ${stats.approved}`);
                console.log(`  Denied:    ${stats.denied}`);
                console.log(`  Expired:   ${stats.expired}`);
                console.log(`  Escalated: ${stats.escalated}`);
                console.log('');
                utils_1.logger.info('approve', 'By Risk Level:');
                console.log(`  Critical: ${stats.byRisk.critical}`);
                console.log(`  High:     ${stats.byRisk.high}`);
                console.log(`  Medium:   ${stats.byRisk.medium}`);
                console.log(`  Low:      ${stats.byRisk.low}`);
                console.log('');
                utils_1.logger.info('approve', 'By Operation Type:');
                console.log(`  File Write:      ${stats.byType.file_write}`);
                console.log(`  File Delete:     ${stats.byType.file_delete}`);
                console.log(`  API Call:        ${stats.byType.api_call}`);
                console.log(`  Budget Overrun:  ${stats.byType.budget_overrun}`);
                console.log(`  Agent Term:      ${stats.byType.agent_termination}`);
                if (stats.avgResponseTime) {
                    console.log('');
                    console.log(`Avg Response Time: ${stats.avgResponseTime.toFixed(2)} minutes`);
                }
            }
        }
        catch (error) {
            utils_1.logger.error('Failed to show stats', { error });
            process.exit(1);
        }
    });
}
// ============================================================================
// Export
// ============================================================================
exports.default = createApprovalCommand;
//# sourceMappingURL=approve.js.map