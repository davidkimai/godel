"use strict";
/**
 * Core Engine - SPEC_v2.md Implementation
 *
 * Exports:
 * - SwarmManager: Create/destroy/scale/status swarms
 * - AgentLifecycle: spawn/kill/pause/resume/retry agents
 * - OpenClawIntegration: Integrate with OpenClaw sessions
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
__exportStar(require("./swarm"), exports);
__exportStar(require("./lifecycle"), exports);
__exportStar(require("./openclaw"), exports);
//# sourceMappingURL=index.js.map