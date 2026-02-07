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

import { logger } from '../../utils/logger';
import { Command, Option } from 'commander';
import {
  setBudgetConfig,
  setTaskBudget,
  setAgentBudget,
  setProjectDailyBudget,
  getBudgetConfig,
  getAgentBudgetStatus,
  getProjectBudgetStatus,
  generateBudgetReport,
  addBudgetAlert,
  getBudgetAlerts,
  removeBudgetAlert,
  getBudgetHistory,
  BudgetType,
  activeBudgets,
} from '../../safety/budget';
import { getCostHistory, aggregateCostsByPeriod, aggregateCostsByModel } from '../../safety/cost';
import { getAllBlockedAgents, unblockAgent } from '../../safety/thresholds';

// ============================================================================
// Utility Functions
// ============================================================================

function parseDuration(durationStr: string): Date {
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

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

// ============================================================================
// CLI Commands
// ============================================================================

export function createBudgetCommand(): Command {
  const program = new Command('budget');
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

function createSetCommand(): Command {
  const command = new Command('set')
    .description('Set budget limits for tasks, agents, or projects')
    .addOption(new Option('--task <tokens>', 'Set per-task token limit').argParser(parseInt))
    .addOption(new Option('--daily <tokens>', 'Set daily token limit (requires --project)').argParser(parseInt))
    .addOption(new Option('--cost <dollars>', 'Set budget cost limit in USD (required)').argParser(parseFloat))
    .addOption(new Option('--agent <id>', 'Agent ID for agent-level budget'))
    .addOption(new Option('--project <name>', 'Project name (required for --daily budgets)'))
    .addOption(new Option('--reset-hour <hour>', 'UTC hour for daily reset (0-23)').default('0').argParser(parseInt))
    .addHelpText('after', `
Examples:
  $ godel budget set --daily 10000 --cost 50 --project myapp
  $ godel budget set --task 5000 --cost 10 --agent agent-1
  $ godel budget set --daily 50000 --cost 100 --project prod --reset-hour 6
    `)
    .action(async (options) => {
      try {
        // Validate options
        if (!options.task && !options.daily) {
          logger.error('budget', '❌ Error: Must specify either --task or --daily');
          logger.error('');
          logger.error('budget', 'Usage examples:');
          logger.error('budget', '  godel budget set --daily 10000 --cost 50 --project myapp');
          logger.error('budget', '  godel budget set --task 5000 --cost 10');
          process.exit(1);
        }

        if (options.cost === undefined || options.cost === null || isNaN(options.cost)) {
          logger.error('budget', '❌ Error: --cost is required (budget cost limit in USD)');
          logger.error('');
          logger.error('budget', 'Example: godel budget set --daily 10000 --cost 50 --project myapp');
          process.exit(1);
        }

        if (options.cost <= 0) {
          logger.error('budget', '❌ Error: --cost must be greater than 0');
          process.exit(1);
        }

        if (options.task) {
          // Task-level budget
          if (options.task <= 0) {
            logger.error('budget', '❌ Error: --task must be greater than 0');
            process.exit(1);
          }
          const taskId = options.agent ? `task-${options.agent}` : `task-${Date.now()}`;
          const config = setTaskBudget(taskId, options.task, options.cost);
          logger.info(`✅ Task budget set: ${formatTokens(config.maxTokens)} tokens / ${formatCurrency(config.maxCost)}`);
          logger.info(`   Task ID: ${taskId}`);
        }

        if (options.daily) {
          // Project daily budget
          if (!options.project) {
            logger.error('budget', '❌ Error: --project is required when using --daily');
            logger.error('');
            logger.error('budget', 'Example: godel budget set --daily 10000 --cost 50 --project myapp');
            process.exit(1);
          }
          if (options.daily <= 0) {
            logger.error('budget', '❌ Error: --daily must be greater than 0');
            process.exit(1);
          }
          const config = setProjectDailyBudget(
            options.project,
            options.daily,
            options.cost,
            options.resetHour
          );
          logger.info(`✅ Project daily budget set: ${formatTokens(config.maxTokens)} tokens / ${formatCurrency(config.maxCost)}`);
          logger.info(`   Project: ${options.project}`);
          logger.info(`   Reset: ${config.resetHour}:00 UTC`);
        }
      } catch (error) {
        logger.error('budget', 'Failed to set budget', { error: String(error) });
        process.exit(1);
      }
    });

  return command;
}

// ============================================================================
// Status Command
// ============================================================================

function createStatusCommand(): Command {
  return new Command('status')
    .description('View current budget status')
    .addOption(new Option('--agent <id>', 'Filter by agent ID'))
    .addOption(new Option('--project <name>', 'Filter by project name'))
    .addOption(new Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
    .action(async (options) => {
      try {
        if (options.agent) {
          const budgets = getAgentBudgetStatus(options.agent);
          if (budgets.length === 0) {
            logger.info(`No active budgets for agent: ${options.agent}`);
            return;
          }

          if (options.format === 'json') {
            logger.info(JSON.stringify(budgets, null, 2));
          } else {
            logger.info(`\nBUDGET STATUS: Agent ${options.agent}`);
            logger.info('═'.repeat(60));
            for (const budget of budgets) {
              const percentage = ((budget.costUsed.total / budget.budgetConfig.maxCost) * 100).toFixed(1);
              logger.info(`\nBudget: ${budget.id}`);
              logger.info(`  Task: ${budget.taskId}`);
              logger.info(`  Project: ${budget.projectId}`);
              logger.info(`  Status: ${budget.completedAt ? 'Completed' : 'Running'}`);
              logger.info(`  Cost: ${formatCurrency(budget.costUsed.total)} / ${formatCurrency(budget.budgetConfig.maxCost)} (${percentage}%)`);
              logger.info(`  Tokens: ${formatTokens(budget.tokensUsed.total)}`);
              if (budget.thresholdHistory.length > 0) {
                logger.info(`  Warnings: ${budget.thresholdHistory.length}`);
              }
            }
          }
        } else if (options.project) {
          const { budgets, totalUsed, config } = getProjectBudgetStatus(options.project);
          
          if (options.format === 'json') {
            logger.info(JSON.stringify({ budgets, totalUsed, config }, null, 2));
          } else {
            logger.info(`\nBUDGET STATUS: Project ${options.project}`);
            logger.info('═'.repeat(60));
            
            if (config) {
              const percentage = ((totalUsed.total / config.maxCost) * 100).toFixed(1);
              logger.info(`\nBudget: ${formatTokens(config.maxTokens)} tokens / ${formatCurrency(config.maxCost)}`);
              logger.info(`Used: ${formatCurrency(totalUsed.total)} (${percentage}%)`);
              logger.info(`Remaining: ${formatCurrency(Math.max(0, config.maxCost - totalUsed.total))}`);
            } else {
              logger.info('budget', '\nNo budget configured for this project');
              logger.info(`Total used: ${formatCurrency(totalUsed.total)}`);
            }
            
            logger.info(`\nActive Budgets: ${budgets.length}`);
            if (budgets.length > 0) {
              logger.info('\nAgent Breakdown:');
              logger.info('─'.repeat(60));
              for (const budget of budgets.slice(0, 10)) {
                const percentage = budget.budgetConfig.maxCost > 0 
                  ? ((budget.costUsed.total / budget.budgetConfig.maxCost) * 100).toFixed(0)
                  : '0';
                logger.info(`  ${budget.agentId.padEnd(20)} ${formatCurrency(budget.costUsed.total).padStart(10)} ${percentage.padStart(4)}%`);
              }
              if (budgets.length > 10) {
                logger.info(`  ... and ${budgets.length - 10} more`);
              }
            }
          }
        } else {
          // Show all active budgets
          const allBudgets = Array.from(activeBudgets.values());
          
          if (options.format === 'json') {
            logger.info(JSON.stringify(allBudgets, null, 2));
          } else {
            logger.info('budget', `\nBUDGET STATUS: All Active Budgets`);
            logger.info('═'.repeat(60));
            logger.info(`Total active budgets: ${allBudgets.length}`);
            
            const totalCost = allBudgets.reduce((sum, b) => sum + b.costUsed.total, 0);
            const totalTokens = allBudgets.reduce((sum, b) => sum + b.tokensUsed.total, 0);
            
            logger.info(`Total cost: ${formatCurrency(totalCost)}`);
            logger.info(`Total tokens: ${formatTokens(totalTokens)}`);
            
            // Group by project
            const byProject = new Map<string, typeof allBudgets>();
            for (const budget of allBudgets) {
              const list = byProject.get(budget.projectId) || [];
              list.push(budget);
              byProject.set(budget.projectId, list);
            }
            
            logger.info('budget', `\nBy Project:`);
            logger.info('─'.repeat(60));
            for (const [project, budgets] of byProject) {
              const projectCost = budgets.reduce((sum, b) => sum + b.costUsed.total, 0);
              logger.info(`  ${project.padEnd(20)} ${formatCurrency(projectCost).padStart(10)} (${budgets.length} budgets)`);
            }
          }
        }
      } catch (error) {
        logger.error('budget', 'Failed to get budget status', { error: String(error) });
        process.exit(1);
      }
    });
}

// ============================================================================
// Usage Command
// ============================================================================

function createUsageCommand(): Command {
  return new Command('usage')
    .description('View budget usage')
    .addOption(new Option('--project <name>', 'Filter by project name').makeOptionMandatory())
    .addOption(new Option('--period <period>', 'Time period').choices(['week', 'month']).default('month'))
    .addOption(new Option('--since <duration>', 'Since duration (e.g., "1h", "2d", "1w")'))
    .addOption(new Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
    .action(async (options) => {
      try {
        let since: Date | undefined;
        if (options.since) {
          since = parseDuration(options.since);
        }

        const report = generateBudgetReport(options.project, options.period);
        const costHistory = getCostHistory({ projectId: options.project, since });
        
        if (options.format === 'json') {
          logger.info(JSON.stringify({ report, costHistory }, null, 2));
        } else {
          logger.info(`\nBUDGET USAGE: ${options.project}`);
          logger.info('═'.repeat(70));
          logger.info(`Period: ${report.period} (${report.startDate.toISOString().split('T')[0]} to ${report.endDate.toISOString().split('T')[0]})`);
          logger.info(`\nTotal Budget: ${formatCurrency(report.totalBudget)}`);
          logger.info(`Total Used: ${formatCurrency(report.totalUsed)} (${report.percentageUsed.toFixed(1)}%)`);
          logger.info(`Remaining: ${formatCurrency(report.totalRemaining)}`);
          
          if (report.agentBreakdown.length > 0) {
            logger.info('budget', `\nAgent Breakdown:`);
            logger.info('─'.repeat(70));
            logger.info(`${'Agent'.padEnd(20)} ${'Cost'.padStart(12)} ${'Tokens'.padStart(12)} ${'%'.padStart(6)} ${'Status'.padStart(10)}`);
            logger.info('─'.repeat(70));
            for (const agent of report.agentBreakdown) {
              logger.info(
                `${agent.agentId.slice(0, 20).padEnd(20)} ` +
                `${formatCurrency(agent.costUsed).padStart(12)} ` +
                `${formatTokens(agent.tokensUsed).padStart(12)} ` +
                `${agent.percentageOfTotal.toFixed(1).padStart(6)} ` +
                `${agent.status.padStart(10)}`
              );
            }
          }
          
          if (report.dailyUsage.length > 0) {
            logger.info('budget', `\nDaily Usage:`);
            logger.info('─'.repeat(50));
            logger.info(`${'Date'.padEnd(12)} ${'Cost'.padStart(12)} ${'Tokens'.padStart(12)}`);
            logger.info('─'.repeat(50));
            for (const day of report.dailyUsage.slice(-14)) { // Show last 14 days
              logger.info(
                `${day.date.padEnd(12)} ` +
                `${formatCurrency(day.cost).padStart(12)} ` +
                `${formatTokens(day.tokens).padStart(12)}`
              );
            }
          }
          
          // Show cost aggregation by model
          const byModel = aggregateCostsByModel(costHistory);
          if (byModel.size > 0) {
            logger.info('budget', `\nUsage by Model:`);
            logger.info('─'.repeat(50));
            logger.info(`${'Model'.padEnd(25)} ${'Cost'.padStart(12)} ${'Requests'.padStart(10)}`);
            logger.info('─'.repeat(50));
            for (const [model, stats] of byModel) {
              logger.info(
                `${model.slice(0, 25).padEnd(25)} ` +
                `${formatCurrency(stats.cost).padStart(12)} ` +
                `${stats.count.toString().padStart(10)}`
              );
            }
          }
        }
      } catch (error) {
        logger.error('budget', 'Failed to get budget usage', { error: String(error) });
        process.exit(1);
      }
    });
}

// ============================================================================
// Alert Command
// ============================================================================

function createAlertCommand(): Command {
  const command = new Command('alert')
    .description('Manage budget alerts');

  // Add subcommand
  command
    .addCommand(
      new Command('add')
        .description('Add a budget alert')
        .addOption(new Option('--threshold <percent>', 'Alert threshold percentage').makeOptionMandatory().argParser(parseInt))
        .addOption(new Option('--webhook <url>', 'Webhook URL for notifications'))
        .addOption(new Option('--email <address>', 'Email address for notifications'))
        .addOption(new Option('--sms <number>', 'SMS number for notifications'))
        .addOption(new Option('--project <name>', 'Project to add alert for').makeOptionMandatory())
        .action(async (options) => {
          try {
            if (!options.webhook && !options.email && !options.sms) {
              logger.error('budget', 'Error: Must specify at least one notification method (--webhook, --email, or --sms)');
              process.exit(1);
            }

            const alert = addBudgetAlert(options.project, options.threshold, {
              webhookUrl: options.webhook,
              email: options.email,
              sms: options.sms,
            });

            logger.info(`✅ Alert added: ${options.threshold}% threshold`);
            logger.info(`   Project: ${options.project}`);
            logger.info(`   Alert ID: ${alert.id}`);
            if (options.webhook) logger.info(`   Webhook: ${options.webhook}`);
            if (options.email) logger.info(`   Email: ${options.email}`);
            if (options.sms) logger.info(`   SMS: ${options.sms}`);
          } catch (error) {
            logger.error('budget', 'Failed to add alert', { error: String(error) });
            process.exit(1);
          }
        })
    );

  // List subcommand
  command.addCommand(
    new Command('list')
      .description('List configured alerts')
      .addOption(new Option('--project <name>', 'Filter by project'))
      .addOption(new Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
      .action(async (options) => {
        try {
          if (options.project) {
            const alerts = getBudgetAlerts(options.project);
            if (options.format === 'json') {
              logger.info(JSON.stringify(alerts, null, 2));
            } else {
              logger.info(`\nBUDGET ALERTS: ${options.project}`);
              logger.info('═'.repeat(60));
              if (alerts.length === 0) {
                logger.info('budget', 'No alerts configured');
              } else {
                logger.info(`${'ID'.padEnd(25)} ${'Threshold'.padStart(10)} ${'Type'.padStart(15)}`);
                logger.info('─'.repeat(60));
                for (const alert of alerts) {
                  const type = alert.webhookUrl ? 'webhook' : alert.email ? 'email' : 'sms';
                  const destination = alert.webhookUrl || alert.email || alert.sms;
                  logger.info(`${alert.id.slice(0, 25).padEnd(25)} ${(alert.threshold + '%').padStart(10)} ${type.padStart(15)}`);
                  logger.info(`  → ${destination}`);
                }
              }
            }
          } else {
            logger.info('budget', 'Please specify --project to list alerts');
          }
        } catch (error) {
          logger.error('budget', 'Failed to list alerts', { error: String(error) });
          process.exit(1);
        }
      })
  );

  // Remove subcommand
  command.addCommand(
    new Command('remove')
      .description('Remove a budget alert')
      .argument('<id>', 'Alert ID to remove')
      .addOption(new Option('--project <name>', 'Project the alert belongs to').makeOptionMandatory())
      .action(async (alertId: string, options: { project: string }) => {
        try {
          const removed = removeBudgetAlert(options.project, alertId);
          if (removed) {
            logger.info(`✅ Alert ${alertId} removed`);
          } else {
            logger.error(`Alert not found: ${alertId}`);
            process.exit(1);
          }
        } catch (error) {
          logger.error('budget', 'Failed to remove alert', { error: String(error) });
          process.exit(1);
        }
      })
  );

  return command;
}

// ============================================================================
// History Command
// ============================================================================

function createHistoryCommand(): Command {
  return new Command('history')
    .description('View budget history')
    .addOption(new Option('--project <name>', 'Filter by project').makeOptionMandatory())
    .addOption(new Option('--since <duration>', 'Since duration (e.g., "1h", "2d", "1w")').default('7d'))
    .addOption(new Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
    .action(async (options) => {
      try {
        const since = parseDuration(options.since);
        const history = getBudgetHistory(options.project, since);
        
        if (options.format === 'json') {
          logger.info(JSON.stringify(history, null, 2));
        } else {
          logger.info(`\nBUDGET HISTORY: ${options.project}`);
          logger.info('═'.repeat(70));
          logger.info(`Since: ${since.toISOString()}`);
          logger.info(`Total events: ${history.length}`);
          
          if (history.length > 0) {
            logger.info('\n' + `${'Time'.padEnd(20)} ${'Event'.padEnd(20)} ${'Details'.padEnd(30)}`);
            logger.info('─'.repeat(70));
            for (const entry of history.slice(0, 50)) { // Show last 50 events
              const time = entry.timestamp.toISOString().replace('T', ' ').slice(0, 19);
              const details = JSON.stringify(entry.details).slice(0, 30);
              logger.info(`${time.padEnd(20)} ${entry.eventType.padEnd(20)} ${details.padEnd(30)}`);
            }
            if (history.length > 50) {
              logger.info(`\n... and ${history.length - 50} more events`);
            }
          }
        }
      } catch (error) {
        logger.error('budget', 'Failed to get budget history', { error: String(error) });
        process.exit(1);
      }
    });
}

// ============================================================================
// Report Command
// ============================================================================

function createReportCommand(): Command {
  return new Command('report')
    .description('Generate budget reports')
    .addOption(new Option('--project <name>', 'Project to report on').makeOptionMandatory())
    .addOption(new Option('--period <period>', 'Report period').choices(['week', 'month']).default('month'))
    .addOption(new Option('--format <format>', 'Output format').choices(['json', 'table']).default('table'))
    .action(async (options) => {
      try {
        const report = generateBudgetReport(options.project, options.period);
        
        if (options.format === 'json') {
          logger.info(JSON.stringify(report, null, 2));
        } else {
          logger.info(`\n╔════════════════════════════════════════════════════════════════════╗`);
          logger.info(`║                    BUDGET REPORT                                   ║`);
          logger.info(`╠════════════════════════════════════════════════════════════════════╣`);
          logger.info(`║ PROJECT: ${options.project.padEnd(53)} ║`);
          logger.info(`║ Period: ${options.period.padEnd(54)} ║`);
          logger.info(`╠════════════════════════════════════════════════════════════════════╣`);
          logger.info(`║ Budget: ${formatCurrency(report.totalBudget).padEnd(54)} ║`);
          logger.info(`║ Used:   ${formatCurrency(report.totalUsed).padEnd(10)} (${report.percentageUsed.toFixed(1)}%)${''.padEnd(33)} ║`);
          logger.info(`║ Remaining: ${formatCurrency(report.totalRemaining).padEnd(51)} ║`);
          logger.info(`╠════════════════════════════════════════════════════════════════════╣`);
          logger.info(`║ AGENTS                    COST        TOKENS      STATUS           ║`);
          logger.info(`║ ─────────────────────────────────────────────────────────────────  ║`);
          
          for (const agent of report.agentBreakdown.slice(0, 8)) {
            const cost = formatCurrency(agent.costUsed).padStart(8);
            const tokens = formatTokens(agent.tokensUsed).padStart(8);
            const status = agent.status.padStart(10);
            logger.info(`║ ${agent.agentId.slice(0, 25).padEnd(25)} ${cost} ${tokens} ${status}    ║`);
          }
          
          if (report.agentBreakdown.length > 8) {
            logger.info(`║ ... and ${(report.agentBreakdown.length - 8).toString().padEnd(52)} more ║`);
          }
          
          logger.info(`╚════════════════════════════════════════════════════════════════════╝`);
        }
      } catch (error) {
        logger.error('budget', 'Failed to generate report', { error: String(error) });
        process.exit(1);
      }
    });
}

// ============================================================================
// Blocked Command
// ============================================================================

function createBlockedCommand(): Command {
  const command = new Command('blocked')
    .description('Manage blocked agents');

  command
    .addCommand(
      new Command('list')
        .description('List blocked agents')
        .addOption(new Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
        .action(async (options) => {
          try {
            const blocked = getAllBlockedAgents();
            
            if (options.format === 'json') {
              logger.info(JSON.stringify(blocked, null, 2));
            } else {
              logger.info('budget', `\nBLOCKED AGENTS`);
              logger.info('═'.repeat(70));
              if (blocked.length === 0) {
                logger.info('budget', 'No blocked agents');
              } else {
                logger.info(`${'Agent'.padEnd(20)} ${'Blocked At'.padEnd(20)} ${'Threshold'.padStart(10)}`);
                logger.info('─'.repeat(70));
                for (const agent of blocked) {
                  const time = agent.blockedAt.toISOString().replace('T', ' ').slice(0, 19);
                  logger.info(
                    `${agent.agentId.slice(0, 20).padEnd(20)} ` +
                    `${time.padEnd(20)} ` +
                    `${(agent.threshold + '%').padStart(10)}`
                  );
                }
              }
            }
          } catch (error) {
            logger.error('budget', 'Failed to list blocked agents', { error: String(error) });
            process.exit(1);
          }
        })
    );

  command.addCommand(
    new Command('unblock')
      .description('Unblock an agent')
      .argument('<agent-id>', 'Agent ID to unblock')
      .action(async (agentId: string) => {
        try {
          const unblocked = unblockAgent(agentId);
          if (unblocked) {
            logger.info(`✅ Agent ${agentId} unblocked`);
          } else {
            logger.error(`Agent not found or not blocked: ${agentId}`);
            process.exit(1);
          }
        } catch (error) {
          logger.error('budget', 'Failed to unblock agent', { error: String(error) });
          process.exit(1);
        }
      })
  );

  return command;
}

// ============================================================================
// Dashboard Command
// ============================================================================

function createDashboardCommand(): Command {
  return new Command('dashboard')
    .description('Show budget dashboard (summary view)')
    .addOption(new Option('--project <name>', 'Project to focus on'))
    .action(async (options) => {
      try {
        const allBudgets = Array.from(activeBudgets.values());
        const blocked = getAllBlockedAgents();
        
        logger.info(`\n╔════════════════════════════════════════════════════════════════════╗`);
        logger.info(`║                        BUDGET DASHBOARD                            ║`);
        logger.info(`╠════════════════════════════════════════════════════════════════════╣`);
        
        if (options.project) {
          const { totalUsed, config } = getProjectBudgetStatus(options.project);
          const percentage = config ? ((totalUsed.total / config.maxCost) * 100).toFixed(1) : '0';
          
          logger.info(`║ PROJECT: ${options.project.padEnd(53)} ║`);
          logger.info(`╠════════════════════════════════════════════════════════════════════╣`);
          if (config) {
            logger.info(`║ Budget: ${formatCurrency(config.maxCost).padEnd(54)} ║`);
            logger.info(`║ Used:   ${formatCurrency(totalUsed.total).padEnd(10)} (${percentage}%)${''.padEnd(33)} ║`);
            logger.info(`║ Remaining: ${formatCurrency(Math.max(0, config.maxCost - totalUsed.total)).padEnd(51)} ║`);
          } else {
            logger.info(`║ No budget configured                                               ║`);
            logger.info(`║ Total used: ${formatCurrency(totalUsed.total).padEnd(52)} ║`);
          }
        } else {
          const totalCost = allBudgets.reduce((sum, b) => sum + b.costUsed.total, 0);
          const totalTokens = allBudgets.reduce((sum, b) => sum + b.tokensUsed.total, 0);
          
          logger.info(`║ ALL PROJECTS                                                       ║`);
          logger.info(`╠════════════════════════════════════════════════════════════════════╣`);
          logger.info(`║ Active Budgets: ${allBudgets.length.toString().padEnd(48)} ║`);
          logger.info(`║ Total Cost: ${formatCurrency(totalCost).padEnd(52)} ║`);
          logger.info(`║ Total Tokens: ${formatTokens(totalTokens).padEnd(50)} ║`);
        }
        
        if (blocked.length > 0) {
          logger.info(`╠════════════════════════════════════════════════════════════════════╣`);
          logger.info(`║ ⚠️  ALERTS: ${blocked.length.toString().padEnd(51)} blocked agents ║`);
          for (const agent of blocked.slice(0, 3)) {
            logger.info(`║    • ${agent.agentId.slice(0, 50).padEnd(50)} ║`);
          }
          if (blocked.length > 3) {
            logger.info(`║    • ... and ${(blocked.length - 3).toString().padEnd(47)} more ║`);
          }
        }
        
        logger.info(`╚════════════════════════════════════════════════════════════════════╝`);
        
        // Show recent high usage
        const highUsage = allBudgets
          .filter(b => b.budgetConfig.maxCost > 0)
          .map(b => ({ ...b, pct: (b.costUsed.total / b.budgetConfig.maxCost) * 100 }))
          .filter(b => b.pct >= 75)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 5);
        
        if (highUsage.length > 0) {
          logger.info(`\n⚠️  High Usage Agents (>75%):`);
          for (const budget of highUsage) {
            logger.info(`   ${budget.agentId}: ${budget.pct.toFixed(1)}% (${formatCurrency(budget.costUsed.total)})`);
          }
        }
      } catch (error) {
        logger.error('budget', 'Failed to show dashboard', { error: String(error) });
        process.exit(1);
      }
    });
}

// ============================================================================
// Export
// ============================================================================

export default createBudgetCommand;
