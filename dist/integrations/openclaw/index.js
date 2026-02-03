"use strict";
/**
 * OpenClaw Integration Module
 *
 * Provides permission management, sandboxing, and security enforcement
 * for Dash agents using OpenClaw.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREDEFINED_CHANNELS = exports.DEFAULT_CONSTRAINTS = exports.DEFAULT_CAPABILITIES = exports.ChannelUtils = exports.ChannelFactory = exports.resetGlobalGroupCoordinator = exports.getGlobalGroupCoordinator = exports.GroupCoordinator = exports.resetGlobalThreadManager = exports.getGlobalThreadManager = exports.ThreadManager = exports.DockerNotAvailableError = exports.ResourceLimitError = exports.ContainerAlreadyRunningError = exports.ContainerNotFoundError = exports.SandboxError = exports.resetGlobalSandboxManager = exports.getGlobalSandboxManager = exports.SandboxManager = exports.ResourceLimitExceededError = exports.SandboxRequiredError = exports.ToolBlacklistedError = exports.ToolNotAllowedError = exports.PermissionDeniedError = exports.resetGlobalPermissionManager = exports.getGlobalPermissionManager = exports.PermissionManager = exports.computeInheritedPermissions = exports.isValidSandboxMode = exports.validatePermissions = exports.SAFE_TOOLS = exports.SESSION_TOOLS = exports.NETWORK_TOOLS = exports.FILE_TOOLS = exports.DANGEROUS_TOOLS = exports.ALL_TOOLS = exports.PERMISSIVE_INHERITANCE_OPTIONS = exports.STRICT_INHERITANCE_OPTIONS = exports.DEFAULT_INHERITANCE_OPTIONS = exports.SECURITY_PROFILES = exports.GENEROUS_RESOURCE_LIMITS = exports.RESTRICTED_RESOURCE_LIMITS = exports.DEFAULT_RESOURCE_LIMITS = exports.PERMISSIVE_DOCKER_CONFIG = exports.RESTRICTED_DOCKER_CONFIG = exports.DEFAULT_DOCKER_CONFIG = exports.READONLY_PERMISSIONS = exports.FULL_PERMISSIONS = exports.RESTRICTED_PERMISSIONS = exports.DEFAULT_PERMISSIONS = void 0;
exports.TOOL_COSTS = exports.MODEL_PRICING = exports.UsageCalculator = exports.resetBudgetTracker = exports.getBudgetTracker = exports.BudgetExceededError = exports.BudgetError = exports.BudgetTracker = exports.resetGlobalSkillInstaller = exports.getGlobalSkillInstaller = exports.SkillInstaller = exports.resetGlobalClawHubClient = exports.getGlobalClawHubClient = exports.ClawHubClient = exports.DependencyError = exports.VersionNotFoundError = exports.SkillAlreadyInstalledError = exports.SkillNotFoundError = exports.ClawhubError = exports.DEFAULT_CLAWHUB_CONFIG = exports.createAgentExecutor = exports.AgentExecutor = exports.resetGlobalSessionManager = exports.getGlobalSessionManager = exports.SessionManager = exports.DEFAULT_GATEWAY_OPTIONS = exports.DEFAULT_GATEWAY_CONFIG = exports.TimeoutError = exports.ConnectionError = exports.GatewayError = exports.connectToGateway = exports.createGatewayClient = exports.GatewayClient = exports.resetImprovementStore = exports.getImprovementStore = exports.ImprovementStore = exports.resetLearningEngine = exports.getLearningEngine = exports.LearningEngine = exports.ChannelConflictResolver = exports.ChannelLatencyOptimizer = exports.ChannelRouterFactory = exports.ChannelRouterUtils = exports.DEFAULT_ROUTER_CONFIG = exports.ChannelRouter = exports.DEFAULT_AGGREGATION_CONFIG = exports.LatencyOptimizer = exports.ConflictResolver = exports.ContentAnalyzer = exports.ResponseAggregator = void 0;
exports.DEFAULT_STREAM_THRESHOLD = exports.ResultFormatter = exports.ErrorCapture = exports.LargeOutputManager = exports.isErrorResult = exports.isSuccessResult = exports.createErrorResult = exports.createSuccessResult = exports.ToolExecutorGatewayClient = exports.createToolExecutor = exports.OpenClawToolExecutor = exports.resetUsageCalculator = exports.getUsageCalculator = void 0;
// ============================================================================
// Defaults and Configuration
// ============================================================================
var defaults_1 = require("./defaults");
// Constants
Object.defineProperty(exports, "DEFAULT_PERMISSIONS", { enumerable: true, get: function () { return defaults_1.DEFAULT_PERMISSIONS; } });
Object.defineProperty(exports, "RESTRICTED_PERMISSIONS", { enumerable: true, get: function () { return defaults_1.RESTRICTED_PERMISSIONS; } });
Object.defineProperty(exports, "FULL_PERMISSIONS", { enumerable: true, get: function () { return defaults_1.FULL_PERMISSIONS; } });
Object.defineProperty(exports, "READONLY_PERMISSIONS", { enumerable: true, get: function () { return defaults_1.READONLY_PERMISSIONS; } });
Object.defineProperty(exports, "DEFAULT_DOCKER_CONFIG", { enumerable: true, get: function () { return defaults_1.DEFAULT_DOCKER_CONFIG; } });
Object.defineProperty(exports, "RESTRICTED_DOCKER_CONFIG", { enumerable: true, get: function () { return defaults_1.RESTRICTED_DOCKER_CONFIG; } });
Object.defineProperty(exports, "PERMISSIVE_DOCKER_CONFIG", { enumerable: true, get: function () { return defaults_1.PERMISSIVE_DOCKER_CONFIG; } });
Object.defineProperty(exports, "DEFAULT_RESOURCE_LIMITS", { enumerable: true, get: function () { return defaults_1.DEFAULT_RESOURCE_LIMITS; } });
Object.defineProperty(exports, "RESTRICTED_RESOURCE_LIMITS", { enumerable: true, get: function () { return defaults_1.RESTRICTED_RESOURCE_LIMITS; } });
Object.defineProperty(exports, "GENEROUS_RESOURCE_LIMITS", { enumerable: true, get: function () { return defaults_1.GENEROUS_RESOURCE_LIMITS; } });
Object.defineProperty(exports, "SECURITY_PROFILES", { enumerable: true, get: function () { return defaults_1.SECURITY_PROFILES; } });
Object.defineProperty(exports, "DEFAULT_INHERITANCE_OPTIONS", { enumerable: true, get: function () { return defaults_1.DEFAULT_INHERITANCE_OPTIONS; } });
Object.defineProperty(exports, "STRICT_INHERITANCE_OPTIONS", { enumerable: true, get: function () { return defaults_1.STRICT_INHERITANCE_OPTIONS; } });
Object.defineProperty(exports, "PERMISSIVE_INHERITANCE_OPTIONS", { enumerable: true, get: function () { return defaults_1.PERMISSIVE_INHERITANCE_OPTIONS; } });
// Tool Categories
Object.defineProperty(exports, "ALL_TOOLS", { enumerable: true, get: function () { return defaults_1.ALL_TOOLS; } });
Object.defineProperty(exports, "DANGEROUS_TOOLS", { enumerable: true, get: function () { return defaults_1.DANGEROUS_TOOLS; } });
Object.defineProperty(exports, "FILE_TOOLS", { enumerable: true, get: function () { return defaults_1.FILE_TOOLS; } });
Object.defineProperty(exports, "NETWORK_TOOLS", { enumerable: true, get: function () { return defaults_1.NETWORK_TOOLS; } });
Object.defineProperty(exports, "SESSION_TOOLS", { enumerable: true, get: function () { return defaults_1.SESSION_TOOLS; } });
Object.defineProperty(exports, "SAFE_TOOLS", { enumerable: true, get: function () { return defaults_1.SAFE_TOOLS; } });
// Helpers
Object.defineProperty(exports, "validatePermissions", { enumerable: true, get: function () { return defaults_1.validatePermissions; } });
Object.defineProperty(exports, "isValidSandboxMode", { enumerable: true, get: function () { return defaults_1.isValidSandboxMode; } });
Object.defineProperty(exports, "computeInheritedPermissions", { enumerable: true, get: function () { return defaults_1.computeInheritedPermissions; } });
// ============================================================================
// Permission Manager
// ============================================================================
var PermissionManager_1 = require("./PermissionManager");
Object.defineProperty(exports, "PermissionManager", { enumerable: true, get: function () { return PermissionManager_1.PermissionManager; } });
Object.defineProperty(exports, "getGlobalPermissionManager", { enumerable: true, get: function () { return PermissionManager_1.getGlobalPermissionManager; } });
Object.defineProperty(exports, "resetGlobalPermissionManager", { enumerable: true, get: function () { return PermissionManager_1.resetGlobalPermissionManager; } });
// Errors
Object.defineProperty(exports, "PermissionDeniedError", { enumerable: true, get: function () { return PermissionManager_1.PermissionDeniedError; } });
Object.defineProperty(exports, "ToolNotAllowedError", { enumerable: true, get: function () { return PermissionManager_1.ToolNotAllowedError; } });
Object.defineProperty(exports, "ToolBlacklistedError", { enumerable: true, get: function () { return PermissionManager_1.ToolBlacklistedError; } });
Object.defineProperty(exports, "SandboxRequiredError", { enumerable: true, get: function () { return PermissionManager_1.SandboxRequiredError; } });
Object.defineProperty(exports, "ResourceLimitExceededError", { enumerable: true, get: function () { return PermissionManager_1.ResourceLimitExceededError; } });
// ============================================================================
// Sandbox Manager
// ============================================================================
var SandboxManager_1 = require("./SandboxManager");
Object.defineProperty(exports, "SandboxManager", { enumerable: true, get: function () { return SandboxManager_1.SandboxManager; } });
Object.defineProperty(exports, "getGlobalSandboxManager", { enumerable: true, get: function () { return SandboxManager_1.getGlobalSandboxManager; } });
Object.defineProperty(exports, "resetGlobalSandboxManager", { enumerable: true, get: function () { return SandboxManager_1.resetGlobalSandboxManager; } });
// Errors
Object.defineProperty(exports, "SandboxError", { enumerable: true, get: function () { return SandboxManager_1.SandboxError; } });
Object.defineProperty(exports, "ContainerNotFoundError", { enumerable: true, get: function () { return SandboxManager_1.ContainerNotFoundError; } });
Object.defineProperty(exports, "ContainerAlreadyRunningError", { enumerable: true, get: function () { return SandboxManager_1.ContainerAlreadyRunningError; } });
Object.defineProperty(exports, "ResourceLimitError", { enumerable: true, get: function () { return SandboxManager_1.ResourceLimitError; } });
Object.defineProperty(exports, "DockerNotAvailableError", { enumerable: true, get: function () { return SandboxManager_1.DockerNotAvailableError; } });
// ============================================================================
// Thread Manager
// ============================================================================
var ThreadManager_1 = require("./ThreadManager");
Object.defineProperty(exports, "ThreadManager", { enumerable: true, get: function () { return ThreadManager_1.ThreadManager; } });
Object.defineProperty(exports, "getGlobalThreadManager", { enumerable: true, get: function () { return ThreadManager_1.getGlobalThreadManager; } });
Object.defineProperty(exports, "resetGlobalThreadManager", { enumerable: true, get: function () { return ThreadManager_1.resetGlobalThreadManager; } });
// ============================================================================
// Group Coordinator
// ============================================================================
var GroupCoordinator_1 = require("./GroupCoordinator");
Object.defineProperty(exports, "GroupCoordinator", { enumerable: true, get: function () { return GroupCoordinator_1.GroupCoordinator; } });
Object.defineProperty(exports, "getGlobalGroupCoordinator", { enumerable: true, get: function () { return GroupCoordinator_1.getGlobalGroupCoordinator; } });
Object.defineProperty(exports, "resetGlobalGroupCoordinator", { enumerable: true, get: function () { return GroupCoordinator_1.resetGlobalGroupCoordinator; } });
// ============================================================================
// Channel Configuration
// ============================================================================
var ChannelConfig_1 = require("./ChannelConfig");
Object.defineProperty(exports, "ChannelFactory", { enumerable: true, get: function () { return ChannelConfig_1.ChannelFactory; } });
Object.defineProperty(exports, "ChannelUtils", { enumerable: true, get: function () { return ChannelConfig_1.ChannelUtils; } });
Object.defineProperty(exports, "DEFAULT_CAPABILITIES", { enumerable: true, get: function () { return ChannelConfig_1.DEFAULT_CAPABILITIES; } });
Object.defineProperty(exports, "DEFAULT_CONSTRAINTS", { enumerable: true, get: function () { return ChannelConfig_1.DEFAULT_CONSTRAINTS; } });
Object.defineProperty(exports, "PREDEFINED_CHANNELS", { enumerable: true, get: function () { return ChannelConfig_1.PREDEFINED_CHANNELS; } });
// ============================================================================
// Response Aggregation
// ============================================================================
var ResponseAggregator_1 = require("./ResponseAggregator");
Object.defineProperty(exports, "ResponseAggregator", { enumerable: true, get: function () { return ResponseAggregator_1.ResponseAggregator; } });
Object.defineProperty(exports, "ContentAnalyzer", { enumerable: true, get: function () { return ResponseAggregator_1.ContentAnalyzer; } });
Object.defineProperty(exports, "ConflictResolver", { enumerable: true, get: function () { return ResponseAggregator_1.ConflictResolver; } });
Object.defineProperty(exports, "LatencyOptimizer", { enumerable: true, get: function () { return ResponseAggregator_1.LatencyOptimizer; } });
Object.defineProperty(exports, "DEFAULT_AGGREGATION_CONFIG", { enumerable: true, get: function () { return ResponseAggregator_1.DEFAULT_AGGREGATION_CONFIG; } });
// ============================================================================
// Channel Router
// ============================================================================
var ChannelRouter_1 = require("./ChannelRouter");
Object.defineProperty(exports, "ChannelRouter", { enumerable: true, get: function () { return ChannelRouter_1.ChannelRouter; } });
Object.defineProperty(exports, "DEFAULT_ROUTER_CONFIG", { enumerable: true, get: function () { return ChannelRouter_1.DEFAULT_ROUTER_CONFIG; } });
Object.defineProperty(exports, "ChannelRouterUtils", { enumerable: true, get: function () { return ChannelRouter_1.ChannelUtils; } });
Object.defineProperty(exports, "ChannelRouterFactory", { enumerable: true, get: function () { return ChannelRouter_1.ChannelFactory; } });
Object.defineProperty(exports, "ChannelLatencyOptimizer", { enumerable: true, get: function () { return ChannelRouter_1.LatencyOptimizer; } });
Object.defineProperty(exports, "ChannelConflictResolver", { enumerable: true, get: function () { return ChannelRouter_1.ConflictResolver; } });
// ============================================================================
// Learning Engine (Phase 4B)
// ============================================================================
var LearningEngine_1 = require("./LearningEngine");
Object.defineProperty(exports, "LearningEngine", { enumerable: true, get: function () { return LearningEngine_1.LearningEngine; } });
Object.defineProperty(exports, "getLearningEngine", { enumerable: true, get: function () { return LearningEngine_1.getLearningEngine; } });
Object.defineProperty(exports, "resetLearningEngine", { enumerable: true, get: function () { return LearningEngine_1.resetLearningEngine; } });
// ============================================================================
// Improvement Store (Phase 4B)
// ============================================================================
var ImprovementStore_1 = require("./ImprovementStore");
Object.defineProperty(exports, "ImprovementStore", { enumerable: true, get: function () { return ImprovementStore_1.ImprovementStore; } });
Object.defineProperty(exports, "getImprovementStore", { enumerable: true, get: function () { return ImprovementStore_1.getImprovementStore; } });
Object.defineProperty(exports, "resetImprovementStore", { enumerable: true, get: function () { return ImprovementStore_1.resetImprovementStore; } });
// ============================================================================
// Gateway Client
// ============================================================================
var GatewayClient_1 = require("./GatewayClient");
Object.defineProperty(exports, "GatewayClient", { enumerable: true, get: function () { return GatewayClient_1.GatewayClient; } });
Object.defineProperty(exports, "createGatewayClient", { enumerable: true, get: function () { return GatewayClient_1.createGatewayClient; } });
Object.defineProperty(exports, "connectToGateway", { enumerable: true, get: function () { return GatewayClient_1.connectToGateway; } });
// Export error types from types.ts
var types_1 = require("./types");
Object.defineProperty(exports, "GatewayError", { enumerable: true, get: function () { return types_1.GatewayError; } });
Object.defineProperty(exports, "ConnectionError", { enumerable: true, get: function () { return types_1.ConnectionError; } });
Object.defineProperty(exports, "TimeoutError", { enumerable: true, get: function () { return types_1.TimeoutError; } });
Object.defineProperty(exports, "DEFAULT_GATEWAY_CONFIG", { enumerable: true, get: function () { return types_1.DEFAULT_GATEWAY_CONFIG; } });
Object.defineProperty(exports, "DEFAULT_GATEWAY_OPTIONS", { enumerable: true, get: function () { return types_1.DEFAULT_GATEWAY_OPTIONS; } });
// ============================================================================
// Session Manager
// ============================================================================
var SessionManager_1 = require("./SessionManager");
Object.defineProperty(exports, "SessionManager", { enumerable: true, get: function () { return SessionManager_1.SessionManager; } });
Object.defineProperty(exports, "getGlobalSessionManager", { enumerable: true, get: function () { return SessionManager_1.getGlobalSessionManager; } });
Object.defineProperty(exports, "resetGlobalSessionManager", { enumerable: true, get: function () { return SessionManager_1.resetGlobalSessionManager; } });
// ============================================================================
// Agent Executor
// ============================================================================
var AgentExecutor_1 = require("./AgentExecutor");
Object.defineProperty(exports, "AgentExecutor", { enumerable: true, get: function () { return AgentExecutor_1.AgentExecutor; } });
Object.defineProperty(exports, "createAgentExecutor", { enumerable: true, get: function () { return AgentExecutor_1.createAgentExecutor; } });
// ============================================================================
// ClawHub Types
// ============================================================================
var ClawHubTypes_1 = require("./ClawHubTypes");
Object.defineProperty(exports, "DEFAULT_CLAWHUB_CONFIG", { enumerable: true, get: function () { return ClawHubTypes_1.DEFAULT_CLAWHUB_CONFIG; } });
Object.defineProperty(exports, "ClawhubError", { enumerable: true, get: function () { return ClawHubTypes_1.ClawhubError; } });
Object.defineProperty(exports, "SkillNotFoundError", { enumerable: true, get: function () { return ClawHubTypes_1.SkillNotFoundError; } });
Object.defineProperty(exports, "SkillAlreadyInstalledError", { enumerable: true, get: function () { return ClawHubTypes_1.SkillAlreadyInstalledError; } });
Object.defineProperty(exports, "VersionNotFoundError", { enumerable: true, get: function () { return ClawHubTypes_1.VersionNotFoundError; } });
Object.defineProperty(exports, "DependencyError", { enumerable: true, get: function () { return ClawHubTypes_1.DependencyError; } });
// ============================================================================
// ClawHub Client
// ============================================================================
var ClawHubClient_1 = require("./ClawHubClient");
Object.defineProperty(exports, "ClawHubClient", { enumerable: true, get: function () { return ClawHubClient_1.ClawHubClient; } });
Object.defineProperty(exports, "getGlobalClawHubClient", { enumerable: true, get: function () { return ClawHubClient_1.getGlobalClawHubClient; } });
Object.defineProperty(exports, "resetGlobalClawHubClient", { enumerable: true, get: function () { return ClawHubClient_1.resetGlobalClawHubClient; } });
// ============================================================================
// Skill Installer
// ============================================================================
var SkillInstaller_1 = require("./SkillInstaller");
Object.defineProperty(exports, "SkillInstaller", { enumerable: true, get: function () { return SkillInstaller_1.SkillInstaller; } });
Object.defineProperty(exports, "getGlobalSkillInstaller", { enumerable: true, get: function () { return SkillInstaller_1.getGlobalSkillInstaller; } });
Object.defineProperty(exports, "resetGlobalSkillInstaller", { enumerable: true, get: function () { return SkillInstaller_1.resetGlobalSkillInstaller; } });
// ============================================================================
// Budget Tracker
// ============================================================================
var BudgetTracker_1 = require("./BudgetTracker");
Object.defineProperty(exports, "BudgetTracker", { enumerable: true, get: function () { return BudgetTracker_1.BudgetTracker; } });
Object.defineProperty(exports, "BudgetError", { enumerable: true, get: function () { return BudgetTracker_1.BudgetError; } });
Object.defineProperty(exports, "BudgetExceededError", { enumerable: true, get: function () { return BudgetTracker_1.BudgetExceededError; } });
Object.defineProperty(exports, "getBudgetTracker", { enumerable: true, get: function () { return BudgetTracker_1.getBudgetTracker; } });
Object.defineProperty(exports, "resetBudgetTracker", { enumerable: true, get: function () { return BudgetTracker_1.resetBudgetTracker; } });
// ============================================================================
// Usage Calculator
// ============================================================================
var UsageCalculator_1 = require("./UsageCalculator");
Object.defineProperty(exports, "UsageCalculator", { enumerable: true, get: function () { return UsageCalculator_1.UsageCalculator; } });
Object.defineProperty(exports, "MODEL_PRICING", { enumerable: true, get: function () { return UsageCalculator_1.MODEL_PRICING; } });
Object.defineProperty(exports, "TOOL_COSTS", { enumerable: true, get: function () { return UsageCalculator_1.TOOL_COSTS; } });
Object.defineProperty(exports, "getUsageCalculator", { enumerable: true, get: function () { return UsageCalculator_1.getUsageCalculator; } });
Object.defineProperty(exports, "resetUsageCalculator", { enumerable: true, get: function () { return UsageCalculator_1.resetUsageCalculator; } });
// ============================================================================
// Tool Executor
// ============================================================================
var ToolExecutor_1 = require("./ToolExecutor");
Object.defineProperty(exports, "OpenClawToolExecutor", { enumerable: true, get: function () { return ToolExecutor_1.OpenClawToolExecutor; } });
Object.defineProperty(exports, "createToolExecutor", { enumerable: true, get: function () { return ToolExecutor_1.createToolExecutor; } });
Object.defineProperty(exports, "ToolExecutorGatewayClient", { enumerable: true, get: function () { return ToolExecutor_1.GatewayClient; } });
// ============================================================================
// Tool Result
// ============================================================================
var ToolResult_1 = require("./ToolResult");
Object.defineProperty(exports, "createSuccessResult", { enumerable: true, get: function () { return ToolResult_1.createSuccessResult; } });
Object.defineProperty(exports, "createErrorResult", { enumerable: true, get: function () { return ToolResult_1.createErrorResult; } });
Object.defineProperty(exports, "isSuccessResult", { enumerable: true, get: function () { return ToolResult_1.isSuccessResult; } });
Object.defineProperty(exports, "isErrorResult", { enumerable: true, get: function () { return ToolResult_1.isErrorResult; } });
Object.defineProperty(exports, "LargeOutputManager", { enumerable: true, get: function () { return ToolResult_1.LargeOutputManager; } });
Object.defineProperty(exports, "ErrorCapture", { enumerable: true, get: function () { return ToolResult_1.ErrorCapture; } });
Object.defineProperty(exports, "ResultFormatter", { enumerable: true, get: function () { return ToolResult_1.ResultFormatter; } });
Object.defineProperty(exports, "DEFAULT_STREAM_THRESHOLD", { enumerable: true, get: function () { return ToolResult_1.DEFAULT_STREAM_THRESHOLD; } });
//# sourceMappingURL=index.js.map