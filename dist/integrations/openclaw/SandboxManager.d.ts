/**
 * OpenClaw Sandbox Manager
 *
 * Manages Docker container execution for agent isolation,
 * tool sandboxing, and resource limits enforcement.
 */
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { SandboxConfig, ResourceLimits } from './defaults';
export interface SandboxContainer {
    /** Unique container ID */
    containerId: string;
    /** Agent ID this container belongs to */
    agentId: string;
    /** Docker container name */
    name: string;
    /** Current status */
    status: 'creating' | 'running' | 'paused' | 'stopped' | 'error';
    /** Sandbox configuration used */
    config: SandboxConfig;
    /** Resource limits applied */
    resourceLimits: ResourceLimits;
    /** When the container was created */
    createdAt: Date;
    /** When the container started running */
    startedAt?: Date;
    /** When the container was stopped */
    stoppedAt?: Date;
    /** Exit code if stopped */
    exitCode?: number;
    /** Error message if status is 'error' */
    error?: string;
    /** Process handle for running container */
    process?: ReturnType<typeof spawn>;
    /** Tool execution history within this sandbox */
    toolHistory: ToolExecutionRecord[];
    /** Resource usage stats */
    resourceUsage: ResourceUsage;
}
export interface ToolExecutionRecord {
    tool: string;
    args: unknown[];
    startedAt: Date;
    completedAt?: Date;
    success: boolean;
    error?: string;
    resourceUsage: ResourceUsage;
}
export interface ResourceUsage {
    cpuPercent: number;
    memoryMB: number;
    memoryLimitMB: number;
    networkInMB: number;
    networkOutMB: number;
    timestamp: Date;
}
export interface SandboxOptions {
    /** Agent ID */
    agentId: string;
    /** Sandbox configuration */
    config?: Partial<SandboxConfig>;
    /** Resource limits */
    resourceLimits?: Partial<ResourceLimits>;
    /** Working directory on host */
    workspacePath: string;
    /** Environment variables */
    env?: Record<string, string>;
    /** Auto-start after creation */
    autoStart?: boolean;
}
export interface ToolExecutionOptions {
    /** Tool to execute */
    tool: string;
    /** Tool arguments */
    args: unknown[];
    /** Timeout in milliseconds */
    timeout?: number;
    /** Working directory */
    cwd?: string;
    /** Environment variables */
    env?: Record<string, string>;
    /** Capture output */
    captureOutput?: boolean;
}
export interface ToolExecutionResult {
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    error?: string;
    duration: number;
    resourceUsage: ResourceUsage;
}
export interface SandboxStats {
    totalContainers: number;
    runningContainers: number;
    pausedContainers: number;
    stoppedContainers: number;
    errorContainers: number;
    totalResourceUsage: ResourceUsage;
}
export interface SandboxManagerConfig {
    /** Docker binary path */
    dockerPath: string;
    /** Default network name */
    defaultNetwork: string;
    /** Enable debug logging */
    debug: boolean;
    /** Cleanup stopped containers automatically */
    autoCleanup: boolean;
    /** Max containers per agent */
    maxContainersPerAgent: number;
    /** Global resource limits */
    globalResourceLimits?: Partial<ResourceLimits>;
    /** Docker socket path */
    dockerSocket: string;
}
export declare class SandboxError extends Error {
    readonly agentId?: string;
    readonly containerId?: string;
    constructor(message: string, agentId?: string, containerId?: string);
}
export declare class ContainerNotFoundError extends SandboxError {
    constructor(agentId: string, containerId: string);
}
export declare class ContainerAlreadyRunningError extends SandboxError {
    constructor(agentId: string, containerId: string);
}
export declare class ResourceLimitError extends SandboxError {
    readonly resource: string;
    readonly limit: number;
    readonly current: number;
    constructor(agentId: string, resource: string, limit: number, current: number);
}
export declare class DockerNotAvailableError extends SandboxError {
    constructor();
}
export declare class SandboxManager extends EventEmitter {
    private containers;
    private agentContainers;
    private config;
    private dockerAvailable;
    private resourceMonitorInterval?;
    constructor(config?: Partial<SandboxManagerConfig>);
    /**
     * Check if Docker is available and running
     */
    isDockerAvailable(): Promise<boolean>;
    /**
     * Assert Docker is available
     */
    assertDockerAvailable(): Promise<void>;
    /**
     * Create a new sandbox container for an agent
     */
    createContainer(options: SandboxOptions): Promise<SandboxContainer>;
    /**
     * Start a sandbox container
     */
    startContainer(containerId: string): Promise<void>;
    /**
     * Stop a sandbox container
     */
    stopContainer(containerId: string, timeout?: number): Promise<void>;
    /**
     * Pause a running container
     */
    pauseContainer(containerId: string): Promise<void>;
    /**
     * Resume a paused container
     */
    unpauseContainer(containerId: string): Promise<void>;
    /**
     * Remove a container
     */
    removeContainer(containerId: string, force?: boolean): Promise<void>;
    /**
     * Execute a tool inside a sandbox container
     */
    executeTool(containerId: string, options: ToolExecutionOptions): Promise<ToolExecutionResult>;
    /**
     * Execute a command in a sandbox (non-containerized fallback)
     * Used for 'non-main' sandbox mode
     */
    executeInNonMainSandbox(agentId: string, options: ToolExecutionOptions): Promise<ToolExecutionResult>;
    /**
     * Start resource monitoring loop
     */
    private startResourceMonitoring;
    /**
     * Update resource usage for all running containers
     */
    private updateResourceUsage;
    /**
     * Get resource stats for a container
     */
    private getContainerStats;
    /**
     * Parse memory string to MB
     */
    private parseMemoryString;
    /**
     * Assert resource limits not exceeded
     */
    private assertResourceLimits;
    /**
     * Get container by ID
     */
    getContainer(containerId: string): SandboxContainer | undefined;
    /**
     * Get all containers for an agent
     */
    getAgentContainers(agentId: string): SandboxContainer[];
    /**
     * Get running container for agent (if any)
     */
    getRunningContainer(agentId: string): SandboxContainer | undefined;
    /**
     * Get stats for all containers
     */
    getStats(): SandboxStats;
    /**
     * Compute total resource usage across all containers
     */
    private computeTotalResourceUsage;
    /**
     * Build Docker arguments from configuration
     */
    private buildDockerArgs;
    /**
     * Build tool execution command
     */
    private buildToolCommand;
    /**
     * Log message if debug mode
     */
    private log;
    /**
     * Stop and remove all containers
     */
    cleanup(): Promise<void>;
    /**
     * Dispose of the sandbox manager
     */
    dispose(): Promise<void>;
}
export declare function getGlobalSandboxManager(config?: Partial<SandboxManagerConfig>): SandboxManager;
export declare function resetGlobalSandboxManager(): void;
export default SandboxManager;
//# sourceMappingURL=SandboxManager.d.ts.map