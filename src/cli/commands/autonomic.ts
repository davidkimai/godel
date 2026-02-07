/**
 * Autonomic CLI Commands
 * 
 * Commands:
 * - godel autonomic status   - Show maintenance team status
 * - godel autonomic start    - Start maintenance team
 * - godel autonomic stop     - Stop maintenance team
 * - godel autonomic pause    - Pause maintenance team
 * - godel autonomic resume   - Resume maintenance team
 * - godel autonomic fix <id> - Manually trigger fix for error
 * - godel autonomic list     - List all errors
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  MaintenanceTeamOrchestrator,
  getGlobalOrchestrator,
  setGlobalOrchestrator,
  ErrorListenerService,
} from '../../autonomic';
import { getGlobalEventBus } from '../../core/event-bus';

// Global orchestrator instance
let orchestrator: MaintenanceTeamOrchestrator | null = null;

function getOrchestrator(): MaintenanceTeamOrchestrator {
  if (!orchestrator) {
    const eventBus = getGlobalEventBus();
    orchestrator = new MaintenanceTeamOrchestrator({ eventBus });
    setGlobalOrchestrator(orchestrator);
  }
  return orchestrator;
}

export function autonomicCommand(): Command {
  const cmd = new Command('autonomic')
    .description('Self-maintaining maintenance team (Godel-on-Godel)')
    .configureHelp({ sortOptions: true });

  // autonomic status
  cmd.addCommand(
    new Command('status')
      .description('Show maintenance team status')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const orch = getOrchestrator();
          const status = orch.getStatus();
          const jobs = orch.getJobs();

          if (options.json) {
            logger.info(JSON.stringify({ status, jobs }, null, 2));
          } else {
            console.log(chalk.bold('\n🤖 Autonomic Maintenance Team Status\n'));
            
            // Status
            console.log(chalk.gray('Status:'), status.isRunning 
              ? chalk.green('● Running') 
              : chalk.yellow('○ Stopped'));
            
            // Error counts
            console.log(chalk.gray('\nError Queue:'));
            console.log(`  ${chalk.yellow('Unprocessed:')}  ${status.unprocessedErrors}`);
            console.log(`  ${chalk.green('Auto-fixable:')}  ${status.autoFixableErrors}`);
            console.log(`  ${chalk.blue('Processing:')}   ${status.processingErrors}`);
            console.log(`  ${chalk.gray('Resolved:')}     ${status.resolvedErrors}`);

            // Jobs
            if (jobs.length > 0) {
              console.log(chalk.gray('\nActive Jobs:'));
              jobs.forEach(job => {
                const statusColor = 
                  job.status === 'completed' ? chalk.green :
                  job.status === 'failed' ? chalk.red :
                  chalk.yellow;
                
                console.log(`  ${statusColor('●')} ${job.errorId.slice(0, 8)} - ${job.status}`);
                
                if (job.prResult) {
                  console.log(`    ${chalk.gray('PR:')} ${chalk.blue(job.prResult.prUrl)}`);
                }
                
                if (job.error) {
                  console.log(`    ${chalk.red('Error:')} ${job.error}`);
                }
              });
            }
            
            console.log();
          }
          
          process.exit(0);
        } catch (error) {
          logger.error('autonomic-cli', `Failed to get status: ${error}`);
          process.exit(1);
        }
      })
  );

  // autonomic start
  cmd.addCommand(
    new Command('start')
      .description('Start maintenance team')
      .option('--poll-interval <ms>', 'Polling interval in milliseconds', '5000')
      .option('--max-concurrent <n>', 'Maximum concurrent jobs', '3')
      .action(async (options) => {
        try {
          const orch = getOrchestrator();
          
          orch.configure({
            pollIntervalMs: parseInt(options.pollInterval, 10),
            maxConcurrentJobs: parseInt(options.maxConcurrent, 10),
          });
          
          await orch.start();
          
          console.log(chalk.green('✅ Maintenance team started'));
          console.log(chalk.gray('Listening for errors...'));
          console.log();
          console.log(chalk.gray('Use "godel autonomic status" to check status'));
          console.log(chalk.gray('Use "godel autonomic stop" to stop'));
          
          process.exit(0);
        } catch (error) {
          logger.error('autonomic-cli', `Failed to start: ${error}`);
          console.error(chalk.red(`❌ Failed to start: ${error}`));
          process.exit(1);
        }
      })
  );

  // autonomic stop
  cmd.addCommand(
    new Command('stop')
      .description('Stop maintenance team')
      .action(async () => {
        try {
          const orch = getOrchestrator();
          orch.stop();
          
          console.log(chalk.yellow('🛑 Maintenance team stopped'));
          process.exit(0);
        } catch (error) {
          logger.error('autonomic-cli', `Failed to stop: ${error}`);
          console.error(chalk.red(`❌ Failed to stop: ${error}`));
          process.exit(1);
        }
      })
  );

  // autonomic pause
  cmd.addCommand(
    new Command('pause')
      .description('Pause maintenance team')
      .action(async () => {
        try {
          const orch = getOrchestrator();
          orch.pause();
          
          console.log(chalk.yellow('⏸️ Maintenance team paused'));
          process.exit(0);
        } catch (error) {
          logger.error('autonomic-cli', `Failed to pause: ${error}`);
          console.error(chalk.red(`❌ Failed to pause: ${error}`));
          process.exit(1);
        }
      })
  );

  // autonomic resume
  cmd.addCommand(
    new Command('resume')
      .description('Resume maintenance team')
      .action(async () => {
        try {
          const orch = getOrchestrator();
          orch.resume();
          
          console.log(chalk.green('▶️ Maintenance team resumed'));
          process.exit(0);
        } catch (error) {
          logger.error('autonomic-cli', `Failed to resume: ${error}`);
          console.error(chalk.red(`❌ Failed to resume: ${error}`));
          process.exit(1);
        }
      })
  );

  // autonomic list
  cmd.addCommand(
    new Command('list')
      .description('List all errors in the queue')
      .option('--status <status>', 'Filter by status (unprocessed|processing|resolved)', 'unprocessed')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const orch = getOrchestrator();
          const eventBus = getGlobalEventBus();
          const errorListener = new ErrorListenerService(eventBus);

          let errors: Array<{
            id: string;
            timestamp: number;
            source: string;
            errorType: string;
            message: string;
            severity: string;
            autoFixable: boolean;
          }> = [];

          switch (options.status) {
            case 'unprocessed':
              errors = errorListener.getUnprocessedErrors().map(e => ({
                ...e,
                autoFixable: errorListener.isAutoFixable(e),
              }));
              break;
            case 'processing':
              errors = errorListener.getProcessingErrors().map(e => ({
                ...e,
                autoFixable: errorListener.isAutoFixable(e),
              }));
              break;
            case 'resolved':
              errors = errorListener.getResolvedErrors().map(e => ({
                ...e,
                autoFixable: errorListener.isAutoFixable(e),
              }));
              break;
            default:
              console.error(chalk.red(`❌ Unknown status: ${options.status}`));
              process.exit(1);
          }

          if (options.json) {
            logger.info(JSON.stringify(errors, null, 2));
          } else {
            console.log(chalk.bold(`\n📋 ${options.status.charAt(0).toUpperCase() + options.status.slice(1)} Errors (${errors.length})\n`));
            
            if (errors.length === 0) {
              console.log(chalk.gray('No errors found'));
            } else {
              errors.forEach(error => {
                const severityColor = 
                  error.severity === 'critical' ? chalk.bgRed.white :
                  error.severity === 'high' ? chalk.red :
                  error.severity === 'medium' ? chalk.yellow :
                  chalk.gray;
                
                const fixable = error.autoFixable 
                  ? chalk.green(' [auto-fixable]') 
                  : '';
                
                console.log(`${severityColor(` ${error.severity.toUpperCase()} `)}${fixable}`);
                console.log(`  ${chalk.gray('ID:')} ${error.id}`);
                console.log(`  ${chalk.gray('Source:')} ${error.source}`);
                console.log(`  ${chalk.gray('Type:')} ${error.errorType}`);
                console.log(`  ${chalk.gray('Message:')} ${error.message.slice(0, 100)}${error.message.length > 100 ? '...' : ''}`);
                console.log(`  ${chalk.gray('Time:')} ${new Date(error.timestamp).toLocaleString()}`);
                console.log();
              });
            }
          }
          
          process.exit(0);
        } catch (error) {
          logger.error('autonomic-cli', `Failed to list errors: ${error}`);
          console.error(chalk.red(`❌ Failed to list errors: ${error}`));
          process.exit(1);
        }
      })
  );

  // autonomic fix
  cmd.addCommand(
    new Command('fix')
      .description('Manually trigger fix for error')
      .argument('<error-id>', 'Error ID to fix')
      .action(async (errorId) => {
        try {
          console.log(chalk.blue(`🔧 Processing error ${errorId}...`));
          
          const orch = getOrchestrator();
          const job = await orch.processError(errorId);
          
          if (!job) {
            console.error(chalk.red(`❌ Error ${errorId} not found or not fixable`));
            process.exit(1);
          }

          console.log(chalk.green(`✅ Fix job started: ${job.id}`));
          console.log(chalk.gray('Check status with: godel autonomic status'));
          
          process.exit(0);
        } catch (error) {
          logger.error('autonomic-cli', `Failed to fix error: ${error}`);
          console.error(chalk.red(`❌ Failed to fix error: ${error}`));
          process.exit(1);
        }
      })
  );

  // autonomic demo
  cmd.addCommand(
    new Command('demo')
      .description('Trigger a demo error to test the system')
      .action(async () => {
        try {
          console.log(chalk.blue('🎮 Creating demo error...'));
          
          const eventBus = getGlobalEventBus();
          const errorId = `demo-${Date.now()}`;
          
          // Emit a demo error
          eventBus.emitEvent({
            id: `evt_${errorId}`,
            type: 'error',
            timestamp: Date.now(),
            agentId: 'demo-agent',
            error: {
              message: 'TypeError: Cannot read property \'name\' of undefined',
              stack: `TypeError: Cannot read property 'name' of undefined
    at processData (src/core/processor.ts:42:15)
    at async execute (src/core/executor.ts:88:10)`,
              code: 'TypeError',
            },
          });
          
          console.log(chalk.green(`✅ Demo error created: ${errorId}`));
          console.log(chalk.gray('Check status with: godel autonomic status'));
          
          // If orchestrator is running, the error will be picked up
          const orch = getGlobalOrchestrator();
          if (orch) {
            console.log(chalk.gray('Orchestrator detected - error will be processed automatically'));
          }
          
          process.exit(0);
        } catch (error) {
          logger.error('autonomic-cli', `Demo failed: ${error}`);
          console.error(chalk.red(`❌ Demo failed: ${error}`));
          process.exit(1);
        }
      })
  );

  return cmd;
}

// Alias for compatibility
export function registerAutonomicCommand(program: Command): void {
  program.addCommand(autonomicCommand());
}

export default autonomicCommand;
