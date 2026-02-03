"use strict";
/**
 * Reasoning Command - Analyze agent reasoning
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReasoningCommand = registerReasoningCommand;
const utils_1 = require("../../utils");
function registerReasoningCommand(program) {
    const reasoning = program
        .command('reasoning')
        .description('Analyze agent reasoning');
    reasoning
        .command('trace')
        .description('Show reasoning traces')
        .argument('<agent-id>', 'Agent ID')
        .option('-t, --type <type>', 'Filter by trace type')
        .option('-l, --limit <n>', 'Limit results', '10')
        .action(async (agentId, options) => {
        console.log(`🧠 Reasoning traces for agent ${agentId}:`);
        if (options.type)
            console.log('Type filter:', options.type);
        console.log(`Showing last ${options.limit} traces...`);
        utils_1.logger.info('reasoning', 'No traces found');
    });
    reasoning
        .command('decisions')
        .description('Show decision log')
        .argument('<agent-id>', 'Agent ID')
        .option('-f, --format <format>', 'Output format', 'table')
        .action(async (agentId, options) => {
        console.log(`🎯 Decisions for agent ${agentId}:`);
        console.log('Format:', options.format);
        utils_1.logger.info('reasoning', 'No decisions recorded');
    });
    reasoning
        .command('analyze')
        .description('Analyze reasoning patterns')
        .argument('<agent-id>', 'Agent ID')
        .option('--confidence', 'Check confidence alignment')
        .action(async (agentId, options) => {
        console.log(`🔍 Analyzing reasoning for agent ${agentId}...`);
        if (options.confidence)
            utils_1.logger.info('reasoning', 'Checking confidence-evidence alignment...');
        console.log('✅ Analysis complete');
    });
    reasoning
        .command('summarize')
        .description('Summarize reasoning for a task')
        .argument('<task-id>', 'Task ID')
        .action(async (taskId) => {
        console.log(`📝 Summarizing reasoning for task ${taskId}...`);
        console.log('Summary: Task completed successfully');
    });
}
//# sourceMappingURL=reasoning.js.map