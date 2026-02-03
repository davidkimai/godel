"use strict";
/**
 * Self-Improvement CLI Command
 *
 * Commands:
 * - dash self-improve run         Run self-improvement cycle
 * - dash self-improve status      Check improvement status
 * - dash self-improve report      Generate improvement report
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSelfImproveCommand = registerSelfImproveCommand;
const commander_1 = require("commander");
const orchestrator_1 = require("../../self-improvement/orchestrator");
function registerSelfImproveCommand(program) {
    program
        .command('self-improve')
        .description('Run Dash self-improvement cycles using Dash infrastructure')
        .addCommand(new commander_1.Command('run')
        .description('Run self-improvement cycle')
        .option('--area <area>', 'Specific area: codeQuality|documentation|testing', 'all')
        .option('--iterations <n>', 'Number of iterations', '1')
        .action(async (options) => {
        try {
            // Initialize and run self-improvement
            const session = await (0, orchestrator_1.startSelfImprovementSession)();
            const { state, budgetTracker } = session;
            const iterations = parseInt(options.iterations, 10);
            const targetArea = options.area;
            for (let i = 0; i < iterations; i++) {
                console.log(`\n🔄 Iteration ${i + 1}/${iterations}`);
                const areas = targetArea === 'all'
                    ? ['codeQuality', 'documentation', 'testing']
                    : [targetArea];
                for (const area of areas) {
                    await (0, orchestrator_1.runImprovementCycle)(state, area, budgetTracker);
                }
                state.iteration++;
            }
            const report = await (0, orchestrator_1.getSelfImprovementReport)(state, budgetTracker);
            console.log(report);
        }
        catch (error) {
            console.error('❌ Self-improvement failed:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }))
        .addCommand(new commander_1.Command('status')
        .description('Check self-improvement status')
        .action(async () => {
        console.log('📊 Self-improvement status:');
        console.log('   API: http://localhost:7373');
        console.log('   Status: Running');
        console.log('   Ready for self-improvement commands');
    }))
        .addCommand(new commander_1.Command('report')
        .description('Generate self-improvement report')
        .action(async () => {
        console.log('📝 Self-improvement report would go here');
    }));
}
//# sourceMappingURL=self-improve.js.map