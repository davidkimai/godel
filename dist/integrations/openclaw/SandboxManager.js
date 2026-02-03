"use strict";
/**
 * OpenClaw Sandbox Manager
 *
 * Manages Docker container execution for agent isolation,
 * tool sandboxing, and resource limits enforcement.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxManager = exports.DockerNotAvailableError = exports.ResourceLimitError = exports.ContainerAlreadyRunningError = exports.ContainerNotFoundError = exports.SandboxError = void 0;
exports.getGlobalSandboxManager = getGlobalSandboxManager;
exports.resetGlobalSandboxManager = resetGlobalSandboxManager;
const events_1 = require("events");
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_1 = require("../../utils/logger");
const defaults_1 = require("./defaults");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ============================================================================
// Errors
// ============================================================================
class SandboxError extends Error {
    constructor(message, agentId, containerId) {
        super(message);
        this.agentId = agentId;
        this.containerId = containerId;
        this.name = 'SandboxError';
    }
}
exports.SandboxError = SandboxError;
class ContainerNotFoundError extends SandboxError {
    constructor(agentId, containerId) {
        super(`Container ${containerId} not found for agent ${agentId}`, agentId, containerId);
        this.name = 'ContainerNotFoundError';
    }
}
exports.ContainerNotFoundError = ContainerNotFoundError;
class ContainerAlreadyRunningError extends SandboxError {
    constructor(agentId, containerId) {
        super(`Container ${containerId} is already running for agent ${agentId}`, agentId, containerId);
        this.name = 'ContainerAlreadyRunningError';
    }
}
exports.ContainerAlreadyRunningError = ContainerAlreadyRunningError;
class ResourceLimitError extends SandboxError {
    constructor(agentId, resource, limit, current) {
        super(`Resource limit exceeded for agent ${agentId}: ${resource} (${current}/${limit})`, agentId);
        this.resource = resource;
        this.limit = limit;
        this.current = current;
        this.name = 'ResourceLimitError';
    }
}
exports.ResourceLimitError = ResourceLimitError;
class DockerNotAvailableError extends SandboxError {
    constructor() {
        super('Docker is not available or not running');
        this.name = 'DockerNotAvailableError';
    }
}
exports.DockerNotAvailableError = DockerNotAvailableError;
// ============================================================================
// Sandbox Manager
// ============================================================================
class SandboxManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.containers = new Map();
        this.agentContainers = new Map(); // agentId -> containerIds
        this.dockerAvailable = null;
        this.config = {
            dockerPath: 'docker',
            defaultNetwork: 'openclaw-sandbox',
            debug: false,
            autoCleanup: true,
            maxContainersPerAgent: 3,
            dockerSocket: '/var/run/docker.sock',
            ...config,
        };
        // Start resource monitoring
        this.startResourceMonitoring();
    }
    // ============================================================================
    // Docker Availability
    // ============================================================================
    /**
     * Check if Docker is available and running
     */
    async isDockerAvailable() {
        if (this.dockerAvailable !== null) {
            return this.dockerAvailable;
        }
        try {
            await execAsync(`${this.config.dockerPath} version`, { timeout: 5000 });
            this.dockerAvailable = true;
            return true;
        }
        catch {
            this.dockerAvailable = false;
            return false;
        }
    }
    /**
     * Assert Docker is available
     */
    async assertDockerAvailable() {
        const available = await this.isDockerAvailable();
        if (!available) {
            throw new DockerNotAvailableError();
        }
    }
    // ============================================================================
    // Container Lifecycle
    // ============================================================================
    /**
     * Create a new sandbox container for an agent
     */
    async createContainer(options) {
        await this.assertDockerAvailable();
        // Check container limit per agent
        const existingContainers = this.agentContainers.get(options.agentId) || [];
        if (existingContainers.length >= this.config.maxContainersPerAgent) {
            throw new SandboxError(`Maximum containers (${this.config.maxContainersPerAgent}) reached for agent ${options.agentId}`, options.agentId);
        }
        // Merge configurations
        const config = {
            ...defaults_1.DEFAULT_DOCKER_CONFIG,
            ...options.config,
        };
        const resourceLimits = {
            ...defaults_1.DEFAULT_RESOURCE_LIMITS,
            ...this.config.globalResourceLimits,
            ...options.resourceLimits,
        };
        // Generate container name
        const timestamp = Date.now();
        const containerName = `openclaw-${options.agentId}-${timestamp}`;
        // Create container record
        const container = {
            containerId: `pending-${timestamp}`,
            agentId: options.agentId,
            name: containerName,
            status: 'creating',
            config,
            resourceLimits,
            createdAt: new Date(),
            toolHistory: [],
            resourceUsage: {
                cpuPercent: 0,
                memoryMB: 0,
                memoryLimitMB: resourceLimits.memoryMB,
                networkInMB: 0,
                networkOutMB: 0,
                timestamp: new Date(),
            },
        };
        // Build Docker command
        const dockerArgs = this.buildDockerArgs(config, resourceLimits, options);
        try {
            // Create container
            const { stdout } = await execAsync(`${this.config.dockerPath} create ${dockerArgs.join(' ')} ${config.image}`, { timeout: 30000 });
            container.containerId = stdout.trim();
            container.status = 'stopped';
            // Store container
            this.containers.set(container.containerId, container);
            if (!this.agentContainers.has(options.agentId)) {
                this.agentContainers.set(options.agentId, []);
            }
            this.agentContainers.get(options.agentId).push(container.containerId);
            this.log('debug', `Created container ${container.containerId} for agent ${options.agentId}`);
            this.emit('container.created', { container });
            // Auto-start if requested
            if (options.autoStart) {
                await this.startContainer(container.containerId);
            }
            return container;
        }
        catch (error) {
            container.status = 'error';
            container.error = error instanceof Error ? error.message : String(error);
            throw new SandboxError(`Failed to create container: ${container.error}`, options.agentId);
        }
    }
    /**
     * Start a sandbox container
     */
    async startContainer(containerId) {
        const container = this.containers.get(containerId);
        if (!container) {
            throw new ContainerNotFoundError('unknown', containerId);
        }
        if (container.status === 'running') {
            throw new ContainerAlreadyRunningError(container.agentId, containerId);
        }
        if (container.status === 'error') {
            throw new SandboxError(`Cannot start container in error state: ${container.error}`, container.agentId, containerId);
        }
        try {
            await execAsync(`${this.config.dockerPath} start ${containerId}`, { timeout: 30000 });
            container.status = 'running';
            container.startedAt = new Date();
            this.log('debug', `Started container ${containerId}`);
            this.emit('container.started', { container });
        }
        catch (error) {
            container.status = 'error';
            container.error = error instanceof Error ? error.message : String(error);
            throw new SandboxError(`Failed to start container: ${container.error}`, container.agentId, containerId);
        }
    }
    /**
     * Stop a sandbox container
     */
    async stopContainer(containerId, timeout = 30) {
        const container = this.containers.get(containerId);
        if (!container) {
            throw new ContainerNotFoundError('unknown', containerId);
        }
        if (container.status !== 'running' && container.status !== 'paused') {
            return; // Already stopped
        }
        try {
            await execAsync(`${this.config.dockerPath} stop -t ${timeout} ${containerId}`, { timeout: (timeout + 5) * 1000 });
            container.status = 'stopped';
            container.stoppedAt = new Date();
            this.log('debug', `Stopped container ${containerId}`);
            this.emit('container.stopped', { container });
            // Auto-cleanup if enabled
            if (this.config.autoCleanup) {
                await this.removeContainer(containerId);
            }
        }
        catch (error) {
            throw new SandboxError(`Failed to stop container: ${error instanceof Error ? error.message : String(error)}`, container.agentId, containerId);
        }
    }
    /**
     * Pause a running container
     */
    async pauseContainer(containerId) {
        const container = this.containers.get(containerId);
        if (!container) {
            throw new ContainerNotFoundError('unknown', containerId);
        }
        if (container.status !== 'running') {
            throw new SandboxError(`Cannot pause container in ${container.status} state`, container.agentId, containerId);
        }
        try {
            await execAsync(`${this.config.dockerPath} pause ${containerId}`, { timeout: 10000 });
            container.status = 'paused';
            this.log('debug', `Paused container ${containerId}`);
            this.emit('container.paused', { container });
        }
        catch (error) {
            throw new SandboxError(`Failed to pause container: ${error instanceof Error ? error.message : String(error)}`, container.agentId, containerId);
        }
    }
    /**
     * Resume a paused container
     */
    async unpauseContainer(containerId) {
        const container = this.containers.get(containerId);
        if (!container) {
            throw new ContainerNotFoundError('unknown', containerId);
        }
        if (container.status !== 'paused') {
            throw new SandboxError(`Cannot unpause container in ${container.status} state`, container.agentId, containerId);
        }
        try {
            await execAsync(`${this.config.dockerPath} unpause ${containerId}`, { timeout: 10000 });
            container.status = 'running';
            this.log('debug', `Unpaused container ${containerId}`);
            this.emit('container.unpaused', { container });
        }
        catch (error) {
            throw new SandboxError(`Failed to unpause container: ${error instanceof Error ? error.message : String(error)}`, container.agentId, containerId);
        }
    }
    /**
     * Remove a container
     */
    async removeContainer(containerId, force = false) {
        const container = this.containers.get(containerId);
        if (!container) {
            return; // Already removed
        }
        try {
            // Stop if running
            if (container.status === 'running' || container.status === 'paused') {
                await this.stopContainer(containerId, 5);
            }
            // Remove from Docker
            await execAsync(`${this.config.dockerPath} rm ${force ? '-f' : ''} ${containerId}`, { timeout: 30000 });
            // Clean up tracking
            this.containers.delete(containerId);
            const agentContainers = this.agentContainers.get(container.agentId);
            if (agentContainers) {
                const filtered = agentContainers.filter(id => id !== containerId);
                if (filtered.length === 0) {
                    this.agentContainers.delete(container.agentId);
                }
                else {
                    this.agentContainers.set(container.agentId, filtered);
                }
            }
            this.log('debug', `Removed container ${containerId}`);
            this.emit('container.removed', { container });
        }
        catch (error) {
            throw new SandboxError(`Failed to remove container: ${error instanceof Error ? error.message : String(error)}`, container.agentId, containerId);
        }
    }
    // ============================================================================
    // Tool Execution
    // ============================================================================
    /**
     * Execute a tool inside a sandbox container
     */
    async executeTool(containerId, options) {
        const container = this.containers.get(containerId);
        if (!container) {
            throw new ContainerNotFoundError('unknown', containerId);
        }
        if (container.status !== 'running') {
            throw new SandboxError(`Cannot execute tool in ${container.status} container`, container.agentId, containerId);
        }
        // Check resource limits before execution
        this.assertResourceLimits(container);
        const startTime = Date.now();
        const record = {
            tool: options.tool,
            args: options.args,
            startedAt: new Date(),
            success: false,
            resourceUsage: { ...container.resourceUsage },
        };
        try {
            // Build tool execution command
            const toolCommand = this.buildToolCommand(options);
            const dockerArgs = [
                'exec',
                options.timeout ? `--timeout=${Math.ceil(options.timeout / 1000)}` : '',
                '-e',
                `OPENCLAW_TOOL=${options.tool}`,
                containerId,
                'sh',
                '-c',
                toolCommand,
            ].filter(Boolean);
            // Execute in container
            const { stdout, stderr } = await execAsync(`${this.config.dockerPath} ${dockerArgs.join(' ')}`, {
                timeout: options.timeout || 300000,
                env: { ...process.env, ...options.env },
            });
            const duration = Date.now() - startTime;
            record.completedAt = new Date();
            record.success = true;
            record.resourceUsage = { ...container.resourceUsage };
            container.toolHistory.push(record);
            this.emit('tool.executed', {
                container,
                tool: options.tool,
                success: true,
                duration,
            });
            return {
                success: true,
                stdout: options.captureOutput !== false ? stdout : undefined,
                stderr: options.captureOutput !== false ? stderr : undefined,
                exitCode: 0,
                duration,
                resourceUsage: record.resourceUsage,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            record.completedAt = new Date();
            record.success = false;
            record.error = errorMessage;
            record.resourceUsage = { ...container.resourceUsage };
            container.toolHistory.push(record);
            this.emit('tool.executed', {
                container,
                tool: options.tool,
                success: false,
                duration,
                error: errorMessage,
            });
            return {
                success: false,
                error: errorMessage,
                duration,
                resourceUsage: record.resourceUsage,
            };
        }
    }
    /**
     * Execute a command in a sandbox (non-containerized fallback)
     * Used for 'non-main' sandbox mode
     */
    async executeInNonMainSandbox(agentId, options) {
        const startTime = Date.now();
        // Apply resource limits using process limits
        const timeout = options.timeout || 300000;
        try {
            const result = await new Promise((resolve, reject) => {
                const toolCommand = this.buildToolCommand(options);
                const child = (0, child_process_1.spawn)('sh', ['-c', toolCommand], {
                    timeout,
                    env: { ...process.env, ...options.env },
                    cwd: options.cwd,
                });
                let stdout = '';
                let stderr = '';
                if (options.captureOutput !== false) {
                    child.stdout?.on('data', (data) => {
                        stdout += data.toString();
                    });
                    child.stderr?.on('data', (data) => {
                        stderr += data.toString();
                    });
                }
                child.on('close', (code) => {
                    const duration = Date.now() - startTime;
                    resolve({
                        success: code === 0,
                        stdout: options.captureOutput !== false ? stdout : undefined,
                        stderr: options.captureOutput !== false ? stderr : undefined,
                        exitCode: code ?? undefined,
                        duration,
                        resourceUsage: {
                            cpuPercent: 0,
                            memoryMB: 0,
                            memoryLimitMB: 0,
                            networkInMB: 0,
                            networkOutMB: 0,
                            timestamp: new Date(),
                        },
                    });
                });
                child.on('error', (err) => {
                    reject(err);
                });
            });
            this.emit('tool.executed', {
                agentId,
                tool: options.tool,
                success: result.success,
                duration: result.duration,
            });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emit('tool.executed', {
                agentId,
                tool: options.tool,
                success: false,
                duration,
                error: errorMessage,
            });
            return {
                success: false,
                error: errorMessage,
                duration,
                resourceUsage: {
                    cpuPercent: 0,
                    memoryMB: 0,
                    memoryLimitMB: 0,
                    networkInMB: 0,
                    networkOutMB: 0,
                    timestamp: new Date(),
                },
            };
        }
    }
    // ============================================================================
    // Resource Monitoring
    // ============================================================================
    /**
     * Start resource monitoring loop
     */
    startResourceMonitoring() {
        this.resourceMonitorInterval = setInterval(async () => {
            await this.updateResourceUsage();
        }, 5000);
    }
    /**
     * Update resource usage for all running containers
     */
    async updateResourceUsage() {
        for (const container of this.containers.values()) {
            if (container.status !== 'running')
                continue;
            try {
                const stats = await this.getContainerStats(container.containerId);
                container.resourceUsage = stats;
                // Check if limits exceeded
                if (stats.memoryMB > container.resourceLimits.memoryMB * 0.9) {
                    this.emit('resource.warning', {
                        container,
                        resource: 'memory',
                        current: stats.memoryMB,
                        limit: container.resourceLimits.memoryMB,
                    });
                }
                if (stats.cpuPercent > 90) {
                    this.emit('resource.warning', {
                        container,
                        resource: 'cpu',
                        current: stats.cpuPercent,
                        limit: 100,
                    });
                }
            }
            catch (error) {
                this.log('debug', `Failed to get stats for ${container.containerId}: ${error}`);
            }
        }
    }
    /**
     * Get resource stats for a container
     */
    async getContainerStats(containerId) {
        try {
            const { stdout } = await execAsync(`${this.config.dockerPath} stats --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}" ${containerId}`, { timeout: 10000 });
            const parts = stdout.trim().split('|');
            const cpuPercent = parseFloat(parts[0]?.replace('%', '') || '0');
            // Parse memory usage (format: "used / limit")
            const memParts = parts[1]?.split('/') || ['0', '0'];
            const memoryMB = this.parseMemoryString(memParts[0]?.trim());
            const memoryLimitMB = this.parseMemoryString(memParts[1]?.trim());
            // Parse network I/O
            const netParts = parts[2]?.split('/') || ['0', '0'];
            const networkInMB = this.parseMemoryString(netParts[0]?.trim());
            const networkOutMB = this.parseMemoryString(netParts[1]?.trim());
            return {
                cpuPercent,
                memoryMB,
                memoryLimitMB,
                networkInMB,
                networkOutMB,
                timestamp: new Date(),
            };
        }
        catch {
            return {
                cpuPercent: 0,
                memoryMB: 0,
                memoryLimitMB: 0,
                networkInMB: 0,
                networkOutMB: 0,
                timestamp: new Date(),
            };
        }
    }
    /**
     * Parse memory string to MB
     */
    parseMemoryString(str) {
        const match = str.match(/([\d.]+)\s*([KMGT]i?)?B?/i);
        if (!match)
            return 0;
        const value = parseFloat(match[1]);
        const unit = match[2]?.toUpperCase() || 'B';
        const multipliers = {
            B: 1 / (1024 * 1024),
            K: 1 / 1024,
            M: 1,
            G: 1024,
            T: 1024 * 1024,
        };
        return value * (multipliers[unit.charAt(0)] || 1);
    }
    /**
     * Assert resource limits not exceeded
     */
    assertResourceLimits(container) {
        const usage = container.resourceUsage;
        const limits = container.resourceLimits;
        if (usage.memoryMB > limits.memoryMB) {
            throw new ResourceLimitError(container.agentId, 'memory', limits.memoryMB, usage.memoryMB);
        }
    }
    // ============================================================================
    // Queries
    // ============================================================================
    /**
     * Get container by ID
     */
    getContainer(containerId) {
        return this.containers.get(containerId);
    }
    /**
     * Get all containers for an agent
     */
    getAgentContainers(agentId) {
        const containerIds = this.agentContainers.get(agentId) || [];
        return containerIds
            .map(id => this.containers.get(id))
            .filter(Boolean);
    }
    /**
     * Get running container for agent (if any)
     */
    getRunningContainer(agentId) {
        return this.getAgentContainers(agentId).find(c => c.status === 'running');
    }
    /**
     * Get stats for all containers
     */
    getStats() {
        let running = 0;
        let paused = 0;
        let stopped = 0;
        let error = 0;
        for (const container of this.containers.values()) {
            switch (container.status) {
                case 'running':
                    running++;
                    break;
                case 'paused':
                    paused++;
                    break;
                case 'stopped':
                    stopped++;
                    break;
                case 'error':
                    error++;
                    break;
            }
        }
        return {
            totalContainers: this.containers.size,
            runningContainers: running,
            pausedContainers: paused,
            stoppedContainers: stopped,
            errorContainers: error,
            totalResourceUsage: this.computeTotalResourceUsage(),
        };
    }
    /**
     * Compute total resource usage across all containers
     */
    computeTotalResourceUsage() {
        let cpuPercent = 0;
        let memoryMB = 0;
        let memoryLimitMB = 0;
        let networkInMB = 0;
        let networkOutMB = 0;
        for (const container of this.containers.values()) {
            if (container.status === 'running') {
                cpuPercent += container.resourceUsage.cpuPercent;
                memoryMB += container.resourceUsage.memoryMB;
                memoryLimitMB += container.resourceUsage.memoryLimitMB;
                networkInMB += container.resourceUsage.networkInMB;
                networkOutMB += container.resourceUsage.networkOutMB;
            }
        }
        return {
            cpuPercent,
            memoryMB,
            memoryLimitMB,
            networkInMB,
            networkOutMB,
            timestamp: new Date(),
        };
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Build Docker arguments from configuration
     */
    buildDockerArgs(config, resourceLimits, options) {
        const args = [
            '--name',
            `openclaw-${options.agentId}-${Date.now()}`,
            '--memory',
            config.memoryLimit,
            '--cpus',
            config.cpuLimit,
            '--network',
            config.networkMode,
            '--workdir',
            config.workingDir,
        ];
        // Security options
        if (config.autoRemove)
            args.push('--rm');
        if (config.readOnlyRootFs)
            args.push('--read-only');
        if (config.noNewPrivileges)
            args.push('--security-opt=no-new-privileges:true');
        // Capabilities
        for (const cap of config.capDrop) {
            args.push('--cap-drop', cap);
        }
        // Security opts
        for (const opt of config.securityOpts) {
            args.push('--security-opt', opt);
        }
        // Volume mounts
        for (const [host, container] of Object.entries(config.volumeMounts)) {
            args.push('-v', `${host}:${container}`);
        }
        // Environment variables
        for (const [key, value] of Object.entries({ ...config.envVars, ...options.env })) {
            args.push('-e', `${key}=${value}`);
        }
        // Resource limits
        args.push('--pids-limit', resourceLimits.maxProcesses.toString());
        args.push('--ulimit', `nofile=${resourceLimits.maxOpenFiles}:${resourceLimits.maxOpenFiles}`);
        return args;
    }
    /**
     * Build tool execution command
     */
    buildToolCommand(options) {
        // Map tool names to their commands
        const toolCommands = {
            read: `cat "${options.args[0]}"`,
            write: `echo "${options.args[1]}" > "${options.args[0]}"`,
            edit: `sed -i 's/${options.args[0]}/${options.args[1]}/g' "${options.args[2]}"`,
            exec: String(options.args[0]),
        };
        return toolCommands[options.tool] || String(options.args[0] || '');
    }
    /**
     * Log message if debug mode
     */
    log(level, message) {
        if (this.config.debug || level !== 'debug') {
            logger_1.logger[level](`[SandboxManager] ${message}`);
        }
    }
    // ============================================================================
    // Cleanup
    // ============================================================================
    /**
     * Stop and remove all containers
     */
    async cleanup() {
        const containerIds = Array.from(this.containers.keys());
        for (const containerId of containerIds) {
            try {
                await this.removeContainer(containerId, true);
            }
            catch (error) {
                this.log('error', `Failed to cleanup container ${containerId}: ${error}`);
            }
        }
        this.containers.clear();
        this.agentContainers.clear();
    }
    /**
     * Dispose of the sandbox manager
     */
    async dispose() {
        if (this.resourceMonitorInterval) {
            clearInterval(this.resourceMonitorInterval);
        }
        await this.cleanup();
        this.removeAllListeners();
    }
}
exports.SandboxManager = SandboxManager;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalSandboxManager = null;
function getGlobalSandboxManager(config) {
    if (!globalSandboxManager) {
        globalSandboxManager = new SandboxManager(config);
    }
    return globalSandboxManager;
}
function resetGlobalSandboxManager() {
    globalSandboxManager?.dispose();
    globalSandboxManager = null;
}
exports.default = SandboxManager;
//# sourceMappingURL=SandboxManager.js.map