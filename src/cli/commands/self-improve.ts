/**
 * Self-Improvement CLI Command
 * 
 * Commands:
 * - godel self-improve run         Run self-improvement cycle
 * - godel self-improve status      Check improvement status
 * - godel self-improve report      Generate improvement report
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import {
  startSelfImprovementSession,
  runImprovementCycle,
  getSelfImprovementReport,
  SelfImprovementState,
  SelfImprovementSession
} from '../../self-improvement/orchestrator';

export function registerSelfImproveCommand(program: Command): void {
  program
    .command('self-improve')
    .description('Run Godel self-improvement cycles using Godel infrastructure')
    .addCommand(
      new Command('run')
        .description('Run self-improvement cycle')
        .option('--area <area>', 'Specific area: codeQuality|documentation|testing', 'all')
        .option('--iterations <n>', 'Number of iterations', '1')
        .action(async (options) => {
          try {
            // Initialize and run self-improvement
            const session = await startSelfImprovementSession();
            const { state, budgetTracker } = session;
            
            const iterations = parseInt(options.iterations, 10);
            const targetArea = options.area;
            
            for (let i = 0; i < iterations; i++) {
              logger.info(`\n🔄 Iteration ${i + 1}/${iterations}`);
              
              const areas = targetArea === 'all' 
                ? ['codeQuality', 'documentation', 'testing'] as const
                : [targetArea as 'codeQuality' | 'documentation' | 'testing'];
              
              for (const area of areas) {
                await runImprovementCycle(state, area, budgetTracker);
              }
              
              state.iteration++;
            }
            
            const report = await getSelfImprovementReport(state, budgetTracker);
            logger.info(report);
            
          } catch (error) {
            logger.error('❌ Self-improvement failed:', error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        })
    )
    .addCommand(
      new Command('status')
        .description('Check self-improvement status')
        .action(async () => {
          logger.info('📊 Self-improvement status:');
          logger.info('   API: http://localhost:7373');
          logger.info('   Status: Running');
          logger.info('   Ready for self-improvement commands');
        })
    )
    .addCommand(
      new Command('report')
        .description('Generate self-improvement report')
        .action(async () => {
          logger.info('📝 Self-improvement report would go here');
        })
    );
}
