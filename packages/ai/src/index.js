"use strict";
/**
 * @dash/ai - Unified LLM API for Dash
 *
 * This package wraps pi-mono's unified LLM API with swarm-specific features:
 * - Cost-optimized model selection for swarms
 * - Automatic provider failover
 * - Budget-aware model resolution
 * - Multi-provider swarm support
 *
 * @module @dash/ai
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMultiProviderSwarm = exports.completeWithFailover = exports.streamWithFailover = exports.getSwarmModel = exports.CostTracker = exports.FailoverStrategy = exports.ProviderFailover = exports.SwarmModelResolver = exports.clearApiProviders = exports.unregisterApiProviders = exports.getApiProviders = exports.getApiProvider = exports.registerApiProvider = exports.modelsAreEqual = exports.supportsXhigh = exports.calculateCost = exports.getModels = exports.getProviders = exports.getModel = exports.getEnvApiKey = exports.completeSimple = exports.streamSimple = exports.complete = exports.stream = void 0;
// ============================================================================
// Re-exports from pi-mono (@mariozechner/pi-ai)
// ============================================================================
var pi_ai_1 = require("@mariozechner/pi-ai");
// Core functions
Object.defineProperty(exports, "stream", { enumerable: true, get: function () { return pi_ai_1.stream; } });
Object.defineProperty(exports, "complete", { enumerable: true, get: function () { return pi_ai_1.complete; } });
Object.defineProperty(exports, "streamSimple", { enumerable: true, get: function () { return pi_ai_1.streamSimple; } });
Object.defineProperty(exports, "completeSimple", { enumerable: true, get: function () { return pi_ai_1.completeSimple; } });
Object.defineProperty(exports, "getEnvApiKey", { enumerable: true, get: function () { return pi_ai_1.getEnvApiKey; } });
// Model management
Object.defineProperty(exports, "getModel", { enumerable: true, get: function () { return pi_ai_1.getModel; } });
Object.defineProperty(exports, "getProviders", { enumerable: true, get: function () { return pi_ai_1.getProviders; } });
Object.defineProperty(exports, "getModels", { enumerable: true, get: function () { return pi_ai_1.getModels; } });
Object.defineProperty(exports, "calculateCost", { enumerable: true, get: function () { return pi_ai_1.calculateCost; } });
Object.defineProperty(exports, "supportsXhigh", { enumerable: true, get: function () { return pi_ai_1.supportsXhigh; } });
Object.defineProperty(exports, "modelsAreEqual", { enumerable: true, get: function () { return pi_ai_1.modelsAreEqual; } });
// API Registry
Object.defineProperty(exports, "registerApiProvider", { enumerable: true, get: function () { return pi_ai_1.registerApiProvider; } });
Object.defineProperty(exports, "getApiProvider", { enumerable: true, get: function () { return pi_ai_1.getApiProvider; } });
Object.defineProperty(exports, "getApiProviders", { enumerable: true, get: function () { return pi_ai_1.getApiProviders; } });
Object.defineProperty(exports, "unregisterApiProviders", { enumerable: true, get: function () { return pi_ai_1.unregisterApiProviders; } });
Object.defineProperty(exports, "clearApiProviders", { enumerable: true, get: function () { return pi_ai_1.clearApiProviders; } });
// ============================================================================
// Dash Extensions
// ============================================================================
var swarm_model_resolver_1 = require("./swarm-model-resolver");
Object.defineProperty(exports, "SwarmModelResolver", { enumerable: true, get: function () { return swarm_model_resolver_1.SwarmModelResolver; } });
var provider_failover_1 = require("./provider-failover");
Object.defineProperty(exports, "ProviderFailover", { enumerable: true, get: function () { return provider_failover_1.ProviderFailover; } });
Object.defineProperty(exports, "FailoverStrategy", { enumerable: true, get: function () { return provider_failover_1.FailoverStrategy; } });
var cost_tracker_1 = require("./cost-tracker");
Object.defineProperty(exports, "CostTracker", { enumerable: true, get: function () { return cost_tracker_1.CostTracker; } });
var swarm_llm_1 = require("./swarm-llm");
Object.defineProperty(exports, "getSwarmModel", { enumerable: true, get: function () { return swarm_llm_1.getSwarmModel; } });
Object.defineProperty(exports, "streamWithFailover", { enumerable: true, get: function () { return swarm_llm_1.streamWithFailover; } });
Object.defineProperty(exports, "completeWithFailover", { enumerable: true, get: function () { return swarm_llm_1.completeWithFailover; } });
Object.defineProperty(exports, "createMultiProviderSwarm", { enumerable: true, get: function () { return swarm_llm_1.createMultiProviderSwarm; } });
//# sourceMappingURL=index.js.map