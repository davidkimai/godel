/**
 * Kubernetes Client Usage Examples
 * 
 * Demonstrates how to use the K8sClient wrapper
 */

import { K8sClient } from './client';
import { V1PodSpec, V1Container } from '@kubernetes/client-node';

async function examples() {
  // Create client with custom configuration
  const client = new K8sClient({
    kubeconfigPath: '~/.kube/config',     // Path to kubeconfig
    // inCluster: true,                     // Use when running inside cluster
    timeout: 30000,                       // Request timeout in ms
    retries: 3,                           // Number of retries
    retryDelayBase: 1000,                 // Base delay between retries
    maxRetryDelay: 30000,                 // Maximum delay between retries
    rateLimitRps: 100,                    // Rate limit requests per second
    defaultNamespace: 'default',          // Default namespace
  });

  // Connect to cluster
  await client.connect();
  console.log('Connected to Kubernetes cluster');

  // Listen to events
  client.on('debug', (data) => console.log('Debug:', data.message));
  client.on('retry', (data) => console.log(`Retrying ${data.operation} (attempt ${data.attempt})`));
  client.on('error', (err) => console.error('Error:', err.message));
  client.on('connected', () => console.log('Client connected'));
  client.on('disconnected', () => console.log('Client disconnected'));
  client.on('pod:created', (data) => console.log(`Pod created: ${data.name}`));
  client.on('pod:deleted', (data) => console.log(`Pod deleted: ${data.name}`));

  // Create a pod
  const container: V1Container = {
    name: 'nginx',
    image: 'nginx:latest',
    ports: [{ containerPort: 80 }],
  };

  const podSpec: V1PodSpec = {
    containers: [container],
  };

  const newPod = await client.createPod({
    name: 'example-nginx-pod',
    namespace: 'default',
    labels: { app: 'nginx', env: 'example' },
    annotations: { description: 'Example nginx pod' },
    spec: podSpec,
  });

  console.log('Created pod:', newPod.metadata?.name);

  // Wait for pod to be ready
  const readyPod = await client.waitForPod('example-nginx-pod', 'default', 60000);
  console.log('Pod is ready:', readyPod.status?.phase);

  // Get a pod
  const pod = await client.getPod('example-nginx-pod', 'default');
  console.log('Pod status:', pod.status?.phase);

  // List pods
  const pods = await client.listPods('default');
  console.log(`Found ${pods.items.length} pods in default namespace`);

  // List pods across all namespaces
  const allPods = await client.listPods('all');
  console.log(`Found ${allPods.items.length} pods across all namespaces`);

  // List pods with label selector
  const filteredPods = await client.listPods('default', 'app=nginx');
  console.log(`Found ${filteredPods.items.length} pods with app=nginx`);

  // Execute command in pod
  const execResult = await client.execInPod('example-nginx-pod', {
    command: ['ls', '-la'],
    namespace: 'default',
    container: 'nginx',
    timeout: 10000,
  });
  console.log('Exec stdout:', execResult.stdout);
  console.log('Exec stderr:', execResult.stderr);
  console.log('Exit code:', execResult.exitCode);

  // Get pod logs
  const logs = await client.getPodLogs('example-nginx-pod', 'default', 'nginx', 100);
  console.log('Pod logs:', logs);

  // Copy files to/from pod (simplified - actual implementation would stream data)
  // await client.copyToPod('example-nginx-pod', '/local/path/file.txt', '/remote/path', {
  //   namespace: 'default',
  //   container: 'nginx',
  // });

  // await client.copyFromPod('example-nginx-pod', '/remote/path/file.txt', '/local/path', {
  //   namespace: 'default',
  //   container: 'nginx',
  // });

  // Watch pods (async generator)
  console.log('Watching pods...');
  const watchIterator = client.watchPods({
    namespace: 'default',
    labelSelector: 'app=nginx',
  });

  // Process watch events for 10 seconds
  const timeout = setTimeout(async () => {
    await client.disconnect();
  }, 10000);

  for await (const event of watchIterator) {
    console.log(`Pod ${event.pod.metadata?.name} ${event.type}`);
  }

  clearTimeout(timeout);

  // Delete a pod
  await client.deletePod('example-nginx-pod', 'default', 30);
  console.log('Pod deleted');

  // Cleanup
  await client.disconnect();
  console.log('Disconnected from cluster');
}

// Run examples if executed directly
if (require.main === module) {
  examples().catch(console.error);
}

export { examples };
