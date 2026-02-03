"use strict";
/**
 * Budget Command - CLI Interface
 *
 * Provides CLI commands for budget management:
 * - set: Set budget limits
 * - status: View current budget status
 * - usage: View budget usage reports
 * - alert: Configure budget alerts
 * - history: View budget history
 * - report: Generate budget reports
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBudgetCommand = createBudgetCommand;
const commander_1 = require("commander");
const utils_1 = require("../../utils");
const budget_1 = require("../../safety/budget");
const cost_1 = require("../../safety/cost");
const thresholds_1 = require("../../safety/thresholds");
// ============================================================================
// Utility Functions
// ============================================================================
function parseDuration(durationStr) {
    const now = new Date();
    const match = durationStr.match(/^(\d+)([mhd])$/);
    if (!match) {
        // Try to parse as date
        const date = new Date(durationStr);
        if (!isNaN(date.getTime())) {
            return date;
        }
        throw new Error(`Invalid duration format: ${durationStr}. Use format like "30m", "1h", "2d", or ISO date`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 'm':
            now.setMinutes(now.getMinutes() - value);
            break;
        case 'h':
            now.setHours(now.getHours() - value);
            break;
        case 'd':
            now.setDate(now.getDate() - value);
            break;
    }
    return now;
}
function formatCurrency(amount) {
    return `$${amount.toFixed(4)}`;
}
function formatTokens(tokens) {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(2)}M`;
    }
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
}
// ============================================================================
// CLI Commands
// ============================================================================
function createBudgetCommand() {
    const program = new commander_1.Command('budget');
    program
        .description('Manage budget limits and cost tracking')
        .addCommand(createSetCommand())
        .addCommand(createStatusCommand())
        .addCommand(createUsageCommand())
        .addCommand(createAlertCommand())
        .addCommand(createHistoryCommand())
        .addCommand(createReportCommand())
        .addCommand(createBlockedCommand())
        .addCommand(createDashboardCommand());
    return program;
}
// ============================================================================
// Set Command
// ============================================================================
function createSetCommand() {
    const command = new commander_1.Command('set')
        .description('Set budget limits for tasks, agents, or projects')
        .addOption(new commander_1.Option('--task <tokens>', 'Set per-task token limit').argParser(parseInt))
        .addOption(new commander_1.Option('--daily <tokens>', 'Set daily token limit (requires --project)').argParser(parseInt))
        .addOption(new commander_1.Option('--cost <dollars>', 'Set budget cost limit in USD (required)').argParser(parseFloat))
        .addOption(new commander_1.Option('--agent <id>', 'Agent ID for agent-level budget'))
        .addOption(new commander_1.Option('--project <name>', 'Project name (required for --daily budgets)'))
        .addOption(new commander_1.Option('--reset-hour <hour>', 'UTC hour for daily reset (0-23)').default('0').argParser(parseInt))
        .addHelpText('after', `
Examples:
  $ dash budget set --daily 10000 --cost 50 --project myapp
  $ dash budget set --task 5000 --cost 10 --agent agent-1
  $ dash budget set --daily 50000 --cost 100 --project prod --reset-hour 6
    `)
        .action(async (options) => {
        try {
            // Validate options
            if (!options.task && !options.daily) {
                utils_1.logger.error('budget', '❌ Error: Must specify either --task or --daily');
                console.error('');
                utils_1.logger.error('budget', 'Usage examples:');
                utils_1.logger.error('budget', '  dash budget set --daily 10000 --cost 50 --project myapp');
                utils_1.logger.error('budget', '  dash budget set --task 5000 --cost 10');
                process.exit(1);
            }
            if (options.cost === undefined || options.cost === null || isNaN(options.cost)) {
                utils_1.logger.error('budget', '❌ Error: --cost is required (budget cost limit in USD)');
                console.error('');
                utils_1.logger.error('budget', 'Example: dash budget set --daily 10000 --cost 50 --project myapp');
                process.exit(1);
            }
            if (options.cost <= 0) {
                utils_1.logger.error('budget', '❌ Error: --cost must be greater than 0');
                process.exit(1);
            }
            if (options.task) {
                // Task-level budget
                if (options.task <= 0) {
                    utils_1.logger.error('budget', '❌ Error: --task must be greater than 0');
                    process.exit(1);
                }
                const taskId = options.agent ? `task-${options.agent}` : `task-${Date.now()}`;
                const config = (0, budget_1.setTaskBudget)(taskId, options.task, options.cost);
                console.log(`✅ Task budget set: ${formatTokens(config.maxTokens)} tokens / ${formatCurrency(config.maxCost)}`);
                console.log(`   Task ID: ${taskId}`);
            }
            if (options.daily) {
                // Project daily budget
                if (!options.project) {
                    utils_1.logger.error('budget', '❌ Error: --project is required when using --daily');
                    console.error('');
                    utils_1.logger.error('budget', 'Example: dash budget set --daily 10000 --cost 50 --project myapp');
                    process.exit(1);
                }
                if (options.daily <= 0) {
                    utils_1.logger.error('budget', '❌ Error: --daily must be greater than 0');
                    process.exit(1);
                }
                const config = (0, budget_1.setProjectDailyBudget)(options.project, options.daily, options.cost, options.resetHour);
                console.log(`✅ Project daily budget set: ${formatTokens(config.maxTokens)} tokens / ${formatCurrency(config.maxCost)}`);
                console.log(`   Project: ${options.project}`);
                console.log(`   Reset: ${config.resetHour}:00 UTC`);
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to set budget', { error: String(error) });
            process.exit(1);
        }
    });
    return command;
}
// ============================================================================
// Status Command
// ============================================================================
function createStatusCommand() {
    return new commander_1.Command('status')
        .description('View current budget status')
        .addOption(new commander_1.Option('--agent <id>', 'Filter by agent ID'))
        .addOption(new commander_1.Option('--project <name>', 'Filter by project name'))
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .action(async (options) => {
        try {
            if (options.agent) {
                const budgets = (0, budget_1.getAgentBudgetStatus)(options.agent);
                if (budgets.length === 0) {
                    console.log(`No active budgets for agent: ${options.agent}`);
                    return;
                }
                if (options.format === 'json') {
                    console.log(JSON.stringify(budgets, null, 2));
                }
                else {
                    console.log(`\nBUDGET STATUS: Agent ${options.agent}`);
                    console.log('═'.repeat(60));
                    for (const budget of budgets) {
                        const percentage = ((budget.costUsed.total / budget.budgetConfig.maxCost) * 100).toFixed(1);
                        console.log(`\nBudget: ${budget.id}`);
                        console.log(`  Task: ${budget.taskId}`);
                        console.log(`  Project: ${budget.projectId}`);
                        console.log(`  Status: ${budget.completedAt ? 'Completed' : 'Running'}`);
                        console.log(`  Cost: ${formatCurrency(budget.costUsed.total)} / ${formatCurrency(budget.budgetConfig.maxCost)} (${percentage}%)`);
                        console.log(`  Tokens: ${formatTokens(budget.tokensUsed.total)}`);
                        if (budget.thresholdHistory.length > 0) {
                            console.log(`  Warnings: ${budget.thresholdHistory.length}`);
                        }
                    }
                }
            }
            else if (options.project) {
                const { budgets, totalUsed, config } = (0, budget_1.getProjectBudgetStatus)(options.project);
                if (options.format === 'json') {
                    console.log(JSON.stringify({ budgets, totalUsed, config }, null, 2));
                }
                else {
                    console.log(`\nBUDGET STATUS: Project ${options.project}`);
                    console.log('═'.repeat(60));
                    if (config) {
                        const percentage = ((totalUsed.total / config.maxCost) * 100).toFixed(1);
                        console.log(`\nBudget: ${formatTokens(config.maxTokens)} tokens / ${formatCurrency(config.maxCost)}`);
                        console.log(`Used: ${formatCurrency(totalUsed.total)} (${percentage}%)`);
                        console.log(`Remaining: ${formatCurrency(Math.max(0, config.maxCost - totalUsed.total))}`);
                    }
                    else {
                        utils_1.logger.info('budget', '\nNo budget configured for this project');
                        console.log(`Total used: ${formatCurrency(totalUsed.total)}`);
                    }
                    console.log(`\nActive Budgets: ${budgets.length}`);
                    if (budgets.length > 0) {
                        console.log('\nAgent Breakdown:');
                        console.log('─'.repeat(60));
                        for (const budget of budgets.slice(0, 10)) {
                            const percentage = budget.budgetConfig.maxCost > 0
                                ? ((budget.costUsed.total / budget.budgetConfig.maxCost) * 100).toFixed(0)
                                : '0';
                            console.log(`  ${budget.agentId.padEnd(20)} ${formatCurrency(budget.costUsed.total).padStart(10)} ${percentage.padStart(4)}%`);
                        }
                        if (budgets.length > 10) {
                            console.log(`  ... and ${budgets.length - 10} more`);
                        }
                    }
                }
            }
            else {
                // Show all active budgets
                const allBudgets = Array.from(budget_1.activeBudgets.values());
                if (options.format === 'json') {
                    console.log(JSON.stringify(allBudgets, null, 2));
                }
                else {
                    utils_1.logger.info('budget', `\nBUDGET STATUS: All Active Budgets`);
                    console.log('═'.repeat(60));
                    console.log(`Total active budgets: ${allBudgets.length}`);
                    const totalCost = allBudgets.reduce((sum, b) => sum + b.costUsed.total, 0);
                    const totalTokens = allBudgets.reduce((sum, b) => sum + b.tokensUsed.total, 0);
                    console.log(`Total cost: ${formatCurrency(totalCost)}`);
                    console.log(`Total tokens: ${formatTokens(totalTokens)}`);
                    // Group by project
                    const byProject = new Map();
                    for (const budget of allBudgets) {
                        const list = byProject.get(budget.projectId) || [];
                        list.push(budget);
                        byProject.set(budget.projectId, list);
                    }
                    utils_1.logger.info('budget', `\nBy Project:`);
                    console.log('─'.repeat(60));
                    for (const [project, budgets] of byProject) {
                        const projectCost = budgets.reduce((sum, b) => sum + b.costUsed.total, 0);
                        console.log(`  ${project.padEnd(20)} ${formatCurrency(projectCost).padStart(10)} (${budgets.length} budgets)`);
                    }
                }
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to get budget status', { error: String(error) });
            process.exit(1);
        }
    });
}
// ============================================================================
// Usage Command
// ============================================================================
function createUsageCommand() {
    return new commander_1.Command('usage')
        .description('View budget usage')
        .addOption(new commander_1.Option('--project <name>', 'Filter by project name').makeOptionMandatory())
        .addOption(new commander_1.Option('--period <period>', 'Time period').choices(['week', 'month']).default('month'))
        .addOption(new commander_1.Option('--since <duration>', 'Since duration (e.g., "1h", "2d", "1w")'))
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .action(async (options) => {
        try {
            let since;
            if (options.since) {
                since = parseDuration(options.since);
            }
            const report = (0, budget_1.generateBudgetReport)(options.project, options.period);
            const costHistory = (0, cost_1.getCostHistory)({ projectId: options.project, since });
            if (options.format === 'json') {
                console.log(JSON.stringify({ report, costHistory }, null, 2));
            }
            else {
                console.log(`\nBUDGET USAGE: ${options.project}`);
                console.log('═'.repeat(70));
                console.log(`Period: ${report.period} (${report.startDate.toISOString().split('T')[0]} to ${report.endDate.toISOString().split('T')[0]})`);
                console.log(`\nTotal Budget: ${formatCurrency(report.totalBudget)}`);
                console.log(`Total Used: ${formatCurrency(report.totalUsed)} (${report.percentageUsed.toFixed(1)}%)`);
                console.log(`Remaining: ${formatCurrency(report.totalRemaining)}`);
                if (report.agentBreakdown.length > 0) {
                    utils_1.logger.info('budget', `\nAgent Breakdown:`);
                    console.log('─'.repeat(70));
                    console.log(`${'Agent'.padEnd(20)} ${'Cost'.padStart(12)} ${'Tokens'.padStart(12)} ${'%'.padStart(6)} ${'Status'.padStart(10)}`);
                    console.log('─'.repeat(70));
                    for (const agent of report.agentBreakdown) {
                        console.log(`${agent.agentId.slice(0, 20).padEnd(20)} ` +
                            `${formatCurrency(agent.costUsed).padStart(12)} ` +
                            `${formatTokens(agent.tokensUsed).padStart(12)} ` +
                            `${agent.percentageOfTotal.toFixed(1).padStart(6)} ` +
                            `${agent.status.padStart(10)}`);
                    }
                }
                if (report.dailyUsage.length > 0) {
                    utils_1.logger.info('budget', `\nDaily Usage:`);
                    console.log('─'.repeat(50));
                    console.log(`${'Date'.padEnd(12)} ${'Cost'.padStart(12)} ${'Tokens'.padStart(12)}`);
                    console.log('─'.repeat(50));
                    for (const day of report.dailyUsage.slice(-14)) { // Show last 14 days
                        console.log(`${day.date.padEnd(12)} ` +
                            `${formatCurrency(day.cost).padStart(12)} ` +
                            `${formatTokens(day.tokens).padStart(12)}`);
                    }
                }
                // Show cost aggregation by model
                const byModel = (0, cost_1.aggregateCostsByModel)(costHistory);
                if (byModel.size > 0) {
                    utils_1.logger.info('budget', `\nUsage by Model:`);
                    console.log('─'.repeat(50));
                    console.log(`${'Model'.padEnd(25)} ${'Cost'.padStart(12)} ${'Requests'.padStart(10)}`);
                    console.log('─'.repeat(50));
                    for (const [model, stats] of byModel) {
                        console.log(`${model.slice(0, 25).padEnd(25)} ` +
                            `${formatCurrency(stats.cost).padStart(12)} ` +
                            `${stats.count.toString().padStart(10)}`);
                    }
                }
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to get budget usage', { error: String(error) });
            process.exit(1);
        }
    });
}
// ============================================================================
// Alert Command
// ============================================================================
function createAlertCommand() {
    const command = new commander_1.Command('alert')
        .description('Manage budget alerts');
    // Add subcommand
    command
        .addCommand(new commander_1.Command('add')
        .description('Add a budget alert')
        .addOption(new commander_1.Option('--threshold <percent>', 'Alert threshold percentage').makeOptionMandatory().argParser(parseInt))
        .addOption(new commander_1.Option('--webhook <url>', 'Webhook URL for notifications'))
        .addOption(new commander_1.Option('--email <address>', 'Email address for notifications'))
        .addOption(new commander_1.Option('--sms <number>', 'SMS number for notifications'))
        .addOption(new commander_1.Option('--project <name>', 'Project to add alert for').makeOptionMandatory())
        .action(async (options) => {
        try {
            if (!options.webhook && !options.email && !options.sms) {
                utils_1.logger.error('budget', 'Error: Must specify at least one notification method (--webhook, --email, or --sms)');
                process.exit(1);
            }
            const alert = (0, budget_1.addBudgetAlert)(options.project, options.threshold, {
                webhookUrl: options.webhook,
                email: options.email,
                sms: options.sms,
            });
            console.log(`✅ Alert added: ${options.threshold}% threshold`);
            console.log(`   Project: ${options.project}`);
            console.log(`   Alert ID: ${alert.id}`);
            if (options.webhook)
                console.log(`   Webhook: ${options.webhook}`);
            if (options.email)
                console.log(`   Email: ${options.email}`);
            if (options.sms)
                console.log(`   SMS: ${options.sms}`);
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to add alert', { error: String(error) });
            process.exit(1);
        }
    }));
    // List subcommand
    command.addCommand(new commander_1.Command('list')
        .description('List configured alerts')
        .addOption(new commander_1.Option('--project <name>', 'Filter by project'))
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .action(async (options) => {
        try {
            if (options.project) {
                const alerts = (0, budget_1.getBudgetAlerts)(options.project);
                if (options.format === 'json') {
                    console.log(JSON.stringify(alerts, null, 2));
                }
                else {
                    console.log(`\nBUDGET ALERTS: ${options.project}`);
                    console.log('═'.repeat(60));
                    if (alerts.length === 0) {
                        utils_1.logger.info('budget', 'No alerts configured');
                    }
                    else {
                        console.log(`${'ID'.padEnd(25)} ${'Threshold'.padStart(10)} ${'Type'.padStart(15)}`);
                        console.log('─'.repeat(60));
                        for (const alert of alerts) {
                            const type = alert.webhookUrl ? 'webhook' : alert.email ? 'email' : 'sms';
                            const destination = alert.webhookUrl || alert.email || alert.sms;
                            console.log(`${alert.id.slice(0, 25).padEnd(25)} ${(alert.threshold + '%').padStart(10)} ${type.padStart(15)}`);
                            console.log(`  → ${destination}`);
                        }
                    }
                }
            }
            else {
                utils_1.logger.info('budget', 'Please specify --project to list alerts');
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to list alerts', { error: String(error) });
            process.exit(1);
        }
    }));
    // Remove subcommand
    command.addCommand(new commander_1.Command('remove')
        .description('Remove a budget alert')
        .argument('<id>', 'Alert ID to remove')
        .addOption(new commander_1.Option('--project <name>', 'Project the alert belongs to').makeOptionMandatory())
        .action(async (alertId, options) => {
        try {
            const removed = (0, budget_1.removeBudgetAlert)(options.project, alertId);
            if (removed) {
                console.log(`✅ Alert ${alertId} removed`);
            }
            else {
                console.error(`Alert not found: ${alertId}`);
                process.exit(1);
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to remove alert', { error: String(error) });
            process.exit(1);
        }
    }));
    return command;
}
// ============================================================================
// History Command
// ============================================================================
function createHistoryCommand() {
    return new commander_1.Command('history')
        .description('View budget history')
        .addOption(new commander_1.Option('--project <name>', 'Filter by project').makeOptionMandatory())
        .addOption(new commander_1.Option('--since <duration>', 'Since duration (e.g., "1h", "2d", "1w")').default('7d'))
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .action(async (options) => {
        try {
            const since = parseDuration(options.since);
            const history = (0, budget_1.getBudgetHistory)(options.project, since);
            if (options.format === 'json') {
                console.log(JSON.stringify(history, null, 2));
            }
            else {
                console.log(`\nBUDGET HISTORY: ${options.project}`);
                console.log('═'.repeat(70));
                console.log(`Since: ${since.toISOString()}`);
                console.log(`Total events: ${history.length}`);
                if (history.length > 0) {
                    console.log('\n' + `${'Time'.padEnd(20)} ${'Event'.padEnd(20)} ${'Details'.padEnd(30)}`);
                    console.log('─'.repeat(70));
                    for (const entry of history.slice(0, 50)) { // Show last 50 events
                        const time = entry.timestamp.toISOString().replace('T', ' ').slice(0, 19);
                        const details = JSON.stringify(entry.details).slice(0, 30);
                        console.log(`${time.padEnd(20)} ${entry.eventType.padEnd(20)} ${details.padEnd(30)}`);
                    }
                    if (history.length > 50) {
                        console.log(`\n... and ${history.length - 50} more events`);
                    }
                }
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to get budget history', { error: String(error) });
            process.exit(1);
        }
    });
}
// ============================================================================
// Report Command
// ============================================================================
function createReportCommand() {
    return new commander_1.Command('report')
        .description('Generate budget reports')
        .addOption(new commander_1.Option('--project <name>', 'Project to report on').makeOptionMandatory())
        .addOption(new commander_1.Option('--period <period>', 'Report period').choices(['week', 'month']).default('month'))
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['json', 'table']).default('table'))
        .action(async (options) => {
        try {
            const report = (0, budget_1.generateBudgetReport)(options.project, options.period);
            if (options.format === 'json') {
                console.log(JSON.stringify(report, null, 2));
            }
            else {
                console.log(`\n╔════════════════════════════════════════════════════════════════════╗`);
                console.log(`║                    BUDGET REPORT                                   ║`);
                console.log(`╠════════════════════════════════════════════════════════════════════╣`);
                console.log(`║ PROJECT: ${options.project.padEnd(53)} ║`);
                console.log(`║ Period: ${options.period.padEnd(54)} ║`);
                console.log(`╠════════════════════════════════════════════════════════════════════╣`);
                console.log(`║ Budget: ${formatCurrency(report.totalBudget).padEnd(54)} ║`);
                console.log(`║ Used:   ${formatCurrency(report.totalUsed).padEnd(10)} (${report.percentageUsed.toFixed(1)}%)${''.padEnd(33)} ║`);
                console.log(`║ Remaining: ${formatCurrency(report.totalRemaining).padEnd(51)} ║`);
                console.log(`╠════════════════════════════════════════════════════════════════════╣`);
                console.log(`║ AGENTS                    COST        TOKENS      STATUS           ║`);
                console.log(`║ ─────────────────────────────────────────────────────────────────  ║`);
                for (const agent of report.agentBreakdown.slice(0, 8)) {
                    const cost = formatCurrency(agent.costUsed).padStart(8);
                    const tokens = formatTokens(agent.tokensUsed).padStart(8);
                    const status = agent.status.padStart(10);
                    console.log(`║ ${agent.agentId.slice(0, 25).padEnd(25)} ${cost} ${tokens} ${status}    ║`);
                }
                if (report.agentBreakdown.length > 8) {
                    console.log(`║ ... and ${(report.agentBreakdown.length - 8).toString().padEnd(52)} more ║`);
                }
                console.log(`╚════════════════════════════════════════════════════════════════════╝`);
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to generate report', { error: String(error) });
            process.exit(1);
        }
    });
}
// ============================================================================
// Blocked Command
// ============================================================================
function createBlockedCommand() {
    const command = new commander_1.Command('blocked')
        .description('Manage blocked agents');
    command
        .addCommand(new commander_1.Command('list')
        .description('List blocked agents')
        .addOption(new commander_1.Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .action(async (options) => {
        try {
            const blocked = (0, thresholds_1.getAllBlockedAgents)();
            if (options.format === 'json') {
                console.log(JSON.stringify(blocked, null, 2));
            }
            else {
                utils_1.logger.info('budget', `\nBLOCKED AGENTS`);
                console.log('═'.repeat(70));
                if (blocked.length === 0) {
                    utils_1.logger.info('budget', 'No blocked agents');
                }
                else {
                    console.log(`${'Agent'.padEnd(20)} ${'Blocked At'.padEnd(20)} ${'Threshold'.padStart(10)}`);
                    console.log('─'.repeat(70));
                    for (const agent of blocked) {
                        const time = agent.blockedAt.toISOString().replace('T', ' ').slice(0, 19);
                        console.log(`${agent.agentId.slice(0, 20).padEnd(20)} ` +
                            `${time.padEnd(20)} ` +
                            `${(agent.threshold + '%').padStart(10)}`);
                    }
                }
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to list blocked agents', { error: String(error) });
            process.exit(1);
        }
    }));
    command.addCommand(new commander_1.Command('unblock')
        .description('Unblock an agent')
        .argument('<agent-id>', 'Agent ID to unblock')
        .action(async (agentId) => {
        try {
            const unblocked = (0, thresholds_1.unblockAgent)(agentId);
            if (unblocked) {
                console.log(`✅ Agent ${agentId} unblocked`);
            }
            else {
                console.error(`Agent not found or not blocked: ${agentId}`);
                process.exit(1);
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to unblock agent', { error: String(error) });
            process.exit(1);
        }
    }));
    return command;
}
// ============================================================================
// Dashboard Command
// ============================================================================
function createDashboardCommand() {
    return new commander_1.Command('dashboard')
        .description('Show budget dashboard (summary view)')
        .addOption(new commander_1.Option('--project <name>', 'Project to focus on'))
        .action(async (options) => {
        try {
            const allBudgets = Array.from(budget_1.activeBudgets.values());
            const blocked = (0, thresholds_1.getAllBlockedAgents)();
            console.log(`\n╔════════════════════════════════════════════════════════════════════╗`);
            console.log(`║                        BUDGET DASHBOARD                            ║`);
            console.log(`╠════════════════════════════════════════════════════════════════════╣`);
            if (options.project) {
                const { totalUsed, config } = (0, budget_1.getProjectBudgetStatus)(options.project);
                const percentage = config ? ((totalUsed.total / config.maxCost) * 100).toFixed(1) : '0';
                console.log(`║ PROJECT: ${options.project.padEnd(53)} ║`);
                console.log(`╠════════════════════════════════════════════════════════════════════╣`);
                if (config) {
                    console.log(`║ Budget: ${formatCurrency(config.maxCost).padEnd(54)} ║`);
                    console.log(`║ Used:   ${formatCurrency(totalUsed.total).padEnd(10)} (${percentage}%)${''.padEnd(33)} ║`);
                    console.log(`║ Remaining: ${formatCurrency(Math.max(0, config.maxCost - totalUsed.total)).padEnd(51)} ║`);
                }
                else {
                    console.log(`║ No budget configured                                               ║`);
                    console.log(`║ Total used: ${formatCurrency(totalUsed.total).padEnd(52)} ║`);
                }
            }
            else {
                const totalCost = allBudgets.reduce((sum, b) => sum + b.costUsed.total, 0);
                const totalTokens = allBudgets.reduce((sum, b) => sum + b.tokensUsed.total, 0);
                console.log(`║ ALL PROJECTS                                                       ║`);
                console.log(`╠════════════════════════════════════════════════════════════════════╣`);
                console.log(`║ Active Budgets: ${allBudgets.length.toString().padEnd(48)} ║`);
                console.log(`║ Total Cost: ${formatCurrency(totalCost).padEnd(52)} ║`);
                console.log(`║ Total Tokens: ${formatTokens(totalTokens).padEnd(50)} ║`);
            }
            if (blocked.length > 0) {
                console.log(`╠════════════════════════════════════════════════════════════════════╣`);
                console.log(`║ ⚠️  ALERTS: ${blocked.length.toString().padEnd(51)} blocked agents ║`);
                for (const agent of blocked.slice(0, 3)) {
                    console.log(`║    • ${agent.agentId.slice(0, 50).padEnd(50)} ║`);
                }
                if (blocked.length > 3) {
                    console.log(`║    • ... and ${(blocked.length - 3).toString().padEnd(47)} more ║`);
                }
            }
            console.log(`╚════════════════════════════════════════════════════════════════════╝`);
            // Show recent high usage
            const highUsage = allBudgets
                .filter(b => b.budgetConfig.maxCost > 0)
                .map(b => ({ ...b, pct: (b.costUsed.total / b.budgetConfig.maxCost) * 100 }))
                .filter(b => b.pct >= 75)
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 5);
            if (highUsage.length > 0) {
                console.log(`\n⚠️  High Usage Agents (>75%):`);
                for (const budget of highUsage) {
                    console.log(`   ${budget.agentId}: ${budget.pct.toFixed(1)}% (${formatCurrency(budget.costUsed.total)})`);
                }
            }
        }
        catch (error) {
            utils_1.logger.error('budget', 'Failed to show dashboard', { error: String(error) });
            process.exit(1);
        }
    });
}
// ============================================================================
// Export
// ============================================================================
exports.default = createBudgetCommand;
//# sourceMappingURL=budget.js.map