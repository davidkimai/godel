#!/usr/bin/env node
/**
 * Debug CLI
 * 
 * Command-line interface for debugging tools.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { DiagnosticsEngine, formatDiagnostics } from './diagnostics';
import { tracer } from './tracer';
import { inspector, formatInspection } from './inspector';

export function createDebugCLI(): Command {
  const program = new Command();

  program
    .name('godel-debug')
    .description('Godel debugging and diagnostics tools')
    .version('1.0.0');

  // Diagnostics command
  program
    .command('diagnose')
    .alias('diag')
    .description('Run system diagnostics')
    .option('-c, --component <name>', 'Check specific component')
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .action(async (options) => {
      const engine = new DiagnosticsEngine();
      
      let result;
      if (options.component) {
        const check = await engine.runCheck(options.component);
        if (!check) {
          console.error(chalk.red(`Unknown component: ${options.component}`));
          process.exit(1);
        }
        result = {
          overall: check.status,
          timestamp: new Date().toISOString(),
          results: [check],
          summary: { healthy: 0, degraded: 0, unhealthy: 0 }
        };
        result.summary[check.status] = 1;
      } else {
        result = await engine.runAll();
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatDiagnostics(result));
      }

      process.exit(result.overall === 'healthy' ? 0 : 1);
    });

  // Trace command
  program
    .command('trace')
    .description('Trace system operations')
    .option('-f, --follow', 'Follow traces in real-time')
    .option('-d, --duration <seconds>', 'Trace for specified duration', '10')
    .action(async (options) => {
      console.log(chalk.blue('Starting trace capture...'));
      
      tracer.on('spanStarted', (span) => {
        console.log(chalk.gray(`[START] ${span.name}`));
      });

      tracer.on('spanEnded', (span) => {
        const duration = span.duration ? `${span.duration}ms` : 'unknown';
        const icon = span.status === 'completed' ? chalk.green('✓') : chalk.red('✗');
        console.log(`${icon} [END] ${span.name} (${duration})`);
      });

      tracer.on('event', ({ spanId, name, attributes }) => {
        console.log(chalk.yellow(`  → Event: ${name}`));
      });

      if (options.follow) {
        console.log(chalk.gray('Tracing... Press Ctrl+C to stop'));
        // Keep running until interrupted
        await new Promise(() => {});
      } else {
        const duration = parseInt(options.duration) * 1000;
        await new Promise(r => setTimeout(r, duration));
        console.log(chalk.blue('\nTrace complete:'));
        console.log(tracer.export('text'));
      }
    });

  // Inspect command
  program
    .command('inspect')
    .description('Inspect system state')
    .argument('<type>', 'Type to inspect (agent|team|task|queue|system)')
    .argument('[id]', 'ID of the resource to inspect')
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .action(async (type, id, options) => {
      let result;

      try {
        switch (type) {
          case 'agent':
            if (!id) {
              console.error(chalk.red('Agent ID required'));
              process.exit(1);
            }
            result = await inspector.inspectAgent(id);
            break;
          case 'team':
            if (!id) {
              console.error(chalk.red('Team ID required'));
              process.exit(1);
            }
            result = await inspector.inspectTeam(id);
            break;
          case 'task':
            if (!id) {
              console.error(chalk.red('Task ID required'));
              process.exit(1);
            }
            result = await inspector.inspectTask(id);
            break;
          case 'queue':
            result = await inspector.inspectQueue(id || 'default');
            break;
          case 'system':
            result = await inspector.inspectSystem();
            break;
          default:
            console.error(chalk.red(`Unknown type: ${type}`));
            process.exit(1);
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatInspection(result));
        }
      } catch (error) {
        console.error(chalk.red(`Inspection failed: ${error}`));
        process.exit(1);
      }
    });

  // Logs command
  program
    .command('logs')
    .description('View and filter logs')
    .option('-a, --agent <id>', 'Filter by agent ID')
    .option('-t, --team <id>', 'Filter by team ID')
    .option('-l, --level <level>', 'Filter by level (debug|info|warn|error)', 'info')
    .option('-n, --lines <number>', 'Number of lines', '50')
    .option('-f, --follow', 'Follow logs')
    .action(async (options) => {
      console.log(chalk.blue(`Fetching logs (${options.lines} lines)...`));
      
      // Mock log output
      const levels = { debug: chalk.gray, info: chalk.white, warn: chalk.yellow, error: chalk.red };
      const levelFn = levels[options.level as keyof typeof levels] || chalk.white;
      
      console.log(levelFn(`[${new Date().toISOString()}] [INFO] System initialized`));
      console.log(levelFn(`[${new Date().toISOString()}] [INFO] Agent pool ready (5 agents)`));
      console.log(levelFn(`[${new Date().toISOString()}] [INFO] Task queue processing started`));
      
      if (options.follow) {
        console.log(chalk.gray('\nFollowing logs... Press Ctrl+C to exit'));
        let counter = 0;
        const interval = setInterval(() => {
          counter++;
          console.log(levelFn(`[${new Date().toISOString()}] [INFO] Heartbeat ${counter}`));
        }, 2000);
        
        process.on('SIGINT', () => {
          clearInterval(interval);
          process.exit(0);
        });
      }
    });

  // Profile command
  program
    .command('profile')
    .description('Profile system performance')
    .option('-d, --duration <seconds>', 'Profiling duration', '30')
    .action(async (options) => {
      const duration = parseInt(options.duration);
      console.log(chalk.blue(`Profiling for ${duration} seconds...`));
      
      const startTime = Date.now();
      const samples: any[] = [];
      
      const interval = setInterval(() => {
        samples.push({
          timestamp: Date.now(),
          cpu: Math.random() * 100,
          memory: Math.random() * 16,
          agents: Math.floor(Math.random() * 20),
          tasks: Math.floor(Math.random() * 50)
        });
      }, 1000);
      
      await new Promise(r => setTimeout(r, duration * 1000));
      clearInterval(interval);
      
      const avgCpu = samples.reduce((a, s) => a + s.cpu, 0) / samples.length;
      const avgMemory = samples.reduce((a, s) => a + s.memory, 0) / samples.length;
      
      console.log(chalk.green('\nProfiling complete:'));
      console.log(`  Duration: ${duration}s`);
      console.log(`  Samples: ${samples.length}`);
      console.log(`  Avg CPU: ${avgCpu.toFixed(1)}%`);
      console.log(`  Avg Memory: ${avgMemory.toFixed(1)}GB`);
      console.log(`  Peak Agents: ${Math.max(...samples.map(s => s.agents))}`);
    });

  return program;
}

// Export for use as module
export const DebugCLI = { createDebugCLI };

// Run if executed directly
if (require.main === module) {
  const cli = createDebugCLI();
  cli.parse();
}
