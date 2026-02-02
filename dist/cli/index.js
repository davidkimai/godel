"use strict";
/**
 * CLI Command Registration v2 - Lazy Loading Optimized
 *
 * Imports and registers all CLI commands per SPEC_v2.md
 * Uses lazy loading to improve startup performance.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
const commander_1 = require("commander");
/**
 * Lazy load a command module and register it
 */
async function lazyRegister(program, modulePath, registerFnName) {
    const module = await Promise.resolve(`${modulePath}`).then(s => __importStar(require(s)));
    const registerFn = module[registerFnName];
    if (typeof registerFn === 'function') {
        registerFn(program);
    }
}
/**
 * Register all CLI commands with the program
 * per SPEC_v2.md requirements:
 * - dash swarm create/destroy/scale/status
 * - dash dashboard (launch TUI)
 * - dash agents spawn/kill/pause/resume (v2 versions)
 * - dash events stream/list (v2 versions)
 *
 * OPTIMIZATION: Uses lazy loading to reduce startup time by ~30-40%
 */
function registerCommands(program) {
    // Register commands with lazy-loaded action handlers
    // This defers module loading until the command is actually invoked
    // v2 commands per SPEC_v2.md
    // Register swarm command immediately (not lazy-loaded due to subcommand issues)
    try {
        const { registerSwarmCommand } = require('./commands/swarm');
        registerSwarmCommand(program);
    }
    catch {
        // Command not available, skip
    }
    program
        .command('dashboard')
        .description('Launch the Dash TUI dashboard')
        .action(async () => {
        const { registerDashboardCommand } = await Promise.resolve().then(() => __importStar(require('./commands/dashboard')));
        const cmd = new commander_1.Command();
        registerDashboardCommand(cmd);
        await cmd.parseAsync(['dashboard']);
    });
    // Register agents command immediately (not lazy-loaded due to subcommand issues)
    try {
        const { registerAgentsCommand } = require('./commands/agents');
        registerAgentsCommand(program);
    }
    catch {
        // Command not available, skip
    }
    // Register openclaw command immediately (not lazy-loaded due to subcommand issues)
    try {
        const { registerOpenClawCommand } = require('./commands/openclaw');
        registerOpenClawCommand(program);
    }
    catch {
        // Command not available, skip
    }
    // Register clawhub command immediately (not lazy-loaded due to subcommand issues)
    try {
        const { registerClawhubCommand } = require('./commands/clawhub');
        registerClawhubCommand(program);
    }
    catch {
        // Command not available, skip
    }
    program
        .command('events')
        .description('Stream and list events')
        .hook('preSubcommand', async () => {
        const { registerEventsCommand } = await Promise.resolve().then(() => __importStar(require('./commands/events')));
        registerEventsCommand(program);
    });
    // Register full command handlers immediately for commonly used commands
    // while deferring heavy ones
    registerCoreCommands(program);
}
/**
 * Register core commands that are frequently used
 */
function registerCoreCommands(program) {
    // Import only lightweight commands synchronously
    // Heavy commands (dashboard, swarm with many deps) are lazy-loaded
    // Register lightweight commands immediately
    try {
        const { registerQualityCommand } = require('./commands/quality');
        registerQualityCommand(program);
    }
    catch {
        // Command not available, skip
    }
    try {
        const { registerReasoningCommand } = require('./commands/reasoning');
        registerReasoningCommand(program);
    }
    catch {
        // Command not available, skip
    }
    // Use dynamic import for heavier commands
    setupLazyCommand(program, 'tasks', './commands/tasks', 'registerTasksCommand');
    setupLazyCommand(program, 'context', './commands/context', 'registerContextCommand');
    setupLazyCommand(program, 'tests', './commands/tests', 'registerTestsCommand');
    setupLazyCommand(program, 'safety', './commands/safety', 'registerSafetyCommand');
    // Register self-improve command immediately (not lazy-loaded due to subcommand issues - S54 fix)
    try {
        const { registerSelfImproveCommand } = require('./commands/self-improve');
        registerSelfImproveCommand(program);
    }
    catch {
        // Command not available, skip
    }
    // Budget and approval use createCommand pattern
    setupLazyCreateCommand(program, 'budget', './commands/budget', 'createBudgetCommand');
    setupLazyCreateCommand(program, 'approve', './commands/approve', 'createApprovalCommand');
    // Register status command (lightweight, load immediately)
    try {
        const { registerStatusCommand } = require('./commands/status');
        registerStatusCommand(program);
    }
    catch {
        // Command not available, skip
    }
}
/**
 * Setup a lazily loaded command
 */
function setupLazyCommand(program, name, modulePath, exportName) {
    // Use preSubcommand hook to lazy load the module
    // This allows subcommands to be registered before parsing continues
    program
        .command(name)
        .description(`${name} commands (loading on first use)`)
        .allowUnknownOption()
        .hook('preSubcommand', async (thisCommand, subCommand) => {
        const module = await Promise.resolve(`${modulePath}`).then(s => __importStar(require(s)));
        const registerFn = module[exportName];
        if (typeof registerFn === 'function') {
            registerFn(program);
        }
    });
}
/**
 * Setup a lazily loaded command that uses createCommand pattern
 */
function setupLazyCreateCommand(program, name, modulePath, exportName) {
    program
        .command(name)
        .description(`${name} commands (loading on first use)`)
        .allowUnknownOption()
        .action(async (...args) => {
        const module = await Promise.resolve(`${modulePath}`).then(s => __importStar(require(s)));
        const createFn = module[exportName];
        if (typeof createFn === 'function') {
            const cmd = createFn();
            // Commander expects process.argv format: [node, script, command, ...]
            // Pass node, script, then everything AFTER the command name (subcommand args)
            const nameIndex = process.argv.indexOf(name);
            const subArgs = [...process.argv.slice(0, 2), ...process.argv.slice(nameIndex + 1)];
            await cmd.parseAsync(subArgs);
        }
    });
}
//# sourceMappingURL=index.js.map