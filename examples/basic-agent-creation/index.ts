/**
 * Basic Agent Creation Example
 * 
 * Demonstrates creating, monitoring, and managing individual agents.
 */

import { GodelClient } from '@jtan15010/godel';

async function main() {
  // Initialize client
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Basic Agent Creation Example\n');

  try {
    // 1. Create a worker agent
    console.log('1. Creating worker agent...');
    const worker = await client.agents.spawn({
      role: 'worker',
      model: 'claude-sonnet-4-5',
      label: 'example-worker',
      runtime: 'pi'
    });
    console.log(`   ✓ Created: ${worker.id}`);

    // 2. Create a coordinator agent
    console.log('2. Creating coordinator agent...');
    const coordinator = await client.agents.spawn({
      role: 'coordinator',
      model: 'claude-opus-4',
      label: 'example-coordinator',
      runtime: 'pi'
    });
    console.log(`   ✓ Created: ${coordinator.id}`);

    // 3. List all agents
    console.log('3. Listing agents...');
    const agents = await client.agents.list();
    for (const agent of agents) {
      console.log(`   - ${agent.id}: ${agent.role} (${agent.status})`);
    }

    // 4. Get agent details
    console.log('4. Getting agent details...');
    const details = await client.agents.get(worker.id);
    console.log(`   Status: ${details.status}`);
    console.log(`   Tasks completed: ${details.metrics?.tasksCompleted || 0}`);

    // 5. Execute a simple task
    console.log('5. Executing task on worker...');
    const task = await client.tasks.create({
      title: 'Analyze codebase structure',
      assigneeId: worker.id,
      priority: 'medium'
    });
    console.log(`   ✓ Task created: ${task.id}`);

    // Wait a moment
    await new Promise(r => setTimeout(r, 2000));

    // 6. Clean up
    console.log('6. Cleaning up agents...');
    await client.agents.terminate(worker.id);
    await client.agents.terminate(coordinator.id);
    console.log('   ✓ Agents terminated');

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
