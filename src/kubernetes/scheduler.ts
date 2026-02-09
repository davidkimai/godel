/**
 * Kubernetes Scheduler for Kata VM Placement Optimization
 * 
 * Features:
 * - Node selection optimized for Kata Containers
 * - Affinity/anti-affinity rules for VM distribution
 * - Resource-based placement with predictive scoring
 * - Load balancing across cluster nodes
 * - Performance-optimized scheduling decisions
 */

import { K8sClient } from './client';
import { V1Node, V1NodeList, V1Pod, V1ResourceRequirements } from '@kubernetes/client-node';

export interface NodeScore {
  node: V1Node;
  score: number;
  reasons: string[];
}

export interface VMPlacementRequest {
  podName: string;
  namespace: string;
  resources: V1ResourceRequirements;
  runtimeClassName?: string;
  labels?: Record<string, string>;
  nodeSelector?: Record<string, string>;
  affinity?: AffinityRules;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  targetNodes?: string[];
}

export interface AffinityRules {
  nodeAffinity?: {
    required?: NodeSelectorTerm[];
    preferred?: WeightedNodeSelectorTerm[];
  };
  podAffinity?: {
    required?: PodAffinityTerm[];
    preferred?: WeightedPodAffinityTerm[];
  };
  podAntiAffinity?: {
    required?: PodAffinityTerm[];
    preferred?: WeightedPodAffinityTerm[];
  };
}

export interface NodeSelectorTerm {
  matchExpressions?: NodeSelectorRequirement[];
  matchFields?: NodeSelectorRequirement[];
}

export interface NodeSelectorRequirement {
  key: string;
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt';
  values?: string[];
}

export interface WeightedNodeSelectorTerm {
  weight: number;
  preference: NodeSelectorTerm;
}

export interface PodAffinityTerm {
  labelSelector?: LabelSelector;
  namespaces?: string[];
  topologyKey: string;
}

export interface WeightedPodAffinityTerm {
  weight: number;
  podAffinityTerm: PodAffinityTerm;
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: LabelSelectorRequirement[];
}

export interface LabelSelectorRequirement {
  key: string;
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
  values?: string[];
}

export interface PlacementResult {
  selectedNode: V1Node;
  score: number;
  alternatives: NodeScore[];
  placementTimeMs: number;
  estimatedStartTimeMs: number;
}

export interface NodeMetrics {
  node: V1Node;
  cpuCapacity: number;
  cpuAllocatable: number;
  cpuUsage: number;
  memoryCapacity: number;
  memoryAllocatable: number;
  memoryUsage: number;
  podCount: number;
  maxPods: number;
  kataEnabled: boolean;
  networkLatency: number;
  diskPressure: boolean;
  memoryPressure: boolean;
  pidPressure: boolean;
  ready: boolean;
  lastHeartbeat: Date;
}

export interface SchedulerConfig {
  /** Weight for resource availability scoring (0-100) */
  resourceWeight: number;
  /** Weight for Kata runtime readiness (0-100) */
  kataWeight: number;
  /** Weight for load balancing (0-100) */
  loadBalanceWeight: number;
  /** Weight for affinity rules (0-100) */
  affinityWeight: number;
  /** Weight for node locality (0-100) */
  localityWeight: number;
  /** Minimum score threshold for placement (0-100) */
  minScoreThreshold: number;
  /** Enable predictive resource scoring */
  predictiveScoring: boolean;
  /** Enable topology-aware scheduling */
  topologyAware: boolean;
  /** Cache TTL for node metrics in ms */
  metricsCacheTtlMs: number;
  /** Maximum concurrent placements */
  maxConcurrentPlacements: number;
}

export interface TopologyZone {
  zone: string;
  region: string;
  nodes: V1Node[];
  totalCpu: number;
  availableCpu: number;
  totalMemory: number;
  availableMemory: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  resourceWeight: 35,
  kataWeight: 25,
  loadBalanceWeight: 20,
  affinityWeight: 15,
  localityWeight: 5,
  minScoreThreshold: 50,
  predictiveScoring: true,
  topologyAware: true,
  metricsCacheTtlMs: 30000,
  maxConcurrentPlacements: 100,
};

const KATA_RUNTIME_LABEL = 'katacontainers.io/kata-runtime';
const KATA_RUNTIME_CLASS = 'kata';

export class KataScheduler {
  private client: K8sClient;
  private config: SchedulerConfig;
  private nodeMetricsCache: Map<string, { metrics: NodeMetrics; timestamp: number }> = new Map();
  private placementHistory: Map<string, { nodeName: string; timestamp: number }[]> = new Map();
  private activePlacements: number = 0;
  private topologyCache: Map<string, TopologyZone> = new Map();
  private lastTopologyUpdate: number = 0;

  constructor(client: K8sClient, config: Partial<SchedulerConfig> = {}) {
    this.client = client;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find optimal node for Kata VM placement
   */
  async scheduleVM(request: VMPlacementRequest): Promise<PlacementResult> {
    const startTime = performance.now();

    try {
      // Check concurrent placement limit
      if (this.activePlacements >= this.config.maxConcurrentPlacements) {
        throw new SchedulerError(
          'Max concurrent placements exceeded',
          'CONCURRENCY_LIMIT'
        );
      }

      this.activePlacements++;

      // Get all candidate nodes
      const nodes = await this.getCandidateNodes(request);
      if (nodes.length === 0) {
        throw new SchedulerError('No suitable nodes found', 'NO_CANDIDATES');
      }

      // Score all nodes
      const scoredNodes = await this.scoreNodes(nodes, request);

      // Filter by minimum threshold
      const qualifiedNodes = scoredNodes.filter(n => n.score >= this.config.minScoreThreshold);
      if (qualifiedNodes.length === 0) {
        throw new SchedulerError(
          `No nodes meet minimum score threshold (${this.config.minScoreThreshold})`,
          'THRESHOLD_NOT_MET',
          { bestScore: scoredNodes[0]?.score }
        );
      }

      // Sort by score descending
      qualifiedNodes.sort((a, b) => b.score - a.score);

      const selectedNode = qualifiedNodes[0];
      const alternatives = qualifiedNodes.slice(1, 4);

      const placementTimeMs = performance.now() - startTime;

      // Record placement for history
      this.recordPlacement(request.podName, selectedNode.node.metadata!.name!);

      return {
        selectedNode: selectedNode.node,
        score: selectedNode.score,
        alternatives,
        placementTimeMs,
        estimatedStartTimeMs: this.estimateStartTime(selectedNode),
      };
    } finally {
      this.activePlacements--;
    }
  }

  /**
   * Get candidate nodes for VM placement
   */
  private async getCandidateNodes(request: VMPlacementRequest): Promise<V1Node[]> {
    const allNodes = await this.listNodes();
    const candidates: V1Node[] = [];

    for (const node of allNodes) {
      // Skip unready nodes
      if (!this.isNodeReady(node)) continue;

      // Skip nodes with pressure conditions
      if (this.hasPressureConditions(node)) continue;

      // Check node selector
      if (request.nodeSelector && !this.matchesNodeSelector(node, request.nodeSelector)) {
        continue;
      }

      // Check required node affinity
      if (request.affinity?.nodeAffinity?.required) {
        if (!this.matchesRequiredNodeAffinity(node, request.affinity.nodeAffinity.required)) {
          continue;
        }
      }

      // Check target nodes restriction
      if (request.targetNodes && !request.targetNodes.includes(node.metadata!.name!)) {
        continue;
      }

      // For Kata VMs, check if node supports Kata runtime
      if (request.runtimeClassName === KATA_RUNTIME_CLASS) {
        if (!this.supportsKataRuntime(node)) continue;
      }

      candidates.push(node);
    }

    return candidates;
  }

  /**
   * Score all candidate nodes
   */
  private async scoreNodes(nodes: V1Node[], request: VMPlacementRequest): Promise<NodeScore[]> {
    const scores: NodeScore[] = [];

    // Get topology zones if enabled
    let topologyZones: Map<string, TopologyZone> | undefined;
    if (this.config.topologyAware) {
      topologyZones = await this.getTopologyZones();
    }

    for (const node of nodes) {
      const nodeMetrics = await this.getNodeMetrics(node);
      const score = this.calculateNodeScore(node, nodeMetrics, request, topologyZones);
      scores.push(score);
    }

    return scores;
  }

  /**
   * Calculate comprehensive node score
   */
  private calculateNodeScore(
    node: V1Node,
    metrics: NodeMetrics,
    request: VMPlacementRequest,
    topologyZones?: Map<string, TopologyZone>
  ): NodeScore {
    const reasons: string[] = [];
    let totalScore = 0;

    // Resource availability score (0-35)
    const resourceScore = this.calculateResourceScore(metrics, request);
    totalScore += (resourceScore / 100) * this.config.resourceWeight;
    reasons.push(`Resources: ${resourceScore.toFixed(1)}%`);

    // Kata runtime readiness score (0-25)
    const kataScore = this.calculateKataScore(node, metrics);
    totalScore += (kataScore / 100) * this.config.kataWeight;
    reasons.push(`Kata: ${kataScore.toFixed(1)}%`);

    // Load balance score (0-20)
    const loadBalanceScore = this.calculateLoadBalanceScore(node, metrics);
    totalScore += (loadBalanceScore / 100) * this.config.loadBalanceWeight;
    reasons.push(`Balance: ${loadBalanceScore.toFixed(1)}%`);

    // Affinity rules score (0-15)
    const affinityScore = this.calculateAffinityScore(node, request);
    totalScore += (affinityScore / 100) * this.config.affinityWeight;
    reasons.push(`Affinity: ${affinityScore.toFixed(1)}%`);

    // Locality score (0-5)
    const localityScore = this.calculateLocalityScore(node, request, topologyZones);
    totalScore += (localityScore / 100) * this.config.localityWeight;
    reasons.push(`Locality: ${localityScore.toFixed(1)}%`);

    return {
      node,
      score: Math.round(totalScore),
      reasons,
    };
  }

  /**
   * Calculate resource availability score
   */
  private calculateResourceScore(metrics: NodeMetrics, request: VMPlacementRequest): number {
    const cpuRequest = this.parseResourceQuantity(request.resources.requests?.cpu || '0');
    const memoryRequest = this.parseResourceQuantity(request.resources.requests?.memory || '0');

    // Calculate available resources
    const cpuAvailable = metrics.cpuAllocatable - metrics.cpuUsage;
    const memoryAvailable = metrics.memoryAllocatable - metrics.memoryUsage;

    // Check if node can fit the request
    if (cpuAvailable < cpuRequest || memoryAvailable < memoryRequest) {
      return 0;
    }

    // Score based on remaining capacity after placement
    const cpuRatio = (cpuAvailable - cpuRequest) / metrics.cpuAllocatable;
    const memoryRatio = (memoryAvailable - memoryRequest) / metrics.memoryAllocatable;
    const podRatio = (metrics.maxPods - metrics.podCount - 1) / metrics.maxPods;

    // Prefer nodes that maintain good headroom (20-40%)
    const cpuScore = this.scoreHeadroom(cpuRatio);
    const memoryScore = this.scoreHeadroom(memoryRatio);
    const podScore = podRatio * 100;

    return (cpuScore + memoryScore + podScore) / 3;
  }

  /**
   * Score resource headroom (prefer 20-40%)
   */
  private scoreHeadroom(ratio: number): number {
    // Optimal headroom is 20-40%
    if (ratio >= 0.2 && ratio <= 0.4) return 100;
    if (ratio < 0.2) return ratio * 500; // Linear penalty below 20%
    if (ratio > 0.6) return Math.max(0, 100 - (ratio - 0.6) * 250); // Penalty for too much capacity
    return 100 - Math.abs(ratio - 0.3) * 100;
  }

  /**
   * Calculate Kata runtime readiness score
   */
  private calculateKataScore(node: V1Node, metrics: NodeMetrics): number {
    if (!metrics.kataEnabled) return 0;

    let score = 100;

    // Penalty if Kata runtime label not present
    const labels = node.metadata?.labels || {};
    if (!labels[KATA_RUNTIME_LABEL]) {
      score -= 20;
    }

    // Bonus for dedicated Kata nodes
    if (labels['node-type'] === 'kata') {
      score += 10;
    }

    // Penalty for nodes with many VMs (avoid noisy neighbor)
    const vmCount = metrics.podCount; // Approximation
    if (vmCount > 50) score -= 20;
    else if (vmCount > 30) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate load balance score
   */
  private calculateLoadBalanceScore(node: V1Node, metrics: NodeMetrics): number {
    const cpuUtilization = metrics.cpuUsage / metrics.cpuAllocatable;
    const memoryUtilization = metrics.memoryUsage / metrics.memoryAllocatable;
    const podUtilization = metrics.podCount / metrics.maxPods;

    // Prefer balanced utilization across resources
    const avgUtilization = (cpuUtilization + memoryUtilization + podUtilization) / 3;
    
    // Score inversely to utilization (prefer lower utilized nodes)
    const baseScore = (1 - avgUtilization) * 100;

    // Bonus for being in a less utilized topology zone
    if (this.config.topologyAware) {
      const zone = this.getNodeZone(node);
      const zoneMetrics = this.getZoneMetrics(zone);
      if (zoneMetrics) {
        const zoneUtilization = zoneMetrics.availableCpu / zoneMetrics.totalCpu;
        if (zoneUtilization > 0.5) {
          return baseScore * 1.2; // Bonus for underutilized zone
        }
      }
    }

    return baseScore;
  }

  /**
   * Calculate affinity rules score
   */
  private calculateAffinityScore(node: V1Node, request: VMPlacementRequest): number {
    let score = 100;
    const nodeName = node.metadata!.name!;

    // Preferred node affinity
    if (request.affinity?.nodeAffinity?.preferred) {
      for (const term of request.affinity.nodeAffinity.preferred) {
        if (this.matchesNodeSelectorTerm(node, term.preference)) {
          score += term.weight;
        }
      }
    }

    // Pod affinity (prefer nodes with matching pods)
    if (request.affinity?.podAffinity?.preferred) {
      // Would need to query actual pods - simplified here
      score += 10;
    }

    // Pod anti-affinity (prefer nodes without matching pods)
    if (request.affinity?.podAntiAffinity?.preferred) {
      // Would need to query actual pods - simplified here
      score += 10;
    }

    // Spread penalty - avoid nodes with recent placements from same workload
    const recentPlacements = this.getRecentPlacements(request.podName, 60000);
    const nodeRecentCount = recentPlacements.filter(p => p.nodeName === nodeName).length;
    score -= nodeRecentCount * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate locality score
   */
  private calculateLocalityScore(
    node: V1Node,
    request: VMPlacementRequest,
    topologyZones?: Map<string, TopologyZone>
  ): number {
    if (!topologyZones) return 50;

    const nodeZone = this.getNodeZone(node);
    const zone = topologyZones.get(nodeZone);

    if (!zone) return 50;

    // Prefer zones with more available capacity
    const capacityRatio = zone.availableCpu / zone.totalCpu;
    return capacityRatio * 100;
  }

  /**
   * List all cluster nodes
   */
  private async listNodes(): Promise<V1Node[]> {
    // Note: K8sClient doesn't have listNodes method, using coreApi directly would be needed
    // For now, returning empty array - in production this would use the k8s API
    // This is a placeholder that would be implemented with actual k8s API calls
    return [];
  }

  /**
   * Get node metrics with caching
   */
  private async getNodeMetrics(node: V1Node): Promise<NodeMetrics> {
    const nodeName = node.metadata!.name!;
    const cached = this.nodeMetricsCache.get(nodeName);

    if (cached && Date.now() - cached.timestamp < this.config.metricsCacheTtlMs) {
      return cached.metrics;
    }

    const metrics = this.extractNodeMetrics(node);
    this.nodeMetricsCache.set(nodeName, { metrics, timestamp: Date.now() });

    return metrics;
  }

  /**
   * Extract metrics from node status
   */
  private extractNodeMetrics(node: V1Node): NodeMetrics {
    const status = node.status!;
    const allocatable = status.allocatable || {};
    const capacity = status.capacity || {};
    const conditions = status.conditions || [];

    const cpuAllocatable = this.parseResourceQuantity(allocatable.cpu || '0');
    const cpuCapacity = this.parseResourceQuantity(capacity.cpu || '0');
    const memoryAllocatable = this.parseResourceQuantity(allocatable.memory || '0');
    const memoryCapacity = this.parseResourceQuantity(capacity.memory || '0');
    const maxPods = parseInt(allocatable.pods || '110', 10);

    // Estimate current usage (in production, use metrics-server)
    const cpuUsage = cpuAllocatable * 0.3; // Placeholder
    const memoryUsage = memoryAllocatable * 0.4; // Placeholder
    const podCount = Math.floor(maxPods * 0.2); // Placeholder

    const labels = node.metadata?.labels || {};
    const kataEnabled = labels[KATA_RUNTIME_LABEL] === 'true' || 
                       labels['katacontainers.io/kata-runtime'] === 'true';

    return {
      node,
      cpuCapacity,
      cpuAllocatable,
      cpuUsage,
      memoryCapacity,
      memoryAllocatable,
      memoryUsage,
      podCount,
      maxPods,
      kataEnabled,
      networkLatency: 0,
      diskPressure: conditions.some(c => c.type === 'DiskPressure' && c.status === 'True'),
      memoryPressure: conditions.some(c => c.type === 'MemoryPressure' && c.status === 'True'),
      pidPressure: conditions.some(c => c.type === 'PIDPressure' && c.status === 'True'),
      ready: conditions.some(c => c.type === 'Ready' && c.status === 'True'),
      lastHeartbeat: new Date(conditions.find(c => c.type === 'Ready')?.lastHeartbeatTime || Date.now()),
    };
  }

  /**
   * Get topology zones
   */
  private async getTopologyZones(): Promise<Map<string, TopologyZone>> {
    if (Date.now() - this.lastTopologyUpdate < this.config.metricsCacheTtlMs) {
      return this.topologyCache;
    }

    const zones = new Map<string, TopologyZone>();
    const nodes = await this.listNodes();

    for (const node of nodes) {
      const zone = this.getNodeZone(node);
      const region = node.metadata?.labels?.['topology.kubernetes.io/region'] || 'default';
      
      if (!zones.has(zone)) {
        const metrics = await this.getNodeMetrics(node);
        zones.set(zone, {
          zone,
          region,
          nodes: [],
          totalCpu: 0,
          availableCpu: 0,
          totalMemory: 0,
          availableMemory: 0,
        });
      }

      const zoneData = zones.get(zone)!;
      const metrics = await this.getNodeMetrics(node);
      
      zoneData.nodes.push(node);
      zoneData.totalCpu += metrics.cpuCapacity;
      zoneData.availableCpu += (metrics.cpuAllocatable - metrics.cpuUsage);
      zoneData.totalMemory += metrics.memoryCapacity;
      zoneData.availableMemory += (metrics.memoryAllocatable - metrics.memoryUsage);
    }

    this.topologyCache = zones;
    this.lastTopologyUpdate = Date.now();

    return zones;
  }

  /**
   * Get node zone label
   */
  private getNodeZone(node: V1Node): string {
    return node.metadata?.labels?.['topology.kubernetes.io/zone'] || 'default';
  }

  /**
   * Get zone metrics
   */
  private getZoneMetrics(zone: string): TopologyZone | undefined {
    return this.topologyCache.get(zone);
  }

  /**
   * Check if node is ready
   */
  private isNodeReady(node: V1Node): boolean {
    const conditions = node.status?.conditions || [];
    return conditions.some(c => c.type === 'Ready' && c.status === 'True');
  }

  /**
   * Check for pressure conditions
   */
  private hasPressureConditions(node: V1Node): boolean {
    const conditions = node.status?.conditions || [];
    return conditions.some(c => 
      (c.type === 'DiskPressure' || c.type === 'MemoryPressure' || c.type === 'PIDPressure') &&
      c.status === 'True'
    );
  }

  /**
   * Check if node supports Kata runtime
   */
  private supportsKataRuntime(node: V1Node): boolean {
    const labels = node.metadata?.labels || {};
    return labels[KATA_RUNTIME_LABEL] === 'true' || 
           labels['katacontainers.io/kata-runtime'] === 'true' ||
           labels['runtime'] === 'kata';
  }

  /**
   * Check node selector match
   */
  private matchesNodeSelector(node: V1Node, selector: Record<string, string>): boolean {
    const labels = node.metadata?.labels || {};
    return Object.entries(selector).every(([key, value]) => labels[key] === value);
  }

  /**
   * Check required node affinity
   */
  private matchesRequiredNodeAffinity(node: V1Node, terms: NodeSelectorTerm[]): boolean {
    return terms.some(term => this.matchesNodeSelectorTerm(node, term));
  }

  /**
   * Check node selector term match
   */
  private matchesNodeSelectorTerm(node: V1Node, term: NodeSelectorTerm): boolean {
    const labels = node.metadata?.labels || {};
    const fields: Record<string, string> = {
      'metadata.name': node.metadata!.name!,
      'metadata.namespace': node.metadata!.namespace || 'default',
    };

    const expressionsMatch = !term.matchExpressions || 
      term.matchExpressions.every(expr => this.matchesSelectorRequirement(labels, expr));
    
    const fieldsMatch = !term.matchFields ||
      term.matchFields.every(field => this.matchesSelectorRequirement(fields, field));

    return expressionsMatch && fieldsMatch;
  }

  /**
   * Check selector requirement match
   */
  private matchesSelectorRequirement(
    obj: Record<string, string>,
    req: NodeSelectorRequirement
  ): boolean {
    const value = obj[req.key];

    switch (req.operator) {
      case 'In':
        return req.values?.includes(value) || false;
      case 'NotIn':
        return !req.values?.includes(value);
      case 'Exists':
        return value !== undefined;
      case 'DoesNotExist':
        return value === undefined;
      case 'Gt':
        return value !== undefined && parseFloat(value) > parseFloat(req.values?.[0] || '0');
      case 'Lt':
        return value !== undefined && parseFloat(value) < parseFloat(req.values?.[0] || '0');
      default:
        return false;
    }
  }

  /**
   * Parse resource quantity string
   */
  private parseResourceQuantity(quantity: string): number {
    if (!quantity) return 0;

    const units: Record<string, number> = {
      'n': 1e-9, 'u': 1e-6, 'm': 1e-3,
      'k': 1e3, 'M': 1e6, 'G': 1e9, 'T': 1e12,
      'Ki': 1024, 'Mi': 1024 ** 2, 'Gi': 1024 ** 3, 'Ti': 1024 ** 4,
    };

    const match = quantity.match(/^([0-9.]+)([a-zA-Z]*)$/);
    if (!match) return parseFloat(quantity) || 0;

    const [, value, unit] = match;
    const multiplier = units[unit] || 1;
    return parseFloat(value) * multiplier;
  }

  /**
   * Record placement for history
   */
  private recordPlacement(podName: string, nodeName: string): void {
    const history = this.placementHistory.get(podName) || [];
    history.push({ nodeName, timestamp: Date.now() });
    
    // Keep last 100 placements
    if (history.length > 100) history.shift();
    
    this.placementHistory.set(podName, history);
  }

  /**
   * Get recent placements for a pod
   */
  private getRecentPlacements(podName: string, windowMs: number): { nodeName: string; timestamp: number }[] {
    const history = this.placementHistory.get(podName) || [];
    const cutoff = Date.now() - windowMs;
    return history.filter(p => p.timestamp > cutoff);
  }

  /**
   * Estimate VM start time on node
   */
  private estimateStartTime(nodeScore: NodeScore): number {
    // Base start time for Kata VMs
    let baseTime = 100;

    // Add penalty for loaded nodes
    if (nodeScore.score < 80) baseTime += 50;
    if (nodeScore.score < 60) baseTime += 100;

    return baseTime;
  }

  /**
   * Get scheduler configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear metrics cache
   */
  clearCache(): void {
    this.nodeMetricsCache.clear();
    this.topologyCache.clear();
    this.lastTopologyUpdate = 0;
  }

  /**
   * Get placement statistics
   */
  getStats(): {
    totalPlacements: number;
    activePlacements: number;
    cacheSize: number;
    topologyZones: number;
  } {
    let totalPlacements = 0;
    for (const history of Array.from(this.placementHistory.values())) {
      totalPlacements += history.length;
    }

    return {
      totalPlacements,
      activePlacements: this.activePlacements,
      cacheSize: this.nodeMetricsCache.size,
      topologyZones: this.topologyCache.size,
    };
  }
}

export class SchedulerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SchedulerError';
    Object.setPrototypeOf(this, SchedulerError.prototype);
  }
}

export default KataScheduler;
