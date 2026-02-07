/**
 * Multi-Runtime Example
 * 
 * Demonstrates using different agent runtimes together.
 */

import { GodelClient } from '@jtan15010/godel';

async function main() {
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Multi-Runtime Example\n');

  try {
    // 1. Create agents with different runtimes
    console.log('1. Creating Pi runtime agent...');
    const piAgent = await client.agents.spawn({
      role: 'worker',
      runtime: 'pi',
      model: 'claude-sonnet-4-5',
      label: 'pi-worker',
      config: {
        provider: 'anthropic',
        treeMode: true,
        enableCycling: true
      }
    });
    console.log(`   ✓ Created: ${piAgent.id}`);

    console.log('2. Creating OpenClaw runtime agent...');
    const openclawAgent = await client.agents.spawn({
      role: 'worker',
      runtime: 'openclaw',
      model: 'gpt-4o',
      label: 'openclaw-worker',
      config: {
        tools: ['read', 'write', 'edit', 'bash'],
        maxIterations: 50
      }
    });
    console.log(`   ✓ Created: ${openclawAgent.id}`);

    console.log('3. Creating Local runtime agent...');
    const localAgent = await client.agents.spawn({
      role: 'worker',
      runtime: 'local',
      label: 'local-worker',
      config: {
        executor: 'direct',
        timeout: 300
      }
    });
    console.log(`   ✓ Created: ${localAgent.id}`);

    // 2. Create a mixed-runtime team
    console.log('4. Creating mixed-runtime team...');
    const mixedTeam = await client.teams.create({
      name: 'mixed-runtime-example',
      strategy: 'parallel',
      composition: {
        coordinator: {
          role: 'coordinator',
          runtime: 'pi',
          model: 'claude-opus-4'
        },
        workers: [
          { role: 'worker', runtime: 'pi', model: 'claude-sonnet-4-5', count: 1 },
          { role: 'worker', runtime: 'openclaw', model: 'gpt-4o', count: 1 },
          { role: 'worker', runtime: 'local', count: 1 }
        ]
      },
      task: {
        description: 'Analyze and refactor codebase',
        budget: { maxCost: 20.00 }
      }
    });
    console.log(`   ✓ Created: ${mixedTeam.id}`);

    // 3. Query runtime capabilities
    console.log('5. Querying runtime capabilities...');
    const capabilities = await client.runtimes.capabilities();
    
    for (const [runtime, caps] of Object.entries(capabilities)) {
      console.log(`   ${runtime}:`);
      console.log(`     Models: ${(caps as any).models?.slice(0, 3).join(', ')}...`);
      console.log(`     Features: ${(caps as any).features?.join(', ')}`);
    }

    // 4. Execute tasks on specific runtimes
    console.log('6. Executing runtime-specific tasks...');
    
    // Complex task -> Pi
    const complexTask = await client.tasks.create({
      title: 'Design authentication architecture',
      assigneeId: piAgent.id,
      priority: 'high'
    });
    console.log(`   ✓ Complex task on Pi: ${complexTask.id}`);

    // API-heavy task -> OpenClaw
    const apiTask = await client.tasks.create({
      title: 'Implement API endpoints',
      assigneeId: openclawAgent.id,
      priority: 'medium'
    });
    console.log(`   ✓ API task on OpenClaw: ${apiTask.id}`);

    // Simple task -> Local
    const simpleTask = await client.tasks.create({
      title: 'Run linting and formatting',
      assigneeId: localAgent.id,
      priority: 'low'
    });
    console.log(`   ✓ Simple task on Local: ${simpleTask.id}`);

    // 5. Monitor runtime metrics
    console.log('7. Monitoring runtime metrics...');
    const metrics = await client.runtimes.metrics();
    
    for (const [runtime, data] of Object.entries(metrics)) {
      console.log(`   ${runtime}:`);
      console.log(`     Active Agents: ${(data as any).activeAgents}`);
      console.log(`     Tasks/Minute: ${(data as any).taskRate}`);
    }

    // 6. Test runtime failover
    console.log('8. Testing runtime failover...');
    const failoverAgent = await client.agents.spawn({
      role: 'worker',
      runtime: 'pi',
      model: 'claude-sonnet-4-5',
      fallback: {
        runtimes: ['openclaw', 'local'],
        onError: ['rate_limit', 'timeout'],
        retryOriginal: true
      }
    });
    console.log(`   ✓ Failover agent: ${failoverAgent.id}`);

    // 7. Compare runtime performance
    console.log('9. Comparing runtime performance...');
    const comparison = await client.runtimes.compare({
      task: 'Implement fibonacci function',
      runtimes: ['pi', 'openclaw', 'local'],
      iterations: 3
    });
    
    for (const result of comparison.results) {
      console.log(`   ${result.runtime}:`);
      console.log(`     Avg Duration: ${result.avgDuration}ms`);
      console.log(`     Avg Cost: $${result.avgCost}`);
      console.log(`     Success Rate: ${result.successRate}%`);
    }

    // 8. Clean up
    console.log('10. Cleaning up...');
    await client.teams.destroy(mixedTeam.id);
    await client.agents.terminate(piAgent.id);
    await client.agents.terminate(openclawAgent.id);
    await client.agents.terminate(localAgent.id);
    await client.agents.terminate(failoverAgent.id);
    console.log('    ✓ All resources cleaned up');

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
