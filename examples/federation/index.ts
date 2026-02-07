/**
 * Federation Example
 * 
 * Demonstrates multi-instance federation capabilities.
 */

import { GodelClient, FederationManager } from '@jtan15010/godel';

async function main() {
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  const federation = new FederationManager({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Federation Example\n');

  try {
    // 1. Register federation instances
    console.log('1. Registering federation instances...');
    
    await federation.register({
      id: 'us-west-1',
      url: 'https://us-west-1.godel.internal',
      region: 'us-west',
      capacity: { maxAgents: 50, maxTeams: 20 },
      capabilities: ['pi', 'openclaw', 'local'],
      labels: { env: 'production', tier: 'premium' }
    });
    console.log('   ✓ Registered us-west-1');

    await federation.register({
      id: 'us-east-1',
      url: 'https://us-east-1.godel.internal',
      region: 'us-east',
      capacity: { maxAgents: 40, maxTeams: 15 },
      capabilities: ['pi', 'openclaw'],
      labels: { env: 'production', tier: 'standard' }
    });
    console.log('   ✓ Registered us-east-1');

    await federation.register({
      id: 'eu-west-1',
      url: 'https://eu-west-1.godel.internal',
      region: 'eu-west',
      capacity: { maxAgents: 30, maxTeams: 10 },
      capabilities: ['pi'],
      labels: { env: 'production', tier: 'standard' }
    });
    console.log('   ✓ Registered eu-west-1');

    // 2. List all instances
    console.log('2. Listing federation instances...');
    const instances = await federation.list();
    for (const instance of instances) {
      console.log(`   - ${instance.id}: ${instance.status} (${instance.region})`);
      console.log(`     Capacity: ${instance.capacity?.maxAgents} agents`);
    }

    // 3. Check federation health
    console.log('3. Checking federation health...');
    const health = await federation.health();
    console.log(`   Overall Status: ${health.overall}`);
    for (const inst of health.instances) {
      const statusColor = inst.status === 'healthy' ? '✓' : '⚠️';
      console.log(`   ${statusColor} ${inst.id}: ${inst.status} (load: ${inst.load})`);
    }

    // 4. Health-aware routing
    console.log('4. Selecting instance via health-aware routing...');
    const target = await federation.select({
      strategy: 'health',
      preferences: {
        region: 'us-west',
        capabilities: ['pi']
      }
    });
    console.log(`   ✓ Selected: ${target.id}`);

    // 5. Create cross-instance team
    console.log('5. Creating cross-instance team...');
    const team = await federation.createTeam({
      name: 'cross-instance-example',
      topology: {
        coordinator: { instance: 'us-west-1' },
        workers: [
          { count: 2, instance: 'us-east-1' },
          { count: 2, instance: 'eu-west-1' }
        ]
      },
      composition: {
        coordinator: { role: 'coordinator', model: 'claude-opus-4' },
        workers: [{ role: 'worker', model: 'claude-sonnet-4-5' }]
      }
    });
    console.log(`   ✓ Created: ${team.id}`);
    console.log(`   Instances: ${team.instances?.join(', ')}`);

    // 6. Geographic routing
    console.log('6. Executing with geographic routing...');
    const geoResult = await federation.execute({
      description: 'Analyze user feedback',
      routing: {
        region: 'eu-west',
        fallback: ['us-east'],
        latency: 'low'
      }
    });
    console.log(`   ✓ Executed on: ${geoResult.instanceId}`);

    // 7. Session affinity
    console.log('7. Creating session with affinity...');
    const affinityResult = await federation.execute({
      description: 'Implement feature X',
      affinity: {
        group: 'project-alpha',
        sticky: true
      }
    });
    console.log(`   ✓ Session created on: ${affinityResult.instanceId}`);

    // 8. Capacity-based distribution
    console.log('8. Creating capacity-distributed team...');
    const distributedTeam = await federation.createTeam({
      name: 'distributed-example',
      distribution: {
        strategy: 'capacity',
        spread: 'even',
        maxPerInstance: 5
      },
      composition: {
        workers: { count: 10, model: 'claude-sonnet-4-5' }
      }
    });
    console.log(`   ✓ Created: ${distributedTeam.id}`);
    console.log(`   Distribution: ${JSON.stringify(distributedTeam.distribution)}`);

    // 9. Get federation metrics
    console.log('9. Fetching federation metrics...');
    const metrics = await federation.metrics();
    console.log(`   Total Agents: ${metrics.totalAgents}`);
    console.log(`   Total Teams: ${metrics.totalTeams}`);
    console.log(`   Requests/Min: ${metrics.requestRate}`);
    
    for (const [instance, data] of Object.entries(metrics.byInstance)) {
      console.log(`   ${instance}: ${(data as any).agentCount} agents, ${(data as any).load}% load`);
    }

    // 10. Simulate instance failure and recovery
    console.log('10. Simulating instance failure handling...');
    await federation.simulateFailure('eu-west-1');
    console.log('   ✓ Simulated failure of eu-west-1');
    
    const postFailureHealth = await federation.health();
    console.log(`   Post-failure status: ${postFailureHealth.instances.find((i: any) => i.id === 'eu-west-1')?.status}`);
    
    await federation.simulateRecovery('eu-west-1');
    console.log('   ✓ Simulated recovery of eu-west-1');

    // 11. Deregister instances
    console.log('11. Cleaning up federation instances...');
    await federation.deregister('us-west-1');
    await federation.deregister('us-east-1');
    await federation.deregister('eu-west-1');
    console.log('   ✓ All instances deregistered');

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
