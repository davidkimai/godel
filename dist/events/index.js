"use strict";
/**
 * Event System - Mission Control
 * Exports all event-related modules
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
exports.createReplay = exports.EventReplay = exports.stream = exports.EventStream = exports.resetGlobalEmitter = exports.getGlobalEmitter = exports.EventEmitter = void 0;
// Types
__exportStar(require("./types"), exports);
// Emitter
var emitter_1 = require("./emitter");
Object.defineProperty(exports, "EventEmitter", { enumerable: true, get: function () { return emitter_1.EventEmitter; } });
Object.defineProperty(exports, "getGlobalEmitter", { enumerable: true, get: function () { return emitter_1.getGlobalEmitter; } });
Object.defineProperty(exports, "resetGlobalEmitter", { enumerable: true, get: function () { return emitter_1.resetGlobalEmitter; } });
// Stream
var stream_1 = require("./stream");
Object.defineProperty(exports, "EventStream", { enumerable: true, get: function () { return stream_1.EventStream; } });
Object.defineProperty(exports, "stream", { enumerable: true, get: function () { return stream_1.stream; } });
// Replay
var replay_1 = require("./replay");
Object.defineProperty(exports, "EventReplay", { enumerable: true, get: function () { return replay_1.EventReplay; } });
Object.defineProperty(exports, "createReplay", { enumerable: true, get: function () { return replay_1.createReplay; } });
//# sourceMappingURL=index.js.map