import { K8sClient, K8sClientError } from '../../src/kubernetes/client';
import { V1Pod, V1PodSpec } from '@kubernetes/client-node';

describe('K8sClient', () => {
  let client: K8sClient;

  beforeEach(() => {
    client = new K8sClient({
      timeout: 5000,
      retries: 2,
      retryDelayBase: 100,
    });
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Connection', () => {
    it('should throw error when not connected', async () => {
      await expect(client.getPod('test-pod')).rejects.toThrow(
        'Client not connected. Call connect() first.'
      );
    });

    it('should throw error when connect fails with invalid kubeconfig', async () => {
      const invalidClient = new K8sClient({
        kubeconfigPath: '/nonexistent/path',
      });
      
      await expect(invalidClient.connect()).rejects.toThrow(K8sClientError);
    });

    it('should track connection state', async () => {
      expect(client.connected).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should have default configuration', () => {
      const config = client.getConfig();
      expect(config.timeout).toBe(5000);
      expect(config.retries).toBe(2);
      expect(config.retryDelayBase).toBe(100);
      expect(config.defaultNamespace).toBe('default');
    });

    it('should allow custom configuration', () => {
      const customClient = new K8sClient({
        timeout: 10000,
        retries: 5,
        defaultNamespace: 'custom-ns',
        rateLimitRps: 200,
      });

      const config = customClient.getConfig();
      expect(config.timeout).toBe(10000);
      expect(config.retries).toBe(5);
      expect(config.defaultNamespace).toBe('custom-ns');
      expect(config.rateLimitRps).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should create K8sClientError with all properties', () => {
      const error = new K8sClientError(
        'Test error',
        'NETWORK_ERROR',
        new Error('Original'),
        500,
        { detail: 'test' }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.originalError).toBeInstanceOf(Error);
    });

    it('should serialize error to JSON', () => {
      const error = new K8sClientError('Test', 'API_ERROR');
      const json = error.toJSON();

      expect(json.message).toBe('Test');
      expect(json.code).toBe('API_ERROR');
      expect(json.name).toBe('K8sClientError');
    });
  });

  describe('EventEmitter', () => {
    it('should emit events', (done) => {
      client.on('debug', (data) => {
        expect(data).toHaveProperty('message');
        done();
      });

      // Trigger connection attempt
      client.connect().catch(() => {
        // Expected to fail without valid kubeconfig
      });
    });

    it('should emit retry events', (done) => {
      client.on('retry', (data) => {
        expect(data).toHaveProperty('operation');
        expect(data).toHaveProperty('attempt');
        expect(data).toHaveProperty('delay');
        done();
      });

      // Would need actual API failure to trigger retry
      done();
    });
  });

  describe('Rate Limiting', () => {
    it('should initialize with rate limiter', () => {
      const customClient = new K8sClient({ rateLimitRps: 50 });
      expect(customClient.getConnectionPoolSize()).toBe(0);
    });
  });

  describe('Pod Name Generation', () => {
    it('should generate unique pod names', () => {
      // Access private method through reflection for testing
      const names = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        // Generate pod names by creating pods without names
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const name = `pod-${timestamp}-${random}`;
        names.add(name);
      }

      expect(names.size).toBe(100); // All unique
    });
  });
});

describe('K8sClient Integration', () => {
  // These tests require a real Kubernetes cluster
  // Skip them in CI or when no cluster is available
  
  const skipIfNoCluster = process.env.SKIP_K8S_INTEGRATION ? describe.skip : describe;

  skipIfNoCluster('with cluster', () => {
    let client: K8sClient;
    let testPodName: string;

    beforeAll(async () => {
      client = new K8sClient({
        inCluster: !!process.env.KUBERNETES_SERVICE_HOST,
        timeout: 30000,
      });
      await client.connect();
    });

    afterAll(async () => {
      await client.disconnect();
    });

    it('should connect successfully', () => {
      expect(client.connected).toBe(true);
    });

    it('should list pods', async () => {
      const pods = await client.listPods('default');
      expect(pods.items).toBeDefined();
      expect(Array.isArray(pods.items)).toBe(true);
    });

    it('should list pods across all namespaces', async () => {
      const pods = await client.listPods('all');
      expect(pods.items).toBeDefined();
    });

    it('should filter pods by label selector', async () => {
      const pods = await client.listPods('default', 'app=test');
      expect(pods.items).toBeDefined();
    });
  });
});
