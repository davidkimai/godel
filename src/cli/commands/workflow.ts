import { Command } from 'commander';
import { createWorkflowEngine } from '../../workflow/engine';
import { getGlobalClient as getClient } from '../lib/client';
import { formatOutput } from '../lib/output';
import { logger } from '../../utils/logger';

export function createWorkflowCommand(): Command {
  const cmd = new Command('workflow')
    .description('Manage workflows');

  // List workflows
  cmd.command('list')
    .description('List all workflows')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <number>', 'Limit results', '50')
    .option('--format <format>', 'Output format', 'table')
    .action(async (options) => {
      try {
        const client = getClient();
        const workflows = await client.workflows.list({
          status: options.status,
          limit: parseInt(options.limit)
        });
        
        formatOutput(workflows, options.format);
      } catch (error) {
        logger.error('Failed to list workflows', { error });
        process.exit(1);
      }
    });

  // Get workflow
  cmd.command('get <id>')
    .description('Get workflow details')
    .option('--format <format>', 'Output format', 'pretty')
    .action(async (id, options) => {
      try {
        const client = getClient();
        const workflow = await client.workflows.get(id);
        
        formatOutput(workflow, options.format);
      } catch (error) {
        logger.error('Failed to get workflow', { error });
        process.exit(1);
      }
    });

  // Create workflow
  cmd.command('create')
    .description('Create a new workflow')
    .requiredOption('-f, --file <path>', 'Workflow YAML file')
    .option('--format <format>', 'Output format', 'pretty')
    .action(async (options) => {
      try {
        const fs = require('fs');
        const yaml = require('js-yaml');
        
        const content = fs.readFileSync(options.file, 'utf8');
        const workflowDef = yaml.load(content);
        
        const client = getClient();
        const workflow = await client.workflows.create(workflowDef);
        
        logger.info(`✅ Workflow created: ${workflow.id}`);
        formatOutput(workflow, options.format);
      } catch (error) {
        logger.error('Failed to create workflow', { error });
        process.exit(1);
      }
    });

  // Run workflow
  cmd.command('run <id>')
    .description('Run a workflow')
    .option('-i, --input <json>', 'Input data as JSON string')
    .option('-f, --inputFile <path>', 'Input data from JSON file')
    .option('--format <format>', 'Output format', 'pretty')
    .action(async (id, options) => {
      try {
        let input = {};
        
        if (options.input) {
          input = JSON.parse(options.input);
        } else if (options.inputFile) {
          const fs = require('fs');
          input = JSON.parse(fs.readFileSync(options.inputFile, 'utf8'));
        }
        
        const client = getClient();
        const execution = await client.workflows.run(id, input);
        
        logger.info(`🚀 Workflow execution started: ${execution.id}`);
        formatOutput(execution, options.format);
      } catch (error) {
        logger.error('Failed to run workflow', { error });
        process.exit(1);
      }
    });

  // Stop workflow
  cmd.command('stop <executionId>')
    .description('Stop a running workflow execution')
    .action(async (executionId) => {
      try {
        const client = getClient();
        await client.workflows.stop(executionId);
        
        logger.info(`🛑 Workflow execution stopped: ${executionId}`);
      } catch (error) {
        logger.error('Failed to stop workflow', { error });
        process.exit(1);
      }
    });

  // Delete workflow
  cmd.command('delete <id>')
    .description('Delete a workflow')
    .option('--yes', 'Skip confirmation')
    .action(async (id, options) => {
      try {
        if (!options.yes) {
          logger.info('⚠️  Are you sure? Use --yes to confirm');
          process.exit(1);
        }
        
        const client = getClient();
        await client.workflows.delete(id);
        
        logger.info(`🗑️  Workflow deleted: ${id}`);
      } catch (error) {
        logger.error('Failed to delete workflow', { error });
        process.exit(1);
      }
    });

  // Get workflow logs
  cmd.command('logs <executionId>')
    .description('Get workflow execution logs')
    .option('-f, --follow', 'Follow logs in real-time')
    .option('--format <format>', 'Output format', 'pretty')
    .action(async (executionId, options) => {
      try {
        const client = getClient();
        
        if (options.follow) {
          // Stream logs
          const stream = await client.workflows.streamLogs(executionId);
          stream.on('data', (log) => {
            logger.info(`[${log.timestamp}] ${log.level}: ${log.message}`);
          });
        } else {
          const logs = await client.workflows.getLogs(executionId);
          formatOutput(logs, options.format);
        }
      } catch (error) {
        logger.error('Failed to get workflow logs', { error });
        process.exit(1);
      }
    });

  return cmd;
}
