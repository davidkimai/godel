"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebSocketEvents = exports.eventsRoutes = exports.agentsRoutes = exports.swarmRoutes = void 0;
var swarm_1 = require("./swarm");
Object.defineProperty(exports, "swarmRoutes", { enumerable: true, get: function () { return __importDefault(swarm_1).default; } });
var agents_1 = require("./agents");
Object.defineProperty(exports, "agentsRoutes", { enumerable: true, get: function () { return __importDefault(agents_1).default; } });
var events_1 = require("./events");
Object.defineProperty(exports, "eventsRoutes", { enumerable: true, get: function () { return __importDefault(events_1).default; } });
Object.defineProperty(exports, "setupWebSocketEvents", { enumerable: true, get: function () { return events_1.setupWebSocketEvents; } });
//# sourceMappingURL=index.js.map