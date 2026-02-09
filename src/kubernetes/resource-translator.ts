/**
 * Resource Translator - Convert Godel resource limits to Kubernetes format
 * 
 * Features:
 * - CPU: cores → millicores (1 core = 1000m)
 * - Memory: Gi/Mi → bytes
 * - Disk: storage limits
 * - Kata VM overhead calculation
 */

export interface ResourceLimits {
  /** CPU cores (e.g., 0.5, 1, 2, 4) */
  cpu?: number;
  /** Memory in Gi or Mi (e.g., "1Gi", "512Mi") */
  memory?: string;
  /** Disk storage in Gi or Mi (e.g., "10Gi", "100Mi") */
  disk?: string;
  /** Additional resource constraints */
  [key: string]: unknown;
}

export interface K8sResourceSpec {
  /** CPU in millicores (e.g., "500m", "1000m", "2000m") */
  cpu: string;
  /** Memory in bytes or Kubernetes format (e.g., "1Gi", "1073741824") */
  memory: string;
  /** Ephemeral storage limit */
  ephemeralStorage?: string;
}

export interface K8sResourceRequirements {
  limits: K8sResourceSpec;
  requests?: K8sResourceSpec;
}

export interface KataOverheadConfig {
  /** CPU overhead for Kata VM in millicores */
  cpuMillicores: number;
  /** Memory overhead for Kata VM in bytes */
  memoryBytes: number;
  /** Storage overhead for Kata VM in bytes */
  storageBytes: number;
}

export interface ResourceTranslatorConfig {
  /** Enable Kata VM overhead calculation */
  enableKataOverhead?: boolean;
  /** Kata overhead configuration */
  kataOverhead?: Partial<KataOverheadConfig>;
  /** Default request ratio (0.0-1.0) - requests are set to this fraction of limits */
  requestRatio?: number;
}

const DEFAULT_KATA_OVERHEAD: KataOverheadConfig = {
  cpuMillicores: 250,      // 0.25 cores
  memoryBytes: 268435456,  // 256 MiB
  storageBytes: 104857600, // 100 MiB
};

export class ResourceTranslator {
  private config: Required<ResourceTranslatorConfig>;

  constructor(config: ResourceTranslatorConfig = {}) {
    this.config = {
      enableKataOverhead: config.enableKataOverhead ?? false,
      kataOverhead: { ...DEFAULT_KATA_OVERHEAD, ...config.kataOverhead },
      requestRatio: config.requestRatio ?? 0.5,
    };
  }

  /**
   * Convert CPU cores to Kubernetes millicores format
   * @param cores CPU cores (e.g., 0.5, 1, 2)
   * @returns Millicores string (e.g., "500m", "1000m", "2000m")
   */
  cpuToMillicores(cores: number): string {
    if (cores < 0) {
      throw new Error('CPU cores must be non-negative');
    }
    const millicores = Math.round(cores * 1000);
    return `${millicores}m`;
  }

  /**
   * Convert memory string to Kubernetes format
   * Supports: bytes (plain number), Ki, Mi, Gi, Ti, Pi, Ei
   * Returns: Kubernetes memory string
   * @param memory Memory string (e.g., "1Gi", "512Mi", "1073741824")
   * @returns Kubernetes memory format (e.g., "1Gi", "512Mi", "1073741824")
   */
  memoryToK8sFormat(memory: string): string {
    if (!memory || memory.trim() === '') {
      throw new Error('Memory value cannot be empty');
    }

    const trimmed = memory.trim();
    
    // Check for negative sign first
    if (trimmed.startsWith('-')) {
      throw new Error('Memory value must be non-negative');
    }
    
    // If it's a plain number (bytes), return as-is
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    // Parse memory with unit - preserve original unit case
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|Pi|Ei)?$/i);
    if (!match) {
      throw new Error(`Invalid memory format: ${memory}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2] || '';

    // Return in original format (Kubernetes accepts these units directly)
    if (unit) {
      return `${value}${unit}`;
    }

    return `${Math.floor(value)}`;
  }

  /**
   * Convert memory string to bytes
   * @param memory Memory string (e.g., "1Gi", "512Mi")
   * @returns Number of bytes
   */
  memoryToBytes(memory: string): number {
    if (!memory || memory.trim() === '') {
      throw new Error('Memory value cannot be empty');
    }

    const trimmed = memory.trim();
    
    // Check for negative sign first
    if (trimmed.startsWith('-')) {
      throw new Error('Memory value must be non-negative');
    }
    
    // If it's a plain number (bytes), return as-is
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }

    // Parse memory with unit - preserve case for matching
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|Pi|Ei)?$/i);
    if (!match) {
      throw new Error(`Invalid memory format: ${memory}`);
    }

    const value = parseFloat(match[1]);
    const unit = (match[2] || '').toLowerCase();

    const multipliers: Record<string, number> = {
      '': 1,
      'ki': 1024,
      'mi': 1024 ** 2,
      'gi': 1024 ** 3,
      'ti': 1024 ** 4,
      'pi': 1024 ** 5,
      'ei': 1024 ** 6,
    };

    const multiplier = multipliers[unit];
    if (multiplier === undefined) {
      throw new Error(`Unknown memory unit: ${unit}`);
    }

    return Math.floor(value * multiplier);
  }

  /**
   * Convert disk/storage to Kubernetes ephemeral storage format
   * @param disk Disk size string (e.g., "10Gi", "100Mi")
   * @returns Kubernetes storage format
   */
  diskToK8sFormat(disk: string): string {
    return this.memoryToK8sFormat(disk);
  }

  /**
   * Calculate Kata VM overhead
   * @param limits Base resource limits
   * @returns Resource limits with Kata overhead added
   */
  addKataOverhead(limits: ResourceLimits): ResourceLimits {
    if (!this.config.enableKataOverhead) {
      return { ...limits };
    }

    const overhead = this.config.kataOverhead;
    const result: ResourceLimits = { ...limits };

    // Add CPU overhead
    if (limits.cpu !== undefined && overhead.cpuMillicores !== undefined) {
      const cpuMillicores = Math.round(limits.cpu * 1000);
      const totalCpuMillicores = cpuMillicores + overhead.cpuMillicores;
      result.cpu = totalCpuMillicores / 1000;
    }

    // Add memory overhead
    if (limits.memory && overhead.memoryBytes !== undefined) {
      const memoryBytes = this.memoryToBytes(limits.memory);
      const totalMemoryBytes = memoryBytes + overhead.memoryBytes;
      result.memory = `${totalMemoryBytes}`;
    }

    // Add disk overhead
    if (limits.disk && overhead.storageBytes !== undefined) {
      const diskBytes = this.memoryToBytes(limits.disk);
      const totalDiskBytes = diskBytes + overhead.storageBytes;
      result.disk = `${totalDiskBytes}`;
    }

    return result;
  }

  /**
   * Convert Godel ResourceLimits to Kubernetes resource requirements
   * @param limits Godel resource limits
   * @param options Conversion options
   * @returns Kubernetes resource requirements
   */
  translate(limits: ResourceLimits): K8sResourceRequirements {
    const adjustedLimits = this.addKataOverhead(limits);

    const k8sLimits: K8sResourceSpec = {
      cpu: adjustedLimits.cpu !== undefined 
        ? this.cpuToMillicores(adjustedLimits.cpu)
        : '1000m', // Default to 1 core
      memory: adjustedLimits.memory 
        ? this.memoryToK8sFormat(adjustedLimits.memory)
        : '512Mi', // Default to 512Mi
    };

    if (adjustedLimits.disk) {
      k8sLimits.ephemeralStorage = this.diskToK8sFormat(adjustedLimits.disk);
    }

    // Calculate requests based on requestRatio
    const requests: K8sResourceSpec = {
      cpu: this.calculateRequestCpu(limits.cpu),
      memory: this.calculateRequestMemory(limits.memory),
    };

    if (limits.disk) {
      requests.ephemeralStorage = this.diskToK8sFormat(limits.disk);
    }

    return {
      limits: k8sLimits,
      requests,
    };
  }

  /**
   * Calculate CPU request based on limits and request ratio
   */
  private calculateRequestCpu(limitCpu?: number): string {
    if (limitCpu === undefined) {
      return '500m'; // Default: half of default limit
    }
    const requestCpu = limitCpu * this.config.requestRatio;
    return this.cpuToMillicores(requestCpu);
  }

  /**
   * Calculate memory request based on limits and request ratio
   */
  private calculateRequestMemory(limitMemory?: string): string {
    // Default: 512Mi limit / 2 = 256Mi in bytes
    const defaultLimitBytes = 512 * 1024 * 1024;
    const limitBytes = limitMemory ? this.memoryToBytes(limitMemory) : defaultLimitBytes;
    const requestBytes = Math.floor(limitBytes * this.config.requestRatio);
    return `${requestBytes}`;
  }

  /**
   * Convert millicores string back to cores
   * @param millicores Millicores string (e.g., "500m", "1000m")
   * @returns CPU cores (e.g., 0.5, 1)
   */
  millicoresToCores(millicores: string): number {
    const match = millicores.match(/^(\d+)m$/);
    if (!match) {
      throw new Error(`Invalid millicores format: ${millicores}`);
    }
    return parseInt(match[1], 10) / 1000;
  }

  /**
   * Format bytes to human-readable string
   * @param bytes Number of bytes
   * @returns Human-readable string (e.g., "1Gi", "512Mi")
   */
  bytesToHumanReadable(bytes: number): string {
    if (bytes < 0) {
      throw new Error('Bytes must be non-negative');
    }

    const units = ['', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    // Format without decimals if it's a whole number
    const formattedValue = Number.isInteger(value) ? value.toString() : value.toFixed(2);
    return `${formattedValue}${units[unitIndex]}`;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ResourceTranslatorConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ResourceTranslatorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      kataOverhead: { ...this.config.kataOverhead, ...config.kataOverhead },
    };
  }
}

// Export singleton instance factory
export function createResourceTranslator(
  config?: ResourceTranslatorConfig
): ResourceTranslator {
  return new ResourceTranslator(config);
}

export default ResourceTranslator;
