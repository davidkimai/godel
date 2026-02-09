# API Design Specification: RuntimeProvider Interface

## Design Philosophy

The RuntimeProvider interface abstracts execution environments (Worktree, Kata, E2B) behind a unified API. Design prioritizes:
- **Consistency**: Same interface regardless of runtime backend
- **Composability**: Operations chain together naturally
- **Observability**: Full telemetry and status visibility
- **Safety**: Strong typing and resource constraints

---

## Core Interface

```typescript
/**
 * RuntimeProvider - Unified interface for agent execution environments
 * 
 * Implementations: WorktreeProvider, KataProvider, E2BProvider
 */
interface RuntimeProvider {
  // ═══════════════════════════════════════════════════════════
  // Lifecycle Management
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Spawn a new runtime environment
   * @param config - Runtime configuration
   * @returns Promise<AgentRuntime> - Handle to spawned runtime
   * @throws RuntimeSpawnError - If runtime creation fails
   */
  spawn(config: SpawnConfig): Promise<AgentRuntime>;
  
  /**
   * Terminate a running runtime
   * @param runtimeId - Unique runtime identifier
   * @param options - Termination options (force, timeout)
   * @throws RuntimeNotFoundError - If runtime doesn't exist
   */
  terminate(
    runtimeId: string, 
    options?: TerminateOptions
  ): Promise<void>;
  
  /**
   * Get current runtime status
   * @param runtimeId - Runtime identifier
   * @returns Promise<RuntimeStatus> - Current state and health
   */
  getStatus(runtimeId: string): Promise<RuntimeStatus>;
  
  /**
   * List all active runtimes managed by this provider
   * @param filters - Optional status filters
   * @returns Promise<RuntimeSummary[]> - List of runtimes
   */
  listRuntimes(
    filters?: RuntimeFilters
  ): Promise<RuntimeSummary[]>;

  // ═══════════════════════════════════════════════════════════
  // Command Execution
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Execute a command in the runtime
   * @param runtimeId - Target runtime
   * @param command - Shell command to execute
   * @param options - Execution options (timeout, cwd, env)
   * @returns Promise<ExecutionResult> - stdout, stderr, exit code
   */
  execute(
    runtimeId: string,
    command: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult>;
  
  /**
   * Execute with streaming output
   * @returns AsyncIterable<ExecutionChunk> - Real-time output chunks
   */
  executeStream(
    runtimeId: string,
    command: string,
    options?: ExecutionOptions
  ): AsyncIterable<ExecutionChunk>;
  
  /**
   * Execute with PTY allocation (interactive shells)
   * @returns Promise<PTYSession> - Interactive terminal session
   */
  executeInteractive(
    runtimeId: string,
    command: string,
    options?: PTYOptions
  ): Promise<PTYSession>;

  // ═══════════════════════════════════════════════════════════
  // File System Operations
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Read file from runtime
   * @param runtimeId - Source runtime
   * @param path - Absolute path in runtime
   * @returns Promise<Buffer> - File contents
   */
  readFile(runtimeId: string, path: string): Promise<Buffer>;
  
  /**
   * Read file as text with encoding
   */
  readTextFile(
    runtimeId: string, 
    path: string, 
    encoding?: BufferEncoding
  ): Promise<string>;
  
  /**
   * Write file to runtime
   * @param runtimeId - Target runtime
   * @param path - Destination path
   * @param data - File contents
   * @param options - Write options (mode, atomic)
   */
  writeFile(
    runtimeId: string,
    path: string,
    data: Buffer | string,
    options?: WriteFileOptions
  ): Promise<void>;
  
  /**
   * Check if file/directory exists
   */
  exists(runtimeId: string, path: string): Promise<boolean>;
  
  /**
   * List directory contents
   */
  listDirectory(
    runtimeId: string,
    path: string,
    options?: ListOptions
  ): Promise<DirectoryEntry[]>;
  
  /**
   * Recursively upload directory
   */
  uploadDirectory(
    runtimeId: string,
    sourcePath: string,
    destinationPath: string,
    options?: UploadOptions
  ): Promise<void>;
  
  /**
   * Recursively download directory
   */
  downloadDirectory(
    runtimeId: string,
    sourcePath: string,
    destinationPath: string,
    options?: DownloadOptions
  ): Promise<void>;

  // ═══════════════════════════════════════════════════════════
  // State Management (Snapshots)
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Create runtime snapshot
   * @param runtimeId - Runtime to snapshot
   * @param options - Snapshot options (include/exclude paths)
   * @returns Promise<Snapshot> - Snapshot metadata
   */
  snapshot(
    runtimeId: string,
    options?: SnapshotOptions
  ): Promise<Snapshot>;
  
  /**
   * List available snapshots
   */
  listSnapshots(
    filters?: SnapshotFilters
  ): Promise<Snapshot[]>;
  
  /**
   * Restore runtime from snapshot
   * @param snapshotId - Snapshot to restore
   * @param config - New runtime configuration
   * @returns Promise<AgentRuntime> - Restored runtime
   */
  restore(
    snapshotId: string,
    config?: Partial<SpawnConfig>
  ): Promise<AgentRuntime>;
  
  /**
   * Delete snapshot
   */
  deleteSnapshot(snapshotId: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════
  // Event Handling
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Subscribe to runtime events
   * @returns Unsubscribe function
   */
  on(
    event: RuntimeEvent,
    handler: RuntimeEventHandler
  ): () => void;
  
  /**
   * Wait for specific runtime state
   */
  waitForState(
    runtimeId: string,
    state: RuntimeState,
    timeout?: number
  ): Promise<void>;
}

// ═══════════════════════════════════════════════════════════
// Supporting Types
// ═══════════════════════════════════════════════════════════

interface SpawnConfig {
  /** Runtime type discriminator */
  runtime: 'worktree' | 'kata' | 'e2b';
  
  /** Unique identifier (auto-generated if not provided) */
  runtimeId?: string;
  
  /** Resource constraints */
  resources: ResourceLimits;
  
  /** Base container/VM image */
  image?: string;
  
  /** Environment variables */
  env?: Record<string, string>;
  
  /** Working directory on spawn */
  cwd?: string;
  
  /** Network access configuration */
  network?: NetworkConfig;
  
  /** Volume mounts */
  volumes?: VolumeMount[];
  
  /** Initial files to seed */
  seedFiles?: Record<string, Buffer | string>;
  
  /** Startup timeout in milliseconds */
  startupTimeout?: number;
  
  /** Metadata tags */
  tags?: Record<string, string>;
}

interface ResourceLimits {
  /** CPU cores (fractional allowed: 0.5, 1, 2, etc.) */
  cpu: number;
  
  /** Memory in MB */
  memory: number;
  
  /** Disk space in MB */
  disk?: number;
  
  /** Max file descriptors */
  fileDescriptors?: number;
  
  /** Max processes */
  processes?: number;
  
  /** Network bandwidth in Mbps */
  networkBandwidth?: number;
}

interface NetworkConfig {
  /** Enable/disable network access */
  enabled: boolean;
  
  /** Allowed outbound domains */
  allowDomains?: string[];
  
  /** Blocked domains */
  blockDomains?: string[];
  
  /** Exposed ports */
  exposePorts?: number[];
}

interface VolumeMount {
  /** Source path (host or remote) */
  source: string;
  
  /** Destination in runtime */
  destination: string;
  
  /** Read-only mount */
  readonly?: boolean;
  
  /** Mount type */
  type?: 'bind' | 'volume' | 'tmpfs';
}

interface AgentRuntime {
  /** Unique runtime identifier */
  readonly runtimeId: string;
  
  /** Runtime type */
  readonly runtime: 'worktree' | 'kata' | 'e2b';
  
  /** Creation timestamp */
  readonly createdAt: Date;
  
  /** Current state */
  readonly state: RuntimeState;
  
  /** Assigned resources */
  readonly resources: ResourceLimits;
  
  /** Runtime metadata */
  readonly metadata: RuntimeMetadata;
}

type RuntimeState = 
  | 'creating'
  | 'running' 
  | 'paused'
  | 'error'
  | 'terminating'
  | 'terminated';

interface RuntimeStatus {
  runtimeId: string;
  state: RuntimeState;
  health: 'healthy' | 'unhealthy' | 'unknown';
  uptime: number;
  resourceUsage: ResourceUsage;
  lastActivity: Date;
  errors: RuntimeError[];
}

interface ResourceUsage {
  cpu: number;           // Percentage (0-100)
  memory: number;        // MB used
  memoryPeak: number;    // MB peak
  disk: number;          // MB used
  networkRx: number;     // Bytes received
  networkTx: number;     // Bytes transmitted
}

interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;      // milliseconds
  command: string;
}

interface ExecutionChunk {
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

interface PTYSession {
  /** Write to PTY stdin */
  write(data: string): void;
  
  /** Resize PTY */
  resize(cols: number, rows: number): void;
  
  /** Close PTY session */
  close(): void;
  
  /** Observable output stream */
  onData: (handler: (data: string) => void) => () => void;
  
  /** Exit code promise */
  onExit: Promise<number>;
}

interface Snapshot {
  snapshotId: string;
  runtimeId: string;
  createdAt: Date;
  size: number;
  metadata: SnapshotMetadata;
  tags: Record<string, string>;
}

interface SnapshotMetadata {
  runtimeType: string;
  runtimeVersion: string;
  files: number;
  totalSize: number;
  checksum: string;
}

type RuntimeEvent = 
  | 'spawn'
  | 'ready'
  | 'error'
  | 'stateChange'
  | 'resourceWarning'
  | 'terminate';

type RuntimeEventHandler = (event: RuntimeEventPayload) => void;

interface RuntimeEventPayload {
  type: RuntimeEvent;
  runtimeId: string;
  timestamp: Date;
  data: unknown;
}
```

---

## Design Decisions & Rationale

### 1. **Async/Await Patterns for Long Operations**

**Decision**: All long-running operations return Promises; streaming uses AsyncIterable.

**Rationale**:
- **spawn()**: Runtime creation involves network calls, container pulls, filesystem setup
- **executeStream()**: AsyncIterable allows backpressure handling and memory efficiency
- **snapshot/restore()**: Can take minutes for large runtimes; Promise signals completion

**Pattern**:
```typescript
// Sequential operations
const runtime = await provider.spawn(config);
const result = await provider.execute(runtime.runtimeId, 'npm install');

// Streaming with backpressure
for await (const chunk of provider.executeStream(id, 'tail -f logs')) {
  process.stdout.write(chunk.data);
}
```

### 2. **Error Handling Strategy**

**Decision**: Hierarchical error classes with error codes and context.

**Rationale**: Different runtimes fail differently (container errors vs VM errors vs filesystem errors). Need unified error taxonomy.

```typescript
abstract class RuntimeError extends Error {
  abstract code: string;
  runtimeId?: string;
  timestamp: Date;
  context: Record<string, unknown>;
}

class RuntimeSpawnError extends RuntimeError {
  code = 'RUNTIME_SPAWN_FAILED';
  spawnConfig: SpawnConfig;
  underlyingError: Error;
}

class RuntimeExecutionError extends RuntimeError {
  code = 'EXECUTION_FAILED';
  command: string;
  exitCode: number;
  signal?: string;
  stderr: string;
}

class ResourceExceededError extends RuntimeError {
  code = 'RESOURCE_LIMIT_EXCEEDED';
  resourceType: 'cpu' | 'memory' | 'disk' | 'time';
  limit: number;
  actual: number;
}

class RuntimeNotFoundError extends RuntimeError {
  code = 'RUNTIME_NOT_FOUND';
  runtimeId: string;
}
```

### 3. **File Operations Across VM Boundaries**

**Decision**: Explicit read/write methods with Buffer/String support, directory transfer utilities.

**Rationale**:
- Binary data requires Buffer (not all files are text)
- Directory operations need recursion (common use case)
- VM boundaries imply serialization overhead - batch operations preferred

**Approach**:
```typescript
// Single file operations
await provider.writeFile(id, '/app/config.json', JSON.stringify(config));
const data = await provider.readFile(id, '/app/data.bin');

// Bulk operations
await provider.uploadDirectory(id, './src', '/app/src');
await provider.downloadDirectory(id, '/app/build', './dist');
```

### 4. **Snapshot/Restore API Contract**

**Decision**: Snapshots are immutable, versioned, with metadata for validation.

**Rationale**:
- **Immutability**: Ensures reproducibility
- **Metadata**: Runtime type/version validation prevents incompatible restores
- **Partial snapshots**: Option to exclude large cache directories

**Contract**:
```typescript
// Create snapshot
const snapshot = await provider.snapshot(runtimeId, {
  exclude: ['/tmp', '/var/cache', 'node_modules'],
  tags: { version: 'v1.2.0', branch: 'main' }
});

// Restore to new runtime
const restored = await provider.restore(snapshot.snapshotId, {
  resources: { cpu: 4, memory: 8192 } // Can upgrade resources
});

// Validation guarantees
assert(restored.metadata.runtimeType === snapshot.metadata.runtimeType);
```

### 5. **Status Reporting Standardization**

**Decision**: Unified status schema with health checks and resource telemetry.

**Rationale**: Need visibility into runtime health regardless of backend implementation.

**Status Schema**:
```typescript
interface RuntimeStatus {
  runtimeId: string;
  state: RuntimeState;           // Abstracted state machine
  health: 'healthy' | 'unhealthy' | 'unknown';
  uptime: number;                // Seconds since spawn
  resourceUsage: ResourceUsage;  // Normalized metrics
  lastActivity: Date;            // For idle detection
  errors: RuntimeError[];        // Recent errors (circular buffer)
}
```

### 6. **Resource Limits Specification**

**Decision**: Declarative ResourceLimits interface with sensible defaults.

**Rationale**:
- CPU: Fractional support (0.5, 1, 2) for varying workloads
- Memory: Hard limit with OOM protection
- Optional limits: Runtime can enforce or ignore based on capability

**Defaults**:
```typescript
const defaultResources: ResourceLimits = {
  cpu: 1,
  memory: 1024,      // 1GB
  disk: 10240,       // 10GB
  fileDescriptors: 1024,
  processes: 100,
  networkBandwidth: 100 // 100 Mbps
};
```

### 7. **Factory Pattern for Provider Instantiation**

**Decision**: Factory creates providers based on configuration, with singleton registry.

**Rationale**: Clean separation of provider selection from usage.

```typescript
class RuntimeProviderFactory {
  private providers = new Map<string, RuntimeProvider>();
  
  create(type: RuntimeType, config?: ProviderConfig): RuntimeProvider {
    switch (type) {
      case 'worktree':
        return new WorktreeProvider(config);
      case 'kata':
        return new KataProvider(config);
      case 'e2b':
        return new E2BProvider(config);
      default:
        throw new Error(`Unknown runtime type: ${type}`);
    }
  }
  
  getOrCreate(type: RuntimeType, config?: ProviderConfig): RuntimeProvider {
    const key = this.makeKey(type, config);
    if (!this.providers.has(key)) {
      this.providers.set(key, this.create(type, config));
    }
    return this.providers.get(key)!;
  }
}
```

### 8. **Event System for State Changes**

**Decision**: Event emitter pattern with typed handlers.

**Rationale**: UI and orchestration need real-time updates without polling.

```typescript
// Subscribe to events
const unsubscribe = provider.on('stateChange', (event) => {
  console.log(`Runtime ${event.runtimeId} → ${event.data.newState}`);
});

// Wait for specific state
await provider.waitForState(runtimeId, 'running', 30000);
```

### 9. **Telemetry and Metrics Standardization**

**Decision**: Built-in metrics collection with pluggable exporters.

**Metrics**:
```typescript
interface RuntimeMetrics {
  // Lifecycle
  spawnDuration: Histogram;
  snapshotDuration: Histogram;
  restoreDuration: Histogram;
  
  // Execution
  executionDuration: Histogram;
  executionCount: Counter;
  executionErrors: Counter;
  
  // Resources
  resourceUsage: Gauge;
  oomEvents: Counter;
  
  // Files
  fileTransferBytes: Counter;
  fileTransferDuration: Histogram;
}
```

### 10. **Network Configuration Abstraction**

**Decision**: Declarative network config with domain allowlisting.

**Rationale**: Security-focused design with explicit outbound control.

```typescript
interface NetworkConfig {
  enabled: boolean;
  allowDomains?: string[];   // Whitelist approach
  blockDomains?: string[];   // Additional blocks
  exposePorts?: number[];    // Inbound ports
}
```

---

## Runtime-Specific Implementations

### Worktree Provider
- Direct filesystem access
- Process-based isolation
- No VM overhead
- Fast for local development

### Kata Provider
- VM-level isolation
- Full Linux compatibility
- Snapshot via VM state
- Higher security boundary

### E2B Provider
- Cloud-based sandboxes
- API-driven operations
- Automatic cleanup
- Scales horizontally

---

## Compatibility Considerations

### Backward Compatibility
1. **Version negotiation**: Provider advertises supported API version
2. **Graceful degradation**: Missing features return NotImplementedError
3. **Config evolution**: Optional fields with defaults for old configs

### Migration Strategy
```typescript
interface VersionedSpawnConfig extends SpawnConfig {
  apiVersion?: 'v1' | 'v2';
}

// Provider validates and adapts
if (config.apiVersion === 'v1') {
  return migrateV1ToV2(config);
}
```

---

## Performance Optimizations

### 1. **Connection Pooling**
- Reuse connections for E2B API calls
- Keep-alive for Kata VM sockets

### 2. **Streaming File Operations**
- Chunk large file transfers
- Progress callbacks for UI

### 3. **Lazy Loading**
- Don't fetch full status on every call
- Cache with TTL

### 4. **Batch Operations**
```typescript
// Instead of N individual writes
await provider.batchWrite(runtimeId, [
  { path: '/app/a.js', data: codeA },
  { path: '/app/b.js', data: codeB },
]);
```

### 5. **Incremental Snapshots**
- Track changed blocks
- Deduplicate across snapshots

---

## Open Questions

1. **Multi-region support**: Should provider handle cross-region runtime placement?
2. **GPU resources**: How to specify and schedule GPU access?
3. **Custom init scripts**: Pre-spawn initialization hooks?
4. **Secret management**: Integration with secret providers?
5. **Live migration**: Move runtimes between hosts without restart?
6. **Federation**: Can providers delegate to other providers?

---

## Success Criteria Verification

- [x] RuntimeProvider interface defined with all lifecycle methods
- [x] All methods documented with purpose, parameters, returns
- [x] Error handling strategy specified with hierarchy
- [x] TypeScript types complete with supporting interfaces
- [x] Backward compatibility addressed with versioning
- [x] Performance optimizations documented
- [x] Open questions identified for future iterations

---

*Specification Version: 1.0.0*
*Last Updated: 2025-02-08*
