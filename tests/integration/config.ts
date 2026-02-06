/**
 * Integration Test Configuration
 * 
 * Centralized configuration for all integration tests.
 */

export const testConfig = {
  // Godel API Configuration
  godelApiUrl: process.env['GODEL_API_URL'] || 'http://localhost:7373',
  godelApiKey: process.env['GODEL_API_KEY'] || 'test-key',
  
  // OpenClaw Adapter Configuration
  openclawAdapterUrl: process.env['OPENCLAW_ADAPTER_URL'] || 'http://localhost:7374',
  openclawSessionKey: process.env['OPENCLAW_SESSION_KEY'] || 'test-session',
  
  // Database Configuration
  databaseUrl: process.env['TEST_DATABASE_URL'] || 'postgresql://godel:godel@localhost:5432/godel_test',
  
  // Redis Configuration
  redisUrl: process.env['TEST_REDIS_URL'] || 'redis://localhost:6379/1',
  
  // WebSocket Configuration
  websocketUrl: process.env['TEST_WEBSOCKET_URL'] || 'ws://localhost:7373/events',
  
  // Test Timeouts
  testTimeout: 60000,  // 60 seconds
  longTestTimeout: 120000,  // 2 minutes
  
  // Performance Thresholds
  maxConcurrentAgents: 100,
  eventLatencyThreshold: 500,  // ms
  apiP99LatencyThreshold: 200,  // ms
  eventThroughputTarget: 1000,  // events/second
  
  // Retry Configuration
  maxRetries: 3,
  retryDelay: 1000,  // ms
  
  // Load Testing
  loadTestConcurrentRequests: 1000,
  loadTestBatchSize: 100,
  
  // Test Data
  testSwarmName: 'integration-test-swarm',
  testAgentType: 'code-review',
};

/**
 * Wait for a condition to be true with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 10000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for agent status to reach target state
 */
export async function waitForStatus(
  getStatusFn: () => Promise<{ status: string } | null>,
  targetStatus: string,
  timeout: number = 30000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const status = await getStatusFn();
    if (status?.status === targetStatus) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Status did not reach '${targetStatus}' within ${timeout}ms`);
}

/**
 * Create a mock webhook server for event testing
 */
export function createMockWebhookServer(port: number = 9999): {
  url: string;
  events: any[];
  start: () => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
} {
  const events: any[] = [];
  let server: any = null;
  
  return {
    url: `http://localhost:${port}/webhook`,
    events,
    
    async start() {
      // In a real implementation, this would start an HTTP server
      // For tests, we'll use a simple mock
      server = {
        close: (cb: () => void) => cb(),
      };
    },
    
    async stop() {
      if (server) {
        return new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
    },
    
    clear() {
      events.length = 0;
    },
  };
}

/**
 * Create test API client
 */
export function createTestApiClient() {
  const baseUrl = testConfig.godelApiUrl;
  const apiKey = testConfig.godelApiKey;
  
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    customHeaders?: Record<string, string>
  ): Promise<{ status: number; data: T }> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...customHeaders,
    };
    
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    let data: T;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const parsed = await response.json() as unknown as Record<string, unknown>;
      if (
        parsed
        && typeof parsed === 'object'
        && Object.prototype.hasOwnProperty.call(parsed, 'success')
        && Object.prototype.hasOwnProperty.call(parsed, 'data')
      ) {
        data = parsed['data'] as T;
      } else {
        data = parsed as T;
      }
    } else {
      data = await response.text() as unknown as T;
    }
    
    return { status: response.status, data };
  }
  
  return {
    get: <T>(path: string, headers?: Record<string, string>) => 
      request<T>('GET', path, undefined, headers),
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => 
      request<T>('POST', path, body, headers),
    put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => 
      request<T>('PUT', path, body, headers),
    delete: <T>(path: string, headers?: Record<string, string>) => 
      request<T>('DELETE', path, undefined, headers),
  };
}

/**
 * Create CLI executor
 */
export function createCliExecutor() {
  const { execSync } = require('child_process');
  
  return {
    exec(command: string, timeout: number = 30000): { stdout: string; stderr: string } {
      try {
        const stdout = execSync(`swarmctl ${command}`, {
          encoding: 'utf-8',
          timeout,
          cwd: process.cwd(),
        });
        return { stdout, stderr: '' };
      } catch (error: any) {
        return {
          stdout: error.stdout || '',
          stderr: error.stderr || '',
        };
      }
    },
  };
}

/**
 * Calculate latency statistics
 */
export function calculateLatencyStats(latencies: number[]): {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  
  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  };
  
  return {
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    mean: sum / sorted.length || 0,
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
  };
}

export default testConfig;
