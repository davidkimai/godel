"use strict";
/**
 * CLI Command Registration v2
 * Imports and registers all CLI commands per SPEC_v2.md
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
// Import command modules
const agents_1 = require("./commands/agents");
const tasks_1 = require("./commands/tasks");
const quality_1 = require("./commands/quality");
const reasoning_1 = require("./commands/reasoning");
const events_1 = require("./commands/events");
const tests_1 = require("./commands/tests");
const context_1 = require("./commands/context");
const budget_1 = require("./commands/budget");
const safety_1 = require("./commands/safety");
const approve_1 = require("./commands/approve");
// v2 Commands per SPEC_v2.md
const swarm_1 = require("./commands/swarm");
const dashboard_1 = require("./commands/dashboard");
const self_improve_1 = require("./commands/self-improve");
// OpenClaw Integration per OPENCLAW_INTEGRATION_SPEC.md
const openclaw_1 = require("./commands/openclaw");
const clawhub_1 = require("./commands/clawhub");
/**
 * Register all CLI commands with the program
 * per SPEC_v2.md requirements:
 * - dash swarm create/destroy/scale/status
 * - dash dashboard (launch TUI)
 * - dash agents spawn/kill/pause/resume (v2 versions)
 * - dash events stream/list (v2 versions)
 */
function registerCommands(program) {
    // v1 commands (maintained for compatibility)
    (0, tasks_1.registerTasksCommand)(program);
    (0, quality_1.registerQualityCommand)(program);
    (0, reasoning_1.registerReasoningCommand)(program);
    (0, tests_1.registerTestsCommand)(program);
    (0, context_1.registerContextCommand)(program);
    program.addCommand((0, budget_1.createBudgetCommand)());
    (0, safety_1.registerSafetyCommand)(program);
    program.addCommand((0, approve_1.createApprovalCommand)());
    // v2 commands per SPEC_v2.md
    (0, swarm_1.registerSwarmCommand)(program); // dash swarm create/destroy/scale/status
    (0, dashboard_1.registerDashboardCommand)(program); // dash dashboard
    (0, agents_1.registerAgentsCommand)(program); // dash agents spawn/kill/pause/resume (v2)
    (0, events_1.registerEventsCommand)(program); // dash events stream/list (v2)
    // Self-improvement command
    (0, self_improve_1.registerSelfImproveCommand)(program); // dash self-improve run/status/report
    // OpenClaw integration command
    (0, openclaw_1.registerOpenClawCommand)(program); // dash openclaw connect/sessions/spawn/send/kill/status
    // ClawHub skill registry commands per F4.1
    (0, clawhub_1.registerClawhubCommand)(program); // dash clawhub search/install/list/info/uninstall/update
}
// Re-export for testing
__exportStar(require("./commands/agents"), exports);
__exportStar(require("./commands/events"), exports);
__exportStar(require("./commands/swarm"), exports);
__exportStar(require("./commands/dashboard"), exports);
//# sourceMappingURL=index.js.map