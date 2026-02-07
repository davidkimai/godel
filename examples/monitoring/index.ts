/**
 * Monitoring Example
 * 
 * Demonstrates metrics collection, event streaming, and health monitoring.
 */

import { GodelClient, metrics } from '@jtan15010/godel';

async function main() {
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Monitoring Example\n');

  try {
    // 1. Check system health
    console.log('1. Checking system health...');
    const health = await client.health.check();
    console.log(`   Status: ${health.status}`);
    
    for (const component of health.components) {
      const icon = component.status === 'healthy' ? '✓' : '✗';
      console.log(`   ${icon} ${component.name}: ${component.status}`);
    }

    // 2. Get system metrics
    console.log('2. Getting system metrics...');
    const systemMetrics = await client.metrics.getSystem();
    console.log(`   Agents Connected: ${systemMetrics.agents?.connected || 0}`);
    console.log(`   Agents Active: ${systemMetrics.agents?.active || 0}`);
    console.log(`   Queue Depth: ${systemMetrics.queue?.depth || 0}`);
    console.log(`   Tasks Total: ${systemMetrics.tasks?.total || 0}`);

    // 3. Get agent metrics
    console.log('3. Getting agent metrics...');
    const agents = await client.agents.list({ limit: 3 });
    
    for (const agent of agents) {
      const agentMetrics = await client.metrics.getAgent(agent.id);
      console.log(`   ${agent.id}:`);
      console.log(`     Tasks Completed: ${agentMetrics.tasks?.completed || 0}`);
      console.log(`     Avg Latency: ${agentMetrics.performance?.avgLatency || 0}ms`);
      console.log(`     Error Rate: ${agentMetrics.errors?.rate || 0}%`);
    }

    // 4. Get proxy metrics
    console.log('4. Getting proxy metrics...');
    const proxyMetrics = await client.metrics.getProxy();
    console.log(`   Requests Total: ${proxyMetrics.requests?.total || 0}`);
    console.log(`   Total Cost: $${proxyMetrics.cost?.total || 0}`);
    console.log(`   Tokens Used: ${proxyMetrics.tokens?.total || 0}`);
    console.log(`   Avg Latency: ${proxyMetrics.latency?.avg || 0}ms`);

    // 5. Query custom Prometheus metrics
    console.log('5. Querying Prometheus metrics...');
    const promResult = await client.metrics.query('godel_agents_connected');
    console.log(`   Query result: ${JSON.stringify(promResult)}`);

    // 6. Stream events
    console.log('6. Streaming events (5 seconds)...');
    const eventStream = client.events.stream({
      severity: 'info',
      limit: 10
    });

    let eventCount = 0;
    eventStream.on('event', (event: any) => {
      eventCount++;
      console.log(`   [${event.type}] ${event.message?.substring(0, 50)}...`);
    });

    await new Promise(r => setTimeout(r, 5000));
    eventStream.stop();
    console.log(`   Total events received: ${eventCount}`);

    // 7. Query logs
    console.log('7. Querying logs...');
    const logs = await client.logs.query({
      since: '1h',
      severity: 'info',
      limit: 5
    });
    
    console.log(`   Found ${logs.length} log entries`);
    for (const log of logs.slice(0, 3)) {
      console.log(`   [${log.timestamp}] ${log.level}: ${log.message?.substring(0, 40)}...`);
    }

    // 8. Create custom metrics
    console.log('8. Creating custom metrics...');
    const requestCounter = metrics.createCounter('example_requests_total', {
      description: 'Example request counter'
    });
    
    requestCounter.inc();
    requestCounter.inc({ method: 'GET' });
    requestCounter.inc({ method: 'POST' });
    
    console.log('   ✓ Custom counter incremented');

    const latencyHistogram = metrics.createHistogram('example_latency_seconds', {
      description: 'Example latency histogram',
      buckets: [0.1, 0.5, 1, 2, 5]
    });
    
    latencyHistogram.observe(0.3);
    latencyHistogram.observe(0.8);
    latencyHistogram.observe(1.5);
    
    console.log('   ✓ Custom histogram observed');

    // 9. Configure alerts
    console.log('9. Configuring alerts...');
    await client.alerts.configure({
      rules: [
        {
          name: 'example-high-error-rate',
          condition: 'rate(example_requests_total[5m]) > 100',
          severity: 'warning',
          channels: ['console']
        }
      ]
    });
    console.log('   ✓ Alert configured');

    // 10. Get performance metrics
    console.log('10. Getting performance metrics...');
    const perfMetrics = await client.metrics.getPerformance();
    console.log(`   Requests/sec: ${perfMetrics.throughput?.requestsPerSecond || 0}`);
    console.log(`   Avg Response Time: ${perfMetrics.latency?.p50 || 0}ms`);
    console.log(`   P95 Response Time: ${perfMetrics.latency?.p95 || 0}ms`);
    console.log(`   P99 Response Time: ${perfMetrics.latency?.p99 || 0}ms`);

    // 11. Export metrics
    console.log('11. Exporting metrics...');
    const exported = await client.metrics.export({
      format: 'json',
      since: '1h'
    });
    console.log(`   ✓ Exported ${Object.keys(exported).length} metric series`);

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
