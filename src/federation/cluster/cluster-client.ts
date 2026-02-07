/**
 * Cluster Client - gRPC client for remote cluster operations
 * 
 * Provides a TypeScript interface for communicating with remote
 * clusters via gRPC. Handles agent spawning, command execution,
 * event streaming, and health checks.
 * 
 * @module federation/cluster/cluster-client
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '../../utils/logger';
import {
  Cluster,
  ClusterCapabilities,
  SpawnConfig,
  Agent,
  ExecResult,
  FederationEvent,
  AgentSnapshot,
} from './types';

// ============================================================================
// Proto Loading
// ============================================================================

const PROTO_PATH = path.join(__dirname, 'proto', 'federation.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const ClusterFederationService = protoDescriptor.godel.federation.ClusterFederation;

// ============================================================================
// Types for gRPC Client
// ============================================================================

interface GrpcClient {
  spawnAgent(
    request: any,
    callback: (error: grpc.ServiceError | null, response: any) => void
  ): void;
  killAgent(
    request: any,
    callback: (error: grpc.ServiceError | null, response: any) => void
  ): void;
  executeCommand(request: any): grpc.ClientReadableStream<any>;
  getAgentStatus(
    request: any,
    callback: (error: grpc.ServiceError | null, response: any) => void
  ): void;
  streamEvents(): grpc.ClientDuplexStream<any, any>;
  heartbeat(
    request: any,
    callback: (error: grpc.ServiceError | null, response: any) => void
  ): void;
  exportAgent(
    request: any,
    callback: (error: grpc.ServiceError | null, response: any) => void
  ): void;
  importAgent(
    request: any,
    callback: (error: grpc.ServiceError | null, response: any) => void
  ): void;
  listAgents(
    request: any,
    callback: (error: grpc.ServiceError | null, response: any) => void
  ): void;
}

// ============================================================================
// Cluster Client
// ============================================================================

/**
 * Client for communicating with remote clusters
 * 
 * Wraps the gRPC client and provides a TypeScript-friendly interface
 * for cluster operations including agent management and event streaming.
 * 
 * @example
 * ```typescript
 * const client = new ClusterClient(cluster);
 * 
 * // Spawn an agent
 * const agent = await client.spawnAgent({
 *   model: 'claude-sonnet-4',
 *   labels: { task: 'code-review' },
 *   timeout: 300
 * });
 * 
 * // Execute a command
 * const result = await client.executeCommand(agent.id, 'analyze codebase');
 * 
 * // Stream events
 * client.connectEventStream((event) => {
 *   console.log('Event:', event.type);
 * });
 * ```
 */
export class ClusterClient {
  private client: GrpcClient;
  private cluster: Cluster;
  private eventStream: grpc.ClientDuplexStream<any, any> | null = null;
  private isConnected = false;

  /**
   * Create a new cluster client
   * 
   * @param cluster - Cluster configuration
   */
  constructor(cluster: Cluster) {
    this.cluster = cluster;
    
    // Create credentials based on cluster configuration
    const credentials = cluster.tlsCert
      ? grpc.credentials.createSsl(Buffer.from(cluster.tlsCert))
      : grpc.credentials.createInsecure();

    this.client = new ClusterFederationService(
      cluster.endpoint,
      credentials,
      {
        'grpc.keepalive_time_ms': 10000,
        'grpc.keepalive_timeout_ms': 5000,
        'grpc.http2.max_pings_without_data': 0,
        'grpc.http2.min_time_between_pings_ms': 10000,
      }
    ) as GrpcClient;

    this.isConnected = true;
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  /**
   * Spawn a new agent on the cluster
   * 
   * @param config - Agent configuration
   * @returns Spawned agent information
   */
  async spawnAgent(config: SpawnConfig): Promise<Agent> {
    const request = {
      agentId: config.id || this.generateId(),
      model: config['model'],
      labels: config.labels || {},
      timeoutSeconds: config.timeout || 300,
      gpuEnabled: config.requiresGpu || false,
      gpuType: config.gpuType || '',
      envVars: config.envVars || {},
    };

    return new Promise((resolve, reject) => {
      this.client.spawnAgent(request, (error, response) => {
        if (error) {
          logger.error(`[ClusterClient] Failed to spawn agent on ${this.cluster.id}:`, `${String(error)}`);
          reject(this.wrapError(error));
          return;
        }

        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        const agent: Agent = {
          id: response.agentId,
          clusterId: response.clusterId,
          endpoint: response.endpoint,
          status: this.mapStatus(response.status),
          model: config['model'],
          startedAt: Date.now(),
          labels: config.labels || {},
        };

        logger.debug(`[ClusterClient] Spawned agent ${agent.id} on cluster ${this.cluster.id}`, { agentId: agent.id, clusterId: this.cluster.id });
        resolve(agent);
      });
    });
  }

  /**
   * Kill/terminate an agent
   * 
   * @param agentId - Agent ID to kill
   * @param force - Whether to force kill
   */
  async killAgent(agentId: string, force = false): Promise<void> {
    const request = {
      agentId,
      force,
    };

    return new Promise((resolve, reject) => {
      this.client.killAgent(request, (error, response) => {
        if (error) {
          reject(this.wrapError(error));
          return;
        }

        if (!response.success) {
          reject(new Error(response.error || 'Failed to kill agent'));
          return;
        }

        logger.debug(`[ClusterClient] Killed agent ${agentId} on cluster ${this.cluster.id}`);
        resolve();
      });
    });
  }

  /**
   * Execute a command on an agent
   * 
   * @param agentId - Agent ID
   * @param command - Command to execute
   * @param env - Environment variables
   * @param timeout - Timeout in seconds
   * @returns Execution result
   */
  async executeCommand(
    agentId: string,
    command: string,
    env?: Record<string, string>,
    timeout?: number
  ): Promise<ExecResult> {
    const request = {
      agentId,
      command,
      env: env || {},
      timeoutSeconds: timeout || 300,
    };

    return new Promise((resolve, reject) => {
      const stream = this.client.executeCommand(request);
      const chunks: string[] = [];
      let exitCode = 0;
      let hasError = false;

      stream.on('data', (response: any) => {
        chunks.push(response.output);
        if (response.isError) {
          hasError = true;
        }
        if (response.exitCode !== undefined) {
          exitCode = response.exitCode;
        }
      });

      stream.on('end', () => {
        const output = chunks.join('');
        resolve({
          output,
          exitCode,
          error: hasError ? output : undefined,
        });
      });

      stream.on('error', (error: grpc.ServiceError) => {
        reject(this.wrapError(error));
      });
    });
  }

  /**
   * Get agent status
   * 
   * @param agentId - Agent ID
   * @returns Agent status information
   */
  async getAgentStatus(agentId: string): Promise<{
    status: string;
    startedAt: number;
    lastActivity: number;
    metadata: Record<string, string>;
  }> {
    const request = { agentId };

    return new Promise((resolve, reject) => {
      this.client.getAgentStatus(request, (error, response) => {
        if (error) {
          reject(this.wrapError(error));
          return;
        }

        resolve({
          status: response.status,
          startedAt: parseInt(response.startedAt),
          lastActivity: parseInt(response.lastActivity),
          metadata: response.metadata || {},
        });
      });
    });
  }

  /**
   * List all agents on the cluster
   * 
   * @param statusFilter - Optional status filter
   * @param labelSelector - Optional label selector
   * @returns Array of agent information
   */
  async listAgents(
    statusFilter?: string,
    labelSelector?: Record<string, string>
  ): Promise<Agent[]> {
    const request = {
      statusFilter: statusFilter || '',
      labelSelector: labelSelector || {},
    };

    return new Promise((resolve, reject) => {
      this.client.listAgents(request, (error, response) => {
        if (error) {
          reject(this.wrapError(error));
          return;
        }

        const agents: Agent[] = (response.agents || []).map((a: any) => ({
          id: a.agentId,
          clusterId: this.cluster.id,
          status: this.mapStatus(a.status),
          model: a.model,
          startedAt: parseInt(a.startedAt),
          labels: a.labels || {},
        }));

        resolve(agents);
      });
    });
  }

  // ============================================================================
  // Event Streaming
  // ============================================================================

  /**
   * Connect to the event stream
   * 
   * @param handler - Event handler callback
   * @param eventTypes - Event types to subscribe to
   */
  connectEventStream(
    handler: (event: FederationEvent) => void,
    eventTypes?: string[]
  ): void {
    if (this.eventStream) {
      logger.warn('[ClusterClient] Event stream already connected');
      return;
    }

    this.eventStream = this.client.streamEvents();

    // Send subscription request
    const subscription = {
      clusterId: this.cluster.id,
      eventTypes: eventTypes || [],
      agentIdFilter: '',
    };
    this.eventStream.write(subscription);

    // Handle incoming events
    this.eventStream.on('data', (event: any) => {
      handler({
        type: event.type,
        agentId: event.agentId,
        clusterId: event.clusterId,
        payload: event.payload,
        timestamp: parseInt(event.timestamp),
        sourceCluster: event.sourceCluster,
      });
    });

    this.eventStream.on('error', (error: grpc.ServiceError) => {
      logger.error(`[ClusterClient] Event stream error for ${this.cluster.id}: ${String(error)}`);
      this.eventStream = null;
    });

    this.eventStream.on('end', () => {
      logger.debug(`[ClusterClient] Event stream ended for ${this.cluster.id}`);
      this.eventStream = null;
    });

    logger.debug(`[ClusterClient] Connected event stream for cluster ${this.cluster.id}`);
  }

  /**
   * Disconnect from the event stream
   */
  disconnectEventStream(): void {
    if (this.eventStream) {
      this.eventStream.end();
      this.eventStream = null;
      logger.debug(`[ClusterClient] Disconnected event stream for cluster ${this.cluster.id}`, { clusterId: this.cluster.id });
    }
  }

  // ============================================================================
  // Health & Capabilities
  // ============================================================================

  /**
   * Send a heartbeat and get cluster capabilities
   * 
   * @returns Cluster capabilities
   */
  async heartbeat(): Promise<ClusterCapabilities> {
    const request = {
      clusterId: this.cluster.id,
      timestamp: Date.now().toString(),
    };

    return new Promise((resolve, reject) => {
      this.client.heartbeat(request, (error, response) => {
        if (error) {
          reject(this.wrapError(error));
          return;
        }

        const capabilities: ClusterCapabilities = {
          maxAgents: response.maxAgents,
          availableAgents: response.availableAgents,
          activeAgents: response.activeAgents,
          gpuEnabled: response.gpuEnabled,
          gpuTypes: response.gpuTypes || [],
          costPerHour: response.costPerHour,
          latency: response.latency,
          flags: response.capabilities || {},
        };

        resolve(capabilities);
      });
    });
  }

  // ============================================================================
  // Migration
  // ============================================================================

  /**
   * Export agent state for migration
   * 
   * @param agentId - Agent ID
   * @param includeState - Whether to include full state
   * @returns Agent snapshot
   */
  async exportAgent(agentId: string, includeState = true): Promise<AgentSnapshot> {
    const request = {
      agentId,
      includeState,
    };

    return new Promise((resolve, reject) => {
      this.client.exportAgent(request, (error, response) => {
        if (error) {
          reject(this.wrapError(error));
          return;
        }

        if (!response.success) {
          reject(new Error(response.error || 'Export failed'));
          return;
        }

        resolve({
          agentId: response.agentId,
          stateData: Buffer.from(response.stateData || ''),
          metadata: response.metadata || {},
          createdAt: Date.now(),
          sourceCluster: this.cluster.id,
        });
      });
    });
  }

  /**
   * Import agent state for migration
   * 
   * @param snapshot - Agent snapshot
   * @returns Import result
   */
  async importAgent(snapshot: AgentSnapshot): Promise<Agent> {
    const request = {
      agentId: snapshot.agentId,
      stateData: snapshot.stateData,
      metadata: snapshot.metadata,
      targetCluster: this.cluster.id,
    };

    return new Promise((resolve, reject) => {
      this.client.importAgent(request, (error, response) => {
        if (error) {
          reject(this.wrapError(error));
          return;
        }

        if (!response.success) {
          reject(new Error(response.error || 'Import failed'));
          return;
        }

        const agent: Agent = {
          id: response.agentId,
          clusterId: response.clusterId,
          status: 'running',
          model: snapshot.metadata["model"] || 'unknown',
          startedAt: Date.now(),
          labels: {},
        };

        resolve(agent);
      });
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Close the client connection
   */
  close(): void {
    this.disconnectEventStream();
    
    // Cast to grpc.Client to access close method
    const grpcClient = this.client as unknown as grpc.Client;
    grpcClient.close();
    
    this.isConnected = false;
    logger.debug(`[ClusterClient] Closed connection to cluster ${this.cluster.id}`);
  }

  /**
   * Check if client is connected
   */
  connected(): boolean {
    return this.isConnected;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Map status string to AgentStatus
   */
  private mapStatus(status: string): import('./types').AgentStatus {
    const statusMap: Record<string, import('./types').AgentStatus> = {
      'pending': 'pending',
      'running': 'running',
      'paused': 'paused',
      'completed': 'completed',
      'failed': 'failed',
      'migrating': 'migrating',
      'terminated': 'terminated',
    };
    return statusMap[status] || 'pending';
  }

  /**
   * Wrap gRPC error in standard Error
   */
  private wrapError(error: grpc.ServiceError): Error {
    const message = error.details || error.message || 'Unknown gRPC error';
    const wrapped = new Error(message);
    (wrapped as any).code = error.code;
    (wrapped as any).grpcError = error;
    return wrapped;
  }
}

// ============================================================================
// Re-export types
// ============================================================================

export { Cluster, Agent, ExecResult, FederationEvent, AgentSnapshot };
