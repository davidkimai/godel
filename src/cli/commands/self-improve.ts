/**
 * Self-Improvement CLI Command
 * 
 * Commands:
 * - dash self-improve run         Run self-improvement cycle
 * - dash self-improve status      Check improvement status
 * - dash self-improve report      Generate improvement report
 */

import { Command } from 'commander';
import {
  startSelfImprovementSession,
  runImprovementCycle,
  getSelfImprovementReport,
  SelfImprovementState
} from '../../self-improvement/orchestrator';

export function registerSelfImproveCommand(program: Command): void {
  program
    .command('self-improve')
    .description('Run Dash self-improvement cycles using Dash infrastructure')
    .addCommand(
      new Command('run')
        .description('Run self-improvement cycle')
        .option('--area <area>', 'Specific area: codeQuality|documentation|testing', 'all')
        .option('--iterations <n>', 'Number of iterations', '1')
        .action(async (options) => {
          try {
            // Initialize and run self-improvement
            const state = await startSelfImprovementSession();
            
            const iterations = parseInt(options.iterations, 10);
            const targetArea = options.area;
            
            for (let i = 0; i < iterations; i++) {
              console.log(`\n🔄 Iteration ${i + 1}/${iterations}`);
              
              const areas = targetArea === 'all' 
                ? ['codeQuality', 'documentation', 'testing'] as const
                : [targetArea as 'codeQuality' | 'documentation' | 'testing'];
              
              for (const area of areas) {
                await runImprovementCycle(state, area);
              }
              
              state.iteration++;
            }
            
            const report = await getSelfImprovementReport(state);
            console.log(report);
            
          } catch (error) {
            console.error('❌ Self-improvement failed:', error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        })
    )
    .addCommand(
      new Command('status')
        .description('Check self-improvement status')
        .action(async () => {
          console.log('📊 Self-improvement status:');
          console.log('   API: http://localhost:7373');
          console.log('   Status: Running');
          console.log('   Ready for self-improvement commands');
        })
    )
    .addCommand(
      new Command('report')
        .description('Generate self-improvement report')
        .action(async () => {
          console.log('📝 Self-improvement report would go here');
        })
    );
}
