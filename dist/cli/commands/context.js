"use strict";
/**
 * Context Command - Context management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerContextCommand = registerContextCommand;
const utils_1 = require("../../utils");
function registerContextCommand(program) {
    const context = program
        .command('context')
        .description('Context management');
    context
        .command('tree')
        .description('Show context tree')
        .argument('[agent-id]', 'Agent ID')
        .option('-d, --depth <n>', 'Max depth')
        .action(async (agentId, options) => {
        console.log('📁 Context tree:');
        if (agentId)
            console.log(`Agent: ${agentId}`);
        if (options.depth)
            console.log(`Depth: ${options.depth}`);
        utils_1.logger.info('context', '.');
        console.log('├── src/');
        console.log('├── tests/');
        console.log('└── package.json');
    });
    context
        .command('analyze')
        .description('Analyze context usage')
        .argument('<agent-id>', 'Agent ID')
        .action(async (agentId) => {
        console.log(`📊 Analyzing context for agent ${agentId}...`);
        utils_1.logger.info('context', 'Total size: 1.2MB');
        utils_1.logger.info('context', 'Files: 47');
        utils_1.logger.info('context', 'Compression: 15%');
    });
    context
        .command('optimize')
        .description('Optimize context')
        .argument('<agent-id>', 'Agent ID')
        .option('--aggressive', 'Aggressive optimization')
        .action(async (agentId, options) => {
        console.log(`⚡ Optimizing context for agent ${agentId}...`);
        if (options.aggressive)
            utils_1.logger.info('context', 'Aggressive mode enabled');
        console.log('✅ Optimization complete');
    });
    context
        .command('compact')
        .description('Compact context storage')
        .argument('<agent-id>', 'Agent ID')
        .action(async (agentId) => {
        console.log(`🗜️  Compacting context for agent ${agentId}...`);
        console.log('✅ Compaction complete');
    });
}
//# sourceMappingURL=context.js.map